/**
 * Project JSON / GeoJSON export, JSON import and localStorage persistence for ProjectStore.
 */
import { ArrayZone, GENERIC_INVERTER_PRESETS, ProjectData, SolarPanelObject } from '../types/solar';
import type { ProjectStore } from './projectStore';
import { getSystemHomeruns } from '../geo/stringCabling';
import { sanitizeProjectData } from '../utils/sanitizeProjectData';

export function exportProjectJson(this: ProjectStore, compact: boolean = false): string {
  const zones = compact
    ? this.getZones().map(z => {
        const { rails, tables, ...rest } = z;
        return rest as ArrayZone;
      })
    : this.getZones();

  const panels = compact
    ? this.getPanels().map(p => {
        const slim: Record<string, any> = {
          id: p.id,
          zoneId: p.zoneId,
          rowIndex: p.rowIndex,
          colIndex: p.colIndex
        };
        if (!p.active) slim.active = false;
        if (p.stringId) slim.stringId = p.stringId;
        if (p.stringOrder !== null && p.stringOrder !== undefined) slim.stringOrder = p.stringOrder;
        if (p.mpptId) slim.mpptId = p.mpptId;
        if (p.inverterIndex !== null && p.inverterIndex !== undefined) slim.inverterIndex = p.inverterIndex;
        return slim as unknown as SolarPanelObject;
      })
    : this.getPanels();

  const data: ProjectData = {
    version: '1.2.0',
    projectName: this.projectName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    center: this.center,
    zoom: this.zoom,
    modules: this.getModules(),
    systems: this.getSystems(),
    zones,
    panels,
    selectedSystemId: this.selectedSystemId || undefined,
    selectedZoneId: this.selectedZoneId !== undefined ? this.selectedZoneId : undefined,
    stringTraverseDirection: this.stringTraverseDirection,
    boqData: this.boqState || undefined,
    customSolarResource: this.customSolarResource || undefined,
    loadProfile: this.loadProfile || undefined
  };
  return compact ? JSON.stringify(data) : JSON.stringify(data, null, 2);
}

export function exportProjectGeoJson(this: ProjectStore): string {
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
    for (const hr of getSystemHomeruns(sys)) {
      features.push({
        type: 'Feature',
        properties: {
          type: 'SharedHomerunTrunk',
          id: hr.id,
          name: hr.name || `Homerun Trunk (${sys.name})`,
          systemId: sys.id,
          systemName: sys.name,
          elevationChangeM: hr.elevationChangeM
        },
        geometry: {
          type: 'LineString',
          coordinates: hr.path.map(p => [p.lng, p.lat])
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

    if (sys.acRaceway && sys.acRaceway.path && sys.acRaceway.path.length >= 2) {
      features.push({
        type: 'Feature',
        properties: {
          type: 'AcFeederRaceway',
          id: sys.acRaceway.id,
          name: sys.acRaceway.name || `AC Feeder (${sys.name})`,
          systemId: sys.id,
          systemName: sys.name,
          elevationChangeM: sys.acRaceway.elevationChangeM,
          racewayType: 'ac_feeder'
        },
        geometry: {
          type: 'LineString',
          coordinates: sys.acRaceway.path.map(p => [p.lng, p.lat])
        }
      });
    }

    if (sys.acInterconnectionLocation) {
      features.push({
        type: 'Feature',
        properties: {
          type: 'AcInterconnectionPCC',
          id: `pcc_${sys.id}`,
          systemId: sys.id,
          systemName: sys.name,
          elevationM: sys.acInterconnectionElevationM ?? 0
        },
        geometry: {
          type: 'Point',
          coordinates: [sys.acInterconnectionLocation.lng, sys.acInterconnectionLocation.lat]
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

export function importProjectJson(this: ProjectStore, jsonStr: string): boolean {
  try {
    const data: ProjectData = sanitizeProjectData(JSON.parse(jsonStr));
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

    const importedPanelIdsByZone = new Map<string, Set<string>>();
    let needsPanelGeometryRebuild = false;

    if (data.panels && Array.isArray(data.panels)) {
      for (const panel of data.panels) {
        if (panel.active === undefined) {
          panel.active = true;
        }
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
        if (!panel.corners || !panel.centroid || !panel.electrical) {
          needsPanelGeometryRebuild = true;
        }
        if (!importedPanelIdsByZone.has(panel.zoneId)) {
          importedPanelIdsByZone.set(panel.zoneId, new Set());
        }
        importedPanelIdsByZone.get(panel.zoneId)!.add(panel.id);
        this.panels.set(panel.id, panel);
      }
    } else {
      for (const zone of this.zones.values()) {
        this.regenerateZonePanels(zone.id, false);
      }
    }

    // Ensure any ground mount zones have tables, roof mount zones have rails, and compact panels have full geometry populated
    for (const zone of this.zones.values()) {
      const missingGroundTables = zone.config.mountType === 'ground' && (!zone.tables || zone.tables.length === 0);
      const missingRoofRails = zone.config.mountType === 'roof' && (!zone.rails || zone.rails.length === 0);
      if (missingGroundTables || missingRoofRails || needsPanelGeometryRebuild) {
        const allowedIds = importedPanelIdsByZone.get(zone.id);
        this.regenerateZonePanels(zone.id, false);
        if (allowedIds && allowedIds.size > 0 && zone.panelCount > allowedIds.size) {
          let activeCount = 0;
          let totalWp = 0;
          let remainingCount = 0;
          for (const p of this.getPanelsForZone(zone.id)) {
            if (!allowedIds.has(p.id)) {
              this.panels.delete(p.id);
            } else {
              remainingCount++;
              if (p.active) {
                activeCount++;
                totalWp += p.electrical.nominalPowerW;
              }
            }
          }
          zone.panelCount = remainingCount;
          zone.activePanelCount = activeCount;
          zone.totalKwp = Number((totalWp / 1000).toFixed(2));
        }
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
    if (data.boqData) {
      this.boqState = data.boqData;
    } else {
      this.boqState = null;
    }
    this.customSolarResource = data.customSolarResource || null;
    this.loadProfile = data.loadProfile || null;
    this.sanitizeStringIntegrity();
    this.layoutVersion++;
    this.notify();
    return true;
  } catch (e) {
    console.error('Failed to import project JSON:', e);
    return false;
  }
}

export function saveToLocalStorage(this: ProjectStore): void {
  if (this.saveTimeout) clearTimeout(this.saveTimeout);
  this.saveTimeout = setTimeout(() => {
    try {
      const json = this.exportProjectJson(true);
      localStorage.setItem('solar_geo_planner_project', json);
    } catch (e) {
      // LocalStorage could fail in test environment or private mode
    }
  }, 200);
}

export function loadFromLocalStorage(this: ProjectStore): void {
  try {
    const saved = localStorage.getItem('solar_geo_planner_project');
    if (saved) {
      this.importProjectJson(saved);
    }
  } catch (e) {
    // LocalStorage not available
  }
}
