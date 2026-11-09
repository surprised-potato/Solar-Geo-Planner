/**
 * Poultry-house (tunnel-vent gable building) layout generator.
 *
 * Pure geometry: given an anchor point, a heading and house dimensions it returns, for each house,
 * a footprint and the two roof-plane polygons (split at the ridge) with their downslope azimuths.
 * The store turns each roof plane into a roof-mount ArrayZone.
 */
import { LatLngPoint, MetricPoint } from '../types/solar';
import { localMetricToLatLng } from './projection';

export interface PoultryHouseParams {
  anchor: LatLngPoint;   // Center of the first house
  headingDeg: number;    // Bearing of the long axis (ridge line), 0 = north
  lengthM: number;
  widthM: number;
  roofPitchDeg: number;
  count: number;
  gapM: number;          // Clear gap between neighbouring houses
}

export interface PoultryRoofPlane {
  vertices: LatLngPoint[];
  azimuthDeg: number;    // Downslope direction (0-360)
  tiltDeg: number;
}

export interface PoultryHouseLayout {
  index: number;         // 1-based
  footprint: LatLngPoint[];
  roofPlanes: [PoultryRoofPlane, PoultryRoofPlane];
}

const normalizeDeg = (d: number): number => ((d % 360) + 360) % 360;

export function generatePoultryHouseLayout(params: PoultryHouseParams): PoultryHouseLayout[] {
  const { anchor, headingDeg, lengthM, widthM, roofPitchDeg, count, gapM } = params;
  const h = (headingDeg * Math.PI) / 180;
  // u runs along the ridge, r points across the house (bearing heading + 90)
  const u: MetricPoint = { x: Math.sin(h), y: Math.cos(h) };
  const r: MetricPoint = { x: Math.cos(h), y: -Math.sin(h) };
  const pitch = widthM + gapM;

  const toLatLng = (along: number, across: number, center: MetricPoint): LatLngPoint =>
    localMetricToLatLng(
      { x: center.x + u.x * along + r.x * across, y: center.y + u.y * along + r.y * across },
      anchor
    );

  const houses: PoultryHouseLayout[] = [];
  for (let i = 0; i < Math.max(0, Math.floor(count)); i++) {
    const center: MetricPoint = { x: r.x * pitch * i, y: r.y * pitch * i };
    const hl = lengthM / 2;
    const hw = widthM / 2;
    const rect = (a0: number, a1: number, c0: number, c1: number): LatLngPoint[] => [
      toLatLng(a0, c0, center),
      toLatLng(a1, c0, center),
      toLatLng(a1, c1, center),
      toLatLng(a0, c1, center)
    ];
    houses.push({
      index: i + 1,
      footprint: rect(-hl, hl, -hw, hw),
      roofPlanes: [
        { vertices: rect(-hl, hl, 0, hw), azimuthDeg: normalizeDeg(headingDeg + 90), tiltDeg: roofPitchDeg },
        { vertices: rect(-hl, hl, -hw, 0), azimuthDeg: normalizeDeg(headingDeg - 90), tiltDeg: roofPitchDeg }
      ]
    });
  }
  return houses;
}
