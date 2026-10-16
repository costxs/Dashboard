// Escala logarítmica legível: domínio fechado em potências de 10 e marcas em
// 1-2-5 × 10ⁿ quando a faixa é curta (≤ 2 décadas), só 10ⁿ quando é longa.
const SOBRESCRITO: Record<string, string> = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }

export function escalaLog(valores: number[]) {
  const pos = valores.filter((v) => v > 0)
  const eMin = pos.length ? Math.floor(Math.log10(Math.min(...pos))) : 0
  let eMax = pos.length ? Math.ceil(Math.log10(Math.max(...pos))) : 1
  if (eMax === eMin) eMax += 1
  const marcas: number[] = []
  const curta = eMax - eMin <= 2
  for (let e = eMin; e <= eMax; e++) {
    for (const m of curta ? [1, 2, 5] : [1]) {
      const v = m * 10 ** e
      if (v <= 10 ** eMax) marcas.push(Number(v.toPrecision(3)))
    }
  }
  return { dominio: [10 ** eMin, 10 ** eMax] as [number, number], marcas }
}

/** 0.001 -> "10⁻³"; 0.002 -> "2·10⁻³"; valores entre 0,01 e 10 000 saem em decimal. */
export function formatarLog(v: number): string {
  if (v <= 0) return String(v)
  if (v >= 0.01 && v < 1e4) return v.toLocaleString('pt-BR', { maximumSignificantDigits: 3 })
  const e = Math.floor(Math.log10(v) + 1e-9)
  const m = Math.round(v / 10 ** e)
  const pot = `10${String(e).split('').map((c) => SOBRESCRITO[c]).join('')}`
  return m === 1 ? pot : `${m}·${pot}`
}
