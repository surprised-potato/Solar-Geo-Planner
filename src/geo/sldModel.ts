/**
 * Electrical model behind the single-line diagram (strings, MPPTs, inverters, AC side).
 * Kept UI-free so calculators (BOQ, reports) can use it without importing the SLD view.
 */
import { ProjectStore } from '../store/projectStore';
import {
  SolarSystem,
  ArrayZone,
  SolarPanelObject,
  ModuleModel,
  InverterConfig,
  ZNSHINE_600W_BIFACIAL,
  AcPhaseType,
  AcFeederSummary,
  MdpTapType
} from '../types/solar';
import { calculateStringLimits } from './autofill';
import {
  sizePecAcFeeder,
  sizePecDcStringWire,
  PecWireSizingResult,
  sizePecTransformer,
  getRecommendedMdpMainBreaker,
  PecTransformerDesign
} from './pecWireSizing';

export interface SldStringInfo {
  stringId: string;
  panelCount: number;
  nominalPowerW: number;
  totalKwp: number;
  vmp: number;
  voc: number;
  coldVoc: number;
  imp: number;
  isc: number;
  zoneId: string;
  zoneName: string;
  inverterIndex: number;
  mpptIndex: number;
  mpptId: string;
  isVoltageCompliant: boolean;
  voltageViolationMsg?: string;
}

export interface SldMpptInfo {
  mpptIndex: number;
  mpptId: string;
  strings: SldStringInfo[];
  totalPowerKw: number;
  totalCurrentA: number;
}

export interface SldInverterInfo {
  inverterIndex: number;
  modelName: string;
  ratedAcKw: number;
  mppts: SldMpptInfo[];
  totalDcKwp: number;
  dcAcRatio: number;
  ratedAcCurrentA: number;
  breakerRatingA: number;
  phase: AcPhaseType;
  acVoltage: number;
  gridFrequencyHz: number;
  pecWireSizing: PecWireSizingResult;
}

export interface SldSystemModel {
  system: SolarSystem;
  inverter: InverterConfig;
  zones: ArrayZone[];
  module: ModuleModel;
  strings: SldStringInfo[];
  inverters: SldInverterInfo[];
  totalDcKwp: number;
  totalAcKw: number;
  overallDcAcRatio: number;
  phase: AcPhaseType;
  isThreePhase: boolean;
  acVoltage: number;
  systemVoltageV: number;
  gridFrequencyHz: number;
  mainBreakerRatingA: number;
  totalActivePanels: number;
  hasVoltageViolations: boolean;
  maxAllowedPanelsPerString: number;
  optimalPanelsPerString: number;
  mainFeederWireSizing: PecWireSizingResult;
  dcStringWireSizing: ReturnType<typeof sizePecDcStringWire>;
  acFeederSummary: AcFeederSummary;
  transformerDesign: PecTransformerDesign;
  hasAcCombiner: boolean;
  acCombinerWireSizing: PecWireSizingResult;
  acCombinerBreakerRatingA: number;
  mdpTapType: MdpTapType;
  mdpMainBreakerRatingA: number;
}

/**
 * Builds the electrical schematic data model for a given solar system.
 */
