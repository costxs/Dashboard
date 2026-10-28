// =============================================================================
// Tratamento de dados de coreflooding — ACIDIFICAÇÃO (equipamento JBV)
//
// O arquivo do JBV não tem uma coluna "fluido que está entrando agora". Quem diz é a COLUNA DE VOLUME de
// cada garrafa: a garrafa que está sendo bombeada tem o "Volume atual Gn" caindo; quando ela para, a coluna
// de outra garrafa começa a mudar. ("Volume bomb. parcial Gn" é zerado a cada troca, então o confiável é o
// "Volume atual".) O nome de cada garrafa vem de "Nome Gn" quando o operador preencheu.
//
// FASE = mesma garrafa e mesma vazão. É a mesma separação que o pesquisador faz à mão, com o rótulo
// "<fluido> @<Q>" (ex.: "KCl 2% @2" → "Blend @2" → "AUP @2" → "AUP @4" → "AUP @6").
// Se o arquivo já vier separado pelo pesquisador (coluna com esses rótulos), as fases saem dos rótulos.
//
// Na fase de ÁCIDO, igual à planilha do Origin do laboratório ("2 - Acidizing"):
//     Volume injetado total = Q · (t − t₀) / 60                         [cm³]  (t₀ = início do ácido)
//     Volume injetado       = Volume total − volume morto (linhas)      [cm³]  (começa negativo)
//     PV                    = Volume injetado ÷ volume poroso               (cruza o zero quando o ácido chega na rocha)
//     PVbt                  = PV no breakthrough
// O laboratório para o ácido quando vê o breakthrough, então o padrão é o PV no FIM da fase de ácido.
//
// Breakthrough — padrão 'fim_acido' (como o laboratório). Para conferir, 'queda': depois do breakthrough o ΔP não vai a zero — fica num patamar
// (no JBV, ~2 psi, que não muda com a vazão: é o zero do transdutor + linhas). Por isso a queda é medida
// entre o ΔP do início do ácido e esse PATAMAR:
//     breakthrough = 1ª leitura em que  ΔP − patamar ≤ 5 % · (ΔP inicial − patamar)
//     patamar = mediana do ΔP no fim do ácido ou no início da fase seguinte (o menor dos dois).
// Também: 'manual' (tempo escolhido no gráfico) e 'limite' (ΔP ≤ X psi).
// A coluna "Set Point" do JBV é o ΔP filtrado pelo equipamento; pode ser usada no lugar do dPH (usarDpFiltrado).
// =============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ensaio, Leitura } from "./tratamentoPermeabilidade";
import { dataDoCabecalho } from "./tratamentoPermeabilidade";

export type Equipamento = "JBV" | "DCI";
export type PapelFase = "pre_fluxo" | "acido" | "pos_fluxo" | "outro";

export interface Fase {
  ordem: number;
  garrafa: number | null;                // null quando a fase veio só do rótulo do pesquisador
  q: number;                             // cm³/min
  nome_sugerido: string | null;          // nome da garrafa ("Nome Gn"), ou o fluido do rótulo
  rotulo: string;                        // "<fluido> @<Q>", igual ao do pesquisador
  origem: "garrafas" | "rotulos";
  inicio: number; fim: number;           // índices em ensaio.leituras (inclusive)
  t_inicio_s: number; t_fim_s: number;
  n_pontos: number;
  volume_cm3: number;                    // quanto saiu da garrafa nesta fase (ou Q × duração, se não der)
  dp_inicial: number | null; dp_final: number | null; dp_max: number | null;
}

export interface OpcoesFases {
  /** variação mínima de volume (cm³) entre leituras para a garrafa contar como "bombeando". Padrão 0,005 */
  limiarVolume?: number;
  /** fase com menos leituras que isto é ruído da troca e é juntada à vizinha. Padrão 3 */
  minPontos?: number;
  /** variação relativa de Q que ainda é a mesma vazão. Padrão 2 % */
  toleranciaQ?: number;
  /** ignorar os rótulos do pesquisador e detectar pelas garrafas. Padrão false */
  ignorarRotulos?: boolean;
}

