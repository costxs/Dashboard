import React, { useEffect, useMemo, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Alert } from '../../components/UI'
import { baixarArquivo, pedirGraficoAcidificacao, type Formato, type GraficoAcid, type PedidoAcid } from '../../servicos/graficos'
import { mensagemErro } from '../../utils/formatacao'

// Gráficos da acidificação no padrão do Origin do laboratório, gerados pelo serviço Python a partir do arquivo
// original do JBV e das fases escolhidas na tela. Nada é guardado: a prévia é refeita a cada mudança.
const ABAS: { qual: GraficoAcid; rotulo: string; descricao: string }[] = [
  { qual: 'geral', rotulo: 'Visão geral', descricao: 'Graph 0 · ΔP × tempo por fase, com a vazão tracejada no eixo da direita' },
  { qual: 'pv', rotulo: 'ΔP × PV', descricao: 'Graph 3 · ΔP × PV do ácido, com o volume morto e o PVbt marcado' },
  { qual: 'apos', rotulo: 'Depois do ácido', descricao: 'Graph 4 · injeção depois do ácido' },
]
const DPI_PREVIA = 110
const DPI_DOWNLOAD = 300

export const GraficosOriginAcid: React.FC<{ arquivo: File; pedido: PedidoAcid; nomeBase: string }> = ({ arquivo, pedido, nomeBase }) => {
  const [qual, setQual] = useState<GraficoAcid>('geral')
  const [url, setUrl] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [baixando, setBaixando] = useState<Formato | null>(null)
  // a prévia só muda quando o pedido muda de verdade (não a cada render)
  const chave = useMemo(() => JSON.stringify(pedido), [pedido])

  // troca a imagem e libera a anterior; ao fechar o painel, libera a última
  const trocarUrl = (nova: string | null) => setUrl((velha) => { if (velha) URL.revokeObjectURL(velha); return nova })
  useEffect(() => () => trocarUrl(null), [])

  useEffect(() => {
    const ctl = new AbortController()
    setGerando(true)
    setErro(null)
    // espera a pessoa parar de digitar (400 ms) e cancela o pedido anterior
    const t = setTimeout(() => {
      pedirGraficoAcidificacao(arquivo, { ...JSON.parse(chave), config: { formato: 'png', dpi: DPI_PREVIA, mostrar_pvbt: false } }, qual, ctl.signal)
        .then((b) => { if (!ctl.signal.aborted) trocarUrl(URL.createObjectURL(b)) })
        .catch((e) => { if (!ctl.signal.aborted) { trocarUrl(null); setErro(mensagemErro(e)) } })
        .finally(() => { if (!ctl.signal.aborted) setGerando(false) })
    }, 400)
    return () => { clearTimeout(t); ctl.abort() }
  }, [arquivo, chave, qual])

  async function baixar(formato: Formato) {
    setBaixando(formato)
    setErro(null)
    try {
      const b = await pedirGraficoAcidificacao(arquivo, { ...pedido, config: { formato, dpi: DPI_DOWNLOAD, mostrar_pvbt: false } }, qual)
      baixarArquivo(b, `${nomeBase}_acidificacao_${qual}.${formato}`)
    } catch (e) {
      setErro(`Não consegui baixar: ${mensagemErro(e)}`)
    } finally {
      setBaixando(null)
    }
  }

  const aba = ABAS.find((a) => a.qual === qual)!
  return (
    <div className="rounded-[14px] border border-[var(--color-neutral-300)] bg-white">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-neutral-300)] px-3">
        {ABAS.map((a) => (
          <button key={a.qual} type="button" onClick={() => setQual(a.qual)} className={`aba ${qual === a.qual ? 'ativa' : ''}`}>{a.rotulo}</button>
        ))}
      </div>
      <div className="flex flex-col gap-4 p-5">
        <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">{aba.descricao}</p>
        {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
        <div className="relative flex min-h-[260px] items-center justify-center rounded-[10px] bg-[var(--color-neutral-100)]">
          {url && <img src={url} alt={aba.descricao} className={`max-h-[560px] max-w-full ${gerando ? 'opacity-50' : ''}`} />}
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
  )
}
