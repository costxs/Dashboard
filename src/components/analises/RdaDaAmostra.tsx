import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Disc, FlaskConical, Gauge, Layers, LineChart, RotateCw, Table2, Thermometer } from "lucide-react";
import { GraficoOriginHTempo, type PontoRdaGrafico } from "./GraficoOriginRda";
import { GraficoRda } from "../charts/GraficoRda";
import { Aviso, Carregando, Cartao, Valor } from "../ui/base";
import { useConsulta } from "../../hooks/useConsulta";
import { supabase } from "../../lib/supabase";
import { URL_GRAFICOS } from "../../servicos/graficos";
import { pontosComparacao } from "../../servicos/literatura";
import { fmt, fmtData } from "../../utils/formatacao";

interface CalibracaoJson {
  inclinacao?: number;
  diluicao?: number;
  massaMolar?: number;
  data?: string | null;
}

interface LinhaAnaliseRda {
  id: number;
  amostra_id: string;
  amostra: string;
  litologia: string;
  projeto_id: string;
  id_sistema: string;
  nome_sistema: string;
  acido: string;
  conc_valor: number | null;
  conc_unidade: string | null;
  conc_m: number | null;
  conc_pct: number | null;
  aditivos: string | null;
  temperatura_c: number | null;
  temperatura_nominal_c: number | null;
  pressao_psi: number | null;
  rotacao_rpm: number | null;
  omega_rad_s: number | null;
  raiz_omega: number | null;
  dim_h_in: number | null;
  dim_d_in: number | null;
  volume_acido_ml: number | null;
  area_cm2?: number | null;
  area_corrigida_cm2?: number | null;
  porosidade_pct?: number | null;
  massa_antes_g?: number | null;
  massa_depois_g?: number | null;
  perda_massa_pct?: number | null;
  conc_inicial_mol_l?: number | null;
  taxa_reacao_mol_cm2_s: number | null;
  taxa_reacao_mol_m2_s: number | null;
  taxa_so_ca?: number | null;
  taxa_ca_mg?: number | null;
  inclinacao_h?: number | null;
  r2_h?: number | null;
  n_pontos?: number | null;
  tempo_maximo_s?: number | null;
  mineral?: string | null;
  calibracao_ca?: CalibracaoJson | null;
  calibracao_mg?: CalibracaoJson | null;
  estudo?: string | null;
  operadores?: string | null;
  responsavel?: string | null;
  data_ensaio?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  metodo_quantificacao: string | null;
  metodo_taxa?: string | null;
  serie: string | null;
  tipo_variavel: string | null;
  texto_utilizacao: string | null;
  observacoes: string | null;
  situacao: string | null;
}

interface LeituraRdaBanco {
  analise_id: number;
  ordem: number;
  rotulo: string | null;
  tempo_s: number;
  abs_ca: number | null;
  abs_mg: number | null;
  ca_mol_l: number | null;
  mg_mol_l: number | null;
  h_mol_l: number | null;
  usado: boolean;
}

async function listarRdaLaboratorio(litologia?: string): Promise<LinhaAnaliseRda[]> {
  let q = supabase.from("v_analise_rda").select("*").order("rotacao_rpm", { ascending: true }).order("amostra", { ascending: true });
  if (litologia) q = q.eq("litologia", litologia);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as LinhaAnaliseRda[];
}

async function listarLeiturasDoEnsaio(analiseId?: number | null): Promise<LeituraRdaBanco[]> {
  if (!analiseId) return [];
  const { data, error } = await supabase
    .from("rda_leituras")
    .select("*")
    .eq("analise_id", analiseId)
    .order("ordem", { ascending: true });
  if (error) return [];
  return (data ?? []) as LeituraRdaBanco[];
}

