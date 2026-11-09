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
