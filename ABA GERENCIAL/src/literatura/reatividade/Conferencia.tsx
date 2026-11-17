// LITERATURA › REATIVIDADE › Conferência: o que falta conferir em cada publicação (o banco acha as pendências
// sozinho, na view v_lit_pendencias), as anotações de qualidade da equipe e os sistemas ácidos repetidos.
import { useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Pencil, Plus } from 'lucide-react'
import { Alert, Input, Modal, Select, Textarea } from '../../components/UI'
import { useConsulta } from '../../hooks/useConsulta'
import { codigoLiteratura, numero } from '../../importador/planilhaBdd'
import { fmt, fmtData, mensagemErro } from '../../utils/formatacao'
import { Aviso, Carregando, Cartao } from '../ui'
import {
  atualizarMedida, criarAnotacao, listarAnotacoes, listarConferencia, listarListas, listarSistemasDuplicados, marcarConferido,
  medidasDaPublicacao, pendenciasDaPublicacao, resolverAnotacao,
  type Anotacao, type Gravidade, type MedidaLit, type MudancaMedida, type Pendencia, type ResumoConferencia,
} from './servico'

type Aba = 'publicacoes' | 'anotacoes' | 'sistemas'
const ABAS: [Aba, string][] = [['publicacoes', 'Publicações'], ['anotacoes', 'Anotações'], ['sistemas', 'Sistemas repetidos']]

const ROTULO_CAMPO: Record<string, string> = {
  taxa_reacao_mol_cm2_s: 'Taxa de reação', temperatura_c: 'Temperatura', dim_h_in: 'Dimensão do disco', rotacao_rpm: 'Rotação / cisalhamento',
  pressao_psi: 'Pressão', metodo_quantificacao: 'Método de quantificação', obtencao_dado: 'Procedência do valor', id_rocha: 'Rocha',
  conc_m: 'Concentração do ácido',
}
const ORDEM_GRAVIDADE: Record<Gravidade, number> = { erro: 0, conferir: 1, incompleto: 2 }
const CLASSE_GRAVIDADE: Record<Gravidade, string> = { erro: 'tag tag-accent', conferir: 'tag tag-orange', incompleto: 'tag tag-neutral' }

export function Conferencia() {
  const [aba, setAba] = useState<Aba>('publicacoes')
  const [aberta, setAberta] = useState<ResumoConferencia | null>(null)
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {ABAS.map(([k, r]) => (
          <button key={k} type="button" onClick={() => { setAba(k); setAberta(null) }} className={`btn btn-sm ${aba === k ? 'btn-blue' : 'btn-secondary'}`}>{r}</button>
        ))}
      </div>
      {aba === 'publicacoes' && (aberta
        ? <PendenciasDaPublicacao pub={aberta} aoVoltar={() => setAberta(null)} />
        : <TabelaConferencia aoAbrir={setAberta} />)}
      {aba === 'anotacoes' && <Anotacoes />}
      {aba === 'sistemas' && <SistemasRepetidos />}
    </div>
  )
}

// ---------------------------------------------------------------------------
function Progresso({ feitas, total }: { feitas: number; total: number }) {
  const pct = total ? Math.round((100 * feitas) / total) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-[8px] w-[120px] rounded-full bg-[var(--color-neutral-200)]" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={feitas}
        aria-label={`${feitas} de ${total} medidas conferidas`}>
        <div className="h-full rounded-full bg-[var(--color-blue)]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[12px] tabular-nums text-[var(--color-neutral-700)]">{feitas}/{total}</span>
    </div>
  )
}

