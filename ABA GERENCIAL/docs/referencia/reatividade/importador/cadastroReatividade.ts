// =============================================================================
// Cadastro de reatividade (RDA) pelo painel — substitui o preenchimento da planilha BDD_LCPETRO_Reatividade.
//
// Como a planilha é preenchida hoje (e como o formulário repete isso):
//   1. a pessoa lê UMA publicação e cadastra a referência (autor, ano);
//   2. cadastra a ROCHA como o artigo descreve ("[Calcita] > 99 %") e o SISTEMA ÁCIDO
//      ("[HCl] = 15 wt% [IC] = 0,5 vol%") — ou escolhe um que já existe;
//   3. lança uma SÉRIE: a mesma condição (rocha, sistema, temperatura, pressão, disco) em várias rotações,
//      uma taxa de reação por rotação (221 blocos assim nas 419 linhas da planilha);
//   4. marca de onde saiu cada número (tabela, lido de gráfico…) — antes era a COR da célula.
//
// Este módulo é só lógica (sem tela): conversões, leitura dos textos colados, validação, ajuste de Levich,
// taxa pela curva de cálcio (ensaios do laboratório) e a gravação (função lit_cadastrar_serie do banco).
// =============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { assinaturaSistema, normalizaComponente, numero } from "./planilhaBdd";

export type Severidade = "ERRO" | "AVISO";
export interface Problema { severidade: Severidade; campo: string; ponto?: number; mensagem: string }

// ---------------------------------------------------------------------------
// Unidades: a pessoa digita como está no artigo; o banco guarda em °C, psi, in e mol/(cm²·s)
// ---------------------------------------------------------------------------
export type UnTemperatura = "°C" | "°F" | "K";
export type UnPressao = "psi" | "bar" | "atm" | "MPa" | "kPa";
export type UnComprimento = "in" | "cm" | "mm";
export type UnTaxa = "mol/(cm²·s)" | "mol/(m²·s)" | "mol/(cm²·min)" | "mmol/(cm²·s)" | "mol/(cm²·h)";

export function paraCelsius(v: number, u: UnTemperatura): number {
  return u === "°F" ? ((v - 32) * 5) / 9 : u === "K" ? v - 273.15 : v;
}
export function paraPsi(v: number, u: UnPressao): number {
  return ({ psi: 1, bar: 14.5037738, atm: 14.6959488, MPa: 145.037738, kPa: 0.145037738 } as const)[u] * v;
}
export function paraPolegada(v: number, u: UnComprimento): number {
  return u === "cm" ? v / 2.54 : u === "mm" ? v / 25.4 : v;
}
export function paraMolCm2s(v: number, u: UnTaxa): number {
  return ({ "mol/(cm²·s)": 1, "mol/(m²·s)": 1e-4, "mol/(cm²·min)": 1 / 60, "mmol/(cm²·s)": 1e-3, "mol/(cm²·h)": 1 / 3600 } as const)[u] * v;
}

// ---------------------------------------------------------------------------
// Contas iguais às do banco e da planilha (para mostrar na tela enquanto a pessoa digita)
// ---------------------------------------------------------------------------
export interface PropFluido { massa_molar_g_mol: number | null; coef_densidade: number | null; n_equivalentes: number | null }

/** = public.conc_molar(): N -> M dividindo pelos equivalentes; wt% -> M = 10·wt%·ρ/MM, ρ = 1 + coef·wt% */
export function concMolar(valor: number, unidade: string, f?: PropFluido | null): number | null {
  if (unidade === "M") return valor;
  if (unidade === "N") return f?.n_equivalentes ? valor / f.n_equivalentes : null;
  if (unidade === "wt%") return f?.massa_molar_g_mol ? (10 * valor * (1 + (f.coef_densidade ?? 0) * valor)) / f.massa_molar_g_mol : null;
  return null;
}
/** = public.conc_massica(): resolve coef·w² + w − M·MM/10 = 0 (exato; a planilha usa uma aproximação, ver ANALISE.md) */
export function concMassica(valor: number, unidade: string, f?: PropFluido | null): number | null {
  if (unidade === "wt%") return valor;
  const m = concMolar(valor, unidade, f);
  if (m == null || !f?.massa_molar_g_mol) return null;
  const c = f.coef_densidade ?? 0, mm = f.massa_molar_g_mol;
  return c === 0 ? (m * mm) / 10 : (-1 + Math.sqrt(1 + (4 * c * m * mm) / 10)) / (2 * c);
}
/** = public.temperatura_nominal(): 18 ≤ T < 30 → 25; senão arredonda de 5 em 5 (fórmula da planilha) */
export function temperaturaNominal(t: number | null): number | null {
  if (t == null) return null;
  if (t >= 18 && t < 30) return 25;
  return Math.sign(t) * Math.round(Math.abs(t) / 5) * 5;   // ROUND do Excel: meio para longe do zero
}
export const omegaRadS = (rpm: number) => (rpm * 2 * Math.PI) / 60;
export const raizOmega = (rpm: number) => Math.sqrt(omegaRadS(rpm));

