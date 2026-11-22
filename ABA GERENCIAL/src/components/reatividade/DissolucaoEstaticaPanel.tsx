import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Atom,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  FlaskConical,
  Gauge,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react'
import { Alert } from '../UI'
import { confirmar } from '../Confirmar'
import { listarAmostras, listarSistemasAcidos, type AmostraResumo } from '../../servicos/api'
import {
  atualizarConfigGraficoReatividade,
  buscarAmostrasPorCodigos,
  cadastrarMiniPlugs,
  excluirEnsaioReatividade,
  exportarExcelReatividadeBlob,
  gerarGraficoAABlob,
  gerarGraficoPerdaMassaBlob,
  gerarGraficoT50Blob,
  listarEnsaiosReatividade,
  listarPontosPorEnsaios,
  obterEnsaioReatividadeCompleto,
  salvarEnsaioReatividade,
  type AmostraEncontrada,
  type EstiloOriginPayload,
  type RochaDeOrigem,
  type SeriePerdaMassaPayload,
} from '../../servicos/reatividade'
import {
  CAL_CA_INTERCEPT_PADRAO,
  CAL_CA_SLOPE_PADRAO,
  calcularGuiaRda,
  calcularRegressaoLinear,
  calcularResumoEstagios,
  calcularT50,
  formatarTempoMinSeg,
  lerPlanilhaReatividade,
  MASSA_MOLAR_CA_PADRAO,
  MASSA_MOLAR_MG_PADRAO,
  type PontoImportado,
  type ResultadoImportacaoReatividade,
  type SondagemImportada,
} from '../../importador/planilhaReatividade'
import { useContexto } from '../../store/useContexto'
import type {
  ConfigGraficoReatividade,
  GeometriaReatividade,
  LitologiaReatividade,
  ModalidadeReatividade,
  ModoCalculoPct,
  ReatividadeEnsaio,
  ReatividadePonto,
  SistemaAcido,
} from '../../tipos/banco'
import {
  EditorGraficoOriginLegenda,
  type ItemLegendaPreview,
} from './EditorGraficoOriginLegenda'
import { GradeDissolucao, StatusMiniPlug } from './GradeDissolucao'
import { codigoMiniPlug, sugestaoMiniPlug } from './miniPlugs'

type SubAba = 'sondagem' | 'dissolucao' | 'aa'
type TipoGrafico = 't50' | 'perda_massa' | 'aa'

interface LinhaSondagemForm {
  key: string
  ordem: number
  codigo_mini_plug: string
  massa_inicial_g: string
  tempo_contato_min: string
  massa_final_g: string
  escolhido: boolean
}

export interface CelulaPontoForm {
  codigo_mini_plug: string
  massa_inicial_g: string
  massa_final_g: string
  fator_diluicao_ca: string
  abs_ca: string
  fator_diluicao_mg: string
  abs_mg: string
}

interface LinhaCalibracaoForm {
  key: string
  elemento: 'Ca' | 'Mg'
  concentracao_mg_l: string
  absorbancia_med: string
}

interface FormEnsaio {
  codigo: string
  amostra_id: string
  id_sistema: string
  geometria: GeometriaReatividade
  modalidade: ModalidadeReatividade
  litologia: LitologiaReatividade
  data_ensaio: string
  operador: string
  ph_inicial: string
  h_inicial_mol_l: string
  volume_solucao_ml: string
  temperatura_c: string
  rpm_rda: string
  cal_ca_slope: string
  cal_ca_intercept: string
  cal_mg_slope: string
  cal_mg_intercept: string
  massa_molar_ca: string
  massa_molar_mg: string
  modo_calculo_pct: ModoCalculoPct
  observacoes: string
}

const CORES_SERIES = ['#1f4e78', '#b81d24', '#005a32', '#d95f02', '#6a51a3', '#008080']
const MARCADORES_SERIES = ['s', 'o', '^', 'D', 'v', 'P']
const NOMES_REPLICAS = ['Original', 'Duplicata', 'Triplicata'] as const

const CONFIG_GRAFICO_PADRAO: Required<ConfigGraficoReatividade> = {
  legend_xy: [0.04, 0.94],
  legend_frame: true,
  legend_fontsize: 9,
  font_family: 'Arial',
  show_error_bars: true,
  show_trendline: true,
}

function formInicial(): FormEnsaio {
  return {
    codigo: '',
    amostra_id: '',
    id_sistema: '',
    geometria: 'mini_plug',
    modalidade: 'estatica',
    litologia: 'calcario',
    data_ensaio: new Date().toISOString().slice(0, 10),
    operador: '',
    ph_inicial: '',
    h_inicial_mol_l: '4.4',
    volume_solucao_ml: '100',
    temperatura_c: '25',
    rpm_rda: '',
    cal_ca_slope: String(CAL_CA_SLOPE_PADRAO),
    cal_ca_intercept: String(CAL_CA_INTERCEPT_PADRAO),
    cal_mg_slope: '',
    cal_mg_intercept: '',
    massa_molar_ca: String(MASSA_MOLAR_CA_PADRAO),
    massa_molar_mg: String(MASSA_MOLAR_MG_PADRAO),
    modo_calculo_pct: 'media_replicas',
    observacoes: '',
  }
}

function gradeVazia(): Record<string, CelulaPontoForm> {
  const m: Record<string, CelulaPontoForm> = {}
  for (let est = 1; est <= 4; est++) {
    for (let rep = 1; rep <= 3; rep++) {
      m[`${est}-${rep}`] = {
        codigo_mini_plug: '',
        massa_inicial_g: '',
        massa_final_g: '',
        fator_diluicao_ca: '2250',
        abs_ca: '',
        fator_diluicao_mg: '1',
        abs_mg: '',
      }
    }
  }
  return m
}

function sondagensIniciais(): LinhaSondagemForm[] {
  return [
    { key: 's1', ordem: 1, codigo_mini_plug: '', massa_inicial_g: '', tempo_contato_min: '2', massa_final_g: '', escolhido: false },
    { key: 's2', ordem: 2, codigo_mini_plug: '', massa_inicial_g: '', tempo_contato_min: '4', massa_final_g: '', escolhido: true },
    { key: 's3', ordem: 3, codigo_mini_plug: '', massa_inicial_g: '', tempo_contato_min: '6', massa_final_g: '', escolhido: false },
  ]
}

