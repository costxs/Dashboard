import React, { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Database, Plus, FlaskConical, Layers, Info, Filter } from 'lucide-react'
import { Card, Button, Input, Select, Modal, Alert, Textarea, Badge , SeloContexto } from '../components/UI'
import { listarLitologias, criarLitologia, listarSistemasAcidos, criarSistemaAcido, montarAditivos } from '../servicos/api'
import type { Gravavel, Litologia, SistemaAcido } from '../tipos/banco'
import { fmt, paraNumero } from '../utils/formatacao'

// Formulário do sistema ácido: valores como texto, para aceitar vírgula decimal.
// Componente 1 = ácido principal; componentes 2 a 4 = aditivos.
interface ComponenteForm { nome: string; valor: string; unidade: string }
interface FormAcido {
  id_sistema: string
  nome_sistema: string
  categoria: string
  nome_comercial: string
  composicao_original: string
  componentes: [ComponenteForm, ComponenteForm, ComponenteForm, ComponenteForm]
}

const CATEGORIAS_PADRAO = [
  'HCl',
  'HCl + IC',
  'Blend',
  'Mistura Ácida',
  'Mistura Ácida / HCl',
  'Ácido Retardado',
  'Ácido Orgânico',
  'Quelante',
  'Emulsionado',
  'Comercial',
]

const formAcidoInicial = (): FormAcido => ({
  id_sistema: '',
  nome_sistema: '',
  categoria: 'HCl',
  nome_comercial: '',
  composicao_original: '',
  componentes: [
    { nome: 'HCl', valor: '15', unidade: 'wt%' },
    { nome: '', valor: '', unidade: '' },
    { nome: '', valor: '', unidade: '' },
    { nome: '', valor: '', unidade: '' },
  ],
})

/** Formulário -> colunas da tabela sistemas_acidos (sem conc_m, conc_pct nem aditivos). */
function formParaSistemaAcido(f: FormAcido): Gravavel['sistemas_acidos'] {
  const valor = (c: ComponenteForm, n: number) => {
    const v = paraNumero(c.valor)
    if (Number.isNaN(v)) throw new Error(`Componente ${n}: "${c.valor}" não é um número. Use vírgula ou ponto decimal, ex.: 0,5.`)
    return v
  }
  const [c1, c2, c3, c4] = f.componentes
  return {
    id_sistema: f.id_sistema,
    nome_sistema: f.nome_sistema,
    categoria: f.categoria,
    nome_comercial: f.nome_comercial,
    componente_1: c1.nome, valor_1: valor(c1, 1), unidade_1: c1.unidade,
    componente_2: c2.nome, valor_2: valor(c2, 2), unidade_2: c2.unidade,
    componente_3: c3.nome, valor_3: valor(c3, 3), unidade_3: c3.unidade,
    componente_4: c4.nome, valor_4: valor(c4, 4), unidade_4: c4.unidade,
    composicao_original: f.composicao_original,
  }
}

/** Aditivos do formulário (componentes 2 a 4), para a prévia. */
function aditivosDoForm(f: FormAcido): string {
  const [, c2, c3, c4] = f.componentes
  return montarAditivos({
    componente_2: c2.nome, valor_2: paraNumero(c2.valor), unidade_2: c2.unidade,
    componente_3: c3.nome, valor_3: paraNumero(c3.valor), unidade_3: c3.unidade,
    componente_4: c4.nome, valor_4: paraNumero(c4.valor), unidade_4: c4.unidade,
  })
}

