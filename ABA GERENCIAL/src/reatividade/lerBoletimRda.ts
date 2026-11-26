// =============================================================================
// Leitor do "Boletim de ensaios e resultados de experimentos de REATIVIDADE" (dissolução dinâmica, RDA).
// O boletim é uma planilha com rótulos em posições quase fixas; o leitor procura pelo TEXTO do rótulo
// (não pela célula), então aguenta linhas a mais ou a menos. Lê:
//   - cabeçalho: código do disco (canto superior direito), data, estudo, operadores, quem fez o boletim, início/fim;
//   - condições: temperatura, rotação, volume de ácido, massas antes/depois, número de coletas;
//   - petrofísica: diâmetro, comprimento, K, φ (linha abaixo de "Plugue");
//   - fluido: nome, wt%, densidade, massa molar;
//   - calibração: "Abs = 0.0219[Ca2+]", diluição e massa molar (Ca e, na dolomita, Mg);
//   - tabelas "Amostra | Tempo (s) | Absorção (ua) | …" (a 1ª é do Ca; a que fala de Mg2+ é do Mg);
//   - os RESULTADOS que a planilha calculou (para conferir com o cálculo do sistema).
// Uso:  const b = lerBoletimRda(await lerArquivoBruto(arquivo))   ->  b.entrada vai direto para calcularBoletim()
// =============================================================================
import { concentracaoInicialMolL, type Calibracao, type EntradaBoletim, type LeituraRda, type Mineral } from "./calculoRda";

type Linhas = unknown[][];
export interface BoletimLido {
  aba: string;
  codigo: string | null;
  litologia_texto: string | null;
  mineral: Mineral;
  estudo: string | null; operadores: string | null; boletim_por: string | null; observacoes: string | null;
  data_inicio: string | null; data_fim: string | null; data_boletim: string | null;
  temperatura_c: number | null; rotacao_rpm: number | null; volume_acido_ml: number | null; n_coletas: number | null;
  comprimento_cm: number | null; permeabilidade_md: number | null;
  fluido: string | null; conc_wt_pct: number | null; densidade_g_ml: number | null; massa_molar_fluido: number | null;
  /** o que a própria planilha calculou (para conferência) */
  planilha: { taxa?: number | null; taxa_so_ca?: number | null; taxa_ca_mg?: number | null; c0_mol_l?: number | null; area_corrigida_cm2?: number | null };
  extras: Record<string, string>;
  entrada: EntradaBoletim | null;
  problemas: { severidade: "ERRO" | "AVISO"; campo: string; mensagem: string }[];
}