function nOuNull(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

function fmtNum(v: number | null | undefined, casas = 2): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const DissolucaoEstaticaPanel: React.FC = () => {
  const empresaId = useContexto((s) => s.empresaId)
  const projetoId = useContexto((s) => s.projetoId)

  const [subAba, setSubAba] = useState<SubAba>('sondagem')
  const [tipoGrafico, setTipoGrafico] = useState<TipoGrafico>('t50')

  // Catálogos e lista de ensaios salvos
  const [amostras, setAmostras] = useState<AmostraResumo[]>([])
  const [sistemas, setSistemas] = useState<SistemaAcido[]>([])
  const [ensaios, setEnsaios] = useState<ReatividadeEnsaio[]>([])
  const [ensaioAtualId, setEnsaioAtualId] = useState<string | null>(null)
  const [carregandoLista, setCarregandoLista] = useState(true)

  // Estado do formulário do ensaio ativo
  const [form, setForm] = useState<FormEnsaio>(formInicial)
  const [sondagens, setSondagens] = useState<LinhaSondagemForm[]>(sondagensIniciais)
  const [temposEstagioS, setTemposEstagioS] = useState<[number, number, number, number]>([60, 120, 180, 240])
  const [grade, setGrade] = useState<Record<string, CelulaPontoForm>>(gradeVazia)
  const [calibracao, setCalibracao] = useState<LinhaCalibracaoForm[]>([])
  const [mostrarCalibracao, setMostrarCalibracao] = useState(false)
  const [configGrafico, setConfigGrafico] = useState<Required<ConfigGraficoReatividade>>(CONFIG_GRAFICO_PADRAO)

  // Sobreposição comparativa (outros ensaios da mesma rocha/litologia)
  const [compararIds, setCompararIds] = useState<string[]>([])
  const [pontosComparacao, setPontosComparacao] = useState<ReatividadePonto[]>([])

  // Importação Excel (prévia com avisos/erros antes de aplicar)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [previaImportacao, setPreviaImportacao] = useState<ResultadoImportacaoReatividade | null>(null)

  // Mensagens e loading
  const [salvando, setSalvando] = useState(false)
  const [baixandoModelo, setBaixandoModelo] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'sucesso' | 'erro' | 'info'; texto: string } | null>(null)

  // Gráfico Origin (prévia)
  const [urlGrafico, setUrlGrafico] = useState<string | null>(null)
  const [carregandoGrafico, setCarregandoGrafico] = useState(false)
  const [erroGrafico, setErroGrafico] = useState<string | null>(null)
  const [versaoGrafico, setVersaoGrafico] = useState(0)

  // Mini-plugs já cadastrados como amostra (chave = código normalizado)
  const [existentes, setExistentes] = useState<Map<string, AmostraEncontrada>>(new Map())

  // Carrega catálogos e ensaios salvos
  const recarregarCatalogos = useCallback(async () => {
    setCarregandoLista(true)
    try {
      const [ams, sis, ens] = await Promise.all([
        listarAmostras({ empresa_id: empresaId ?? undefined, projeto_id: projetoId ?? undefined }).catch(() => []),
        listarSistemasAcidos().catch(() => []),
        listarEnsaiosReatividade().catch(() => []),
      ])
      setAmostras(ams)
      setSistemas(sis)
      setEnsaios(ens)
    } finally {
      setCarregandoLista(false)
    }
  }, [empresaId, projetoId])

  useEffect(() => {
    void recarregarCatalogos()
  }, [recarregarCatalogos])

  // Sincroniza aba do gráfico ao trocar de sub-aba
  useEffect(() => {
    if (subAba === 'sondagem') setTipoGrafico('t50')
    else if (subAba === 'dissolucao') setTipoGrafico('perda_massa')
    else setTipoGrafico('aa')
  }, [subAba])

  // Carrega pontos dos ensaios marcados para sobreposição comparativa
  useEffect(() => {
    if (compararIds.length === 0) {
      setPontosComparacao([])
      return
    }
    let ativo = true
    listarPontosPorEnsaios(compararIds)
      .then((pts) => {
        if (ativo) setPontosComparacao(pts)
      })
      .catch(() => {
        if (ativo) setPontosComparacao([])
      })
    return () => {
      ativo = false
    }
  }, [compararIds])

  // Limpa URL object anterior ao trocar imagem
  useEffect(() => {
    return () => {
      if (urlGrafico) URL.revokeObjectURL(urlGrafico)
    }
  }, [urlGrafico])

  // Rocha do ensaio e códigos dos mini-plugs digitados (sondagens + grade)
  const rocha = useMemo(() => amostras.find((a) => a.id === form.amostra_id) ?? null, [amostras, form.amostra_id])
  const codigosMiniPlug = useMemo(() => {
    const r = rocha?.codigo
    const lista = [
      ...sondagens.map((s) => codigoMiniPlug(s.codigo_mini_plug, r)),
      ...Object.values(grade).map((c) => codigoMiniPlug(c.codigo_mini_plug, r)),
    ].filter(Boolean)
    return [...new Set(lista)].sort()
  }, [sondagens, grade, rocha])
  const chaveCodigos = codigosMiniPlug.join('|')

  // Quais códigos já são amostras (consulta com atraso para não disparar a cada tecla)
  useEffect(() => {
    if (!chaveCodigos) {
      setExistentes(new Map())
      return
    }
    let ativo = true
    const t = setTimeout(() => {
      buscarAmostrasPorCodigos(chaveCodigos.split('|'))
        .then((m) => ativo && setExistentes(m))
        .catch(() => undefined)
    }, 400)
    return () => {
      ativo = false
      clearTimeout(t)
    }
  }, [chaveCodigos])

  /** Preenche os códigos vazios com a sugestão baseada na rocha (P1.. e T1-O, T1-D, T1-T…). */
  const preencherCodigosMiniPlug = () => {
    if (!rocha) {
      setMsg({ tipo: 'info', texto: 'Escolha primeiro a Amostra (Rocha) do ensaio: os códigos dos mini-plugs partem dela.' })
      return
    }
    setSondagens((prev) =>
      prev.map((s, i) =>
        s.codigo_mini_plug.trim() ? s : { ...s, codigo_mini_plug: sugestaoMiniPlug(rocha.codigo, 'piloto', i + 1) },
      ),
    )
    setGrade((g) => {
      const novo = { ...g }
      for (let est = 1; est <= 4; est++) {
        for (let rep = 1; rep <= 3; rep++) {
          const k = `${est}-${rep}`
          if (!novo[k].codigo_mini_plug.trim()) {
            novo[k] = { ...novo[k], codigo_mini_plug: sugestaoMiniPlug(rocha.codigo, 'ponto', est, rep) }
          }
        }
      }
      return novo
    })
  }

  // Cálculos ao vivo de t50 a partir da sondagem escolhida
  const sondagemEscolhida = useMemo(() => {
    const marcada = sondagens.find((s) => s.escolhido)
    if (marcada) return marcada
    return sondagens.find((s) => {
      const m0 = nOuNull(s.massa_inicial_g)
      const t = nOuNull(s.tempo_contato_min)
      const mf = nOuNull(s.massa_final_g)
      return m0 != null && t != null && mf != null && m0 > 0 && t > 0 && mf < m0
    })
  }, [sondagens])

  const calcT50 = useMemo(() => {
    if (!sondagemEscolhida) return null
    const m0 = nOuNull(sondagemEscolhida.massa_inicial_g)
    const t = nOuNull(sondagemEscolhida.tempo_contato_min)
    const mf = nOuNull(sondagemEscolhida.massa_final_g)
    if (m0 == null || t == null || mf == null || m0 <= 0 || t <= 0 || mf >= m0) return null
    return calcularT50(m0, t, mf)
  }, [sondagemEscolhida])

  // Converte a grade 4×3 em lista de PontoImportado para cálculos e gravação
  const pontosValidos: PontoImportado[] = useMemo(() => {
    const out: PontoImportado[] = []
    for (let est = 1; est <= 4; est++) {
      const frac = est * 0.25
      const tempoS = temposEstagioS[est - 1]
      for (let rep = 1; rep <= 3; rep++) {
        const c = grade[`${est}-${rep}`]
        if (!c) continue
        const m0 = nOuNull(c.massa_inicial_g)
        const mf = nOuNull(c.massa_final_g)
        if (m0 == null || mf == null || m0 <= 0 || mf >= m0) continue
        out.push({
          estagio_ordem: est as 1 | 2 | 3 | 4,
          fracao_t50: frac,
          tempo_contato_s: tempoS,
          replica: rep as 1 | 2 | 3,
          codigo_mini_plug: c.codigo_mini_plug.trim() || undefined,
          massa_inicial_g: m0,
          massa_final_g: mf,
          fator_diluicao_ca: nOuNull(c.fator_diluicao_ca) ?? 2250,
          abs_ca: nOuNull(c.abs_ca) ?? undefined,
          fator_diluicao_mg: nOuNull(c.fator_diluicao_mg) ?? 1,
          abs_mg: nOuNull(c.abs_mg) ?? undefined,
        })
      }
    }
    return out
  }, [grade, temposEstagioS])

  const incluirMg = form.litologia === 'dolomita'

  const resumoEstagios = useMemo(
    () =>
      calcularResumoEstagios(pontosValidos, {
        hInicialMolL: nOuNull(form.h_inicial_mol_l) ?? 4.4,
        calCaSlope: nOuNull(form.cal_ca_slope) ?? CAL_CA_SLOPE_PADRAO,
        calCaIntercept: nOuNull(form.cal_ca_intercept) ?? CAL_CA_INTERCEPT_PADRAO,
        calMgSlope: nOuNull(form.cal_mg_slope),
        calMgIntercept: nOuNull(form.cal_mg_intercept),
        massaMolarCa: nOuNull(form.massa_molar_ca) ?? MASSA_MOLAR_CA_PADRAO,
        massaMolarMg: nOuNull(form.massa_molar_mg) ?? MASSA_MOLAR_MG_PADRAO,
        incluirMg,
      }),
    [pontosValidos, form, incluirMg],
  )

  const estagiosComDados = useMemo(() => resumoEstagios.filter((e) => e.n_replicas > 0), [resumoEstagios])

  const regressaoPerda = useMemo(() => {
    const xs = estagiosComDados.map((e) => e.tempo_contato_s)
    const ys = estagiosComDados.map((e) =>
      form.modo_calculo_pct === 'razao_medias' ? e.perda_razao_medias_pct : e.perda_media_replicas_pct,
    )
    return calcularRegressaoLinear(xs, ys)
  }, [estagiosComDados, form.modo_calculo_pct])

  const guiaRda = useMemo(
    () => calcularGuiaRda(calcT50?.t50Min ?? null, regressaoPerda.m > 0 ? regressaoPerda.m : null),
    [calcT50, regressaoPerda.m],
  )

  // Monta séries para o gráfico de Perda de Massa (ensaio atual + ensaios comparativos)
  const seriesPerdaMassa: SeriePerdaMassaPayload[] = useMemo(() => {
    const lista: SeriePerdaMassaPayload[] = []
    const nomeSisAtual =
      sistemas.find((s) => s.id_sistema === form.id_sistema)?.nome_sistema ||
      form.codigo ||
      'Ensaio atual'

    if (estagiosComDados.length > 0) {
      lista.push({
        nome: nomeSisAtual,
        cor: CORES_SERIES[0],
        marcador: MARCADORES_SERIES[0],
        estilo_linha: '-',
        x_valores: estagiosComDados.map((e) => e.tempo_contato_s),
        y_medias_pct: estagiosComDados.map((e) =>
          form.modo_calculo_pct === 'razao_medias' ? e.perda_razao_medias_pct : e.perda_media_replicas_pct,
        ),
        y_desvios_pct: estagiosComDados.map((e) => e.perda_dp_pct),
        incluir_zero_na_reta: false,
      })
    }

    compararIds.forEach((cid, idx) => {
      const ens = ensaios.find((e) => e.id === cid)
      if (!ens) return
      const pts = pontosComparacao
        .filter((p) => p.ensaio_id === cid)
        .map((p) => ({
          estagio_ordem: p.estagio_ordem as 1 | 2 | 3 | 4,
          fracao_t50: Number(p.fracao_t50),
          tempo_contato_s: Number(p.tempo_contato_s),
          replica: p.replica as 1 | 2 | 3,
          massa_inicial_g: Number(p.massa_inicial_g),
          massa_final_g: Number(p.massa_final_g),
        }))
      const res = calcularResumoEstagios(pts, {
        hInicialMolL: Number(ens.h_inicial_mol_l ?? 4.4),
        calCaSlope: Number(ens.cal_ca_slope ?? CAL_CA_SLOPE_PADRAO),
        calCaIntercept: Number(ens.cal_ca_intercept ?? CAL_CA_INTERCEPT_PADRAO),
      }).filter((e) => e.n_replicas > 0)
      if (res.length === 0) return

      const nomeSis =
        sistemas.find((s) => s.id_sistema === ens.id_sistema)?.nome_sistema || ens.codigo
      lista.push({
        nome: `${ens.codigo} · ${nomeSis}`,
        cor: CORES_SERIES[(idx + 1) % CORES_SERIES.length],
        marcador: MARCADORES_SERIES[(idx + 1) % MARCADORES_SERIES.length],
        estilo_linha: '--',
        x_valores: res.map((e) => e.tempo_contato_s),
        y_medias_pct: res.map((e) =>
          ens.modo_calculo_pct === 'razao_medias' ? e.perda_razao_medias_pct : e.perda_media_replicas_pct,
        ),
        y_desvios_pct: res.map((e) => e.perda_dp_pct),
        incluir_zero_na_reta: false,
      })
    })
    return lista
  }, [estagiosComDados, form, sistemas, compararIds, ensaios, pontosComparacao])

  const estagiosComAA = useMemo(
    () => resumoEstagios.filter((e) => e.ca_media_mol_l != null && e.h_media_mol_l != null),
    [resumoEstagios],
  )

  const itensLegendaPreview: ItemLegendaPreview[] = useMemo(() => {
    if (tipoGrafico === 't50') {
      return [
        { cor: '#dc2626', rotulo: 'Ajuste linear (m × t)' },
        { cor: '#111827', rotulo: 'Pontos piloto (m0, mf)' },
        { cor: '#1d4ed8', rotulo: calcT50 ? `t50 = ${calcT50.t50Min.toFixed(2)} min` : 't50 estimado' },
      ]
    }
    if (tipoGrafico === 'perda_massa') {
      return seriesPerdaMassa.map((s) => ({ cor: s.cor, rotulo: s.nome }))
    }
    const items: ItemLegendaPreview[] = [{ cor: '#005a32', rotulo: '[Ca²⁺] (mol/L)' }]
    if (incluirMg && estagiosComAA.some((e) => e.mg_media_mol_l != null)) {
      items.push({ cor: '#2b5c8f', rotulo: '[Mg²⁺] (mol/L)' })
    }
    items.push({ cor: '#8c2d04', rotulo: '[H⁺] residual (mol/L)' })
    return items
  }, [tipoGrafico, calcT50, seriesPerdaMassa, incluirMg, estagiosComAA])

  const estiloPayload = useCallback(
    (formato: 'png' | 'svg' | 'pdf', dpi: number): EstiloOriginPayload => ({
      fonte: configGrafico.font_family,
      tamanho_fonte: 10,
      largura_cm: 16.5,
      altura_cm: 12.0,
      dpi,
      formato,
      mostrar_barras_erro: configGrafico.show_error_bars,
      mostrar_reta_ajuste: configGrafico.show_trendline,
      legend_xy: configGrafico.legend_xy,
      legend_frame: configGrafico.legend_frame,
      legend_fontsize: configGrafico.legend_fontsize,
    }),
    [configGrafico],
  )

  const pedirGrafico = useCallback(
    async (formato: 'png' | 'svg' | 'pdf', dpi: number, sinal?: AbortSignal): Promise<Blob | null> => {
      const estilo = estiloPayload(formato, dpi)
      if (tipoGrafico === 't50') {
        if (!sondagemEscolhida || !calcT50) return null
        return gerarGraficoT50Blob(
          {
            m0_g: Number(nOuNull(sondagemEscolhida.massa_inicial_g)),
            tempo_min: Number(nOuNull(sondagemEscolhida.tempo_contato_min)),
            mf_g: Number(nOuNull(sondagemEscolhida.massa_final_g)),
            estilo,
          },
          sinal,
        )
      }
      if (tipoGrafico === 'perda_massa') {
        if (seriesPerdaMassa.length === 0) return null
        return gerarGraficoPerdaMassaBlob({ series: seriesPerdaMassa, estilo }, sinal)
      }
      if (estagiosComAA.length === 0) return null
      const temMg = incluirMg && estagiosComAA.every((e) => e.mg_media_mol_l != null)
      return gerarGraficoAABlob(
        {
          rotulos_x: estagiosComAA.map((e) => e.rotulo),
          ca_medias_mol_l: estagiosComAA.map((e) => e.ca_media_mol_l ?? 0),
          ca_desvios_mol_l: estagiosComAA.map((e) => e.ca_dp_mol_l),
          mg_medias_mol_l: temMg ? estagiosComAA.map((e) => e.mg_media_mol_l ?? 0) : null,
          mg_desvios_mol_l: temMg ? estagiosComAA.map((e) => e.mg_dp_mol_l) : null,
          h_medias_mol_l: estagiosComAA.map((e) => e.h_media_mol_l ?? 0),
          h_desvios_mol_l: estagiosComAA.map((e) => e.h_dp_mol_l),
          estilo,
        },
        sinal,
      )
    },
    [tipoGrafico, sondagemEscolhida, calcT50, seriesPerdaMassa, estagiosComAA, incluirMg, estiloPayload],
  )

  // Atualiza a prévia PNG automaticamente (com debounce)
  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      setCarregandoGrafico(true)
      setErroGrafico(null)
      try {
        const blob = await pedirGrafico('png', 150, ctrl.signal)
        if (ctrl.signal.aborted) return
        if (!blob) {
          setUrlGrafico(null)
          return
        }
        const novaUrl = URL.createObjectURL(blob)
        setUrlGrafico(novaUrl)
      } catch (e) {
        if (ctrl.signal.aborted) return
        setErroGrafico(e instanceof Error ? e.message : String(e))
      } finally {
        if (!ctrl.signal.aborted) setCarregandoGrafico(false)
      }
    }, 350)

    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [pedirGrafico, versaoGrafico])

  // Ações do formulário
  const limparParaNovo = () => {
    setEnsaioAtualId(null)
    setForm(formInicial())
    setSondagens(sondagensIniciais())
    setTemposEstagioS([60, 120, 180, 240])
    setGrade(gradeVazia())
    setCalibracao([])
    setConfigGrafico(CONFIG_GRAFICO_PADRAO)
    setCompararIds([])
    setPreviaImportacao(null)
    setMsg(null)
  }

  const carregarEnsaio = async (id: string) => {
    if (!id) {
      limparParaNovo()
      return
    }
    setMsg(null)
    try {
      const comp = await obterEnsaioReatividadeCompleto(id)
      if (!comp) return
      const e = comp.ensaio
      setEnsaioAtualId(e.id)
      setForm({
        codigo: e.codigo ?? '',
        amostra_id: e.amostra_id ?? '',
        id_sistema: e.id_sistema ?? '',
        geometria: e.geometria ?? 'mini_plug',
        modalidade: e.modalidade ?? 'estatica',
        litologia: e.litologia ?? 'calcario',
        data_ensaio: e.data_ensaio ?? '',
        operador: e.operador ?? '',
        ph_inicial: e.ph_inicial != null ? String(e.ph_inicial) : '',
        h_inicial_mol_l: e.h_inicial_mol_l != null ? String(e.h_inicial_mol_l) : '4.4',
        volume_solucao_ml: e.volume_solucao_ml != null ? String(e.volume_solucao_ml) : '',
        temperatura_c: e.temperatura_c != null ? String(e.temperatura_c) : '25',
        rpm_rda: e.rpm_rda != null ? String(e.rpm_rda) : '',
        cal_ca_slope: e.cal_ca_slope != null ? String(e.cal_ca_slope) : String(CAL_CA_SLOPE_PADRAO),
        cal_ca_intercept: e.cal_ca_intercept != null ? String(e.cal_ca_intercept) : String(CAL_CA_INTERCEPT_PADRAO),
        cal_mg_slope: e.cal_mg_slope != null ? String(e.cal_mg_slope) : '',
        cal_mg_intercept: e.cal_mg_intercept != null ? String(e.cal_mg_intercept) : '',
        massa_molar_ca: e.massa_molar_ca != null ? String(e.massa_molar_ca) : String(MASSA_MOLAR_CA_PADRAO),
        massa_molar_mg: e.massa_molar_mg != null ? String(e.massa_molar_mg) : String(MASSA_MOLAR_MG_PADRAO),
        modo_calculo_pct: e.modo_calculo_pct ?? 'media_replicas',
        observacoes: e.observacoes ?? '',
      })

      setSondagens(
        comp.sondagens.length > 0
          ? comp.sondagens.map((s) => ({
              key: s.id,
              ordem: s.ordem,
              codigo_mini_plug: s.codigo_mini_plug ?? '',
              massa_inicial_g: String(s.massa_inicial_g),
              tempo_contato_min: String(s.tempo_contato_min),
              massa_final_g: String(s.massa_final_g),
              escolhido: Boolean(s.escolhido),
            }))
          : sondagensIniciais(),
      )

      const novaGrade = gradeVazia()
      const novosTempos: [number, number, number, number] = [60, 120, 180, 240]
      for (const p of comp.pontos) {
        novosTempos[p.estagio_ordem - 1] = Number(p.tempo_contato_s)
        novaGrade[`${p.estagio_ordem}-${p.replica}`] = {
          codigo_mini_plug: p.codigo_mini_plug ?? '',
          massa_inicial_g: String(p.massa_inicial_g),
          massa_final_g: String(p.massa_final_g),
          fator_diluicao_ca: p.fator_diluicao_ca != null ? String(p.fator_diluicao_ca) : '2250',
          abs_ca: p.abs_ca != null ? String(p.abs_ca) : '',
          fator_diluicao_mg: p.fator_diluicao_mg != null ? String(p.fator_diluicao_mg) : '1',
          abs_mg: p.abs_mg != null ? String(p.abs_mg) : '',
        }
      }
      setTemposEstagioS(novosTempos)
      setGrade(novaGrade)
      setCalibracao(
        comp.calibracao.map((c) => ({
          key: c.id,
          elemento: c.elemento,
          concentracao_mg_l: String(c.concentracao_mg_l),
          absorbancia_med: String(c.absorbancia_med),
        })),
      )
      setConfigGrafico({
        ...CONFIG_GRAFICO_PADRAO,
        ...(e.config_grafico ?? {}),
        legend_xy: (e.config_grafico?.legend_xy as [number, number] | undefined) ?? CONFIG_GRAFICO_PADRAO.legend_xy,
      })
      setCompararIds([])
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err instanceof Error ? err.message : String(err) })
    }
  }

  const adicionarSondagem = () => {
    setSondagens((prev) => {
      const ultima = prev[prev.length - 1]
      const ultimoTempo = ultima ? nOuNull(ultima.tempo_contato_min) ?? prev.length * 2 : 0
      const ordem = prev.length + 1
      return [
        ...prev,
        {
          key: `s-${Date.now()}-${ordem}`,
          ordem,
          codigo_mini_plug: '',
          massa_inicial_g: '',
          tempo_contato_min: String(ultimoTempo + 2),
          massa_final_g: '',
          escolhido: prev.length === 0,
        },
      ]
    })
  }

  const escolherSondagem = (key: string) => {
    const alvo = sondagens.find((s) => s.key === key)
    setSondagens((prev) => prev.map((s) => ({ ...s, escolhido: s.key === key })))
    if (alvo) {
      const m0 = nOuNull(alvo.massa_inicial_g)
      const t = nOuNull(alvo.tempo_contato_min)
      const mf = nOuNull(alvo.massa_final_g)
      if (m0 && t && mf != null && mf < m0) {
        const c = calcularT50(m0, t, mf)
        if (c.estagios.length === 4) {
          setTemposEstagioS([
            c.estagios[0].tempo_contato_s,
            c.estagios[1].tempo_contato_s,
            c.estagios[2].tempo_contato_s,
            c.estagios[3].tempo_contato_s,
          ])
          setMsg({
            tipo: 'info',
            texto: `Estágios T1..T4 atualizados com base em t50 = ${c.t50Min.toFixed(2)} min (${c.t50Seg} s): ${c.estagios.map((e) => `T${e.estagio_ordem}=${e.rotulo_tempo}`).join(' · ')}.`,
          })
        }
      }
    }
  }

  const aplicarCurvaCalibracao = (elemento: 'Ca' | 'Mg') => {
    const pares = calibracao
      .filter((c) => c.elemento === elemento)
      .map((c) => ({ x: nOuNull(c.concentracao_mg_l), y: nOuNull(c.absorbancia_med) }))
      .filter((p): p is { x: number; y: number } => p.x != null && p.y != null)
    if (pares.length < 2) {
      setMsg({ tipo: 'info', texto: `Informe pelo menos 2 padrões de ${elemento} para ajustar a curva.` })
      return
    }
    const reg = calcularRegressaoLinear(
      pares.map((p) => p.x),
      pares.map((p) => p.y),
    )
    if (elemento === 'Ca') {
      setForm((f) => ({
        ...f,
        cal_ca_slope: reg.m.toFixed(6),
        cal_ca_intercept: reg.b.toFixed(6),
      }))
    } else {
      setForm((f) => ({
        ...f,
        cal_mg_slope: reg.m.toFixed(6),
        cal_mg_intercept: reg.b.toFixed(6),
      }))
    }
    setMsg({
      tipo: 'sucesso',
      texto: `Curva de calibração de ${elemento} ajustada: ABS = ${reg.m.toFixed(5)}·C + ${reg.b.toFixed(5)} (R² = ${reg.r2.toFixed(4)}).`,
    })
  }

  const handleImportarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const buf = await file.arrayBuffer()
      const res = lerPlanilhaReatividade(buf)
      setPreviaImportacao(res)
      setMsg(null)
    } catch (err) {
      setMsg({ tipo: 'erro', texto: `Erro ao ler planilha: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  const aplicarImportacao = () => {
    if (!previaImportacao) return
    const { metadados, sondagens: sonds, pontos: pts } = previaImportacao

    setForm((f) => {
      const amostraEncontrada = metadados.amostra_codigo
        ? amostras.find((a) => a.codigo.toLowerCase() === metadados.amostra_codigo!.toLowerCase())
        : undefined
      const sistemaEncontrado = metadados.sistema_acido
        ? sistemas.find(
            (s) =>
              s.id_sistema.toLowerCase() === metadados.sistema_acido!.toLowerCase() ||
              s.nome_sistema.toLowerCase() === metadados.sistema_acido!.toLowerCase(),
          )
        : undefined
      return {
        ...f,
        amostra_id: amostraEncontrada?.id ?? f.amostra_id,
        id_sistema: sistemaEncontrado?.id_sistema ?? f.id_sistema,
        geometria: metadados.geometria ?? f.geometria,
        modalidade: metadados.modalidade ?? f.modalidade,
        litologia: metadados.litologia ?? f.litologia,
        ph_inicial: metadados.ph_inicial != null ? String(metadados.ph_inicial) : f.ph_inicial,
        h_inicial_mol_l: metadados.h_inicial_mol_l != null ? String(metadados.h_inicial_mol_l) : f.h_inicial_mol_l,
        volume_solucao_ml: metadados.volume_solucao_ml != null ? String(metadados.volume_solucao_ml) : f.volume_solucao_ml,
        temperatura_c: metadados.temperatura_c != null ? String(metadados.temperatura_c) : f.temperatura_c,
        cal_ca_slope: metadados.cal_ca_slope != null ? String(metadados.cal_ca_slope) : f.cal_ca_slope,
        cal_ca_intercept: metadados.cal_ca_intercept != null ? String(metadados.cal_ca_intercept) : f.cal_ca_intercept,
      }
    })

    if (sonds.length > 0) {
      setSondagens(
        sonds.map((s: SondagemImportada, idx: number) => ({
          key: `imp-s-${idx}-${Date.now()}`,
          ordem: s.ordem,
          codigo_mini_plug: s.codigo_mini_plug ?? `MP-${s.ordem}`,
          massa_inicial_g: String(s.massa_inicial_g),
          tempo_contato_min: String(s.tempo_contato_min),
          massa_final_g: String(s.massa_final_g),
          escolhido: s.escolhido,
        })),
      )
      const esc = sonds.find((s) => s.escolhido) ?? sonds[0]
      if (esc) {
        const c = calcularT50(esc.massa_inicial_g, esc.tempo_contato_min, esc.massa_final_g)
        if (c.estagios.length === 4) {
          setTemposEstagioS([
            c.estagios[0].tempo_contato_s,
            c.estagios[1].tempo_contato_s,
            c.estagios[2].tempo_contato_s,
            c.estagios[3].tempo_contato_s,
          ])
        }
      }
    }

    if (pts.length > 0) {
      const novaGrade = gradeVazia()
      const tempos: [number, number, number, number] = [...temposEstagioS]
      for (const p of pts) {
        tempos[p.estagio_ordem - 1] = p.tempo_contato_s
        novaGrade[`${p.estagio_ordem}-${p.replica}`] = {
          codigo_mini_plug: p.codigo_mini_plug ?? '',
          massa_inicial_g: String(p.massa_inicial_g),
          massa_final_g: String(p.massa_final_g),
          fator_diluicao_ca: String(p.fator_diluicao_ca ?? 2250),
          abs_ca: p.abs_ca != null ? String(p.abs_ca) : '',
          fator_diluicao_mg: String(p.fator_diluicao_mg ?? 1),
          abs_mg: p.abs_mg != null ? String(p.abs_mg) : '',
        }
      }
      setTemposEstagioS(tempos)
      setGrade(novaGrade)
    }

    setPreviaImportacao(null)
    setMsg({
      tipo: 'sucesso',
      texto: `Planilha aplicada (${sonds.length} sondagem(ns) e ${pts.length} ponto(s)). Revise e clique em "Salvar ensaio" para gravar no Supabase.`,
    })
  }

  const handleSalvarEnsaio = async () => {
    setSalvando(true)
    setMsg(null)
    try {
      const sondsValidas = sondagens
        .map((s, idx) => ({
          ordem: idx + 1,
          codigo_mini_plug: s.codigo_mini_plug.trim() || null,
          massa_inicial_g: nOuNull(s.massa_inicial_g),
          tempo_contato_min: nOuNull(s.tempo_contato_min),
          massa_final_g: nOuNull(s.massa_final_g),
          escolhido: s.escolhido,
        }))
        .filter(
          (s): s is {
            ordem: number
            codigo_mini_plug: string | null
            massa_inicial_g: number
            tempo_contato_min: number
            massa_final_g: number
            escolhido: boolean
          } =>
            s.massa_inicial_g != null &&
            s.tempo_contato_min != null &&
            s.massa_final_g != null &&
            s.massa_inicial_g > 0 &&
            s.tempo_contato_min > 0 &&
            s.massa_final_g < s.massa_inicial_g,
        )

      const esc = sondsValidas.find((s) => s.escolhido) ?? sondsValidas[0]

      // Mini-plugs: cada código vira (ou já é) uma amostra da categoria mini_plug
      const rochaCod = rocha?.codigo
      const sondsCod = sondsValidas.map((s) => ({ ...s, codigo_mini_plug: codigoMiniPlug(s.codigo_mini_plug ?? '', rochaCod) || null }))
      const ptsCod = pontosValidos.map((p) => ({ ...p, codigo_mini_plug: codigoMiniPlug(p.codigo_mini_plug ?? '', rochaCod) || undefined }))
      const todosCodigos = [
        ...new Set([...sondsCod.map((s) => s.codigo_mini_plug), ...ptsCod.map((p) => p.codigo_mini_plug)].filter((c): c is string => !!c)),
      ]
      const mapaMiniPlugs = todosCodigos.length > 0 ? await buscarAmostrasPorCodigos(todosCodigos) : new Map<string, AmostraEncontrada>()
      const faltando = todosCodigos.filter((c) => !mapaMiniPlugs.has(c))
      if (faltando.length > 0) {
        if (!rocha) {
          throw new Error(
            `Os mini-plugs ${faltando.join(', ')} ainda não estão cadastrados. Escolha a Amostra (Rocha) de origem na aba 2 para cadastrá-los junto com o ensaio.`,
          )
        }
        const ok = await confirmar(
          `Cadastrar ${faltando.length} mini-plug(s) novo(s) como amostra (categoria Mini-plug, cortados de ${rocha.codigo}, projeto ${rocha.projeto ?? ''})? ${faltando.join(', ')}`,
        )
        if (!ok) {
          setMsg({ tipo: 'info', texto: 'Nada foi gravado. Corrija os códigos dos mini-plugs ou confirme o cadastro deles.' })
          return
        }
        const massas = new Map<string, number>()
        for (const x of [...sondsCod, ...ptsCod]) {
          if (x.codigo_mini_plug && !massas.has(x.codigo_mini_plug)) massas.set(x.codigo_mini_plug, x.massa_inicial_g)
        }
        const novos = await cadastrarMiniPlugs(faltando, rocha as unknown as RochaDeOrigem, massas, form.codigo.trim() || null)
        novos.forEach((v, k) => mapaMiniPlugs.set(k, v))
      }
      const idMiniPlug = (c: string | null | undefined) => (c ? mapaMiniPlugs.get(c)?.id ?? null : null)

      const calValidas = calibracao
        .map((c) => ({
          elemento: c.elemento,
          concentracao_mg_l: nOuNull(c.concentracao_mg_l),
          absorbancia_med: nOuNull(c.absorbancia_med),
        }))
        .filter(
          (c): c is { elemento: 'Ca' | 'Mg'; concentracao_mg_l: number; absorbancia_med: number } =>
            c.concentracao_mg_l != null && c.absorbancia_med != null,
        )

      const salvo = await salvarEnsaioReatividade(
        ensaioAtualId,
        {
          codigo: form.codigo.trim() || null,
          amostra_id: form.amostra_id || null,
          id_sistema: form.id_sistema || null,
          geometria: form.geometria,
          modalidade: form.modalidade,
          litologia: form.litologia,
          data_ensaio: form.data_ensaio || null,
          operador: form.operador.trim() || null,
          ph_inicial: nOuNull(form.ph_inicial),
          h_inicial_mol_l: nOuNull(form.h_inicial_mol_l) ?? 4.4,
          volume_solucao_ml: nOuNull(form.volume_solucao_ml),
          temperatura_c: nOuNull(form.temperatura_c) ?? 25,
          rpm_rda: form.modalidade === 'dinamica_rda' ? nOuNull(form.rpm_rda) : null,
          m0_sondagem_g: esc?.massa_inicial_g ?? null,
          tempo_sondagem_min: esc?.tempo_contato_min ?? null,
          mf_sondagem_g: esc?.massa_final_g ?? null,
          cal_ca_slope: nOuNull(form.cal_ca_slope) ?? CAL_CA_SLOPE_PADRAO,
          cal_ca_intercept: nOuNull(form.cal_ca_intercept) ?? CAL_CA_INTERCEPT_PADRAO,
          cal_mg_slope: nOuNull(form.cal_mg_slope),
          cal_mg_intercept: nOuNull(form.cal_mg_intercept),
          massa_molar_ca: nOuNull(form.massa_molar_ca) ?? MASSA_MOLAR_CA_PADRAO,
          massa_molar_mg: nOuNull(form.massa_molar_mg) ?? MASSA_MOLAR_MG_PADRAO,
          modo_calculo_pct: form.modo_calculo_pct,
          taxa_dissolucao_m: estagiosComDados.length >= 2 ? regressaoPerda.m : null,
          taxa_dissolucao_n: estagiosComDados.length >= 2 ? regressaoPerda.b : null,
          taxa_dissolucao_r2: estagiosComDados.length >= 2 ? regressaoPerda.r2 : null,
          config_grafico: configGrafico,
          observacoes: form.observacoes.trim() || null,
        },
        sondsCod.map((s) => ({ ...s, amostra_id: idMiniPlug(s.codigo_mini_plug) })),
        ptsCod.map((p) => ({
          estagio_ordem: p.estagio_ordem,
          fracao_t50: p.fracao_t50,
          tempo_contato_s: p.tempo_contato_s,
          replica: p.replica,
          codigo_mini_plug: p.codigo_mini_plug ?? null,
          amostra_id: idMiniPlug(p.codigo_mini_plug),
          massa_inicial_g: p.massa_inicial_g,
          massa_final_g: p.massa_final_g,
          fator_diluicao_ca: p.fator_diluicao_ca ?? 2250,
          abs_ca: p.abs_ca ?? null,
          fator_diluicao_mg: p.fator_diluicao_mg ?? 1,
          abs_mg: p.abs_mg ?? null,
        })),
        calValidas,
      )

      setEnsaioAtualId(salvo.ensaio.id)
      setForm((f) => ({ ...f, codigo: salvo.ensaio.codigo }))
      await recarregarCatalogos()
      setMsg({
        tipo: 'sucesso',
        texto: `Ensaio ${salvo.ensaio.codigo} salvo com sucesso (${salvo.sondagens.length} sondagens, ${salvo.pontos.length} pontos${
          todosCodigos.length > 0 ? `, gravado em ${todosCodigos.length} mini-plug(s)${faltando.length > 0 ? `, ${faltando.length} cadastrado(s) agora` : ''}` : ''
        }).`,
      })
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err instanceof Error ? err.message : String(err) })
    } finally {
      setSalvando(false)
    }
  }

  const handleExcluirEnsaio = async () => {
    if (!ensaioAtualId) return
    const ok = await confirmar(
      `Deseja excluir o ensaio ${form.codigo || ensaioAtualId} e todos os seus pontos? Esta ação não pode ser desfeita.`,
    )
    if (!ok) return
    try {
      await excluirEnsaioReatividade(ensaioAtualId)
      limparParaNovo()
      await recarregarCatalogos()
      setMsg({ tipo: 'info', texto: 'Ensaio excluído.' })
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err instanceof Error ? err.message : String(err) })
    }
  }

  const handleBaixarModeloExcel = async () => {
    setBaixandoModelo(true)
    setMsg(null)
    try {
      const amostraObj = amostras.find((a) => a.id === form.amostra_id)
      const sistemaObj = sistemas.find((s) => s.id_sistema === form.id_sistema)
      const blob = await exportarExcelReatividadeBlob({
        codigo: form.codigo || 'MODELO_REA',
        amostra_codigo: amostraObj?.codigo || '',
        sistema_acido: sistemaObj?.nome_sistema || '',
        geometria: form.geometria,
        modalidade: form.modalidade,
        litologia: form.litologia,
        data_ensaio: form.data_ensaio || null,
        operador: form.operador || null,
        ph_inicial: nOuNull(form.ph_inicial),
        h_inicial_mol_l: nOuNull(form.h_inicial_mol_l) ?? 4.4,
        volume_solucao_ml: nOuNull(form.volume_solucao_ml) ?? 100,
        temperatura_c: nOuNull(form.temperatura_c) ?? 25,
        cal_ca_slope: nOuNull(form.cal_ca_slope) ?? CAL_CA_SLOPE_PADRAO,
        cal_ca_intercept: nOuNull(form.cal_ca_intercept) ?? CAL_CA_INTERCEPT_PADRAO,
        cal_mg_slope: nOuNull(form.cal_mg_slope),
        cal_mg_intercept: nOuNull(form.cal_mg_intercept),
        massa_molar_ca: nOuNull(form.massa_molar_ca) ?? MASSA_MOLAR_CA_PADRAO,
        massa_molar_mg: nOuNull(form.massa_molar_mg) ?? MASSA_MOLAR_MG_PADRAO,
        sondagens: sondagens
          .filter((s) => nOuNull(s.massa_inicial_g) && nOuNull(s.massa_final_g))
          .map((s, i) => ({
            ordem: i + 1,
            codigo_mini_plug: s.codigo_mini_plug || null,
            massa_inicial_g: Number(nOuNull(s.massa_inicial_g)),
            tempo_contato_min: Number(nOuNull(s.tempo_contato_min) ?? (i + 1) * 2),
            massa_final_g: Number(nOuNull(s.massa_final_g)),
            escolhido: s.escolhido,
          })),
        pontos: pontosValidos,
      })
      baixarBlob(blob, `${form.codigo || 'modelo_dissolucao_estatica'}.xlsx`)
    } catch (err) {
      setMsg({ tipo: 'erro', texto: `Erro ao gerar Excel: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setBaixandoModelo(false)
    }
  }

  const handleSalvarPosicaoLegenda = async (xy: [number, number], moldura: boolean) => {
    const novoConfig: Required<ConfigGraficoReatividade> = {
      ...configGrafico,
      legend_xy: xy,
      legend_frame: moldura,
    }
    setConfigGrafico(novoConfig)
    if (ensaioAtualId) {
      await atualizarConfigGraficoReatividade(ensaioAtualId, novoConfig)
      setMsg({ tipo: 'sucesso', texto: `Posição da legenda salva no banco (x=${xy[0].toFixed(2)}, y=${xy[1].toFixed(2)}).` })
    } else {
      setMsg({ tipo: 'info', texto: 'Posição aplicada na prévia. Clique em "Salvar ensaio" para gravar no banco.' })
    }
    setVersaoGrafico((v) => v + 1)
  }

  const handleBaixarGrafico = async (formato: 'png' | 'svg' | 'pdf') => {
    try {
      const blob = await pedirGrafico(formato, formato === 'png' ? 300 : 150)
      if (!blob) return
      baixarBlob(blob, `${form.codigo || 'reatividade'}_${tipoGrafico}.${formato}`)
    } catch (err) {
      setMsg({ tipo: 'erro', texto: `Erro ao baixar ${formato.toUpperCase()}: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  const ensaiosComparaveis = useMemo(
    () =>
      ensaios.filter(
        (e) =>
          e.id !== ensaioAtualId &&
          ((form.amostra_id && e.amostra_id === form.amostra_id) || e.litologia === form.litologia),
      ),
    [ensaios, ensaioAtualId, form.amostra_id, form.litologia],
  )

  return (
    <div className="space-y-5">
      {/* Barra superior de ensaios salvos + Importação/Exportação Excel */}
      <div className="cartao p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="text-xs font-semibold text-[var(--color-blue-800)] uppercase tracking-wide">
            Ensaio:
          </label>
          <select
            value={ensaioAtualId ?? ''}
            onChange={(e) => void carregarEnsaio(e.target.value)}
            disabled={carregandoLista}
            className="input !w-auto min-w-[230px] !py-1.5 text-sm"
          >
            <option value="">— Novo ensaio (auto REA/RDA) —</option>
            {ensaios.map((e) => {
              const am = amostras.find((a) => a.id === e.amostra_id)
              const sis = sistemas.find((s) => s.id_sistema === e.id_sistema)
              return (
                <option key={e.id} value={e.id}>
                  {e.codigo} {am ? `· ${am.codigo}` : ''} {sis ? `· ${sis.nome_sistema}` : ''} ({e.litologia})
                </option>
              )
            })}
          </select>

          <button type="button" onClick={limparParaNovo} className="btn btn-secondary !py-1.5 !px-3 text-xs">
            <Plus size={14} /> Novo
          </button>
          <button
            type="button"
            onClick={() => void handleSalvarEnsaio()}
            disabled={salvando}
            className="btn btn-primary !py-1.5 !px-3.5 text-xs"
          >
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {salvando ? 'Salvando…' : ensaioAtualId ? 'Atualizar ensaio' : 'Salvar ensaio'}
          </button>
          {ensaioAtualId && (
            <button
              type="button"
              onClick={() => void handleExcluirEnsaio()}
              className="btn btn-secondary !py-1.5 !px-2.5 text-xs text-red-700 hover:bg-red-50"
              title="Excluir ensaio"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => void handleImportarArquivo(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-blue !py-1.5 !px-3 text-xs"
          >
            <Upload size={14} /> Importar planilha (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => void handleBaixarModeloExcel()}
            disabled={baixandoModelo}
            className="btn btn-secondary !py-1.5 !px-3 text-xs"
          >
            {baixandoModelo ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
            Baixar modelo de entrada (.xlsx)
          </button>
        </div>
      </div>

      {msg && <Alert tipo={msg.tipo} mensagem={msg.texto} onClose={() => setMsg(null)} />}

      {/* Prévia da importação Excel (avisos e erros antes de gravar) */}
      {previaImportacao && (
        <div className="cartao p-4 border-l-4 border-[var(--color-orange)] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 text-sm font-bold text-[var(--color-blue-800)] flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-[var(--color-orange)]" />
              Prévia da planilha importada
            </h3>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPreviaImportacao(null)} className="btn btn-secondary !py-1 !px-3 text-xs">
                Descartar
              </button>
              <button
                type="button"
                onClick={aplicarImportacao}
                disabled={previaImportacao.sondagens.length === 0 && previaImportacao.pontos.length === 0}
                className="btn btn-primary !py-1 !px-3 text-xs"
              >
                <CheckCircle2 size={14} /> Aplicar dados recalculados
              </button>
            </div>
          </div>

          <p className="m-0 text-xs text-[var(--color-neutral-700)]">
            Encontradas <strong>{previaImportacao.sondagens.length}</strong> sondagem(ns) piloto e{' '}
            <strong>{previaImportacao.pontos.length}</strong> ponto(s) de dissolução. Todas as fórmulas foram recalculadas pelo sistema.
          </p>

          {previaImportacao.avisos.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle size={14} /> Avisos ({previaImportacao.avisos.length})
              </div>
              <ul className="m-0 pl-4 list-disc space-y-0.5">
                {previaImportacao.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {previaImportacao.erros.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 space-y-1">
              <div className="font-semibold">Linhas ignoradas por inconsistência ({previaImportacao.erros.length})</div>
              <ul className="m-0 pl-4 list-disc space-y-0.5">
                {previaImportacao.erros.map((er, i) => (
                  <li key={i}>{er}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Layout principal: Sub-abas sequenciais à esquerda + Painel Origin à direita */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 space-y-4">
          {/* Sub-abas sequenciais 1 -> 2 -> 3 */}
          <div className="flex flex-wrap gap-2 border-b border-[var(--color-neutral-300)] pb-2">
            {[
              { id: 'sondagem' as SubAba, label: '1. Sondagem t50 (Mini-Plug)', icon: Gauge },
              { id: 'dissolucao' as SubAba, label: '2. Dissolução 4 Pontos & Guia RDA', icon: FlaskConical },
              { id: 'aa' as SubAba, label: '3. Absorção Atômica (Ca²⁺, Mg²⁺, H⁺)', icon: Atom },
            ].map(({ id, label, icon: Icon }) => {
              const ativo = subAba === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSubAba(id)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
                    ativo
                      ? 'bg-[var(--color-blue-900)] text-white shadow-sm'
                      : 'bg-white border border-[var(--color-neutral-300)] text-[var(--color-neutral-700)] hover:border-[var(--color-blue)]'
                  }`}
                >
                  <Icon size={14} className={ativo ? 'text-[var(--color-orange-400)]' : 'text-[var(--color-blue)]'} />
                  {label}
                </button>
              )
            })}
          </div>

          {/* =============================================================== */}
          {/* SUB-ABA 1: SONDAGEM t50                                         */}
          {/* =============================================================== */}
          {subAba === 'sondagem' && (
            <div className="cartao p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="m-0 text-base font-bold text-[var(--color-blue-800)]">
                    Testes Piloto para Determinação de t₅₀
                  </h2>
                  <p className="m-0 text-xs text-[var(--color-neutral-600)]">
                    Aumente o tempo de contato de 2 em 2 min em mini-plugues distintos e selecione o teste que define os 4 estágios (25%, 50%, 75% e 100% do t₅₀).
                  </p>
                </div>
                <button type="button" onClick={adicionarSondagem} className="btn btn-secondary !py-1.5 !px-3 text-xs">
                  <Plus size={14} /> Adicionar teste
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th className="w-12 text-center">Usar</th>
                      <th>Mini-Plug</th>
                      <th>Peso 0 · m₀ (g)</th>
                      <th>Tempo (min)</th>
                      <th>Massa final · m_f (g)</th>
                      <th className="text-right">m₅₀ (g)</th>
                      <th className="text-right">Taxa (g/min)</th>
                      <th className="text-right">t₅₀ (min / s)</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {sondagens.map((s) => {
                      const m0 = nOuNull(s.massa_inicial_g)
                      const t = nOuNull(s.tempo_contato_min)
                      const mf = nOuNull(s.massa_final_g)
                      const ok = m0 != null && t != null && mf != null && m0 > 0 && t > 0 && mf < m0
                      const c = ok ? calcularT50(m0, t, mf) : null
                      return (
                        <tr key={s.key} className={s.escolhido ? 'bg-[var(--color-blue-50)]/60' : ''}>
                          <td className="text-center">
                            <input
                              type="radio"
                              name="sondagem_t50"
                              checked={s.escolhido}
                              onChange={() => escolherSondagem(s.key)}
                              title="Usar este t50 para preencher T1..T4"
                              className="accent-[var(--color-orange)] cursor-pointer"
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={s.codigo_mini_plug}
                              onChange={(e) =>
                                setSondagens((prev) =>
                                  prev.map((x) => (x.key === s.key ? { ...x, codigo_mini_plug: e.target.value } : x)),
                                )
                              }
                              className="input !py-1 !px-2 text-xs w-32 uppercase"
                              placeholder={rocha ? sugestaoMiniPlug(rocha.codigo, 'piloto', s.ordem) : 'MP-1'}
                            />
                            <div className="mt-0.5 min-h-[14px]">
                              <StatusMiniPlug codigo={s.codigo_mini_plug} rochaCodigo={rocha?.codigo ?? null} existentes={existentes} />
                            </div>
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.0001"
                              value={s.massa_inicial_g}
                              onChange={(e) =>
                                setSondagens((prev) =>
                                  prev.map((x) => (x.key === s.key ? { ...x, massa_inicial_g: e.target.value } : x)),
                                )
                              }
                              className="input !py-1 !px-2 text-xs w-24 tabular-nums"
                              placeholder="4,2000"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.5"
                              value={s.tempo_contato_min}
                              onChange={(e) =>
                                setSondagens((prev) =>
                                  prev.map((x) => (x.key === s.key ? { ...x, tempo_contato_min: e.target.value } : x)),
                                )
                              }
                              className="input !py-1 !px-2 text-xs w-20 tabular-nums"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.0001"
                              value={s.massa_final_g}
                              onChange={(e) =>
                                setSondagens((prev) =>
                                  prev.map((x) => (x.key === s.key ? { ...x, massa_final_g: e.target.value } : x)),
                                )
                              }
                              className="input !py-1 !px-2 text-xs w-24 tabular-nums"
                              placeholder="2,4000"
                            />
                          </td>
                          <td className="text-right tabular-nums font-medium">{c ? fmtNum(c.m50, 4) : '—'}</td>
                          <td className="text-right tabular-nums">{c ? fmtNum(c.taxaGMin, 4) : '—'}</td>
                          <td className="text-right tabular-nums font-bold text-[var(--color-blue-800)]">
                            {c ? `${fmtNum(c.t50Min, 2)} min (${c.t50Seg} s)` : '—'}
                          </td>
                          <td>
                            {sondagens.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setSondagens((prev) => prev.filter((x) => x.key !== s.key))}
                                className="text-[var(--color-neutral-400)] hover:text-red-600 cursor-pointer"
                                title="Remover linha"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {calcT50 && (
                <div className="rounded-xl border border-[var(--color-blue-200)] bg-[var(--color-blue-50)]/60 p-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-[var(--color-blue-800)]">
                      Estágios calculados para a Dissolução em Triplicata
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {calcT50.estagios.map((e) => (
                        <span key={e.estagio_ordem} className="tag tag-blue">
                          T{e.estagio_ordem} ({e.fracao_t50 * 100}%): {e.tempo_contato_s} s ({e.rotulo_tempo})
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTemposEstagioS([
                        calcT50.estagios[0].tempo_contato_s,
                        calcT50.estagios[1].tempo_contato_s,
                        calcT50.estagios[2].tempo_contato_s,
                        calcT50.estagios[3].tempo_contato_s,
                      ])
                      setSubAba('dissolucao')
                    }}
                    className="btn btn-primary !py-1.5 !px-3.5 text-xs"
                  >
                    Copiar T1..T4 e avançar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* SUB-ABA 2: DISSOLUÇÃO 4 PONTOS (TRIPLICATA) & GUIA RDA          */}
          {/* =============================================================== */}
          {subAba === 'dissolucao' && (
            <div className="space-y-4">
              {/* Cabeçalho do ensaio */}
              <div className="cartao p-5 space-y-4">
                <h2 className="m-0 text-base font-bold text-[var(--color-blue-800)]">
                  Condições Experimentais do Ensaio
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="label">Amostra (Rocha)</label>
                    <select
                      value={form.amostra_id}
                      onChange={(e) => setForm((f) => ({ ...f, amostra_id: e.target.value }))}
                      className="input !py-1.5 text-xs"
                    >
                      <option value="">— Sem vínculo —</option>
                      {amostras.filter((a) => a.tipo_amostra !== 'mini_plug').map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.codigo} · {a.litologia} ({a.projeto})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Sistema Ácido</label>
                    <select
                      value={form.id_sistema}
                      onChange={(e) => setForm((f) => ({ ...f, id_sistema: e.target.value }))}
                      className="input !py-1.5 text-xs"
                    >
                      <option value="">— Selecionar sistema —</option>
                      {sistemas.map((s) => (
                        <option key={s.id_sistema} value={s.id_sistema}>
                          {s.id_sistema} · {s.nome_sistema}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Litologia</label>
                    <select
                      value={form.litologia}
                      onChange={(e) => setForm((f) => ({ ...f, litologia: e.target.value as LitologiaReatividade }))}
                      className="input !py-1.5 text-xs"
                    >
                      <option value="calcario">Calcário (Ca²⁺)</option>
                      <option value="dolomita">Dolomita (Ca²⁺ + Mg²⁺)</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Geometria</label>
                    <select
                      value={form.geometria}
                      onChange={(e) => setForm((f) => ({ ...f, geometria: e.target.value as GeometriaReatividade }))}
                      className="input !py-1.5 text-xs"
                    >
                      <option value="mini_plug">Mini-plug</option>
                      <option value="disco">Disco</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Modalidade</label>
                    <select
                      value={form.modalidade}
                      onChange={(e) => setForm((f) => ({ ...f, modalidade: e.target.value as ModalidadeReatividade }))}
                      className="input !py-1.5 text-xs"
                    >
                      <option value="estatica">Estática (REA-####)</option>
                      <option value="dinamica_rda">Dinâmica RDA (RDA-####)</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Data do ensaio</label>
                    <input
                      type="date"
                      value={form.data_ensaio}
                      onChange={(e) => setForm((f) => ({ ...f, data_ensaio: e.target.value }))}
                      className="input !py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="label">pH inicial</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.ph_inicial}
                      onChange={(e) => setForm((f) => ({ ...f, ph_inicial: e.target.value }))}
                      className="input !py-1.5 text-xs tabular-nums"
                      placeholder="0,50"
                    />
                  </div>
                  <div>
                    <label className="label">[H⁺] inicial (mol/L)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.h_inicial_mol_l}
                      onChange={(e) => setForm((f) => ({ ...f, h_inicial_mol_l: e.target.value }))}
                      className="input !py-1.5 text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="label">Volume solução (mL)</label>
                    <input
                      type="number"
                      step="1"
                      value={form.volume_solucao_ml}
                      onChange={(e) => setForm((f) => ({ ...f, volume_solucao_ml: e.target.value }))}
                      className="input !py-1.5 text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="label">Temperatura (°C)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={form.temperatura_c}
                      onChange={(e) => setForm((f) => ({ ...f, temperatura_c: e.target.value }))}
                      className="input !py-1.5 text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="label">Operador</label>
                    <input
                      type="text"
                      value={form.operador}
                      onChange={(e) => setForm((f) => ({ ...f, operador: e.target.value }))}
                      className="input !py-1.5 text-xs"
                      placeholder="Nome do pesquisador"
                    />
                  </div>
                  {form.modalidade === 'dinamica_rda' && (
                    <div>
                      <label className="label">Rotação RDA (RPM)</label>
                      <input
                        type="number"
                        step="50"
                        value={form.rpm_rda}
                        onChange={(e) => setForm((f) => ({ ...f, rpm_rda: e.target.value }))}
                        className="input !py-1.5 text-xs tabular-nums"
                        placeholder="500"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Grade 4 estágios × 3 réplicas (m0 e mf) */}
              <div className="cartao p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="m-0 text-base font-bold text-[var(--color-blue-800)]">
                      Grade de Dissolução — 4 Estágios × Triplicata
                    </h2>
                    <p className="m-0 text-xs text-[var(--color-neutral-600)]">
                      Pese cada mini-plug antes (m₀) e depois (m_f). Enter desce para a próxima célula; dá para colar
                      colunas m₀/m_f direto do Excel. Perda = (m₀ − m_f)/m₀ e DP amostral das réplicas.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-[var(--color-neutral-300)] p-0.5 bg-[var(--color-neutral-50)] text-xs">
                    {(
                      [
                        ['media_replicas', 'Média das réplicas'],
                        ['razao_medias', 'Razão das médias'],
                      ] as const
                    ).map(([modo, rotulo]) => (
                      <button
                        key={modo}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, modo_calculo_pct: modo }))}
                        className={`rounded-md px-2.5 py-1 font-semibold cursor-pointer ${
                          form.modo_calculo_pct === modo
                            ? 'bg-[var(--color-blue)] text-white'
                            : 'text-[var(--color-neutral-600)] hover:text-[var(--color-blue-800)]'
                        }`}
                      >
                        {rotulo}
                      </button>
                    ))}
                  </div>
                </div>

                <GradeDissolucao
                  grade={grade}
                  setGrade={setGrade}
                  tempos={temposEstagioS}
                  setTempos={setTemposEstagioS}
                  resumo={resumoEstagios}
                  modo={form.modo_calculo_pct}
                  rochaCodigo={rocha?.codigo ?? null}
                  existentes={existentes}
                  aoPreencherCodigos={preencherCodigosMiniPlug}
                />

                {/* Equação da taxa + Sobreposição comparativa */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="rounded-xl border border-[var(--color-blue-200)] bg-[var(--color-blue-50)]/50 p-3.5 text-xs">
                    <div className="font-bold text-[var(--color-blue-800)] uppercase tracking-wide text-[11px]">
                      Regressão Linear da Dissolução
                    </div>
                    {estagiosComDados.length >= 2 ? (
                      <div className="mt-1.5 space-y-1">
                        <p className="m-0 font-mono text-sm font-bold text-[var(--color-blue-900)]">
                          y = {regressaoPerda.m.toFixed(4)}·x {regressaoPerda.b >= 0 ? '+' : '−'}{' '}
                          {Math.abs(regressaoPerda.b).toFixed(2)}
                        </p>
                        <p className="m-0 text-[var(--color-neutral-600)]">
                          R² = <strong>{regressaoPerda.r2.toFixed(4)}</strong> ({estagiosComDados.length} estágios)
                        </p>
                      </div>
                    ) : (
                      <p className="m-0 mt-1 text-[var(--color-neutral-500)]">
                        Preencha pelo menos 2 estágios para calcular a taxa de dissolução.
                      </p>
                    )}
                  </div>

                  {/* Sobreposição comparativa */}
                  <div className="rounded-xl border border-[var(--color-neutral-300)] bg-[var(--color-neutral-50)] p-3.5 text-xs">
                    <div className="font-bold text-[var(--color-blue-800)] uppercase tracking-wide text-[11px] flex items-center gap-1.5">
                      <Layers size={13} /> Sobrepor outros ensaios no gráfico
                    </div>
                    {ensaiosComparaveis.length === 0 ? (
                      <p className="m-0 mt-1 text-[var(--color-neutral-500)]">
                        Nenhum outro ensaio salvo com a mesma rocha/litologia para comparar.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {ensaiosComparaveis.map((e) => {
                          const marcado = compararIds.includes(e.id)
                          const sis = sistemas.find((s) => s.id_sistema === e.id_sistema)
                          return (
                            <label
                              key={e.id}
                              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 cursor-pointer ${
                                marcado
                                  ? 'bg-[var(--color-blue-50)] border-[var(--color-blue)] text-[var(--color-blue-900)] font-semibold'
                                  : 'bg-white border-[var(--color-neutral-300)] text-[var(--color-neutral-700)]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={marcado}
                                onChange={() =>
                                  setCompararIds((prev) =>
                                    prev.includes(e.id) ? prev.filter((x) => x !== e.id) : [...prev, e.id],
                                  )
                                }
                              />
                              {e.codigo} {sis ? `(${sis.nome_sistema})` : ''}
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Cartão Guia para o RDA */}
              <div className="cartao p-5 space-y-3 border-t-4 border-[var(--color-orange)]">
                <div>
                  <h3 className="m-0 text-sm font-bold text-[var(--color-blue-800)]">
                    Parâmetros Recomendados para o RDA (Guia de Janela Segura)
                  </h3>
                  <p className="m-0 text-xs text-[var(--color-neutral-600)]">
                    Estimativa de janela segura de contato no disco rotatório escalada por √RPM (Lei de Levich) para evitar dissolução excessiva da face do disco.
                  </p>
                </div>
                {guiaRda.length === 0 ? (
                  <p className="m-0 text-xs text-[var(--color-neutral-500)]">
                    Calcule o t₅₀ na sub-aba 1 ou preencha a dissolução de 4 pontos para gerar a tabela de tempos recomendados por RPM.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table text-xs">
                      <thead>
                        <tr>
                          <th>Rotação (RPM)</th>
                          <th className="text-right">Fator √(ω/ω₀)</th>
                          <th className="text-right">Tempo mínimo seguro</th>
                          <th className="text-right">Tempo máximo seguro</th>
                          <th className="text-right">Intervalo sugerido de alíquotas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {guiaRda.map((g) => (
                          <tr key={g.rpm}>
                            <td className="font-bold text-[var(--color-blue-800)]">{g.rpm} RPM</td>
                            <td className="text-right tabular-nums">{g.fatorRotacao.toFixed(2)}×</td>
                            <td className="text-right tabular-nums">{formatarTempoMinSeg(g.tempoSeguroMinS)}</td>
                            <td className="text-right tabular-nums font-semibold text-[var(--color-orange-700)]">
                              {formatarTempoMinSeg(g.tempoSeguroMaxS)}
                            </td>
                            <td className="text-right tabular-nums">a cada {g.intervaloColetaS} s</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* SUB-ABA 3: ABSORÇÃO ATÔMICA (Ca²⁺, Mg²⁺ e H⁺)                   */}
          {/* =============================================================== */}
          {subAba === 'aa' && (
            <div className="space-y-4">
              {/* Bloco retrátil da Curva de Calibração */}
              <div className="cartao p-4 space-y-3">
                <button
                  type="button"
                  onClick={() => setMostrarCalibracao((v) => !v)}
                  className="w-full flex items-center justify-between text-left cursor-pointer"
                >
                  <div>
                    <h3 className="m-0 text-sm font-bold text-[var(--color-blue-800)]">
                      Curva de Calibração da Absorção Atômica (ABS = slope · C_mg/L + intercept)
                    </h3>
                    <p className="m-0 text-xs text-[var(--color-neutral-600)]">
                      Ca: slope={form.cal_ca_slope}, intercept={form.cal_ca_intercept} (MM={form.massa_molar_ca} g/mol)
                      {incluirMg && ` · Mg: slope=${form.cal_mg_slope || '—'}, intercept=${form.cal_mg_intercept || '—'} (MM=${form.massa_molar_mg} g/mol)`}
                    </p>
                  </div>
                  {mostrarCalibracao ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {mostrarCalibracao && (
                  <div className="pt-3 border-t border-[var(--color-neutral-200)] space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <label className="label">Ca · slope</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={form.cal_ca_slope}
                          onChange={(e) => setForm((f) => ({ ...f, cal_ca_slope: e.target.value }))}
                          className="input !py-1 text-xs tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="label">Ca · intercept</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={form.cal_ca_intercept}
                          onChange={(e) => setForm((f) => ({ ...f, cal_ca_intercept: e.target.value }))}
                          className="input !py-1 text-xs tabular-nums"
                        />
                      </div>
                      {incluirMg && (
                        <>
                          <div>
                            <label className="label">Mg · slope</label>
                            <input
                              type="number"
                              step="0.0001"
                              value={form.cal_mg_slope}
                              onChange={(e) => setForm((f) => ({ ...f, cal_mg_slope: e.target.value }))}
                              className="input !py-1 text-xs tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="label">Mg · intercept</label>
                            <input
                              type="number"
                              step="0.0001"
                              value={form.cal_mg_intercept}
                              onChange={(e) => setForm((f) => ({ ...f, cal_mg_intercept: e.target.value }))}
                              className="input !py-1 text-xs tabular-nums"
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {/* Pares de padrões opcionais */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--color-neutral-700)]">
                          Padrões de calibração (mg/L × ABS)
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setCalibracao((prev) => [
                                ...prev,
                                { key: `cal-${Date.now()}`, elemento: 'Ca', concentracao_mg_l: '', absorbancia_med: '' },
                              ])
                            }
                            className="btn btn-secondary !py-1 !px-2 text-[11px]"
                          >
                            <Plus size={12} /> Padrão Ca
                          </button>
                          {incluirMg && (
                            <button
                              type="button"
                              onClick={() =>
                                setCalibracao((prev) => [
                                  ...prev,
                                  { key: `cal-mg-${Date.now()}`, elemento: 'Mg', concentracao_mg_l: '', absorbancia_med: '' },
                                ])
                              }
                              className="btn btn-secondary !py-1 !px-2 text-[11px]"
                            >
                              <Plus size={12} /> Padrão Mg
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => aplicarCurvaCalibracao('Ca')}
                            className="btn btn-blue !py-1 !px-2.5 text-[11px]"
                          >
                            Ajustar Ca
                          </button>
                          {incluirMg && (
                            <button
                              type="button"
                              onClick={() => aplicarCurvaCalibracao('Mg')}
                              className="btn btn-blue !py-1 !px-2.5 text-[11px]"
                            >
                              Ajustar Mg
                            </button>
                          )}
                        </div>
                      </div>

                      {calibracao.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {calibracao.map((c) => (
                            <div key={c.key} className="flex items-center gap-2 rounded border p-1.5 text-xs bg-white">
                              <span className="tag tag-blue !text-[10px]">{c.elemento}</span>
                              <input
                                type="number"
                                step="0.1"
                                placeholder="mg/L"
                                value={c.concentracao_mg_l}
                                onChange={(e) =>
                                  setCalibracao((prev) =>
                                    prev.map((x) => (x.key === c.key ? { ...x, concentracao_mg_l: e.target.value } : x)),
                                  )
                                }
                                className="input !py-1 !px-2 text-xs w-24"
                              />
                              <input
                                type="number"
                                step="0.0001"
                                placeholder="ABS"
                                value={c.absorbancia_med}
                                onChange={(e) =>
                                  setCalibracao((prev) =>
                                    prev.map((x) => (x.key === c.key ? { ...x, absorbancia_med: e.target.value } : x)),
                                  )
                                }
                                className="input !py-1 !px-2 text-xs w-24"
                              />
                              <button
                                type="button"
                                onClick={() => setCalibracao((prev) => prev.filter((x) => x.key !== c.key))}
                                className="text-[var(--color-neutral-400)] hover:text-red-600 cursor-pointer ml-auto"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Grade de Fator de Diluição + ABS */}
              <div className="cartao p-5 space-y-4">
                <div>
                  <h2 className="m-0 text-base font-bold text-[var(--color-blue-800)]">
                    Leituras de Absorção Atômica por Estágio (T1..T4)
                  </h2>
                  <p className="m-0 text-xs text-[var(--color-neutral-600)]">
                    Informe Fator de Diluição (FD) e Absorbância (ABS). [H⁺] residual = [H⁺]₀ − 2·([Ca²⁺]{incluirMg ? ' + [Mg²⁺]' : ''}).
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="table text-xs">
                    <thead>
                      <tr>
                        <th>Estágio</th>
                        <th>Réplica</th>
                        <th>FD Ca</th>
                        <th>ABS Ca</th>
                        {incluirMg && (
                          <>
                            <th>FD Mg</th>
                            <th>ABS Mg</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {([1, 2, 3, 4] as const).flatMap((est) =>
                        ([1, 2, 3] as const).map((rep) => {
                          const k = `${est}-${rep}`
                          const cel = grade[k]
                          return (
                            <tr key={k}>
                              {rep === 1 && (
                                <td rowSpan={3} className="font-bold text-[var(--color-blue-800)] align-middle">
                                  T{est} ({est * 25}%)
                                </td>
                              )}
                              <td className="text-[var(--color-neutral-600)]">{NOMES_REPLICAS[rep - 1]}</td>
                              <td>
                                <input
                                  type="number"
                                  step="1"
                                  value={cel?.fator_diluicao_ca ?? '2250'}
                                  onChange={(e) =>
                                    setGrade((g) => ({
                                      ...g,
                                      [k]: { ...g[k], fator_diluicao_ca: e.target.value },
                                    }))
                                  }
                                  className="input !py-1 !px-2 text-xs w-24 tabular-nums"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  step="0.0001"
                                  value={cel?.abs_ca ?? ''}
                                  onChange={(e) =>
                                    setGrade((g) => ({
                                      ...g,
                                      [k]: { ...g[k], abs_ca: e.target.value },
                                    }))
                                  }
                                  className="input !py-1 !px-2 text-xs w-24 tabular-nums"
                                  placeholder="0,2100"
                                />
                              </td>
                              {incluirMg && (
                                <>
                                  <td>
                                    <input
                                      type="number"
                                      step="1"
                                      value={cel?.fator_diluicao_mg ?? '1'}
                                      onChange={(e) =>
                                        setGrade((g) => ({
                                          ...g,
                                          [k]: { ...g[k], fator_diluicao_mg: e.target.value },
                                        }))
                                      }
                                      className="input !py-1 !px-2 text-xs w-20 tabular-nums"
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="number"
                                      step="0.0001"
                                      value={cel?.abs_mg ?? ''}
                                      onChange={(e) =>
                                        setGrade((g) => ({
                                          ...g,
                                          [k]: { ...g[k], abs_mg: e.target.value },
                                        }))
                                      }
                                      className="input !py-1 !px-2 text-xs w-24 tabular-nums"
                                      placeholder="0,0500"
                                    />
                                  </td>
                                </>
                              )}
                            </tr>
                          )
                        }),
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Tabela resumo calculada de [Ca²⁺], [Mg²⁺] e [H⁺] */}
                <div className="overflow-x-auto pt-2">
                  <table className="table text-xs">
                    <thead>
                      <tr>
                        <th>Estágio</th>
                        <th className="text-right">[Ca²⁺] (mol/L)</th>
                        {incluirMg && <th className="text-right">[Mg²⁺] (mol/L)</th>}
                        <th className="text-right">[H⁺] residual (mol/L)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumoEstagios.map((r) => (
                        <tr key={r.estagio_ordem}>
                          <td className="font-semibold">{r.rotulo}</td>
                          <td className="text-right tabular-nums">
                            {r.ca_media_mol_l != null ? `${fmtNum(r.ca_media_mol_l, 3)} ± ${fmtNum(r.ca_dp_mol_l, 3)}` : '—'}
                          </td>
                          {incluirMg && (
                            <td className="text-right tabular-nums">
                              {r.mg_media_mol_l != null ? `${fmtNum(r.mg_media_mol_l, 3)} ± ${fmtNum(r.mg_dp_mol_l, 3)}` : '—'}
                            </td>
                          )}
                          <td className="text-right tabular-nums font-semibold text-[var(--color-blue-800)]">
                            {r.h_media_mol_l != null ? `${fmtNum(r.h_media_mol_l, 3)} ± ${fmtNum(r.h_dp_mol_l, 3)}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* PAINEL LATERAL: GRÁFICOS PADRÃO ORIGIN + LEGENDA ARRASTÁVEL       */}
        {/* ================================================================= */}
        <div className="xl:col-span-5 cartao p-5 space-y-4 sticky top-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-sm font-bold text-[var(--color-blue-800)]">
              Gráfico Padrão Origin
            </h2>
            <button
              type="button"
              onClick={() => setVersaoGrafico((v) => v + 1)}
              className="inline-flex items-center gap-1 text-xs text-[var(--color-blue)] hover:underline cursor-pointer"
            >
              <RefreshCw size={12} /> Atualizar
            </button>
          </div>

          {/* Seletor do gráfico exibido */}
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['t50', 'Determinação t50'],
                ['perda_massa', 'Perda de Massa (%)'],
                ['aa', 'Absorção Atômica'],
              ] as const
            ).map(([k, rotulo]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTipoGrafico(k)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold border cursor-pointer ${
                  tipoGrafico === k
                    ? 'bg-[var(--color-orange)] border-[var(--color-orange)] text-white'
                    : 'bg-white border-[var(--color-neutral-300)] text-[var(--color-neutral-700)] hover:border-[var(--color-blue)]'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {/* Opções rápidas do Origin */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-neutral-700)]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={configGrafico.show_error_bars}
                onChange={(e) => setConfigGrafico((c) => ({ ...c, show_error_bars: e.target.checked }))}
              />
              Barras de erro
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={configGrafico.show_trendline}
                onChange={(e) => setConfigGrafico((c) => ({ ...c, show_trendline: e.target.checked }))}
              />
              Reta de ajuste
            </label>
            <select
              value={configGrafico.font_family}
              onChange={(e) =>
                setConfigGrafico((c) => ({
                  ...c,
                  font_family: e.target.value as Required<ConfigGraficoReatividade>['font_family'],
                }))
              }
              className="input !w-auto !py-0.5 !px-2 text-xs"
            >
              <option value="Arial">Arial</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Calibri">Calibri</option>
              <option value="DejaVu Sans">DejaVu Sans</option>
            </select>
          </div>

          <EditorGraficoOriginLegenda
            urlImagem={urlGrafico}
            carregando={carregandoGrafico}
            erro={erroGrafico}
            itensLegenda={itensLegendaPreview}
            posicaoInicial={configGrafico.legend_xy}
            molduraInicial={configGrafico.legend_frame}
            onSalvarEstilo={handleSalvarPosicaoLegenda}
            onBaixar={(fmt) => void handleBaixarGrafico(fmt)}
          />

          <div className="text-[11px] text-[var(--color-neutral-500)] flex items-center justify-between pt-1">
            <span>Clique em "Mover caixa da legenda" e arraste sobre o gráfico.</span>
            <button
              type="button"
              onClick={() => void handleBaixarModeloExcel()}
              className="inline-flex items-center gap-1 text-[var(--color-blue)] hover:underline cursor-pointer"
            >
              <Download size={11} /> Exportar Excel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
