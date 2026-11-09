/**
 * Poultry-house (tunnel-vent gable building) layout generator.
 *
 * Pure geometry: given an anchor point, a heading and house dimensions it returns, for each house,
 * a footprint and the two roof-plane polygons (split at the ridge) with their downslope azimuths.
 * The store turns each roof plane into a roof-mount ArrayZone.
 */
import { LatLngPoint, MetricPoint } from '../types/solar';
import { localMetricToLatLng } from './projection';

/** Tunnel-ventilation zones that PV must stay out of, as clearance widths in metres (0 = none). */
export interface RoofKeepOutOptions {
  ridgeVentWidthM: number;    // strip along the ridge on each plane (ridge vent / ridge opening)
  eaveClearanceM: number;     // strip along the eave (side-wall inlets, curtains, gutters)
  fanEndClearanceM: number;   // across the roof at the +heading gable end (tunnel fan hoods, service access)
  padEndClearanceM: number;   // across the roof at the -heading gable end (evaporative cooling pad)
}

export const DEFAULT_ROOF_KEEP_OUTS: RoofKeepOutOptions = {
  ridgeVentWidthM: 0.6,
  eaveClearanceM: 0.5,
  fanEndClearanceM: 3,
  padEndClearanceM: 2
};

export interface PoultryHouseParams {
  anchor: LatLngPoint;   // Center of the first house
  headingDeg: number;    // Bearing of the long axis (ridge line), 0 = north
  lengthM: number;
  widthM: number;
  roofPitchDeg: number;
  count: number;
  gapM: number;          // Clear gap between neighbouring houses
  roofKeepOuts?: RoofKeepOutOptions | null; // Ventilation keep-outs on each roof plane (off when omitted)
}

export interface PoultryKeepOut {
  name: string;
  vertices: LatLngPoint[];
}

export interface PoultryRoofPlane {
  vertices: LatLngPoint[];
  keepOuts: PoultryKeepOut[];
  azimuthDeg: number;    // Downslope direction (0-360)
  tiltDeg: number;
}

export interface PoultryHouseLayout {
  index: number;         // 1-based
  footprint: LatLngPoint[];
  roofPlanes: [PoultryRoofPlane, PoultryRoofPlane];
}

const normalizeDeg = (d: number): number => ((d % 360) + 360) % 360;

type RectFn = (a0: number, a1: number, c0: number, c1: number) => LatLngPoint[];

/** Ventilation keep-out rectangles for one roof plane. `side` is +1 for the +r plane, -1 for the -r plane. */
function planeKeepOuts(rect: RectFn, hl: number, hw: number, side: 1 | -1, opts?: RoofKeepOutOptions | null): PoultryKeepOut[] {
  if (!opts) return [];
  // Across-axis range helper: a strip `from` to `to` measured outward from the ridge (0) toward the eave (hw)
  const across = (from: number, to: number): [number, number] => (side === 1 ? [from, to] : [-to, -from]);
  const out: PoultryKeepOut[] = [];
  const ridge = Math.min(opts.ridgeVentWidthM, hw);
  const eave = Math.min(opts.eaveClearanceM, hw);
  const fan = Math.min(opts.fanEndClearanceM, hl * 2);
  const pad = Math.min(opts.padEndClearanceM, hl * 2);
  if (ridge > 0) out.push({ name: 'Ridge vent strip', vertices: rect(-hl, hl, ...across(0, ridge)) });
  if (eave > 0) out.push({ name: 'Eave inlet clearance', vertices: rect(-hl, hl, ...across(hw - eave, hw)) });
  if (fan > 0) out.push({ name: 'Tunnel fan end', vertices: rect(hl - fan, hl, ...across(0, hw)) });
  if (pad > 0) out.push({ name: 'Cooling pad end', vertices: rect(-hl, -hl + pad, ...across(0, hw)) });
  return out;
}

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
        { vertices: rect(-hl, hl, 0, hw), keepOuts: planeKeepOuts(rect, hl, hw, 1, params.roofKeepOuts), azimuthDeg: normalizeDeg(headingDeg + 90), tiltDeg: roofPitchDeg },
        { vertices: rect(-hl, hl, -hw, 0), keepOuts: planeKeepOuts(rect, hl, hw, -1, params.roofKeepOuts), azimuthDeg: normalizeDeg(headingDeg - 90), tiltDeg: roofPitchDeg }
      ]
    });
  }
  return houses;
}
