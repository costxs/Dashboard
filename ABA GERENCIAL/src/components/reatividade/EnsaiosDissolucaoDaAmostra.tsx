// Ensaios de dissolução estática (t50) gravados na amostra: como rocha do ensaio ou como
// mini-plug de uma réplica / teste piloto (migração 027).
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, Loader2 } from 'lucide-react'
import { listarEnsaiosDaAmostra, type EnsaioDaAmostra } from '../../servicos/reatividade'

function fmt(v: number | null | undefined, casas = 2): string {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

export const EnsaiosDissolucaoDaAmostra: React.FC<{ amostraId: string }> = ({ amostraId }) => {
  const [lista, setLista] = useState<EnsaioDaAmostra[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    setLista(null)
    listarEnsaiosDaAmostra(amostraId)
      .then((l) => ativo && setLista(l))
      .catch((e) => ativo && setErro(e instanceof Error ? e.message : String(e)))
    return () => {
      ativo = false
    }
  }, [amostraId])

  return (
    <div className="cartao">
      <div className="cartao-topo">
        <div>
          <h2 className="flex items-center gap-2">
            <FlaskConical size={17} className="text-[var(--color-orange)]" /> Dissolução estática (t₅₀)
          </h2>
          <p>Ensaios em que esta amostra é a rocha ou um dos mini-plugs.</p>
        </div>
        <Link to="/reatividade" className="btn btn-secondary btn-sm">Abrir reatividade</Link>
      </div>
      <div className="p-4 sm:p-6">
        {erro ? (
          <p className="m-0 text-[13px] text-red-700">{erro}</p>
        ) : lista == null ? (
          <p className="m-0 flex items-center gap-2 text-[13px] text-[var(--color-neutral-600)]">
            <Loader2 size={14} className="animate-spin" /> Carregando…
          </p>
        ) : lista.length === 0 ? (
          <p className="m-0 text-[13px] text-[var(--color-neutral-500)]">Nenhum ensaio de dissolução estática gravado nesta amostra.</p>
        ) : (
          <table className="table text-[13px]">
            <thead>
              <tr>
                <th>Ensaio</th>
                <th>Papel</th>
                <th>Data</th>
                <th>Sistema</th>
                <th className="text-right">t₅₀ (min)</th>
                <th className="text-right">Taxa (%/s)</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(({ ensaio: e, papeis }) => (
                <tr key={e.id}>
                  <td className="codigo">{e.codigo}</td>
                  <td>
                    {papeis.map((p) => (
                      <span key={p} className={`tag ${p === 'rocha' ? 'tag-blue' : 'tag-orange'} mr-1`}>
                        {p === 'rocha' ? 'Rocha' : 'Mini-plug'}
                      </span>
                    ))}
                  </td>
                  <td>{e.data_ensaio ? new Date(`${e.data_ensaio}T00:00:00`).toLocaleDateString('pt-BR') : '—'}</td>
                  <td>{e.id_sistema ?? '—'}</td>
                  <td className="text-right tabular-nums">{fmt(e.t50_min)}</td>
                  <td className="text-right tabular-nums">{fmt(e.taxa_dissolucao_m, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
