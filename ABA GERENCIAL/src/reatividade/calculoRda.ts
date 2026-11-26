// =============================================================================
// Dissolução dinâmica (RDA — disco rotativo): as contas do laboratório, iguais às planilhas
// (boletim de cada disco, "Resultados DD - média e desvio" e "Cálculo TR & De" da dissertação).
//
//   1. Boletim (um disco, uma rotação): absorbância do Ca²⁺ (e do Mg²⁺ na dolomita) a cada coleta
//        [Ca] diluído (mg/L) = (Abs − Abs₀) / inclinação da curva de calibração
//        [Ca] real (mol/L)   = [Ca] diluído × fator de diluição / (1000 × massa molar do Ca)
//        [H⁺] (mol/L)        = C₀ − 2·[Ca]            (calcita: CaCO₃ + 2H⁺)
//                            = C₀ − 4·[Ca]            (dolomita, só Ca medido: CaMg(CO₃)₂ + 4H⁺)
//                            = C₀ − 2·[Ca] − 2·[Mg]   (dolomita com Ca e Mg medidos)
//        TR = 2 × (− inclinação de [H⁺] × tempo) / área corrigida,  área corrigida = π·d²/4 / (1 − φ)
//   2. Série (mesma rocha, fluido e temperatura em 100, 200, 500 rpm): média e desvio das réplicas;
//        inclinação ("slope") da reta TR × √ω (ω em rad/s), por mínimos quadrados com intercepto (=SLOPE do Excel)
//   3. Levich estendido (Newman) para o disco rotativo:
//        [ (0,62048·C₀·ν^0,5 / slope − 0,1451) · Sc^(−2/3) − 0,298 · Sc^(−1/3) ] = 1
//      O laboratório achava Sc com o Solver. Com x = Sc^(−1/3) a equação é do 2º grau:
//        (a − 0,1451)·x² − 0,298·x − 1 = 0,   a = 0,62048·C₀·ν^0,5 / slope
//      então Sc sai direto (mesmo valor do Solver, sem chute inicial):  x = [0,298 + √(0,298² + 4(a − 0,1451))] / [2(a − 0,1451)]
//   4. D = ν / Sc   (C₀ em mol/cm³, ν em cm²/s, D em cm²/s)
// =============================================================================

export type Mineral = "calcita" | "dolomita";
export type Severidade = "ERRO" | "AVISO";
export interface Aviso { severidade: Severidade; campo: string; mensagem: string }

/** ω em rad/s. O laboratório usava rpm × 0,1047; o exato é rpm × 2π/60 (diferença de 0,02 %). */
export function omega(rpm: number, modo: "exato" | "planilha" = "exato") {
  return modo === "planilha" ? rpm * 0.1047 : (rpm * 2 * Math.PI) / 60;
}

/** C₀ (mol/L) = wt% / MM × 10 × ρ  (célula "Concentração inicial do fluido" do boletim) */
export const concentracaoInicialMolL = (wtPct: number, massaMolar: number, densidadeGmL: number) => (wtPct / massaMolar) * 10 * densidadeGmL;

export const areaDisco = (diametroCm: number) => Math.PI * (diametroCm / 2) ** 2;
/** "Área inicial de reação (corrigida com a porosidade)" = π·d²/4 / (1 − φ) */
export const areaCorrigida = (diametroCm: number, porosidadePct: number | null) => areaDisco(diametroCm) / (1 - (porosidadePct ?? 0) / 100);

/** reta y = a + b·x por mínimos quadrados (=SLOPE / INTERCEPT / RSQ do Excel) */
export function reta(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
  if (sxx === 0) return null;
  const inclinacao = sxy / sxx;
  return { inclinacao, intercepto: my - inclinacao * mx, r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 1, n };
}

export const media = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
/** desvio padrão amostral (=DESVPAD.A / STDEV.S) */
export const desvio = (v: number[]) => (v.length < 2 ? 0 : Math.sqrt(v.reduce((s, x) => s + (x - media(v)) ** 2, 0) / (v.length - 1)));

