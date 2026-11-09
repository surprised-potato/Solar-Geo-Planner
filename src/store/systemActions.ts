/**
 * Solar system (inverter group) and module management for ProjectStore.
 */
import { GENERIC_INVERTER_PRESETS, InverterConfig, LatLngPoint, ModuleModel, SolarSystem } from '../types/solar';
import type { ProjectStore } from './projectStore';
import { SYSTEM_COLORS } from './projectStore';

export function ensureDefaultSystem(this: ProjectStore): void {
  if (this.systems.size === 0) {
    const defaultInverter: InverterConfig = {
      ...GENERIC_INVERTER_PRESETS[0],
      id: 'inv_default_1'
    };
    const defaultSys: SolarSystem = {
      id: 'sys_default_1',
      name: 'System 1: Main PV Array',
      color: SYSTEM_COLORS[0],
      inverter: defaultInverter,
      zoneIds: []
    };
    this.systems.set(defaultSys.id, defaultSys);
    this.selectedSystemId = defaultSys.id;
  }
}

export function updateModule(this: ProjectStore, moduleId: string, partial: Partial<ModuleModel>): void {
  const mod = this.modules.get(moduleId);
  if (!mod) return;
  Object.assign(mod, partial);

  // Update any zones using this module
  for (const zone of this.zones.values()) {
    if (zone.moduleId === moduleId) {
      this.setArrayModule(zone.id, moduleId);
    }
  }
  this.notify();
}

export function setArrayModule(this: ProjectStore, zoneId: string, moduleId: string): void {
  const zone = this.zones.get(zoneId);
  const mod = this.getModule(moduleId);
  if (!zone || !mod) return;

  zone.moduleId = moduleId;
  zone.config.panelWidthMm = mod.widthMm;
  zone.config.panelLengthMm = mod.lengthMm;
  zone.config.electrical = {
    modelName: mod.name,
    nominalPowerW: mod.nominalPowerW,
    voc: mod.voc,
    vmp: mod.vmp,
    isc: mod.isc,
    imp: mod.imp
  };

  this.regenerateZonePanels(zoneId, false);
  this.notify();
}

export function selectSystem(this: ProjectStore, systemId: string | null, selectDefaultZone: boolean = true): void {
  this.selectedSystemId = systemId;
  if (systemId && selectDefaultZone) {
    const sys = this.systems.get(systemId);
    if (sys) {
      const currentZone = this.getSelectedZone();
      if (!currentZone || currentZone.systemId !== systemId) {
        const firstZoneId = sys.zoneIds && sys.zoneIds.length > 0 ? sys.zoneIds[0] : null;
        this.selectedZoneId = firstZoneId;
        this.selectedZoneIds.clear();
        if (firstZoneId) {
          this.selectedZoneIds.add(firstZoneId);
        }
        this.selectedPanelId = null;
      }
    }
  }
  this.notify();
}

