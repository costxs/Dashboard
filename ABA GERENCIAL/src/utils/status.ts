import type { StatusAmostra } from '../tipos/banco'

// Status das amostras: vocabulário da planilha de controle de rochas (migração 009).
// No banco ficam sem acento; os rótulos e as cores das etiquetas são os mesmos do dashboard.
export const STATUS_ROTULO: Record<StatusAmostra, string> = {
  disponivel: 'Disponível',
  reservada: 'Reservada',
  'em ensaio': 'Em ensaio',
  utilizada: 'Utilizada',
  'nao localizada': 'Não localizada',
  arquivada: 'Arquivada',
}

const STATUS_CLASSE: Record<StatusAmostra, string> = {
  disponivel: 'tag tag-blue',
  reservada: 'tag tag-orange',
  'em ensaio': 'tag tag-outline',
  utilizada: 'tag tag-solid',
  'nao localizada': 'tag tag-accent',
  arquivada: 'tag tag-neutral',
}

export const rotuloStatus = (s: unknown) => STATUS_ROTULO[s as StatusAmostra] ?? String(s ?? '—')
export const classeStatus = (s: unknown) => STATUS_CLASSE[s as StatusAmostra] ?? 'tag tag-neutral'
