import React, { useEffect, useRef, useState } from 'react'
import { Download, Loader2, Move, Save } from 'lucide-react'

export interface ItemLegendaPreview {
  cor: string
  rotulo: string
}

interface Props {
  urlImagem: string | null
  carregando?: boolean
  erro?: string | null
  itensLegenda: ItemLegendaPreview[]
  posicaoInicial?: [number, number] // [x, y] no sistema do Matplotlib (0..1)
  molduraInicial?: boolean
  podeSalvar?: boolean
  onSalvarEstilo: (xy: [number, number], moldura: boolean) => Promise<void>
  onBaixar: (formato: 'png' | 'svg' | 'pdf') => void
}

export const EditorGraficoOriginLegenda: React.FC<Props> = ({
  urlImagem,
  carregando = false,
  erro = null,
  itensLegenda,
  posicaoInicial = [0.06, 0.92],
  molduraInicial = true,
  podeSalvar = true,
  onSalvarEstilo,
  onBaixar,
}) => {
  const areaRef = useRef<HTMLDivElement | null>(null)
  const [xy, setXy] = useState<[number, number]>(posicaoInicial)
  const [moldura, setMoldura] = useState<boolean>(molduraInicial)
  const [arrastando, setArrastando] = useState(false)
  const [modoPosicionamento, setModoPosicionamento] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const [posX, posY] = posicaoInicial
  useEffect(() => {
    setXy([posX, posY])
  }, [posX, posY])

  useEffect(() => {
    setMoldura(molduraInicial)
  }, [molduraInicial])

  // Converte o arraste do mouse para coordenadas de eixo do Matplotlib [0..1]
  // Considera margens típicas dos eixos (~12% esquerda, ~6% direita, ~10% topo, ~14% base)
  const moverComMouse = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!arrastando || !areaRef.current) return
    const rect = areaRef.current.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const xRel = (e.clientX - rect.left) / rect.width
    const yRel = (e.clientY - rect.top) / rect.height

    const xEixo = Math.min(0.88, Math.max(0.02, (xRel - 0.12) / 0.82))
    const yTelaEixo = Math.min(0.95, Math.max(0.04, (yRel - 0.10) / 0.76))
    const yMatplotlib = Number((1 - yTelaEixo).toFixed(3))

    setXy([Number(xEixo.toFixed(3)), yMatplotlib])
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      await onSalvarEstilo(xy, moldura)
      setModoPosicionamento(false)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Barra de controles */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-neutral-300)] bg-[var(--color-neutral-50)] px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setModoPosicionamento((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold border transition-colors cursor-pointer ${
              modoPosicionamento
                ? 'bg-amber-100 border-amber-500 text-amber-900'
                : 'bg-white border-[var(--color-neutral-300)] text-[var(--color-blue-800)] hover:bg-[var(--color-blue-50)]'
            }`}
          >
            <Move size={13} />
            {modoPosicionamento ? 'Reposicionando legenda…' : 'Mover caixa da legenda'}
          </button>

          <label className="flex items-center gap-1.5 cursor-pointer text-[var(--color-neutral-700)] font-medium">
            <input
              type="checkbox"
              checked={moldura}
              onChange={(e) => setMoldura(e.target.checked)}
              className="accent-[var(--color-blue)]"
            />
            Moldura preta (Origin)
          </label>

          <span className="text-[var(--color-neutral-500)] tabular-nums">
            Posição: x={xy[0].toFixed(2)}, y={xy[1].toFixed(2)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {podeSalvar && (
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-blue)] px-3 py-1 font-semibold text-white hover:bg-[var(--color-blue-800)] disabled:opacity-50 cursor-pointer"
            >
              {salvando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {salvando ? 'Salvando…' : 'Salvar posição e atualizar'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onBaixar('png')}
            disabled={!urlImagem}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-neutral-300)] bg-white px-2 py-1 font-medium text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-100)] disabled:opacity-40 cursor-pointer"
          >
            <Download size={12} /> PNG 300dpi
          </button>
          <button
            type="button"
            onClick={() => onBaixar('svg')}
            disabled={!urlImagem}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-neutral-300)] bg-white px-2 py-1 font-medium text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-100)] disabled:opacity-40 cursor-pointer"
          >
            <Download size={12} /> SVG
          </button>
          <button
            type="button"
            onClick={() => onBaixar('pdf')}
            disabled={!urlImagem}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-neutral-300)] bg-white px-2 py-1 font-medium text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-100)] disabled:opacity-40 cursor-pointer"
          >
            <Download size={12} /> PDF
          </button>
        </div>
      </div>

      {/* Área do gráfico + caixa arrastável */}
      <div
        ref={areaRef}
        onMouseMove={moverComMouse}
        onMouseUp={() => setArrastando(false)}
        onMouseLeave={() => setArrastando(false)}
        className="relative flex min-h-[300px] items-center justify-center overflow-hidden rounded-lg border border-[var(--color-neutral-300)] bg-white select-none"
      >
        {carregando && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-xs font-medium text-[var(--color-neutral-600)] gap-2">
            <Loader2 size={16} className="animate-spin text-[var(--color-orange)]" />
            Gerando gráfico padrão Origin…
          </div>
        )}

        {erro ? (
          <div className="p-6 text-center text-xs text-red-700 max-w-md">
            <p className="font-semibold mb-1">Não foi possível gerar o gráfico</p>
            <p className="text-[var(--color-neutral-600)]">{erro}</p>
          </div>
        ) : urlImagem ? (
          <img src={urlImagem} alt="Gráfico padrão Origin" className="block w-full h-auto" draggable={false} />
        ) : (
          <p className="p-8 text-xs text-[var(--color-neutral-500)] text-center">
            Preencha os dados experimentais para visualizar a prévia do gráfico padrão Origin.
          </p>
        )}

        {modoPosicionamento && urlImagem && (
          <div
            onMouseDown={(e) => {
              e.preventDefault()
              setArrastando(true)
            }}
            style={{
              left: `${(0.12 + xy[0] * 0.82) * 100}%`,
              top: `${(0.10 + (1 - xy[1]) * 0.76) * 100}%`,
            }}
            title="Arraste para mover a caixa de legenda"
            className={`absolute z-20 cursor-move bg-white/95 px-2.5 py-1.5 text-xs shadow-lg ${
              moldura ? 'border border-black' : 'border border-dashed border-blue-500'
            }`}
          >
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
              Arraste para posicionar
            </div>
            {itensLegenda.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 py-0.5 leading-tight whitespace-nowrap">
                <span className="inline-block h-2.5 w-2.5 shrink-0" style={{ backgroundColor: item.cor }} />
                <span className="text-black">{item.rotulo}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
