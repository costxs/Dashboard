// =============================================================================
// Importador da planilha "Banco de dados de PVbt — LCPETRO/UFPA".
//
// Abas usadas: experimento (um ensaio por linha), amostras, sistemas_fluidos,
// fluidos_prop, referencias e, se existir, qualidade (vira aviso na prévia).
// LEIA-ME, dicionario e listas não são importadas; "listas" serve para validar.
// As colunas CALCULADAS (cabeçalho verde) são ignoradas: o banco recalcula na view
// v_pvbt (volumes, velocidades, nominais, faixas, conc. em M/wt%, PVbt por Darcy/uCT).
//
// Para onde vai cada fonte (migração 010):
//   LCPETRO    -> amostras (cria só se não existir) + analise_coreflooding (por id_experimento)
//   Literatura -> lit_amostras_pvbt + lit_dados_pvbt (todos veem)
//   Petrobras  -> lit_amostras_pvbt + lit_dados_pvbt com empresa_id (só a empresa vê)
//
// Fluxo: lerArquivoBruto -> analisarPvbt -> conferirPvbtNoBanco -> prévia -> gravarPvbt.
// Reimportar atualiza pelo id (id_experimento, id_amostra, id_referencia...). Nada é apagado.
// =============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { casarLitologia, chave, data, numero, type PlanilhaBruta, type Severidade } from "./planilhaAmostras";

export interface Problema { severidade: Severidade; aba: string; linha: number | null; id: string | null; campo: string; mensagem: string }
type Registro = Record<string, unknown> & { _linha: number };
export type Fonte = "LCPETRO" | "Literatura" | "Petrobras";

export interface OpcoesPvbt {
  litologiasExistentes?: string[];
  /** empresa a que pertencem os dados de fonte Petrobras (obrigatória se houver) */
  empresaPetrobrasId?: string | null;
  /** projeto onde criar amostras LCPETRO que ainda não existem no Banco de Amostras */
  projetoLcpetroId?: string | null;
}

export interface AnalisePvbt {
  publicacoes: Registro[];
  fluidos_prop: Registro[];
  litologias: string[];
  sistemas_acidos: Registro[];
  amostrasLab: Registro[];          // fonte LCPETRO (criadas só se não existirem)
  lit_amostras_pvbt: Registro[];
  lit_dados_pvbt: Registro[];
  coreflooding: Registro[];         // ensaios LCPETRO (com codigo da amostra)
  problemas: Problema[];
  colunasIgnoradas: string[];
  abasFaltando: string[];
  contagens: Record<string, number>;
  erros: number; avisos: number; corrigidos: number;
  /** ids com ERRO (experimentos e amostras) */
  idsComErro: string[];
  /** preenchido por conferirPvbtNoBanco */
  amostrasLabExistentes?: string[];
}

export const ABAS_PVBT = ["experimento", "amostras", "sistemas_fluidos", "fluidos_prop", "referencias"] as const;

// colunas que a planilha calcula: nunca importadas
const CALCULADAS = new Set([
  "litologia", "d_nominal_in", "l_nominal_in", "dimensao_nominal_in", "diametro_cm", "comprimento_cm", "porosidade_pct",
  "faixa_porosidade", "volume_aparente_cm3", "volume_poroso_cm3", "k_inicial_md", "faixa_permeabilidade", "conc_pct",
  "conc_m", "temperatura_nominal_c", "vazao_nominal_ml_min", "vel_darcy_cm_min", "vel_intersticial_cm_min",
  "vel_intersticial_nominal_cm_min", "volume_poroso_wh_cm3", "pvbt_por_darcy", "pvbt_por_uct",
]);

const LISTAS_FIXAS: Record<string, string[]> = {
  fonte: ["LCPETRO", "Literatura", "Petrobras"],
  conc_unidade: ["wt%", "M", "N"],
  pvbt_condicao: ["completo", "parcial", "nao_atingido", "nao_calculado"],
  pvbt_classe: ["normal", "otimo"],
  lwh_referencia: ["microCT", "darcy"],
  obtencao_dado: ["bancada", "tabela", "grafico", "texto"],
  breakthrough: ["sim", "nao"],
};

// ---------------------------------------------------------------------------
// Leitura: acha em cada aba a linha de cabeçalho (a que tem a coluna-chave)
// ---------------------------------------------------------------------------
const CHAVE_DA_ABA: Record<string, string> = {
  experimento: "id_experimento", amostras: "id_amostra", sistemas_fluidos: "id_sistema",
  fluidos_prop: "componente", referencias: "id_referencia", qualidade: "id_experimento", listas: "fonte",
};

