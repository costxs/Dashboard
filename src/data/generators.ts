import type {
  MassLossPoint,
  PressureTimePoint,
  XrdPeak,
  MineralComponent,
} from "../types";

/** PRNG determinístico simples (mulberry32) para dados mockados reprodutíveis. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Curva típica de Coreflooding: ΔP decai à medida que o wormhole avança
 * até o breakthrough (queda abrupta de pressão), com ruído de instrumento.
 */
export function generatePressureCurve(
  sampleId: string,
  breakthroughPv: number,
  initialDeltaP: number
): PressureTimePoint[] {
  const rnd = mulberry32(seedFromString(sampleId + "-dP"));
  const points: PressureTimePoint[] = [];
  const totalPoints = 24;
  const flowRateProxy = breakthroughPv / totalPoints;

  for (let i = 0; i <= totalPoints; i++) {
    const pv = +(i * flowRateProxy * 1.15).toFixed(2);
    const progress = pv / breakthroughPv;
    const decay = Math.exp(-2.2 * Math.min(progress, 1));
    const noise = (rnd() - 0.5) * initialDeltaP * 0.06;
    const postBreakthrough = progress >= 1 ? 0.03 * initialDeltaP : 0;
    const deltaP = Math.max(
      initialDeltaP * decay + noise + postBreakthrough,
      0.5
    );
    points.push({
      timeMin: +(i * 2.5).toFixed(1),
      deltaPPsi: +deltaP.toFixed(2),
      pv,
    });
  }
  return points;
}

/**
 * Curva de perda de massa em ensaio de dissolução estática: crescimento
 * saturante (aproximação de cinética de 1ª ordem) até a perda final observada.
 */
export function generateMassLossCurve(
  sampleId: string,
  finalMassLossPercent: number,
  durationMin = 180
): MassLossPoint[] {
  const rnd = mulberry32(seedFromString(sampleId + "-mass"));
  const points: MassLossPoint[] = [];
  const steps = 12;
  const k = 3.2 / durationMin; // taxa de reação aparente

  for (let i = 0; i <= steps; i++) {
    const t = +((durationMin / steps) * i).toFixed(1);
    const saturation = 1 - Math.exp(-k * t);
    const noise = (rnd() - 0.5) * finalMassLossPercent * 0.03;
    const massLoss = Math.max(finalMassLossPercent * saturation + noise, 0);
    points.push({ timeMin: t, massLossPercent: +massLoss.toFixed(2) });
  }
  return points;
}

/** Posições de referência (2θ) por mineral, para simular difratogramas plausíveis. */
const XRD_REFERENCE_PEAKS: Record<string, number[]> = {
  Calcita: [23.05, 29.4, 35.9, 39.4, 43.1, 47.5, 48.5],
  Dolomita: [24.0, 30.9, 37.3, 41.1, 44.9, 50.5],
  Quartzo: [20.8, 26.6, 50.1],
  "Argilominerais (Ilita/Caulinita)": [8.9, 12.3, 19.8],
  Anidrita: [25.4, 31.4, 38.5],
  Pirita: [28.5, 33.0, 37.1],
};

export function generateXrdDiffractogram(
  sampleId: string,
  minerals: MineralComponent[]
): XrdPeak[] {
  const rnd = mulberry32(seedFromString(sampleId + "-xrd"));
  const peaks: XrdPeak[] = [];

  for (const { mineral, percent } of minerals) {
    const refs = XRD_REFERENCE_PEAKS[mineral] ?? [30];
    for (const twoTheta of refs) {
      const intensity = percent * (6 + rnd() * 4);
      peaks.push({
        twoTheta: +(twoTheta + (rnd() - 0.5) * 0.15).toFixed(2),
        intensity: +intensity.toFixed(1),
      });
    }
  }
  return peaks.sort((a, b) => a.twoTheta - b.twoTheta);
}