/** Quanto saiu da garrafa g entre duas leituras. O "Volume atual" é o confiável (o parcial é zerado a cada troca). */
function variacao(a: Leitura, b: Leitura, g: number): number {
  const va = a.garrafas?.[g], vb = b.garrafas?.[g];
  if (!va || !vb) return 0;
  const porAtual = va.atual != null && vb.atual != null ? va.atual - vb.atual : null;
  const porParcial = va.parcial != null && vb.parcial != null && vb.parcial >= va.parcial ? vb.parcial - va.parcial : null;
  return Math.max(porAtual ?? 0, porParcial ?? 0);
}

const fmtQ = (q: number) => (Math.round(q * 100) / 100).toString();
const dpDe = (l: Leitura, filtrado: boolean) => (filtrado ? l.dp_filtrado ?? l.dp : l.dp);

/** Separa o ensaio em fases (garrafa + vazão). Usa os rótulos do pesquisador se existirem. */
export function detectarFases(e: Ensaio, op: OpcoesFases = {}, usarDpFiltrado = false): Fase[] {
  const ls = e.leituras;
  const temRotulos = !op.ignorarRotulos && ls.some((l) => typeof l.rotulo === "string" && l.rotulo.includes("@"));
  type Bloco = { g: number | null; q: number; nome: string | null; i0: number; i1: number; rot?: string };
  let blocos: Bloco[] = [];

  if (temRotulos) {
    ls.forEach((l, i) => {
      const r = (l.rotulo ?? "").trim();
      if (!r) return;
      const ult = blocos[blocos.length - 1];
      if (ult && ult.rot === r) ult.i1 = i;
      else {
        const [fl, qq] = r.split("@").map((x) => x.trim());
        blocos.push({ g: null, q: Number(qq?.replace(",", ".")) || l.q, nome: fl || null, i0: i, i1: i, rot: r });
      }
    });
    // garrafa de cada fase: a que mais esvaziou no trecho (se as colunas existirem)
    for (const b of blocos) {
      const ns = Object.keys(ls[b.i0].garrafas ?? {}).map(Number);
      let melhor: number | null = null, dv = op.limiarVolume ?? 0.005;
      for (const g of ns) {
        let v = 0;
        for (let i = Math.max(b.i0, 1); i <= b.i1; i++) v += variacao(ls[i - 1], ls[i], g);
        if (v > dv) { dv = v; melhor = g; }
      }
      b.g = melhor;
    }
  } else {
    const lim = op.limiarVolume ?? 0.005, minP = op.minPontos ?? 3, tol = op.toleranciaQ ?? 0.02;
    const ns = [...new Set(ls.flatMap((l) => Object.keys(l.garrafas ?? {}).map(Number)))].sort((a, b) => a - b);
    const ativa: (number | null)[] = ls.map((l, i) => {
      if (i === 0 || l.q <= 0) return null;
      let melhor: number | null = null, dv = lim;
      for (const g of ns) { const v = variacao(ls[i - 1], l, g); if (v > dv) { dv = v; melhor = g; } }
      return melhor;
    });
    if (ls.length > 1 && ativa[0] == null && ls[0].q > 0) ativa[0] = ativa[1];
    // leituras bombeando sem variação de volume visível (resolução da bomba) herdam a garrafa vizinha
    for (let i = 1; i < ls.length; i++) if (ativa[i] == null && ls[i].q > 0 && ativa[i - 1] != null) ativa[i] = ativa[i - 1];
    ativa.forEach((g, i) => {
      if (g == null) return;
      const q = ls[i].q, ult = blocos[blocos.length - 1];
      if (ult && ult.g === g && ult.i1 === i - 1 && Math.abs(q - ult.q) <= tol * ult.q) ult.i1 = i;
      else blocos.push({ g, q, nome: null, i0: i, i1: i });
    });
    blocos = blocos.filter((b) => b.i1 - b.i0 + 1 >= minP);
    const juntos: Bloco[] = [];
    for (const b of blocos) {
      const ult = juntos[juntos.length - 1];
      if (ult && ult.g === b.g && Math.abs(ult.q - b.q) <= tol * ult.q) ult.i1 = b.i1; else juntos.push({ ...b });
    }
    blocos = juntos;
    for (const b of blocos) {
      const tr = ls.slice(b.i0, b.i1 + 1);
      b.nome = tr.find((l) => l.garrafas?.[b.g!]?.nome)?.garrafas?.[b.g!]?.nome ?? e.metadados.garrafas[b.g!] ?? null;
    }
  }

  return blocos.map((b, k) => {
    const tr = ls.slice(b.i0, b.i1 + 1);
    let vol = 0;
    if (b.g != null) for (let i = Math.max(b.i0, 1); i <= b.i1; i++) vol += variacao(ls[i - 1], ls[i], b.g);
    if (vol <= 0) vol = (b.q * (tr[tr.length - 1].tempo_s - tr[0].tempo_s)) / 60;
    const dps = tr.map((l) => dpDe(l, usarDpFiltrado)).filter((x): x is number => x != null);
    const n = Math.max(1, Math.min(5, Math.floor(dps.length / 3)));  // arquivo resumido (3 leituras): 1º e último valor
    return {
      ordem: k + 1, garrafa: b.g, q: b.q, nome_sugerido: b.nome,
      rotulo: b.rot ?? `${b.nome ?? (b.g != null ? `Garrafa ${b.g}` : "?")} @${fmtQ(b.q)}`,
      origem: temRotulos ? "rotulos" : "garrafas",
      inicio: b.i0, fim: b.i1, t_inicio_s: tr[0].tempo_s, t_fim_s: tr[tr.length - 1].tempo_s, n_pontos: tr.length,
      volume_cm3: vol,
      dp_inicial: dps.length ? mediana(dps.slice(0, n)) : null, dp_final: dps.length ? mediana(dps.slice(-n)) : null,
      dp_max: dps.length ? Math.max(...dps) : null,
    } as Fase;
  });
}

