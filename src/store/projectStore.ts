import {
  AcFeederSummary,
  ArrayZone,
  DEFAULT_MODULE_MODELS,
  GENERIC_INVERTER_PRESETS,
  InverterConfig,
  KeepOutPolygon,
  LatLngPoint,
  LayoutConfig,
  ModuleModel,
  MountType,
  RacewayConfig,
  SolarPanelObject,
  SolarSystem,
  StringCableLength,
  SystemCableSummary,
  ViewFilterState,
  ViewPresetKey,
  ZNSHINE_600W_BIFACIAL,
  StringTraverseDirection,
  ProjectBoqState,
  DupaWorkItem,
  CustomSolarResource,
  FacilityLoadProfile,
  LoadProfileArchetype
} from '../types/solar';
import { calculateSolarSystemYield, SolarYieldResult } from '../geo/solarYield';
import { createDefaultLoadProfile, scaleAnnualLoad, ARCHETYPE_DIURNAL_CURVES } from '../geo/loadProfile';
import { simulateSolarAndLoadMatching, SimulationResult, SimulationOptions } from '../geo/energySimulation';
import { generateBoqFromRegistryAndSld, recalculateDupaItem } from '../geo/boqCalculator';
import { computePolygonAreaSqM, computePolygonCentroid } from '../geo/projection';
import { sanitizeColor, sanitizeIdentifier } from '../utils/sanitizeProjectData';
import {
  exportProjectJson as exportProjectJsonImpl,
  exportProjectGeoJson as exportProjectGeoJsonImpl,
  importProjectJson as importProjectJsonImpl,
  saveToLocalStorage as saveToLocalStorageImpl,
  loadFromLocalStorage as loadFromLocalStorageImpl
} from './projectSerialization';
import {
  setStringTraverseDirection as setStringTraverseDirectionImpl,
  autoStringSystem as autoStringSystemImpl,
  distributeStringsAcrossInverters as distributeStringsAcrossInvertersImpl,
  renameString as renameStringImpl,
  sanitizeStringIntegrity as sanitizeStringIntegrityImpl
} from './stringingActions';
import {
  applyViewPreset as applyViewPresetImpl,
  getActiveViewPreset as getActiveViewPresetImpl
} from './viewPresets';
import {
  addZone as addZoneImpl,
  updateZoneConfig as updateZoneConfigImpl,
  updateSelectedZonesConfig as updateSelectedZonesConfigImpl,
  matchZoneProperties as matchZonePropertiesImpl,
  optimizeZoneGridShift as optimizeZoneGridShiftImpl,
  optimizeSelectedZonesGridShift as optimizeSelectedZonesGridShiftImpl,
  regenerateZonePanels as regenerateZonePanelsImpl,
  copySelectedZones as copySelectedZonesImpl,
  pasteZones as pasteZonesImpl,
  ClipboardZone
} from './zoneActions';
import { getSystemHomeruns as getSystemHomerunsImpl, pickNearestHomerun as pickNearestHomerunImpl } from '../geo/stringCabling';
import {
  moveSelectedZones as moveSelectedZonesImpl,
  moveSelectedZonesTo as moveSelectedZonesToImpl,
  rotateSelectedZones as rotateSelectedZonesImpl,
  flipSelectedZones as flipSelectedZonesImpl,
  duplicateSelectedZones as duplicateSelectedZonesImpl,
  cutSelectedZones as cutSelectedZonesImpl,
  FlipAxis
} from './zoneTransforms';
import {
  getSystemAcFeederSummary as getSystemAcFeederSummaryImpl,
  getStringCables as getStringCablesImpl,
  getSystemCableSummary as getSystemCableSummaryImpl,
  getAllCableSummaries as getAllCableSummariesImpl
} from './cableSummaries';

export type DrawingMode = 'none' | 'zone' | 'keepout' | 'inverter' | 'raceway' | 'ac_interconnection' | 'ac_raceway' | 'match_props';

export interface MatchPropertiesOptions {
  matchModule?: boolean;        // Module model, dimensions & electrical STC
  matchMountType?: boolean;     // Roof vs Ground, rail count & overhang, or table up/wide & spacing
  matchOrientation?: boolean;   // Portrait vs Landscape
  matchAzimuth?: boolean;       // Azimuth degrees / downslope heading
  matchTilt?: boolean;          // Tilt degrees
  matchSpacing?: boolean;       // Row spacing (pitch) & Column spacing
  matchSetback?: boolean;       // Perimeter setback distance
  matchTraverse?: boolean;      // String traverse direction
  matchSystem?: boolean;        // Re-link target arrays into source system
  autoOptimize?: boolean;       // Re-run grid shift optimizer after applying
}

const SYSTEM_COLORS = [
  '#0284c7', // Sky
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4'  // Cyan
];

export const ZONE_COLORS = [
  '#2563eb', // Blue
  '#16a34a', // Green
  '#d97706', // Amber
  '#9333ea', // Purple
  '#0891b2', // Cyan
  '#e11d48'  // Rose
];

export class ProjectStore {
  modules: Map<string, ModuleModel> = new Map();
  systems: Map<string, SolarSystem> = new Map();
  zones: Map<string, ArrayZone> = new Map();
  panels: Map<string, SolarPanelObject> = new Map();
  boqState: ProjectBoqState | null = null;

  public projectName: string = 'Solar Geo Project';

  public setProjectName(name: string): void {
    this.projectName = name;
    this.notify();
  }
  public layoutVersion: number = 0;
  public selectedSystemId: string | null = null;
  public selectedZoneId: string | null = null;
  public selectedZoneIds: Set<string> = new Set();
  public selectedKeepOutId: string | null = null;
  public selectedPanelId: string | null = null;
  public zoneClipboard: ClipboardZone[] = [];
  public pasteCount = 0;
  public drawingMode: DrawingMode = 'none';
  public drawingMountType: MountType = 'roof';
  public matchPropsSourceZoneId: string | null = null;
  public matchPropsOptions: MatchPropertiesOptions = {
    matchModule: true,
    matchMountType: true,
    matchOrientation: true,
    matchAzimuth: true,
    matchTilt: true,
    matchSpacing: true,
    matchSetback: true,
    matchTraverse: true,
    matchSystem: false,
    autoOptimize: false
  };

