import React, { useEffect, useState } from 'react'
import { BookOpen, Plus, ExternalLink, FileText, Lock, Pencil, Search, Trash2 } from 'lucide-react'
import { Card, Button, Input, Select, Modal, Alert, Textarea, Badge , SeloContexto } from '../components/UI'
import { LISTA_ANALISES } from '../config/analises'
import {
  listarPublicacoes, salvarPublicacao, listarProjetos, listarAmostras,
  proximoCodigoProprio, amostrasDaPublicacao, ligarAmostrasPublicacao,
  enviarPdfPublicacao, listarArquivosPublicacoes, obterUrlDownloadArquivo, excluirPublicacao,
  type AmostraResumo, type ArquivoPublicacao,
} from '../servicos/api'
import type { Gravavel, Publicacao, Projeto } from '../tipos/banco'
import { useAuth } from '../context/AuthContext'
import { useContexto } from '../store/useContexto'

const TIPOS = ['artigo', 'congresso', 'dissertação', 'tese', 'TCC', 'relatório']

const formVazio = (categoria: 'geral' | 'propria'): Gravavel['publicacoes'] => ({
  id_referencia: '',
  categoria,
  tipo: 'artigo',
  autor: '',
  ano: String(new Date().getFullYear()),
  titulo: '',
  periodico: '',
  doi: '',
  resumo: '',
  palavras_chave: [],
  eixos: [],
  projeto_id: null
})

