import { useEffect, useMemo, useState } from "react";
import { Download, FlaskConical, Loader2 } from "lucide-react";
import { Cartao, Valor } from "../ui/base";
import {
  buscarGraficoReatividadeOrigin,
  calcularLogLog,
  resumirEstagiosEnsaio,
  type TipoGraficoReatividade,
} from "../../servicos/reatividade";
import type { ReatividadeEnsaioComDetalhes } from "../../tipos/banco";
import { fmt, fmtData } from "../../utils/formatacao";

const ROTULO_GEO: Record<string, string> = { mini_plug: "Mini-plug", disco: "Disco" };
const ROTULO_MOD: Record<string, string> = { estatica: "Dissolução Estática", dinamica_rda: "Dinâmica (RDA)" };
const ROTULO_LIT: Record<string, string> = { calcario: "Calcário", dolomita: "Dolomita", outro: "Outro" };

function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function CartaoEnsaioReatividade({ ensaio }: { ensaio: ReatividadeEnsaioComDetalhes }) {
  const estagios = useMemo(() => resumirEstagiosEnsaio(ensaio, ensaio.pontos), [ensaio]);
  const temT50 =
    ensaio.m0_sondagem_g != null &&
    ensaio.tempo_sondagem_min != null &&
    ensaio.mf_sondagem_g != null &&
    Number(ensaio.mf_sondagem_g) < Number(ensaio.m0_sondagem_g);
  const temPerda = estagios.some((s) => s.n_replicas > 0);
  const temAA = estagios.some((s) => s.ca_media_mol_l != null && s.h_media_mol_l != null);

  const inicial: TipoGraficoReatividade = temPerda ? "perda_massa" : temT50 ? "t50" : "aa";
  const [tipoGrafico, setTipoGrafico] = useState<TipoGraficoReatividade>(inicial);
  const [urlImg, setUrlImg] = useState<string | null>(null);
  const [carregandoImg, setCarregandoImg] = useState(false);
  const [erroImg, setErroImg] = useState<string | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setCarregandoImg(true);
    setErroImg(null);
    buscarGraficoReatividadeOrigin(ensaio, tipoGrafico, "png", 150, ctrl.signal)
      .then((blob) => {
        if (ctrl.signal.aborted) return;
        setUrlImg((antiga) => {
          if (antiga) URL.revokeObjectURL(antiga);
          return blob ? URL.createObjectURL(blob) : null;
        });
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setErroImg(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCarregandoImg(false);
      });

    return () => ctrl.abort();
  }, [ensaio, tipoGrafico]);

  useEffect(() => {
    return () => {
      if (urlImg) URL.revokeObjectURL(urlImg);
    };
  }, [urlImg]);

  const handleBaixar = async (formato: "png" | "svg" | "pdf") => {
    setBaixando(formato);
    try {
      const blob = await buscarGraficoReatividadeOrigin(
        ensaio,
        tipoGrafico,
        formato,
        formato === "png" ? 300 : 150,
      );
      if (blob) baixarBlob(blob, `${ensaio.codigo}_${tipoGrafico}.${formato}`);
    } finally {
      setBaixando(null);
    }
  };

  const t50Min = ensaio.t50_min != null ? Number(ensaio.t50_min) : null;
  const logLog = calcularLogLog(ensaio.pontos);
  const incluirMg = ensaio.litologia === "dolomita";
  const equacao =
    ensaio.taxa_dissolucao_m != null && ensaio.taxa_dissolucao_n != null
      ? `y = ${Number(ensaio.taxa_dissolucao_m).toFixed(4)}x ${Number(ensaio.taxa_dissolucao_n) >= 0 ? "+" : "−"} ${Math.abs(Number(ensaio.taxa_dissolucao_n)).toFixed(2)} (R² = ${Number(ensaio.taxa_dissolucao_r2 ?? 0).toFixed(4)})`
      : "—";

  return (
    <Cartao
      titulo={`${ensaio.codigo} · ${ROTULO_MOD[ensaio.modalidade] ?? ensaio.modalidade}`}
      subtitulo={`${ensaio.sistema_nome ?? "Sistema ácido não informado"} · ${ROTULO_GEO[ensaio.geometria] ?? ensaio.geometria} · ${ROTULO_LIT[ensaio.litologia] ?? ensaio.litologia}${ensaio.data_ensaio ? ` · ${fmtData(ensaio.data_ensaio)}` : ""}`}
      icone={<FlaskConical size={18} />}
    >
      <div className="p-6 space-y-6">
        {/* Resumo principal */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-4">
          <Valor rotulo="Código" destaque>{ensaio.codigo}</Valor>
          <Valor rotulo="Sistema Ácido">{ensaio.sistema_nome ?? "—"}</Valor>
          <Valor rotulo="Geometria / Litologia">
            {ROTULO_GEO[ensaio.geometria] ?? ensaio.geometria} · {ROTULO_LIT[ensaio.litologia] ?? ensaio.litologia}
          </Valor>
          <Valor rotulo="t₅₀" destaque calculado>
            {t50Min != null ? `${fmt(t50Min, 2)} min (${Math.round(t50Min * 60)} s)` : "—"}
          </Valor>
          <Valor rotulo="Temperatura / [H⁺]₀">
            {ensaio.temperatura_c != null ? `${fmt(ensaio.temperatura_c, 1)} °C` : "—"}
            {ensaio.h_inicial_mol_l != null ? ` · ${fmt(ensaio.h_inicial_mol_l, 2)} mol/L` : ""}
          </Valor>
          <Valor rotulo="Taxa de Dissolução (y = mx + n)" calculado>
            <span className="font-mono text-[12px]">{equacao}</span>
          </Valor>
        </div>

        {/* Tabela resumida dos 4 estágios */}
        {temPerda && (
          <div className="overflow-x-auto">
            <table className="table text-[13px]">
              <thead>
                <tr>
                  <th>Estágio</th>
                  <th className="text-right">Tempo (s)</th>
                  <th className="text-right">Réplicas</th>
                  <th className="text-right">Perda de massa (%)</th>
                  <th className="text-right">[Ca²⁺] (mol/L)</th>
                  {incluirMg && <th className="text-right">[Mg²⁺] (mol/L)</th>}
                  <th className="text-right">[H⁺] residual (mol/L)</th>
                </tr>
              </thead>
              <tbody>
                {estagios.map((s) => (
                  <tr key={s.estagio_ordem}>
                    <td className="font-semibold text-[var(--color-blue-800)]">{s.rotulo}</td>
                    <td className="text-right tabular-nums">{s.tempo_contato_s || "—"}</td>
                    <td className="text-right tabular-nums">{s.n_replicas}</td>
                    <td className="text-right tabular-nums font-semibold">
                      {s.n_replicas > 0 ? `${fmt(s.perda_media_pct, 2)} ± ${fmt(s.perda_dp_pct, 2)}` : "—"}
                    </td>
                    <td className="text-right tabular-nums">
                      {s.ca_media_mol_l != null ? `${fmt(s.ca_media_mol_l, 3)} ± ${fmt(s.ca_dp_mol_l, 3)}` : "—"}
                    </td>
                    {incluirMg && (
                      <td className="text-right tabular-nums">
                        {s.mg_media_mol_l != null ? `${fmt(s.mg_media_mol_l, 3)} ± ${fmt(s.mg_dp_mol_l, 3)}` : "—"}
                      </td>
                    )}
                    <td className="text-right tabular-nums font-semibold text-[var(--color-blue-800)]">
                      {s.h_media_mol_l != null ? `${fmt(s.h_media_mol_l, 3)} ± ${fmt(s.h_dp_mol_l, 3)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Gráficos padrão Origin respeitando config_grafico.legend_xy */}
        {(temT50 || temPerda || temAA) && (
          <div className="space-y-3 border-t border-[var(--color-neutral-200)] pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {temT50 && (
                  <button
                    type="button"
                    onClick={() => setTipoGrafico("t50")}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold border cursor-pointer ${
                      tipoGrafico === "t50"
                        ? "bg-[var(--color-blue-900)] border-[var(--color-blue-900)] text-white"
                        : "bg-white border-[var(--color-neutral-300)] text-[var(--color-neutral-700)]"
                    }`}
                  >
                    Determinação de t₅₀
                  </button>
                )}
                {temPerda && (
                  <button
                    type="button"
                    onClick={() => setTipoGrafico("perda_massa")}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold border cursor-pointer ${
                      tipoGrafico === "perda_massa"
                        ? "bg-[var(--color-blue-900)] border-[var(--color-blue-900)] text-white"
                        : "bg-white border-[var(--color-neutral-300)] text-[var(--color-neutral-700)]"
                    }`}
                  >
                    Perda de Massa (%)
                  </button>
                )}
                {temPerda && (
                  <button
                    type="button"
                    onClick={() => setTipoGrafico("log_log")}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold border cursor-pointer ${
                      tipoGrafico === "log_log"
                        ? "bg-[var(--color-blue-900)] border-[var(--color-blue-900)] text-white"
                        : "bg-white border-[var(--color-neutral-300)] text-[var(--color-neutral-700)]"
                    }`}
                  >
                    Log da massa
                  </button>
                )}
                {temAA && (
                  <button
                    type="button"
                    onClick={() => setTipoGrafico("aa")}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold border cursor-pointer ${
                      tipoGrafico === "aa"
                        ? "bg-[var(--color-blue-900)] border-[var(--color-blue-900)] text-white"
                        : "bg-white border-[var(--color-neutral-300)] text-[var(--color-neutral-700)]"
                    }`}
                  >
                    Absorção Atômica (Ca²⁺/H⁺)
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(["png", "svg", "pdf"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => void handleBaixar(f)}
                    disabled={!urlImg || baixando != null}
                    className="btn btn-secondary !py-1 !px-2.5 text-xs"
                  >
                    <Download size={12} /> {baixando === f ? "Baixando…" : f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative flex min-h-[280px] items-center justify-center rounded-lg border border-[var(--color-neutral-300)] bg-white overflow-hidden">
              {carregandoImg && (
                <div className="flex items-center gap-2 text-xs text-[var(--color-neutral-600)] py-12">
                  <Loader2 size={16} className="animate-spin text-[var(--color-orange)]" />
                  Gerando gráfico padrão Origin…
                </div>
              )}
              {!carregandoImg && erroImg && (
                <p className="p-6 text-xs text-red-700">Não foi possível carregar o gráfico: {erroImg}</p>
              )}
              {!carregandoImg && !erroImg && urlImg && (
                <img src={urlImg} alt={`Gráfico ${ensaio.codigo}`} className="max-w-3xl w-full h-auto" />
              )}
            </div>

            {tipoGrafico === "log_log" && logLog.length > 0 && (
              <div className="overflow-x-auto">
                <table className="table text-[13px]">
                  <thead>
                    <tr>
                      <th>Fração</th>
                      <th className="text-right">Tempo (s)</th>
                      <th className="text-right">m₀ média (g)</th>
                      <th className="text-right">m_f média (g)</th>
                      <th className="text-right">log m₀</th>
                      <th className="text-right">log m_f</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logLog.map((p) => (
                      <tr key={p.estagio_ordem}>
                        <td className="font-semibold">{fmt(p.fracao_t50, 2)}</td>
                        <td className="text-right tabular-nums">{fmt(p.tempo_medio_s, 0)}</td>
                        <td className="text-right tabular-nums">{fmt(p.m0_media_g, 4)}</td>
                        <td className="text-right tabular-nums">{fmt(p.mf_media_g, 4)}</td>
                        <td className="text-right tabular-nums">{fmt(p.log_m0, 4)}</td>
                        <td className="text-right tabular-nums">{fmt(p.log_mf, 4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Cartao>
  );
}

export function ReatividadeT50DaAmostra({ ensaios }: { ensaios: ReatividadeEnsaioComDetalhes[] }) {
  if (ensaios.length === 0) return null;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="m-0 text-[18px] font-heading font-bold text-[var(--color-blue-800)]">Dissolução estática</h2>
        <p className="m-0 mt-1 text-[13px] text-[var(--color-neutral-600)]">
          Resultados e gráficos dos ensaios gravados nesta amostra (t₅₀, perda de massa e absorção atômica).
        </p>
      </div>
      {ensaios.map((e) => (
        <CartaoEnsaioReatividade key={e.id} ensaio={e} />
      ))}
    </div>
  );
}