  public setMatchPropsMode(enabled: boolean, sourceZoneId?: string | null): void {
    if (enabled) {
      this.matchPropsSourceZoneId = sourceZoneId || this.selectedZoneId || (this.zones.size > 0 ? this.zones.keys().next().value ?? null : null);
      this.drawingMode = 'match_props';
    } else {
      this.matchPropsSourceZoneId = null;
      this.drawingMode = 'none';
    }
    this.notify();
  }
  public center: LatLngPoint = { lat: 37.7749, lng: -122.4194 };
  public zoom: number = 19;

  public viewFilter: ViewFilterState = {
    panelVisibility: 'full',
    showArrayFill: true,
    showKeepOuts: true,
    showLabels: true,
    showStringLines: true,
    showHomerunLines: true,
    showRaceways: true,
    showTiltArrows: true,
    showVertices: true,
    showMountTables: true,
    showRoofRails: true,
    showInverters: true,
    xRayMode: false,
    basemap: 'google-hybrid'
  };

  public stringTraverseDirection: StringTraverseDirection = 'short_side';
  public customSolarResource: CustomSolarResource | null = null;
  public loadProfile: FacilityLoadProfile | null = null;

  public getStringTraverseDirection(zoneId?: string): StringTraverseDirection {
    if (zoneId) {
      const zone = this.zones.get(zoneId);
      if (zone?.config?.stringTraverseDirection) {
        return zone.config.stringTraverseDirection;
      }
    }
    return this.stringTraverseDirection || 'short_side';
  }

  public setStringTraverseDirection(
    direction: StringTraverseDirection,
    zoneId?: string,
    autoReString: boolean = true
  ): void {
    return setStringTraverseDirectionImpl.call(this, direction, zoneId, autoReString);
  }

  private listeners: Array<() => void> = [];
  colorIndex = 0;

  constructor() {
    this.ensureDefaultModules();
    this.ensureDefaultSystem();
    this.loadFromLocalStorage();
  }

  ensureDefaultModules(): void {
    if (this.modules.size === 0) {
      for (const m of DEFAULT_MODULE_MODELS) {
        this.modules.set(m.id, { ...m });
      }
    }
  }

  ensureDefaultSystem(): void {
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

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
    this.saveToLocalStorage();
  }

  // --- Module Library Management ---

  public getModules(): ModuleModel[] {
    return Array.from(this.modules.values());
  }

  public getModule(moduleId: string): ModuleModel | undefined {
    return this.modules.get(moduleId) || this.modules.get(ZNSHINE_600W_BIFACIAL.id);
  }

  public addModule(model: ModuleModel): void {
    this.modules.set(model.id, model);
    this.notify();
  }

