/**
 * Philippine Electrical Code (PEC 2017) Wire and Conduit Sizing Module
 *
 * Implements strict engineering calculations per:
 * - PEC Article 6.90: Solar Photovoltaic (PV) Systems
 * - PEC Article 3.10: Conductors for General Wiring (Table 3.10.2.6(b)(16) / Table 3.10.15(B)(16) 75°C Copper THHN/THWN-2)
 * - PEC Article 2.50: Grounding and Bonding (Table 2.50.6.13 Minimum Size Equipment Grounding Conductors - EGC)
 * - PEC Chapter 9: Tables 10.1.1.4 / Table C.1 Conduit Sizing (40% max fill for 3+ conductors)
 */

import { AcPhaseType } from '../types/solar';

export interface PecConductorEntry {
  sizeMm2: number;
  label: string;
  ampacity75C: number;
  approxAwg: string;
  resistanceOhmPerKm: number;
}

export interface PecEgcEntry {
  maxOcpdA: number;
  copperSizeMm2: number;
  label: string;
}

/**
 * PEC Table 3.10.2.6(b)(16) Allowable Ampacities & Resistance (PEC Chapter 9 Table 10.1.1.9)
 * Standard building wire specified for PV AC inverters and feeders: Cu THHN/THWN-2 (75°C rating).
 */
export const PEC_COPPER_THHN_75C: PecConductorEntry[] = [
  { sizeMm2: 2.0, label: '2.0 mm²', ampacity75C: 20, approxAwg: '#14 AWG', resistanceOhmPerKm: 10.1 },
  { sizeMm2: 3.5, label: '3.5 mm²', ampacity75C: 25, approxAwg: '#12 AWG', resistanceOhmPerKm: 6.4 },
  { sizeMm2: 5.5, label: '5.5 mm²', ampacity75C: 35, approxAwg: '#10 AWG', resistanceOhmPerKm: 3.9 },
  { sizeMm2: 8.0, label: '8.0 mm²', ampacity75C: 50, approxAwg: '#8 AWG', resistanceOhmPerKm: 2.5 },
  { sizeMm2: 14, label: '14 mm²', ampacity75C: 65, approxAwg: '#6 AWG', resistanceOhmPerKm: 1.55 },
  { sizeMm2: 22, label: '22 mm²', ampacity75C: 85, approxAwg: '#4 AWG', resistanceOhmPerKm: 0.98 },
  { sizeMm2: 30, label: '30 mm²', ampacity75C: 100, approxAwg: '#3 AWG', resistanceOhmPerKm: 0.77 },
  { sizeMm2: 38, label: '38 mm²', ampacity75C: 115, approxAwg: '#2 AWG', resistanceOhmPerKm: 0.61 },
  { sizeMm2: 50, label: '50 mm²', ampacity75C: 130, approxAwg: '#1/0 AWG', resistanceOhmPerKm: 0.49 },
  { sizeMm2: 60, label: '60 mm²', ampacity75C: 150, approxAwg: '#2/0 AWG', resistanceOhmPerKm: 0.39 },
  { sizeMm2: 80, label: '80 mm²', ampacity75C: 175, approxAwg: '#3/0 AWG', resistanceOhmPerKm: 0.31 },
  { sizeMm2: 100, label: '100 mm²', ampacity75C: 200, approxAwg: '#4/0 AWG', resistanceOhmPerKm: 0.25 },
  { sizeMm2: 125, label: '125 mm²', ampacity75C: 230, approxAwg: '250 kcmil', resistanceOhmPerKm: 0.21 },
  { sizeMm2: 150, label: '150 mm²', ampacity75C: 255, approxAwg: '300 kcmil', resistanceOhmPerKm: 0.17 },
  { sizeMm2: 175, label: '175 mm²', ampacity75C: 285, approxAwg: '350 kcmil', resistanceOhmPerKm: 0.15 },
  { sizeMm2: 200, label: '200 mm²', ampacity75C: 310, approxAwg: '400 kcmil', resistanceOhmPerKm: 0.13 },
  { sizeMm2: 250, label: '250 mm²', ampacity75C: 355, approxAwg: '500 kcmil', resistanceOhmPerKm: 0.105 },
  { sizeMm2: 300, label: '300 mm²', ampacity75C: 395, approxAwg: '600 kcmil', resistanceOhmPerKm: 0.089 },
  { sizeMm2: 400, label: '400 mm²', ampacity75C: 460, approxAwg: '800 kcmil', resistanceOhmPerKm: 0.071 },
  { sizeMm2: 500, label: '500 mm²', ampacity75C: 520, approxAwg: '1000 kcmil', resistanceOhmPerKm: 0.059 }
];