/** Sugestão de qual fase é o ácido: a de maior queda relativa de ΔP do começo ao fim. */
export function sugerirFaseAcido(fases: Fase[]): number | null {
  let melhor: Fase | null = null, razao = 1.5;
  for (const f of fases) {
    if (!f.dp_inicial || !f.dp_final || f.dp_final <= 0) continue;
    const r = f.dp_inicial / f.dp_final;
    if (r > razao) { razao = r; melhor = f; }
  }
  return melhor?.ordem ?? null;
}

export function sugerirPapeis(fases: Fase[], faseAcido: number | null): Record<number, PapelFase> {
  const p: Record<number, PapelFase> = {};
  for (const f of fases) p[f.ordem] = faseAcido == null ? "outro" : f.ordem < faseAcido ? "pre_fluxo" : f.ordem === faseAcido ? "acido" : "pos_fluxo";
  return p;
}

export type CriterioBt =
  | { tipo: "fim_acido" }                     // padrão: o PV quando o ácido parou (o operador para no breakthrough)
  | { tipo: "queda"; fracao?: number }        // 5 % acima do patamar
  | { tipo: "limite"; dp_psi: number }        // ΔP ≤ valor fixo
  | { tipo: "manual"; t_s: number };

export interface OpcoesAcidificacao {
  faseAcido?: number;
  /** se o arquivo não trouxer cabeçalho, informe (ou o gerencial busca da amostra no banco) */
  comprimento_cm?: number | null;
  diametro_cm?: number | null;
  porosidade_pct?: number | null;
  volumePoroso_cm3?: number | null;
  /** volume morto das linhas (Dead volume, ml). Descontado do volume injetado, como no Origin. Padrão 0 (com aviso) */
  volumeMorto_cm3?: number | null;
  /** de onde vem o volume de ácido: 'vazao' = Q·Δt (como o Origin, padrão) ou 'garrafa' = o que saiu da garrafa */
  fonteVolume?: "vazao" | "garrafa";
  criterio?: CriterioBt;
  /** usar a coluna "Set Point" (ΔP filtrado do JBV) em vez do dPH */
  usarDpFiltrado?: boolean;
  fases?: OpcoesFases;
}