  public updateModule(moduleId: string, partial: Partial<ModuleModel>): void {
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

  public setArrayModule(zoneId: string, moduleId: string): void {
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

  // --- Systems & Inverter Management ---

  public getSystems(): SolarSystem[] {
    return Array.from(this.systems.values());
  }

  public getSystem(systemId: string): SolarSystem | undefined {
    return this.systems.get(systemId);
  }

  public getSelectedSystem(): SolarSystem | undefined {
    if (this.selectedSystemId && this.systems.has(this.selectedSystemId)) {
      return this.systems.get(this.selectedSystemId);
    }
    const zone = this.getSelectedZone();
    if (zone && zone.systemId && this.systems.has(zone.systemId)) {
      return this.systems.get(zone.systemId);
    }
    return this.getSystems()[0];
  }

  public selectSystem(systemId: string | null, selectDefaultZone: boolean = true): void {
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

  public addSystem(name?: string, color?: string, inverter?: InverterConfig): SolarSystem {
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

  public updateSystem(systemId: string, partial: Partial<SolarSystem>): void {
    const sys = this.systems.get(systemId);
    if (!sys) return;
    Object.assign(sys, partial);
    this.notify();
  }

  public updateSystemInverter(systemId: string, partial: Partial<InverterConfig>): void {
    const sys = this.systems.get(systemId);
    if (!sys) return;
    const prevCount = sys.inverter.inverterCount;
    sys.inverter = { ...sys.inverter, ...partial };
    const force = partial.inverterCount !== undefined && partial.inverterCount !== prevCount;
    this.distributeStringsAcrossInverters(systemId, sys.inverter.inverterCount, force);
    this.notify();
  }

  public setSystemInverterPreset(systemId: string, presetId: string): void {
    const sys = this.systems.get(systemId);
    const preset = GENERIC_INVERTER_PRESETS.find(p => p.id === presetId);
    if (!sys || !preset) return;
    const currentCount = sys.inverter?.inverterCount || 1;
    sys.inverter = { ...preset, inverterCount: currentCount };
    this.distributeStringsAcrossInverters(systemId, currentCount, true);
    this.notify();
  }

  public setSystemInverterCapacity(systemId: string, ratedAcKw: number): void {
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

  public removeSystem(systemId: string, deleteContents: boolean = true): void {
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

  public linkZoneToSystem(zoneId: string, targetSystemId: string): void {
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

  // --- Inverter Power House Geolocation & Array Elevation ---

  public clearSystemInverterLocation(systemId: string): void {
    this.setSystemInverterLocation(systemId, null);
  }

  public setSystemInverterLocation(
    systemId: string,
    location: LatLngPoint | null,
    elevationM?: number
  ): void {
    const sys = this.systems.get(systemId);
    if (!sys) return;
    sys.inverterLocation = location;
    if (elevationM !== undefined) {
      sys.inverterElevationM = elevationM;
    }
    this.notify();
  }

  // --- AC Interconnection (PCC / Point of Common Coupling) ---

  public clearSystemAcInterconnectionLocation(systemId: string): void {
    this.setSystemAcInterconnectionLocation(systemId, null);
  }

  public setSystemAcInterconnectionLocation(
    systemId: string,
    location: LatLngPoint | null,
    elevationM?: number
  ): void {
    const sys = this.systems.get(systemId);
    if (!sys) return;
    sys.acInterconnectionLocation = location;
    if (elevationM !== undefined) {
      sys.acInterconnectionElevationM = elevationM;
    }
    this.notify();
  }

  public setSystemAcInterconnectionElevation(systemId: string, elevationM: number): void {
    const sys = this.systems.get(systemId);
    if (!sys) return;
    sys.acInterconnectionElevationM = Number(elevationM) || 0;
    this.notify();
  }

  public setZoneElevationDelta(zoneId: string, elevationDeltaM: number): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.elevationDeltaM = Number(elevationDeltaM) || 0;
    this.notify();
  }

  // --- Raceway Cable Path Management ---

  public setZoneRaceway(
    zoneId: string,
    path: LatLngPoint[],
    elevationChangeM: number = 0,
    name?: string
  ): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;

    zone.raceway = {
      id: `rw_${zoneId}_${Date.now()}`,
      name: name || `Raceway (${zone.name})`,
      path,
      elevationChangeM: Number(elevationChangeM) || 0,
      systemId: zone.systemId
    };
    this.notify();
  }

  public updateRacewayVertices(zoneId: string, path: LatLngPoint[]): void {
    const zone = this.zones.get(zoneId);
    if (!zone || !zone.raceway) return;
    zone.raceway.path = path;
    this.notify();
  }

  public addRacewayVertex(zoneId: string, insertAfterIndex: number, point: LatLngPoint): void {
    const zone = this.zones.get(zoneId);
    if (!zone || !zone.raceway) return;
    const newPath = [...zone.raceway.path];
    newPath.splice(insertAfterIndex + 1, 0, point);
    this.updateRacewayVertices(zoneId, newPath);
  }

  public deleteRacewayVertex(zoneId: string, vertexIndex: number): boolean {
    const zone = this.zones.get(zoneId);
    if (!zone || !zone.raceway || zone.raceway.path.length <= 2) return false;
    const newPath = zone.raceway.path.filter((_, idx) => idx !== vertexIndex);
    this.updateRacewayVertices(zoneId, newPath);
    return true;
  }

  public setRacewayElevationChange(zoneId: string, elevationM: number): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    if (zone.raceway) {
      zone.raceway.elevationChangeM = Number(elevationM) || 0;
    } else {
      zone.elevationDeltaM = Number(elevationM) || 0;
    }
    this.notify();
  }

  public clearZoneRaceway(zoneId: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.raceway = null;
    this.notify();
  }

  // --- System Shared Homerun Raceway Management ---

  public setSystemHomerun(
    systemId: string,
    path: LatLngPoint[],
    elevationChangeM: number = 0,
    name?: string
  ): void {
    const sys = this.systems.get(systemId);
    if (!sys) return;

    sys.homerunRaceway = {
      id: `rw_sys_${systemId}_${Date.now()}`,
      name: name || `Homerun (${sys.name})`,
      path,
      elevationChangeM: Number(elevationChangeM) || 0,
      systemId
    };
    this.notify();
  }

  /** All homerun trunks of a system (primary first, then extras). */
  public getSystemHomeruns(systemId?: string): RacewayConfig[] {
    const sys = this.systems.get(systemId || this.selectedSystemId || '');
    return sys ? getSystemHomerunsImpl(sys) : [];
  }

  private findHomerun(systemId: string, homerunId?: string): RacewayConfig | null {
    const sys = this.systems.get(systemId);
    if (!sys) return null;
    if (!homerunId) return sys.homerunRaceway || sys.extraHomeruns?.[0] || null;
    return getSystemHomerunsImpl(sys).find(h => h.id === homerunId) || null;
  }

  /**
   * Adds another homerun trunk to the system (the first one becomes the primary).
   * Returns the new trunk.
   */
  public addSystemHomerun(
    systemId: string,
    path: LatLngPoint[],
    elevationChangeM: number = 0,
    name?: string
  ): RacewayConfig | null {
    const sys = this.systems.get(systemId);
    if (!sys) return null;
    const count = getSystemHomerunsImpl(sys).length;
    const hr: RacewayConfig = {
      id: `rw_sys_${systemId}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: name || (count === 0 ? `Homerun (${sys.name})` : `Homerun ${count + 1} (${sys.name})`),
      path,
      elevationChangeM: Number(elevationChangeM) || 0,
      systemId
    };
    if (!sys.homerunRaceway) {
      sys.homerunRaceway = hr;
    } else {
      sys.extraHomeruns = [...(sys.extraHomeruns || []), hr];
    }
    this.notify();
    return hr;
  }

  public updateSystemHomerunVertices(systemId: string, path: LatLngPoint[], homerunId?: string): void {
    const hr = this.findHomerun(systemId, homerunId);
    if (!hr) return;
    hr.path = path;
    this.notify();
  }

  public addSystemHomerunVertex(systemId: string, insertAfterIndex: number, point: LatLngPoint, homerunId?: string): void {
    const hr = this.findHomerun(systemId, homerunId);
    if (!hr) return;
    const newPath = [...hr.path];
    newPath.splice(insertAfterIndex + 1, 0, point);
    this.updateSystemHomerunVertices(systemId, newPath, homerunId);
  }

  public deleteSystemHomerunVertex(systemId: string, vertexIndex: number, homerunId?: string): boolean {
    const hr = this.findHomerun(systemId, homerunId);
    if (!hr || hr.path.length <= 2) return false;
    const newPath = hr.path.filter((_, idx) => idx !== vertexIndex);
    this.updateSystemHomerunVertices(systemId, newPath, homerunId);
    return true;
  }

  public setSystemHomerunElevation(systemId: string, elevationM: number, homerunId?: string): void {
    const hr = this.findHomerun(systemId, homerunId);
    if (!hr) return;
    hr.elevationChangeM = Number(elevationM) || 0;
    this.notify();
  }

  /** Removes one homerun trunk by id, or every trunk of the system when no id is given. */
  public clearSystemHomerun(systemId: string, homerunId?: string): void {
    const sys = this.systems.get(systemId);
    if (!sys) return;
    if (!homerunId) {
      sys.homerunRaceway = null;
      sys.extraHomeruns = [];
    } else if (sys.homerunRaceway?.id === homerunId) {
      // Promote the next trunk, if any, to primary.
      const [next, ...rest] = sys.extraHomeruns || [];
      sys.homerunRaceway = next ?? null;
      sys.extraHomeruns = rest;
    } else {
      sys.extraHomeruns = (sys.extraHomeruns || []).filter(h => h.id !== homerunId);
    }
    this.notify();
  }

  public getSystemHomerun(systemId?: string, homerunId?: string): RacewayConfig | null {
    const targetSysId = systemId || this.selectedSystemId;
    if (!targetSysId) return null;
    if (homerunId) return this.findHomerun(targetSysId, homerunId);
    return this.systems.get(targetSysId)?.homerunRaceway || null;
  }

  public getHomerunForZone(zoneId: string): RacewayConfig | null {
    const zone = this.zones.get(zoneId);
    if (!zone) return null;
    if (zone.raceway && (!zone.raceway.systemId || zone.raceway.systemId === zone.systemId)) {
      return zone.raceway;
    }
    if (zone.systemId) {
      const sys = this.systems.get(zone.systemId);
      const homeruns = getSystemHomerunsImpl(sys);
      if (homeruns.length > 1 && zone.vertices.length > 0) {
        return pickNearestHomerunImpl(homeruns, computePolygonCentroid(zone.vertices)) || sys?.homerunRaceway || null;
      }
      return sys?.homerunRaceway || null;
    }
    return null;
  }

  // --- System AC Feeder Raceway Management ---

  public setSystemAcRaceway(
    systemId: string,
    path: LatLngPoint[],
    elevationChangeM: number = 0,
    name?: string
  ): void {
    const sys = this.systems.get(systemId);
    if (!sys) return;

    sys.acRaceway = {
      id: `rw_ac_${systemId}_${Date.now()}`,
      name: name || `AC Feeder (${sys.name})`,
      path,
      elevationChangeM: Number(elevationChangeM) || 0,
      systemId,
      racewayType: 'ac_feeder'
    };
    this.notify();
  }

  public updateSystemAcRacewayVertices(systemId: string, path: LatLngPoint[]): void {
    const sys = this.systems.get(systemId);
    if (!sys || !sys.acRaceway) return;
    sys.acRaceway.path = path;
    this.notify();
  }

  public addSystemAcRacewayVertex(systemId: string, insertAfterIndex: number, point: LatLngPoint): void {
    const sys = this.systems.get(systemId);
    if (!sys || !sys.acRaceway) return;
    const newPath = [...sys.acRaceway.path];
    newPath.splice(insertAfterIndex + 1, 0, point);
    this.updateSystemAcRacewayVertices(systemId, newPath);
  }

  public deleteSystemAcRacewayVertex(systemId: string, vertexIndex: number): boolean {
    const sys = this.systems.get(systemId);
    if (!sys || !sys.acRaceway || sys.acRaceway.path.length <= 2) return false;
    const newPath = sys.acRaceway.path.filter((_, idx) => idx !== vertexIndex);
    this.updateSystemAcRacewayVertices(systemId, newPath);
    return true;
  }

  public setSystemAcRacewayElevation(systemId: string, elevationM: number): void {
    const sys = this.systems.get(systemId);
    if (!sys || !sys.acRaceway) return;
    sys.acRaceway.elevationChangeM = Number(elevationM) || 0;
    this.notify();
  }

  public clearSystemAcRaceway(systemId: string): void {
    const sys = this.systems.get(systemId);
    if (!sys) return;
    sys.acRaceway = null;
    this.notify();
  }

  public getSystemAcRaceway(systemId?: string): RacewayConfig | null {
    const targetSysId = systemId || this.selectedSystemId;
    if (targetSysId) {
      const sys = this.systems.get(targetSysId);
      return sys?.acRaceway || null;
    }
    return null;
  }

  public getSystemAcFeederSummary(systemId: string): AcFeederSummary {
    return getSystemAcFeederSummaryImpl.call(this, systemId);
  }

  public getStringCables(systemId?: string): StringCableLength[] {
    return getStringCablesImpl.call(this, systemId);
  }

  public getSystemCableSummary(systemId: string): SystemCableSummary {
    return getSystemCableSummaryImpl.call(this, systemId);
  }

  public getAllCableSummaries(): SystemCableSummary[] {
    return getAllCableSummariesImpl.call(this);
  }

  // --- Grid Optimization & Auto-Stringing ---

  public optimizeZoneGridShift(
    zoneId: string,
    steps: number = 12,
    autoString: boolean = true,
    customModulesPerString?: number,
    direction?: StringTraverseDirection
  ): { optimalOffsetX: number; optimalOffsetY: number; maxPanelCount: number; previousPanelCount: number; totalStrings?: number; modulesPerString?: number; warnings?: string[] } {
    return optimizeZoneGridShiftImpl.call(this, zoneId, steps, autoString, customModulesPerString, direction);
  }

  public autoStringSystem(
    systemId: string,
    customModulesPerString?: number,
    direction?: StringTraverseDirection
  ): { totalStrings: number; modulesPerString: number; inverterLoadRatio: number; warnings: string[]; stringDirection?: StringTraverseDirection } {
    return autoStringSystemImpl.call(this, systemId, customModulesPerString, direction);
  }

  /**
   * Distributes existing strings evenly across all inverters of a system
   * and enforces strict voltage compliance (splitting strings exceeding inverter Vmax or limits.maxPanelsPerString).
   */
  public distributeStringsAcrossInverters(
    systemId: string,
    targetInverterCount?: number,
    force: boolean = false
  ): boolean {
    return distributeStringsAcrossInvertersImpl.call(this, systemId, targetInverterCount, force);
  }

  // --- View Filter Management ---

  public setViewFilter(partial: Partial<ViewFilterState>): void {
    this.viewFilter = { ...this.viewFilter, ...partial };
    this.layoutVersion++;
    this.notify();
  }

  public applyViewPreset(preset: ViewPresetKey): void {
    return applyViewPresetImpl.call(this, preset);
  }

  public getActiveViewPreset(): ViewPresetKey | 'custom' {
    return getActiveViewPresetImpl.call(this);
  }

  public toggleXRayMode(): void {
    const nextState = !this.viewFilter.xRayMode;
    this.viewFilter.xRayMode = nextState;
    if (nextState) {
      this.viewFilter.panelVisibility = 'hidden';
      this.viewFilter.showArrayFill = false;
    } else {
      this.viewFilter.panelVisibility = 'full';
      this.viewFilter.showArrayFill = true;
    }
    this.notify();
  }

  public selectKeepOut(keepOutId: string | null): void {
    this.selectedKeepOutId = keepOutId;
    this.notify();
  }

  // --- Zones Management ---

  public getZones(): ArrayZone[] {
    return Array.from(this.zones.values());
  }

  public getZonesForSystem(systemId: string): ArrayZone[] {
    return Array.from(this.zones.values()).filter(z => z.systemId === systemId);
  }

  public getZone(zoneId: string): ArrayZone | undefined {
    return this.zones.get(zoneId);
  }

  public getSelectedZone(): ArrayZone | undefined {
    if (this.selectedPanelId !== null) return undefined;
    return this.selectedZoneId ? this.zones.get(this.selectedZoneId) : undefined;
  }

  public getSelectedZones(): ArrayZone[] {
    if (this.selectedPanelId !== null) return [];
    const list: ArrayZone[] = [];
    for (const id of this.selectedZoneIds) {
      const z = this.zones.get(id);
      if (z) list.push(z);
    }
    if (list.length === 0 && this.selectedZoneId) {
      const z = this.zones.get(this.selectedZoneId);
      if (z) list.push(z);
    }
    return list;
  }

  public getSelectedZoneIds(): string[] {
    if (this.selectedPanelId !== null) return [];
    if (this.selectedZoneIds.size > 0) {
      return Array.from(this.selectedZoneIds);
    }
    return this.selectedZoneId ? [this.selectedZoneId] : [];
  }

  public isZoneSelected(zoneId: string): boolean {
    return this.selectedPanelId === null && (this.selectedZoneIds.has(zoneId) || this.selectedZoneId === zoneId);
  }

  public getSelectedPanel(): SolarPanelObject | undefined {
    return this.selectedPanelId ? this.panels.get(this.selectedPanelId) : undefined;
  }

  public getPanels(): SolarPanelObject[] {
    return Array.from(this.panels.values());
  }

  public getPanelsForZone(zoneId: string): SolarPanelObject[] {
    return Array.from(this.panels.values()).filter(p => p.zoneId === zoneId);
  }

  public getPanelsForSystem(systemId: string): SolarPanelObject[] {
    return Array.from(this.panels.values()).filter(p => {
      const z = this.zones.get(p.zoneId);
      if (z) {
        if (p.systemId !== z.systemId) {
          p.systemId = z.systemId;
        }
        return z.systemId === systemId;
      }
      return p.systemId === systemId;
    });
  }

  public getPanel(panelId: string): SolarPanelObject | undefined {
    return this.panels.get(panelId);
  }

  public setDrawingMode(mode: DrawingMode, mountType: MountType = 'roof'): void {
    this.drawingMode = mode;
    this.drawingMountType = mountType;
    this.layoutVersion++;
    this.notify();
  }

  public selectZone(zoneId: string | null, isMulti: boolean = false): void {
    if (zoneId === null) {
      this.selectedZoneId = null;
      this.selectedZoneIds.clear();
      this.selectedPanelId = null;
      this.notify();
      return;
    }

    if (isMulti) {
      if (this.selectedZoneId && !this.selectedZoneIds.has(this.selectedZoneId)) {
        this.selectedZoneIds.add(this.selectedZoneId);
      }
      if (this.selectedZoneIds.has(zoneId)) {
        this.selectedZoneIds.delete(zoneId);
        if (this.selectedZoneId === zoneId) {
          this.selectedZoneId = this.selectedZoneIds.values().next().value ?? null;
        }
      } else {
        this.selectedZoneIds.add(zoneId);
        this.selectedZoneId = zoneId;
      }
    } else {
      this.selectedZoneIds.clear();
      this.selectedZoneIds.add(zoneId);
      this.selectedZoneId = zoneId;
    }

    this.selectedPanelId = null;
    const z = this.zones.get(zoneId);
    if (z) {
      this.selectedSystemId = z.systemId;
    }
    this.notify();
  }

  public selectAllZones(): void {
    this.selectedZoneIds.clear();
    for (const z of this.zones.values()) {
      this.selectedZoneIds.add(z.id);
    }
    this.selectedZoneId = this.selectedZoneIds.values().next().value ?? null;
    this.selectedPanelId = null;
    this.notify();
  }

  public clearZoneSelection(): void {
    this.selectedZoneId = null;
    this.selectedZoneIds.clear();
    this.selectedPanelId = null;
    this.notify();
  }

  public selectPanel(panelId: string | null): void {
    this.selectedPanelId = panelId;
    if (panelId) {
      const p = this.panels.get(panelId);
      if (p) {
        this.selectedSystemId = p.systemId;
      }
      this.selectedZoneId = null;
      this.selectedZoneIds.clear();
    }
    this.notify();
  }

  public copySelectedZones(): number {
    this.pasteCount = 0;
    return copySelectedZonesImpl.call(this);
  }

  public moveSelectedZones(eastM: number, northM: number): number {
    return moveSelectedZonesImpl.call(this, eastM, northM);
  }

  public moveSelectedZonesTo(target: LatLngPoint): number {
    return moveSelectedZonesToImpl.call(this, target);
  }

  public rotateSelectedZones(deg: number, pivot?: LatLngPoint): number {
    return rotateSelectedZonesImpl.call(this, deg, pivot);
  }

  public flipSelectedZones(axis: FlipAxis): number {
    return flipSelectedZonesImpl.call(this, axis);
  }

  public duplicateSelectedZones(): ArrayZone[] {
    return duplicateSelectedZonesImpl.call(this);
  }

  public cutSelectedZones(): number {
    return cutSelectedZonesImpl.call(this);
  }

  public pasteZones(anchor?: LatLngPoint): ArrayZone[] {
    return pasteZonesImpl.call(this, anchor);
  }

  public addZone(
    vertices: LatLngPoint[],
    mountType: MountType = 'roof',
    customName?: string,
    targetSystemId?: string,
    targetModuleId?: string
  ): ArrayZone {
    return addZoneImpl.call(this, vertices, mountType, customName, targetSystemId, targetModuleId);
  }

  public updateZoneVertices(
    zoneId: string,
    vertices: LatLngPoint[],
    optimize: boolean = false,
    steps: number = 12
  ): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;

    zone.vertices = vertices;
    zone.areaSqM = computePolygonAreaSqM(vertices);
    if (optimize) {
      this.optimizeZoneGridShift(zoneId, steps);
    } else {
      this.regenerateZonePanels(zoneId, false);
      this.notify();
    }
  }

  public addZoneVertex(zoneId: string, insertAfterIndex: number, point: LatLngPoint): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    const newVertices = [...zone.vertices];
    newVertices.splice(insertAfterIndex + 1, 0, point);
    this.updateZoneVertices(zoneId, newVertices, true);
  }

  public deleteZoneVertex(zoneId: string, vertexIndex: number): boolean {
    const zone = this.zones.get(zoneId);
    if (!zone || zone.vertices.length <= 3) return false;
    const newVertices = zone.vertices.filter((_, idx) => idx !== vertexIndex);
    this.updateZoneVertices(zoneId, newVertices, true);
    return true;
  }

  public updateKeepOutVertices(
    zoneId: string,
    keepOutId: string,
    vertices: LatLngPoint[],
    optimize: boolean = false,
    steps: number = 12
  ): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    const ko = zone.keepOuts.find(k => k.id === keepOutId);
    if (!ko) return;
    ko.vertices = vertices;
    if (optimize) {
      this.optimizeZoneGridShift(zoneId, steps);
    } else {
      this.regenerateZonePanels(zoneId, false);
      this.notify();
    }
  }

  public addKeepOutVertex(zoneId: string, keepOutId: string, insertAfterIndex: number, point: LatLngPoint): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    const ko = zone.keepOuts.find(k => k.id === keepOutId);
    if (!ko) return;
    const newVertices = [...ko.vertices];
    newVertices.splice(insertAfterIndex + 1, 0, point);
    this.updateKeepOutVertices(zoneId, keepOutId, newVertices, true);
  }

  public deleteKeepOutVertex(zoneId: string, keepOutId: string, vertexIndex: number): boolean {
    const zone = this.zones.get(zoneId);
    if (!zone) return false;
    const ko = zone.keepOuts.find(k => k.id === keepOutId);
    if (!ko || ko.vertices.length <= 3) return false;
    const newVertices = ko.vertices.filter((_, idx) => idx !== vertexIndex);
    this.updateKeepOutVertices(zoneId, keepOutId, newVertices, true);
    return true;
  }

  public updateZoneConfig(
    zoneId: string,
    partialConfig: Partial<LayoutConfig>,
    optimize: boolean = false,
    steps: number = 12
  ): void {
    return updateZoneConfigImpl.call(this, zoneId, partialConfig, optimize, steps);
  }

  public updateSelectedZonesConfig(
    partialConfig: Partial<LayoutConfig>,
    optimize: boolean = false,
    steps: number = 12
  ): void {
    return updateSelectedZonesConfigImpl.call(this, partialConfig, optimize, steps);
  }

  /**
   * Matches/copies configuration properties from a source ArrayZone to one or more target ArrayZones.
   * Granular flags allow matching module specs, mount type & racking, tilt, azimuth, spacing, setback, etc.
   */
  public matchZoneProperties(
    sourceZoneId: string,
    targetZoneIds: string | string[],
    options: Partial<MatchPropertiesOptions> = {}
  ): { success: boolean; matchedCount: number; targetNames: string[] } {
    return matchZonePropertiesImpl.call(this, sourceZoneId, targetZoneIds, options);
  }

  public optimizeSelectedZonesGridShift(
    steps: number = 12,
    autoString: boolean = true,
    customModulesPerString?: number,
    direction?: StringTraverseDirection | 'auto'
  ): { totalMaxPanels: number; totalPreviousPanels: number; optimizedCount: number; totalStrings?: number; warnings?: string[] } {
    return optimizeSelectedZonesGridShiftImpl.call(this, steps, autoString, customModulesPerString, direction);
  }

  public setSelectedZonesModule(moduleId: string): void {
    const targetIds = this.getSelectedZoneIds();
    for (const id of targetIds) {
      this.setArrayModule(id, moduleId);
    }
    this.notify();
  }

  public updateZoneName(zoneId: string, name: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    const trimmed = name.trim();
    if (trimmed) {
      zone.name = trimmed;
      this.notify();
    }
  }

  public updateZoneColor(zoneId: string, color: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.color = sanitizeColor(color);
    this.notify();
  }

  public removeZone(zoneId: string): void {
    const zone = this.zones.get(zoneId);
    if (zone && zone.systemId) {
      const sys = this.systems.get(zone.systemId);
      if (sys) {
        sys.zoneIds = sys.zoneIds.filter(id => id !== zoneId);
      }
    }

    this.zones.delete(zoneId);

    for (const [panelId, panel] of this.panels.entries()) {
      if (panel.zoneId === zoneId) {
        this.panels.delete(panelId);
      }
    }
    this.selectedZoneIds.delete(zoneId);
    if (this.selectedZoneId === zoneId) {
      this.selectedZoneId = this.selectedZoneIds.values().next().value ?? null;
    }
    if (this.selectedPanelId && !this.panels.has(this.selectedPanelId)) {
      this.selectedPanelId = null;
    }
    this.layoutVersion++;
    this.notify();
  }

  public addKeepOut(zoneId: string, vertices: LatLngPoint[]): KeepOutPolygon | undefined {
    const zone = this.zones.get(zoneId);
    if (!zone) return undefined;

    const keepOutId = `ko_${Date.now()}`;
    const keepOut: KeepOutPolygon = {
      id: keepOutId,
      name: `Obstacle ${zone.keepOuts.length + 1}`,
      vertices
    };

    zone.keepOuts.push(keepOut);
    this.regenerateZonePanels(zoneId, false);
    this.notify();
    return keepOut;
  }

  public removeKeepOut(zoneId: string, keepOutId: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;

    zone.keepOuts = zone.keepOuts.filter(k => k.id !== keepOutId);
    if (this.selectedKeepOutId === keepOutId) {
      this.selectedKeepOutId = null;
    }
    this.regenerateZonePanels(zoneId, false);
    this.notify();
  }

  public deleteKeepOut(keepOutId: string): boolean {
    for (const zone of this.zones.values()) {
      if (zone.keepOuts.some(k => k.id === keepOutId)) {
        this.removeKeepOut(zone.id, keepOutId);
        return true;
      }
    }
    return false;
  }

  public deleteZone(zoneId: string): void {
    this.removeZone(zoneId);
  }

  public deleteSelected(): 'keepout' | 'zones' | 'zone' | null {
    if (this.selectedPanelId) {
      const pid = this.selectedPanelId;
      this.togglePanelActive(pid);
      return null;
    }
    if (this.selectedKeepOutId) {
      const koId = this.selectedKeepOutId;
      if (this.deleteKeepOut(koId)) {
        return 'keepout';
      }
    }
    if (this.selectedZoneIds.size > 1) {
      const ids = Array.from(this.selectedZoneIds);
      ids.forEach(id => this.removeZone(id));
      this.selectedZoneIds.clear();
      this.selectedZoneId = null;
      return 'zones';
    }
    if (this.selectedZoneId) {
      const id = this.selectedZoneId;
      this.removeZone(id);
      return 'zone';
    }
    return null;
  }

  public reassignKeepOutZone(currentZoneId: string, keepOutId: string, targetZoneId: string): boolean {
    if (currentZoneId === targetZoneId) return false;
    const currentZone = this.zones.get(currentZoneId);
    const targetZone = this.zones.get(targetZoneId);
    if (!currentZone || !targetZone) return false;

    const koIndex = currentZone.keepOuts.findIndex(k => k.id === keepOutId);
    if (koIndex === -1) return false;

    const [ko] = currentZone.keepOuts.splice(koIndex, 1);
    targetZone.keepOuts.push(ko);

    if (this.selectedKeepOutId === keepOutId) {
      this.selectedZoneId = targetZoneId;
    }

    this.regenerateZonePanels(currentZoneId, false);
    this.regenerateZonePanels(targetZoneId, false);
    this.notify();
    return true;
  }

  public updateKeepOutName(zoneId: string, keepOutId: string, name: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    const ko = zone.keepOuts.find(k => k.id === keepOutId);
    if (!ko) return;
    ko.name = name.trim() || ko.name;
    this.notify();
  }

  public getAllKeepOuts(): { keepOut: KeepOutPolygon; zoneId: string; zoneName: string; systemId: string }[] {
    const list: { keepOut: KeepOutPolygon; zoneId: string; zoneName: string; systemId: string }[] = [];
    for (const zone of this.zones.values()) {
      for (const ko of zone.keepOuts) {
        list.push({
          keepOut: ko,
          zoneId: zone.id,
          zoneName: zone.name,
          systemId: zone.systemId
        });
      }
    }
    return list;
  }

  public regenerateZonePanels(zoneId: string, shouldNotify: boolean = true): void {
    return regenerateZonePanelsImpl.call(this, zoneId, shouldNotify);
  }

  public togglePanelActive(panelId: string): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    panel.active = !panel.active;
    const zone = this.zones.get(panel.zoneId);
    if (zone) {
      const zonePanels = this.getPanelsForZone(panel.zoneId);
      zone.activePanelCount = zonePanels.filter(p => p.active).length;
      const totalWp = zonePanels.reduce(
        (sum, p) => (p.active ? sum + p.electrical.nominalPowerW : sum),
        0
      );
      zone.totalKwp = Number((totalWp / 1000).toFixed(2));
    }

    this.layoutVersion++;
    this.notify();
  }

  public removePanel(panelId: string): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    this.panels.delete(panelId);
    if (this.selectedPanelId === panelId) {
      this.selectedPanelId = null;
    }

    const zone = this.zones.get(panel.zoneId);
    if (zone) {
      const zonePanels = this.getPanelsForZone(panel.zoneId);
      zone.panelCount = zonePanels.length;
      zone.activePanelCount = zonePanels.filter(p => p.active).length;
      const totalWp = zonePanels.reduce(
        (sum, p) => (p.active ? sum + p.electrical.nominalPowerW : sum),
        0
      );
      zone.totalKwp = Number((totalWp / 1000).toFixed(2));
    }

    this.layoutVersion++;
    this.notify();
  }

  public updatePanelString(
    panelId: string,
    stringId: string | null,
    stringOrder: number | null,
    mpptId?: string | null,
    inverterIndex?: number | null
  ): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;
    panel.stringId = stringId === null ? null : sanitizeIdentifier(stringId);
    panel.stringOrder = stringOrder;
    if (mpptId !== undefined) panel.mpptId = mpptId;
    if (inverterIndex !== undefined) panel.inverterIndex = inverterIndex;
    this.notify();
  }

  public renameString(oldStringId: string, newStringId: string): void {
    return renameStringImpl.call(this, oldStringId, newStringId);
  }

  public updateStringAssignment(
    stringId: string,
    inverterIndex?: number,
    mpptId?: string
  ): void {
    for (const panel of this.panels.values()) {
      if (panel.stringId === stringId) {
        if (inverterIndex !== undefined) panel.inverterIndex = inverterIndex;
        if (mpptId !== undefined) panel.mpptId = mpptId;
      }
    }
    this.notify();
  }

  public getSystemSummary(filterSystemId?: string): {
    totalSystems: number;
    totalZones: number;
    totalPanels: number;
    totalActivePanels: number;
    totalKwp: number;
    totalAreaSqM: number;
    systemName?: string;
    inverterAcKw: number;
    dcAcRatio: number;
  } {
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

  public getSolarYieldEstimate(filterSystemId?: string): SolarYieldResult {
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

  public setCustomSolarResource(resource: CustomSolarResource | null): void {
    this.customSolarResource = resource;
    this.notify();
  }

  // --- Existing Facility Load Profile Management ---

  public getLoadProfile(systemId?: string): FacilityLoadProfile | null {
    if (!this.loadProfile) return null;
    if (systemId && systemId !== 'all' && this.loadProfile.systemId && this.loadProfile.systemId !== systemId) {
      return null;
    }
    return this.loadProfile;
  }

  public ensureLoadProfile(systemId?: string): FacilityLoadProfile {
    if (!this.loadProfile) {
      this.loadProfile = createDefaultLoadProfile(360000, 'commercial_office', 'Facility Main Meter Load', systemId);
      this.notify();
    }
    return this.loadProfile;
  }

  public setLoadProfile(profile: FacilityLoadProfile | null): void {
    this.loadProfile = profile;
    this.notify();
  }

  public scaleAnnualLoad(newAnnualKwh: number): void {
    const current = this.ensureLoadProfile();
    this.loadProfile = scaleAnnualLoad(current, newAnnualKwh);
    this.notify();
  }

  public applyLoadArchetype(archetype: LoadProfileArchetype): void {
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

  public updateMonthlyLoad(monthIndex: number, kwh: number, peakKw?: number, costPhp?: number): void {
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

  public getSimulationResult(
    systemId?: string,
    options?: Partial<SimulationOptions>
  ): SimulationResult {
    const solarYield = this.getSolarYieldEstimate(systemId);
    const loadProfile = this.ensureLoadProfile(systemId);
    return simulateSolarAndLoadMatching(solarYield, loadProfile, options);
  }

  public exportProjectJson(compact: boolean = false): string {
    return exportProjectJsonImpl.call(this, compact);
  }

  public exportProjectGeoJson(): string {
    return exportProjectGeoJsonImpl.call(this);
  }

  public importProjectJson(jsonStr: string): boolean {
    return importProjectJsonImpl.call(this, jsonStr);
  }

  public clearAll(): void {
    this.modules.clear();
    this.systems.clear();
    this.zones.clear();
    this.panels.clear();
    this.ensureDefaultModules();
    this.ensureDefaultSystem();
    this.selectedZoneId = null;
    this.selectedZoneIds.clear();
    this.selectedPanelId = null;
    this.layoutVersion++;
    this.notify();
    this.drawingMode = 'none';
    this.matchPropsSourceZoneId = null;
    this.stringTraverseDirection = 'short_side';
    this.boqState = null;
    this.customSolarResource = null;
    this.loadProfile = null;
    this.notify();
  }

  // --- Bill of Quantities (BOQ) & Detailed Unit Price Analysis (DUPA) Management ---

  public getBoqState(systemId?: string, forceRegenerate: boolean = false): ProjectBoqState {
    let needsRefresh = !this.boqState || forceRegenerate;
    if (!needsRefresh && this.boqState) {
      // Auto-reconcile if CAD has ground tables that are missing in saved BOQ
      const groundTablesInCad = this.getZones().reduce((acc, z) => {
        if (z.config?.mountType === 'ground') {
          return acc + (z.tableCount ?? (z.tables ? z.tables.length : 0));
        }
        return acc;
      }, 0);
      const d2 = this.boqState.items?.find(it => it.itemNo === 'D2');
      const hasTableInD2 = d2?.materials?.some(
        m => m.autoSourceKey === 'd2_ground_table_racking' || m.description.toLowerCase().includes('table')
      );
      if (groundTablesInCad > 0 && !hasTableInD2) {
        needsRefresh = true;
      }
    }
    if (needsRefresh || !this.boqState) {
      this.boqState = generateBoqFromRegistryAndSld(this, systemId, this.boqState || undefined);
    }
    return this.boqState;
  }

  public syncBoqFromCad(systemId?: string, resetRates: boolean = false): ProjectBoqState {
    this.boqState = generateBoqFromRegistryAndSld(
      this,
      systemId,
      resetRates ? undefined : (this.boqState || undefined)
    );
    this.notify();
    return this.boqState;
  }

  public updateBoqMarkups(ocmPercent: number, profitPercent: number, vatPercent: number): void {
    const boq = this.getBoqState();
    boq.ocmPercent = Math.max(0, ocmPercent);
    boq.profitPercent = Math.max(0, profitPercent);
    boq.vatPercent = Math.max(0, vatPercent);
    for (let i = 0; i < boq.items.length; i++) {
      boq.items[i].ocmPercent = boq.ocmPercent;
      boq.items[i].profitPercent = boq.profitPercent;
      boq.items[i].vatPercent = boq.vatPercent;
      boq.items[i] = recalculateDupaItem(boq.items[i]);
    }
    this.notify();
  }

  public updateDupaWorkItem(itemNo: string, updater: (item: DupaWorkItem) => DupaWorkItem): void {
    const boq = this.getBoqState();
    const idx = boq.items.findIndex(it => it.itemNo === itemNo);
    if (idx >= 0) {
      const updated = updater({ ...boq.items[idx] });
      boq.items[idx] = recalculateDupaItem(updated);
      this.notify();
    }
  }

  public toggleLightningProtection(include?: boolean): void {
    const boq = this.getBoqState();
    const current = boq.includeLightningProtection === true;
    const target = include !== undefined ? include : !current;
    boq.includeLightningProtection = target;
    // Re-generate BOQ preserving user rates and markups
    this.boqState = generateBoqFromRegistryAndSld(this, undefined, boq);
    this.notify();
  }

  public sanitizeStringIntegrity(): void {
    return sanitizeStringIntegrityImpl.call(this);
  }

  saveTimeout: any = null;

  saveToLocalStorage(): void {
    return saveToLocalStorageImpl.call(this);
  }

  private loadFromLocalStorage(): void {
    return loadFromLocalStorageImpl.call(this);
  }
}
