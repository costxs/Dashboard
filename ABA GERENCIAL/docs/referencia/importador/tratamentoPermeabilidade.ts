// =============================================================================
// Tratamento de dados de coreflooding — PERMEABILIDADE
//
// Entrada: o arquivo que o equipamento exporta (ex.: aba "Planilha2" do exemplo):
//   linhas "Chave: valor" no topo (Usuário, Data, Descrição da amostra, Comprimento (cm),
//   Diâmetro (cm), Porosidade (%), Viscosidade (cP), Fluido de tratamento, Conteúdo da garrafa N)
//   e depois a tabela, uma linha por leitura: Hora, Tempo (s), PAH1, dPH1, ..., Q (cm³/min),
//   Nome Gn / Volume atual Gn / Volume bomb. parcial Gn, Permeabilidade H1 (mD), Seleção do holder...
//   Também aceita a tabela já separada pelo pesquisador (Planilha1/Planilha3).
//
// O que o pesquisador fazia à mão, aqui é automático:
//   1. separar as ETAPAS pela vazão: enquanto Q fica em 2 cm³/min é uma etapa; quando vira 4,
//      começa outra (Q = 0 é pausa e não conta);
//   2. de cada etapa, guardar tempo, diferencial de pressão e volumes;
//   3. usar só o trecho ESTÁVEL de cada etapa (por padrão a metade final), que a pessoa pode ajustar;
//   4. calcular k por etapa (lei de Darcy) e o k da amostra pelo ajuste ΔP × Q.
//
// Lei de Darcy em unidades de laboratório:
//   k [mD] = 244,93 · Q [cm³/min] · μ [cP] · L [cm] / ( A [cm²] · ΔP [psi] )
//   (244,93 = 1000 mD/D × 14,696 psi/atm ÷ 60 s/min; A = π·D²/4)
// =============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanilhaBruta } from "./planilhaAmostras";
import { chave, numero } from "./planilhaAmostras";

export const CONSTANTE_DARCY = (1000 * 14.696) / 60; // 244,93

export interface Metadados {
  usuario?: string | null;
  data?: string | null;
  amostra?: string | null;           // "Descrição da amostra" -> código (IL183)
  comprimento_cm?: number | null;
  diametro_cm?: number | null;
  porosidade_pct?: number | null;
  viscosidade_cp?: number | null;
  fluido?: string | null;            // "Fluido de tratamento"
  garrafas: Record<number, string>;  // 1..4 -> conteúdo
  outros: Record<string, string>;
}

export interface Leitura {
  linha: number;            // linha no Excel
  tempo_s: number;
  hora?: string | null;
  q: number;                // cm³/min
  dp: number | null;        // diferencial do holder escolhido (psi)
  dp_abs: number | null;    // P2-P1 dos transdutores absolutos (psi), só para conferência
  p_confinamento: number | null;
  p_backpressure: number | null;
  temperatura: number | null;
  k_equipamento: number | null;
  volumes: Record<string, { atual: number | null; parcial: number | null }>; // por nome do fluido
  rotulo?: string | null;   // separação do pesquisador ("Permeabilidade 1"), se vier
}

export interface Ensaio {
  aba: string;
  metadados: Metadados;
  holder: "H1" | "H2";
  leituras: Leitura[];
  avisos: string[];
}

export interface Etapa {
  ordem: number;
  q: number;
  inicio: number; fim: number;           // índices em ensaio.leituras (inclusive)
  t_inicio_s: number; t_fim_s: number;
  // janela usada no cálculo (trecho estável)
  j_inicio_s: number; j_fim_s: number; n_pontos: number;
  dp_medio: number | null; dp_desvio: number | null; dp_cv_pct: number | null;
  volume_injetado_cm3: number;           // Q × duração
  volume_bombeado_cm3: number | null;    // pela bomba (Volume bomb. parcial do fluido), se houver
  k_md: number | null;                   // Darcy com ΔP médio da janela
  k_equipamento_md: number | null;       // média do que o equipamento mostrou na janela
  estavel: boolean;                      // CV do ΔP na janela <= limite
}

