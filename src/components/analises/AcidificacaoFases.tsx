import { useEffect, useState, type ReactNode } from "react";
import { useConsulta } from "../../hooks/useConsulta";
import { listarCurvas, listarFasesAcidificacao, pontosDaCurva } from "../../servicos/analises";
import { baixarArquivo, pedirGraficoAcidificacao, URL_GRAFICOS, type Formato, type GraficoAcid } from "../../servicos/graficos";
import type { AcidificacaoFase, AcidificacaoGravada, Curva, RegistroAnalise } from "../../tipos/banco";
import { fmt } from "../../utils/formatacao";
import { LineChartCard } from "../charts/LineChartCard";
import { Aviso, Valor } from "../ui/base";

const TABELA = "analise_coreflooding";
// nomes com que o tratamento de acidificação (gerencial) grava as curvas
const CURVAS = ["ΔP × tempo (acidificação)", "ΔP × PV injetado (ácido)"];
const PAPEL: Record<AcidificacaoFase["papel"], { texto: string; cor: string }> = {
  pre_fluxo: { texto: "Pré-fluxo", cor: "#475569" },
  acido: { texto: "Ácido", cor: "#c8102e" },
  pos_fluxo: { texto: "Pós-fluxo", cor: "#1f4e9c" },
  outro: { texto: "Outro", cor: "#94a3b8" },
};

