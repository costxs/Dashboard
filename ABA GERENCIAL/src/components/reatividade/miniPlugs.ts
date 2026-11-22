// Códigos dos mini-plugs da dissolução estática (027: cada mini-plug é uma amostra).

/**
 * Código do mini-plug como vai para o banco de amostras. Códigos genéricos de bancada
 * ("MP-1", "mp2") ganham o código da rocha na frente, para não colidir entre ensaios.
 */
export function codigoMiniPlug(codigo: string, rochaCodigo: string | null | undefined): string {
  const c = codigo.trim().toUpperCase()
  if (!c) return ''
  if (rochaCodigo && /^MP-?\d+$/.test(c)) return `${rochaCodigo.trim().toUpperCase()}-${c.replace(/^MP-?/, 'MP')}`
  return c
}

/** Código sugerido para cada mini-plug: piloto P1.., estágio/réplica T1-O, T1-D, T1-T… */
export function sugestaoMiniPlug(rochaCodigo: string, tipo: 'piloto' | 'ponto', a: number, b?: number): string {
  const r = rochaCodigo.trim().toUpperCase()
  return tipo === 'piloto' ? `${r}-MP-P${a}` : `${r}-MP-T${a}${['O', 'D', 'T'][(b ?? 1) - 1]}`
}
