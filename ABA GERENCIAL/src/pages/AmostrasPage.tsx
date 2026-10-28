import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Layers, Plus, Search, Trash2, Edit3, ArrowRight, Disc, LayoutList, List, RotateCcw } from 'lucide-react'
import { Card, Button, Input, Select, Modal, Alert, Textarea, Badge, CabecalhoPagina, Vazio } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { usePapeis } from '../hooks/usePapel'
import {
  listarAmostras, buscarAmostraPorId, salvarAmostra, excluirAmostra,
  listarProjetos, listarLitologias, criarLitologia, type AmostraResumo
} from '../servicos/api'
import { useContexto } from '../store/useContexto'
import type { Amostra, Projeto, Litologia } from '../tipos/banco'
import {
  agruparAmostras, dimensoes, filtrarAmostras, FILTROS_VAZIOS, fluidoDe, opcoesDeFiltro, prefixoDe, tipoDe, tituloPrefixo,
  type FiltrosBanco,
} from '../utils/bancoAmostras'
import { fmt, fmtFaixaMd, numeroParaInput, paraNumero } from '../utils/formatacao'
import { LISTA_ANALISES } from '../config/analises'
// a finalidade da amostra guarda os ensaios em que ela foi usada (mesmo vocabulário do controle de rochas)
import { ensaiosDaFinalidade, finalidadeDosEnsaios } from '../utils/finalidade'
import { classeStatus, rotuloStatus, STATUS_ROTULO } from '../utils/status'

// campos numéricos do formulário: ficam como texto para aceitar vírgula decimal (0,5) e 5,2e-7
const CAMPOS_NUMERICOS = [
  ['profundidade_m', 'Profundidade'], ['diametro_cm', 'Diâmetro'], ['comprimento_cm', 'Comprimento'],
  ['massa_seca_g', 'Massa seca'],
  ['permeabilidade_fabricante_min_md', 'Permeabilidade do fabricante (de)'],
  ['permeabilidade_fabricante_max_md', 'Permeabilidade do fabricante (até)'],
] as const
type CampoNumerico = typeof CAMPOS_NUMERICOS[number][0]
const NOVA_LITOLOGIA = '__nova__'