// Coreflooding vindo do "Tratamento de dados de coreflood › Acidificação" (gerencial): as fases do ensaio
// (garrafa + vazão), como o PVbt foi obtido e as curvas gravadas junto. Sem fases, não mostra nada.
export function AcidificacaoFases({ r }: { r: RegistroAnalise }) {
  const consulta = useConsulta(() => listarFasesAcidificacao(r.id), [r.id]);
  const curvas = useConsulta(() => listarCurvas(TABELA, r.id), [r.id]);
  // ao trocar de registro, o hook ainda guarda as fases do anterior até a nova busca chegar
  const fases = consulta.dados?.filter((f) => f.analise_id === r.id) ?? [];

  if (consulta.erro) return <Aviso tipo="erro">Fases da acidificação: {consulta.erro}</Aviso>;
  if (!fases.length) return null;

  const g = r as RegistroAnalise & AcidificacaoGravada;
  const salvas = CURVAS.map((nome) => curvas.dados?.find((c) => c.analise_id === r.id && c.nome === nome));

  return (
    <div className="cartao">
      <div className="cartao-topo">
        <div>
          <h2>Acidificação por fases</h2>
          <p>{fases.map((f) => f.rotulo ?? `Fase ${f.ordem}`).join(" → ")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-6 p-7">
        <Valor rotulo="PVbt" destaque>{fmt(r.pvbt, 3)}</Valor>
        <Valor rotulo="Equipamento">{fmt(g.equipamento_aquisicao)}</Valor>
        <Valor rotulo="Ácido até o breakthrough (cm³)">{fmt(g.volume_acido_bt_cm3, 3)}</Valor>
        <Valor rotulo="Volume poroso usado (cm³)">{fmt(g.volume_poroso_usado_cm3, 3)}</Valor>
        <div className="col-span-2 sm:col-span-3 lg:col-span-1">
          <Valor rotulo="Critério do breakthrough">{fmt(g.criterio_bt)}</Valor>
        </div>
      </div>

      <div className="border-t border-[var(--color-neutral-300)] px-6 py-4 overflow-x-auto">
        <table className="table text-[13px]">
          <thead>
            <tr>
              <th>Rótulo</th><th>Papel</th><th>Fluido</th><th className="text-right">Garrafa</th>
              <th className="text-right">Volume (cm³)</th><th className="text-right">Q (cm³/min)</th>
              <th className="text-right">ΔP inicial → final (psi)</th>
            </tr>
          </thead>
          <tbody>
            {fases.map((f) => (
              <tr key={f.id} className="lcp-row">
                <td className="font-semibold whitespace-nowrap">{f.rotulo ?? `Fase ${f.ordem}`}</td>
                <td className="whitespace-nowrap">
                  <span className="mr-2 inline-block h-[10px] w-[10px] rounded-sm align-middle" style={{ background: PAPEL[f.papel]?.cor }} />
                  {PAPEL[f.papel]?.texto ?? f.papel}
                </td>
                <td>{fmt(f.fluido)}</td>
                <td className="text-right tabular-nums">{f.garrafa != null ? `G${f.garrafa}` : "—"}</td>
                <td className="text-right tabular-nums">{fmt(f.volume_cm3, 2)}</td>
                <td className="text-right tabular-nums">{fmt(f.vazao_ml_min, 2)}</td>
                <td className="text-right tabular-nums whitespace-nowrap">{fmt(f.dp_inicial_psi, 2)} → {fmt(f.dp_final_psi, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {URL_GRAFICOS ? (
        <GraficosOrigin analiseId={r.id} nomeBase={`coreflooding_${r.id}`}
          reserva={<CurvasGravadas nomes={CURVAS} salvas={salvas} carregando={!curvas.dados} />} />
      ) : (
        <CurvasGravadas nomes={CURVAS} salvas={salvas} carregando={!curvas.dados} />
      )}
    </div>
  );
}

const ABAS: { qual: GraficoAcid; rotulo: string }[] = [
  { qual: "geral", rotulo: "Visão geral" },
  { qual: "pv", rotulo: "ΔP × PV" },
  { qual: "apos", rotulo: "Depois do ácido" },
];

/** Os três gráficos do padrão Origin, gerados pelo backend com os dados gravados. Sem o serviço, as curvas gravadas. */
function GraficosOrigin({ analiseId, nomeBase, reserva }: { analiseId: number; nomeBase: string; reserva: ReactNode }) {
  const [qual, setQual] = useState<GraficoAcid>("geral");
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(true);
  const [baixando, setBaixando] = useState<Formato | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    let nova: string | null = null;
    setGerando(true);
    setErro(null);
    pedirGraficoAcidificacao(analiseId, qual, "png", 130, ctl.signal)
      .then((b) => { nova = URL.createObjectURL(b); setUrl(nova); })
      .catch((e) => { if (!ctl.signal.aborted) { setUrl(null); setErro(e instanceof Error ? e.message : String(e)); } })
      .finally(() => { if (!ctl.signal.aborted) setGerando(false); });
    return () => { ctl.abort(); if (nova) URL.revokeObjectURL(nova); };
  }, [analiseId, qual]);

  async function baixar(formato: Formato) {
    setBaixando(formato);
    try {
      baixarArquivo(await pedirGraficoAcidificacao(analiseId, qual, formato, 300), `${nomeBase}_${qual}.${formato}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setBaixando(null);
    }
  }

  return (
    <div className="border-t border-[var(--color-neutral-300)]">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-neutral-300)] px-4">
        {ABAS.map((a) => (
          <button key={a.qual} type="button" onClick={() => setQual(a.qual)}
            className={`px-4 py-3 text-[13px] font-semibold border-b-2 -mb-px cursor-pointer ${qual === a.qual
              ? "border-[var(--color-orange)] text-[var(--color-blue-800)]" : "border-transparent text-[var(--color-neutral-600)]"}`}>
            {a.rotulo}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-4 p-6">
        {erro && !url ? (
          <>
            <Aviso tipo="erro">Gráficos do padrão Origin: {erro}</Aviso>
            {reserva}
          </>
        ) : (
          <>
            <div className="relative flex min-h-[260px] items-center justify-center rounded-[10px] bg-[var(--color-neutral-100)]">
              {url && <img src={url} alt={`Acidificação: ${ABAS.find((a) => a.qual === qual)?.rotulo}`}
                className={`max-h-[560px] max-w-full ${gerando ? "opacity-50" : ""}`} />}
              {gerando && <span className="absolute text-[13px] text-[var(--color-neutral-600)]">gerando…</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {(["png", "svg", "pdf"] as Formato[]).map((f) => (
                <button key={f} type="button" className="btn btn-secondary" disabled={baixando != null} onClick={() => baixar(f)}>
                  {baixando === f ? "baixando…" : `Baixar ${f.toUpperCase()}`}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CurvasGravadas({ nomes, salvas, carregando }: { nomes: string[]; salvas: (Curva | undefined)[]; carregando: boolean }) {
  return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 border-t border-[var(--color-neutral-300)] p-6">
        {nomes.map((nome, i) => (
          <figure key={nome} className="m-0 min-w-0">
            <figcaption className="mb-3">
              <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--color-blue-700)]">{nome}</span>
              {!salvas[i] && <span className="ml-2 text-[12px] text-[var(--color-neutral-600)]">{carregando ? "carregando…" : "curva não gravada para este registro"}</span>}
            </figcaption>
            {salvas[i] && <CurvaSalva curva={salvas[i]} />}
          </figure>
        ))}
      </div>
  );
}

function CurvaSalva({ curva }: { curva: Curva }) {
  const pontos = useConsulta(() => pontosDaCurva(curva.id), [curva.id]);
  if (pontos.erro) return <Aviso tipo="erro">{pontos.erro}</Aviso>;
  if (!pontos.dados) return <p className="text-[13px] text-[var(--color-neutral-600)]">Carregando pontos…</p>;
  const unidade = (g: string, u: string | null) => (u ? `${g} (${u})` : g);
  return (
    <LineChartCard semCartao title="" data={pontos.dados} xKey="x" height={278}
      xLabel={unidade(curva.x_grandeza, curva.x_unidade)} yLabel={unidade(curva.y_grandeza, curva.y_unidade)}
      series={[{ dataKey: "y", label: unidade(curva.y_grandeza, curva.y_unidade), color: "var(--grafico-linha)" }]} />
  );
}