export interface Resultado {
  etapas: Etapa[];
  area_cm2: number | null;
  /** ajuste da reta ΔP × Q; k = 244,93·μ·L/(A·inclinação).
   *  modo 'intercepto' (padrão, igual ao FitLinear do Origin do laboratório): ΔP = a·Q + b
   *  modo 'origem': ΔP = a·Q (reta forçada a passar no zero) */
  ajuste: {
    modo: ModoAjuste; inclinacao: number; intercepto: number; r2: number; k_md: number;
    k_md_pela_origem: number; k_md_com_intercepto: number;
    /** mantido por compatibilidade: intercepto da reta livre */
    intercepto_livre: number;
  } | null;
  k_medio_md: number | null;            // média dos k das etapas estáveis
  avisos: string[];
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------
const num = (v: unknown): number | null => { const n = numero(v); return n == null || Number.isNaN(n) ? null : n; };

function lerMetadado(m: Metadados, linhaTexto: string) {
  const i = linhaTexto.indexOf(":");
  if (i < 0) return;
  const k = chave(linhaTexto.slice(0, i));
  const v = linhaTexto.slice(i + 1).trim() || null;
  const n = v == null ? null : num(v);
  if (k === "usuario") m.usuario = v;
  else if (k === "data") m.data = v;
  else if (k.startsWith("descricao da amostra")) m.amostra = v ? v.replace(/\s+/g, "").toUpperCase() : null;
  else if (k.startsWith("comprimento")) m.comprimento_cm = n;
  else if (k.startsWith("diametro")) m.diametro_cm = n;
  else if (k.startsWith("porosidade")) m.porosidade_pct = n;
  else if (k.startsWith("viscosidade")) m.viscosidade_cp = n;
  else if (k.startsWith("fluido de tratamento")) m.fluido = v;
  else if (k.startsWith("conteudo da garrafa")) { const g = Number(k.replace(/\D/g, "")); if (g && v) m.garrafas[g] = v; }
  else m.outros[linhaTexto.slice(0, i).trim()] = v ?? "";
}

/** Acha a aba com a tabela de leituras (precisa de "Tempo (s)" e "Q (cm³/min)"). Prefere a exportação bruta. */
export function lerEnsaios(bruta: PlanilhaBruta): Ensaio[] {
  const ensaios: Ensaio[] = [];
  for (const [aba, m] of Object.entries(bruta)) {
    const iCab = m.findIndex((l) => l?.some((v) => chave(v) === "tempo s") && l.some((v) => chave(v).startsWith("q cm")));
    if (iCab < 0) continue;
    const meta: Metadados = { garrafas: {}, outros: {} };
    for (let i = 0; i < iCab; i++) {
      const t = m[i]?.find((v) => typeof v === "string" && v.includes(":")) as string | undefined;
      if (t) lerMetadado(meta, t);
    }
    const cab = m[iCab].map((v) => String(v ?? "").trim());
    const k = cab.map(chave);
    const idx = (f: (s: string) => boolean) => k.findIndex(f);
    const iTempo = idx((s) => s === "tempo s");
    const iQ = idx((s) => s.startsWith("q cm"));
    const iHora = idx((s) => s === "hora");
    const iHolder = idx((s) => s.startsWith("selecao do holder"));
    const iRot = cab.findIndex((c, j) => /^coluna ?\d+$/i.test(c) && m.slice(iCab + 1).some((l) => typeof l?.[j] === "string" && /permeab/i.test(l[j] as string)));
    // holder: o que mais aparece na coluna de seleção (padrão H1)
    let holder: "H1" | "H2" = "H1";
    if (iHolder >= 0) {
      const h2 = m.slice(iCab + 1).filter((l) => /2/.test(String(l?.[iHolder] ?? ""))).length;
      const h1 = m.slice(iCab + 1).filter((l) => /1/.test(String(l?.[iHolder] ?? ""))).length;
      if (h2 > h1) holder = "H2";
    }
    const h = holder.toLowerCase();
    const iDp = idx((s) => s === `dp${h} psi`);
    const iDpAbs = idx((s) => s.startsWith(`dp${h} p2${h}`));
    const iPC = idx((s) => s === "pc psi");
    const iPB = idx((s) => s === `pb${h} psi`);
    const iT = idx((s) => s.startsWith("t estufa"));
    const iK = idx((s) => s === `permeabilidade ${h} md`);
    // garrafas: "Nome Gn" + "Volume atual Gn" + "Volume bomb. parcial Gn"
    const garrafas: { nome: number; atual: number; parcial: number }[] = [];
    k.forEach((s, j) => {
      const g = /^nome g(\d)$/.exec(s);
      if (g) garrafas.push({ nome: j, atual: idx((x) => x === `volume atual g${g[1]} cm3` || x === `volume atual g${g[1]} cm`), parcial: idx((x) => x.startsWith(`volume bomb parcial g${g[1]}`)) });
    });
    const avisos: string[] = [];
    if (iDp < 0) avisos.push(`coluna dP${holder} (psi) não encontrada`);
    const leituras: Leitura[] = [];
    for (let i = iCab + 1; i < m.length; i++) {
      const l = m[i];
      if (!l || l.every((v) => v == null || v === "")) continue;
      const t = num(l[iTempo]); const q = num(l[iQ]);
      if (t == null || q == null) continue;
      const volumes: Leitura["volumes"] = {};
      for (const g of garrafas) {
        const nome = String(l[g.nome] ?? "").trim();
        if (!nome) continue;
        volumes[nome] = { atual: g.atual >= 0 ? num(l[g.atual]) : null, parcial: g.parcial >= 0 ? num(l[g.parcial]) : null };
      }
      leituras.push({
        linha: i + 1, tempo_s: t, q,
        hora: iHora >= 0 && l[iHora] != null ? String(l[iHora]) : null,
        dp: iDp >= 0 ? num(l[iDp]) : null, dp_abs: iDpAbs >= 0 ? num(l[iDpAbs]) : null,
        p_confinamento: iPC >= 0 ? num(l[iPC]) : null, p_backpressure: iPB >= 0 ? num(l[iPB]) : null,
        temperatura: iT >= 0 ? num(l[iT]) : null, k_equipamento: iK >= 0 ? num(l[iK]) : null,
        volumes, rotulo: iRot >= 0 ? (l[iRot] as string | null) : null,
      });
    }
    if (leituras.length) ensaios.push({ aba, metadados: meta, holder, leituras, avisos });
  }
  // exportação bruta (tem metadados) primeiro
  return ensaios.sort((a, b) => Number(!!b.metadados.amostra) - Number(!!a.metadados.amostra));
}

// ---------------------------------------------------------------------------
// Separação em etapas e cálculo
// ---------------------------------------------------------------------------
export type ModoAjuste = 'intercepto' | 'origem';

export interface OpcoesTratamento {
  /** reta ΔP × Q com intercepto livre (padrão, como o Origin do laboratório) ou pela origem */
  ajuste?: ModoAjuste;
  comprimento_cm?: number | null;    // se não vier, usa o do cabeçalho
  diametro_cm?: number | null;
  viscosidade_cp?: number | null;
  /** fração final de cada etapa usada como trecho estável (0–1). Padrão 0,5 */
  fracaoEstavel?: number;
  /** janela escolhida à mão por etapa (tempo em s), sobrepõe a fração */
  janelas?: Record<number, [number, number]>;
  /** variação relativa de Q que ainda conta como a mesma vazão. Padrão 2% */
  toleranciaQ?: number;
  /** etapa com menos leituras que isto é ruído de troca de vazão. Padrão 5 */
  minPontos?: number;
  /** CV máximo do ΔP (%) para a etapa ser considerada estável. Padrão 5 */
  cvMaximo?: number;
}

export function separarEtapas(e: Ensaio, op: OpcoesTratamento = {}): { inicio: number; fim: number; q: number }[] {
  const tol = op.toleranciaQ ?? 0.02, minP = op.minPontos ?? 5;
  const blocos: { inicio: number; fim: number; q: number }[] = [];
  e.leituras.forEach((l, i) => {
    const b = blocos[blocos.length - 1];
    if (b && Math.abs(l.q - b.q) <= tol * Math.max(Math.abs(b.q), 1e-9)) b.fim = i;
    else blocos.push({ inicio: i, fim: i, q: l.q });
  });
  // vazão zero (pausa) e trechos curtos de transição não são etapas
  const etapas = blocos.filter((b) => b.q > 0 && b.fim - b.inicio + 1 >= minP);
  // duas etapas seguidas com a mesma vazão (separadas por ruído) viram uma
  const juntas: typeof etapas = [];
  for (const b of etapas) {
    const a = juntas[juntas.length - 1];
    if (a && Math.abs(a.q - b.q) <= tol * a.q && b.inicio - a.fim <= minP) a.fim = b.fim;
    else juntas.push({ ...b });
  }
  return juntas;
}

const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const desvio = (xs: number[]) => { const m = media(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(xs.length - 1, 1)); };

/** Reta ΔP (psi) × Q (cm³/min) e k de Darcy pela inclinação. Mesmo cálculo da planilha do Origin
 *  (Permeability = μ·L/(inclinação·A), com a inclinação do FitLinear). */
export function ajusteDarcy(
  pts: { q: number; dp: number }[],
  g: { comprimento_cm: number; area_cm2: number; viscosidade_cp: number },
  modo: ModoAjuste = 'intercepto',
): NonNullable<Resultado["ajuste"]> {
  const mq = media(pts.map((p) => p.q)), mdp = media(pts.map((p) => p.dp));
  const sqq = pts.reduce((s, p) => s + (p.q - mq) ** 2, 0);
  const aL = sqq > 0 ? pts.reduce((s, p) => s + (p.q - mq) * (p.dp - mdp), 0) / sqq : NaN;
  const bL = mdp - aL * mq;
  const a0 = pts.reduce((s, p) => s + p.q * p.dp, 0) / pts.reduce((s, p) => s + p.q * p.q, 0);
  const [a, b] = modo === 'origem' ? [a0, 0] : [aL, bL];
  const ssTot = pts.reduce((s, p) => s + (p.dp - mdp) ** 2, 0);
  const ssRes = pts.reduce((s, p) => s + (p.dp - (a * p.q + b)) ** 2, 0);
  const kDe = (incl: number) => (CONSTANTE_DARCY * g.viscosidade_cp * g.comprimento_cm) / (g.area_cm2 * incl);
  return {
    modo, inclinacao: a, intercepto: b, r2: ssTot > 0 ? 1 - ssRes / ssTot : 1, k_md: kDe(a),
    k_md_pela_origem: kDe(a0), k_md_com_intercepto: kDe(aL), intercepto_livre: bL,
  };
}

export function tratarPermeabilidade(e: Ensaio, op: OpcoesTratamento = {}): Resultado {
  const L = op.comprimento_cm ?? e.metadados.comprimento_cm ?? null;
  const D = op.diametro_cm ?? e.metadados.diametro_cm ?? null;
  const mu = op.viscosidade_cp ?? e.metadados.viscosidade_cp ?? null;
  const A = D ? (Math.PI * D * D) / 4 : null;
  const avisos = [...e.avisos];
  if (!L) avisos.push("comprimento da amostra não informado: k não pode ser calculado");
  if (!D) avisos.push("diâmetro da amostra não informado: k não pode ser calculado");
  if (!mu) avisos.push("viscosidade do fluido não informada: k não pode ser calculado");
  const fr = Math.min(Math.max(op.fracaoEstavel ?? 0.5, 0.05), 1);
  const cvMax = op.cvMaximo ?? 5;
  const fluido = e.metadados.fluido ? chave(e.metadados.fluido) : null;

  const etapas: Etapa[] = separarEtapas(e, op).map((b, i) => {
    const ls = e.leituras.slice(b.inicio, b.fim + 1);
    const t0 = ls[0].tempo_s, t1 = ls[ls.length - 1].tempo_s;
    const manual = op.janelas?.[i + 1];
    const [j0, j1] = manual ?? [t1 - (t1 - t0) * fr, t1];
    const jan = ls.filter((l) => l.tempo_s >= j0 && l.tempo_s <= j1 && l.dp != null);
    const dps = jan.map((l) => l.dp as number);
    const dpm = dps.length ? media(dps) : null;
    const sd = dps.length > 1 ? desvio(dps) : null;
    const ks = jan.map((l) => l.k_equipamento).filter((x): x is number => x != null && x > 0);
    // volume bombeado do fluido de tratamento (ou da única garrafa que variou)
    const nomes = Object.keys(ls[0].volumes);
    const nome = nomes.find((n) => fluido && chave(n) === fluido)
      ?? nomes.find((n) => { const a = ls[0].volumes[n]?.atual, z = ls[ls.length - 1].volumes[n]?.atual; return a != null && z != null && Math.abs(a - z) > 1e-6; });
    let vb: number | null = null;
    if (nome) {
      const a = ls[0].volumes[nome], z = ls[ls.length - 1].volumes[nome];
      if (a?.atual != null && z?.atual != null) vb = Math.abs(a.atual - z.atual);
    }
    const k = dpm && dpm > 0 && L && A && mu ? (CONSTANTE_DARCY * b.q * mu * L) / (A * dpm) : null;
    const cv = dpm && sd != null ? (sd / dpm) * 100 : null;
    return {
      ordem: i + 1, q: b.q, inicio: b.inicio, fim: b.fim, t_inicio_s: t0, t_fim_s: t1,
      j_inicio_s: j0, j_fim_s: j1, n_pontos: jan.length,
      dp_medio: dpm, dp_desvio: sd, dp_cv_pct: cv,
      volume_injetado_cm3: (b.q * (t1 - t0)) / 60, volume_bombeado_cm3: vb,
      k_md: k, k_equipamento_md: ks.length ? media(ks) : null,
      estavel: cv != null && cv <= cvMax,
    };
  });

  for (const et of etapas) if (!et.estavel) avisos.push(`etapa ${et.ordem} (Q = ${et.q} cm³/min): ΔP não estabilizou (CV ${et.dp_cv_pct?.toFixed(1)}% > ${cvMax}%); ajuste o trecho estável ou descarte a etapa`);

  // ajuste ΔP × Q. O laboratório usa no Origin a reta com intercepto livre (FitLinear) e pega só a inclinação:
  // isso descarta um desvio constante de ΔP (zero do transdutor). Pela origem fica como opção.
  const pts = etapas.filter((x) => x.estavel && x.dp_medio != null).map((x) => ({ q: x.q, dp: x.dp_medio as number }));
  let ajuste: Resultado["ajuste"] = null;
  if (pts.length >= 2 && L && A && mu) {
    ajuste = ajusteDarcy(pts, { comprimento_cm: L, area_cm2: A, viscosidade_cp: mu }, op.ajuste ?? 'intercepto');
    if (Math.abs(ajuste.intercepto_livre) > 0.1 * media(pts.map((p) => p.dp)))
      avisos.push(`a reta ΔP × Q não passa perto da origem (intercepto ${ajuste.intercepto_livre.toFixed(2)} psi): pode haver efeito inercial ou erro de zero do transdutor`);
  }
  const ksE = etapas.filter((x) => x.estavel && x.k_md != null).map((x) => x.k_md as number);
  return { etapas, area_cm2: A, ajuste, k_medio_md: ksE.length ? media(ksE) : null, avisos };
}

// ---------------------------------------------------------------------------
// Gravação: petrofísica da amostra + etapas + curva ΔP × tempo
// ---------------------------------------------------------------------------

export interface GravarPermeabilidade {
  amostraId: string;
  ensaio: Ensaio;
  resultado: Resultado;
  /** qual k vai para a petrofísica */
  metodo: "ajuste ΔP × Q" | "média das etapas";
  /** etapas que entram no k final (padrão: as estáveis) */
  etapasUsadas?: number[];
  arquivo?: string | null;
  pressaoConfinamentoPsi?: number | null;
  /** configuração dos gráficos padrão Origin (cores por etapa, títulos, eixos...) -> analise_petrofisica.config_graficos */
  configGraficos?: unknown;
}

/** "02/09/2026 15:05:46" -> "2026-09-02" */
export function dataDoCabecalho(s?: string | null): string | null {
  const m = s ? /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s) : null;
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

export async function gravarPermeabilidade(sb: SupabaseClient, g: GravarPermeabilidade): Promise<{ analiseId: number; curvaId: number; k: number }> {
  const usadas = new Set(g.etapasUsadas ?? g.resultado.etapas.filter((e) => e.estavel).map((e) => e.ordem));
  const k = g.metodo === "ajuste ΔP × Q" ? g.resultado.ajuste?.k_md : g.resultado.k_medio_md;
  if (k == null || !Number.isFinite(k)) throw new Error("Não há k calculado para gravar: confira comprimento, diâmetro, viscosidade e as etapas estáveis.");
  const m = g.ensaio.metadados;
  const pcs = g.ensaio.leituras.map((l) => l.p_confinamento).filter((x): x is number => x != null && x > 0);
  const erro = (e: { code?: string; message: string }, t: string) =>
    new Error(e.code === "42501" ? `Sem permissão para gravar em ${t}: é preciso ser editor do projeto da amostra.`
      : /ajuste_(modo|inclinacao|intercepto_psi|r2)/.test(e.message) ? "Rode a migração 017 no Supabase"
      : `${t}: ${e.message}`);

  const { data: a, error: e1 } = await sb.from("analise_petrofisica").insert({
    amostra_id: g.amostraId, momento: "antes", data_ensaio: dataDoCabecalho(m.data),
    permeabilidade_liquido_md: Math.round(k * 1000) / 1000,
    pressao_confinamento_psi: g.pressaoConfinamentoPsi ?? (pcs.length ? Math.round(pcs.reduce((s, x) => s + x, 0) / pcs.length) : null),
    viscosidade_cp: m.viscosidade_cp ?? null, fluido: m.fluido ?? null, metodo_k: g.metodo,
    arquivo_origem: g.arquivo ?? null, responsavel: m.usuario ?? null,
    // colunas da migração 017
    ajuste_modo: g.resultado.ajuste?.modo ?? null,
    ajuste_inclinacao: g.resultado.ajuste?.inclinacao ?? null,
    ajuste_intercepto_psi: g.resultado.ajuste?.intercepto ?? null,
    ajuste_r2: g.resultado.ajuste?.r2 ?? null,
    observacoes: `Tratamento automático: ${g.resultado.etapas.length} etapa(s) de vazão; k por ${g.metodo}` +
      (g.resultado.ajuste ? ` (reta ${g.resultado.ajuste.modo === "origem" ? "pela origem" : "com intercepto, como no Origin"}; R² = ${g.resultado.ajuste.r2.toFixed(4)})` : ""),
    // coluna da migração 016; só vai no pedido quando há configuração
    ...(g.configGraficos != null ? { config_graficos: g.configGraficos } : {}),
  }).select("id").single();
  if (e1) throw erro(e1, "analise_petrofisica");

  const { error: e2 } = await sb.from("permeabilidade_etapas").insert(g.resultado.etapas.map((e) => ({
    analise_id: a.id, ordem: e.ordem, vazao_ml_min: e.q, t_inicio_s: e.t_inicio_s, t_fim_s: e.t_fim_s,
    janela_inicio_s: e.j_inicio_s, janela_fim_s: e.j_fim_s, n_pontos: e.n_pontos,
    dp_medio_psi: e.dp_medio, dp_desvio_psi: e.dp_desvio, volume_injetado_cm3: e.volume_injetado_cm3,
    volume_bombeado_cm3: e.volume_bombeado_cm3, k_md: e.k_md, k_equipamento_md: e.k_equipamento_md,
    estavel: e.estavel, usada: usadas.has(e.ordem),
  })));
  if (e2) throw erro(e2, "permeabilidade_etapas");

  // curva ΔP × tempo (no máximo 2000 pontos, para não pesar)
  const ls = g.ensaio.leituras.filter((l) => l.dp != null);
  const passo = Math.max(1, Math.ceil(ls.length / 2000));
  const pts = ls.filter((_, i) => i % passo === 0);
  const { data: c, error: e3 } = await sb.from("curvas").insert({
    amostra_id: g.amostraId, analise_tabela: "analise_petrofisica", analise_id: a.id,
    nome: "ΔP × tempo (permeabilidade)", x_grandeza: "Tempo", x_unidade: "s", y_grandeza: "ΔP", y_unidade: "psi",
  }).select("id").single();
  if (e3) throw erro(e3, "curvas");
  for (let i = 0; i < pts.length; i += 500) {
    const { error } = await sb.from("curva_pontos").insert(pts.slice(i, i + 500).map((l, j) => ({ curva_id: c.id, ordem: i + j, x: l.tempo_s, y: l.dp as number })));
    if (error) throw erro(error, "curva_pontos");
  }
  return { analiseId: a.id, curvaId: c.id, k };
}
