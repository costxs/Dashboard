import { useState } from "react";
import { Simbolos } from "../components/ui/Simbolos";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ChartScatter, Disc, Layers, LayoutGrid, LayoutList, List, RotateCcw } from "lucide-react";
import { GraficoDispersao } from "../components/charts/GraficoDispersao";
import { Select } from "../components/ui/Select";
import { Aviso, CabecalhoPagina, Carregando, Cartao } from "../components/ui/base";
import { fmt, melhorK } from "../utils/formatacao";
import { useConsulta } from "../hooks/useConsulta";
import { listarAmostras, listarLitologias, opcoesFiltro } from "../servicos/amostras";
import { useContexto } from "../store/useContexto";
import type { AmostraResumo, StatusAmostra, TipoOrigem } from "../tipos/banco";
import { classeStatus, STATUS_ROTULO } from "../utils/status";
import {
  agruparAmostras, dimensoes, filtrarAmostras, fluidoDe, opcoesDeFiltro, prefixoDe, tipoDe, tituloPrefixo,
} from "../utils/bancoAmostras";

const ROTULO_TIPO: Record<string, string> = { plug: "Plug", disco: "Disco", outro: "Outro" };

const TODOS = "Todos";
type Filtros = {
  tipo: string; prefixo: string; fluido: string;
  litologia: string; origem: string; status: string; bacia: string; campo: string; poco: string;
  kMin: string; kMax: string;
};
const filtrosIniciais: Filtros = {
  tipo: TODOS, prefixo: TODOS, fluido: TODOS,
  litologia: TODOS, origem: TODOS, status: TODOS, bacia: TODOS, campo: TODOS, poco: TODOS, kMin: "", kMax: "",
};