export interface PontoAcido {
  t_s: number; dp: number | null; q: number;
  volume_acido_cm3: number;     // "Volume injetado Total" (desde o início do ácido)
  volume_liquido_cm3: number;   // "Injected Volume" = total − volume morto
  pv: number | null;            // "Pore Volume (PV)" = líquido ÷ VP
}

export interface ResultadoAcidificacao {
  fases: Fase[];
  fase_acido: Fase | null;
  volume_poroso_cm3: number | null;
  fonte_volume_poroso: "informado" | "dimensoes" | "equipamento" | null;
  area_cm2: number | null;
  q_ml_min: number | null;
  v_darcy_cm_min: number | null;
  v_i_cm_min: number | null;
  serie: PontoAcido[];
  dp_patamar_psi: number | null;         // ΔP depois do breakthrough (zero do transdutor + linhas)
  volume_morto_cm3: number;
  breakthrough: { indice: number; t_s: number; volume_acido_cm3: number; pvbt: number | null; criterio: string } | null;
  /** PVbt pelos dois critérios, para comparar */
  pvbt_fim_acido: number | null;
  pvbt_queda: number | null;
  pvbt_equipamento: number | null;
  dp_inicial_psi: number | null; dp_final_psi: number | null;
  temperatura_c: number | null; p_confinamento_psi: number | null; contrapressao_psi: number | null;
  avisos: string[];
}