const txt = (v: unknown) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());
const norm = (v: unknown) => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = txt(v).replace(/\s/g, "");
  const n = Number(/,\d+$/.test(s) && !/\.\d{3},/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
/** data do Excel (número serial ou Date) -> "aaaa-mm-dd" */
function data(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(txt(v));
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function achar(linhas: Linhas, re: RegExp, aPartirDe = 0): { l: number; c: number } | null {
  for (let l = aPartirDe; l < linhas.length; l++) for (let c = 0; c < (linhas[l]?.length ?? 0); c++) if (re.test(norm(linhas[l][c]))) return { l, c };
  return null;
}
/** valor na 1ª célula preenchida à direita do rótulo */
function aoLado(linhas: Linhas, re: RegExp, aPartirDe = 0): unknown {
  const p = achar(linhas, re, aPartirDe);
  if (!p) return null;
  const linha = linhas[p.l];
  for (let c = p.c + 1; c < linha.length; c++) if (linha[c] != null && txt(linha[c]) !== "") return linha[c];
  return null;
}
/** "*Curva de calibração em 13/09/2024" entre as linhas de e até */
function dataCalibracao(linhas: Linhas, de: number, ate: number): string | null {
  for (let l = Math.max(0, de); l < Math.min(ate, linhas.length); l++)
    for (const v of linhas[l] ?? []) { const m = /calibra\S* em (\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(txt(v)); if (m) return data(m[1]); }
  return null;
}
const inclinacaoDe = (s: unknown) => num(/=\s*([\d.,]+)\s*\[/.exec(txt(s))?.[1]);

export function lerBoletimRda(bruta: Record<string, unknown[][]>, opcoes: { aba?: string } = {}): BoletimLido {
  const aba = opcoes.aba ?? Object.keys(bruta).find((n) => achar(bruta[n], /tempo \(s\)/) && achar(bruta[n], /absorc/)) ?? Object.keys(bruta)[0];
  const L = bruta[aba] ?? [];
  const problemas: BoletimLido["problemas"] = [];
  const erro = (campo: string, mensagem: string) => problemas.push({ severidade: "ERRO", campo, mensagem });
  const aviso = (campo: string, mensagem: string) => problemas.push({ severidade: "AVISO", campo, mensagem });

  // título: "... para amostras de Silurian" ; código no canto superior direito
  const titulo = achar(L, /boletim de ensaios/);
  const litologia = titulo ? (/para amostras? de (.+)$/i.exec(txt(L[titulo.l][titulo.c]))?.[1] ?? null) : null;
  let codigo: string | null = null, dataBoletim: string | null = null;
  for (let l = 0; l < Math.min(4, L.length) && !codigo; l++) {
    const cel = (L[l] ?? []).map(txt).filter(Boolean);
    const c = cel.find((x) => /^[A-Z]{1,5}-?\d{1,5}[A-Z]?$/i.test(x));
    if (c) { codigo = c.toUpperCase(); dataBoletim = data(L[l + 1]?.find((v) => data(v))); }
  }
  if (!codigo) aviso("codigo", "não achei o código do disco no canto superior direito: informe na tela");

  // petrofísica: linha abaixo de "Plugue" com Diâmetro | Comprimento | K exp | ϕ ; valores 2 linhas abaixo (há a linha de unidades)
  let diametro: number | null = null, comprimento: number | null = null, k: number | null = null, phi: number | null = null;
  const pl = achar(L, /^plugue$/);
  if (pl) {
    const cab = L[pl.l].map(norm);
    const col = (re: RegExp) => cab.findIndex((x) => re.test(x));
    // a linha dos valores é a primeira abaixo com número na coluna do diâmetro (a de baixo do título é a das unidades)
    const linhaValores = [pl.l + 1, pl.l + 2, pl.l + 3].map((i) => L[i] ?? []).find((r) => num(r[col(/diametro/)]) != null) ?? [];
    diametro = num(linhaValores[col(/diametro/)]); comprimento = num(linhaValores[col(/comprimento/)]);
    k = num(linhaValores[col(/^k/)]); phi = num(linhaValores[col(/^(ϕ|φ|phi|porosidade)/)]);
  }
  const diamRes = num(aoLado(L, /diametro do disco/));
  if (diametro == null) diametro = diamRes;
  if (diametro == null) erro("diametro_cm", "sem diâmetro do disco");
  if (phi == null) aviso("porosidade_pct", "sem porosidade (ϕ): a área não será corrigida");
  if (phi != null && phi < 1) { aviso("porosidade_pct", `ϕ = ${phi} parece fração: usado ${phi * 100} %`); phi *= 100; }

  const wt = num(aoLado(L, /^concentracao \(wt%\)/)), rho = num(aoLado(L, /^densidade/)), mmFluido = num(aoLado(L, /^massa molar fluido/));
  const c0Planilha = num(aoLado(L, /^concentracao inicial do fluido/));
  const c0 = wt != null && mmFluido && rho ? concentracaoInicialMolL(wt, mmFluido, rho) : c0Planilha;
  if (c0 == null) erro("c0", "sem concentração inicial do ácido (wt%, densidade e massa molar)");

  // calibrações: a 1ª "Diluição das amostras" é a do Ca; a que vem depois da equação do Mg é a do Mg
  const eqCa = achar(L, /curva de calibracao de ca/), eqMg = achar(L, /curva de calibracao de mg/);
  const calCa: Calibracao | null = eqCa ? {
    inclinacao: inclinacaoDe(aoLado(L, /curva de calibracao de ca/)) ?? NaN,
    diluicao: num(aoLado(L, /^diluicao das amostras/)) ?? 1,
    massaMolar: num(aoLado(L, /^massa molar ca/)) ?? 40.078,
    data: dataCalibracao(L, 0, eqMg ? eqMg.l - 2 : L.length),
  } : null;
  if (!calCa || !Number.isFinite(calCa.inclinacao)) erro("calibracao_ca", 'não achei "Abs = k[Ca2+]" na equação da curva de calibração do Ca');
  let calMg: Calibracao | null = null;
  if (eqMg) {
    const dil = achar(L, /^diluicao das amostras/, eqMg.l - 2);
    calMg = {
      inclinacao: inclinacaoDe(aoLado(L, /curva de calibracao de mg/)) ?? NaN,
      diluicao: dil && dil.l >= eqMg.l - 2 && dil.l <= eqMg.l + 2 ? num(aoLado(L, /^diluicao das amostras/, dil.l)) ?? 1 : 1,
      massaMolar: num(aoLado(L, /^massa molar mg/)) ?? 24.305,
      data: dataCalibracao(L, eqMg.l - 1, eqMg.l + 2),
    };
    if (!Number.isFinite(calMg.inclinacao)) { erro("calibracao_mg", 'não achei "Abs = k[Mg2+]"'); calMg = null; }
  }

  // tabelas de leitura
  const tabelas: { ion: "ca" | "mg"; linhas: { rotulo: string | null; tempo: number; abs: number | null }[] }[] = [];
  for (let l = 0; l < L.length; l++) {
    const cab = (L[l] ?? []).map(norm);
    const cT = cab.findIndex((x) => /^tempo \(s\)/.test(x)), cA = cab.findIndex((x) => /^absorc/.test(x));
    if (cT < 0 || cA < 0) continue;
    const ion: "ca" | "mg" = cab.some((x) => /mg2\+/.test(x)) ? "mg" : "ca";
    const cR = cab.findIndex((x) => /^amostra/.test(x));
    const linhas: { rotulo: string | null; tempo: number; abs: number | null }[] = [];
    for (let i = l + 1; i < L.length; i++) {
      const t = num(L[i]?.[cT]);
      if (t == null) break;
      linhas.push({ rotulo: cR >= 0 ? txt(L[i][cR]) || null : null, tempo: t, abs: num(L[i][cA]) });
    }
    tabelas.push({ ion, linhas });
    l += linhas.length;
  }
  const tCa = tabelas.find((t) => t.ion === "ca"), tMg = tabelas.find((t) => t.ion === "mg");
  if (!tCa?.linhas.length) erro("leituras", 'não achei a tabela "Tempo (s) | Absorção (ua)" do Ca');
  const leituras: LeituraRda[] = (tCa?.linhas ?? []).map((r) => ({
    tempo_s: r.tempo, abs_ca: r.abs, rotulo: r.rotulo,
    abs_mg: tMg?.linhas.find((m) => m.tempo === r.tempo)?.abs ?? null,
  }));
  if (tMg && tMg.linhas.length !== (tCa?.linhas.length ?? 0)) aviso("leituras", "as tabelas de Ca e Mg têm números de coletas diferentes: casadas pelo tempo");

  const mineral: Mineral = tMg || /silurian|dolom/i.test(litologia ?? "") ? "dolomita" : "calcita";
  const resultadoTaxa = (re: RegExp) => num(aoLado(L, re));
  const entrada: EntradaBoletim | null = diametro != null && c0 != null && calCa && Number.isFinite(calCa.inclinacao) && leituras.length
    ? { mineral, diametro_cm: diametro, porosidade_pct: phi, c0_mol_l: c0, calCa, calMg, leituras,
        massa_antes_g: num(aoLado(L, /^massa antes/)), massa_depois_g: num(aoLado(L, /^massa depois/)), volume_acido_ml: num(aoLado(L, /^volume de acido/)) }
    : null;

  const extras: Record<string, string> = {};
  for (const [rot, re] of [["Saturação", /^saturacao/], ["Secagem", /^secagem/], ["Corte", /^corte/], ["Pré-tratamento", /^pre-tratamento/]] as const) {
    const v = txt(aoLado(L, re)); if (v) extras[rot] = v;
  }
  return {
    aba, codigo, litologia_texto: litologia, mineral,
    estudo: txt(aoLado(L, /^estudo/)) || txt(aoLado(L, /^nome do experimento/)) || null,
    operadores: txt(aoLado(L, /^operadores/)) || null, boletim_por: txt(aoLado(L, /^boletim feito por/)) || null,
    observacoes: txt(aoLado(L, /^observacoes/)) || null,
    data_inicio: data(aoLado(L, /^inicio do experimento/)), data_fim: data(aoLado(L, /^fim do experimento/)), data_boletim: dataBoletim,
    temperatura_c: num(aoLado(L, /^temperatura/)), rotacao_rpm: num(aoLado(L, /^rotacao/)), volume_acido_ml: num(aoLado(L, /^volume de acido/)),
    n_coletas: num(aoLado(L, /^numero de amostras coletadas/)), comprimento_cm: comprimento, permeabilidade_md: k,
    fluido: txt(aoLado(L, /^fluido:/)) || null, conc_wt_pct: wt, densidade_g_ml: rho, massa_molar_fluido: mmFluido,
    planilha: {
      taxa: resultadoTaxa(/^taxa de reacao \(mol/), taxa_so_ca: resultadoTaxa(/^taxa de reacao so com ca/),
      taxa_ca_mg: resultadoTaxa(/^taxa de reacao com ca e mg/), c0_mol_l: c0Planilha, area_corrigida_cm2: num(aoLado(L, /^area inicial de reacao/)),
    },
    extras, entrada, problemas,
  };
}
