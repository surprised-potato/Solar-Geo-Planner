/**
 * Fly-to / zoom-to helpers for arrays, panels, tables, inverters, raceways and strings.
 */
import L from 'leaflet';
import { LatLngPoint, MountTableObject } from '../types/solar';
import type { MapController } from './mapController';

export function flyTo(this: MapController, lat: number, lng: number, zoom = 19): void {
  this.map.flyTo([lat, lng], zoom, { duration: 1.2 });
}

export function zoomToZone(this: MapController, zoneId: string): void {
  const zone = this.store.getZone(zoneId);
  if (!zone || zone.vertices.length === 0) return;

  const bounds = L.latLngBounds(zone.vertices.map(v => [v.lat, v.lng] as [number, number]));
  this.map.fitBounds(bounds, {
    padding: [80, 80],
    maxZoom: 22,
    animate: true,
    duration: 1.0
  });
}

export function zoomToPanel(this: MapController, panelId: string): void {
  const panel = this.store.getPanel(panelId);
  if (!panel) return;
  const zone = this.store.getZone(panel.zoneId);
  if (zone?.config.mountType === 'ground' && zone.tables) {
    const table = zone.tables.find(t => t.panelIds.includes(panelId));
    if (table) {
      this.selectedTableId = table.id;
      this.updateMountTableStyles();
    }
  }
  this.map.flyTo([panel.centroid.lat, panel.centroid.lng], Math.max(this.map.getZoom(), 22), {
    duration: 0.8
  });
}

export function zoomToTable(this: MapController, table: MountTableObject): void {
  const latlngs = table.corners.map(c => [c.lat, c.lng] as [number, number]);
  const bounds = L.latLngBounds(latlngs);
  this.map.flyToBounds(bounds.pad(0.35), {
    maxZoom: 21,
    duration: 0.8
  });
}

export function zoomToInverter(this: MapController, systemId: string): void {
  const sys = this.store.getSystem(systemId);
  if (!sys || !sys.inverterLocation) return;
  this.map.flyTo([sys.inverterLocation.lat, sys.inverterLocation.lng], Math.max(this.map.getZoom(), 21), {
    duration: 0.8
  });
}

export function zoomToAcInterconnection(this: MapController, systemId: string): void {
  const sys = this.store.getSystem(systemId);
  if (!sys || !sys.acInterconnectionLocation) return;
  this.map.flyTo([sys.acInterconnectionLocation.lat, sys.acInterconnectionLocation.lng], Math.max(this.map.getZoom(), 21), {
    duration: 0.8
  });
}

export function zoomToAcRaceway(this: MapController, systemId: string): void {
  const sys = this.store.getSystem(systemId);
  if (!sys?.acRaceway || !sys.acRaceway.path || sys.acRaceway.path.length === 0) return;
  const latlngs = sys.acRaceway.path.map((p: LatLngPoint) => [p.lat, p.lng] as [number, number]);
  const bounds = L.latLngBounds(latlngs);
  this.map.flyToBounds(bounds, {
    padding: [40, 40],
    duration: 1.0,
    maxZoom: 21
  });
}

export function zoomToRaceway(this: MapController, zoneId?: string, systemId?: string): void {
  const homerun = (zoneId ? this.store.getHomerunForZone(zoneId) : null)
    || this.store.getSystemHomerun(systemId, this.selectedHomerunId || undefined);
  if (!homerun || !homerun.path || homerun.path.length === 0) return;
  const latlngs = homerun.path.map((p: LatLngPoint) => [p.lat, p.lng] as [number, number]);
  const bounds = L.latLngBounds(latlngs);
  this.map.flyToBounds(bounds, {
    padding: [60, 60],
    maxZoom: 22,
    duration: 1.0
  });
}

export function zoomToKeepOut(this: MapController, zoneId: string, keepOutId: string): void {
  const zone = this.store.getZone(zoneId);
  if (!zone) return;
  const ko = zone.keepOuts.find(k => k.id === keepOutId);
  if (!ko || ko.vertices.length === 0) return;
  const latlngs = ko.vertices.map(v => [v.lat, v.lng] as [number, number]);
  const bounds = L.latLngBounds(latlngs);
  this.map.flyToBounds(bounds, {
    padding: [80, 80],
    maxZoom: 22,
    duration: 1.0
  });
}

export function zoomToString(this: MapController, stringId: string, systemId?: string): void {
  const panels = this.store
    .getPanels()
    .filter(p => p.stringId === stringId && (!systemId || p.systemId === systemId));
  if (panels.length === 0) return;
  const points: [number, number][] = [];
  panels.forEach(p => {
    p.corners.forEach(c => points.push([c.lat, c.lng]));
  });
  const bounds = L.latLngBounds(points);
  this.map.flyToBounds(bounds, {
    padding: [70, 70],
    maxZoom: 22,
    duration: 1.0
  });
}
