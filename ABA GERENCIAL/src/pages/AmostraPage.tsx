import React, { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Atom, ClipboardCheck, ClipboardList, Droplets, FlaskConical, Gauge, Layers, Loader2, Lock,
  type LucideIcon, MapPin, Microscope, RotateCw, Scan, ScanEye,
} from 'lucide-react'
import { AbaAnalise } from '../components/analises/AbaAnalise'
import { ImagensMicroct } from '../components/analises/ImagensMicroct'
import { SeriesRdaLaboratorio } from '../components/analises/SeriesRdaLaboratorio'
import { EnsaiosDissolucaoDaAmostra } from '../components/reatividade/EnsaiosDissolucaoDaAmostra'
import { AbaAnalise as AbaAnaliseVisual } from '../visualizacao/components/analises/AbaAnalise'
import { PermeabilidadeCoreflood } from '../visualizacao/components/analises/PermeabilidadeCoreflood'
import { RdaDaAmostra } from '../visualizacao/components/analises/RdaDaAmostra'
import { PvbtDaAmostra } from '../visualizacao/components/pvbt/PvbtDaAmostra'
import { Cartao, Valor } from '../visualizacao/components/ui/base'
import { OverviewTab } from '../visualizacao/pages/sample-tabs/VisaoGeralTab'
import { ANALISES } from '../visualizacao/config/analises'
import type { AmostraResumo as AmostraResumoDash } from '../visualizacao/tipos/banco'
import { Alert } from '../components/UI'
import { LISTA_ANALISES } from '../config/analises'
import { usePodeEditar } from '../hooks/usePapel'
import { listarConferencias, obterAmostraResumo, obterControleDaAmostra, type AmostraResumo, type ControleDaAmostra } from '../servicos/api'
import { useContexto } from '../store/useContexto'
import type { Conferencia } from '../tipos/banco'
import {
  dimensoes,
  ehVisaoLimitadaLcpetro,
  experimentosDaAmostra,
  litologiaSegura,
  ondeAmostraEsta,
} from '../utils/bancoAmostras'
import { rotuloFinalidade } from '../utils/controleRochas'
import { ensaiosDaFinalidade } from '../utils/finalidade'
import { fmt, fmtData, fmtFaixaMd } from '../utils/formatacao'
import { classeStatus, rotuloStatus } from '../utils/status'

const ICONES: Record<string, LucideIcon> = {
  petrofisica: Gauge,
  microct: Scan,
  coreflooding: Droplets,
  reatividade: FlaskConical,
  rda: RotateCw,
  drx: Atom,
  petrografia: Microscope,
  mev: ScanEye,
}

const CONTADOR: Record<string, string> = {
  petrofisica: 'n_petrofisica', microct: 'n_microct', coreflooding: 'n_coreflooding', reatividade: 'n_reatividade',
  rda: 'n_rda', drx: 'n_drx', petrografia: 'n_petrografia', mev: 'n_mev',
}

