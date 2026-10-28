// Cadastro dos dados de PVbt da literatura no padrão da planilha (amostras, ensaios, referências):
// criar, editar e excluir (um a um ou vários marcados). Só para editores.
import { useMemo, useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Alert, Button, Input, Modal, Select } from '../components/UI'
import { CadastroPublicacoes } from '../pages/CadastroPublicacoes'
import { useConsulta } from '../hooks/useConsulta'
import { listarEmpresas, listarLitologias } from '../servicos/api'
import { fmt } from '../utils/formatacao'
import {
  CAMPOS_AMOSTRA, CAMPOS_ENSAIO, doTexto, paraTexto, type CampoPvbt,
} from './camposPvbt'
import {
  excluirAmostrasLit, excluirEnsaiosLit, listarAmostrasLit, listarEnsaiosLit, listarPublicacoes, listarSistemasAcidos,
  obterEnsaioLit, salvarAmostraLit, salvarEnsaioLit, type LinhaPvbt,
} from './servico'

interface Opcoes {
  litologias: string[]
  referencias: { id: string; rotulo: string }[]
  amostras: { id: string; fonte: string }[]
  sistemas: { id: string; rotulo: string }[]
  empresas: { id: string; rotulo: string }[]
}

type Sub = 'ensaios' | 'amostras' | 'referencias'
const POR_PAGINA = 200

export function CadastroPvbt() {
  const [sub, setSub] = useState<Sub>('ensaios')
  const litologias = useConsulta(listarLitologias, [])
  const refs = useConsulta(() => listarPublicacoes({ categoria: 'geral' }), [])
  const amostras = useConsulta(listarAmostrasLit, [])
  const ensaios = useConsulta(listarEnsaiosLit, [])
  const sistemas = useConsulta(listarSistemasAcidos, [])
  const empresas = useConsulta(listarEmpresas, [])

  const opcoes: Opcoes = useMemo(() => ({
    litologias: (litologias.dados ?? []).map((l) => l.nome),
    referencias: (refs.dados ?? []).map((r) => ({ id: r.id_referencia, rotulo: `${r.id_referencia} · ${r.autor}${r.ano ? ` (${r.ano})` : ''}` })),
    amostras: (amostras.dados ?? []).map((a) => ({ id: String(a.id_amostra), fonte: String(a.fonte) })),
    sistemas: (sistemas.dados ?? []).map((s) => ({ id: s.id_sistema, rotulo: `${s.id_sistema} · ${s.nome_sistema}` })),
    empresas: (empresas.dados ?? []).map((e) => ({ id: e.id, rotulo: e.nome })),
  }), [litologias.dados, refs.dados, amostras.dados, sistemas.dados, empresas.dados])

  const abas: [Sub, string, number | undefined][] = [
    ['ensaios', 'Ensaios', ensaios.dados?.length],
    ['amostras', 'Amostras', amostras.dados?.length],
    ['referencias', 'Referências', refs.dados?.length],
  ]

  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 text-[13px] text-[var(--color-neutral-700)]">
        Cadastro dos dados de PVbt da literatura e da Petrobras, com as mesmas colunas da planilha do banco de PVbt.
        As colunas calculadas da planilha (volume poroso, velocidades, PVbt por Darcy/microCT…) o banco calcula sozinho.
      </p>
      <div className="flex gap-1 border-b border-[var(--color-neutral-300)]">
        {abas.map(([k, r, n]) => (
          <button key={k} onClick={() => setSub(k)} className={`aba ${sub === k ? 'ativa' : ''}`}>{r}{n != null ? ` (${n})` : ''}</button>
        ))}
      </div>

      {sub === 'ensaios' && <TabelaEnsaios consulta={ensaios} opcoes={opcoes} aoMudar={() => { ensaios.recarregar(); amostras.recarregar() }} />}
      {sub === 'amostras' && <TabelaAmostras consulta={amostras} ensaios={ensaios.dados ?? []} opcoes={opcoes} aoMudar={() => { amostras.recarregar(); ensaios.recarregar() }} />}
      {sub === 'referencias' && <CadastroPublicacoes categoria="geral" />}
    </div>
  )
}

// ---------------------------------------------------------------------------
type Consulta = { dados: LinhaPvbt[] | null; carregando: boolean; erro: string | null }

interface ColunaTab { k: string; rotulo: string; calc?: boolean; casas?: number }

function useSelecao() {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  return { sel, alternar, limpar: () => setSel(new Set()), marcar: (ids: string[]) => setSel(new Set(ids)) }
}

