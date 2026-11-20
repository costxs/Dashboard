import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Loader2, Move, RotateCcw } from 'lucide-react'
import { Alert } from '../../components/UI'
import {
  baixarArquivo, CONFIG_ACID_PADRAO, coresPadraoAcid, FONTES, legendaPadraoAcid, pedirGraficoAcidificacao,
  pedirGraficoAcidificacaoComLayout,
  type ConfigGraficosAcid, type Formato, type GraficoAcid, type LayoutGrafico, type PedidoAcid,
} from '../../servicos/graficos'
import { mensagemErro } from '../../utils/formatacao'

// Gráficos da acidificação no padrão do Origin do laboratório, gerados pelo serviço Python a partir do arquivo
// original e das fases escolhidas na tela. A pessoa edita fonte, tamanho, cores, legendas e arrasta a caixa da legenda;
// a configuração (ConfigGraficosAcid) fica na tela pai, que a usa na planilha Excel e a grava com o ensaio.
const ABAS: { qual: GraficoAcid; rotulo: string; descricao: string }[] = [
  { qual: 'geral', rotulo: 'Visão geral', descricao: 'Graph 0 · ΔP × tempo por fase, com a vazão tracejada no eixo da direita' },
  { qual: 'pv', rotulo: 'ΔP × PV', descricao: 'Graph 3 · ΔP × PV do ácido, com o volume morto' },
  { qual: 'apos', rotulo: 'Depois do ácido', descricao: 'Graph 4 · injeção depois do ácido' },
]
const DPI_PREVIA = 110
const DPI_DOWNLOAD = 300
const r3 = (n: number) => Math.round(n * 1000) / 1000

interface Previa { blob: Blob; layout: LayoutGrafico | null }

