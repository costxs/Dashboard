// AMOSTRA › ficha › 5. RDA: ensaios do PRÓPRIO laboratório.
//   - lista dos ensaios do disco com a situação (os criados pela planilha de controle chegam "aguardando resultado")
//     e "Lançar resultado", que ATUALIZA a mesma linha (lancarResultadoRda — rdaDosDiscos.ts);
//   - "Nova série RDA": uma condição em várias rotações, um disco por ponto (gravarSerieLaboratorio);
//   - "Literatura comparável": mesma rocha, com selos de mesmo ácido / mesma temperatura (migração 021).
import React, { useMemo, useState } from 'react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { BookOpen, CheckCircle2, Loader2, Plus, RotateCw, Trash2 } from 'lucide-react'
import { Alert, Card, Input, Modal, Select } from '../UI'
import { useConsulta } from '../../hooks/useConsulta'
import {
  ajusteLevich, gravarSerieLaboratorio, paraPolegada, raizOmega, taxaPelaCurvaCalcio, temperaturaNominal, validarSerie,
  type Condicao, type PontoLaboratorio, type Problema, type UnComprimento,
} from '../../importador/cadastroReatividade'
import { numero } from '../../importador/planilhaBdd'
import { lancarResultadoRda, type ResultadoDoEnsaio } from '../../importador/rdaDosDiscos'
import { supabase } from '../../lib/supabase'
import { GraficoLevich, ListaProblemas } from '../../literatura/reatividade/pecas'
import { explicarErro020, listarListas, literaturaComparavel, seriesRdaDaAmostra, type RdaLaboratorio } from '../../literatura/reatividade/servico'
import { listarAmostras, listarSistemasAcidos } from '../../servicos/api'
import { fmt, mensagemErro } from '../../utils/formatacao'

interface Props { amostraId: string; codigo: string; projetoId: string; podeEditar: boolean; aoMudar: () => void }
interface LinhaDisco { amostra_id: string; rpm: string; taxa: string; curva: string; data: string }

const UN_COMPRIMENTO: UnComprimento[] = ['in', 'cm', 'mm']
const SEM_SERIE = '(sem série)'

function ler(s: string): [number | null, boolean] {
  const n = numero(s)
  return n == null ? [null, false] : Number.isNaN(n) ? [null, true] : [n, false]
}
/** "tempo ⇥ [Ca²⁺]" por linha (tab, ; ou espaço; vírgula decimal). Linhas que não são número (cabeçalho) são ignoradas. */
function lerCurva(texto: string): { tempo_min: number; ca_mg_l: number }[] {
  const pts: { tempo_min: number; ca_mg_l: number }[] = []
  for (const l of texto.split(/\r?\n/)) {
    const cels = l.trim().split(/\t|;|\s+/).filter(Boolean)
    if (cels.length < 2) continue
    const t = numero(cels[0]), c = numero(cels[1])
    if (t != null && c != null && !Number.isNaN(t) && !Number.isNaN(c)) pts.push({ tempo_min: t, ca_mg_l: c })
  }
  return pts
}

