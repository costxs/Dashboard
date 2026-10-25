// Formatação de números e datas no padrão brasileiro.

/** Formata número para exibição (vírgula decimal). */
export function fmt(v: unknown, casas = 2, cientifico = false): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (cientifico || (n !== 0 && (Math.abs(n) < 1e-3 || Math.abs(n) >= 1e6))) {
    return n.toExponential(2).replace(".", ",");
  }
  return n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

/** Número como está, com todas as casas decimais (sem arredondar), em formato pt-BR. */
export function fmtExato(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 12 });
}

/** Permeabilidade do fabricante: "30–50 mD" quando é faixa, "46 mD" quando é valor único. */
export function fmtPermFabricante(a: {
  permeabilidade_fabricante_min_md?: number | null;
  permeabilidade_fabricante_max_md?: number | null;
  permeabilidade_fabricante_md?: number | null;
}): string {
  const min = a.permeabilidade_fabricante_min_md ?? a.permeabilidade_fabricante_max_md ?? a.permeabilidade_fabricante_md;
  const max = a.permeabilidade_fabricante_max_md ?? min;
  if (min == null || max == null) return "—";
  return Number(min) === Number(max) ? `${fmt(min)} mD` : `${fmt(min)}–${fmt(max)} mD`;
}

/** Melhor permeabilidade disponível para a lista: k líquido antes, senão k gás, senão a do fabricante. */
export interface MelhorK { texto: string; origem: "líquido" | "gás" | "fabricante"; min: number; max: number }
export function melhorK(a: {
  k_liquido_md?: number | null;
  k_gas_md?: number | null;
  permeabilidade_fabricante_min_md?: number | null;
  permeabilidade_fabricante_max_md?: number | null;
  permeabilidade_fabricante_md?: number | null;
}): MelhorK | null {
  if (a.k_liquido_md != null) return { texto: fmt(a.k_liquido_md), origem: "líquido", min: Number(a.k_liquido_md), max: Number(a.k_liquido_md) };
  if (a.k_gas_md != null) return { texto: fmt(a.k_gas_md), origem: "gás", min: Number(a.k_gas_md), max: Number(a.k_gas_md) };
  const min = a.permeabilidade_fabricante_min_md ?? a.permeabilidade_fabricante_max_md ?? a.permeabilidade_fabricante_md;
  const max = a.permeabilidade_fabricante_max_md ?? min;
  if (min == null || max == null) return null;
  const [de, ate] = [Number(min), Number(max)];
  return { texto: de === ate ? fmt(de) : `${fmt(de)}–${fmt(ate)}`, origem: "fabricante", min: de, max: ate };
}

export function fmtData(v: unknown): string {
  if (!v) return "—";
  const s = String(v);
  const d = new Date(s.length === 10 ? `${s}T00:00` : s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("pt-BR");
}

/** Texto do input -> número (aceita vírgula e notação científica). NaN = inválido. */
export function paraNumero(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function mensagemErro(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