/**
 * PEC Table 2.50.6.13 Minimum Size Equipment Grounding Conductors (EGC) for Grounding Raceway and Equipment.
 */
export const PEC_EGC_TABLE: PecEgcEntry[] = [
  { maxOcpdA: 15, copperSizeMm2: 2.0, label: '2.0 mm²' },
  { maxOcpdA: 20, copperSizeMm2: 3.5, label: '3.5 mm²' },
  { maxOcpdA: 30, copperSizeMm2: 5.5, label: '5.5 mm²' },
  { maxOcpdA: 60, copperSizeMm2: 8.0, label: '8.0 mm²' },
  { maxOcpdA: 100, copperSizeMm2: 14, label: '14 mm²' },
  { maxOcpdA: 200, copperSizeMm2: 22, label: '22 mm²' },
  { maxOcpdA: 300, copperSizeMm2: 30, label: '30 mm²' },
  { maxOcpdA: 400, copperSizeMm2: 38, label: '38 mm²' },
  { maxOcpdA: 500, copperSizeMm2: 50, label: '50 mm²' },
  { maxOcpdA: 600, copperSizeMm2: 60, label: '60 mm²' },
  { maxOcpdA: 800, copperSizeMm2: 80, label: '80 mm²' },
  { maxOcpdA: 1000, copperSizeMm2: 100, label: '100 mm²' },
  { maxOcpdA: 1200, copperSizeMm2: 125, label: '125 mm²' },
  { maxOcpdA: 1600, copperSizeMm2: 150, label: '150 mm²' },
  { maxOcpdA: 2000, copperSizeMm2: 200, label: '200 mm²' }
];

export interface PecWireSizingResult {
  circuitType: 'ac_inverter' | 'ac_main' | 'dc_string';
  phase: AcPhaseType;
  voltageV: number;
  ratedCurrentA: number;
  designCurrentA: number; // 125% continuous duty per PEC 6.90
  ocpdRatingA: number;
  numSets: number; // 1 for standard runs, 2+ for parallel runs
  conductorsPerSet: number; // 4 for 3Φ (3P+N), 2 for 1Φ (L+N)
  phaseConductorMm2: number;
  phaseConductorLabel: string;
  egcConductorMm2: number;
  egcConductorLabel: string;
  conduitTradeSizeMm: number;
  conduitLabel: string;
  fullCallout: string;
  compactCallout: string;
}

/**
 * Sizes the Equipment Grounding Conductor (EGC) based on the overcurrent protection device (OCPD) rating.
 */
export function sizePecEgc(ocpdRatingA: number): PecEgcEntry {
  for (const entry of PEC_EGC_TABLE) {
    if (ocpdRatingA <= entry.maxOcpdA) {
      return entry;
    }
  }
  return PEC_EGC_TABLE[PEC_EGC_TABLE.length - 1];
}

/**
 * Determines recommended trade conduit size (mm dia) based on phase wire size and conductor count.
 */
