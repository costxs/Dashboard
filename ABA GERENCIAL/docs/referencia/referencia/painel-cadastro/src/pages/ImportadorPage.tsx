import { useMemo, useState, type DragEvent } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, RotateCcw, Upload, Wand2, XCircle } from "lucide-react";
import { Aviso, CabecalhoPagina, Cartao } from "../components/ui/base";
import { lerArquivo } from "../importador/lerArquivo";
import { ABAS_OBRIGATORIAS, analisarBdd, gravarBdd, type Analise, type Severidade } from "../importador/planilhaBdd";
import { supabase } from "../lib/supabase";
import { fmt, mensagemErro } from "../utils/formatacao";

// Importador da planilha BDD_LCPETRO_Reatividade (literatura geral).
// 1) escolhe o arquivo  2) o app LÊ e ANALISA tudo e mostra a prévia
// 3) só grava quando a pessoa confirma.
const DESTINOS: { chave: keyof Analise["contagens"]; rotulo: string; aba: string }[] = [
  { chave: "publicacoes", rotulo: "Referências", aba: "referencias" },
  { chave: "litologias", rotulo: "Litologias", aba: "listas / rochas" },
  { chave: "lit_rochas", rotulo: "Rochas", aba: "rochas" },
  { chave: "fluidos_prop", rotulo: "Fluidos", aba: "fluidos_prop" },
  { chave: "sistemas_acidos", rotulo: "Sistemas ácidos", aba: "sistemas_acidos" },
  { chave: "lit_dados_rda", rotulo: "Medidas de taxa (RDA)", aba: "ensaios" },
];
const ICONE: Record<Severidade, typeof XCircle> = { ERRO: XCircle, AVISO: AlertTriangle, CORRIGIDO: Wand2 };
const CLASSE: Record<Severidade, string> = { ERRO: "tag tag-accent", AVISO: "tag tag-orange", CORRIGIDO: "tag tag-blue" };

type Etapa = "escolher" | "analisando" | "previa" | "gravando" | "concluido";