function TabelaConferencia({ aoAbrir }: { aoAbrir: (p: ResumoConferencia) => void }) {
  const resumo = useConsulta(listarConferencia, [])
  const linhas = resumo.dados ?? []
  return (
    <Cartao titulo="Conferência por publicação" subtitulo="Medidas conferidas na fonte e pendências que o banco achou. Clique numa publicação para conferir.">
      {resumo.carregando && !resumo.dados ? <Carregando /> : resumo.erro ? <div className="p-6"><Aviso tipo="erro">{resumo.erro}</Aviso></div>
        : !linhas.length ? <p className="m-0 px-6 py-8 text-center text-[13px] text-[var(--color-neutral-600)]">Nenhuma publicação da literatura geral cadastrada.</p> : (
          <div className="overflow-auto px-6 pb-4">
            <table className="table text-[13px]">
              <thead>
                <tr>
                  <th>Publicação</th><th className="text-right">Medidas</th><th>Conferidas</th><th className="text-right">Pelo painel</th>
                  <th className="text-right">A conferir</th><th className="text-right">Incompletas</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id_referencia} className="lcp-row cursor-pointer" onClick={() => aoAbrir(l)}>
                    <td className="!py-2.5">
                      <button type="button" className="cursor-pointer text-left" onClick={(e) => { e.stopPropagation(); aoAbrir(l) }}>
                        <span className="font-bold text-[var(--color-red)]">{l.id_referencia}</span>{' '}
                        <span className="font-semibold text-[var(--color-blue-800)]">{l.autor}{l.ano ? ` (${l.ano})` : ''}</span>
                      </button>
                    </td>
                    <td className="!py-2.5 text-right tabular-nums">{l.n_medidas}</td>
                    <td className="!py-2.5"><Progresso feitas={l.n_conferidas} total={l.n_medidas} /></td>
                    <td className="!py-2.5 text-right tabular-nums">{l.n_pelo_painel}</td>
                    <td className="!py-2.5 text-right tabular-nums">{l.n_a_conferir > 0 ? <span className="tag tag-orange">{l.n_a_conferir}</span> : '0'}</td>
                    <td className="!py-2.5 text-right tabular-nums text-[var(--color-neutral-600)]">{l.n_incompletas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Cartao>
  )
}

// ---------------------------------------------------------------------------
function PendenciasDaPublicacao({ pub, aoVoltar }: { pub: ResumoConferencia; aoVoltar: () => void }) {
  const pend = useConsulta(() => pendenciasDaPublicacao(pub.id_referencia), [pub.id_referencia])
  const medidas = useConsulta(() => medidasDaPublicacao(pub.id_referencia), [pub.id_referencia])
  const [erro, setErro] = useState<string | null>(null)
  const [marcando, setMarcando] = useState<string | null>(null)
  const [editando, setEditando] = useState<MedidaLit | null>(null)
  // marcações feitas nesta tela, antes de o banco responder de novo
  const [local, setLocal] = useState<Record<string, boolean>>({})

  const porId = useMemo(() => new Map((medidas.dados ?? []).map((m) => [m.id_ensaio, m])), [medidas.dados])
  const conferido = (id: string) => local[id] ?? porId.get(id)?.conferido ?? false
  const grupos = useMemo(() => {
    const g = new Map<string, Pendencia[]>()
    for (const p of pend.dados ?? []) g.set(p.campo, [...(g.get(p.campo) ?? []), p])
    const pior = (ps: Pendencia[]) => Math.min(...ps.map((p) => ORDEM_GRAVIDADE[p.gravidade]))
    return [...g.entries()].sort((a, b) => pior(a[1]) - pior(b[1]) || a[0].localeCompare(b[0]))
      .map(([campo, ps]) => [campo, ps.sort((a, b) => ORDEM_GRAVIDADE[a.gravidade] - ORDEM_GRAVIDADE[b.gravidade] || a.id_ensaio.localeCompare(b.id_ensaio))] as const)
  }, [pend.dados])
  const comPendencia = useMemo(() => new Set((pend.dados ?? []).map((p) => p.id_ensaio)), [pend.dados])
  const semPendencia = (medidas.dados ?? []).filter((m) => !comPendencia.has(m.id_ensaio))
  const nConferidas = (medidas.dados ?? []).filter((m) => conferido(m.id_ensaio)).length

  async function marcar(id: string, valor: boolean) {
    setErro(null)
    setMarcando(id)
    setLocal((l) => ({ ...l, [id]: valor }))
    try {
      await marcarConferido(id, valor)
    } catch (e) {
      setLocal((l) => ({ ...l, [id]: !valor }))
      setErro(mensagemErro(e))
    } finally {
      setMarcando(null)
    }
  }

  const acoes = (id: string) => {
    const m = porId.get(id)
    return (
      <div className="flex items-center justify-end gap-3 whitespace-nowrap">
        <label className="flex cursor-pointer items-center gap-1.5 text-[12px]">
          <input type="checkbox" checked={conferido(id)} disabled={!m || marcando === id} onChange={(e) => marcar(id, e.target.checked)} />
          Conferido na fonte
        </label>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!m} onClick={() => m && setEditando(m)}><Pencil size={13} /> Editar</button>
      </div>
    )
  }
  const resumoMedida = (id: string) => {
    const m = porId.get(id)
    if (!m) return null
    return (
      <span className="block text-[11px] text-[var(--color-neutral-600)]">
        {m.id_rocha} · {m.id_sistema} · {fmt(m.temperatura_c, 1)} °C · {m.rotacao_rpm != null ? `${fmt(m.rotacao_rpm, 0)} rpm` : m.shear_rate_s1 != null ? `${fmt(m.shear_rate_s1, 1)} 1/s` : 'sem rotação'}
        {' '}· taxa {fmt(m.taxa_reacao_mol_cm2_s, 3, true)}{m.fonte_local ? ` · ${m.fonte_local}` : ''}
      </span>
    )
  }

  return (
    <>
      <Cartao titulo={`${pub.id_referencia} · ${pub.autor}${pub.ano ? ` (${pub.ano})` : ''}`}
        subtitulo="Pendências agrupadas por campo: erro (vermelho), conferir (laranja), incompleto (cinza)"
        acoes={<>
          <Progresso feitas={nConferidas} total={medidas.dados?.length ?? pub.n_medidas} />
          <button type="button" className="btn btn-secondary" onClick={aoVoltar}><ArrowLeft size={14} /> Todas as publicações</button>
        </>}>
        {erro && <div className="px-6 pt-5"><Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} /></div>}
        {(pend.carregando && !pend.dados) || (medidas.carregando && !medidas.dados) ? <Carregando />
          : pend.erro || medidas.erro ? <div className="p-6"><Aviso tipo="erro">{pend.erro ?? medidas.erro}</Aviso></div> : (
            <div className="flex flex-col gap-6 p-6">
              {!grupos.length && <p className="m-0 flex items-center gap-2 text-[13px] text-[var(--color-neutral-700)]"><CheckCircle2 size={15} className="text-[var(--color-blue)]" /> Nenhuma pendência nesta publicação.</p>}
              {grupos.map(([campo, ps]) => (
                <section key={campo}>
                  <h3 className="m-0 mb-2 text-[14px] font-bold text-[var(--color-blue-800)]">
                    {ROTULO_CAMPO[campo] ?? campo} <span className="font-normal text-[var(--color-neutral-500)]">({ps.length})</span>
                  </h3>
                  <div className="overflow-auto rounded-[10px] border border-[var(--color-neutral-300)]">
                    <table className="table text-[13px]">
                      <tbody>
                        {ps.map((p, i) => (
                          <tr key={`${p.id_ensaio}|${i}`} className="lcp-row">
                            <td className="!py-2 w-[110px] whitespace-nowrap font-bold text-[var(--color-blue-800)]">{p.id_ensaio}</td>
                            <td className="!py-2 w-[100px]"><span className={CLASSE_GRAVIDADE[p.gravidade]}>{p.gravidade}</span></td>
                            <td className="!py-2">{p.mensagem}{resumoMedida(p.id_ensaio)}</td>
                            <td className="!py-2">{acoes(p.id_ensaio)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
              {semPendencia.length > 0 && (
                <section>
                  <h3 className="m-0 mb-2 text-[14px] font-bold text-[var(--color-blue-800)]">
                    Sem pendências <span className="font-normal text-[var(--color-neutral-500)]">({semPendencia.length})</span>
                  </h3>
                  <div className="max-h-[360px] overflow-auto rounded-[10px] border border-[var(--color-neutral-300)]">
                    <table className="table text-[13px]">
                      <tbody>
                        {semPendencia.map((m) => (
                          <tr key={m.id_ensaio} className="lcp-row">
                            <td className="!py-2 w-[110px] whitespace-nowrap font-bold text-[var(--color-blue-800)]">{m.id_ensaio}</td>
                            <td className="!py-2">{resumoMedida(m.id_ensaio)}</td>
                            <td className="!py-2">{acoes(m.id_ensaio)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          )}
      </Cartao>
      {editando && (
        <EditarMedida medida={editando} aoFechar={() => setEditando(null)}
          aoSalvar={() => { setEditando(null); pend.recarregar(); medidas.recarregar() }} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
const TIPOS = ['rotação (RDA)', 'taxa de cisalhamento', 'não informada']
const OBTENCAO = ['tabelado', 'lido de gráfico', 'medida na superfície', 'não catalogado']
const NUMERICOS = [
  ['temperatura_c', 'Temperatura', '°C'], ['pressao_psi', 'Pressão', 'psi'], ['dim_h_in', 'Diâmetro do disco', 'in'], ['dim_d_in', 'Espessura do disco', 'in'],
  ['rotacao_rpm', 'Rotação', 'rpm'], ['shear_rate_s1', 'Taxa de cisalhamento', '1/s'], ['taxa_reacao_mol_cm2_s', 'Taxa de reação', 'mol/(cm²·s)'],
  ['coef_difusao_cm2_s', 'Coef. de difusão', 'cm²/s'],
] as const

function EditarMedida({ medida, aoFechar, aoSalvar }: { medida: MedidaLit; aoFechar: () => void; aoSalvar: () => void }) {
  const listas = useConsulta(() => listarListas(true), [])
  const [f, setF] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(NUMERICOS.map(([k]) => [k, medida[k] == null ? '' : String(medida[k]).replace('.', ',')])),
    tipo_variavel: medida.tipo_variavel ?? 'não informada', metodo_quantificacao: medida.metodo_quantificacao ?? '',
    metodo_coef_difusao: medida.metodo_coef_difusao ?? '', obtencao_dado: medida.obtencao_dado ?? '',
    fonte_local: medida.fonte_local ?? '', observacao: medida.observacao ?? '',
  }))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  // opções da lista + o valor atual, mesmo que tenha sido desativado
  const opcoes = (lista: string, atual: string) => [...new Set([...(listas.dados ?? []).filter((l) => l.lista === lista).map((l) => l.valor), ...(atual ? [atual] : [])])]

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    const mudanca: Record<string, unknown> = {}
    for (const [k, rotulo] of NUMERICOS) {
      const n = numero(f[k])
      if (Number.isNaN(n)) { setErro(`${rotulo}: "${f[k]}" não é um número.`); return }
      mudanca[k] = n
    }
    for (const k of ['metodo_quantificacao', 'metodo_coef_difusao', 'obtencao_dado', 'fonte_local', 'observacao']) mudanca[k] = f[k].trim() || null
    mudanca.tipo_variavel = f.tipo_variavel
    setSalvando(true)
    try {
      await atualizarMedida(medida.id_ensaio, mudanca as MudancaMedida)
      aoSalvar()
    } catch (err) {
      setErro(mensagemErro(err))
    } finally {
      setSalvando(false)
    }
  }
  const campo = (k: string) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value }) })

  return (
    <Modal isOpen onClose={aoFechar} titulo={`Editar ${medida.id_ensaio}`} maxWidth="max-w-3xl"
      subtitulo={`${medida.id_referencia} · ${medida.id_rocha} · ${medida.id_sistema} · valores nas unidades do banco`}>
      <form onSubmit={salvar} className="flex flex-col gap-4">
        {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
        <div className="grid max-h-[60vh] grid-cols-1 gap-4 overflow-auto pr-1 sm:grid-cols-2 md:grid-cols-4">
          {NUMERICOS.map(([k, rotulo, un]) => <Input key={k} label={rotulo} unidade={un} inputMode="decimal" {...campo(k)} />)}
          <Select label="Tipo da variável" {...campo('tipo_variavel')}>{TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          <Select label="Procedência do valor" {...campo('obtencao_dado')}>
            <option value="">—</option>{OBTENCAO.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select label="Método de quantificação" {...campo('metodo_quantificacao')}>
            <option value="">—</option>{opcoes('metodo_quantificacao', f.metodo_quantificacao).map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select label="Método do coef. de difusão" {...campo('metodo_coef_difusao')}>
            <option value="">—</option>{opcoes('metodo_coef_difusao', f.metodo_coef_difusao).map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <div className="sm:col-span-2"><Input label="Onde está na fonte" placeholder="Ex.: Tabela 3, Fig. 7b" {...campo('fonte_local')} /></div>
          <div className="sm:col-span-2"><Input label="Observação" {...campo('observacao')} /></div>
        </div>
        <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">Temperatura nominal, ω, √ω e a taxa em m² são recalculadas pelo banco.</p>
        <div className="flex justify-end gap-3 border-t border-[var(--color-neutral-300)] pt-4">
          <button type="button" className="btn btn-secondary" onClick={aoFechar}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar medida'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
const anotacaoVazia = () => ({ id_ensaio: '', campo: '', valor_registrado: '', valor_calculado: '', observacao: '' })

function Anotacoes() {
  const notas = useConsulta(listarAnotacoes, [])
  const [nova, setNova] = useState<ReturnType<typeof anotacaoVazia> | null>(null)
  const [resolvendo, setResolvendo] = useState<Anotacao | null>(null)
  const [resolucao, setResolucao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const linhas = notas.dados ?? []
  const abertas = linhas.filter((n) => !n.resolvido).length

  async function executar(fn: () => Promise<void>, depois: () => void) {
    setErro(null)
    setSalvando(true)
    try { await fn(); depois(); notas.recarregar() } catch (e) { setErro(mensagemErro(e)) } finally { setSalvando(false) }
  }
  const t = (s: string) => s.trim() || null

  return (
    <Cartao titulo={`Anotações de qualidade (${abertas} em aberto)`} subtitulo="O que a equipe anotou ao conferir: valor registrado × calculado. As não resolvidas aparecem primeiro."
      acoes={<button type="button" className="btn btn-primary" onClick={() => { setErro(null); setNova(anotacaoVazia()) }}><Plus size={14} /> Nova anotação</button>}>
      {notas.carregando && !notas.dados ? <Carregando /> : notas.erro ? <div className="p-6"><Aviso tipo="erro">{notas.erro}</Aviso></div>
        : !linhas.length ? <p className="m-0 px-6 py-8 text-center text-[13px] text-[var(--color-neutral-600)]">Nenhuma anotação ainda.</p> : (
          <div className="overflow-auto px-6 pb-4">
            <table className="table text-[13px]">
              <thead><tr><th>Ensaio</th><th>Campo</th><th>Registrado</th><th>Calculado</th><th>Observação</th><th>Origem</th><th>Situação</th><th /></tr></thead>
              <tbody>
                {linhas.map((n) => (
                  <tr key={n.id} className={`lcp-row ${n.resolvido ? 'text-[var(--color-neutral-600)]' : ''}`}>
                    <td className="!py-2.5 whitespace-nowrap font-bold text-[var(--color-blue-800)]">{n.id_ensaio ?? 'banco todo'}</td>
                    <td className="!py-2.5">{n.campo}</td>
                    <td className="!py-2.5">{n.valor_registrado ?? '—'}</td>
                    <td className="!py-2.5">{n.valor_calculado ?? '—'}</td>
                    <td className="!py-2.5">{n.observacao ?? '—'}</td>
                    <td className="!py-2.5"><span className="tag tag-neutral">{n.origem}</span></td>
                    <td className="!py-2.5">
                      {n.resolvido
                        ? <><span className="tag tag-blue">resolvido</span><span className="mt-1 block text-[11px]">{n.resolucao}{n.resolvido_em ? ` · ${fmtData(n.resolvido_em)}` : ''}</span></>
                        : <span className="tag tag-orange">em aberto</span>}
                    </td>
                    <td className="!py-2.5 text-right">
                      {!n.resolvido && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setErro(null); setResolucao(''); setResolvendo(n) }}>Resolver</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {nova && (
        <Modal isOpen onClose={() => setNova(null)} titulo="Nova anotação de qualidade" subtitulo="Algo a conferir numa medida (ou no banco todo, sem ensaio)">
          <form className="flex flex-col gap-4" onSubmit={(e) => {
            e.preventDefault()
            void executar(() => criarAnotacao({
              id_ensaio: codigoLiteratura(t(nova.id_ensaio)?.toUpperCase() ?? null), campo: nova.campo.trim(), valor_registrado: t(nova.valor_registrado),
              valor_calculado: t(nova.valor_calculado), observacao: t(nova.observacao),
            }), () => setNova(null))
          }}>
            {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Ensaio (opcional)" placeholder="Ex.: RDA-0012" value={nova.id_ensaio} onChange={(e) => setNova({ ...nova, id_ensaio: e.target.value })} ajuda="Em branco: vale para o banco todo." />
              <Input label="Campo" obrigatorio required placeholder="Ex.: taxa de reação, temperatura" value={nova.campo} onChange={(e) => setNova({ ...nova, campo: e.target.value })} />
              <Input label="Valor registrado" value={nova.valor_registrado} onChange={(e) => setNova({ ...nova, valor_registrado: e.target.value })} />
              <Input label="Valor calculado" value={nova.valor_calculado} onChange={(e) => setNova({ ...nova, valor_calculado: e.target.value })} />
            </div>
            <Textarea label="Observação" value={nova.observacao} onChange={(e) => setNova({ ...nova, observacao: e.target.value })} />
            <div className="flex justify-end gap-3 border-t border-[var(--color-neutral-300)] pt-4">
              <button type="button" className="btn btn-secondary" onClick={() => setNova(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar anotação'}</button>
            </div>
          </form>
        </Modal>
      )}

      {resolvendo && (
        <Modal isOpen onClose={() => setResolvendo(null)} titulo="Resolver anotação"
          subtitulo={`${resolvendo.id_ensaio ?? 'banco todo'} · ${resolvendo.campo}`} maxWidth="max-w-xl">
          <form className="flex flex-col gap-4" onSubmit={(e) => {
            e.preventDefault()
            void executar(() => resolverAnotacao(resolvendo.id, resolucao.trim()), () => setResolvendo(null))
          }}>
            {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
            <Textarea label="O que foi feito" obrigatorio required placeholder="Ex.: corrigido para 2,5E-6 conforme Tabela 2"
              value={resolucao} onChange={(e) => setResolucao(e.target.value)} />
            <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">O banco registra quem resolveu e quando.</p>
            <div className="flex justify-end gap-3 border-t border-[var(--color-neutral-300)] pt-4">
              <button type="button" className="btn btn-secondary" onClick={() => setResolvendo(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={salvando || !resolucao.trim()}>{salvando ? 'Salvando…' : 'Marcar como resolvida'}</button>
            </div>
          </form>
        </Modal>
      )}
    </Cartao>
  )
}

// ---------------------------------------------------------------------------
function SistemasRepetidos() {
  const dup = useConsulta(listarSistemasDuplicados, [])
  const linhas = dup.dados ?? []
  return (
    <Cartao titulo={`Sistemas ácidos repetidos (${linhas.length} grupo${linhas.length === 1 ? '' : 's'})`}
      subtitulo="Mesma composição cadastrada com códigos diferentes. Só consulta: unificar é decisão da equipe.">
      {dup.carregando && !dup.dados ? <Carregando /> : dup.erro ? <div className="p-6"><Aviso tipo="erro">{dup.erro}</Aviso></div>
        : !linhas.length ? <p className="m-0 px-6 py-8 text-center text-[13px] text-[var(--color-neutral-600)]">Nenhum sistema repetido.</p> : (
          <div className="overflow-auto px-6 pb-4">
            <table className="table text-[13px]">
              <thead><tr><th>Composição (assinatura)</th><th>Códigos</th><th className="text-right">Quantidade</th></tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.assinatura} className="lcp-row">
                    <td className="!py-2.5 font-mono text-[12px]">{l.assinatura.split(';').join(' + ')}</td>
                    <td className="!py-2.5"><div className="flex flex-wrap gap-1.5">{l.ids.map((id) => <span key={id} className="tag tag-orange">{id}</span>)}</div></td>
                    <td className="!py-2.5 text-right tabular-nums">{l.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Cartao>
  )
}