async function obterTokenSessao(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function fmtCalibracao(cal: CalibracaoJson | null | undefined): string {
  if (!cal || cal.inclinacao == null) return "—";
  const partes = [`k = ${fmt(cal.inclinacao, 4)} L/mg`];
  if (cal.diluicao != null) partes.push(`dil. ${fmt(cal.diluicao, 0)}×`);
  if (cal.data) partes.push(fmtData(cal.data));
  return partes.join(" · ");
}

export function RdaDaAmostra({
  codigo,
  projetoId,
  litologia,
}: {
  codigo?: string;
  projetoId?: string;
  litologia?: string;
}) {
  const navigate = useNavigate();
  const rdaLab = useConsulta(() => listarRdaLaboratorio(litologia), [litologia]);
  const pontos = useConsulta(() => pontosComparacao(litologia ? { litologias: [litologia] } : {}), [litologia]);

  const meusEnsaios = useMemo(
    () => (rdaLab.dados ?? []).filter((r) => r.amostra === codigo),
    [rdaLab.dados, codigo],
  );
  const [idxSelecionado, setIdxSelecionado] = useState(0);
  const [mostrarTabelaLeituras, setMostrarTabelaLeituras] = useState(true);

  const meuEnsaio = meusEnsaios[idxSelecionado] ?? meusEnsaios[0] ?? null;
  const leituras = useConsulta(() => listarLeiturasDoEnsaio(meuEnsaio?.id), [meuEnsaio?.id]);

  const graficoBoletim = useMemo(() => {
    const lista = leituras.dados ?? [];
    if (!lista.length) return null;
    const paraPonto = (l: LeituraRdaBanco): PontoRdaGrafico => ({
      x: Number(l.tempo_s),
      y: Number(l.h_mol_l ?? 0),
      rotulo: l.rotulo,
      abs_ca: l.abs_ca != null ? Number(l.abs_ca) : null,
      abs_mg: l.abs_mg != null ? Number(l.abs_mg) : null,
      ca_mol_l: l.ca_mol_l != null ? Number(l.ca_mol_l) : null,
      mg_mol_l: l.mg_mol_l != null ? Number(l.mg_mol_l) : null,
      h_mol_l: l.h_mol_l != null ? Number(l.h_mol_l) : null,
      usado: l.usado !== false,
    });
    const comH = lista.filter((l) => l.h_mol_l != null);
    if (!comH.length) return null;
    const todos = comH.map(paraPonto);
    const usados = todos.filter((p) => p.usado !== false);
    const fora = todos.filter((p) => p.usado === false);

    let reta: { inclinacao: number; intercepto: number } | null = null;
    if (usados.length >= 2) {
      const mx = usados.reduce((a, p) => a + p.x, 0) / usados.length;
      const my = usados.reduce((a, p) => a + p.y, 0) / usados.length;
      let sxx = 0;
      let sxy = 0;
      for (const p of usados) {
        sxx += (p.x - mx) ** 2;
        sxy += (p.x - mx) * (p.y - my);
      }
      if (sxx > 0) {
        const inclinacao = sxy / sxx;
        reta = { inclinacao, intercepto: my - inclinacao * mx };
      }
    }
    return { usados, fora, todos, reta };
  }, [leituras.dados]);

  const discosDaMesmaCondicao = useMemo(() => {
    if (!meuEnsaio) return [];
    return (rdaLab.dados ?? []).filter((r) => {
      if (meuEnsaio.serie && r.serie === meuEnsaio.serie) return true;
      return (
        r.id_sistema === meuEnsaio.id_sistema &&
        (r.temperatura_c ?? null) === (meuEnsaio.temperatura_c ?? null)
      );
    });
  }, [rdaLab.dados, meuEnsaio]);

  const { meusPontos, literaturaPontos } = useMemo(() => {
    const todos = pontos.dados ?? [];
    const meus = todos.filter(
      (p) => p.fonte === "lcpetro" && (!codigo || p.rotulo === codigo || (!projetoId || p.projeto_id === projetoId)),
    );
    const acidoAlvo = meuEnsaio?.acido?.toLowerCase();
    const lit = todos.filter(
      (p) => p.fonte === "literatura" && (!acidoAlvo || p.acido?.toLowerCase() === acidoAlvo),
    );
    return { meusPontos: meus, literaturaPontos: lit.length > 0 ? lit : todos.filter((p) => p.fonte === "literatura") };
  }, [pontos.dados, codigo, projetoId, meuEnsaio]);

  if (rdaLab.carregando && !rdaLab.dados) return <Carregando />;

  const modalidade =
    meuEnsaio?.volume_acido_ml != null && meuEnsaio?.rotacao_rpm == null
      ? "Dissolução Estática (D.E)"
      : /fluxo\s+reativo/i.test(meuEnsaio?.texto_utilizacao ?? "")
        ? "Fluxo Reativo"
        : "Disco Rotativo (RDA)";

  const temDadosBoletim = Boolean(
    meuEnsaio &&
      (meuEnsaio.conc_inicial_mol_l != null ||
        meuEnsaio.area_corrigida_cm2 != null ||
        meuEnsaio.massa_antes_g != null ||
        meuEnsaio.r2_h != null ||
        meuEnsaio.calibracao_ca != null),
  );

  return (
    <div className="flex flex-col gap-6">
      {meusEnsaios.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-bold uppercase tracking-wide text-[var(--color-neutral-600)]">Ensaios deste disco:</span>
          {meusEnsaios.map((e, idx) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setIdxSelecionado(idx)}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-all ${
                idx === idxSelecionado
                  ? "border-[var(--color-orange)] bg-[var(--color-orange-50)] text-[var(--color-blue-800)]"
                  : "border-[var(--color-neutral-300)] bg-white text-[var(--color-neutral-700)] hover:border-[var(--color-blue)]"
              }`}
            >
              #{e.id} · {e.id_sistema} · {e.rotacao_rpm != null ? `${fmt(e.rotacao_rpm, 0)} rpm` : "estático"}
            </button>
          ))}
        </div>
      )}

      {meuEnsaio && (
        <Cartao
          titulo={`Dados Completos do Ensaio RDA — Disco ${meuEnsaio.amostra}`}
          subtitulo={
            meuEnsaio.estudo
              ? `Estudo: ${meuEnsaio.estudo}${meuEnsaio.operadores ? ` · Operadores: ${meuEnsaio.operadores}` : ""}`
              : meuEnsaio.texto_utilizacao
                ? `Registro da planilha: "${meuEnsaio.texto_utilizacao}"`
                : "Parâmetros operacionais, físico-químicos e resultados gravados na amostra"
          }
          icone={<FlaskConical size={18} />}
          acoes={
            <div className="flex flex-wrap items-center gap-2">
              <span className="tag tag-blue">{modalidade}</span>
              {meuEnsaio.mineral && <span className="tag tag-outline">{meuEnsaio.mineral}</span>}
              {meuEnsaio.serie && <span className="tag tag-blue">Série: {meuEnsaio.serie}</span>}
              <span
                className={`tag ${
                  meuEnsaio.taxa_reacao_mol_cm2_s != null ? "tag-solid" : "tag-orange"
                }`}
              >
                {meuEnsaio.taxa_reacao_mol_cm2_s != null ? "Com taxa medida" : "Aguardando taxa"}
              </span>
            </div>
          }
        >
          <div className="divide-y divide-[var(--color-neutral-200,#e5e7eb)]">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5 p-6">
              <Valor rotulo="Sistema Ácido" destaque>
                {meuEnsaio.id_sistema} — {meuEnsaio.nome_sistema}
              </Valor>
              <Valor rotulo="Ácido & Concentração">
                {meuEnsaio.acido}
                {meuEnsaio.conc_pct != null ? ` · ${fmt(meuEnsaio.conc_pct, 2)} wt%` : ""}
                {meuEnsaio.conc_m != null ? ` (${fmt(meuEnsaio.conc_m, 2)} M)` : ""}
              </Valor>
              <Valor rotulo="Temperatura" destaque>
                {meuEnsaio.temperatura_c != null ? `${fmt(meuEnsaio.temperatura_c, 1)} °C` : "—"}
              </Valor>
              {meuEnsaio.rotacao_rpm != null ? (
                <>
                  <Valor rotulo="Rotação (ω)" destaque>
                    {fmt(meuEnsaio.rotacao_rpm, 0)} rpm
                  </Valor>
                  <Valor rotulo="Velocidade Angular" calculado>
                    {meuEnsaio.omega_rad_s != null ? `${fmt(meuEnsaio.omega_rad_s, 2)} rad/s` : "—"}
                  </Valor>
                  <Valor rotulo="√ω (Levich)" destaque calculado>
                    {meuEnsaio.raiz_omega != null ? `${fmt(meuEnsaio.raiz_omega, 3)} (rad/s)^0,5` : "—"}
                  </Valor>
                </>
              ) : (
                <>
                  <Valor rotulo="Volume de Ácido" destaque>
                    {meuEnsaio.volume_acido_ml != null ? `${fmt(meuEnsaio.volume_acido_ml, 0)} mL` : "—"}
                  </Valor>
                  <Valor rotulo="Dimensões do Disco">
                    {meuEnsaio.dim_h_in != null
                      ? `Ø ${fmt(meuEnsaio.dim_h_in * 2.54, 2)} cm${meuEnsaio.dim_d_in != null ? ` × ${fmt(meuEnsaio.dim_d_in * 2.54, 2)} cm` : ""}`
                      : "—"}
                  </Valor>
                  <Valor rotulo="Série Experimental">{meuEnsaio.serie ?? "—"}</Valor>
                </>
              )}
            </div>

            {(temDadosBoletim || meuEnsaio.taxa_reacao_mol_cm2_s != null) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5 p-6 bg-[#fafbfc]">
                <Valor rotulo={meuEnsaio.mineral === "dolomita" ? "TR só Ca (principal)" : "Taxa de Reação (TR)"} destaque calculado>
                  {meuEnsaio.taxa_reacao_mol_cm2_s != null ? `${fmt(meuEnsaio.taxa_reacao_mol_cm2_s, 3, true)} mol/(cm²·s)` : "—"}
                </Valor>
                {meuEnsaio.mineral === "dolomita" && meuEnsaio.taxa_ca_mg != null && (
                  <Valor rotulo="TR Ca + Mg" calculado>
                    {fmt(meuEnsaio.taxa_ca_mg, 3, true)} mol/(cm²·s)
                  </Valor>
                )}
                <Valor rotulo="R² ([H⁺] × t)" calculado>
                  {meuEnsaio.r2_h != null ? `${fmt(meuEnsaio.r2_h, 4)}${meuEnsaio.n_pontos ? ` (${meuEnsaio.n_pontos} pts)` : ""}` : "—"}
                </Valor>
                <Valor rotulo="C₀ Inicial">
                  {meuEnsaio.conc_inicial_mol_l != null ? `${fmt(meuEnsaio.conc_inicial_mol_l, 5)} mol/L` : "—"}
                </Valor>
                <Valor rotulo="Área Corrigida (1 − φ)" calculado>
                  {meuEnsaio.area_corrigida_cm2 != null
                    ? `${fmt(meuEnsaio.area_corrigida_cm2, 4)} cm²${meuEnsaio.porosidade_pct != null ? ` (φ = ${fmt(meuEnsaio.porosidade_pct, 1)}%)` : ""}`
                    : "—"}
                </Valor>
                <Valor rotulo="Massa (Antes → Depois)">
                  {meuEnsaio.massa_antes_g != null
                    ? `${fmt(meuEnsaio.massa_antes_g, 4)} → ${meuEnsaio.massa_depois_g != null ? `${fmt(meuEnsaio.massa_depois_g, 4)} g` : "—"}`
                    : "—"}
                </Valor>
                <Valor rotulo="Perda de Massa" calculado>
                  {meuEnsaio.perda_massa_pct != null ? `${fmt(meuEnsaio.perda_massa_pct, 2)} %` : "—"}
                </Valor>
                <Valor rotulo="Volume de Ácido">
                  {meuEnsaio.volume_acido_ml != null ? `${fmt(meuEnsaio.volume_acido_ml, 0)} mL` : "—"}
                </Valor>
                <Valor rotulo="Calibração AA (Ca)">
                  {fmtCalibracao(meuEnsaio.calibracao_ca)}
                </Valor>
                {meuEnsaio.calibracao_mg && (
                  <Valor rotulo="Calibração AA (Mg)">
                    {fmtCalibracao(meuEnsaio.calibracao_mg)}
                  </Valor>
                )}
                <Valor rotulo="Período do Ensaio">
                  {meuEnsaio.data_inicio
                    ? `${fmtData(meuEnsaio.data_inicio)}${meuEnsaio.data_fim && meuEnsaio.data_fim !== meuEnsaio.data_inicio ? ` a ${fmtData(meuEnsaio.data_fim)}` : ""}`
                    : meuEnsaio.data_ensaio
                      ? fmtData(meuEnsaio.data_ensaio)
                      : "—"}
                </Valor>
                <Valor rotulo="Operadores / Resp.">
                  {meuEnsaio.operadores ?? meuEnsaio.responsavel ?? "—"}
                </Valor>
                {meuEnsaio.observacoes && (
                  <div className="col-span-2 sm:col-span-3 lg:col-span-6 text-[12px] text-[var(--color-neutral-700)]">
                    <strong className="text-[var(--color-blue-800)]">Observações e detalhes do boletim:</strong> {meuEnsaio.observacoes}
                    {meuEnsaio.metodo_taxa ? ` · Método: ${meuEnsaio.metodo_taxa}` : ""}
                  </div>
                )}
              </div>
            )}
          </div>
        </Cartao>
      )}

      {meuEnsaio && graficoBoletim && (
        <Cartao
          titulo={`Curva Experimental [H⁺] × Tempo — Padrão Origin (${meuEnsaio.amostra})`}
          subtitulo="Gráfico gerado a partir das leituras de absorção atômica salvas na amostra, com opção de alternar eixo Y e exportar em PNG 300 dpi, SVG, PDF ou CSV"
          icone={<LineChart size={18} />}
          acoes={
            <button
              type="button"
              onClick={() => setMostrarTabelaLeituras((v) => !v)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--color-neutral-300)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--color-blue-800)] hover:border-[var(--color-blue)]"
            >
              <Table2 size={14} />
              {mostrarTabelaLeituras ? "Ocultar leituras" : `Ver leituras (${(leituras.dados ?? []).length})`}
              {mostrarTabelaLeituras ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          }
        >
          <div className="p-6 flex flex-col gap-5">
            <GraficoOriginHTempo
              usados={graficoBoletim.usados}
              fora={graficoBoletim.fora}
              pontosCompletos={graficoBoletim.todos}
              reta={graficoBoletim.reta}
              rotuloY={meuEnsaio.mineral === "dolomita" ? "[H⁺] só Ca (mol/L)" : "[H⁺] (mol/L)"}
              c0MolL={meuEnsaio.conc_inicial_mol_l ?? null}
              taxaReacao={meuEnsaio.taxa_reacao_mol_cm2_s}
              r2={meuEnsaio.r2_h ?? null}
              codigoAmostra={meuEnsaio.amostra}
              sistemaAcido={`${meuEnsaio.id_sistema} (${meuEnsaio.nome_sistema})`}
              rotacaoRpm={meuEnsaio.rotacao_rpm}
              temperaturaC={meuEnsaio.temperatura_c}
              mineral={meuEnsaio.mineral ?? null}
              obterToken={obterTokenSessao}
              urlGraficos={URL_GRAFICOS}
            />

            {mostrarTabelaLeituras && (leituras.dados ?? []).length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-[var(--color-neutral-300)]">
                <table className="table text-[12.5px]">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Amostra / Coleta</th>
                      <th className="text-right">Tempo (s)</th>
                      <th className="text-right">Abs Ca</th>
                      {meuEnsaio.mineral === "dolomita" && <th className="text-right">Abs Mg</th>}
                      <th className="text-right">[Ca²⁺] (mol/L)</th>
                      {meuEnsaio.mineral === "dolomita" && <th className="text-right">[Mg²⁺] (mol/L)</th>}
                      <th className="text-right">[H⁺] (mol/L)</th>
                      <th>Janela</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(leituras.dados ?? []).map((l, idx) => (
                      <tr key={`${l.analise_id}-${l.ordem}`} className={!l.usado ? "text-[var(--color-neutral-500)] bg-slate-50/60" : ""}>
                        <td className="tabular-nums">{idx + 1}</td>
                        <td className="font-semibold text-[var(--color-blue-800)]">{l.rotulo || `T${idx}`}</td>
                        <td className="text-right font-mono tabular-nums">{fmt(l.tempo_s, 0)}</td>
                        <td className="text-right font-mono tabular-nums">{l.abs_ca != null ? fmt(l.abs_ca, 4) : "—"}</td>
                        {meuEnsaio.mineral === "dolomita" && (
                          <td className="text-right font-mono tabular-nums">{l.abs_mg != null ? fmt(l.abs_mg, 4) : "—"}</td>
                        )}
                        <td className="text-right font-mono tabular-nums">{l.ca_mol_l != null ? fmt(l.ca_mol_l, 6) : "—"}</td>
                        {meuEnsaio.mineral === "dolomita" && (
                          <td className="text-right font-mono tabular-nums">{l.mg_mol_l != null ? fmt(l.mg_mol_l, 6) : "—"}</td>
                        )}
                        <td className="text-right font-mono tabular-nums">{l.h_mol_l != null ? fmt(l.h_mol_l, 5) : "—"}</td>
                        <td>
                          {l.usado ? (
                            <span className="tag tag-blue !text-[10px]">Na reta</span>
                          ) : (
                            <span className="tag tag-neutral !text-[10px]">Fora</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Cartao>
      )}

      {discosDaMesmaCondicao.length > 1 && (
        <Cartao
          titulo={`Discos da Mesma Condição Experimental (${discosDaMesmaCondicao.length} discos)`}
          subtitulo={`${meuEnsaio?.serie ?? `${meuEnsaio?.nome_sistema} · ${fmt(meuEnsaio?.temperatura_c, 0)} °C`} — clique em qualquer disco para abrir a ficha dele`}
          icone={<Layers size={18} />}
        >
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {discosDaMesmaCondicao.map((d) => {
              const ehEste = d.amostra === codigo;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => !ehEste && navigate(`/amostras/${d.amostra_id}?tab=rda`)}
                  className={`text-left rounded-xl border p-3.5 transition-all cursor-pointer ${
                    ehEste
                      ? "border-[var(--color-orange)] bg-[var(--color-orange-50)]/60 ring-1 ring-[var(--color-orange)]"
                      : "border-[var(--color-neutral-300)] bg-white hover:border-[var(--color-blue)] hover:bg-[var(--color-blue-50)]/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-heading font-extrabold text-[15px] text-[var(--color-red)] flex items-center gap-1.5">
                      <Disc size={14} /> {d.amostra}
                    </span>
                    {ehEste ? (
                      <span className="tag tag-orange !text-[10px]">Atual</span>
                    ) : d.observacoes ? (
                      <span className="tag tag-neutral !text-[10px] truncate max-w-[110px]">{d.observacoes}</span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[12px] font-semibold text-[var(--color-blue-800)]">
                    {d.rotacao_rpm != null ? (
                      <span className="flex items-center gap-1">
                        <RotateCw size={12} /> {fmt(d.rotacao_rpm, 0)} rpm
                      </span>
                    ) : d.volume_acido_ml != null ? (
                      <span>{fmt(d.volume_acido_ml, 0)} mL</span>
                    ) : null}
                    {d.temperatura_c != null && (
                      <span className="flex items-center gap-1 text-[var(--color-neutral-600)]">
                        <Thermometer size={12} /> {fmt(d.temperatura_c, 0)} °C
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 text-[11px] text-[var(--color-neutral-500)] tabular-nums">
                    {d.taxa_reacao_mol_cm2_s != null ? (
                      <span className="font-semibold text-[var(--color-blue)]">
                        Taxa: {fmt(d.taxa_reacao_mol_cm2_s, 3, true)} mol/cm²·s
                      </span>
                    ) : d.raiz_omega != null ? (
                      <span>√ω = {fmt(d.raiz_omega, 3)} (rad/s)^0,5</span>
                    ) : (
                      <span>{d.nome_sistema}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Cartao>
      )}

      {/* 3. Comparação gráfica (Levich: Taxa × √ω) com a literatura da mesma rocha */}
      <Cartao
        titulo="Comparação de Taxa de Reação (Gráfico de Levich: Taxa × √ω)"
        subtitulo={
          litologia
            ? `Ensaios com ${litologia}${meuEnsaio?.acido ? ` e ${meuEnsaio.acido}` : ""}`
            : "Comparação dos ensaios do laboratório com a literatura da mesma rocha"
        }
        icone={<Gauge size={18} />}
      >
        <div className="p-6 flex flex-col gap-4">
          {pontos.carregando && !pontos.dados ? (
            <Carregando />
          ) : pontos.erro ? (
            <Aviso tipo="erro">{pontos.erro}</Aviso>
          ) : literaturaPontos.length === 0 && meusPontos.length === 0 ? (
            <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">
              Nenhuma medida com taxa de reação lançada para plotar no gráfico de Levich desta rocha.
            </p>
          ) : (
            <>
              {meusPontos.length === 0 && (
                <Aviso tipo="info">
                  As condições deste disco ({meuEnsaio ? `${meuEnsaio.nome_sistema}${meuEnsaio.temperatura_c != null ? ` · ${fmt(meuEnsaio.temperatura_c, 0)} °C` : ""}${meuEnsaio.rotacao_rpm != null ? ` · ${fmt(meuEnsaio.rotacao_rpm, 0)} rpm` : ""}` : "da planilha"}) já estão vinculadas acima. Assim que a taxa de reação for medida e lançada, o ponto desta amostra aparecerá destacado sobre a curva abaixo.
                </Aviso>
              )}
              <GraficoRda pontos={[...literaturaPontos, ...meusPontos]} destacarRotulo={codigo} altura={380} />
            </>
          )}
        </div>
      </Cartao>
    </div>
  );
}