export const SeriesRdaLaboratorio: React.FC<Props> = ({ amostraId, codigo, projetoId, podeEditar, aoMudar }) => {
  const series = useConsulta(() => seriesRdaDaAmostra(amostraId), [amostraId])
  const [aberto, setAberto] = useState(false)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [lancando, setLancando] = useState<RdaLaboratorio | null>(null)

  const meus = useMemo(() => (series.dados ?? []).filter((r) => r.amostra_id === amostraId), [series.dados, amostraId])
  // séries no gráfico de Levich: só os ensaios que já têm taxa
  const grupos = useMemo(() => {
    const g = new Map<string, RdaLaboratorio[]>()
    for (const r of (series.dados ?? []).filter((x) => x.taxa_reacao_mol_cm2_s != null)) g.set(r.serie ?? SEM_SERIE, [...(g.get(r.serie ?? SEM_SERIE) ?? []), r])
    return [...g.entries()].sort((a, b) => Number(a[0] === SEM_SERIE) - Number(b[0] === SEM_SERIE) || a[0].localeCompare(b[0]))
  }, [series.dados])
  const nSeries = new Set((series.dados ?? []).map((r) => r.serie).filter(Boolean)).size

  return (
    <>
    <Card titulo="Ensaios de RDA desta amostra" icone={<RotateCw size={18} />}
      subtitulo="Ensaios do disco (os da planilha de controle chegam “aguardando resultado”) e as séries com o ajuste de Levich (taxa × √ω)"
      acoes={podeEditar && !aberto && (
        <button type="button" className="btn btn-primary" onClick={() => { setSucesso(null); setAberto(true) }}><Plus size={14} /> Nova série RDA</button>
      )}>
      <div className="flex flex-col gap-6">
        {sucesso && <Alert tipo="sucesso" mensagem={sucesso} onClose={() => setSucesso(null)} />}
        {meus.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table text-[13px]">
              <thead>
                <tr>
                  <th>Sistema ácido</th><th className="text-right">T (°C)</th><th className="text-right">rpm</th>
                  <th className="text-right">Taxa (mol/cm²·s)</th><th>Situação</th><th>Origem</th><th>Série</th><th />
                </tr>
              </thead>
              <tbody>
                {meus.map((l) => {
                  const aguardando = (l.situacao ?? (l.taxa_reacao_mol_cm2_s == null ? 'aguardando resultado' : 'com resultado')) === 'aguardando resultado'
                  return (
                    <tr key={l.id} className="lcp-row">
                      <td className="!py-2">
                        <span className="font-semibold text-[var(--color-blue-800)]">{l.id_sistema}</span> — {l.nome_sistema}
                        {l.texto_utilizacao && <span className="block text-[11px] text-[var(--color-neutral-500)]">Utilização: {l.texto_utilizacao}</span>}
                      </td>
                      <td className="!py-2 text-right tabular-nums">{fmt(l.temperatura_c, 1)}</td>
                      <td className="!py-2 text-right tabular-nums">{fmt(l.rotacao_rpm, 0)}</td>
                      <td className="!py-2 text-right tabular-nums">{fmt(l.taxa_reacao_mol_cm2_s, 3, true)}</td>
                      <td className="!py-2">
                        {aguardando
                          ? <span className="tag" style={{ color: '#a85200', background: 'var(--color-orange-50)', borderColor: 'var(--color-orange-200)' }}>aguardando resultado</span>
                          : <span className="tag tag-blue">com resultado</span>}
                      </td>
                      <td className="!py-2">{ORIGEM[l.origem_registro ?? 'formulario']}</td>
                      <td className="!py-2">{l.serie ?? '—'}</td>
                      <td className="!py-2 text-right">
                        {podeEditar && aguardando && (
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => { setSucesso(null); setLancando(l) }}>Lançar resultado</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {aberto && (
          <FormularioSerie amostraId={amostraId} codigo={codigo} projetoId={projetoId} sugestao={`${codigo}-S${nSeries + 1}`}
            aoCancelar={() => setAberto(false)}
            aoGravar={(serie, n) => { setAberto(false); setSucesso(`Série ${serie} gravada: ${n} ponto(s).`); series.recarregar(); aoMudar() }} />
        )}

        {series.carregando && !series.dados ? (
          <p className="m-0 flex items-center gap-2 text-[13px] text-[var(--color-neutral-600)]"><Loader2 size={14} className="animate-spin text-[var(--color-orange)]" /> Carregando as séries…</p>
        ) : series.erro ? <Alert tipo="erro" mensagem={series.erro} />
          : !grupos.length ? (
            !aberto && <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">
              {meus.length ? 'Nenhum ensaio desta amostra tem taxa ainda: lance o resultado para ver o gráfico de Levich.' : 'Nenhum ensaio de RDA lançado para esta amostra.'}
            </p>
          ) : grupos.map(([serie, linhas]) => {
            const pontos = linhas.map((l) => ({ rotacao_rpm: l.rotacao_rpm, taxa_reacao_mol_cm2_s: l.taxa_reacao_mol_cm2_s }))
            const xy = linhas.filter((l) => l.rotacao_rpm != null && l.rotacao_rpm > 0 && l.taxa_reacao_mol_cm2_s != null && l.taxa_reacao_mol_cm2_s > 0)
              .map((l) => ({ x: raizOmega(l.rotacao_rpm!), y: l.taxa_reacao_mol_cm2_s!, rotulo: `${l.amostra} · ${fmt(l.rotacao_rpm, 0)} rpm` }))
            const p = linhas[0]
            return (
              <section key={serie} className="rounded-[12px] border border-[var(--color-neutral-300)] p-5">
                <h3 className="m-0 text-[15px] font-bold text-[var(--color-blue-800)]">
                  {serie === SEM_SERIE ? 'Ensaios sem série' : <>Série <span className="text-[var(--color-red)]">{serie}</span></>}
                </h3>
                <p className="m-0 mt-1 text-[12px] text-[var(--color-neutral-600)]">
                  {serie === SEM_SERIE ? 'Lançados um a um, sem código de série.'
                    : <>{p.id_sistema} — {p.nome_sistema} · {fmt(p.temperatura_c, 1)} °C · {p.pressao_psi != null ? `${fmt(p.pressao_psi, 0)} psi` : 'pressão não informada'}{p.dim_h_in != null ? ` · disco ${fmt(p.dim_h_in, 3)} in` : ''}</>}
                </p>
                <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <div className="overflow-x-auto">
                    <table className="table text-[13px]">
                      <thead><tr><th>Amostra (disco)</th><th className="text-right">Rotação (rpm)</th><th className="text-right">√ω</th><th className="text-right">Taxa (mol/cm²·s)</th><th>Origem da taxa</th></tr></thead>
                      <tbody>
                        {linhas.map((l) => (
                          <tr key={l.id} className="lcp-row">
                            <td className={`!py-2 font-semibold ${l.amostra_id === amostraId ? 'text-[var(--color-red)]' : 'text-[var(--color-blue-800)]'}`}>{l.amostra}</td>
                            <td className="!py-2 text-right tabular-nums">{fmt(l.rotacao_rpm, 0)}</td>
                            <td className="!py-2 text-right tabular-nums">{l.rotacao_rpm != null ? fmt(raizOmega(l.rotacao_rpm), 3) : '—'}</td>
                            <td className="!py-2 text-right tabular-nums">{fmt(l.taxa_reacao_mol_cm2_s, 3, true)}</td>
                            <td className="!py-2">{l.taxa_calculada ? 'curva [Ca²⁺] × tempo' : 'digitada'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <GraficoLevich pontos={xy} levich={ajusteLevich(pontos)} altura={260} />
                </div>
              </section>
            )
          })}
      </div>
    </Card>

    {lancando && (
      <LancarResultado ensaio={lancando} codigo={codigo} aoFechar={() => setLancando(null)}
        aoGravar={(msg) => { setLancando(null); setSucesso(msg); series.recarregar(); aoMudar() }} />
    )}

    <LiteraturaComparavelCard amostraId={amostraId} meus={meus} />
    </>
  )
}

const ORIGEM: Record<string, string> = { controle: 'planilha de controle', formulario: 'painel', equipamento: 'equipamento' }

// ---------------------------------------------------------------------------
// Lançar o resultado num ensaio "aguardando resultado": ATUALIZA a mesma linha (lancarResultadoRda)
function LancarResultado(p: { ensaio: RdaLaboratorio; codigo: string; aoFechar: () => void; aoGravar: (msg: string) => void }) {
  const e = p.ensaio
  const listas = useConsulta(() => listarListas(true), [])
  const [f, setF] = useState({
    pressao: '', d1: '', d2: '', uL: 'in' as UnComprimento, volume: '', serie: e.serie ?? '', data: e.data_ensaio ?? '',
    metQ: e.metodo_quantificacao ?? '', taxa: '', curva: '', responsavel: '', observacoes: '',
  })
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: ev.target.value })

  const { res, calc, problemas } = useMemo(() => {
    const pr: Problema[] = []
    const num = (s: string, rotulo: string) => {
      const [v, invalido] = ler(s)
      if (invalido) pr.push({ severidade: 'ERRO', campo: rotulo, mensagem: `${rotulo}: "${s}" não é um número` })
      return v
    }
    const d1 = num(f.d1, 'diâmetro'), d2 = num(f.d2, 'espessura'), volume = num(f.volume, 'volume de ácido')
    const dim_h_in = d1 != null ? Number(paraPolegada(d1, f.uL).toFixed(4)) : null
    const curva = lerCurva(f.curva)
    let calc: ReturnType<typeof taxaPelaCurvaCalcio> = null
    if (f.curva.trim()) {
      if (curva.length < 2) pr.push({ severidade: 'ERRO', campo: 'curva', mensagem: 'a curva precisa de pelo menos 2 linhas "tempo (min) e [Ca²⁺] (mg/L)"' })
      else if (!(volume != null && volume > 0) || !dim_h_in) pr.push({ severidade: 'ERRO', campo: 'curva', mensagem: 'para calcular pela curva, informe o volume de ácido e o diâmetro do disco' })
      else {
        calc = taxaPelaCurvaCalcio(curva, volume, dim_h_in)
        if (!calc) pr.push({ severidade: 'ERRO', campo: 'curva', mensagem: 'não deu para ajustar a curva (tempos todos iguais?)' })
        else if (calc.r2 < 0.9) pr.push({ severidade: 'AVISO', campo: 'curva', mensagem: `curva de cálcio pouco linear (R² = ${fmt(calc.r2, 3)}): confira os pontos` })
      }
    }
    const taxa = f.curva.trim() ? null : num(f.taxa, 'taxa')
    if (!f.curva.trim() && taxa == null) pr.push({ severidade: 'ERRO', campo: 'taxa', mensagem: 'informe a taxa ou cole a curva [Ca²⁺] × tempo' })
    if (taxa != null && (taxa <= 0 || taxa < 1e-10 || taxa > 1e-4)) pr.push({ severidade: taxa <= 0 ? 'ERRO' : 'AVISO', campo: 'taxa', mensagem: `${taxa} mol/(cm²·s) fora do esperado (1E-10 a 1E-4): conferir o expoente` })
    const res: ResultadoDoEnsaio = {
      taxa_reacao_mol_cm2_s: taxa, ...(curva.length >= 2 ? { curva_calcio: curva } : {}),
      volume_acido_ml: volume, dim_h_in, dim_d_in: d2 != null ? Number(paraPolegada(d2, f.uL).toFixed(4)) : null,
      pressao_psi: num(f.pressao, 'pressão'), data_ensaio: f.data || null, serie: f.serie.trim() || null,
      metodo_quantificacao: f.metQ || null, responsavel: f.responsavel.trim() || null, observacoes: f.observacoes.trim() || null,
    }
    return { res, calc, problemas: pr }
  }, [f])
  const nErros = problemas.filter((x) => x.severidade === 'ERRO').length

  async function gravar() {
    setErro(null)
    setGravando(true)
    try {
      const r = await lancarResultadoRda(supabase, e.id, res)
      p.aoGravar(`Resultado lançado em ${p.codigo}: taxa ${fmt(r.taxa_mol_cm2_s, 3, true)} mol/(cm²·s)${r.calculada ? ` (pela curva, R² ${fmt(r.r2, 3)})` : ''}.`)
    } catch (err) {
      setErro(mensagemErro(err))
    } finally {
      setGravando(false)
    }
  }

  return (
    <Modal isOpen onClose={p.aoFechar} maxWidth="max-w-4xl" titulo={`Lançar resultado · ${p.codigo}`}
      subtitulo="Atualiza este mesmo ensaio (não cria outro). Sistema, temperatura e rotação vêm do controle.">
      <div className="flex max-h-[72vh] flex-col gap-4 overflow-auto pr-1">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Sistema ácido" value={`${e.id_sistema} — ${e.nome_sistema}`} readOnly disabled />
          <Input label="Temperatura" unidade="°C" value={fmt(e.temperatura_c, 1)} readOnly disabled />
          <Input label="Rotação" unidade="rpm" value={fmt(e.rotacao_rpm, 0)} readOnly disabled />
          <Input label="Pressão" unidade="psi" inputMode="decimal" value={f.pressao} onChange={set('pressao')} />
          <div>
            <span className="rotulo">Disco: diâmetro e espessura</span>
            <div className="mt-1 flex gap-2">
              <input className="input" inputMode="decimal" aria-label="Diâmetro do disco" placeholder="diâmetro" value={f.d1} onChange={set('d1')} />
              <input className="input" inputMode="decimal" aria-label="Espessura do disco" placeholder="espessura" value={f.d2} onChange={set('d2')} />
              <select className="input !w-[76px] shrink-0" aria-label="Unidade das dimensões" value={f.uL} onChange={set('uL')}>
                {UN_COMPRIMENTO.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <Input label="Volume de ácido" unidade="mL" inputMode="decimal" value={f.volume} onChange={set('volume')} />
          <Input label="Série" placeholder={`${p.codigo}-S1`} value={f.serie} onChange={set('serie')} ajuda="Liga os pontos da mesma curva de Levich." />
          <Input label="Data do ensaio" type="date" value={f.data} onChange={set('data')} />
          <Select label="Método de quantificação" value={f.metQ} onChange={set('metQ')}>
            <option value="">—</option>
            {(listas.dados ?? []).filter((l) => l.lista === 'metodo_quantificacao').map((l) => <option key={l.valor} value={l.valor}>{l.valor}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="Taxa de reação" unidade="mol/(cm²·s)" inputMode="decimal" placeholder={f.curva.trim() ? 'calculada pela curva' : 'ex.: 2,5E-6'}
            disabled={!!f.curva.trim()} value={f.taxa} onChange={set('taxa')} />
          <label className="field w-full">
            <span className="rotulo">ou curva [Ca²⁺] (mg/L) × tempo (min)</span>
            <textarea className="input font-mono text-[12px]" rows={4} placeholder="cole do Excel: tempo ⇥ [Ca²⁺]" value={f.curva} onChange={set('curva')} />
          </label>
        </div>
        {calc && (
          <p className="m-0 text-[13px] text-[var(--color-neutral-700)]">
            {calc.n} pontos · inclinação {fmt(calc.inclinacao_mg_l_min, 4)} mg/(L·min) · R² {fmt(calc.r2, 3)} · área {fmt(calc.area_cm2, 3)} cm² ·{' '}
            taxa <strong className="text-[var(--color-blue-800)]">{fmt(calc.taxa_mol_cm2_s, 3, true)}</strong> mol/(cm²·s)
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="Responsável" value={f.responsavel} onChange={set('responsavel')} />
          <Input label="Observações" value={f.observacoes} onChange={set('observacoes')} />
        </div>
        <ListaProblemas problemas={problemas} />
        {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
      </div>
      <div className="mt-4 flex justify-end gap-3 border-t border-[var(--color-neutral-300)] pt-4">
        <button type="button" className="btn btn-secondary" onClick={p.aoFechar} disabled={gravando}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={gravar} disabled={gravando || nErros > 0}>
          {gravando ? <><Loader2 size={14} className="animate-spin" /> Gravando…</> : 'Gravar resultado'}
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Literatura comparável: medidas da literatura com a mesma rocha (rda_literatura_comparavel, migração 021)
const COR_LIT = '#2a78d6'
const COR_AMOSTRA = '#eb6834'

function LiteraturaComparavelCard({ amostraId, meus }: { amostraId: string; meus: RdaLaboratorio[] }) {
  const lit = useConsulta(() => literaturaComparavel(amostraId), [amostraId])
  const linhas = lit.dados ?? []
  const xyLit = linhas.filter((l) => l.raiz_omega != null && l.taxa_reacao_mol_m2_s != null && l.taxa_reacao_mol_m2_s > 0)
    .map((l) => ({ x: Number(l.raiz_omega), y: Number(l.taxa_reacao_mol_m2_s), rotulo: `${l.id_ensaio} · ${l.referencia}` }))
  // a taxa da literatura vem em mol/(m²·s): converte a do disco (mol/(cm²·s) × 10⁴) para o mesmo eixo
  const xyMeus = meus.filter((m) => m.rotacao_rpm != null && m.rotacao_rpm > 0 && m.taxa_reacao_mol_cm2_s != null && m.taxa_reacao_mol_cm2_s > 0)
    .map((m) => ({ x: raizOmega(m.rotacao_rpm!), y: m.taxa_reacao_mol_cm2_s! * 1e4, rotulo: `${m.amostra} · ${fmt(m.rotacao_rpm, 0)} rpm` }))

  return (
    <Card titulo="Literatura comparável" icone={<BookOpen size={18} />}
      subtitulo="Medidas da literatura com a mesma rocha desta amostra; os selos marcam o mesmo ácido e a mesma temperatura nominal dos ensaios do disco">
      {lit.carregando && !lit.dados ? (
        <p className="m-0 flex items-center gap-2 text-[13px] text-[var(--color-neutral-600)]"><Loader2 size={14} className="animate-spin text-[var(--color-orange)]" /> Carregando…</p>
      ) : lit.erro ? <Alert tipo="erro" mensagem={lit.erro} />
        : !linhas.length ? <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">Nenhuma medida da literatura com esta rocha.</p>
          : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="max-h-[380px] overflow-auto">
                <table className="table text-[12px]">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th>Referência</th><th>Ácido</th><th className="text-right">T nom. (°C)</th><th className="text-right">rpm</th>
                      <th className="text-right">Taxa (mol/m²·s)</th><th>Procedência</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.id_ensaio} className="lcp-row">
                        <td className="!py-2"><span className="font-semibold text-[var(--color-blue-800)]">{l.referencia}</span><span className="block text-[11px] text-[var(--color-neutral-500)]">{l.id_ensaio}</span></td>
                        <td className="!py-2">{l.acido}{l.conc_m != null && <span className="text-[var(--color-neutral-500)]"> {fmt(l.conc_m, 3)} M</span>}</td>
                        <td className="!py-2 text-right tabular-nums">{fmt(l.temperatura_nominal_c, 0)}</td>
                        <td className="!py-2 text-right tabular-nums">{fmt(l.rotacao_rpm, 0)}</td>
                        <td className="!py-2 text-right tabular-nums">{fmt(l.taxa_reacao_mol_m2_s, 3, true)}</td>
                        <td className="!py-2">{l.obtencao_dado ?? '—'}{l.conferido && <span className="ml-1 tag tag-blue">conferido</span>}</td>
                        <td className="!py-2">
                          <div className="flex flex-wrap gap-1">
                            {l.mesmo_acido && <span className="tag tag-orange">mesmo ácido</span>}
                            {l.mesma_temperatura && <span className="tag tag-orange">mesma temperatura</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <figure className="m-0">
                <div style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 22 }}>
                      <CartesianGrid stroke="var(--grafico-grade)" />
                      <XAxis dataKey="x" type="number" domain={[0, 'auto']} stroke="var(--grafico-texto)" tick={{ fontSize: 11, fill: 'var(--grafico-texto)' }}
                        tickFormatter={(v: number) => fmt(v, 1)}
                        label={{ value: '√ω (rad/s)^0,5', position: 'insideBottom', offset: -16, fill: 'var(--grafico-texto)', fontSize: 12 }} />
                      <YAxis dataKey="y" type="number" domain={[0, 'auto']} stroke="var(--grafico-texto)" width={62} tick={{ fontSize: 11, fill: 'var(--grafico-texto)' }}
                        tickFormatter={(v: number) => (v === 0 ? '0' : v.toExponential(1))}
                        label={{ value: 'Taxa (mol/m²·s)', angle: -90, position: 'insideLeft', fill: 'var(--grafico-texto)', fontSize: 12, style: { textAnchor: 'middle' } }} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v) => fmt(v, 3, true)} labelFormatter={() => ''} />
                      <Scatter name="literatura" data={xyLit} fill={COR_LIT} fillOpacity={0.75} isAnimationActive={false} />
                      <Scatter name="esta amostra" data={xyMeus} fill={COR_AMOSTRA} isAnimationActive={false} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <figcaption className="mt-1 flex flex-wrap gap-x-4 text-[12px] text-[var(--color-neutral-700)]">
                  <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR_LIT }} /> literatura</span>
                  <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR_AMOSTRA }} /> ensaios desta amostra com taxa{!xyMeus.length && ' (nenhum ainda)'}</span>
                </figcaption>
              </figure>
            </div>
          )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
function FormularioSerie(p: { amostraId: string; codigo: string; projetoId: string; sugestao: string; aoCancelar: () => void; aoGravar: (serie: string, n: number) => void }) {
  const sistemas = useConsulta(listarSistemasAcidos, [])
  const listas = useConsulta(() => listarListas(true), [])
  const amostras = useConsulta(() => listarAmostras({ projeto_id: p.projetoId }), [p.projetoId])
  const linhaVazia = (): LinhaDisco => ({ amostra_id: p.amostraId, rpm: '', taxa: '', curva: '', data: '' })

  const [f, setF] = useState({ serie: p.sugestao, id_sistema: '', temperatura: '', pressao: '', d1: '', d2: '', uL: 'in' as UnComprimento, volume: '', metQ: '', responsavel: '', observacao: '' })
  const [linhas, setLinhas] = useState<LinhaDisco[]>(() => [linhaVazia(), linhaVazia(), linhaVazia()])
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const mudar = (i: number, campo: keyof LinhaDisco, valor: string) => setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, [campo]: valor } : l)))

  const { condicao, volume, pontos, calculos, problemas } = useMemo(() => {
    const pr: Problema[] = []
    const num = (s: string, campo: string, rotulo: string, ponto?: number) => {
      const [v, invalido] = ler(s)
      if (invalido) pr.push({ severidade: 'ERRO', campo, ponto, mensagem: `${rotulo}: "${s}" não é um número` })
      return v
    }
    const d1 = num(f.d1, 'dim_h_in', 'diâmetro'), d2 = num(f.d2, 'dim_d_in', 'espessura')
    const volume = num(f.volume, 'volume_acido_ml', 'volume de ácido')
    const condicao: Condicao & { volume_acido_ml?: number | null; responsavel?: string | null } = {
      temperatura_c: num(f.temperatura, 'temperatura_c', 'temperatura'), pressao_psi: num(f.pressao, 'pressao_psi', 'pressão'),
      dim_h_in: d1 != null ? Number(paraPolegada(d1, f.uL).toFixed(4)) : null, dim_d_in: d2 != null ? Number(paraPolegada(d2, f.uL).toFixed(4)) : null,
      tipo_variavel: 'rotação (RDA)', metodo_quantificacao: f.metQ || null, obtencao_dado: 'tabelado',
      observacao: f.observacao.trim() || null, volume_acido_ml: volume, responsavel: f.responsavel.trim() || null,
    }
    if (!f.serie.trim()) pr.push({ severidade: 'ERRO', campo: 'serie', mensagem: 'informe o código da série' })
    if (!f.id_sistema) pr.push({ severidade: 'ERRO', campo: 'id_sistema', mensagem: 'escolha o sistema ácido' })
    if (volume != null && volume <= 0) pr.push({ severidade: 'ERRO', campo: 'volume_acido_ml', mensagem: 'volume de ácido deve ser maior que zero' })

    const pontos: PontoLaboratorio[] = []
    const calculos: (ReturnType<typeof taxaPelaCurvaCalcio> | 'falta' | null)[] = []
    linhas.forEach((l) => {
      const curva = lerCurva(l.curva)
      if (!l.rpm.trim() && !l.taxa.trim() && !l.curva.trim()) { calculos.push(null); return }
      const n = pontos.length + 1
      let calc: (typeof calculos)[number] = null
      if (l.curva.trim()) {
        if (curva.length < 2) pr.push({ severidade: 'ERRO', campo: 'curva', ponto: n, mensagem: 'a curva precisa de pelo menos 2 linhas "tempo (min) e [Ca²⁺] (mg/L)"' })
        else if (!(volume != null && volume > 0) || !condicao.dim_h_in) { calc = 'falta'; pr.push({ severidade: 'ERRO', campo: 'curva', ponto: n, mensagem: 'para calcular a taxa pela curva, informe o volume de ácido e o diâmetro do disco' }) }
        else {
          calc = taxaPelaCurvaCalcio(curva, volume, condicao.dim_h_in)
          if (!calc) pr.push({ severidade: 'ERRO', campo: 'curva', ponto: n, mensagem: 'não deu para ajustar a curva (tempos todos iguais?)' })
          else if (calc.r2 < 0.9) pr.push({ severidade: 'AVISO', campo: 'curva', ponto: n, mensagem: `curva de cálcio pouco linear (R² = ${fmt(calc.r2, 3)}): confira os pontos` })
        }
      }
      calculos.push(calc)
      const taxaDigitada = num(l.taxa, 'taxa_reacao_mol_cm2_s', 'taxa', n)
      if (!l.amostra_id) pr.push({ severidade: 'ERRO', campo: 'amostra_id', ponto: n, mensagem: 'escolha a amostra (disco)' })
      pontos.push({
        amostra_id: l.amostra_id, data_ensaio: l.data || null, rotacao_rpm: num(l.rpm, 'rotacao_rpm', 'rotação', n),
        taxa_reacao_mol_cm2_s: calc && calc !== 'falta' ? calc.taxa_mol_cm2_s : taxaDigitada,
        ...(curva.length >= 2 ? { curva_calcio: curva } : {}),
      })
    })
    pr.push(...validarSerie({}, condicao, pontos).filter((x) => x.campo !== 'metodo_quantificacao' || x.severidade === 'ERRO'))
    return { condicao, volume, pontos, calculos, problemas: pr }
  }, [f, linhas])
  const nErros = problemas.filter((x) => x.severidade === 'ERRO').length
  const tNominal = temperaturaNominal(condicao.temperatura_c ?? null)

  async function gravar() {
    setErro(null)
    setGravando(true)
    try {
      const ids = await gravarSerieLaboratorio(supabase, { serie: f.serie.trim(), id_sistema: f.id_sistema, condicao, pontos })
      p.aoGravar(f.serie.trim(), ids.length)
    } catch (e) {
      setErro(`${explicarErro020(e)} Os pontos anteriores ao erro, se houver, já ficaram gravados: confira a lista antes de gravar de novo.`)
    } finally {
      setGravando(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-[12px] border border-[var(--color-blue-200)] bg-[var(--color-blue-50)] p-5">
      <h3 className="m-0 text-[15px] font-bold text-[var(--color-blue-800)]">Nova série RDA</h3>
      {(sistemas.erro || listas.erro || amostras.erro) && <Alert tipo="erro" mensagem={(sistemas.erro ?? listas.erro ?? amostras.erro)!} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Input label="Código da série" obrigatorio value={f.serie} onChange={(e) => setF({ ...f, serie: e.target.value })} ajuda="Texto livre; liga os pontos da mesma curva." />
        <div className="xl:col-span-2">
          <Select label="Sistema ácido" obrigatorio value={f.id_sistema} onChange={(e) => setF({ ...f, id_sistema: e.target.value })}>
            <option value="">{sistemas.carregando ? 'Carregando…' : 'Selecione…'}</option>
            {(sistemas.dados ?? []).map((s) => <option key={s.id_sistema} value={s.id_sistema}>{s.id_sistema} — {s.nome_sistema}</option>)}
          </Select>
        </div>
        <Select label="Método de quantificação" value={f.metQ} onChange={(e) => setF({ ...f, metQ: e.target.value })}>
          <option value="">—</option>
          {(listas.dados ?? []).filter((l) => l.lista === 'metodo_quantificacao').map((l) => <option key={l.valor} value={l.valor}>{l.valor}</option>)}
        </Select>
        <Input label="Temperatura" unidade="°C" obrigatorio inputMode="decimal" value={f.temperatura} onChange={(e) => setF({ ...f, temperatura: e.target.value })}
          ajuda={tNominal != null ? `nominal ${fmt(tNominal, 0)} °C` : undefined} />
        <Input label="Pressão" unidade="psi" inputMode="decimal" value={f.pressao} onChange={(e) => setF({ ...f, pressao: e.target.value })} />
        <div>
          <span className="rotulo">Disco: diâmetro e espessura</span>
          <div className="mt-1 flex gap-2">
            <input className="input" inputMode="decimal" aria-label="Diâmetro do disco" placeholder="diâmetro" value={f.d1} onChange={(e) => setF({ ...f, d1: e.target.value })} />
            <input className="input" inputMode="decimal" aria-label="Espessura do disco" placeholder="espessura" value={f.d2} onChange={(e) => setF({ ...f, d2: e.target.value })} />
            <select className="input !w-[76px] shrink-0" aria-label="Unidade das dimensões" value={f.uL} onChange={(e) => setF({ ...f, uL: e.target.value as UnComprimento })}>
              {UN_COMPRIMENTO.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <Input label="Volume de ácido" unidade="mL" inputMode="decimal" value={f.volume} onChange={(e) => setF({ ...f, volume: e.target.value })} ajuda="Necessário para a taxa pela curva de cálcio." />
        <Input label="Responsável" value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value })} />
        <div className="xl:col-span-3"><Input label="Observação da série" value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} /></div>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-[var(--color-neutral-300)] bg-white">
        <table className="table text-[13px]">
          <thead>
            <tr>
              <th className="w-[36px]">#</th><th>Amostra (disco)</th><th>Data</th><th>Rotação (rpm)</th><th>Taxa digitada (mol/cm²·s)</th>
              <th>ou curva [Ca²⁺] (mg/L) × tempo (min)</th><th className="w-[36px]" />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const calc = calculos[i]
              return (
                <tr key={i} className="align-top">
                  <td className="!py-2 text-[var(--color-neutral-600)]">{i + 1}</td>
                  <td className="!py-2">
                    <select className="input !py-1.5 min-w-[130px]" aria-label={`Amostra do ponto ${i + 1}`} value={l.amostra_id} onChange={(e) => mudar(i, 'amostra_id', e.target.value)}>
                      {!(amostras.dados ?? []).some((a) => a.id === p.amostraId) && <option value={p.amostraId}>{p.codigo}</option>}
                      {(amostras.dados ?? []).map((a) => <option key={a.id} value={a.id}>{a.codigo}</option>)}
                    </select>
                  </td>
                  <td className="!py-2"><input type="date" className="input !py-1.5" aria-label={`Data do ponto ${i + 1}`} value={l.data} onChange={(e) => mudar(i, 'data', e.target.value)} /></td>
                  <td className="!py-2"><input className="input !py-1.5 min-w-[90px]" inputMode="decimal" aria-label={`Rotação do ponto ${i + 1}`} value={l.rpm} onChange={(e) => mudar(i, 'rpm', e.target.value)} /></td>
                  <td className="!py-2"><input className="input !py-1.5 min-w-[120px]" inputMode="decimal" aria-label={`Taxa do ponto ${i + 1}`} placeholder={l.curva.trim() ? 'calculada pela curva' : 'ex.: 2,5E-6'}
                    disabled={!!l.curva.trim()} value={l.taxa} onChange={(e) => mudar(i, 'taxa', e.target.value)} /></td>
                  <td className="!py-2">
                    <textarea className="input !py-1.5 min-w-[220px] font-mono text-[12px]" rows={l.curva.trim() ? 4 : 1} aria-label={`Curva de cálcio do ponto ${i + 1}`}
                      placeholder="cole do Excel: tempo ⇥ [Ca²⁺]" value={l.curva} onChange={(e) => mudar(i, 'curva', e.target.value)} />
                    {calc && calc !== 'falta' && (
                      <p className="m-0 mt-1 text-[12px] text-[var(--color-neutral-700)]">
                        {calc.n} pontos · inclinação {fmt(calc.inclinacao_mg_l_min, 4)} mg/(L·min) · R² {fmt(calc.r2, 3)} · área {fmt(calc.area_cm2, 3)} cm² ·{' '}
                        taxa <strong className="text-[var(--color-blue-800)]">{fmt(calc.taxa_mol_cm2_s, 3, true)}</strong> mol/(cm²·s)
                      </p>
                    )}
                  </td>
                  <td className="!py-2"><button type="button" className="btn-icone perigo" title="Remover a linha" onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((_, k) => k !== i) : [linhaVazia()]))}><Trash2 size={14} /></button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setLinhas((ls) => [...ls, linhaVazia()])}><Plus size={14} /> Linha</button></div>
      <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">
        Taxa pela curva = inclinação de [Ca²⁺] × tempo × volume de ácido ÷ área da face do disco{volume != null && condicao.dim_h_in ? '' : ' (informe o volume e o diâmetro)'}. A curva colada é gravada junto do ensaio.
      </p>

      <ListaProblemas problemas={problemas}
        vazio={pontos.length > 0 ? <p className="m-0 flex items-center gap-2 text-[13px] text-[var(--color-neutral-700)]"><CheckCircle2 size={15} className="text-[var(--color-blue)]" /> Nenhum problema encontrado.</p> : undefined} />
      {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={gravar} disabled={gravando || nErros > 0}>
          {gravando ? <><Loader2 size={14} className="animate-spin" /> Gravando…</> : `Gravar série (${pontos.length} ponto${pontos.length === 1 ? '' : 's'})`}
        </button>
        <button type="button" className="btn btn-secondary" onClick={p.aoCancelar} disabled={gravando}>Cancelar</button>
        {nErros > 0 && <span className="text-[12px] text-[var(--color-red-700)]">{nErros} erro(s) a corrigir antes de gravar.</span>}
      </div>
    </div>
  )
}
