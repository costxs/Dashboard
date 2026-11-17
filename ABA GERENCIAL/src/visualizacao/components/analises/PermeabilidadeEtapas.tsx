import { useConsulta } from "../../hooks/useConsulta";
import { listarCurvas, listarEtapasPermeabilidade, pontosDaCurva } from "../../servicos/analises";
import { URL_GRAFICOS } from "../../servicos/graficos";
import { GraficosPermeabilidade } from "./GraficosPermeabilidade";
import type { AjusteDarcyGravado, Curva, RegistroAnalise } from "../../tipos/banco";
import { fmt } from "../../utils/formatacao";
import { GraficoAjusteDpQ } from "../charts/GraficoAjusteDpQ";
import { LineChartCard } from "../charts/LineChartCard";
import { Aviso, Valor } from "../ui/base";

const TABELA = "analise_petrofisica";

// Petrofísica vinda do "Tratamento de dados de coreflood" (gerencial): etapas por vazão,
// ajuste ΔP × Q e a curva ΔP × tempo gravada junto. Sem etapas, não mostra nada.
// Com o serviço de gráficos configurado, os gráficos são os do padrão Origin (config do gerencial).
type PontoDpQ = { ordem: number; q: number; dp: number; usada: boolean };

export function PermeabilidadeEtapas({ r, amostra }: {
  r: RegistroAnalise; amostra?: { codigo?: string | null; comprimento_cm?: number | null; diametro_cm?: number | null };
}) {
  const consulta = useConsulta(() => listarEtapasPermeabilidade(r.id), [r.id]);
  const curvas = useConsulta(() => listarCurvas(TABELA, r.id), [r.id]);
  // ao trocar de registro, o hook ainda guarda as etapas do anterior até a nova busca chegar
  const etapas = consulta.dados?.filter((e) => e.analise_id === r.id) ?? [];

  if (consulta.erro) return <Aviso tipo="erro">Etapas de permeabilidade: {consulta.erro}</Aviso>;
  if (!etapas.length) return null;

  const pontos = etapas.filter((e) => e.dp_medio_psi != null)
    .map((e) => ({ ordem: e.ordem, q: Number(e.vazao_ml_min), dp: Number(e.dp_medio_psi), usada: e.usada }));
  const usados = pontos.filter((d) => d.usada);
  // a reta gravada pelo tratamento (migração 017); sem ela, refaz pela origem como era antes
  const gravado = r as RegistroAnalise & AjusteDarcyGravado;
  const modo = gravado.ajuste_modo ?? null;
  let inclinacao: number | null = null, intercepto = 0, r2: number | null = null;
  if (modo && gravado.ajuste_inclinacao != null) {
    inclinacao = Number(gravado.ajuste_inclinacao);
    intercepto = Number(gravado.ajuste_intercepto_psi ?? 0);
    r2 = gravado.ajuste_r2 != null ? Number(gravado.ajuste_r2) : null;
  } else if (usados.length >= 2) {
    const a = usados.reduce((s, d) => s + d.q * d.dp, 0) / usados.reduce((s, d) => s + d.q * d.q, 0);
    const media = usados.reduce((s, d) => s + d.dp, 0) / usados.length;
    const ssTot = usados.reduce((s, d) => s + (d.dp - media) ** 2, 0);
    const ssRes = usados.reduce((s, d) => s + (d.dp - a * d.q) ** 2, 0);
    inclinacao = a;
    r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  }

  const temBombeado = etapas.some((e) => e.volume_bombeado_cm3 != null);
  const curva = curvas.dados?.filter((c) => c.analise_id === r.id && c.y_grandeza === "ΔP" && c.x_grandeza === "Tempo")
    .sort((a, b) => Number(/permeab/i.test(b.nome)) - Number(/permeab/i.test(a.nome)))[0];

  const graficosDashboard = <GraficosDashboard pontos={pontos} inclinacao={inclinacao} intercepto={intercepto} modo={modo} r2={r2} curva={curva} />;

  return (
    <div className="cartao">
      <div className="cartao-topo">
        <div>
          <h2>Permeabilidade por etapas de vazão</h2>
          <p>{etapas.length} etapa(s) · {etapas.filter((e) => e.usada).length} usada(s) no k final</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-6 p-7">
        <Valor rotulo="Viscosidade (cP)">{fmt(r.viscosidade_cp, 4)}</Valor>
        <Valor rotulo="Fluido">{fmt(r.fluido)}</Valor>
        <Valor rotulo="k por">{fmt(r.metodo_k)}</Valor>
        <Valor rotulo="k em fluxo (mD)" destaque>
          {fmt(r.permeabilidade_liquido_md, 3)}
          {modo && (
            <span className="mt-1 block text-[12px] font-normal text-[var(--color-neutral-600)]">
              Reta ΔP × Q {modo === "origem" ? "pela origem" : "com intercepto (Origin)"}{r2 != null && ` · R² ${fmt(r2, 4)}`}
            </span>
          )}
        </Valor>
        <Valor rotulo="R² do ajuste ΔP × Q">{fmt(r2, 4)}</Valor>
      </div>

      <div className="border-t border-[var(--color-neutral-300)] px-6 py-4 overflow-x-auto">
        <table className="table text-[13px]">
          <thead>
            <tr>
              <th>Etapa</th>
              <th className="text-right">Q (cm³/min)</th>
              <th className="text-right">ΔP médio ± desvio (psi)</th>
              <th className="text-right">Volume injetado (cm³)</th>
              {temBombeado && <th className="text-right">Volume bombeado (cm³)</th>}
              <th className="text-right">k (mD)</th>
              <th>Usada</th>
            </tr>
          </thead>
          <tbody>
            {etapas.map((e) => (
              <tr key={e.id} className={`lcp-row ${e.usada ? "" : "text-[var(--color-neutral-500)]"}`}>
                <td className="font-semibold">{e.ordem}</td>
                <td className="text-right tabular-nums">{fmt(e.vazao_ml_min, 3)}</td>
                <td className="text-right tabular-nums">
                  {fmt(e.dp_medio_psi, 3)}{e.dp_desvio_psi != null && ` ± ${fmt(e.dp_desvio_psi, 3)}`}
                </td>
                <td className="text-right tabular-nums">{fmt(e.volume_injetado_cm3, 2)}</td>
                {temBombeado && <td className="text-right tabular-nums">{fmt(e.volume_bombeado_cm3, 2)}</td>}
                <td className="text-right tabular-nums">{fmt(e.k_md, 3)}</td>
                <td>
                  <span className={`tag ${e.usada ? "tag-blue" : "tag-muted"}`}>{e.usada ? "sim" : "não"}</span>
                  {e.estavel === false && <span className="ml-2 text-[12px]">não estabilizou</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {URL_GRAFICOS && curva ? (
        <div className="border-t border-[var(--color-neutral-300)] p-6">
          <GraficosPermeabilidade r={r} curva={curva} etapas={etapas} amostra={amostra} reserva={<GraficosDashboard pontos={pontos} inclinacao={inclinacao} intercepto={intercepto} modo={modo} r2={r2} curva={curva} embutido />} />
        </div>
      ) : graficosDashboard}
    </div>
  );
}

function GraficosDashboard(p: {
  pontos: PontoDpQ[]; inclinacao: number | null; intercepto: number; modo: AjusteDarcyGravado["ajuste_modo"];
  r2: number | null; curva?: Curva; embutido?: boolean;
}) {
  const { pontos, inclinacao, intercepto, r2, curva } = p;
  const comIntercepto = p.modo === "intercepto";
  const equacao = inclinacao == null ? ""
    : `ΔP = ${fmt(inclinacao, 4)} · Q${comIntercepto ? ` ${intercepto < 0 ? "−" : "+"} ${fmt(Math.abs(intercepto), 4)}` : ""}`;
  const moldura = p.embutido ? "" : " border-t border-[var(--color-neutral-300)] p-6";
  return (
    <div className={`grid grid-cols-1 xl:grid-cols-2 gap-6${moldura}`}>
      <figure className="m-0 min-w-0">
        <Legenda titulo="ΔP × Q">
          {inclinacao != null
            ? `reta do ajuste ${comIntercepto ? "com intercepto (Origin)" : "pela origem"}: ${equacao} (R² = ${fmt(r2, 4)})`
            : "menos de 2 etapas usadas: sem reta de ajuste"}
        </Legenda>
        <GraficoAjusteDpQ pontos={pontos} inclinacao={inclinacao} intercepto={comIntercepto ? intercepto : 0} />
      </figure>
      <figure className="m-0 min-w-0">
        <Legenda titulo="ΔP × tempo">{curva ? curva.nome : "curva não gravada para este registro"}</Legenda>
        {curva && <CurvaDpTempo curva={curva} />}
      </figure>
    </div>
  );
}

function Legenda(p: { titulo: string; children: string }) {
  return (
    <figcaption className="mb-3">
      <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--color-blue-700)]">{p.titulo}</span>
      <span className="ml-2 text-[12px] text-[var(--color-neutral-600)]">{p.children}</span>
    </figcaption>
  );
}

function CurvaDpTempo({ curva }: { curva: Curva }) {
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
