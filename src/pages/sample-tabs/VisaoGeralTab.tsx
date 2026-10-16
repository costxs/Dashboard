import { useState } from "react";
import { ClipboardCheck, Layers, MapPin, NotebookText, Paperclip } from "lucide-react";
import { Arquivos } from "../../components/analises/Arquivos";
import { Cartao, Valor } from "../../components/ui/base";
import { fmt, fmtData, fmtPermFabricante } from "../../utils/formatacao";
import { useConsulta } from "../../hooks/useConsulta";
import { listarConferencias, registrarConferencia } from "../../servicos/amostras";
import type { AmostraResumo } from "../../tipos/banco";
import { rotuloFinalidade } from "../../utils/controleRochas";

// Aba "Visão Geral": origem, geometria, resumo dos últimos ensaios e conferências físicas.
export function OverviewTab({ a, podeEditar, observacoes }: { a: AmostraResumo; podeEditar: boolean; observacoes?: string | null }) {
  const un = (v: unknown, u: string, casas = 2) => (v == null ? "—" : `${fmt(v, casas)} ${u}`);
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

      {observacoes && (
        <Cartao titulo="Observações do controle" subtitulo="Texto das observações da amostra (planilha de controle de rochas ou cadastro)" icone={<NotebookText size={18} />}>
          <p className="m-0 p-7 whitespace-pre-line text-[14px] text-[var(--color-neutral-800)]">{observacoes}</p>
        </Cartao>
      )}

      <Cartao titulo="Resumo dos ensaios" subtitulo="Valores mais recentes; o histórico completo está em cada aba" icone={<ClipboardCheck size={18} />}>
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
      </Cartao>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Cartao titulo="Conferências físicas" subtitulo="Registro de quem conferiu a amostra e quando" icone={<ClipboardCheck size={18} />}>
          <div className="p-6"><Conferencias amostraId={a.id} podeEditar={podeEditar} /></div>
        </Cartao>
        <Cartao titulo="Arquivos gerais da amostra" subtitulo="Fotos do plug, fichas, laudos" icone={<Paperclip size={18} />}>
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
