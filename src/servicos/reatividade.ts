import { supabase } from "../lib/supabase";
import { URL_GRAFICOS } from "./graficos";
import type {
  ConfigGraficoReatividade,
  ReatividadeEnsaio,
  ReatividadeEnsaioComDetalhes,
  ReatividadePonto,
} from "../tipos/banco";

export interface ResumoEstagioDashboard {
  estagio_ordem: 1 | 2 | 3 | 4;
  rotulo: string;
  tempo_contato_s: number;
  n_replicas: number;
  perda_media_pct: number;
  perda_dp_pct: number;
  ca_media_mol_l: number | null;
  ca_dp_mol_l: number;
  mg_media_mol_l: number | null;
  mg_dp_mol_l: number;
  h_media_mol_l: number | null;
  h_dp_mol_l: number;
}

export interface PontoLogLog {
  estagio_ordem: number;
  fracao_t50: number;
  tempo_medio_s: number;
  m0_media_g: number;
  mf_media_g: number;
  log_tempo: number;
  log_m0: number;
  log_mf: number;
}

/** Por estágio: médias de tempo, massa inicial e final das réplicas e o log10 de cada média. */
export function calcularLogLog(pontos: ReatividadePonto[]): PontoLogLog[] {
  const saida: PontoLogLog[] = [];
  for (const ordem of [1, 2, 3, 4]) {
    const g = pontos.filter(
      (p) => p.estagio_ordem === ordem && Number(p.tempo_contato_s) > 0 && Number(p.massa_inicial_g) > 0 && Number(p.massa_final_g) > 0,
    );
    if (g.length === 0) continue;
    const tempo = media(g.map((p) => Number(p.tempo_contato_s)));
    const m0 = media(g.map((p) => Number(p.massa_inicial_g)));
    const mf = media(g.map((p) => Number(p.massa_final_g)));
    saida.push({
      estagio_ordem: ordem, fracao_t50: Number(g[0].fracao_t50),
      tempo_medio_s: tempo, m0_media_g: m0, mf_media_g: mf,
      log_tempo: Math.log10(tempo), log_m0: Math.log10(m0), log_mf: Math.log10(mf),
    });
  }
  return saida;
}

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const dpAmostral = (v: number[]) => {
  if (v.length < 2) return 0;
  const m = media(v);
  return Math.sqrt(v.reduce((acc, x) => acc + (x - m) ** 2, 0) / (v.length - 1));
};

function molAA(
  abs: number | null,
  fd: number | null,
  slope: number | null,
  intercept: number | null,
  mm: number,
): number | null {
  if (abs == null || !Number.isFinite(Number(abs)) || !slope || Number(slope) === 0) return null;
  const cMgL = ((Number(abs) - Number(intercept ?? 0)) / Number(slope)) * Number(fd ?? 1);
  return Math.max(0, cMgL / (mm * 1000));
}