export function tratarAcidificacao(e: Ensaio, op: OpcoesAcidificacao = {}): ResultadoAcidificacao {
  const avisos: string[] = [];
  const filtrado = !!op.usarDpFiltrado;
  const fases = detectarFases(e, op.fases, filtrado);
  if (!fases.length) avisos.push("não achei fases: nenhuma garrafa teve o 'Volume atual' mudando e não há rótulos '<fluido> @<Q>'");
  const nAcido = op.faseAcido ?? sugerirFaseAcido(fases);
  const fa = fases.find((f) => f.ordem === nAcido) ?? null;
  if (!fa && fases.length) avisos.push("não identifiquei a fase de ácido (nenhuma teve queda clara de ΔP): escolha a fase manualmente");

  const m = e.metadados;
  const L = op.comprimento_cm ?? m.comprimento_cm ?? null;
  const D = op.diametro_cm ?? m.diametro_cm ?? null;
  const phiPct = op.porosidade_pct ?? m.porosidade_pct ?? null;
  const A = D ? (Math.PI * D * D) / 4 : null;
  const phi = phiPct != null ? phiPct / 100 : null;
  let vp: number | null = null, fonte: ResultadoAcidificacao["fonte_volume_poroso"] = null;
  if (op.volumePoroso_cm3) { vp = op.volumePoroso_cm3; fonte = "informado"; }
  else if (A && L && phi) { vp = A * L * phi; fonte = "dimensoes"; }
  else {
    const eq = e.leituras.map((l) => l.volume_poroso_eq_cm3).find((x) => x != null && x > 0);
    if (eq) { vp = eq; fonte = "equipamento"; }
  }
  if (!vp) avisos.push("sem volume poroso: o arquivo não traz comprimento, diâmetro e porosidade — informe-os (ou o VP) para calcular o PVbt");

  const vazio: ResultadoAcidificacao = {
    fases, fase_acido: fa, volume_poroso_cm3: vp, fonte_volume_poroso: fonte, area_cm2: A,
    q_ml_min: null, v_darcy_cm_min: null, v_i_cm_min: null, serie: [], dp_patamar_psi: null, breakthrough: null,
    volume_morto_cm3: op.volumeMorto_cm3 ?? 0, pvbt_fim_acido: null, pvbt_queda: null,
    pvbt_equipamento: null, dp_inicial_psi: null, dp_final_psi: null, temperatura_c: null,
    p_confinamento_psi: null, contrapressao_psi: null, avisos,
  };
  if (!fa) return vazio;

  const ls = e.leituras;
  const morto = op.volumeMorto_cm3 ?? 0;
  if (op.volumeMorto_cm3 == null) avisos.push("volume morto (Dead volume) não informado: usei 0 — o PV fica maior que o do Origin; informe o volume morto das linhas");
  const fonteVol = op.fonteVolume ?? "vazao";
  const serie: PontoAcido[] = [];
  let vol = 0;
  const porGarrafa = fonteVol === "garrafa" && fa.garrafa != null;
  for (let i = fa.inicio; i <= fa.fim; i++) {
    if (i > fa.inicio) vol += porGarrafa ? variacao(ls[i - 1], ls[i], fa.garrafa!) : (fa.q * (ls[i].tempo_s - ls[i - 1].tempo_s)) / 60;
    serie.push({ t_s: ls[i].tempo_s, dp: dpDe(ls[i], filtrado), q: ls[i].q, volume_acido_cm3: vol, volume_liquido_cm3: vol - morto, pv: null });
  }
  // arquivo resumido pelo pesquisador (poucas leituras): pela garrafa, o volume total da fase é o que saiu dela
  if (porGarrafa && fa.origem === "rotulos" && fa.volume_cm3 > 0 && vol > 0) {
    const f = fa.volume_cm3 / vol;
    for (const p of serie) { p.volume_acido_cm3 *= f; p.volume_liquido_cm3 = p.volume_acido_cm3 - morto; }
  }
  for (const p of serie) p.pv = vp ? p.volume_liquido_cm3 / vp : null;
  const q = fa.q;
  if (fa.n_pontos < 10)
    avisos.push(`a fase de ácido tem só ${fa.n_pontos} leitura(s) (arquivo resumido): o breakthrough fica aproximado — use o arquivo completo do equipamento para o PVbt exato`);

  // patamar depois do breakthrough: fim do ácido ou começo da fase seguinte (o menor)
  const prox = fases.find((f) => f.ordem === fa.ordem + 1);
  const cands = [fa.dp_final, prox?.dp_inicial].filter((x): x is number => x != null);
  const patamar = cands.length ? Math.min(...cands) : null;

  const pelaQueda = (fr: number): [number, string] => {
    const ini = fa.dp_inicial ?? fa.dp_max;
    if (ini == null || patamar == null || ini <= patamar) return [-1, ""];
    const lim = patamar + fr * (ini - patamar);
    return [serie.findIndex((p) => p.dp != null && p.dp <= lim),
      `ΔP caiu ${(100 - fr * 100).toFixed(0)} % do inicial (${ini.toFixed(2)} psi) até o patamar (${patamar.toFixed(2)} psi): ΔP ≤ ${lim.toFixed(2)} psi`];
  };
  const iQueda = pelaQueda(0.05)[0];
  const crit: CriterioBt = op.criterio ?? { tipo: "fim_acido" };
  let iBt = -1, desc = "";
  if (crit.tipo === "fim_acido") {
    iBt = serie.length - 1;
    desc = "fim da injeção de ácido (o operador para o ácido no breakthrough)";
    if (iQueda < 0) avisos.push("o ΔP não chegou ao patamar durante o ácido: confira se houve breakthrough antes de usar o PV do fim do ácido");
  } else if (crit.tipo === "queda") {
    [iBt, desc] = pelaQueda(crit.fracao ?? 0.05);
  } else if (crit.tipo === "limite") {
    const lim = crit.dp_psi;
    iBt = serie.findIndex((p) => p.dp != null && p.dp <= lim);
    desc = `ΔP ≤ ${lim} psi`;
  } else {
    const tBt = crit.t_s;
    iBt = serie.findIndex((p) => p.t_s >= tBt);
    desc = `escolhido à mão em t = ${tBt} s`;
  }
  const bt = iBt >= 0 ? {
    indice: fa.inicio + iBt, t_s: serie[iBt].t_s, volume_acido_cm3: serie[iBt].volume_acido_cm3,
    pvbt: serie[iBt].pv, criterio: desc,
  } : null;
  if (!bt) avisos.push(`não houve breakthrough pelo critério${desc ? ` (${desc})` : ""}: o ensaio pode ter parado antes; marque à mão se for o caso`);
  if (patamar != null && patamar > 0.5)
    avisos.push(`depois do breakthrough o ΔP ficou em ~${patamar.toFixed(2)} psi e não em zero: é o zero do transdutor/linhas. Se ele não muda com a vazão, o k "depois" calculado com esse ΔP não tem significado`);

  const eqs = ls.slice(fa.inicio).map((l) => l.pvbt_total_eq).filter((x): x is number => x != null && x > 0);
  const pvbtEq = eqs.length ? eqs[eqs.length - 1] : null;
  if (bt?.pvbt && pvbtEq && Math.abs(bt.pvbt / pvbtEq - 1) > 0.05)
    avisos.push(`PVbt calculado (${bt.pvbt.toFixed(3)}) difere mais de 5 % do que o equipamento calculou (${pvbtEq}): confira o volume poroso e o critério`);

  const media = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null && x !== 0); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const trecho = ls.slice(fa.inicio, fa.fim + 1);
  return {
    ...vazio,
    q_ml_min: q, v_darcy_cm_min: A ? q / A : null, v_i_cm_min: A && phi ? q / (A * phi) : null,
    serie, dp_patamar_psi: patamar, breakthrough: bt, pvbt_equipamento: pvbtEq, volume_morto_cm3: morto,
    pvbt_fim_acido: serie[serie.length - 1].pv, pvbt_queda: iQueda >= 0 ? serie[iQueda].pv : null,
    dp_inicial_psi: fa.dp_inicial, dp_final_psi: fa.dp_final,
    temperatura_c: media(trecho.map((l) => l.temperatura)),
    p_confinamento_psi: media(trecho.map((l) => l.p_confinamento)),
    contrapressao_psi: media(trecho.map((l) => l.p_backpressure)),
  };
}

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b), k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

