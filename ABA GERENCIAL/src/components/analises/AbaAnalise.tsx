import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FlaskConical, Plus, Trash2, Upload, FileText,
  TrendingUp, Download, Pencil, LineChart as IconeGrafico, ClipboardList, ChevronDown, ChevronUp
} from 'lucide-react'
import { LineChartCard } from '../charts/LineChartCard'
import { Card, Button, Input, Select, Modal, Alert, Textarea } from '../UI'
import type { AnaliseConfig, CampoDef } from '../../config/analises'
import {
  listarSistemasAcidos,
  listarEnsaios, salvarEnsaio, excluirEnsaio,
  listarFilhos, salvarFilhos,
  listarCurvas, salvarCurva, apagarCurva, pontosDaCurva,
  listarArquivosAnexos, uploadArquivoStorage, obterUrlDownloadArquivo, apagarArquivoAnexo,
  type ControleDaAmostra, type CurvaResumo, type LinhaFilha,
} from '../../servicos/api'
import type { SistemaAcido, ArquivoAnexo, RegistroAnalise } from '../../tipos/banco'
import {
  acharSistemaAcido, condicoesRdaDoControle, descreverAcido, descreverCondicoes, marcasDeCoreflooding, unidadeDeConcentracao,
} from '../../utils/controleRochas'
import { lerPontos } from '../../utils/curvas'
import { fmt, fmtData, numeroParaInput, paraNumero } from '../../utils/formatacao'

/** Rótulo curto de um ensaio para os seletores de curva e de arquivo. */
function rotuloEnsaio(ens: RegistroAnalise): string {
  const partes = [`#${ens.id}`, fmtData(ens.data_ensaio)]
  if (ens.id_sistema) partes.push(String(ens.id_sistema))
  if (ens.momento) partes.push(String(ens.momento))
  return partes.join(' · ')
}

/** Marca dos valores que o banco calcula (não são digitados). */
const Fx: React.FC = () => (
  <span className="mr-1 font-heading font-bold text-[var(--color-orange-700)]" title="Calculado pelo banco">ƒ</span>
)

const eixo = (g: string, u?: string | null) => (u ? `${g} (${u})` : g)

/** Gráfico de uma curva (prévia antes de salvar e "Ver gráfico" da lista): curva única, um eixo Y. */
const GraficoCurva: React.FC<{
  pontos: { x: number; y: number }[]
  x_grandeza: string; x_unidade?: string | null; y_grandeza: string; y_unidade?: string | null
  altura?: number
}> = ({ pontos, x_grandeza, x_unidade, y_grandeza, y_unidade, altura = 240 }) => (
  <LineChartCard
    semCartao
    title=""
    data={pontos}
    xKey="x"
    height={altura}
    xLabel={eixo(x_grandeza || 'X', x_unidade)}
    yLabel={eixo(y_grandeza || 'Y', y_unidade)}
    series={[{ dataKey: 'y', label: eixo(y_grandeza || 'Y', y_unidade), color: 'var(--grafico-linha)' }]}
  />
)

const CURVA_VAZIA = { ensaioId: '', nome: '', x_grandeza: '', x_unidade: '', y_grandeza: '', y_unidade: '', pontosTexto: '' }

/**
 * Uma aba de análise dentro da ficha da amostra: lista os ensaios e, para quem é editor do
 * projeto, permite lançar/editar/excluir (com as linhas-filhas: fases, componentes, EDS),
 * importar curva e anexar arquivo.
 */