export const CatalogosPage: React.FC<{ embutida?: boolean }> = ({ embutida }) => {
  const [litologias, setLitologias] = useState<Litologia[]>([])
  const [sistemas, setSistemas] = useState<SistemaAcido[]>([])
  const [loading, setLoading] = useState(true)

  // Categorias extras cadastradas pelo usuário (persistidas no localStorage)
  const [categoriasExtras, setCategoriasExtras] = useState<string[]>(() => {
    try {
      const salvo = localStorage.getItem('lcpetro_categorias_acido_extras')
      return salvo ? JSON.parse(salvo) : []
    } catch {
      return []
    }
  })
  const [criandoNovaCategoria, setCriandoNovaCategoria] = useState(false)
  const [textoNovaCategoria, setTextoNovaCategoria] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas')

  // Modais
  const [modalLit, setModalLit] = useState(false)
  const [modalAcido, setModalAcido] = useState(false)

  // Formulários
  const [formLit, setFormLit] = useState<Litologia>({ nome: '', tipo: 'Carbonato', descricao: '' })
  const [formAcido, setFormAcido] = useState<FormAcido>(formAcidoInicial)

  // Lista unificada de categorias (Padrão + Banco + Extras + Atual do form)
  const todasCategorias = useMemo(() => {
    const doBanco = sistemas.map((s) => s.categoria).filter(Boolean) as string[]
    const atual = formAcido.categoria ? [formAcido.categoria] : []
    const unicas = Array.from(new Set([...CATEGORIAS_PADRAO, ...doBanco, ...categoriasExtras, ...atual]))
    const ordemPadrao = CATEGORIAS_PADRAO
    const extras = unicas.filter((c) => !ordemPadrao.includes(c)).sort((a, b) => a.localeCompare('pt-BR'))
    return [...ordemPadrao, ...extras]
  }, [sistemas, categoriasExtras, formAcido.categoria])

  function handleAdicionarNovaCategoria(e?: React.FormEvent) {
    if (e) e.preventDefault()
    const nova = textoNovaCategoria.trim()
    if (!nova) return
    if (!categoriasExtras.includes(nova) && !CATEGORIAS_PADRAO.includes(nova)) {
      const atualizadas = [...categoriasExtras, nova]
      setCategoriasExtras(atualizadas)
      try {
        localStorage.setItem('lcpetro_categorias_acido_extras', JSON.stringify(atualizadas))
      } catch {}
    }
    setFormAcido((prev) => ({ ...prev, categoria: nova }))
    setTextoNovaCategoria('')
    setCriandoNovaCategoria(false)
  }

  const sistemasFiltrados = useMemo(() => {
    if (filtroCategoria === 'todas') return sistemas
    return sistemas.filter((s) => s.categoria === filtroCategoria)
  }, [sistemas, filtroCategoria])

  function mudarComponente(i: number, campo: keyof ComponenteForm, valor: string) {
    const componentes = formAcido.componentes.map((c, k) => (k === i ? { ...c, [campo]: valor } : c)) as FormAcido['componentes']
    setFormAcido({ ...formAcido, componentes })
  }

  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    setLoading(true)
    try {
      const [lits, sis] = await Promise.all([listarLitologias(), listarSistemasAcidos()])
      setLitologias(lits)
      setSistemas(sis)
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  // link "Cadastrar sistema ácido HCl 15 %" da ficha da amostra: abre o formulário preenchido (a pessoa confere e salva)
  const [params] = useSearchParams()
  const acidoPedido = params.get('acido')
  useEffect(() => {
    if (!acidoPedido) return
    const valor = (params.get('valor') ?? '').replace('.', ',')
    const unidade = params.get('unidade') || 'wt%'
    const inicial = formAcidoInicial()
    setFormAcido({
      ...inicial,
      nome_sistema: [acidoPedido, valor, unidade].filter(Boolean).join(' '),
      categoria: acidoPedido === 'HCl' ? 'HCl' : '',
      componentes: [{ nome: acidoPedido, valor, unidade }, inicial.componentes[1], inicial.componentes[2], inicial.componentes[3]],
    })
    setFeedback(null)
    setModalAcido(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acidoPedido])

  async function handleSalvarLitologia(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      await criarLitologia(formLit)
      setFeedback({ tipo: 'sucesso', msg: 'Litologia cadastrada com sucesso!' })
      setModalLit(false)
      setFormLit({ nome: '', tipo: 'Carbonato', descricao: '' })
      await carregar()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setSalvando(false)
    }
  }

  async function handleSalvarAcido(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      const cat = formAcido.categoria?.trim()
      if (cat && !CATEGORIAS_PADRAO.includes(cat) && !categoriasExtras.includes(cat)) {
        const atualizadas = [...categoriasExtras, cat]
        setCategoriasExtras(atualizadas)
        try {
          localStorage.setItem('lcpetro_categorias_acido_extras', JSON.stringify(atualizadas))
        } catch {}
      }
      const gravado = await criarSistemaAcido(formParaSistemaAcido(formAcido))
      setFeedback({ tipo: 'sucesso', msg: `Sistema ácido ${gravado.id_sistema} cadastrado com sucesso!` })
      setModalAcido(false)
      setCriandoNovaCategoria(false)
      setTextoNovaCategoria('')
      setFormAcido(formAcidoInicial())
      await carregar()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setSalvando(false)
    }
  }

  // o aviso da página fica atrás do modal aberto: repete a mensagem dentro dele
  const avisoNoModal = feedback && (
    <Alert tipo={feedback.tipo} mensagem={feedback.msg} onClose={() => setFeedback(null)} />
  )

  return (
    <div className="space-y-6 animate-fade-in">
      {!embutida && (
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <SeloContexto />
          <h1 className="mt-3 text-[27px] leading-[1.2] text-[var(--color-blue-800)]">Catálogos Globais & Fluidos</h1>
          <p className="mt-2 text-[13px] text-[var(--color-neutral-700)]">
            Padronização de litologias e formulações ácidas para cruzamento entre laboratório e literatura
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" icon={<Layers size={16} />} onClick={() => { setFeedback(null); setModalLit(true) }}>
            Nova Litologia
          </Button>
          <Button variant="primary" icon={<FlaskConical size={16} />} onClick={() => { setFeedback(null); setModalAcido(true) }}>
            Novo Sistema Ácido
          </Button>
        </div>
      </div>
      )}

      {feedback && (
        <Alert
          tipo={feedback.tipo}
          mensagem={feedback.msg}
          onClose={() => setFeedback(null)}
        />
      )}

      {/* Grid: Litologias e Sistemas Ácidos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Catálogo de Litologias */}
        <Card
          titulo="Litologias Padronizadas"
          subtitulo="Mesma lista usada para amostras e publicações"
          icone={<Layers size={18} />}
          acoes={
            <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => { setFeedback(null); setModalLit(true) }}>
              Adicionar
            </Button>
          }
        >
          {litologias.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-[var(--color-neutral-500)]">Nenhuma litologia cadastrada.</p>
          ) : (
            <div className="divide-y divide-[var(--color-neutral-200)]">
              {litologias.map((lit) => (
                <div key={lit.nome} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[var(--color-text)]">{lit.nome}</span>
                      {lit.tipo && <Badge variant="blue">{lit.tipo}</Badge>}
                    </div>
                    {lit.descricao && (
                      <p className="text-xs text-[var(--color-neutral-600)] mt-1">{lit.descricao}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Catálogo de Sistemas Ácidos */}
        <Card
          titulo="Sistemas Ácidos & Fluidos"
          subtitulo="Composição química, concentração e aditivos"
          icone={<FlaskConical size={18} />}
          acoes={
            <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => { setFeedback(null); setModalAcido(true) }}>
              Adicionar
            </Button>
          }
        >
          {sistemas.length > 0 && (
            <div className="pb-3 mb-2 border-b border-[var(--color-neutral-200)] flex items-center gap-1.5 overflow-x-auto text-xs py-1">
              <span className="text-[var(--color-neutral-500)] flex items-center gap-1 font-medium mr-1 shrink-0">
                <Filter size={12} /> Categoria:
              </span>
              <button
                type="button"
                onClick={() => setFiltroCategoria('todas')}
                className={`px-2.5 py-1 rounded-full text-xs transition-colors shrink-0 ${
                  filtroCategoria === 'todas'
                    ? 'bg-[var(--color-blue-800)] text-white font-medium'
                    : 'bg-[var(--color-neutral-100)] text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-200)]'
                }`}
              >
                Todas ({sistemas.length})
              </button>
              {todasCategorias
                .filter((cat) => sistemas.some((s) => s.categoria === cat))
                .map((cat) => {
                  const cont = sistemas.filter((s) => s.categoria === cat).length
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFiltroCategoria(filtroCategoria === cat ? 'todas' : cat)}
                      className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors shrink-0 ${
                        filtroCategoria === cat
                          ? 'bg-[var(--color-blue-800)] text-white font-medium'
                          : 'bg-[var(--color-neutral-100)] text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-200)]'
                      }`}
                    >
                      {cat} ({cont})
                    </button>
                  )
                })}
            </div>
          )}

          {sistemasFiltrados.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-[var(--color-neutral-500)]">
              {sistemas.length === 0 ? 'Nenhum sistema ácido cadastrado.' : 'Nenhum sistema ácido nesta categoria.'}
            </p>
          ) : (
            <div className="divide-y divide-[var(--color-neutral-200)]">
              {sistemasFiltrados.map((sis) => (
                <div key={sis.id_sistema} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="tag tag-orange">
                        {sis.id_sistema}
                      </span>
                      <span className="font-medium text-sm text-[var(--color-text)]">{sis.nome_sistema}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--color-neutral-600)] mt-1">
                      <span>{sis.componente_1} ({fmt(sis.valor_1, 4)} {sis.unidade_1})</span>
                      {/* conc_m e conc_pct vêm calculados de v_sistemas_acidos */}
                      {sis.conc_pct != null && <span className="text-[var(--color-blue-700)] tabular-nums font-medium">{fmt(sis.conc_pct)} wt%</span>}
                      {sis.conc_m != null && <span className="text-[var(--color-blue-700)] tabular-nums font-medium">{fmt(sis.conc_m, 3)} M</span>}
                    </div>
                    {montarAditivos(sis) && (
                      <p className="text-[11px] text-[var(--color-neutral-500)] mt-0.5">Aditivos: {montarAditivos(sis)}</p>
                    )}
                    {sis.nome_comercial && (
                      <p className="text-[11px] text-[var(--color-neutral-500)] mt-0.5">Nome comercial: {sis.nome_comercial}</p>
                    )}
                  </div>
                  {sis.categoria && <Badge variant="purple">{sis.categoria}</Badge>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Modal Nova Litologia */}
      <Modal
        isOpen={modalLit}
        onClose={() => setModalLit(false)}
        titulo="Cadastrar Nova Litologia"
        subtitulo="Adicione rochas carbonáticas, arenitos ou outras formações"
      >
        <form onSubmit={handleSalvarLitologia} className="space-y-4">
          {avisoNoModal}
          <Input
            label="Nome da Litologia"
            placeholder="Ex.: Indiana Limestone, Pink Desert, Berea Sandstone"
            value={formLit.nome}
            onChange={(e) => setFormLit({ ...formLit, nome: e.target.value })}
            obrigatorio
          />
          <Select
            label="Classificação / Tipo"
            value={formLit.tipo || ''}
            onChange={(e) => setFormLit({ ...formLit, tipo: e.target.value })}
          >
            <option value="Carbonato">Carbonato (Calcário, Dolomito, Mármore)</option>
            <option value="Siliciclástica">Siliciclástica (Arenito, Folhelho)</option>
            <option value="Outro">Outro</option>
          </Select>
          <Textarea
            label="Descrição Geológica / Mineralógica"
            placeholder="Origem, textura, maturidade, principais minerais..."
            value={formLit.descricao || ''}
            onChange={(e) => setFormLit({ ...formLit, descricao: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-neutral-300)]">
            <Button variant="secondary" onClick={() => setModalLit(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={salvando}>Salvar Litologia</Button>
          </div>
        </form>
      </Modal>

      {/* Modal Novo Sistema Ácido */}
      <Modal
        isOpen={modalAcido}
        onClose={() => setModalAcido(false)}
        titulo="Cadastrar Novo Sistema Ácido"
        subtitulo="Definição de fórmula, proporções e aditivos inibidores"
      >
        <form onSubmit={handleSalvarAcido} className="space-y-4">
          {avisoNoModal}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="ID do Sistema (Código)"
              placeholder="Ex.: SA01"
              value={formAcido.id_sistema}
              onChange={(e) => setFormAcido({ ...formAcido, id_sistema: e.target.value })}
              obrigatorio
              required
            />
            <Input
              label="Nome do Sistema"
              placeholder="Ex.: HCl 15 wt%"
              value={formAcido.nome_sistema}
              onChange={(e) => setFormAcido({ ...formAcido, nome_sistema: e.target.value })}
              obrigatorio
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              {criandoNovaCategoria ? (
                <div className="field w-full">
                  <div className="flex items-center justify-between">
                    <span className="rotulo">Nova Categoria *</span>
                    <button
                      type="button"
                      onClick={() => setCriandoNovaCategoria(false)}
                      className="text-xs text-[var(--color-blue-700)] hover:underline"
                    >
                      Voltar para lista
                    </button>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <input
                      className="input !py-2 flex-1"
                      placeholder="Ex.: Blend, Mistura Ácida / HCl"
                      value={textoNovaCategoria}
                      onChange={(e) => setTextoNovaCategoria(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAdicionarNovaCategoria()
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => handleAdicionarNovaCategoria()}
                      disabled={!textoNovaCategoria.trim()}
                    >
                      Adicionar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="field w-full">
                  <div className="flex items-center justify-between">
                    <span className="rotulo">Categoria</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCriandoNovaCategoria(true)
                        setTextoNovaCategoria('')
                      }}
                      className="text-xs text-[var(--color-blue-700)] hover:underline flex items-center gap-1 font-medium"
                    >
                      <Plus size={12} /> Nova categoria
                    </button>
                  </div>
                  <select
                    className="input !py-2 mt-1 w-full"
                    value={formAcido.categoria}
                    onChange={(e) => {
                      if (e.target.value === '__NOVA__') {
                        setCriandoNovaCategoria(true)
                        setTextoNovaCategoria('')
                      } else {
                        setFormAcido({ ...formAcido, categoria: e.target.value })
                      }
                    }}
                  >
                    <option value="">Selecione uma categoria...</option>
                    {todasCategorias.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__NOVA__">+ Cadastrar outra categoria...</option>
                  </select>
                </div>
              )}
            </div>
            <Input
              label="Nome Comercial (se houver)"
              placeholder="Ex.: nome do produto do fornecedor"
              value={formAcido.nome_comercial}
              onChange={(e) => setFormAcido({ ...formAcido, nome_comercial: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Componente 1 (ácido principal)"
              placeholder="Ex.: HCl"
              value={formAcido.componentes[0].nome}
              onChange={(e) => mudarComponente(0, 'nome', e.target.value)}
              obrigatorio
              required
            />
            <Input
              label="Concentração"
              inputMode="decimal"
              placeholder="ex.: 15 ou 0,5"
              value={formAcido.componentes[0].valor}
              onChange={(e) => mudarComponente(0, 'valor', e.target.value)}
            />
            <Select
              label="Unidade"
              value={formAcido.componentes[0].unidade}
              onChange={(e) => mudarComponente(0, 'unidade', e.target.value)}
            >
              <option value="wt%">wt% (massa)</option>
              <option value="vol%">vol% (volume)</option>
              <option value="M">M (mol/L)</option>
              <option value="N">N (normal)</option>
            </Select>
          </div>

          {[1, 2, 3].map((i) => {
            const ehBlend = formAcido.categoria?.toLowerCase().includes('blend') || formAcido.categoria?.toLowerCase().includes('mistura')
            const labelComponente = i === 1 && ehBlend
              ? 'Componente 2 (segundo ácido ou aditivo, opcional)'
              : `Componente ${i + 1} (aditivo, opcional)`
            const placeholderComponente = i === 1 && ehBlend
              ? 'Ex.: HF, ácido acético, ácido fórmico, inibidor...'
              : 'Ex.: inibidor de corrosão, surfactante, quelante'

            return (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label={labelComponente}
                  placeholder={placeholderComponente}
                  value={formAcido.componentes[i].nome}
                  onChange={(e) => mudarComponente(i, 'nome', e.target.value)}
                />
                <Input
                  label={`Valor ${i + 1}`}
                  inputMode="decimal"
                  placeholder="ex.: 0,5"
                  value={formAcido.componentes[i].valor}
                  onChange={(e) => mudarComponente(i, 'valor', e.target.value)}
                />
                <Input
                  label={`Unidade ${i + 1}`}
                  placeholder="wt%, vol%, M, gpt..."
                  list="unidades-aditivos"
                  value={formAcido.componentes[i].unidade}
                  onChange={(e) => mudarComponente(i, 'unidade', e.target.value)}
                />
              </div>
            )
          })}

          <datalist id="unidades-aditivos">
            <option value="vol%" />
            <option value="wt%" />
            <option value="gpt" />
            <option value="M" />
            <option value="g/L" />
            <option value="ppm" />
          </datalist>

          <p className="text-[11px] text-[var(--color-neutral-600)]">
            Aditivos (montados a partir dos componentes 2 a 4):{' '}
            <span className="tabular-nums text-[var(--color-text)]">{aditivosDoForm(formAcido) || 'nenhum'}</span>
            . As concentrações em mol/L e wt% são calculadas pelo banco depois de gravar.
          </p>

          <Textarea
            label="Composição original (como descrita na fonte)"
            placeholder="Ex.: 15 wt% HCl + 0,5 vol% inibidor de corrosão"
            value={formAcido.composicao_original}
            onChange={(e) => setFormAcido({ ...formAcido, composicao_original: e.target.value })}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-neutral-300)]">
            <Button variant="secondary" onClick={() => setModalAcido(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={salvando}>Salvar Sistema Ácido</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
