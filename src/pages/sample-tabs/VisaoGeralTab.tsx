import { useState } from "react";
import { ClipboardCheck, FlaskConical, Layers, MapPin, NotebookText, Paperclip } from "lucide-react";
import { Arquivos } from "../../components/analises/Arquivos";
import { Cartao, Valor } from "../../components/ui/base";
import { fmt, fmtData, fmtPermFabricante } from "../../utils/formatacao";
import { useConsulta } from "../../hooks/useConsulta";
import { supabase } from "../../lib/supabase";
import { listarConferencias, registrarConferencia } from "../../servicos/amostras";
import type { AmostraResumo } from "../../tipos/banco";
import { interpretarObservacaoPlanilha, rotuloFinalidade } from "../../utils/controleRochas";

interface ResumoRdaAmostra {
  id: number;
  id_sistema: string;
  nome_sistema: string;
  acido: string;
  conc_pct: number | null;
  conc_m: number | null;
  temperatura_c: number | null;
  rotacao_rpm: number | null;
  omega_rad_s: number | null;
  raiz_omega: number | null;
  volume_acido_ml: number | null;
  taxa_reacao_mol_cm2_s: number | null;
  serie: string | null;
  texto_utilizacao: string | null;
  observacoes: string | null;
  situacao: string | null;
}

async function buscarRdaDaAmostra(amostraId: string): Promise<ResumoRdaAmostra | null> {
  const { data } = await supabase
    .from("v_analise_rda")
    .select("*")
    .eq("amostra_id", amostraId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ResumoRdaAmostra | null) ?? null;
}