export const GraficosOriginAcid: React.FC<{
  arquivo: File
  /** pedido já com a configuração aplicada (aplicarConfigAcid) */
  pedido: PedidoAcid
  config: ConfigGraficosAcid
  aoMudar: (c: ConfigGraficosAcid) => void
  nomeBase: string
}> = ({ arquivo, pedido, config: c, aoMudar, nomeBase }) => {
  const [qual, setQual] = useState<GraficoAcid>('geral')
  const [url, setUrl] = useState<string | null>(null)
  const [layout, setLayout] = useState<LayoutGrafico | null>(null)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [baixando, setBaixando] = useState<Formato | null>(null)
  const cachePrevia = useRef<Map<string, Previa>>(new Map())
  const mudar = (parte: Partial<ConfigGraficosAcid>) => aoMudar({ ...c, ...parte })

  // a prévia só muda quando o pedido muda de verdade (sem serializar milhares de pontos de leituras toda vez)
  const chave = useMemo(() => {
    const { leituras, ...resto } = pedido
    return JSON.stringify({ ...resto, nLeituras: leituras?.length ?? 0 })
  }, [pedido])

  // troca a imagem e libera a anterior; ao fechar o painel, libera a última
  const trocarUrl = (nova: string | null) => setUrl((velha) => { if (velha) URL.revokeObjectURL(velha); return nova })
  useEffect(() => () => trocarUrl(null), [])

  useEffect(() => {
    const chaveAba = `${qual}:${chave}`
    const emCache = cachePrevia.current.get(chaveAba)
    if (emCache) {
      setErro(null)
      setGerando(false)
      setLayout(emCache.layout)
      trocarUrl(URL.createObjectURL(emCache.blob))
      return
    }
    const ctl = new AbortController()
    setGerando(true)
    setErro(null)
    // espera a pessoa parar de digitar (250 ms) e cancela o pedido anterior
    const t = setTimeout(() => {
      pedirGraficoAcidificacaoComLayout(arquivo, { ...pedido, config: { ...pedido.config, formato: 'png', dpi: DPI_PREVIA, mostrar_pvbt: false } }, qual, ctl.signal)
        .then((r) => {
          if (!ctl.signal.aborted) {
            if (cachePrevia.current.size > 12) cachePrevia.current.clear()
            cachePrevia.current.set(chaveAba, r)
            setLayout(r.layout)
            trocarUrl(URL.createObjectURL(r.blob))
          }
        })
        .catch((e) => { if (!ctl.signal.aborted) { trocarUrl(null); setLayout(null); setErro(mensagemErro(e)) } })
        .finally(() => { if (!ctl.signal.aborted) setGerando(false) })
    }, 250)
    return () => { clearTimeout(t); ctl.abort() }
  }, [arquivo, chave, qual]) // eslint-disable-line react-hooks/exhaustive-deps

  async function baixar(formato: Formato) {
    setBaixando(formato)
    setErro(null)
    try {
      const b = await pedirGraficoAcidificacao(arquivo, { ...pedido, config: { ...pedido.config, formato, dpi: DPI_DOWNLOAD, mostrar_pvbt: false } }, qual)
      baixarArquivo(b, `${nomeBase}_acidificacao_${qual}.${formato}`)
    } catch (e) {
      setErro(`Não consegui baixar: ${mensagemErro(e)}`)
    } finally {
      setBaixando(null)
    }
  }

  // ---- caixa da legenda arrastável, por cima da legenda desenhada pelo serviço ----
  const moldura = useRef<HTMLDivElement>(null)
  const [arraste, setArraste] = useState<{ dx: number; dy: number; x: number; y: number } | null>(null)
  const leg = layout?.legenda ?? null
  function comecarArraste(e: React.PointerEvent<HTMLDivElement>) {
    if (!leg || !moldura.current) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const r = moldura.current.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height
    setArraste({ dx: px - leg[0], dy: py - leg[1], x: leg[0], y: leg[1] })
  }
  function moverArraste(e: React.PointerEvent<HTMLDivElement>) {
    if (!arraste || !moldura.current || !leg) return
    const r = moldura.current.getBoundingClientRect()
    const x = Math.min(1 - leg[2], Math.max(0, (e.clientX - r.left) / r.width - arraste.dx))
    const y = Math.min(1 - leg[3], Math.max(0, (e.clientY - r.top) / r.height - arraste.dy))
    setArraste({ ...arraste, x, y })
  }
  function soltarArraste() {
    if (!arraste || !layout || !leg) { setArraste(null); return }
    const [ex, ey, ew, eh] = layout.eixos
    const moveu = Math.abs(arraste.x - leg[0]) > 0.002 || Math.abs(arraste.y - leg[1]) > 0.002
    if (moveu && ew > 0 && eh > 0) {
      // imagem (de cima para baixo) -> fração dos eixos do matplotlib (de baixo para cima), canto de cima à esquerda
      const pos: [number, number] = [r3((arraste.x - ex) / ew), r3(1 - (arraste.y - ey) / eh)]
      // a imagem nova chega com a legenda no lugar; até lá, a caixa fica onde foi solta
      setLayout({ ...layout, legenda: [arraste.x, arraste.y, leg[2], leg[3]] })
      mudar({ legenda_pos: { ...c.legenda_pos, [qual]: pos } })
    }
    setArraste(null)
  }
  const caixa = arraste ? [arraste.x, arraste.y, leg![2], leg![3]] : leg

  // ---- fases (cor e legenda) ----
  const coresPadrao = useMemo(() => coresPadraoAcid(pedido.fases), [pedido.fases])
  const fasesDoGrafico = pedido.fases.filter((f) => qual === 'geral' || (qual === 'pv' ? f.papel === 'acido' : f.papel === 'pos_fluxo'))
  const mudarFase = (ordem: number, parte: { cor?: string; legenda?: string }) =>
    mudar({ fases: { ...c.fases, [ordem]: { ...c.fases[String(ordem)], ...parte } } })

  const aba = ABAS.find((a) => a.qual === qual)!
  const posPropria = c.legenda_pos[qual]
  return (
    <div className="rounded-[14px] border border-[var(--color-neutral-300)] bg-white">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-neutral-300)] px-3">
        {ABAS.map((a) => (
          <button key={a.qual} type="button" onClick={() => setQual(a.qual)} className={`aba ${qual === a.qual ? 'ativa' : ''}`}>{a.rotulo}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 p-5 xl:grid-cols-[minmax(280px,340px)_1fr]">
        {/* edição: vale para os três gráficos (e para a planilha Excel e o que for gravado) */}
        <div className="flex min-w-0 flex-col gap-4 text-[12px] text-[var(--color-neutral-700)]">
          <Secao titulo="Texto e linhas (todos os gráficos)">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                Fonte
                <select className="input !py-1" value={c.fonte} onChange={(e) => mudar({ fonte: e.target.value })}>
                  {FONTES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <CampoNum rotulo="Tamanho da fonte (pt)" valor={c.tamanho_fonte} min={6} max={40} aoMudar={(v) => mudar({ tamanho_fonte: v ?? CONFIG_ACID_PADRAO.tamanho_fonte })} />
              <CampoNum rotulo="Espessura da linha" valor={c.espessura_linha} min={0.1} max={8} aoMudar={(v) => mudar({ espessura_linha: v ?? CONFIG_ACID_PADRAO.espessura_linha })} />
              <CampoNum rotulo="ΔP mín. (psi)" valor={c.dp_min} opcional aoMudar={(v) => mudar({ dp_min: v })} />
              <CampoNum rotulo="ΔP máx. (psi)" valor={c.dp_max} opcional min={0} aoMudar={(v) => mudar({ dp_max: v })} />
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={c.mostrar_legenda} onChange={(e) => mudar({ mostrar_legenda: e.target.checked })} /> Mostrar legenda
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={c.mostrar_vazao} onChange={(e) => mudar({ mostrar_vazao: e.target.checked })} /> Mostrar vazão (visão geral)
              </label>
              <Cor valor={c.cor_vazao} rotulo="Cor da vazão" aoMudar={(v) => mudar({ cor_vazao: v })} />
            </div>
          </Secao>

          <Secao titulo={`Fases ${qual === 'geral' ? '' : `(${aba.rotulo})`}`}>
            {fasesDoGrafico.length === 0 ? (
              <p className="m-0 text-[var(--color-neutral-500)]">Nenhuma fase neste gráfico.</p>
            ) : fasesDoGrafico.map((f) => {
              const e = c.fases[String(f.ordem)] ?? {}
              return (
                <div key={f.ordem} className="flex items-center gap-2">
                  <Cor valor={e.cor || coresPadrao[f.ordem]} rotulo={`Cor da fase ${f.ordem}`} aoMudar={(v) => mudarFase(f.ordem, { cor: v })} />
                  <input className="input !px-2 !py-1" value={e.legenda ?? ''} aria-label={`Legenda da fase ${f.ordem}`}
                    placeholder={legendaPadraoAcid(f, pedido.temperatura_rotulo)}
                    onChange={(ev) => mudarFase(f.ordem, { legenda: ev.target.value })} />
                </div>
              )
            })}
          </Secao>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" title="Volta fonte, cores, legendas e posição das legendas ao padrão do Origin"
              onClick={() => aoMudar({ ...CONFIG_ACID_PADRAO, fases: {}, legenda_pos: {} })}>
              <RotateCcw size={13} /> Voltar ao padrão
            </button>
          </div>
          <p className="m-0 text-[11px] text-[var(--color-neutral-500)]">
            As mudanças ficam salvas neste navegador, vão para os downloads e para a planilha Excel e são gravadas com o ensaio
            (passo 6): o dashboard mostra os gráficos do jeito que estão aqui.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">{aba.descricao}</p>
          {c.mostrar_legenda && (
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-[var(--color-neutral-600)]">
              {layout?.legenda ? (
                <span className="flex items-center gap-1.5"><Move size={13} className="text-[var(--color-blue)]" /> Arraste a caixa da legenda no gráfico para mudar o lugar.</span>
              ) : layout === null && url && !gerando ? (
                <span>Para arrastar a legenda, o serviço de gráficos precisa ser atualizado.</span>
              ) : null}
              {posPropria && (
                <button type="button" className="btn btn-secondary btn-sm"
                  onClick={() => { const { [qual]: _x, ...resto } = c.legenda_pos; mudar({ legenda_pos: resto }) }}>
                  <RotateCcw size={12} /> Legenda no lugar automático
                </button>
              )}
            </div>
          )}
          {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
          <div className="relative flex min-h-[260px] items-center justify-center rounded-[10px] bg-[var(--color-neutral-100)] p-2">
            {url && (
              <div ref={moldura} className="relative inline-block max-w-full select-none">
                <img src={url} alt={aba.descricao} draggable={false} className={`block max-h-[560px] max-w-full ${gerando ? 'opacity-50' : ''}`} />
                {caixa && c.mostrar_legenda && (
                  <div role="button" aria-label="Arrastar a caixa da legenda" title="Arraste para mover a legenda"
                    onPointerDown={comecarArraste} onPointerMove={moverArraste} onPointerUp={soltarArraste} onPointerCancel={() => setArraste(null)}
                    className={`absolute cursor-move touch-none rounded-[2px] ${arraste ? 'border-2 border-[var(--color-blue)] bg-[rgba(31,78,156,0.08)]' : 'border border-dashed border-transparent hover:border-[var(--color-blue)]'}`}
                    style={{ left: `${caixa[0] * 100}%`, top: `${caixa[1] * 100}%`, width: `${caixa[2] * 100}%`, height: `${caixa[3] * 100}%` }} />
                )}
              </div>
            )}
            {gerando && (
              <span className="absolute flex items-center gap-2 text-[13px] text-[var(--color-neutral-600)]">
                <Loader2 size={14} className="animate-spin text-[var(--color-orange)]" /> gerando…
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {([['png', 'Baixar PNG'], ['svg', 'Baixar SVG'], ['pdf', 'Baixar PDF']] as [Formato, string][]).map(([f, texto]) => (
              <button key={f} type="button" className="btn btn-secondary btn-sm" disabled={baixando != null} onClick={() => baixar(f)}>
                {baixando === f ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} {texto}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const Secao: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <section className="flex flex-col gap-2.5">
    <h3 className="m-0 border-b border-[var(--color-neutral-200)] pb-1.5 text-[13px] font-semibold text-[var(--color-neutral-900)]">{titulo}</h3>
    {children}
  </section>
)

const Cor: React.FC<{ valor: string; rotulo: string; aoMudar: (v: string) => void }> = ({ valor, rotulo, aoMudar }) => (
  <input type="color" aria-label={rotulo} title={rotulo} value={valor} onChange={(e) => aoMudar(e.target.value)}
    className="h-[30px] w-[38px] shrink-0 cursor-pointer rounded border border-[var(--color-neutral-300)] bg-white p-0.5" />
)

/** número que só vale ao sair do campo ou no Enter (não pede gráfico a cada tecla); opcional = vazio vira automático */
function CampoNum(p: { rotulo: string; valor: number | null; min?: number; max?: number; opcional?: boolean; aoMudar: (v: number | null) => void }) {
  const original = p.valor == null ? '' : String(p.valor).replace('.', ',')
  const [texto, setTexto] = useState(original)
  useEffect(() => { setTexto(original) }, [original])
  function aplicar() {
    const n = parseFloat(texto.replace(',', '.'))
    if (!Number.isFinite(n)) {
      if (p.opcional && !texto.trim()) p.aoMudar(null)
      else setTexto(original)
      return
    }
    const v = Math.min(Math.max(n, p.min ?? -Infinity), p.max ?? Infinity)
    if (v !== p.valor) p.aoMudar(v)
    setTexto(String(v).replace('.', ','))
  }
  return (
    <label className="flex flex-col gap-1">
      {p.rotulo}
      <input type="text" inputMode="decimal" className="input !py-1" value={texto} placeholder={p.opcional ? 'auto' : undefined}
        onChange={(e) => setTexto(e.target.value)} onBlur={aplicar} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    </label>
  )
}
