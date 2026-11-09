/**
 * Keep-out (obstruction) zones for ProjectStore.
 */
import { KeepOutPolygon, LatLngPoint } from '../types/solar';
import type { ProjectStore } from './projectStore';

export function updateKeepOutVertices(this: ProjectStore, zoneId: string, keepOutId: string, vertices: LatLngPoint[], optimize: boolean = false, steps: number = 12): void {
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

export function addKeepOutVertex(this: ProjectStore, zoneId: string, keepOutId: string, insertAfterIndex: number, point: LatLngPoint): void {
  const zone = this.zones.get(zoneId);
  if (!zone) return;
  const ko = zone.keepOuts.find(k => k.id === keepOutId);
  if (!ko) return;
  const newVertices = [...ko.vertices];
  newVertices.splice(insertAfterIndex + 1, 0, point);
  this.updateKeepOutVertices(zoneId, keepOutId, newVertices, true);
}

export function deleteKeepOutVertex(this: ProjectStore, zoneId: string, keepOutId: string, vertexIndex: number): boolean {
  const zone = this.zones.get(zoneId);
  if (!zone) return false;
  const ko = zone.keepOuts.find(k => k.id === keepOutId);
  if (!ko || ko.vertices.length <= 3) return false;
  const newVertices = ko.vertices.filter((_, idx) => idx !== vertexIndex);
  this.updateKeepOutVertices(zoneId, keepOutId, newVertices, true);
  return true;
}

export function addKeepOut(this: ProjectStore, zoneId: string, vertices: LatLngPoint[]): KeepOutPolygon | undefined {
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

export function removeKeepOut(this: ProjectStore, zoneId: string, keepOutId: string): void {
  const zone = this.zones.get(zoneId);
  if (!zone) return;

  zone.keepOuts = zone.keepOuts.filter(k => k.id !== keepOutId);
  if (this.selectedKeepOutId === keepOutId) {
    this.selectedKeepOutId = null;
  }
  this.regenerateZonePanels(zoneId, false);
  this.notify();
}

export function deleteKeepOut(this: ProjectStore, keepOutId: string): boolean {
  for (const zone of this.zones.values()) {
    if (zone.keepOuts.some(k => k.id === keepOutId)) {
      this.removeKeepOut(zone.id, keepOutId);
      return true;
    }
  }
  return false;
}

export function reassignKeepOutZone(this: ProjectStore, currentZoneId: string, keepOutId: string, targetZoneId: string): boolean {
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

export function updateKeepOutName(this: ProjectStore, zoneId: string, keepOutId: string, name: string): void {
  const zone = this.zones.get(zoneId);
  if (!zone) return;
  const ko = zone.keepOuts.find(k => k.id === keepOutId);
  if (!ko) return;
  ko.name = name.trim() || ko.name;
  this.notify();
}

export function getAllKeepOuts(this: ProjectStore): { keepOut: KeepOutPolygon; zoneId: string; zoneName: string; systemId: string }[] {
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