export function getPecConduitSize(wireSizeMm2: number, conductorsCount: number = 4): { mm: number; label: string } {
  // Check if multiple parallel conductors exceed standard 40% fill
  const isHighCount = conductorsCount > 5;
  if (wireSizeMm2 <= 5.5) {
    return isHighCount ? { mm: 25, label: '25 mmø (1") EMT' } : { mm: 20, label: '20 mmø (3/4") EMT' };
  }
  if (wireSizeMm2 <= 8.0) {
    return isHighCount ? { mm: 32, label: '32 mmø (1-1/4") EMT' } : { mm: 25, label: '25 mmø (1") EMT' };
  }
  if (wireSizeMm2 <= 14) {
    return { mm: 32, label: '32 mmø (1-1/4") EMT' };
  }
  if (wireSizeMm2 <= 30) {
    return { mm: 40, label: '40 mmø (1-1/2") EMT' };
  }
  if (wireSizeMm2 <= 50) {
    return { mm: 50, label: '50 mmø (2") EMT' };
  }
  if (wireSizeMm2 <= 80) {
    return { mm: 65, label: '65 mmø (2-1/2") RMC/EMT' };
  }
  if (wireSizeMm2 <= 125) {
    return { mm: 80, label: '80 mmø (3") RMC' };
  }
  if (wireSizeMm2 <= 200) {
    return { mm: 90, label: '90 mmø (3-1/2") RMC' };
  }
  return { mm: 100, label: '100 mmø (4") RMC' };
}

/**
 * Standard OCPD breaker ratings under PEC Table 2.40.1.6(a)
 */
export const STANDARD_OCPD_RATINGS_A: number[] = [
  15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000
];

/**
 * Finds next standard OCPD breaker rating $\ge I_{\text{design}}$
 */
export function getStandardOcpdRating(designCurrentA: number): number {
  for (const rating of STANDARD_OCPD_RATINGS_A) {
    if (rating >= designCurrentA) {
      return rating;
    }
  }
  return Math.ceil(designCurrentA / 100) * 100;
}

/**
 * Sizes AC Feeder Conductors according to Philippine Electrical Code (PEC 2017).
 *
 * Rules:
 * 1. Continuous Duty: $I_{\text{design}} = I_{\text{rated}} \times 1.25$ (PEC 6.90.2.1 / PEC 2.15.1.2)
 * 2. Conductor Ampacity: $I_{\text{ampacity}} \ge I_{\text{design}}$ (PEC 3.10.2.6(b)(16) 75°C Cu THHN/THWN-2)
 * 3. Overcurrent Protection: Standard OCPD rating $\ge I_{\text{design}}$
 * 4. Parallel Conductors: If $I_{\text{design}} > 355\text{A}$, automatically sizes parallel sets of conductors per PEC 3.10.1.4.
 * 5. Equipment Grounding: EGC sized per PEC Table 2.50.6.13.
 */
export function sizePecAcFeeder(
  ratedKw: number,
  phase: AcPhaseType,
  acVoltage: number,
  circuitType: 'ac_inverter' | 'ac_main' = 'ac_inverter'
): PecWireSizingResult {
  const isThreePhase = phase === 'three_phase';
  const v = Math.max(100, acVoltage);
  const kw = Math.max(0.1, ratedKw);

  // Rated AC current
  const ratedCurrentA = Number(
    ((kw * 1000) / (isThreePhase ? Math.sqrt(3) * v : v)).toFixed(1)
  );

  // 125% continuous duty per PEC
  const designCurrentA = Number((ratedCurrentA * 1.25).toFixed(1));

  // OCPD rating
  const ocpdRatingA = getStandardOcpdRating(designCurrentA);

  // Check if parallel sets are required (for currents > 355A where single 250mm² is insufficient)
  let numSets = 1;
  let currentPerSet = designCurrentA;
  if (designCurrentA > 355) {
    numSets = Math.ceil(designCurrentA / 285); // 285A max per 175mm² set for manageable pulling
    currentPerSet = Number((designCurrentA / numSets).toFixed(1));
  }

  // Find phase conductor size matching currentPerSet from PEC 75°C Copper table
  let chosenConductor = PEC_COPPER_THHN_75C[PEC_COPPER_THHN_75C.length - 1];
  for (const entry of PEC_COPPER_THHN_75C) {
    if (entry.ampacity75C >= currentPerSet) {
      chosenConductor = entry;
      break;
    }
  }

  // Size EGC per OCPD
  const egc = sizePecEgc(ocpdRatingA);

  // Conductors count per set: 4 for 3Φ (3 Phase + Neutral), 2 for 1Φ (Line + Neutral)
  const conductorsPerSet = isThreePhase ? 4 : 2;
  const conduit = getPecConduitSize(chosenConductor.sizeMm2, conductorsPerSet + 1);

  // Format callouts
  const setPrefix = numSets > 1 ? `${numSets} Sets of ` : '';
  const condWire = `${conductorsPerSet}× ${chosenConductor.label} THHN/THWN-2`;
  const egcWire = `1× ${egc.label} EGC`;
  const fullCallout = `${setPrefix}${condWire} + ${egcWire} in ${conduit.label}`;
  const compactCallout = numSets > 1
    ? `${numSets}×(${conductorsPerSet}×${chosenConductor.sizeMm2} + ${egc.copperSizeMm2}G)`
    : `${conductorsPerSet}×${chosenConductor.sizeMm2}mm² + ${egc.copperSizeMm2}mm²G`;

  return {
    circuitType,
    phase,
    voltageV: v,
    ratedCurrentA,
    designCurrentA,
    ocpdRatingA,
    numSets,
    conductorsPerSet,
    phaseConductorMm2: chosenConductor.sizeMm2,
    phaseConductorLabel: chosenConductor.label,
    egcConductorMm2: egc.copperSizeMm2,
    egcConductorLabel: egc.label,
    conduitTradeSizeMm: conduit.mm,
    conduitLabel: conduit.label,
    fullCallout,
    compactCallout
  };
}

