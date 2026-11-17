// AMOSTRA › ficha › 2. Micro-CT: 3 espaços para fotos da amostra e 3 para imagens de micro-CT.
// Cada espaço guarda uma imagem (bucket "arquivos", tabela arquivos com tipo + posição — migração 022) e uma legenda.
import React, { useEffect, useRef, useState, type DragEvent } from 'react'
import { Camera, Download, ImageOff, ImagePlus, Loader2, Maximize2, RefreshCw, ScanLine, Trash2 } from 'lucide-react'
import { Alert, Card, Modal } from '../UI'
import { confirmar } from '../Confirmar'
import { useConsulta } from '../../hooks/useConsulta'
import {
  apagarArquivoAnexo, enviarImagemFicha, listarImagensFicha, obterUrlDownloadArquivo, salvarLegendaImagem, type TipoImagemFicha,
} from '../../servicos/api'
import type { ArquivoAnexo } from '../../tipos/banco'
import { fmt, mensagemErro } from '../../utils/formatacao'

const POSICOES = [1, 2, 3]
const LIMITE_MB = 50
const ACEITOS = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff,.tif,.tiff'
const GRUPOS: { tipo: TipoImagemFicha; titulo: string; dica: string; icone: React.ReactNode }[] = [
  { tipo: 'foto_amostra', titulo: 'Fotos da amostra', dica: 'Ex.: face de entrada, face de saída, lateral', icone: <Camera size={16} /> },
  { tipo: 'imagem_microct', titulo: 'Imagens de micro-CT', dica: 'Ex.: corte axial, corte longitudinal, reconstrução 3D', icone: <ScanLine size={16} /> },
]
/** o navegador não mostra TIFF: fica só o download */
const mostravel = (nome: string) => !/\.tiff?$/i.test(nome)

interface Props { amostraId: string; codigo: string; podeEditar: boolean }

