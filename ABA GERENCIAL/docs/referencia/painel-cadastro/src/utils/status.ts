import type { StatusAmostra } from "../tipos/banco";

export const STATUS_ROTULO: Record<StatusAmostra, string> = {
  cadastrada: "Cadastrada",
  "em ensaio": "Em ensaio",
  utilizada: "Utilizada",
  arquivada: "Arquivada",
};
export const classeStatus = (s: StatusAmostra) =>
  ({ cadastrada: "tag tag-blue", "em ensaio": "tag tag-outline", utilizada: "tag tag-solid", arquivada: "tag tag-neutral" })[s];
