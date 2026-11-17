// =============================================================================
// Ensaios RDA dos DISCOS do laboratório a partir da coluna "Utilização" da planilha de Controle de rochas.
//
// A planilha de controle tem, para cada disco (código RDA + número), um texto como
//     "TR - HCl [15%] - Formação - 60 °C @500"
// que descreve o ensaio feito (ou previsto) naquele disco. Antes esse texto ficava só nas observações da amostra,
// e o disco aparecia no banco de amostras SEM ensaio RDA. Agora cada texto vira uma linha de `analise_rda`
// ligada ao disco (origem_registro = 'controle'): sistema ácido, temperatura e rotação. A taxa fica vazia
// ("aguardando resultado") até alguém lançá-la na ficha da amostra.
//
// Uso no gerencial, depois de gravar as amostras:
//     const plano = planejarRdaDosDiscos(analise.sugestoesRda, sistemasDoBanco)   // prévia (não grava)
//     const r = await gravarRdaDosDiscos(supabase, plano)                         // grava
// Reimportar a planilha ATUALIZA o ensaio do disco (um por disco); nunca apaga, nunca mexe na taxa já lançada.
// =============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SugestaoRda } from "./planilhaAmostras";
import { taxaPelaCurvaCalcio } from "./cadastroReatividade";
import { assinaturaSistema, normalizaComponente } from "./planilhaBdd";

export interface ProblemaRda { severidade: "ERRO" | "AVISO" | "CORRIGIDO"; codigo: string; linha: number | null; campo: string; mensagem: string }

export interface SistemaNovo { assinatura: string; nome_sistema: string; componente_1: string; valor_1: number | null; unidade_1: string | null; composicao_original: string }

export interface EnsaioDoDisco {
  codigo: string; linha: number;
  /** sistema já cadastrado (código) OU a assinatura de um sistema novo deste plano */
  id_sistema: string | null; assinatura: string;
  temperatura_c: number | null; rotacao_rpm: number | null; texto_utilizacao: string;
}

export interface PlanoRda { ensaios: EnsaioDoDisco[]; sistemasNovos: SistemaNovo[]; problemas: ProblemaRda[] }

const UNIDADE: Record<string, string> = { m: "M", n: "N", mm: "mM", "wt%": "wt%", wt: "wt%", "%wt": "wt%", "vol%": "vol%", vol: "vol%", "%vol": "vol%" };

export interface OpcoesRda {
  /** o que "%" significa no texto da Utilização. Padrão: wt% (HCl 15 % em acidificação é em massa). */
  porcentagem?: "wt%" | "vol%" | "%";
}

/** Monta os ensaios (sem gravar). `sistemas` = sistemas_acidos do banco (id_sistema + componente/valor/unidade 1..4). */
export function planejarRdaDosDiscos(sugestoes: SugestaoRda[], sistemas: Record<string, unknown>[], op: OpcoesRda = {}): PlanoRda {
  const porcent = op.porcentagem ?? "wt%";
  const problemas: ProblemaRda[] = [];
  const ensaios: EnsaioDoDisco[] = [];
  const novos = new Map<string, SistemaNovo>();
  const porAssinatura = new Map<string, string>();
  for (const s of [...sistemas].sort((a, b) => String(a.id_sistema).localeCompare(String(b.id_sistema))))
    if (!porAssinatura.has(assinaturaSistema(s))) porAssinatura.set(assinaturaSistema(s), s.id_sistema as string);
  const vistos = new Set<string>();

  for (const s of sugestoes) {
    const p = (severidade: ProblemaRda["severidade"], campo: string, mensagem: string) =>
      problemas.push({ severidade, codigo: s.codigo, linha: s._linha, campo, mensagem });
    if (vistos.has(s.codigo)) { p("AVISO", "codigo", "disco repetido na planilha: vale a primeira linha"); continue; }
    vistos.add(s.codigo);
    if (!s.acido) { p("AVISO", "utilizacao", `não achei o ácido em "${s.texto}": o disco fica sem ensaio RDA (cadastre na ficha)`); continue; }
    if (s.concentracao != null && Number.isNaN(s.concentracao)) { p("AVISO", "utilizacao", `concentração ilegível em "${s.texto}"`); s.concentracao = null; }
    let un = s.unidade ? (UNIDADE[s.unidade.toLowerCase().replace(/\s+/g, "")] ?? s.unidade) : null;
    if (un === "%") {
      if (porcent !== "%") p("CORRIGIDO", "unidade", `'%' tratado como ${porcent} (troque a opção se não for)`);
      un = porcent;
    }
    const acido = normalizaComponente(s.acido)!;
    const sistema = { componente_1: acido, valor_1: s.concentracao, unidade_1: un };
    const ass = assinaturaSistema(sistema);
    const id = porAssinatura.get(ass) ?? null;
    if (!id && !novos.has(ass)) {
      const conc = s.concentracao != null ? `${String(s.concentracao).replace(".", ",")} ${un ?? ""}`.trim() : "";
      novos.set(ass, { assinatura: ass, nome_sistema: conc ? `${acido} ${conc}` : acido, ...sistema, composicao_original: `[${acido}] = ${conc}`.trim() });
    }
    if (s.temperatura_c == null) p("AVISO", "temperatura_c", `sem temperatura em "${s.texto}"`);
    if (s.rotacao_rpm == null) p("AVISO", "rotacao_rpm", `sem rotação (@rpm) em "${s.texto}"`);
    if (s.temperatura_c != null && (s.temperatura_c < 0 || s.temperatura_c > 200)) p("AVISO", "temperatura_c", `${s.temperatura_c} °C fora do esperado: conferir`);
    if (s.rotacao_rpm != null && (s.rotacao_rpm <= 0 || s.rotacao_rpm > 10000)) p("AVISO", "rotacao_rpm", `${s.rotacao_rpm} rpm fora do esperado: conferir`);
    ensaios.push({ codigo: s.codigo, linha: s._linha, id_sistema: id, assinatura: ass,
      temperatura_c: s.temperatura_c, rotacao_rpm: s.rotacao_rpm, texto_utilizacao: s.texto });
  }
  return { ensaios, sistemasNovos: [...novos.values()], problemas };
}