export function addSystem(this: ProjectStore, name?: string, color?: string, inverter?: InverterConfig): SolarSystem {
  const id = `sys_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const sysNum = this.systems.size + 1;
  const sysColor = color || SYSTEM_COLORS[(sysNum - 1) % SYSTEM_COLORS.length];
  const sysName = name || `System ${sysNum}: Independent PV Substation`;
  const defaultInverter = inverter || {
    ...GENERIC_INVERTER_PRESETS[0],
    id: `inv_${Date.now()}`
  };

  const newSys: SolarSystem = {
    id,
    name: sysName,
    color: sysColor,
    inverter: defaultInverter,
    zoneIds: []
  };

  this.systems.set(id, newSys);
  this.selectedSystemId = id;
  this.notify();
  return newSys;
}

export function updateSystemInverter(this: ProjectStore, systemId: string, partial: Partial<InverterConfig>): void {
  const sys = this.systems.get(systemId);
  if (!sys) return;
  const prevCount = sys.inverter.inverterCount;
  sys.inverter = { ...sys.inverter, ...partial };
  const force = partial.inverterCount !== undefined && partial.inverterCount !== prevCount;
  this.distributeStringsAcrossInverters(systemId, sys.inverter.inverterCount, force);
  this.notify();
}

export function setSystemInverterPreset(this: ProjectStore, systemId: string, presetId: string): void {
  const sys = this.systems.get(systemId);
  const preset = GENERIC_INVERTER_PRESETS.find(p => p.id === presetId);
  if (!sys || !preset) return;
  const currentCount = sys.inverter?.inverterCount || 1;
  sys.inverter = { ...preset, inverterCount: currentCount };
  this.distributeStringsAcrossInverters(systemId, currentCount, true);
  this.notify();
}

export function setSystemInverterCapacity(this: ProjectStore, systemId: string, ratedAcKw: number): void {
  const sys = this.systems.get(systemId);
  if (!sys) return;
  const kw = Math.max(0.5, Number(ratedAcKw) || 10);
  const currentCount = sys.inverter?.inverterCount || 1;
  const matchingPreset = GENERIC_INVERTER_PRESETS.find(p => p.ratedAcPowerKw === kw);
  if (matchingPreset) {
    sys.inverter = {
      ...sys.inverter,
      ...matchingPreset,
      ratedAcPowerKw: kw,
      inverterCount: currentCount
    };
  } else {
    sys.inverter = {
      ...sys.inverter,
      ratedAcPowerKw: kw,
      inverterCount: currentCount
    };
  }
  this.distributeStringsAcrossInverters(systemId, currentCount, true);
  this.notify();
}

export function removeSystem(this: ProjectStore, systemId: string, deleteContents: boolean = true): void {
  const sys = this.systems.get(systemId);
  if (!sys) return;

  if (deleteContents) {
    const zoneIdsToDelete = Array.from(this.zones.values())
      .filter(z => z.systemId === systemId)
      .map(z => z.id);

    for (const zId of zoneIdsToDelete) {
      this.removeZone(zId);
    }
  } else {
    const fallbackSys = this.getSystems().find(s => s.id !== systemId);
    if (fallbackSys) {
      for (const zone of this.zones.values()) {
        if (zone.systemId === systemId) {
          this.linkZoneToSystem(zone.id, fallbackSys.id);
        }
      }
    }
  }

  this.systems.delete(systemId);

  if (this.systems.size === 0) {
    this.ensureDefaultSystem();
  } else if (this.selectedSystemId === systemId) {
    this.selectedSystemId = this.getSystems()[0].id;
  }

  this.notify();
}

export function linkZoneToSystem(this: ProjectStore, zoneId: string, targetSystemId: string): void {
  const zone = this.zones.get(zoneId);
  const targetSys = this.systems.get(targetSystemId);
  if (!zone || !targetSys) return;

  if (zone.systemId && zone.systemId !== targetSystemId) {
    const prevSys = this.systems.get(zone.systemId);
    if (prevSys) {
      prevSys.zoneIds = prevSys.zoneIds.filter(id => id !== zoneId);
    }
  }

  zone.systemId = targetSystemId;
  if (zone.raceway) {
    zone.raceway.systemId = targetSystemId;
  }
  if (!targetSys.zoneIds.includes(zoneId)) {
    targetSys.zoneIds.push(zoneId);
  }

  for (const panel of this.panels.values()) {
    if (panel.zoneId === zoneId) {
      panel.systemId = targetSystemId;
      // Reset string state so the array doesn't retain old string assignments from the previous system
      panel.stringId = null;
      panel.stringOrder = null;
      panel.mpptId = null;
      panel.inverterIndex = null;
    }
  }

  this.notify();
}

export function setSystemInverterLocation(this: ProjectStore, systemId: string, location: LatLngPoint | null, elevationM?: number): void {
  const sys = this.systems.get(systemId);
  if (!sys) return;
  sys.inverterLocation = location;
  if (elevationM !== undefined) {
    sys.inverterElevationM = elevationM;
  }
  this.notify();
}

export function setSystemAcInterconnectionLocation(this: ProjectStore, systemId: string, location: LatLngPoint | null, elevationM?: number): void {
  const sys = this.systems.get(systemId);
  if (!sys) return;
  sys.acInterconnectionLocation = location;
  if (elevationM !== undefined) {
    sys.acInterconnectionElevationM = elevationM;
  }
  this.notify();
}

export function setSystemAcInterconnectionElevation(this: ProjectStore, systemId: string, elevationM: number): void {
  const sys = this.systems.get(systemId);
  if (!sys) return;
  sys.acInterconnectionElevationM = Number(elevationM) || 0;
  this.notify();
}
