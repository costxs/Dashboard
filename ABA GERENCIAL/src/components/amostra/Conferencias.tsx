import React, { useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Alert, Button, Card, Input } from '../UI'
import { adicionarConferencia, listarConferencias } from '../../servicos/api'
import type { Conferencia } from '../../tipos/banco'
import { fmtData } from '../../utils/formatacao'

const formInicial = () => ({
  data: new Date().toISOString().split('T')[0],
  responsaveis: '',
  resultado: 'ok',
  observacao: ''
})

/** Conferências físicas da amostra (histórico + nova conferência, para editor do projeto). */
export const Conferencias: React.FC<{ amostraId: string; podeEditar: boolean }> = ({ amostraId, podeEditar }) => {
  const [conferencias, setConferencias] = useState<Conferencia[]>([])
  const [form, setForm] = useState(formInicial)
  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    listarConferencias(amostraId)
      .then(setConferencias)
      .catch((err) => setFeedback({ tipo: 'erro', msg: err.message }))
  }, [amostraId])

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      await adicionarConferencia({
        amostra_id: amostraId,
        data: form.data,
        responsaveis: form.responsaveis,
        resultado: form.resultado,
        observacao: form.observacao || null
      })
      setConferencias(await listarConferencias(amostraId))
      setForm(formInicial())
      setFeedback({ tipo: 'sucesso', msg: 'Conferência de bancada registrada!' })
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card
      titulo={`Conferências físicas (${conferencias.length})`}
      subtitulo="Histórico de inspeção visual e localização da amostra na bancada"
      icone={<ClipboardCheck size={18} />}
    >
      <div className="space-y-5">
        {feedback && <Alert tipo={feedback.tipo} mensagem={feedback.msg} onClose={() => setFeedback(null)} />}

        {podeEditar && (
          <form onSubmit={handleSalvar} className="flex flex-col gap-3 rounded-[10px] border border-[var(--color-neutral-300)] bg-[var(--color-neutral-50)] p-4">
            <h4 className="rotulo">Nova conferência física</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Data da conferência"
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                obrigatorio
                required
              />
              <Input
                label="Responsáveis pela inspeção"
                placeholder="Ex.: Heitor e Dulcídio"
                value={form.responsaveis}
                onChange={(e) => setForm({ ...form, responsaveis: e.target.value })}
                obrigatorio
                required
              />
            </div>
            <Input
              label="Resultado"
              placeholder="Ex.: ok, não localizada, danificada"
              value={form.resultado}
              onChange={(e) => setForm({ ...form, resultado: e.target.value })}
              obrigatorio
              required
            />
            <Input
              label="Observação"
              placeholder="Ex.: topo e base retificados com tolerância de 0,05 mm"
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
            <div className="flex justify-end pt-1">
              <Button size="sm" variant="primary" type="submit" loading={salvando}>Registrar conferência</Button>
            </div>
          </form>
        )}

        {conferencias.length === 0 ? (
          <p className="py-3 text-center text-[13px] text-[var(--color-neutral-500)]">Nenhuma conferência registrada para esta amostra.</p>
        ) : (
          <table className="table text-[13px]">
            <thead>
              <tr>
                <th>Data</th>
                <th>Responsáveis</th>
                <th>Resultado</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {conferencias.map((c) => (
                <tr key={c.id} className="lcp-row">
                  <td className="tabular-nums whitespace-nowrap">{fmtData(c.data)}</td>
                  <td>{c.responsaveis}</td>
                  <td><span className="tag tag-blue">{c.resultado}</span></td>
                  <td className="text-[var(--color-neutral-600)]">{c.observacao || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  )
}
