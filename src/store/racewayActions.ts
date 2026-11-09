/**
 * DC raceways, multi-homerun routes and AC raceways for ProjectStore.
 */
import { LatLngPoint, RacewayConfig } from '../types/solar';
import { computePolygonCentroid } from '../geo/projection';
import {
  getSystemHomeruns as getSystemHomerunsImpl,
  pickNearestHomerun as pickNearestHomerunImpl
} from '../geo/stringCabling';
import type { ProjectStore } from './projectStore';

export function setZoneElevationDelta(this: ProjectStore, zoneId: string, elevationDeltaM: number): void {
  const zone = this.zones.get(zoneId);
  if (!zone) return;
  zone.elevationDeltaM = Number(elevationDeltaM) || 0;
  this.notify();
}

export function setZoneRaceway(this: ProjectStore, zoneId: string, path: LatLngPoint[], elevationChangeM: number = 0, name?: string): void {
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

export function updateRacewayVertices(this: ProjectStore, zoneId: string, path: LatLngPoint[]): void {
  const zone = this.zones.get(zoneId);
  if (!zone || !zone.raceway) return;
  zone.raceway.path = path;
  this.notify();
}

export function addRacewayVertex(this: ProjectStore, zoneId: string, insertAfterIndex: number, point: LatLngPoint): void {
  const zone = this.zones.get(zoneId);
  if (!zone || !zone.raceway) return;
  const newPath = [...zone.raceway.path];
  newPath.splice(insertAfterIndex + 1, 0, point);
  this.updateRacewayVertices(zoneId, newPath);
}

export function deleteRacewayVertex(this: ProjectStore, zoneId: string, vertexIndex: number): boolean {
  const zone = this.zones.get(zoneId);
  if (!zone || !zone.raceway || zone.raceway.path.length <= 2) return false;
  const newPath = zone.raceway.path.filter((_, idx) => idx !== vertexIndex);
  this.updateRacewayVertices(zoneId, newPath);
  return true;
}

export function setRacewayElevationChange(this: ProjectStore, zoneId: string, elevationM: number): void {
  const zone = this.zones.get(zoneId);
  if (!zone) return;
  if (zone.raceway) {
    zone.raceway.elevationChangeM = Number(elevationM) || 0;
  } else {
    zone.elevationDeltaM = Number(elevationM) || 0;
  }
  this.notify();
}

export function clearZoneRaceway(this: ProjectStore, zoneId: string): void {
  const zone = this.zones.get(zoneId);
  if (!zone) return;
  zone.raceway = null;
  this.notify();
}

export function setSystemHomerun(this: ProjectStore, systemId: string, path: LatLngPoint[], elevationChangeM: number = 0, name?: string): void {
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

export function findHomerun(this: ProjectStore, systemId: string, homerunId?: string): RacewayConfig | null {
  const sys = this.systems.get(systemId);
  if (!sys) return null;
  if (!homerunId) return sys.homerunRaceway || sys.extraHomeruns?.[0] || null;
  return getSystemHomerunsImpl(sys).find(h => h.id === homerunId) || null;
}

/**
 * Adds another homerun trunk to the system (the first one becomes the primary).
 * Returns the new trunk.
 */
export function addSystemHomerun(this: ProjectStore, systemId: string, path: LatLngPoint[], elevationChangeM: number = 0, name?: string): RacewayConfig | null {
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

export function updateSystemHomerunVertices(this: ProjectStore, systemId: string, path: LatLngPoint[], homerunId?: string): void {
  const hr = this.findHomerun(systemId, homerunId);
  if (!hr) return;
  hr.path = path;
  this.notify();
}

export function addSystemHomerunVertex(this: ProjectStore, systemId: string, insertAfterIndex: number, point: LatLngPoint, homerunId?: string): void {
  const hr = this.findHomerun(systemId, homerunId);
  if (!hr) return;
  const newPath = [...hr.path];
  newPath.splice(insertAfterIndex + 1, 0, point);
  this.updateSystemHomerunVertices(systemId, newPath, homerunId);
}

export function deleteSystemHomerunVertex(this: ProjectStore, systemId: string, vertexIndex: number, homerunId?: string): boolean {
  const hr = this.findHomerun(systemId, homerunId);
  if (!hr || hr.path.length <= 2) return false;
  const newPath = hr.path.filter((_, idx) => idx !== vertexIndex);
  this.updateSystemHomerunVertices(systemId, newPath, homerunId);
  return true;
}

export function setSystemHomerunElevation(this: ProjectStore, systemId: string, elevationM: number, homerunId?: string): void {
  const hr = this.findHomerun(systemId, homerunId);
  if (!hr) return;
  hr.elevationChangeM = Number(elevationM) || 0;
  this.notify();
}

/** Removes one homerun trunk by id, or every trunk of the system when no id is given. */
export function clearSystemHomerun(this: ProjectStore, systemId: string, homerunId?: string): void {
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

export function getSystemHomerun(this: ProjectStore, systemId?: string, homerunId?: string): RacewayConfig | null {
  const targetSysId = systemId || this.selectedSystemId;
  if (!targetSysId) return null;
  if (homerunId) return this.findHomerun(targetSysId, homerunId);
  return this.systems.get(targetSysId)?.homerunRaceway || null;
}

export function getHomerunForZone(this: ProjectStore, zoneId: string): RacewayConfig | null {
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

export function setSystemAcRaceway(this: ProjectStore, systemId: string, path: LatLngPoint[], elevationChangeM: number = 0, name?: string): void {
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

export function updateSystemAcRacewayVertices(this: ProjectStore, systemId: string, path: LatLngPoint[]): void {
  const sys = this.systems.get(systemId);
  if (!sys || !sys.acRaceway) return;
  sys.acRaceway.path = path;
  this.notify();
}

export function addSystemAcRacewayVertex(this: ProjectStore, systemId: string, insertAfterIndex: number, point: LatLngPoint): void {
  const sys = this.systems.get(systemId);
  if (!sys || !sys.acRaceway) return;
  const newPath = [...sys.acRaceway.path];
  newPath.splice(insertAfterIndex + 1, 0, point);
  this.updateSystemAcRacewayVertices(systemId, newPath);
}

export function deleteSystemAcRacewayVertex(this: ProjectStore, systemId: string, vertexIndex: number): boolean {
  const sys = this.systems.get(systemId);
  if (!sys || !sys.acRaceway || sys.acRaceway.path.length <= 2) return false;
  const newPath = sys.acRaceway.path.filter((_, idx) => idx !== vertexIndex);
  this.updateSystemAcRacewayVertices(systemId, newPath);
  return true;
}

export function setSystemAcRacewayElevation(this: ProjectStore, systemId: string, elevationM: number): void {
  const sys = this.systems.get(systemId);
  if (!sys || !sys.acRaceway) return;
  sys.acRaceway.elevationChangeM = Number(elevationM) || 0;
  this.notify();
}

export function clearSystemAcRaceway(this: ProjectStore, systemId: string): void {
  const sys = this.systems.get(systemId);
  if (!sys) return;
  sys.acRaceway = null;
  this.notify();
}

export function getSystemAcRaceway(this: ProjectStore, systemId?: string): RacewayConfig | null {
  const targetSysId = systemId || this.selectedSystemId;
  if (targetSysId) {
    const sys = this.systems.get(targetSysId);
    return sys?.acRaceway || null;
  }
  return null;
}