export const AbaAnalise: React.FC<{
  cfg: AnaliseConfig
  amostraId: string
  codigoAmostra: string
  podeEditar: boolean
  aoMudar?: () => void   // para a ficha atualizar os contadores das abas
  /** finalidade e status da amostra + o que veio do controle de rochas: viram sugestão quando a aba está vazia */
  amostra?: { finalidade?: string | null; status?: string | null }
  controle?: ControleDaAmostra | null
}> = ({ cfg, amostraId, codigoAmostra, podeEditar, aoMudar, amostra, controle }) => {
  const [sistemasAcidos, setSistemasAcidos] = useState<SistemaAcido[]>([])
  const [ensaios, setEnsaios] = useState<RegistroAnalise[]>([])
  const [filhos, setFilhos] = useState<LinhaFilha[]>([])
  const [curvas, setCurvas] = useState<CurvaResumo[]>([])
  const [arquivos, setArquivos] = useState<ArquivoAnexo[]>([])
  const [loading, setLoading] = useState(false)

  // Modais
  const [modalEnsaio, setModalEnsaio] = useState(false)
  const [modalCurva, setModalCurva] = useState(false)
  const [modalUpload, setModalUpload] = useState(false)

  // Formulário do Ensaio: só os campos da configuração (números como texto, para aceitar vírgula)
  const [formEnsaio, setFormEnsaio] = useState<Record<string, string | boolean>>({})
  const [formFilhos, setFormFilhos] = useState<Record<string, string>[]>([])
  const [ensaioEditandoId, setEnsaioEditandoId] = useState<number | null>(null)
  // ensaios com os detalhes abertos na lista (análises com seções)
  const [detalhesAbertos, setDetalhesAbertos] = useState<number[]>([])

  // Formulário da Curva (pontosTexto: duas colunas coladas do Excel/Origin ou lidas de um .csv/.txt)
  const [formCurva, setFormCurva] = useState(CURVA_VAZIA)

  // "Ver gráfico" de uma curva já gravada (os pontos são buscados só quando a pessoa abre)
  const [curvaAberta, setCurvaAberta] = useState<CurvaResumo | null>(null)
  const [pontosCurva, setPontosCurva] = useState<{ x: number; y: number }[] | null>(null)
  const [erroCurva, setErroCurva] = useState<string | null>(null)

  // Arquivo selecionado para upload
  const [arquivoUpload, setArquivoUpload] = useState<File | null>(null)
  const [ensaioIdUpload, setEnsaioIdUpload] = useState('')

  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  // sistemas ácidos para os campos do tipo "sistema"
  useEffect(() => {
    if (!cfg.campos.some((c) => c.tipo === 'sistema')) return
    listarSistemasAcidos().then(setSistemasAcidos).catch((err) => setFeedback({ tipo: 'erro', msg: err.message }))
  }, [cfg])

  async function carregarDadosAnalise() {
    if (!amostraId) return
    setLoading(true)
    try {
      const [ens, arqs, cvs] = await Promise.all([
        listarEnsaios(cfg, amostraId),
        listarArquivosAnexos(amostraId, cfg),
        listarCurvas(cfg, amostraId),
      ])
      setEnsaios(ens)
      setArquivos(arqs)
      setCurvas(cvs)
      setFilhos(await listarFilhos(cfg, ens.map((e) => e.id)))
    } catch (err: any) {
      setEnsaios([])
      setArquivos([])
      setCurvas([])
      setFilhos([])
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDadosAnalise()
  }, [amostraId, cfg])

  const filhaVazia = (): Record<string, string> => (cfg.filha?.chave.includes('ponto') ? { ponto: '1' } : {})

  /** preenchidos: valores sugeridos (ex.: condições do controle de rochas); a pessoa confere e grava. */
  function abrirNovoEnsaio(preenchidos: Record<string, string> = {}) {
    const inicial: Record<string, string | boolean> = {}
    cfg.campos.forEach((c) => {
      if (c.tipo === 'booleano') inicial[c.nome] = false
      else if (c.tipo === 'data') inicial[c.nome] = new Date().toISOString().split('T')[0]
      else if (c.tipo === 'lista' && c.obrigatorio) inicial[c.nome] = c.opcoes?.[0] ?? ''
      else inicial[c.nome] = c.padrao ?? ''
    })
    setFormEnsaio({ ...inicial, ...preenchidos })
    setFormFilhos(cfg.filha ? [filhaVazia()] : [])
    setEnsaioEditandoId(null)
    setFeedback(null)
    setModalEnsaio(true)
  }

  function editarEnsaio(ens: RegistroAnalise) {
    // copia só os campos digitáveis: id, datas de auditoria e colunas calculadas ficam de fora
    const form: Record<string, string | boolean> = {}
    cfg.campos.forEach((c) => {
      const v = ens[c.nome]
      if (c.tipo === 'booleano') form[c.nome] = Boolean(v)
      else if (c.tipo === 'numero') form[c.nome] = numeroParaInput(v)
      else form[c.nome] = v == null ? '' : String(v)
    })
    setFormEnsaio(form)
    setFormFilhos(cfg.filha
      ? filhos.filter((f) => f.analise_id === ens.id).map((f) => Object.fromEntries(
        cfg.filha!.campos.map((c) => [c.nome, c.tipo === 'numero' ? numeroParaInput(f[c.nome]) : String(f[c.nome] ?? '')])))
      : [])
    setEnsaioEditandoId(ens.id)
    setFeedback(null)
    setModalEnsaio(true)
  }

  /** Linhas-filhas do formulário -> colunas do banco. Linha toda em branco é ignorada. */
  function montarFilhos(): Record<string, unknown>[] {
    const filha = cfg.filha
    if (!filha) return []
    const linhas: Record<string, unknown>[] = []
    formFilhos.forEach((f, i) => {
      // "ponto" já vem preenchido com 1: sozinho não conta como linha preenchida
      if (!filha.campos.some((c) => c.nome !== 'ponto' && (f[c.nome] ?? '').trim())) return
      const linha: Record<string, unknown> = {}
      for (const c of filha.campos) {
        const bruto = (f[c.nome] ?? '').trim()
        const onde = `${filha.titulo}, linha ${i + 1}, campo "${c.rotulo}"`
        if (c.tipo === 'numero') {
          const n = paraNumero(bruto)
          if (Number.isNaN(n)) throw new Error(`${onde}: "${bruto}" não é um número. Use vírgula ou ponto decimal, ex.: 95,5.`)
          if (n != null && c.unidade === '%' && (n < 0 || n > 100)) throw new Error(`${onde}: ${bruto} está fora de 0 a 100 %.`)
          linha[c.nome] = n
        } else {
          if (c.obrigatorio && !bruto) throw new Error(`${onde}: preencha o campo ou apague a linha.`)
          linha[c.nome] = bruto || null
        }
      }
      linhas.push(linha)
    })
    return linhas
  }

  async function handleSalvarEnsaio(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      const linhasFilhas = montarFilhos()   // confere antes de gravar o ensaio
      const gravado = await salvarEnsaio(cfg, amostraId, formEnsaio, ensaioEditandoId ?? undefined)
      setModalEnsaio(false)
      // mostra o que o banco calculou a partir do que foi digitado
      const calculados = (cfg.calculados ?? [])
        .map((c) => `${c.rotulo} = ${fmt(gravado[c.nome], c.casas, c.cientifico)}${c.unidade ? ` ${c.unidade}` : ''}`)
        .join(' · ')
      let msg = `Ensaio de ${cfg.titulo} gravado (registro #${gravado.id}).` + (calculados ? ` ƒ calculado pelo banco: ${calculados}.` : '')
      let tipo: 'sucesso' | 'erro' = 'sucesso'
      if (cfg.filha) {
        try {
          await salvarFilhos(cfg, gravado.id, linhasFilhas)
          msg += ` ${cfg.filha.titulo}: ${linhasFilhas.length} linha(s).`
        } catch (err: any) {
          tipo = 'erro'
          msg = err.message
        }
      }
      setFeedback({ tipo, msg })
      await carregarDadosAnalise()
      aoMudar?.()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluirEnsaio(id: number) {
    if (!confirm('Deseja realmente excluir este ensaio?')) return
    try {
      await excluirEnsaio(cfg, id)
      setFeedback({ tipo: 'sucesso', msg: 'Ensaio excluído.' })
      await carregarDadosAnalise()
      aoMudar?.()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    }
  }

  function abrirModalCurva() {
    const padrao = cfg.curvas?.[0]
    setFormCurva({ ...CURVA_VAZIA, ...padrao, ensaioId: ensaios.length === 1 ? String(ensaios[0].id) : '' })
    setFeedback(null)
    setModalCurva(true)
  }

  function abrirModalUpload() {
    setEnsaioIdUpload('')
    setArquivoUpload(null)
    setFeedback(null)
    setModalUpload(true)
  }

  const pontosLidos = useMemo(() => {
    const lidos = lerPontos(formCurva.pontosTexto)
    // faixa de X e de Y para a prévia (sem Math.min(...): curvas têm milhares de pontos)
    const faixa = { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity }
    for (const p of lidos.pontos) {
      if (p.x < faixa.xMin) faixa.xMin = p.x
      if (p.x > faixa.xMax) faixa.xMax = p.x
      if (p.y < faixa.yMin) faixa.yMin = p.y
      if (p.y > faixa.yMax) faixa.yMax = p.y
    }
    return { ...lidos, faixa }
  }, [formCurva.pontosTexto])

  async function lerArquivoDePontos(arquivo?: File | null) {
    if (!arquivo) return
    try {
      const texto = await arquivo.text()
      setFormCurva((f) => ({ ...f, pontosTexto: texto }))
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: `Não consegui ler "${arquivo.name}": ${err.message}. Use um .csv ou .txt de texto.` })
    }
  }

  async function handleSalvarCurva(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      if (!formCurva.ensaioId) {
        throw new Error('Escolha o ensaio ao qual a curva pertence. Se ainda não há ensaio, cadastre-o antes em "Novo Ensaio".')
      }
      const { pontos } = pontosLidos
      if (pontos.length === 0) {
        throw new Error('Nenhum ponto numérico válido (x, y) foi identificado. Cole duas colunas separadas por tabulação, espaço ou ponto e vírgula, ou escolha um arquivo .csv/.txt.')
      }

      await salvarCurva({
        amostra_id: amostraId,
        analise_tabela: cfg.tabela,
        analise_id: Number(formCurva.ensaioId),
        nome: formCurva.nome,
        x_grandeza: formCurva.x_grandeza,
        x_unidade: formCurva.x_unidade || null,
        y_grandeza: formCurva.y_grandeza,
        y_unidade: formCurva.y_unidade || null
      }, pontos)

      setFeedback({ tipo: 'sucesso', msg: `Curva "${formCurva.nome}" gravada com ${pontos.length} pontos. Ela aparece no gráfico da ficha no dashboard.` })
      setModalCurva(false)
      setFormCurva(CURVA_VAZIA)
      await carregarDadosAnalise()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setSalvando(false)
    }
  }

  async function verGrafico(c: CurvaResumo) {
    setCurvaAberta(c)
    setPontosCurva(null)
    setErroCurva(null)
    try {
      setPontosCurva(await pontosDaCurva(c.id))
    } catch (err: any) {
      setErroCurva(`Não consegui buscar os pontos da curva "${c.nome}": ${err.message}`)
    }
  }

  async function handleApagarCurva(c: CurvaResumo) {
    if (!confirm(`Apagar a curva "${c.nome}" e todos os pontos dela?`)) return
    try {
      await apagarCurva(c.id)
      setFeedback({ tipo: 'sucesso', msg: `Curva "${c.nome}" apagada.` })
      await carregarDadosAnalise()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    }
  }

  async function handleUploadArquivo(e: React.FormEvent) {
    e.preventDefault()
    if (!arquivoUpload || !amostraId) return
    setSalvando(true)
    try {
      await uploadArquivoStorage(
        amostraId,
        cfg,
        arquivoUpload,
        ensaioIdUpload ? Number(ensaioIdUpload) : undefined
      )
      setFeedback({ tipo: 'sucesso', msg: `Arquivo "${arquivoUpload.name}" enviado com sucesso ao Storage!` })
      setModalUpload(false)
      setArquivoUpload(null)
      await carregarDadosAnalise()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setSalvando(false)
    }
  }

  async function handleApagarArquivo(arq: ArquivoAnexo) {
    if (!confirm(`Apagar o arquivo "${arq.nome_original}"?`)) return
    try {
      await apagarArquivoAnexo(arq)
      setFeedback({ tipo: 'sucesso', msg: `Arquivo "${arq.nome_original}" apagado.` })
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    }
    await carregarDadosAnalise()
  }

  async function baixarArquivo(caminho: string) {
    try {
      const url = await obterUrlDownloadArquivo(caminho)
      window.open(url, '_blank')
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    }
  }

  // o aviso da página fica atrás do modal aberto: repete a mensagem dentro dele
  const avisoNoModal = feedback && (
    <Alert tipo={feedback.tipo} mensagem={feedback.msg} onClose={() => setFeedback(null)} />
  )

  const seletorEnsaio = (valor: string, aoMudar: (v: string) => void, obrigatorio: boolean) => (
    <Select
      label="Ensaio ao qual pertence"
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      obrigatorio={obrigatorio}
      required={obrigatorio}
    >
      <option value="">{obrigatorio ? 'Selecione o ensaio...' : 'Nenhum (arquivo geral da análise)'}</option>
      {ensaios.map((ens) => (
        <option key={ens.id} value={ens.id}>{rotuloEnsaio(ens)}</option>
      ))}
    </Select>
  )

  /** "Calcita 95 % · Dolomita 5 %": resumo das linhas-filhas de um ensaio. */
  function resumoFilhos(ensaioId: number): string {
    const filha = cfg.filha
    if (!filha) return ''
    const valores = filha.campos.filter((c) => c.tipo === 'numero')
    return filhos.filter((f) => f.analise_id === ensaioId).map((f) => {
      const nome = filha.chave.map((k) => (k === 'ponto' ? `P${f[k]}` : String(f[k]))).join(' ')
      const nums = valores.filter((c) => f[c.nome] != null).map((c) => `${fmt(f[c.nome], 2)} ${c.unidade === '%' && c.rotulo.startsWith('%') ? c.rotulo : c.unidade ?? ''}`.trim())
      return [nome, nums.join(' / ')].filter(Boolean).join(' ')
    }).join(' · ')
  }

  // Aba vazia: o que o controle de rochas já diz sobre este ensaio (só sugestão; nada é gravado sozinho)
  const condicoesRda = cfg.chave === 'rda' ? condicoesRdaDoControle(controle?.observacoes) : null
  const sistemaSugerido = condicoesRda ? acharSistemaAcido(sistemasAcidos, condicoesRda) : null
  const marcasCoreflooding = cfg.chave === 'coreflooding' && amostra ? marcasDeCoreflooding(amostra, controle?.observacoes) : null
  const linkNovoSistema = condicoesRda?.acido
    ? `/administracao?${new URLSearchParams({
      aba: 'catalogos', acido: condicoesRda.acido,
      valor: condicoesRda.concentracao != null ? String(condicoesRda.concentracao) : '',
      unidade: unidadeDeConcentracao(condicoesRda.unidade),
    })}`
    : null

  // campos do formulário (menos os de texto longo, que ficam embaixo) agrupados por seção
  const camposCurtos = cfg.campos.filter((c) => c.tipo !== 'textoLongo')
  const grupos: { titulo: string | null; campos: CampoDef[] }[] = cfg.secoes
    ? [
      ...cfg.secoes.map((s) => ({ titulo: s, campos: camposCurtos.filter((c) => c.secao === s) })),
      { titulo: 'Outros', campos: camposCurtos.filter((c) => !c.secao || !cfg.secoes!.includes(c.secao)) },
    ].filter((g) => g.campos.length > 0)
    : [{ titulo: null, campos: camposCurtos }]
  const camposPrincipais: CampoDef[] = cfg.principais
    ? cfg.principais.flatMap((n) => cfg.campos.find((c) => c.nome === n) ?? [])
    : cfg.campos.filter((c) => !['data_ensaio', 'momento', 'responsavel', 'observacoes'].includes(c.nome)).slice(0, 4)
  const valorDoCampo = (c: CampoDef, v: unknown) =>
    `${c.tipo === 'numero' ? fmt(v, 4) : c.tipo === 'booleano' ? fmt(v) : String(v)} ${c.unidade || ''}`.trim()

  const somaPct = formFilhos.reduce((s, f) => { const n = paraNumero(f.pct ?? ''); return s + (n != null && !Number.isNaN(n) ? n : 0) }, 0)
  const temPct = Boolean(cfg.filha?.campos.some((c) => c.nome === 'pct')) && formFilhos.some((f) => (f.pct ?? '').trim())
  const nomeDoEnsaio = (id: number) => { const e = ensaios.find((x) => x.id === id); return e ? rotuloEnsaio(e) : `#${id}` }

  return (
    <div className="space-y-6 animate-fade-in">
      {feedback && (
        <Alert
          tipo={feedback.tipo}
          mensagem={feedback.msg}
          onClose={() => setFeedback(null)}
        />
      )}

      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[20px] font-bold text-[var(--color-blue-800)] flex items-center gap-2">
              <span>{cfg.numero}. {cfg.titulo}</span>
              <span className="text-[12px] font-sans font-normal text-[var(--color-neutral-500)]">({cfg.tabela})</span>
            </h3>
            <p className="text-xs text-[var(--color-neutral-600)] mt-0.5">
              Registros experimentais vinculados à amostra <span className="codigo">{codigoAmostra}</span>
            </p>
          </div>
          {podeEditar && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={<Upload size={14} />}
              onClick={abrirModalUpload}
            >
              Anexar Arquivo
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<TrendingUp size={14} />}
              onClick={abrirModalCurva}
            >
              Importar Curva
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => abrirNovoEnsaio()}
            >
              Novo Ensaio
            </Button>
          </div>
          )}
        </div>

        {/* Tabela de Ensaios Cadastrados */}
        <Card>
          {loading ? (
            <p className="py-6 text-center text-[13px] text-[var(--color-neutral-500)]">Carregando ensaios...</p>
          ) : ensaios.length === 0 && condicoesRda ? (
            <div className="aviso aviso-info flex flex-col gap-3">
              <p className="m-0 flex items-start gap-2">
                <ClipboardList size={16} className="mt-0.5 shrink-0" />
                <span>
                  Segundo o controle de rochas: <strong>{descreverCondicoes(condicoesRda)}</strong>. A taxa de reação ainda não foi lançada.
                </span>
              </p>
              {podeEditar && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="primary"
                    icon={<Plus size={14} />}
                    onClick={() => abrirNovoEnsaio({
                      data_ensaio: '',
                      rotacao_rpm: numeroParaInput(condicoesRda.rotacao_rpm),
                      temperatura_c: numeroParaInput(condicoesRda.temperatura_c),
                      id_sistema: sistemaSugerido?.id_sistema ?? '',
                    })}
                  >
                    Lançar RDA com estas condições
                  </Button>
                  {sistemaSugerido ? (
                    <span className="text-[12px]">Sistema ácido do catálogo: <strong>{sistemaSugerido.id_sistema} — {sistemaSugerido.nome_sistema}</strong></span>
                  ) : linkNovoSistema && (
                    <span className="text-[12px]">
                      Nenhum sistema ácido do catálogo bate com {descreverAcido(condicoesRda)}.{' '}
                      <Link to={linkNovoSistema} className="font-semibold underline">Cadastrar sistema ácido {descreverAcido(condicoesRda)}</Link>
                    </span>
                  )}
                </div>
              )}
              <p className="m-0 text-[11px]">
                Texto da planilha: “{condicoesRda.texto}”. Nada é gravado sozinho: confira as condições, preencha a taxa e grave.
              </p>
            </div>
          ) : ensaios.length === 0 && marcasCoreflooding ? (
            <div className="aviso aviso-info flex flex-col gap-3">
              <p className="m-0 flex items-start gap-2">
                <ClipboardList size={16} className="mt-0.5 shrink-0" />
                <span>
                  Amostra marcada como <strong>{marcasCoreflooding}</strong> no controle de rochas; os resultados de coreflooding ainda não foram lançados.
                  {controle?.temPetrofisicaDepois && ' Há petrofísica depois da acidificação (aba 1. Petrofísica).'}
                </span>
              </p>
              {podeEditar && (
                <div>
                  <Button variant="primary" icon={<Plus size={14} />} onClick={() => abrirNovoEnsaio({ data_ensaio: '' })}>
                    Lançar coreflooding
                  </Button>
                </div>
              )}
            </div>
          ) : ensaios.length === 0 ? (
            <div className="py-10 text-center">
              <FlaskConical size={32} className="mx-auto text-[var(--color-neutral-500)] mb-2" />
              <p className="text-xs font-semibold text-[var(--color-neutral-700)]">Nenhum ensaio lançado para {cfg.titulo}</p>
              {podeEditar && (
                <p className="text-[11px] text-[var(--color-neutral-500)] mt-0.5">Clique em "Novo Ensaio" para preencher os parâmetros.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table text-[13px]">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Parâmetros Principais</th>
                    <th>Cálculos do Banco</th>
                    <th>Responsável</th>
                    {podeEditar && <th className="text-right !pr-0">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {ensaios.map((ens) => (
                    <tr key={ens.id} className="lcp-row">
                      <td className="tabular-nums text-[var(--color-neutral-700)]">
                        {fmtData(ens.data_ensaio)}
                        <span className="block text-[10px] text-[var(--color-neutral-500)]">#{ens.id}</span>
                        {Boolean(ens.momento) && (
                          <span className="block text-[10px] text-[var(--color-neutral-500)]">
                            Momento: {String(ens.momento)}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="space-y-0.5">
                          {camposPrincipais.map((c) => (
                              <div key={c.nome} className="text-[var(--color-neutral-700)]">
                                <span className="text-[var(--color-neutral-500)]">{c.rotulo}:</span>{' '}
                                <span className="tabular-nums font-medium text-[var(--color-text)]">
                                  {ens[c.nome] == null ? '—' : valorDoCampo(c, ens[c.nome])}
                                </span>
                              </div>
                            ))}
                          {cfg.filha && (
                            <div className="text-[var(--color-neutral-700)]">
                              <span className="text-[var(--color-neutral-500)]">{cfg.filha.titulo}:</span>{' '}
                              <span className="tabular-nums font-medium text-[var(--color-text)]">{resumoFilhos(ens.id) || '—'}</span>
                            </div>
                          )}
                          {cfg.secoes && (
                            <button type="button" className="btn btn-secondary btn-sm mt-1.5" aria-expanded={detalhesAbertos.includes(ens.id)}
                              onClick={() => setDetalhesAbertos((ids) => (ids.includes(ens.id) ? ids.filter((i) => i !== ens.id) : [...ids, ens.id]))}>
                              {detalhesAbertos.includes(ens.id) ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              {detalhesAbertos.includes(ens.id) ? 'Ocultar detalhes' : 'Ver todos os campos'}
                            </button>
                          )}
                          {cfg.secoes && detalhesAbertos.includes(ens.id) && (
                            <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-3 border-t border-[var(--color-neutral-300)] pt-3 lg:grid-cols-2">
                              {grupos.map((g) => {
                                const preenchidos = g.campos.filter((c) => ens[c.nome] != null && ens[c.nome] !== '')
                                return (
                                  <div key={g.titulo}>
                                    <p className="rotulo m-0 mb-1 !text-[var(--color-blue-800)]">{g.titulo}</p>
                                    {preenchidos.length === 0 ? (
                                      <p className="m-0 text-[12px] text-[var(--color-neutral-500)]">Nada preenchido.</p>
                                    ) : preenchidos.map((c) => (
                                      <div key={c.nome} className="text-[12px] text-[var(--color-neutral-700)]">
                                        <span className="text-[var(--color-neutral-500)]">{c.rotulo}:</span>{' '}
                                        <span className="tabular-nums font-medium text-[var(--color-text)]">
                                          {c.tipo === 'data' ? fmtData(ens[c.nome]) : valorDoCampo(c, ens[c.nome])}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )
                              })}
                              {Boolean(ens.observacoes) && (
                                <div className="lg:col-span-2 text-[12px] text-[var(--color-neutral-700)]">
                                  <span className="text-[var(--color-neutral-500)]">Observações:</span> {String(ens.observacoes)}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        {cfg.calculados && cfg.calculados.length > 0 ? (
                          <div className="space-y-0.5">
                            {cfg.calculados.map((calc) => (
                              <div key={calc.nome} className="numero text-[13px]" title="Calculado pelo banco">
                                <Fx />
                                <span className="text-[var(--color-neutral-500)]">{calc.rotulo}:</span>{' '}
                                <span>{fmt(ens[calc.nome], calc.casas, calc.cientifico)} {calc.unidade || ''}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[var(--color-neutral-500)] text-[11px]">—</span>
                        )}
                      </td>
                      <td className="text-[var(--color-neutral-600)]">
                        {ens.responsavel ? String(ens.responsavel) : '—'}
                      </td>
                      {podeEditar && (
                      <td className="text-right !pr-0">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => editarEnsaio(ens)}
                            className="btn-icone"
                            title="Editar Ensaio"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => handleExcluirEnsaio(ens.id)}
                            className="btn-icone perigo"
                            title="Excluir Ensaio"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Curvas importadas */}
        <Card
          titulo={`Curvas importadas (${curvas.length})`}
          subtitulo="Séries numéricas (x, y) de cada ensaio · o gráfico aparece na ficha da amostra no dashboard"
          icone={<TrendingUp size={18} />}
        >
          {curvas.length === 0 ? (
            <p className="py-3 text-center text-[13px] text-[var(--color-neutral-500)]">Nenhuma curva importada para esta análise.</p>
          ) : (
            <div className="overflow-x-auto -my-2">
              <table className="table text-[13px]">
                <thead>
                  <tr>
                    <th>Curva</th><th>Ensaio</th><th>Eixo X</th><th>Eixo Y</th><th className="text-right">Pontos</th>
                    <th className="text-right !pr-0">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {curvas.map((c) => (
                    <tr key={c.id} className="lcp-row">
                      <td className="font-semibold">{c.nome}</td>
                      <td className="tabular-nums text-[var(--color-neutral-700)]">{nomeDoEnsaio(c.analise_id)}</td>
                      <td>{eixo(c.x_grandeza, c.x_unidade)}</td>
                      <td>{eixo(c.y_grandeza, c.y_unidade)}</td>
                      <td className="text-right"><span className="numero">{c.n_pontos ?? '—'}</span></td>
                      <td className="text-right !pr-0">
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => verGrafico(c)} className="btn btn-secondary btn-sm">
                            <IconeGrafico size={13} /> Ver gráfico
                          </button>
                          {podeEditar && (
                            <button onClick={() => handleApagarCurva(c)} className="btn-icone perigo" title="Apagar curva">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Arquivos Anexados no Supabase Storage */}
        <Card
          titulo={`Arquivos Anexados no Storage (${arquivos.length})`}
          subtitulo={`Bucket privado "arquivos" · Pasta amostras/${codigoAmostra}/${cfg.pastaArquivos}/`}
          icone={<FileText size={18} />}
        >
          {arquivos.length === 0 ? (
            <p className="py-3 text-center text-[13px] text-[var(--color-neutral-500)]">Nenhum arquivo enviado para esta análise.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {arquivos.map((arq) => (
                <div
                  key={arq.id}
                  className="p-3 rounded-xl bg-[var(--color-neutral-50)] border border-[var(--color-neutral-300)] flex items-center justify-between"
                >
                  <div className="truncate mr-2">
                    <p className="text-xs font-semibold text-[var(--color-text)] truncate">{arq.nome_original}</p>
                    <p className="text-[10px] text-[var(--color-neutral-500)] tabular-nums">
                      {arq.tamanho_bytes ? `${fmt(arq.tamanho_bytes / 1024, 1)} KB` : ''}
                      {arq.analise_id != null && ` · ensaio #${arq.analise_id}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => baixarArquivo(arq.caminho)}
                      className="btn-icone"
                      title="Baixar arquivo seguro"
                    >
                      <Download size={14} />
                    </button>
                    {podeEditar && (
                      <button onClick={() => handleApagarArquivo(arq)} className="btn-icone perigo" title="Apagar arquivo">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Modal Novo/Editar Ensaio */}
      <Modal
        isOpen={modalEnsaio}
        onClose={() => setModalEnsaio(false)}
        titulo={`${ensaioEditandoId ? `Editar ensaio #${ensaioEditandoId}` : 'Novo ensaio'} — ${cfg.titulo}`}
        subtitulo={`Amostra ${codigoAmostra}`}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSalvarEnsaio} className="space-y-4">
          {avisoNoModal}
          {grupos.map((g) => (
          <fieldset key={g.titulo ?? 'campos'} className={`m-0 min-w-0 border-0 p-0 ${g.titulo ? 'border-t border-[var(--color-neutral-300)] pt-3 first:border-t-0 first:pt-0' : ''}`}>
          {g.titulo && <legend className="rotulo float-left mb-2 w-full p-0 !text-[var(--color-blue-800)]">{g.titulo}</legend>}
          <div className="clear-both grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {g.campos.map((campo) => {
              const valor = formEnsaio[campo.nome]
              const mudar = (v: string | boolean) => setFormEnsaio({ ...formEnsaio, [campo.nome]: v })

              if (campo.tipo === 'lista') {
                return (
                  <Select
                    key={campo.nome}
                    label={campo.rotulo}
                    value={String(valor ?? '')}
                    onChange={(e) => mudar(e.target.value)}
                    obrigatorio={campo.obrigatorio}
                    required={campo.obrigatorio}
                  >
                    {!campo.obrigatorio && <option value="">Selecione...</option>}
                    {campo.opcoes?.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </Select>
                )
              }
              if (campo.tipo === 'sistema') {
                return (
                  <Select
                    key={campo.nome}
                    label={campo.rotulo}
                    value={String(valor ?? '')}
                    onChange={(e) => mudar(e.target.value)}
                    obrigatorio={campo.obrigatorio}
                    required={campo.obrigatorio}
                  >
                    <option value="">Selecione a formulação...</option>
                    {sistemasAcidos.map((sis) => (
                      <option key={sis.id_sistema} value={sis.id_sistema}>
                        {sis.id_sistema} — {sis.nome_sistema}
                        {sis.conc_pct != null ? ` (${fmt(sis.conc_pct)} wt%)` : ''}
                      </option>
                    ))}
                  </Select>
                )
              }
              if (campo.tipo === 'booleano') {
                return (
                  <div key={campo.nome} className="flex flex-col justify-center gap-1.5 pt-4">
                    <label className="flex items-center gap-2 cursor-pointer text-[13px] font-semibold text-[var(--color-neutral-700)]">
                      <input
                        type="checkbox"
                        checked={Boolean(valor)}
                        onChange={(e) => mudar(e.target.checked)}
                        className="w-4 h-4 accent-[var(--color-blue)]"
                      />
                      <span>{campo.rotulo}</span>
                    </label>
                  </div>
                )
              }
              if (campo.tipo === 'textoLongo') {
                return null // Renderizado abaixo
              }
              return (
                <Input
                  key={campo.nome}
                  label={campo.rotulo}
                  unidade={campo.unidade}
                  type={campo.tipo === 'data' ? 'date' : 'text'}
                  inputMode={campo.tipo === 'numero' ? 'decimal' : undefined}
                  placeholder={campo.tipo === 'numero' ? 'ex.: 0,5 ou 5,2e-7' : undefined}
                  value={String(valor ?? '')}
                  onChange={(e) => mudar(e.target.value)}
                  obrigatorio={campo.obrigatorio}
                  required={campo.obrigatorio}
                  ajuda={campo.ajuda}
                />
              )
            })}
          </div>
          </fieldset>
          ))}

          {/* Campos de texto longo: cada um grava na sua própria coluna */}
          {cfg.campos.filter((c) => c.tipo === 'textoLongo').map((campo) => (
            <div key={campo.nome} className="pt-2">
              <Textarea
                label={campo.rotulo}
                value={String(formEnsaio[campo.nome] ?? '')}
                onChange={(e) => setFormEnsaio({ ...formEnsaio, [campo.nome]: e.target.value })}
              />
            </div>
          ))}

          {/* Linhas-filhas: fases minerais (DRX), composição (petrografia), EDS (MEV) */}
          {cfg.filha && (
            <div className="flex flex-col gap-3 rounded-[10px] border border-[var(--color-blue-200)] bg-[var(--color-blue-50)] p-4">
              <div className="flex items-center justify-between">
                <span className="rotulo !text-[var(--color-blue-800)]">{cfg.filha.titulo}</span>
                {temPct && (
                  <span className={`text-[12px] font-semibold tabular-nums ${Math.abs(somaPct - 100) > 1 ? 'text-[var(--color-orange-700)]' : 'text-[var(--color-blue-700)]'}`}>
                    Soma: {fmt(somaPct, 2)} %
                  </span>
                )}
              </div>
              {formFilhos.map((f, i) => (
                <div key={i} className="flex flex-wrap items-end gap-3">
                  {cfg.filha!.campos.map((c: CampoDef) => (
                    <div key={c.nome} className="w-36">
                      <Input
                        label={c.rotulo}
                        unidade={c.rotulo.startsWith('%') ? undefined : c.unidade}
                        inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
                        value={f[c.nome] ?? ''}
                        onChange={(e) => setFormFilhos((fs) => fs.map((x, j) => (j === i ? { ...x, [c.nome]: e.target.value } : x)))}
                      />
                    </div>
                  ))}
                  <button type="button" title="Remover linha" className="btn-icone perigo mb-1.5"
                    onClick={() => setFormFilhos((fs) => fs.filter((_, j) => j !== i))}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div>
                <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => setFormFilhos((fs) => [...fs, filhaVazia()])}>
                  Adicionar linha
                </Button>
              </div>
            </div>
          )}

          {cfg.calculados && cfg.calculados.length > 0 && (
            <p className="text-[11px] text-[var(--color-neutral-500)]">
              <Fx />Calculado pelo banco ao gravar (não é digitado): {cfg.calculados.map((c) => c.rotulo).join(', ')}.
            </p>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-neutral-300)]">
            <Button variant="secondary" onClick={() => setModalEnsaio(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={salvando}>Gravar Ensaio</Button>
          </div>
        </form>
      </Modal>

      {/* Modal Importar Curva */}
      <Modal
        isOpen={modalCurva}
        onClose={() => setModalCurva(false)}
        titulo={`Importar Curva Numérica — ${cfg.titulo}`}
        subtitulo="Cole duas colunas (X, Y) do Excel/Origin ou escolha um arquivo .csv/.txt"
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSalvarCurva} className="space-y-4">
          {avisoNoModal}
          {seletorEnsaio(formCurva.ensaioId, (v) => setFormCurva({ ...formCurva, ensaioId: v }), true)}

          {cfg.curvas && cfg.curvas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rotulo">Curva típica:</span>
              {cfg.curvas.map((c) => (
                <button key={c.nome} type="button" onClick={() => setFormCurva((f) => ({ ...f, ...c }))}
                  className={`tag cursor-pointer ${formCurva.nome === c.nome ? 'tag-orange' : 'tag-neutral'}`}>
                  {c.nome}
                </button>
              ))}
            </div>
          )}

          <Input
            label="Nome da Curva"
            placeholder="Ex.: Curva ΔP x PV, Difratograma Completo, Perda de Massa x Tempo"
            value={formCurva.nome}
            onChange={(e) => setFormCurva({ ...formCurva, nome: e.target.value })}
            obrigatorio
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Eixo X (Grandeza)"
              placeholder="Ex.: Pore Volume, 2Theta, Tempo"
              value={formCurva.x_grandeza}
              onChange={(e) => setFormCurva({ ...formCurva, x_grandeza: e.target.value })}
              obrigatorio
              required
            />
            <Input
              label="Unidade Eixo X"
              placeholder="Ex.: PV, graus, min, s"
              value={formCurva.x_unidade}
              onChange={(e) => setFormCurva({ ...formCurva, x_unidade: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Eixo Y (Grandeza)"
              placeholder="Ex.: Pressão Diferencial, Intensidade, Massa"
              value={formCurva.y_grandeza}
              onChange={(e) => setFormCurva({ ...formCurva, y_grandeza: e.target.value })}
              obrigatorio
              required
            />
            <Input
              label="Unidade Eixo Y"
              placeholder="Ex.: psi, contagens, g"
              value={formCurva.y_unidade}
              onChange={(e) => setFormCurva({ ...formCurva, y_unidade: e.target.value })}
            />
          </div>

          <div className="field">
            <span className="rotulo">Pontos numéricos: cole duas colunas (X e Y) ou escolha um arquivo *</span>
            <input
              type="file"
              accept=".csv,.txt,.dat,text/plain,text/csv"
              onChange={(e) => { lerArquivoDePontos(e.target.files?.[0]); e.target.value = '' }}
              className="input cursor-pointer file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-blue)] file:px-3 file:py-1 file:text-[12px] file:font-semibold file:text-white"
            />
            <textarea
              rows={6}
              value={formCurva.pontosTexto}
              onChange={(e) => setFormCurva({ ...formCurva, pontosTexto: e.target.value })}
              placeholder={"0,1\t12,5\n0,2\t14,8\n0,3\t18,2\n..."}
              className="input font-mono !text-[13px]"
            />
            <span className="ajuda">
              Colunas separadas por tabulação, ponto e vírgula ou espaço; decimal com vírgula ou ponto; aceita 5,2e-7.
              {formCurva.pontosTexto.trim() && (
                <strong className="ml-1 text-[var(--color-blue-800)]">
                  {pontosLidos.pontos.length} ponto(s) lido(s)
                  {pontosLidos.puladas > 0 && ` · ${pontosLidos.puladas} linha(s) sem número pulada(s) (cabeçalho?)`}
                </strong>
              )}
            </span>
          </div>

          {/* prévia: confere coluna e unidade antes de gravar */}
          {pontosLidos.pontos.length > 0 && (
            <div className="rounded-[10px] border border-[var(--color-neutral-300)] p-4">
              <p className="rotulo m-0 mb-2">
                Prévia do gráfico · <span className="numero">{pontosLidos.pontos.length}</span> ponto(s) lido(s)
                {pontosLidos.pontos.length > 5000 && ' · exibindo uma parte (todos serão gravados)'}
              </p>
              <GraficoCurva pontos={pontosLidos.pontos} altura={220}
                x_grandeza={formCurva.x_grandeza} x_unidade={formCurva.x_unidade}
                y_grandeza={formCurva.y_grandeza} y_unidade={formCurva.y_unidade} />
              <p className="m-0 mt-2 text-[11px] text-[var(--color-neutral-600)]">
                X de {fmt(pontosLidos.faixa.xMin, 4)} a {fmt(pontosLidos.faixa.xMax, 4)} ·
                Y de {fmt(pontosLidos.faixa.yMin, 4)} a {fmt(pontosLidos.faixa.yMax, 4)}.
                Se o desenho ou a faixa não fazem sentido, confira a ordem das colunas e a unidade antes de gravar.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-neutral-300)]">
            <Button variant="secondary" onClick={() => setModalCurva(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={salvando}>Gravar Curva</Button>
          </div>
        </form>
      </Modal>

      {/* Modal Ver gráfico de uma curva gravada */}
      <Modal
        isOpen={curvaAberta != null}
        onClose={() => setCurvaAberta(null)}
        titulo={curvaAberta?.nome ?? ''}
        subtitulo={curvaAberta ? `Ensaio ${nomeDoEnsaio(curvaAberta.analise_id)}${pontosCurva ? ` · ${pontosCurva.length} pontos` : ''}` : undefined}
        maxWidth="max-w-3xl"
      >
        {erroCurva ? (
          <Alert tipo="erro" mensagem={erroCurva} />
        ) : !pontosCurva ? (
          <p className="py-10 text-center text-[13px] text-[var(--color-neutral-500)]">Carregando pontos…</p>
        ) : pontosCurva.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-[var(--color-neutral-500)]">Esta curva não tem pontos gravados.</p>
        ) : curvaAberta && (
          <GraficoCurva pontos={pontosCurva} altura={340}
            x_grandeza={curvaAberta.x_grandeza} x_unidade={curvaAberta.x_unidade}
            y_grandeza={curvaAberta.y_grandeza} y_unidade={curvaAberta.y_unidade} />
        )}
      </Modal>

      {/* Modal Upload Arquivo Storage */}
      <Modal
        isOpen={modalUpload}
        onClose={() => setModalUpload(false)}
        titulo={`Upload de Arquivo no Storage — ${cfg.titulo}`}
        subtitulo="Envio seguro para o bucket privado do Supabase"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleUploadArquivo} className="space-y-4">
          {avisoNoModal}
          <div>
            <label className="rotulo">
              Selecione o Arquivo (.pdf, .opju, .tif, .raw, .csv) *
            </label>
            <input
              type="file"
              onChange={(e) => setArquivoUpload(e.target.files?.[0] || null)}
              required
              className="input cursor-pointer file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-blue)] file:px-3 file:py-1 file:text-[12px] file:font-semibold file:text-white"
            />
          </div>

          {seletorEnsaio(ensaioIdUpload, setEnsaioIdUpload, false)}

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-neutral-300)]">
            <Button variant="secondary" onClick={() => setModalUpload(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={salvando}>Enviar Arquivo</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