export interface ResultadoRda { inseridos: number; atualizados: number; iguais: number; sistemasCriados: string[]; semAmostra: string[] }

const erroPt = (e: { code?: string; message: string }, onde: string) =>
  e.code === "42501" ? `${onde}: sem permissão (é preciso ser editor do projeto das amostras)` : `${onde}: ${e.message}`;

/** Grava: cria os sistemas novos (códigos SAnn do banco) e um ensaio RDA por disco. */
export async function gravarRdaDosDiscos(sb: SupabaseClient, plano: PlanoRda): Promise<ResultadoRda> {
  const r: ResultadoRda = { inseridos: 0, atualizados: 0, iguais: 0, sistemasCriados: [], semAmostra: [] };
  if (!plano.ensaios.length) return r;

  // discos -> id da amostra
  const ids = new Map<string, string>();
  const codigos = plano.ensaios.map((e) => e.codigo);
  for (let i = 0; i < codigos.length; i += 200) {
    const { data, error } = await sb.from("amostras").select("id, codigo").in("codigo", codigos.slice(i, i + 200));
    if (error) throw new Error(erroPt(error, "amostras"));
    for (const a of (data ?? []) as { id: string; codigo: string }[]) ids.set(a.codigo, a.id);
  }
  r.semAmostra = codigos.filter((c) => !ids.has(c));
  const ensaios = plano.ensaios.filter((e) => ids.has(e.codigo));

  // sistemas novos (só os usados por discos que existem)
  const usados = new Set(ensaios.filter((e) => !e.id_sistema).map((e) => e.assinatura));
  const sisId = new Map<string, string>();
  for (const s of plano.sistemasNovos.filter((x) => usados.has(x.assinatura))) {
    const { assinatura, ...linha } = s;
    const { data, error } = await sb.from("sistemas_acidos").insert(linha).select("id_sistema").single();
    if (error) throw new Error(erroPt(error, `sistema ${s.nome_sistema}`));
    sisId.set(assinatura, (data as { id_sistema: string }).id_sistema);
    r.sistemasCriados.push((data as { id_sistema: string }).id_sistema);
  }

  // ensaio "do controle" já existente por disco
  const existentes = new Map<string, Record<string, unknown>>();
  const amIds = ensaios.map((e) => ids.get(e.codigo)!);
  for (let i = 0; i < amIds.length; i += 200) {
    const { data, error } = await sb.from("analise_rda").select("id, amostra_id, id_sistema, temperatura_c, rotacao_rpm, texto_utilizacao")
      .in("amostra_id", amIds.slice(i, i + 200)).eq("origem_registro", "controle");
    if (error) throw new Error(erroPt(error, "analise_rda"));
    for (const x of (data ?? []) as Record<string, unknown>[]) existentes.set(x.amostra_id as string, x);
  }

  const novos: Record<string, unknown>[] = [];
  for (const e of ensaios) {
    const linha = {
      id_sistema: e.id_sistema ?? sisId.get(e.assinatura)!, temperatura_c: e.temperatura_c, rotacao_rpm: e.rotacao_rpm,
      texto_utilizacao: e.texto_utilizacao,
    };
    const ex = existentes.get(ids.get(e.codigo)!);
    if (!ex) { novos.push({ amostra_id: ids.get(e.codigo), origem_registro: "controle", tipo_variavel: "rotação (RDA)", ...linha }); continue; }
    const mesmoNum = (a: unknown, b: unknown) => (a == null && b == null) || (a != null && b != null && Number(a) === Number(b));
    if (ex.id_sistema === linha.id_sistema && ex.texto_utilizacao === linha.texto_utilizacao &&
        mesmoNum(ex.temperatura_c, linha.temperatura_c) && mesmoNum(ex.rotacao_rpm, linha.rotacao_rpm)) { r.iguais++; continue; }
    // só as condições vindas do controle; taxa, série e resultado lançados no painel ficam como estão
    const { error } = await sb.from("analise_rda").update(linha).eq("id", ex.id as number);
    if (error) throw new Error(erroPt(error, `analise_rda (${e.codigo})`));
    r.atualizados++;
  }
  for (let i = 0; i < novos.length; i += 100) {
    const { error } = await sb.from("analise_rda").insert(novos.slice(i, i + 100));
    if (error) throw new Error(erroPt(error, "analise_rda"));
    r.inseridos += Math.min(100, novos.length - i);
  }
  return r;
}