/** nome de coluna normalizado: minúsculas, sem acento, "_" no lugar de espaços */
const col = (s: unknown) => chave(s).replace(/ /g, "_");

function tabela(bruta: PlanilhaBruta, aba: string): { linhas: Registro[]; colunas: string[] } | null {
  const nome = Object.keys(bruta).find((n) => col(n) === aba || (aba === "experimento" && col(n) === "experimentos"));
  if (!nome) return null;
  const m = bruta[nome];
  const iCab = m.findIndex((l) => l?.some((v) => col(v) === CHAVE_DA_ABA[aba]));
  if (iCab < 0) return { linhas: [], colunas: [] };
  const colunas = m[iCab].map(col);
  const linhas: Registro[] = [];
  for (let i = iCab + 1; i < m.length; i++) {
    const v = m[i];
    if (!v || v.every((x) => x == null || String(x).trim() === "")) continue;
    const r: Registro = { _linha: i + 1 };
    colunas.forEach((c, j) => { if (c) r[c] = v[j] ?? null; });
    linhas.push(r);
  }
  return { linhas, colunas };
}

function texto(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s === "-" || s === "—" ? null : s;
}

// ---------------------------------------------------------------------------
// Análise (não grava nada)
// ---------------------------------------------------------------------------
export function analisarPvbt(bruta: PlanilhaBruta, opcoes: OpcoesPvbt = {}): AnalisePvbt {
  const problemas: Problema[] = [];
  const add = (s: Severidade, aba: string, linha: number | null, id: string | null, campo: string, msg: string) =>
    problemas.push({ severidade: s, aba, linha, id, campo, mensagem: msg });
  const T = Object.fromEntries([...ABAS_PVBT, "qualidade", "listas"].map((a) => [a, tabela(bruta, a)]));
  const abasFaltando = ABAS_PVBT.filter((a) => !T[a]);
  for (const a of abasFaltando) add("ERRO", a, null, null, "aba", `aba "${a}" não encontrada`);

  // listas da aba "listas" completam as fixas (valores novos que o lab acrescentou)
  const listas: Record<string, Set<string>> = {};
  for (const [k, v] of Object.entries(LISTAS_FIXAS)) listas[k] = new Set(v);
  for (const r of T.listas?.linhas ?? []) for (const [k, v] of Object.entries(r)) {
    if (k.startsWith("_") || texto(v) == null) continue;
    (listas[k] ??= new Set()).add(String(v).trim());
  }
  const naLista = (campo: string, v: string) => !listas[campo] || listas[campo].has(v)
    || [...listas[campo]].some((x) => chave(x) === chave(v));
  const daLista = (campo: string, v: string) => [...(listas[campo] ?? [])].find((x) => chave(x) === chave(v)) ?? v;

  const num = (aba: string, r: Registro, c: string, id: string | null, faixa?: [number, number]): number | null => {
    const n = numero(r[c]);
    if (n == null) return null;
    if (Number.isNaN(n)) { add("ERRO", aba, r._linha, id, c, `não é número: ${String(r[c])}`); return null; }
    if (faixa && (n < faixa[0] || n > faixa[1])) add("AVISO", aba, r._linha, id, c, `${n} fora da faixa esperada (${faixa[0]}–${faixa[1]}); confira`);
    return n;
  };

  // ---- fluidos_prop
  const fluidos: Registro[] = [];
  for (const r of T.fluidos_prop?.linhas ?? []) {
    const c = texto(r.componente);
    if (!c) { add("ERRO", "fluidos_prop", r._linha, null, "componente", "componente vazio"); continue; }
    fluidos.push({ _linha: r._linha, componente: c, massa_molar_g_mol: num("fluidos_prop", r, "massa_molar_g_mol", c, [1, 2000]),
      coef_densidade: num("fluidos_prop", r, "coef_densidade", c), observacao: texto(r.observacao) });
  }

  // ---- referencias
  const refs = new Map<string, Registro>();
  for (const r of T.referencias?.linhas ?? []) {
    const id = texto(r.id_referencia);
    if (!id) { add("ERRO", "referencias", r._linha, null, "id_referencia", "id vazio"); continue; }
    if (refs.has(id)) { add("ERRO", "referencias", r._linha, id, "id_referencia", "id repetido"); continue; }
    const autor = texto(r.autor)?.replace(/\bat al\b/i, "et al") ?? null;
    if (autor && autor !== texto(r.autor)) add("CORRIGIDO", "referencias", r._linha, id, "autor", `'${texto(r.autor)}' -> '${autor}'`);
    if (!autor) add("ERRO", "referencias", r._linha, id, "autor", "autor vazio");
    refs.set(id, { _linha: r._linha, id_referencia: id, categoria: "geral", tipo: texto(r.tipo), autor,
      ano: texto(r.ano), titulo: texto(r.titulo), _rotulo: texto(r.rotulo_original) });
  }

  // ---- sistemas_fluidos -> sistemas_acidos
  const sistemas = new Map<string, Registro>();
  for (const r of T.sistemas_fluidos?.linhas ?? []) {
    const id = texto(r.id_sistema);
    if (!id) { add("ERRO", "sistemas_fluidos", r._linha, null, "id_sistema", "id vazio"); continue; }
    if (!texto(r.componente_1)) add("ERRO", "sistemas_fluidos", r._linha, id, "componente_1", "componente principal vazio");
    const s: Registro = { _linha: r._linha, id_sistema: id, nome_sistema: texto(r.nome_sistema) ?? id };
    for (const i of [1, 2, 3, 4]) {
      s[`componente_${i}`] = texto(r[`componente_${i}`]);
      s[`valor_${i}`] = num("sistemas_fluidos", r, `valor_${i}`, id);
      s[`unidade_${i}`] = texto(r[`unidade_${i}`]);
    }
    sistemas.set(id, s);
  }

  // ---- amostras
  const catalogo = [...(opcoes.litologiasExistentes ?? [])];
  const litNovas = new Set<string>();
  const amostras = new Map<string, Registro & { fonte: Fonte }>();
  for (const r of T.amostras?.linhas ?? []) {
    const id = texto(r.id_amostra);
    if (!id) { add("ERRO", "amostras", r._linha, null, "id_amostra", "id vazio"); continue; }
    if (amostras.has(id)) { add("ERRO", "amostras", r._linha, id, "id_amostra", "id repetido"); continue; }
    const fonteOrig = texto(r.fonte);
    const fonte = fonteOrig ? (LISTAS_FIXAS.fonte.find((f) => chave(f) === chave(fonteOrig)) as Fonte | undefined) : undefined;
    if (!fonte) { add("ERRO", "amostras", r._linha, id, "fonte", `fonte '${fonteOrig ?? ""}' inválida (LCPETRO, Literatura ou Petrobras)`); continue; }
    const litOrig = texto(r.litologia);
    let litologia: string | null = null;
    if (!litOrig) add("ERRO", "amostras", r._linha, id, "litologia", "litologia vazia");
    else {
      const m = casarLitologia(litOrig, catalogo);
      litologia = m.nome;
      if (m.nova) { if (!litNovas.has(m.nome)) add("AVISO", "amostras", r._linha, id, "litologia", `'${m.nome}' não está no catálogo; será criada`); litNovas.add(m.nome); catalogo.push(m.nome); }
      else if (m.nome !== litOrig) add("CORRIGIDO", "amostras", r._linha, id, "litologia", `'${litOrig}' -> '${m.nome}'`);
    }
    const a = {
      _linha: r._linha, id_amostra: id, fonte, litologia,
      diametro_cm: num("amostras", r, "diametro_cm", id, [1, 15]),
      comprimento_cm: num("amostras", r, "comprimento_cm", id, [0.5, 100]),
      porosidade_pct: num("amostras", r, "porosidade_pct", id),
      volume_poroso_medido_cm3: num("amostras", r, "volume_poroso_medido_cm3", id),
      k_inicial_md: num("amostras", r, "k_inicial_md", id, [0, 20000]),
      k_metodo: texto(r.k_metodo), ca_pct: num("amostras", r, "ca_pct", id), mg_pct: num("amostras", r, "mg_pct", id),
    };
    if (a.porosidade_pct != null && a.porosidade_pct > 0 && a.porosidade_pct < 1)
      add("AVISO", "amostras", r._linha, id, "porosidade_pct", `${a.porosidade_pct} parece fração; a planilha usa % (16.38 = 16,38%)`);
    if (a.porosidade_pct != null && (a.porosidade_pct < 0 || a.porosidade_pct > 100)) { add("ERRO", "amostras", r._linha, id, "porosidade_pct", "fora de 0–100 %"); a.porosidade_pct = null; }
    if (a.volume_poroso_medido_cm3 && a.diametro_cm && a.comprimento_cm && a.porosidade_pct) {
      const vp = Math.PI * (a.diametro_cm / 2) ** 2 * a.comprimento_cm * a.porosidade_pct / 100;
      if (Math.abs(vp - a.volume_poroso_medido_cm3) / a.volume_poroso_medido_cm3 > 0.1)
        add("AVISO", "amostras", r._linha, id, "volume_poroso_medido_cm3", `medido ${a.volume_poroso_medido_cm3} cm³ × calculado ${vp.toFixed(2)} cm³ (diferença > 10%)`);
    }
    amostras.set(id, a);
  }

  // ---- qualidade (vira aviso no ensaio)
  const qualidade = new Map<string, string[]>();
  for (const r of T.qualidade?.linhas ?? []) {
    const id = texto(r.id_experimento);
    if (!id) continue;
    const msg = [texto(r.campo), texto(r.valor_registrado) && `registrado ${texto(r.valor_registrado)}`, texto(r.observacao)].filter(Boolean).join(" · ");
    qualidade.set(id, [...(qualidade.get(id) ?? []), msg]);
  }

  // ---- experimento
  const colunasIgnoradas = (T.experimento?.colunas ?? []).filter((c) => CALCULADAS.has(c));
  const vistos = new Map<string, number>();
  const lit_dados: Registro[] = [];
  const core: Registro[] = [];
  const refsUsadas = new Map<string, Set<Fonte>>();
  const amostrasUsadas = new Set<string>();
  for (const r of T.experimento?.linhas ?? []) {
    const A = "experimento";
    const id = texto(r.id_experimento);
    if (!id) { add("ERRO", A, r._linha, null, "id_experimento", "id vazio"); continue; }
    if (vistos.has(id)) { add("ERRO", A, r._linha, id, "id_experimento", `repetido (já usado na linha ${vistos.get(id)})`); continue; }
    vistos.set(id, r._linha);
    const fonteOrig = texto(r.fonte);
    const fonte = fonteOrig ? (LISTAS_FIXAS.fonte.find((f) => chave(f) === chave(fonteOrig)) as Fonte | undefined) : undefined;
    if (!fonte) { add("ERRO", A, r._linha, id, "fonte", `fonte '${fonteOrig ?? ""}' inválida`); continue; }
    const prefixo = { LCPETRO: /^LCP-/i, Literatura: /^LIT-/i, Petrobras: /^PB-/i }[fonte];
    if (!prefixo.test(id)) add("AVISO", A, r._linha, id, "id_experimento", `fonte ${fonte} mas o id não começa com ${String(prefixo).slice(2, -2)}`);

    // amostra
    const idAm = texto(r.id_amostra);
    const am = idAm ? amostras.get(idAm) : undefined;
    if (!idAm) add("ERRO", A, r._linha, id, "id_amostra", "amostra vazia");
    else if (!am) add("ERRO", A, r._linha, id, "id_amostra", `'${idAm}' não existe na aba amostras: cadastre a amostra primeiro`);
    else if (am.fonte !== fonte) add("ERRO", A, r._linha, id, "id_amostra", `ensaio de fonte ${fonte} numa amostra de fonte ${am.fonte}`);
    if (idAm) amostrasUsadas.add(idAm);

    // referência (só literatura/Petrobras)
    const idRef = texto(r.id_referencia);
    if (fonte !== "LCPETRO") {
      if (!idRef) add("ERRO", A, r._linha, id, "id_referencia", "referência vazia");
      else if (!refs.has(idRef)) add("ERRO", A, r._linha, id, "id_referencia", `'${idRef}' não existe na aba referencias`);
    }
    if (idRef) refsUsadas.set(idRef, (refsUsadas.get(idRef) ?? new Set()).add(fonte));

    // sistema
    const idSis = texto(r.id_sistema);
    if (idSis && !sistemas.has(idSis)) add("ERRO", A, r._linha, id, "id_sistema", `'${idSis}' não existe na aba sistemas_fluidos`);

    // listas
    const lista = (c: string): string | null => {
      const v = texto(r[c]);
      if (v == null) return null;
      if (!naLista(c, v)) { add("ERRO", A, r._linha, id, c, `'${v}' não está na lista (${[...(listas[c] ?? [])].join("; ")})`); return null; }
      return daLista(c, v);
    };

    // temperatura: número ou texto ("Ambiente")
    let temperatura_c = numero(r.temperatura_c);
    let temperatura_obs = texto(r.temperatura_obs);
    if (Number.isNaN(temperatura_c)) {
      const t = texto(r.temperatura_c)!;
      if (/ambiente/i.test(t)) { add("CORRIGIDO", A, r._linha, id, "temperatura_c", `'${t}' movido para temperatura_obs`); temperatura_obs = temperatura_obs ?? "Ambiente"; }
      else add("ERRO", A, r._linha, id, "temperatura_c", `não é número: ${t}`);
      temperatura_c = null;
    } else if (temperatura_c != null && (temperatura_c < 0 || temperatura_c > 250)) add("AVISO", A, r._linha, id, "temperatura_c", `${temperatura_c} °C fora da faixa esperada`);

    const vazao = num(A, r, "vazao_ml_min", id, [0.001, 200]);
    if (vazao != null && vazao <= 0) add("ERRO", A, r._linha, id, "vazao_ml_min", "vazão precisa ser > 0");
    let pvbt = num(A, r, "pvbt", id);
    if (pvbt != null && pvbt <= 0) { add("AVISO", A, r._linha, id, "pvbt", `PVbt ${pvbt} não é válido; gravado vazio`); pvbt = null; }
    if (pvbt != null && pvbt > 50) add("AVISO", A, r._linha, id, "pvbt", `PVbt ${pvbt} muito alto: confira`);
    const cond = lista("pvbt_condicao");
    if (cond === "completo" && pvbt == null) add("AVISO", A, r._linha, id, "pvbt", "condição 'completo' sem valor de PVbt");
    const bt = lista("breakthrough");
    const obs = texto(r.observacoes);
    if (obs && /n[aã]o ocorreu bt/i.test(obs) && cond === "completo")
      add("AVISO", A, r._linha, id, "pvbt_condicao", "observação diz 'Não ocorreu Bt' mas pvbt_condicao = completo: confira (parcial?)");
    const lwhD = num(A, r, "comprimento_wormhole_cm", id, [0.1, 100]);
    const lwhU = num(A, r, "comprimento_wormhole_uct_cm", id, [0.1, 100]);
    const lwhRef = lista("lwh_referencia");
    if (lwhRef === "microCT" && lwhU == null) add("AVISO", A, r._linha, id, "lwh_referencia", "referência microCT sem comprimento por microCT");
    if (lwhRef === "darcy" && lwhD == null) add("AVISO", A, r._linha, id, "lwh_referencia", "referência darcy sem comprimento por Darcy");
    if (cond === "parcial" && lwhD == null && lwhU == null) add("AVISO", A, r._linha, id, "pvbt_condicao", "PVbt parcial sem comprimento de wormhole: não dá para normalizar");

    // conferência da velocidade intersticial da fonte com a calculada
    const vFonte = num(A, r, "vel_intersticial_fonte", id);
    if (vFonte && vazao && am?.diametro_cm && am?.porosidade_pct) {
      const v = vazao / (Math.PI * ((am.diametro_cm as number) / 2) ** 2) / ((am.porosidade_pct as number) / 100);
      if (Math.abs(v - vFonte) / vFonte > 0.05) add("AVISO", A, r._linha, id, "vel_intersticial_fonte", `fonte ${vFonte} × calculada ${v.toFixed(4)} cm/min (diferença > 5%)`);
    }
    for (const q of qualidade.get(id) ?? []) add("AVISO", "qualidade", r._linha, id, "qualidade", `marcado para conferência: ${q}`);

    let dataEnsaio = data(r.data);
    if (dataEnsaio === "") { add("ERRO", A, r._linha, id, "data", `data inválida: ${String(r.data)}`); dataEnsaio = null; }
    const ano = num(A, r, "ano", id, [1950, 2100]);

    const comum: Registro = {
      _linha: r._linha, id_experimento: id, id_sistema: idSis,
      acido: texto(r.acido), conc_valor: num(A, r, "conc_valor", id), conc_unidade: lista("conc_unidade"),
      aditivo: texto(r.aditivo), aditivo_valor: num(A, r, "aditivo_valor", id), aditivo_unidade: texto(r.aditivo_unidade),
      tratamento: texto(r.tratamento), temperatura_c, temperatura_obs, vazao_ml_min: vazao,
      pvbt, pvbt_condicao: cond, pvbt_classe: lista("pvbt_classe"),
      comprimento_wormhole_cm: lwhD, comprimento_wormhole_uct_cm: lwhU, lwh_referencia: lwhRef,
      fluido_saturacao: texto(r.fluido_saturacao), tipo_fluido_saturacao: texto(r.tipo_fluido_saturacao),
      metodo_saturacao: texto(r.metodo_saturacao), forma_saturacao: texto(r.forma_saturacao),
      obtencao_dado: lista("obtencao_dado") ?? (fonte === "LCPETRO" ? "bancada" : null),
      vel_intersticial_fonte: vFonte, k_fluxo_md: num(A, r, "k_fluxo_md", id),
      breakthrough: bt == null ? null : chave(bt) === "sim",
      tipo_experimento: texto(r.tipo_experimento), status_ensaio: texto(r.status),
      data_ensaio: dataEnsaio, projeto_origem: texto(r.projeto), estudo: texto(r.estudo),
      equipamento: texto(r.equipamento), rotulo_original: texto(r.rotulo_original), observacoes: obs,
    };
    const pConf = num(A, r, "p_confinamento_psi", id), pBack = num(A, r, "p_backpressure_psi", id);
    if (fonte === "LCPETRO") {
      core.push({ ...comum, _codigo: idAm, pressao_confinamento_psi: pConf, contrapressao_psi: pBack });
    } else {
      lit_dados.push({ ...comum, fonte, id_referencia: idRef, id_amostra: idAm, ano, p_confinamento_psi: pConf, p_backpressure_psi: pBack });
    }
  }

  // ---- referências: a "interna" usada só por ensaios LCPETRO não vira publicação
  const publicacoes: Registro[] = [];
  for (const [id, ref] of refs) {
    const fontes = refsUsadas.get(id) ?? new Set<Fonte>();
    if (fontes.size > 0 && [...fontes].every((f) => f === "LCPETRO")) {
      add("AVISO", "referencias", ref._linha, id, "id_referencia", "usada só por ensaios LCPETRO: não vira publicação (os ensaios ficam na ficha da amostra)");
      continue;
    }
    const sigilosa = chave(ref.tipo).includes("petrobras") || fontes.has("Petrobras");
    if (fontes.has("Petrobras") && fontes.has("Literatura"))
      add("AVISO", "referencias", ref._linha, id, "id_referencia", "usada por ensaios Literatura E Petrobras: ficará restrita à Petrobras");
    publicacoes.push({ ...ref, _sigilosa: sigilosa, eixos: ["coreflooding"] });
  }
  const precisaEmpresa = publicacoes.some((p) => p._sigilosa) || [...amostras.values()].some((a) => a.fonte === "Petrobras");
  if (precisaEmpresa && !opcoes.empresaPetrobrasId)
    add("ERRO", "—", null, null, "empresa", "há dados de fonte Petrobras: escolha a empresa Petrobras (eles ficarão visíveis só para ela)");
  for (const id of amostras.keys()) if (!amostrasUsadas.has(id)) add("AVISO", "amostras", amostras.get(id)!._linha, id, "id_amostra", "amostra sem nenhum ensaio na aba experimento");

  const emp = opcoes.empresaPetrobrasId ?? null;
  for (const p of publicacoes) p.empresa_id = p._sigilosa ? emp : null;
  const amostrasLab = [...amostras.values()].filter((a) => a.fonte === "LCPETRO");
  const lit_amostras = [...amostras.values()].filter((a) => a.fonte !== "LCPETRO").map((a) => ({ ...a, empresa_id: a.fonte === "Petrobras" ? emp : null }));
  for (const d of lit_dados) d.empresa_id = d.fonte === "Petrobras" ? emp : null;

  // ids com erro: experimentos com erro + experimentos de amostras/referências com erro
  const comErro = new Set(problemas.filter((p) => p.severidade === "ERRO" && p.id).map((p) => p.id as string));
  for (const d of [...lit_dados, ...core]) {
    const am = (d.id_amostra ?? d._codigo) as string | null;
    if ((am && comErro.has(am)) || (d.id_referencia && comErro.has(d.id_referencia as string)) || (d.id_sistema && comErro.has(d.id_sistema as string)))
      comErro.add(d.id_experimento as string);
  }

  const contar = (s: Severidade) => problemas.filter((p) => p.severidade === s).length;
  return {
    publicacoes, fluidos_prop: fluidos, litologias: [...litNovas], sistemas_acidos: [...sistemas.values()],
    amostrasLab, lit_amostras_pvbt: lit_amostras, lit_dados_pvbt: lit_dados, coreflooding: core,
    problemas, colunasIgnoradas, abasFaltando,
    contagens: {
      referencias: publicacoes.length, fluidos_prop: fluidos.length, sistemas_acidos: sistemas.size,
      amostras_lcpetro: amostrasLab.length, amostras_literatura: lit_amostras.filter((a) => a.fonte === "Literatura").length,
      amostras_petrobras: lit_amostras.filter((a) => a.fonte === "Petrobras").length,
      ensaios_lcpetro: core.length, ensaios_literatura: lit_dados.filter((d) => d.fonte === "Literatura").length,
      ensaios_petrobras: lit_dados.filter((d) => d.fonte === "Petrobras").length,
    },
    erros: contar("ERRO"), avisos: contar("AVISO"), corrigidos: contar("CORRIGIDO"),
    idsComErro: [...comErro],
  };
}

