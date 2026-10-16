import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Edit3, Plus, Tags, Trash2 } from 'lucide-react'
import { Alert, Button, Card, Input, Modal, Select, Textarea } from '../components/UI'
import { apagarPrefixoCodigo, listarPrefixosCodigo, salvarPrefixoCodigo } from '../servicos/api'
import type { PrefixoCodigo } from '../tipos/banco'
import { ROTULO_TIPO_AMOSTRA, type TipoAmostra } from '../utils/bancoAmostras'

// Catálogo "Prefixos de código" (migração 011): o que significa o começo do código da amostra.
// É o que dá nome aos grupos do Banco de Amostras ("IL — Indiana Limestone"). Editável por editor
// (regra do banco: prefixos_codigo_escrever).
interface FormPrefixo { prefixo: string; significado: string; tipo_amostra: string; observacao: string }
const FORM_VAZIO: FormPrefixo = { prefixo: '', significado: '', tipo_amostra: '', observacao: '' }

export const PrefixosCodigoPage: React.FC = () => {
  const [prefixos, setPrefixos] = useState<PrefixoCodigo[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<FormPrefixo>(FORM_VAZIO)
  const [editando, setEditando] = useState<string | null>(null)   // prefixo original da linha em edição
  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    setLoading(true)
    try {
      setPrefixos(await listarPrefixosCodigo())
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  function abrir(p?: PrefixoCodigo, inicial: Partial<FormPrefixo> = {}) {
    setForm(p
      ? { prefixo: p.prefixo, significado: p.significado, tipo_amostra: p.tipo_amostra ?? '', observacao: p.observacao ?? '' }
      : { ...FORM_VAZIO, ...inicial })
    setEditando(p?.prefixo ?? null)
    setFeedback(null)
    setModal(true)
  }

  // link "cadastrar" do Banco de Amostras (prefixo sem significado): abre o formulário preenchido
  const [params] = useSearchParams()
  const prefixoPedido = params.get('prefixo')
  useEffect(() => {
    if (!prefixoPedido) return
    const tipo = params.get('tipo') ?? ''
    abrir(undefined, { prefixo: prefixoPedido.toUpperCase(), tipo_amostra: tipo in ROTULO_TIPO_AMOSTRA ? tipo : '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefixoPedido])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      const gravado = await salvarPrefixoCodigo({
        prefixo: form.prefixo,
        significado: form.significado,
        tipo_amostra: (form.tipo_amostra || null) as TipoAmostra | null,
        observacao: form.observacao,
      }, editando ?? undefined)
      setModal(false)
      setFeedback({ tipo: 'sucesso', msg: `Prefixo ${gravado.prefixo} salvo: as amostras ${gravado.prefixo}… aparecem como "${gravado.prefixo} — ${gravado.significado}" no Banco de Amostras.` })
      await carregar()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    } finally {
      setSalvando(false)
    }
  }

  async function apagar(p: PrefixoCodigo) {
    if (!confirm(`Apagar o prefixo ${p.prefixo} (${p.significado})? As amostras não são alteradas; só deixam de mostrar o significado.`)) return
    try {
      await apagarPrefixoCodigo(p.prefixo)
      setFeedback({ tipo: 'sucesso', msg: `Prefixo ${p.prefixo} apagado.` })
      await carregar()
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: err.message })
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {!modal && feedback && <Alert tipo={feedback.tipo} mensagem={feedback.msg} onClose={() => setFeedback(null)} />}

      <Card
        titulo={`Prefixos de código (${prefixos.length})`}
        subtitulo="O que significam as letras do começo do código da amostra · dão nome aos grupos do Banco de Amostras"
        icone={<Tags size={18} />}
        acoes={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => abrir()}>Novo prefixo</Button>}
      >
        {loading ? (
          <p className="py-4 text-center text-[13px] text-[var(--color-neutral-500)]">Carregando prefixos...</p>
        ) : prefixos.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-[var(--color-neutral-500)]">Nenhum prefixo cadastrado.</p>
        ) : (
          <div className="overflow-x-auto -my-2">
            <table className="table text-[13px]">
              <thead>
                <tr>
                  <th className="w-[110px]">Prefixo</th><th>Significado</th><th className="w-[150px]">Tipo de amostra</th>
                  <th>Observação</th><th className="text-right !pr-0 w-[90px]">Ações</th>
                </tr>
              </thead>
              <tbody>
                {prefixos.map((p) => (
                  <tr key={p.prefixo} className="lcp-row">
                    <td><span className="codigo">{p.prefixo}</span></td>
                    <td className="font-medium text-[var(--color-text)]">{p.significado}</td>
                    <td>{p.tipo_amostra ? ROTULO_TIPO_AMOSTRA[p.tipo_amostra] : '—'}</td>
                    <td className="text-[var(--color-neutral-600)]">{p.observacao || '—'}</td>
                    <td className="text-right !pr-0">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => abrir(p)} title="Editar prefixo" className="btn-icone"><Edit3 size={14} /></button>
                        <button onClick={() => apagar(p)} title="Apagar prefixo" className="btn-icone perigo"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        isOpen={modal}
        onClose={() => setModal(false)}
        titulo={editando ? `Editar prefixo ${editando}` : 'Novo prefixo de código'}
        subtitulo="As letras do começo do código e o que elas querem dizer"
      >
        <form onSubmit={salvar} className="space-y-4">
          {feedback && <Alert tipo={feedback.tipo} mensagem={feedback.msg} onClose={() => setFeedback(null)} />}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Prefixo"
              placeholder="Ex.: IL"
              value={form.prefixo}
              onChange={(e) => setForm({ ...form, prefixo: e.target.value.toUpperCase() })}
              ajuda="Só as letras, sem número"
              obrigatorio
              required
            />
            <div className="sm:col-span-2">
              <Input
                label="Significado"
                placeholder="Ex.: Indiana Limestone"
                value={form.significado}
                onChange={(e) => setForm({ ...form, significado: e.target.value })}
                obrigatorio
                required
              />
            </div>
          </div>
          <Select label="Tipo de amostra" value={form.tipo_amostra} onChange={(e) => setForm({ ...form, tipo_amostra: e.target.value })}>
            <option value="">Não definir (o app decide pela finalidade ou pelo comprimento)</option>
            {(Object.keys(ROTULO_TIPO_AMOSTRA) as TipoAmostra[]).map((t) => <option key={t} value={t}>{ROTULO_TIPO_AMOSTRA[t]}</option>)}
          </Select>
          <Textarea
            label="Observação"
            placeholder="Ex.: lote comprado em 2023, blocos B-01 a B-04"
            value={form.observacao}
            onChange={(e) => setForm({ ...form, observacao: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-neutral-300)]">
            <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={salvando}>Salvar prefixo</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
