import { useState } from "react";
import { Simbolos } from "../components/ui/Simbolos";
import { useNavigate } from "react-router-dom";
import { LayoutGrid, List, Plus, RotateCcw } from "lucide-react";
import { Select } from "../components/ui/Select";
import { Aviso, CabecalhoPagina, Carregando } from "../components/ui/base";
import { fmt } from "../utils/formatacao";
import { useConsulta } from "../hooks/useConsulta";
import { listarAmostras, listarLitologias, opcoesFiltro } from "../servicos/amostras";
import { souEditor } from "../servicos/contexto";
import { useContexto } from "../store/useContexto";
import type { AmostraResumo, StatusAmostra, TipoOrigem } from "../tipos/banco";
import { classeStatus, STATUS_ROTULO } from "../utils/status";

const TODOS = "Todos";
type Filtros = {
  litologia: string; origem: string; status: string; bacia: string; campo: string; poco: string;
  kMin: string; kMax: string;
};
const filtrosIniciais: Filtros = { litologia: TODOS, origem: TODOS, status: TODOS, bacia: TODOS, campo: TODOS, poco: TODOS, kMin: "", kMax: "" };

export function SamplesListPage() {
  const navigate = useNavigate();
  const empresaId = useContexto((s) => s.empresaId);
  const projetoId = useContexto((s) => s.projetoId);
  const busca = useContexto((s) => s.busca);
  const definirBusca = useContexto((s) => s.definirBusca);
  const [view, setView] = useState<"table" | "grid">("table");
  const [f, setF] = useState<Filtros>(filtrosIniciais);

  const litologias = useConsulta(listarLitologias, []);
  const opcoes = useConsulta(() => opcoesFiltro(projetoId ?? undefined, empresaId ?? undefined), [projetoId, empresaId]);
  const editor = useConsulta(souEditor, []);
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(",", ".")));

  const amostras = useConsulta(() => listarAmostras({
    projetoId: projetoId ?? undefined,
    empresaId: empresaId ?? undefined,
    busca: busca || undefined,
    litologias: f.litologia !== TODOS ? [f.litologia] : undefined,
    tipoOrigem: f.origem === "Afloramento" ? "afloramento" : f.origem === "Testemunho" ? "testemunho" : undefined,
    status: f.status !== TODOS ? [f.status as StatusAmostra] : undefined,
    bacia: f.bacia !== TODOS ? f.bacia : undefined,
    campo: f.campo !== TODOS ? f.campo : undefined,
    poco: f.poco !== TODOS ? f.poco : undefined,
    kMin: num(f.kMin), kMax: num(f.kMax),
  }), [projetoId, empresaId, busca, f]);

  const lista = amostras.dados ?? [];
  const mudar = (parcial: Partial<Filtros>) => setF((x) => ({ ...x, ...parcial }));
  const limpar = () => { setF(filtrosIniciais); definirBusca(""); };
  const testemunho = f.origem === "Testemunho";

  const VIEWBTN = "flex items-center gap-2 px-4 py-2 font-heading font-bold text-[13px] cursor-pointer transition-colors";

  return (
    <div>
      <CabecalhoPagina
        titulo="Amostras e ensaios"
        subtitulo={<>{lista.length} amostra(s){busca && <> · busca "<strong>{busca}</strong>"</>}</>}
        acoes={<>
          {editor.dados && (
            <button className="btn btn-primary" onClick={() => navigate("/amostras/nova")}><Plus size={14} /> Nova amostra</button>
          )}
          <div className="flex border border-[var(--color-neutral-300)] rounded-[10px] overflow-hidden shrink-0">
            <div onClick={() => setView("table")}
              className={`${VIEWBTN} ${view === "table" ? "bg-[var(--color-blue)] text-white" : "text-[var(--color-neutral-700)] bg-white hover:bg-[var(--color-blue-50)]"}`}>
              <List size={15} /> Tabela
            </div>
            <div onClick={() => setView("grid")}
              className={`${VIEWBTN} border-l border-[var(--color-neutral-300)] ${view === "grid" ? "bg-[var(--color-blue)] text-white" : "text-[var(--color-neutral-700)] bg-white hover:bg-[var(--color-blue-50)]"}`}>
              <LayoutGrid size={15} /> Grid
            </div>
          </div>
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-5 items-end bg-white border-y border-[var(--color-neutral-300)] px-7 py-4">
        <Select label="Litotipo" value={f.litologia} onChange={(v) => mudar({ litologia: v })}
          options={[TODOS, ...(litologias.dados ?? []).map((l) => l.nome)]} />
        <Select label="Origem" value={f.origem} onChange={(v) => mudar({ origem: v, bacia: TODOS, campo: TODOS, poco: TODOS })}
          options={[TODOS, "Afloramento", "Testemunho"]} />
        <Select label="Status" value={f.status} onChange={(v) => mudar({ status: v })}
          options={[TODOS, ...Object.keys(STATUS_ROTULO)]} rotulos={STATUS_ROTULO} />
        <div className="field">
          <label>k mín. (mD)</label>
          <input className="input" inputMode="decimal" value={f.kMin} onChange={(e) => mudar({ kMin: e.target.value })} />
        </div>
        <div className="field">
          <label>k máx. (mD)</label>
          <input className="input" inputMode="decimal" value={f.kMax} onChange={(e) => mudar({ kMax: e.target.value })} />
        </div>
        <button className="btn btn-secondary w-full" type="button" onClick={limpar}>
          <RotateCcw size={14} /> Limpar filtros
        </button>
        {testemunho && (
          <>
            <Select label="Bacia" value={f.bacia} onChange={(v) => mudar({ bacia: v })} options={[TODOS, ...(opcoes.dados?.bacias ?? [])]} />
            <Select label="Campo" value={f.campo} onChange={(v) => mudar({ campo: v })} options={[TODOS, ...(opcoes.dados?.campos ?? [])]} />
            <Select label="Poço" value={f.poco} onChange={(v) => mudar({ poco: v })} options={[TODOS, ...(opcoes.dados?.pocos ?? [])]} />
          </>
        )}
      </div>
      <p className="px-7 pt-2 text-[11px] text-[var(--color-neutral-500)]">
        k = permeabilidade ao líquido da petrofísica mais recente antes da acidificação.
      </p>

      {amostras.carregando && !amostras.dados && <Carregando />}
      {amostras.erro && <div className="px-7 pt-4"><Aviso tipo="erro">{amostras.erro}</Aviso></div>}

      {amostras.dados && lista.length === 0 ? (
        <div className="px-7 pt-8 pb-14">
          <div className="border border-dashed border-[var(--color-blue-200)] rounded-[16px] px-8 py-11 text-center bg-white">
            <p className="m-0 font-heading font-bold text-[17px] text-[var(--color-blue-800)]">Nenhuma amostra encontrada.</p>
            <p className="mt-2 text-[13px] text-[var(--color-neutral-700)]">Amplie os filtros ou cadastre uma nova amostra.</p>
            <div className="mt-5 flex justify-center gap-2">
              <button onClick={limpar} className="btn btn-secondary"><RotateCcw size={14} /> Limpar filtros</button>
              {editor.dados && <button onClick={() => navigate("/amostras/nova")} className="btn btn-primary"><Plus size={14} /> Nova amostra</button>}
            </div>
          </div>
        </div>
      ) : view === "table" ? (
        <div className="px-7 pt-4 pb-10 overflow-x-auto">
          <table className="table text-[14px]">
            <thead>
              <tr>
                <th>Código</th>
                <th>Litotipo</th>
                <th>Origem</th>
                {!projetoId && <th>Projeto</th>}
                <th className="text-right"><Simbolos>φ (%)</Simbolos></th>
                <th className="text-right">k antes (mD)</th>
                <th className="text-right">k depois (mD)</th>
                <th className="text-right">PVbt</th>
                <th className="w-[120px]">Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => (
                <tr key={s.id} className="lcp-row cursor-pointer" onClick={() => navigate(`/amostras/${s.id}`)}>
                  <td className="font-heading font-extrabold text-[var(--color-red)] whitespace-nowrap">{s.codigo}</td>
                  <td className="text-[var(--color-neutral-800)]">{s.litologia}</td>
                  <td className="text-[13px]"><OrigemTexto a={s} /></td>
                  {!projetoId && <td className="text-[12px] text-[var(--color-neutral-600)]">{s.projeto}</td>}
                  <td className="text-right tabular-nums">{fmt(s.porosidade_pct, 1)}</td>
                  <td className="text-right tabular-nums">{fmt(s.k_liquido_md, 2)}</td>
                  <td className="text-right tabular-nums">{fmt(s.k_liquido_depois_md, 1)}</td>
                  <td className="text-right tabular-nums font-heading font-extrabold text-[var(--color-blue)]">{fmt(s.pvbt, 2)}</td>
                  <td><span className={classeStatus(s.status)}>{STATUS_ROTULO[s.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-7 pt-4 pb-10">
          {lista.map((s) => (
            <div key={s.id} onClick={() => navigate(`/amostras/${s.id}`)}
              className="bg-white border border-[var(--color-neutral-300)] border-t-4 border-t-[var(--color-orange)] rounded-[14px] px-[22px] pt-[18px] pb-[20px] cursor-pointer flex flex-col gap-3.5 hover:shadow-md hover:border-[var(--color-blue-200)] transition-all">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="m-0 font-heading font-extrabold text-[15px] tracking-[0.04em] text-[var(--color-red)]">{s.codigo}</p>
                  <p className="mt-1 text-[14px] font-semibold text-[var(--color-blue-800)]">{s.litologia}</p>
                  <p className="mt-1 text-[12px] text-[var(--color-neutral-600)]"><OrigemTexto a={s} /></p>
                </div>
                <span className={classeStatus(s.status)}>{STATUS_ROTULO[s.status]}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 border-t border-[var(--color-neutral-200)] pt-3">
                <Metrica rotulo="Poros. (%)" valor={fmt(s.porosidade_pct, 1)} />
                <Metrica rotulo="k (mD)" valor={fmt(s.k_liquido_md, 2)} />
                <Metrica rotulo="PVbt" valor={fmt(s.pvbt, 2)} destaque />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function OrigemTexto({ a }: { a: Pick<AmostraResumo, "tipo_origem" | "poco" | "campo" | "bacia" | "afloramento_local" | "fornecedor"> }) {
  const tipo: TipoOrigem = a.tipo_origem;
  const detalhe = tipo === "testemunho"
    ? [a.poco, a.campo, a.bacia].filter(Boolean).join(" · ")
    : [a.afloramento_local, a.fornecedor].filter(Boolean).join(" · ");
  return (
    <>
      <span className={tipo === "testemunho" ? "tag tag-accent mr-1.5" : "tag tag-orange mr-1.5"}>{tipo}</span>
      <span className="text-[var(--color-neutral-700)]">{detalhe || "—"}</span>
    </>
  );
}

function Metrica({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div>
      <p className="m-0 text-[10px] tracking-[0.07em] uppercase text-[var(--color-neutral-600)]">{rotulo}</p>
      <p className={`mt-1 font-heading font-extrabold text-[17px] tabular-nums ${destaque ? "text-[var(--color-blue)]" : ""}`}>{valor}</p>
    </div>
  );
}
