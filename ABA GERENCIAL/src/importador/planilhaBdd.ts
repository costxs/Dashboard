// =============================================================================
// Importador da planilha BDD_LCPETRO_Reatividade (literatura geral) — versão
// TypeScript para rodar no navegador (painel gerencial). Mesmas regras do
// importador Python em Dashboard-Back/importador/importar.py.
//
// Fluxo na tela:
//   1. lerArquivo(file)            -> Planilha  (todas as abas)
//   2. analisarBdd(planilha)       -> Analise   (contagens, problemas, dados limpos)
//      mostrar prévia: contagens por tabela + lista de ERROS / AVISOS / CORRIGIDOS
//   3. conferirBddNoBanco(supabase, analise)  (opcional, recomendado)
//      compara com o que já está no banco: novos / alterados (campo a campo) / iguais / só no banco
//   4. gravarBdd(supabase, analise, { pularErros, aoProgresso })
//      grava na ordem certa (catálogos antes das medidas), em lotes, com upsert.
//
// Nada é gravado nos passos 2 e 3. Reimportar é seguro: mesmo id = atualiza; nada é apagado.
//
// v2 (planilha real, 419 medidas): também importa as abas "listas" (métodos) e "qualidade"
// (anotações de conferência), padroniza nomes de componentes e unidades, avisa sistemas ácidos
// repetidos e a coluna de dimensão do disco preenchida em sequência (1, 2, 3…) por arrasto no Excel.
// =============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";

export type Linha = Record<string, unknown>;
export type Planilha = Record<string, Linha[]>;
export type Severidade = "ERRO" | "AVISO" | "CORRIGIDO";

export interface Problema {
  severidade: Severidade;
  aba: string;
  linha: number | null;      // linha no Excel (cabeçalho = 1)
  id: string | null;
  campo: string;
  mensagem: string;
}

type Registro = Record<string, unknown> & { _linha: number };

export interface DadosBdd {
  publicacoes: Registro[];
  fluidos_prop: Registro[];
  litologias: Registro[];
  lit_listas: Registro[];
  lit_rochas: Registro[];
  sistemas_acidos: Registro[];
  lit_dados_rda: Registro[];
  lit_qualidade: Registro[];
  /** ensaios do PRÓPRIO laboratório (coluna "amostra" ou referência do LC PETRO): vão para a ficha da amostra.
   *  O código da amostra fica em "_amostra" e só vira amostra_id na gravação (precisa do banco). */
  analise_rda: Registro[];
}

/** Referência que representa os ensaios do próprio laboratório ("LCPETRO", "LC PETRO (laboratório)"). */
export const ehReferenciaLaboratorio = (id: string | null, autor?: string | null) =>
  [id, autor].some((t) => t != null && /lc\s*-?\s*petro/i.test(t));

export interface Analise {
  dados: DadosBdd;
  problemas: Problema[];
  contagens: Record<keyof DadosBdd, number>;
  colunasIgnoradas: string[];
  abasEncontradas: string[];
  abasFaltando: string[];
  erros: number;
  avisos: number;
  corrigidos: number;
}

// ---------------------------------------------------------------------------
// Regras de padronização (as mesmas da aba LEIA-ME da planilha)
// ---------------------------------------------------------------------------
const NULOS = new Set(["", "-", "—", "–", "nan", "none", "n/a", "na"]);

const SINONIMOS_LITOLOGIA: Record<string, string> = {
  "indiana": "Indiana Limestone",
  "calcário indiana": "Indiana Limestone",
  "cálcario indiana": "Indiana Limestone",
  "calcario indiana": "Indiana Limestone",
  "pink desert": "Pink Desert Limestone",
  "alamaba marble": "Alabama Marble",
};

const LISTA_TIPO_VARIAVEL = ["rotação (RDA)", "taxa de cisalhamento", "não informada"];
const LISTA_OBTENCAO = ["tabelado", "lido de gráfico", "medida na superfície", "não catalogado"];
const UNIDADES_CONC: Record<string, string> = {
  "n": "N", "m": "M", "wt%": "wt%", "wt %": "wt%", "%wt": "wt%", "wt": "wt%", "% wt": "wt%",
  "vol%": "vol%", "vol %": "vol%", "%vol": "vol%", "mm": "mM",
  "ml/l": "mL/L", "mg/l": "mg/L", "g/l": "g/L", "gpt": "gpt",
};

/** Grafia padrão de ácidos comuns (nomes da química, iguais em qualquer planilha). */
const SINONIMOS_COMPONENTE: Record<string, string> = {
  "acido formico": "Ácido fórmico", "acido latico": "Ácido lático", "acido lactico": "Ácido lático",
  "acido citrico": "Ácido cítrico", "acido acetico": "Ácido acético", "acido cloridrico": "HCl", "hcl": "HCl",
};
/** sem acento, minúsculas, espaços simples: "Ácido  Fórmico" -> "acido formico" */
export const dobra = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function normalizaComponente(v: string | null): string | null {
  if (v == null) return null;
  return SINONIMOS_COMPONENTE[dobra(v)] ?? v.trim();
}

function distancia(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = t;
    }
  }
  return d[b.length];
}

/**
 * Grafias do mesmo componente que só diferem em acento, maiúscula ou espaço ("Polímero-X" × "Poliméro-X")
 * viram uma só: a do dicionário, senão a de fluidos_prop, senão a mais usada. Devolve o mapa grafia -> padrão.
 * Nomes PARECIDOS (até 2 letras de diferença) não são trocados sozinhos — "metanol" × "etanol" são coisas
 * diferentes —, só listados em `parecidos` para a pessoa conferir.
 */
