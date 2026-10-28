import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from 'recharts'
import { AlertTriangle, CheckCircle2, Download, ExternalLink, FileSpreadsheet, Loader2, Plus, RotateCcw, Save, Undo2 } from 'lucide-react'
import { Alert, Card, Input, Select } from '../../components/UI'
import { usePodeEditar } from '../../hooks/usePapel'
import { lerArquivoBruto } from '../../importador/lerArquivo'
import type { FonteDpDCI } from '../../importador/lerDCI'
import { lerEnsaiosEquipamento } from '../../importador/lerEnsaioEquipamento'
import { resultadoComEtapas } from '../../importador/permeabilidadeApoio'
import {
  gravarPermeabilidade, tratarPermeabilidade,
  type Ensaio, type Etapa, type GravarPermeabilidade, type ModoAjuste,
} from '../../importador/tratamentoPermeabilidade'
import type { Equipamento } from '../../importador/tratamentoAcidificacao'
import { supabase } from '../../lib/supabase'
import { listarAmostras, type AmostraResumo } from '../../servicos/api'
import {
  baixarArquivo, configDoBanco, configInicial, configParaGravar, montarPedido, pedirPlanilhaEtapas, type ConfigGraficos, type DadosEnsaio,
} from '../../servicos/graficos'
import { useContexto } from '../../store/useContexto'
import { fmt, fmtData, mensagemErro, numeroParaInput, paraNumero } from '../../utils/formatacao'
import { AreaArquivo } from '../importador/comum'
import { CadastroRapidoAmostra } from './CadastroRapidoAmostra'
import { GraficosOrigin } from './GraficosOrigin'

// Tratamento de permeabilidade: o arquivo do equipamento vira etapas de vazão, ΔP estável e k (Darcy).
// Tudo na mesma tela, de cima para baixo: arquivo -> amostra -> ΔP × tempo -> etapas -> ΔP × Q -> gravar/exportar.
// As contas estão em src/importador/tratamentoPermeabilidade.ts (cópia de docs/referencia/importador);
// aqui só se montam as opções (dimensões, fração estável, janelas) e se mostra o resultado.

type Metodo = GravarPermeabilidade['metodo']
const METODOS: Metodo[] = ['ajuste ΔP × Q', 'média das etapas']
const TOLERANCIA_CADASTRO = 0.02
const MAX_PONTOS_GRAFICO = 3000
const MIGRACAO = 'banco/20261013000015_tratamento_permeabilidade.sql'
const MIGRACAO_GRAFICOS = 'banco/20261013000016_config_graficos.sql'
const MIGRACAO_AJUSTE = 'banco/20261014000017_ajuste_darcy_origin.sql'
const MIGRACAO_EQUIPAMENTO = 'banco/20261020000018_acidificacao_jbv.sql'
const MODOS_AJUSTE: { valor: ModoAjuste; texto: string }[] = [
  { valor: 'intercepto', texto: 'Com intercepto (como no Origin)' },
  { valor: 'origem', texto: 'Pela origem' },
]

const normalizar = (s: unknown) => String(s ?? '').replace(/[\s-]/g, '').toUpperCase()
/** texto do campo -> número positivo, ou null se vazio/inválido */
const positivo = (s: string) => { const n = paraNumero(s); return n != null && Number.isFinite(n) && n > 0 ? n : null }
const eixo = { fontSize: 11, fill: 'var(--grafico-texto)', fontWeight: 500 }
const estiloDica = {
  borderRadius: '10px', border: '1px solid var(--color-neutral-300)', fontSize: '12px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.06)', backgroundColor: '#fff',
}

interface Gravado { amostraId: string; codigo: string; k: number; metodo: Metodo }
interface Arrasto { ordem: number; de: number; ate: number }

