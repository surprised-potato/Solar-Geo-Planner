/**
 * Geometric manipulation of array zones: move, rotate, flip, duplicate and cut.
 * All transforms act on the selected arrays as one group around the group's centre.
 */
import type { ArrayZone, LatLngPoint, MetricPoint } from '../types/solar';
import { computePolygonAreaSqM, latLngToLocalMetric, localMetricToLatLng } from '../geo/projection';
import type { ProjectStore } from './projectStore';

export type FlipAxis = 'horizontal' | 'vertical';

/** Centre of the bounding box of every vertex in the given zones. */
export function getZonesCenter(zones: ArrayZone[]): LatLngPoint | null {
  const pts = zones.flatMap(z => z.vertices);
  if (pts.length === 0) return null;
  const lats = pts.map(p => p.lat);
  const lngs = pts.map(p => p.lng);
  return {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2
  };
}

const norm360 = (d: number): number => ((d % 360) + 360) % 360;

/** Applies `fn` (in local metres around `origin`) to every geometry point owned by the zone. */
function transformZoneGeometry(
  zone: ArrayZone,
  origin: LatLngPoint,
  fn: (m: MetricPoint) => MetricPoint
): void {
  const map = (p: LatLngPoint): LatLngPoint => localMetricToLatLng(fn(latLngToLocalMetric(p, origin)), origin);
  zone.vertices = zone.vertices.map(map);
  for (const ko of zone.keepOuts) ko.vertices = ko.vertices.map(map);
  if (zone.raceway) zone.raceway = { ...zone.raceway, path: zone.raceway.path.map(map) };
  zone.areaSqM = computePolygonAreaSqM(zone.vertices);
}

function applyToSelection(
  store: ProjectStore,
  fn: (zone: ArrayZone, center: LatLngPoint) => void,
  pivot?: LatLngPoint
): number {
  const zones = store.getSelectedZones();
  const center = pivot ?? getZonesCenter(zones);
  if (zones.length === 0 || !center) return 0;
  for (const z of zones) {
    fn(z, center);
    store.regenerateZonePanels(z.id, false);
  }
  store.notify();
  return zones.length;
}

/** Translates the selected arrays by east/north metres. */
export function moveSelectedZones(this: ProjectStore, eastM: number, northM: number): number {
  return applyToSelection(this, (zone, center) =>
    transformZoneGeometry(zone, center, m => ({ x: m.x + eastM, y: m.y + northM }))
  );
}

/** Translates the selected arrays so the group centre lands on `target`. */
export function moveSelectedZonesTo(this: ProjectStore, target: LatLngPoint): number {
  const center = getZonesCenter(this.getSelectedZones());
  if (!center) return 0;
  const d = latLngToLocalMetric(target, center);
  return moveSelectedZones.call(this, d.x, d.y);
}

/** Rotates the selected arrays clockwise (compass sense) by `deg` about the group centre; panels turn with them. */
export function rotateSelectedZones(this: ProjectStore, deg: number, pivot?: LatLngPoint): number {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return applyToSelection(this, (zone, center) => {
    // x = east, y = north: a clockwise turn viewed from above.
    transformZoneGeometry(zone, center, m => ({
      x: m.x * cos + m.y * sin,
      y: -m.x * sin + m.y * cos
    }));
    zone.config = { ...zone.config, azimuthDeg: norm360(zone.config.azimuthDeg + deg) };
  }, pivot);
}

/** Mirrors the selected arrays about the group centre (horizontal = left/right swap, vertical = up/down swap). */
export function flipSelectedZones(this: ProjectStore, axis: FlipAxis): number {
  return applyToSelection(this, (zone, center) => {
    if (axis === 'horizontal') {
      transformZoneGeometry(zone, center, m => ({ x: -m.x, y: m.y }));
      zone.config = { ...zone.config, azimuthDeg: norm360(360 - zone.config.azimuthDeg) };
    } else {
      transformZoneGeometry(zone, center, m => ({ x: m.x, y: -m.y }));
      zone.config = { ...zone.config, azimuthDeg: norm360(180 - zone.config.azimuthDeg) };
    }
  });
}

/** Copy + paste in one step; the copy appears offset to the east of the selection. */
export function duplicateSelectedZones(this: ProjectStore): ArrayZone[] {
  if (this.copySelectedZones() === 0) return [];
  return this.pasteZones();
}

/** Copy then delete the selected arrays. */
export function cutSelectedZones(this: ProjectStore): number {
  const ids = this.getSelectedZoneIds();
  const n = this.copySelectedZones();
  for (const id of ids) this.removeZone(id);
  return n;
}
