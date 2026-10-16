// =============================================================================
// Importador da planilha BDD_LCPETRO_Reatividade (literatura geral) — versão
// TypeScript para rodar no navegador (painel gerencial). Mesmas regras do
// importador Python em Dashboard-Back/importador/importar.py.
//
// Fluxo na tela:
//   1. lerArquivo(file)            -> Planilha  (todas as abas)
//   2. analisarBdd(planilha)       -> Analise   (contagens, problemas, dados limpos)
//      mostrar prévia: contagens por tabela + lista de ERROS / AVISOS / CORRIGIDOS
//   3. gravarBdd(supabase, analise, { pularErros, aoProgresso })
//      grava na ordem certa (catálogos antes das medidas), em lotes, com upsert.
//
// Nada é gravado no passo 2. Reimportar é seguro: mesmo id = atualiza.
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
  lit_rochas: Registro[];
  sistemas_acidos: Registro[];
  lit_dados_rda: Registro[];
}

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
  "n": "N", "m": "M", "wt%": "wt%", "wt %": "wt%", "%wt": "wt%",
  "vol%": "vol%", "vol %": "vol%", "%vol": "vol%", "mm": "mM",
};

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
  temperatura_c: [0, 250, "°C"],
  pressao_psi: [0, 15000, "psi"],
  rotacao_rpm: [0, 10000, "rpm"],
  taxa_reacao_mol_cm2_s: [1e-10, 1e-4, "mol/(cm²·s)"],
  coef_difusao_cm2_s: [1e-8, 1e-3, "cm²/s"],
};

export const ABAS_OBRIGATORIAS = ["ensaios", "rochas", "sistemas_acidos"];

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

/** Célula -> número. Aceita '0,1', '5,24E-07', '1.000,5'. null = vazio; NaN = não é número. */
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
  (p["referencias"] ?? []).forEach((r, i) => {
    const L = linhaExcel(i);
    const id = texto(r.id_referencia);
    if (!id) { erro("referencias", L, null, "id_referencia", "sem identificador"); return; }
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

  // ---- fluidos_prop
  const fluidos: Registro[] = [];
  (p["fluidos_prop"] ?? []).forEach((r, i) => {
    const L = linhaExcel(i);
    const comp = texto(r.componente);
    if (!comp) return;
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
      d[`componente_${k}`] = texto(r[`componente_${k}`]);
      const n = numero(r[`valor_${k}`]);
      if (Number.isNaN(n)) { erro("sistemas_acidos", L, id, `valor_${k}`, `não é número: ${String(r[`valor_${k}`])}`); d[`valor_${k}`] = null; } else d[`valor_${k}`] = n;
      let u = texto(r[`unidade_${k}`]);
      if (u != null) {
        const un = UNIDADES_CONC[u.toLowerCase()] ?? u;
        if (un !== u) corr("sistemas_acidos", L, id, `unidade_${k}`, `'${u}' -> '${un}'`);
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
  const colunasEnsaios = new Set(Object.keys((p["ensaios"] ?? [])[0] ?? {}));
  const colunasIgnoradas = [...colunasEnsaios].filter((c) => CALCULADAS_ENSAIOS.has(c)).sort();
  const vistos = new Map<string, number>();
  const dados: Registro[] = [];

  (p["ensaios"] ?? []).forEach((r, i) => {
    const L = linhaExcel(i);
    const id = texto(r.id_ensaio);
    if (!id) { erro("ensaios", L, null, "id_ensaio", "sem identificador"); return; }
    if (vistos.has(id)) { erro("ensaios", L, id, "id_ensaio", `repetido (já usado na linha ${vistos.get(id)})`); return; }
    vistos.set(id, L);

    const d: Registro = { _linha: L };
    let erroNaTaxa = false;
    for (const c of ENSAIOS_TEXTO) d[c] = texto(r[c]);
    for (const c of ENSAIOS_NUM) {
      const n = numero(r[c]);
      if (Number.isNaN(n)) { erro("ensaios", L, id, c, `não é número: ${String(r[c])}`); d[c] = null; if (c === "taxa_reacao_mol_cm2_s") erroNaTaxa = true; }
      else d[c] = n;
    }
    const ano = inteiro(r.ano);
    if (Number.isNaN(ano)) { aviso("ensaios", L, id, "ano", `ano inválido: ${String(r.ano)}`); d.ano = null; } else d.ano = ano;

    if (!d.id_referencia) erro("ensaios", L, id, "id_referencia", "medida sem referência");
    else if (!refsOk.has(d.id_referencia as string)) erro("ensaios", L, id, "id_referencia", `'${d.id_referencia}' não existe em referencias`);
    if (!rochasOk.has(d.id_rocha as string)) erro("ensaios", L, id, "id_rocha", `'${d.id_rocha}' não existe em rochas`);
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

    if (d.tipo_variavel === "rotação (RDA)" && d.rotacao_rpm == null) aviso("ensaios", L, id, "rotacao_rpm", "tipo é rotação, mas rotação está vazia");
    if (d.tipo_variavel === "taxa de cisalhamento" && d.shear_rate_s1 == null) aviso("ensaios", L, id, "shear_rate_s1", "tipo é cisalhamento, mas o valor está vazio");
    if (d.taxa_reacao_mol_cm2_s == null && !erroNaTaxa) aviso("ensaios", L, id, "taxa_reacao_mol_cm2_s", "sem taxa de reação");
    for (const [c, [lo, hi, un]] of Object.entries(FAIXAS)) {
      const v = d[c] as number | null;
      if (v != null && (v < lo || v > hi)) aviso("ensaios", L, id, c, `${v} ${un} fora da faixa esperada (${lo}–${hi}); conferir unidade`);
    }
    dados.push(d);
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
    publicacoes, fluidos_prop: fluidos, litologias, lit_rochas: rochas, sistemas_acidos: sistemas, lit_dados_rda: dados,
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
  ["lit_rochas", "lit_rochas", "id_rocha"],
  ["sistemas_acidos", "sistemas_acidos", "id_sistema"],
  ["lit_dados_rda", "lit_dados_rda", "id_ensaio"],
];

/** Mapa aba-da-planilha de onde veio cada tabela (para cruzar com os problemas). */
const ABA_DE: Record<keyof DadosBdd, string> = {
  publicacoes: "referencias", fluidos_prop: "fluidos_prop", litologias: "listas",
  lit_rochas: "rochas", sistemas_acidos: "sistemas_acidos", lit_dados_rda: "ensaios",
};

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
  return { gravadas, deixadasDeFora: analise.dados.lit_dados_rda.length - filtrado.lit_dados_rda.length };
}
