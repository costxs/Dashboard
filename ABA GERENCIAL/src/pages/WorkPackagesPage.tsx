import React, { useEffect, useState } from 'react'
import { ListChecks, Pencil, Plus, Trash2 } from 'lucide-react'
import { Alert, Button, CabecalhoPagina, Card, Input, Modal, Select, Vazio } from '../components/UI'
import { usePapeis } from '../hooks/usePapel'
import { apagarWorkPackage, listarProjetos, listarWorkPackages, salvarWorkPackage } from '../servicos/api'
import { useContexto } from '../store/useContexto'
import type { Projeto, WorkPackage } from '../tipos/banco'
import { fmt, fmtData, numeroParaInput, paraNumero } from '../utils/formatacao'

interface FormWp {
  id?: number
  projeto_id: string
  codigo: string
  nome: string
  inicio: string
  fim: string
  progresso_planejado: string
  progresso_realizado: string
}

/** Barra de progresso: planejado em azul claro, realizado em azul. Um único eixo (0 a 100 %). */
const Progresso: React.FC<{ planejado: number | null | undefined; realizado: number | null | undefined }> = ({ planejado, realizado }) => (
  <div className="min-w-[160px]">
    <div className="relative h-2 rounded-full bg-[var(--color-neutral-200)] overflow-hidden"
      title={`Planejado ${fmt(planejado, 0)} % · Realizado ${fmt(realizado, 0)} %`}>
      <div className="absolute inset-y-0 left-0 bg-[var(--color-blue-200)]" style={{ width: `${Math.min(100, planejado ?? 0)}%` }} />
      <div className="absolute inset-y-0 left-0 bg-[var(--color-blue)]" style={{ width: `${Math.min(100, realizado ?? 0)}%` }} />
    </div>
  </div>
)

