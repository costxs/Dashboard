import { useMemo, useState, type ReactNode } from "react";
import { Simbolos } from "../components/ui/Simbolos";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronUp, Download, ExternalLink, FileText, Layers, LineChart, Lock, Pencil, Plus, Table2 } from "lucide-react";
import { GraficoRda } from "../components/charts/GraficoRda";
import { MedidasAgrupadas, type Agrupamento } from "../components/literatura/MedidasAgrupadas";
import { PainelPvbt } from "../components/pvbt/PainelPvbt";
import { Select } from "../components/ui/Select";
import { Aviso, CabecalhoPagina, Carregando, Cartao } from "../components/ui/base";
import { fmt } from "../utils/formatacao";
import { ANALISES } from "../config/analises";
import { useConsulta } from "../hooks/useConsulta";
import { linkArquivo } from "../servicos/analises";
import { listarLitologias, listarSistemasAcidos } from "../servicos/amostras";
import { listarProjetos, souEditor } from "../servicos/contexto";
import { arquivosDaPublicacao, listarDadosRda, listarPublicacoes, listarRochasLiteratura, pontosComparacao, publicacoesComArquivo, type FiltroRda } from "../servicos/literatura";
import { listarPvbt } from "../servicos/pvbt";
import { useContexto } from "../store/useContexto";
import type { DadoLiteraturaRda, Publicacao } from "../tipos/banco";
import { FormularioPublicacao } from "./literatura/FormularioPublicacao";

const TODOS = "Todos";
const EIXOS: Record<string, string> = Object.fromEntries(ANALISES.map((a) => [a.chave, `${a.numero}. ${a.titulo}`]));

