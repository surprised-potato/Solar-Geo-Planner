/**
 * System summary, solar yield, load profile and energy simulation for ProjectStore.
 */
import { CustomSolarResource, FacilityLoadProfile, LoadProfileArchetype } from '../types/solar';
import { calculateSolarSystemYield, SolarYieldResult } from '../geo/solarYield';
import { createDefaultLoadProfile, ARCHETYPE_DIURNAL_CURVES } from '../geo/loadProfile';
import { simulateSolarAndLoadMatching, SimulationResult, SimulationOptions } from '../geo/energySimulation';
import type { ProjectStore } from './projectStore';

export function getSystemSummary(this: ProjectStore, filterSystemId?: string): { totalSystems: number; totalZones: number; totalPanels: number; totalActivePanels: number; totalKwp: number; totalAreaSqM: number; systemName?: string; inverterAcKw: number; dcAcRatio: number; } {
  const allSystems = this.getSystems();
  const isSpecific = Boolean(filterSystemId && filterSystemId !== 'all');
  const zones = isSpecific
    ? this.getZones().filter(z => z.systemId === filterSystemId)
    : this.getZones();
  const panels = isSpecific
    ? this.getPanels().filter(p => p.systemId === filterSystemId)
    : this.getPanels();

  const activePanels = panels.filter(p => p.active);
  const totalKwp = activePanels.reduce(
    (sum, p) => sum + p.electrical.nominalPowerW / 1000.0,
    0
  );
  const totalAreaSqM = zones.reduce((sum, z) => sum + z.areaSqM, 0);
  const currentSys = isSpecific ? this.systems.get(filterSystemId!) : undefined;

  let inverterAcKw = 0;
  if (isSpecific && currentSys) {
    inverterAcKw = currentSys.inverter.inverterCount * currentSys.inverter.ratedAcPowerKw;
  } else {
    inverterAcKw = allSystems.reduce(
      (sum, s) => sum + s.inverter.inverterCount * s.inverter.ratedAcPowerKw,
      0
    );
  }

  const dcAcRatio = inverterAcKw > 0 ? Number((totalKwp / inverterAcKw).toFixed(2)) : 0;

  return {
    totalSystems: allSystems.length,
    totalZones: zones.length,
    totalPanels: panels.length,
    totalActivePanels: activePanels.length,
    totalKwp: Number(totalKwp.toFixed(2)),
    totalAreaSqM: Math.round(totalAreaSqM),
    systemName: currentSys?.name,
    inverterAcKw,
    dcAcRatio
  };
}

export function getSolarYieldEstimate(this: ProjectStore, filterSystemId?: string): SolarYieldResult {
  const summary = this.getSystemSummary(filterSystemId);
  const zones = this.getZones();
  const systems = this.getSystems();
  const cableSummary = filterSystemId && filterSystemId !== 'all'
    ? this.getSystemCableSummary(filterSystemId)
    : null;
  const acFeeder = filterSystemId && filterSystemId !== 'all'
    ? this.getSystemAcFeederSummary(filterSystemId)
    : null;

  return calculateSolarSystemYield({
    projectCenter: this.center,
    totalKwp: summary.totalKwp,
    zones,
    systems,
    targetSystemId: filterSystemId,
    cableSummary,
    acFeeder,
    customResource: this.customSolarResource
  });
}

export function setCustomSolarResource(this: ProjectStore, resource: CustomSolarResource | null): void {
  this.customSolarResource = resource;
  this.notify();
}

export function getLoadProfile(this: ProjectStore, systemId?: string): FacilityLoadProfile | null {
  if (!this.loadProfile) return null;
  if (systemId && systemId !== 'all' && this.loadProfile.systemId && this.loadProfile.systemId !== systemId) {
    return null;
  }
  return this.loadProfile;
}

export function ensureLoadProfile(this: ProjectStore, systemId?: string): FacilityLoadProfile {
  if (!this.loadProfile) {
    this.loadProfile = createDefaultLoadProfile(360000, 'commercial_office', 'Facility Main Meter Load', systemId);
    this.notify();
  }
  return this.loadProfile;
}

export function applyLoadArchetype(this: ProjectStore, archetype: LoadProfileArchetype): void {
  const current = this.ensureLoadProfile();
  const curveSet = ARCHETYPE_DIURNAL_CURVES[archetype] || ARCHETYPE_DIURNAL_CURVES.commercial_office;
  this.loadProfile = {
    ...current,
    archetype,
    defaultDailyCurve: [...curveSet.weekday],
    weekendDailyCurve: [...curveSet.weekend],
    hasWeekendProfile: archetype !== 'industrial_24_7',
    updatedAt: new Date().toISOString()
  };
  this.notify();
}

export function updateMonthlyLoad(this: ProjectStore, monthIndex: number, kwh: number, peakKw?: number, costPhp?: number): void {
  const current = this.ensureLoadProfile();
  if (monthIndex < 0 || monthIndex >= 12) return;

  const updatedBreakdown = [...current.monthlyBreakdown];
  const prev = updatedBreakdown[monthIndex];
  updatedBreakdown[monthIndex] = {
    ...prev,
    consumptionKwh: Math.max(0, Math.round(kwh)),
    peakDemandKw: peakKw !== undefined ? Number(peakKw.toFixed(1)) : prev.peakDemandKw,
    energyCostPhp: costPhp !== undefined ? Math.round(costPhp) : prev.energyCostPhp
  };

  const newAnnualKwh = updatedBreakdown.reduce((sum, m) => sum + m.consumptionKwh, 0);

  this.loadProfile = {
    ...current,
    annualKwh: newAnnualKwh,
    monthlyBreakdown: updatedBreakdown,
    updatedAt: new Date().toISOString()
  };
  this.notify();
}

export function getSimulationResult(this: ProjectStore, systemId?: string, options?: Partial<SimulationOptions>): SimulationResult {
  const solarYield = this.getSolarYieldEstimate(systemId);
  const loadProfile = this.ensureLoadProfile(systemId);
  return simulateSolarAndLoadMatching(solarYield, loadProfile, options);
}
