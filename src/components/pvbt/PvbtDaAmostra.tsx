import { useMemo } from 'react'
import { Aviso, Carregando, Cartao } from '../ui/base'
import { useConsulta } from '../../hooks/useConsulta'
import { listarPvbt } from '../../servicos/pvbt'
import { fmt } from '../../utils/formatacao'
import type { PontoPvbt } from '../../tipos/banco'
import { GraficoPvbt } from './GraficoPvbt'

const TOLERANCIA_C = 10

// colunas que a view v_pvbt calcula a partir do que foi lançado no ensaio
const CALCULADOS: [keyof PontoPvbt, string, number][] = [
  ['vel_darcy_cm_min', 'v Darcy (cm/min)', 4],
  ['vel_intersticial_cm_min', 'v intersticial (cm/min)', 4],
  ['volume_poroso_cm3', 'Volume poroso (cm³)', 3],
  ['conc_m', 'Conc. (M)', 3],
  ['conc_pct', 'Conc. (wt%)', 2],
  ['volume_poroso_wh_cm3', 'VP do trecho acidificado (cm³)', 3],
  ['pvbt_por_darcy', 'PVbt por Darcy', 3],
  ['pvbt_por_uct', 'PVbt por microCT', 3],
]

/** Ficha da amostra › 3. Coreflooding: os ensaios desta amostra na base de PVbt,
 *  em destaque sobre as séries comparáveis da literatura/Petrobras. */
export function PvbtDaAmostra({ amostraId, codigo }: { amostraId: string; codigo: string }) {
  const meus = useConsulta(() => listarPvbt({ amostraUuid: amostraId }), [amostraId])
  const litologia = meus.dados?.[0]?.litologia
  const acidos = [...new Set((meus.dados ?? []).map((e) => e.acido).filter((a): a is string => !!a))].sort()
  const chaveAcidos = acidos.join('|')
  const referencia = useConsulta(
    () => (litologia && acidos.length
      ? listarPvbt({ fontes: ['Literatura', 'Petrobras'], litologia, acidos })
      : Promise.resolve([] as PontoPvbt[])),
    [litologia, chaveAcidos])

  // comparável = mesma litologia e ácido (já filtrados na consulta) e temperatura nominal até ±10 °C
  const comparaveis = useMemo(() => (referencia.dados ?? []).filter((r) => (meus.dados ?? []).some((e) =>
    e.acido === r.acido && e.temperatura_nominal_c != null && r.temperatura_nominal_c != null
    && Math.abs(Number(e.temperatura_nominal_c) - Number(r.temperatura_nominal_c)) <= TOLERANCIA_C)),
  [referencia.dados, meus.dados])

  const ensaios = meus.dados ?? []

  return (
    <Cartao titulo="Este ensaio na base de PVbt"
      subtitulo={`Valores calculados pelo banco (ƒ) e os ensaios desta amostra sobre a literatura de mesma rocha, ácido e temperatura (±${TOLERANCIA_C} °C)`}>
      {meus.carregando && !meus.dados ? <Carregando />
        : meus.erro ? <div className="p-6"><Aviso tipo="erro">{meus.erro}</Aviso></div>
        : !ensaios.length ? <p className="m-0 px-6 py-8 text-[13px] text-[var(--color-neutral-600)]">Os ensaios desta amostra não aparecem na base de PVbt.</p>
        : (
          <>
            <div className="px-6 py-2 overflow-x-auto">
              <table className="table text-[13px]">
                <thead>
                  <tr>
                    <th>Ensaio</th>
                    <th className="text-right">PVbt</th>
                    {CALCULADOS.map(([k, r]) => (
                      <th key={k} className="text-right">{r} <span title="Calculado pelo banco" className="text-[var(--color-orange-700)]">ƒ</span></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ensaios.map((e) => (
                    <tr key={e.id_experimento} className="lcp-row">
                      <td className="whitespace-nowrap font-bold text-[var(--color-blue-800)]">{e.id_experimento}</td>
                      <td className="text-right tabular-nums">{fmt(e.pvbt, 3)}</td>
                      {CALCULADOS.map(([k, , casas]) => <td key={k} className="text-right tabular-nums">{fmt(e[k], casas)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-[var(--color-neutral-300)] p-6 flex flex-col gap-4">
              {referencia.erro && <Aviso tipo="erro">{referencia.erro}</Aviso>}
              {referencia.dados && !comparaveis.length && (
                <Aviso tipo="info">Nenhum ensaio comparável na literatura (mesma rocha, ácido e temperatura).</Aviso>
              )}
              {referencia.carregando && !referencia.dados ? <Carregando />
                : <GraficoPvbt pontos={[...comparaveis, ...ensaios]} destacarAmostra={codigo} altura={380} />}
            </div>
          </>
        )}
    </Cartao>
  )
}
