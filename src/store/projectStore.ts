import {
  ArrayZone,
  DEFAULT_GROUND_CONFIG,
  DEFAULT_MODULE_MODELS,
  DEFAULT_ROOF_CONFIG,
  GENERIC_INVERTER_PRESETS,
  InverterConfig,
  KeepOutPolygon,
  LatLngPoint,
  LayoutConfig,
  ModuleModel,
  MountType,
  ProjectData,
  RacewayConfig,
  SolarPanelObject,
  SolarSystem,
  StringCableLength,
  SystemCableSummary,
  ViewFilterState,
  ViewPresetKey,
  ZNSHINE_600W_BIFACIAL,
  StringTraverseDirection
} from '../types/solar';
import { computePolygonAreaSqM } from '../geo/projection';
import {
  calculateStringLimits,
  generatePanelsForZone,
  optimizeGridShift
} from '../geo/autofill';
import {
  calculateStringCableLengths,
  chainAdjacentPanels,
  sortPanelsForStringing,
  summarizeSystemCabling
} from '../geo/stringCabling';

export type DrawingMode = 'none' | 'zone' | 'keepout' | 'inverter' | 'raceway';

const SYSTEM_COLORS = [
  '#0284c7', // Sky
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4'  // Cyan
];

const ZONE_COLORS = [
  '#2563eb', // Blue
  '#16a34a', // Green
  '#d97706', // Amber
  '#9333ea', // Purple
  '#0891b2', // Cyan
  '#e11d48'  // Rose
];

export class ProjectStore {
  private modules: Map<string, ModuleModel> = new Map();
  private systems: Map<string, SolarSystem> = new Map();
  private zones: Map<string, ArrayZone> = new Map();
  private panels: Map<string, SolarPanelObject> = new Map();

  public projectName: string = 'Solar Geo Project';

  public setProjectName(name: string): void {
    this.projectName = name;
    this.notify();
  }
  public selectedSystemId: string | null = null;
  public selectedZoneId: string | null = null;
  public selectedZoneIds: Set<string> = new Set();
  public selectedKeepOutId: string | null = null;
  public selectedPanelId: string | null = null;
  public drawingMode: DrawingMode = 'none';
  public drawingMountType: MountType = 'roof';
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
    this.stringTraverseDirection = direction;
    const targetZones = zoneId
      ? [this.zones.get(zoneId)].filter(Boolean) as ArrayZone[]
      : this.getSelectedZones();

    for (const z of targetZones) {
      z.config.stringTraverseDirection = direction;
    }

    if (autoReString) {
      const affectedSystemIds = new Set<string>();
      if (targetZones.length > 0) {
        for (const z of targetZones) {
          if (z.systemId) affectedSystemIds.add(z.systemId);
        }
      } else if (this.selectedSystemId) {
        affectedSystemIds.add(this.selectedSystemId);
      }
      for (const sysId of affectedSystemIds) {
        this.autoStringSystem(sysId, undefined, direction);
      }
    }