export const ImagensMicroct: React.FC<Props> = ({ amostraId, codigo, podeEditar }) => {
  const imagens = useConsulta(() => listarImagensFicha(amostraId), [amostraId])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [ampliada, setAmpliada] = useState<ArquivoAnexo | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // links temporários (1 h) para mostrar as imagens do bucket privado
  useEffect(() => {
    let vivo = true
    const faltam = (imagens.dados ?? []).filter((i) => !urls[i.caminho])
    Promise.all(faltam.map(async (i) => [i.caminho, await obterUrlDownloadArquivo(i.caminho).catch(() => '')] as const))
      .then((pares) => { if (vivo && pares.length) setUrls((u) => ({ ...u, ...Object.fromEntries(pares) })) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagens.dados])

  const doEspaco = (tipo: TipoImagemFicha, posicao: number) => (imagens.dados ?? []).find((i) => i.tipo === tipo && i.posicao === posicao) ?? null
  const total = imagens.dados?.length ?? 0

  return (
    <Card titulo="Imagens da amostra e do micro-CT" icone={<ImagePlus size={18} />}
      subtitulo={`3 fotos da amostra e 3 imagens de micro-CT de ${codigo} · ${total} de 6 espaços preenchidos`}>
      <div className="flex flex-col gap-6">
        {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
        {imagens.erro ? <Alert tipo="erro" mensagem={imagens.erro} /> : GRUPOS.map((g) => (
          <section key={g.tipo}>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="m-0 flex items-center gap-2 text-[15px] font-bold text-[var(--color-blue-800)]">
                <span className="text-[var(--color-blue)]">{g.icone}</span>{g.titulo}
              </h3>
              <span className="text-[12px] text-[var(--color-neutral-600)]">{g.dica}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {POSICOES.map((pos) => (
                <Espaco key={pos} amostraId={amostraId} tipo={g.tipo} posicao={pos} rotulo={`${g.tipo === 'foto_amostra' ? 'Foto' : 'Micro-CT'} ${pos}`}
                  imagem={doEspaco(g.tipo, pos)} url={urls[doEspaco(g.tipo, pos)?.caminho ?? ''] ?? ''} carregando={imagens.carregando && !imagens.dados}
                  podeEditar={podeEditar} aoAmpliar={setAmpliada} aoErro={setErro} aoMudar={imagens.recarregar} />
              ))}
            </div>
          </section>
        ))}
        <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">
          PNG, JPG, WEBP ou TIFF, até {LIMITE_MB} MB por imagem. Arraste a imagem para o espaço ou clique nele. TIFF é guardado, mas o navegador não mostra a prévia (use o download).
        </p>
      </div>

      {ampliada && (
        <Modal isOpen onClose={() => setAmpliada(null)} maxWidth="max-w-5xl"
          titulo={`${ampliada.tipo === 'foto_amostra' ? 'Foto da amostra' : 'Micro-CT'} ${ampliada.posicao} · ${codigo}`}
          subtitulo={ampliada.legenda ?? ampliada.nome_original}>
          <img src={urls[ampliada.caminho]} alt={ampliada.legenda ?? ampliada.nome_original} className="mx-auto max-h-[72vh] w-auto rounded-[10px] bg-[var(--color-neutral-100)]" />
          <div className="mt-4 flex justify-end">
            <a className="btn btn-secondary" href={urls[ampliada.caminho]} target="_blank" rel="noreferrer" download={ampliada.nome_original}><Download size={14} /> Baixar original</a>
          </div>
        </Modal>
      )}
    </Card>
  )
}

function Espaco(p: {
  amostraId: string; tipo: TipoImagemFicha; posicao: number; rotulo: string; imagem: ArquivoAnexo | null; url: string
  carregando: boolean; podeEditar: boolean; aoAmpliar: (i: ArquivoAnexo) => void; aoErro: (m: string | null) => void; aoMudar: () => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [ocupado, setOcupado] = useState<'enviando' | 'apagando' | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const [legenda, setLegenda] = useState(p.imagem?.legenda ?? '')
  useEffect(() => { setLegenda(p.imagem?.legenda ?? '') }, [p.imagem?.id, p.imagem?.legenda])
  const img = p.imagem

  async function enviar(arquivo?: File | null) {
    if (!arquivo || !p.podeEditar) return
    p.aoErro(null)
    if (!/^image\//.test(arquivo.type) && !/\.(tiff?|png|jpe?g|webp|gif|bmp)$/i.test(arquivo.name)) {
      p.aoErro(`"${arquivo.name}" não é uma imagem. Use PNG, JPG, WEBP ou TIFF.`); return
    }
    if (arquivo.size > LIMITE_MB * 1024 * 1024) {
      p.aoErro(`"${arquivo.name}" tem ${fmt(arquivo.size / 1024 / 1024, 1)} MB; o limite é ${LIMITE_MB} MB. Exporte uma versão menor (ex.: PNG ou JPG).`); return
    }
    setOcupado('enviando')
    try {
      await enviarImagemFicha(p.amostraId, p.tipo, p.posicao, arquivo, img, legenda)
      p.aoMudar()
    } catch (e) {
      p.aoErro(mensagemErro(e))
    } finally {
      setOcupado(null)
    }
  }

  async function remover() {
    if (!img) return
    if (!(await confirmar(`Remover a imagem "${img.nome_original}" do espaço ${p.rotulo}? O arquivo é apagado e não dá para desfazer.`, { titulo: 'Remover imagem', textoSim: 'Remover' }))) return
    p.aoErro(null)
    setOcupado('apagando')
    try { await apagarArquivoAnexo(img); p.aoMudar() } catch (e) { p.aoErro(mensagemErro(e)) } finally { setOcupado(null) }
  }

  async function gravarLegenda() {
    if (!img || legenda.trim() === (img.legenda ?? '')) return
    try { await salvarLegendaImagem(img.id, legenda); p.aoMudar() } catch (e) { p.aoErro(mensagemErro(e)) }
  }

  const soltar = (e: DragEvent) => { e.preventDefault(); setArrastando(false); void enviar(e.dataTransfer.files?.[0]) }
  const arrastar = p.podeEditar ? {
    onDragOver: (e: DragEvent) => { e.preventDefault(); setArrastando(true) },
    onDragLeave: () => setArrastando(false), onDrop: soltar,
  } : {}

  return (
    <figure className="m-0 flex flex-col gap-2">
      <div {...arrastar}
        className={`relative aspect-[4/3] overflow-hidden rounded-[12px] border-2 transition-colors ${arrastando
          ? 'border-[var(--color-orange)] bg-[var(--color-orange-50)]'
          : img ? 'border-[var(--color-neutral-300)] bg-[var(--color-neutral-100)]' : 'border-dashed border-[var(--color-blue-200)] bg-[var(--color-blue-50)]'}`}>
        <span className="absolute left-2 top-2 z-[1] rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-[var(--color-blue-800)] shadow-sm">{p.rotulo}</span>

        {p.carregando ? (
          <div className="flex h-full items-center justify-center"><Loader2 size={20} className="animate-spin text-[var(--color-orange)]" /></div>
        ) : img ? (
          mostravel(img.nome_original) && p.url ? (
            <button type="button" className="h-full w-full cursor-zoom-in" title="Ampliar" onClick={() => p.aoAmpliar(img)}>
              <img src={p.url} alt={img.legenda ?? img.nome_original} className="h-full w-full object-cover" loading="lazy" />
            </button>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-[12px] text-[var(--color-neutral-600)]">
              {mostravel(img.nome_original) ? <Loader2 size={20} className="animate-spin text-[var(--color-orange)]" /> : <ImageOff size={24} />}
              <span className="break-all">{img.nome_original}</span>
              {!mostravel(img.nome_original) && <span>(TIFF: sem prévia no navegador)</span>}
            </div>
          )
        ) : p.podeEditar ? (
          <button type="button" className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 text-[var(--color-blue)] hover:bg-[var(--color-blue-100)]"
            onClick={() => entrada.current?.click()} disabled={!!ocupado}>
            <ImagePlus size={26} />
            <span className="text-[13px] font-semibold">Enviar imagem</span>
            <span className="text-[11px] text-[var(--color-neutral-600)]">clique ou arraste aqui</span>
          </button>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[12px] text-[var(--color-neutral-500)]"><ImageOff size={22} /> sem imagem</div>
        )}

        {ocupado && (
          <div className="absolute inset-0 z-[2] flex items-center justify-center gap-2 bg-white/80 text-[13px] font-semibold text-[var(--color-blue-800)]">
            <Loader2 size={16} className="animate-spin text-[var(--color-orange)]" /> {ocupado === 'enviando' ? 'Enviando…' : 'Removendo…'}
          </div>
        )}
      </div>

      <input ref={entrada} type="file" accept={ACEITOS} className="hidden" onChange={(e) => { void enviar(e.target.files?.[0]); e.target.value = '' }} />

      {img && (
        <>
          {p.podeEditar ? (
            <input className="input !py-1.5 text-[13px]" placeholder="Legenda (opcional)" aria-label={`Legenda de ${p.rotulo}`} value={legenda}
              onChange={(e) => setLegenda(e.target.value)} onBlur={gravarLegenda} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
          ) : img.legenda && <figcaption className="text-[13px] text-[var(--color-neutral-800)]">{img.legenda}</figcaption>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-0 truncate text-[11px] text-[var(--color-neutral-500)]" title={img.nome_original}>
              {img.nome_original}{img.tamanho_bytes ? ` · ${fmt(img.tamanho_bytes / 1024 / 1024, 1)} MB` : ''}
            </span>
            {mostravel(img.nome_original) && p.url && <button type="button" className="btn-icone" title="Ampliar" onClick={() => p.aoAmpliar(img)}><Maximize2 size={14} /></button>}
            {p.url && <a className="btn-icone" title="Baixar original" href={p.url} target="_blank" rel="noreferrer" download={img.nome_original}><Download size={14} /></a>}
            {p.podeEditar && <>
              <button type="button" className="btn-icone" title="Trocar a imagem" disabled={!!ocupado} onClick={() => entrada.current?.click()}><RefreshCw size={14} /></button>
              <button type="button" className="btn-icone perigo" title="Remover a imagem" disabled={!!ocupado} onClick={remover}><Trash2 size={14} /></button>
            </>}
          </div>
        </>
      )}
    </figure>
  )
}
