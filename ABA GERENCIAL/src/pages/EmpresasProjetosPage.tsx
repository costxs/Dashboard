import { confirmar } from '../components/Confirmar'
import React, { useEffect, useState } from 'react'
import { Building2, FolderKanban, Plus, UserPlus, Trash2, ShieldCheck, Users, Pencil, ImagePlus, X } from 'lucide-react'
import { LogoEmpresa } from '../components/LogoEmpresa'
import { useContexto } from '../store/useContexto'
import { Card, Button, Input, Select, Modal, Alert, Badge , SeloContexto } from '../components/UI'
import {
  listarEmpresas, criarEmpresa, atualizarEmpresa, excluirEmpresa, enviarLogoEmpresa, apagarLogoEmpresa,
  listarProjetos, criarProjeto, atualizarProjeto,
  listarMembros, adicionarMembro, removerMembro,
  listarPerfis
} from '../servicos/api'
import type { Empresa, Projeto, Perfil, Membro } from '../tipos/banco'

/** secao: 'empresas' mostra empresas e projetos; 'acessos' mostra membros e permissões; sem secao, mostra tudo. */
export const EmpresasProjetosPage: React.FC<{ embutida?: boolean; secao?: 'empresas' | 'acessos' }> = ({ embutida, secao }) => {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [membros, setMembros] = useState<Membro[]>([])
  const [loading, setLoading] = useState(true)

  // Modais
  const [modalEmpresa, setModalEmpresa] = useState(false)
  const [modalProjeto, setModalProjeto] = useState(false)
  const [modalMembro, setModalMembro] = useState(false)

  // Formulários
  const [formEmpresa, setFormEmpresa] = useState({ sigla: '', nome: '' })
  // empresa em edição (null = nova); foto escolhida e prévia; removerFoto = tirar a foto atual
  const [empresaEditada, setEmpresaEditada] = useState<Empresa | null>(null)
  const [fotoEmpresa, setFotoEmpresa] = useState<File | null>(null)
  const [previaFoto, setPreviaFoto] = useState<string | null>(null)
  const [removerFoto, setRemoverFoto] = useState(false)
  const empresaAtualId = useContexto((st) => st.empresaId)
  const limparContexto = useContexto((st) => st.limpar)
  const escolherEmpresa = useContexto((st) => st.escolherEmpresa)

  useEffect(() => () => { if (previaFoto) URL.revokeObjectURL(previaFoto) }, [previaFoto])

  function abrirEmpresa(emp: Empresa | null) {
    setEmpresaEditada(emp)
    setFormEmpresa({ sigla: emp?.sigla ?? '', nome: emp?.nome ?? '' })
    setFotoEmpresa(null)
    setPreviaFoto(null)
    setRemoverFoto(false)
    setFeedback(null)
    setModalEmpresa(true)
  }

  function escolherFoto(arquivo: File | null) {
    setFotoEmpresa(arquivo)
    setRemoverFoto(false)
    setPreviaFoto(arquivo ? URL.createObjectURL(arquivo) : null)
  }

  async function handleExcluirEmpresa(emp: Empresa) {
    const nProj = projetos.filter((p) => p.empresa_id === emp.id).length
    const ok = await confirmar(
      `Excluir a empresa ${emp.sigla} (${emp.nome})?${nProj > 0 ? ` Os ${nProj} projeto(s) dela também serão excluídos, se não tiverem amostras.` : ''} As permissões de acesso ligadas a ela saem junto. Não dá para desfazer.`,
    )
    if (!ok) return
    try {
      await excluirEmpresa(emp)
      if (empresaAtualId === emp.id) limparContexto()
      setFeedback({ tipo: 'sucesso', msg: `Empresa ${emp.sigla} excluída.` })
      await carregar()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    }
  }
  const [formProjeto, setFormProjeto] = useState({ empresa_id: '', codigo: '', nome: '', descricao: '' })
  const [formMembro, setFormMembro] = useState({ usuario_id: '', papel: 'editor' as 'leitor' | 'editor', empresa_id: '', projeto_id: '' })

  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    setLoading(true)
    try {
      const [e, p, pf, m] = await Promise.all([
        listarEmpresas(),
        listarProjetos(),
        listarPerfis(),
        listarMembros()
      ])
      setEmpresas(e)
      setProjetos(p)
      setPerfis(pf)
      setMembros(m)
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  async function handleSalvarEmpresa(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      const sigla = formEmpresa.sigla.trim().toUpperCase()
      const dados: { sigla: string; nome: string; logo_url?: string | null } = { sigla, nome: formEmpresa.nome.trim() }
      const fotoAntiga = empresaEditada?.logo_url ?? null
      if (fotoEmpresa) dados.logo_url = await enviarLogoEmpresa(fotoEmpresa, sigla)
      else if (removerFoto) dados.logo_url = null
      const salva = empresaEditada ? await atualizarEmpresa(empresaEditada.id, dados) : await criarEmpresa(dados)
      // a foto antiga sai do storage quando foi trocada ou removida
      if (fotoAntiga && (fotoEmpresa || removerFoto)) await apagarLogoEmpresa(fotoAntiga).catch(() => undefined)
      // empresa aberta no menu: atualiza sigla/nome/foto sem precisar escolher de novo
      if (empresaAtualId === salva.id) escolherEmpresa({ id: salva.id, sigla: salva.sigla, nome: salva.nome, logo_url: salva.logo_url })
      setFeedback({ tipo: 'sucesso', msg: empresaEditada ? `Empresa ${salva.sigla} atualizada.` : 'Empresa cadastrada com sucesso!' })
      setModalEmpresa(false)
      setFormEmpresa({ sigla: '', nome: '' })
      escolherFoto(null)
      await carregar()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setSalvando(false)
    }
  }

  async function handleSalvarProjeto(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      await criarProjeto({
        empresa_id: formProjeto.empresa_id,
        codigo: formProjeto.codigo.trim().toUpperCase(),
        nome: formProjeto.nome.trim(),
        descricao: formProjeto.descricao.trim() || null
      })
      setFeedback({ tipo: 'sucesso', msg: 'Projeto cadastrado com sucesso!' })
      setModalProjeto(false)
      setFormProjeto({ empresa_id: '', codigo: '', nome: '', descricao: '' })
      await carregar()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setSalvando(false)
    }
  }

  async function handleAlternarProjeto(proj: Projeto) {
    const ativar = !proj.ativo
    if (!ativar && !(await confirmar(`Desativar o projeto ${proj.codigo}? Ele sai das listas de escolha; amostras e ensaios continuam no banco.`))) return
    try {
      await atualizarProjeto(proj.id, { ativo: ativar })
      setFeedback({ tipo: 'sucesso', msg: `Projeto ${proj.codigo} ${ativar ? 'ativado' : 'desativado'}.` })
      await carregar()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    }
  }

  async function handleSalvarMembro(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      await adicionarMembro({
        usuario_id: formMembro.usuario_id,
        papel: formMembro.papel,
        empresa_id: formMembro.empresa_id || null,
        projeto_id: formMembro.projeto_id || null
      })
      setFeedback({ tipo: 'sucesso', msg: 'Membro vinculado com sucesso!' })
      setModalMembro(false)
      setFormMembro({ usuario_id: '', papel: 'editor', empresa_id: '', projeto_id: '' })
      await carregar()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setSalvando(false)
    }
  }

  async function handleRemoverMembro(id: number) {
    if (!(await confirmar('Deseja realmente remover esta permissão?'))) return
    try {
      await removerMembro(id)
      setFeedback({ tipo: 'sucesso', msg: 'Permissão removida.' })
      await carregar()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
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
          <h1 className="mt-3 text-[27px] leading-[1.2] text-[var(--color-blue-800)]">Empresas, Projetos & Acessos</h1>
          <p className="mt-2 text-[13px] text-[var(--color-neutral-700)]">
            Organização em dois níveis: Empresa e Projeto com controle de permissão por usuário
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" icon={<Building2 size={16} />} onClick={() => abrirEmpresa(null)}>
            Nova Empresa
          </Button>
          <Button variant="primary" icon={<FolderKanban size={16} />} onClick={() => setModalProjeto(true)}>
            Novo Projeto
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

      {/* Grid: Empresas e Projetos */}
      {secao !== 'acessos' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lista de Empresas */}
        <Card
          titulo="Empresas Parceiras"
          subtitulo="Operadoras e instituições de fomento"
          icone={<Building2 size={18} />}
          acoes={
            <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => abrirEmpresa(null)}>
              Adicionar
            </Button>
          }
        >
          {empresas.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-[var(--color-neutral-500)]">Nenhuma empresa cadastrada.</p>
          ) : (
            <div className="divide-y divide-[var(--color-neutral-200)]">
              {empresas.map((emp) => (
                <div key={emp.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <LogoEmpresa sigla={emp.sigla} nome={emp.nome} url={emp.logo_url} tamanho={40} />
                    <div className="min-w-0">
                      <span className="tag tag-solid">{emp.sigla}</span>
                      <p className="m-0 mt-0.5 text-sm font-semibold text-[var(--color-text)] truncate">{emp.nome}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--color-neutral-500)] tabular-nums mr-1">
                      {projetos.filter((p) => p.empresa_id === emp.id).length} projetos
                    </span>
                    <button type="button" className="btn-icone" title="Editar empresa e foto" onClick={() => abrirEmpresa(emp)}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="btn-icone perigo" title="Excluir empresa" onClick={() => void handleExcluirEmpresa(emp)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Lista de Projetos */}
        <Card
          titulo="Projetos Cadastrados"
          subtitulo="Contratos de pesquisa e estudos experimentais"
          icone={<FolderKanban size={18} />}
          acoes={
            <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => setModalProjeto(true)}>
              Adicionar
            </Button>
          }
        >
          {projetos.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-[var(--color-neutral-500)]">Nenhum projeto cadastrado.</p>
          ) : (
            <div className="divide-y divide-[var(--color-neutral-200)]">
              {projetos.map((proj) => {
                const emp = empresas.find((e) => e.id === proj.empresa_id)
                return (
                  <div key={proj.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="codigo text-[13px]">
                          {proj.codigo}
                        </span>
                        <span className="text-sm font-medium text-[var(--color-text)]">{proj.nome}</span>
                      </div>
                      {emp && (
                        <p className="text-[11px] text-[var(--color-neutral-600)] mt-0.5">
                          Empresa: {emp.nome} ({emp.sigla})
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={proj.ativo ? 'green' : 'slate'}>
                        {proj.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Button size="sm" variant="outline" onClick={() => handleAlternarProjeto(proj)}>
                        {proj.ativo ? 'Desativar' : 'Ativar'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
      )}

      {/* Seção de Membros e Acessos */}
      {secao !== 'empresas' && (
      <Card
        titulo="Vínculos de acesso"
        subtitulo="Quem pode ler ou editar cada empresa ou projeto"
        icone={<Users size={18} />}
        acoes={
          <Button size="sm" variant="primary" icon={<UserPlus size={14} />} onClick={() => setModalMembro(true)}>
            Vincular Membro
          </Button>
        }
      >
        {membros.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-[var(--color-neutral-500)]">Nenhum vínculo cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table text-[13px]">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Escopo do Acesso</th>
                  <th>Papel</th>
                  <th className="text-right !pr-0">Ação</th>
                </tr>
              </thead>
              <tbody>
                {membros.map((m) => {
                  const emp = empresas.find((e) => e.id === m.empresa_id)
                  const proj = projetos.find((p) => p.id === m.projeto_id)
                  return (
                    <tr key={m.id} className="lcp-row">
                      <td className="font-medium text-[var(--color-text)]">
                        {m.nome || m.email || '—'}
                        <span className="block text-[10px] text-[var(--color-neutral-500)] tabular-nums">{m.email}</span>
                      </td>
                      <td className="text-[var(--color-neutral-700)]">
                        {emp && (
                          <span className="inline-flex items-center gap-1 tabular-nums text-[11px] text-[var(--color-blue)]">
                            Empresa: {emp.sigla}
                          </span>
                        )}
                        {proj && (
                          <span className="inline-flex items-center gap-1 tabular-nums text-[11px] text-[var(--color-orange-700)]">
                            Projeto: {proj.codigo}
                          </span>
                        )}
                      </td>
                      <td>
                        <Badge variant={m.papel === 'editor' ? 'green' : 'blue'}>
                          {m.papel}
                        </Badge>
                      </td>
                      <td className="text-right !pr-0">
                        <button
                          onClick={() => handleRemoverMembro(m.id)}
                          className="btn-icone perigo"
                          title="Remover acesso"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      )}

      {/* Modal Nova Empresa */}
      <Modal
        isOpen={modalEmpresa}
        onClose={() => setModalEmpresa(false)}
        titulo={empresaEditada ? `Editar ${empresaEditada.sigla}` : 'Cadastrar Nova Empresa'}
        subtitulo="Identificação da operadora ou instituição"
      >
        <form onSubmit={handleSalvarEmpresa} className="space-y-4">
          {avisoNoModal}
          {/* Foto / logo da empresa (028) */}
          <div className="flex flex-wrap items-center gap-4 rounded-[10px] border border-[var(--color-neutral-300)] bg-[var(--color-neutral-50)] p-4">
            <div className="rounded-xl bg-white p-2 border border-[var(--color-neutral-200)]">
              <LogoEmpresa
                sigla={formEmpresa.sigla}
                nome={formEmpresa.nome}
                url={previaFoto ?? (removerFoto ? null : empresaEditada?.logo_url)}
                tamanho={72}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="rotulo">Foto / logo da empresa</span>
              <div className="flex flex-wrap gap-2">
                <label className="btn btn-secondary btn-sm cursor-pointer">
                  <ImagePlus size={14} /> {previaFoto || empresaEditada?.logo_url ? 'Trocar foto' : 'Escolher foto'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => { escolherFoto(e.target.files?.[0] ?? null); e.target.value = '' }}
                  />
                </label>
                {(previaFoto || (empresaEditada?.logo_url && !removerFoto)) && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => { escolherFoto(null); setRemoverFoto(Boolean(empresaEditada?.logo_url)) }}
                  >
                    <X size={14} /> Tirar foto
                  </button>
                )}
              </div>
              <span className="text-[11px] text-[var(--color-neutral-500)]">PNG, JPG, WEBP ou SVG até 2 MB. Sem foto, aparecem as iniciais.</span>
            </div>
          </div>
          <Input
            label="Sigla da Empresa"
            placeholder="Ex.: TOTAL, PETROBRAS, EQUINOR, UFPA"
            value={formEmpresa.sigla}
            onChange={(e) => setFormEmpresa({ ...formEmpresa, sigla: e.target.value })}
            obrigatorio
          />
          <Input
            label="Razão Social / Nome Completo"
            placeholder="Ex.: TotalEnergies E&P Brasil"
            value={formEmpresa.nome}
            onChange={(e) => setFormEmpresa({ ...formEmpresa, nome: e.target.value })}
            obrigatorio
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-neutral-300)]">
            <Button variant="secondary" onClick={() => setModalEmpresa(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={salvando}>{empresaEditada ? 'Salvar alterações' : 'Salvar Empresa'}</Button>
          </div>
        </form>
      </Modal>

      {/* Modal Novo Projeto */}
      <Modal
        isOpen={modalProjeto}
        onClose={() => setModalProjeto(false)}
        titulo="Cadastrar Novo Projeto"
        subtitulo="Vincule um projeto de pesquisa à empresa correspondente"
      >
        <form onSubmit={handleSalvarProjeto} className="space-y-4">
          {avisoNoModal}
          <Select
            label="Empresa Responsável"
            value={formProjeto.empresa_id}
            onChange={(e) => setFormProjeto({ ...formProjeto, empresa_id: e.target.value })}
            obrigatorio
          >
            <option value="">Selecione uma empresa...</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>{e.nome} ({e.sigla})</option>
            ))}
          </Select>
          <Input
            label="Código do Projeto"
            placeholder="Ex.: TOTAL-ACID-2026"
            value={formProjeto.codigo}
            onChange={(e) => setFormProjeto({ ...formProjeto, codigo: e.target.value })}
            obrigatorio
          />
          <Input
            label="Nome do Projeto"
            placeholder="Ex.: Acidificação de Carbonatos — Pré-Sal"
            value={formProjeto.nome}
            onChange={(e) => setFormProjeto({ ...formProjeto, nome: e.target.value })}
            obrigatorio
          />
          <Input
            label="Descrição / Escopo (Opcional)"
            placeholder="Resumo dos objetivos do contrato de P&D"
            value={formProjeto.descricao}
            onChange={(e) => setFormProjeto({ ...formProjeto, descricao: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-neutral-300)]">
            <Button variant="secondary" onClick={() => setModalProjeto(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={salvando}>Salvar Projeto</Button>
          </div>
        </form>
      </Modal>

      {/* Modal Novo Membro */}
      <Modal
        isOpen={modalMembro}
        onClose={() => setModalMembro(false)}
        titulo="Vincular Membro e Acesso"
        subtitulo="Conceda permissão a um usuário em nível de empresa ou projeto"
      >
        <form onSubmit={handleSalvarMembro} className="space-y-4">
          {avisoNoModal}
          <Select
            label="Usuário (Perfil Cadastrado)"
            value={formMembro.usuario_id}
            onChange={(e) => setFormMembro({ ...formMembro, usuario_id: e.target.value })}
            obrigatorio
          >
            <option value="">Selecione o usuário...</option>
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome || p.email} ({p.email}) {p.administrador ? '· [Admin]' : ''}
              </option>
            ))}
          </Select>

          <Select
            label="Nível de Permissão (Papel)"
            value={formMembro.papel}
            onChange={(e) => setFormMembro({ ...formMembro, papel: e.target.value as any })}
            obrigatorio
          >
            <option value="editor">Editor (pode cadastrar e alterar dados)</option>
            <option value="leitor">Leitor (apenas visualização)</option>
          </Select>

          <Select
            label="Empresa (vê todos os projetos dela)"
            value={formMembro.empresa_id}
            onChange={(e) => setFormMembro({ ...formMembro, empresa_id: e.target.value, projeto_id: '' })}
          >
            <option value="">Nenhuma (vincular a projeto específico)</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>{e.nome} ({e.sigla})</option>
            ))}
          </Select>

          {!formMembro.empresa_id && (
            <Select
              label="Projeto Específico"
              value={formMembro.projeto_id}
              onChange={(e) => setFormMembro({ ...formMembro, projeto_id: e.target.value })}
            >
              <option value="">Selecione um projeto...</option>
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>
              ))}
            </Select>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-neutral-300)]">
            <Button variant="secondary" onClick={() => setModalMembro(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={salvando}>Conceder Acesso</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