    this.saveToLocalStorage();
    this.notify();
  }

  private listeners: Array<() => void> = [];
  private colorIndex = 0;

  constructor() {
    this.ensureDefaultModules();
    this.ensureDefaultSystem();
    this.loadFromLocalStorage();
  }

  private ensureDefaultModules(): void {
    if (this.modules.size === 0) {
      for (const m of DEFAULT_MODULE_MODELS) {
        this.modules.set(m.id, { ...m });
      }
    }
  }

  private ensureDefaultSystem(): void {
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

  private notify(): void {
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

  public selectSystem(systemId: string | null): void {
    this.selectedSystemId = systemId;
    if (systemId) {
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

  public removeSystem(systemId: string): void {
    if (this.systems.size <= 1) {
      return;
    }

    this.systems.delete(systemId);
    const fallbackSys = this.getSystems()[0];

    for (const zone of this.zones.values()) {
      if (zone.systemId === systemId) {
        this.linkZoneToSystem(zone.id, fallbackSys.id);
      }
    }

    if (this.selectedSystemId === systemId) {
      this.selectedSystemId = fallbackSys ? fallbackSys.id : null;
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

  public updateSystemHomerunVertices(systemId: string, path: LatLngPoint[]): void {
    const sys = this.systems.get(systemId);
    if (!sys || !sys.homerunRaceway) return;
    sys.homerunRaceway.path = path;
    this.notify();
  }

  public addSystemHomerunVertex(systemId: string, insertAfterIndex: number, point: LatLngPoint): void {
    const sys = this.systems.get(systemId);
    if (!sys || !sys.homerunRaceway) return;
    const newPath = [...sys.homerunRaceway.path];
    newPath.splice(insertAfterIndex + 1, 0, point);
    this.updateSystemHomerunVertices(systemId, newPath);
  }

  public deleteSystemHomerunVertex(systemId: string, vertexIndex: number): boolean {
    const sys = this.systems.get(systemId);
    if (!sys || !sys.homerunRaceway || sys.homerunRaceway.path.length <= 2) return false;
    const newPath = sys.homerunRaceway.path.filter((_, idx) => idx !== vertexIndex);
    this.updateSystemHomerunVertices(systemId, newPath);
    return true;
  }

  public setSystemHomerunElevation(systemId: string, elevationM: number): void {
    const sys = this.systems.get(systemId);
    if (!sys || !sys.homerunRaceway) return;
    sys.homerunRaceway.elevationChangeM = Number(elevationM) || 0;
    this.notify();
  }

  public clearSystemHomerun(systemId: string): void {
    const sys = this.systems.get(systemId);
    if (!sys) return;
    sys.homerunRaceway = null;
    this.notify();
  }

  public getSystemHomerun(systemId?: string): RacewayConfig | null {
    const targetSysId = systemId || this.selectedSystemId;
    if (targetSysId) {
      const sys = this.systems.get(targetSysId);
      return sys?.homerunRaceway || null;
    }
    return null;
  }

  public getHomerunForZone(zoneId: string): RacewayConfig | null {
    const zone = this.zones.get(zoneId);
    if (!zone) return null;
    if (zone.raceway && (!zone.raceway.systemId || zone.raceway.systemId === zone.systemId)) {
      return zone.raceway;
    }
    if (zone.systemId) {
      const sys = this.systems.get(zone.systemId);
      return sys?.homerunRaceway || null;
    }
    return null;
  }

  public getStringCables(systemId?: string): StringCableLength[] {
    const isAll = systemId === 'all';
    const targetSysId = isAll ? null : (systemId || this.selectedSystemId);
    const sys = targetSysId ? this.systems.get(targetSysId) : undefined;
    const invPoint = sys?.inverterLocation || null;

    const panels = targetSysId
      ? this.getPanelsForSystem(targetSysId)
      : this.getPanels();

    return calculateStringCableLengths(panels, this.zones, invPoint, {}, this.systems);
  }

  public getSystemCableSummary(systemId: string): SystemCableSummary {
    const sys = this.systems.get(systemId);
    const invPoint = sys?.inverterLocation || null;
    const invElev = sys?.inverterElevationM ?? 0;
    const stringCables = this.getStringCables(systemId);
    return summarizeSystemCabling(systemId, stringCables, invPoint, invElev);
  }

  public getAllCableSummaries(): SystemCableSummary[] {
    return this.getSystems().map(s => this.getSystemCableSummary(s.id));
  }

  // --- Grid Optimization & Auto-Stringing ---

  public optimizeZoneGridShift(
    zoneId: string,
    steps: number = 12,
    autoString: boolean = true,
    customModulesPerString?: number,
    direction?: StringTraverseDirection
  ): {
    optimalOffsetX: number;
    optimalOffsetY: number;
    maxPanelCount: number;
    previousPanelCount: number;
    totalStrings?: number;
    modulesPerString?: number;
    warnings?: string[];
  } {
    const zone = this.zones.get(zoneId);
    if (!zone) {
      return { optimalOffsetX: 0, optimalOffsetY: 0, maxPanelCount: 0, previousPanelCount: 0 };
    }

    const opt = optimizeGridShift(zone, steps);
    zone.config.alignmentOffsetX = opt.optimalOffsetX;
    zone.config.alignmentOffsetY = opt.optimalOffsetY;
    this.regenerateZonePanels(zoneId, false);

    let stringResult: ReturnType<ProjectStore['autoStringSystem']> | undefined;
    if (autoString && zone.systemId) {
      const effectiveDir = direction || zone.config.stringTraverseDirection || this.stringTraverseDirection || 'short_side';
      stringResult = this.autoStringSystem(zone.systemId, customModulesPerString, effectiveDir);
    } else {
      this.notify();
    }

    return {
      ...opt,
      totalStrings: stringResult?.totalStrings,
      modulesPerString: stringResult?.modulesPerString,
      warnings: stringResult?.warnings
    };
  }

  public autoStringSystem(
    systemId: string,
    customModulesPerString?: number,
    direction?: StringTraverseDirection
  ): {
    totalStrings: number;
    modulesPerString: number;
    inverterLoadRatio: number;
    warnings: string[];
    stringDirection?: StringTraverseDirection;
  } {
    const sys = this.systems.get(systemId);
    if (!sys) {
      return { totalStrings: 0, modulesPerString: 0, inverterLoadRatio: 0, warnings: ['System not found'] };
    }

    const inv = sys.inverter;

    // Strict array boundaries: Identify all zones explicitly linked to this system
    const zonesInSystem = Array.from(this.zones.values()).filter(z => z.systemId === systemId);
    const zoneIdsInSystem = new Set(zonesInSystem.map(z => z.id));
    const effectiveDir = direction || this.getStringTraverseDirection(zonesInSystem[0]?.id) || 'short_side';

    // Ensure all panels in this system's zones are properly linked to systemId
    // and clear their existing string assignments prior to auto-stringing
    for (const panel of this.panels.values()) {
      if (zoneIdsInSystem.has(panel.zoneId)) {
        panel.systemId = systemId;
        panel.stringId = null;
        panel.stringOrder = null;
        panel.mpptId = null;
        panel.inverterIndex = null;
      }
    }

    // Active panels strictly from zones assigned to this system (never mix panels from other systems)
    const activePanels = Array.from(this.panels.values()).filter(
      p => p.active && zoneIdsInSystem.has(p.zoneId)
    );

    if (activePanels.length === 0) {
      this.notify();
      return { totalStrings: 0, modulesPerString: 0, inverterLoadRatio: 0, warnings: ['No active panels in this system'] };
    }

    // Determine representative module
    const firstModuleId = activePanels[0].moduleId;
    const mod = this.getModule(firstModuleId) || ZNSHINE_600W_BIFACIAL;
    const limits = calculateStringLimits(mod, inv);

    // Clamped string size: target size cannot exceed limits.maxPanelsPerString or inverter Vmax
    const rawTarget = customModulesPerString || limits.optimalPanelsPerString;
    const stringSize = Math.min(limits.maxPanelsPerString, Math.max(limits.minPanelsPerString, rawTarget));
    const warnings: string[] = [];

    if (customModulesPerString && customModulesPerString > limits.maxPanelsPerString) {
      warnings.push(`Specified ${customModulesPerString} panels/string exceeds cold Voc max voltage limit (${limits.maxPanelsPerString} panels for ${inv.maxDcVoltage}V max DC). Clamped to ${limits.maxPanelsPerString}.`);
    } else if (customModulesPerString && customModulesPerString < limits.minPanelsPerString) {
      warnings.push(`Warning: ${customModulesPerString} panels/string is below min MPPT voltage limit (${limits.minPanelsPerString} panels).`);
    }

    // Form strings respecting array boundaries (strings never mix arrays across systems)
    const stringGroups: SolarPanelObject[][] = [];

    // Group 1: Roof mount zones in this system (form strings strictly within each array)
    const roofZones = zonesInSystem.filter(z => z.config.mountType === 'roof');
    for (const roofZone of roofZones) {
      const zonePanels = activePanels.filter(p => p.zoneId === roofZone.id);
      if (zonePanels.length === 0) continue;

      // Serpentine order along the short side of the array (default) or user preference
      const zoneDir = direction || roofZone.config.stringTraverseDirection || this.stringTraverseDirection || 'short_side';
      const sortedZonePanels = sortPanelsForStringing(zonePanels, roofZone.config.azimuthDeg, zoneDir);

      const N = sortedZonePanels.length;
      if (N <= limits.maxPanelsPerString) {
        // Forms a single dedicated string within this roof array
        stringGroups.push(chainAdjacentPanels(sortedZonePanels));
        if (N < limits.minPanelsPerString) {
          warnings.push(`Roof array "${roofZone.name}" has ${N} panels, which is below min MPPT voltage limit (${limits.minPanelsPerString} panels).`);
        }
      } else {
        // Divide into k balanced strings strictly within this roof array ensuring no chunk > maxPanelsPerString
        let k = Math.max(Math.ceil(N / limits.maxPanelsPerString), Math.round(N / stringSize));
        while (Math.ceil(N / k) > limits.maxPanelsPerString) {
          k++;
        }
        const baseSize = Math.floor(N / k);
        const remainder = N % k;
        let offset = 0;
        for (let i = 0; i < k; i++) {
          const count = baseSize + (i < remainder ? 1 : 0);
          const rawPanels = sortedZonePanels.slice(offset, offset + count);
          offset += count;
          stringGroups.push(chainAdjacentPanels(rawPanels));
          if (count < limits.minPanelsPerString) {
            warnings.push(`Roof array "${roofZone.name}" string #${i + 1} has ${count} panels, below min MPPT voltage (${limits.minPanelsPerString} panels).`);
          }
        }
      }
    }

    // Group 2: Ground mount zones in this system (strictly within this system's arrays)
    const groundZones = zonesInSystem.filter(z => z.config.mountType === 'ground');
    for (const gZone of groundZones) {
      const zonePanels = activePanels.filter(p => p.zoneId === gZone.id);
      if (zonePanels.length === 0) continue;

      const zoneDir = direction || gZone.config.stringTraverseDirection || this.stringTraverseDirection || 'short_side';
      const sortedZonePanels = sortPanelsForStringing(zonePanels, gZone.config.azimuthDeg, zoneDir);
      const N = sortedZonePanels.length;
      if (N <= limits.maxPanelsPerString) {
        stringGroups.push(chainAdjacentPanels(sortedZonePanels));
        if (N < limits.minPanelsPerString) {
          warnings.push(`Ground array "${gZone.name}" has ${N} panels, which is below min MPPT voltage limit (${limits.minPanelsPerString} panels).`);
        }
      } else {
        let k = Math.max(Math.ceil(N / limits.maxPanelsPerString), Math.round(N / stringSize));
        while (Math.ceil(N / k) > limits.maxPanelsPerString) {
          k++;
        }
        const baseSize = Math.floor(N / k);
        const remainder = N % k;
        let offset = 0;
        for (let i = 0; i < k; i++) {
          const count = baseSize + (i < remainder ? 1 : 0);
          const rawPanels = sortedZonePanels.slice(offset, offset + count);
          offset += count;
          stringGroups.push(chainAdjacentPanels(rawPanels));
          if (count < limits.minPanelsPerString) {
            warnings.push(`Ground array "${gZone.name}" string #${i + 1} has ${count} panels, below min MPPT voltage (${limits.minPanelsPerString} panels).`);
          }
        }
      }
    }

    const totalStrings = stringGroups.length;
    const maxAllowedStrings = inv.inverterCount * inv.mpptCountPerInverter * inv.maxStringsPerMppt;

    if (totalStrings > maxAllowedStrings) {
      warnings.push(
        `Total strings (${totalStrings}) exceeds inverter capacity (${maxAllowedStrings} strings across ${inv.inverterCount} inverters). Consider adding inverters.`
      );
    }

    // Determine system prefix for unique string IDs across multiple systems
    const sysList = Array.from(this.systems.values());
    const sysIndex = sysList.findIndex(s => s.id === systemId) + 1;
    const sysPrefix = sysList.length > 1 ? `S${sysIndex > 0 ? sysIndex : 1}-` : '';

    const effectiveInvCount = Math.max(1, inv.inverterCount);
    const mpptCount = Math.max(1, inv.mpptCountPerInverter);
    const totalSlots = effectiveInvCount * mpptCount;

    // Assign strings, MPPT channels, and inverters (guaranteeing unique stringId per string)
    stringGroups.forEach((strPanels, stringIndex) => {
      const invIdx = (stringIndex % effectiveInvCount) + 1;
      const mpptIdx = (Math.floor(stringIndex / effectiveInvCount) % mpptCount) + 1;
      const channelSlotIdx = Math.floor(stringIndex / totalSlots);
      const subStringLetter =
        String.fromCharCode(65 + (channelSlotIdx % 26)) +
        (channelSlotIdx >= 26 ? String(Math.floor(channelSlotIdx / 26) + 1) : '');

      const stringId = `${sysPrefix}INV${invIdx}-M${mpptIdx}-${subStringLetter}`;
      const mpptId = `${sysPrefix}INV${invIdx}-MPPT${mpptIdx}`;

      strPanels.forEach((panel, orderIdx) => {
        panel.stringId = stringId;
        panel.stringOrder = orderIdx + 1;
        panel.mpptId = mpptId;
        panel.inverterIndex = invIdx;
        panel.systemId = systemId;
      });
    });

    const totalDcKw = (activePanels.length * mod.nominalPowerW) / 1000.0;
    const totalAcKw = inv.inverterCount * inv.ratedAcPowerKw;
    const inverterLoadRatio = totalAcKw > 0 ? Number((totalDcKw / totalAcKw).toFixed(2)) : 0;

    if (inverterLoadRatio > inv.maxDcAcRatio) {
      warnings.push(
        `DC/AC loading ratio (${inverterLoadRatio}) exceeds inverter design limit (${inv.maxDcAcRatio}).`
      );
    }

    this.notify();

    return {
      totalStrings,
      modulesPerString: stringSize,
      inverterLoadRatio,
      warnings,
      stringDirection: effectiveDir
    };
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
    const sys = this.systems.get(systemId);
    if (!sys) return false;
    const invCount = targetInverterCount !== undefined ? targetInverterCount : sys.inverter.inverterCount;

    // Get all active panels for this system
    const systemPanels = this.getPanelsForSystem(systemId).filter(p => p.active);
    if (systemPanels.length === 0) return false;

    // Determine module & electrical limits for current inverter specification
    const firstModuleId = systemPanels[0].moduleId;
    const mod = this.getModule(firstModuleId) || ZNSHINE_600W_BIFACIAL;
    const limits = calculateStringLimits(mod, sys.inverter);

    // Group panels by existing stringId
    const stringMap = new Map<string, SolarPanelObject[]>();
    for (const p of systemPanels) {
      if (p.stringId) {
        if (!stringMap.has(p.stringId)) {
          stringMap.set(p.stringId, []);
        }
        stringMap.get(p.stringId)!.push(p);
      }
    }

    if (stringMap.size === 0) {
      this.autoStringSystem(systemId);
      return true;
    }

    // Check if any existing string violates max panels per string or cold Voc > maxDcVoltage
    let hasVoltageViolation = false;
    for (const panels of stringMap.values()) {
      const coldVoc = panels.length * limits.maxColdVoc;
      if (panels.length > limits.maxPanelsPerString || coldVoc > sys.inverter.maxDcVoltage) {
        hasVoltageViolation = true;
        break;
      }
    }

    // Check if strings are already distributed across multiple inverters and voltage compliant
    if (!force && !hasVoltageViolation) {
      if (invCount <= 1) return false;
      const distinctInverters = new Set<number>();
      for (const panels of stringMap.values()) {
        const inv = panels[0].inverterIndex || 1;
        distinctInverters.add(inv);
      }
      // If already distributed across more than 1 inverter and matches invCount, leave as is
      if (distinctInverters.size > 1 && distinctInverters.size === invCount) {
        return false;
      }
    }

    // Build compliant strings: split any oversized strings into balanced chunks <= limits.maxPanelsPerString
    const compliantStringsList: SolarPanelObject[][] = [];
    for (const panels of stringMap.values()) {
      if (panels.length <= limits.maxPanelsPerString) {
        compliantStringsList.push(panels);
      } else {
        // Sort to preserve panel order within the string
        panels.sort((a, b) => (a.stringOrder ?? 0) - (b.stringOrder ?? 0));
        const N = panels.length;
        let k = Math.ceil(N / limits.maxPanelsPerString);
        if (limits.optimalPanelsPerString > 0) {
          k = Math.max(k, Math.round(N / limits.optimalPanelsPerString));
        }
        while (Math.ceil(N / k) > limits.maxPanelsPerString) {
          k++;
        }
        const baseSize = Math.floor(N / k);
        const remainder = N % k;
        let offset = 0;
        for (let i = 0; i < k; i++) {
          const count = baseSize + (i < remainder ? 1 : 0);
          const subPanels = panels.slice(offset, offset + count);
          offset += count;
          compliantStringsList.push(subPanels);
        }
      }
    }

    const mpptCount = Math.max(1, sys.inverter.mpptCountPerInverter || 5);
    const sysList = Array.from(this.systems.values());
    const sysIndex = sysList.findIndex(s => s.id === systemId) + 1;
    const sysPrefix = sysList.length > 1 ? `S${sysIndex > 0 ? sysIndex : 1}-` : '';

    const effectiveInvCount = Math.max(1, invCount);
    const totalSlots = effectiveInvCount * mpptCount;

    // Distribute compliant strings evenly across inverters and MPPT channels (guaranteeing unique stringId)
    compliantStringsList.forEach((panels, i) => {
      const invIdx = (i % effectiveInvCount) + 1;
      const mpptIdx = (Math.floor(i / effectiveInvCount) % mpptCount) + 1;
      const channelSlotIdx = Math.floor(i / totalSlots);
      const letter =
        String.fromCharCode(65 + (channelSlotIdx % 26)) +
        (channelSlotIdx >= 26 ? String(Math.floor(channelSlotIdx / 26) + 1) : '');

      const newStringId = `${sysPrefix}INV${invIdx}-M${mpptIdx}-${letter}`;
      const newMpptId = `${sysPrefix}INV${invIdx}-MPPT${mpptIdx}`;

      panels.forEach((p, orderIdx) => {
        p.inverterIndex = invIdx;
        p.stringId = newStringId;
        p.mpptId = newMpptId;
        p.stringOrder = orderIdx + 1;
        p.systemId = systemId;
      });
    });

    this.notify();
    return true;
  }

  // --- View Filter Management ---

  public setViewFilter(partial: Partial<ViewFilterState>): void {
    this.viewFilter = { ...this.viewFilter, ...partial };
    this.notify();
  }

  public applyViewPreset(preset: ViewPresetKey): void {
    switch (preset) {
      case 'all':
        this.viewFilter = {
          ...this.viewFilter,
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
          xRayMode: false
        };
        break;
      case 'panels':
        this.viewFilter = {
          ...this.viewFilter,
          panelVisibility: 'full',
          showArrayFill: true,
          showKeepOuts: true,
          showLabels: true,
          showStringLines: false,
          showHomerunLines: false,
          showRaceways: false,
          showTiltArrows: false,
          showVertices: false,
          showMountTables: true,
          showRoofRails: true,
          showInverters: false,
          xRayMode: false
        };
        break;
      case 'wires':
        this.viewFilter = {
          ...this.viewFilter,
          panelVisibility: 'dimmed',
          showArrayFill: false,
          showKeepOuts: false,
          showLabels: false,
          showStringLines: true,
          showHomerunLines: true,
          showRaceways: true,
          showTiltArrows: false,
          showVertices: false,
          showMountTables: false,
          showRoofRails: false,
          showInverters: true,
          xRayMode: false
        };
        break;
      case 'presentation':
        this.viewFilter = {
          ...this.viewFilter,
          panelVisibility: 'full',
          showArrayFill: true,
          showKeepOuts: true,
          showLabels: true,
          showStringLines: false,
          showHomerunLines: false,
          showRaceways: true,
          showTiltArrows: false,
          showVertices: false,
          showMountTables: true,
          showRoofRails: true,
          showInverters: true,
          xRayMode: false
        };
        break;
      case 'civil':
        this.viewFilter = {
          ...this.viewFilter,
          panelVisibility: 'dimmed',
          showArrayFill: true,
          showKeepOuts: true,
          showLabels: true,
          showStringLines: false,
          showHomerunLines: false,
          showRaceways: true,
          showTiltArrows: true,
          showVertices: true,
          showMountTables: true,
          showRoofRails: true,
          showInverters: true,
          xRayMode: false
        };
        break;
      case 'tracing':
        this.viewFilter = {
          ...this.viewFilter,
          panelVisibility: 'hidden',
          showArrayFill: false,
          showKeepOuts: true,
          showLabels: true,
          showStringLines: false,
          showHomerunLines: false,
          showRaceways: false,
          showTiltArrows: false,
          showVertices: true,
          showMountTables: false,
          showRoofRails: false,
          showInverters: false,
          xRayMode: true
        };
        break;
      case 'vicinity':
        this.viewFilter = {
          ...this.viewFilter,
          basemap: 'carto-light',
          panelVisibility: 'dimmed',
          showArrayFill: true,
          showKeepOuts: true,
          showLabels: true,
          showStringLines: false,
          showHomerunLines: false,
          showRaceways: true,
          showTiltArrows: false,
          showVertices: false,
          showMountTables: true,
          showRoofRails: true,
          showInverters: true,
          xRayMode: false
        };
        break;
    }
    this.notify();
  }

  public getActiveViewPreset(): ViewPresetKey | 'custom' {
    const vf = this.viewFilter;
    if (
      vf.panelVisibility === 'full' &&
      vf.showArrayFill &&
      vf.showKeepOuts &&
      vf.showStringLines &&
      vf.showHomerunLines !== false &&
      vf.showRaceways !== false &&
      vf.showTiltArrows !== false &&
      vf.showVertices !== false &&
      vf.showMountTables !== false &&
      vf.showRoofRails !== false &&
      vf.showInverters !== false &&
      !vf.xRayMode
    ) {
      return 'all';
    }
    if (
      vf.panelVisibility === 'full' &&
      vf.showArrayFill &&
      vf.showKeepOuts &&
      !vf.showStringLines &&
      !vf.showHomerunLines &&
      !vf.showRaceways &&
      !vf.showTiltArrows &&
      !vf.showVertices &&
      vf.showMountTables !== false &&
      vf.showRoofRails !== false &&
      !vf.showInverters &&
      !vf.xRayMode
    ) {
      return 'panels';
    }
    if (
      vf.panelVisibility === 'dimmed' &&
      !vf.showArrayFill &&
      !vf.showKeepOuts &&
      vf.showStringLines &&
      vf.showHomerunLines !== false &&
      vf.showRaceways !== false &&
      !vf.showTiltArrows &&
      !vf.showVertices &&
      !vf.showMountTables &&
      !vf.showRoofRails &&
      vf.showInverters !== false &&
      !vf.xRayMode
    ) {
      return 'wires';
    }
    if (
      vf.panelVisibility === 'full' &&
      vf.showArrayFill &&
      vf.showKeepOuts &&
      !vf.showStringLines &&
      !vf.showHomerunLines &&
      vf.showRaceways !== false &&
      !vf.showTiltArrows &&
      !vf.showVertices &&
      vf.showMountTables !== false &&
      vf.showRoofRails !== false &&
      vf.showInverters !== false &&
      !vf.xRayMode
    ) {
      return 'presentation';
    }
    if (
      vf.panelVisibility === 'dimmed' &&
      vf.showArrayFill &&
      vf.showKeepOuts &&
      !vf.showStringLines &&
      !vf.showHomerunLines &&
      vf.showRaceways !== false &&
      vf.showTiltArrows !== false &&
      vf.showVertices !== false &&
      vf.showMountTables !== false &&
      vf.showRoofRails !== false &&
      vf.showInverters !== false &&
      !vf.xRayMode
    ) {
      return 'civil';
    }
    if (
      vf.panelVisibility === 'hidden' &&
      !vf.showArrayFill &&
      vf.showKeepOuts &&
      !vf.showStringLines &&
      !vf.showHomerunLines &&
      !vf.showRaceways &&
      !vf.showTiltArrows &&
      vf.showVertices !== false &&
      !vf.showMountTables &&
      !vf.showRoofRails &&
      !vf.showInverters &&
      vf.xRayMode
    ) {
      return 'tracing';
    }
    if (
      vf.panelVisibility === 'dimmed' &&
      vf.showArrayFill &&
      vf.showKeepOuts &&
      !vf.showStringLines &&
      !vf.showHomerunLines &&
      vf.showRaceways !== false &&
      !vf.showTiltArrows &&
      !vf.showVertices &&
      vf.showMountTables !== false &&
      vf.showRoofRails !== false &&
      vf.showInverters !== false &&
      vf.basemap === 'carto-light' &&
      !vf.xRayMode
    ) {
      return 'vicinity';
    }
    return 'custom';
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
    return this.selectedZoneId ? this.zones.get(this.selectedZoneId) : undefined;
  }

  public getSelectedZones(): ArrayZone[] {
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
    if (this.selectedZoneIds.size > 0) {
      return Array.from(this.selectedZoneIds);
    }
    return this.selectedZoneId ? [this.selectedZoneId] : [];
  }

  public isZoneSelected(zoneId: string): boolean {
    return this.selectedZoneIds.has(zoneId) || this.selectedZoneId === zoneId;
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
        this.selectedZoneId = p.zoneId;
        this.selectedSystemId = p.systemId;
      }
    }
    this.notify();
  }

  public addZone(
    vertices: LatLngPoint[],
    mountType: MountType = 'roof',
    customName?: string,
    targetSystemId?: string,
    targetModuleId?: string
  ): ArrayZone {
    this.ensureDefaultModules();
    this.ensureDefaultSystem();

    let systemId = targetSystemId || this.selectedSystemId;
    if (!systemId || !this.systems.has(systemId)) {
      systemId = this.systems.keys().next().value!;
    }

    const moduleId = targetModuleId || ZNSHINE_600W_BIFACIAL.id;
    const mod = this.getModule(moduleId) || ZNSHINE_600W_BIFACIAL;

    const id = `zone_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const color = ZONE_COLORS[this.colorIndex % ZONE_COLORS.length];
    this.colorIndex++;

    const baseConfig = mountType === 'roof' ? DEFAULT_ROOF_CONFIG : DEFAULT_GROUND_CONFIG;
    const config: LayoutConfig = {
      ...baseConfig,
      panelWidthMm: mod.widthMm,
      panelLengthMm: mod.lengthMm,
      electrical: {
        modelName: mod.name,
        nominalPowerW: mod.nominalPowerW,
        voc: mod.voc,
        vmp: mod.vmp,
        isc: mod.isc,
        imp: mod.imp
      }
    };

    const areaSqM = computePolygonAreaSqM(vertices);
    const zoneNumber = this.zones.size + 1;
    const name = customName || `${mountType === 'roof' ? 'Roof' : 'Ground'} Array ${zoneNumber}`;

    const newZone: ArrayZone = {
      id,
      systemId,
      moduleId,
      name,
      color,
      vertices,
      keepOuts: [],
      config,
      areaSqM,
      usableAreaSqM: 0,
      panelCount: 0,
      activePanelCount: 0,
      totalKwp: 0,
      tableCount: 0,
      tables: [],
      elevationDeltaM: 0
    };

    this.zones.set(id, newZone);

    const sys = this.systems.get(systemId);
    if (sys && !sys.zoneIds.includes(id)) {
      sys.zoneIds.push(id);
    }

    this.selectedZoneId = id;
    this.selectedPanelId = null;

    this.regenerateZonePanels(id, false);
    this.notify();
    return newZone;
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
    if (this.selectedZoneIds.size > 1 && this.selectedZoneIds.has(zoneId)) {
      this.updateSelectedZonesConfig(partialConfig, optimize, steps);
      return;
    }

    const zone = this.zones.get(zoneId);
    if (!zone) return;

    const hasAzimuthChange =
      partialConfig.azimuthDeg !== undefined && partialConfig.azimuthDeg !== zone.config.azimuthDeg;

    zone.config = {
      ...zone.config,
      ...partialConfig,
      electrical: {
        ...zone.config.electrical,
        ...(partialConfig.electrical || {})
      }
    };

    if (optimize || hasAzimuthChange) {
      this.optimizeZoneGridShift(zoneId, steps);
    } else {
      this.regenerateZonePanels(zoneId, false);
      this.notify();
    }
  }

  public updateSelectedZonesConfig(
    partialConfig: Partial<LayoutConfig>,
    optimize: boolean = false,
    steps: number = 12
  ): void {
    const targetIds = this.getSelectedZoneIds();
    if (targetIds.length === 0) return;

    const affectedSystemIds = new Set<string>();

    for (const id of targetIds) {
      const zone = this.zones.get(id);
      if (!zone) continue;

      if (zone.systemId) {
        affectedSystemIds.add(zone.systemId);
      }

      const hasAzimuthChange =
        partialConfig.azimuthDeg !== undefined && partialConfig.azimuthDeg !== zone.config.azimuthDeg;

      zone.config = {
        ...zone.config,
        ...partialConfig,
        electrical: {
          ...zone.config.electrical,
          ...(partialConfig.electrical || {})
        }
      };

      if (optimize || hasAzimuthChange) {
        this.optimizeZoneGridShift(id, steps, false);
      } else {
        this.regenerateZonePanels(id, false);
      }
    }

    if (optimize) {
      for (const sysId of affectedSystemIds) {
        this.autoStringSystem(sysId);
      }
    }

    this.notify();
  }

  public optimizeSelectedZonesGridShift(
    steps: number = 12,
    autoString: boolean = true,
    customModulesPerString?: number,
    direction?: StringTraverseDirection | 'auto'
  ): {
    totalMaxPanels: number;
    totalPreviousPanels: number;
    optimizedCount: number;
    totalStrings?: number;
    warnings?: string[];
  } {
    const targetIds = this.getSelectedZoneIds();
    let totalMaxPanels = 0;
    let totalPreviousPanels = 0;
    const affectedSystemIds = new Set<string>();

    for (const id of targetIds) {
      const zone = this.zones.get(id);
      if (zone?.systemId) {
        affectedSystemIds.add(zone.systemId);
      }
      const opt = this.optimizeZoneGridShift(id, steps, false);
      totalMaxPanels += opt.maxPanelCount;
      totalPreviousPanels += opt.previousPanelCount;
    }

    let totalStrings = 0;
    const allWarnings: string[] = [];

    if (autoString) {
      const targetDir = direction === 'auto' ? undefined : direction;
      for (const sysId of affectedSystemIds) {
        const res = this.autoStringSystem(sysId, customModulesPerString, targetDir);
        totalStrings += res.totalStrings;
        if (res.warnings && res.warnings.length > 0) {
          allWarnings.push(...res.warnings);
        }
      }
    }

    this.notify();
    return {
      totalMaxPanels,
      totalPreviousPanels,
      optimizedCount: targetIds.length,
      totalStrings: autoString ? totalStrings : undefined,
      warnings: autoString && allWarnings.length > 0 ? allWarnings : undefined
    };
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
    zone.color = color;
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
    const zone = this.zones.get(zoneId);
    if (!zone) return;

    const existingMap = new Map<string, SolarPanelObject>();
    for (const [id, panel] of this.panels.entries()) {
      if (panel.zoneId === zoneId) {
        existingMap.set(id, panel);
        this.panels.delete(id);
      }
    }

    const { panels, usableAreaSqM, tables, rails } = generatePanelsForZone(zone, existingMap);

    zone.usableAreaSqM = usableAreaSqM;
    zone.panelCount = panels.length;
    zone.tableCount = tables?.length ?? 0;
    zone.tables = tables || [];
    zone.railCount = rails?.length ?? 0;
    zone.rails = rails || [];
    let activeCount = 0;
    let totalWp = 0;

    for (const panel of panels) {
      panel.systemId = zone.systemId;
      panel.moduleId = zone.moduleId;
      this.panels.set(panel.id, panel);
      if (panel.active) {
        activeCount++;
        totalWp += panel.electrical.nominalPowerW;
      }
    }

    zone.activePanelCount = activeCount;
    zone.totalKwp = Number((totalWp / 1000).toFixed(2));

    if (shouldNotify) {
      this.notify();
    }
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
    panel.stringId = stringId;
    panel.stringOrder = stringOrder;
    if (mpptId !== undefined) panel.mpptId = mpptId;
    if (inverterIndex !== undefined) panel.inverterIndex = inverterIndex;
    this.notify();
  }

  public renameString(oldStringId: string, newStringId: string): void {
    const trimmed = newStringId.trim();
    if (!trimmed || trimmed === oldStringId) return;
    for (const panel of this.panels.values()) {
      if (panel.stringId === oldStringId) {
        panel.stringId = trimmed;
      }
    }
    this.notify();
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

  public exportProjectJson(): string {
    const data: ProjectData = {
      version: '1.2.0',
      projectName: this.projectName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      center: this.center,
      zoom: this.zoom,
      modules: this.getModules(),
      systems: this.getSystems(),
      zones: this.getZones(),
      panels: this.getPanels(),
      selectedSystemId: this.selectedSystemId || undefined,
      selectedZoneId: this.selectedZoneId !== undefined ? this.selectedZoneId : undefined,
      stringTraverseDirection: this.stringTraverseDirection
    };
    return JSON.stringify(data, null, 2);
  }

  public exportProjectGeoJson(): string {
    const features: any[] = [];

    for (const zone of this.getZones()) {
      const sys = this.systems.get(zone.systemId);
      const mod = this.getModule(zone.moduleId);
      features.push({
        type: 'Feature',
        properties: {
          type: 'ArrayZone',
          id: zone.id,
          systemId: zone.systemId,
          systemName: sys?.name || 'Default System',
          moduleId: zone.moduleId,
          moduleName: mod?.name || 'Standard PV Module',
          name: zone.name,
          mountType: zone.config.mountType,
          panelCount: zone.panelCount,
          activePanelCount: zone.activePanelCount,
          totalKwp: zone.totalKwp,
          azimuthDeg: zone.config.azimuthDeg,
          tiltDeg: zone.config.tiltDeg
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              ...zone.vertices.map(v => [v.lng, v.lat]),
              [zone.vertices[0].lng, zone.vertices[0].lat]
            ]
          ]
        }
      });

      for (const ko of zone.keepOuts) {
        features.push({
          type: 'Feature',
          properties: {
            type: 'KeepOut',
            id: ko.id,
            name: ko.name,
            zoneId: zone.id,
            systemId: zone.systemId
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                ...ko.vertices.map(v => [v.lng, v.lat]),
                [ko.vertices[0].lng, ko.vertices[0].lat]
              ]
            ]
          }
        });
      }

      if (zone.raceway && zone.raceway.path && zone.raceway.path.length >= 2) {
        features.push({
          type: 'Feature',
          properties: {
            type: 'Raceway',
            id: zone.raceway.id,
            name: zone.raceway.name,
            zoneId: zone.id,
            systemId: zone.systemId,
            elevationChangeM: zone.raceway.elevationChangeM
          },
          geometry: {
            type: 'LineString',
            coordinates: zone.raceway.path.map(p => [p.lng, p.lat])
          }
        });
      }
    }

    for (const panel of this.getPanels()) {
      const sys = this.systems.get(panel.systemId);
      const mod = this.getModule(panel.moduleId);
      features.push({
        type: 'Feature',
        properties: {
          type: 'SolarPanel',
          id: panel.id,
          systemId: panel.systemId,
          systemName: sys?.name || 'Default System',
          zoneId: panel.zoneId,
          moduleId: panel.moduleId,
          moduleName: mod?.name || 'Standard PV Module',
          rowIndex: panel.rowIndex,
          colIndex: panel.colIndex,
          active: panel.active,
          azimuthDeg: panel.azimuthDeg,
          tiltDeg: panel.tiltDeg,
          nominalPowerW: panel.electrical.nominalPowerW,
          voc: panel.electrical.voc,
          vmp: panel.electrical.vmp,
          stringId: panel.stringId,
          stringOrder: panel.stringOrder,
          mpptId: panel.mpptId,
          inverterIndex: panel.inverterIndex,
          neighbors: panel.neighbors
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              ...panel.corners.map(c => [c.lng, c.lat]),
              [panel.corners[0].lng, panel.corners[0].lat]
            ]
          ]
        }
      });
    }

    for (const sys of this.getSystems()) {
      if (sys.homerunRaceway && sys.homerunRaceway.path && sys.homerunRaceway.path.length >= 2) {
        features.push({
          type: 'Feature',
          properties: {
            type: 'SharedHomerunTrunk',
            id: sys.homerunRaceway.id,
            name: sys.homerunRaceway.name || `Homerun Trunk (${sys.name})`,
            systemId: sys.id,
            systemName: sys.name,
            elevationChangeM: sys.homerunRaceway.elevationChangeM
          },
          geometry: {
            type: 'LineString',
            coordinates: sys.homerunRaceway.path.map(p => [p.lng, p.lat])
          }
        });
      }

      if (sys.inverterLocation) {
        features.push({
          type: 'Feature',
          properties: {
            type: 'InverterPowerHouse',
            id: `inv_station_${sys.id}`,
            systemId: sys.id,
            systemName: sys.name,
            inverterModel: sys.inverter.modelName,
            inverterCount: sys.inverter.inverterCount,
            ratedAcPowerKw: sys.inverter.ratedAcPowerKw,
            elevationM: sys.inverterElevationM ?? 0
          },
          geometry: {
            type: 'Point',
            coordinates: [sys.inverterLocation.lng, sys.inverterLocation.lat]
          }
        });
      }
    }

    return JSON.stringify(
      {
        type: 'FeatureCollection',
        name: this.projectName,
        features
      },
      null,
      2
    );
  }

  public importProjectJson(jsonStr: string): boolean {
    try {
      const data: ProjectData = JSON.parse(jsonStr);
      if (!data.zones || !Array.isArray(data.zones)) return false;

      this.modules.clear();
      this.systems.clear();
      this.zones.clear();
      this.panels.clear();

      this.projectName = data.projectName || 'Imported Solar Project';
      if (data.center) this.center = data.center;
      if (data.zoom) this.zoom = data.zoom;
      if (data.stringTraverseDirection) {
        this.stringTraverseDirection = data.stringTraverseDirection;
      } else {
        this.stringTraverseDirection = 'short_side';
      }

      // Modules import
      if (data.modules && Array.isArray(data.modules) && data.modules.length > 0) {
        for (const m of data.modules) {
          this.modules.set(m.id, m);
        }
      } else {
        this.ensureDefaultModules();
      }

      // Systems import
      if (data.systems && Array.isArray(data.systems) && data.systems.length > 0) {
        for (const sys of data.systems) {
          if (!sys.inverter) {
            sys.inverter = { ...GENERIC_INVERTER_PRESETS[0] };
          }
          this.systems.set(sys.id, sys);
        }
      } else {
        this.ensureDefaultSystem();
      }

      const defaultSysId = this.systems.keys().next().value!;
      const defaultModId = this.modules.keys().next().value!;

      for (const zone of data.zones) {
        if (!zone.systemId || !this.systems.has(zone.systemId)) {
          zone.systemId = defaultSysId;
        }
        if (!zone.moduleId || !this.modules.has(zone.moduleId)) {
          zone.moduleId = defaultModId;
        }
        if (!zone.tables) {
          zone.tables = [];
        }

        const sys = this.systems.get(zone.systemId);
        if (sys && !sys.zoneIds.includes(zone.id)) {
          sys.zoneIds.push(zone.id);
        }
        this.zones.set(zone.id, zone);
      }

      if (data.panels && Array.isArray(data.panels)) {
        for (const panel of data.panels) {
          const z = this.zones.get(panel.zoneId);
          if (z) {
            panel.systemId = z.systemId;
            if (!panel.moduleId) {
              panel.moduleId = z.moduleId || defaultModId;
            }
          } else {
            if (!panel.systemId) panel.systemId = defaultSysId;
            if (!panel.moduleId) panel.moduleId = defaultModId;
          }
          this.panels.set(panel.id, panel);
        }
      } else {
        for (const zone of this.zones.values()) {
          this.regenerateZonePanels(zone.id, false);
        }
      }

      // Ensure any ground mount zones have their tables initialized and populated
      for (const zone of this.zones.values()) {
        if (zone.config.mountType === 'ground' && (!zone.tables || zone.tables.length === 0)) {
          this.regenerateZonePanels(zone.id, false);
        }
      }

      if (data.selectedSystemId && this.systems.has(data.selectedSystemId)) {
        this.selectedSystemId = data.selectedSystemId;
      } else {
        this.selectedSystemId = defaultSysId;
      }

      if (data.selectedZoneId !== undefined) {
        this.selectedZoneId = (data.selectedZoneId && this.zones.has(data.selectedZoneId)) ? data.selectedZoneId : null;
      } else {
        this.selectedZoneId = this.zones.size > 0 ? this.zones.keys().next().value ?? null : null;
      }
      this.selectedZoneIds.clear();
      if (this.selectedZoneId) {
        this.selectedZoneIds.add(this.selectedZoneId);
      }
      this.selectedPanelId = null;
      this.sanitizeStringIntegrity();
      this.notify();
      return true;
    } catch (e) {
      console.error('Failed to import project JSON:', e);
      return false;
    }
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
    this.drawingMode = 'none';
    this.stringTraverseDirection = 'short_side';
    this.notify();
  }

  public sanitizeStringIntegrity(): void {
    for (const sys of this.systems.values()) {
      const sysPanels = this.getPanelsForSystem(sys.id).filter(p => p.active && p.stringId);
      if (sysPanels.length === 0) continue;

      const strMap = new Map<string, SolarPanelObject[]>();
      for (const p of sysPanels) {
        if (!strMap.has(p.stringId!)) strMap.set(p.stringId!, []);
        strMap.get(p.stringId!)!.push(p);
      }

      let needsReString = false;
      for (const [, pList] of strMap.entries()) {
        const orderSet = new Set<number>();
        for (const p of pList) {
          if (p.stringOrder === null || p.stringOrder === undefined || orderSet.has(p.stringOrder)) {
            needsReString = true;
            break;
          }
          orderSet.add(p.stringOrder);
        }
        if (needsReString) break;
      }

      if (needsReString) {
        this.autoStringSystem(sys.id);
      }
    }
  }

  private saveTimeout: any = null;

  private saveToLocalStorage(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      try {
        const json = this.exportProjectJson();
        localStorage.setItem('solar_geo_planner_project', json);
      } catch (e) {
        // LocalStorage could fail in test environment or private mode
      }
    }, 200);
  }

  private loadFromLocalStorage(): void {
    try {
      const saved = localStorage.getItem('solar_geo_planner_project');
      if (saved) {
        this.importProjectJson(saved);
      }
    } catch (e) {
      // LocalStorage not available
    }
  }
}
