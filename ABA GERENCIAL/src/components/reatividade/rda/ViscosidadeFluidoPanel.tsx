// REATIVIDADE › Dissolução dinâmica (RDA) › Viscosidade do fluido.
// Catálogo viscosidade_fluido: ν (cm²/s) por sistema ácido e temperatura, com a fonte (literatura).
// As séries sugerem o ν daqui. Só editor grava (RLS).
import React, { useCallback, useEffect, useState } from 'react'
import { Pencil, Save, Trash2 } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { supabase } from '../../../lib/supabase'
import { listarSistemasAcidos } from '../../../servicos/api'
import type { SistemaAcido } from '../../../tipos/banco'
import { fmtData, mensagemErro } from '../../../utils/formatacao'
import { Alert, Button, Card, Input, Select } from '../../UI'
import { lerNumero, num, paraCampo } from './numeros'

interface Linha { id_sistema: string; temperatura_c: number; viscosidade_cinematica_cm2_s: number; fonte: string | null; criado_em: string }

const VAZIO = { id_sistema: '', temperatura_c: '', nu: '', fonte: '' }
const NU_AGUA_65 = 0.0044

export const ViscosidadeFluidoPanel: React.FC = () => {
  const { editor } = useAuth()
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [sistemas, setSistemas] = useState<SistemaAcido[]>([])
  const [f, setF] = useState(VAZIO)
  const [editando, setEditando] = useState<{ id_sistema: string; temperatura_c: number } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'sucesso'; texto: string } | null>(null)

  const carregar = useCallback(async () => {
    const [{ data, error }, sis] = await Promise.all([
      supabase.from('viscosidade_fluido').select('*').order('id_sistema').order('temperatura_c'),
      listarSistemasAcidos().catch(() => []),
    ])
    if (error) setMsg({ tipo: 'erro', texto: `Não foi possível ler o catálogo: ${error.message}` })
    setLinhas((data ?? []) as Linha[]); setSistemas(sis)
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  async function gravar() {
    const T = lerNumero(f.temperatura_c), nu = lerNumero(f.nu)
    if (!f.id_sistema || T == null || !nu || nu <= 0) { setMsg({ tipo: 'erro', texto: 'Informe sistema, temperatura e ν (> 0).' }); return }
    setOcupado(true); setMsg(null)
    try {
      const linha = { id_sistema: f.id_sistema, temperatura_c: T, viscosidade_cinematica_cm2_s: nu, fonte: f.fonte.trim() || null }
      const { error } = editando
        ? await supabase.from('viscosidade_fluido').update(linha).eq('id_sistema', editando.id_sistema).eq('temperatura_c', editando.temperatura_c)
        : await supabase.from('viscosidade_fluido').upsert(linha, { onConflict: 'id_sistema,temperatura_c' })
      if (error) throw new Error(error.code === '42501' ? 'sem permissão (só editor)' : error.message)
      setMsg({ tipo: 'sucesso', texto: `ν de ${f.id_sistema} a ${num(T, 1)} °C gravado.` })
      setF(VAZIO); setEditando(null); await carregar()
    } catch (e) { setMsg({ tipo: 'erro', texto: mensagemErro(e) }) } finally { setOcupado(false) }
  }

  async function apagar(l: Linha) {
    setOcupado(true); setMsg(null)
    const { error } = await supabase.from('viscosidade_fluido').delete().eq('id_sistema', l.id_sistema).eq('temperatura_c', l.temperatura_c)
    setOcupado(false)
    if (error) setMsg({ tipo: 'erro', texto: error.message }); else void carregar()
  }

  const nomeSistema = (id: string) => sistemas.find((s) => s.id_sistema === id)?.nome_sistema ?? id

  return (
    <div className="space-y-6">
      {msg && <Alert tipo={msg.tipo} mensagem={msg.texto} onClose={() => setMsg(null)} />}
      {editor && (
        <Card titulo={editando ? 'Editar viscosidade' : 'Nova viscosidade'} subtitulo="ν do fluido na temperatura do ensaio, da literatura">
          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-5">
            <Select label="Sistema ácido" value={f.id_sistema} onChange={(e) => setF((x) => ({ ...x, id_sistema: e.target.value }))} obrigatorio>
              <option value="">— escolha —</option>
              {sistemas.map((s) => <option key={s.id_sistema} value={s.id_sistema}>{s.id_sistema} · {s.nome_sistema}</option>)}
            </Select>
            <Input label="Temperatura" unidade="°C" value={f.temperatura_c} onChange={(e) => setF((x) => ({ ...x, temperatura_c: e.target.value }))} obrigatorio />
            <Input label="ν" unidade="cm²/s" value={f.nu} onChange={(e) => setF((x) => ({ ...x, nu: e.target.value }))} obrigatorio placeholder="0,0089" />
            <Input label="Fonte" value={f.fonte} onChange={(e) => setF((x) => ({ ...x, fonte: e.target.value }))} placeholder="autor (ano), tabela" />
            <div className="flex gap-2">
              <Button icon={<Save size={15} />} loading={ocupado} onClick={() => void gravar()}>Gravar</Button>
              {editando && <Button variant="secondary" onClick={() => { setEditando(null); setF(VAZIO) }}>Cancelar</Button>}
            </div>
          </div>
        </Card>
      )}
      <Card titulo="Catálogo de viscosidade do fluido" subtitulo={`${linhas.length} valor(es). A 65 °C, a água pura tem ν ≈ ${num(NU_AGUA_65, 4)} cm²/s: valores abaixo disso pedem conferência.`}>
        {!linhas.length ? <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">Nenhum valor cadastrado.</p> : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="table text-[13px]">
              <thead><tr><th>Sistema</th><th className="text-right">T (°C)</th><th className="text-right">ν (cm²/s)</th><th>Fonte</th><th>Cadastrado em</th>{editor && <th></th>}</tr></thead>
              <tbody>
                {linhas.map((l) => {
                  const suspeito = Number(l.temperatura_c) >= 60 && Number(l.viscosidade_cinematica_cm2_s) < NU_AGUA_65
                  return (
                    <tr key={`${l.id_sistema}-${l.temperatura_c}`} className="lcp-row">
                      <td>{l.id_sistema} · {nomeSistema(l.id_sistema)}</td>
                      <td className="text-right tabular-nums">{num(Number(l.temperatura_c), 1)}</td>
                      <td className={`text-right font-mono text-[12px] ${suspeito ? 'font-bold text-[var(--color-orange-700)]' : ''}`} title={suspeito ? 'abaixo do ν da água pura nesta temperatura' : undefined}>
                        {num(Number(l.viscosidade_cinematica_cm2_s), 6)}{suspeito ? ' ⚠' : ''}
                      </td>
                      <td>{l.fonte ?? '—'}</td>
                      <td className="whitespace-nowrap">{fmtData(l.criado_em)}</td>
                      {editor && (
                        <td className="whitespace-nowrap">
                          <button type="button" className="btn-icone" title="Editar" onClick={() => {
                            setEditando({ id_sistema: l.id_sistema, temperatura_c: l.temperatura_c })
                            setF({ id_sistema: l.id_sistema, temperatura_c: paraCampo(Number(l.temperatura_c)), nu: paraCampo(Number(l.viscosidade_cinematica_cm2_s)), fonte: l.fonte ?? '' })
                          }}><Pencil size={14} /></button>
                          <button type="button" className="btn-icone perigo" title="Apagar" disabled={ocupado} onClick={() => void apagar(l)}><Trash2 size={14} /></button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