// Literatura em duas partes (quadro da reunião):
//   GERAL   = publicações externas + dados extraídos (planilha de reatividade)
//   PRÓPRIA = o que o LC PETRO publicou (artigos, TCCs, relatórios)
export function LiteraturePage() {
  const [params, setParams] = useSearchParams();
  const aba = params.get("aba") === "propria" ? "propria" : "geral";

  return (
    <div>
      <CabecalhoPagina titulo="Banco da Literatura"
        subtitulo={aba === "geral"
          ? "Publicações externas e os dados de taxa de reação e de PVbt extraídos delas, comparados com os ensaios do LC PETRO."
          : "Artigos, dissertações, TCCs e relatórios produzidos pelo LC PETRO."} />
      <div className="flex gap-7 bg-white border-y border-[var(--color-neutral-300)] px-7 pt-4">
        {([["geral", "Geral"], ["propria", "Própria (LC PETRO)"]] as const).map(([k, r]) => (
          <button key={k} onClick={() => setParams({ aba: k })}
            className={`pb-3 text-[14px] font-semibold border-b-[3px] transition-colors ${aba === k
              ? "border-[var(--color-orange)] text-[var(--color-blue-800)]" : "border-transparent text-[var(--color-neutral-600)] hover:text-[var(--color-blue)]"}`}>
            {r}
          </button>
        ))}
      </div>
      {aba === "geral" ? <Geral /> : <Propria />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GERAL: duas seções, taxa de reação (planilha de reatividade) e PVbt (base de coreflooding).
const SECOES = [["rda", "Taxa de reação (RDA)"], ["pvbt", "PVbt (coreflooding)"]] as const;

function Geral() {
  const [params, setParams] = useSearchParams();
  const secao = params.get("secao") === "pvbt" ? "pvbt" : "rda";
  return (
    <>
      <div className="flex flex-wrap gap-2 px-7 pt-5">
        {SECOES.map(([k, r]) => (
          <button key={k} onClick={() => setParams(k === "pvbt" ? { aba: "geral", secao: k } : { aba: "geral" })}
            className={`btn ${secao === k ? "btn-blue" : "btn-secondary"}`}>
            {r}
          </button>
        ))}
      </div>
      {secao === "pvbt" ? <GeralPvbt /> : <GeralRda />}
    </>
  );
}

// PVbt: literatura e Petrobras (conforme a RLS); os ensaios do LC PETRO do contexto aberto só entram se marcar a fonte.
function GeralPvbt() {
  const navigate = useNavigate();
  const empresaId = useContexto((s) => s.empresaId);
  const projetoId = useContexto((s) => s.projetoId);
  const projetos = useConsulta(() => (projetoId ? Promise.resolve(null) : listarProjetos(empresaId ?? undefined)), [projetoId, empresaId]);
  const pvbt = useConsulta(() => listarPvbt(), []);
  const chaveIds = projetoId ?? (projetos.dados ?? []).map((p) => p.id).join(",");
  const pontos = useMemo(() => {
    if (!pvbt.dados) return null;
    const permitidos = chaveIds.split(",");
    return pvbt.dados.filter((p) => p.fonte !== "LCPETRO" || (p.projeto_id != null && permitidos.includes(p.projeto_id)));
  }, [pvbt.dados, chaveIds]);

  return (
    <div className="px-7 pt-6 pb-10">
      <PainelPvbt pontos={pontos} carregando={pvbt.carregando} erro={pvbt.erro}
        fontesIniciais={{ LCPETRO: false }} aoAbrirAmostra={(id) => navigate(`/amostras/${id}?tab=coreflooding`)} />
    </div>
  );
}

// Taxa de reação: tudo o que a planilha de reatividade carregou, em 5 visões.
type VisaoGeral = "grafico" | "ensaios" | "rochas" | "sistemas" | "referencias";
const VAZIO = { litologia: TODOS, acido: TODOS, temperatura: TODOS, referencia: TODOS, rocha: TODOS, sistema: TODOS };

function GeralRda() {
  const empresaId = useContexto((s) => s.empresaId);
  const projetoId = useContexto((s) => s.projetoId);
  const [params, setParams] = useSearchParams();
  const visao = (params.get("ver") as VisaoGeral) || "grafico";
  const irPara = (v: VisaoGeral) => setParams({ aba: "geral", ver: v }, { replace: true });
  const [f, setF] = useState(VAZIO);
  const [agrup, setAgrup] = useState<Agrupamento>("serie");
  const [comoLista, setComoLista] = useState(false);

  const litologias = useConsulta(listarLitologias, []);
  const pubs = useConsulta(() => listarPublicacoes({ categoria: "geral" }), []);
  const rochas = useConsulta(listarRochasLiteratura, []);
  const sistemas = useConsulta(listarSistemasAcidos, []);
  const comPdf = useConsulta(publicacoesComArquivo, []);
  const projetos = useConsulta(() => listarProjetos(empresaId ?? undefined), [empresaId]);
  const filtro: FiltroRda = {
    litologias: f.litologia !== TODOS ? [f.litologia] : undefined,
    acidos: f.acido !== TODOS ? [f.acido] : undefined,
    temperaturas: f.temperatura !== TODOS ? [Number(f.temperatura)] : undefined,
  };
  const pontos = useConsulta(() => pontosComparacao(filtro), [f.litologia, f.acido, f.temperatura]);
  const todosDados = useConsulta(() => listarDadosRda(), []);

  // filtros aplicados à tabela de ensaios (mesmos do gráfico)
  const dadosFiltrados = useMemo(() => (todosDados.dados ?? []).filter((d) =>
    (f.litologia === TODOS || d.litologia === f.litologia) &&
    (f.acido === TODOS || d.acido === f.acido) &&
    (f.temperatura === TODOS || d.temperatura_nominal_c === Number(f.temperatura)) &&
    (f.referencia === TODOS || d.id_referencia === f.referencia) &&
    (f.rocha === TODOS || d.id_rocha === f.rocha) &&
    (f.sistema === TODOS || d.id_sistema === f.sistema)), [todosDados.dados, f]);
  const soLiteratura = f.referencia !== TODOS || f.rocha !== TODOS || f.sistema !== TODOS;
  const idsDaReferencia = useMemo(() => new Set(dadosFiltrados.map((d) => d.id_ensaio)), [dadosFiltrados]);

  // pontos do laboratório só do contexto aberto (projeto ou empresa)
  const idsContexto = projetoId ? [projetoId] : (projetos.dados ?? []).map((p) => p.id);
  const pontosVisiveis = (pontos.dados ?? []).filter((p) =>
    p.fonte === "literatura" ? (!soLiteratura || idsDaReferencia.has(p.id))
      : (!soLiteratura && p.projeto_id != null && idsContexto.includes(p.projeto_id)));
  const acidos = useMemo(() => [...new Set((todosDados.dados ?? []).map((p) => p.acido))].sort(), [todosDados.dados]);
  const temperaturas = useMemo(() => [...new Set((todosDados.dados ?? []).map((p) => p.temperatura_nominal_c).filter((t): t is number => t != null))]
    .sort((a, b) => a - b).map(String), [todosDados.dados]);
  const refs = pubs.dados ?? [];
  const rotulosRef = Object.fromEntries(refs.map((r) => [r.id_referencia, `${r.id_referencia} · ${r.autor}${r.ano ? ` (${r.ano})` : ""}`]));

  // contagem de medidas por rocha e por sistema
  const porRocha = contar(todosDados.dados, "id_rocha");
  const porSistema = contar(todosDados.dados, "id_sistema");

  const resumo: [VisaoGeral, string, number | undefined][] = [
    ["ensaios", "Medidas de taxa de reação", todosDados.dados?.length],
    ["referencias", "Referências", pubs.dados?.length],
    ["rochas", "Rochas descritas", rochas.dados?.length],
    ["sistemas", "Sistemas ácidos", sistemas.dados?.length],
  ];
  const abas: [VisaoGeral, string][] = [["grafico", "Gráfico"], ["ensaios", "Ensaios"], ["rochas", "Rochas"], ["sistemas", "Sistemas ácidos"], ["referencias", "Referências"]];

  const filtros = (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-5 px-6 pt-5">
      <Select label="Referência" value={f.referencia} onChange={(v) => setF({ ...f, referencia: v })}
        options={[TODOS, ...refs.map((r) => r.id_referencia)]} rotulos={rotulosRef} />
      <Select label="Litotipo" value={f.litologia} onChange={(v) => setF({ ...f, litologia: v })}
        options={[TODOS, ...(litologias.dados ?? []).map((l) => l.nome)]} />
      <Select label="Ácido" value={f.acido} onChange={(v) => setF({ ...f, acido: v })} options={[TODOS, ...acidos]} />
      <Select label="Temperatura nominal" value={f.temperatura} onChange={(v) => setF({ ...f, temperatura: v })}
        options={[TODOS, ...temperaturas]} rotulos={Object.fromEntries(temperaturas.map((t) => [t, `${t} °C`]))} />
      {(f.rocha !== TODOS || f.sistema !== TODOS) && (
        <div className="md:col-span-4 text-[12px] text-[var(--color-neutral-700)]">
          Mostrando só {f.rocha !== TODOS ? <>a rocha <strong className="text-[var(--color-red)]">{f.rocha}</strong></> : <>o sistema <strong className="text-[var(--color-red)]">{f.sistema}</strong></>}.
        </div>
      )}
    </div>
  );
  const filtrando = Object.values(f).some((v) => v !== TODOS);
  const limpar = filtrando && <button className="btn btn-secondary" onClick={() => setF(VAZIO)}>Limpar filtros</button>;

  return (
    <div className="px-7 pt-6 pb-10 flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {resumo.map(([v, rotulo, n]) => (
          <button key={v} onClick={() => irPara(v)}
            className={`text-left bg-white border rounded-[14px] px-5 py-4 transition-all hover:shadow-md ${visao === v ? "border-[var(--color-orange)] shadow-sm" : "border-[var(--color-neutral-300)]"}`}>
            <div className="font-heading font-bold text-[28px] leading-none text-[var(--color-blue-800)] tabular-nums">{n ?? "…"}</div>
            <div className="mt-1.5 text-[12px] font-semibold text-[var(--color-neutral-600)]">{rotulo}</div>
          </button>
        ))}
      </div>

      <div className="flex gap-6 border-b border-[var(--color-neutral-300)] overflow-x-auto">
        {abas.map(([v, r]) => (
          <button key={v} onClick={() => irPara(v)}
            className={`pb-2.5 text-[14px] font-semibold border-b-[3px] whitespace-nowrap transition-colors ${visao === v
              ? "border-[var(--color-orange)] text-[var(--color-blue-800)]" : "border-transparent text-[var(--color-neutral-600)] hover:text-[var(--color-blue)]"}`}>
            {r}
          </button>
        ))}
      </div>

      {visao === "grafico" && (
        <Cartao titulo="Taxa de reação rocha-ácido" subtitulo="Literatura (azul) × ensaios de RDA do LC PETRO neste projeto (laranja)" acoes={limpar || undefined}>
          {filtros}
          <div className="p-6">
            {pontos.carregando && !pontos.dados ? <Carregando /> : pontos.erro ? <Aviso tipo="erro">{pontos.erro}</Aviso> : <GraficoRda pontos={pontosVisiveis} />}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-neutral-300)] px-6 pt-5 pb-3">
            <div>
              <h3 className="m-0 text-[15px] font-bold text-[var(--color-blue-800)]">Dados do gráfico ({dadosFiltrados.length})</h3>
              <p className="m-0 mt-0.5 text-[12px] text-[var(--color-neutral-600)]">Medidas da literatura com os mesmos filtros acima, agrupadas. Abra um grupo para ver as linhas.</p>
            </div>
            {!!dadosFiltrados.length && <button className="btn btn-secondary" onClick={() => baixarCsv(dadosFiltrados)}><Download size={14} /> Baixar CSV</button>}
          </div>
          <div className="pb-2">
            {todosDados.carregando ? <Carregando /> : todosDados.erro
              ? <div className="p-6"><Aviso tipo="erro">{todosDados.erro}</Aviso></div>
              : <MedidasAgrupadas linhas={dadosFiltrados} agrupamento={agrup} onAgrupamento={setAgrup} />}
          </div>
        </Cartao>
      )}

      {visao === "ensaios" && (
        <Cartao titulo={`Ensaios (${dadosFiltrados.length}${filtrando ? ` de ${todosDados.dados?.length ?? 0}` : ""})`}
          subtitulo="Cada linha é uma medida de taxa de reação extraída de uma referência"
          acoes={<>{limpar}
            <button className="btn btn-secondary" onClick={() => setComoLista(!comoLista)}>{comoLista ? <><Layers size={14} /> Ver agrupado</> : <><Table2 size={14} /> Ver como lista</>}</button>
            {!!dadosFiltrados.length && <button className="btn btn-secondary" onClick={() => baixarCsv(dadosFiltrados)}><Download size={14} /> Baixar CSV</button>}</>}>
          {filtros}
          <div className="pt-5">{todosDados.carregando ? <Carregando /> : todosDados.erro ? <div className="p-6"><Aviso tipo="erro">{todosDados.erro}</Aviso></div>
            : comoLista ? <TabelaRda linhas={dadosFiltrados} /> : <MedidasAgrupadas linhas={dadosFiltrados} agrupamento={agrup} onAgrupamento={setAgrup} />}</div>
        </Cartao>
      )}

      {visao === "rochas" && (
        <Cartao titulo={`Rochas (${rochas.dados?.length ?? 0})`} subtitulo="As rochas como cada referência as descreveu">
          {rochas.carregando ? <Carregando /> : rochas.erro ? <div className="p-6"><Aviso tipo="erro">{rochas.erro}</Aviso></div> : (
            <TabelaSimples
              cab={["Rocha", "Litotipo", "Composição", "Calcita (%)", "Dolomita (%)", "Razão Ca/Mg", "Medidas"]}
              linhas={(rochas.dados ?? []).map((r) => [
                <span key="id" className="font-bold text-[var(--color-red)]">{r.id_rocha}</span>, r.litologia, r.composicao_texto ?? "—",
                qual(r.calcita_qualificador, r.calcita_pct), qual(r.dolomita_qualificador, r.dolomita_pct), fmt(r.razao_ca_mg, 2),
                <VerMedidas key="n" n={porRocha[r.id_rocha] ?? 0} onClick={() => { setF({ ...VAZIO, rocha: r.id_rocha }); irPara("ensaios"); }} />,
              ])} />
          )}
        </Cartao>
      )}

      {visao === "sistemas" && (
        <Cartao titulo={`Sistemas ácidos (${sistemas.dados?.length ?? 0})`} subtitulo="Concentrações em M e % calculadas pelo banco a partir das propriedades dos fluidos">
          {sistemas.carregando ? <Carregando /> : sistemas.erro ? <div className="p-6"><Aviso tipo="erro">{sistemas.erro}</Aviso></div> : (
            <TabelaSimples
              cab={["Sistema", "Nome", "Categoria", "Ácido", "Concentração", "Conc. (M) ƒ", "Conc. (%) ƒ", "Aditivos", "Medidas"]}
              linhas={(sistemas.dados ?? []).map((s) => [
                <span key="id" className="font-bold text-[var(--color-red)]">{s.id_sistema}</span>, s.nome_sistema, s.categoria ?? "—", s.componente_1,
                s.valor_1 != null ? `${fmt(s.valor_1, 3)} ${s.unidade_1 ?? ""}` : "—", fmt(s.conc_m, 3), fmt(s.conc_pct, 2), s.aditivos ?? "—",
                <VerMedidas key="n" n={porSistema[s.id_sistema] ?? 0} onClick={() => { setF({ ...VAZIO, sistema: s.id_sistema }); irPara("ensaios"); }} />,
              ])} />
          )}
        </Cartao>
      )}

      {visao === "referencias" && (
        <ListaPublicacoes lista={pubs.dados} comPdf={comPdf.dados}
          dadosDe={(id) => (todosDados.dados ?? []).filter((d) => d.id_referencia === id)}
          noGrafico={(id) => { setF({ ...VAZIO, referencia: id }); irPara("grafico"); }} />
      )}
    </div>
  );
}

