/**
 * Array zone creation, config updates, match-properties and panel regeneration for ProjectStore.
 */
import {
  ArrayZone,
  DEFAULT_GROUND_CONFIG,
  DEFAULT_ROOF_CONFIG,
  LatLngPoint,
  LayoutConfig,
  MountType,
  SolarPanelObject,
  ZNSHINE_600W_BIFACIAL,
  StringTraverseDirection
} from '../types/solar';
import { computePolygonAreaSqM } from '../geo/projection';
import { generatePanelsForZone, optimizeGridShift } from '../geo/autofill';
import type { ProjectStore } from './projectStore';
import { MatchPropertiesOptions, ZONE_COLORS } from './projectStore';

export function addZone(
  this: ProjectStore,
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
  this.selectedZoneIds.clear();
  this.selectedZoneIds.add(id);
  this.selectedPanelId = null;

  this.regenerateZonePanels(id, false);
  this.notify();
  return newZone;
}

export function updateZoneConfig(
  this: ProjectStore,
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

export function updateSelectedZonesConfig(
  this: ProjectStore,
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

/**
 * Matches/copies configuration properties from a source ArrayZone to one or more target ArrayZones.
 * Granular flags allow matching module specs, mount type & racking, tilt, azimuth, spacing, setback, etc.
 */
export function matchZoneProperties(
  this: ProjectStore,
  sourceZoneId: string,
  targetZoneIds: string | string[],
  options: Partial<MatchPropertiesOptions> = {}
): { success: boolean; matchedCount: number; targetNames: string[] } {
  const sourceZone = this.zones.get(sourceZoneId);
  if (!sourceZone) return { success: false, matchedCount: 0, targetNames: [] };

  const targets = (Array.isArray(targetZoneIds) ? targetZoneIds : [targetZoneIds])
    .filter(id => id !== sourceZoneId && this.zones.has(id));
  if (targets.length === 0) return { success: false, matchedCount: 0, targetNames: [] };

  const opts: MatchPropertiesOptions = {
    ...this.matchPropsOptions,
    ...options
  };

  const targetNames: string[] = [];
  const affectedSystemIds = new Set<string>();
  if (sourceZone.systemId) affectedSystemIds.add(sourceZone.systemId);

  for (const targetId of targets) {
    const target = this.zones.get(targetId)!;
    targetNames.push(target.name);
    if (target.systemId) affectedSystemIds.add(target.systemId);

    if (opts.matchModule) {
      target.moduleId = sourceZone.moduleId;
      target.config.panelWidthMm = sourceZone.config.panelWidthMm;
      target.config.panelLengthMm = sourceZone.config.panelLengthMm;
      target.config.electrical = { ...sourceZone.config.electrical };
    }

    if (opts.matchMountType) {
      target.config.mountType = sourceZone.config.mountType;
      if (sourceZone.config.mountType === 'ground') {
        target.config.modulesPerTableUp = sourceZone.config.modulesPerTableUp ?? 2;
        target.config.modulesPerTableWide = sourceZone.config.modulesPerTableWide ?? 14;
        target.config.tableSpacingM = sourceZone.config.tableSpacingM ?? 1.0;
        target.config.intraTableSpacingM = sourceZone.config.intraTableSpacingM ?? 0.02;
      } else {
        target.config.railCount = sourceZone.config.railCount ?? 2;
        target.config.railOverhangM = sourceZone.config.railOverhangM ?? 0.10;
      }
    }

    if (opts.matchOrientation) {
      target.config.orientation = sourceZone.config.orientation;
    }

    if (opts.matchAzimuth) {
      target.config.azimuthDeg = sourceZone.config.azimuthDeg;
    }

    if (opts.matchTilt) {
      target.config.tiltDeg = sourceZone.config.tiltDeg;
    }

    if (opts.matchSpacing) {
      target.config.rowSpacingM = sourceZone.config.rowSpacingM;
      target.config.colSpacingM = sourceZone.config.colSpacingM;
    }

    if (opts.matchSetback) {
      target.config.setbackM = sourceZone.config.setbackM;
    }

    if (opts.matchTraverse && sourceZone.config.stringTraverseDirection) {
      target.config.stringTraverseDirection = sourceZone.config.stringTraverseDirection;
    }

    if (opts.matchSystem && sourceZone.systemId !== target.systemId) {
      this.linkZoneToSystem(target.id, sourceZone.systemId);
      affectedSystemIds.add(sourceZone.systemId);
    }

    if (opts.autoOptimize) {
      this.optimizeZoneGridShift(target.id, 12, true);
    } else {
      this.regenerateZonePanels(target.id, false);
    }
  }

  this.layoutVersion++;
  this.notify();
  return { success: true, matchedCount: targets.length, targetNames };
}

export function optimizeZoneGridShift(
  this: ProjectStore,
  zoneId: string,
  steps: number = 12,
  autoString: boolean = true,
  customModulesPerString?: number,
  direction?: StringTraverseDirection
): { optimalOffsetX: number; optimalOffsetY: number; maxPanelCount: number; previousPanelCount: number; totalStrings?: number; modulesPerString?: number; warnings?: string[] } {
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

export function optimizeSelectedZonesGridShift(
  this: ProjectStore,
  steps: number = 12,
  autoString: boolean = true,
  customModulesPerString?: number,
  direction?: StringTraverseDirection | 'auto'
): { totalMaxPanels: number; totalPreviousPanels: number; optimizedCount: number; totalStrings?: number; warnings?: string[] } {
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

export function regenerateZonePanels(this: ProjectStore, zoneId: string, shouldNotify: boolean = true): void {
  this.layoutVersion++;
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


/** Snapshot of an array kept on the internal clipboard. */
export interface ClipboardZone {
  zone: ArrayZone;
  inactivePanels: Array<{ row: number; col: number }>;
}

/** Copies the currently selected arrays onto the store's internal clipboard. Returns the count copied. */
export function copySelectedZones(this: ProjectStore): number {
  const ids = this.getSelectedZoneIds();
  const items: ClipboardZone[] = [];
  for (const id of ids) {
    const zone = this.zones.get(id);
    if (!zone) continue;
    const inactivePanels: Array<{ row: number; col: number }> = [];
    for (const p of this.panels.values()) {
      if (p.zoneId === id && !p.active) inactivePanels.push({ row: p.rowIndex, col: p.colIndex });
    }
    items.push({ zone: structuredClone(zone), inactivePanels });
  }
  this.zoneClipboard = items;
  return items.length;
}

/**
 * Pastes clipboard arrays. If `anchor` is given the group's centre lands there,
 * otherwise the group is placed immediately to the east of the original.
 * Returns the new zones (selected afterwards).
 */
export function pasteZones(this: ProjectStore, anchor?: LatLngPoint): ArrayZone[] {
  const items = this.zoneClipboard;
  if (items.length === 0) return [];

  const pts = items.flatMap(i => i.zone.vertices);
  const minLat = Math.min(...pts.map(p => p.lat)), maxLat = Math.max(...pts.map(p => p.lat));
  const minLng = Math.min(...pts.map(p => p.lng)), maxLng = Math.max(...pts.map(p => p.lng));
  const cLat = (minLat + maxLat) / 2, cLng = (minLng + maxLng) / 2;

  this.pasteCount++;
  let dLat: number, dLng: number;
  if (anchor) {
    dLat = anchor.lat - cLat;
    dLng = anchor.lng - cLng;
  } else {
    const gap = (maxLng - minLng) * 0.1 || 0.00005;
    dLat = 0;
    dLng = (maxLng - minLng + gap) * this.pasteCount;
  }
  const shift = (p: LatLngPoint): LatLngPoint => ({ lat: p.lat + dLat, lng: p.lng + dLng });

  const created: ArrayZone[] = [];
  for (const { zone: src, inactivePanels } of items) {
    const id = `zone_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const color = ZONE_COLORS[this.colorIndex % ZONE_COLORS.length];
    this.colorIndex++;
    const systemId = this.systems.has(src.systemId) ? src.systemId : this.systems.keys().next().value!;

    const zone: ArrayZone = {
      ...structuredClone(src),
      id,
      systemId,
      name: nextZoneName(this, src.name),
      color,
      vertices: src.vertices.map(shift),
      keepOuts: src.keepOuts.map(k => ({
        ...structuredClone(k),
        id: `ko_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        vertices: k.vertices.map(shift)
      })),
      tables: [],
      rails: [],
      tableCount: 0,
      railCount: 0,
      raceway: null,
      panelCount: 0,
      activePanelCount: 0,
      totalKwp: 0
    };
    this.zones.set(id, zone);
    const sys = this.systems.get(systemId);
    if (sys && !sys.zoneIds.includes(id)) sys.zoneIds.push(id);

    this.regenerateZonePanels(id, false);
    if (inactivePanels.length > 0) {
      const off = new Set(inactivePanels.map(i => `${i.row}:${i.col}`));
      for (const p of this.panels.values()) {
        if (p.zoneId === id && off.has(`${p.rowIndex}:${p.colIndex}`)) p.active = false;
      }
      this.regenerateZonePanels(id, false);
    }
    created.push(zone);
  }

  this.selectedZoneIds.clear();
  for (const z of created) this.selectedZoneIds.add(z.id);
  this.selectedZoneId = created[0].id;
  this.selectedPanelId = null;
  this.selectedKeepOutId = null;
  this.notify();
  return created;
}


/** "Roof Array 3" -> next unused "Roof Array N" (highest existing N with that base + 1). */
function nextZoneName(store: ProjectStore, name: string): string {
  const m = name.trim().match(/^(.*?)(?:\s+(\d+))?$/);
  const base = (m?.[1] || name).trim();
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}(?:\\s+(\\d+))?$`);
  let max = 1;
  for (const z of store.zones.values()) {
    const mm = z.name.trim().match(re);
    if (mm) max = Math.max(max, mm[1] ? parseInt(mm[1], 10) : 1);
  }
  return `${base} ${max + 1}`;
}
