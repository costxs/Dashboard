import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileArchive, FileSpreadsheet, LineChart, Loader2, RotateCcw } from 'lucide-react'
import { Alert, Card, Input, Select } from '../../components/UI'
import {
  CONFIG_PADRAO, FONTES, MARCADORES, baixarArquivo, etapaGrafico, guardarPreferencias, montarPedido, pedirAoServico, unidadeTempo,
  type ConfigGraficos, type DadosEnsaio, type EtapaGrafico, type Formato, type Modo, type UnidadeTempo,
} from '../../servicos/graficos'
import { fmt, mensagemErro, numeroParaInput, paraNumero } from '../../utils/formatacao'
import { montarZip } from '../../utils/zip'

// Cartão "Gráficos (padrão Origin)" do tratamento de permeabilidade: painel de edição à esquerda,
// prévia à direita. As imagens vêm do serviço Python (src/servicos/graficos.ts); a configuração fica
// com a tela pai, que a grava em analise_petrofisica.config_graficos junto com o tratamento.

const DPI_PREVIA = 110
const DPI_DOWNLOAD = 300
const ESPERA_PREVIA_MS = 400

interface Previa { principal: string | null; darcy: string | null }

export const GraficosOrigin: React.FC<{
  dados: DadosEnsaio
  config: ConfigGraficos
  aoMudar: (c: ConfigGraficos) => void
  /** início do nome dos arquivos baixados (código da amostra ou nome do arquivo) */
  nomeBase: string
  /** de onde veio a configuração (ex.: do tratamento já gravado na amostra) */
  origemConfig?: string | null
  desabilitado?: boolean
}> = ({ dados, config: c, aoMudar, nomeBase, origemConfig, desabilitado }) => {
  const [previa, setPrevia] = useState<Previa>({ principal: null, darcy: null })
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [baixando, setBaixando] = useState<string | null>(null)
  const [erroBaixar, setErroBaixar] = useState<string | null>(null)
  const urls = useRef<Previa>(previa)

  const mudar = (parte: Partial<ConfigGraficos>) => aoMudar({ ...c, ...parte })
  function mudarEtapa(ordem: number, i: number, parte: Partial<EtapaGrafico>) {
    const nova = { ...etapaGrafico(c, ordem, i), ...parte }
    const cores = [...c.cores]
    if (parte.cor) cores[i] = parte.cor  // a cor vira a padrão desta posição no próximo ensaio
    aoMudar({ ...c, cores, etapas: { ...c.etapas, [ordem]: nova } })
  }

  // as últimas escolhas ficam como padrão para o próximo ensaio
  useEffect(() => { guardarPreferencias(c) }, [c])

  const algumaVisivel = dados.etapas.some((e, i) => etapaGrafico(c, e.ordem, i).visivel)
  const corpo = (modo: Modo, formato: Formato, dpi: number) => JSON.stringify(montarPedido(dados, c, modo, formato, dpi))
  const corpoPrincipal = useMemo(() => JSON.stringify(montarPedido(dados, c, 'combinado', 'png', DPI_PREVIA)), [dados, c])
  const corpoDarcy = useMemo(() => JSON.stringify(montarPedido(dados, c, 'darcy', 'png', DPI_PREVIA)), [dados, c])

  // prévia: refeita 400 ms depois da última mudança; o pedido anterior é cancelado
  useEffect(() => {
    if (!algumaVisivel) return
    const ctl = new AbortController()
    const espera = setTimeout(async () => {
      setGerando(true)
      const [a, b] = await Promise.allSettled([
        pedirAoServico('grafico', corpoPrincipal, ctl.signal),
        pedirAoServico('grafico', corpoDarcy, ctl.signal),
      ])
      if (ctl.signal.aborted) return
      const nova: Previa = {
        principal: a.status === 'fulfilled' ? URL.createObjectURL(a.value) : null,
        darcy: b.status === 'fulfilled' ? URL.createObjectURL(b.value) : null,
      }
      for (const u of [urls.current.principal, urls.current.darcy]) if (u) URL.revokeObjectURL(u)
      urls.current = nova
      setPrevia(nova)
      const falha = [a, b].find((x) => x.status === 'rejected')
      setErro(falha ? mensagemErro((falha as PromiseRejectedResult).reason) : null)
      setGerando(false)
    }, ESPERA_PREVIA_MS)
    return () => { clearTimeout(espera); ctl.abort(); setGerando(false) }
  }, [corpoPrincipal, corpoDarcy, algumaVisivel])

  useEffect(() => () => {
    for (const u of [urls.current.principal, urls.current.darcy]) if (u) URL.revokeObjectURL(u)
  }, [])

  async function baixar(qual: string, tarefa: () => Promise<void>) {
    setErroBaixar(null)
    setBaixando(qual)
    try { await tarefa() } catch (e) { setErroBaixar(mensagemErro(e)) } finally { setBaixando(null) }
  }
  const NOMES: Record<Modo, string> = { combinado: 'grafico', darcy: 'dp_x_q' }
  const baixarGrafico = (formato: Formato) => baixar(formato, async () => {
    const dpi = formato === 'png' ? DPI_DOWNLOAD : 72
    baixarArquivo(await pedirAoServico('grafico', corpo('combinado', formato, dpi)), `${nomeBase}_${NOMES.combinado}.${formato}`)
  })
  const baixarOrigin = () => baixar('origin', async () => {
    baixarArquivo(await pedirAoServico('origin', corpo('combinado', 'png', DPI_DOWNLOAD)), `${nomeBase}_para_origin.xlsx`)
  })
  const baixarTodos = () => baixar('todos', async () => {
    const pedidos = (['combinado', 'darcy'] as Modo[]).flatMap((modo) => (['png', 'svg', 'pdf'] as Formato[]).map(async (formato) => ({
      nome: `${nomeBase}_${NOMES[modo]}.${formato}`,
      dados: await pedirAoServico('grafico', corpo(modo, formato, formato === 'png' ? DPI_DOWNLOAD : 72)),
    })))
    baixarArquivo(await montarZip(await Promise.all(pedidos)), `${nomeBase}_graficos.zip`)
  })

  const ocupado = desabilitado || baixando != null
  const botao = (id: string, onClick: () => void, icone: React.ReactNode, texto: string) => (
    <button type="button" className="btn btn-secondary btn-sm" onClick={onClick} disabled={ocupado || !algumaVisivel}>
      {baixando === id ? <Loader2 size={13} className="animate-spin" /> : icone} {texto}
    </button>
  )

  return (
    <Card
      titulo="Gráficos (padrão Origin)"
      subtitulo="Gerados pelo serviço de gráficos no estilo do Origin. A configuração vai junto quando você grava o tratamento na amostra."
      icone={<LineChart size={18} />}
      acoes={(
        <button type="button" className="btn btn-secondary btn-sm" disabled={desabilitado}
          title="Volta título, eixos, fonte e cores ao padrão do Origin"
          onClick={() => aoMudar({ ...CONFIG_PADRAO, etapas: {} })}>
          <RotateCcw size={13} /> Voltar ao padrão
        </button>
      )}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(300px,380px)_1fr]">
        {/* painel de edição */}
        <fieldset className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0" disabled={desabilitado}>
          {origemConfig && <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">{origemConfig}</p>}

          <Secao titulo="Como mostrar">
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {([[false, 'Em sequência'], [true, 'Sobrepostas']] as const).map(([v, rotulo]) => (
                <label key={rotulo} className="flex cursor-pointer items-center gap-2 text-[13px]">
                  <input type="radio" name="graficos-como-mostrar" checked={c.sobrepor === v} onChange={() => mudar({ sobrepor: v })} />
                  {rotulo}
                </label>
              ))}
            </div>
            <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">
              {c.sobrepor
                ? 'Todas as vazões começando em t = 0, uma sobre a outra.'
                : 'No tempo do ensaio, uma vazão emendada na outra (pausas com Q = 0 somem); o k de cada vazão aparece sobre o seu trecho estável.'}
            </p>
          </Secao>

          <Secao titulo="Etapas">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[var(--color-neutral-600)]">
                    <th className="pb-1 font-semibold">Cor</th><th className="pb-1 font-semibold">Rótulo</th>
                    <th className="pb-1 font-semibold">Marcador</th><th className="pb-1 font-semibold">Mostrar</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.etapas.map((e, i) => {
                    const g = etapaGrafico(c, e.ordem, i)
                    return (
                      <tr key={e.ordem}>
                        <td className="py-1 pr-2">
                          <input type="color" className="h-[30px] w-[38px] cursor-pointer rounded border border-[var(--color-neutral-300)] bg-white p-0.5"
                            value={g.cor} aria-label={`Cor da etapa ${e.ordem}`} onChange={(ev) => mudarEtapa(e.ordem, i, { cor: ev.target.value })} />
                        </td>
                        <td className="py-1 pr-2">
                          <input className="input !px-2 !py-1" value={g.rotulo} placeholder={`Q = ${fmt(e.q, 2)} cm³/min`}
                            aria-label={`Rótulo da etapa ${e.ordem}`} onChange={(ev) => mudarEtapa(e.ordem, i, { rotulo: ev.target.value })} />
                        </td>
                        <td className="py-1 pr-2">
                          <select className="input !w-auto !px-2 !py-1" value={g.marcador} aria-label={`Marcador da etapa ${e.ordem}`}
                            onChange={(ev) => mudarEtapa(e.ordem, i, { marcador: ev.target.value })}>
                            {MARCADORES.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
                          </select>
                        </td>
                        <td className="py-1 text-center">
                          <input type="checkbox" checked={g.visivel} aria-label={`Mostrar a etapa ${e.ordem}`}
                            onChange={(ev) => mudarEtapa(e.ordem, i, { visivel: ev.target.checked })} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Secao>

          <Secao titulo="Geral">
            <Input label="Título" placeholder="sem título" value={c.titulo} onChange={(e) => mudar({ titulo: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Título do eixo X" value={c.eixo_x} onChange={(e) => mudar({ eixo_x: e.target.value })} />
              <Input label="Título do eixo Y" value={c.eixo_y} onChange={(e) => mudar({ eixo_y: e.target.value })} />
              <Select label="Fonte" value={c.fonte} onChange={(e) => mudar({ fonte: e.target.value })}>
                {FONTES.map((f) => <option key={f} value={f}>{f}</option>)}
              </Select>
              <CampoNumero rotulo="Tamanho da fonte" unidade="pt" valor={c.tamanho_fonte} min={6} max={40}
                aoMudar={(v) => mudar({ tamanho_fonte: v ?? CONFIG_PADRAO.tamanho_fonte })} />
              <CampoNumero rotulo="Largura" unidade="cm" valor={c.largura_cm} min={3} max={60}
                aoMudar={(v) => mudar({ largura_cm: v ?? CONFIG_PADRAO.largura_cm })} />
              <CampoNumero rotulo="Altura" unidade="cm" valor={c.altura_cm} min={3} max={60}
                aoMudar={(v) => mudar({ altura_cm: v ?? CONFIG_PADRAO.altura_cm })} />
              <CampoNumero rotulo="Espessura da linha" unidade="pt" valor={c.espessura_linha} min={0.1} max={8}
                aoMudar={(v) => mudar({ espessura_linha: v ?? CONFIG_PADRAO.espessura_linha })} />
              <CampoNumero rotulo="Espessura do eixo" unidade="pt" valor={c.espessura_eixo} min={0.1} max={6}
                aoMudar={(v) => mudar({ espessura_eixo: v ?? CONFIG_PADRAO.espessura_eixo })} />
            </div>
            <Select label="Marcas dos eixos" value={c.ticks_para_dentro ? 'dentro' : 'fora'}
              onChange={(e) => mudar({ ticks_para_dentro: e.target.value === 'dentro' })}>
              <option value="dentro">para dentro (Origin)</option>
              <option value="fora">para fora</option>
            </Select>
            <Select label="Unidade do tempo (eixo X)" value={unidadeTempo(c, dados)}
              onChange={(e) => { const u = e.target.value as UnidadeTempo; mudar({ unidade_tempo: u, tempo_em_minutos: u === 'min' }) }}>
              <option value="s">segundos (s)</option>
              <option value="min">minutos (min)</option>
              <option value="h">horas (h) — ex.: 0,90</option>
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <CampoNumero rotulo="X mínimo" valor={c.xlim[0]} opcional aoMudar={(v) => mudar({ xlim: [v, c.xlim[1]] })} />
              <CampoNumero rotulo="X máximo" valor={c.xlim[1]} opcional aoMudar={(v) => mudar({ xlim: [c.xlim[0], v] })} />
              <CampoNumero rotulo="Y mínimo" valor={c.ylim[0]} opcional aoMudar={(v) => mudar({ ylim: [v, c.ylim[1]] })} />
              <CampoNumero rotulo="Y máximo" valor={c.ylim[1]} opcional aoMudar={(v) => mudar({ ylim: [c.ylim[0], v] })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Marcar rotulo="Tempo de cada etapa começando em zero (planilha para o Origin)" valor={c.tempo_relativo}
                aoMudar={(v) => mudar({ tempo_relativo: v })} />
              <Marcar rotulo="Mostrar trecho estável" valor={c.mostrar_janela} aoMudar={(v) => mudar({ mostrar_janela: v })} />
              <Marcar rotulo="Mostrar ΔP médio" valor={c.mostrar_media} aoMudar={(v) => mudar({ mostrar_media: v })} />
              <Marcar rotulo="Mostrar k" valor={c.mostrar_k} aoMudar={(v) => mudar({ mostrar_k: v })} />
              <Marcar rotulo="Mostrar legenda" valor={c.mostrar_legenda} aoMudar={(v) => mudar({ mostrar_legenda: v })} />
            </div>
          </Secao>
        </fieldset>

        {/* prévia */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-2 text-[12px] text-[var(--color-neutral-600)]">
            <span className="rotulo">Prévia</span>
            {gerando && <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin text-[var(--color-orange)]" /> gerando…</span>}
          </div>
          {!algumaVisivel && <Alert tipo="info" mensagem="Marque “mostrar” em pelo menos uma etapa para gerar os gráficos." />}
          {algumaVisivel && erro && <Alert tipo="erro" mensagem={erro} />}

          <Imagem url={algumaVisivel ? previa.principal : null} alt="ΔP × tempo, todas as vazões" gerando={gerando} />
          <div className="flex flex-col gap-1.5">
            <p className="rotulo m-0">ΔP × Q</p>
            <div className="w-full max-w-[65%]">
              <Imagem url={algumaVisivel ? previa.darcy : null} alt="ΔP médio × Q, com a reta pela origem e o k" gerando={gerando} />
            </div>
          </div>

          {erroBaixar && <Alert tipo="erro" mensagem={erroBaixar} onClose={() => setErroBaixar(null)} />}
          <div className="flex flex-wrap gap-2">
            {botao('png', () => baixarGrafico('png'), <Download size={13} />, 'Baixar PNG (300 dpi)')}
            {botao('svg', () => baixarGrafico('svg'), <Download size={13} />, 'Baixar SVG (editável)')}
            {botao('pdf', () => baixarGrafico('pdf'), <Download size={13} />, 'Baixar PDF')}
            {botao('origin', baixarOrigin, <FileSpreadsheet size={13} />, 'Planilha para o Origin (.xlsx)')}
            {botao('todos', baixarTodos, <FileArchive size={13} />, 'Baixar todos')}
          </div>
          <p className="m-0 text-[11px] text-[var(--color-neutral-500)]">
            PNG, SVG e PDF são do gráfico único; “Baixar todos” traz o gráfico único e o ΔP × Q nos três formatos (.zip).
          </p>
        </div>
      </div>
    </Card>
  )
}

const Secao: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <section className="flex flex-col gap-3">
    <h3 className="m-0 border-b border-[var(--color-neutral-200)] pb-1.5 text-[13px] font-semibold">{titulo}</h3>
    {children}
  </section>
)

const Marcar: React.FC<{ rotulo: string; valor: boolean; aoMudar: (v: boolean) => void }> = ({ rotulo, valor, aoMudar }) => (
  <label className="flex cursor-pointer items-center gap-2 text-[13px]">
    <input type="checkbox" checked={valor} onChange={(e) => aoMudar(e.target.checked)} /> {rotulo}
  </label>
)

const Imagem: React.FC<{ url: string | null; alt: string; gerando: boolean }> = ({ url, alt, gerando }) => (
  <div className={`flex min-h-[120px] items-center justify-center rounded-lg border border-[var(--color-neutral-200)] bg-white p-2 transition-opacity ${gerando ? 'opacity-60' : ''}`}>
    {url
      ? <img src={url} alt={alt} className="block h-auto max-w-full" />
      : <span className="text-[12px] text-[var(--color-neutral-500)]">{gerando ? 'gerando…' : 'sem prévia'}</span>}
  </div>
)

/** número que só vale ao sair do campo ou no Enter (não pede gráfico a cada tecla); opcional = vazio vira automático */
function CampoNumero(p: {
  rotulo: string; unidade?: string; valor: number | null; min?: number; max?: number; opcional?: boolean
  aoMudar: (v: number | null) => void
}) {
  const original = numeroParaInput(p.valor)
  const [texto, setTexto] = useState(original)
  useEffect(() => { setTexto(original) }, [original])
  function aplicar() {
    const n = paraNumero(texto)
    if (n == null || !Number.isFinite(n)) {
      if (p.opcional && !texto.trim()) p.aoMudar(null)
      else setTexto(original)
      return
    }
    const v = Math.min(Math.max(n, p.min ?? -Infinity), p.max ?? Infinity)
    if (v !== p.valor) p.aoMudar(v)
    setTexto(numeroParaInput(v))
  }
  return (
    <Input label={p.rotulo} unidade={p.unidade} inputMode="decimal" value={texto} placeholder={p.opcional ? 'automático' : undefined}
      onChange={(e) => setTexto(e.target.value)} onBlur={aplicar}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
  )
}