// ---------------------------------------------------------------------------
// Textos colados do artigo
// ---------------------------------------------------------------------------
export interface Componente { componente: string; valor: number | null; unidade: string | null }

const UNIDADE_TXT = /^(wt\s*%|vol\s*%|%\s*wt|%\s*vol|wt|vol|n|m|mm|gpt|ppm|mg\/l|g\/l|ml\/l|%)$/i;
const UN_PADRAO: Record<string, string> = {
  "wt%": "wt%", "wt %": "wt%", "%wt": "wt%", "% wt": "wt%", "wt": "wt%", "vol%": "vol%", "vol %": "vol%", "%vol": "vol%",
  "% vol": "vol%", "vol": "vol%", n: "N", m: "M", mm: "mM", gpt: "gpt", ppm: "ppm", "mg/l": "mg/L", "g/l": "g/L", "ml/l": "mL/L", "%": "%",
};
const padraoUnidade = (u: string) => UN_PADRAO[u.toLowerCase().replace(/\s+/g, " ").trim()] ?? u;

/**
 * Lê a composição como está no artigo ou na planilha antiga:
 *   "[HCl]=0,2 N [IC-B]= 2wt% [Solv-Y]= 4 wt%"   (formato da planilha)
 *   "15 wt% HCl + 0.5 vol% IC"  /  "HCl 15 wt% + IC 0,5 vol%"   (formato comum em artigos)
 */
export function lerComposicaoSistema(texto: string): { componentes: Componente[]; problemas: Problema[] } {
  const problemas: Problema[] = [];
  const componentes: Componente[] = [];
  const t = texto.replace(/\s+/g, " ").trim();
  const colchetes = [...t.matchAll(/\[([^\]]+)\]\s*=?\s*([-+]?[\d.,]+(?:e[-+]?\d+)?)?\s*([a-z%/ ]*?)(?=\s*\[|$)/gi)];
  if (colchetes.length) {
    for (const m of colchetes) {
      const u = (m[3] ?? "").trim();
      componentes.push({ componente: normalizaComponente(m[1].trim())!, valor: m[2] ? numero(m[2]) : null, unidade: u ? padraoUnidade(u) : null });
    }
  } else {
    for (const parte of t.split(/\s*(?:\+|;|,(?!\d))\s*/).filter(Boolean)) {
      // "15 wt% HCl" ou "HCl 15 wt%"
      let m = /^([-+]?[\d.,]+(?:e[-+]?\d+)?)\s*([a-z%/]+(?:\s*%)?)\s+(.+)$/i.exec(parte);
      if (m && UNIDADE_TXT.test(m[2].trim())) { componentes.push({ componente: normalizaComponente(m[3])!, valor: numero(m[1]), unidade: padraoUnidade(m[2]) }); continue; }
      m = /^(.+?)\s+([-+]?[\d.,]+(?:e[-+]?\d+)?)\s*([a-z%/]+(?:\s*%)?)$/i.exec(parte);
      if (m && UNIDADE_TXT.test(m[3].trim())) { componentes.push({ componente: normalizaComponente(m[1])!, valor: numero(m[2]), unidade: padraoUnidade(m[3]) }); continue; }
      componentes.push({ componente: normalizaComponente(parte)!, valor: null, unidade: null });
      problemas.push({ severidade: "AVISO", campo: "composicao", mensagem: `não achei valor e unidade em "${parte}": preencha à mão` });
    }
  }
  componentes.forEach((c, i) => {
    if (c.valor != null && Number.isNaN(c.valor)) { problemas.push({ severidade: "ERRO", campo: `valor_${i + 1}`, mensagem: `"${c.componente}": valor não é número` }); c.valor = null; }
    if (c.unidade === "%") problemas.push({ severidade: "AVISO", campo: `unidade_${i + 1}`, mensagem: `"${c.componente}": '%' não diz se é wt% ou vol% — escolha` });
  });
  if (componentes.length > 4) problemas.push({ severidade: "ERRO", campo: "composicao", mensagem: "mais de 4 componentes: o cadastro guarda até 4" });
  if (!componentes.length) problemas.push({ severidade: "ERRO", campo: "composicao", mensagem: "nenhum componente reconhecido" });
  return { componentes, problemas };
}