export function buildSldSystemModel(store: ProjectStore, systemId: string): SldSystemModel {
  const system = store.getSystem(systemId) || store.getSystems()[0];
  const zones = store.getZones().filter(z => z.systemId === system.id);
  const invConfig = system.inverter;

  // Ensure strings are properly distributed across all inverters and voltage compliant
  store.distributeStringsAcrossInverters(system.id, invConfig.inverterCount, false);

  const allSystemPanels = store.getPanelsForSystem(system.id);
  const activePanels = allSystemPanels.filter(p => p.active);

  // Determine module model
  let module: ModuleModel = ZNSHINE_600W_BIFACIAL;
  if (zones.length > 0 && zones[0].moduleId) {
    const mod = store.getModule(zones[0].moduleId);
    if (mod) module = mod;
  }

  const limits = calculateStringLimits(module, invConfig);
  const optimalSize = limits.optimalPanelsPerString || 20;

  // Extract strings
  const stringMap = new Map<string, SolarPanelObject[]>();
  const unassignedPanels: SolarPanelObject[] = [];

  for (const p of activePanels) {
    if (p.stringId) {
      if (!stringMap.has(p.stringId)) {
        stringMap.set(p.stringId, []);
      }
      stringMap.get(p.stringId)!.push(p);
    } else {
      unassignedPanels.push(p);
    }
  }

  const strings: SldStringInfo[] = [];

  // Add assigned strings
  for (const [strId, panels] of stringMap.entries()) {
    const count = panels.length;
    const firstP = panels[0];
    const zone = store.getZone(firstP.zoneId);

    // Derive or fallback inverter and mppt indices
    let invIdx = firstP.inverterIndex || 1;
    let mpptIdx = 1;

    if (firstP.mpptId) {
      const match = firstP.mpptId.match(/MPPT(\d+)/i);
      if (match) mpptIdx = parseInt(match[1], 10);
      const invMatch = firstP.mpptId.match(/INV(\d+)/i);
      if (invMatch && (!firstP.inverterIndex || firstP.inverterIndex === 1)) {
        invIdx = parseInt(invMatch[1], 10);
      }
    } else {
      const matchStr = strId.match(/M(\d+)/i);
      if (matchStr) mpptIdx = parseInt(matchStr[1], 10);
      const invMatchStr = strId.match(/INV(\d+)/i);
      if (invMatchStr && (!firstP.inverterIndex || firstP.inverterIndex === 1)) {
        invIdx = parseInt(invMatchStr[1], 10);
      }
    }

    if (invIdx > invConfig.inverterCount) invIdx = ((invIdx - 1) % invConfig.inverterCount) + 1;
    if (mpptIdx > invConfig.mpptCountPerInverter) mpptIdx = ((mpptIdx - 1) % invConfig.mpptCountPerInverter) + 1;

    const vmp = Number((count * module.vmp).toFixed(1));
    const voc = Number((count * module.voc).toFixed(1));
    const coldVoc = Number((count * limits.maxColdVoc).toFixed(1));
    const isVoltageCompliant = count <= limits.maxPanelsPerString && coldVoc <= invConfig.maxDcVoltage;
    let voltageViolationMsg: string | undefined;
    if (!isVoltageCompliant) {
      if (count > limits.maxPanelsPerString) {
        voltageViolationMsg = `${count} panels exceeds max limit of ${limits.maxPanelsPerString}`;
      } else if (coldVoc > invConfig.maxDcVoltage) {
        voltageViolationMsg = `Cold Voc (${coldVoc}V) exceeds inverter Vmax (${invConfig.maxDcVoltage}V)`;
      }
    }
    const imp = module.imp;
    const isc = module.isc;
    const totalKwp = Number(((count * module.nominalPowerW) / 1000).toFixed(2));

    strings.push({
      stringId: strId,
      panelCount: count,
      nominalPowerW: module.nominalPowerW,
      totalKwp,
      vmp,
      voc,
      coldVoc,
      imp,
      isc,
      zoneId: firstP.zoneId,
      zoneName: zone ? zone.name : 'Solar Array',
      inverterIndex: invIdx,
      mpptIndex: mpptIdx,
      mpptId: `INV${invIdx}-MPPT${mpptIdx}`,
      isVoltageCompliant,
      voltageViolationMsg
    });
  }

  // If there are unassigned panels, group them into virtual strings so diagram is complete
  if (unassignedPanels.length > 0) {
    for (let i = 0; i < unassignedPanels.length; i += optimalSize) {
      const slice = unassignedPanels.slice(i, i + optimalSize);
      const count = slice.length;
      const strIdx = strings.length + 1;
      const invIdx = ((strIdx - 1) % invConfig.inverterCount) + 1;
      const mpptIdx = (Math.floor((strIdx - 1) / invConfig.inverterCount) % invConfig.mpptCountPerInverter) + 1;
      const strLetter = String.fromCharCode(65 + (Math.floor((strIdx - 1) / (invConfig.inverterCount * invConfig.mpptCountPerInverter)) % invConfig.maxStringsPerMppt));
      const strId = `STR-${String(strIdx).padStart(2, '0')} (INV${invIdx}-M${mpptIdx}-${strLetter})`;

      const vmp = Number((count * module.vmp).toFixed(1));
      const voc = Number((count * module.voc).toFixed(1));
      const coldVoc = Number((count * limits.maxColdVoc).toFixed(1));
      const isVoltageCompliant = count <= limits.maxPanelsPerString && coldVoc <= invConfig.maxDcVoltage;
      let voltageViolationMsg: string | undefined;
      if (!isVoltageCompliant) {
        if (count > limits.maxPanelsPerString) {
          voltageViolationMsg = `${count} panels exceeds max limit of ${limits.maxPanelsPerString}`;
        } else if (coldVoc > invConfig.maxDcVoltage) {
          voltageViolationMsg = `Cold Voc (${coldVoc}V) exceeds inverter Vmax (${invConfig.maxDcVoltage}V)`;
        }
      }
      const imp = module.imp;
      const isc = module.isc;
      const totalKwp = Number(((count * module.nominalPowerW) / 1000).toFixed(2));
      const zone = store.getZone(slice[0].zoneId);

      strings.push({
        stringId: strId,
        panelCount: count,
        nominalPowerW: module.nominalPowerW,
        totalKwp,
        vmp,
        voc,
        coldVoc,
        imp,
        isc,
        zoneId: slice[0].zoneId,
        zoneName: zone ? zone.name : 'Solar Array',
        inverterIndex: invIdx,
        mpptIndex: mpptIdx,
        mpptId: `INV${invIdx}-MPPT${mpptIdx}`,
        isVoltageCompliant,
        voltageViolationMsg
      });
    }
  }

  // Sort strings by inverter and MPPT
  strings.sort((a, b) => {
    if (a.inverterIndex !== b.inverterIndex) return a.inverterIndex - b.inverterIndex;
    if (a.mpptIndex !== b.mpptIndex) return a.mpptIndex - b.mpptIndex;
    return a.stringId.localeCompare(b.stringId);
  });

  // Determine AC configuration: Phase, Voltage, and Frequency
  const phase: AcPhaseType = invConfig.phase || (invConfig.ratedAcPowerKw <= 10 ? 'single_phase' : 'three_phase');
  const isThreePhase = phase === 'three_phase';
  const acVoltage = invConfig.acVoltage || (isThreePhase ? 400 : 230);
  const gridFrequencyHz = invConfig.gridFrequencyHz || 50;

  const inverters: SldInverterInfo[] = [];

  for (let invIdx = 1; invIdx <= invConfig.inverterCount; invIdx++) {
    const invStrings = strings.filter(s => s.inverterIndex === invIdx);
    const mppts: SldMpptInfo[] = [];

    for (let m = 1; m <= invConfig.mpptCountPerInverter; m++) {
      const mpptStrings = invStrings.filter(s => s.mpptIndex === m);
      const totalPowerKw = Number(mpptStrings.reduce((sum, s) => sum + s.totalKwp, 0).toFixed(2));
      const totalCurrentA = Number((mpptStrings.length * module.imp).toFixed(1));

      mppts.push({
        mpptIndex: m,
        mpptId: `INV${invIdx}-MPPT${m}`,
        strings: mpptStrings,
        totalPowerKw,
        totalCurrentA
      });
    }

    const totalDcKwp = Number(invStrings.reduce((sum, s) => sum + s.totalKwp, 0).toFixed(2));
    const ratedAcKw = invConfig.ratedAcPowerKw;
    const dcAcRatio = ratedAcKw > 0 ? Number((totalDcKwp / ratedAcKw).toFixed(2)) : 0;

    // Size Inverter AC Feeder and Breaker per Philippine Electrical Code (PEC 2017)
    const pecWireSizing = sizePecAcFeeder(ratedAcKw, phase, acVoltage, 'ac_inverter');
    const ratedAcCurrentA = pecWireSizing.ratedCurrentA;
    const breakerRatingA = pecWireSizing.ocpdRatingA;

    inverters.push({
      inverterIndex: invIdx,
      modelName: invConfig.modelName,
      ratedAcKw,
      mppts,
      totalDcKwp,
      dcAcRatio,
      ratedAcCurrentA,
      breakerRatingA,
      phase,
      acVoltage,
      gridFrequencyHz,
      pecWireSizing
    });
  }

  const totalDcKwp = Number(strings.reduce((sum, s) => sum + s.totalKwp, 0).toFixed(2));
  const totalAcKw = invConfig.inverterCount * invConfig.ratedAcPowerKw;
  const overallDcAcRatio = totalAcKw > 0 ? Number((totalDcKwp / totalAcKw).toFixed(2)) : 0;

  // System tapping point voltage (separate from inverter output voltage)
  const systemVoltageV = system.systemVoltageV || acVoltage;
  const hasAcCombiner = system.hasAcCombiner !== false;
  const mdpTapType: MdpTapType = system.mdpTapType || 'load_side';

  // Sizing of Step-Up / Step-Down Transformer if voltages differ
  const transformerDesign = sizePecTransformer(totalAcKw, phase, acVoltage, systemVoltageV);

  // Sizing of AC Combiner Collector Breaker & Bus (at inverter voltage)
  const acCombinerWireSizing = sizePecAcFeeder(totalAcKw, phase, acVoltage, 'ac_main');
  const acCombinerBreakerRatingA = acCombinerWireSizing.ocpdRatingA;

  // Sizing Main AC Service Feeder (at system tapping voltage)
  const mainFeederWireSizing = sizePecAcFeeder(totalAcKw, phase, systemVoltageV, 'ac_main');
  const mainBreakerRatingA = mainFeederWireSizing.ocpdRatingA;

  // MDP Main Breaker sizing
  const mdpMainBreakerRatingA = getRecommendedMdpMainBreaker(mainBreakerRatingA, system.mdpMainBreakerA);

  // Size DC PV String Homerun Wire per PEC 6.90
  const dcStringWireSizing = sizePecDcStringWire(module.isc, invConfig.maxStringsPerMppt > 1);

  const hasVoltageViolations = strings.some(s => !s.isVoltageCompliant);

  const acFeederSummary = store.getSystemAcFeederSummary(system.id);

  return {
    system,
    inverter: invConfig,
    zones,
    module,
    strings,
    inverters,
    totalDcKwp,
    totalAcKw,
    overallDcAcRatio,
    phase,
    isThreePhase,
    acVoltage,
    systemVoltageV,
    gridFrequencyHz,
    mainBreakerRatingA,
    totalActivePanels: activePanels.length,
    hasVoltageViolations,
    maxAllowedPanelsPerString: limits.maxPanelsPerString,
    optimalPanelsPerString: limits.optimalPanelsPerString,
    mainFeederWireSizing,
    dcStringWireSizing,
    acFeederSummary,
    transformerDesign,
    hasAcCombiner,
    acCombinerWireSizing,
    acCombinerBreakerRatingA,
    mdpTapType,
    mdpMainBreakerRatingA
  };
}
