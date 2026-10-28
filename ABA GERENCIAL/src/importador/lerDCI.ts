// =============================================================================
// Leitor do equipamento DCI (log .tsv do software do coreflood, aberto/convertido no Excel)
//
// Formato:
//   - cabeçalho "Chave <tab> Valor": Log Start Time (MM/DD/YYYY:h:mm:ss AM), Project Name
//     ("TESTE-D HCl[15 wt%] @0.5 T50"), Operator, Sample ID Core A/B, Diam/Length Core (in), Porosity Core (%),
//     Pore Volume Core (ml), Accum. 1..4 Viscosity (cP);
//   - tabela: Date, Time, Timestamp (hours), VPA n Volume Pumped / Pressure / Flow Rate, Oven Temp,
//     Core B Upstream/Downstream Pressure (PP1B/PP2B), Differential Pressure 1/2/3 (DP1B..DP3B),
//     Confining Pressure (PCB), Accum. 1..4 Vol (ml), Permeability 1B/2B (mD),
//     Differential Pressure Total (DPBtot) = DP1 + DP2 + DP3, Notes.
//   - o pesquisador costuma copiar a tabela para outra aba (ex.: "Planilha1", a partir da coluna C) e acrescentar
//     uma coluna com a separação: "Permeabilidade 1", "Água antes @0.08", "Ácido @0.08", "Água depois @3.00".
//
// Como vira o mesmo Ensaio do JBV (para os tratamentos de permeabilidade e acidificação servirem aos dois):
//   tempo_s   = Timestamp (hours) × 3600
//   q         = vazão da bomba de INJEÇÃO (a VPA que mais bombeou; as outras controlam pressão)
//   dp        = DPBtot (ou DP1 + DP2 + DP3 se não houver a coluna total) — opção: só DP1 + DP2
//   garrafas  = ACUMULADORES: o fluido em uso é o acumulador cujo "Accum. n Vol" está caindo
//   diâmetro e comprimento vêm em polegadas → cm (× 2,54)
// =============================================================================
import type { PlanilhaBruta } from "./planilhaAmostras";
import { chave } from "./planilhaAmostras";
import type { Ensaio, Leitura, Metadados } from "./tratamentoPermeabilidade";

export type FonteDpDCI = "total" | "dp1_dp2";

/** O DCI grava em formato americano (ponto decimal, sem separador de milhar). */
const n = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const x = Number(String(v).trim());
  return Number.isFinite(x) ? x : null;
};

/** "11/27/2024:8:56:27 AM" -> "27/11/2024 08:56:27" (formato dd/mm/aaaa que o resto do sistema usa) */
export function dataDCI(s: string | null | undefined): string | null {
  const m = s ? /(\d{1,2})\/(\d{1,2})\/(\d{4})\D+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?/i.exec(s) : null;
  if (!m) return null;
  let h = Number(m[4]);
  if (m[7]?.toUpperCase() === "PM" && h < 12) h += 12;
  if (m[7]?.toUpperCase() === "AM" && h === 12) h = 0;
  return `${m[2].padStart(2, "0")}/${m[1].padStart(2, "0")}/${m[3]} ${String(h).padStart(2, "0")}:${m[5]}:${m[6]}`;
}

/** "TESTE-D HCl[15 wt%] @0.5 T50" -> { amostra: "TESTE-D", sistema: "HCl[15 wt%]", q: 0.5, temperatura_c: 50 } */
export function lerNomeProjeto(s: string | null | undefined) {
  if (!s) return null;
  const q = /@\s*([\d.,]+)/.exec(s), t = /\bT\s*(\d+(?:[.,]\d+)?)\b/.exec(s);
  const partes = s.replace(/@\s*[\d.,]+/, "").replace(/\bT\s*\d+(?:[.,]\d+)?\b/, "").trim().split(/\s+/);
  return {
    amostra: partes[0] ?? null,
    sistema: partes.slice(1).join(" ") || null,
    q: q ? Number(q[1].replace(",", ".")) : null,
    temperatura_c: t ? Number(t[1].replace(",", ".")) : null,
  };
}

/** Planilha tem cara de DCI? */
export function ehDCI(bruta: PlanilhaBruta): boolean {
  return Object.values(bruta).some((m) => m.slice(0, 60).some((l) =>
    l?.some((v) => chave(v) === "timestamp hours") && l.some((v) => /^vpa \d+ flow rate/.test(chave(v)))));
}

/** Qual equipamento gerou o arquivo (para conferir com o seletor JBV | DCI da tela). */
export function detectarEquipamento(bruta: PlanilhaBruta): "JBV" | "DCI" | null {
  if (ehDCI(bruta)) return "DCI";
  const jbv = Object.values(bruta).some((m) => m.slice(0, 60).some((l) =>
    l?.some((v) => chave(v) === "tempo s") && l.some((v) => chave(v).startsWith("q cm"))));
  return jbv ? "JBV" : null;
}