/** Componentes -> campos do sistema ácido (componente_1..4). O 1º é o ácido principal. */
export function sistemaDosComponentes(cs: Componente[], nome?: string, original?: string): Record<string, unknown> {
  const s: Record<string, unknown> = { nome_sistema: nome ?? cs.map((c) => c.componente).join(" + "), composicao_original: original ?? null };
  cs.slice(0, 4).forEach((c, i) => { s[`componente_${i + 1}`] = c.componente; s[`valor_${i + 1}`] = c.valor; s[`unidade_${i + 1}`] = c.unidade; });
  return s;
}

/** "[Dolomita] = 85% | [Calcita] = 15%", "[Calcita] > 99 %", "RM Ca/Mg ≈ 1,3" -> campos da rocha */
export function lerComposicaoRocha(texto: string) {
  const r: Record<string, number | string | null> = {
    calcita_pct: null, calcita_qualificador: null, dolomita_pct: null, dolomita_qualificador: null, razao_ca_mg: null,
  };
  for (const mineral of ["calcita", "dolomita"]) {
    const m = new RegExp(`\\[?${mineral}\\]?\\s*(>=|<=|≥|≤|>|<|=|≈|~)?\\s*([\\d.,]+)\\s*%`, "i").exec(texto);
    if (m) {
      r[`${mineral}_pct`] = numero(m[2]);
      r[`${mineral}_qualificador`] = ({ "≥": ">=", "≤": "<=", "≈": "~" } as Record<string, string>)[m[1] ?? "="] ?? (m[1] ?? "=");
    }
  }
  const rz = /ca\s*\/\s*mg\s*(?:=|≈|~)?\s*([\d.,]+)/i.exec(texto);
  if (rz) r.razao_ca_mg = numero(rz[1]);
  return r;
}

