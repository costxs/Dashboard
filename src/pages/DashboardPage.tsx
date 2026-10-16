import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Aviso, CabecalhoPagina, Carregando } from "../components/ui/base";
import { fmt, fmtData, mensagemErro } from "../utils/formatacao";
import { useConsulta } from "../hooks/useConsulta";
import { apagarWorkPackage, dashboard, listarWorkPackages, meuPapel, salvarWorkPackage } from "../servicos/contexto";
import { useContexto } from "../store/useContexto";
import type { WorkPackage } from "../tipos/banco";

type StatusWp = "Concluído" | "Em curso" | "Não iniciado";
const statusWp = (wp: WorkPackage): StatusWp =>
  (wp.progresso_realizado ?? 0) >= 100 ? "Concluído" : (wp.progresso_realizado ?? 0) > 0 ? "Em curso" : "Não iniciado";
const classeStatus: Record<StatusWp, string> = {
  "Concluído": "tag tag-solid",
  "Em curso": "tag tag-orange",
  "Não iniciado": "tag tag-muted",
};

export function DashboardPage() {
  const empresaId = useContexto((s) => s.empresaId);
  const projetoId = useContexto((s) => s.projetoId);

  const resumo = useConsulta(() => dashboard(projetoId ?? undefined, empresaId ?? undefined), [projetoId, empresaId]);
  const ids = (resumo.dados ?? []).map((r) => r.projeto_id);
  const wps = useConsulta(() => listarWorkPackages(ids), [ids.join(",")]);
  const papel = useConsulta(() => (projetoId ? meuPapel(projetoId) : Promise.resolve(null)), [projetoId]);
  const podeEditar = papel.dados === "editor";
  const [editando, setEditando] = useState<Partial<WorkPackage> | null>(null);

  if (resumo.carregando && !resumo.dados) return <Carregando />;
  if (resumo.erro) return <div className="p-7"><Aviso tipo="erro">{resumo.erro}</Aviso></div>;

  const linhas = resumo.dados ?? [];
  const soma = (k: "n_amostras" | "n_em_ensaio" | "n_utilizadas") => linhas.reduce((s, l) => s + Number(l[k] ?? 0), 0);
  const listaWps = wps.dados ?? [];
  const ativos = listaWps.filter((w) => statusWp(w) === "Em curso").length;
  const media = (k: "progresso_planejado" | "progresso_realizado") =>
    listaWps.length ? Math.round(listaWps.reduce((s, w) => s + Number(w[k] ?? 0), 0) / listaWps.length) : null;
  const planejado = media("progresso_planejado");
  const realizado = media("progresso_realizado");
  const nomeProjeto = (id: string) => linhas.find((l) => l.projeto_id === id)?.projeto ?? "";

  return (
    <div>
      <CabecalhoPagina
        titulo="Dashboard Gerencial"
        subtitulo="Visão macro dos projetos de caracterização de rochas carbonáticas e estimulação ácida."
        acoes={<div className="text-right"><p className="m-0 text-[10px] tracking-[0.07em] uppercase text-[var(--color-neutral-500)]">Atualizado em</p>
          <p className="mt-1 font-heading font-bold text-base">{new Date().toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</p></div>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 border-y border-[var(--color-neutral-300)] bg-white">
        <Indicador titulo="Amostras cadastradas" valor={soma("n_amostras")} detalhe={`${soma("n_em_ensaio")} em ensaio`} cor="var(--color-blue)" />
        <Indicador titulo="Amostras utilizadas" valor={soma("n_utilizadas")} detalhe="ensaios destrutivos concluídos" cor="var(--color-blue)" />
        <Indicador titulo="Work packages em curso" valor={ativos} detalhe={`${listaWps.length} no total`} cor="var(--color-orange-700)" />
        <Indicador titulo="Progresso geral" valor={realizado == null ? "—" : `${realizado}%`}
          detalhe={planejado == null || realizado == null ? "sem WPs cadastrados"
            : realizado >= planejado ? `planejado ${planejado}% · em dia` : `planejado ${planejado}% · ${planejado - realizado} p.p. atrás`}
          cor={planejado != null && realizado != null && realizado < planejado ? "var(--color-red)" : "var(--color-blue)"} ultimo />
      </div>

      {!projetoId && linhas.length > 1 && (
        <div className="px-7 pt-9">
          <h2 className="m-0 mb-3 text-[19px] text-[var(--color-blue-800)]">Projetos</h2>
          <table className="table text-[14px]">
            <thead><tr><th>Projeto</th><th className="text-right">Amostras</th><th className="text-right">Em ensaio</th><th className="text-right">WPs</th><th className="text-right">Planejado / realizado</th></tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.projeto_id} className="lcp-row">
                  <td><span className="font-heading font-extrabold text-[var(--color-blue)]">{l.projeto}</span> <span className="text-[var(--color-neutral-700)]">— {l.nome}</span></td>
                  <td className="text-right tabular-nums">{l.n_amostras}</td>
                  <td className="text-right tabular-nums">{l.n_em_ensaio}</td>
                  <td className="text-right tabular-nums">{l.n_wps}</td>
                  <td className="text-right tabular-nums">{fmt(l.progresso_planejado, 0)}% / {fmt(l.progresso_realizado, 0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-7 pt-9 pb-10">
        <div className="flex items-baseline justify-between gap-6 mb-3">
          <h2 className="m-0 text-[19px] text-[var(--color-blue-800)]">Work packages</h2>
          <div className="flex items-center gap-4">
            <Legenda />
            {podeEditar && projetoId && (
              <button className="btn btn-primary" onClick={() => setEditando({ projeto_id: projetoId, codigo: `WP${listaWps.length + 1}` })}>
                <Plus size={14} /> Novo WP
              </button>
            )}
          </div>
        </div>

        {editando && (
          <FormularioWp wp={editando} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); wps.recarregar(); resumo.recarregar(); }} />
        )}

        {wps.erro && <Aviso tipo="erro">{wps.erro}</Aviso>}
        {listaWps.length === 0 && !wps.carregando && (
          <p className="text-[13px] text-[var(--color-neutral-600)]">
            Nenhum work package cadastrado{projetoId ? " neste projeto" : ""}.
            {!projetoId && " Abra um projeto específico para cadastrar."}
          </p>
        )}
        {listaWps.length > 0 && (
          <table className="table text-[14px]">
            <thead>
              <tr>
                <th className="w-[70px]">WP</th>
                <th>Descrição</th>
                {!projetoId && <th>Projeto</th>}
                <th className="w-[110px]">Prazo</th>
                <th className="w-[120px]">Status</th>
                <th className="w-[260px] text-right">Evolução</th>
                {podeEditar && <th className="w-[70px]" />}
              </tr>
            </thead>
            <tbody>
              {listaWps.map((wp) => (
                <tr key={wp.id} className="lcp-row">
                  <td className="font-heading font-extrabold text-[14px] text-[var(--color-blue)]">{wp.codigo}</td>
                  <td className="text-[var(--color-neutral-800)] pr-6">{wp.nome}</td>
                  {!projetoId && <td className="text-[12px] text-[var(--color-neutral-600)]">{nomeProjeto(wp.projeto_id)}</td>}
                  <td className="text-[13px] text-[var(--color-neutral-700)]">{fmtData(wp.fim)}</td>
                  <td><span className={classeStatus[statusWp(wp)]}>{statusWp(wp)}</span></td>
                  <td>
                    <BarraWp planejado={wp.progresso_planejado ?? 0} realizado={wp.progresso_realizado ?? 0} codigo={wp.codigo} />
                  </td>
                  {podeEditar && (
                    <td className="text-right">
                      <button title="Editar" className="p-1 text-[var(--color-neutral-500)] hover:text-[var(--color-blue)]" onClick={() => setEditando(wp)}><Pencil size={14} /></button>
                      <button title="Apagar" className="p-1 text-[var(--color-neutral-500)] hover:text-[var(--color-red)]"
                        onClick={async () => { if (confirm(`Apagar ${wp.codigo}?`)) { await apagarWorkPackage(wp.id); wps.recarregar(); } }}><Trash2 size={14} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Indicador(p: { titulo: string; valor: number | string; detalhe: string; cor: string; ultimo?: boolean }) {
  return (
    <div className={`p-5 px-7 ${p.ultimo ? "" : "border-r border-[var(--color-neutral-300)]"}`}>
      <p className="m-0 text-[10px] font-semibold tracking-[0.07em] uppercase text-[var(--color-neutral-600)]">{p.titulo}</p>
      <p className="mt-2.5 font-heading font-extrabold text-[32px] leading-[1.1] tracking-[-0.01em]" style={{ color: p.cor }}>{p.valor}</p>
      <p className="mt-2 text-[12px] text-[var(--color-neutral-700)]">{p.detalhe}</p>
    </div>
  );
}

/** Barra: preenchimento azul = realizado; marca laranja = planejado. */
function BarraWp({ planejado, realizado, codigo }: { planejado: number; realizado: number; codigo: string }) {
  return (
    <div className="flex items-center justify-end gap-3">
      <div className="relative w-[150px] h-[8px] rounded-full bg-[var(--color-neutral-200)]" role="img"
        aria-label={`${codigo}: ${realizado}% realizado de ${planejado}% planejado`}>
        <div className="h-full rounded-full bg-[var(--color-blue)]" style={{ width: `${Math.min(100, realizado)}%` }} />
        <div className="absolute -top-[3px] h-[14px] w-[3px] rounded bg-[var(--color-orange)]" style={{ left: `calc(${Math.min(100, planejado)}% - 1.5px)` }}
          title={`Planejado: ${planejado}%`} />
      </div>
      <span className={`w-[42px] text-right font-heading font-extrabold text-[14px] tabular-nums ${realizado < planejado ? "text-[var(--color-red)]" : ""}`}>
        {realizado}%
      </span>
    </div>
  );
}

function Legenda() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-[var(--color-neutral-600)]">
      <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-full bg-[var(--color-blue)]" /> realizado</span>
      <span className="flex items-center gap-1"><span className="inline-block h-3 w-[3px] rounded bg-[var(--color-orange)]" /> planejado</span>
    </div>
  );
}

function FormularioWp(p: { wp: Partial<WorkPackage>; aoFechar: () => void; aoSalvar: () => void }) {
  const [v, setV] = useState({
    codigo: p.wp.codigo ?? "", nome: p.wp.nome ?? "", inicio: p.wp.inicio ?? "", fim: p.wp.fim ?? "",
    progresso_planejado: String(p.wp.progresso_planejado ?? ""), progresso_realizado: String(p.wp.progresso_realizado ?? ""),
  });
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  async function salvar() {
    try {
      await salvarWorkPackage({
        projeto_id: p.wp.projeto_id!, codigo: v.codigo, nome: v.nome, inicio: v.inicio || null, fim: v.fim || null,
        progresso_planejado: v.progresso_planejado === "" ? null : Number(v.progresso_planejado),
        progresso_realizado: v.progresso_realizado === "" ? null : Number(v.progresso_realizado),
      });
      p.aoSalvar();
    } catch (e) { setErro(mensagemErro(e)); }
  }
  return (
    <div className="cartao mb-5 p-5 grid grid-cols-2 lg:grid-cols-6 gap-4 items-end">
      <label className="field"><span className="rotulo">Código</span><input className="input" value={v.codigo} onChange={set("codigo")} /></label>
      <label className="field col-span-2"><span className="rotulo">Descrição</span><input className="input" value={v.nome} onChange={set("nome")} /></label>
      <label className="field"><span className="rotulo">Prazo</span><input className="input" type="date" value={v.fim} onChange={set("fim")} /></label>
      <label className="field"><span className="rotulo">Planejado (%)</span><input className="input" inputMode="numeric" value={v.progresso_planejado} onChange={set("progresso_planejado")} /></label>
      <label className="field"><span className="rotulo">Realizado (%)</span><input className="input" inputMode="numeric" value={v.progresso_realizado} onChange={set("progresso_realizado")} /></label>
      {erro && <div className="col-span-full"><Aviso tipo="erro">{erro}</Aviso></div>}
      <div className="col-span-full flex gap-2">
        <button className="btn btn-primary" onClick={salvar} disabled={!v.codigo || !v.nome}>Salvar</button>
        <button className="btn btn-secondary" onClick={p.aoFechar}>Cancelar</button>
      </div>
    </div>
  );
}