export function resumirEstagiosEnsaio(e: ReatividadeEnsaio, pontos: ReatividadePonto[]): ResumoEstagioDashboard[] {
  const h0 = Number(e.h_inicial_mol_l ?? 4.4);
  const mmCa = Number(e.massa_molar_ca ?? 40.078);
  const mmMg = Number(e.massa_molar_mg ?? 24.305);
  const sCa = e.cal_ca_slope != null ? Number(e.cal_ca_slope) : 0.0383;
  const iCa = e.cal_ca_intercept != null ? Number(e.cal_ca_intercept) : 0.0037;
  const sMg = e.cal_mg_slope != null ? Number(e.cal_mg_slope) : null;
  const iMg = e.cal_mg_intercept != null ? Number(e.cal_mg_intercept) : 0;
  const incluirMg = e.litologia === "dolomita";

  return ([1, 2, 3, 4] as const).map((ordem) => {
    const grupo = pontos.filter((p) => Number(p.estagio_ordem) === ordem);
    const fracao = Number(grupo[0]?.fracao_t50 ?? ordem * 0.25);
    const tempoS = grupo.length ? Math.round(media(grupo.map((p) => Number(p.tempo_contato_s)))) : 0;
    const perdas = grupo
      .filter((p) => Number(p.massa_inicial_g) > 0)
      .map((p) => ((Number(p.massa_inicial_g) - Number(p.massa_final_g)) / Number(p.massa_inicial_g)) * 100);
    const somaM0 = grupo.reduce((acc, p) => acc + Number(p.massa_inicial_g), 0);
    const somaDm = grupo.reduce((acc, p) => acc + (Number(p.massa_inicial_g) - Number(p.massa_final_g)), 0);
    const perdaMedia =
      e.modo_calculo_pct === "razao_medias" && somaM0 > 0 ? (somaDm / somaM0) * 100 : media(perdas);

    const cas: number[] = [];
    const mgs: number[] = [];
    const hs: number[] = [];
    for (const p of grupo) {
      const ca = molAA(p.abs_ca, p.fator_diluicao_ca, sCa, iCa, mmCa);
      const mg = incluirMg ? molAA(p.abs_mg, p.fator_diluicao_mg, sMg, iMg, mmMg) : 0;
      if (ca != null) {
        cas.push(ca);
        if (incluirMg && mg != null) mgs.push(mg);
        hs.push(h0 - 2 * (ca + (mg ?? 0)));
      }
    }

    return {
      estagio_ordem: ordem,
      rotulo: `T${ordem} (${Math.round(fracao * 100)}%·t50)`,
      tempo_contato_s: tempoS,
      n_replicas: grupo.length,
      perda_media_pct: perdaMedia,
      perda_dp_pct: dpAmostral(perdas),
      ca_media_mol_l: cas.length ? media(cas) : null,
      ca_dp_mol_l: dpAmostral(cas),
      mg_media_mol_l: incluirMg && mgs.length ? media(mgs) : null,
      mg_dp_mol_l: incluirMg ? dpAmostral(mgs) : 0,
      h_media_mol_l: hs.length ? media(hs) : null,
      h_dp_mol_l: dpAmostral(hs),
    };
  });
}

/** Consulta os ensaios de reatividade de uma amostra; falha silenciosamente caso a tabela não exista. */
export async function listarReatividadeDaAmostra(amostraId: string): Promise<ReatividadeEnsaioComDetalhes[]> {
  try {
    // 027: a amostra pode ser a rocha do ensaio ou um mini-plug de uma réplica/teste piloto
    const vinc = await supabase
      .from("v_reatividade_ensaios_amostra")
      .select("ensaio_id")
      .eq("amostra_id", amostraId);
    const consulta = supabase.from("reatividade_ensaios").select("*").order("created_at", { ascending: false });
    const { data, error } = vinc.error
      ? await consulta.eq("amostra_id", amostraId) // banco ainda sem a 027
      : await consulta.in("id", [...new Set(((vinc.data ?? []) as { ensaio_id: string }[]).map((v) => v.ensaio_id))]);
    if (error || !data || data.length === 0) return [];

    const ensaios = data as ReatividadeEnsaio[];
    const ids = ensaios.map((e) => e.id);
    const sisIds = [...new Set(ensaios.map((e) => e.id_sistema).filter(Boolean))] as string[];

    const [rPts, rSis] = await Promise.all([
      supabase.from("reatividade_pontos").select("*").in("ensaio_id", ids).order("estagio_ordem").order("replica"),
      sisIds.length > 0
        ? supabase.from("sistemas_acidos").select("id_sistema, nome_sistema").in("id_sistema", sisIds)
        : Promise.resolve({ data: [] as { id_sistema: string; nome_sistema: string }[] }),
    ]);

    const ptsPorEnsaio = new Map<string, ReatividadePonto[]>();
    for (const p of (rPts.data ?? []) as ReatividadePonto[]) {
      const arr = ptsPorEnsaio.get(p.ensaio_id) ?? [];
      arr.push(p);
      ptsPorEnsaio.set(p.ensaio_id, arr);
    }
    const nomeSis = new Map<string, string>(
      ((rSis.data ?? []) as { id_sistema: string; nome_sistema: string }[]).map((s) => [s.id_sistema, s.nome_sistema]),
    );

    return ensaios.map((e) => ({
      ...e,
      pontos: ptsPorEnsaio.get(e.id) ?? [],
      sistema_nome: e.id_sistema ? nomeSis.get(e.id_sistema) ?? e.id_sistema : null,
    }));
  } catch {
    return [];
  }
}

