import {
  AcFeederSummary,
  ArrayZone,
  DEFAULT_MODULE_MODELS,
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
import { SolarYieldResult } from '../geo/solarYield';
import { scaleAnnualLoad } from '../geo/loadProfile';
import { SimulationResult, SimulationOptions } from '../geo/energySimulation';
import { computePolygonAreaSqM } from '../geo/projection';
import { sanitizeColor } from '../utils/sanitizeProjectData';
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
import { getSystemHomeruns as getSystemHomerunsImpl } from '../geo/stringCabling';
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
import { ensureDefaultSystem as ensureDefaultSystemImpl, updateModule as updateModuleImpl, setArrayModule as setArrayModuleImpl, selectSystem as selectSystemImpl, addSystem as addSystemImpl, updateSystemInverter as updateSystemInverterImpl, setSystemInverterPreset as setSystemInverterPresetImpl, setSystemInverterCapacity as setSystemInverterCapacityImpl, removeSystem as removeSystemImpl, linkZoneToSystem as linkZoneToSystemImpl, setSystemInverterLocation as setSystemInverterLocationImpl, setSystemAcInterconnectionLocation as setSystemAcInterconnectionLocationImpl, setSystemAcInterconnectionElevation as setSystemAcInterconnectionElevationImpl } from './systemActions';
import { setZoneElevationDelta as setZoneElevationDeltaImpl, setZoneRaceway as setZoneRacewayImpl, updateRacewayVertices as updateRacewayVerticesImpl, addRacewayVertex as addRacewayVertexImpl, deleteRacewayVertex as deleteRacewayVertexImpl, setRacewayElevationChange as setRacewayElevationChangeImpl, clearZoneRaceway as clearZoneRacewayImpl, setSystemHomerun as setSystemHomerunImpl, findHomerun as findHomerunImpl, addSystemHomerun as addSystemHomerunImpl, updateSystemHomerunVertices as updateSystemHomerunVerticesImpl, addSystemHomerunVertex as addSystemHomerunVertexImpl, deleteSystemHomerunVertex as deleteSystemHomerunVertexImpl, setSystemHomerunElevation as setSystemHomerunElevationImpl, clearSystemHomerun as clearSystemHomerunImpl, getSystemHomerun as getSystemHomerunImpl, getHomerunForZone as getHomerunForZoneImpl, setSystemAcRaceway as setSystemAcRacewayImpl, updateSystemAcRacewayVertices as updateSystemAcRacewayVerticesImpl, addSystemAcRacewayVertex as addSystemAcRacewayVertexImpl, deleteSystemAcRacewayVertex as deleteSystemAcRacewayVertexImpl, setSystemAcRacewayElevation as setSystemAcRacewayElevationImpl, clearSystemAcRaceway as clearSystemAcRacewayImpl, getSystemAcRaceway as getSystemAcRacewayImpl } from './racewayActions';
import { setMatchPropsMode as setMatchPropsModeImpl, toggleXRayMode as toggleXRayModeImpl, selectKeepOut as selectKeepOutImpl, getSelectedZones as getSelectedZonesImpl, getSelectedZoneIds as getSelectedZoneIdsImpl, selectZone as selectZoneImpl, selectAllZones as selectAllZonesImpl, clearZoneSelection as clearZoneSelectionImpl, selectPanel as selectPanelImpl, deleteSelected as deleteSelectedImpl } from './selectionActions';
import { updateKeepOutVertices as updateKeepOutVerticesImpl, addKeepOutVertex as addKeepOutVertexImpl, deleteKeepOutVertex as deleteKeepOutVertexImpl, addKeepOut as addKeepOutImpl, removeKeepOut as removeKeepOutImpl, deleteKeepOut as deleteKeepOutImpl, reassignKeepOutZone as reassignKeepOutZoneImpl, updateKeepOutName as updateKeepOutNameImpl, getAllKeepOuts as getAllKeepOutsImpl } from './keepOutActions';
import { getPanelsForSystem as getPanelsForSystemImpl, togglePanelActive as togglePanelActiveImpl, removePanel as removePanelImpl, updatePanelString as updatePanelStringImpl, updateStringAssignment as updateStringAssignmentImpl } from './panelActions';
import { getSystemSummary as getSystemSummaryImpl, getSolarYieldEstimate as getSolarYieldEstimateImpl, setCustomSolarResource as setCustomSolarResourceImpl, getLoadProfile as getLoadProfileImpl, ensureLoadProfile as ensureLoadProfileImpl, applyLoadArchetype as applyLoadArchetypeImpl, updateMonthlyLoad as updateMonthlyLoadImpl, getSimulationResult as getSimulationResultImpl } from './energyActions';
import { getBoqState as getBoqStateImpl, syncBoqFromCad as syncBoqFromCadImpl, updateBoqMarkups as updateBoqMarkupsImpl, updateDupaWorkItem as updateDupaWorkItemImpl, toggleLightningProtection as toggleLightningProtectionImpl } from './boqActions';

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

export const DEFAULT_MATCH_PROPS_OPTIONS: Readonly<MatchPropertiesOptions> = {
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

export const SYSTEM_COLORS = [
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
  public matchPropsOptions: MatchPropertiesOptions = { ...DEFAULT_MATCH_PROPS_OPTIONS };

  public setMatchPropsMode(enabled: boolean, sourceZoneId?: string | null) : void {
    return setMatchPropsModeImpl.call(this, enabled, sourceZoneId);
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

  ensureDefaultSystem() : void {
    return ensureDefaultSystemImpl.call(this);
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

  public updateModule(moduleId: string, partial: Partial<ModuleModel>) : void {
    return updateModuleImpl.call(this, moduleId, partial);
  }

  public setArrayModule(zoneId: string, moduleId: string) : void {
    return setArrayModuleImpl.call(this, zoneId, moduleId);
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

  public selectSystem(systemId: string | null, selectDefaultZone: boolean = true) : void {
    return selectSystemImpl.call(this, systemId, selectDefaultZone);
  }

  public addSystem(name?: string, color?: string, inverter?: InverterConfig) : SolarSystem {
    return addSystemImpl.call(this, name, color, inverter);
  }

  public updateSystem(systemId: string, partial: Partial<SolarSystem>): void {
    const sys = this.systems.get(systemId);
    if (!sys) return;
    Object.assign(sys, partial);
    this.notify();
  }

  public updateSystemInverter(systemId: string, partial: Partial<InverterConfig>) : void {
    return updateSystemInverterImpl.call(this, systemId, partial);
  }

  public setSystemInverterPreset(systemId: string, presetId: string) : void {
    return setSystemInverterPresetImpl.call(this, systemId, presetId);
  }

  public setSystemInverterCapacity(systemId: string, ratedAcKw: number) : void {
    return setSystemInverterCapacityImpl.call(this, systemId, ratedAcKw);
  }

  public removeSystem(systemId: string, deleteContents: boolean = true) : void {
    return removeSystemImpl.call(this, systemId, deleteContents);
  }

  public linkZoneToSystem(zoneId: string, targetSystemId: string) : void {
    return linkZoneToSystemImpl.call(this, zoneId, targetSystemId);
  }

  // --- Inverter Power House Geolocation & Array Elevation ---

  public clearSystemInverterLocation(systemId: string): void {
    this.setSystemInverterLocation(systemId, null);
  }

  public setSystemInverterLocation( systemId: string, location: LatLngPoint | null, elevationM?: number ) : void {
    return setSystemInverterLocationImpl.call(this, systemId, location, elevationM);
  }

  // --- AC Interconnection (PCC / Point of Common Coupling) ---

  public clearSystemAcInterconnectionLocation(systemId: string): void {
    this.setSystemAcInterconnectionLocation(systemId, null);
  }

  public setSystemAcInterconnectionLocation( systemId: string, location: LatLngPoint | null, elevationM?: number ) : void {
    return setSystemAcInterconnectionLocationImpl.call(this, systemId, location, elevationM);
  }

  public setSystemAcInterconnectionElevation(systemId: string, elevationM: number) : void {
    return setSystemAcInterconnectionElevationImpl.call(this, systemId, elevationM);
  }

  public setZoneElevationDelta(zoneId: string, elevationDeltaM: number) : void {
    return setZoneElevationDeltaImpl.call(this, zoneId, elevationDeltaM);
  }

  // --- Raceway Cable Path Management ---

  public setZoneRaceway( zoneId: string, path: LatLngPoint[], elevationChangeM: number = 0, name?: string ) : void {
    return setZoneRacewayImpl.call(this, zoneId, path, elevationChangeM, name);
  }

  public updateRacewayVertices(zoneId: string, path: LatLngPoint[]) : void {
    return updateRacewayVerticesImpl.call(this, zoneId, path);
  }

  public addRacewayVertex(zoneId: string, insertAfterIndex: number, point: LatLngPoint) : void {
    return addRacewayVertexImpl.call(this, zoneId, insertAfterIndex, point);
  }

  public deleteRacewayVertex(zoneId: string, vertexIndex: number) : boolean {
    return deleteRacewayVertexImpl.call(this, zoneId, vertexIndex);
  }

  public setRacewayElevationChange(zoneId: string, elevationM: number) : void {
    return setRacewayElevationChangeImpl.call(this, zoneId, elevationM);
  }

  public clearZoneRaceway(zoneId: string) : void {
    return clearZoneRacewayImpl.call(this, zoneId);
  }

  // --- System Shared Homerun Raceway Management ---

  public setSystemHomerun( systemId: string, path: LatLngPoint[], elevationChangeM: number = 0, name?: string ) : void {
    return setSystemHomerunImpl.call(this, systemId, path, elevationChangeM, name);
  }

  /** All homerun trunks of a system (primary first, then extras). */
  public getSystemHomeruns(systemId?: string): RacewayConfig[] {
    const sys = this.systems.get(systemId || this.selectedSystemId || '');
    return sys ? getSystemHomerunsImpl(sys) : [];
  }

  findHomerun(systemId: string, homerunId?: string) : RacewayConfig | null {
    return findHomerunImpl.call(this, systemId, homerunId);
  }

  /**
   * Adds another homerun trunk to the system (the first one becomes the primary).
   * Returns the new trunk.
   */
  public addSystemHomerun( systemId: string, path: LatLngPoint[], elevationChangeM: number = 0, name?: string ) : RacewayConfig | null {
    return addSystemHomerunImpl.call(this, systemId, path, elevationChangeM, name);
  }

  public updateSystemHomerunVertices(systemId: string, path: LatLngPoint[], homerunId?: string) : void {
    return updateSystemHomerunVerticesImpl.call(this, systemId, path, homerunId);
  }

  public addSystemHomerunVertex(systemId: string, insertAfterIndex: number, point: LatLngPoint, homerunId?: string) : void {
    return addSystemHomerunVertexImpl.call(this, systemId, insertAfterIndex, point, homerunId);
  }

  public deleteSystemHomerunVertex(systemId: string, vertexIndex: number, homerunId?: string) : boolean {
    return deleteSystemHomerunVertexImpl.call(this, systemId, vertexIndex, homerunId);
  }

  public setSystemHomerunElevation(systemId: string, elevationM: number, homerunId?: string) : void {
    return setSystemHomerunElevationImpl.call(this, systemId, elevationM, homerunId);
  }

  /** Removes one homerun trunk by id, or every trunk of the system when no id is given. */
  public clearSystemHomerun(systemId: string, homerunId?: string) : void {
    return clearSystemHomerunImpl.call(this, systemId, homerunId);
  }

  public getSystemHomerun(systemId?: string, homerunId?: string) : RacewayConfig | null {
    return getSystemHomerunImpl.call(this, systemId, homerunId);
  }

  public getHomerunForZone(zoneId: string) : RacewayConfig | null {
    return getHomerunForZoneImpl.call(this, zoneId);
  }

  // --- System AC Feeder Raceway Management ---

  public setSystemAcRaceway( systemId: string, path: LatLngPoint[], elevationChangeM: number = 0, name?: string ) : void {
    return setSystemAcRacewayImpl.call(this, systemId, path, elevationChangeM, name);
  }

  public updateSystemAcRacewayVertices(systemId: string, path: LatLngPoint[]) : void {
    return updateSystemAcRacewayVerticesImpl.call(this, systemId, path);
  }

  public addSystemAcRacewayVertex(systemId: string, insertAfterIndex: number, point: LatLngPoint) : void {
    return addSystemAcRacewayVertexImpl.call(this, systemId, insertAfterIndex, point);
  }

  public deleteSystemAcRacewayVertex(systemId: string, vertexIndex: number) : boolean {
    return deleteSystemAcRacewayVertexImpl.call(this, systemId, vertexIndex);
  }

  public setSystemAcRacewayElevation(systemId: string, elevationM: number) : void {
    return setSystemAcRacewayElevationImpl.call(this, systemId, elevationM);
  }

  public clearSystemAcRaceway(systemId: string) : void {
    return clearSystemAcRacewayImpl.call(this, systemId);
  }

  public getSystemAcRaceway(systemId?: string) : RacewayConfig | null {
    return getSystemAcRacewayImpl.call(this, systemId);
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

  public toggleXRayMode() : void {
    return toggleXRayModeImpl.call(this);
  }

  public selectKeepOut(keepOutId: string | null) : void {
    return selectKeepOutImpl.call(this, keepOutId);
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

  public getSelectedZones() : ArrayZone[] {
    return getSelectedZonesImpl.call(this);
  }

  public getSelectedZoneIds() : string[] {
    return getSelectedZoneIdsImpl.call(this);
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

  public getPanelsForSystem(systemId: string) : SolarPanelObject[] {
    return getPanelsForSystemImpl.call(this, systemId);
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

  public selectZone(zoneId: string | null, isMulti: boolean = false) : void {
    return selectZoneImpl.call(this, zoneId, isMulti);
  }

  public selectAllZones() : void {
    return selectAllZonesImpl.call(this);
  }

  public clearZoneSelection() : void {
    return clearZoneSelectionImpl.call(this);
  }

  public selectPanel(panelId: string | null) : void {
    return selectPanelImpl.call(this, panelId);
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

  public updateKeepOutVertices( zoneId: string, keepOutId: string, vertices: LatLngPoint[], optimize: boolean = false, steps: number = 12 ) : void {
    return updateKeepOutVerticesImpl.call(this, zoneId, keepOutId, vertices, optimize, steps);
  }

  public addKeepOutVertex(zoneId: string, keepOutId: string, insertAfterIndex: number, point: LatLngPoint) : void {
    return addKeepOutVertexImpl.call(this, zoneId, keepOutId, insertAfterIndex, point);
  }

  public deleteKeepOutVertex(zoneId: string, keepOutId: string, vertexIndex: number) : boolean {
    return deleteKeepOutVertexImpl.call(this, zoneId, keepOutId, vertexIndex);
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

  public addKeepOut(zoneId: string, vertices: LatLngPoint[]) : KeepOutPolygon | undefined {
    return addKeepOutImpl.call(this, zoneId, vertices);
  }

  public removeKeepOut(zoneId: string, keepOutId: string) : void {
    return removeKeepOutImpl.call(this, zoneId, keepOutId);
  }

  public deleteKeepOut(keepOutId: string) : boolean {
    return deleteKeepOutImpl.call(this, keepOutId);
  }

  public deleteZone(zoneId: string): void {
    this.removeZone(zoneId);
  }

  public deleteSelected() : 'keepout' | 'zones' | 'zone' | null {
    return deleteSelectedImpl.call(this);
  }

  public reassignKeepOutZone(currentZoneId: string, keepOutId: string, targetZoneId: string) : boolean {
    return reassignKeepOutZoneImpl.call(this, currentZoneId, keepOutId, targetZoneId);
  }

  public updateKeepOutName(zoneId: string, keepOutId: string, name: string) : void {
    return updateKeepOutNameImpl.call(this, zoneId, keepOutId, name);
  }

  public getAllKeepOuts() : { keepOut: KeepOutPolygon; zoneId: string; zoneName: string; systemId: string }[] {
    return getAllKeepOutsImpl.call(this);
  }

  public regenerateZonePanels(zoneId: string, shouldNotify: boolean = true): void {
    return regenerateZonePanelsImpl.call(this, zoneId, shouldNotify);
  }

  public togglePanelActive(panelId: string) : void {
    return togglePanelActiveImpl.call(this, panelId);
  }

  public removePanel(panelId: string) : void {
    return removePanelImpl.call(this, panelId);
  }

  public updatePanelString( panelId: string, stringId: string | null, stringOrder: number | null, mpptId?: string | null, inverterIndex?: number | null ) : void {
    return updatePanelStringImpl.call(this, panelId, stringId, stringOrder, mpptId, inverterIndex);
  }

  public renameString(oldStringId: string, newStringId: string): void {
    return renameStringImpl.call(this, oldStringId, newStringId);
  }

  public updateStringAssignment( stringId: string, inverterIndex?: number, mpptId?: string ) : void {
    return updateStringAssignmentImpl.call(this, stringId, inverterIndex, mpptId);
  }

  public getSystemSummary(filterSystemId?: string) : { totalSystems: number; totalZones: number; totalPanels: number; totalActivePanels: number; totalKwp: number; totalAreaSqM: number; systemName?: string; inverterAcKw: number; dcAcRatio: number; } {
    return getSystemSummaryImpl.call(this, filterSystemId);
  }

  public getSolarYieldEstimate(filterSystemId?: string) : SolarYieldResult {
    return getSolarYieldEstimateImpl.call(this, filterSystemId);
  }

  public setCustomSolarResource(resource: CustomSolarResource | null) : void {
    return setCustomSolarResourceImpl.call(this, resource);
  }

  // --- Existing Facility Load Profile Management ---

  public getLoadProfile(systemId?: string) : FacilityLoadProfile | null {
    return getLoadProfileImpl.call(this, systemId);
  }

  public ensureLoadProfile(systemId?: string) : FacilityLoadProfile {
    return ensureLoadProfileImpl.call(this, systemId);
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

  public applyLoadArchetype(archetype: LoadProfileArchetype) : void {
    return applyLoadArchetypeImpl.call(this, archetype);
  }

  public updateMonthlyLoad(monthIndex: number, kwh: number, peakKw?: number, costPhp?: number) : void {
    return updateMonthlyLoadImpl.call(this, monthIndex, kwh, peakKw, costPhp);
  }

  public getSimulationResult( systemId?: string, options?: Partial<SimulationOptions> ) : SimulationResult {
    return getSimulationResultImpl.call(this, systemId, options);
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

  public getBoqState(systemId?: string, forceRegenerate: boolean = false) : ProjectBoqState {
    return getBoqStateImpl.call(this, systemId, forceRegenerate);
  }

  public syncBoqFromCad(systemId?: string, resetRates: boolean = false) : ProjectBoqState {
    return syncBoqFromCadImpl.call(this, systemId, resetRates);
  }

  public updateBoqMarkups(ocmPercent: number, profitPercent: number, vatPercent: number) : void {
    return updateBoqMarkupsImpl.call(this, ocmPercent, profitPercent, vatPercent);
  }

  public updateDupaWorkItem(itemNo: string, updater: (item: DupaWorkItem) => DupaWorkItem) : void {
    return updateDupaWorkItemImpl.call(this, itemNo, updater);
  }

  public toggleLightningProtection(include?: boolean) : void {
    return toggleLightningProtectionImpl.call(this, include);
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