// ---------------------------------------------------------------------------
// Conferência no banco: amostras LCPETRO que já existem e referência com id já usado
// ---------------------------------------------------------------------------
export async function conferirPvbtNoBanco(sb: SupabaseClient, a: AnalisePvbt, opcoes: OpcoesPvbt = {}): Promise<AnalisePvbt> {
  const problemas = [...a.problemas];
  const codigos = a.amostrasLab.map((x) => x.id_amostra as string);
  const existentes: string[] = [];
  for (let i = 0; i < codigos.length; i += 200) {
    const { data: d, error } = await sb.from("amostras").select("codigo").in("codigo", codigos.slice(i, i + 200));
    if (error) throw new Error(traduzir(error, "amostras"));
    existentes.push(...(d ?? []).map((x) => x.codigo as string));
  }
  const novas = codigos.filter((c) => !existentes.includes(c));
  if (novas.length && !opcoes.projetoLcpetroId)
    problemas.push({ severidade: "ERRO", aba: "amostras", linha: null, id: null, campo: "projeto",
      mensagem: `${novas.length} amostra(s) LCPETRO não existem no Banco de Amostras (${novas.slice(0, 5).join(", ")}${novas.length > 5 ? "…" : ""}): escolha o projeto onde criá-las` });

  const ids = a.publicacoes.map((p) => p.id_referencia as string);
  for (let i = 0; i < ids.length; i += 200) {
    const { data: d, error } = await sb.from("publicacoes").select("id_referencia, autor, categoria").in("id_referencia", ids.slice(i, i + 200));
    if (error) throw new Error(traduzir(error, "publicacoes"));
    for (const e of d ?? []) {
      const p = a.publicacoes.find((x) => x.id_referencia === e.id_referencia)!;
      if (e.categoria !== "geral" || chave(e.autor) !== chave(p.autor))
        problemas.push({ severidade: "ERRO", aba: "referencias", linha: p._linha, id: p.id_referencia as string, campo: "id_referencia",
          mensagem: `o id já é usado por outra publicação no banco (${e.autor}); troque o id na planilha para não sobrescrevê-la` });
    }
  }
  const comErro = new Set([...a.idsComErro, ...problemas.filter((p) => p.severidade === "ERRO" && p.id).map((p) => p.id as string)]);
  for (const d of a.lit_dados_pvbt) if (d.id_referencia && comErro.has(d.id_referencia as string)) comErro.add(d.id_experimento as string);
  return { ...a, problemas, amostrasLabExistentes: existentes,
    erros: problemas.filter((p) => p.severidade === "ERRO").length, idsComErro: [...comErro] };
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------
export interface ResultadoPvbt {
  gravadas: Record<string, number>;
  amostrasCriadas: number;
  deixadasDeFora: string[];
  recusadas: { id: string; motivo: string }[];
}

function traduzir(e: { code?: string; message: string; details?: string | null }, tabela: string): string {
  if (e.code === "42501") return `Sem permissão para gravar em ${tabela}: é preciso ser editor (e, para dados Petrobras, editor da empresa Petrobras) ou administrador.`;
  if (e.code === "23503") return `${tabela}: referência inexistente. ${e.details ?? e.message}`;
  if (e.code === "23505") return `${tabela}: id já existe fora do seu alcance. ${e.details ?? ""}`;
  if (e.code === "23514") return `${tabela}: valor recusado pelas regras do banco (${e.message}).`;
  return `${tabela}: ${e.message}`;
}
const limpo = (r: Registro) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith("_")));