// ---------------------------------------------------------------------------
// 1. Boletim de um disco
// ---------------------------------------------------------------------------
export interface Calibracao {
  /** inclinação da curva "Abs = k·[íon]" (k em L/mg) */
  inclinacao: number;
  /** fator de diluição da amostra coletada (a célula "Diluição das amostras (mL)") */
  diluicao: number;
  massaMolar: number;
  data?: string | null;
}
export interface LeituraRda { tempo_s: number; abs_ca: number | null; abs_mg?: number | null; rotulo?: string | null }

export interface EntradaBoletim {
  mineral: Mineral;
  diametro_cm: number;
  porosidade_pct: number | null;
  c0_mol_l: number;
  calCa: Calibracao;
  calMg?: Calibracao | null;
  leituras: LeituraRda[];
  /** usa só as leituras até este tempo (o cálculo da dissertação usava 0–10 min; os boletins, 0–30 min) */
  tempoMaximo_s?: number | null;
  massa_antes_g?: number | null;
  massa_depois_g?: number | null;
  volume_acido_ml?: number | null;
}

export interface PontoCalculado extends LeituraRda { ca_mg_l: number | null; ca_mol_l: number | null; mg_mol_l: number | null; h_mol_l: number | null; h_so_ca_mol_l: number | null; usado: boolean }

export interface ResultadoBoletim {
  pontos: PontoCalculado[];
  area_cm2: number; area_corrigida_cm2: number;
  /** taxa principal: na dolomita é a "só com Ca" (a usada na planilha de coeficiente de difusão) */
  taxa_reacao: number | null;
  taxa_so_ca: number | null;
  taxa_ca_mg: number | null;
  inclinacao_h: number | null; r2_h: number | null; n_pontos: number;
  perda_massa_pct: number | null;
  /** conferência: |d[H⁺]/dt| × V / área corrigida (mol de H⁺ por cm² por s). Ver ANALISE.md */
  taxa_balanco_h: number | null;
  avisos: Aviso[];
}

export function calcularBoletim(e: EntradaBoletim): ResultadoBoletim {
  const avisos: Aviso[] = [];
  const av = (campo: string, mensagem: string, severidade: Severidade = "AVISO") => avisos.push({ severidade, campo, mensagem });
  const ord = [...e.leituras].filter((l) => Number.isFinite(l.tempo_s)).sort((a, b) => a.tempo_s - b.tempo_s);
  if (!ord.length) av("leituras", "nenhuma leitura", "ERRO");
  const zero = ord[0];
  if (zero && zero.tempo_s !== 0) av("leituras", "a primeira leitura não é no tempo 0: ela foi usada como branco (Abs₀)");
  const ion = (abs: number | null | undefined, abs0: number | null | undefined, cal: Calibracao) =>
    abs == null ? null : (abs - (abs0 ?? 0)) / cal.inclinacao;
  const temMg = !!e.calMg && ord.some((l) => l.abs_mg != null);
  if (e.mineral === "dolomita" && !e.calMg) av("calMg", "dolomita sem leitura de Mg: a taxa usa só o Ca (4 H⁺ por Ca)");

  const pontos: PontoCalculado[] = ord.map((l, i) => {
    const caMgL = i === 0 ? null : ion(l.abs_ca, zero.abs_ca, e.calCa);
    const caMolL = caMgL == null ? (i === 0 ? 0 : null) : (caMgL * e.calCa.diluicao) / (1000 * e.calCa.massaMolar);
    const mgMgL = i === 0 || !temMg ? null : ion(l.abs_mg, zero.abs_mg, e.calMg!);
    const mgMolL = !temMg ? null : i === 0 ? 0 : mgMgL == null ? null : (mgMgL * e.calMg!.diluicao) / (1000 * e.calMg!.massaMolar);
    const hSoCa = caMolL == null ? null : e.c0_mol_l - (e.mineral === "dolomita" ? 4 : 2) * caMolL;
    const h = e.mineral === "dolomita" && temMg ? (caMolL == null || mgMolL == null ? null : e.c0_mol_l - 2 * caMolL - 2 * mgMolL) : hSoCa;
    const usado = e.tempoMaximo_s == null || l.tempo_s <= e.tempoMaximo_s;
    return { ...l, ca_mg_l: caMgL, ca_mol_l: caMolL, mg_mol_l: mgMolL, h_mol_l: h, h_so_ca_mol_l: hSoCa, usado };
  });
  pontos.forEach((p) => { if (p.ca_mol_l != null && p.ca_mol_l < 0) av("abs_ca", `t = ${p.tempo_s} s: absorbância abaixo do branco (Ca negativo)`); });

  const A = areaDisco(e.diametro_cm), Ac = areaCorrigida(e.diametro_cm, e.porosidade_pct);
  const ajuste = (campo: "h_mol_l" | "h_so_ca_mol_l") => {
    const ps = pontos.filter((p) => p.usado && p[campo] != null);
    return reta(ps.map((p) => p.tempo_s), ps.map((p) => p[campo] as number));
  };
  const rSoCa = ajuste("h_so_ca_mol_l"), rTot = ajuste("h_mol_l");
  const taxa = (r: ReturnType<typeof reta>) => (r ? (2 * -r.inclinacao) / Ac : null);
  const taxaSoCa = taxa(rSoCa), taxaCaMg = e.mineral === "dolomita" && temMg ? taxa(rTot) : null;
  const principal = e.mineral === "dolomita" ? rSoCa : rTot;
  if (principal && principal.r2 < 0.8) av("leituras", `[H⁺] × tempo com R² = ${principal.r2.toFixed(2)}: leituras dispersas (concentração baixa?); confira antes de usar a taxa`);
  if (principal && principal.inclinacao >= 0) av("leituras", "[H⁺] não cai com o tempo: a taxa sai zero ou negativa", "ERRO");
  if (e.porosidade_pct == null) av("porosidade_pct", "sem porosidade: área sem correção (φ = 0)");
  const perda = e.massa_antes_g && e.massa_depois_g != null ? (100 * (e.massa_antes_g - e.massa_depois_g)) / e.massa_antes_g : null;
  return {
    pontos, area_cm2: A, area_corrigida_cm2: Ac,
    taxa_reacao: e.mineral === "dolomita" ? taxaSoCa : taxa(rTot), taxa_so_ca: taxaSoCa, taxa_ca_mg: taxaCaMg,
    inclinacao_h: principal?.inclinacao ?? null, r2_h: principal?.r2 ?? null, n_pontos: principal?.n ?? 0,
    perda_massa_pct: perda,
    taxa_balanco_h: principal && e.volume_acido_ml ? (-principal.inclinacao * (e.volume_acido_ml / 1000)) / Ac : null,
    avisos,
  };
}