function contar(linhas: DadoLiteraturaRda[] | null | undefined, chave: "id_rocha" | "id_sistema") {
  const c: Record<string, number> = {};
  for (const l of linhas ?? []) c[l[chave]] = (c[l[chave]] ?? 0) + 1;
  return c;
}

function qual(q: string | null, v: number | null) {
  if (v == null) return "—";
  return `${q && q !== "=" ? q.replace(">=", "≥").replace("<=", "≤") + " " : ""}${fmt(v, 1)}`;
}

function VerMedidas({ n, onClick }: { n: number; onClick: () => void }) {
  if (!n) return <span className="text-[var(--color-neutral-500)]">0</span>;
  return <button className="font-bold text-[var(--color-blue)] hover:text-[var(--color-red)] underline-offset-2 hover:underline" onClick={onClick}>{n}</button>;
}

function TabelaSimples({ cab, linhas }: { cab: string[]; linhas: ReactNode[][] }) {
  return (
    <div className="overflow-auto px-6 pb-4">
      <table className="table text-[13px]">
        <thead><tr>{cab.map((c) => <th key={c}><Simbolos>{c}</Simbolos></th>)}</tr></thead>
        <tbody>{linhas.map((l, i) => <tr key={i} className="lcp-row">{l.map((c, j) => <td key={j} className="!py-2.5 tabular-nums">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function TabelaRda({ linhas, compacta }: { linhas: DadoLiteraturaRda[]; compacta?: boolean }) {
  const cols: [keyof DadoLiteraturaRda, string, boolean?][] = [
    ["id_ensaio", "Ensaio"], ...(compacta ? [] : [["referencia_autor", "Referência"]] as [keyof DadoLiteraturaRda, string][]),
    ["id_rocha", "Rocha"], ["litologia", "Litotipo"], ["acido", "Ácido"],
    ["conc_m", "Conc. (M)"], ["temperatura_c", "T (°C)"], ["pressao_psi", "P (psi)"], ["rotacao_rpm", "rpm"], ["raiz_omega", "√ω"],
    ["taxa_reacao_mol_cm2_s", "Taxa (mol/cm²·s)", true], ["taxa_reacao_mol_m2_s", "Taxa (mol/m²·s)", true], ["obtencao_dado", "Obtenção"],
  ];
  if (!linhas.length) return <p className="px-6 py-8 m-0 text-center text-[13px] text-[var(--color-neutral-600)]">Nenhuma medida com esses filtros.</p>;
  return (
    <div className={`${compacta ? "max-h-[320px]" : "max-h-[560px]"} overflow-auto px-6`}>
      <table className="table text-[12px]">
        <thead className="sticky top-0 bg-white z-[1]"><tr>{cols.map(([k, r]) => <th key={k}><Simbolos>{r}</Simbolos></th>)}</tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id_ensaio} className="lcp-row">
              {cols.map(([k, , c]) => <td key={k} className={`!py-2 tabular-nums ${k === "id_ensaio" || k === "id_rocha" ? "whitespace-nowrap font-bold text-[var(--color-blue-800)]" : ""}`}>{fmt(l[k], 3, c)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function baixarCsv(linhas: DadoLiteraturaRda[]) {
  const cols = Object.keys(linhas[0]) as (keyof DadoLiteraturaRda)[];
  const esc = (v: unknown) => (v == null ? "" : `"${String(v).replace(/"/g, '""')}"`);
  const csv = [cols.join(";"), ...linhas.map((l) => cols.map((c) => esc(l[c])).join(";"))].join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = "literatura_reatividade.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
function Propria() {
  const [eixo, setEixo] = useState(TODOS);
  const [ordem, setOrdem] = useState("Mais recentes");
  const pubs = useConsulta(() => listarPublicacoes({ categoria: "propria", eixo: eixo !== TODOS ? eixo : undefined }), [eixo]);
  const comPdf = useConsulta(publicacoesComArquivo, []);
  const [editando, setEditando] = useState<Publicacao | "nova" | null>(null);
  const editor = useConsulta(souEditor, []);

  if (editando) {
    return (
      <div className="px-7 pt-6 pb-10">
        <FormularioPublicacao publicacao={editando === "nova" ? undefined : editando}
          aoCancelar={() => setEditando(null)} aoSalvar={() => { setEditando(null); pubs.recarregar(); comPdf.recarregar(); }} />
      </div>
    );
  }

  const lista =[...(pubs.dados ?? [])].sort((a, b) =>
    ordem === "Mais recentes" ? (b.ano_ordem ?? 0) - (a.ano_ordem ?? 0) : (a.ano_ordem ?? 0) - (b.ano_ordem ?? 0));

  return (
    <>
      <div className="flex flex-wrap gap-5 items-end bg-white border-b border-[var(--color-neutral-300)] px-7 py-4">
        <Select className="min-w-[240px]" label="Filtrar por eixo" value={eixo} onChange={setEixo}
          options={[TODOS, ...Object.keys(EIXOS)]} rotulos={EIXOS} />
        <Select className="min-w-[200px]" label="Ordenação" value={ordem} onChange={setOrdem} options={["Mais recentes", "Mais antigas"]} />
        {editor.dados && <button className="btn btn-primary ml-auto" onClick={() => setEditando("nova")}><Plus size={14} /> Nova publicação</button>}
      </div>
      <div className="px-7 pt-6 pb-10">
        {pubs.erro && <Aviso tipo="erro">{pubs.erro}</Aviso>}
        <ListaPublicacoes lista={pubs.dados ? lista : null} comPdf={comPdf.dados} aoEditar={editor.dados ? setEditando : undefined} />
      </div>
    </>
  );
}

function ListaPublicacoes({ lista, comPdf, dadosDe, noGrafico, aoEditar }: {
  lista: Publicacao[] | null; comPdf?: Set<string> | null;
  dadosDe?: (id: string) => DadoLiteraturaRda[]; noGrafico?: (id: string) => void;
  aoEditar?: (p: Publicacao) => void;
}) {
  if (!lista) return <Carregando />;
  if (!lista.length) {
    return (
      <div className="border border-dashed border-[var(--color-blue-200)] rounded-[16px] px-8 py-11 text-center bg-white">
        <p className="m-0 font-heading font-bold text-[17px] text-[var(--color-blue-800)]">Nenhuma publicação encontrada.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {lista.map((p) => <CartaoPublicacao key={p.id_referencia} p={p} temPdf={comPdf?.has(p.id_referencia) ?? false}
        dados={dadosDe?.(p.id_referencia)} noGrafico={noGrafico} aoEditar={aoEditar} />)}
    </div>
  );
}

function CartaoPublicacao({ p, temPdf, dados, noGrafico, aoEditar }: {
  p: Publicacao; temPdf: boolean; dados?: DadoLiteraturaRda[]; noGrafico?: (id: string) => void; aoEditar?: (p: Publicacao) => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  async function abrirPdf() {
    try {
      const arqs = await arquivosDaPublicacao(p.id_referencia);
      if (!arqs.length) { setErro("Nenhum PDF anexado a esta publicação."); return; }
      window.open(await linkArquivo(arqs[0].caminho), "_blank", "noopener");
    } catch (e) { setErro(String(e)); }
  }
  const temDados = p.n_dados_rda > 0 && !!dados;
  const rochas = dados ? [...new Set(dados.map((d) => `${d.id_rocha} · ${d.litologia}`))] : [];
  const sistemas = dados ? [...new Set(dados.map((d) => `${d.id_sistema} · ${d.nome_sistema}`))] : [];
  return (
    <div className="bg-white border border-[var(--color-neutral-300)] border-l-4 border-l-[var(--color-blue)] rounded-[14px] hover:shadow-md transition-all">
      <div className="flex flex-wrap items-start justify-between gap-6 p-6">
        <div className="flex-1 min-w-[280px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading font-extrabold text-[12px] text-[var(--color-red)] uppercase tracking-[0.06em]">{p.id_referencia}</span>
            <span className="text-[var(--color-neutral-300)]">•</span>
            <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">{p.ano ?? "s/d"}</span>
            {p.tipo && <span className="tag tag-blue">{p.tipo}</span>}
            {p.projeto_id && <span className="tag tag-orange flex items-center gap-1"><Lock size={10} /> restrita ao projeto</span>}
          </div>
          <h3 className="mt-2 text-[17px] font-bold text-[var(--color-blue-800)] leading-[1.3]">{p.titulo ?? p.autor}</h3>
          {p.titulo && <p className="mt-1.5 text-[13px] font-medium text-[var(--color-neutral-700)]">{p.autor}</p>}
          {p.periodico && <p className="mt-1 text-[12px] italic text-[var(--color-neutral-500)]">{p.periodico}</p>}
          {p.resumo && <p className="mt-3 text-[13px] text-[var(--color-neutral-700)] max-w-[80ch]">{p.resumo}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.eixos?.map((e) => <span key={e} className="tag tag-orange">{EIXOS[e] ?? e}</span>)}
            {p.palavras_chave?.map((k) => <span key={k} className="tag tag-neutral">#{k}</span>)}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-[var(--color-neutral-600)]">
            {p.n_dados_rda > 0 && <span><strong className="text-[var(--color-blue)]">{p.n_dados_rda}</strong> medidas de taxa de reação</span>}
            {rochas.length > 0 && <span><strong className="text-[var(--color-blue)]">{rochas.length}</strong> rocha(s)</span>}
            {sistemas.length > 0 && <span><strong className="text-[var(--color-blue)]">{sistemas.length}</strong> sistema(s) ácido(s)</span>}
            {p.n_amostras > 0 && <span><strong className="text-[var(--color-blue)]">{p.n_amostras}</strong> amostra(s) do LC PETRO</span>}
          </div>
          {erro && <div className="mt-3"><Aviso tipo="info">{erro}</Aviso></div>}
        </div>
        <div className="flex flex-col items-stretch gap-2 shrink-0 min-w-[170px]">
          {temDados && (
            <button type="button" className="btn btn-blue" onClick={() => setAberto(!aberto)}>
              {aberto ? <ChevronUp size={15} /> : <Table2 size={15} />} {aberto ? "Ocultar dados" : "Ver dados"}
            </button>
          )}
          {temDados && noGrafico && (
            <button type="button" className="btn btn-secondary" onClick={() => noGrafico(p.id_referencia)}><LineChart size={15} /> Ver no gráfico</button>
          )}
          {temPdf && <button type="button" className="btn btn-secondary" onClick={abrirPdf}><FileText size={15} /> Abrir PDF</button>}
          {aoEditar && <button type="button" className="btn btn-secondary" onClick={() => aoEditar(p)}><Pencil size={14} /> Editar</button>}
          {p.doi && (
            <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer"
              className="flex items-center justify-end gap-1.5 mt-1 text-[11px] font-medium text-[var(--color-neutral-500)] hover:text-[var(--color-red)]">
              DOI: {p.doi} <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
      {aberto && dados && (
        <div className="border-t border-[var(--color-neutral-300)] pt-4 pb-2">
          <div className="flex flex-wrap gap-x-8 gap-y-2 px-6 pb-3 text-[12px] text-[var(--color-neutral-700)]">
            <span><strong className="text-[var(--color-blue-800)]">Rochas:</strong> {rochas.join("; ")}</span>
            <span><strong className="text-[var(--color-blue-800)]">Sistemas:</strong> {sistemas.join("; ")}</span>
          </div>
          <TabelaRda linhas={dados} compacta />
        </div>
      )}
    </div>
  );
}