// Work packages (pacotes de trabalho contratuais) do projeto aberto: planejado × realizado.
export const WorkPackagesPage: React.FC = () => {
  const empresaId = useContexto((s) => s.empresaId)
  const projetoId = useContexto((s) => s.projetoId)

  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [wps, setWps] = useState<WorkPackage[]>([])
  const [carregando, setCarregando] = useState(true)
  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState<FormWp | null>(null)

  const projetosDoContexto = projetoId ? projetos.filter((p) => p.id === projetoId) : projetos
  const papeis = usePapeis(projetosDoContexto.map((p) => p.id))
  const projetosEditaveis = projetosDoContexto.filter((p) => papeis[p.id] === 'editor')

  async function carregar() {
    setCarregando(true)
    try {
      const projs = await listarProjetos(empresaId)
      setProjetos(projs)
      setWps(await listarWorkPackages(projetoId ? [projetoId] : projs.map((p) => p.id)))
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [empresaId, projetoId])

  function abrirNovo() {
    setFeedback(null)
    setForm({
      projeto_id: projetoId ?? (projetosEditaveis.length === 1 ? projetosEditaveis[0].id : ''),
      codigo: '', nome: '', inicio: '', fim: '', progresso_planejado: '', progresso_realizado: '',
    })
  }

  function abrirEdicao(wp: WorkPackage) {
    setFeedback(null)
    setForm({
      id: wp.id,
      projeto_id: wp.projeto_id,
      codigo: wp.codigo,
      nome: wp.nome,
      inicio: wp.inicio ?? '',
      fim: wp.fim ?? '',
      progresso_planejado: numeroParaInput(wp.progresso_planejado),
      progresso_realizado: numeroParaInput(wp.progresso_realizado),
    })
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setSalvando(true)
    try {
      const numero = (texto: string, rotulo: string) => {
        const n = paraNumero(texto)
        if (Number.isNaN(n)) throw new Error(`Campo "${rotulo}": "${texto}" não é um número. Use, por exemplo, 35 ou 35,5.`)
        return n
      }
      const gravado = await salvarWorkPackage({
        id: form.id,
        projeto_id: form.projeto_id,
        codigo: form.codigo,
        nome: form.nome,
        inicio: form.inicio,
        fim: form.fim,
        progresso_planejado: numero(form.progresso_planejado, 'Planejado'),
        progresso_realizado: numero(form.progresso_realizado, 'Realizado'),
      })
      setForm(null)
      setFeedback({ tipo: 'sucesso', msg: `Work package ${gravado.codigo} gravado.` })
      await carregar()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setSalvando(false)
    }
  }

  async function handleApagar(wp: WorkPackage) {
    if (!confirm(`Apagar o work package ${wp.codigo} — ${wp.nome}?`)) return
    try {
      await apagarWorkPackage(wp.id)
      setFeedback({ tipo: 'sucesso', msg: `Work package ${wp.codigo} apagado.` })
      await carregar()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    }
  }

  const aviso = feedback && <Alert tipo={feedback.tipo} mensagem={feedback.msg} onClose={() => setFeedback(null)} />

  return (
    <div className="space-y-6 animate-fade-in">
      <CabecalhoPagina
        titulo="Work packages"
        subtitulo="Pacotes de trabalho contratuais de cada projeto: progresso planejado × realizado (aparece no dashboard gerencial)"
        acoes={projetosEditaveis.length > 0 && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={abrirNovo}>Novo work package</Button>
        )}
      />

      {!form && aviso}

      {carregando ? (
        <p className="py-6 text-center text-[13px] text-[var(--color-neutral-500)]">Carregando work packages...</p>
      ) : projetosDoContexto.length === 0 ? (
        <Card><Vazio icone={<ListChecks size={32} />} titulo="Nenhum projeto neste contexto" /></Card>
      ) : (
        projetosDoContexto.map((proj) => {
          const lista = wps.filter((w) => w.projeto_id === proj.id)
          const editavel = papeis[proj.id] === 'editor'
          return (
            <Card key={proj.id} titulo={`${proj.codigo} — ${proj.nome}`} subtitulo={`${lista.length} work package(s)`} icone={<ListChecks size={18} />}>
              {lista.length === 0 ? (
                <Vazio titulo="Nenhum work package cadastrado neste projeto"
                  texto={editavel ? 'Use "Novo work package" para cadastrar o primeiro.' : undefined} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table text-[13px]">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Nome</th>
                        <th>Início</th>
                        <th>Fim</th>
                        <th className="text-right">Planejado (%)</th>
                        <th className="text-right">Realizado (%)</th>
                        <th>Progresso</th>
                        {editavel && <th className="text-right !pr-0">Ações</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((wp) => (
                        <tr key={wp.id} className="lcp-row">
                          <td><span className="codigo">{wp.codigo}</span></td>
                          <td>{wp.nome}</td>
                          <td className="tabular-nums whitespace-nowrap">{fmtData(wp.inicio)}</td>
                          <td className="tabular-nums whitespace-nowrap">{fmtData(wp.fim)}</td>
                          <td className="text-right tabular-nums">{fmt(wp.progresso_planejado, 1)}</td>
                          <td className="text-right"><span className="numero">{fmt(wp.progresso_realizado, 1)}</span></td>
                          <td><Progresso planejado={wp.progresso_planejado} realizado={wp.progresso_realizado} /></td>
                          {editavel && (
                            <td className="text-right !pr-0">
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => abrirEdicao(wp)} className="btn-icone" title="Editar work package"><Pencil size={15} /></button>
                                <button onClick={() => handleApagar(wp)} className="btn-icone perigo" title="Apagar work package"><Trash2 size={15} /></button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )
        })
      )}

      <Modal
        isOpen={form !== null}
        onClose={() => setForm(null)}
        titulo={form?.id ? `Editar work package ${form.codigo}` : 'Novo work package'}
        subtitulo="Progresso em % (0 a 100)"
      >
        {form && (
          <form onSubmit={handleSalvar} className="space-y-4">
            {aviso}
            <Select
              label="Projeto"
              value={form.projeto_id}
              onChange={(e) => setForm({ ...form, projeto_id: e.target.value })}
              disabled={Boolean(form.id)}
              obrigatorio
              required
            >
              <option value="">Selecione um projeto...</option>
              {(form.id ? projetosDoContexto : projetosEditaveis).map((p) => (
                <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>
              ))}
            </Select>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Código" placeholder="Ex.: WP1" value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })} obrigatorio required />
              <div className="sm:col-span-2">
                <Input label="Nome" placeholder="Ex.: Caracterização petrofísica" value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })} obrigatorio required />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Input label="Início" type="date" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
              <Input label="Fim" type="date" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
              <Input label="Planejado" unidade="%" inputMode="decimal" placeholder="ex.: 50" value={form.progresso_planejado}
                onChange={(e) => setForm({ ...form, progresso_planejado: e.target.value })} />
              <Input label="Realizado" unidade="%" inputMode="decimal" placeholder="ex.: 35,5" value={form.progresso_realizado}
                onChange={(e) => setForm({ ...form, progresso_realizado: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-neutral-300)]">
              <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
              <Button variant="primary" type="submit" loading={salvando}>Gravar work package</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
