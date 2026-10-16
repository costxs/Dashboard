import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, Loader2 } from "lucide-react";
import { useConsulta } from "../../hooks/useConsulta";
import { pontosDaCurva } from "../../servicos/analises";
import {
  algumaVisivel, baixarArquivo, configDoBanco, montarPedido, pedirGrafico, type DadosEnsaio, type Formato, type Modo,
} from "../../servicos/graficos";
import type { Curva, PermeabilidadeEtapa, RegistroAnalise } from "../../tipos/banco";
import { mensagemErro } from "../../utils/formatacao";
import { Aviso } from "../ui/base";

const DPI_PREVIA = 110;
const DPI_DOWNLOAD = 300;
const NOMES: Record<Modo, string> = { combinado: "grafico", darcy: "dp_x_q" };

// Gráficos padrão Origin do tratamento de permeabilidade, gerados pelo serviço (VITE_URL_GRAFICOS)
// com a configuração gravada pelo gerencial. Só visualização: a edição fica no gerencial.
export function GraficosPermeabilidade(p: {
  r: RegistroAnalise; curva: Curva; etapas: PermeabilidadeEtapa[];
  amostra?: { codigo?: string | null; comprimento_cm?: number | null; diametro_cm?: number | null };
  /** o que mostrar se o serviço falhar (os gráficos do próprio dashboard) */
  reserva: ReactNode;
}) {
  const pontos = useConsulta(() => pontosDaCurva(p.curva.id), [p.curva.id]);
  const salva = useMemo(() => configDoBanco(p.r.config_graficos), [p.r.config_graficos]);
  const [sobrepor, setSobrepor] = useState(salva.sobrepor);
  useEffect(() => { setSobrepor(salva.sobrepor); }, [salva]);
  const config = useMemo(() => ({ ...salva, sobrepor }), [salva, sobrepor]);

  const dados = useMemo<DadosEnsaio | null>(() => pontos.dados ? {
    pontos: pontos.dados, etapas: p.etapas,
    comprimento_cm: p.amostra?.comprimento_cm ?? null, diametro_cm: p.amostra?.diametro_cm ?? null,
    viscosidade_cp: p.r.viscosidade_cp == null ? null : Number(p.r.viscosidade_cp),
  } : null, [pontos.dados, p.etapas, p.amostra?.comprimento_cm, p.amostra?.diametro_cm, p.r.viscosidade_cp]);
  const corpo = (modo: Modo, formato: Formato, dpi: number) => JSON.stringify(montarPedido(dados!, config, modo, formato, dpi));

  const [imagens, setImagens] = useState<Record<Modo, string | null>>({ combinado: null, darcy: null });
  const urls = useRef(imagens);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [erroBaixar, setErroBaixar] = useState<string | null>(null);
  const visivel = algumaVisivel(config, p.etapas);

  const corpoPrevia = useMemo(() => dados && visivel ? {
    combinado: JSON.stringify(montarPedido(dados, config, "combinado", "png", DPI_PREVIA)),
    darcy: JSON.stringify(montarPedido(dados, config, "darcy", "png", DPI_PREVIA)),
  } : null, [dados, config, visivel]);

  useEffect(() => {
    if (!corpoPrevia) return;
    const ctl = new AbortController();
    setGerando(true);
    void Promise.allSettled([pedirGrafico(corpoPrevia.combinado, ctl.signal), pedirGrafico(corpoPrevia.darcy, ctl.signal)])
      .then(([a, b]) => {
        if (ctl.signal.aborted) return;
        const url = (x: PromiseSettledResult<Blob>) => (x.status === "fulfilled" ? URL.createObjectURL(x.value) : null);
        const novas = { combinado: url(a), darcy: url(b) };
        // a imagem anterior só sai quando a nova chega (não pisca ao trocar sequência/sobrepostas)
        for (const u of Object.values(urls.current)) if (u) URL.revokeObjectURL(u);
        urls.current = novas;
        setImagens(novas);
        const falha = [a, b].find((x): x is PromiseRejectedResult => x.status === "rejected");
        setErro(falha ? mensagemErro(falha.reason) : null);
        setGerando(false);
      });
    return () => { ctl.abort(); setGerando(false); };
  }, [corpoPrevia]);

  useEffect(() => () => { for (const u of Object.values(urls.current)) if (u) URL.revokeObjectURL(u); }, []);

  async function baixar(modo: Modo, formato: Formato) {
    setErroBaixar(null);
    setBaixando(`${modo}-${formato}`);
    try {
      const blob = await pedirGrafico(corpo(modo, formato, formato === "png" ? DPI_DOWNLOAD : 72));
      baixarArquivo(blob, `${p.amostra?.codigo || `petrofisica_${p.r.id}`}_${NOMES[modo]}.${formato}`);
    } catch (e) {
      setErroBaixar(mensagemErro(e));
    } finally {
      setBaixando(null);
    }
  }

  if (pontos.erro) return <Aviso tipo="erro">{pontos.erro}</Aviso>;
  if (!pontos.dados) return <p className="text-[13px] text-[var(--color-neutral-600)]">Carregando pontos…</p>;
  if (!visivel) return <Aviso tipo="info">Nenhuma etapa marcada para aparecer nos gráficos (configuração do gerencial).</Aviso>;
  if (erro && !imagens.combinado && !imagens.darcy && !gerando) {
    return <div className="flex flex-col gap-4"><Aviso tipo="erro">{erro} Mostrando os gráficos do dashboard.</Aviso>{p.reserva}</div>;
  }

  const botoes = (modo: Modo) => (
    <div className="mt-2 flex flex-wrap gap-2">
      {(["png", "svg", "pdf"] as Formato[]).map((f) => (
        <button key={f} type="button" className="btn btn-secondary" disabled={baixando != null} onClick={() => baixar(modo, f)}>
          {baixando === `${modo}-${f}` ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {f === "png" ? "PNG (300 dpi)" : f.toUpperCase()}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
        {([[false, "Em sequência"], [true, "Sobrepostas"]] as const).map(([v, rotulo]) => (
          <label key={rotulo} className="flex cursor-pointer items-center gap-2">
            <input type="radio" name={`graficos-${p.r.id}`} checked={sobrepor === v} onChange={() => setSobrepor(v)} />
            {rotulo}
          </label>
        ))}
        {gerando && (
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--color-neutral-600)]">
            <Loader2 size={13} className="animate-spin text-[var(--color-orange)]" /> gerando…
          </span>
        )}
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {erroBaixar && <Aviso tipo="erro">{erroBaixar}</Aviso>}

      <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-6">
        <figure className="m-0 min-w-0">
          <Titulo>ΔP × tempo</Titulo>
          <Imagem url={imagens.combinado} alt="ΔP × tempo, todas as vazões" gerando={gerando} />
          {botoes("combinado")}
        </figure>
        <figure className="m-0 min-w-0">
          <Titulo>ΔP × Q</Titulo>
          <Imagem url={imagens.darcy} alt="ΔP médio × Q, com a reta pela origem e o k" gerando={gerando} />
          {botoes("darcy")}
        </figure>
      </div>
    </div>
  );
}

function Titulo(p: { children: string }) {
  return (
    <figcaption className="mb-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--color-blue-700)]">
      {p.children}
    </figcaption>
  );
}

function Imagem(p: { url: string | null; alt: string; gerando: boolean }) {
  return (
    <div className={`flex min-h-[160px] items-center justify-center rounded-lg border border-[var(--color-neutral-300)] bg-white p-2 transition-opacity ${p.gerando ? "opacity-60" : ""}`}>
      {p.url
        ? <img src={p.url} alt={p.alt} className="block h-auto max-w-full" />
        : <span className="text-[12px] text-[var(--color-neutral-500)]">{p.gerando ? "gerando…" : "sem imagem"}</span>}
    </div>
  );
}
