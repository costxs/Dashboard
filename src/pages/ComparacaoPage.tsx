import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, LineChart, Search } from "lucide-react";
import { Aviso, CabecalhoPagina, Carregando, Cartao } from "../components/ui/base";
import { useConsulta } from "../hooks/useConsulta";
import { baixarArquivo, pedirComparacaoPvbt, type VisaoComparacao } from "../servicos/graficos";
import { listarPvbt } from "../servicos/pvbt";
import { useContexto } from "../store/useContexto";
import type { PontoPvbt } from "../tipos/banco";
import { fmtExato, mensagemErro } from "../utils/formatacao";

// Comparação de resultados: o usuário escolhe amostras que passaram por coreflooding e já têm PVbt,
// e o gráfico mostra só as escolhidas. O PVbt é o primeiro tipo de comparação; outros entram ao lado.
type Visao = VisaoComparacao;

interface AmostraPvbt { uuid: string; codigo: string; litologia: string | null; ensaios: PontoPvbt[] }

export function ComparacaoPage() {
  const projetoId = useContexto((s) => s.projetoId);
  const [busca, setBusca] = useState("");
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [visao, setVisao] = useState<Visao>("barras");

  const base = useConsulta(() => listarPvbt({ fontes: ["LCPETRO"] }), []);

  // amostras do laboratório com coreflooding e PVbt, dentro da empresa/projeto aberto
  const amostras = useMemo<AmostraPvbt[]>(() => {
    const porAmostra = new Map<string, AmostraPvbt>();
    for (const e of base.dados ?? []) {
      if (e.pvbt == null || !e.amostra_uuid) continue;
      if (projetoId && e.projeto_id !== projetoId) continue;
      const a = porAmostra.get(e.amostra_uuid) ?? { uuid: e.amostra_uuid, codigo: e.id_amostra ?? e.amostra_uuid, litologia: e.litologia, ensaios: [] };
      a.ensaios.push(e);
      porAmostra.set(e.amostra_uuid, a);
    }
    return [...porAmostra.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
  }, [base.dados, projetoId]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? amostras.filter((a) => `${a.codigo} ${a.litologia ?? ""}`.toLowerCase().includes(t)) : amostras;
  }, [amostras, busca]);

  const selecionadas = amostras.filter((a) => escolhidas.has(a.uuid));
  // o gráfico é desenhado pelo backend: pede de novo quando a seleção ou a visão mudam
  const chave = selecionadas.map((a) => a.uuid).join(",");
  const [imagem, setImagem] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erroGrafico, setErroGrafico] = useState<string | null>(null);
  useEffect(() => {
    setErroGrafico(null);
    if (!chave) { setImagem(null); return; }
    const ctl = new AbortController();
    let url: string | null = null;
    setGerando(true);
    const t = setTimeout(() => {
      pedirComparacaoPvbt(chave.split(","), visao, "png", 150, ctl.signal)
        .then((b) => { url = URL.createObjectURL(b); setImagem(url); })
        .catch((e) => { if (!ctl.signal.aborted) { setImagem(null); setErroGrafico(mensagemErro(e)); } })
        .finally(() => { if (!ctl.signal.aborted) setGerando(false); });
    }, 300);
    return () => { clearTimeout(t); ctl.abort(); if (url) URL.revokeObjectURL(url); };
  }, [chave, visao]);

  async function baixar(formato: "png" | "svg" | "pdf") {
    try { baixarArquivo(await pedirComparacaoPvbt(chave.split(","), visao, formato, 300), `comparacao_pvbt_${visao}.${formato}`); }
    catch (e) { setErroGrafico(mensagemErro(e)); }
  }

  const alternar = (uuid: string) => setEscolhidas((s) => { const n = new Set(s); if (n.has(uuid)) n.delete(uuid); else n.add(uuid); return n; });

  return (
    <div>
      <CabecalhoPagina titulo="Comparação de resultados"
        subtitulo="Escolha as amostras com coreflooding e PVbt para compará-las no gráfico" />

      <div className="px-7 pb-10 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
        <Cartao titulo="Amostras" subtitulo={`${amostras.length} com PVbt · ${selecionadas.length} selecionada(s)`}>
          <div className="p-4 flex flex-col gap-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-neutral-400)]" />
              <input className="input !pl-9" placeholder="Código ou litotipo" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="flex gap-2 text-[12px]">
              <button type="button" className="btn btn-secondary !py-1" onClick={() => setEscolhidas(new Set([...escolhidas, ...filtradas.map((a) => a.uuid)]))}>Marcar as listadas</button>
              <button type="button" className="btn btn-secondary !py-1" onClick={() => setEscolhidas(new Set())} disabled={!escolhidas.size}>Limpar</button>
            </div>
            {base.carregando && !base.dados ? <Carregando />
              : base.erro ? <Aviso tipo="erro">{base.erro}</Aviso>
              : !filtradas.length ? (
                <p className="m-0 py-6 text-center text-[13px] text-[var(--color-neutral-600)]">
                  {amostras.length ? "Nenhuma amostra com esse filtro." : "Ainda não há amostra com coreflooding e PVbt neste projeto."}
                </p>
              ) : (
                <ul className="m-0 p-0 list-none max-h-[520px] overflow-y-auto flex flex-col">
                  {filtradas.map((a) => (
                    <li key={a.uuid}>
                      <label className="flex items-start gap-3 px-2 py-2 rounded-md cursor-pointer hover:bg-[var(--color-blue-50)]">
                        <input type="checkbox" className="mt-1" checked={escolhidas.has(a.uuid)} onChange={() => alternar(a.uuid)} />
                        <span className="flex-1 min-w-0">
                          <span className="font-heading font-bold text-[14px] text-[var(--color-red)]">{a.codigo}</span>
                          <span className="block text-[12px] text-[var(--color-neutral-600)] truncate">{a.litologia ?? "—"}</span>
                        </span>
                        <span className="text-right text-[12px] tabular-nums text-[var(--color-blue-800)]">
                          {a.ensaios.length === 1 ? fmtExato(a.ensaios[0].pvbt) : `${a.ensaios.length} ensaios`}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </Cartao>

        <Cartao titulo="PVbt" subtitulo="Volume de poros injetados até o breakthrough"
          acoes={
            <div className="flex gap-1">
              {([["barras", "Por amostra", BarChart3], ["velocidade", "× velocidade", LineChart]] as const).map(([v, rotulo, Icone]) => (
                <button key={v} type="button" onClick={() => setVisao(v)}
                  className={`btn !py-1 ${visao === v ? "btn-primary" : "btn-secondary"}`}><Icone size={14} /> {rotulo}</button>
              ))}
            </div>
          }>
          <div className="p-6">
            {!selecionadas.length ? (
              <p className="m-0 py-16 text-center text-[13px] text-[var(--color-neutral-600)]">Marque uma ou mais amostras na lista para plotar o gráfico.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {erroGrafico && <Aviso tipo="erro">{erroGrafico}</Aviso>}
                {gerando && !imagem && <Carregando texto="Gerando o gráfico no servidor…" />}
                {imagem && (
                  <img src={imagem} alt="Comparação de PVbt entre as amostras escolhidas"
                    className={`max-w-full h-auto mx-auto transition-opacity ${gerando ? "opacity-50" : ""}`} />
                )}
                {imagem && (
                  <div className="flex justify-center gap-2">
                    {(["png", "svg", "pdf"] as const).map((f) => (
                      <button key={f} type="button" className="btn btn-secondary !py-1" onClick={() => baixar(f)}><Download size={14} /> {f.toUpperCase()}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Cartao>
      </div>
    </div>
  );
}