export const AmostraPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const aba = params.get('aba') ?? 'geral'
  const empresaSigla = useContexto((s) => s.empresaSigla)

  const [amostra, setAmostra] = useState<AmostraResumo | null>(null)
  const [controle, setControle] = useState<ControleDaAmostra | null>(null)
  const [conferencias, setConferencias] = useState<Conferencia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [versaoRda, setVersaoRda] = useState(0)

  async function carregar() {
    try {
      const [resumo, confs] = await Promise.all([
        obterAmostraResumo(id!),
        listarConferencias(id!).catch(() => [] as Conferencia[]),
      ])
      setAmostra(resumo)
      setConferencias(confs)
      if (resumo && !ehVisaoLimitadaLcpetro(resumo, useContexto.getState().empresaSigla)) {
        setControle(await obterControleDaAmostra(id!).catch(() => null))
      } else {
        setControle(null)
      }
      setErro(null)
    } catch (err: any) {
      setErro(err.message)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    setCarregando(true)
    carregar()
  }, [id])

  const podeEditar = usePodeEditar(amostra?.projeto_id)
  const limitada = ehVisaoLimitadaLcpetro(amostra, empresaSigla)

  if (carregando && !amostra) {
    return (
      <div className="flex items-center gap-2 py-10 text-[13px] text-[var(--color-neutral-600)]">
        <Loader2 size={16} className="animate-spin text-[var(--color-orange)]" /> Carregando a amostra…
      </div>
    )
  }

  if (!amostra) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <p className="font-heading font-bold text-xl text-[var(--color-neutral-500)]">Amostra não encontrada.</p>
        <p className="text-[13px] text-[var(--color-neutral-600)]">
          Ela pode ter sido excluída ou pertencer a um projeto ao qual você não tem acesso.
        </p>
        {erro && <Alert tipo="erro" mensagem={erro} />}
        <button type="button" onClick={() => navigate('/amostras')} className="btn btn-secondary">
          <ArrowLeft size={15} /> Voltar para Amostras e ensaios
        </button>
      </div>
    )
  }

  const a = amostra

  // MODO LIMITADO (Empresa Interna LC PETRO visualizando amostra alocada em projeto externo):
  // Mostra onde a amostra está, quais experimentos ela possui e petrofísica básica, protegendo dados sensíveis.
  if (limitada) {
    const onde = ondeAmostraEsta(a)
    const exps = experimentosDaAmostra(a)
    const ultimaConf = conferencias[0] ?? null
    const kTexto =
      a.k_liquido_md != null
        ? `${fmt(a.k_liquido_md, 2)} mD (líquido)`
        : a.k_gas_md != null
          ? `${fmt(a.k_gas_md, 2)} mD (gás)`
          : (a.permeabilidade_fabricante_min_md ?? a.permeabilidade_fabricante_md) != null
            ? `${fmtFaixaMd(a.permeabilidade_fabricante_min_md, a.permeabilidade_fabricante_max_md, a.permeabilidade_fabricante_md)} (fabricante)`
            : '—'

    return (
      <div className="-mx-7 -mt-8">
        <div className="bg-white border-b border-[var(--color-neutral-300)] px-7 py-6">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--color-neutral-500)] uppercase tracking-[0.07em]">
            <span className="cursor-pointer flex items-center gap-1 hover:text-[var(--color-red)] transition-colors" onClick={() => navigate('/amostras')}>
              <ArrowLeft size={12} /> Amostras e ensaios (Visão Global LC PETRO)
            </span>
            <span>/</span>
            <span>{a.codigo}</span>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-5 mt-5">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="m-0 text-[26px] leading-[1.2] font-heading font-extrabold text-[var(--color-red)]">
                  {a.codigo} <span className="text-[var(--color-blue-800)] font-bold">{litologiaSegura(a, true)}</span>
                </h1>
                <span className={classeStatus(a.status)}>{rotuloStatus(a.status)}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-orange-50)] border border-[var(--color-orange-200)] px-3 py-1 text-[12px] font-bold text-[var(--color-orange-700)]">
                  <Lock size={13} /> {a.empresa} · {a.projeto} (Visão Limitada)
                </span>
              </div>
              <p className="mt-2 text-[13px] text-[var(--color-neutral-700)]">
                Localização física: <strong>{onde.localFisico}</strong>
              </p>
            </div>
          </div>
        </div>

        <div className="px-7 pt-7 pb-10 space-y-6">
          <div className="rounded-xl border border-[var(--color-orange-200)] bg-[var(--color-orange-50)]/70 p-4 flex items-start gap-3 text-[13px] text-[var(--color-neutral-800)]">
            <Lock size={18} className="text-[var(--color-orange-700)] shrink-0 mt-0.5" />
            <div>
              <strong className="text-[var(--color-orange-700)]">Visualização Limitada (Dados Sensíveis Protegidos):</strong>{' '}
              Esta amostra está alocada em <strong>{a.empresa} · {a.projeto}</strong>. Na visão interna do LC PETRO são exibidos{' '}
              <strong>onde a amostra está</strong>, <strong>quais experimentos ela tem</strong> e a <strong>petrofísica básica</strong>, mantendo dados sensíveis do projeto ocultos.
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Cartao titulo="Onde a amostra está" subtitulo="Localização física no laboratório, status atual e alocação" icone={<MapPin size={18} />}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-7">
                <Valor rotulo="Local Físico" destaque>{onde.localFisico}</Valor>
                <Valor rotulo="Status no Estoque" destaque>{rotuloStatus(a.status)}</Valor>
                <Valor rotulo="Empresa / Projeto Alocado">{a.empresa} · {a.projeto}</Valor>
                <Valor rotulo="Tipo de Amostra">
                  {a.tipo_amostra === 'disco' ? 'Disco' : a.tipo_amostra === 'mini_plug' ? 'Mini-plug' : 'Plug'}
                  {a.amostra_mae_codigo ? ` · cortado de ${a.amostra_mae_codigo}` : ''}
                </Valor>
                <Valor rotulo="Última Conferência Física">
                  {ultimaConf ? `${(ultimaConf.resultado ?? 'ok').toUpperCase()} (${fmtData(ultimaConf.data)} · ${ultimaConf.responsaveis})` : 'Sem conferência registrada'}
                </Valor>
                <Valor rotulo="Origem / Poço">
                  <span className="inline-flex items-center gap-1 text-[12px] text-[var(--color-neutral-500)] italic">
                    <Lock size={12} /> {a.tipo_origem} (dados protegidos)
                  </span>
                </Valor>
              </div>
            </Cartao>

            <Cartao titulo="Quais experimentos ela tem" subtitulo="Experimentos realizados ou vinculados a esta amostra" icone={<ClipboardCheck size={18} />}>
              <div className="p-7 flex flex-col gap-4">
                {exps.length === 0 ? (
                  <p className="m-0 text-[13px] text-[var(--color-neutral-500)]">Nenhum experimento registrado para esta amostra até o momento.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {LISTA_ANALISES.map((cfg) => {
                      const n = Number(a[CONTADOR[cfg.chave]] ?? 0)
                      const marcado = ensaiosDaFinalidade(a.finalidade).includes(cfg.chave)
                      if (n === 0 && !marcado) return null
                      const Icon = ICONES[cfg.chave]
                      return (
                        <div key={cfg.chave} className="flex flex-wrap gap-2 items-center justify-between rounded-xl border border-[var(--color-blue-200)] bg-[var(--color-blue-50)]/50 px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Icon size={16} className="text-[var(--color-blue)]" />
                            <span className="font-heading font-bold text-[13px] text-[var(--color-blue-800)]">{cfg.titulo}</span>
                          </div>
                          <span className="tag tag-blue !text-[10px]">
                            {n > 0 ? `${n} registro(s)` : 'Vinculado'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Cartao>
          </div>

          <Cartao titulo="Geometria e Petrofísica Básica" subtitulo="Propriedades físicas básicas do plug/disco" icone={<Layers size={18} />}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-5 p-7">
              <Valor rotulo="Dimensões (D × L)">{dimensoes(a)}</Valor>
              <Valor rotulo="Massa Seca">{a.massa_seca_g != null ? `${fmt(a.massa_seca_g, 2)} g` : '—'}</Valor>
              <Valor rotulo="Volume Poroso (Vp)" calculado>{a.volume_poroso_cm3 != null ? `${fmt(a.volume_poroso_cm3, 3)} cm³` : '—'}</Valor>
              <Valor rotulo="Porosidade (φ)" destaque>{a.porosidade_pct != null ? `${fmt(a.porosidade_pct, 1)} %` : '—'}</Valor>
              <Valor rotulo="Permeabilidade (k)" destaque>{kTexto}</Valor>
              <Valor rotulo="k do Fabricante">
                {(a.permeabilidade_fabricante_min_md ?? a.permeabilidade_fabricante_md) != null
                  ? fmtFaixaMd(a.permeabilidade_fabricante_min_md, a.permeabilidade_fabricante_max_md, a.permeabilidade_fabricante_md)
                  : '—'}
              </Valor>
            </div>
          </Cartao>
        </div>
      </div>
    )
  }

  const todas = LISTA_ANALISES.map((cfg) => ({
    chave: cfg.chave,
    rotulo: `${cfg.numero}. ${cfg.titulo}`,
    icone: ICONES[cfg.chave],
    n: Number(a[CONTADOR[cfg.chave]] ?? 0),
  }))
  const marcados = ensaiosDaFinalidade(a.finalidade)
  const abas: { chave: string; rotulo: string; icone: LucideIcon; n?: number }[] = [
    { chave: 'geral', rotulo: 'Visão geral', icone: ClipboardList },
    ...todas.filter((t) => t.n > 0 || marcados.includes(t.chave)),
  ]
  const cfgAtiva = abas.some((t) => t.chave === aba) ? LISTA_ANALISES.find((c) => c.chave === aba) : undefined
  const cfgVisual = ANALISES.find((c) => c.chave === aba)
  const semEnsaio = marcados.length === 0 && todas.every((t) => t.n === 0)

  const origem = a.tipo_origem === 'testemunho'
    ? [a.poco && `Poço ${a.poco}`, a.campo, a.bacia, a.profundidade_m != null && `${fmt(a.profundidade_m, 1)} m`]
    : [a.afloramento_local, a.fornecedor]

  return (
    <div className="-mx-7 -mt-8">
      <div className="bg-white border-b border-[var(--color-neutral-300)] px-7 pt-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--color-neutral-500)] uppercase tracking-[0.07em]">
          <span className="cursor-pointer flex items-center gap-1 hover:text-[var(--color-red)] transition-colors" onClick={() => navigate('/amostras')}>
            <ArrowLeft size={12} /> Amostras e ensaios
          </span>
          <span>/</span>
          <span>{a.codigo}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-5 mt-5">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="m-0 text-[26px] leading-[1.2] font-heading font-extrabold text-[var(--color-red)]">
                {a.codigo} <span className="text-[var(--color-blue-800)] font-bold">{a.litologia}</span>
              </h1>
              <span className={classeStatus(a.status)}>{rotuloStatus(a.status)}</span>
              <span className="selo-projeto">{a.empresa} · {a.projeto}</span>
            </div>
            <p className="mt-2 text-[13px] text-[var(--color-neutral-700)]">
              <span className={`tag ${a.tipo_origem === 'testemunho' ? 'tag-blue' : 'tag-orange'} mr-2`}>{a.tipo_origem}</span>
              {rotuloFinalidade(a.finalidade) && <span className="tag tag-outline mr-2">{rotuloFinalidade(a.finalidade)}</span>}
              {origem.filter(Boolean).join(' · ') || 'Origem não informada'}
            </p>
          </div>
          {!podeEditar && (
            <span className="tag tag-muted" title="Seu acesso a este projeto é de leitor">Somente leitura</span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-7 gap-y-1 mt-7">
          {abas.map(({ chave, rotulo, icone: Icone, n }) => {
            const ativa = aba === chave
            return (
              <button key={chave} type="button" onClick={() => setParams({ aba: chave })}
                className={`flex items-center gap-2 pb-3 cursor-pointer text-[13px] font-semibold whitespace-nowrap border-b-[3px] transition-all ${ativa
                  ? 'border-[var(--color-orange)] text-[var(--color-blue-800)]'
                  : 'border-transparent text-[var(--color-neutral-600)] hover:text-[var(--color-blue)] hover:border-[var(--color-blue-200)]'}`}>
                <Icone size={14} className={ativa ? 'text-[var(--color-red)]' : 'text-[var(--color-neutral-400)]'} />
                {rotulo}
                {n != null && (n > 0
                  ? <span className="rounded-full bg-[var(--color-blue)] px-1.5 text-[10px] font-bold text-white">{n}</span>
                  : <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-neutral-300)]" title="Sem registros" />)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-7 pt-7 space-y-6">
        {aba === 'geral' && a.status === 'utilizada' && semEnsaio && (
          <Alert tipo="info" mensagem="Esta amostra está como utilizada, mas não tem nenhum ensaio registrado." />
        )}
        {aba === 'geral' && (
          <OverviewTab a={a as unknown as AmostraResumoDash} podeEditar={podeEditar} observacoes={controle?.observacoes ?? null} />
        )}

        {cfgAtiva && cfgVisual && (
          <AbaAnaliseVisual
            key={`v-${cfgVisual.chave}`}
            cfg={cfgVisual}
            amostraId={a.id}
            podeEditar={false}
            aoMudar={carregar}
            amostra={{ finalidade: a.finalidade, status: a.status, codigo: a.codigo, comprimento_cm: a.comprimento_cm, diametro_cm: a.diametro_cm }}
            controle={controle}
            antes={cfgVisual.chave === 'coreflooding'
              ? <PermeabilidadeCoreflood amostraId={a.id} amostra={{ codigo: a.codigo, comprimento_cm: a.comprimento_cm, diametro_cm: a.diametro_cm }} />
              : undefined}
            extra={cfgVisual.chave === 'coreflooding' ? <PvbtDaAmostra amostraId={a.id} codigo={a.codigo} /> : undefined}
          />
        )}

        {cfgAtiva?.chave === 'microct' && (
          <ImagensMicroct amostraId={a.id} codigo={a.codigo} podeEditar={podeEditar} />
        )}

        {cfgAtiva?.chave === 'reatividade' && <EnsaiosDissolucaoDaAmostra amostraId={a.id} />}

        {cfgAtiva?.chave === 'rda' && (
          <SeriesRdaLaboratorio amostraId={a.id} codigo={a.codigo} projetoId={a.projeto_id} litologia={a.litologia} podeEditar={podeEditar}
            aoMudar={() => { setVersaoRda((v) => v + 1); void carregar() }} />
        )}

        {cfgAtiva && podeEditar && (
          <div className="border-t-2 border-[var(--color-neutral-300)] pt-6">
            <h2 className="m-0 mb-4 text-[16px] font-heading font-bold text-[var(--color-blue-800)]">Lançar e editar ensaios</h2>
            <AbaAnalise
              key={`${cfgAtiva.chave}-${cfgAtiva.chave === 'rda' ? versaoRda : 0}`}
              cfg={cfgAtiva}
              amostraId={a.id}
              codigoAmostra={a.codigo}
              podeEditar={podeEditar}
              aoMudar={carregar}
              amostra={{ finalidade: a.finalidade, status: a.status }}
              controle={controle}
            />
          </div>
        )}
      </div>
    </div>
  )
}