/**
 * Sizes the DC PV String Homerun cable per PEC / IEC 62930.
 * Standard PV module $I_{sc} \approx 14 - 16\text{A}$.
 * $I_{\text{design}} = I_{sc} \times 1.25 \times 1.25 = 1.56 \times I_{sc}$.
 */
export function sizePecDcStringWire(isc: number = 15.8, isParallel: boolean = false): {
  cableMm2: number;
  label: string;
  designCurrentA: number;
  conduitLabel: string;
  fullCallout: string;
} {
  const maxIsc = isParallel ? isc * 2 : isc;
  const designCurrentA = maxIsc * 1.56;

  // 4.0 mm² is rated ~40A in air/conduit; 6.0 mm² is rated ~55A; 10 mm² is rated ~70A
  let cableMm2 = 4.0;
  if (designCurrentA > 32 || isParallel) {
    cableMm2 = 6.0;
  }
  if (designCurrentA > 50) {
    cableMm2 = 10.0;
  }

  return {
    cableMm2,
    label: `${cableMm2.toFixed(1)} mm²`,
    designCurrentA: Number(designCurrentA.toFixed(1)),
    conduitLabel: '25 mmø (1") PVC/EMT',
    fullCallout: `2× ${cableMm2.toFixed(1)}mm² PV1-F (1500V DC) + 1× 6.0mm² Cu EGC`
  };
}

/**
 * Calculates feeder voltage drop and verifies compliance with PEC Article 2.15 (max 3% allowable, 2% optimal).
 */
export function calculatePecVoltageDrop(
  ratedKw: number,
  phase: AcPhaseType,
  voltageV: number,
  lengthM: number,
  conductorMm2?: number,
  numSets: number = 1
): {
  voltageDropV: number;
  voltageDropPercent: number;
  isCompliant: boolean;
} {
  const isThreePhase = phase === 'three_phase';
  const v = Math.max(100, voltageV);
  const len = Math.max(0, lengthM);
  const kw = Math.max(0.1, ratedKw);

  const ratedCurrentA = (kw * 1000) / (isThreePhase ? Math.sqrt(3) * v : v);

  // Find conductor entry
  let entry = PEC_COPPER_THHN_75C.find(c => c.sizeMm2 === conductorMm2);
  if (!entry) {
    const sizing = sizePecAcFeeder(ratedKw, phase, voltageV, 'ac_main');
    entry = PEC_COPPER_THHN_75C.find(c => c.sizeMm2 === sizing.phaseConductorMm2) || PEC_COPPER_THHN_75C[0];
    numSets = sizing.numSets;
  }

  const effectiveR = (entry.resistanceOhmPerKm / Math.max(1, numSets)) * (len / 1000);
  const vDrop = isThreePhase
    ? Math.sqrt(3) * ratedCurrentA * effectiveR
    : 2 * ratedCurrentA * effectiveR;

  const vDropPercent = Number(((vDrop / v) * 100).toFixed(2));
  const vDropRounded = Number(vDrop.toFixed(2));
  // PEC 2.15.1.2: Feeders should not exceed 3.0%
  const isCompliant = vDropPercent <= 3.0;

  return {
    voltageDropV: vDropRounded,
    voltageDropPercent: vDropPercent,
    isCompliant
  };
}