// Amostras e ensaios: lista as amostras do contexto aberto (um projeto, ou todos os projetos
// da empresa). Os ensaios das 8 análises são lançados dentro da ficha de cada amostra.
export const AmostrasPage: React.FC = () => {
  const navigate = useNavigate()
  const empresaId = useContexto((s) => s.empresaId)
  const projetoContexto = useContexto((s) => s.projetoId)

  const [amostras, setAmostras] = useState<AmostraResumo[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [litologias, setLitologias] = useState<Litologia[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros
  // a busca do cabeçalho chega pela URL (/amostras?busca=...)
  const [params] = useSearchParams()
  const buscaNaUrl = params.get('busca') ?? ''
  const [busca, setBusca] = useState(buscaNaUrl)
  const [projetoFiltro, setProjetoFiltro] = useState('')   // só no contexto "todos os projetos"
  const [filtros, setFiltros] = useState<FiltrosBanco>(FILTROS_VAZIOS)
  const [comoLista, setComoLista] = useState(false)        // false = agrupado por tipo e prefixo
  const { editor } = useAuth()                             // pode cadastrar o significado de um prefixo

  // Papel em cada projeto do contexto (RPC meu_papel): os botões de cadastro só aparecem para editor
  const papeis = usePapeis(projetos.map((p) => p.id))
  const projetosEditaveis = projetos.filter((p) => papeis[p.id] === 'editor' && (!projetoContexto || p.id === projetoContexto))
  const podeCadastrar = projetosEditaveis.length > 0

  // Modal
  const [modalAmostra, setModalAmostra] = useState(false)

  // Formulário Amostra
  const formInicial: Partial<Amostra> = {
    codigo: '',
    projeto_id: projetoContexto ?? '',
    litologia: '',
    tipo_origem: 'afloramento',
    afloramento_local: '',
    fornecedor: '',
    bloco: '',
    bacia: '',
    campo: '',
    poco: '',
    reservatorio: '',
    profundidade_m: null,
    diametro_cm: null,
    comprimento_cm: null,
    massa_seca_g: null,
    permeabilidade_fabricante_md: null,
    permeabilidade_fabricante_min_md: null,
    permeabilidade_fabricante_max_md: null,
    status: 'disponivel',
    finalidade: '',
    responsavel: '',
    data_coleta: '',
    observacoes: ''
  }
  const [formAmostra, setFormAmostra] = useState<Partial<Amostra>>(formInicial)
  const [numeros, setNumeros] = useState<Partial<Record<CampoNumerico, string>>>({})
  // litologia que ainda não está no catálogo: é criada junto com a amostra
  const [novaLitologia, setNovaLitologia] = useState<string | null>(null)
  // ensaios em que a amostra foi usada (ao menos um quando o status é "utilizada"); ficam na finalidade da amostra
  const [ensaiosUsados, setEnsaiosUsados] = useState<string[]>([])
  const alternarEnsaio = (chave: string) =>
    setEnsaiosUsados((atual) => (atual.includes(chave) ? atual.filter((c) => c !== chave) : [...atual, chave]))

  /** Abre o formulário com os números em texto (vírgula decimal). */
  function preencherForm(a: Partial<Amostra>) {
    setFormAmostra(a)
    const k = a.permeabilidade_fabricante_min_md ?? a.permeabilidade_fabricante_md
    const kAte = a.permeabilidade_fabricante_max_md
    setNumeros({
      ...Object.fromEntries(CAMPOS_NUMERICOS.map(([c]) => [c, numeroParaInput(a[c])])),
      permeabilidade_fabricante_min_md: numeroParaInput(k),
      // valor único (min = max): o "até" fica vazio
      permeabilidade_fabricante_max_md: kAte != null && kAte !== k ? numeroParaInput(kAte) : '',
    })
    setNovaLitologia(null)
    setEnsaiosUsados(ensaiosDaFinalidade(a.finalidade))
  }

  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function carregar(termo: string = busca) {
    setLoading(true)
    try {
      const [ams, projs, lits] = await Promise.all([
        listarAmostras({ projeto_id: projetoContexto ?? (projetoFiltro || null), empresa_id: empresaId, busca: termo }),
        listarProjetos(empresaId),
        listarLitologias()
      ])
      setAmostras(ams)
      setProjetos(projs)
      setLitologias(lits)
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setBusca(buscaNaUrl)
    carregar(buscaNaUrl)
  }, [empresaId, projetoContexto, projetoFiltro, buscaNaUrl])

  function abrirNovoForm() {
    setFeedback(null)
    preencherForm({ ...formInicial, projeto_id: projetoContexto ?? (projetosEditaveis.length === 1 ? projetosEditaveis[0].id : '') })
    setModalAmostra(true)
  }

  // a lista vem da view v_amostras (tem colunas que a tabela não tem e não traz todas
  // as da tabela): para editar, lê a linha da tabela amostras
  async function editarAmostra(a: { id: string }) {
    try {
      preencherForm(await buscarAmostraPorId(a.id))
      setFeedback(null)
      setModalAmostra(true)
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    }
  }

  async function handleSalvarAmostra(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)

    // amostra utilizada precisa estar ligada aos ensaios em que foi usada
    if (formAmostra.status === 'utilizada' && ensaiosUsados.length === 0) {
      setFeedback({ tipo: 'erro', msg: 'Para marcar a amostra como utilizada, marque os ensaios em que ela foi usada (um ou mais).' })
      setSalvando(false)
      return
    }

    try {
      const nova = !formAmostra.id
      const dados: Partial<Amostra> = { ...formAmostra }
      for (const [campo, rotulo] of CAMPOS_NUMERICOS) {
        const n = paraNumero(numeros[campo] ?? '')
        if (Number.isNaN(n)) throw new Error(`Campo "${rotulo}": "${numeros[campo]}" não é um número. Use vírgula ou ponto decimal, ex.: 3,81.`)
        dados[campo] = n
      }
      // permeabilidade do fabricante: "até" vazio = valor único (min = max), como no importador
      const de = dados.permeabilidade_fabricante_min_md ?? null
      const ate = dados.permeabilidade_fabricante_max_md ?? de
      if (de == null && ate != null) throw new Error('Permeabilidade do fabricante: preencha o campo "de" (o "até" sozinho não vale).')
      if (de != null && ate != null && de > ate) throw new Error('Permeabilidade do fabricante: o valor "de" não pode ser maior que o "até".')
      dados.permeabilidade_fabricante_max_md = ate
      dados.permeabilidade_fabricante_md = de === ate ? de : null
      if (novaLitologia != null) {
        const nome = novaLitologia.trim()
        if (!nome) throw new Error('Escreva o nome da nova litologia ou escolha uma da lista.')
        const existente = litologias.find((l) => l.nome.toLowerCase() === nome.toLowerCase())
        // o catálogo vem antes da amostra (a litologia é referência obrigatória)
        if (!existente) await criarLitologia({ nome })
        dados.litologia = existente?.nome ?? nome
      }
      const utilizada = dados.status === 'utilizada' && ensaiosUsados.length > 0
      if (utilizada) dados.finalidade = finalidadeDosEnsaios(ensaiosUsados)
      const gravada = await salvarAmostra(dados)
      setModalAmostra(false)
      if (nova) {
        // segue para a ficha, já na aba do primeiro ensaio marcado (ou na visão geral), onde se lançam os ensaios
        const primeiro = LISTA_ANALISES.find((c) => ensaiosUsados.includes(c.chave))?.chave
        navigate(`/amostras/${gravada.id}${utilizada && primeiro ? `?aba=${primeiro}` : ''}`)
        return
      }
      setFeedback({ tipo: 'sucesso', msg: `Amostra ${gravada.codigo} salva com sucesso!` })
      await carregar()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluir(id: string, codigo: string) {
    if (!confirm(`Deseja realmente excluir a amostra ${codigo} e todos os seus ensaios vinculados?`)) return
    try {
      await excluirAmostra(id)
      setFeedback({ tipo: 'sucesso', msg: `Amostra ${codigo} excluída.` })
      await carregar()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    }
  }

  // o aviso da página fica atrás do modal aberto: repete a mensagem dentro dele
  const avisoNoModal = feedback && (
    <Alert tipo={feedback.tipo} mensagem={feedback.msg} onClose={() => setFeedback(null)} />
  )

  const nEnsaios = (a: AmostraResumo) =>
    ['n_petrofisica', 'n_microct', 'n_coreflooding', 'n_reatividade', 'n_rda', 'n_drx', 'n_petrografia', 'n_mev']
      .reduce((soma, c) => soma + Number(a[c] ?? 0), 0)

  // filtros do topo (aplicados na lista já carregada) e modo de exibição
  const visiveis = filtrarAmostras(amostras, filtros)
  const opcoes = opcoesDeFiltro(amostras)
  const temFiltro = Object.values(filtros).some(Boolean)
  const mudarFiltro = (parcial: Partial<FiltrosBanco>) => setFiltros((f) => ({ ...f, ...parcial }))

  const COLUNAS = 9
  const cabecalho = (
    <thead>
      <tr>
        <th>Código</th>
        <th>Origem</th>
        <th>Litologia</th>
        <th>Localização / Poço</th>
        <th>Dimensões</th>
        <th>Fluido</th>
        <th className="text-right">Ensaios</th>
        <th>Status</th>
        <th className="text-right !pr-0">Ações</th>
      </tr>
    </thead>
  )

  const linhaAmostra = (a: AmostraResumo) => {
    const editavel = papeis[a.projeto_id] === 'editor'
    const prefixo = prefixoDe(a)
    const fluido = fluidoDe(a)
    const local = a.afloramento_local || a.fornecedor
    return (
      <tr key={a.id} className="lcp-row">
        <td>
          <Link to={`/amostras/${a.id}`} className="codigo text-[14px] hover:underline" title="Abrir a ficha da amostra">
            {a.codigo}
          </Link>
          <span className="block text-[10px] text-[var(--color-neutral-500)]">
            {[prefixo, a.significado_prefixo].filter(Boolean).join(' · ') || '—'}
          </span>
          {!projetoContexto && (a.projeto || a.empresa) && (
            <span className="tag tag-neutral mt-1 !px-1.5 !py-0 !text-[9px]" title="Projeto">{a.projeto || a.empresa}</span>
          )}
        </td>
        <td>
          <Badge variant={a.tipo_origem === 'testemunho' ? 'blue' : 'amber'}>
            {a.tipo_origem}
          </Badge>
        </td>
        <td className="text-[var(--color-text)] font-medium">
          {a.litologia}
        </td>
        <td className="text-[var(--color-neutral-700)]">
          {a.tipo_origem === 'testemunho' ? (
            <div>
              <span>Poço: {a.poco || '—'}</span>
              <span className="block text-[10px] text-[var(--color-neutral-600)]">
                {a.bacia ? `Bacia: ${a.bacia}` : ''} {a.profundidade_m ? `(${fmt(a.profundidade_m)} m)` : ''}
              </span>
            </div>
          ) : (
            <div>
              <span>{local || '—'}</span>
              {a.afloramento_local && a.fornecedor && <span className="block text-[10px] text-[var(--color-neutral-600)]">{a.fornecedor}</span>}
            </div>
          )}
        </td>
        <td className="tabular-nums whitespace-nowrap text-[var(--color-neutral-600)]">
          {dimensoes(a)}
          {a.massa_seca_g && <span className="block text-[10px]">{fmt(a.massa_seca_g)} g</span>}
          {(a.permeabilidade_fabricante_min_md ?? a.permeabilidade_fabricante_md) != null && (
            <span className="block text-[10px]" title="Permeabilidade do fabricante">
              k fab. {fmtFaixaMd(a.permeabilidade_fabricante_min_md, a.permeabilidade_fabricante_max_md, a.permeabilidade_fabricante_md)}
            </span>
          )}
        </td>
        <td className="text-[var(--color-neutral-700)]">
          {fluido ? (
            <>
              {fluido.texto}
              {fluido.previsto && <span className="ml-1 italic text-[var(--color-neutral-500)]">(previsto)</span>}
            </>
          ) : '—'}
        </td>
        <td className="text-right"><span className="numero">{nEnsaios(a)}</span></td>
        <td>
          <span className={classeStatus(a.status)}>{rotuloStatus(a.status)}</span>
        </td>
        <td className="text-right !pr-0">
          <div className="flex items-center justify-end gap-1.5">
            <Link to={`/amostras/${a.id}`} title="Abrir ficha e ensaios" className="btn-icone">
              <ArrowRight size={14} />
            </Link>
            {editavel && (
              <>
                <button onClick={() => editarAmostra(a)} title="Editar amostra" className="btn-icone">
                  <Edit3 size={14} />
                </button>
                <button onClick={() => handleExcluir(a.id, a.codigo)} title="Excluir amostra" className="btn-icone perigo">
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <CabecalhoPagina
        titulo="Amostras e ensaios"
        subtitulo={`${amostras.length} amostra(s) · abra a ficha da amostra para lançar os ensaios das 8 análises`}
        acoes={podeCadastrar && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={abrirNovoForm}>
            Nova amostra
          </Button>
        )}
      />

      {!modalAmostra && feedback && (
        <Alert
          tipo={feedback.tipo}
          mensagem={feedback.msg}
          onClose={() => setFeedback(null)}
        />
      )}

      {/* Barra de Filtros */}
      <div className="cartao p-4 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-neutral-500)]" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && carregar()}
              placeholder="Buscar por código (ex.: IL076), poço, bacia, campo, litologia..."
              className="input !pl-10"
            />
          </div>

          {!projetoContexto && (
            <div className="w-full md:w-72">
              <select
                value={projetoFiltro}
                onChange={(e) => setProjetoFiltro(e.target.value)}
                className="input"
              >
                <option value="">Todos os projetos da empresa</option>
                {projetos.map((p) => (
                  <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>
                ))}
              </select>
            </div>
          )}

          <Button variant="secondary" size="sm" onClick={() => carregar()}>
            Filtrar
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          <Select label="Tipo" value={filtros.tipo} onChange={(e) => mudarFiltro({ tipo: e.target.value })}>
            <option value="">Todos</option>
            <option value="plug">Plug</option>
            <option value="disco">Disco</option>
            {amostras.some((a) => tipoDe(a) === 'outro') && <option value="outro">Outro</option>}
          </Select>
          <Select label="Prefixo" value={filtros.prefixo} onChange={(e) => mudarFiltro({ prefixo: e.target.value })}>
            <option value="">Todos</option>
            {opcoes.prefixos.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
          <Select label="Litotipo" value={filtros.litologia} onChange={(e) => mudarFiltro({ litologia: e.target.value })}>
            <option value="">Todos</option>
            {opcoes.litologias.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>
          <Select label="Status" value={filtros.status} onChange={(e) => mudarFiltro({ status: e.target.value })}>
            <option value="">Todos</option>
            {Object.entries(STATUS_ROTULO).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
          </Select>
          <Select label="Fluido" value={filtros.fluido} onChange={(e) => mudarFiltro({ fluido: e.target.value })}>
            <option value="">Todos</option>
            {opcoes.fluidos.map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
          <Button variant="secondary" icon={<RotateCcw size={14} />} onClick={() => setFiltros(FILTROS_VAZIOS)} disabled={!temFiltro}>
            Limpar filtros
          </Button>
        </div>
      </div>

      {/* agrupado por tipo e prefixo, ou a tabela corrida */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[13px] text-[var(--color-neutral-700)]">
          {visiveis.length === amostras.length
            ? `${amostras.length} amostra(s)`
            : `${visiveis.length} de ${amostras.length} amostra(s) com os filtros`}
          {' '}· clique no código para abrir a ficha e lançar os ensaios
        </p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setComoLista((v) => !v)} aria-pressed={comoLista}>
          {comoLista ? <><LayoutList size={14} /> Agrupar por tipo</> : <><List size={14} /> Ver como lista</>}
        </button>
      </div>

      {loading ? (
        <Card><p className="py-6 text-center text-[13px] text-[var(--color-neutral-500)]">Carregando amostras...</p></Card>
      ) : visiveis.length === 0 ? (
        <Card>
          <Vazio
            icone={<Layers size={36} />}
            titulo="Nenhuma amostra encontrada"
            texto={amostras.length > 0 ? 'Nenhuma amostra passa pelos filtros: use "Limpar filtros".'
              : podeCadastrar ? 'Cadastre a primeira amostra em "Nova amostra".' : 'Não há amostras neste contexto (ou a busca não encontrou nenhuma).'}
          />
        </Card>
      ) : comoLista ? (
        <Card titulo={`Amostras cadastradas (${visiveis.length})`} icone={<Layers size={18} />}>
          <div className="overflow-x-auto">
            <table className="table text-[13px]">
              {cabecalho}
              <tbody>{visiveis.map(linhaAmostra)}</tbody>
            </table>
          </div>
        </Card>
      ) : (
        agruparAmostras(visiveis).map((grupo) => (
          <Card
            key={grupo.tipo}
            titulo={`${grupo.titulo} (${grupo.total})`}
            subtitulo={`${grupo.prefixos.length} prefixo(s) de código`}
            icone={grupo.tipo === 'disco' ? <Disc size={18} /> : <Layers size={18} />}
          >
            <div className="overflow-x-auto">
              <table className="table text-[13px]">
                {cabecalho}
                {grupo.prefixos.map((g) => (
                  <tbody key={g.prefixo}>
                    <tr>
                      <td colSpan={COLUNAS} className="!border-b-2 !border-[var(--color-blue-200)] !bg-[var(--color-blue-50)] !py-2">
                        <span className="font-heading text-[13px] font-bold text-[var(--color-blue-800)]">
                          {g.prefixo && g.significado == null
                            ? <>{g.prefixo} — <span className="font-normal italic text-[var(--color-neutral-600)]">significado não cadastrado</span></>
                            : tituloPrefixo(g)}
                          {' '}({g.amostras.length})
                        </span>
                        {g.prefixo && g.significado == null && editor && (
                          <Link to={`/administracao?${new URLSearchParams({ aba: 'prefixos', prefixo: g.prefixo, tipo: grupo.tipo })}`}
                            className="ml-3 text-[12px] font-semibold text-[var(--color-blue)] underline">
                            Cadastrar o significado de {g.prefixo}
                          </Link>
                        )}
                      </td>
                    </tr>
                    {g.amostras.map(linhaAmostra)}
                  </tbody>
                ))}
              </table>
            </div>
          </Card>
        ))
      )}

      {/* Modal Cadastro/Edição de Amostra */}
      <Modal
        isOpen={modalAmostra}
        onClose={() => setModalAmostra(false)}
        titulo={formAmostra.id ? `Editar Amostra ${formAmostra.codigo}` : 'Cadastrar Nova Amostra'}
        subtitulo="Preencha os dados de proveniência e geometria do plugue"
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSalvarAmostra} className="space-y-5">
          {avisoNoModal}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Código da Amostra (ID)"
              placeholder="Ex.: LCP-01, IL-04"
              value={formAmostra.codigo || ''}
              onChange={(e) => setFormAmostra({ ...formAmostra, codigo: e.target.value.toUpperCase() })}
              obrigatorio
            />
            <Select
              label="Projeto Vinculado"
              value={formAmostra.projeto_id || ''}
              onChange={(e) => setFormAmostra({ ...formAmostra, projeto_id: e.target.value })}
              obrigatorio
            >
              <option value="">Selecione um projeto...</option>
              {projetosEditaveis.map((p) => (
                <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>
              ))}
            </Select>
            <div className="flex flex-col gap-2">
              <Select
                label="Litologia"
                value={novaLitologia != null ? NOVA_LITOLOGIA : formAmostra.litologia || ''}
                onChange={(e) => {
                  if (e.target.value === NOVA_LITOLOGIA) setNovaLitologia('')
                  else { setNovaLitologia(null); setFormAmostra({ ...formAmostra, litologia: e.target.value }) }
                }}
                obrigatorio
              >
                <option value="">Selecione uma litologia...</option>
                {litologias.map((l) => (
                  <option key={l.nome} value={l.nome}>{l.nome}</option>
                ))}
                <option value={NOVA_LITOLOGIA}>+ Nova litologia (não está na lista)…</option>
              </Select>
              {novaLitologia != null && (
                <Input
                  placeholder="Nome da nova litologia, ex.: Edwards Yellow"
                  value={novaLitologia}
                  onChange={(e) => setNovaLitologia(e.target.value)}
                  ajuda="Será criada no catálogo de litologias ao salvar a amostra."
                />
              )}
            </div>
          </div>

          {/* Seletor de Tipo de Origem */}
          <div className="flex flex-col gap-3 rounded-[10px] border border-[var(--color-neutral-300)] bg-[var(--color-neutral-50)] p-4">
            <label className="rotulo">Tipo de Origem da Rocha *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormAmostra({ ...formAmostra, tipo_origem: 'afloramento' })}
                className={`p-3 rounded-xl border text-xs font-semibold text-center transition-all ${
                  formAmostra.tipo_origem === 'afloramento'
                    ? 'bg-[var(--color-orange-50)] border-[var(--color-orange)] text-[var(--color-orange-700)]'
                    : 'bg-white border-[var(--color-neutral-300)] text-[var(--color-neutral-600)] hover:border-[var(--color-blue-200)]'
                }`}
              >
                Afloramento
              </button>
              <button
                type="button"
                onClick={() => setFormAmostra({ ...formAmostra, tipo_origem: 'testemunho' })}
                className={`p-3 rounded-xl border text-xs font-semibold text-center transition-all ${
                  formAmostra.tipo_origem === 'testemunho'
                    ? 'bg-[var(--color-orange-50)] border-[var(--color-orange)] text-[var(--color-orange-700)]'
                    : 'bg-white border-[var(--color-neutral-300)] text-[var(--color-neutral-600)] hover:border-[var(--color-blue-200)]'
                }`}
              >
                Testemunho de Sondagem
              </button>
            </div>
          </div>

          {/* Dimensões Físicas */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Input
              label="Diâmetro (cm)"
              inputMode="decimal"
              placeholder="3,81"
              value={numeros.diametro_cm ?? ''}
              onChange={(e) => setNumeros({ ...numeros, diametro_cm: e.target.value })}
            />
            <Input
              label="Comprimento (cm)"
              inputMode="decimal"
              placeholder="7,62"
              value={numeros.comprimento_cm ?? ''}
              onChange={(e) => setNumeros({ ...numeros, comprimento_cm: e.target.value })}
            />
            <Input
              label="Massa Seca (g)"
              inputMode="decimal"
              placeholder="184,2"
              value={numeros.massa_seca_g ?? ''}
              onChange={(e) => setNumeros({ ...numeros, massa_seca_g: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Permeabilidade do fabricante (mD) · de"
              inputMode="decimal"
              placeholder="30"
              value={numeros.permeabilidade_fabricante_min_md ?? ''}
              onChange={(e) => setNumeros({ ...numeros, permeabilidade_fabricante_min_md: e.target.value })}
            />
            <Input
              label="até (opcional; vazio = valor único)"
              inputMode="decimal"
              placeholder="50"
              value={numeros.permeabilidade_fabricante_max_md ?? ''}
              onChange={(e) => setNumeros({ ...numeros, permeabilidade_fabricante_max_md: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Status da Amostra"
              value={formAmostra.status || 'disponivel'}
              onChange={(e) => setFormAmostra({ ...formAmostra, status: e.target.value as any })}
            >
              {Object.entries(STATUS_ROTULO).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
            </Select>
            <Input
              label="Responsável Técnico"
              placeholder="Ex.: Heitor, Dulcídio"
              value={formAmostra.responsavel || ''}
              onChange={(e) => setFormAmostra({ ...formAmostra, responsavel: e.target.value })}
            />
            <Input
              label="Data de Coleta / Chegada"
              type="date"
              value={formAmostra.data_coleta || ''}
              onChange={(e) => setFormAmostra({ ...formAmostra, data_coleta: e.target.value })}
            />
          </div>

          {/* amostra utilizada: os ensaios em que foi usada (um ou mais) viram as abas da ficha */}
          {formAmostra.status === 'utilizada' && (
            <fieldset className="m-0 min-w-0 rounded-[10px] border border-[var(--color-neutral-300)] bg-[var(--color-neutral-50)] p-4">
              <legend className="rotulo px-1">Ensaios em que foi utilizada * ({ensaiosUsados.length} marcado(s))</legend>
              <div className="flex flex-wrap gap-2">
                {LISTA_ANALISES.map((c) => {
                  const marcado = ensaiosUsados.includes(c.chave)
                  return (
                    <button type="button" key={c.chave} onClick={() => alternarEnsaio(c.chave)} aria-pressed={marcado}
                      className={`tag cursor-pointer !py-1.5 ${marcado ? 'tag-orange' : 'tag-neutral'}`}>
                      {c.numero}. {c.titulo}
                    </button>
                  )
                })}
              </div>
              <span className="ajuda mt-2 block">
                Marque todos os ensaios feitos com esta amostra: eles aparecem como abas na ficha da amostra do dashboard de visualização.
              </span>
            </fieldset>
          )}

          <Textarea
            label="Observações Físicas / Geológicas"
            placeholder="Fraturas visíveis, grau de homogeneidade, manchas..."
            value={formAmostra.observacoes || ''}
            onChange={(e) => setFormAmostra({ ...formAmostra, observacoes: e.target.value })}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-neutral-300)]">
            <Button variant="secondary" onClick={() => setModalAmostra(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={salvando}>Salvar Amostra</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