/** Lista geral de ensaios REA-#### e RDA-#### para a listagem de ensaios (falha silenciosamente). */
export async function listarTodosEnsaiosReatividade(): Promise<ReatividadeEnsaioComDetalhes[]> {
  try {
    const { data, error } = await supabase
      .from("reatividade_ensaios")
      .select("*")
      .order("created_at", { ascending: false });
    if (error || !data || data.length === 0) return [];

    const ensaios = data as ReatividadeEnsaio[];
    const amIds = [...new Set(ensaios.map((e) => e.amostra_id).filter(Boolean))] as string[];
    const sisIds = [...new Set(ensaios.map((e) => e.id_sistema).filter(Boolean))] as string[];

    const [rAm, rSis] = await Promise.all([
      amIds.length > 0
        ? supabase.from("amostras").select("id, codigo").in("id", amIds)
        : Promise.resolve({ data: [] as { id: string; codigo: string }[] }),
      sisIds.length > 0
        ? supabase.from("sistemas_acidos").select("id_sistema, nome_sistema").in("id_sistema", sisIds)
        : Promise.resolve({ data: [] as { id_sistema: string; nome_sistema: string }[] }),
    ]);

    const codAm = new Map<string, string>(
      ((rAm.data ?? []) as { id: string; codigo: string }[]).map((a) => [a.id, a.codigo]),
    );
    const nomeSis = new Map<string, string>(
      ((rSis.data ?? []) as { id_sistema: string; nome_sistema: string }[]).map((s) => [s.id_sistema, s.nome_sistema]),
    );

    return ensaios.map((e) => ({
      ...e,
      pontos: [],
      amostra_codigo: e.amostra_id ? codAm.get(e.amostra_id) ?? null : null,
      sistema_nome: e.id_sistema ? nomeSis.get(e.id_sistema) ?? e.id_sistema : null,
    }));
  } catch {
    return [];
  }
}

export type TipoGraficoReatividade = "t50" | "perda_massa" | "log_log" | "aa";