export function unificarGrafias(usos: string[], preferidos: string[] = []): { mapa: Map<string, string>; parecidos: [string, string][] } {
  const grupos = new Map<string, Map<string, number>>();
  for (const u of usos) {
    const t = u.replace(/\s+/g, " ").trim(); if (!t) continue;
    const g = grupos.get(dobra(t)) ?? new Map<string, number>();
    g.set(t, (g.get(t) ?? 0) + 1); grupos.set(dobra(t), g);
  }
  const pref = new Map(preferidos.map((x) => [dobra(x), x.trim()]));
  const mapa = new Map<string, string>();
  for (const [k, g] of grupos) {
    const padrao = SINONIMOS_COMPONENTE[k] ?? pref.get(k) ?? [...g].sort((a, b) => b[1] - a[1])[0][0];
    for (const grafia of g.keys()) mapa.set(grafia, padrao);
  }
  const chaves = [...grupos.keys()].filter((k) => k.length >= 6);
  const parecidos: [string, string][] = [];
  for (let i = 0; i < chaves.length; i++) for (let j = i + 1; j < chaves.length; j++) {
    const a = chaves[i], b = chaves[j];
    // sufixo de série (-A × -B, 1 × 2) é proposital: não é grafia
    if (a.replace(/[-\s]?[a-z0-9]$/, "") === b.replace(/[-\s]?[a-z0-9]$/, "")) continue;
    if (Math.abs(a.length - b.length) <= 2 && distancia(a, b) <= 2) parecidos.push([mapa.get([...grupos.get(a)!.keys()][0])!, mapa.get([...grupos.get(b)!.keys()][0])!]);
  }
  return { mapa, parecidos };
}

/** Código da medida da LITERATURA: preserva o id_ensaio da planilha (RDA-0001, RDA-0002...). */
export function codigoLiteratura(id: string | null): string | null {
  if (id == null) return null;
  const t = id.trim();
  const m = /^LIT-(\d+)$/i.exec(t);
  return m ? `RDA-${m[1]}` : t;
}

/** Assinatura de um sistema ácido: igual à função assinatura_sistema() do banco (migração 020).
 *  A ordem dos componentes não importa ("HCl + IC" = "IC + HCl"). */
export function assinaturaSistema(s: Record<string, unknown>): string {
  const partes: string[] = [];
  for (let k = 1; k <= 4; k++) {
    const c = s[`componente_${k}`] as string | null;
    if (!c) continue;
    const v = s[`valor_${k}`] as number | null;
    const u = s[`unidade_${k}`] as string | null;
    partes.push(`${c.trim().toLowerCase()}=${v ?? ""}${u ? u.trim().toLowerCase() : ""}`);
  }
  return partes.sort().join(";");
}

/** Colunas verdes (calculadas) da aba ensaios: o banco recalcula, o importador ignora. */
const CALCULADAS_ENSAIOS = new Set([
  "litologia", "composicao_rocha", "calcita_pct", "acido", "conc_valor", "conc_unidade",
  "conc_pct", "conc_m", "aditivos", "temperatura_nominal_c", "omega_rad_s",
  "raiz_omega", "taxa_reacao_mol_m2_s",
]);

const ENSAIOS_TEXTO = ["id_ensaio", "id_referencia", "id_rocha", "id_sistema", "tipo_variavel",
  "metodo_coef_difusao", "metodo_quantificacao", "obtencao_dado", "cor_celula",
  "variavel_original", "sistema_original"];
const ENSAIOS_NUM = ["dim_h_in", "dim_d_in", "temperatura_c", "pressao_psi", "rotacao_rpm",
  "shear_rate_s1", "taxa_reacao_mol_cm2_s", "coef_difusao_cm2_s"];

/** Faixas de plausibilidade: fora delas vira AVISO (não bloqueia). */
const FAIXAS: Record<string, [number, number, string]> = {
  temperatura_c: [0, 200, "°C"],   // igual a v_lit_pendencias: acima disso costuma ser °F
  pressao_psi: [0, 15000, "psi"],
  rotacao_rpm: [0, 10000, "rpm"],
  taxa_reacao_mol_cm2_s: [1e-10, 1e-4, "mol/(cm²·s)"],
  coef_difusao_cm2_s: [1e-8, 1e-3, "cm²/s"],
};

export const ABAS_OBRIGATORIAS = ["ensaios"];

// ---------------------------------------------------------------------------
// Limpeza de células
// ---------------------------------------------------------------------------
export function texto(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isNaN(v)) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).replace(/\s+/g, " ").trim();
  return NULOS.has(s.toLowerCase()) ? null : s;
}