export const TratamentoPermeabilidade: React.FC<{ equipamento?: Equipamento; dpDCI?: FonteDpDCI; aoDetectar?: (e: Equipamento) => void }> = ({ equipamento = 'JBV', dpDCI, aoDetectar }) => {
  // aviso quando o arquivo é do outro equipamento (o app leu pelo certo e troca o seletor)
  const [avisoEquip, setAvisoEquip] = useState<string | null>(null)
  const empresaId = useContexto((s) => s.empresaId)
  const projetoId = useContexto((s) => s.projetoId)

  // 1. arquivo
  const [nomeArquivo, setNomeArquivo] = useState('')
  /** o arquivo do equipamento, guardado para o serviço montar a planilha separada por etapa */
  const [arquivoEnsaio, setArquivoEnsaio] = useState<File | null>(null)
  const [ensaios, setEnsaios] = useState<Ensaio[]>([])
  const [iEnsaio, setIEnsaio] = useState(0)
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // 2. amostra e dimensões
  const [amostras, setAmostras] = useState<AmostraResumo[] | null>(null)
  const [amostraId, setAmostraId] = useState('')
  const [busca, setBusca] = useState('')
  // cadastro rápido da amostra que não está no catálogo
  const [cadastrando, setCadastrando] = useState(false)
  const [versaoAmostras, setVersaoAmostras] = useState(0)
  const [comprimento, setComprimento] = useState('')
  const [diametro, setDiametro] = useState('')
  const [viscosidade, setViscosidade] = useState('')
  // 3 e 4. trecho estável e etapas usadas
  const [fracao, setFracao] = useState(50)
  const [janelas, setJanelas] = useState<Record<number, [number, number]>>({})
  const [uso, setUso] = useState<Record<number, boolean>>({})
  const [arrasto, setArrasto] = useState<Arrasto | null>(null)
  // 5. reta ΔP × Q: com intercepto (como o FitLinear do Origin do laboratório) ou pela origem
  const [modoAjuste, setModoAjuste] = useState<ModoAjuste>('intercepto')
  // 6. gravação
  const [metodo, setMetodo] = useState<Metodo>('ajuste ΔP × Q')
  const [gravando, setGravando] = useState(false)
  const [gravado, setGravado] = useState<Gravado | null>(null)
  const [erroGravar, setErroGravar] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)
  const [erroExportar, setErroExportar] = useState<string | null>(null)
  // gráficos padrão Origin: começa com as últimas escolhas da pessoa; vira a do banco se a amostra já tiver uma
  const [cfgGraficos, setCfgGraficos] = useState<ConfigGraficos>(configInicial)
  const [origemCfg, setOrigemCfg] = useState<string | null>(null)

  const ensaio: Ensaio | undefined = ensaios[iEnsaio]
  // o tempo do DCI nasce em horas: mostra na unidade do equipamento (o cálculo segue em segundos por dentro)
  const un = ensaio?.equipamento === 'DCI' ? { rot: 'h', div: 3600, casas: 3 } : { rot: 's', div: 1, casas: 1 }

  useEffect(() => {
    let vivo = true
    setAmostras(null)
    listarAmostras({ projeto_id: projetoId, empresa_id: empresaId })
      .then((a) => { if (vivo) setAmostras(a) })
      .catch((e) => { if (vivo) { setAmostras([]); setErro(`Não consegui carregar as amostras: ${mensagemErro(e)}`) } })
    return () => { vivo = false }
  }, [empresaId, projetoId, versaoAmostras])

  // a amostra do cabeçalho do arquivo já vem selecionada (quando existe no projeto aberto)
  const codigoArquivo = ensaio?.metadados.amostra ?? null
  const doArquivo = useMemo(
    () => (codigoArquivo && amostras ? amostras.find((a) => normalizar(a.codigo) === normalizar(codigoArquivo)) : undefined),
    [amostras, codigoArquivo],
  )
  useEffect(() => {
    if (doArquivo) setAmostraId(doArquivo.id)
  }, [doArquivo])

  function abrirEnsaio(lista: Ensaio[], i: number) {
    const m = lista[i]?.metadados
    setIEnsaio(i)
    setComprimento(numeroParaInput(m?.comprimento_cm))
    setDiametro(numeroParaInput(m?.diametro_cm))
    setViscosidade(numeroParaInput(m?.viscosidade_cp))
    setJanelas({})
    setUso({})
    setArrasto(null)
    setGravado(null)
    setErroGravar(null)
    setCfgGraficos(configInicial())
    setOrigemCfg(null)
  }

  // reabrir: usa a configuração dos gráficos já gravada na amostra (de preferência a deste mesmo arquivo)
  useEffect(() => {
    if (!amostraId) return
    let vivo = true
    supabase.from('analise_petrofisica').select('config_graficos, arquivo_origem, data_ensaio')
      .eq('amostra_id', amostraId).not('config_graficos', 'is', null).order('id', { ascending: false }).limit(20)
      .then(({ data, error }) => {
        // sem a migração 016 a coluna não existe: segue com as preferências da pessoa
        if (!vivo || error || !data?.length) return
        const r = data.find((x) => x.arquivo_origem === nomeArquivo) ?? data[0]
        const cfg = configDoBanco(r.config_graficos)
        if (!cfg) return
        setCfgGraficos(cfg)
        setOrigemCfg(`Configuração do tratamento já gravado nesta amostra (${[r.arquivo_origem, fmtData(r.data_ensaio)].filter((x) => x && x !== '—').join(' · ') || 'sem arquivo'}).`)
      })
    return () => { vivo = false }
  }, [amostraId, nomeArquivo])

  async function carregar(arquivo?: File | null) {
    if (!arquivo) return
    setErro(null)
    if (!/\.xlsx?$/i.test(arquivo.name)) {
      setErro(`"${arquivo.name}" não é uma planilha do Excel. Escolha o arquivo .xlsx exportado pelo equipamento.`)
      return
    }
    setLendo(true)
    try {
      const lida = await lerArquivoBruto(arquivo, { textoSemConverter: true })
      const { ensaios: lista, aviso, detectado } = lerEnsaiosEquipamento(lida, equipamento, { dpDCI })
      if (lista.length === 0) {
        setErro(`Não achei a tabela de leituras em "${arquivo.name}": nenhuma aba tem as colunas "Tempo (s)" e "Q (cm³/min)". `
          + 'Confira se é o arquivo exportado pelo equipamento de coreflooding.')
        return
      }
      setAvisoEquip(aviso)
      if (detectado && detectado !== equipamento) aoDetectar?.(detectado)
      setNomeArquivo(arquivo.name)
      setArquivoEnsaio(arquivo)
      setEnsaios(lista)
      setAmostraId('')
      setBusca('')
      setCadastrando(false)
      setFracao(50)
      abrirEnsaio(lista, 0)
    } catch (e) {
      setErro(`Não consegui ler "${arquivo.name}": ${mensagemErro(e)}. `
        + 'Confira se o arquivo é um .xlsx válido, sem senha, e se não está aberto com alterações por salvar; depois escolha de novo.')
    } finally {
      setLendo(false)
    }
  }

  function recomecar() {
    setArquivoEnsaio(null)
    setErroExportar(null)
    setEnsaios([])
    setNomeArquivo('')
    setErro(null)
    setAmostraId('')
    setGravado(null)
    setErroGravar(null)
  }

  // ---- cálculo (na hora, a cada mudança) ----
  const L = positivo(comprimento), D = positivo(diametro), mu = positivo(viscosidade)
  // os campos editados valem como o cabeçalho: é o que o cálculo usa e o que vai gravado
  const ensaioCalc = useMemo<Ensaio | null>(
    () => (ensaio ? { ...ensaio, metadados: { ...ensaio.metadados, comprimento_cm: L, diametro_cm: D, viscosidade_cp: mu } } : null),
    [ensaio, L, D, mu],
  )
  const base = useMemo(
    () => (ensaioCalc ? tratarPermeabilidade(ensaioCalc, { fracaoEstavel: fracao / 100, janelas, ajuste: modoAjuste }) : null),
    [ensaioCalc, fracao, janelas, modoAjuste],
  )
  const usadas = useMemo(
    () => new Set((base?.etapas ?? []).filter((e) => uso[e.ordem] ?? e.estavel).map((e) => e.ordem)),
    [base, uso],
  )
  const resultado = useMemo(
    () => (base ? resultadoComEtapas(base, usadas, L, mu, modoAjuste) : null),
    [base, usadas, L, mu, modoAjuste],
  )
  const dadosGraficos = useMemo<DadosEnsaio | null>(
    () => (ensaio && resultado
      ? { leituras: ensaio.leituras, etapas: resultado.etapas, usadas, comprimento_cm: L, diametro_cm: D, viscosidade_cp: mu, ajuste: modoAjuste,
          tempoHoras: ensaio.equipamento === 'DCI' }
      : null),
    [ensaio, resultado, usadas, L, D, mu, modoAjuste],
  )

  const amostra = amostras?.find((a) => a.id === amostraId)
  const podeEditar = usePodeEditar(amostra?.projeto_id)
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (amostras ?? []).filter((a) => a.id === amostraId || !q
      || a.codigo?.toLowerCase().includes(q) || a.litologia?.toLowerCase().includes(q))
  }, [amostras, busca, amostraId])

  // diferença de mais de 2% entre o arquivo/tela e o cadastro da amostra
  const diferencas = [
    { nome: 'Comprimento', aqui: L, cadastro: amostra?.comprimento_cm as number | null | undefined },
    { nome: 'Diâmetro', aqui: D, cadastro: amostra?.diametro_cm as number | null | undefined },
  ].filter((d) => d.aqui != null && d.cadastro != null && Number(d.cadastro) > 0
    && Math.abs(d.aqui - Number(d.cadastro)) / Number(d.cadastro) > TOLERANCIA_CADASTRO)

  // ---- gráfico ΔP × tempo ----
  const pontos = useMemo(() => {
    if (!ensaio || !base) return []
    const ls = ensaio.leituras.filter((l) => l.dp != null)
    const passo = Math.max(1, Math.ceil(ls.length / MAX_PONTOS_GRAFICO))
    return ls.filter((_, i) => i % passo === 0).map((l) => {
      const et = base.etapas.find((e) => l.tempo_s >= e.t_inicio_s && l.tempo_s <= e.t_fim_s)
      const estavel = et != null && l.tempo_s >= et.j_inicio_s && l.tempo_s <= et.j_fim_s
      return { t: l.tempo_s, dp: l.dp as number, estavel: estavel ? (l.dp as number) : null }
    })
  }, [ensaio, base])

  const tempoDoEvento = (s: { activeTooltipIndex?: unknown } | null | undefined) => {
    const i = s?.activeTooltipIndex == null ? NaN : Number(s.activeTooltipIndex)
    return Number.isInteger(i) ? pontos[i]?.t : undefined
  }
  function iniciarArrasto(s: Parameters<typeof tempoDoEvento>[0]) {
    const t = tempoDoEvento(s)
    const et = t == null ? undefined : base?.etapas.find((e) => t >= e.t_inicio_s && t <= e.t_fim_s)
    if (t != null && et) setArrasto({ ordem: et.ordem, de: t, ate: t })
  }
  function moverArrasto(s: Parameters<typeof tempoDoEvento>[0]) {
    if (!arrasto) return
    const t = tempoDoEvento(s)
    const et = base?.etapas.find((e) => e.ordem === arrasto.ordem)
    if (t == null || !et) return
    setArrasto({ ...arrasto, ate: Math.min(Math.max(t, et.t_inicio_s), et.t_fim_s) })
  }
  function soltarArrasto() {
    if (!arrasto) return
    const [de, ate] = [Math.min(arrasto.de, arrasto.ate), Math.max(arrasto.de, arrasto.ate)]
    if (ate > de) definirJanela(arrasto.ordem, [de, ate])
    setArrasto(null)
  }

  function definirJanela(ordem: number, j: [number, number] | null) {
    setGravado(null)
    setJanelas((atual) => {
      const nova = { ...atual }
      if (j) nova[ordem] = j
      else delete nova[ordem]
      return nova
    })
  }
  function mudarJanela(et: Etapa, qual: 0 | 1, v: number) {
    const j: [number, number] = [et.j_inicio_s, et.j_fim_s]
    j[qual] = Math.min(Math.max(v, et.t_inicio_s), et.t_fim_s)
    if (j[1] > j[0]) definirJanela(et.ordem, j)
  }

  // ---- gráfico ΔP × Q ----
  const etapas = resultado?.etapas ?? []
  const comDp = etapas.filter((e) => e.dp_medio != null)
  const ptsUsados = comDp.filter((e) => usadas.has(e.ordem)).map((e) => ({ q: e.q, dp: e.dp_medio as number, ordem: e.ordem }))
  const ptsFora = comDp.filter((e) => !usadas.has(e.ordem)).map((e) => ({ q: e.q, dp: e.dp_medio as number, ordem: e.ordem }))
  const qMax = Math.max(0, ...comDp.map((e) => e.q)) * 1.1
  const aj = resultado?.ajuste ?? null
  // com intercepto a reta começa na metade da menor vazão (como no Origin), não no zero
  const q0 = aj && aj.modo === 'intercepto' && ptsUsados.length ? Math.min(...ptsUsados.map((p) => p.q)) * 0.5 : 0
  const reta = aj ? [{ q: q0, ajuste: aj.inclinacao * q0 + aj.intercepto }, { q: qMax, ajuste: aj.inclinacao * qMax + aj.intercepto }] : []
  const kOutraReta = aj ? (aj.modo === 'intercepto' ? aj.k_md_pela_origem : aj.k_md_com_intercepto) : null

  // ---- gravar e exportar ----
  const kAjuste = aj?.k_md ?? null
  const kMedia = resultado?.k_medio_md ?? null
  const kEscolhido = metodo === 'ajuste ΔP × Q' ? kAjuste : kMedia
  const outraAmostra = Boolean(amostra && codigoArquivo && normalizar(amostra.codigo) !== normalizar(codigoArquivo))

  async function gravar() {
    if (!ensaioCalc || !resultado || !amostra || kEscolhido == null) return
    const confirmacao = [
      `Gravar k = ${fmt(kEscolhido, 2)} mD (${metodo}) na amostra ${amostra.codigo}?`,
      outraAmostra && `• ATENÇÃO: o arquivo é da amostra ${codigoArquivo}, não de ${amostra.codigo}.`,
      '• Será criada uma petrofísica "antes" com k em fluxo, '
        + `${resultado.etapas.length} etapa(s) de vazão (${usadas.size} usada(s)) e a curva ΔP × tempo.`,
      'Nada é apagado: se este ensaio já foi gravado antes, ficará em duplicidade.',
    ].filter(Boolean).join('\n')
    if (!confirm(confirmacao)) return
    setErroGravar(null)
    setGravando(true)
    try {
      const r = await gravarPermeabilidade(supabase, {
        amostraId: amostra.id, ensaio: ensaioCalc, resultado, metodo, etapasUsadas: [...usadas], arquivo: nomeArquivo,
        equipamento: ensaioCalc.equipamento ?? equipamento,
        configGraficos: configParaGravar(cfgGraficos, resultado.etapas),
      })
      setGravado({ amostraId: amostra.id, codigo: amostra.codigo, k: r.k, metodo })
    } catch (e) {
      const msg = mensagemErro(e)
      setErroGravar(
        /Failed to fetch|NetworkError|Load failed/i.test(msg)
          ? 'Sem conexão com o Supabase. Confira a internet e, antes de gravar de novo, veja na ficha da amostra (1. Petrofísica) se o registro já entrou.'
          : /migração 017/.test(msg)
            ? `${msg}: rode ${MIGRACAO_AJUSTE} no SQL Editor do Supabase e grave de novo (nada foi gravado).`
          : /migração 018/.test(msg)
            ? `${msg}: rode ${MIGRACAO_EQUIPAMENTO} no SQL Editor do Supabase e grave de novo (nada foi gravado).`
          : /config_graficos/.test(msg)
            ? `${msg} O banco ainda não tem a coluna da configuração dos gráficos: rode ${MIGRACAO_GRAFICOS} no SQL Editor do Supabase e grave de novo (nada foi gravado).`
          : /does not exist|schema cache|Could not find/i.test(msg)
            ? `${msg} O banco ainda não tem as colunas/tabela do tratamento de permeabilidade: rode ${MIGRACAO} no SQL Editor do Supabase e grave de novo.`
            : /^analise_petrofisica|Sem permissão/.test(msg) ? msg
              : `${msg} A petrofísica já foi criada antes do erro: apague-a na ficha da amostra (1. Petrofísica) antes de gravar de novo.`,
      )
    } finally {
      setGravando(false)
    }
  }

  // planilha separada por etapa no formato do pesquisador: quem monta é o serviço Python, a partir do próprio arquivo
  async function exportar() {
    if (!arquivoEnsaio || !resultado) return
    setErroExportar(null)
    setExportando(true)
    try {
      const xlsx = await pedirPlanilhaEtapas(arquivoEnsaio, {
        etapas: resultado.etapas.map((e) => ({
          ordem: e.ordem, q: e.q, j_inicio: e.j_inicio_s, j_fim: e.j_fim_s, dp_medio: e.dp_medio, dp_desvio: e.dp_desvio,
          n_pontos: e.n_pontos, volume_injetado_cm3: e.volume_injetado_cm3, volume_bombeado_cm3: e.volume_bombeado_cm3,
          k_md: e.k_md, usada: usadas.has(e.ordem),
        })),
        metodo_k: metodo, comprimento_cm: L, diametro_cm: D, viscosidade_cp: mu, ajuste: modoAjuste,
        aba: ensaio?.aba ?? null,
        dp_dci: dpDCI,
        // os gráficos vão como estão na tela (cores, rótulos, sequência/sobrepostas...)
        grafico: dadosGraficos ? montarPedido(dadosGraficos, cfgGraficos, 'combinado', 'png', 200) : undefined,
      })
      baixarArquivo(xlsx, `${nomeArquivo.replace(/\.[^.]+$/, '')}_etapas.xlsx`)
    } catch (e) {
      setErroExportar(`Não consegui gerar a planilha separada: ${mensagemErro(e)}`)
    } finally {
      setExportando(false)
    }
  }


  const m = ensaio?.metadados
  const garrafas = m ? Object.entries(m.garrafas).map(([g, c]) => `G${g}: ${c}`).join(' · ') : ''

  return (
    <>
      {/* 1. arquivo */}
      <Card
        titulo="1. Arquivo do equipamento"
        subtitulo="Exportação do ensaio de permeabilidade (.xlsx). Nada é gravado até você confirmar no passo 6."
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
                ? <>Log do DCI (.xlsx) · colunas “Timestamp (hours)”, “VPA n Flow Rate” e “Core B Differential Pressure”</>
                : <>Arquivo do JBV (.xlsx) · cabeçalho “Chave: valor” e tabela com “Tempo (s)” e “Q (cm³/min)”</>} />
          )
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <FileSpreadsheet size={20} className="text-[var(--color-blue)]" />
              <strong>{nomeArquivo}</strong>
              <span className="tag tag-neutral">{ensaio.leituras.length} leituras</span>
              <span className="tag tag-neutral">holder {ensaio.holder}</span>
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
              <Dado rotulo="Comprimento (cm)">{fmt(m?.comprimento_cm, 3)}</Dado>
              <Dado rotulo="Diâmetro (cm)">{fmt(m?.diametro_cm, 3)}</Dado>
              <Dado rotulo="Porosidade (%)">{fmt(m?.porosidade_pct, 2)}</Dado>
              <Dado rotulo="Viscosidade (cP)">{fmt(m?.viscosidade_cp, 3)}</Dado>
              {garrafas && <div className="col-span-2 md:col-span-4"><Dado rotulo="Garrafas">{garrafas}</Dado></div>}
            </div>
            {!m?.amostra && (
              <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">
                Esta aba não tem o cabeçalho do equipamento (é a tabela já separada): escolha a amostra e informe as dimensões e a viscosidade no passo 2.
              </p>
            )}
          </div>
        )}
      </Card>

      {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
      {avisoEquip && <Alert tipo="info" mensagem={avisoEquip} onClose={() => setAvisoEquip(null)} />}

      {ensaio && base && resultado && (
        <>
          {/* 2. amostra */}
          <Card titulo="2. Amostra e dimensões" subtitulo="O k usa o comprimento, o diâmetro e a viscosidade destes campos (vêm do cabeçalho do arquivo).">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="Buscar amostra" placeholder="código ou litologia" value={busca} disabled={gravando}
                  onChange={(e) => setBusca(e.target.value)} />
                <div className="md:col-span-2">
                  <Select label="Amostra do projeto" obrigatorio value={amostraId} disabled={gravando}
                    onChange={(e) => { setAmostraId(e.target.value); setGravado(null) }}>
                    <option value="">{amostras ? 'Escolha a amostra…' : 'Carregando amostras…'}</option>
                    {visiveis.map((a) => (
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
                <Input label="Viscosidade" unidade="cP" inputMode="decimal" value={viscosidade} disabled={gravando}
                  error={viscosidade.trim() && mu == null ? 'Número maior que zero' : undefined}
                  onChange={(e) => { setViscosidade(e.target.value); setGravado(null) }} />
              </div>
              {diferencas.length > 0 && (
                <div className="aviso aviso-erro flex items-start gap-2.5" role="alert">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="m-0 font-semibold">Diferença de mais de 2% em relação ao cadastro da amostra {amostra?.codigo}:</p>
                    <ul className="m-0 mt-1 pl-5">
                      {diferencas.map((d) => (
                        <li key={d.nome}>
                          {d.nome}: <strong>{fmt(d.aqui, 3)} cm</strong> aqui × <strong>{fmt(d.cadastro, 3)} cm</strong> no cadastro
                          {' '}({fmt((100 * ((d.aqui as number) - Number(d.cadastro))) / Number(d.cadastro), 1)}%)
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* 3. ΔP × tempo */}
          <Card titulo="3. ΔP × tempo" subtitulo="Cada faixa é uma etapa de vazão; em laranja, o trecho estável que entra no cálculo. Arraste dentro de uma etapa para escolher o trecho.">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <label className="flex items-center gap-3 text-[13px]">
                  <span className="rotulo">Fração final estável</span>
                  <input type="range" min={5} max={100} step={5} value={fracao} disabled={gravando}
                    onChange={(e) => { setFracao(Number(e.target.value)); setGravado(null) }} aria-label="Fração final estável (%)" />
                  <strong className="w-[44px] tabular-nums">{fracao}%</strong>
                </label>
                {Object.keys(janelas).length > 0 && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setJanelas({}); setGravado(null) }}>
                    <Undo2 size={13} /> Voltar todos os trechos à fração ({Object.keys(janelas).length} ajustado(s) à mão)
                  </button>
                )}
                <span className="ml-auto flex items-center gap-4 text-[12px] text-[var(--color-neutral-600)]">
                  <span className="flex items-center gap-1.5"><i className="inline-block h-[2px] w-[18px] bg-[var(--grafico-serie-1)]" /> ΔP (psi)</span>
                  <span className="flex items-center gap-1.5"><i className="inline-block h-[4px] w-[18px] bg-[var(--grafico-serie-2)]" /> trecho estável usado</span>
                </span>
              </div>

              {base.etapas.length === 0 ? (
                <Alert tipo="erro" mensagem="Nenhuma etapa de vazão encontrada: a coluna Q (cm³/min) está sempre em zero ou os trechos têm menos de 5 leituras." />
              ) : (
                <div style={{ userSelect: 'none', cursor: 'crosshair' }} onMouseLeave={soltarArrasto}>
                  <ResponsiveContainer width="100%" height={340}>
                    <LineChart data={pontos} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
                      onMouseDown={iniciarArrasto} onMouseMove={moverArrasto} onMouseUp={soltarArrasto}>
                      <CartesianGrid stroke="var(--grafico-grade)" vertical={false} />
                      {base.etapas.map((e, i) => (
                        <ReferenceArea key={`etapa-${e.ordem}`} x1={e.t_inicio_s} x2={e.t_fim_s} strokeOpacity={0}
                          fill={i % 2 ? 'var(--color-neutral-200)' : 'var(--color-blue-100)'} fillOpacity={0.45}
                          label={{ value: `Q = ${fmt(e.q, 2)} cm³/min`, position: 'insideTop', fontSize: 11, fontWeight: 600, fill: 'var(--color-neutral-700)' }} />
                      ))}
                      {base.etapas.map((e) => (
                        <ReferenceArea key={`janela-${e.ordem}`} x1={e.j_inicio_s} x2={e.j_fim_s}
                          fill="var(--color-orange-200)" fillOpacity={0.45} stroke="var(--color-orange)" strokeOpacity={0.7} strokeDasharray="3 3" />
                      ))}
                      {arrasto && arrasto.ate !== arrasto.de && (
                        <ReferenceArea x1={Math.min(arrasto.de, arrasto.ate)} x2={Math.max(arrasto.de, arrasto.ate)}
                          fill="var(--color-red)" fillOpacity={0.18} stroke="var(--color-red)" />
                      )}
                      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tick={eixo} tickLine={false}
                        axisLine={{ stroke: 'var(--color-neutral-300)' }} tickFormatter={(v) => fmt(v / un.div, un.div > 1 ? 2 : 0)} />
                      <YAxis width={56} domain={[0, 'auto']} tick={eixo} tickLine={false} axisLine={{ stroke: 'var(--color-neutral-300)' }}
                        tickFormatter={(v) => fmt(v, 2)}
                        label={{ value: 'ΔP (psi)', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--grafico-texto)', fontWeight: 600, style: { textAnchor: 'middle' } }} />
                      <Tooltip contentStyle={estiloDica} labelStyle={{ fontWeight: 800, marginBottom: 4 }}
                        cursor={{ stroke: 'var(--color-neutral-400)', strokeDasharray: '3 3' }}
                        labelFormatter={(t) => `t = ${fmt(Number(t) / un.div, un.casas)} ${un.rot}`}
                        formatter={(v, nome) => [`${fmt(v, 3)} psi`, nome === 'estavel' ? 'no trecho estável' : 'ΔP']} />
                      <Line dataKey="dp" type="linear" stroke="var(--grafico-serie-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line dataKey="estavel" type="linear" stroke="var(--grafico-serie-2)" strokeWidth={4} dot={false}
                        isAnimationActive={false} connectNulls={false} activeDot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="m-0 mt-1 text-center text-[11px] font-semibold text-[var(--grafico-texto)]">{`Tempo (${un.rot})`}</p>
                </div>
              )}
            </div>
          </Card>

          {/* 4. etapas */}
          <Card titulo="4. Etapas de vazão" subtitulo="Estável = CV do ΔP no trecho usado até 5%. Marque em “usar” as etapas que entram no k da amostra.">
            <div className="-mx-6 -my-6 overflow-x-auto px-6">
              <table className="table text-[12px]">
                <thead>
                  <tr>
                    <th>#</th><th className="text-right">Q (cm³/min)</th><th className="text-right">{`Duração (${un.rot})`}</th>
                    <th>{`Trecho usado (${un.rot})`}</th><th className="text-right">Pontos</th>
                    <th className="text-right">ΔP médio ± desvio (psi)</th><th className="text-right">CV (%)</th>
                    <th className="text-right" title="Q × duração">V injetado (cm³)</th>
                    <th className="text-right" title="Variação do volume da garrafa, lida pela bomba">V bombeado (cm³)</th>
                    <th className="text-right">k da etapa (mD)</th><th className="text-right">k do equipamento (mD)</th>
                    <th>Situação</th><th>Usar</th>
                  </tr>
                </thead>
                <tbody>
                  {etapas.map((e) => (
                    <tr key={e.ordem} className="lcp-row">
                      <td className="!py-2 font-semibold">{e.ordem}</td>
                      <td className="!py-2 text-right tabular-nums">{fmt(e.q, 2)}</td>
                      <td className="!py-2 text-right tabular-nums">{fmt((e.t_fim_s - e.t_inicio_s) / un.div, un.div > 1 ? 3 : 0)}</td>
                      <td className="!py-2">
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <CampoTempo valor={e.j_inicio_s / un.div} casas={un.div > 1 ? 4 : 1} rotulo={`Início do trecho estável da etapa ${e.ordem} (${un.rot})`}
                            desabilitado={gravando} aoMudar={(v) => mudarJanela(e, 0, v * un.div)} />
                          –
                          <CampoTempo valor={e.j_fim_s / un.div} casas={un.div > 1 ? 4 : 1} rotulo={`Fim do trecho estável da etapa ${e.ordem} (${un.rot})`}
                            desabilitado={gravando} aoMudar={(v) => mudarJanela(e, 1, v * un.div)} />
                          {janelas[e.ordem] && (
                            <button type="button" className="btn-icone" title="Voltar à fração final estável"
                              onClick={() => definirJanela(e.ordem, null)}>
                              <Undo2 size={13} />
                            </button>
                          )}
                        </span>
                      </td>
                      <td className="!py-2 text-right tabular-nums">{e.n_pontos}</td>
                      <td className="!py-2 text-right tabular-nums">{fmt(e.dp_medio, 3)} ± {fmt(e.dp_desvio, 3)}</td>
                      <td className="!py-2 text-right tabular-nums">{fmt(e.dp_cv_pct, 1)}</td>
                      <td className="!py-2 text-right tabular-nums">{fmt(e.volume_injetado_cm3, 2)}</td>
                      <td className="!py-2 text-right tabular-nums">{fmt(e.volume_bombeado_cm3, 2)}</td>
                      <td className="!py-2 text-right tabular-nums font-semibold">{fmt(e.k_md, 2)}</td>
                      <td className="!py-2 text-right tabular-nums">{fmt(e.k_equipamento_md, 2)}</td>
                      <td className="!py-2">
                        <span className={`tag whitespace-nowrap ${e.estavel ? 'tag-blue' : 'tag-accent'}`}>{e.estavel ? 'estável' : 'não estabilizou'}</span>
                      </td>
                      <td className="!py-2">
                        <input type="checkbox" checked={usadas.has(e.ordem)} disabled={gravando || e.dp_medio == null}
                          aria-label={`Usar a etapa ${e.ordem} no k da amostra`}
                          onChange={(ev) => { setUso((u) => ({ ...u, [e.ordem]: ev.target.checked })); setGravado(null) }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* gráficos padrão Origin (serviço Python) */}
          {dadosGraficos && etapas.length > 0 && (
            <GraficosOrigin dados={dadosGraficos} config={cfgGraficos} desabilitado={gravando} origemConfig={origemCfg}
              nomeBase={(amostra?.codigo || nomeArquivo.replace(/\.[^.]+$/, '') || 'permeabilidade').replace(/[\\/:*?"<>|\s]+/g, '_')}
              aoMudar={setCfgGraficos} />
          )}

          {/* 5. ΔP × Q */}
          <Card titulo="5. ΔP × Q" subtitulo="Pontos = ΔP médio das etapas usadas; a permeabilidade vem da inclinação da reta (lei de Darcy).">
            <div className="flex flex-col gap-5">
              <div className="max-w-xs">
                <Select label="Reta ΔP × Q" value={modoAjuste} disabled={gravando || gravado != null}
                  onChange={(e) => setModoAjuste(e.target.value as ModoAjuste)}>
                  {MODOS_AJUSTE.map((x) => <option key={x.valor} value={x.valor}>{x.texto}</option>)}
                </Select>
              </div>
              {resultado.avisos.length > 0 && (
                <div className="aviso aviso-erro flex items-start gap-2.5" role="alert">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <ul className="m-0 list-none p-0 leading-[1.6]">
                    {resultado.avisos.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="flex flex-col gap-5">
                  <div>
                    <p className="rotulo m-0">Permeabilidade (mD)</p>
                    <p className="numero m-0 mt-1.5 text-[30px] leading-none">{fmt(kAjuste, 2)} <span className="text-[14px]">mD</span></p>
                    <p className="m-0 mt-1.5 text-[12px] text-[var(--color-neutral-600)]">
                      {aj
                        ? <>
                            ΔP = {fmt(aj.inclinacao, 4)}·Q{aj.modo === 'intercepto' && <> {aj.intercepto < 0 ? '−' : '+'} {fmt(Math.abs(aj.intercepto), 4)}</>}
                            {' '}· R² = {aj.r2.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} · {ptsUsados.length} etapa(s)
                          </>
                        : 'precisa de pelo menos 2 etapas usadas (em vazões diferentes), comprimento, diâmetro e viscosidade'}
                    </p>
                    {kOutraReta != null && Number.isFinite(kOutraReta) && (
                      <p className="m-0 mt-1 text-[11px] text-[var(--color-neutral-500)]">
                        pela outra reta ({aj?.modo === 'intercepto' ? 'pela origem' : 'com intercepto'}): {fmt(kOutraReta, 2)} mD
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="rotulo m-0">k (média das etapas)</p>
                    <p className="numero m-0 mt-1.5 text-[30px] leading-none">{fmt(kMedia, 2)} <span className="text-[14px]">mD</span></p>
                    <p className="m-0 mt-1.5 text-[12px] text-[var(--color-neutral-600)]">
                      média do k das {usadas.size} etapa(s) usada(s) · área {fmt(resultado.area_cm2, 3)} cm²
                    </p>
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid stroke="var(--grafico-grade)" />
                      <XAxis dataKey="q" type="number" domain={[0, qMax || 1]} tick={eixo} tickLine={false} allowDuplicatedCategory={false}
                        axisLine={{ stroke: 'var(--color-neutral-300)' }} tickFormatter={(v) => fmt(v, 2)} />
                      <YAxis width={56} type="number" domain={[0, 'auto']} tick={eixo} tickLine={false} axisLine={{ stroke: 'var(--color-neutral-300)' }}
                        tickFormatter={(v) => fmt(v, 2)}
                        label={{ value: 'ΔP médio (psi)', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--grafico-texto)', fontWeight: 600, style: { textAnchor: 'middle' } }} />
                      <Tooltip contentStyle={estiloDica} cursor={{ stroke: 'var(--color-neutral-400)', strokeDasharray: '3 3' }}
                        labelFormatter={(q) => `Q = ${fmt(q, 2)} cm³/min`}
                        formatter={(v, nome) => [`${fmt(v, 3)} psi`, nome === 'ajuste' ? 'reta do ajuste' : nome === 'fora' ? 'etapa não usada' : 'etapa usada']} />
                      <Line data={reta} dataKey="ajuste" type="linear" stroke="var(--grafico-linha)" strokeWidth={2} dot={false}
                        activeDot={false} isAnimationActive={false} />
                      <Scatter data={ptsFora} dataKey="dp" name="fora" fill="#fff" stroke="var(--color-neutral-500)" strokeWidth={2} isAnimationActive={false} />
                      <Scatter data={ptsUsados} dataKey="dp" name="usada" fill="var(--grafico-serie-1)" stroke="#fff" strokeWidth={2} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <p className="m-0 mt-1 text-center text-[11px] font-semibold text-[var(--grafico-texto)]">Q (cm³/min)</p>
                  <p className="m-0 mt-2 flex flex-wrap justify-center gap-4 text-[12px] text-[var(--color-neutral-600)]">
                    <span className="flex items-center gap-1.5"><i className="inline-block h-[10px] w-[10px] rounded-full bg-[var(--grafico-serie-1)]" /> etapa usada</span>
                    <span className="flex items-center gap-1.5"><i className="inline-block h-[10px] w-[10px] rounded-full border-2 border-[var(--color-neutral-500)] bg-white" /> etapa não usada</span>
                    <span className="flex items-center gap-1.5"><i className="inline-block h-[2px] w-[18px] bg-[var(--grafico-linha)]" /> {modoAjuste === 'origem' ? 'ajuste pela origem' : 'ajuste com intercepto (como no Origin)'}</span>
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* 6. gravar e exportar */}
          <Card titulo="6. Gravar e exportar" subtitulo="A gravação cria uma petrofísica “antes” na amostra, com k em fluxo, as etapas de vazão e a curva ΔP × tempo.">
            <div className="flex flex-col gap-4">
              <fieldset className="m-0 flex flex-wrap gap-x-6 gap-y-2 border-0 p-0" disabled={gravando || gravado != null}>
                <legend className="rotulo mb-2 p-0">k que vai para a petrofísica</legend>
                {METODOS.map((x) => (
                  <label key={x} className="flex cursor-pointer items-center gap-2 text-[13px]">
                    <input type="radio" name="metodo-k" checked={metodo === x} onChange={() => setMetodo(x)} />
                    {x}: <strong className="tabular-nums">{fmt(x === 'ajuste ΔP × Q' ? kAjuste : kMedia, 2)} mD</strong>
                  </label>
                ))}
              </fieldset>

              {erroGravar && <Alert tipo="erro" mensagem={erroGravar} onClose={() => setErroGravar(null)} />}
              {erroExportar && <Alert tipo="erro" mensagem={erroExportar} onClose={() => setErroExportar(null)} />}

              {gravado && (
                <div className="aviso aviso-ok" role="status">
                  <p className="m-0 flex items-center gap-2 font-semibold">
                    <CheckCircle2 size={16} /> Gravado na amostra {gravado.codigo}: k = {fmt(gravado.k, 2)} mD ({gravado.metodo}).
                  </p>
                  <Link className="btn btn-blue mt-3" to={`/amostras/${gravado.amostraId}?aba=petrofisica`}>
                    <ExternalLink size={14} /> Abrir ficha da amostra
                  </Link>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                {!gravado && (
                  <button type="button" className="btn btn-primary" onClick={gravar}
                    disabled={gravando || !amostra || kEscolhido == null || !podeEditar}>
                    {gravando ? <><Loader2 size={14} className="animate-spin" /> Gravando…</> : <><Save size={14} /> Gravar na amostra</>}
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={exportar} disabled={etapas.length === 0 || exportando}>
                  {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Exportar planilha separada (.xlsx)
                </button>
                {!gravado && (
                  <span className="text-[12px] text-[var(--color-red-700)]">
                    {!amostra ? 'Escolha a amostra no passo 2.'
                      : !podeEditar ? `Seu usuário não é editor do projeto da amostra ${amostra.codigo}.`
                        : kEscolhido == null ? `Não há k por ${metodo}: confira as dimensões, a viscosidade e as etapas usadas.` : ''}
                  </span>
                )}
              </div>
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

/** Campo de tempo do trecho estável (na unidade mostrada: s ou h): só aplica ao sair do campo ou no Enter. */
function CampoTempo(p: { valor: number; rotulo: string; casas?: number; desabilitado?: boolean; aoMudar: (v: number) => void }) {
  const f = 10 ** (p.casas ?? 1)
  const original = numeroParaInput(Math.round(p.valor * f) / f)
  const [texto, setTexto] = useState(original)
  useEffect(() => { setTexto(original) }, [original])
  function aplicar() {
    const n = paraNumero(texto)
    if (n == null || !Number.isFinite(n) || numeroParaInput(n) === original) { setTexto(original); return }
    p.aoMudar(n)
    // se o valor for recusado (fora da etapa, início depois do fim) o campo volta ao que está valendo
    setTexto(original)
  }
  return (
    <input className="input !w-[88px] !px-2 !py-1 text-right tabular-nums" inputMode="decimal" aria-label={p.rotulo} title={p.rotulo}
      value={texto} disabled={p.desabilitado}
      onChange={(e) => setTexto(e.target.value)} onBlur={aplicar}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
  )
}
