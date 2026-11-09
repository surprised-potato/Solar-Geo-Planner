import { describe, it, expect } from 'vitest';
import { generatePoultryHouseLayout } from './poultryHouses';
import { computePolygonAreaSqM, latLngToLocalMetric } from './projection';

const anchor = { lat: 15.0, lng: 120.5 };
const base = { anchor, headingDeg: 0, lengthM: 120, widthM: 14, roofPitchDeg: 15, count: 3, gapM: 10 };

describe('generatePoultryHouseLayout', () => {
  it('creates N houses with 2 roof planes each', () => {
    const houses = generatePoultryHouseLayout(base);
    expect(houses).toHaveLength(3);
    for (const h of houses) {
      expect(h.roofPlanes).toHaveLength(2);
      expect(h.footprint).toHaveLength(4);
    }
  });

  it('splits each footprint into two half-area planes', () => {
    const [house] = generatePoultryHouseLayout(base);
    const total = computePolygonAreaSqM(house.footprint);
    expect(total).toBeCloseTo(120 * 14, 0);
    for (const p of house.roofPlanes) {
      expect(computePolygonAreaSqM(p.vertices)).toBeCloseTo(total / 2, 0);
      expect(p.tiltDeg).toBe(15);
    }
  });

  it('gives the planes opposite downslope azimuths', () => {
    const [house] = generatePoultryHouseLayout({ ...base, headingDeg: 0 });
    expect(house.roofPlanes.map(p => p.azimuthDeg).sort((a, b) => a - b)).toEqual([90, 270]);
    const [rotated] = generatePoultryHouseLayout({ ...base, headingDeg: 45 });
    expect(rotated.roofPlanes.map(p => p.azimuthDeg).sort((a, b) => a - b)).toEqual([135, 315]);
  });

  it('spaces houses by width + gap without overlap', () => {
    const houses = generatePoultryHouseLayout(base);
    const c = (i: number) => {
      const pts = houses[i].footprint.map(p => latLngToLocalMetric(p, anchor));
      return { x: pts.reduce((s, p) => s + p.x, 0) / 4, y: pts.reduce((s, p) => s + p.y, 0) / 4 };
    };
    expect(Math.hypot(c(1).x - c(0).x, c(1).y - c(0).y)).toBeCloseTo(24, 1);
    expect(Math.hypot(c(2).x - c(1).x, c(2).y - c(1).y)).toBeCloseTo(24, 1);
  });
});

describe('ventilation keep-outs', () => {
  const ko = { ridgeVentWidthM: 0.6, eaveClearanceM: 0.5, fanEndClearanceM: 3, padEndClearanceM: 2 };

  it('adds no keep-outs unless requested', () => {
    const [house] = generatePoultryHouseLayout(base);
    expect(house.roofPlanes.every(p => p.keepOuts.length === 0)).toBe(true);
  });

  it('creates ridge, eave, fan-end and pad-end strips inside each roof plane', () => {
    const [house] = generatePoultryHouseLayout({ ...base, roofKeepOuts: ko });
    for (const plane of house.roofPlanes) {
      expect(plane.keepOuts.map(k => k.name)).toEqual(['Ridge vent strip', 'Eave inlet clearance', 'Tunnel fan end', 'Cooling pad end']);
      const areas = plane.keepOuts.map(k => computePolygonAreaSqM(k.vertices));
      expect(areas[0]).toBeCloseTo(120 * 0.6, 0); // ridge: length x width
      expect(areas[1]).toBeCloseTo(120 * 0.5, 0); // eave
      expect(areas[2]).toBeCloseTo(3 * 7, 0);     // fan end: clearance x plane width (14/2)
      expect(areas[3]).toBeCloseTo(2 * 7, 0);     // pad end
    }
  });

  it('puts the ridge strip against the ridge and the eave strip against the eave on both planes', () => {
    const [house] = generatePoultryHouseLayout({ ...base, roofKeepOuts: ko });
    const acrossRange = (pts: { lat: number; lng: number }[]) => {
      const m = pts.map(p => latLngToLocalMetric(p, anchor).x); // heading 0: across axis is east (x)
      return [Math.min(...m), Math.max(...m)];
    };
    const [east, west] = house.roofPlanes;
    const [r0, r1] = acrossRange(east.keepOuts[0].vertices);
    expect(r0).toBeCloseTo(0, 1); expect(r1).toBeCloseTo(0.6, 1);
    const [w0, w1] = acrossRange(west.keepOuts[0].vertices);
    expect(w0).toBeCloseTo(-0.6, 1); expect(w1).toBeCloseTo(0, 1);
    const [e0, e1] = acrossRange(east.keepOuts[1].vertices);
    expect(e0).toBeCloseTo(6.5, 1); expect(e1).toBeCloseTo(7, 1);
  });
});