/**
 * Standard dry-type and oil-immersed power transformer kVA ratings per ANSI/IEEE C57 & IEC 60076.
 */
export const STANDARD_TRANSFORMER_KVA_RATINGS: number[] = [
  15, 25, 30, 37.5, 45, 50, 75, 100, 112.5, 125, 150, 175, 200, 225, 250, 300, 400, 500, 630, 750, 1000, 1250, 1500, 2000, 2500
];

export interface PecTransformerDesign {
  required: boolean;
  kvaRating: number;
  transformerKva: number;
  transformerType: 'step_up' | 'step_down' | 'isolation';
  type: 'step_up' | 'step_down' | 'isolation';
  vectorGroup: string;
  impedancePercent: number;
  primaryVoltageV: number;
  secondaryVoltageV: number;
  primaryRatedCurrentA: number;
  primaryFullLoadCurrentA: number;
  primaryDesignCurrentA: number;
  primaryOcpdRatingA: number;
  secondaryRatedCurrentA: number;
  secondaryFullLoadCurrentA: number;
  secondaryDesignCurrentA: number;
  secondaryOcpdRatingA: number;
  primaryConductors: PecWireSizingResult;
  primaryPecSizing: PecWireSizingResult;
  secondaryConductors: PecWireSizingResult;
  secondaryPecSizing: PecWireSizingResult;
  label: string;
  compactCallout: string;
}

/**
 * Sizing of isolation / step-up / step-down power transformer per Philippine Electrical Code (PEC Article 4.50 & 6.90).
 * Required whenever Inverter AC Voltage != System Tapping Point Voltage.
 */