export async function buscarGraficoReatividadeOrigin(
  ensaio: ReatividadeEnsaioComDetalhes,
  tipo: TipoGraficoReatividade,
  formato: "png" | "svg" | "pdf",
  dpi = 150,
  sinal?: AbortSignal,
): Promise<Blob | null> {
  const cfg: ConfigGraficoReatividade = ensaio.config_grafico ?? {};
  const estilo = {
    fonte: cfg.font_family ?? "Arial",
    tamanho_fonte: 10,
    largura_cm: 16.5,
    altura_cm: 12.0,
    dpi,
    formato,
    mostrar_barras_erro: cfg.show_error_bars ?? true,
    mostrar_reta_ajuste: cfg.show_trendline ?? true,
    legend_xy: cfg.legend_xy ?? [0.04, 0.94],
    legend_frame: cfg.legend_frame ?? true,
    legend_fontsize: cfg.legend_fontsize ?? 9,
  };

  let rota = "";
  let corpo: unknown = null;

  if (tipo === "t50") {
    if (
      ensaio.m0_sondagem_g == null ||
      ensaio.tempo_sondagem_min == null ||
      ensaio.mf_sondagem_g == null ||
      Number(ensaio.mf_sondagem_g) >= Number(ensaio.m0_sondagem_g)
    ) {
      return null;
    }
    rota = "/reatividade/grafico-t50";
    corpo = {
      m0_g: Number(ensaio.m0_sondagem_g),
      tempo_min: Number(ensaio.tempo_sondagem_min),
      mf_g: Number(ensaio.mf_sondagem_g),
      estilo,
    };
  } else {
    const estagios = resumirEstagiosEnsaio(ensaio, ensaio.pontos);
    if (tipo === "perda_massa") {
      const validos = estagios.filter((s) => s.n_replicas > 0);
      if (validos.length === 0) return null;
      const zero = cfg.partir_do_zero ? [0] : [];
      rota = "/reatividade/grafico-perda-massa";
      corpo = {
        series: [
          {
            nome: `${ensaio.codigo}${ensaio.sistema_nome ? ` · ${ensaio.sistema_nome}` : ""}`,
            cor: "#1f4e78",
            marcador: "s",
            estilo_linha: "-",
            x_valores: [...zero, ...validos.map((s) => s.tempo_contato_s)],
            y_medias_pct: [...zero, ...validos.map((s) => s.perda_media_pct)],
            y_desvios_pct: [...zero, ...validos.map((s) => s.perda_dp_pct)],
            incluir_zero_na_reta: Boolean(cfg.partir_do_zero),
          },
        ],
        estilo: { ...estilo, eixos_do_zero: Boolean(cfg.partir_do_zero) },
      };
    } else if (tipo === "log_log") {
      const log = calcularLogLog(ensaio.pontos);
      if (log.length === 0) return null;
      const serie = (nome: string, cor: string, marcador: string, y: number[]) => ({
        nome, cor, marcador, estilo_linha: "-",
        x_valores: log.map((p) => p.tempo_medio_s),
        y_medias_pct: y,
        y_desvios_pct: y.map(() => 0),
        incluir_zero_na_reta: true,
      });
      rota = "/reatividade/grafico-perda-massa";
      corpo = {
        series: [
          serie("Massa inicial (média)", "#1f4e78", "s", log.map((p) => p.log_m0)),
          serie("Massa final (média)", "#b81d24", "o", log.map((p) => p.log_mf)),
        ],
        estilo: {
          ...estilo,
          titulo: "Log da massa × tempo",
          eixo_x: "Tempo médio (s)",
          eixo_y: "$\\log_{10}$ [massa média (g)]",
          mostrar_barras_erro: false,
        },
      };
    } else {
      const comAA = estagios.filter((s) => s.ca_media_mol_l != null && s.h_media_mol_l != null);
      if (comAA.length === 0) return null;
      const temMg = ensaio.litologia === "dolomita" && comAA.every((s) => s.mg_media_mol_l != null);
      rota = "/reatividade/grafico-absorcao-atomica";
      corpo = {
        rotulos_x: comAA.map((s) => s.rotulo),
        ca_medias_mol_l: comAA.map((s) => s.ca_media_mol_l ?? 0),
        ca_desvios_mol_l: comAA.map((s) => s.ca_dp_mol_l),
        mg_medias_mol_l: temMg ? comAA.map((s) => s.mg_media_mol_l ?? 0) : null,
        mg_desvios_mol_l: temMg ? comAA.map((s) => s.mg_dp_mol_l) : null,
        h_medias_mol_l: comAA.map((s) => s.h_media_mol_l ?? 0),
        h_desvios_mol_l: comAA.map((s) => s.h_dp_mol_l),
        estilo,
      };
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  const r = await fetch(`${URL_GRAFICOS}${rota}`, {
    method: "POST",
    headers,
    body: JSON.stringify(corpo),
    signal: sinal,
  });
  if (!r.ok) {
    throw new Error(`Serviço de gráficos respondeu HTTP ${r.status}`);
  }
  return await r.blob();
}
