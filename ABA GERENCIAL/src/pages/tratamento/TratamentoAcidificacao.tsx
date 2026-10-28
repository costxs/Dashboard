import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlertTriangle, CheckCircle2, Download, ExternalLink, FileSpreadsheet, Info, Loader2, Plus, RotateCcw, Save,
} from 'lucide-react'
import { Alert, Card, Input, Select } from '../../components/UI'
import { usePodeEditar } from '../../hooks/usePapel'
import { lerArquivoBruto } from '../../importador/lerArquivo'
import type { FonteDpDCI } from '../../importador/lerDCI'
import { lerEnsaiosEquipamento } from '../../importador/lerEnsaioEquipamento'
import {
  gravarAcidificacao, sugerirPapeis, tratarAcidificacao,
  type CriterioBt, type Equipamento, type FaseEscolhida, type PapelFase,
} from '../../importador/tratamentoAcidificacao'
import type { Ensaio } from '../../importador/tratamentoPermeabilidade'
import { supabase } from '../../lib/supabase'
import { listarAmostras, listarSistemasAcidos, type AmostraResumo } from '../../servicos/api'
import { baixarArquivo, pedirPlanilhaAcidificacao, URL_GRAFICOS, type PedidoAcid } from '../../servicos/graficos'
import { useContexto } from '../../store/useContexto'
import type { SistemaAcido } from '../../tipos/banco'
import { fmt, mensagemErro, numeroParaInput, paraNumero } from '../../utils/formatacao'
import { AreaArquivo } from '../importador/comum'
import { CadastroRapidoAmostra } from './CadastroRapidoAmostra'
import { GraficosOriginAcid } from './GraficosOriginAcid'

// Tratamento de acidificação: o arquivo do equipamento vira fases (garrafa + vazão), breakthrough e PVbt.
// De cima para baixo: arquivo -> amostra e volume poroso -> fases -> breakthrough -> gráficos -> resultado -> gravar.
// As contas estão em src/importador/tratamentoAcidificacao.ts (cópia de docs/referencia/importador);
// aqui só se montam as opções (fase de ácido, papéis, critério) e se mostra o resultado.

const MIGRACAO = 'banco/20261020000018_acidificacao_jbv.sql (e a 20261027000019_acidificacao_dci.sql)'

// o volume morto é das linhas de cada equipamento (JBV e DCI têm o seu): guarda o último valor usado por equipamento
const chaveMorto = (e: Equipamento) => `lcpetro.volumeMorto.${e}`
function mortoSalvo(e: Equipamento): number | null {
  try {
    const v = localStorage.getItem(chaveMorto(e))
    const n = v == null ? NaN : Number(v)
    return Number.isFinite(n) && n >= 0 ? n : null
  } catch { return null }
}
function guardarMorto(e: Equipamento, v: number) {
  try { localStorage.setItem(chaveMorto(e), String(v)) } catch { /* sem localStorage: vale só nesta tela */ }
}
const MIGRACAO_MORTO = 'banco/20261014000017_ajuste_darcy_origin.sql'
const MAX_PONTOS_GRAFICO = 3000
const PAPEIS: { valor: PapelFase; texto: string; cor: string }[] = [
  { valor: 'pre_fluxo', texto: 'Pré-fluxo', cor: '#475569' },
  { valor: 'acido', texto: 'Ácido', cor: '#c8102e' },
  { valor: 'pos_fluxo', texto: 'Pós-fluxo', cor: '#1f4e9c' },
  { valor: 'outro', texto: 'Outro', cor: '#94a3b8' },
]
const corDoPapel = (p: PapelFase) => PAPEIS.find((x) => x.valor === p)?.cor ?? '#94a3b8'
const textoDoPapel = (p: PapelFase) => PAPEIS.find((x) => x.valor === p)?.texto ?? p

type TipoCriterio = CriterioBt['tipo']
const CRITERIOS: { valor: TipoCriterio; texto: string }[] = [
  { valor: 'fim_acido', texto: 'Fim da injeção de ácido' },
  { valor: 'queda', texto: 'Queda até o patamar' },
  { valor: 'limite', texto: 'Limite fixo (psi)' },
  { valor: 'manual', texto: 'Marcar no gráfico' },
]

const normalizar = (s: unknown) => String(s ?? '').replace(/[\s-]/g, '').toUpperCase()
/** texto do campo -> número positivo, ou null se vazio/inválido */
const positivo = (s: string) => { const n = paraNumero(s); return n != null && Number.isFinite(n) && n > 0 ? n : null }
const eixo = { fontSize: 11, fill: 'var(--grafico-texto)', fontWeight: 500 }
const estiloDica = {
  borderRadius: '10px', border: '1px solid var(--color-neutral-300)', fontSize: '12px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.06)', backgroundColor: '#fff',
}
interface Gravado { amostraId: string; codigo: string; pvbt: number | null }