function TabelaGenerica(p: {
  titulo: string
  chave: string
  colunas: ColunaTab[]
  linhas: LinhaPvbt[]
  consulta: Consulta
  extra?: (l: LinhaPvbt) => string
  aoNovo: () => void
  aoEditar: (l: LinhaPvbt) => void
  aoExcluir: (ids: string[]) => Promise<void>
}) {
  const { sel, alternar, limpar, marcar } = useSelecao()
  const [busca, setBusca] = useState('')
  const [fonte, setFonte] = useState('')
  const [mostrar, setMostrar] = useState(POR_PAGINA)
  const [aviso, setAviso] = useState<{ tipo: 'erro' | 'sucesso'; msg: string } | null>(null)

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return p.linhas.filter((l) => (!fonte || l.fonte === fonte)
      && (!t || Object.values(l).some((v) => v != null && String(v).toLowerCase().includes(t))))
  }, [p.linhas, busca, fonte])
  const visiveis = filtradas.slice(0, mostrar)
  const idDe = (l: LinhaPvbt) => String(l[p.chave])

  async function excluir(ids: string[]) {
    const nome = ids.length === 1 ? ids[0] : `${ids.length} registros`
    if (!confirm(`Excluir ${nome}? Isso não pode ser desfeito.`)) return
    try {
      await p.aoExcluir(ids)
      limpar()
      setAviso({ tipo: 'sucesso', msg: ids.length === 1 ? `${ids[0]} excluído.` : `${ids.length} registros excluídos.` })
    } catch (e) {
      setAviso({ tipo: 'erro', msg: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <div className="cartao">
      <div className="cartao-topo">
        <div><h2>{p.titulo} ({filtradas.length}{filtradas.length !== p.linhas.length ? ` de ${p.linhas.length}` : ''})</h2></div>
        <div className="flex items-center gap-2">
          {sel.size > 0 && <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => excluir([...sel])}>Excluir {sel.size} marcado(s)</Button>}
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={p.aoNovo}>Novo</Button>
        </div>
      </div>
      <div className="p-4 flex flex-col gap-3">
        {aviso && <Alert tipo={aviso.tipo} mensagem={aviso.msg} onClose={() => setAviso(null)} />}
        {p.consulta.erro && <Alert tipo="erro" mensagem={p.consulta.erro} />}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-neutral-400)]" />
            <input className="input !pl-9" placeholder="Filtrar por qualquer coluna…" value={busca} onChange={(e) => { setBusca(e.target.value); setMostrar(POR_PAGINA) }} />
          </div>
          <select className="input !w-auto" value={fonte} onChange={(e) => setFonte(e.target.value)} aria-label="Fonte">
            <option value="">Todas as fontes</option>
            <option>Literatura</option>
            <option>Petrobras</option>
          </select>
          <Button variant="secondary" size="sm" onClick={() => marcar(filtradas.map(idDe))} disabled={!filtradas.length}>Marcar os {filtradas.length} listados</Button>
          {sel.size > 0 && <Button variant="secondary" size="sm" onClick={limpar}>Desmarcar</Button>}
        </div>

        {p.consulta.carregando && !p.consulta.dados ? (
          <p className="m-0 py-8 text-center text-[13px] text-[var(--color-neutral-600)]">Carregando…</p>
        ) : !filtradas.length ? (
          <p className="m-0 py-8 text-center text-[13px] text-[var(--color-neutral-600)]">{p.linhas.length ? 'Nenhum registro com esse filtro.' : 'Nenhum registro ainda. Use "Novo" para cadastrar.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table text-[12.5px]">
              <thead>
                <tr>
                  <th className="w-[34px]" />
                  {p.colunas.map((c) => <th key={c.k} title={c.calc ? 'Calculado pelo banco' : undefined}>{c.rotulo}{c.calc && <span className="text-[var(--color-orange-700)]"> ƒ</span>}</th>)}
                  {p.extra && <th>Ligados</th>}
                  <th className="w-[70px]" />
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={idDe(l)} className="lcp-row">
                    <td><input type="checkbox" checked={sel.has(idDe(l))} onChange={() => alternar(idDe(l))} aria-label={`Marcar ${idDe(l)}`} /></td>
                    {p.colunas.map((c) => (
                      <td key={c.k} className={`!py-2 tabular-nums ${c.k === p.chave ? 'font-bold whitespace-nowrap text-[var(--color-blue-800)]' : ''}`}>
                        {typeof l[c.k] === 'number' ? fmt(l[c.k], c.casas ?? 3) : (l[c.k] as string | null) ?? '—'}
                      </td>
                    ))}
                    {p.extra && <td className="!py-2 text-[var(--color-neutral-600)]">{p.extra(l)}</td>}
                    <td className="!py-2 whitespace-nowrap">
                      <button type="button" className="btn-icone" title="Editar" onClick={() => p.aoEditar(l)}><Pencil size={14} /></button>
                      <button type="button" className="btn-icone" title="Excluir" onClick={() => excluir([idDe(l)])}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtradas.length > visiveis.length && (
              <div className="pt-3 text-center">
                <Button variant="secondary" size="sm" onClick={() => setMostrar(mostrar + POR_PAGINA)}>Mostrar mais ({filtradas.length - visiveis.length} restantes)</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function TabelaAmostras(p: { consulta: Consulta; ensaios: LinhaPvbt[]; opcoes: Opcoes; aoMudar: () => void }) {
  const [modal, setModal] = useState<{ linha: LinhaPvbt | null } | null>(null)
  const contagem = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of p.ensaios) c[String(e.id_amostra)] = (c[String(e.id_amostra)] ?? 0) + 1
    return c
  }, [p.ensaios])
  return (
    <>
      <TabelaGenerica titulo="Amostras da literatura" chave="id_amostra" consulta={p.consulta} linhas={p.consulta.dados ?? []}
        colunas={[
          { k: 'id_amostra', rotulo: 'id_amostra' }, { k: 'fonte', rotulo: 'fonte' }, { k: 'litologia', rotulo: 'litologia' },
          { k: 'diametro_cm', rotulo: 'diametro_cm' }, { k: 'comprimento_cm', rotulo: 'comprimento_cm' }, { k: 'porosidade_pct', rotulo: 'porosidade_pct', casas: 2 },
          { k: 'volume_poroso_medido_cm3', rotulo: 'vol. poroso medido' }, { k: 'k_inicial_md', rotulo: 'k_inicial_md', casas: 2 },
          { k: 'k_metodo', rotulo: 'k_metodo' }, { k: 'ca_pct', rotulo: 'ca_pct', casas: 2 }, { k: 'mg_pct', rotulo: 'mg_pct', casas: 2 },
        ]}
        extra={(l) => `${contagem[String(l.id_amostra)] ?? 0} ensaio(s)`}
        aoNovo={() => setModal({ linha: null })} aoEditar={(l) => setModal({ linha: l })}
        aoExcluir={async (ids) => { try { await excluirAmostrasLit(ids) } finally { p.aoMudar() } }} />
      {modal && (
        <ModalRegistro titulo={modal.linha ? `Editar amostra ${modal.linha.id_amostra}` : 'Nova amostra da literatura'}
          campos={CAMPOS_AMOSTRA} chave="id_amostra" inicial={modal.linha ?? { fonte: 'Literatura' }} nova={!modal.linha} opcoes={p.opcoes}
          aoSalvar={async (linha, nova) => { await salvarAmostraLit(linha, nova); p.aoMudar() }} aoFechar={() => setModal(null)} />
      )}
    </>
  )
}

function TabelaEnsaios(p: { consulta: Consulta; opcoes: Opcoes; aoMudar: () => void }) {
  const [modal, setModal] = useState<{ linha: LinhaPvbt | null } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  async function editar(l: LinhaPvbt) {
    try { setModal({ linha: await obterEnsaioLit(String(l.id_experimento)) }) }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <>
      {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
      <TabelaGenerica titulo="Ensaios de PVbt da literatura" chave="id_experimento" consulta={p.consulta} linhas={p.consulta.dados ?? []}
        colunas={[
          { k: 'id_experimento', rotulo: 'id_experimento' }, { k: 'fonte', rotulo: 'fonte' }, { k: 'id_amostra', rotulo: 'id_amostra' },
          { k: 'id_referencia', rotulo: 'id_referencia' }, { k: 'acido', rotulo: 'acido' }, { k: 'conc_m', rotulo: 'conc. (M)', calc: true },
          { k: 'temperatura_c', rotulo: 'T (°C)', casas: 1 }, { k: 'vazao_ml_min', rotulo: 'vazao (mL/min)', casas: 3 },
          { k: 'vel_intersticial_cm_min', rotulo: 'v interst.', calc: true, casas: 4 }, { k: 'pvbt', rotulo: 'pvbt', casas: 4 },
          { k: 'pvbt_condicao', rotulo: 'pvbt_condicao' }, { k: 'obtencao_dado', rotulo: 'obtencao_dado' },
        ]}
        aoNovo={() => setModal({ linha: null })} aoEditar={editar}
        aoExcluir={async (ids) => { try { await excluirEnsaiosLit(ids) } finally { p.aoMudar() } }} />
      {modal && (
        <ModalRegistro titulo={modal.linha ? `Editar ensaio ${modal.linha.id_experimento}` : 'Novo ensaio de PVbt da literatura'}
          campos={CAMPOS_ENSAIO} chave="id_experimento" inicial={modal.linha ?? { fonte: 'Literatura' }} nova={!modal.linha} opcoes={p.opcoes}
          aoSalvar={async (linha, nova) => { await salvarEnsaioLit(linha, nova); p.aoMudar() }} aoFechar={() => setModal(null)} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Formulário por campos (a mesma peça serve para amostras e ensaios)
function ModalRegistro(p: {
  titulo: string; campos: CampoPvbt[]; chave: string; inicial: LinhaPvbt; nova: boolean; opcoes: Opcoes
  aoSalvar: (linha: LinhaPvbt, nova: boolean) => Promise<void>; aoFechar: () => void
}) {
  const [v, setV] = useState<Record<string, string>>(() =>
    Object.fromEntries(p.campos.map((c) => [c.k, paraTexto(c, p.inicial[c.k])])))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const set = (k: string, valor: string) => setV((x) => ({ ...x, [k]: valor }))
  const petrobras = v.fonte === 'Petrobras'

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const linha: LinhaPvbt = {}
      for (const c of p.campos) linha[c.k] = c.k === 'empresa_id' ? null : doTexto(c, v[c.k])
      if (petrobras) {
        if (!v.empresa_id) throw new Error('Dados da Petrobras precisam de uma empresa: só ela vê esses dados.')
        linha.empresa_id = v.empresa_id
      }
      await p.aoSalvar(linha, p.nova)
      p.aoFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  const grupos = [...new Set(p.campos.map((c) => c.grupo ?? ''))]
  const campo = (c: CampoPvbt) => {
    if (c.k === 'empresa_id' && !petrobras) return null
    const comum = { label: c.rotulo, obrigatorio: c.obrig || (c.k === 'empresa_id' && petrobras), value: v[c.k] ?? '' }
    const rotuloUn = c.unidade ? `${c.rotulo} (${c.unidade})` : c.rotulo
    if (c.tipo === 'lista' || c.tipo === 'simnao' || c.tipo === 'fonte-dinamica') {
      let itens: { id: string; rotulo: string }[]
      if (c.tipo === 'lista') itens = (c.opcoes ?? []).map((o) => ({ id: o, rotulo: o }))
      else if (c.tipo === 'simnao') itens = [{ id: 'sim', rotulo: 'sim' }, { id: 'nao', rotulo: 'não' }]
      else if (c.fonte === 'litologia') itens = p.opcoes.litologias.map((l) => ({ id: l, rotulo: l }))
      else if (c.fonte === 'referencia') itens = p.opcoes.referencias
      else if (c.fonte === 'sistema') itens = p.opcoes.sistemas
      else if (c.fonte === 'empresa') itens = p.opcoes.empresas
      else itens = p.opcoes.amostras.filter((a) => !v.fonte || a.fonte === v.fonte).map((a) => ({ id: a.id, rotulo: a.id }))
      // valor antigo fora da lista continua escolhível (ex.: amostra apagada, sistema renomeado)
      if (v[c.k] && !itens.some((i) => i.id === v[c.k])) itens = [{ id: v[c.k], rotulo: v[c.k] }, ...itens]
      return (
        <Select key={c.k} {...comum} label={rotuloUn} disabled={!p.nova && c.k === p.chave} onChange={(e) => set(c.k, e.target.value)}>
          <option value="">—</option>
          {itens.map((i) => <option key={i.id} value={i.id}>{i.rotulo}</option>)}
        </Select>
      )
    }
    return (
      <Input key={c.k} {...comum} label={rotuloUn} type={c.tipo === 'data' ? 'date' : 'text'}
        inputMode={c.tipo === 'num' ? 'decimal' : c.tipo === 'int' ? 'numeric' : undefined}
        disabled={!p.nova && c.k === p.chave} onChange={(e) => set(c.k, e.target.value)} />
    )
  }

  return (
    <Modal isOpen onClose={p.aoFechar} titulo={p.titulo} maxWidth="max-w-4xl"
      subtitulo="Mesmas colunas da planilha do banco de PVbt. Números aceitam vírgula decimal; campos vazios ficam em branco.">
      <div className="flex flex-col gap-5 max-h-[70vh] overflow-y-auto pr-1">
        {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
        {grupos.map((g) => (
          <fieldset key={g} className="m-0 min-w-0 border-0 p-0">
            {g && <legend className="rotulo mb-2 p-0">{g}</legend>}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {p.campos.filter((c) => (c.grupo ?? '') === g).map((c) => (
                <div key={c.k} className={c.largura === 2 ? 'sm:col-span-2 lg:col-span-3' : ''}>{campo(c)}</div>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-[var(--color-neutral-300)]">
        <Button variant="secondary" onClick={p.aoFechar}>Cancelar</Button>
        <Button variant="primary" onClick={salvar} loading={salvando}>Salvar</Button>
      </div>
    </Modal>
  )
}
