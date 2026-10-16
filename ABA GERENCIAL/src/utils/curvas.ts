import { paraNumero } from './formatacao'

/**
 * Lê duas colunas numéricas de um texto colado do Excel/Origin ou de um .csv/.txt.
 * Colunas separadas por tabulação ou ponto e vírgula (a vírgula é decimal); sem eles, por espaços;
 * sem espaços, por vírgula (csv com ponto decimal). Linhas que não são número (cabeçalho) são puladas.
 * Mesma regra de docs/referencia/painel-cadastro/src/servicos/analises.ts.
 */
export function lerPontos(texto: string, colX = 0, colY = 1): { pontos: { x: number; y: number }[]; puladas: number } {
  const pontos: { x: number; y: number }[] = []
  let puladas = 0
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim()
    if (!linha) continue
    let partes: string[]
    if (linha.includes('\t')) partes = linha.split('\t')
    else if (linha.includes(';')) partes = linha.split(';')
    else if (/\s/.test(linha)) partes = linha.split(/\s+/)
    else partes = linha.split(',')
    const x = paraNumero(partes[colX] ?? '')
    const y = paraNumero(partes[colY] ?? '')
    if (x != null && y != null && !Number.isNaN(x) && !Number.isNaN(y)) pontos.push({ x, y })
    else puladas += 1
  }
  return { pontos, puladas }
}