export const TratamentoAcidificacao: React.FC<{ equipamento: Equipamento; dpDCI?: FonteDpDCI; aoDetectar?: (e: Equipamento) => void }> = ({ equipamento, dpDCI, aoDetectar }) => {
  // aviso quando o arquivo é do outro equipamento (o app leu pelo certo e troca o seletor)
  const [avisoEquip, setAvisoEquip] = useState<string | null>(null)
  const empresaId = useContexto((s) => s.empresaId)
  const projetoId = useContexto((s) => s.projetoId)

  // 1. arquivo (o equipamento fica o da hora em que o arquivo entrou)
  const [nomeArquivo, setNomeArquivo] = useState('')
  /** o arquivo ORIGINAL, para o serviço montar a planilha e os gráficos no padrão do Origin */
  const [arquivoOriginal, setArquivoOriginal] = useState<File | null>(null)
  const [equipamentoArquivo, setEquipamentoArquivo] = useState<Equipamento>('JBV')
  const [ensaios, setEnsaios] = useState<Ensaio[]>([])
  const [iEnsaio, setIEnsaio] = useState(0)
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // 2. amostra e volume poroso
  const [amostras, setAmostras] = useState<AmostraResumo[] | null>(null)
  const [amostraId, setAmostraId] = useState('')
  const [busca, setBusca] = useState('')
  // cadastro rápido da amostra que não está no catálogo
  const [cadastrando, setCadastrando] = useState(false)
  const [versaoAmostras, setVersaoAmostras] = useState(0)
  const [comprimento, setComprimento] = useState('')
  const [diametro, setDiametro] = useState('')
  const [porosidade, setPorosidade] = useState('')
  const [vpInformado, setVpInformado] = useState('')
  const [doCadastro, setDoCadastro] = useState<string[]>([])
  // volume morto das linhas (Dead volume): é do equipamento, então começa com o do último coreflooding gravado
  const [volumeMorto, setVolumeMorto] = useState('')
  const [mortoPadrao, setMortoPadrao] = useState<number | null>(null)
  const [temperaturaRotulo, setTemperaturaRotulo] = useState('')
  // 3. fases: qual é o ácido (null = sugestão), papéis e fluidos trocados à mão
  const [faseAcido, setFaseAcido] = useState<number | null>(null)
  const [papeis, setPapeis] = useState<Record<number, PapelFase>>({})
  const [fluidos, setFluidos] = useState<Record<number, string>>({})
  const [idSistema, setIdSistema] = useState('')
  const [sistemas, setSistemas] = useState<SistemaAcido[]>([])
  // 4. breakthrough
  const [tipoCriterio, setTipoCriterio] = useState<TipoCriterio>('fim_acido')
  const [quedaPct, setQuedaPct] = useState('5')
  const [limitePsi, setLimitePsi] = useState('')
  const [tManual, setTManual] = useState<number | null>(null)
  const [usarFiltrado, setUsarFiltrado] = useState(false)
  // 6. gravação
  const [gravando, setGravando] = useState(false)
  const [gravado, setGravado] = useState<Gravado | null>(null)
  const [erroGravar, setErroGravar] = useState<string | null>(null)
  // exportação no padrão do Origin (serviço de gráficos)
  const [baixando, setBaixando] = useState(false)
  const [erroExportar, setErroExportar] = useState<string | null>(null)

  const ensaio: Ensaio | undefined = ensaios[iEnsaio]
  // o tempo do DCI nasce em horas: mostra na unidade do equipamento (o cálculo segue em segundos por dentro)
  const un = ensaio?.equipamento === 'DCI' ? { rot: 'h', div: 3600, casas: 3 } : { rot: 's', div: 1, casas: 1 }

  // volume morto do equipamento em uso (o do arquivo, se já há um; senão o da tela): o último usado no navegador;
  // sem ele, o do último coreflooding gravado com esse equipamento (sem as migrações 017/018, segue vazio)
  const equipamentoMorto: Equipamento = ensaios.length ? equipamentoArquivo : equipamento
  useEffect(() => {
    let vivo = true
    const aplicar = (v: number) => { setMortoPadrao(v); setVolumeMorto(numeroParaInput(v)) }
    const salvo = mortoSalvo(equipamentoMorto)
    if (salvo != null) { aplicar(salvo); return }
    setMortoPadrao(null); setVolumeMorto('')
    supabase.from('analise_coreflooding').select('volume_morto_cm3').not('volume_morto_cm3', 'is', null)
      .eq('equipamento_aquisicao', equipamentoMorto).order('id', { ascending: false }).limit(1)
      .then(({ data, error }) => {
        if (!vivo || error || !data?.length) return
        const v = Number(data[0].volume_morto_cm3)
        if (Number.isFinite(v)) aplicar(v)
      })
    return () => { vivo = false }
  }, [equipamentoMorto])

  useEffect(() => {
    let vivo = true
    setAmostras(null)
    listarAmostras({ projeto_id: projetoId, empresa_id: empresaId })
      .then((a) => { if (vivo) setAmostras(a) })
      .catch((e) => { if (vivo) { setAmostras([]); setErro(`Não consegui carregar as amostras: ${mensagemErro(e)}`) } })
    return () => { vivo = false }
  }, [empresaId, projetoId, versaoAmostras])

  // catálogo do sistema ácido (opcional); o fluido de cada fase a pessoa escreve
  useEffect(() => {
    let vivo = true
    listarSistemasAcidos().then((s) => { if (vivo) setSistemas(s) }).catch(() => { /* fica só o texto livre */ })
    return () => { vivo = false }
  }, [])

  // a amostra do cabeçalho do arquivo já vem selecionada (quando existe no projeto aberto)
  const codigoArquivo = ensaio?.metadados.amostra ?? null
  const doArquivo = useMemo(
    () => (codigoArquivo && amostras ? amostras.find((a) => normalizar(a.codigo) === normalizar(codigoArquivo)) : undefined),
    [amostras, codigoArquivo],
  )
  useEffect(() => {
    if (doArquivo) setAmostraId(doArquivo.id)
  }, [doArquivo])

  const amostra = amostras?.find((a) => a.id === amostraId)
  const podeEditar = usePodeEditar(amostra?.projeto_id)

  // com a amostra escolhida, os campos vazios (arquivo sem cabeçalho) vêm do cadastro:
  // comprimento e diâmetro da amostra e a porosidade da petrofísica mais recente que tenha porosidade
  useEffect(() => {
    if (!amostra) return
    let vivo = true
    const preencher = (valor: unknown, atual: string, set: (s: string) => void, nome: string, vindos: string[]) => {
      const n = Number(valor)
      if (atual.trim() || valor == null || !Number.isFinite(n) || n <= 0) return
      set(numeroParaInput(n))
      vindos.push(nome)
    }
    const vindos: string[] = []
    preencher(amostra.comprimento_cm, comprimento, setComprimento, 'comprimento', vindos)
    preencher(amostra.diametro_cm, diametro, setDiametro, 'diâmetro', vindos)
    setDoCadastro(vindos)
    if (!porosidade.trim()) {
      supabase.from('analise_petrofisica').select('porosidade_pct, momento')
        .eq('amostra_id', amostra.id).not('porosidade_pct', 'is', null).order('id', { ascending: false }).limit(20)
        .then(({ data }) => {
          if (!vivo || !data?.length) return
          // a porosidade de antes da acidificação, se houver
          const r = data.find((x) => x.momento === 'antes') ?? data[0]
          setPorosidade((p) => (p.trim() ? p : numeroParaInput(Number(r.porosidade_pct))))
          setDoCadastro((v) => [...v, 'porosidade'])
        })
    }
    return () => { vivo = false }
    // só quando muda a amostra: os campos que a pessoa editou depois não são sobrescritos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amostra?.id])

  function abrirEnsaio(lista: Ensaio[], i: number) {
    const m = lista[i]?.metadados
    setIEnsaio(i)
    setComprimento(numeroParaInput(m?.comprimento_cm))
    setDiametro(numeroParaInput(m?.diametro_cm))
    setPorosidade(numeroParaInput(m?.porosidade_pct))
    setVpInformado('')
    setDoCadastro([])
    setFaseAcido(null)
    setPapeis({})
    setFluidos({})
    setTManual(null)
    setUsarFiltrado(false)
    setGravado(null)
    setErroGravar(null)
    setErroExportar(null)
    setVolumeMorto(numeroParaInput(mortoPadrao))
  }

  async function carregar(arquivo?: File | null) {
    if (!arquivo) return
    setErro(null)
    if (!/\.xlsx?$/i.test(arquivo.name)) {
      setErro(`"${arquivo.name}" não é uma planilha do Excel. Escolha o arquivo .xlsx exportado pelo equipamento.`)
      return
    }
    setLendo(true)
    try {
      const { ensaios: lista, aviso, detectado } = lerEnsaiosEquipamento(await lerArquivoBruto(arquivo, { textoSemConverter: true }), equipamento, { dpDCI })
      if (lista.length === 0) {
        setErro(`Não achei a tabela de leituras em "${arquivo.name}": nenhuma aba tem as colunas "Tempo (s)" e "Q (cm³/min)". `
          + 'Confira se é o arquivo exportado pelo equipamento de coreflooding (ou a planilha separada pelo pesquisador).')
        return
      }
      setNomeArquivo(arquivo.name)
      setArquivoOriginal(arquivo)
      setEquipamentoArquivo(lista[0].equipamento ?? detectado ?? equipamento)
      setAvisoEquip(aviso)
      if (detectado && detectado !== equipamento) aoDetectar?.(detectado)
      setEnsaios(lista)
      setAmostraId('')
      setBusca('')
      setCadastrando(false)
      abrirEnsaio(lista, 0)
    } catch (e) {
      setErro(`Não consegui ler "${arquivo.name}": ${mensagemErro(e)}. `
        + 'Confira se o arquivo é um .xlsx válido, sem senha, e se não está aberto com alterações por salvar; depois escolha de novo.')
    } finally {
      setLendo(false)
    }
  }

  function recomecar() {
    setEnsaios([])
    setNomeArquivo('')
    setArquivoOriginal(null)
    setErro(null)
    setAmostraId('')
    setGravado(null)
    setErroGravar(null)
  }

  // ---- cálculo (na hora, a cada mudança) ----
  const L = positivo(comprimento), D = positivo(diametro), phi = positivo(porosidade), vpInf = positivo(vpInformado)
  const fracao = positivo(quedaPct), limite = positivo(limitePsi)
  // volume morto pode ser zero; vazio = não informado (o cálculo usa 0 e avisa)
  const morto = (() => { const n = paraNumero(volumeMorto); return volumeMorto.trim() && n != null && Number.isFinite(n) && n >= 0 ? n : null })()
  const criterio = useMemo<CriterioBt>(() => {
    if (tipoCriterio === 'fim_acido') return { tipo: 'fim_acido' }
    if (tipoCriterio === 'limite') return { tipo: 'limite', dp_psi: limite ?? 0 }
    // sem clique ainda, nenhum ponto passa (t = ∞): o resultado avisa que falta marcar
    if (tipoCriterio === 'manual') return { tipo: 'manual', t_s: tManual ?? Number.POSITIVE_INFINITY }
    return { tipo: 'queda', fracao: (fracao ?? 5) / 100 }
  }, [tipoCriterio, limite, tManual, fracao])
  const resultado = useMemo(
    () => (ensaio ? tratarAcidificacao(ensaio, {
      faseAcido: faseAcido ?? undefined, comprimento_cm: L, diametro_cm: D, porosidade_pct: phi,
      volumePoroso_cm3: vpInf, volumeMorto_cm3: morto, criterio, usarDpFiltrado: usarFiltrado,
    }) : null),
    [ensaio, faseAcido, L, D, phi, vpInf, morto, criterio, usarFiltrado],
  )
  const fases = useMemo(() => resultado?.fases ?? [], [resultado])
  const fa = resultado?.fase_acido ?? null
  const papelDe = useMemo(() => {
    const sugeridos = sugerirPapeis(fases, fa?.ordem ?? null)
    return (ordem: number): PapelFase => (ordem === fa?.ordem ? 'acido' : papeis[ordem] ?? sugeridos[ordem] ?? 'outro')
  }, [fases, fa, papeis])
  const fluidoDe = (ordem: number) => fluidos[ordem] ?? fases.find((f) => f.ordem === ordem)?.nome_sugerido ?? ''
  const temFiltrado = useMemo(() => ensaio?.leituras.some((l) => l.dp_filtrado != null) ?? false, [ensaio])
  const bt = resultado?.breakthrough ?? null

  function mudarPapel(ordem: number, p: PapelFase) {
    setGravado(null)
    if (p === 'acido') {
      // só uma fase é o ácido: a nova vira o ácido e os outros papéis voltam à sugestão em volta dela
      setFaseAcido(ordem)
      setPapeis({})
      setTManual(null)
    } else setPapeis((x) => ({ ...x, [ordem]: p }))
  }

  // ---- gráfico ΔP × tempo (ensaio inteiro, cada fase na cor do seu papel) ----
  const pontosTempo = useMemo(() => {
    if (!ensaio) return []
    const ls = ensaio.leituras
    const passo = Math.max(1, Math.ceil(ls.length / MAX_PONTOS_GRAFICO))
    return ls.filter((_, i) => i % passo === 0).map((l) => {
      const dp = usarFiltrado ? l.dp_filtrado ?? l.dp : l.dp
      const f = fases.find((x) => l.tempo_s >= x.t_inicio_s && l.tempo_s <= x.t_fim_s)
      const p: Record<string, number | null> = { t: l.tempo_s }
      if (f) p[`f${f.ordem}`] = dp
      else p.fora = dp
      return p
    })
  }, [ensaio, fases, usarFiltrado])

  function marcarNoGrafico(s: { activeTooltipIndex?: unknown } | null | undefined) {
    if (tipoCriterio !== 'manual' || gravando) return
    const i = s?.activeTooltipIndex == null ? NaN : Number(s.activeTooltipIndex)
    const t = Number.isInteger(i) ? pontosTempo[i]?.t : undefined
    if (t == null || !fa) return
    setTManual(Math.min(Math.max(t, fa.t_inicio_s), fa.t_fim_s))
    setGravado(null)
  }

  // ---- gráfico ΔP × PV injetado (só o ácido) ----
  const pontosPv = useMemo(() => {
    const s = (resultado?.serie ?? []).filter((p) => p.pv != null && p.dp != null)
    const passo = Math.max(1, Math.ceil(s.length / MAX_PONTOS_GRAFICO))
    return s.filter((_, i) => i % passo === 0).map((p) => ({ pv: p.pv as number, dp: p.dp as number }))
  }, [resultado])

  // ---- gravar ----
  const outraAmostra = Boolean(amostra && codigoArquivo && normalizar(amostra.codigo) !== normalizar(codigoArquivo))
  const semCriterio = (tipoCriterio === 'limite' && limite == null) || (tipoCriterio === 'queda' && fracao == null)

  async function gravar() {
    if (!ensaio || !resultado || !amostra || !fa) return
    const confirmacao = [
      `Gravar a acidificação na amostra ${amostra.codigo}?`,
      outraAmostra && `• ATENÇÃO: o arquivo é da amostra ${codigoArquivo}, não de ${amostra.codigo}.`,
      `• Coreflooding com ácido na fase "${fa.rotulo}", Q = ${fmt(resultado.q_ml_min, 2)} cm³/min, `
        + (bt ? `PVbt = ${fmt(bt.pvbt, 3)}.` : 'sem breakthrough.'),
      `• ${fases.length} fase(s) (${fases.map((f) => f.rotulo).join(' → ')}) e as curvas ΔP × tempo e ΔP × PV injetado.`,
      'Nada é apagado: se este ensaio já foi gravado antes, ficará em duplicidade.',
    ].filter(Boolean).join('\n')
    if (!confirm(confirmacao)) return
    setErroGravar(null)
    setGravando(true)
    try {
      const escolhidas: Record<number, FaseEscolhida> = {}
      for (const f of fases) escolhidas[f.ordem] = { papel: papelDe(f.ordem), fluido: fluidoDe(f.ordem).trim() || null }
      // o cálculo usa os campos da tela; o cabeçalho gravado também
      const ensaioGravar: Ensaio = { ...ensaio, metadados: { ...ensaio.metadados, comprimento_cm: L, diametro_cm: D, porosidade_pct: phi } }
      await gravarAcidificacao(supabase, {
        amostraId: amostra.id, equipamento: equipamentoArquivo, ensaio: ensaioGravar, resultado,
        fases: escolhidas, idSistema: idSistema || null, arquivo: nomeArquivo,
      })
      if (morto != null) guardarMorto(equipamentoArquivo, morto)
      setGravado({ amostraId: amostra.id, codigo: amostra.codigo, pvbt: bt?.pvbt ?? null })
    } catch (e) {
      const msg = mensagemErro(e)
      setErroGravar(
        /Failed to fetch|NetworkError|Load failed/i.test(msg)
          ? 'Sem conexão com o Supabase. Confira a internet e, antes de gravar de novo, veja na ficha da amostra (3. Coreflooding) se o registro já entrou.'
          : /migração 017/.test(msg)
            ? `${msg}: rode ${MIGRACAO_MORTO} no SQL Editor do Supabase (coluna do volume morto) e grave de novo. Nada foi gravado.`
          : /migração 018|acidificacao_fases|equipamento_aquisicao|does not exist|schema cache|Could not find/i.test(msg)
            ? `${msg} O banco ainda não tem as colunas/tabela da acidificação: rode ${MIGRACAO} no SQL Editor do Supabase. `
              + (/^analise_coreflooding/.test(msg) ? 'Nada foi gravado.' : 'O coreflooding já foi criado antes do erro: apague-o na ficha da amostra antes de gravar de novo.')
            : /^analise_coreflooding|Sem permissão|Escolha qual fase/.test(msg) ? msg
              : `${msg} O coreflooding já foi criado antes do erro: apague-o na ficha da amostra (3. Coreflooding) antes de gravar de novo.`,
      )
    } finally {
      setGravando(false)
    }
  }

  // ---- planilha e gráficos no padrão do Origin (serviço de gráficos, com o arquivo original) ----
  const sistemaEscolhido = sistemas.find((s) => s.id_sistema === idSistema)?.nome_sistema ?? null
  const pedidoOrigin = useMemo<PedidoAcid | null>(() => {
    if (!ensaio || !fases.length) return null
    return {
      amostra: amostra?.codigo ?? codigoArquivo ?? null,
      sistema_acido: sistemaEscolhido ?? (fa ? fluidoDe(fa.ordem).trim() || null : null),
      comprimento_cm: L, diametro_cm: D, porosidade_pct: phi,
      volume_morto_cm3: morto, temperatura_rotulo: temperaturaRotulo.trim() || null,
      aba: ensaio.aba,
      houve_breakthrough: resultado?.houve_breakthrough ?? null,
      dp_dci: dpDCI,
      // gráficos da planilha sem a marcação do PVbt
      config: { mostrar_pvbt: false },
      fases: fases.map((f) => ({
        ordem: f.ordem, papel: papelDe(f.ordem), q: f.q, t_inicio: f.t_inicio_s, t_fim: f.t_fim_s, fluido: fluidoDe(f.ordem).trim() || null,
      })),
    }
    // fluidoDe lê "fluidos" e "fases"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensaio, fases, fa, papelDe, fluidos, amostra?.codigo, codigoArquivo, sistemaEscolhido, L, D, phi, morto, temperaturaRotulo, resultado?.houve_breakthrough, dpDCI])

  async function baixarPlanilhaOrigin() {
    if (!arquivoOriginal || !pedidoOrigin) return
    if (!L || !D || !phi) {
      setErroExportar('Informe o comprimento, diâmetro e porosidade da amostra no passo 2 antes de gerar a planilha.')
      return
    }
    setErroExportar(null)
    setBaixando(true)
    try {
      const xlsx = await pedirPlanilhaAcidificacao(arquivoOriginal, pedidoOrigin)
      baixarArquivo(xlsx, `${nomeArquivo.replace(/\.[^.]+$/, '')}_acidificacao.xlsx`)
    } catch (e) {
      setErroExportar(`Não consegui gerar a planilha: ${mensagemErro(e)}`)
    } finally {
      setBaixando(false)
    }
  }

  const m = ensaio?.metadados
  const garrafasCab = m ? Object.entries(m.garrafas).map(([g, c]) => `G${g}: ${c}`).join(' · ') : ''
  const duracaoTotal = fases.reduce((s, f) => s + Math.max(f.t_fim_s - f.t_inicio_s, 1), 0)

  return (
    <>
      {/* 1. arquivo */}
      <Card
        titulo="1. Arquivo do equipamento"
        subtitulo="Exportação completa do ensaio de acidificação ou a planilha já separada pelo pesquisador. Nada é gravado até você confirmar no passo 6."
        icone={<FileSpreadsheet size={18} />}
        acoes={ensaio && (
          <button type="button" className="btn btn-secondary" onClick={recomecar} disabled={gravando}>
            <RotateCcw size={14} /> Trocar arquivo
          </button>
        )}
      >
        {!ensaio ? (
          lendo ? (
            <p className="m-0 flex items-center gap-2 text-[13px] text-[var(--color-neutral-600)]">
              <Loader2 size={14} className="animate-spin text-[var(--color-orange)]" /> lendo o arquivo…
            </p>
          ) : (
            <AreaArquivo aoEscolher={carregar}
              dica={equipamento === 'DCI'
                ? <>Log do DCI (.xlsx) · “Timestamp (hours)”, “VPA n Flow Rate”, “Accum. n Vol” e “Core B Differential Pressure” — ou a cópia do pesquisador com a coluna “Coluna1”</>
                : <>Arquivo do JBV · colunas “Tempo (s)”, “Q (cm³/min)”, “Nome Gn” e “Volume atual Gn” — ou rótulos “&lt;fluido&gt; @&lt;Q&gt;”</>} />
          )
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <FileSpreadsheet size={20} className="text-[var(--color-blue)]" />
              <strong>{nomeArquivo}</strong>
              <span className="tag tag-neutral">{ensaio.leituras.length} leituras</span>
              <span className="tag tag-neutral">holder {ensaio.holder}</span>
              <span className="tag tag-blue">{equipamentoArquivo}</span>
              {ensaios.length > 1 && (
                <label className="ml-auto flex items-center gap-2 text-[12px] text-[var(--color-neutral-600)]">
                  Aba com as leituras
                  <select className="input !w-auto" value={iEnsaio} disabled={gravando}
                    onChange={(e) => abrirEnsaio(ensaios, Number(e.target.value))}>
                    {ensaios.map((x, i) => <option key={x.aba} value={i}>{x.aba} ({x.leituras.length} leituras)</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
              <Dado rotulo="Amostra">{m?.amostra ?? '—'}</Dado>
              <Dado rotulo="Usuário">{m?.usuario ?? '—'}</Dado>
              <Dado rotulo="Data">{m?.data ?? '—'}</Dado>
              <Dado rotulo="Fluido de tratamento">{m?.fluido ?? '—'}</Dado>
              {garrafasCab && <div className="col-span-2 md:col-span-4"><Dado rotulo="Garrafas">{garrafasCab}</Dado></div>}
            </div>
            {!m?.amostra && (
              <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">
                Esta aba não tem o cabeçalho do equipamento (é a planilha já separada): escolha a amostra no passo 2 e confira as dimensões e a porosidade.
              </p>
            )}
          </div>
        )}
      </Card>

      {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
      {avisoEquip && <Alert tipo="info" mensagem={avisoEquip} onClose={() => setAvisoEquip(null)} />}

      {ensaio && resultado && (
        <>
          {/* 2. amostra e volume poroso */}
          <Card titulo="2. Amostra e volume poroso" subtitulo="O PVbt usa o volume poroso destes campos: VP = π·(D/2)²·L·φ, ou o VP informado.">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="Buscar amostra" placeholder="código ou litologia" value={busca} disabled={gravando}
                  onChange={(e) => setBusca(e.target.value)} />
                <div className="md:col-span-2">
                  <Select label="Amostra do projeto" obrigatorio value={amostraId} disabled={gravando}
                    onChange={(e) => { setAmostraId(e.target.value); setGravado(null) }}>
                    <option value="">{amostras ? 'Escolha a amostra…' : 'Carregando amostras…'}</option>
                    {(amostras ?? []).filter((a) => {
                      const q = busca.trim().toLowerCase()
                      return a.id === amostraId || !q || a.codigo?.toLowerCase().includes(q) || a.litologia?.toLowerCase().includes(q)
                    }).map((a) => (
                      <option key={a.id} value={a.id}>{[a.codigo, a.litologia, a.projeto_codigo].filter(Boolean).join(' · ')}</option>
                    ))}
                  </Select>
                </div>
              </div>
              {amostras && codigoArquivo && !doArquivo && !cadastrando && (
                <div className="aviso aviso-info flex flex-wrap items-center gap-3" role="status">
                  <span className="min-w-[260px] flex-1">
                    A amostra <strong>{codigoArquivo}</strong> do cabeçalho do arquivo não está no catálogo do projeto aberto. Cadastre-a aqui ou escolha outra amostra acima.
                  </span>
                  <button type="button" className="btn btn-blue" disabled={gravando} onClick={() => setCadastrando(true)}>
                    <Plus size={14} /> Cadastrar {codigoArquivo}
                  </button>
                </div>
              )}
              {!cadastrando && !(amostras && codigoArquivo && !doArquivo) && (
                <div>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={gravando} onClick={() => setCadastrando(true)}>
                    <Plus size={13} /> Amostra não está na lista? Cadastrar
                  </button>
                </div>
              )}
              {cadastrando && (
                <CadastroRapidoAmostra codigo={doArquivo ? null : codigoArquivo} comprimento_cm={L} diametro_cm={D}
                  aoFechar={() => setCadastrando(false)}
                  aoCadastrar={(id) => { setCadastrando(false); setAmostraId(id); setGravado(null); setVersaoAmostras((v) => v + 1) }} />
              )}
              {outraAmostra && (
                <Alert tipo="erro" mensagem={`A amostra escolhida (${amostra?.codigo}) não é a do arquivo (${codigoArquivo}). Confira antes de gravar.`} />
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="Comprimento" unidade="cm" inputMode="decimal" value={comprimento} disabled={gravando}
                  error={comprimento.trim() && L == null ? 'Número maior que zero' : undefined}
                  onChange={(e) => { setComprimento(e.target.value); setGravado(null) }} />
                <Input label="Diâmetro" unidade="cm" inputMode="decimal" value={diametro} disabled={gravando}
                  error={diametro.trim() && D == null ? 'Número maior que zero' : undefined}
                  onChange={(e) => { setDiametro(e.target.value); setGravado(null) }} />
                <Input label="Porosidade" unidade="%" inputMode="decimal" value={porosidade} disabled={gravando}
                  error={porosidade.trim() && phi == null ? 'Número maior que zero' : undefined}
                  onChange={(e) => { setPorosidade(e.target.value); setGravado(null) }} />
                <Input label="VP informado" unidade="cm³" inputMode="decimal" value={vpInformado} disabled={gravando}
                  error={vpInformado.trim() && vpInf == null ? 'Número maior que zero' : undefined}
                  onChange={(e) => { setVpInformado(e.target.value); setGravado(null) }} />
                <Input label="Volume morto" unidade="ml" inputMode="decimal" value={volumeMorto} disabled={gravando}
                  error={volumeMorto.trim() && morto == null ? 'Número maior ou igual a zero' : undefined}
                  onChange={(e) => { setVolumeMorto(e.target.value); setGravado(null) }} />
                <Input label="Rótulo da temperatura" placeholder="ex.: T40" value={temperaturaRotulo} disabled={gravando}
                  onChange={(e) => setTemperaturaRotulo(e.target.value)} />
              </div>
              <p className="m-0 text-[13px]">
                Volume poroso usado: <strong className="tabular-nums">{fmt(resultado.volume_poroso_cm3, 3)} cm³</strong>
                {doCadastro.length > 0 && <span className="text-[var(--color-neutral-600)]"> · {doCadastro.join(', ')} do cadastro da amostra</span>}
              </p>
              {morto == null ? (
                <Alert tipo="info" mensagem={'Informe o volume morto das linhas. Sem ele o cálculo usa 0 e o PV fica maior que o do laboratório. '
                  + (mortoPadrao == null ? 'Ainda não há volume morto gravado em nenhum coreflooding.' : '')} />
              ) : mortoPadrao != null && morto === mortoPadrao && (
                <p className="m-0 -mt-2 text-[12px] text-[var(--color-neutral-600)]">Volume morto do último coreflooding gravado.</p>
              )}
            </div>
          </Card>

          {/* 3. fases */}
          <Card titulo={<span className="flex flex-wrap items-center gap-2">3. Fases
            {fases[0]?.origem === 'rotulos' && <span className="tag tag-orange">Separação do pesquisador</span>}</span>}>
            {fases.length === 0 ? (
              <Alert tipo="erro" mensagem="Nenhuma fase encontrada: nenhuma garrafa teve o “Volume atual” mudando e não há rótulos “<fluido> @<Q>”." />
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex h-[44px] w-full overflow-hidden rounded-[10px]" role="img"
                  aria-label={`Fases: ${fases.map((f) => `${f.rotulo} (${textoDoPapel(papelDe(f.ordem))})`).join(', ')}`}>
                  {fases.map((f) => (
                    <div key={f.ordem} title={`${f.rotulo} · ${textoDoPapel(papelDe(f.ordem))}`}
                      className="flex min-w-[56px] items-center justify-center overflow-hidden border-r-2 border-white px-2 text-[12px] font-semibold text-white last:border-r-0"
                      style={{ flexGrow: Math.max(f.t_fim_s - f.t_inicio_s, 1) / (duracaoTotal || 1), flexBasis: 0, background: corDoPapel(papelDe(f.ordem)) }}>
                      <span className="truncate">{f.rotulo}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4 text-[12px] text-[var(--color-neutral-600)]">
                  {PAPEIS.map((p) => (
                    <span key={p.valor} className="flex items-center gap-1.5"><i className="inline-block h-[10px] w-[10px] rounded-sm" style={{ background: p.cor }} /> {p.texto}</span>
                  ))}
                </div>

                <div className="-mx-6 overflow-x-auto px-6">
                  <table className="table text-[12px]">
                    <thead>
                      <tr>
                        <th>Rótulo</th><th className="text-right">{equipamentoArquivo === 'DCI' ? 'Acumulador' : 'Garrafa'}</th><th>{`Início–fim (${un.rot})`}</th><th className="text-right">Leituras</th>
                        <th className="text-right">Volume (cm³)</th><th className="text-right">Q (cm³/min)</th><th className="text-right">ΔP inicial → final (psi)</th>
                        <th>Papel</th><th>Fluido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fases.map((f) => {
                        const papel = papelDe(f.ordem)
                        return (
                          <tr key={f.ordem} className="lcp-row">
                            <td className="!py-2 font-semibold whitespace-nowrap">
                              <span className="mr-2 inline-block h-[10px] w-[10px] rounded-sm align-middle" style={{ background: corDoPapel(papel) }} />
                              {f.rotulo}
                            </td>
                            <td className="!py-2 text-right tabular-nums">{f.garrafa != null ? `${equipamentoArquivo === 'DCI' ? 'A' : 'G'}${f.garrafa}` : '—'}</td>
                            <td className="!py-2 tabular-nums whitespace-nowrap">{fmt(f.t_inicio_s / un.div, un.div > 1 ? 3 : 0)} – {fmt(f.t_fim_s / un.div, un.div > 1 ? 3 : 0)}</td>
                            <td className="!py-2 text-right tabular-nums">{f.n_pontos}</td>
                            <td className="!py-2 text-right tabular-nums">{fmt(f.volume_cm3, 2)}</td>
                            <td className="!py-2 text-right tabular-nums">{fmt(f.q, 2)}</td>
                            <td className="!py-2 text-right tabular-nums whitespace-nowrap">{fmt(f.dp_inicial, 2)} → {fmt(f.dp_final, 2)}</td>
                            <td className="!py-2">
                              <select className="input !w-auto !py-1" value={papel} disabled={gravando || papel === 'acido'}
                                title={papel === 'acido' ? 'Para trocar o ácido, escolha “Ácido” em outra fase' : undefined}
                                aria-label={`Papel da fase ${f.rotulo}`}
                                onChange={(e) => mudarPapel(f.ordem, e.target.value as PapelFase)}>
                                {PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.texto}</option>)}
                              </select>
                            </td>
                            <td className="!py-2">
                              <input className="input !w-[170px] !py-1" value={fluidoDe(f.ordem)} disabled={gravando}
                                aria-label={`Fluido da fase ${f.rotulo}`} placeholder="escreva o fluido" autoComplete="off"
                                onChange={(e) => { setFluidos((x) => ({ ...x, [f.ordem]: e.target.value })); setGravado(null) }} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="max-w-md">
                  <Select label="Sistema ácido" value={idSistema} disabled={gravando}
                    onChange={(e) => { setIdSistema(e.target.value); setGravado(null) }}>
                    <option value="">— não informar —</option>
                    {sistemas.map((s) => <option key={s.id_sistema} value={s.id_sistema}>{s.id_sistema} · {s.nome_sistema}</option>)}
                  </Select>
                </div>
              </div>
            )}
          </Card>

          {/* 4. breakthrough */}
          <Card titulo="4. Breakthrough">
            <div className="flex flex-col gap-4">
              <fieldset className="m-0 flex flex-wrap gap-x-6 gap-y-2 border-0 p-0" disabled={gravando || !fa}>
                <legend className="rotulo mb-2 p-0">Critério</legend>
                {CRITERIOS.map((c) => (
                  <label key={c.valor} className="flex cursor-pointer items-center gap-2 text-[13px]">
                    <input type="radio" name="criterio-bt" checked={tipoCriterio === c.valor}
                      onChange={() => { setTipoCriterio(c.valor); setGravado(null) }} />
                    {c.texto}
                  </label>
                ))}
              </fieldset>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {tipoCriterio === 'queda' && (
                  <Input label="Acima do patamar até" unidade="%" inputMode="decimal" value={quedaPct} disabled={gravando}
                    error={fracao == null ? 'Número maior que zero' : undefined}
                    onChange={(e) => { setQuedaPct(e.target.value); setGravado(null) }} />
                )}
                {tipoCriterio === 'limite' && (
                  <Input label="ΔP limite" unidade="psi" inputMode="decimal" value={limitePsi} disabled={gravando}
                    error={limite == null ? 'Informe o ΔP do breakthrough' : undefined}
                    onChange={(e) => { setLimitePsi(e.target.value); setGravado(null) }} />
                )}
                {tipoCriterio === 'manual' && (
                  <p className="m-0 flex items-center gap-2 self-end text-[13px] text-[var(--color-neutral-700)]">
                    <Info size={14} className="text-[var(--color-blue)]" />
                    {tManual == null ? 'Clique no gráfico ΔP × tempo, dentro da fase de ácido.' : <>Marcado em t = <strong>{fmt(tManual / un.div, un.casas)} {un.rot}</strong></>}
                  </p>
                )}
                <label className="flex items-center gap-2 self-end text-[13px]" title={temFiltrado ? undefined : 'O arquivo não tem a coluna “Set Point”'}>
                  <input type="checkbox" checked={usarFiltrado} disabled={gravando || !temFiltrado}
                    onChange={(e) => { setUsarFiltrado(e.target.checked); setGravado(null) }} />
                  Usar ΔP filtrado (Set Point)
                </label>
              </div>
              <p className="m-0 text-[13px]">
                Patamar depois do breakthrough: <strong className="tabular-nums">{fmt(resultado.dp_patamar_psi, 2)} psi</strong>
                {bt && <span className="text-[var(--color-neutral-600)]"> · {bt.criterio} · breakthrough em t = {fmt(bt.t_s / un.div, un.casas)} {un.rot}</span>}
              </p>
              <p className="m-0 text-[12px] text-[var(--color-neutral-500)]">
                pela queda até o patamar: PVbt = {fmt(resultado.pvbt_queda, 3)}
                {' '}· no fim da injeção de ácido: PVbt = {fmt(resultado.pvbt_fim_acido, 3)}
              </p>
            </div>
          </Card>

          {/* 5. gráficos */}
          <Card titulo="5. Gráficos" subtitulo={tipoCriterio === 'manual' ? 'Clique no ΔP × tempo para marcar o breakthrough.' : 'Cada fase na cor do seu papel; a linha tracejada é o breakthrough.'}>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div style={{ userSelect: 'none', cursor: tipoCriterio === 'manual' ? 'crosshair' : undefined }}>
                <p className="rotulo m-0 mb-2">ΔP × tempo</p>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={pontosTempo} margin={{ top: 8, right: 16, left: 8, bottom: 4 }} onClick={marcarNoGrafico}>
                    <CartesianGrid stroke="var(--grafico-grade)" vertical={false} />
                    {fases.map((f) => (
                      <ReferenceArea key={`area-${f.ordem}`} x1={f.t_inicio_s} x2={f.t_fim_s} strokeOpacity={0}
                        fill={corDoPapel(papelDe(f.ordem))} fillOpacity={0.07} />
                    ))}
                    <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tick={eixo} tickLine={false}
                      axisLine={{ stroke: 'var(--color-neutral-300)' }} tickFormatter={(v) => fmt(v / un.div, un.div > 1 ? 2 : 0)} />
                    <YAxis width={56} domain={[0, 'auto']} tick={eixo} tickLine={false} axisLine={{ stroke: 'var(--color-neutral-300)' }}
                      tickFormatter={(v) => fmt(v, 2)}
                      label={{ value: 'ΔP (psi)', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--grafico-texto)', fontWeight: 600, style: { textAnchor: 'middle' } }} />
                    <Tooltip contentStyle={estiloDica} labelStyle={{ fontWeight: 800, marginBottom: 4 }}
                      cursor={{ stroke: 'var(--color-neutral-400)', strokeDasharray: '3 3' }}
                      labelFormatter={(t) => `t = ${fmt(Number(t) / un.div, un.casas)} ${un.rot}`}
                      formatter={(v, nome) => {
                        const f = fases.find((x) => `f${x.ordem}` === nome)
                        return [`${fmt(v, 3)} psi`, f ? f.rotulo : 'sem fase']
                      }} />
                    <Line dataKey="fora" type="linear" stroke="var(--color-neutral-400)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
                    {fases.map((f) => (
                      <Line key={f.ordem} dataKey={`f${f.ordem}`} type="linear" stroke={corDoPapel(papelDe(f.ordem))} strokeWidth={2}
                        dot={false} isAnimationActive={false} connectNulls={false} />
                    ))}
                    {bt && <ReferenceLine x={bt.t_s} stroke="#c8102e" strokeDasharray="6 4" strokeWidth={1.5}
                      label={{ value: 'BT', position: 'top', fontSize: 11, fontWeight: 700, fill: '#c8102e' }} />}
                  </LineChart>
                </ResponsiveContainer>
                <p className="m-0 mt-1 text-center text-[11px] font-semibold text-[var(--grafico-texto)]">{`Tempo (${un.rot})`}</p>
              </div>

              <div>
                <p className="rotulo m-0 mb-2">ΔP × PV injetado{fa ? ` · ${fa.rotulo}` : ''}</p>
                {!fa ? (
                  <Alert tipo="info" mensagem="Escolha qual fase é o ácido no passo 3." />
                ) : pontosPv.length === 0 ? (
                  <Alert tipo="info" mensagem="Sem volume poroso: informe comprimento, diâmetro e porosidade (ou o VP) no passo 2." />
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={pontosPv} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke="var(--grafico-grade)" vertical={false} />
                        {/* PV = (volume injetado − volume morto) ÷ VP: começa negativo e cruza o zero quando o ácido chega na rocha */}
                        <XAxis dataKey="pv" type="number" domain={['dataMin', 'dataMax']} tick={eixo} tickLine={false}
                          axisLine={{ stroke: 'var(--color-neutral-300)' }} tickFormatter={(v) => fmt(v, 2)} />
                        <YAxis width={56} domain={[0, 'auto']} tick={eixo} tickLine={false} axisLine={{ stroke: 'var(--color-neutral-300)' }}
                          tickFormatter={(v) => fmt(v, 2)}
                          label={{ value: 'ΔP (psi)', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--grafico-texto)', fontWeight: 600, style: { textAnchor: 'middle' } }} />
                        <Tooltip contentStyle={estiloDica} labelStyle={{ fontWeight: 800, marginBottom: 4 }}
                          labelFormatter={(pv) => `PV = ${fmt(pv, 3)}`} formatter={(v) => [`${fmt(v, 3)} psi`, 'ΔP']} />
                        {resultado.dp_patamar_psi != null && (
                          <ReferenceLine y={resultado.dp_patamar_psi} stroke="var(--color-neutral-500)" strokeDasharray="2 4"
                            label={{ value: `patamar ${fmt(resultado.dp_patamar_psi, 2)} psi`, position: 'insideTopRight', fontSize: 11, fill: 'var(--color-neutral-600)' }} />
                        )}
                        {(pontosPv[0]?.pv ?? 0) < 0 && (
                          <ReferenceLine x={0} stroke="var(--color-neutral-600)" strokeDasharray="6 4"
                            label={{ value: 'Volume morto', position: 'insideTopLeft', fontSize: 11, fill: 'var(--color-neutral-600)' }} />
                        )}
                        <Line dataKey="dp" type="linear" stroke="#c8102e" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                    <p className="m-0 mt-1 text-center text-[11px] font-semibold text-[var(--grafico-texto)]">PV injetado</p>
                  </>
                )}
              </div>
            </div>
          </Card>

          {/* os gráficos que vão para a planilha Excel (aba "Gráficos"), gerados pelo serviço */}
          <Card titulo="Gráficos da planilha Excel">
            {URL_GRAFICOS && arquivoOriginal && pedidoOrigin ? (
              <GraficosOriginAcid arquivo={arquivoOriginal} pedido={pedidoOrigin}
                nomeBase={(amostra?.codigo || nomeArquivo.replace(/\.[^.]+$/, '') || 'acidificacao').replace(/[\\/:*?"<>|\s]+/g, '_')} />
            ) : (
              <Alert tipo="info" mensagem={!URL_GRAFICOS ? 'Falta VITE_URL_GRAFICOS no .env.local para usar o serviço de gráficos.' : 'Os gráficos aparecem quando houver fases.'} />
            )}
          </Card>

          {/* 6. resultado e gravação */}
          <Card titulo="6. Resultado e gravação" subtitulo="A gravação cria um coreflooding na amostra, com as fases e as curvas ΔP × tempo e ΔP × PV injetado.">
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-6">
                <Numero rotulo="Taxa de injeção" valor={fmt(resultado.q_ml_min, 2)} unidade="cm³/min" />
                <Numero rotulo="vᵢ" valor={fmt(resultado.v_i_cm_min, 3)} unidade="cm/min" />
                <Numero rotulo="Volume poroso" valor={fmt(resultado.volume_poroso_cm3, 2)} unidade="cm³" />
                <Numero rotulo="Ácido até o BT" valor={fmt(bt?.volume_acido_cm3, 2)} unidade="cm³" />
                {resultado.houve_breakthrough === false
                  ? <Numero rotulo="PV de ácido injetado" valor={fmt(resultado.pv_acido_injetado, 3)} destaque />
                  : <Numero rotulo="PVbt" valor={fmt(bt?.pvbt, 3)} destaque />}
                <Numero rotulo="ΔP inicial → patamar" valor={`${fmt(resultado.dp_inicial_psi, 2)} → ${fmt(resultado.dp_patamar_psi, 2)}`} unidade="psi" />
              </div>
              {resultado.houve_breakthrough === false && (
                <p className="m-0 flex flex-wrap items-center gap-3 text-[13px]">
                  <span className="tag tag-accent">Sem breakthrough</span>
                  {resultado.razao_dp_depois_antes != null && (
                    <span>ΔP depois ÷ antes = <strong>{fmt(resultado.razao_dp_depois_antes, 2)}</strong>
                      {` (${resultado.razao_dp_depois_antes >= 1 ? `${fmt(resultado.razao_dp_depois_antes, 1)}× maior` : `${fmt(1 / resultado.razao_dp_depois_antes, 1)}× menor`})`}</span>
                  )}
                </p>
              )}
              {resultado.houve_breakthrough === null && (
                <p className="m-0 flex flex-wrap items-center gap-3 text-[13px]">
                  <span className="tag tag-neutral">Breakthrough incerto</span>
                  <span>Confira no gráfico e, se preciso, marque o ponto à mão no passo 4.</span>
                </p>
              )}
              {resultado.pvbt_equipamento != null && (
                <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">PVbt calculado pelo equipamento: {fmt(resultado.pvbt_equipamento, 3)}</p>
              )}

              {resultado.avisos.length > 0 && (
                <div className="aviso aviso-info flex items-start gap-2.5" role="status">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <ul className="m-0 list-none p-0 leading-[1.6]">
                    {resultado.avisos.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                </div>
              )}

              {erroGravar && <Alert tipo="erro" mensagem={erroGravar} onClose={() => setErroGravar(null)} />}
              {erroExportar && <Alert tipo="erro" mensagem={erroExportar} onClose={() => setErroExportar(null)} />}

              {/* exportação no padrão do laboratório: quem monta é o serviço Python, a partir do arquivo original */}
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-secondary" onClick={baixarPlanilhaOrigin}
                  disabled={!URL_GRAFICOS || !arquivoOriginal || !pedidoOrigin || baixando}>
                  {baixando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Baixar planilha Excel
                </button>
                {!URL_GRAFICOS && (
                  <span className="text-[12px] text-[var(--color-neutral-600)]">Falta VITE_URL_GRAFICOS no .env.local para usar o serviço de gráficos.</span>
                )}
              </div>
              {gravado && (
                <div className="aviso aviso-ok" role="status">
                  <p className="m-0 flex items-center gap-2 font-semibold">
                    <CheckCircle2 size={16} /> Gravado na amostra {gravado.codigo}{gravado.pvbt != null ? `: PVbt = ${fmt(gravado.pvbt, 3)}` : ' (sem breakthrough)'}.
                  </p>
                  <Link className="btn btn-blue mt-3" to={`/amostras/${gravado.amostraId}?aba=coreflooding`}>
                    <ExternalLink size={14} /> Abrir ficha da amostra
                  </Link>
                </div>
              )}

              {!gravado && (
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="btn btn-primary" onClick={gravar}
                    disabled={gravando || !amostra || !fa || !podeEditar || semCriterio}>
                    {gravando ? <><Loader2 size={14} className="animate-spin" /> Gravando…</> : <><Save size={14} /> Gravar acidificação</>}
                  </button>
                  <span className="text-[12px] text-[var(--color-red-700)]">
                    {!amostra ? 'Escolha a amostra no passo 2.'
                      : !podeEditar ? `Seu usuário não é editor do projeto da amostra ${amostra.codigo}.`
                        : !fa ? 'Escolha qual fase é o ácido no passo 3.'
                          : semCriterio ? 'Complete o critério de breakthrough no passo 4.' : ''}
                  </span>
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </>
  )
}

const Dado: React.FC<{ rotulo: string; children: React.ReactNode }> = ({ rotulo, children }) => (
  <div>
    <p className="rotulo m-0">{rotulo}</p>
    <p className="m-0 mt-1 text-[13px] font-medium">{children}</p>
  </div>
)

const Numero: React.FC<{ rotulo: string; valor: string; unidade?: string; destaque?: boolean }> = ({ rotulo, valor, unidade, destaque }) => (
  <div>
    <p className="rotulo m-0">{rotulo}</p>
    <p className={`numero m-0 mt-1.5 leading-none ${destaque ? 'text-[30px] text-[#c8102e]' : 'text-[24px]'}`}>
      {valor}{unidade && <span className="text-[13px]"> {unidade}</span>}
    </p>
  </div>
)
