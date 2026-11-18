// O que o CONTROLE DE ROCHAS (planilha importada pelo gerencial) diz sobre uma amostra:
// condições do RDA/Reatividade/Coreflooding no texto de Utilização/Observações.
// Só leitura. Cópia sincronizada entre src/utils/controleRochas.ts e ABA GERENCIAL.
import { fmt } from "./formatacao";

export interface CondicoesRda {
  texto: string;
  ensaio: string | null;
  acido: string | null;
  concentracao: number | null;
  unidade: string | null;
  temperatura_c: number | null;
  rotacao_rpm: number | null;
  volume_ml?: number | null;
  vazao_ml_min?: number | null;
  aditivo?: string | null;
  repeticao?: string | null;
  situacao_planilha?: string | null;
}

function numero(s: string | undefined): number | null {
  if (s == null) return null;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "TR - HCl [0,5M] - Indiana - 25 °C @100" ou "D.D HCl 15 wt% - @100 - T45" -> partes estruturadas. */
export function lerUtilizacao(s: string): CondicoesRda {
  const partes = s.split(/\s+-\s+/).map((p) => p.trim());
  const conc = /\[\s*([\d.,]+)\s*([a-z%/ ]*)\]/i.exec(s);
  const acidoBruto = conc ? /([A-Za-zÀ-ú][A-Za-zÀ-ú0-9 +.]*?)\s*\[/.exec(s)?.[1]?.trim() ?? null : null;
  const semColchete = !conc
    ? /\b(HCl|HAc|GLDA|MAS|MSA|EDTA|HF|[ÁA]cido\s+[A-Za-zÀ-ú]+)\s+([\d.,]+)\s*(wt\s*%|vol\s*%|%|M|N|mM)\b/i.exec(s)
    : null;
  const prefixoEnsaio = /^\s*(TR|RDA|D\.\s*D|D\.\s*E)\b[\s\-:]*/i.exec(s)?.[1]?.replace(/\s+/g, "") ?? null;
  let acido = acidoBruto
    ? acidoBruto.replace(/^(?:TR|RDA|D\.\s*D|D\.\s*E|Acidifica[cç][aã]o\s+com)\b[\s\-:]*/i, "").trim()
    : semColchete
      ? semColchete[1].trim()
      : /\bFluxo\s+reativo\s+(EDTA|HCl|GLDA)\b/i.exec(s)?.[1]?.trim() ?? null;
  if (acido && /^hcl$/i.test(acido)) acido = "HCl";
  else if (acido && /^hac$/i.test(acido)) acido = "Ácido acético";

  const temp =
    /(?:^|[\s\-(])T\s*([\d.,]+)\s*(?:°?\s*C)?(?=$|[\s\-)\[])/i.exec(s) ??
    /(?:^|[\s\-(])([\d.,]+)\s*(?:°\s*C|C\b)(?=$|[\s\-)\[])/i.exec(s);

  const isCoreflood = /acidifica[cç][aã]o|ml\/min/i.test(s);
  const atMatch = /@\s*([\d.,]+)\s*(ml\/min)?/i.exec(s);
  const rotacao_rpm = !isCoreflood && atMatch && !atMatch[2] ? numero(atMatch[1]) : null;
  const vazao_ml_min = (isCoreflood && atMatch) || atMatch?.[2] ? numero(atMatch?.[1]) : null;
  const volume_ml = numero(/(\d+(?:[.,]\d+)?)\s*ml\b(?!\/min)/i.exec(s)?.[1]);
  const aditivo = /\+\s*([^@\-T[\]]+(?:\([^)]+\))?\s*[\d.,]*\s*%?)/i.exec(s)?.[1]?.trim() ?? null;

  const rep: string[] = [];
  if (/duplicata/i.test(s)) rep.push("Duplicata");
  if (/triplicata/i.test(s)) rep.push("Triplicata");
  if (/\berro\b/i.test(s)) rep.push("Erro reportado");
  if (/\(teste\)/i.test(s)) rep.push("Teste");

  let situacao_planilha: string | null = null;
  if (/n[aã]o consta no estoque/i.test(s)) situacao_planilha = "Não consta no estoque";
  else if (/reservad[ao]/i.test(s)) situacao_planilha = s.trim();
  else if (/mini\s*plug/i.test(s)) situacao_planilha = s.trim();

  const ensaio =
    (partes.length > 1 && !/\[/.test(partes[0]) && !/\b(HCl|HAc|EDTA|GLDA)\b/i.test(partes[0]) ? partes[0] : null) ??
    prefixoEnsaio ??
    (/TESTE\s+EST[ÁA]TICO/i.test(s) ? "D.E" : /Fluxo\s+reativo/i.test(s) ? "Fluxo reativo" : isCoreflood ? "Coreflooding" : null);

  return {
    texto: s,
    ensaio,
    acido,
    concentracao: numero(conc?.[1] ?? semColchete?.[2]),
    unidade: conc ? (conc[2].trim() || null) : semColchete ? (semColchete[3].replace(/\s+/g, "") || null) : null,
    temperatura_c: numero(temp?.[1]),
    rotacao_rpm,
    volume_ml,
    vazao_ml_min,
    aditivo,
    repeticao: rep.length ? rep.join(" · ") : null,
    situacao_planilha,
  };
}

/** Condições do RDA lidas de "Utilização: TR - HCl [15%] - Silurian - 60 °C @500" nas observações. */
export function condicoesRdaDoControle(observacoes: string | null | undefined): CondicoesRda | null {
  const texto = /Utilização:\s*(.+)$/s.exec(observacoes ?? "")?.[1]?.trim();
  if (!texto) return null;
  const c = lerUtilizacao(texto);
  return c.acido || c.temperatura_c != null || c.rotacao_rpm != null ? c : null;
}

/** Interpreta qualquer observação da planilha (Utilização de RDA, Dissolução Estática, Coreflooding ou Reserva/Estoque). */
export function interpretarObservacaoPlanilha(observacoes: string | null | undefined): CondicoesRda | null {
  if (!observacoes?.trim()) return null;
  const limpo = observacoes.replace(/^Utiliza[cç][aã]o:\s*/i, "").trim();
  if (!limpo) return null;
  return lerUtilizacao(limpo);
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

/** Ensaios da finalidade: um ou vários, separados por vírgula ("Petrofísica, coreflooding"; aceita ; e +). */
function partesDaFinalidade(finalidade: string | null | undefined): string[] {
  return (finalidade ?? "").split(/\s*[,;+]\s*/).map((s) => s.trim()).filter(Boolean);
}

/** Amostra de coreflooding que o controle marca como já usada: "utilizada", "acidificada" ou as duas. null = não é o caso. */
export function marcasDeCoreflooding(a: { finalidade?: string | null; status?: string | null }, observacoes: string | null | undefined): string | null {
  if (!partesDaFinalidade(a.finalidade).some((p) => p.toLowerCase() === "coreflooding")) return null;
  const marcas = [a.status === "utilizada" && "utilizada", /acidificad/i.test(observacoes ?? "") && "acidificada"].filter(Boolean);
  return marcas.length > 0 ? marcas.join("/") : null;
}

/** "Disco · RDA" / "Plug · coreflooding" */
export function rotuloFinalidade(finalidade: string | null | undefined): string | null {
  const partes = partesDaFinalidade(finalidade).map((f) => {
    if (f.toLowerCase() === "rda") return "Disco · RDA";
    if (f.toLowerCase() === "coreflooding") return "Plug · coreflooding";
    return f;
  });
  return partes.length ? partes.join(", ") : null;
}