// Aba "Visão Geral": origem, geometria, dados vinculados da planilha Excel, resumo dos ensaios e conferências físicas.
export function OverviewTab({ a, podeEditar, observacoes }: { a: AmostraResumo; podeEditar: boolean; observacoes?: string | null }) {
  const un = (v: unknown, u: string, casas = 2) => (v == null ? "—" : `${fmt(v, casas)} ${u}`);
  const ehDiscoRda = a.tipo_amostra === "disco" || a.n_rda > 0 || /rda/i.test(a.finalidade ?? "");
  const rda = useConsulta(() => (ehDiscoRda ? buscarRdaDaAmostra(a.id) : Promise.resolve(null)), [a.id, ehDiscoRda]);
  const infoPlanilha = interpretarObservacaoPlanilha(observacoes);
  const rdaDado = rda.dados;

  const temDadosPlanilha = Boolean(
    rdaDado ||
    infoPlanilha?.acido ||
    infoPlanilha?.temperatura_c != null ||
    infoPlanilha?.rotacao_rpm != null ||
    infoPlanilha?.vazao_ml_min != null ||
    infoPlanilha?.volume_ml != null ||
    infoPlanilha?.situacao_planilha ||
    infoPlanilha?.repeticao,
  );

  const modalidadePlanilha =
    (rdaDado?.volume_acido_ml != null && rdaDado?.rotacao_rpm == null) || infoPlanilha?.ensaio === "D.E"
      ? "Dissolução Estática (D.E)"
      : infoPlanilha?.ensaio === "Fluxo reativo" || /fluxo\s+reativo/i.test(rdaDado?.texto_utilizacao ?? "")
        ? "Fluxo Reativo"
        : ehDiscoRda || infoPlanilha?.rotacao_rpm != null
          ? "Disco Rotativo (RDA)"
          : infoPlanilha?.vazao_ml_min != null || /acidifica/i.test(observacoes ?? "")
            ? "Coreflooding (Acidificação)"
            : "Controle de Rochas";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Cartao titulo={a.tipo_origem === "testemunho" ? "Origem — testemunho" : "Origem — afloramento"} icone={<MapPin size={18} />}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-6 p-7">
            {a.tipo_origem === "testemunho" ? (
              <>
                <Valor rotulo="Bacia">{a.bacia ?? "—"}</Valor>
                <Valor rotulo="Campo">{a.campo ?? "—"}</Valor>
                <Valor rotulo="Poço">{a.poco ?? "—"}</Valor>
                <Valor rotulo="Reservatório">{a.reservatorio ?? "—"}</Valor>
                <Valor rotulo="Profundidade">{un(a.profundidade_m, "m", 1)}</Valor>
              </>
            ) : (
              <>
                <Valor rotulo="Local / pedreira">{a.afloramento_local ?? "—"}</Valor>
                <Valor rotulo="Fornecedor">{a.fornecedor ?? "—"}</Valor>
              </>
            )}
            <Valor rotulo="Litotipo">{a.litologia}</Valor>
            <Valor rotulo="Finalidade">{rotuloFinalidade(a.finalidade) ?? "—"}</Valor>
          </div>
        </Cartao>

        <Cartao titulo="Geometria" icone={<Layers size={18} />}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-6 p-7">
            <Valor rotulo="Diâmetro">{un(a.diametro_cm, "cm")}</Valor>
            <Valor rotulo="Comprimento">{un(a.comprimento_cm, "cm")}</Valor>
            <Valor rotulo="Massa seca">{un(a.massa_seca_g, "g")}</Valor>
            <Valor rotulo="k do fabricante">{fmtPermFabricante(a)}</Valor>
            <Valor rotulo="Volume poroso" destaque calculado>{un(a.volume_poroso_cm3, "cm³", 3)}</Valor>
          </div>
        </Cartao>
      </div>

      {/* Dados da Planilha Vinculados à Amostra (prático e fácil de visualizar) */}
      {temDadosPlanilha ? (
        <Cartao
          titulo="Dados da Planilha Vinculados à Amostra"
          subtitulo={
            (rdaDado?.texto_utilizacao || observacoes)
              ? `Registro original no Excel: "${(rdaDado?.texto_utilizacao ?? observacoes ?? "").replace(/^Utiliza[cç][aã]o:\s*/i, "")}"`
              : "Condições operacionais e anotações importadas da planilha de controle"
          }
          icone={<FlaskConical size={18} />}
          acoes={
            <div className="flex flex-wrap items-center gap-2">
              <span className="tag tag-blue">{modalidadePlanilha}</span>
              {(rdaDado?.observacoes || infoPlanilha?.repeticao) && (
                <span className="tag tag-orange">{rdaDado?.observacoes ?? infoPlanilha?.repeticao}</span>
              )}
              {rdaDado && (
                <span className={`tag ${rdaDado.taxa_reacao_mol_cm2_s != null ? "tag-solid" : "tag-neutral"}`}>
                  {rdaDado.taxa_reacao_mol_cm2_s != null ? "Com resultado" : "Aguardando taxa"}
                </span>
              )}
            </div>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-5 p-7">
            <Valor rotulo="Modalidade">{modalidadePlanilha}</Valor>
            <Valor rotulo="Sistema Ácido / Fluido" destaque>
              {rdaDado
                ? `${rdaDado.id_sistema} — ${rdaDado.nome_sistema}`
                : infoPlanilha?.acido
                  ? [infoPlanilha.acido, infoPlanilha.concentracao != null ? `${fmt(infoPlanilha.concentracao, 2)} ${infoPlanilha.unidade ?? ""}`.trim() : null].filter(Boolean).join(" ")
                  : a.fluidos ?? "—"}
            </Valor>
            {(rdaDado?.conc_pct != null || rdaDado?.conc_m != null || infoPlanilha?.aditivo) && (
              <Valor rotulo={infoPlanilha?.aditivo ? "Aditivo" : "Concentração (ƒ)"} calculado={!infoPlanilha?.aditivo}>
                {infoPlanilha?.aditivo
                  ? infoPlanilha.aditivo
                  : [
                      rdaDado?.conc_pct != null ? `${fmt(rdaDado.conc_pct, 2)} wt%` : null,
                      rdaDado?.conc_m != null ? `${fmt(rdaDado.conc_m, 2)} mol/L` : null,
                    ].filter(Boolean).join(" · ") || "—"}
              </Valor>
            )}
            <Valor rotulo="Temperatura" destaque>
              {(rdaDado?.temperatura_c ?? infoPlanilha?.temperatura_c) != null
                ? `${fmt(rdaDado?.temperatura_c ?? infoPlanilha?.temperatura_c, 1)} °C`
                : "—"}
            </Valor>
            {(rdaDado?.rotacao_rpm ?? infoPlanilha?.rotacao_rpm) != null ? (
              <>
                <Valor rotulo="Rotação (RDA)" destaque>
                  {fmt(rdaDado?.rotacao_rpm ?? infoPlanilha?.rotacao_rpm, 0)} rpm
                </Valor>
                <Valor rotulo="√ω (Levich)" calculado>
                  {rdaDado?.raiz_omega != null
                    ? `${fmt(rdaDado.raiz_omega, 3)} (rad/s)^0,5`
                    : `${fmt(Math.sqrt(((rdaDado?.rotacao_rpm ?? infoPlanilha!.rotacao_rpm!) * 2 * Math.PI) / 60), 3)} (rad/s)^0,5`}
                </Valor>
              </>
            ) : (rdaDado?.volume_acido_ml ?? infoPlanilha?.volume_ml) != null ? (
              <Valor rotulo="Volume de Ácido" destaque>
                {fmt(rdaDado?.volume_acido_ml ?? infoPlanilha?.volume_ml, 0)} mL
              </Valor>
            ) : infoPlanilha?.vazao_ml_min != null ? (
              <Valor rotulo="Vazão Prevista" destaque>
                {fmt(infoPlanilha.vazao_ml_min, 2)} mL/min
              </Valor>
            ) : null}
            {infoPlanilha?.situacao_planilha && (
              <Valor rotulo="Situação / Reserva na Planilha" destaque>
                {infoPlanilha.situacao_planilha}
              </Valor>
            )}
            {rdaDado?.serie && (
              <Valor rotulo="Série Vinculada">
                {rdaDado.serie}
              </Valor>
            )}
          </div>
        </Cartao>
      ) : observacoes ? (
        <Cartao titulo="Observações do controle" subtitulo="Anotação vinculada à amostra na planilha de controle de rochas" icone={<NotebookText size={18} />}>
          <p className="m-0 p-7 whitespace-pre-line text-[14px] text-[var(--color-neutral-800)]">{observacoes}</p>
        </Cartao>
      ) : null}

      <Cartao titulo="Resumo dos ensaios" subtitulo="Valores mais recentes vinculados à amostra; o histórico completo está em cada aba" icone={<ClipboardCheck size={18} />}>
        {ehDiscoRda ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-x-6 gap-y-6 p-7">
            <Valor rotulo="Porosidade" destaque>{un(a.porosidade_pct, "%", 1)}</Valor>
            <Valor rotulo="k fabricante / gás" destaque>{a.k_gas_md != null ? un(a.k_gas_md, "mD") : fmtPermFabricante(a)}</Valor>
            <Valor rotulo="Volume poroso" calculado>{un(a.volume_poroso_cm3, "cm³", 3)}</Valor>
            <Valor rotulo="Sistema Ácido" destaque>{rdaDado?.nome_sistema ?? a.fluidos ?? "—"}</Valor>
            <Valor rotulo="Temperatura" destaque>{un(rdaDado?.temperatura_c ?? infoPlanilha?.temperatura_c, "°C", 0)}</Valor>
            <Valor rotulo="Rotação / Volume" destaque>
              {(rdaDado?.rotacao_rpm ?? infoPlanilha?.rotacao_rpm) != null
                ? `${fmt(rdaDado?.rotacao_rpm ?? infoPlanilha?.rotacao_rpm, 0)} rpm`
                : (rdaDado?.volume_acido_ml ?? infoPlanilha?.volume_ml) != null
                  ? `${fmt(rdaDado?.volume_acido_ml ?? infoPlanilha?.volume_ml, 0)} mL`
                  : "—"}
            </Valor>
            <Valor rotulo="√ω (Levich)" calculado>
              {rdaDado?.raiz_omega != null ? `${fmt(rdaDado.raiz_omega, 3)}` : "—"}
            </Valor>
            <Valor rotulo="Taxa de reação" destaque>
              {rdaDado?.taxa_reacao_mol_cm2_s != null
                ? `${fmt(rdaDado.taxa_reacao_mol_cm2_s, 3, true)} mol/cm²·s`
                : rdaDado
                  ? "Aguardando"
                  : "—"}
            </Valor>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-x-6 gap-y-6 p-7">
            <Valor rotulo="Porosidade" destaque>{un(a.porosidade_pct, "%", 1)}</Valor>
            <Valor rotulo="k gás" destaque>{un(a.k_gas_md, "mD")}</Valor>
            <Valor rotulo="k líquido (antes)" destaque>{un(a.k_liquido_md, "mD")}</Valor>
            <Valor rotulo="k líquido (depois)" destaque>{un(a.k_liquido_depois_md, "mD")}</Valor>
            <Valor rotulo="P. confinamento">{un(a.pressao_confinamento_psi, "psi", 0)}</Valor>
            <Valor rotulo="PVbt" destaque>{fmt(a.pvbt)}</Valor>
            <Valor rotulo="Breakthrough">{a.breakthrough == null ? "—" : a.breakthrough ? "atingido" : "não atingido"}</Valor>
            <Valor rotulo="ΔP inicial / final" calculado>{fmt(a.razao_dp, 1)}</Valor>
          </div>
        )}
      </Cartao>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Cartao titulo="Conferências físicas" subtitulo="Registro de quem conferiu a amostra no estoque e quando" icone={<ClipboardCheck size={18} />}>
          <div className="p-6"><Conferencias amostraId={a.id} podeEditar={podeEditar} /></div>
        </Cartao>
        <Cartao titulo="Arquivos gerais da amostra" subtitulo="Fotos do plug/disco, fichas, laudos" icone={<Paperclip size={18} />}>
          <div className="p-6"><Arquivos amostraId={a.id} pasta="geral" podeEditar={podeEditar} /></div>
        </Cartao>
      </div>
    </div>
  );
}

