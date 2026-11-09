/**
 * DC string cable and AC feeder length summaries for ProjectStore.
 */
import { AcFeederSummary, AcPhaseType, StringCableLength, SystemCableSummary } from '../types/solar';
import { calculateGeodeticDistanceM } from '../geo/projection';
import {
  calculatePolylineLength,
  calculateStringCableLengths,
  summarizeSystemCabling
} from '../geo/stringCabling';
import {
  calculatePecVoltageDrop,
  sizePecAcFeeder,
  sizePecTransformer,
  getRecommendedMdpMainBreaker
} from '../geo/pecWireSizing';
import type { ProjectStore } from './projectStore';

export function getSystemAcFeederSummary(this: ProjectStore, systemId: string): AcFeederSummary {
  const sys = this.systems.get(systemId);
  const phase: AcPhaseType = sys?.inverter.phase || 'three_phase';
  const invVoltageV = sys?.inverter.acVoltage || (phase === 'single_phase' ? 230 : 400);
  const systemVoltageV = sys?.systemVoltageV || invVoltageV;
  const totalKw = (sys?.inverter.inverterCount || 1) * (sys?.inverter.ratedAcPowerKw || 100);

  const invLoc = sys?.inverterLocation || null;
  const invElev = sys?.inverterElevationM ?? 0;
  const pccLoc = sys?.acInterconnectionLocation || null;
  const pccElev = sys?.acInterconnectionElevationM ?? 0;

  const directDist = (invLoc && pccLoc)
    ? Number(calculateGeodeticDistanceM(invLoc, pccLoc).toFixed(2))
    : 0;

  const hasRaceway = !!(sys?.acRaceway && sys.acRaceway.path && sys.acRaceway.path.length >= 2);
  const racewayLen = hasRaceway ? calculatePolylineLength(sys!.acRaceway!.path) : 0;
  const elevDelta = Math.abs(pccElev - invElev) + (sys?.acRaceway?.elevationChangeM || 0);

  const totalRunM = hasRaceway
    ? Number((racewayLen + (sys?.acRaceway?.elevationChangeM || 0)).toFixed(2))
    : directDist > 0
      ? Number((directDist + elevDelta).toFixed(2))
      : 0;

  // AC feeder at tapping point runs at systemVoltageV
  const sizing = sizePecAcFeeder(totalKw, phase, systemVoltageV, 'ac_main');
  const vDrop = calculatePecVoltageDrop(totalKw, phase, systemVoltageV, totalRunM, sizing.phaseConductorMm2, sizing.numSets);

  const xfmDesign = sizePecTransformer(totalKw, phase, invVoltageV, systemVoltageV);
  const mdpTapType = sys?.mdpTapType || 'load_side';
  const mdpMainBreakerA = getRecommendedMdpMainBreaker(sizing.ocpdRatingA, sys?.mdpMainBreakerA);

  return {
    systemId,
    inverterLocation: invLoc,
    inverterElevationM: invElev,
    acInterconnectionLocation: pccLoc,
    acInterconnectionElevationM: pccElev,
    directDistanceM: directDist,
    racewayLengthM: racewayLen,
    elevationDeltaM: Number(elevDelta.toFixed(2)),
    totalRunM,
    hasRaceway,
    phase,
    voltageV: systemVoltageV,
    ratedCurrentA: sizing.ratedCurrentA,
    designCurrentA: sizing.designCurrentA,
    conductorCallout: sizing.fullCallout,
    conduitCallout: sizing.conduitLabel,
    voltageDropV: vDrop.voltageDropV,
    voltageDropPercent: vDrop.voltageDropPercent,
    isCompliant: vDrop.isCompliant,
    inverterVoltageV: invVoltageV,
    systemVoltageV,
    hasTransformer: xfmDesign.required,
    transformerKva: xfmDesign.kvaRating,
    hasAcCombiner: sys?.hasAcCombiner !== false,
    mdpTapType,
    mdpMainBreakerA
  };
}

export function getStringCables(this: ProjectStore, systemId?: string): StringCableLength[] {
  const isAll = systemId === 'all';
  const targetSysId = isAll ? null : (systemId || this.selectedSystemId);
  const sys = targetSysId ? this.systems.get(targetSysId) : undefined;
  const invPoint = sys?.inverterLocation || null;

  const panels = targetSysId
    ? this.getPanelsForSystem(targetSysId)
    : this.getPanels();

  return calculateStringCableLengths(panels, this.zones, invPoint, {}, this.systems);
}

export function getSystemCableSummary(this: ProjectStore, systemId: string): SystemCableSummary {
  const sys = this.systems.get(systemId);
  const invPoint = sys?.inverterLocation || null;
  const invElev = sys?.inverterElevationM ?? 0;
  const stringCables = this.getStringCables(systemId);
  return summarizeSystemCabling(systemId, stringCables, invPoint, invElev);
}

export function getAllCableSummaries(this: ProjectStore): SystemCableSummary[] {
  return this.getSystems().map(s => this.getSystemCableSummary(s.id));
}