// ---------------------------------------------------------------------------
// Lançar o resultado num ensaio "aguardando resultado" (atualiza a MESMA linha; não cria outra)
// ---------------------------------------------------------------------------
export interface ResultadoDoEnsaio {
  taxa_reacao_mol_cm2_s?: number | null;
  /** curva [Ca²⁺] (mg/L) × tempo (min): com volume e diâmetro, a taxa é calculada */
  curva_calcio?: { tempo_min: number; ca_mg_l: number }[];
  volume_acido_ml?: number | null; dim_h_in?: number | null; dim_d_in?: number | null;
  pressao_psi?: number | null; tempo_min?: number | null; data_ensaio?: string | null; serie?: string | null;
  coef_difusao_cm2_s?: number | null; metodo_quantificacao?: string | null; responsavel?: string | null; observacoes?: string | null;
}

export async function lancarResultadoRda(sb: SupabaseClient, idAnalise: number, res: ResultadoDoEnsaio) {
  const { data: atual, error: e0 } = await sb.from("analise_rda").select("id, amostra_id").eq("id", idAnalise).single();
  if (e0) throw new Error(erroPt(e0, "analise_rda"));
  const { curva_calcio, ...campos } = res;
  const calc = curva_calcio?.length && res.volume_acido_ml && res.dim_h_in
    ? taxaPelaCurvaCalcio(curva_calcio, res.volume_acido_ml, res.dim_h_in) : null;
  if (!calc && campos.taxa_reacao_mol_cm2_s == null) throw new Error("Informe a taxa ou a curva de cálcio com volume de ácido e diâmetro do disco.");
  const linha: Record<string, unknown> = Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined));
  if (calc) Object.assign(linha, { taxa_reacao_mol_cm2_s: calc.taxa_mol_cm2_s, taxa_calculada: true, area_cm2: calc.area_cm2 });
  else linha.taxa_calculada = false;
  const { error } = await sb.from("analise_rda").update(linha).eq("id", idAnalise);
  if (error) throw new Error(erroPt(error, "analise_rda"));
  if (curva_calcio?.length) {
    const amostra_id = (atual as { amostra_id: string }).amostra_id;
    const { data: c, error: e2 } = await sb.from("curvas").insert({
      amostra_id, analise_tabela: "analise_rda", analise_id: idAnalise, nome: "[Ca²⁺] × tempo (RDA)",
      x_grandeza: "Tempo", x_unidade: "min", y_grandeza: "[Ca²⁺]", y_unidade: "mg/L",
    }).select("id").single();
    if (e2) throw new Error(erroPt(e2, "curvas"));
    const { error: e3 } = await sb.from("curva_pontos").insert(curva_calcio.map((q, i) => ({ curva_id: (c as { id: number }).id, ordem: i, x: q.tempo_min, y: q.ca_mg_l })));
    if (e3) throw new Error(erroPt(e3, "curva_pontos"));
  }
  return { taxa_mol_cm2_s: (linha.taxa_reacao_mol_cm2_s as number) ?? null, calculada: !!calc, r2: calc?.r2 ?? null };
}