interface CabecalhoDCI { meta: Metadados; core: "A" | "B"; pvEq: number | null; viscosidades: Record<number, number> }

function lerCabecalho(m: unknown[][], ate: number): CabecalhoDCI | null {
  const kv: Record<string, string> = {};
  for (let i = 0; i < ate; i++) {
    const l = m[i];
    const k = l?.find((v) => typeof v === "string" && v.trim() !== "") as string | undefined;
    if (!k) continue;
    const j = l!.indexOf(k);
    const v = l![j + 1];
    kv[chave(k)] = v == null ? "" : String(v).trim();
  }
  if (!("log start time" in kv) && !("sample id core b" in kv) && !("sample id core a" in kv)) return null;
  const temB = (kv["sample id core b"] ?? "") !== "" || (n(kv["diam core b in"]) ?? 0) > 0.05;
  const core: "A" | "B" = temB ? "B" : "A";
  const c = core.toLowerCase();
  const pol = (x: string | undefined) => { const v = n(x); return v != null && v > 0.05 ? v * 2.54 : null; };
  const viscosidades: Record<number, number> = {};
  for (let g = 1; g <= 4; g++) { const v = n(kv[`accum ${g} viscosity cp`]); if (v != null && v > 0) viscosidades[g] = v; }
  const proj = kv["project name"] || null;
  const meta: Metadados = {
    usuario: kv["operator"] || null,
    data: dataDCI(kv["log start time"]),
    amostra: (kv[`sample id core ${c}`] || lerNomeProjeto(proj)?.amostra || "").replace(/\s+/g, "").toUpperCase() || null,
    comprimento_cm: pol(kv[`length core ${c} in`]),
    diametro_cm: pol(kv[`diam core ${c} in`]),
    porosidade_pct: (n(kv[`porosity core ${c}`]) ?? 0) > 0 ? n(kv[`porosity core ${c}`]) : null,
    viscosidade_cp: null,
    fluido: lerNomeProjeto(proj)?.sistema ?? null,
    garrafas: {},
    outros: { "Project Name": proj ?? "", "Core": core, "Equipamento": "DCI" },
  };
  const pv = n(kv[`pore volume core ${c} ml`]);
  return { meta, core, pvEq: pv && pv > 0 ? pv : null, viscosidades };
}

/** Lê todas as abas DCI do arquivo. Abas com a separação do pesquisador vêm primeiro; abas sem cabeçalho
 *  (cópia da tabela) herdam o cabeçalho de outra aba do mesmo arquivo. */