// ---------------------------------------------------------------------------
// 2–4. Série: TR × √ω, Levich estendido, Sc e D
// ---------------------------------------------------------------------------
export interface DiscoDaSerie { codigo?: string; rotacao_rpm: number; taxa_reacao: number }

export interface EntradaSerie {
  discos: DiscoDaSerie[];
  /** concentração inicial do ácido em mol/cm³ (= mol/L ÷ 1000) */
  c0_mol_cm3: number;
  /** viscosidade cinemática do fluido na temperatura do ensaio (cm²/s), da literatura */
  viscosidade_cm2_s: number;
  diametro_cm?: number;
  modoOmega?: "exato" | "planilha";
}

export interface ResultadoSerie {
  porRotacao: { rotacao_rpm: number; omega_rad_s: number; raiz_omega: number; n: number; taxa_media: number; taxa_desvio: number; codigos: string[] }[];
  slope: number | null; intercepto: number | null; r2: number | null;
  sc: number | null; d_cm2_s: number | null; residuo_levich: number | null;
  reynolds_max: number | null;
  regime: "transporte" | "misto" | "reação de superfície" | null;
  avisos: Aviso[];
}

/** Resolve a equação de Levich estendida para Sc (exata). Devolve null se não houver solução física. */
export function schmidtLevich(slope: number, c0_mol_cm3: number, nu_cm2_s: number): number | null {
  if (!(slope > 0) || !(c0_mol_cm3 > 0) || !(nu_cm2_s > 0)) return null;
  const a = (0.62048 * c0_mol_cm3 * Math.sqrt(nu_cm2_s)) / slope;
  const A = a - 0.1451;
  if (!(A > 0)) return null;
  const x = (0.298 + Math.sqrt(0.298 ** 2 + 4 * A)) / (2 * A);
  return x ** -3;
}

