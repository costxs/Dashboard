// =============================================================================
// Gravação da reatividade no banco (migração 023 / 029):
//   - gravarBoletimRda: um disco (analise_rda + rda_leituras + curvas numéricas + sincronização opcional
//     do cadastro físico da amostra e petrofísica antes/depois);
//     se o disco já tem o ensaio "aguardando resultado" criado pela planilha de controle, ATUALIZA esse.
//   - calcularEGravarSerie: junta os discos da série, calcula slope, Sc e D e grava em rda_series.
//   - cadastrarEstatica: miniplug (novo ou existente) + ensaio de dissolução estática, tudo ou nada.
// =============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizaComponente } from "../importador/planilhaBdd";
import { calcularBoletim, calcularSerie, type EntradaBoletim, type ResultadoBoletim, type ResultadoSerie } from "./calculoRda";
import type { BoletimLido } from "./lerBoletimRda";

type Erro = { code?: string; message: string };
const pt = (e: Erro, onde: string) =>
  new Error(e.code === "42501" ? `${onde}: sem permissão (é preciso ser editor do projeto da amostra)`
    : e.code === "23503" ? `${onde}: referência inexistente (${e.message})`
    : e.code === "23505" ? `${onde}: já existe (${e.message})` : `${onde}: ${e.message}`);

/** Sistema ácido do boletim ("Ácido acético", 10 wt%) para achar no catálogo com acharSistemaIgual. */
export function sistemaDoBoletim(b: Pick<BoletimLido, "fluido" | "conc_wt_pct">) {
  const comp = normalizaComponente(b.fluido);
  return comp ? { componente_1: comp, valor_1: b.conc_wt_pct, unidade_1: "wt%", nome_sistema: `${comp} ${b.conc_wt_pct ?? ""} wt%`.trim() } : null;
}

export interface GravarBoletim {
  amostra_id: string;
  id_sistema: string;
  serie?: string | null;
  rotacao_rpm: number;
  temperatura_c?: number | null;
  pressao_psi?: number | null;
  permeabilidade_md?: number | null;
  entrada: EntradaBoletim;
  /** se não vier, é calculado aqui */
  resultado?: ResultadoBoletim;
  boletim?: BoletimLido | null;
  data_ensaio?: string | null;
  responsavel?: string | null;
  observacoes?: string | null;
  /** atualizar este ensaio em vez de procurar/criar */
  analise_id?: number | null;
  /** grava também curvas [Ca²⁺] × tempo e [Mg²⁺] × tempo em curvas/curva_pontos */
  incluirCurvasIons?: boolean;
  /** sincroniza dimensões/massa/status em amostras e porosidade/permeabilidade/massas em analise_petrofisica */
  sincronizarAmostra?: boolean;
}