/** Sistema já cadastrado com a MESMA composição (evita o SA01 = SA08 da planilha). */
export function acharSistemaIgual(sistemas: Record<string, unknown>[], novo: Record<string, unknown>): string | null {
  const a = assinaturaSistema(novo);
  return (sistemas.find((s) => assinaturaSistema(s) === a)?.id_sistema as string | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Série: uma condição + vários pontos (rotação, taxa)
// ---------------------------------------------------------------------------
export interface Condicao {
  ano?: number | null;
  dim_h_in?: number | null; dim_d_in?: number | null;
  temperatura_c?: number | null; pressao_psi?: number | null;
  tipo_variavel?: "rotação (RDA)" | "taxa de cisalhamento" | "não informada";
  metodo_quantificacao?: string | null; metodo_coef_difusao?: string | null;
  obtencao_dado?: "tabelado" | "lido de gráfico" | "medida na superfície" | "não catalogado";
  fonte_local?: string | null;          // "Tabela 3", "Fig. 7b"
  unidades_originais?: Record<string, string> | null;
  observacao?: string | null;
}
export interface Ponto {
  rotacao_rpm?: number | null; shear_rate_s1?: number | null;
  taxa_reacao_mol_cm2_s: number | null; coef_difusao_cm2_s?: number | null;
  fonte_local?: string | null; observacao?: string | null;
}
/** Medida já existente, para avisar se a série parece já ter sido cadastrada (vem de v_lit_dados_rda). */
export interface Existente { id_ensaio: string; id_referencia: string; id_rocha: string; id_sistema: string; temperatura_c: number | null; rotacao_rpm: number | null; taxa_reacao_mol_cm2_s: number | null }

const FAIXAS: Record<string, [number, number, string]> = {
  temperatura_c: [0, 200, "°C"], pressao_psi: [0, 15000, "psi"], rotacao_rpm: [0, 10000, "rpm"],
  taxa_reacao_mol_cm2_s: [1e-10, 1e-4, "mol/(cm²·s)"], coef_difusao_cm2_s: [1e-8, 1e-3, "cm²/s"],
  dim_h_in: [0.1, 3, "in"], dim_d_in: [0.05, 3, "in"],
};

export function validarSerie(
  ids: { id_referencia?: string | null; id_rocha?: string | null; id_sistema?: string | null },
  c: Condicao, pontos: Ponto[], existentes: Existente[] = [],
): Problema[] {
  const pr: Problema[] = [];
  const erro = (campo: string, mensagem: string, ponto?: number) => pr.push({ severidade: "ERRO", campo, mensagem, ponto });
  const aviso = (campo: string, mensagem: string, ponto?: number) => pr.push({ severidade: "AVISO", campo, mensagem, ponto });
  if (!pontos.length) erro("pontos", "a série precisa de pelo menos um ponto");
  if (c.temperatura_c == null) erro("temperatura_c", "temperatura do ensaio é obrigatória");
  if (c.pressao_psi == null) aviso("pressao_psi", "sem pressão: se foi à pressão ambiente, escreva isso na observação");
  if (!c.metodo_quantificacao) aviso("metodo_quantificacao", "sem método de quantificação");
  if (!c.obtencao_dado || c.obtencao_dado === "não catalogado") aviso("obtencao_dado", "diga de onde saiu o número (tabela, gráfico…): é o indicador de confiabilidade");
  if (c.obtencao_dado === "lido de gráfico" && !c.fonte_local) aviso("fonte_local", "valor lido de gráfico: anote a figura (ex.: Fig. 7b) para quem for conferir");
  for (const campo of ["temperatura_c", "pressao_psi", "dim_h_in", "dim_d_in"] as const) {
    const v = c[campo]; const f = FAIXAS[campo];
    if (v != null && (v < f[0] || v > f[1])) aviso(campo, `${v} ${f[2]} fora do esperado (${f[0]}–${f[1]}); conferir unidade${campo === "temperatura_c" ? " (°F?)" : ""}`);
  }
  if (c.dim_h_in != null && c.dim_d_in != null && c.dim_d_in > c.dim_h_in)
    aviso("dim_d_in", "a 2ª dimensão (espessura) está maior que a 1ª (diâmetro): conferir a ordem");
  const tipo = c.tipo_variavel;
  const vistos = new Map<string, number>();
  pontos.forEach((p, i) => {
    const n = i + 1;
    if (p.taxa_reacao_mol_cm2_s == null) erro("taxa_reacao_mol_cm2_s", "sem taxa de reação", n);
    else if (p.taxa_reacao_mol_cm2_s <= 0) erro("taxa_reacao_mol_cm2_s", "taxa precisa ser positiva", n);
    if (tipo !== "não informada" && p.rotacao_rpm == null && p.shear_rate_s1 == null) erro("rotacao_rpm", "informe a rotação (ou a taxa de cisalhamento)", n);
    if (tipo === "rotação (RDA)" && p.rotacao_rpm == null) erro("rotacao_rpm", "tipo é rotação, mas a rotação está vazia", n);
    if (tipo === "taxa de cisalhamento" && p.shear_rate_s1 == null) erro("shear_rate_s1", "tipo é cisalhamento, mas o valor está vazio", n);
    for (const campo of ["rotacao_rpm", "taxa_reacao_mol_cm2_s", "coef_difusao_cm2_s"] as const) {
      const v = p[campo]; const f = FAIXAS[campo];
      if (v != null && v > 0 && (v < f[0] || v > f[1])) aviso(campo, `${v} ${f[2]} fora do esperado (${f[0]}–${f[1]}): conferir o expoente/unidade`, n);
    }
    const k = `${p.rotacao_rpm ?? ""}|${p.shear_rate_s1 ?? ""}`;
    if (vistos.has(k)) aviso("rotacao_rpm", `mesma rotação do ponto ${vistos.get(k)}: réplica? (ok se for)`, n); else vistos.set(k, n);
    // já existe no banco? mesma referência, rocha, sistema, temperatura, rotação e taxa
    const dup = existentes.find((e) => e.id_referencia === ids.id_referencia && e.id_rocha === ids.id_rocha && e.id_sistema === ids.id_sistema &&
      e.temperatura_c === c.temperatura_c && e.rotacao_rpm === (p.rotacao_rpm ?? null) && e.taxa_reacao_mol_cm2_s != null && p.taxa_reacao_mol_cm2_s != null &&
      Math.abs(e.taxa_reacao_mol_cm2_s - p.taxa_reacao_mol_cm2_s) <= 1e-6 * Math.abs(e.taxa_reacao_mol_cm2_s));
    if (dup) erro("taxa_reacao_mol_cm2_s", `igual à medida ${dup.id_ensaio} já cadastrada: provável lançamento repetido`, n);
  });
  return pr;
}

// ---------------------------------------------------------------------------
// Levich: no disco rotativo, se o transporte de ácido até a superfície controla a reação,
// a taxa cresce em linha reta com √ω e a reta passa perto da origem.
// ---------------------------------------------------------------------------
export interface Levich { n: number; inclinacao: number; intercepto: number; r2: number; regime: "transporte" | "misto" | "reação de superfície" | null; texto: string }

export function ajusteLevich(pontos: Ponto[]): Levich | null {
  const pts = pontos.filter((p) => p.rotacao_rpm != null && p.rotacao_rpm > 0 && p.taxa_reacao_mol_cm2_s != null && p.taxa_reacao_mol_cm2_s > 0)
    .map((p) => ({ x: raizOmega(p.rotacao_rpm!), y: p.taxa_reacao_mol_cm2_s! }));
  const n = pts.length;
  if (n < 3) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0), sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const syy = pts.reduce((s, p) => s + (p.y - my) ** 2, 0);
  if (sxx === 0) return null;
  const a = sxy / sxx, b = my - a * mx;
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1;
  // quanto a taxa varia com a rotação, em relação ao valor médio: perto de zero = rotação não importa
  const variacao = (a * (Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)))) / my;
  let regime: Levich["regime"] = null;
  if (Math.abs(variacao) < 0.1) regime = "reação de superfície";
  else if (r2 >= 0.97 && Math.abs(b) <= 0.15 * my) regime = "transporte";
  else regime = "misto";
  const texto = {
    "reação de superfície": "a taxa quase não muda com a rotação: quem controla é a reação na superfície",
    transporte: "taxa em linha reta com √ω passando perto da origem: quem controla é o transporte de ácido (Levich)",
    misto: "a taxa cresce com a rotação, mas não em linha reta pela origem: regime misto (transporte + reação)",
  }[regime];
  return { n, inclinacao: a, intercepto: b, r2, regime, texto };
}

