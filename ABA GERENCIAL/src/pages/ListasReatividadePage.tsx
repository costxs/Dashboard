import React, { useState } from 'react'
import { ListChecks, Plus } from 'lucide-react'
import { Alert, Card } from '../components/UI'
import { useConsulta } from '../hooks/useConsulta'
import {
  atualizarItemLista, criarItemLista, listarListas, ROTULO_LISTA, type ItemLista, type NomeLista,
} from '../literatura/reatividade/servico'
import { mensagemErro } from '../utils/formatacao'

// CATÁLOGOS › Listas da reatividade: as opções dos campos de método no cadastro de série (tabela lit_listas).
// Não se apaga: uma opção que saiu de uso é desativada (as medidas antigas continuam com o texto que tinham).
const LISTAS: NomeLista[] = ['metodo_quantificacao', 'metodo_coef_difusao']

export const ListasReatividadePage: React.FC = () => {
  const itens = useConsulta(() => listarListas(), [])
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [novo, setNovo] = useState<Record<NomeLista, string>>({ metodo_quantificacao: '', metodo_coef_difusao: '' })

  async function executar(fn: () => Promise<void>) {
    setErro(null)
    setOcupado(true)
    try { await fn(); itens.recarregar() } catch (e) { setErro(mensagemErro(e)) } finally { setOcupado(false) }
  }

  function adicionar(lista: NomeLista, daLista: ItemLista[]) {
    const valor = novo[lista].replace(/\s+/g, ' ').trim()
    if (!valor) return
    if (daLista.some((i) => i.valor.toLowerCase() === valor.toLowerCase())) { setErro(`"${valor}" já está na lista (se estiver desativado, reative).`); return }
    const ordem = Math.max(0, ...daLista.map((i) => i.ordem)) + 1
    void executar(async () => { await criarItemLista({ lista, valor, ordem, ativo: true }); setNovo((n) => ({ ...n, [lista]: '' })) })
  }

  return (
    <div className="space-y-6">
      {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
      {itens.erro && <Alert tipo="erro" mensagem={itens.erro} />}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {LISTAS.map((lista) => {
          const daLista = (itens.dados ?? []).filter((i) => i.lista === lista)
          return (
            <Card key={lista} titulo={ROTULO_LISTA[lista]} subtitulo="Opções oferecidas no cadastro de série da reatividade" icone={<ListChecks size={18} />}>
              {itens.carregando && !itens.dados ? (
                <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">Carregando…</p>
              ) : (
                <table className="table text-[13px]">
                  <thead><tr><th>Valor</th><th className="w-[90px]">Ordem</th><th className="w-[130px]">Situação</th></tr></thead>
                  <tbody>
                    {daLista.length === 0 && <tr><td colSpan={3} className="!py-4 text-center text-[var(--color-neutral-600)]">Nenhuma opção cadastrada.</td></tr>}
                    {daLista.map((i) => (
                      <tr key={i.valor} className={i.ativo ? '' : 'text-[var(--color-neutral-500)]'}>
                        <td className={`!py-2 font-semibold ${i.ativo ? '' : 'line-through'}`}>{i.valor}</td>
                        <td className="!py-2">
                          <input className="input !py-1.5 !w-[70px]" type="number" aria-label={`Ordem de ${i.valor}`} defaultValue={i.ordem} disabled={ocupado}
                            key={`${i.valor}|${i.ordem}`}
                            onBlur={(e) => {
                              const n = Math.round(Number(e.target.value))
                              if (Number.isFinite(n) && n !== i.ordem) void executar(() => atualizarItemLista(lista, i.valor, { ordem: n }))
                            }} />
                        </td>
                        <td className="!py-2">
                          <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado}
                            onClick={() => executar(() => atualizarItemLista(lista, i.valor, { ativo: !i.ativo }))}>
                            {i.ativo ? 'Desativar' : 'Reativar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); adicionar(lista, daLista) }}>
                <input className="input" placeholder="Nova opção…" aria-label={`Nova opção de ${ROTULO_LISTA[lista]}`} value={novo[lista]}
                  onChange={(e) => setNovo({ ...novo, [lista]: e.target.value })} />
                <button type="submit" className="btn btn-primary shrink-0" disabled={ocupado || !novo[lista].trim()}><Plus size={14} /> Adicionar</button>
              </form>
            </Card>
          )
        })}
      </div>
      <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">
        Opções desativadas somem do formulário, mas continuam nas medidas já cadastradas. Para corrigir um texto, desative a opção e adicione a certa.
      </p>
    </div>
  )
}
