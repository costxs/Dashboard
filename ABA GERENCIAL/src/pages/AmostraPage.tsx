import React, { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Atom, ClipboardList, Droplets, FlaskConical, Gauge, Loader2,
  type LucideIcon, Microscope, RotateCw, Scan, ScanEye,
} from 'lucide-react'
import { AbaAnalise } from '../components/analises/AbaAnalise'
import { Conferencias } from '../components/amostra/Conferencias'
import { Alert, Card } from '../components/UI'
import { Simbolos } from '../components/Simbolos'
import { LISTA_ANALISES } from '../config/analises'
import { usePodeEditar } from '../hooks/usePapel'
import { obterAmostraResumo, obterControleDaAmostra, type AmostraResumo, type ControleDaAmostra } from '../servicos/api'
import { rotuloFinalidade } from '../utils/controleRochas'
import { fmt, fmtFaixaMd } from '../utils/formatacao'
import { classeStatus, rotuloStatus } from '../utils/status'

// Ficha da amostra: Visão geral + as 8 análises em abas, na ordem
// 1 Petrofísica, 2 Micro-CT, 3 Coreflooding, 4 Reatividade estática, 5 RDA, 6 DRX, 7 Petrografia, 8 MEV.
// Base: docs/referencia/painel-cadastro/src/pages/SampleDetailPage.tsx

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

/** coluna de contagem em v_amostras para cada análise */
const CONTADOR: Record<string, string> = {
  petrofisica: 'n_petrofisica', microct: 'n_microct', coreflooding: 'n_coreflooding', reatividade: 'n_reatividade',
  rda: 'n_rda', drx: 'n_drx', petrografia: 'n_petrografia', mev: 'n_mev',
}

const Valor: React.FC<{ rotulo: string; children: React.ReactNode; destaque?: boolean }> = ({ rotulo, children, destaque }) => (
  <div className="field">
    <span className="rotulo"><Simbolos>{rotulo}</Simbolos></span>
    <div className={destaque ? 'numero text-[16px]' : 'text-[14px] font-medium tabular-nums'}>{children}</div>
  </div>
)

export const AmostraPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const aba = params.get('aba') ?? 'geral'

  const [amostra, setAmostra] = useState<AmostraResumo | null>(null)
  // observações e petrofísica "depois": a view v_amostras não traz
  const [controle, setControle] = useState<ControleDaAmostra | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    try {
      const [resumo, doControle] = await Promise.all([obterAmostraResumo(id!), obterControleDaAmostra(id!)])
      setAmostra(resumo)
      setControle(doControle)
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
  const abas: { chave: string; rotulo: string; icone: LucideIcon; n?: number }[] = [
    { chave: 'geral', rotulo: 'Visão geral', icone: ClipboardList },
    ...LISTA_ANALISES.map((cfg) => ({
      chave: cfg.chave,
      rotulo: `${cfg.numero}. ${cfg.titulo}`,
      icone: ICONES[cfg.chave],
      n: Number(a[CONTADOR[cfg.chave]] ?? 0),
    })),
  ]
  const cfgAtiva = LISTA_ANALISES.find((c) => c.chave === aba)

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
        {aba === 'geral' && (
          <>
            <Card titulo="Dados da amostra" subtitulo="Geometria e resumo das análises mais recentes">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
                <Valor rotulo="Diâmetro (cm)">{fmt(a.diametro_cm, 3)}</Valor>
                <Valor rotulo="Comprimento (cm)">{fmt(a.comprimento_cm, 3)}</Valor>
                <Valor rotulo="Massa seca (g)">{fmt(a.massa_seca_g, 2)}</Valor>
                <Valor rotulo="k do fabricante">{fmtFaixaMd(a.permeabilidade_fabricante_min_md, a.permeabilidade_fabricante_max_md, a.permeabilidade_fabricante_md)}</Valor>
                <Valor rotulo="φ (%)" destaque>{fmt(a.porosidade_pct, 2)}</Valor>
                <Valor rotulo="k gás (mD)" destaque>{fmt(a.k_gas_md, 2)}</Valor>
                <Valor rotulo="k líquido antes (mD)" destaque>{fmt(a.k_liquido_md, 2)}</Valor>
                <Valor rotulo="k líquido depois (mD)" destaque>{fmt(a.k_liquido_depois_md, 2)}</Valor>
                <Valor rotulo="Volume poroso (cm³)">{fmt(a.volume_poroso_cm3, 3)}</Valor>
                <Valor rotulo="PVbt" destaque>{fmt(a.pvbt, 2)}</Valor>
                <Valor rotulo="Breakthrough">{fmt(a.breakthrough)}</Valor>
                <Valor rotulo="Finalidade">{rotuloFinalidade(a.finalidade) ?? '—'}</Valor>
              </div>
            </Card>
            {controle?.observacoes && (
              <Card titulo="Observações do controle" subtitulo="Texto das observações da amostra (vem da planilha de controle de rochas ou do cadastro)">
                <p className="m-0 whitespace-pre-line text-[14px] text-[var(--color-neutral-800)]">{controle.observacoes}</p>
              </Card>
            )}
            <Conferencias amostraId={a.id} podeEditar={podeEditar} />
          </>
        )}

        {cfgAtiva && (
          <AbaAnalise
            key={cfgAtiva.chave}
            cfg={cfgAtiva}
            amostraId={a.id}
            codigoAmostra={a.codigo}
            podeEditar={podeEditar}
            aoMudar={carregar}
            amostra={{ finalidade: a.finalidade, status: a.status }}
            controle={controle}
          />
        )}
      </div>
    </div>
  )
}
