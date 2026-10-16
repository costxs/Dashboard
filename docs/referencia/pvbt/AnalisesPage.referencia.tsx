import { useMemo, useState } from "react";
import { Simbolos } from "../components/ui/Simbolos";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { GraficoDispersao } from "../components/charts/GraficoDispersao";
import { GraficoRda } from "../components/charts/GraficoRda";
import { Aviso, CabecalhoPagina, Carregando, Cartao } from "../components/ui/base";
import { fmt, fmtData } from "../utils/formatacao";
import { ANALISES, rotuloColuna } from "../config/analises";
import { useConsulta } from "../hooks/useConsulta";
import { listarRegistrosTodos, type RegistroComAmostra } from "../servicos/analises";
import { listarProjetos } from "../servicos/contexto";
import { pontosComparacao } from "../servicos/literatura";
import { listarPvbt } from "../servicos/pvbt";
import { PainelPvbt } from "../components/pvbt/PainelPvbt";
import { useContexto } from "../store/useContexto";

// Análises / Resultados: um tipo de análise em todas as amostras do projeto
// (ou da empresa), com o gráfico que faz sentido para cada uma.
export function AnalisesPage() {
  const navigate = useNavigate();
  const empresaId = useContexto((s) => s.empresaId);
  const projetoId = useContexto((s) => s.projetoId);
  const [chave, setChave] = useState("coreflooding");
  const [comLiteratura, setComLiteratura] = useState(true);
  const cfg = ANALISES.find((a) => a.chave === chave)!;

  const projetos = useConsulta(() => (projetoId ? Promise.resolve(null) : listarProjetos(empresaId ?? undefined)), [projetoId, empresaId]);
  const ids = projetoId ? [projetoId] : projetos.dados?.map((p) => p.id);
  const chaveIds = ids?.join(",") ?? "";
  const dados = useConsulta(
    () => (ids ? listarRegistrosTodos(cfg, ids) : Promise.resolve([] as RegistroComAmostra[])),
    [cfg, chaveIds]);
  const rda = useConsulta(() => (chave === "rda" ? pontosComparacao() : Promise.resolve([])), [chave]);
  const pvbt = useConsulta(() => (chave === "coreflooding" ? listarPvbt() : Promise.resolve([])), [chave]);
  // ensaios do laboratório: só os do contexto aberto (projeto ou empresa); literatura e Petrobras: o que a RLS liberar
  const pontosPvbt = useMemo(() => {
    if (!pvbt.dados) return null;
    const permitidos = chaveIds ? chaveIds.split(",") : null;
    return pvbt.dados.filter((p) => p.fonte !== "LCPETRO" || !permitidos || (p.projeto_id != null && permitidos.includes(p.projeto_id)));
  }, [pvbt.dados, chaveIds]);

  const pontosRda = useMemo(() => {
    const permitidos = chaveIds ? chaveIds.split(",") : null;
    return (rda.dados ?? []).filter((p) =>
      p.fonte === "literatura" ? comLiteratura : !permitidos || (p.projeto_id != null && permitidos.includes(p.projeto_id)));
  }, [rda.dados, comLiteratura, chaveIds]);

  const linhas = dados.dados ?? [];
  const n = (r: RegistroComAmostra, k: string) => (r[k] == null ? NaN : Number(r[k]));

  return (
    <div>
      <CabecalhoPagina titulo="Análises / Resultados"
        subtitulo="Compare um tipo de ensaio entre todas as amostras. Clique numa linha para abrir a amostra." />

      <div className="flex flex-wrap gap-2 bg-white border-y border-[var(--color-neutral-300)] px-7 py-4">
        {ANALISES.map((a) => (
          <button key={a.chave} onClick={() => setChave(a.chave)}
            className={`btn ${chave === a.chave ? "btn-blue" : "btn-secondary"}`}>
            {a.numero}. {a.titulo}
          </button>
        ))}
      </div>

      <div className="px-7 pt-6 pb-10 flex flex-col gap-6">
        {dados.carregando && !dados.dados && <Carregando />}
        {dados.erro && <Aviso tipo="erro">{dados.erro}</Aviso>}

        {chave === "petrofisica" && linhas.length > 0 && (
          <Cartao titulo="Porosidade × permeabilidade" subtitulo="Petrofísica antes da acidificação · permeabilidade em escala log">
            <div className="p-6">
              <GraficoDispersao xLabel="Porosidade (%)" yLabel="k líquido (mD)" logY
                pontos={linhas.filter((r) => r.momento !== "depois").map((r) => ({
                  x: n(r, "porosidade_pct"), y: n(r, "permeabilidade_liquido_md"),
                  rotulo: r.amostras.codigo, detalhe: r.amostras.litologia,
                }))} />
            </div>
          </Cartao>
        )}

        {chave === "coreflooding" && <PainelPvbt pontos={pontosPvbt} carregando={pvbt.carregando} erro={pvbt.erro} />}

        {chave === "rda" && (
          <Cartao titulo="Taxa de reação — LC PETRO × literatura"
            acoes={<label className="flex items-center gap-2 text-[13px] text-[var(--color-neutral-700)]">
              <input type="checkbox" checked={comLiteratura} onChange={(e) => setComLiteratura(e.target.checked)} /> mostrar literatura
            </label>}>
            <div className="p-6">{rda.carregando ? <Carregando /> : <GraficoRda pontos={pontosRda} />}</div>
          </Cartao>
        )}

        {dados.dados && linhas.length === 0 && (
          <p className="text-[13px] text-[var(--color-neutral-600)]">Nenhum registro de {cfg.titulo.toLowerCase()} neste contexto.</p>
        )}

        {linhas.length > 0 && (
          <Cartao titulo={`${cfg.numero}. ${cfg.titulo}`} subtitulo={`${linhas.length} registro(s)`}
            acoes={<button className="btn btn-secondary" onClick={() => baixarCsv(cfg.tabela, linhas)}><Download size={14} /> CSV</button>}>
            <div className="px-6 py-2 overflow-x-auto">
              <table className="table text-[13px]">
                <thead>
                  <tr>
                    <th>Amostra</th><th>Litotipo</th>
                    {cfg.colunasResumo.map((c) => <th key={c}><Simbolos>{rotuloColuna(cfg, c)}</Simbolos></th>)}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((r) => (
                    <tr key={r.id} className="lcp-row cursor-pointer" onClick={() => navigate(`/amostras/${r.amostra_id}?tab=${cfg.chave}`)}>
                      <td className="font-heading font-extrabold text-[var(--color-red)]">{r.amostras.codigo}</td>
                      <td>{r.amostras.litologia}</td>
                      {cfg.colunasResumo.map((c) => (
                        <td key={c} className="tabular-nums">{c === "data_ensaio" ? fmtData(r[c]) : fmt(r[c], 3, c.startsWith("taxa_"))}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>
        )}
      </div>
    </div>
  );
}

function baixarCsv(nome: string, linhas: RegistroComAmostra[]) {
  const cols = Object.keys(linhas[0]).filter((c) => c !== "amostras");
  const esc = (v: unknown) => (v == null ? "" : `"${String(v).replace(/"/g, '""')}"`);
  const csv = [["amostra", "litotipo", ...cols].join(";"),
    ...linhas.map((l) => [esc(l.amostras.codigo), esc(l.amostras.litologia), ...cols.map((c) => esc(l[c]))].join(";"))].join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${nome}.csv`; a.click();
  URL.revokeObjectURL(url);
}
