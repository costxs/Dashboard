import { confirmar } from '../components/Confirmar'
import React, { useEffect, useMemo, useState } from 'react'
import { Check, Inbox, Pencil, Plus, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Alert, Badge, Button, Card, Input, Modal, Select } from '../components/UI'
import {
  adicionarMembro, alterarNivelPerfil, alterarPapelMembro, decidirAcesso, listarEmpresas, listarMembros,
  listarPerfis, listarProjetos, removerMembro,
} from '../servicos/api'
import { convidarUsuario, recusarUsuario } from '../servicos/usuarios'
import type { Empresa, Membro, Papel, Perfil, Projeto } from '../tipos/banco'
import { fmtData, mensagemErro } from '../utils/formatacao'

// Administração › Acessos
//   1. Pedidos de acesso: quem se registrou no dashboard de visualização fica pendente (não vê nada)
//      até o administrador aprovar, escolhendo a empresa ou o projeto e o papel, ou recusar.
//   2. Usuários do painel gerencial: administradores e editores. O cadastro manda um convite por
//      e-mail pelo backend (a conta só pode ser criada com a chave secreta, que fica lá).
// Quem decide de verdade é o banco (migração 020): só o administrador aprova; ninguém se aprova sozinho.

type Escopo = { tipo: 'empresa' | 'projeto'; id: string }