/** lado esquerdo da equação (deve dar 1) — a mesma conferência da coluna "Solver para 1" */
export const residuoLevich = (slope: number, c0: number, nu: number, sc: number) =>
  ((0.62048 * c0 * Math.sqrt(nu)) / slope - 0.1451) * sc ** (-2 / 3) - 0.298 * sc ** (-1 / 3);

export function calcularSerie(e: EntradaSerie): ResultadoSerie {
  const avisos: Aviso[] = [];
  const av = (campo: string, mensagem: string, severidade: Severidade = "AVISO") => avisos.push({ severidade, campo, mensagem });
  const grupos = new Map<number, DiscoDaSerie[]>();
  for (const d of e.discos.filter((x) => x.taxa_reacao != null && Number.isFinite(x.taxa_reacao)))
    grupos.set(d.rotacao_rpm, [...(grupos.get(d.rotacao_rpm) ?? []), d]);
  const porRotacao = [...grupos.entries()].sort((a, b) => a[0] - b[0]).map(([rpm, ds]) => {
    const w = omega(rpm, e.modoOmega);
    const t = ds.map((d) => d.taxa_reacao);
    return { rotacao_rpm: rpm, omega_rad_s: w, raiz_omega: Math.sqrt(w), n: ds.length, taxa_media: media(t), taxa_desvio: desvio(t), codigos: ds.map((d) => d.codigo ?? "") };
  });
  for (const g of porRotacao) {
    if (g.n === 1) av("discos", `${g.rotacao_rpm} rpm: só um disco (sem réplica, sem desvio)`);
    else if (g.taxa_desvio / g.taxa_media > 0.3) av("discos", `${g.rotacao_rpm} rpm: réplicas diferem ${(100 * g.taxa_desvio / g.taxa_media).toFixed(0)} % (desvio/média)`);
  }
  const vazio = { porRotacao, slope: null, intercepto: null, r2: null, sc: null, d_cm2_s: null, residuo_levich: null, reynolds_max: null, regime: null, avisos };
  if (porRotacao.length < 2) { av("discos", "precisa de pelo menos 2 rotações diferentes para a reta TR × √ω", "ERRO"); return vazio; }
  if (porRotacao.length < 3) av("discos", "só 2 rotações: a reta passa exatamente pelos pontos (R² = 1 sem significado)");
  const r = reta(porRotacao.map((g) => g.raiz_omega), porRotacao.map((g) => g.taxa_media))!;
  const medio = media(porRotacao.map((g) => g.taxa_media));
  const variacao = (r.inclinacao * (porRotacao[porRotacao.length - 1].raiz_omega - porRotacao[0].raiz_omega)) / medio;
  const regime: ResultadoSerie["regime"] = Math.abs(variacao) < 0.1 ? "reação de superfície"
    : r.r2 >= 0.97 && Math.abs(r.intercepto) <= 0.15 * medio ? "transporte" : "misto";
  const sc = schmidtLevich(r.inclinacao, e.c0_mol_cm3, e.viscosidade_cm2_s);
  if (r.inclinacao <= 0) av("slope", "a taxa não cresce com a rotação: Levich não se aplica (D não calculado)", "ERRO");
  else if (sc == null) av("slope", "slope alto demais para a equação de Levich (sem Sc físico): confira C₀, ν e as unidades da taxa", "ERRO");
  if (regime === "reação de superfície") av("regime", "a taxa quase não muda com a rotação: quem controla é a reação na superfície e o D de Levich não tem significado");
  else if (r.r2 < 0.9) av("r2", `reta TR × √ω com R² = ${r.r2.toFixed(2)}: D pouco confiável`);
  const re = e.diametro_cm ? (Math.max(...porRotacao.map((g) => g.omega_rad_s)) * (e.diametro_cm / 2) ** 2) / e.viscosidade_cm2_s : null;
  if (re != null && re >= 3e5) av("reynolds", `Re = ${re.toExponential(2)} ≥ 3×10⁵: escoamento pode não ser laminar`);
  return {
    porRotacao, slope: r.inclinacao, intercepto: r.intercepto, r2: r.r2,
    sc, d_cm2_s: sc ? e.viscosidade_cm2_s / sc : null,
    residuo_levich: sc ? residuoLevich(r.inclinacao, e.c0_mol_cm3, e.viscosidade_cm2_s, sc) : null,
    reynolds_max: re, regime, avisos,
  };
}