export async function gravarPvbt(
  sb: SupabaseClient, a: AnalisePvbt,
  op: { pularErros?: boolean; projetoLcpetroId?: string | null; tamanhoLote?: number; aoProgresso?: (tabela: string, feito: number, total: number) => void } = {},
): Promise<ResultadoPvbt> {
  if (a.erros > 0 && !op.pularErros) throw new Error(`Há ${a.erros} erro(s). Corrija a planilha ou marque "deixar de fora as linhas com erro".`);
  if (a.problemas.some((p) => p.severidade === "ERRO" && !p.id)) throw new Error("Há erros gerais (abas, empresa Petrobras ou projeto) que impedem a importação.");
  const fora = new Set(a.idsComErro);
  const lote = op.tamanhoLote ?? 200;
  const progresso = op.aoProgresso ?? (() => {});
  const r: ResultadoPvbt = { gravadas: {}, amostrasCriadas: 0, deixadasDeFora: [], recusadas: [] };

  const upsert = async (tabela: string, linhas: Record<string, unknown>[], onConflict: string) => {
    for (let i = 0; i < linhas.length; i += lote) {
      const { error } = await sb.from(tabela).upsert(linhas.slice(i, i + lote), { onConflict });
      if (error) throw new Error(traduzir(error, tabela));
      progresso(tabela, Math.min(i + lote, linhas.length), linhas.length);
    }
    r.gravadas[tabela] = (r.gravadas[tabela] ?? 0) + linhas.length;
  };

  // 1. catálogos e referências
  await upsert("fluidos_prop", a.fluidos_prop.filter((f) => !fora.has(f.componente as string)).map(limpo), "componente");
  const litUsadas = new Set([...a.amostrasLab, ...a.lit_amostras_pvbt].filter((x) => !fora.has(x.id_amostra as string)).map((x) => x.litologia));
  const litNovas = a.litologias.filter((l) => litUsadas.has(l));
  if (litNovas.length) {
    const { error } = await sb.from("litologias").upsert(litNovas.map((nome) => ({ nome })), { onConflict: "nome", ignoreDuplicates: true });
    if (error) throw new Error(traduzir(error, "litologias"));
    r.gravadas.litologias = litNovas.length;
  }
  await upsert("publicacoes", a.publicacoes.filter((p) => !fora.has(p.id_referencia as string)).map(limpo), "id_referencia");
  await upsert("sistemas_acidos", a.sistemas_acidos.filter((s) => !fora.has(s.id_sistema as string)).map(limpo), "id_sistema");

  // 2. amostras LCPETRO que ainda não existem (+ petrofísica "antes" com porosidade e k)
  const labOk = a.amostrasLab.filter((x) => !fora.has(x.id_amostra as string));
  const ids = new Map<string, string>();
  const cods = labOk.map((x) => x.id_amostra as string);
  for (let i = 0; i < cods.length; i += 200) {
    const { data: d, error } = await sb.from("amostras").select("id, codigo").in("codigo", cods.slice(i, i + 200));
    if (error) throw new Error(traduzir(error, "amostras"));
    for (const e of d ?? []) ids.set(e.codigo, e.id);
  }
  for (const x of labOk.filter((y) => !ids.has(y.id_amostra as string))) {
    if (!op.projetoLcpetroId) { r.recusadas.push({ id: x.id_amostra as string, motivo: "amostra nova sem projeto de destino" }); continue; }
    const nova = { codigo: x.id_amostra, projeto_id: op.projetoLcpetroId, litologia: x.litologia, tipo_origem: "afloramento",
      diametro_cm: x.diametro_cm, comprimento_cm: x.comprimento_cm, finalidade: "coreflooding", status: "utilizada",
      observacoes: "criada pela importação da planilha de PVbt" };
    const { data: d, error } = await sb.from("amostras").insert(nova).select("id, codigo").single();
    if (error) { r.recusadas.push({ id: x.id_amostra as string, motivo: traduzir(error, "amostras") }); continue; }
    ids.set(d.codigo, d.id); r.amostrasCriadas++;
    if (x.porosidade_pct != null || x.k_inicial_md != null) {
      const gas = x.k_metodo == null || chave(x.k_metodo) === "gas";
      const { error: e2 } = await sb.from("analise_petrofisica").insert({ amostra_id: d.id, momento: "antes",
        porosidade_pct: x.porosidade_pct, permeabilidade_gas_md: gas ? x.k_inicial_md : null,
        observacoes: gas ? "importada da planilha de PVbt" : `importada da planilha de PVbt; k inicial ${x.k_inicial_md} mD (${x.k_metodo})` });
      if (e2) throw new Error(traduzir(e2, "analise_petrofisica"));
    }
  }

  // 3. literatura / Petrobras
  await upsert("lit_amostras_pvbt", a.lit_amostras_pvbt.filter((x) => !fora.has(x.id_amostra as string)).map(limpo), "id_amostra");
  const litDados = a.lit_dados_pvbt.filter((d) => !fora.has(d.id_experimento as string) && !fora.has(d.id_amostra as string));
  await upsert("lit_dados_pvbt", litDados.map(limpo), "id_experimento");

  // 4. ensaios LCPETRO -> analise_coreflooding da amostra (por id_experimento)
  const core = a.coreflooding.filter((d) => !fora.has(d.id_experimento as string))
    .flatMap((d) => {
      const amostra_id = ids.get(d._codigo as string);
      if (!amostra_id) { r.recusadas.push({ id: d.id_experimento as string, motivo: `amostra ${d._codigo} não encontrada ou sem acesso` }); return []; }
      return [{ ...limpo(d), amostra_id }];
    });
  await upsert("analise_coreflooding", core, "id_experimento");

  r.deixadasDeFora = [...fora];
  return r;
}
