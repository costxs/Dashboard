// ---------------------------------------------------------------------------
// Domínio: Caracterização de Rochas Carbonáticas e Estimulação Ácida (Coreflooding)
// ---------------------------------------------------------------------------

export type ProjectPartner = "TotalEnergies" | "Petrobras";

export type LithoType =
  | "Indiana Limestone"
  | "Silurian Dolomite"
  | "Travertino Ataxico"
  | "Calcário Coquina"
  | "Calcário Microporoso Pré-Sal"
  | "Dolomito Jandaíra";

export type SampleStatus =
  | "Cadastrada"
  | "Em Ensaio"
  | "Ensaiada"
  | "Arquivada";

export type FolderTaxonomy = "10-pastas" | "13-pastas";

export type WormholeClass =
  | "Dissolução de Face (Face Dissolution)"
  | "Wormhole Cônico"
  | "Wormhole Dominante"
  | "Wormhole Ramificado"
  | "Dissolução Uniforme";

/** Metadados gerais da amostra (aba "Visão Geral"). */
export interface Sample {
  id: string;
  code: string; // ex: "#11", "#15"
  name: string;
  project: ProjectPartner;
  workPackageId: string;
  lithoType: LithoType;
  status: SampleStatus;
  folderTaxonomy: FolderTaxonomy;
  well?: string;
  depthMeters?: number;
  porosityPercent: number;
  permeabilityInitialMd: number;
  permeabilityFinalMd?: number;
  diameterMm: number;
  lengthMm: number;
  dryMassG: number;
  collectionDate: string; // ISO date
  responsibleResearcher: string;
  tags: string[];
  thumbnailSeed: string;
  notes?: string;
}

/** Aba "Análise Petrográfica". */
export interface MineralComponent {
  mineral: string;
  percent: number;
}

export interface PetrographyData {
  sampleId: string;
  thinSectionMagnification: string; // ex: "40x, luz polarizada"
  porosityType: string;
  dominantGrainSize: string;
  mineralComposition: MineralComponent[];
  description: string;
  imageSeed: string;
}

/** Aba "Coreflooding". */
export interface PressureTimePoint {
  timeMin: number;
  deltaPPsi: number;
  pv: number; // volumes porosos injetados
}

export interface CorefloodingResult {
  sampleId: string;
  acidType: string; // ex: "HCl 15% + Corrosion Inhibitor"
  acidConcentrationPercent: number;
  flowRateMlMin: number;
  temperatureC: number;
  confiningPressurePsi: number;
  breakthroughPv: number;
  wormholeClass: WormholeClass;
  injectivityFactor: number; // razão k_final/k_inicial
  pressureCurve: PressureTimePoint[];
}

/** Aba "Difração de Raios X". */
export interface XrdPeak {
  twoTheta: number;
  intensity: number;
}

export interface XrdData {
  sampleId: string;
  minerals: MineralComponent[];
  diffractogram: XrdPeak[];
  equipment: string;
}

/** Aba "Dissolução Estática". */
export interface MassLossPoint {
  timeMin: number;
  massLossPercent: number;
}

export interface StaticDissolutionData {
  sampleId: string;
  acidType: string;
  acidConcentrationPercent: number;
  temperatureC: number;
  initialMassG: number;
  finalMassG: number;
  massLossCurve: MassLossPoint[];
}

/** Abas de imagem "Microtomografia" e "MEV". */
export interface ImageStudy {
  sampleId: string;
  resolutionMicronsPerVoxel?: number;
  magnification?: string;
  beforeSeed: string;
  afterSeed: string;
  beforeLabel: string;
  afterLabel: string;
  wormholeVolumeMm3?: number;
  edsComposition?: MineralComponent[];
  notes: string;
}

/** Registro agregado de todos os resultados de uma amostra. */
export interface ExperimentResult {
  sample: Sample;
  petrography?: PetrographyData;
  coreflooding?: CorefloodingResult;
  xrd?: XrdData;
  staticDissolution?: StaticDissolutionData;
  microCt?: ImageStudy;
  sem?: ImageStudy;
}

// ---------------------------------------------------------------------------
// Domínio: Dashboard Gerencial (Curva S / Work Packages)
// ---------------------------------------------------------------------------

export interface SCurvePoint {
  month: string; // "M1", "M2", ...
  planejado: number; // % acumulado
  realizado: number; // % acumulado
}

export interface WorkPackage {
  id: string;
  code: string; // "WP1", "WP2", ...
  description: string;
  responsible: string;
  project: ProjectPartner;
  progressPercent: number;
  status: "Concluded" | "Started" | "Not-started";
  dueDate: string;
  sampleCount: number;
}

export interface KpiSummary {
  totalSamples: number;
  samplesInProgress: number;
  averagePorosity: number;
  averageInjectivityGain: number;
  activeWorkPackages: number;
  overallProgressPercent: number;
}