export function lerEnsaiosDCI(bruta: PlanilhaBruta, op: { dp?: FonteDpDCI } = {}): Ensaio[] {
  const abas = Object.entries(bruta);
  let cabGlobal: CabecalhoDCI | null = null;
  const achados: { aba: string; m: unknown[][]; iCab: number; cab: CabecalhoDCI | null }[] = [];
  for (const [aba, m] of abas) {
    const iCab = m.findIndex((l) => l?.some((v) => chave(v) === "timestamp hours"));
    if (iCab < 0) continue;
    const cab = lerCabecalho(m, iCab);
    if (cab && !cabGlobal) cabGlobal = cab;
    achados.push({ aba, m, iCab, cab });
  }
  const ensaios: Ensaio[] = [];
  for (const { aba, m, iCab, cab: cab0 } of achados) {
    const cab = cab0 ?? cabGlobal;
    const avisos: string[] = [];
    if (!cab0 && cabGlobal) avisos.push(`a aba "${aba}" não tem o cabeçalho do equipamento: usei o da outra aba (amostra, dimensões, porosidade)`);
    if (!cab) avisos.push("arquivo sem o cabeçalho do DCI (Sample ID, Diam, Length, Porosity): informe as dimensões da amostra");
    const core = cab?.core ?? "B";
    const h = m[iCab].map((v) => chave(v));
    const idx = (f: (s: string) => boolean) => h.findIndex(f);
    const c = core.toLowerCase();
    const iT = idx((s) => s === "timestamp hours");
    const iHora = idx((s) => s === "time");
    const iTot = idx((s) => s.startsWith(`core ${c} differential pressure total`));
    const iDp = [1, 2, 3].map((k) => idx((s) => s.startsWith(`core ${c} differential pressure ${k} dp${k}${c}`)));
    const iUp = idx((s) => s.startsWith(`core ${c} upstream pressure`));
    const iDown = idx((s) => s.startsWith(`core ${c} downstream pressure`));
    const iPC = idx((s) => s.startsWith(`core ${c} confining pressure`));
    const iTemp = idx((s) => s.startsWith("oven temp"));
    const iK = idx((s) => s === `permeability 1${c} md`);
    const iRot = h.findIndex((s, j) => /^(coluna ?\d+|column ?\d+|etapa|fase|notes)$/.test(s) &&
      m.slice(iCab + 1).some((l) => typeof l?.[j] === "string" && /permeab|@/i.test(l[j] as string)));
    const acc: Record<number, number> = {};
    for (let g = 1; g <= 4; g++) { const j = idx((s) => s === `accum ${g} vol ml`); if (j >= 0) acc[g] = j; }
    // bomba de injeção: a VPA que mais bombeou
    const bombas: { k: number; vol: number; q: number }[] = [];
    h.forEach((s, j) => {
      const b = /^vpa (\d+) volume pumped ml$/.exec(s);
      if (!b) return;
      const jq = idx((x) => x === `vpa ${b[1]} flow rate ml min`);
      const vs = m.slice(iCab + 1).map((l) => n(l?.[j])).filter((x): x is number => x != null);
      bombas.push({ k: Number(b[1]), vol: vs.length ? Math.max(...vs) - Math.min(...vs) : 0, q: jq });
    });
    const bomba = bombas.sort((a, b) => b.vol - a.vol)[0];
    if (!bomba || bomba.q < 0) { avisos.push("não achei a vazão da bomba de injeção (VPA n Flow Rate)"); continue; }
    if (op.dp === "dp1_dp2" && (iDp[0] < 0 || iDp[1] < 0)) avisos.push("colunas DP1/DP2 não encontradas: usei o ΔP total");

    const leituras: Leitura[] = [];
    let usados: Set<number> = new Set();
    for (let i = iCab + 1; i < m.length; i++) {
      const l = m[i];
      const th = n(l?.[iT]);
      if (th == null) continue;
      const parc = iDp.map((j) => (j >= 0 ? n(l[j]) : null));
      let dp: number | null;
      if (op.dp === "dp1_dp2" && parc[0] != null && parc[1] != null) dp = parc[0] + parc[1];
      else dp = iTot >= 0 ? n(l[iTot]) : parc.every((x) => x != null) ? (parc as number[]).reduce((s, x) => s + x, 0) : null;
      const up = iUp >= 0 ? n(l[iUp]) : null, down = iDown >= 0 ? n(l[iDown]) : null;
      const garrafas: Leitura["garrafas"] = {};
      for (const [g, j] of Object.entries(acc)) garrafas[Number(g)] = { nome: null, atual: n(l[j]), parcial: null };
      const k = iK >= 0 ? n(l[iK]) : null;
      leituras.push({
        linha: i + 1, tempo_s: th * 3600, hora: iHora >= 0 && l[iHora] != null ? String(l[iHora]) : null,
        q: n(l[bomba.q]) ?? 0, dp, dp_abs: up != null && down != null ? up - down : null,
        p_confinamento: iPC >= 0 ? n(l[iPC]) : null, p_backpressure: down,
        temperatura: iTemp >= 0 ? n(l[iTemp]) : null, k_equipamento: k != null && k > 0 ? k : null,
        volumes: {}, garrafas, rotulo: iRot >= 0 && typeof l[iRot] === "string" ? (l[iRot] as string).trim() || null : null,
      });
    }
    if (!leituras.length) continue;
    // viscosidade: a do acumulador que mais esvaziou
    if (cab) {
      let melhor: number | null = null, dv = 0;
      for (const g of Object.keys(acc).map(Number)) {
        const vs = leituras.map((x) => x.garrafas?.[g]?.atual).filter((x): x is number => x != null);
        const d = vs.length ? vs[0] - Math.min(...vs) : 0;
        if (d > dv) { dv = d; melhor = g; }
      }
      usados = new Set(melhor != null ? [melhor] : []);
      const meta = { ...cab.meta, outros: { ...cab.meta.outros, "Bomba de injeção": `VPA ${bomba.k}` } };
      meta.viscosidade_cp = [...usados].map((g) => cab.viscosidades[g]).find((x) => x != null) ?? Object.values(cab.viscosidades)[0] ?? null;
      leituras.forEach((x) => { x.volume_poroso_eq_cm3 = cab.pvEq; });
      ensaios.push({ aba, metadados: meta, holder: "H1", leituras, avisos, equipamento: "DCI" } as Ensaio);
    } else {
      ensaios.push({ aba, metadados: { garrafas: {}, outros: { Equipamento: "DCI" } }, holder: "H1", leituras, avisos, equipamento: "DCI" } as Ensaio);
    }
  }
  // a aba com a separação do pesquisador primeiro
  return ensaios.sort((a, b) => Number(b.leituras.some((x) => x.rotulo)) - Number(a.leituras.some((x) => x.rotulo)));
}