// ---------------------------------------------------------------------------
// Gravar
// ---------------------------------------------------------------------------
export interface FaseEscolhida { papel: PapelFase; fluido: string | null }

export interface GravarAcidificacao {
  amostraId: string;
  equipamento: Equipamento;
  ensaio: Ensaio;
  resultado: ResultadoAcidificacao;
  fases: Record<number, FaseEscolhida>;
  idSistema?: string | null;
  arquivo?: string | null;
}

export async function gravarAcidificacao(sb: SupabaseClient, g: GravarAcidificacao): Promise<{ analiseId: number; curvas: number[] }> {
  const r = g.resultado, m = g.ensaio.metadados;
  if (!r.fase_acido) throw new Error("Escolha qual fase é o ácido antes de gravar.");
  const erro = (e: { code?: string; message: string }, t: string) =>
    new Error(e.code === "42501" ? `Sem permissão para gravar em ${t}: é preciso ser editor do projeto da amostra.`
      : /volume_morto_cm3/.test(e.message) ? `${t}: rode a migração 017 no Supabase (${e.message})`
      : e.code === "42703" || e.code === "PGRST204" ? `${t}: rode a migração 018 no Supabase (${e.message})` : `${t}: ${e.message}`);
  const r3 = (x: number | null) => (x == null ? null : Math.round(x * 1000) / 1000);

  const { data: a, error: e1 } = await sb.from("analise_coreflooding").insert({
    amostra_id: g.amostraId, data_ensaio: dataDoCabecalho(m.data), id_sistema: g.idSistema ?? null,
    vazao_ml_min: r.q_ml_min, temperatura_c: r3(r.temperatura_c),
    pressao_confinamento_psi: r3(r.p_confinamento_psi), contrapressao_psi: r3(r.contrapressao_psi),
    breakthrough: r.breakthrough != null, pvbt: r3(r.breakthrough?.pvbt ?? null),
    dp_inicial_psi: r3(r.dp_inicial_psi), dp_final_psi: r3(r.dp_patamar_psi ?? r.dp_final_psi),
    equipamento_aquisicao: g.equipamento, volume_poroso_usado_cm3: r3(r.volume_poroso_cm3), volume_morto_cm3: r.volume_morto_cm3,
    volume_acido_bt_cm3: r3(r.breakthrough?.volume_acido_cm3 ?? null), criterio_bt: r.breakthrough?.criterio ?? null,
    pvbt_equipamento: r.pvbt_equipamento, arquivo_origem: g.arquivo ?? null, responsavel: m.usuario ?? null,
    observacoes: `Tratamento automático (${g.equipamento}): fases ${r.fases.map((f) => f.rotulo).join(" → ")}.`,
  }).select("id").single();
  if (e1) throw erro(e1, "analise_coreflooding");

  const { error: e2 } = await sb.from("acidificacao_fases").insert(r.fases.map((f) => ({
    analise_id: a.id, ordem: f.ordem, garrafa: f.garrafa, rotulo: f.rotulo,
    papel: g.fases[f.ordem]?.papel ?? (f.ordem === r.fase_acido!.ordem ? "acido" : "outro"),
    // o que a pessoa escreveu na tela vale como está (vazio = sem fluido); sem escolha, o nome da garrafa
    fluido: g.fases[f.ordem] ? g.fases[f.ordem].fluido : f.nome_sugerido, t_inicio_s: f.t_inicio_s, t_fim_s: f.t_fim_s,
    n_pontos: f.n_pontos, volume_cm3: r3(f.volume_cm3), vazao_ml_min: r3(f.q),
    dp_inicial_psi: r3(f.dp_inicial), dp_final_psi: r3(f.dp_final), dp_max_psi: r3(f.dp_max),
  })));
  if (e2) throw erro(e2, "acidificacao_fases");

  const curvas: number[] = [];
  const reduzir = <T,>(xs: T[]) => { const p = Math.max(1, Math.ceil(xs.length / 2000)); return xs.filter((_, i) => i % p === 0); };
  const tudo = reduzir(g.ensaio.leituras.filter((l) => l.dp != null)).map((l) => ({ x: l.tempo_s, y: l.dp as number }));
  const acido = reduzir(r.serie.filter((p) => p.dp != null && p.pv != null)).map((p) => ({ x: p.pv as number, y: p.dp as number }));
  for (const [nome, xg, xu, pts] of [["ΔP × tempo (acidificação)", "Tempo", "s", tudo], ["ΔP × PV injetado (ácido)", "PV injetado", "PV", acido]] as const) {
    if (!pts.length) continue;
    const { data: c, error } = await sb.from("curvas").insert({
      amostra_id: g.amostraId, analise_tabela: "analise_coreflooding", analise_id: a.id,
      nome, x_grandeza: xg, x_unidade: xu, y_grandeza: "ΔP", y_unidade: "psi",
    }).select("id").single();
    if (error) throw erro(error, "curvas");
    for (let i = 0; i < pts.length; i += 500) {
      const { error: ep } = await sb.from("curva_pontos").insert(pts.slice(i, i + 500).map((p, j) => ({ curva_id: c.id, ordem: i + j, x: p.x, y: p.y })));
      if (ep) throw erro(ep, "curva_pontos");
    }
    curvas.push(c.id);
  }
  return { analiseId: a.id, curvas };
}