// ---------------------------------------------------------------------------
// Ensaio do LABORATÓRIO: taxa pela curva de cálcio dissolvido × tempo (RDA / ICP-AES ou AAS)
//   taxa [mol/(cm²·s)] = inclinação de [Ca²⁺] × t  [mol/(L·s)] × volume de ácido [L] ÷ área da face do disco [cm²]
// ---------------------------------------------------------------------------
export const MASSA_MOLAR_CA = 40.078;

export function taxaPelaCurvaCalcio(
  pontos: { tempo_min: number; ca_mg_l: number }[], volume_ml: number, diametro_in: number,
): { taxa_mol_cm2_s: number; inclinacao_mg_l_min: number; r2: number; area_cm2: number; n: number } | null {
  const pts = pontos.filter((p) => Number.isFinite(p.tempo_min) && Number.isFinite(p.ca_mg_l));
  const n = pts.length;
  if (n < 2 || !(volume_ml > 0) || !(diametro_in > 0)) return null;
  const mx = pts.reduce((s, p) => s + p.tempo_min, 0) / n, my = pts.reduce((s, p) => s + p.ca_mg_l, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.tempo_min - mx) ** 2, 0), sxy = pts.reduce((s, p) => s + (p.tempo_min - mx) * (p.ca_mg_l - my), 0);
  const syy = pts.reduce((s, p) => s + (p.ca_mg_l - my) ** 2, 0);
  if (sxx === 0) return null;
  const incl = sxy / sxx;                                      // mg/(L·min)
  const area = (Math.PI * (diametro_in * 2.54) ** 2) / 4;      // cm²
  const molLs = incl / 1000 / MASSA_MOLAR_CA / 60;             // mol/(L·s)
  return { taxa_mol_cm2_s: (molLs * (volume_ml / 1000)) / area, inclinacao_mg_l_min: incl, r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 1, area_cm2: area, n };
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------
export interface NovaSerieLiteratura {
  id_referencia?: string | null; publicacao?: { autor: string; ano?: string | null; titulo?: string | null; periodico?: string | null; doi?: string | null; link?: string | null };
  id_rocha?: string | null; rocha?: { litologia: string; composicao_texto?: string | null } & Record<string, unknown>;
  id_sistema?: string | null; sistema?: Record<string, unknown>;
  condicao: Condicao; pontos: Ponto[];
}

