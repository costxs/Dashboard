// O que o CONTROLE DE ROCHAS (planilha importada pelo gerencial) diz sobre uma amostra que ainda
// não tem o ensaio lançado: condições do RDA no texto de Utilização e amostra já acidificada.
// Só leitura. Cópia de "ABA GERENCIAL/src/utils/controleRochas.ts" (e de lerUtilizacao, de
// "ABA GERENCIAL/src/importador/planilhaAmostras.ts"); se mudar uma regra, mude lá também.
import { fmt } from "./formatacao";

export interface CondicoesRda {
  texto: string;
  ensaio: string | null;
  acido: string | null;
  concentracao: number | null;
  unidade: string | null;
  temperatura_c: number | null;
  rotacao_rpm: number | null;
}

function numero(s: string | undefined): number | null {
  if (s == null) return null;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "TR - HCl [0,5M] - Indiana - 25 °C @100" -> partes. */
function lerUtilizacao(s: string): CondicoesRda {
  const partes = s.split(/\s+-\s+/).map((p) => p.trim());
  const conc = /\[\s*([\d.,]+)\s*([a-z%/ ]*)\]/i.exec(s);
  const acido = /([A-Za-zÀ-ú][A-Za-zÀ-ú0-9 +]*?)\s*\[/.exec(s);
  const temp = /([\d.,]+)\s*°\s*C/i.exec(s);
  const rpm = /@\s*([\d.,]+)/.exec(s);
  return {
    texto: s,
    ensaio: partes.length > 1 && !/\[/.test(partes[0]) ? partes[0] : null,
    acido: acido ? acido[1].trim() : null,
    concentracao: numero(conc?.[1]),
    unidade: conc ? (conc[2].trim() || null) : null,
    temperatura_c: numero(temp?.[1]),
    rotacao_rpm: numero(rpm?.[1]),
  };
}

/** Condições do RDA lidas de "Utilização: TR - HCl [15%] - Silurian - 60 °C @500" nas observações. */
export function condicoesRdaDoControle(observacoes: string | null | undefined): CondicoesRda | null {
  const texto = /Utilização:\s*(.+)$/s.exec(observacoes ?? "")?.[1]?.trim();
  if (!texto) return null;
  const c = lerUtilizacao(texto);
  return c.acido || c.temperatura_c != null || c.rotacao_rpm != null ? c : null;
}

/** "TR · HCl 15 % · 60 °C · 500 rpm" */
export function descreverCondicoes(c: CondicoesRda): string {
  const acido = [c.acido, c.concentracao != null ? `${fmt(c.concentracao, 4)} ${c.unidade ?? ""}`.trim() : null].filter(Boolean).join(" ");
  return [
    c.ensaio,
    acido,
    c.temperatura_c != null && `${fmt(c.temperatura_c, 1)} °C`,
    c.rotacao_rpm != null && `${fmt(c.rotacao_rpm, 0)} rpm`,
  ].filter(Boolean).join(" · ");
}

/** Amostra de coreflooding que o controle marca como já usada: "utilizada", "acidificada" ou as duas. null = não é o caso. */
export function marcasDeCoreflooding(a: { finalidade?: string | null; status?: string | null }, observacoes: string | null | undefined): string | null {
  if ((a.finalidade ?? "").trim().toLowerCase() !== "coreflooding") return null;
  const marcas = [a.status === "utilizada" && "utilizada", /acidificad/i.test(observacoes ?? "") && "acidificada"].filter(Boolean);
  return marcas.length > 0 ? marcas.join("/") : null;
}

/** "Disco · RDA" / "Plug · coreflooding" */
export function rotuloFinalidade(finalidade: string | null | undefined): string | null {
  const f = (finalidade ?? "").trim();
  if (!f) return null;
  if (f.toLowerCase() === "rda") return "Disco · RDA";
  if (f.toLowerCase() === "coreflooding") return "Plug · coreflooding";
  return f;
}