export function sizePecTransformer(
  ratedAcKw: number,
  phase: AcPhaseType,
  inverterVoltageV: number,
  systemVoltageV: number
): PecTransformerDesign {
  const isThreePhase = phase === 'three_phase';
  const vPri = Math.max(100, inverterVoltageV);
  const vSec = Math.max(100, systemVoltageV);
  const required = vPri !== vSec;
  const kw = Math.max(0.1, ratedAcKw);

  if (!required) {
    const defaultFeeder = sizePecAcFeeder(kw, phase, vPri, 'ac_main');
    return {
      required: false,
      kvaRating: 0,
      transformerKva: 0,
      transformerType: 'isolation',
      type: 'isolation',
      vectorGroup: isThreePhase ? 'Dyn11 (Δ-Y)' : '1Φ Isolation',
      impedancePercent: 0,
      primaryVoltageV: vPri,
      secondaryVoltageV: vSec,
      primaryRatedCurrentA: defaultFeeder.ratedCurrentA,
      primaryFullLoadCurrentA: defaultFeeder.ratedCurrentA,
      primaryDesignCurrentA: defaultFeeder.designCurrentA,
      primaryOcpdRatingA: defaultFeeder.ocpdRatingA,
      secondaryRatedCurrentA: defaultFeeder.ratedCurrentA,
      secondaryFullLoadCurrentA: defaultFeeder.ratedCurrentA,
      secondaryDesignCurrentA: defaultFeeder.designCurrentA,
      secondaryOcpdRatingA: defaultFeeder.ocpdRatingA,
      primaryConductors: defaultFeeder,
      primaryPecSizing: defaultFeeder,
      secondaryConductors: defaultFeeder,
      secondaryPecSizing: defaultFeeder,
      label: 'No Transformer Required (Voltages Match)',
      compactCallout: 'No XFM'
    };
  }

  // Sizing kVA: minimum continuous design duty is 1.25 * kW
  const minKva = kw * 1.25;
  let chosenKva = STANDARD_TRANSFORMER_KVA_RATINGS[STANDARD_TRANSFORMER_KVA_RATINGS.length - 1];
  for (const kva of STANDARD_TRANSFORMER_KVA_RATINGS) {
    if (kva >= minKva) {
      chosenKva = kva;
      break;
    }
  }
  if (minKva > chosenKva) {
    chosenKva = Math.ceil(minKva / 250) * 250;
  }

  const transformerType: 'step_up' | 'step_down' | 'isolation' =
    vSec > vPri ? 'step_up' : vSec < vPri ? 'step_down' : 'isolation';

  const vectorGroup = isThreePhase ? 'Dyn11 (Δ-Y)' : '1Φ Isolation';
  const impedancePercent = chosenKva <= 50 ? 4.0 : chosenKva <= 500 ? 4.5 : 5.75;

  // Primary currents (Inverter side)
  const primaryRatedCurrentA = Number(
    ((chosenKva * 1000) / (isThreePhase ? Math.sqrt(3) * vPri : vPri)).toFixed(1)
  );
  const primaryDesignCurrentA = Number((primaryRatedCurrentA * 1.25).toFixed(1));
  const primaryOcpdRatingA = getStandardOcpdRating(primaryDesignCurrentA);
  const primaryConductors = sizePecAcFeeder(kw, phase, vPri, 'ac_inverter');

  // Secondary currents (Grid/MDP tapping side)
  const secondaryRatedCurrentA = Number(
    ((chosenKva * 1000) / (isThreePhase ? Math.sqrt(3) * vSec : vSec)).toFixed(1)
  );
  const secondaryDesignCurrentA = Number((secondaryRatedCurrentA * 1.25).toFixed(1));
  const secondaryOcpdRatingA = getStandardOcpdRating(secondaryDesignCurrentA);
  const secondaryConductors = sizePecAcFeeder(kw, phase, vSec, 'ac_main');

  const typeLabel =
    transformerType === 'step_up'
      ? `Step-Up (${vPri}V ➔ ${vSec}V)`
      : transformerType === 'step_down'
      ? `Step-Down (${vPri}V ➔ ${vSec}V)`
      : `Isolation (${vPri}V)`;

  const label = `${chosenKva} kVA ${typeLabel} ${vectorGroup}`;
  const compactCallout = `${chosenKva}kVA ${vPri}/${vSec}V ${transformerType === 'step_up' ? '▲' : '▼'}`;

  return {
    required,
    kvaRating: chosenKva,
    transformerKva: chosenKva,
    transformerType,
    type: transformerType,
    vectorGroup,
    impedancePercent,
    primaryVoltageV: vPri,
    secondaryVoltageV: vSec,
    primaryRatedCurrentA,
    primaryFullLoadCurrentA: primaryRatedCurrentA,
    primaryDesignCurrentA,
    primaryOcpdRatingA,
    secondaryRatedCurrentA,
    secondaryFullLoadCurrentA: secondaryRatedCurrentA,
    secondaryDesignCurrentA,
    secondaryOcpdRatingA,
    primaryConductors,
    primaryPecSizing: primaryConductors,
    secondaryConductors,
    secondaryPecSizing: secondaryConductors,
    label,
    compactCallout
  };
}

/**
 * Computes recommended rating for Main Distribution Panel (MDP) main circuit breaker.
 */
export function getRecommendedMdpMainBreaker(pvBreakerRatingA: number, customRatingA?: number): number {
  if (customRatingA && customRatingA > 0) return customRatingA;
  // In commercial/industrial installations, MDP services facility load as well as PV (typically 2x PV breaker or at least 200A)
  const minMdpA = Math.max(pvBreakerRatingA * 2.0, 200);
  return getStandardOcpdRating(minMdpA);
}
