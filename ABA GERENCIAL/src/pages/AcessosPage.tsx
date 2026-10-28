import React, { useEffect, useMemo, useState } from 'react'
import { Check, Inbox, ShieldCheck, UserPlus, X } from 'lucide-react'
import { Alert, Badge, Button, Card, Input, Modal, Select } from '../components/UI'
import {
  decidirAcesso, listarEmpresas, listarMembros, listarPerfis, listarProjetos,
} from '../servicos/api'
import { convidarUsuario } from '../servicos/usuarios'
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
  const gerencial = useMemo(() => perfis
    .filter((p) => p.situacao !== 'pendente' && p.situacao !== 'recusado')
    .map((p) => ({ p, editorEm: membros.filter((m) => m.usuario_id === p.id && m.papel === 'editor') }))
    .filter(({ p, editorEm }) => p.administrador || editorEm.length > 0), [perfis, membros])
  const escopo = (m: Membro) => {
    const e = empresas.find((x) => x.id === m.empresa_id)
    const pr = projetos.find((x) => x.id === m.projeto_id)
    return e ? `Empresa ${e.sigla}` : pr ? `Projeto ${pr.codigo}` : '—'
  }

  async function recusar(p: Perfil) {
    if (!confirm(`Recusar o acesso de ${p.nome || p.email}? A conta continua existindo, mas não vê nada.`)) return
    try {
      await decidirAcesso({ usuarioId: p.id, aprovar: false })
      setAviso(`Acesso de ${p.email} recusado.`)
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
          <p className="m-0 mt-4 text-[12px] text-[var(--color-neutral-500)]">
            {recusados.length} pedido(s) recusado(s): {recusados.map((p) => p.email).join(', ')}.
          </p>
        )}
      </Card>

      {/* 2. usuários do painel gerencial */}
      <Card titulo="Usuários do painel gerencial" subtitulo="Administradores e editores: só eles entram neste painel"
        icone={<ShieldCheck size={18} />}
        acoes={<Button size="sm" variant="primary" icon={<UserPlus size={14} />} onClick={() => setCadastrando(true)}>Cadastrar usuário</Button>}>
        {carregando ? (
          <p className="m-0 py-4 text-center text-[13px] text-[var(--color-neutral-500)]">Carregando…</p>
        ) : gerencial.length === 0 ? (
          <p className="m-0 py-4 text-center text-[13px] text-[var(--color-neutral-500)]">Nenhum usuário com acesso ao painel gerencial.</p>
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="table text-[13px]">
              <thead><tr><th>Usuário</th><th>Nível</th><th>Onde edita</th><th>Situação</th></tr></thead>
              <tbody>
                {gerencial.map(({ p, editorEm }) => (
                  <tr key={p.id} className="lcp-row">
                    <td className="font-medium">
                      {p.nome || '—'}
                      <span className="block text-[11px] text-[var(--color-neutral-500)]">{p.email}</span>
                    </td>
                    <td>{p.administrador ? <Badge variant="red">Administrador</Badge> : <Badge variant="green">Editor</Badge>}</td>
                    <td className="text-[var(--color-neutral-700)]">{p.administrador ? 'Tudo' : editorEm.map(escopo).join(' · ')}</td>
                    <td>{p.ativo ? <Badge variant="blue">Ativo</Badge> : <Badge variant="slate">Desativado</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {aprovando && (
        <ModalAprovar perfil={aprovando} empresas={empresas} projetos={projetos} aoFechar={() => setAprovando(null)}
          aoAprovar={async (msg) => { setAprovando(null); setAviso(msg); await carregar() }} />
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