export async function gravarBoletimRda(sb: SupabaseClient, g: GravarBoletim) {
  const r = g.resultado ?? calcularBoletim(g.entrada);
  if (r.avisos.some((a) => a.severidade === "ERRO")) throw new Error(`Boletim com erro: ${r.avisos.filter((a) => a.severidade === "ERRO").map((a) => a.mensagem).join("; ")}`);
  const e = g.entrada, b = g.boletim;
  const janela = e.tempoMaximo_s != null ? `0–${e.tempoMaximo_s} s` : `0–${Math.max(...e.leituras.map((l) => l.tempo_s))} s`;

  const detalhesFluido = [
    b?.fluido ? `Fluido: ${b.fluido}${b.conc_wt_pct != null ? ` (${b.conc_wt_pct} wt%)` : ""}` : null,
    b?.densidade_g_ml != null ? `ρ=${b.densidade_g_ml} g/mL` : null,
    b?.massa_molar_fluido != null ? `MM=${b.massa_molar_fluido} g/mol` : null,
    (g.permeabilidade_md ?? b?.permeabilidade_md) != null ? `K=${g.permeabilidade_md ?? b?.permeabilidade_md} mD` : null,
    ...Object.entries(b?.extras ?? {}).map(([k, v]) => `${k}: ${v}`),
  ].filter(Boolean);

  const obsBase = g.observacoes ?? b?.observacoes;
  const linha = {
    id_sistema: g.id_sistema, serie: g.serie ?? null, tipo_variavel: "rotação (RDA)",
    rotacao_rpm: g.rotacao_rpm, temperatura_c: g.temperatura_c ?? b?.temperatura_c ?? null, pressao_psi: g.pressao_psi ?? null,
    dim_h_in: e.diametro_cm / 2.54, dim_d_in: b?.comprimento_cm != null ? b.comprimento_cm / 2.54 : null,
    tempo_min: Math.max(...e.leituras.map((l) => l.tempo_s)) / 60,
    volume_acido_ml: e.volume_acido_ml ?? null, area_cm2: r.area_cm2, area_corrigida_cm2: r.area_corrigida_cm2,
    taxa_reacao_mol_cm2_s: r.taxa_reacao, taxa_calculada: true, taxa_so_ca: r.taxa_so_ca, taxa_ca_mg: r.taxa_ca_mg,
    inclinacao_h: r.inclinacao_h, r2_h: r.r2_h, n_pontos: r.n_pontos, tempo_maximo_s: e.tempoMaximo_s ?? null,
    mineral: e.mineral, porosidade_pct: e.porosidade_pct, massa_antes_g: e.massa_antes_g ?? null, massa_depois_g: e.massa_depois_g ?? null,
    conc_inicial_mol_l: e.c0_mol_l, calibracao_ca: e.calCa, calibracao_mg: e.calMg ?? null,
    metodo_quantificacao: e.calMg ? "RDA / AAS (Ca e Mg)" : "RDA / AAS (Ca)",
    metodo_taxa: `boletim: 2·|d[H+]/dt| / área corrigida (${janela})${e.mineral === "dolomita" ? ", dolomita: só Ca (4 H+ por Ca)" : ""}`,
    estudo: b?.estudo ?? null, operadores: b?.operadores ?? null, data_inicio: b?.data_inicio ?? null, data_fim: b?.data_fim ?? null,
    data_ensaio: g.data_ensaio ?? b?.data_inicio ?? null, responsavel: g.responsavel ?? b?.boletim_por ?? b?.operadores ?? null,
    observacoes: [obsBase, ...detalhesFluido].filter(Boolean).join(" · ") || null,
  };

  // ensaio a atualizar: o informado, ou o "aguardando resultado" do controle, ou o mesmo disco na mesma rotação sem taxa
  let id = g.analise_id ?? null;
  if (id == null) {
    const { data, error } = await sb.from("analise_rda").select("id, origem_registro, taxa_reacao_mol_cm2_s, rotacao_rpm").eq("amostra_id", g.amostra_id);
    if (error) throw pt(error, "analise_rda");
    const ex = (data ?? []) as { id: number; origem_registro: string; taxa_reacao_mol_cm2_s: number | null; rotacao_rpm: number | null }[];
    id = ex.find((x) => x.origem_registro === "controle" && x.taxa_reacao_mol_cm2_s == null)?.id
      ?? ex.find((x) => x.taxa_reacao_mol_cm2_s == null && Number(x.rotacao_rpm) === g.rotacao_rpm)?.id ?? null;
  }
  if (id != null) {
    const { error } = await sb.from("analise_rda").update(linha).eq("id", id);
    if (error) throw pt(error, "analise_rda");
    const del = await sb.from("rda_leituras").delete().eq("analise_id", id);
    if (del.error) throw pt(del.error, "rda_leituras");
  } else {
    const { data, error } = await sb.from("analise_rda").insert({ amostra_id: g.amostra_id, origem_registro: "formulario", ...linha }).select("id").single();
    if (error) throw pt(error, "analise_rda");
    id = Number((data as { id: number }).id);
  }
  const { error: e2 } = await sb.from("rda_leituras").insert(r.pontos.map((p, i) => ({
    analise_id: id, ordem: i, rotulo: p.rotulo ?? null, tempo_s: p.tempo_s, abs_ca: p.abs_ca, abs_mg: p.abs_mg ?? null,
    ca_mol_l: p.ca_mol_l, mg_mol_l: p.mg_mol_l, h_mol_l: p.h_mol_l, usado: p.usado,
  })));
  if (e2) throw pt(e2, "rda_leituras");

  // curvas numéricas (os gráficos genéricos da ficha leem curvas/curva_pontos)
  const velhas = await sb.from("curvas").select("id").eq("analise_tabela", "analise_rda").eq("analise_id", id);
  if (velhas.error) throw pt(velhas.error, "curvas");
  for (const c of (velhas.data ?? []) as { id: number }[]) await sb.from("curvas").delete().eq("id", c.id);

  let nCurvas = 0;
  const inserirCurvaRda = async (nome: string, yGrandeza: string, yUnidade: string, pts: { x: number; y: number }[]) => {
    if (!pts.length) return;
    const { data: c, error: e3 } = await sb.from("curvas").insert({
      amostra_id: g.amostra_id, analise_tabela: "analise_rda", analise_id: id, nome,
      x_grandeza: "Tempo", x_unidade: "s", y_grandeza: yGrandeza, y_unidade: yUnidade,
    }).select("id").single();
    if (e3) throw pt(e3, "curvas");
    const { error: e4 } = await sb.from("curva_pontos").insert(pts.map((p, i) => ({ curva_id: (c as { id: number }).id, ordem: i, x: p.x, y: p.y })));
    if (e4) throw pt(e4, "curva_pontos");
    nCurvas += 1;
  };

  const campoH = e.mineral === "dolomita" ? "h_so_ca_mol_l" : "h_mol_l";
  const pontosH = r.pontos.filter((p) => p[campoH] != null).map((p) => ({ x: p.tempo_s, y: p[campoH] as number }));
  await inserirCurvaRda("[H⁺] × tempo (RDA)", "[H⁺]", "mol/L", pontosH);

  if (g.incluirCurvasIons) {
    const pontosCa = r.pontos.filter((p) => p.ca_mol_l != null).map((p) => ({ x: p.tempo_s, y: p.ca_mol_l as number }));
    await inserirCurvaRda("[Ca²⁺] × tempo (RDA)", "[Ca²⁺]", "mol/L", pontosCa);
    const pontosMg = r.pontos.filter((p) => p.mg_mol_l != null && Number(p.mg_mol_l) > 0).map((p) => ({ x: p.tempo_s, y: p.mg_mol_l as number }));
    await inserirCurvaRda("[Mg²⁺] × tempo (RDA)", "[Mg²⁺]", "mol/L", pontosMg);
  }

  let amostraAtualizada = false;
  let petrofisicaSincronizada = false;

  if (g.sincronizarAmostra) {
    const { data: amAtual } = await sb.from("amostras")
      .select("diametro_cm, comprimento_cm, massa_seca_g, tipo_amostra, finalidade, status, responsavel, permeabilidade_fabricante_md")
      .eq("id", g.amostra_id).maybeSingle();
    if (amAtual) {
      const am = amAtual as Record<string, unknown>;
      const permMd = g.permeabilidade_md ?? b?.permeabilidade_md ?? null;
      const patchAmostra: Record<string, unknown> = {
        diametro_cm: e.diametro_cm || am.diametro_cm || null,
        comprimento_cm: b?.comprimento_cm ?? am.comprimento_cm ?? null,
        massa_seca_g: am.massa_seca_g ?? e.massa_antes_g ?? null,
        tipo_amostra: am.tipo_amostra || "disco",
        finalidade: am.finalidade || "RDA",
        status: "utilizada",
        responsavel: am.responsavel || g.responsavel || b?.operadores || null,
      };
      if (am.permeabilidade_fabricante_md == null && permMd != null) {
        patchAmostra.permeabilidade_fabricante_md = permMd;
      }
      const { error: errAm } = await sb.from("amostras").update(patchAmostra).eq("id", g.amostra_id);
      if (!errAm) amostraAtualizada = true;
    }

    const permMd = g.permeabilidade_md ?? b?.permeabilidade_md ?? null;
    if (e.porosidade_pct != null || permMd != null || e.massa_antes_g != null || e.massa_depois_g != null) {
      const { data: petros } = await sb.from("analise_petrofisica")
        .select("id, momento, porosidade_pct, permeabilidade_gas_md, permeabilidade_liquido_md, massa_g")
        .eq("amostra_id", g.amostra_id);
      const listaPetro = (petros ?? []) as {
        id: number; momento: string; porosidade_pct: number | null;
        permeabilidade_gas_md: number | null; permeabilidade_liquido_md: number | null; massa_g: number | null;
      }[];

      if (e.porosidade_pct != null || permMd != null || e.massa_antes_g != null) {
        const antes = listaPetro.find((x) => x.momento === "antes");
        if (!antes) {
          const { error: errP1 } = await sb.from("analise_petrofisica").insert({
            amostra_id: g.amostra_id,
            momento: "antes",
            data_ensaio: g.data_ensaio ?? b?.data_inicio ?? null,
            porosidade_pct: e.porosidade_pct ?? null,
            permeabilidade_gas_md: permMd,
            massa_g: e.massa_antes_g ?? null,
            responsavel: g.responsavel ?? b?.operadores ?? null,
            observacoes: "Registrado automaticamente a partir do boletim de RDA",
          });
          if (!errP1) petrofisicaSincronizada = true;
        } else {
          const patchAntes: Record<string, unknown> = {};
          if (antes.porosidade_pct == null && e.porosidade_pct != null) patchAntes.porosidade_pct = e.porosidade_pct;
          if (antes.permeabilidade_gas_md == null && antes.permeabilidade_liquido_md == null && permMd != null) {
            patchAntes.permeabilidade_gas_md = permMd;
          }
          if (antes.massa_g == null && e.massa_antes_g != null) patchAntes.massa_g = e.massa_antes_g;
          if (Object.keys(patchAntes).length > 0) {
            const { error: errP1 } = await sb.from("analise_petrofisica").update(patchAntes).eq("id", antes.id);
            if (!errP1) petrofisicaSincronizada = true;
          }
        }
      }

      if (e.massa_depois_g != null) {
        const depois = listaPetro.find((x) => x.momento === "depois");
        if (!depois) {
          const { error: errP2 } = await sb.from("analise_petrofisica").insert({
            amostra_id: g.amostra_id,
            momento: "depois",
            data_ensaio: b?.data_fim ?? g.data_ensaio ?? null,
            massa_g: e.massa_depois_g,
            responsavel: g.responsavel ?? b?.operadores ?? null,
            observacoes: "Massa pós-ensaio registrada a partir do boletim de RDA",
          });
          if (!errP2) petrofisicaSincronizada = true;
        } else if (depois.massa_g == null) {
          const { error: errP2 } = await sb.from("analise_petrofisica").update({ massa_g: e.massa_depois_g }).eq("id", depois.id);
          if (!errP2) petrofisicaSincronizada = true;
        }
      }
    }
  }

  return { analise_id: id, resultado: r, amostraAtualizada, petrofisicaSincronizada, nCurvas };
}