type Conferencia = { id: number; data: string; responsaveis: string; resultado: string; observacao: string | null };

function Conferencias({ amostraId, podeEditar }: { amostraId: string; podeEditar: boolean }) {
  const lista = useConsulta(() => listarConferencias(amostraId) as Promise<Conferencia[]>, [amostraId]);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [resp, setResp] = useState("");
  const [resultado, setResultado] = useState("ok");
  return (
    <div className="flex flex-col gap-4">
      {lista.dados?.length === 0 && <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">Nenhuma conferência registrada.</p>}
      {!!lista.dados?.length && (
        <table className="table text-[13px]">
          <thead><tr><th>Data</th><th>Responsáveis</th><th>Resultado</th></tr></thead>
          <tbody>
            {lista.dados.map((c) => (
              <tr key={c.id}>
                <td>{fmtData(c.data)}</td><td>{c.responsaveis}</td>
                <td><span className={c.resultado === "ok" ? "tag tag-blue" : "tag tag-accent"}>{c.resultado}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {podeEditar && (
        <div className="flex flex-wrap items-end gap-2">
          <input className="input !w-[150px] !py-2" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <input className="input !w-[200px] !py-2" placeholder="Responsáveis" value={resp} onChange={(e) => setResp(e.target.value)} />
          <select className="input !w-[160px] !py-2" value={resultado} onChange={(e) => setResultado(e.target.value)}>
            <option>ok</option><option>não localizada</option><option>danificada</option>
          </select>
          <button className="btn btn-blue" disabled={!resp.trim()} onClick={async () => {
            await registrarConferencia(amostraId, data, resp.trim(), resultado); setResp(""); lista.recarregar();
          }}>Registrar</button>
        </div>
      )}
    </div>
  );
}