export function ImportadorPage() {
  const [etapa, setEtapa] = useState<Etapa>("escolher");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Severidade | "TODOS">("ERRO");
  const [pularErros, setPularErros] = useState(false);
  const [progresso, setProgresso] = useState<Record<string, [number, number]>>({});
  const [resultado, setResultado] = useState<{ gravadas: Record<string, number>; deixadasDeFora: number } | null>(null);
  const [arrastando, setArrastando] = useState(false);

  async function carregar(arquivo?: File | null) {
    if (!arquivo) return;
    setErro(null); setResultado(null); setProgresso({}); setPularErros(false);
    setNomeArquivo(arquivo.name);
    setEtapa("analisando");
    try {
      const planilha = await lerArquivo(arquivo);
      const a = analisarBdd(planilha);
      setAnalise(a);
      setFiltro(a.erros ? "ERRO" : a.avisos ? "AVISO" : "TODOS");
      setEtapa("previa");
    } catch (e) {
      setErro(`Não consegui ler o arquivo: ${mensagemErro(e)}`);
      setEtapa("escolher");
    }
  }

  async function gravar() {
    if (!analise) return;
    setErro(null);
    setEtapa("gravando");
    try {
      const r = await gravarBdd(supabase, analise, {
        pularErros,
        aoProgresso: (tabela, feitas, total) => setProgresso((p) => ({ ...p, [tabela]: [feitas, total] })),
      });
      setResultado(r);
      setEtapa("concluido");
    } catch (e) {
      setErro(mensagemErro(e));
      setEtapa("previa");
    }
  }

  function recomecar() {
    setEtapa("escolher"); setAnalise(null); setResultado(null); setErro(null); setNomeArquivo("");
  }

  const problemas = useMemo(
    () => (analise?.problemas ?? []).filter((p) => filtro === "TODOS" || p.severidade === filtro),
    [analise, filtro]);
  const linhasComErro = useMemo(
    () => new Set((analise?.problemas ?? []).filter((p) => p.severidade === "ERRO" && p.aba === "ensaios").map((p) => p.linha)),
    [analise]);

  return (
    <div>
      <CabecalhoPagina titulo="Importar planilha de reatividade"
        subtitulo="Planilha BDD_LCPETRO_Reatividade (.xlsx). O app lê todas as abas, confere os dados e mostra uma prévia — nada é gravado até você confirmar." />

      <div className="px-7 pb-10 flex flex-col gap-6">
        {/* 1. arquivo */}
        <Cartao titulo="1. Arquivo" icone={<FileSpreadsheet size={18} />}
          acoes={etapa !== "escolher" && <button className="btn btn-secondary" onClick={recomecar}><RotateCcw size={14} /> Trocar arquivo</button>}>
          <div className="p-6">
            {etapa === "escolher" ? (
              <label
                onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e: DragEvent) => { e.preventDefault(); setArrastando(false); carregar(e.dataTransfer.files?.[0]); }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[14px] border-2 border-dashed px-6 py-12 text-center transition-colors ${arrastando
                  ? "border-[var(--color-orange)] bg-[var(--color-orange-50)]" : "border-[var(--color-blue-200)] bg-[var(--color-blue-50)] hover:border-[var(--color-blue)]"}`}>
                <Upload size={28} className="text-[var(--color-blue)]" />
                <p className="m-0 font-semibold text-[var(--color-blue-800)]">Arraste a planilha aqui ou clique para escolher</p>
                <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">Abas esperadas: {ABAS_OBRIGATORIAS.join(", ")} (+ referencias, fluidos_prop, listas)</p>
                <span className="btn btn-primary mt-2">Escolher arquivo</span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => carregar(e.target.files?.[0])} />
              </label>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <FileSpreadsheet size={20} className="text-[var(--color-blue)]" />
                <strong>{nomeArquivo}</strong>
                {etapa === "analisando" && <span className="flex items-center gap-2 text-[13px] text-[var(--color-neutral-600)]"><Loader2 size={14} className="animate-spin text-[var(--color-orange)]" /> lendo e conferindo…</span>}
                {analise && (
                  <div className="flex flex-wrap gap-1.5">
                    {analise.abasEncontradas.map((a) => <span key={a} className="tag tag-neutral">{a}</span>)}
                  </div>
                )}
              </div>
            )}
          </div>
        </Cartao>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        {analise && etapa !== "escolher" && (
          <>
            {/* 2. prévia */}
            <Cartao titulo="2. O que vai para o banco" subtitulo="Linhas lidas em cada aba e a tabela de destino">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border-b border-[var(--color-neutral-300)]">
                {DESTINOS.map((d, i) => (
                  <div key={d.chave} className={`p-5 ${i < DESTINOS.length - 1 ? "border-r border-[var(--color-neutral-300)]" : ""}`}>
                    <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--color-neutral-600)]">{d.rotulo}</p>
                    <p className="mt-2 font-heading text-[28px] font-extrabold leading-none text-[var(--color-blue)]">{analise.contagens[d.chave]}</p>
                    <p className="mt-1.5 text-[11px] text-[var(--color-neutral-500)]">aba {d.aba}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 px-6 py-4">
                <Contador sev="ERRO" n={analise.erros} ativo={filtro === "ERRO"} aoClicar={() => setFiltro("ERRO")} texto="bloqueiam" />
                <Contador sev="AVISO" n={analise.avisos} ativo={filtro === "AVISO"} aoClicar={() => setFiltro("AVISO")} texto="conferir" />
                <Contador sev="CORRIGIDO" n={analise.corrigidos} ativo={filtro === "CORRIGIDO"} aoClicar={() => setFiltro("CORRIGIDO")} texto="padronizados" />
                <button className={`btn ${filtro === "TODOS" ? "btn-blue" : "btn-secondary"}`} onClick={() => setFiltro("TODOS")}>Todos</button>
                <button className="btn btn-secondary ml-auto" onClick={() => baixarRelatorio(analise, nomeArquivo)}><Download size={14} /> Relatório (.csv)</button>
              </div>
              {problemas.length > 0 ? (
                <div className="max-h-[320px] overflow-auto border-t border-[var(--color-neutral-300)] px-6">
                  <table className="table text-[13px]">
                    <thead className="sticky top-0 bg-white"><tr><th>Tipo</th><th>Aba</th><th>Linha</th><th>ID</th><th>Campo</th><th>O que aconteceu</th></tr></thead>
                    <tbody>
                      {problemas.map((p, i) => (
                        <tr key={i} className="lcp-row">
                          <td className="!py-2"><span className={CLASSE[p.severidade]}>{p.severidade.toLowerCase()}</span></td>
                          <td className="!py-2">{p.aba}</td>
                          <td className="!py-2 tabular-nums">{p.linha ?? "—"}</td>
                          <td className="!py-2 font-semibold">{p.id ?? "—"}</td>
                          <td className="!py-2 font-mono text-[12px]">{p.campo}</td>
                          <td className="!py-2">{p.mensagem}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="m-0 px-6 pb-5 text-[13px] text-[var(--color-neutral-600)]">Nada nesta categoria.</p>
              )}
              {analise.colunasIgnoradas.length > 0 && (
                <p className="m-0 border-t border-[var(--color-neutral-300)] px-6 py-3 text-[12px] text-[var(--color-neutral-600)]">
                  Colunas calculadas ignoradas (o banco recalcula): {analise.colunasIgnoradas.join(", ")}
                </p>
              )}
            </Cartao>

            <Cartao titulo="Prévia das medidas" subtitulo="Primeiras 15 linhas da aba ensaios · em vermelho, linhas com erro (não serão gravadas)">
              <div className="overflow-x-auto px-6 py-2">
                <table className="table text-[12px]">
                  <thead><tr><th>Linha</th><th>Ensaio</th><th>Referência</th><th>Rocha</th><th>Sistema</th><th className="text-right">T (°C)</th><th className="text-right">rpm</th><th className="text-right">Taxa (mol/cm²·s)</th><th>Obtenção</th></tr></thead>
                  <tbody>
                    {analise.dados.lit_dados_rda.slice(0, 15).map((d) => (
                      <tr key={String(d.id_ensaio)} className={linhasComErro.has(d._linha) ? "bg-[var(--color-red-50)] text-[var(--color-red-800)]" : "lcp-row"}>
                        <td className="!py-2 tabular-nums">{d._linha}</td>
                        <td className="!py-2 font-semibold">{String(d.id_ensaio)}</td>
                        <td className="!py-2">{String(d.id_referencia ?? "—")}</td>
                        <td className="!py-2">{String(d.id_rocha ?? "—")}</td>
                        <td className="!py-2">{String(d.id_sistema ?? "—")}</td>
                        <td className="!py-2 text-right tabular-nums">{fmt(d.temperatura_c, 1)}</td>
                        <td className="!py-2 text-right tabular-nums">{fmt(d.rotacao_rpm, 0)}</td>
                        <td className="!py-2 text-right tabular-nums">{fmt(d.taxa_reacao_mol_cm2_s, 3, true)}</td>
                        <td className="!py-2">{String(d.obtencao_dado ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Cartao>

            {/* 3. gravar */}
            <Cartao titulo="3. Gravar no banco" subtitulo="Linhas com o mesmo ID são atualizadas, não duplicadas. Nada é apagado.">
              <div className="p-6 flex flex-col gap-4">
                {analise.erros > 0 && etapa !== "concluido" && (
                  <label className="flex items-start gap-2 text-[13px]">
                    <input type="checkbox" className="mt-0.5" checked={pularErros} onChange={(e) => setPularErros(e.target.checked)} />
                    <span>Gravar o que está certo e <strong>deixar de fora as {analise.erros} linha(s) com erro</strong> (corrija-as na planilha e importe de novo depois).</span>
                  </label>
                )}
                {(etapa === "gravando" || etapa === "concluido") && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(progresso).map(([tabela, [feitas, total]]) => (
                      <div key={tabela} className="flex items-center gap-3 text-[13px]">
                        <span className="w-[130px] font-mono text-[12px]">{tabela}</span>
                        <div className="h-[8px] flex-1 rounded-full bg-[var(--color-neutral-200)]">
                          <div className="h-full rounded-full bg-[var(--color-blue)]" style={{ width: `${total ? (100 * feitas) / total : 100}%` }} />
                        </div>
                        <span className="w-[70px] text-right tabular-nums">{feitas}/{total}</span>
                      </div>
                    ))}
                  </div>
                )}
                {resultado ? (
                  <Aviso tipo="ok">
                    <span className="flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> Importação concluída.</span>
                    {Object.entries(resultado.gravadas).map(([t, n]) => `${t}: ${n}`).join(" · ")}
                    {resultado.deixadasDeFora > 0 && ` · ${resultado.deixadasDeFora} medida(s) ficaram de fora por erro.`}
                    {" "}Os dados já aparecem no dashboard em Literatura › Geral.
                  </Aviso>
                ) : (
                  <div>
                    <button className="btn btn-primary" onClick={gravar}
                      disabled={etapa === "gravando" || (analise.erros > 0 && !pularErros) || analise.abasFaltando.length > 0}>
                      {etapa === "gravando" ? <><Loader2 size={14} className="animate-spin" /> Gravando…</> : "Gravar no banco"}
                    </button>
                    {analise.erros > 0 && !pularErros && (
                      <span className="ml-3 text-[12px] text-[var(--color-red-700)]">Há erros: corrija a planilha ou marque a opção acima.</span>
                    )}
                  </div>
                )}
              </div>
            </Cartao>
          </>
        )}
      </div>
    </div>
  );
}

function Contador(p: { sev: Severidade; n: number; ativo: boolean; aoClicar: () => void; texto: string }) {
  const Icone = ICONE[p.sev];
  const cor = { ERRO: "var(--color-red)", AVISO: "var(--color-orange-700)", CORRIGIDO: "var(--color-blue)" }[p.sev];
  return (
    <button onClick={p.aoClicar}
      className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${p.ativo ? "border-current bg-white shadow-sm" : "border-[var(--color-neutral-300)] bg-white hover:border-[var(--color-neutral-400)]"}`}
      style={{ color: cor }}>
      <Icone size={15} />
      <strong className="font-heading text-[16px]">{p.n}</strong>
      <span className="text-[var(--color-neutral-700)]">{p.sev === "ERRO" ? "erros" : p.sev === "AVISO" ? "avisos" : "corrigidos"} · {p.texto}</span>
    </button>
  );
}

function baixarRelatorio(a: Analise, nome: string) {
  const esc = (v: unknown) => (v == null ? "" : `"${String(v).replace(/"/g, '""')}"`);
  const csv = ["severidade;aba;linha;id;campo;mensagem",
    ...a.problemas.map((p) => [p.severidade, p.aba, p.linha, p.id, p.campo, p.mensagem].map(esc).join(";"))].join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const el = document.createElement("a");
  el.href = url; el.download = `relatorio_${nome.replace(/\.[^.]+$/, "")}.csv`; el.click();
  URL.revokeObjectURL(url);
}
