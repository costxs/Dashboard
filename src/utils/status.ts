import type { StatusAmostra } from "../tipos/banco";

// vocabulário da planilha de controle de rochas (migração 009); os rótulos com acento ficam aqui
export const STATUS_ROTULO: Record<StatusAmostra, string> = {
  disponivel: "Disponível",
  reservada: "Reservada",
  "em ensaio": "Em ensaio",
  utilizada: "Utilizada",
  "nao localizada": "Não localizada",
  arquivada: "Arquivada",
};
const STATUS_CLASSE: Record<StatusAmostra, string> = {
  disponivel: "tag tag-blue",
  reservada: "tag tag-orange",
  "em ensaio": "tag tag-outline",
  utilizada: "tag tag-solid",
  "nao localizada": "tag tag-accent",
  arquivada: "tag tag-neutral",
};
export const classeStatus = (s: StatusAmostra) => STATUS_CLASSE[s] ?? "tag tag-neutral";