export function SamplesListPage() {
  const navigate = useNavigate();
  const empresaId = useContexto((s) => s.empresaId);
  const projetoId = useContexto((s) => s.projetoId);
  const busca = useContexto((s) => s.busca);
  const definirBusca = useContexto((s) => s.definirBusca);
  const [view, setView] = useState<"grupos" | "table" | "grid" | "chart">("grupos");
  const [f, setF] = useState<Filtros>(filtrosIniciais);
  const [ordemK, setOrdemK] = useState<"asc" | "desc" | null>(null);

  const litologias = useConsulta(listarLitologias, []);
  const opcoes = useConsulta(() => opcoesFiltro(projetoId ?? undefined, empresaId ?? undefined), [projetoId, empresaId]);
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
  }), [projetoId, empresaId, busca, f.litologia, f.origem, f.status, f.bacia, f.campo, f.poco]);

  // tipo, prefixo e fluido filtram a lista já carregada (as opções saem dela)
  const todas = amostras.dados ?? [];
  const opcoesBanco = opcoesDeFiltro(todas);
  const semTodos = (v: string) => (v === TODOS ? "" : v);
  // k mín./k máx. usam o k mostrado na lista; a faixa do fabricante entra se cruzar o intervalo
  const [kMin, kMax] = [num(f.kMin), num(f.kMax)];
  const lista = filtrarAmostras(todas, { tipo: semTodos(f.tipo), prefixo: semTodos(f.prefixo), fluido: semTodos(f.fluido), litologia: "", status: "" })
    .filter((a) => {
      if ((kMin == null || Number.isNaN(kMin)) && (kMax == null || Number.isNaN(kMax))) return true;
      const k = melhorK(a);
      return k != null && !(kMin != null && k.max < kMin) && !(kMax != null && k.min > kMax);
    });
  if (ordemK) {
    // ordena pelo valor mostrado (na faixa, o mínimo); sem k vai para o fim
    const valor = (a: AmostraResumo) => melhorK(a)?.min;
    lista.sort((a, b) => {
      const [x, y] = [valor(a), valor(b)];
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
      return ordemK === "asc" ? x - y : y - x;
    });
  }
  const mudar = (parcial: Partial<Filtros>) => setF((x) => ({ ...x, ...parcial }));
  const limpar = () => { setF(filtrosIniciais); definirBusca(""); };
  const testemunho = f.origem === "Testemunho";
  const pontosGrafico = lista.filter((s) => s.porosidade_pct != null && s.k_liquido_md != null && Number(s.k_liquido_md) > 0)
    .map((s) => ({ x: Number(s.porosidade_pct), y: Number(s.k_liquido_md), rotulo: s.codigo, detalhe: s.litologia, id: s.id }));

  const COLUNAS = 9;
  const cabecalho = (
    <thead>
      <tr>
        <th>Código</th>
        <th>Litotipo</th>
        <th>Localização / poço</th>
        <th>Dimensões</th>
        <th>Fluido</th>
        <th className="text-right"><Simbolos>φ (%)</Simbolos></th>
        <th className="text-right cursor-pointer select-none whitespace-nowrap" title="Ordenar por k"
          onClick={() => setOrdemK((o) => (o === "asc" ? "desc" : o === "desc" ? null : "asc"))}>
          k (mD){ordemK === "asc" ? <ArrowUp size={12} className="inline ml-1" /> : ordemK === "desc" ? <ArrowDown size={12} className="inline ml-1" /> : null}
        </th>
        <th className="text-right">PVbt</th>
        <th className="w-[120px]">Status</th>
      </tr>
    </thead>
  );
  const linhaAmostra = (s: AmostraResumo) => {
    const fluido = fluidoDe(s);
    const k = melhorK(s);
    return (
      <tr key={s.id} className="lcp-row cursor-pointer" onClick={() => navigate(`/amostras/${s.id}`)}>
        <td className="whitespace-nowrap">
          <span className="font-heading font-extrabold text-[var(--color-red)]">{s.codigo}</span>
          <span className="block text-[11px] text-[var(--color-neutral-500)]">
            {[prefixoDe(s), s.significado_prefixo].filter(Boolean).join(" · ") || "—"}
          </span>
          {!projetoId && <span className="tag tag-neutral mt-1 !px-1.5 !py-0 !text-[9px]" title="Projeto">{s.projeto}</span>}
        </td>
        <td className="text-[var(--color-neutral-800)]">{s.litologia}</td>
        <td className="text-[13px]"><OrigemTexto a={s} /></td>
        <td className="text-[13px] tabular-nums whitespace-nowrap text-[var(--color-neutral-700)]">{dimensoes(s)}</td>
        <td className="text-[13px] text-[var(--color-neutral-700)]">
          {fluido ? <>{fluido.texto}{fluido.previsto && <span className="ml-1 italic text-[var(--color-neutral-500)]">(previsto)</span>}</> : "—"}
        </td>
        <td className="text-right tabular-nums">{fmt(s.porosidade_pct, 1)}</td>
        <td className="text-right tabular-nums whitespace-nowrap">
          {k ? <>{k.texto}<span className="block text-[11px] text-[var(--color-neutral-500)]">{k.origem}</span></> : "—"}
        </td>
        <td className="text-right tabular-nums font-heading font-extrabold text-[var(--color-blue)]">{fmt(s.pvbt, 2)}</td>
        <td><span className={classeStatus(s.status)}>{STATUS_ROTULO[s.status]}</span></td>
      </tr>
    );
  };

  const VIEWBTN = "flex items-center gap-2 px-4 py-2 font-heading font-bold text-[13px] cursor-pointer transition-colors";

  return (
    <div>
      <CabecalhoPagina
        titulo="Banco de Amostras"
        subtitulo={<>{lista.length} amostra(s){busca && <> · busca "<strong>{busca}</strong>"</>}</>}
        acoes={<>
          <div className="flex border border-[var(--color-neutral-300)] rounded-[10px] overflow-hidden shrink-0">
            <div onClick={() => setView("grupos")} title="Agrupar por tipo de amostra e prefixo do código"
              className={`${VIEWBTN} ${view === "grupos" ? "bg-[var(--color-blue)] text-white" : "text-[var(--color-neutral-700)] bg-white hover:bg-[var(--color-blue-50)]"}`}>
              <LayoutList size={15} /> Grupos
            </div>
            <div onClick={() => setView("table")} title="Ver como lista: a tabela corrida"
              className={`${VIEWBTN} border-l border-[var(--color-neutral-300)] ${view === "table" ? "bg-[var(--color-blue)] text-white" : "text-[var(--color-neutral-700)] bg-white hover:bg-[var(--color-blue-50)]"}`}>
              <List size={15} /> Lista
            </div>
            <div onClick={() => setView("grid")}
              className={`${VIEWBTN} border-l border-[var(--color-neutral-300)] ${view === "grid" ? "bg-[var(--color-blue)] text-white" : "text-[var(--color-neutral-700)] bg-white hover:bg-[var(--color-blue-50)]"}`}>
              <LayoutGrid size={15} /> Grid
            </div>
            <div onClick={() => setView("chart")}
              className={`${VIEWBTN} border-l border-[var(--color-neutral-300)] ${view === "chart" ? "bg-[var(--color-blue)] text-white" : "text-[var(--color-neutral-700)] bg-white hover:bg-[var(--color-blue-50)]"}`}>
              <ChartScatter size={15} /> Gráfico
            </div>
          </div>
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-5 items-end bg-white border-y border-[var(--color-neutral-300)] px-7 py-4">
        <Select label="Tipo" value={f.tipo} onChange={(v) => mudar({ tipo: v })}
          options={[TODOS, "plug", "disco", ...(todas.some((a) => tipoDe(a) === "outro") ? ["outro"] : [])]} rotulos={ROTULO_TIPO} />
        <Select label="Prefixo" value={f.prefixo} onChange={(v) => mudar({ prefixo: v })} options={[TODOS, ...opcoesBanco.prefixos]} />
        <Select label="Litotipo" value={f.litologia} onChange={(v) => mudar({ litologia: v })}
          options={[TODOS, ...(litologias.dados ?? []).map((l) => l.nome)]} />
        <Select label="Status" value={f.status} onChange={(v) => mudar({ status: v })}
          options={[TODOS, ...Object.keys(STATUS_ROTULO)]} rotulos={STATUS_ROTULO} />
        <Select label="Fluido" value={f.fluido} onChange={(v) => mudar({ fluido: v })} options={[TODOS, ...opcoesBanco.fluidos]} />
        <button className="btn btn-secondary w-full" type="button" onClick={limpar}>
          <RotateCcw size={14} /> Limpar filtros
        </button>
        <Select label="Origem" value={f.origem} onChange={(v) => mudar({ origem: v, bacia: TODOS, campo: TODOS, poco: TODOS })}
          options={[TODOS, "Afloramento", "Testemunho"]} />
        <div className="field">
          <label>k mín. (mD)</label>
          <input className="input" inputMode="decimal" value={f.kMin} onChange={(e) => mudar({ kMin: e.target.value })} />
        </div>
        <div className="field">
          <label>k máx. (mD)</label>
          <input className="input" inputMode="decimal" value={f.kMax} onChange={(e) => mudar({ kMax: e.target.value })} />
        </div>
        {testemunho && (
          <>
            <Select label="Bacia" value={f.bacia} onChange={(v) => mudar({ bacia: v })} options={[TODOS, ...(opcoes.dados?.bacias ?? [])]} />
            <Select label="Campo" value={f.campo} onChange={(v) => mudar({ campo: v })} options={[TODOS, ...(opcoes.dados?.campos ?? [])]} />
            <Select label="Poço" value={f.poco} onChange={(v) => mudar({ poco: v })} options={[TODOS, ...(opcoes.dados?.pocos ?? [])]} />
          </>
        )}
      </div>
      <p className="px-7 pt-2 text-[11px] text-[var(--color-neutral-500)]">
        k = melhor valor disponível: permeabilidade ao líquido antes da acidificação; sem ela, ao gás; sem petrofísica, a do fabricante.
      </p>

      {amostras.carregando && !amostras.dados && <Carregando />}
      {amostras.erro && <div className="px-7 pt-4"><Aviso tipo="erro">{amostras.erro}</Aviso></div>}

      {amostras.dados && lista.length === 0 ? (
        <div className="px-7 pt-8 pb-14">
          <div className="border border-dashed border-[var(--color-blue-200)] rounded-[16px] px-8 py-11 text-center bg-white">
            <p className="m-0 font-heading font-bold text-[17px] text-[var(--color-blue-800)]">Nenhuma amostra encontrada.</p>
            <p className="mt-2 text-[13px] text-[var(--color-neutral-700)]">Amplie os filtros para ver mais amostras.</p>
            <div className="mt-5 flex justify-center gap-2">
              <button onClick={limpar} className="btn btn-secondary"><RotateCcw size={14} /> Limpar filtros</button>
            </div>
          </div>
        </div>
      ) : view === "grupos" ? (
        <div className="flex flex-col gap-5 px-7 pt-4 pb-10">
          {agruparAmostras(lista).map((grupo) => (
            <Cartao key={grupo.tipo} titulo={`${grupo.titulo} (${grupo.total})`} subtitulo={`${grupo.prefixos.length} prefixo(s) de código`}
              icone={grupo.tipo === "disco" ? <Disc size={18} /> : <Layers size={18} />}>
              <div className="overflow-x-auto">
                <table className="table text-[14px]">
                  {cabecalho}
                  {grupo.prefixos.map((g) => (
                    <tbody key={g.prefixo}>
                      {/* o prefixo já aparece abaixo de cada código: a faixa só entra quando ele tem significado cadastrado */}
                      {(!g.prefixo || g.significado != null) && (
                        <tr>
                          <td colSpan={COLUNAS} className="!border-b-2 !border-[var(--color-blue-200)] !bg-[var(--color-blue-50)] !py-2">
                            <span className="font-heading text-[13px] font-bold text-[var(--color-blue-800)]">
                              {tituloPrefixo(g)} ({g.amostras.length})
                            </span>
                          </td>
                        </tr>
                      )}
                      {g.amostras.map(linhaAmostra)}
                    </tbody>
                  ))}
                </table>
              </div>
            </Cartao>
          ))}
        </div>
      ) : view === "table" ? (
        <div className="px-7 pt-4 pb-10 overflow-x-auto">
          <table className="table text-[14px]">
            {cabecalho}
            <tbody>{lista.map(linhaAmostra)}</tbody>
          </table>
        </div>
      ) : view === "chart" ? (
        <div className="px-7 pt-4 pb-10">
          <Cartao titulo="Porosidade × permeabilidade"
            subtitulo={`Petrofísica antes da acidificação · permeabilidade em escala log · ${pontosGrafico.length} de ${lista.length} amostra(s) com φ e k · clique num ponto para abrir a ficha`}>
            <div className="p-6">
              {pontosGrafico.length ? (
                <GraficoDispersao xLabel="Porosidade (%)" yLabel="k líquido (mD)" logY altura={420}
                  pontos={pontosGrafico} aoClicar={(pt) => navigate(`/amostras/${pt.id}`)} />
              ) : (
                <p className="m-0 py-10 text-center text-[13px] text-[var(--color-neutral-600)]">Nenhuma amostra da lista tem porosidade e permeabilidade medidas.</p>
              )}
            </div>
          </Cartao>
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
                <Metrica rotulo="k (mD)" valor={melhorK(s)?.texto ?? "—"} />
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