/** Cadastro e lista de publicações de uma categoria (própria do LC PETRO ou da literatura geral), embutido na página de Literatura. */
export const CadastroPublicacoes: React.FC<{ categoria: 'geral' | 'propria' }> = ({ categoria }) => {
  const { editor } = useAuth()
  const empresaId = useContexto((s) => s.empresaId)
  const [publicacoes, setPublicacoes] = useState<Publicacao[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [arquivos, setArquivos] = useState<Record<string, ArquivoPublicacao[]>>({})
  const categoriaAtiva = categoria
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)

  // Modal (cadastrar ou editar)
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<Gravavel['publicacoes']>(formVazio('propria'))
  const [palavrasChaveTexto, setPalavrasChaveTexto] = useState('')
  const [amostrasUsadas, setAmostrasUsadas] = useState<string[]>([])
  const [amostrasDisponiveis, setAmostrasDisponiveis] = useState<AmostraResumo[]>([])
  const [pdf, setPdf] = useState<File | null>(null)

  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    setLoading(true)
    try {
      const [pubs, projs, arqs] = await Promise.all([
        listarPublicacoes(categoriaAtiva),
        listarProjetos(),
        listarArquivosPublicacoes(),
      ])
      setPublicacoes(pubs)
      setProjetos(projs)
      setArquivos(arqs)
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [categoriaAtiva])

  // amostras que podem ser ligadas à publicação própria: as do projeto dela, ou as da empresa aberta
  const propria = form.categoria === 'propria'
  useEffect(() => {
    if (!modalAberto || !propria) return
    let vivo = true
    listarAmostras(form.projeto_id ? { projeto_id: form.projeto_id } : { empresa_id: empresaId })
      .then((a) => { if (vivo) setAmostrasDisponiveis(a) })
      .catch((err) => { if (vivo) setFeedback({ tipo: 'erro', msg: `Não consegui listar as amostras: ${err.message}` }) })
    return () => { vivo = false }
  }, [modalAberto, propria, form.projeto_id, empresaId])

  async function abrirNovoForm() {
    setFeedback(null)
    setEditando(false)
    setPalavrasChaveTexto('')
    setAmostrasUsadas([])
    setPdf(null)
    setForm(formVazio(categoriaAtiva))
    setModalAberto(true)
    if (categoriaAtiva === 'propria') {
      try {
        const id = await proximoCodigoProprio()
        setForm((f) => (f.id_referencia ? f : { ...f, id_referencia: id }))
      } catch { /* sem sugestão de código: a pessoa digita */ }
    }
  }

  async function abrirEdicao(pub: Publicacao) {
    setFeedback(null)
    setEditando(true)
    setPdf(null)
    setForm({
      id_referencia: pub.id_referencia, categoria: pub.categoria, tipo: pub.tipo ?? '', autor: pub.autor, ano: pub.ano ?? '',
      titulo: pub.titulo ?? '', periodico: pub.periodico ?? '', doi: pub.doi ?? '', resumo: pub.resumo ?? '',
      palavras_chave: pub.palavras_chave ?? [], eixos: pub.eixos ?? [], projeto_id: pub.projeto_id ?? null,
    })
    setPalavrasChaveTexto((pub.palavras_chave ?? []).join('; '))
    setAmostrasUsadas([])
    setModalAberto(true)
    if (pub.categoria === 'propria') {
      try {
        setAmostrasUsadas(await amostrasDaPublicacao(pub.id_referencia))
      } catch (err: any) {
        setFeedback({ tipo: 'erro', msg: err.message })
      }
    }
  }

  function alternarEixo(chave: string) {
    const eixos = form.eixos ?? []
    setForm({ ...form, eixos: eixos.includes(chave) ? eixos.filter((e) => e !== chave) : [...eixos, chave] })
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      const tags = palavrasChaveTexto.split(/[,;]+/).map((t) => t.trim()).filter(Boolean)
      const gravada = await salvarPublicacao({
        ...form,
        doi: form.doi?.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') || null,
        palavras_chave: tags.length > 0 ? tags : null,
        eixos: form.eixos && form.eixos.length > 0 ? form.eixos : null,
      }, editando ? form.id_referencia : undefined)
      // a publicação já está gravada: se um dos passos seguintes falhar, a mensagem diz qual
      setEditando(true)
      if (propria) await ligarAmostrasPublicacao(gravada.id_referencia, amostrasUsadas)
      if (pdf) await enviarPdfPublicacao(gravada.id_referencia, pdf)
      setFeedback({
        tipo: 'sucesso',
        msg: `Publicação ${gravada.id_referencia} gravada` +
          (propria ? ` · ${amostrasUsadas.length} amostra(s) ligada(s)` : '') + (pdf ? ` · PDF "${pdf.name}" enviado` : '') +
          `. Ela aparece no dashboard em Literatura › ${propria ? 'LC PETRO' : 'Geral'}.`
      })
      setModalAberto(false)
      await carregar()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluir(pub: Publicacao) {
    if (!confirm(`Excluir a publicação ${pub.id_referencia}${pub.titulo ? ` — ${pub.titulo}` : ''}? Isso não pode ser desfeito.`)) return
    try {
      await excluirPublicacao(pub.id_referencia)
      setFeedback({ tipo: 'sucesso', msg: `Publicação ${pub.id_referencia} excluída.` })
      await carregar()
    } catch (err: any) {
      const ligados = /violates foreign key|23503|ligad/i.test(err.message)
      setFeedback({ tipo: 'erro', msg: ligados ? `Não foi possível excluir ${pub.id_referencia}: há ensaios ou dados ligados a ela. Exclua-os antes.` : err.message })
    }
  }

  async function abrirArquivo(arq: ArquivoPublicacao) {
    try {
      window.open(await obterUrlDownloadArquivo(arq.caminho), '_blank')
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: `Não consegui abrir "${arq.nome_original}": ${err.message}` })
    }
  }

  const pubsFiltradas = publicacoes.filter((p) => {
    const q = busca.toLowerCase()
    return (
      p.id_referencia.toLowerCase().includes(q) ||
      p.autor?.toLowerCase().includes(q) ||
      p.titulo?.toLowerCase().includes(q) ||
      p.periodico?.toLowerCase().includes(q) ||
      p.doi?.toLowerCase().includes(q)
    )
  })

  const tituloEixo = (chave: string) => LISTA_ANALISES.find((a) => a.chave === chave)?.titulo ?? chave
  const nomeProjeto = (id: string) => { const p = projetos.find((x) => x.id === id); return p ? p.codigo : 'projeto restrito' }
  const tipos = form.tipo && !TIPOS.includes(form.tipo) ? [form.tipo, ...TIPOS] : TIPOS

  // o aviso da página fica atrás do modal aberto: repete a mensagem dentro dele
  const avisoNoModal = feedback && (
    <Alert tipo={feedback.tipo} mensagem={feedback.msg} onClose={() => setFeedback(null)} />
  )

  return (
    <div className="space-y-6 animate-fade-in">
      {editor && (
        <div className="flex justify-end">
          <Button variant="primary" icon={<Plus size={16} />} onClick={abrirNovoForm}>
            Cadastrar Publicação
          </Button>
        </div>
      )}

      {feedback && !modalAberto && (
        <Alert
          tipo={feedback.tipo}
          mensagem={feedback.msg}
          onClose={() => setFeedback(null)}
        />
      )}

      {/* Barra de Busca */}
      <div className="cartao px-4 py-3 flex items-center gap-3">
        <Search size={16} className="text-[var(--color-neutral-600)] ml-2" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar por autor, título, DOI, periódicos ou id de referência..."
          className="w-full bg-transparent text-[14px] outline-none"
        />
      </div>

      {/* Lista de Publicações */}
      <Card
        titulo={`Publicações — ${categoriaAtiva === 'geral' ? 'Geral' : 'Própria LC PETRO'} (${pubsFiltradas.length})`}
        icone={<BookOpen size={18} />}
      >
        {loading ? (
          <p className="py-6 text-center text-[13px] text-[var(--color-neutral-500)]">Carregando acervo...</p>
        ) : pubsFiltradas.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--color-neutral-500)]">Nenhuma publicação encontrada.</p>
        ) : (
          <div className="divide-y divide-[var(--color-neutral-200)]">
            {pubsFiltradas.map((pub) => (
              <div key={pub.id_referencia} className="py-4 flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tag tag-orange">
                      {pub.id_referencia}
                    </span>
                    <span className="text-xs font-semibold text-[var(--color-neutral-700)]">
                      {pub.autor} ({pub.ano})
                    </span>
                    {pub.tipo && <Badge variant="blue">{pub.tipo}</Badge>}
                    {pub.projeto_id && (
                      <span className="tag tag-outline" title="Só quem tem acesso a este projeto vê a publicação">
                        <Lock size={10} /> {nomeProjeto(pub.projeto_id)}
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-semibold text-[var(--color-text)] leading-snug">
                    {pub.titulo || 'Sem título cadastrado'}
                  </h4>
                  {pub.periodico && (
                    <p className="text-xs text-[var(--color-neutral-600)] italic">
                      {pub.periodico} {pub.doi && `· DOI: ${pub.doi}`}
                    </p>
                  )}
                  {pub.resumo && (
                    <p className="text-xs text-[var(--color-neutral-500)] line-clamp-2 mt-1">
                      {pub.resumo}
                    </p>
                  )}
                  {((pub.eixos?.length ?? 0) > 0 || (pub.palavras_chave?.length ?? 0) > 0) && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {pub.eixos?.map((eixo) => (
                        <span key={`eixo-${eixo}`} className="tag tag-blue">{tituloEixo(eixo)}</span>
                      ))}
                      {pub.palavras_chave?.map((tag) => (
                        <span key={tag} className="tag tag-neutral">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5 self-start">
                  {(arquivos[pub.id_referencia] ?? []).map((arq) => (
                    <button key={arq.id} type="button" onClick={() => abrirArquivo(arq)} className="btn btn-secondary btn-sm" title={`Abrir ${arq.nome_original}`}>
                      <FileText size={13} /> PDF
                    </button>
                  ))}
                  {pub.doi && (
                    <a
                      href={`https://doi.org/${pub.doi}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-icone"
                      title="Abrir DOI"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                  {editor && (
                    <button type="button" onClick={() => abrirEdicao(pub)} className="btn-icone" title="Editar publicação">
                      <Pencil size={15} />
                    </button>
                  )}
                  {editor && (
                    <button type="button" onClick={() => handleExcluir(pub)} className="btn-icone" title="Excluir publicação">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal Cadastro / Edição de Publicação */}
      <Modal
        isOpen={modalAberto}
        onClose={() => setModalAberto(false)}
        titulo={editando ? `Editar publicação ${form.id_referencia}` : 'Cadastrar Publicação Científica'}
        subtitulo={propria ? 'Publicação própria do LC PETRO' : 'Literatura geral (artigo externo)'}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSalvar} className="space-y-4">
          {avisoNoModal}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Input
              label="ID de Referência"
              placeholder="Ex.: LCP-0001, REF-R01"
              value={form.id_referencia}
              onChange={(e) => setForm({ ...form, id_referencia: e.target.value.toUpperCase() })}
              disabled={editando}
              ajuda={editando ? 'O ID não muda depois de gravado.' : undefined}
              obrigatorio
              required
            />
            <Select label="Tipo" value={form.tipo ?? ''} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="">Não informado</option>
              {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Input
              label="Ano de Publicação"
              placeholder="Ex.: 2024"
              inputMode="numeric"
              value={form.ano || ''}
              onChange={(e) => setForm({ ...form, ano: e.target.value })}
            />
            <Input
              label="Identificador DOI"
              placeholder="Ex.: 10.2118/198273-PA"
              value={form.doi || ''}
              onChange={(e) => setForm({ ...form, doi: e.target.value })}
            />
          </div>

          <Input
            label="Autor(es)"
            placeholder="Ex.: Taylor et al., Costa, D."
            value={form.autor}
            onChange={(e) => setForm({ ...form, autor: e.target.value })}
            obrigatorio
            required
          />

          <Input
            label="Título do Trabalho"
            placeholder="Ex.: Reaction kinetics of calcite dissolution in emulsified acids"
            value={form.titulo || ''}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
          />

          <Input
            label="Periódico / Congresso / Veículo"
            placeholder="Ex.: SPE Journal, J. Pet. Sci. Eng."
            value={form.periodico || ''}
            onChange={(e) => setForm({ ...form, periodico: e.target.value })}
          />

          <div className="field">
            <span className="rotulo">Eixos (análises de que a publicação trata)</span>
            <div className="flex flex-wrap gap-2">
              {LISTA_ANALISES.map((a) => {
                const marcado = (form.eixos ?? []).includes(a.chave)
                return (
                  <button type="button" key={a.chave} onClick={() => alternarEixo(a.chave)} aria-pressed={marcado}
                    className={`tag cursor-pointer !py-1.5 ${marcado ? 'tag-orange' : 'tag-neutral'}`}>
                    {a.numero}. {a.titulo}
                  </button>
                )
              })}
            </div>
          </div>

          {propria && (
            <>
              <Select
                label="Restringir a um projeto"
                value={form.projeto_id || ''}
                onChange={(e) => { setForm({ ...form, projeto_id: e.target.value || null }); setAmostrasUsadas([]) }}
              >
                <option value="">Aberta (visível para todos os usuários do sistema)</option>
                {projetos.map((p) => (
                  <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>
                ))}
              </Select>

              <label className="field w-full">
                <span className="rotulo">Amostras usadas ({amostrasUsadas.length} escolhida(s))</span>
                <select multiple className="input h-36" value={amostrasUsadas}
                  onChange={(e) => setAmostrasUsadas(Array.from(e.target.selectedOptions).map((o) => o.value))}>
                  {amostrasDisponiveis.map((a) => <option key={a.id} value={a.id}>{a.codigo} — {a.litologia}</option>)}
                </select>
                <span className="ajuda">
                  Ctrl + clique para escolher várias. {form.projeto_id ? 'Lista: amostras do projeto escolhido.' : 'Lista: amostras da empresa aberta.'}
                </span>
              </label>
            </>
          )}

          <Input
            label="Palavras-Chave (separadas por ponto e vírgula)"
            placeholder="Ex.: RDA; Acidificação; Indiana Limestone; Calcita"
            value={palavrasChaveTexto}
            onChange={(e) => setPalavrasChaveTexto(e.target.value)}
          />

          <Textarea
            label="Resumo (Abstract)"
            placeholder="Resumo das conclusões, parâmetros analisados e objetivos..."
            value={form.resumo || ''}
            onChange={(e) => setForm({ ...form, resumo: e.target.value })}
          />

          <label className="field w-full">
            <span className="rotulo">PDF da publicação</span>
            <input type="file" accept="application/pdf,.pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
              className="input cursor-pointer file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-blue)] file:px-3 file:py-1 file:text-[12px] file:font-semibold file:text-white" />
            <span className="ajuda">
              Opcional. Vai para o Storage privado e fica disponível no botão "PDF" da lista e no dashboard.
              {editando && (arquivos[form.id_referencia]?.length ?? 0) > 0 && ` Já há ${arquivos[form.id_referencia].length} arquivo(s) nesta publicação; o novo é acrescentado.`}
            </span>
          </label>

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-neutral-300)]">
            <Button variant="secondary" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={salvando}>Gravar Publicação</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