export interface GravarSerie {
  projeto_id: string; nome: string;
  litologia?: string | null; id_sistema?: string | null; temperatura_c?: number | null;
  c0_mol_cm3: number; viscosidade_cm2_s: number; fonte_viscosidade?: string | null;
  diametro_cm?: number | null; modo_omega?: "exato" | "planilha"; observacoes?: string | null;
}

/** Junta os discos com analise_rda.serie = nome (do projeto), calcula e grava a série. */
export async function calcularEGravarSerie(sb: SupabaseClient, s: GravarSerie): Promise<{ id: number; resultado: ResultadoSerie }> {
  const { data, error } = await sb.from("v_analise_rda").select("amostra, rotacao_rpm, taxa_reacao_mol_cm2_s, projeto_id, serie, dim_h_in")
    .eq("serie", s.nome).eq("projeto_id", s.projeto_id);
  if (error) throw pt(error, "v_analise_rda");
  const discos = ((data ?? []) as { amostra: string; rotacao_rpm: number; taxa_reacao_mol_cm2_s: number | null; dim_h_in: number | null }[])
    .filter((d) => d.taxa_reacao_mol_cm2_s != null)
    .map((d) => ({ codigo: d.amostra, rotacao_rpm: Number(d.rotacao_rpm), taxa_reacao: Number(d.taxa_reacao_mol_cm2_s) }));
  const diam = s.diametro_cm ?? (((data ?? []) as { dim_h_in: number | null }[]).find((d) => d.dim_h_in)?.dim_h_in ?? null);
  const res = calcularSerie({ discos, c0_mol_cm3: s.c0_mol_cm3, viscosidade_cm2_s: s.viscosidade_cm2_s,
    diametro_cm: s.diametro_cm ?? (diam ? Number(diam) * 2.54 : undefined), modoOmega: s.modo_omega });
  const linha = {
    projeto_id: s.projeto_id, nome: s.nome, litologia: s.litologia ?? null, id_sistema: s.id_sistema ?? null,
    temperatura_c: s.temperatura_c ?? null, c0_mol_cm3: s.c0_mol_cm3, viscosidade_cm2_s: s.viscosidade_cm2_s,
    fonte_viscosidade: s.fonte_viscosidade ?? null, diametro_cm: s.diametro_cm ?? (diam ? Number(diam) * 2.54 : null),
    modo_omega: s.modo_omega ?? "exato", slope: res.slope, intercepto: res.intercepto, r2: res.r2, sc: res.sc,
    d_cm2_s: res.d_cm2_s, residuo_levich: res.residuo_levich, reynolds_max: res.reynolds_max, regime: res.regime,
    avisos: res.avisos, calculado_em: new Date().toISOString(), observacoes: s.observacoes ?? null,
  };
  const { data: g, error: e2 } = await sb.from("rda_series").upsert(linha, { onConflict: "projeto_id,nome" }).select("id").single();
  if (e2) throw pt(e2, "rda_series");
  return { id: Number((g as { id: number }).id), resultado: res };
}

export interface NovaEstatica {
  amostra: { codigo?: string | null; projeto_id?: string; litologia?: string; tipo_origem?: "afloramento" | "testemunho";
    diametro_cm?: number | null; comprimento_cm?: number | null; massa_seca_g?: number | null; amostra_origem?: string | null; observacoes?: string | null };
  ensaio: { data_ensaio?: string | null; id_sistema?: string | null; temperatura_c?: number | null; pressao_psi?: number | null;
    volume_acido_ml?: number | null; tempo_min?: number | null; massa_inicial_g: number; massa_final_g: number;
    area_cm2?: number | null; responsavel?: string | null; observacoes?: string | null };
}

export async function cadastrarEstatica(sb: SupabaseClient, p: NovaEstatica) {
  if (!(p.ensaio.massa_inicial_g > 0)) throw new Error("Informe a massa inicial do miniplug");
  if (p.ensaio.massa_final_g > p.ensaio.massa_inicial_g) throw new Error("A massa final está maior que a inicial: confira");
  const { data, error } = await sb.rpc("estatica_cadastrar", { p });
  if (error) throw pt(error, "dissolução estática");
  return data as { amostra_id: string; codigo: string; amostra_nova: boolean; ensaio_id: number };
}
