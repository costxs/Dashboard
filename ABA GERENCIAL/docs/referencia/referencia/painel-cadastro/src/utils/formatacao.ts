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
