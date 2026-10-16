import { useState } from "react";
import { LineChart as IconeCurva, Trash2, Upload } from "lucide-react";
import type { ConfigAnalise } from "../../config/analises";
import { useConsulta } from "../../hooks/useConsulta";
import { apagarCurva, criarCurva, lerPontos, listarCurvas, pontosDaCurva } from "../../servicos/analises";
import type { Curva } from "../../tipos/banco";
import { LineChartCard } from "../charts/LineChartCard";
import { Aviso, Campo } from "../ui/base";
import { mensagemErro } from "../../utils/formatacao";

// Curvas de um registro (ΔP × PV, perda de massa × tempo, difratograma…).
// Importar: colar duas colunas do Excel/Origin ou escolher um .csv/.txt.
export function Curvas(p: { cfg: ConfigAnalise; amostraId: string; analiseId: number; podeEditar: boolean }) {
  const curvas = useConsulta(() => listarCurvas(p.cfg.tabela, p.analiseId), [p.cfg.tabela, p.analiseId]);
  const [aberta, setAberta] = useState<number | null>(null);
  const [importando, setImportando] = useState(false);
  const atual = curvas.dados?.find((c) => c.id === (aberta ?? curvas.dados?.[0]?.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {curvas.dados?.map((c) => (
          <button key={c.id} onClick={() => setAberta(c.id)}
            className={`btn ${atual?.id === c.id ? "btn-blue" : "btn-secondary"}`}>
            <IconeCurva size={14} /> {c.nome}
          </button>
        ))}
        {curvas.dados?.length === 0 && !importando && (
          <span className="text-[13px] text-[var(--color-neutral-600)]">Nenhuma curva importada.</span>
        )}
        {p.podeEditar && !importando && (
          <button className="btn btn-secondary" onClick={() => setImportando(true)}><Upload size={14} /> Importar curva</button>
        )}
      </div>
      {importando && (
        <ImportarCurva cfg={p.cfg} amostraId={p.amostraId} analiseId={p.analiseId}
          aoConcluir={(id) => { setImportando(false); curvas.recarregar(); if (id) setAberta(id); }} />
      )}
      {atual && !importando && (
        <VerCurva curva={atual} podeEditar={p.podeEditar} aoApagar={() => { setAberta(null); curvas.recarregar(); }} />
      )}
    </div>
  );
}

function rotuloEixo(g: string, u: string | null) {
  return u ? `${g} (${u})` : g;
}

function VerCurva({ curva, podeEditar, aoApagar }: { curva: Curva; podeEditar: boolean; aoApagar: () => void }) {
  const pontos = useConsulta(() => pontosDaCurva(curva.id), [curva.id]);
  if (pontos.carregando) return <p className="text-[13px] text-[var(--color-neutral-600)]">Carregando pontos…</p>;
  if (pontos.erro) return <Aviso tipo="erro">{pontos.erro}</Aviso>;
  return (
    <div className="flex flex-col gap-2">
      <LineChartCard title={curva.nome} subtitle={`${pontos.dados?.length ?? 0} pontos`}
        data={pontos.dados ?? []} xKey="x"
        xLabel={rotuloEixo(curva.x_grandeza, curva.x_unidade)} yLabel={rotuloEixo(curva.y_grandeza, curva.y_unidade)}
        series={[{ dataKey: "y", label: rotuloEixo(curva.y_grandeza, curva.y_unidade), color: "var(--grafico-linha)" }]} />
      {podeEditar && (
        <button className="btn btn-danger w-fit" onClick={async () => {
          if (confirm(`Apagar a curva "${curva.nome}"?`)) { await apagarCurva(curva.id); aoApagar(); }
        }}><Trash2 size={14} /> Apagar curva</button>
      )}
    </div>
  );
}

function ImportarCurva(p: { cfg: ConfigAnalise; amostraId: string; analiseId: number; aoConcluir: (id?: number) => void }) {
  const modelo = p.cfg.curvas?.[0];
  const [meta, setMeta] = useState({
    nome: modelo?.nome ?? "", x_grandeza: modelo?.x_grandeza ?? "", x_unidade: modelo?.x_unidade ?? "",
    y_grandeza: modelo?.y_grandeza ?? "", y_unidade: modelo?.y_unidade ?? "",
  });
  const [texto, setTexto] = useState("");
  const [colX, setColX] = useState(1);
  const [colY, setColY] = useState(2);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const pontos = lerPontos(texto, colX - 1, colY - 1);

  async function salvar() {
    if (!meta.nome || !meta.x_grandeza || !meta.y_grandeza) { setErro("Preencha o nome e as grandezas dos eixos."); return; }
    if (pontos.length < 2) { setErro("Não encontrei pelo menos 2 pontos numéricos."); return; }
    setSalvando(true);
    try {
      const c = await criarCurva({ ...meta, amostra_id: p.amostraId, analise_tabela: p.cfg.tabela, analise_id: p.analiseId }, pontos);
      p.aoConcluir(c.id);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-orange-200)] bg-[var(--color-orange-50)] p-5 flex flex-col gap-4">
      {p.cfg.curvas && p.cfg.curvas.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="font-semibold text-[var(--color-orange-800)]">Modelo:</span>
          {p.cfg.curvas.map((m) => (
            <button key={m.nome} type="button" className="tag tag-orange cursor-pointer" onClick={() => setMeta({ ...m })}>{m.nome}</button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(["nome", "x_grandeza", "x_unidade", "y_grandeza", "y_unidade"] as const).map((k) => (
          <Campo key={k} rotulo={{ nome: "Nome da curva", x_grandeza: "Eixo X", x_unidade: "Unidade X", y_grandeza: "Eixo Y", y_unidade: "Unidade Y" }[k]}>
            <input className="input !py-2" value={meta[k]} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} />
          </Campo>
        ))}
      </div>
      <Campo rotulo="Dados" ajuda="Cole direto do Excel/Origin (duas colunas) ou escolha um arquivo. Cabeçalho é ignorado; vírgula decimal é aceita.">
        <textarea className="input font-mono !text-[12px]" rows={6} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder={"PV\tΔP\n0,00\t120,5\n0,05\t118,2\n..."} />
      </Campo>
      <div className="flex flex-wrap items-end gap-4">
        <label className="btn btn-secondary cursor-pointer">
          <Upload size={14} /> Escolher .csv / .txt
          <input type="file" accept=".csv,.txt,.dat" className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) setTexto(await f.text()); }} />
        </label>
        <Campo rotulo="Coluna X" className="w-24"><input className="input !py-2" type="number" min={1} value={colX} onChange={(e) => setColX(Number(e.target.value))} /></Campo>
        <Campo rotulo="Coluna Y" className="w-24"><input className="input !py-2" type="number" min={1} value={colY} onChange={(e) => setColY(Number(e.target.value))} /></Campo>
        <span className="pb-2 text-[13px] font-semibold text-[var(--color-blue-700)]">{pontos.length} pontos lidos</span>
      </div>
      {pontos.length > 1 && (
        <div className="cartao p-4">
          <p className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--color-neutral-600)]">Prévia</p>
          <LineChartCard semCartao title="" data={pontos} xKey="x" height={220} enableZoom={false}
            xLabel={meta.x_grandeza} yLabel={meta.y_grandeza}
            series={[{ dataKey: "y", label: meta.y_grandeza || "y", color: "var(--grafico-linha)" }]} />
        </div>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : `Salvar ${pontos.length} pontos`}</button>
        <button className="btn btn-secondary" onClick={() => p.aoConcluir()}>Cancelar</button>
      </div>
    </div>
  );
}