export const AcessosPage: React.FC = () => {
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [membros, setMembros] = useState<Membro[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [aprovando, setAprovando] = useState<Perfil | null>(null)
  const [cadastrando, setCadastrando] = useState(false)
  const [editando, setEditando] = useState<Perfil | null>(null)
  const { perfil: eu } = useAuth()

  async function carregar() {
    setCarregando(true)
    try {
      const [p, m, e, pr] = await Promise.all([listarPerfis(), listarMembros(), listarEmpresas(), listarProjetos()])
      setPerfis(p); setMembros(m); setEmpresas(e); setProjetos(pr)
      setErro(null)
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setCarregando(false)
    }
  }
  useEffect(() => { void carregar() }, [])

  const semMigracao = perfis.length > 0 && perfis.every((p) => p.situacao === undefined)
  const pendentes = perfis.filter((p) => p.situacao === 'pendente')
  const recusados = perfis.filter((p) => p.situacao === 'recusado')
  // todos os usuários já aprovados (administradores, editores e leitores), com os vínculos de cada um
  const cadastrados = useMemo(() => perfis
    .filter((p) => p.situacao !== 'pendente' && p.situacao !== 'recusado')
    .map((p) => ({ p, vinculos: membros.filter((m) => m.usuario_id === p.id) }))
    .sort((a, b) => Number(b.p.administrador) - Number(a.p.administrador)
      || Number(b.vinculos.some((m) => m.papel === 'editor')) - Number(a.vinculos.some((m) => m.papel === 'editor'))
      || (a.p.nome || a.p.email).localeCompare(b.p.nome || b.p.email)), [perfis, membros])
  const escopo = (m: Membro) => {
    const e = empresas.find((x) => x.id === m.empresa_id)
    const pr = projetos.find((x) => x.id === m.projeto_id)
    return e ? `Empresa ${e.sigla}` : pr ? `Projeto ${pr.codigo}` : '—'
  }

  async function recusar(p: Perfil) {
    if (!(await confirmar(`Recusar ${p.nome || p.email}? A conta será apagada do banco e não dá para desfazer; a pessoa poderá se cadastrar de novo com o mesmo e-mail.`))) return
    try {
      await recusarUsuario(p.id)
      setAviso(`Pedido de ${p.email} recusado e conta apagada: o e-mail pode ser cadastrado de novo.`)
      await carregar()
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }

  return (
    <div className="space-y-6">
      {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
      {aviso && <Alert tipo="sucesso" mensagem={aviso} onClose={() => setAviso(null)} />}
      {semMigracao && (
        <Alert tipo="info" mensagem="O banco ainda não tem o cadastro com aprovação: rode a migração 020 (depois da 019) no SQL Editor do Supabase." />
      )}

      {/* 1. pedidos de acesso */}
      <Card titulo="Pedidos de acesso" subtitulo="Pessoas que se registraram no dashboard de visualização e aguardam aprovação"
        icone={<Inbox size={18} />}
        acoes={pendentes.length > 0 && <Badge variant="amber">{pendentes.length} pendente(s)</Badge>}>
        {carregando ? (
          <p className="m-0 py-4 text-center text-[13px] text-[var(--color-neutral-500)]">Carregando…</p>
        ) : pendentes.length === 0 ? (
          <p className="m-0 py-4 text-center text-[13px] text-[var(--color-neutral-500)]">Nenhum pedido aguardando aprovação.</p>
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="table text-[13px]">
              <thead>
                <tr><th>Pessoa</th><th>Instituição</th><th>Motivo</th><th>Pedido em</th><th className="text-right !pr-0">Decisão</th></tr>
              </thead>
              <tbody>
                {pendentes.map((p) => (
                  <tr key={p.id} className="lcp-row">
                    <td className="font-medium">
                      {p.nome || '—'}
                      <span className="block text-[11px] text-[var(--color-neutral-500)]">{p.email}</span>
                    </td>
                    <td>{p.instituicao || '—'}</td>
                    <td className="max-w-[320px] text-[var(--color-neutral-700)]">{p.motivo || '—'}</td>
                    <td className="whitespace-nowrap tabular-nums">{fmtData(p.criado_em)}</td>
                    <td className="!pr-0">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="blue" icon={<Check size={14} />} onClick={() => setAprovando(p)}>Aprovar</Button>
                        <Button size="sm" variant="outline" icon={<X size={14} />} onClick={() => recusar(p)}>Recusar</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {recusados.length > 0 && (
          <div className="mt-4 flex flex-col gap-2 border-t border-[var(--color-neutral-200)] pt-3">
            <p className="m-0 text-[12px] text-[var(--color-neutral-500)]">
              Recusados antes desta mudança: a conta ainda ocupa o e-mail. Apague para a pessoa poder se cadastrar de novo.
            </p>
            {recusados.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0 break-all">{p.nome ? `${p.nome} · ` : ''}{p.email}</span>
                <Button size="sm" variant="outline" icon={<Trash2 size={13} />} onClick={() => recusar(p)}>Apagar conta</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 2. usuários cadastrados: nível e acessos editáveis */}
      <Card titulo="Usuários cadastrados" subtitulo="Administradores e editores entram neste painel; leitores só no dashboard. Use “Editar acesso” para mudar o nível."
        icone={<ShieldCheck size={18} />}
        acoes={<Button size="sm" variant="primary" icon={<UserPlus size={14} />} onClick={() => setCadastrando(true)}>Cadastrar usuário</Button>}>
        {carregando ? (
          <p className="m-0 py-4 text-center text-[13px] text-[var(--color-neutral-500)]">Carregando…</p>
        ) : cadastrados.length === 0 ? (
          <p className="m-0 py-4 text-center text-[13px] text-[var(--color-neutral-500)]">Nenhum usuário cadastrado.</p>
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="table text-[13px]">
              <thead><tr><th>Usuário</th><th>Nível</th><th>Acessos</th><th>Situação</th><th className="text-right !pr-0">Ações</th></tr></thead>
              <tbody>
                {cadastrados.map(({ p, vinculos }) => {
                  const editor = vinculos.some((m) => m.papel === 'editor')
                  return (
                    <tr key={p.id} className="lcp-row">
                      <td className="font-medium">
                        {p.nome || '—'}
                        <span className="block text-[11px] text-[var(--color-neutral-500)]">{p.email}</span>
                      </td>
                      <td>
                        {p.administrador ? <Badge variant="red">Administrador</Badge>
                          : editor ? <Badge variant="green">Editor</Badge>
                          : vinculos.length > 0 ? <Badge variant="blue">Leitor</Badge>
                          : <Badge variant="slate">Sem acesso</Badge>}
                      </td>
                      <td className="text-[var(--color-neutral-700)]">
                        {p.administrador ? 'Tudo' : vinculos.length === 0 ? '—'
                          : vinculos.map((m) => `${escopo(m)} (${m.papel})`).join(' · ')}
                      </td>
                      <td>{p.ativo ? <Badge variant="blue">Ativo</Badge> : <Badge variant="slate">Desativado</Badge>}</td>
                      <td className="!pr-0 text-right">
                        <Button size="sm" variant="outline" icon={<Pencil size={13} />} onClick={() => setEditando(p)}>Editar acesso</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {aprovando && (
        <ModalAprovar perfil={aprovando} empresas={empresas} projetos={projetos} aoFechar={() => setAprovando(null)}
          aoAprovar={async (msg) => { setAprovando(null); setAviso(msg); await carregar() }} />
      )}
      {editando && (
        <ModalEditarAcesso perfil={editando} eu={eu?.id ?? null} vinculos={membros.filter((m) => m.usuario_id === editando.id)}
          empresas={empresas} projetos={projetos} aoFechar={() => setEditando(null)}
          aoSalvar={async (msg) => { setEditando(null); setAviso(msg); await carregar() }} />
      )}
      {cadastrando && (
        <ModalCadastrar empresas={empresas} projetos={projetos} aoFechar={() => setCadastrando(false)}
          aoCadastrar={async (msg) => { setCadastrando(false); setAviso(msg); await carregar() }} />
      )}
    </div>
  )
}

/** Escolha de empresa OU projeto (o vínculo de acesso é sempre um dos dois). */
const CampoEscopo: React.FC<{
  empresas: Empresa[]; projetos: Projeto[]; valor: Escopo | null; aoMudar: (e: Escopo | null) => void; desabilitado?: boolean
}> = ({ empresas, projetos, valor, aoMudar, desabilitado }) => (
  <Select label="Acesso a" obrigatorio value={valor ? `${valor.tipo}:${valor.id}` : ''} disabled={desabilitado}
    onChange={(e) => {
      const [tipo, id] = e.target.value.split(':')
      aoMudar(id ? { tipo: tipo as Escopo['tipo'], id } : null)
    }}>
    <option value="">Escolha a empresa ou o projeto…</option>
    <optgroup label="Empresa inteira (todos os projetos dela)">
      {empresas.map((e) => <option key={e.id} value={`empresa:${e.id}`}>{e.sigla} · {e.nome}</option>)}
    </optgroup>
    <optgroup label="Um projeto">
      {projetos.filter((p) => p.ativo).map((p) => <option key={p.id} value={`projeto:${p.id}`}>{p.codigo} · {p.nome}</option>)}
    </optgroup>
  </Select>
)

/** Escolha de uma ou mais empresas/projetos (editor que atende várias empresas). */
const CampoEscopos: React.FC<{
  empresas: Empresa[]; projetos: Projeto[]; valor: Escopo[]; aoMudar: (e: Escopo[]) => void; desabilitado?: boolean
}> = ({ empresas, projetos, valor, aoMudar, desabilitado }) => {
  const marcado = (tipo: Escopo['tipo'], id: string) => valor.some((v) => v.tipo === tipo && v.id === id)
  const alternar = (tipo: Escopo['tipo'], id: string) =>
    aoMudar(marcado(tipo, id) ? valor.filter((v) => !(v.tipo === tipo && v.id === id)) : [...valor, { tipo, id }])
  const linha = (tipo: Escopo['tipo'], id: string, rotulo: string) => (
    <label key={`${tipo}:${id}`} className="flex cursor-pointer items-center gap-2 text-[13px]">
      <input type="checkbox" checked={marcado(tipo, id)} disabled={desabilitado} onChange={() => alternar(tipo, id)} />
      {rotulo}
    </label>
  )
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium">Acesso a * <span className="font-normal text-[var(--color-neutral-500)]">(marque uma ou mais)</span></span>
      <div className="max-h-[240px] overflow-y-auto rounded border border-[var(--color-neutral-200)] p-3 flex flex-col gap-1.5">
        <span className="text-[11px] uppercase text-[var(--color-neutral-500)]">Empresa inteira (todos os projetos dela)</span>
        {empresas.map((e) => linha('empresa', e.id, `${e.sigla} · ${e.nome}`))}
        <span className="mt-2 text-[11px] uppercase text-[var(--color-neutral-500)]">Projeto específico</span>
        {projetos.filter((p) => p.ativo).map((p) => linha('projeto', p.id, `${p.codigo} · ${p.nome}`))}
      </div>
    </div>
  )
}

const ModalAprovar: React.FC<{
  perfil: Perfil; empresas: Empresa[]; projetos: Projeto[]; aoFechar: () => void; aoAprovar: (msg: string) => void
}> = ({ perfil, empresas, projetos, aoFechar, aoAprovar }) => {
  const [escopo, setEscopo] = useState<Escopo | null>(null)
  const [papel, setPapel] = useState<Papel>('leitor')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function aprovar() {
    if (!escopo) return
    setSalvando(true); setErro(null)
    try {
      await decidirAcesso({
        usuarioId: perfil.id, aprovar: true, papel,
        empresaId: escopo.tipo === 'empresa' ? escopo.id : null, projetoId: escopo.tipo === 'projeto' ? escopo.id : null,
      })
      aoAprovar(`Acesso de ${perfil.email} aprovado.`)
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal isOpen onClose={aoFechar} titulo="Aprovar acesso" subtitulo={`${perfil.nome || ''} · ${perfil.email}`}>
      <div className="flex flex-col gap-4">
        {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
        <CampoEscopo empresas={empresas} projetos={projetos} valor={escopo} aoMudar={setEscopo} desabilitado={salvando} />
        <Select label="Papel" value={papel} disabled={salvando} onChange={(e) => setPapel(e.target.value as Papel)}>
          <option value="leitor">Leitor: só visualiza</option>
          <option value="editor">Editor: também lança dados e entra no painel gerencial</option>
        </Select>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={aoFechar} disabled={salvando}>Cancelar</Button>
          <Button variant="blue" icon={<Check size={14} />} onClick={aprovar} loading={salvando} disabled={!escopo}>Aprovar</Button>
        </div>
      </div>
    </Modal>
  )
}

const ModalCadastrar: React.FC<{
  empresas: Empresa[]; projetos: Projeto[]; aoFechar: () => void; aoCadastrar: (msg: string) => void
}> = ({ empresas, projetos, aoFechar, aoCadastrar }) => {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [nivel, setNivel] = useState<'admin' | 'editor'>('editor')
  const [escopos, setEscopos] = useState<Escopo[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const falta = !nome.trim() ? 'Informe o nome.' : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) ? 'Informe um e-mail válido.'
    : nivel === 'editor' && escopos.length === 0 ? 'Escolha onde a pessoa vai editar.' : null

  async function cadastrar() {
    if (falta) return
    setSalvando(true); setErro(null)
    try {
      const r = await convidarUsuario({
        nome: nome.trim(), email: email.trim(), nivel,
        escopos: nivel === 'editor'
          ? escopos.map((e) => ({ empresa_id: e.tipo === 'empresa' ? e.id : null, projeto_id: e.tipo === 'projeto' ? e.id : null }))
          : [],
      })
      aoCadastrar(`Convite enviado para ${r.email}: a pessoa recebe um e-mail para definir a senha.`)
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal isOpen onClose={aoFechar} titulo="Cadastrar usuário do painel gerencial"
      subtitulo="A pessoa recebe um e-mail do Supabase para definir a senha">
      <div className="flex flex-col gap-4">
        {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Nome" obrigatorio value={nome} disabled={salvando} onChange={(e) => setNome(e.target.value)} />
          <Input label="E-mail" obrigatorio type="email" value={email} disabled={salvando} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Select label="Nível" value={nivel} disabled={salvando} onChange={(e) => setNivel(e.target.value as 'admin' | 'editor')}>
          <option value="editor">Editor: lança dados (inclusive tratamento de coreflood) nas empresas/projetos escolhidos</option>
          <option value="admin">Administrador: tudo, inclusive aprovar acessos</option>
        </Select>
        {nivel === 'editor' && (
          <CampoEscopos empresas={empresas} projetos={projetos} valor={escopos} aoMudar={setEscopos} desabilitado={salvando} />
        )}
        <div className="flex items-center justify-end gap-3">
          {falta && <span className="mr-auto text-[12px] text-[var(--color-neutral-600)]">{falta}</span>}
          <Button variant="secondary" onClick={aoFechar} disabled={salvando}>Cancelar</Button>
          <Button variant="primary" icon={<UserPlus size={14} />} onClick={cadastrar} loading={salvando} disabled={falta != null}>
            Enviar convite
          </Button>
        </div>
      </div>
    </Modal>
  )
}

type VinculoForm = { id?: number; escopo: Escopo; papel: Papel }

/**
 * Edita o acesso de um usuário já cadastrado: nível geral (administrador ou não), conta ativa e
 * cada vínculo com empresa/projeto (papel leitor/editor, incluir, remover). Só administrador
 * (o banco recusa os demais). O próprio administrador não pode tirar o seu nível nem se desativar.
 */
const ModalEditarAcesso: React.FC<{
  perfil: Perfil; eu: string | null; vinculos: Membro[]; empresas: Empresa[]; projetos: Projeto[]
  aoFechar: () => void; aoSalvar: (msg: string) => void
}> = ({ perfil, eu, vinculos, empresas, projetos, aoFechar, aoSalvar }) => {
  const souEu = perfil.id === eu
  const [admin, setAdmin] = useState(perfil.administrador)
  const [ativo, setAtivo] = useState(perfil.ativo)
  const [lista, setLista] = useState<VinculoForm[]>(() => vinculos.map((m) => ({
    id: m.id, papel: m.papel as Papel,
    escopo: m.empresa_id ? { tipo: 'empresa', id: m.empresa_id } : { tipo: 'projeto', id: m.projeto_id as string },
  })))
  const [novoEscopo, setNovoEscopo] = useState<Escopo | null>(null)
  const [novoPapel, setNovoPapel] = useState<Papel>('editor')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const rotulo = (e: Escopo) => {
    if (e.tipo === 'empresa') { const x = empresas.find((y) => y.id === e.id); return x ? `Empresa ${x.sigla} · ${x.nome}` : 'Empresa removida' }
    const x = projetos.find((y) => y.id === e.id); return x ? `Projeto ${x.codigo} · ${x.nome}` : 'Projeto removido'
  }
  const mesmo = (a: Escopo, b: Escopo) => a.tipo === b.tipo && a.id === b.id

  function incluir() {
    if (!novoEscopo) return
    if (lista.some((v) => mesmo(v.escopo, novoEscopo))) { setErro('Esse acesso já está na lista: mude o papel dele.'); return }
    setLista([...lista, { escopo: novoEscopo, papel: novoPapel }])
    setNovoEscopo(null)
    setErro(null)
  }

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      // 1. nível geral (o próprio administrador não muda o seu)
      if (!souEu && (admin !== perfil.administrador || ativo !== perfil.ativo)) {
        await alterarNivelPerfil(perfil.id, { administrador: admin, ativo })
      }
      // 2. vínculos removidos, papéis trocados e vínculos novos
      for (const m of vinculos) {
        if (!lista.some((v) => v.id === m.id)) await removerMembro(m.id)
      }
      for (const v of lista) {
        const antigo = vinculos.find((m) => m.id === v.id)
        if (antigo && antigo.papel !== v.papel) await alterarPapelMembro(antigo.id, v.papel as 'leitor' | 'editor')
        if (!v.id) {
          await adicionarMembro({
            usuario_id: perfil.id, papel: v.papel,
            empresa_id: v.escopo.tipo === 'empresa' ? v.escopo.id : null,
            projeto_id: v.escopo.tipo === 'projeto' ? v.escopo.id : null,
          } as Parameters<typeof adicionarMembro>[0])
        }
      }
      aoSalvar(`Acesso de ${perfil.nome || perfil.email} atualizado.`)
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal isOpen onClose={aoFechar} titulo="Editar acesso" subtitulo={`${perfil.nome || ''} · ${perfil.email}`} maxWidth="max-w-2xl">
      <div className="flex flex-col gap-4">
        {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Nível geral" value={admin ? 'admin' : 'vinculos'} disabled={salvando || souEu}
            onChange={(e) => setAdmin(e.target.value === 'admin')}>
            <option value="vinculos">Pelos acessos abaixo (leitor ou editor)</option>
            <option value="admin">Administrador: tudo, inclusive aprovar acessos</option>
          </Select>
          <Select label="Conta" value={ativo ? 'ativa' : 'desativada'} disabled={salvando || souEu}
            onChange={(e) => setAtivo(e.target.value === 'ativa')}>
            <option value="ativa">Ativa</option>
            <option value="desativada">Desativada (não vê nada)</option>
          </Select>
        </div>
        {souEu && (
          <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">
            Este é o seu usuário: você não pode tirar o seu próprio nível de administrador nem se desativar.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <span className="rotulo">Acessos por empresa / projeto{admin ? ' (o administrador já vê tudo; os acessos ficam guardados)' : ''}</span>
          {lista.length === 0 ? (
            <p className="m-0 text-[13px] text-[var(--color-neutral-500)]">Nenhum acesso. Sem acesso e sem ser administrador, a pessoa não vê nada.</p>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--color-neutral-200)] rounded-[10px] border border-[var(--color-neutral-300)]">
              {lista.map((v, i) => (
                <div key={v.id ?? `novo-${i}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 text-[13px]">{rotulo(v.escopo)}{!v.id && <span className="ml-1.5 tag tag-orange">novo</span>}</span>
                  <select className="input !w-auto !py-1 text-[13px]" value={v.papel} disabled={salvando}
                    onChange={(e) => setLista(lista.map((x, j) => (j === i ? { ...x, papel: e.target.value as Papel } : x)))}>
                    <option value="leitor">Leitor</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button type="button" className="btn-icone perigo" title="Remover este acesso" disabled={salvando}
                    onClick={() => setLista(lista.filter((_, j) => j !== i))}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] items-end gap-2 rounded-[10px] bg-[var(--color-neutral-50)] p-3">
            <CampoEscopo empresas={empresas} projetos={projetos} valor={novoEscopo} aoMudar={setNovoEscopo} desabilitado={salvando} />
            <Select label="Papel" value={novoPapel} disabled={salvando} onChange={(e) => setNovoPapel(e.target.value as Papel)}>
              <option value="leitor">Leitor</option>
              <option value="editor">Editor</option>
            </Select>
            <Button variant="outline" icon={<Plus size={14} />} onClick={incluir} disabled={!novoEscopo || salvando}>Incluir</Button>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-[var(--color-neutral-300)]">
          <Button variant="secondary" onClick={aoFechar} disabled={salvando}>Cancelar</Button>
          <Button variant="primary" icon={<Check size={14} />} onClick={salvar} loading={salvando}>Salvar acesso</Button>
        </div>
      </div>
    </Modal>
  )
}