/** Grava tudo numa transação no banco (publicação, rocha e sistema novos + os pontos). Devolve os códigos criados. */
export async function gravarSerieLiteratura(sb: SupabaseClient, s: NovaSerieLiteratura) {
  const { data, error } = await sb.rpc("lit_cadastrar_serie", { p: s });
  if (error) {
    const msg = error.code === "42501" ? "Sem permissão: só editor ou administrador cadastra dados da literatura."
      : error.code === "42883" || /lit_cadastrar_serie/.test(error.message) && /not find|não existe|does not exist/i.test(error.message)
        ? "Rode a migração 020 no Supabase (função lit_cadastrar_serie não encontrada)." : error.message;
    throw new Error(msg);
  }
  return data as { id_referencia: string; id_rocha: string; id_sistema: string; ids: string[] };
}

export interface PontoLaboratorio extends Ponto { amostra_id: string; data_ensaio?: string | null; tempo_min?: number | null; curva_calcio?: { tempo_min: number; ca_mg_l: number }[] }

/** Ensaios do PRÓPRIO laboratório (analise_rda, um disco/amostra por ponto). Grava a curva de cálcio, se houver. */
export async function gravarSerieLaboratorio(sb: SupabaseClient, s: {
  serie: string; id_sistema: string; condicao: Condicao & { volume_acido_ml?: number | null; responsavel?: string | null }; pontos: PontoLaboratorio[];
}) {
  const ids: number[] = [];
  for (const p of s.pontos) {
    const area = s.condicao.dim_h_in ? (Math.PI * (s.condicao.dim_h_in * 2.54) ** 2) / 4 : null;
    const calc = p.curva_calcio && s.condicao.volume_acido_ml && s.condicao.dim_h_in
      ? taxaPelaCurvaCalcio(p.curva_calcio, s.condicao.volume_acido_ml, s.condicao.dim_h_in) : null;
    const { data, error } = await sb.from("analise_rda").insert({
      amostra_id: p.amostra_id, data_ensaio: p.data_ensaio ?? null, id_sistema: s.id_sistema, serie: s.serie,
      tipo_variavel: s.condicao.tipo_variavel ?? "rotação (RDA)", rotacao_rpm: p.rotacao_rpm ?? null, shear_rate_s1: p.shear_rate_s1 ?? null,
      pressao_psi: s.condicao.pressao_psi ?? null, temperatura_c: s.condicao.temperatura_c ?? null,
      dim_h_in: s.condicao.dim_h_in ?? null, dim_d_in: s.condicao.dim_d_in ?? null, tempo_min: p.tempo_min ?? null,
      volume_acido_ml: s.condicao.volume_acido_ml ?? null, area_cm2: calc?.area_cm2 ?? area,
      taxa_reacao_mol_cm2_s: calc?.taxa_mol_cm2_s ?? p.taxa_reacao_mol_cm2_s, taxa_calculada: calc != null,
      coef_difusao_cm2_s: p.coef_difusao_cm2_s ?? null, metodo_quantificacao: s.condicao.metodo_quantificacao ?? null,
      metodo_coef_difusao: s.condicao.metodo_coef_difusao ?? null, responsavel: s.condicao.responsavel ?? null,
      observacoes: [s.condicao.observacao, p.observacao].filter(Boolean).join(" · ") || null,
    }).select("id").single();
    if (error) throw new Error(error.code === "42501" ? "Sem permissão para gravar nesta amostra: é preciso ser editor do projeto." : `analise_rda: ${error.message}`);
    const id = (data as { id: number }).id;
    ids.push(id);
    if (p.curva_calcio?.length) {
      const { data: c, error: e2 } = await sb.from("curvas").insert({
        amostra_id: p.amostra_id, analise_tabela: "analise_rda", analise_id: id, nome: "[Ca²⁺] × tempo (RDA)",
        x_grandeza: "Tempo", x_unidade: "min", y_grandeza: "[Ca²⁺]", y_unidade: "mg/L",
      }).select("id").single();
      if (e2) throw new Error(`curvas: ${e2.message}`);
      const { error: e3 } = await sb.from("curva_pontos").insert(p.curva_calcio.map((q, i) => ({ curva_id: (c as { id: number }).id, ordem: i, x: q.tempo_min, y: q.ca_mg_l })));
      if (e3) throw new Error(`curva_pontos: ${e3.message}`);
    }
  }
  return ids;
}
