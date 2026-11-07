import { describe, it, expect } from 'vitest';
import {
  isPointInPolygon,
  offsetPolygonInward,
  doSegmentsIntersect,
  isPanelValid
} from './polygonMath';

describe('Polygon Math & Setback Engine', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 }
  ];

  it('detects point in polygon', () => {
    expect(isPointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(isPointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(isPointInPolygon({ x: -1, y: 5 }, square)).toBe(false);
  });

  it('detects segment intersections', () => {
    const s1A = { x: 0, y: 5 };
    const s1B = { x: 10, y: 5 };

    const s2A = { x: 5, y: 0 };
    const s2B = { x: 5, y: 10 };

    expect(doSegmentsIntersect(s1A, s1B, s2A, s2B)).toBe(true);

    const s3A = { x: 0, y: 0 };
    const s3B = { x: 4, y: 0 };
    expect(doSegmentsIntersect(s1A, s1B, s3A, s3B)).toBe(false);
  });

  it('inward offsets a rectangular polygon by setback distance', () => {
    const setback = 1.0;
    const offset = offsetPolygonInward(square, setback);

    expect(offset.length).toBe(4);
    // All offset vertices should be inside the original square
    for (const v of offset) {
      expect(isPointInPolygon(v, square)).toBe(true);
      expect(v.x).toBeGreaterThanOrEqual(0.99);
      expect(v.x).toBeLessThanOrEqual(9.01);
      expect(v.y).toBeGreaterThanOrEqual(0.99);
      expect(v.y).toBeLessThanOrEqual(9.01);
    }
  });

  it('validates panel completely inside boundary and not touching keep-outs', () => {
    const validPanel = [
      { x: 2, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 4 },
      { x: 2, y: 4 }
    ];

    const boundary = square;
    const keepOut = [
      { x: 7, y: 7 },
      { x: 9, y: 7 },
      { x: 9, y: 9 },
      { x: 7, y: 9 }
    ];

    expect(isPanelValid(validPanel, boundary, [keepOut])).toBe(true);

    // Panel overlapping keep-out
    const overlappingPanel = [
      { x: 6.5, y: 6.5 },
      { x: 8.5, y: 6.5 },
      { x: 8.5, y: 8.5 },
      { x: 6.5, y: 8.5 }
    ];
    expect(isPanelValid(overlappingPanel, boundary, [keepOut])).toBe(false);

    // Panel crossing outside boundary
    const outsidePanel = [
      { x: 9, y: 9 },
      { x: 11, y: 9 },
      { x: 11, y: 11 },
      { x: 9, y: 11 }
    ];
    expect(isPanelValid(outsidePanel, boundary, [])).toBe(false);
  });
});