/** Célula -> número. Aceita '0,1', '6,37E-07', '1.000,5'. null = vazio; NaN = não é número. */
export function numero(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  let s = texto(v);
  if (s == null) return null;
  s = s.replace(/ /g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  s = s.replace(/\.$/, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}

function inteiro(v: unknown): number | null {
  const n = numero(v);
  return n == null || Number.isNaN(n) ? n : Math.round(n);
}

function normalizaLista(v: string | null, lista: string[]): string | null {
  if (v == null) return null;
  const alvo = v.trim().toLowerCase();
  return lista.find((p) => p.toLowerCase() === alvo) ?? null;
}

function normalizaLitologia(v: string | null): string | null {
  if (v == null) return null;
  return SINONIMOS_LITOLOGIA[v.toLowerCase()] ?? v;
}

function qualificador(composicao: string | null, mineral: string): string | null {
  if (!composicao) return null;
  const m = new RegExp(`\\[${mineral}\\]\\s*(>=|<=|≥|≤|>|<|=|~)`, "i").exec(composicao);
  if (!m) return null;
  return ({ "≥": ">=", "≤": "<=" } as Record<string, string>)[m[1]] ?? m[1];
}

/** Abas com nomes em minúsculas e colunas normalizadas (minúsculas, sem espaços nas pontas). */
function normalizarPlanilha(p: Planilha): Planilha {
  const saida: Planilha = {};
  for (const [nome, linhas] of Object.entries(p)) {
    saida[nome.trim().toLowerCase()] = linhas.map((l) =>
      Object.fromEntries(Object.entries(l).map(([k, v]) => [k.trim().toLowerCase(), v])));
  }
  // Se o arquivo tiver a tabela de ensaios em uma aba com outro nome (ex.: "Planilha1", "RDA"), mapeia para "ensaios"
  if (!saida["ensaios"]) {
    for (const [nome, linhas] of Object.entries(saida)) {
      if (linhas.length > 0 && "id_ensaio" in linhas[0] && ("taxa_reacao_mol_cm2_s" in linhas[0] || "rotacao_rpm" in linhas[0])) {
        saida["ensaios"] = linhas;
        if (nome !== "ensaios") delete saida[nome];
        break;
      }
    }
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Análise (não grava nada)
// ---------------------------------------------------------------------------
export function analisarBdd(planilhaBruta: Planilha): Analise {
  const p = normalizarPlanilha(planilhaBruta);
  const problemas: Problema[] = [];
  const add = (severidade: Severidade, aba: string, linha: number | null, id: string | null, campo: string, mensagem: string) =>
    problemas.push({ severidade, aba, linha, id, campo, mensagem });
  const erro = (...a: [string, number | null, string | null, string, string]) => add("ERRO", ...a);
  const aviso = (...a: [string, number | null, string | null, string, string]) => add("AVISO", ...a);
  const corr = (...a: [string, number | null, string | null, string, string]) => add("CORRIGIDO", ...a);
  const linhaExcel = (i: number) => i + 2;

  const abasFaltando = ABAS_OBRIGATORIAS.filter((a) => !p[a]);
  for (const a of abasFaltando) erro(a, null, null, "-", `aba obrigatória "${a}" não encontrada`);

  // ---- referencias -> publicacoes (categoria geral)
  const nDigitado = new Map<string, number>();
  const publicacoes: Registro[] = [];
  // referências do próprio LC PETRO não são publicações: os ensaios delas vão para as amostras
  const refsLab = new Set<string>();
  (p["referencias"] ?? []).forEach((r, i) => {
    const L = linhaExcel(i);
    const id = texto(r.id_referencia);
    if (!id) { erro("referencias", L, null, "id_referencia", "sem identificador"); return; }
    if (ehReferenciaLaboratorio(id, texto(r.autor))) { refsLab.add(id); return; }
    let autor = texto(r.autor);
    if (autor) {
      const novo = autor.replace(/\bat al\b/g, "et al").replace(/\bet al\./g, "et al");
      if (novo !== autor) { corr("referencias", L, id, "autor", `'${autor}' -> '${novo}'`); autor = novo; }
    } else erro("referencias", L, id, "autor", "autor vazio");
    let ano = texto(r.ano);
    if (ano?.endsWith(".0")) ano = ano.slice(0, -2);
    if (ano && !/^\d{4}$/.test(ano)) aviso("referencias", L, id, "ano", `'${ano}' parece agrupar várias publicações; o ideal é uma linha por artigo`);
    const nd = inteiro(r.n_ensaios);
    if (nd != null && !Number.isNaN(nd)) nDigitado.set(id, nd);
    publicacoes.push({
      _linha: L, id_referencia: id, categoria: "geral", autor, ano,
      titulo: texto(r.titulo), periodico: texto(r.periodico), doi: texto(r.doi),
    });
  });

  // ---- grafias do mesmo componente (acento/maiúscula) em fluidos_prop e sistemas_acidos viram uma só
  const nomesFluidos = (p["fluidos_prop"] ?? []).map((r) => texto(r.componente)).filter((x): x is string => !!x);
  const nomesSistemas = (p["sistemas_acidos"] ?? []).flatMap((r) => [1, 2, 3, 4].map((k) => texto(r[`componente_${k}`]))).filter((x): x is string => !!x);
  const grafias = unificarGrafias([...nomesFluidos, ...nomesSistemas], nomesFluidos);
  const padraoComp = (v: string | null) => (v == null ? null : grafias.mapa.get(v.replace(/\s+/g, " ").trim()) ?? normalizaComponente(v));
  for (const [a, b] of grafias.parecidos)
    aviso("sistemas_acidos", null, null, "componente", `'${a}' e '${b}' são parecidos: mesmo componente com erro de digitação? Se for, corrija a planilha (o importador não troca sozinho)`);

  // ---- fluidos_prop
  const fluidos: Registro[] = [];
  (p["fluidos_prop"] ?? []).forEach((r, i) => {
    const L = linhaExcel(i);
    const compOrig = texto(r.componente);
    if (!compOrig) return;
    const comp = padraoComp(compOrig)!;
    if (comp !== compOrig) corr("fluidos_prop", L, comp, "componente", `'${compOrig}' -> '${comp}'`);
    const d: Registro = { _linha: L, componente: comp, observacao: texto(r.observacao) };
    for (const c of ["massa_molar_g_mol", "coef_densidade"]) {
      const n = numero(r[c]);
      if (Number.isNaN(n)) { erro("fluidos_prop", L, comp, c, `não é número: ${String(r[c])}`); d[c] = null; } else d[c] = n;
    }
    const neq = inteiro(r.n_equivalentes);
    if (Number.isNaN(neq)) { erro("fluidos_prop", L, comp, "n_equivalentes", "não é número"); d.n_equivalentes = null; } else d.n_equivalentes = neq;
    fluidos.push(d);
  });
  const fluidosOk = new Set(fluidos.map((f) => f.componente as string));

  // ---- rochas -> lit_rochas
  const rochas: Registro[] = [];
  (p["rochas"] ?? []).forEach((r, i) => {
    const L = linhaExcel(i);
    const id = texto(r.id_rocha);
    if (!id) { erro("rochas", L, null, "id_rocha", "sem identificador"); return; }
    const litOrig = texto(r.litologia);
    const lit = normalizaLitologia(litOrig);
    if (lit !== litOrig) corr("rochas", L, id, "litologia", `'${litOrig}' -> '${lit}'`);
    if (!lit) erro("rochas", L, id, "litologia", "litologia vazia");
    const comp = texto(r.composicao_texto);
    const d: Registro = { _linha: L, id_rocha: id, litologia: lit, composicao_texto: comp };
    for (const c of ["calcita_pct", "dolomita_pct", "razao_ca_mg"]) {
      const n = numero(r[c]);
      if (Number.isNaN(n)) { erro("rochas", L, id, c, `não é número: ${String(r[c])}`); d[c] = null; } else d[c] = n;
    }
    d.calcita_qualificador = d.calcita_pct != null ? qualificador(comp, "calcita") : null;
    d.dolomita_qualificador = d.dolomita_pct != null ? qualificador(comp, "dolomita") : null;
    if (comp == null && d.calcita_pct == null && d.dolomita_pct == null && d.razao_ca_mg == null)
      aviso("rochas", L, id, "composicao_texto", "composição não informada pela fonte");
    rochas.push(d);
  });

  // ---- sistemas_acidos
  const sistemas: Registro[] = [];
  (p["sistemas_acidos"] ?? []).forEach((r, i) => {
    const L = linhaExcel(i);
    const id = texto(r.id_sistema);
    if (!id) { erro("sistemas_acidos", L, null, "id_sistema", "sem identificador"); return; }
    const d: Registro = { _linha: L, id_sistema: id, nome_sistema: texto(r.nome_sistema), composicao_original: texto(r.composicao_original) };
    for (let k = 1; k <= 4; k++) {
      const cOrig = texto(r[`componente_${k}`]);
      const c = padraoComp(cOrig);
      if (c !== cOrig) corr("sistemas_acidos", L, id, `componente_${k}`, `'${cOrig}' -> '${c}'`);
      d[`componente_${k}`] = c;
      const n = numero(r[`valor_${k}`]);
      if (Number.isNaN(n)) { erro("sistemas_acidos", L, id, `valor_${k}`, `não é número: ${String(r[`valor_${k}`])}`); d[`valor_${k}`] = null; } else d[`valor_${k}`] = n;
      let u = texto(r[`unidade_${k}`]);
      if (u != null) {
        const un = UNIDADES_CONC[u.toLowerCase()] ?? u;
        if (un !== u) corr("sistemas_acidos", L, id, `unidade_${k}`, `'${u}' -> '${un}'`);
        if (un === "%") aviso("sistemas_acidos", L, id, `unidade_${k}`, "'%' sem dizer se é em massa (wt%) ou volume (vol%): conferir na fonte");
        u = un;
      }
      d[`unidade_${k}`] = u;
    }
    if (!d.nome_sistema) d.nome_sistema = d.componente_1 ?? id;
    if (!d.componente_1) erro("sistemas_acidos", L, id, "componente_1", "ácido principal vazio");
    else {
      if (!fluidosOk.has(d.componente_1 as string))
        aviso("sistemas_acidos", L, id, "componente_1", `'${d.componente_1}' não está em fluidos_prop: conc_M e conc_pct ficam vazios`);
      if (!["N", "M", "wt%"].includes(d.unidade_1 as string))
        aviso("sistemas_acidos", L, id, "unidade_1", `unidade '${d.unidade_1}' não converte para mol/L`);
    }
    sistemas.push(d);
  });

  // sistemas com a mesma composição cadastrados com códigos diferentes (não junta: os ensaios apontam para os dois)
  const porAssinatura = new Map<string, Registro[]>();
  for (const sis of sistemas) {
    const a = assinaturaSistema(sis);
    if (!a) continue;
    porAssinatura.set(a, [...(porAssinatura.get(a) ?? []), sis]);
  }
  for (const grupo of porAssinatura.values()) {
    if (grupo.length < 2) continue;
    for (const sis of grupo.slice(1))
      aviso("sistemas_acidos", sis._linha, sis.id_sistema as string, "composicao",
        `mesma composição de ${grupo[0].id_sistema}: sistema repetido com outro código (mantido; no painel aparece em "sistemas repetidos")`);
  }

  // ---- listas de métodos (aba listas) -> lit_listas
  const listas: Registro[] = [];
  const vistosLista = new Set<string>();
  for (const [col, lista] of [["metodo_quantificacao", "metodo_quantificacao"], ["metodo_coef_difusao", "metodo_coef_difusao"]] as const) {
    (p["listas"] ?? []).forEach((l, i) => {
      let v = texto(l[col]);
      if (!v) return;
      if (lista === "metodo_quantificacao") v = v.replace(/\s*\/\s*/g, " / ");
      const chave = `${lista}|${v.toLowerCase()}`;
      if (vistosLista.has(chave)) return;
      vistosLista.add(chave);
      listas.push({ _linha: linhaExcel(i), lista, valor: v, ordem: listas.filter((x) => x.lista === lista).length + 1 });
    });
  }

  // ---- litologias: lista oficial (aba listas) + as que aparecem em rochas
  const lits: string[] = [];
  for (const l of p["listas"] ?? []) {
    const v = normalizaLitologia(texto(l.litologia));
    if (v && !lits.includes(v)) lits.push(v);
  }
  for (const r of rochas) {
    const v = r.litologia as string | null;
    if (v && !lits.includes(v)) {
      aviso("rochas", r._linha, r.id_rocha as string, "litologia", `'${v}' não está na lista de litologias; será criada`);
      lits.push(v);
    }
  }
  const litologias: Registro[] = lits.map((nome) => ({ _linha: 0, nome }));

  // ---- ensaios -> lit_dados_rda
  const refsOk = new Set(publicacoes.map((x) => x.id_referencia as string));
  const rochasOk = new Set(rochas.map((x) => x.id_rocha as string));
  const sistemasOk = new Set(sistemas.map((x) => x.id_sistema as string));
  const litsSet = new Set(litologias.map((x) => x.nome as string));

  const semAbaRefs = !(p["referencias"] ?? []).length;
  const semAbaRochas = !(p["rochas"] ?? []).length;
  const semAbaSistemas = !(p["sistemas_acidos"] ?? []).length;

  // Se a planilha trouxer apenas a aba "ensaios" (sem abas separadas de referencias, rochas ou sistemas_acidos),
  // preenche os catálogos automaticamente a partir das colunas (incluindo as colunas verdes calculadas pela planilha):
  (p["ensaios"] ?? []).forEach((r, i) => {
    const L = linhaExcel(i);
    const ehLab = texto(r.amostra ?? r.codigo_amostra) != null || refsLab.has(texto(r.id_referencia) as string);
    const idRef = texto(r.id_referencia);
    if (semAbaRefs && !ehLab && idRef && !refsOk.has(idRef)) {
      const anoNum = inteiro(r.ano);
      publicacoes.push({
        _linha: L,
        id_referencia: idRef,
        categoria: "geral",
        autor: texto(r.referencia_autor ?? r.autor) ?? idRef,
        ano: anoNum != null && !Number.isNaN(anoNum) ? String(anoNum) : texto(r.ano),
        titulo: null,
        periodico: null,
        doi: null,
      });
      refsOk.add(idRef);
    }
    const idRocha = texto(r.id_rocha);
    const litVerde = normalizaLitologia(texto(r.litologia));
    if (semAbaRochas && litVerde && !litsSet.has(litVerde)) {
      litologias.push({ _linha: L, nome: litVerde });
      litsSet.add(litVerde);
    }
    if (semAbaRochas && !ehLab && idRocha && !rochasOk.has(idRocha) && litVerde) {
      const compVerde = texto(r.composicao_rocha ?? r.composicao_texto);
      const calcVerde = numero(r.calcita_pct);
      const calcVal = calcVerde != null && !Number.isNaN(calcVerde) ? calcVerde : null;
      rochas.push({
        _linha: L,
        id_rocha: idRocha,
        litologia: litVerde,
        composicao_texto: compVerde,
        calcita_pct: calcVal,
        dolomita_pct: null,
        razao_ca_mg: null,
        calcita_qualificador: calcVal != null ? qualificador(compVerde, "calcita") : null,
        dolomita_qualificador: null,
      });
      rochasOk.add(idRocha);
    }
    const idSis = texto(r.id_sistema);
    const acidoVerde = padraoComp(texto(r.acido));
    if (semAbaSistemas && idSis && !sistemasOk.has(idSis) && acidoVerde) {
      const valVerde = numero(r.conc_valor);
      const unBruta = texto(r.conc_unidade);
      const unVerde = unBruta != null ? UNIDADES_CONC[unBruta.toLowerCase()] ?? unBruta : null;
      const aditVerde = texto(r.aditivos);
      sistemas.push({
        _linha: L,
        id_sistema: idSis,
        nome_sistema: texto(r.sistema_original) ?? acidoVerde,
        composicao_original: texto(r.sistema_original),
        componente_1: acidoVerde,
        valor_1: valVerde != null && !Number.isNaN(valVerde) ? valVerde : null,
        unidade_1: unVerde,
        componente_2: aditVerde,
        valor_2: null,
        unidade_2: null,
        componente_3: null,
        valor_3: null,
        unidade_3: null,
        componente_4: null,
        valor_4: null,
        unidade_4: null,
      });
      sistemasOk.add(idSis);
    }
  });

  const colunasEnsaios = new Set(Object.keys((p["ensaios"] ?? [])[0] ?? {}));
  const colunasIgnoradas = [...colunasEnsaios].filter((c) => CALCULADAS_ENSAIOS.has(c)).sort();
  const vistos = new Map<string, number>();
  const dados: Registro[] = [];
  const laboratorio: Registro[] = [];

  (p["ensaios"] ?? []).forEach((r, i) => {
    const L = linhaExcel(i);
    const idPlanilha = texto(r.id_ensaio);
    const ehLab = texto(r.amostra ?? r.codigo_amostra) != null || refsLab.has(texto(r.id_referencia) as string);
    const id = ehLab ? idPlanilha : codigoLiteratura(idPlanilha);
    if (!id) { erro("ensaios", L, null, "id_ensaio", "sem identificador"); return; }
    if (vistos.has(id)) { erro("ensaios", L, id, "id_ensaio", `repetido (já usado na linha ${vistos.get(id)})`); return; }
    vistos.set(id, L);

    const d: Registro = { _linha: L };
    let erroNaTaxa = false;
    for (const c of ENSAIOS_TEXTO) d[c] = texto(r[c]);
    d.id_ensaio = id;
    for (const c of ENSAIOS_NUM) {
      const n = numero(r[c]);
      if (Number.isNaN(n)) { erro("ensaios", L, id, c, `não é número: ${String(r[c])}`); d[c] = null; if (c === "taxa_reacao_mol_cm2_s") erroNaTaxa = true; }
      else d[c] = n;
    }
    const ano = inteiro(r.ano);
    if (Number.isNaN(ano)) { aviso("ensaios", L, id, "ano", `ano inválido: ${String(r.ano)}`); d.ano = null; } else d.ano = ano;

    // ensaio do próprio laboratório: tem o código da amostra, ou a referência é do LC PETRO
    const amostra = texto(r.amostra ?? r.codigo_amostra);
    const doLaboratorio = amostra != null || refsLab.has(d.id_referencia as string);
    if (doLaboratorio) {
      if (!amostra) erro("ensaios", L, id, "amostra", `referência ${d.id_referencia} é do LC PETRO: informe na coluna "amostra" o código da amostra (ex.: IL076)`);
    } else {
      if (!d.id_referencia) erro("ensaios", L, id, "id_referencia", "medida sem referência");
      else if (!refsOk.has(d.id_referencia as string)) erro("ensaios", L, id, "id_referencia", `'${d.id_referencia}' não existe em referencias`);
      if (!rochasOk.has(d.id_rocha as string)) erro("ensaios", L, id, "id_rocha", `'${d.id_rocha}' não existe em rochas`);
    }
    if (!sistemasOk.has(d.id_sistema as string)) erro("ensaios", L, id, "id_sistema", `'${d.id_sistema}' não existe em sistemas_acidos`);

    for (const [campo, lista] of [["tipo_variavel", LISTA_TIPO_VARIAVEL], ["obtencao_dado", LISTA_OBTENCAO]] as const) {
      const v = d[campo] as string | null;
      if (v == null) continue;
      const ok = normalizaLista(v, lista);
      if (ok == null) erro("ensaios", L, id, campo, `'${v}' não está na lista (${lista.join("; ")})`);
      else { if (ok !== v) corr("ensaios", L, id, campo, `'${v}' -> '${ok}'`); d[campo] = ok; }
    }
    if (d.metodo_quantificacao) {
      const novo = (d.metodo_quantificacao as string).replace(/\s*\/\s*/g, " / ");
      if (novo !== d.metodo_quantificacao) { corr("ensaios", L, id, "metodo_quantificacao", `'${d.metodo_quantificacao}' -> '${novo}'`); d.metodo_quantificacao = novo; }
    }

    d.origem_registro = "planilha";
    if (d.tipo_variavel === "rotação (RDA)" && d.rotacao_rpm == null) aviso("ensaios", L, id, "rotacao_rpm", "tipo é rotação, mas rotação está vazia");
    if (d.tipo_variavel === "taxa de cisalhamento" && d.shear_rate_s1 == null) aviso("ensaios", L, id, "shear_rate_s1", "tipo é cisalhamento, mas o valor está vazio");
    if (d.taxa_reacao_mol_cm2_s == null && !erroNaTaxa) aviso("ensaios", L, id, "taxa_reacao_mol_cm2_s", "sem taxa de reação");
    for (const [c, [lo, hi, un]] of Object.entries(FAIXAS)) {
      const v = d[c] as number | null;
      if (v != null && (v < lo || v > hi)) aviso("ensaios", L, id, c, `${v} ${un} fora da faixa esperada (${lo}–${hi}); conferir unidade${c === "temperatura_c" ? " (°F?)" : ""}`);
    }
    if (doLaboratorio) {
      // colunas de analise_rda (as calculadas — ω, √ω, taxa em m², T nominal — o banco faz)
      laboratorio.push({
        _linha: L, _amostra: amostra, id_ensaio_planilha: id,
        data_ensaio: texto(r.data_ensaio), serie: texto(r.serie), id_sistema: d.id_sistema,
        tipo_variavel: d.tipo_variavel ?? (d.shear_rate_s1 != null ? "taxa de cisalhamento" : "rotação (RDA)"),
        rotacao_rpm: d.rotacao_rpm, shear_rate_s1: d.shear_rate_s1, pressao_psi: d.pressao_psi, temperatura_c: d.temperatura_c,
        dim_h_in: d.dim_h_in, dim_d_in: d.dim_d_in, taxa_reacao_mol_cm2_s: d.taxa_reacao_mol_cm2_s,
        coef_difusao_cm2_s: d.coef_difusao_cm2_s, metodo_quantificacao: d.metodo_quantificacao,
        metodo_coef_difusao: d.metodo_coef_difusao, responsavel: texto(r.responsavel),
        observacoes: texto(r.observacao ?? r.observacoes),
      });
      return;
    }
    dados.push(d);
  });

  // métodos usados nas medidas que não estão na aba listas entram na lista (para o formulário oferecer)
  for (const d of dados) {
    for (const lista of ["metodo_quantificacao", "metodo_coef_difusao"] as const) {
      const v = d[lista] as string | null;
      if (!v || vistosLista.has(`${lista}|${v.toLowerCase()}`)) continue;
      vistosLista.add(`${lista}|${v.toLowerCase()}`);
      listas.push({ _linha: 0, lista, valor: v, ordem: listas.filter((x) => x.lista === lista).length + 1 });
    }
  }

  // dimensão do disco preenchida em sequência (1, 2, 3…) por arrasto no Excel, dentro da mesma referência
  const porRef = new Map<string, Registro[]>();
  for (const d of dados) porRef.set(d.id_referencia as string, [...(porRef.get(d.id_referencia as string) ?? []), d]);
  for (const lista of porRef.values()) {
    const ord = [...lista].sort((a, b) => String(a.id_ensaio).localeCompare(String(b.id_ensaio)));
    for (const campo of ["dim_h_in", "dim_d_in"]) {
      let i = 0;
      while (i < ord.length) {
        let j = i;
        while (j + 1 < ord.length && Number.isInteger(ord[j][campo]) && (ord[j + 1][campo] as number) - (ord[j][campo] as number) === 1) j++;
        if (j - i + 1 >= 3) {
          const a = ord[i], b = ord[j];
          aviso("ensaios", a._linha, a.id_ensaio as string, campo,
            `${campo} vai de ${a[campo]} a ${b[campo]} subindo de 1 em 1 de ${a.id_ensaio} a ${b.id_ensaio} (${j - i + 1} medidas): ` +
            "parece preenchimento arrastado no Excel; o valor certo provavelmente é o mesmo em todas — conferir na fonte");
          i = j + 1;
        } else i++;
      }
    }
  }

  // ---- qualidade -> lit_qualidade (anotações de conferência da equipe)
  const qualidade: Registro[] = [];
  const idsEnsaio = new Set(dados.map((d) => d.id_ensaio as string));
  (p["qualidade"] ?? []).forEach((r, i) => {
    const L = linhaExcel(i);
    const campo = texto(r.campo);
    if (!campo) return;
    let idE = codigoLiteratura(texto(r.id_ensaio));
    if (idE && !idsEnsaio.has(idE)) { aviso("qualidade", L, idE, "id_ensaio", `'${idE}' não existe em ensaios: a anotação vale para o banco todo`); idE = null; }
    qualidade.push({
      _linha: L, id_ensaio: idE, campo, valor_registrado: texto(r.valor_registrado),
      valor_calculado: texto(r.valor_calculado), observacao: texto(r.observacao), origem: "planilha",
    });
  });

  // n_ensaios digitado x contado
  const contagem = new Map<string, number>();
  for (const d of dados) contagem.set(d.id_referencia as string, (contagem.get(d.id_referencia as string) ?? 0) + 1);
  for (const pub of publicacoes) {
    const dig = nDigitado.get(pub.id_referencia as string);
    const real = contagem.get(pub.id_referencia as string) ?? 0;
    if (dig != null && dig !== real)
      aviso("referencias", pub._linha, pub.id_referencia as string, "n_ensaios", `digitado ${dig}, mas há ${real} ensaios; no banco o número é contado automaticamente`);
  }

  const dadosBdd: DadosBdd = {
    publicacoes, fluidos_prop: fluidos, litologias, lit_listas: listas, lit_rochas: rochas, sistemas_acidos: sistemas,
    lit_dados_rda: dados, lit_qualidade: qualidade, analise_rda: laboratorio,
  };
  const conta = (s: Severidade) => problemas.filter((x) => x.severidade === s).length;
  return {
    dados: dadosBdd,
    problemas,
    contagens: Object.fromEntries(Object.entries(dadosBdd).map(([k, v]) => [k, v.length])) as Record<keyof DadosBdd, number>,
    colunasIgnoradas,
    abasEncontradas: Object.keys(p),
    abasFaltando,
    erros: conta("ERRO"),
    avisos: conta("AVISO"),
    corrigidos: conta("CORRIGIDO"),
  };
}

// ---------------------------------------------------------------------------
// Gravação (upsert em lotes, na ordem das chaves estrangeiras)
// ---------------------------------------------------------------------------
const ORDEM: [keyof DadosBdd, string, string][] = [
  ["publicacoes", "publicacoes", "id_referencia"],
  ["fluidos_prop", "fluidos_prop", "componente"],
  ["litologias", "litologias", "nome"],
  ["lit_listas", "lit_listas", "lista,valor"],
  ["lit_rochas", "lit_rochas", "id_rocha"],
  ["sistemas_acidos", "sistemas_acidos", "id_sistema"],
  ["lit_dados_rda", "lit_dados_rda", "id_ensaio"],
  ["lit_qualidade", "lit_qualidade", "chave"],
];

/** Mapa aba-da-planilha de onde veio cada tabela (para cruzar com os problemas). */
const ABA_DE: Record<keyof DadosBdd, string> = {
  publicacoes: "referencias", fluidos_prop: "fluidos_prop", litologias: "listas", lit_listas: "listas",
  lit_rochas: "rochas", sistemas_acidos: "sistemas_acidos", lit_dados_rda: "ensaios", lit_qualidade: "qualidade",
  analise_rda: "ensaios",
};

/** Código da amostra (como escrito na planilha) -> id no banco. Só acha as amostras que o usuário vê. */
async function resolverAmostras(sb: SupabaseClient, codigos: string[]): Promise<Map<string, string>> {
  const chave = (c: string) => c.trim().toUpperCase();
  const pedidos = [...new Set(codigos.flatMap((c) => [c.trim(), chave(c)]))];
  const mapa = new Map<string, string>();
  for (let i = 0; i < pedidos.length; i += 200) {
    const { data, error } = await sb.from("amostras").select("id, codigo").in("codigo", pedidos.slice(i, i + 200));
    if (error) throw new Error(`Falha ao procurar as amostras: ${error.message}`);
    for (const a of (data ?? []) as { id: string; codigo: string }[]) mapa.set(chave(a.codigo), a.id);
  }
  return new Map(codigos.map((c) => [c, mapa.get(chave(c))]).filter((x): x is [string, string] => x[1] != null));
}

/** Ensaios do laboratório prontos para analise_rda (amostra_id no lugar do código). Os sem amostra no banco ficam em "faltam". */
async function ensaiosDoLaboratorio(sb: SupabaseClient, linhas: Registro[]) {
  const ids = await resolverAmostras(sb, linhas.map((l) => String(l._amostra)));
  const prontos: Record<string, unknown>[] = [];
  const faltam: string[] = [];
  for (const { _linha, _amostra, ...resto } of linhas) {
    void _linha;
    const amostraId = ids.get(String(_amostra));
    if (amostraId) prontos.push({ amostra_id: amostraId, ...resto });
    else faltam.push(`${resto.id_ensaio_planilha} (${_amostra})`);
  }
  return { prontos, faltam };
}

export interface OpcoesGravacao {
  /** grava o que está certo e deixa de fora as linhas com ERRO */
  pularErros?: boolean;
  tamanhoLote?: number;
  aoProgresso?: (tabela: string, gravadas: number, total: number) => void;
}

export async function gravarBdd(sb: SupabaseClient, analise: Analise, op: OpcoesGravacao = {}) {
  if (analise.erros > 0 && !op.pularErros) {
    throw new Error(`Há ${analise.erros} erro(s). Corrija a planilha ou grave pulando as linhas com erro.`);
  }
  const linhasComErro = new Map<string, Set<number>>();
  for (const pr of analise.problemas) {
    if (pr.severidade !== "ERRO" || pr.linha == null) continue;
    if (!linhasComErro.has(pr.aba)) linhasComErro.set(pr.aba, new Set());
    linhasComErro.get(pr.aba)!.add(pr.linha);
  }
  const semErro = (chave: keyof DadosBdd) =>
    analise.dados[chave].filter((r) => !linhasComErro.get(ABA_DE[chave])?.has(r._linha));

  const filtrado = Object.fromEntries(ORDEM.map(([k]) => [k, semErro(k)])) as unknown as DadosBdd;
  // medidas que dependem de um catálogo que ficou de fora também saem
  const ok = (k: keyof DadosBdd, col: string) => new Set(filtrado[k].map((r) => r[col]));
  const rOk = ok("lit_rochas", "id_rocha"), sOk = ok("sistemas_acidos", "id_sistema"), pOk = ok("publicacoes", "id_referencia");
  filtrado.lit_dados_rda = filtrado.lit_dados_rda.filter((d) => rOk.has(d.id_rocha) && sOk.has(d.id_sistema) && pOk.has(d.id_referencia));

  const lote = op.tamanhoLote ?? 500;
  const gravadas: Record<string, number> = {};
  for (const [chave, tabela, pk] of ORDEM) {
    const linhas = filtrado[chave].map(({ _linha, ...resto }) => { void _linha; return resto; });
    gravadas[tabela] = 0;
    for (let i = 0; i < linhas.length; i += lote) {
      const parte = linhas.slice(i, i + lote);
      const { error } = await sb.from(tabela).upsert(parte, { onConflict: pk });
      if (error) {
        throw new Error(`Falha ao gravar ${tabela} (linhas ${i + 1}–${i + parte.length}): ${error.message}` +
          (error.code === "42501" ? " — seu usuário precisa ser editor ou administrador." : ""));
      }
      gravadas[tabela] += parte.length;
      op.aoProgresso?.(tabela, gravadas[tabela], linhas.length);
    }
  }

  // ensaios do próprio laboratório -> ficha da amostra (analise_rda), depois dos sistemas ácidos
  const lab = semErro("analise_rda").filter((d) => sOk.has(d.id_sistema));
  let laboratorioSemAmostra: string[] = [];
  if (lab.length) {
    const { prontos, faltam } = await ensaiosDoLaboratorio(sb, lab);
    laboratorioSemAmostra = faltam;
    gravadas.analise_rda = 0;
    for (let i = 0; i < prontos.length; i += lote) {
      const parte = prontos.slice(i, i + lote);
      const { error } = await sb.from("analise_rda").upsert(parte, { onConflict: "id_ensaio_planilha" });
      if (error) {
        throw new Error(`Falha ao gravar analise_rda (ensaios do LC PETRO ${i + 1}–${i + parte.length}): ${error.message}` +
          (error.code === "42501" ? " — seu usuário precisa ser editor do projeto de cada amostra." : ""));
      }
      gravadas.analise_rda += parte.length;
      op.aoProgresso?.("analise_rda", gravadas.analise_rda, prontos.length);
    }
  }
  return {
    gravadas,
    deixadasDeFora: analise.dados.lit_dados_rda.length - filtrado.lit_dados_rda.length,
    /** ensaios do laboratório não gravados (com erro, sistema de fora ou amostra que não está no banco) */
    laboratorioDeFora: analise.dados.analise_rda.length - (gravadas.analise_rda ?? 0),
    laboratorioSemAmostra,
  };
}

// ---------------------------------------------------------------------------
// Conferência com o banco (não grava): o que é novo, o que muda e o que só existe no banco
// ---------------------------------------------------------------------------
export interface Diferenca { id: string; campo: string; banco: unknown; planilha: unknown }
export interface ConferenciaTabela {
  tabela: string;
  novos: string[];
  alterados: { id: string; campos: Diferenca[] }[];
  iguais: number;
  /** ids que estão no banco e não na planilha (a importação NUNCA apaga; ficam como estão) */
  soNoBanco: string[];
  /** só em analise_rda: ensaios do laboratório cuja amostra não está no banco (ficam de fora) */
  semAmostra?: string[];
}

const igual = (a: unknown, b: unknown) => {
  if ((a == null || a === "") && (b == null || b === "")) return true;
  if (typeof a === "number" || typeof b === "number") {
    const x = Number(a), y = Number(b);
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
  }
  return String(a) === String(b);
};

export async function conferirBddNoBanco(sb: SupabaseClient, analise: Analise): Promise<ConferenciaTabela[]> {
  const saida: ConferenciaTabela[] = [];
  for (const [chave, tabela, pk] of ORDEM) {
    if (chave === "lit_qualidade" || chave === "lit_listas") continue;   // anotações e listas: só acrescenta
    const linhas = analise.dados[chave];
    const cols = [...new Set(linhas.flatMap((r) => Object.keys(r)).filter((c) => c !== "_linha"))];
    const banco = new Map<string, Record<string, unknown>>();
    // tudo o que existe no banco (as tabelas da literatura têm centenas de linhas, não milhares)
    for (let de = 0; ; de += 1000) {
      const { data, error } = await sb.from(tabela).select(cols.join(",")).range(de, de + 999);
      if (error) throw new Error(`Falha ao ler ${tabela}: ${error.message}`);
      for (const r of (data ?? []) as unknown as Record<string, unknown>[]) banco.set(String(r[pk]), r);
      if (!data || data.length < 1000) break;
    }
    const r: ConferenciaTabela = { tabela, novos: [], alterados: [], iguais: 0, soNoBanco: [] };
    const naPlanilha = new Set<string>();
    for (const l of linhas) {
      const id = String(l[pk]);
      naPlanilha.add(id);
      const b = banco.get(id);
      if (!b) { r.novos.push(id); continue; }
      const campos = cols.filter((c) => c !== pk && !igual(b[c], l[c])).map((c) => ({ id, campo: c, banco: b[c], planilha: l[c] }));
      if (campos.length) r.alterados.push({ id, campos }); else r.iguais++;
    }
    r.soNoBanco = [...banco.keys()].filter((id) => !naPlanilha.has(id)).sort();
    saida.push(r);
  }

  // ensaios do laboratório: compara com o que já veio da planilha antes (por id_ensaio_planilha)
  if (analise.dados.analise_rda.length) {
    const { prontos, faltam } = await ensaiosDoLaboratorio(sb, analise.dados.analise_rda);
    const cols = [...new Set(prontos.flatMap((r) => Object.keys(r)))];
    const banco = new Map<string, Record<string, unknown>>();
    for (let de = 0; ; de += 1000) {
      const { data, error } = await sb.from("analise_rda").select(cols.join(",") || "id_ensaio_planilha")
        .not("id_ensaio_planilha", "is", null).range(de, de + 999);
      if (error) {
        throw new Error(/id_ensaio_planilha/.test(error.message)
          ? "Rode a migração 023 no Supabase (20261116000023_rda_laboratorio_planilha.sql) para importar ensaios do LC PETRO."
          : `Falha ao ler analise_rda: ${error.message}`);
      }
      for (const r of (data ?? []) as unknown as Record<string, unknown>[]) banco.set(String(r.id_ensaio_planilha), r);
      if (!data || data.length < 1000) break;
    }
    const r: ConferenciaTabela = { tabela: "analise_rda", novos: [], alterados: [], iguais: 0, soNoBanco: [], semAmostra: faltam };
    const naPlanilha = new Set<string>();
    for (const l of prontos) {
      const id = String(l.id_ensaio_planilha);
      naPlanilha.add(id);
      const b = banco.get(id);
      if (!b) { r.novos.push(id); continue; }
      const campos = cols.filter((c) => c !== "id_ensaio_planilha" && !igual(b[c], l[c])).map((c) => ({ id, campo: c, banco: b[c], planilha: l[c] }));
      if (campos.length) r.alterados.push({ id, campos }); else r.iguais++;
    }
    r.soNoBanco = [...banco.keys()].filter((id) => !naPlanilha.has(id)).sort();
    saida.push(r);
  }
  return saida;
}
