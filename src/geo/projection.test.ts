import { describe, it, expect } from 'vitest';
import {
  latLngToLocalMetric,
  localMetricToLatLng,
  computePolygonCentroid,
  computePolygonAreaSqM,
  calculateBearingDeg,
  getCompassHeading,
  computeDownwardTiltVector,
  angularDifferenceDeg,
  calculateEdgeDownslopeAzimuth,
  findClosestPolygonEdge
} from './projection';

describe('Geospatial Projection Engine', () => {
  const origin = { lat: 37.7749, lng: -122.4194 }; // San Francisco

  it('projects and inverse projects points with millimeter accuracy', () => {
    // 50m East, 30m North
    const targetOffset = { x: 50.0, y: 30.0 };
    const latLng = localMetricToLatLng(targetOffset, origin);
    const roundTrip = latLngToLocalMetric(latLng, origin);

    expect(roundTrip.x).toBeCloseTo(targetOffset.x, 3);
    expect(roundTrip.y).toBeCloseTo(targetOffset.y, 3);
  });

  it('calculates polygon centroid correctly', () => {
    const vertices = [
      { lat: 0, lng: 0 },
      { lat: 10, lng: 0 },
      { lat: 10, lng: 10 },
      { lat: 0, lng: 10 }
    ];
    const centroid = computePolygonCentroid(vertices);
    expect(centroid.lat).toBe(5);
    expect(centroid.lng).toBe(5);
  });

  it('calculates polygon area in square meters for a metric box', () => {
    // Construct a 20m x 10m rectangular building roof (Area = 200 m^2)
    const p1 = origin;
    const p2 = localMetricToLatLng({ x: 20, y: 0 }, origin);
    const p3 = localMetricToLatLng({ x: 20, y: 10 }, origin);
    const p4 = localMetricToLatLng({ x: 0, y: 10 }, origin);

    const area = computePolygonAreaSqM([p1, p2, p3, p4]);
    expect(area).toBeCloseTo(200, 0);
  });

  it('calculates compass bearings accurately', () => {
    // Due North
    const northPt = localMetricToLatLng({ x: 0, y: 100 }, origin);
    expect(calculateBearingDeg(origin, northPt)).toBeCloseTo(0, 0);

    // Due East
    const eastPt = localMetricToLatLng({ x: 100, y: 0 }, origin);
    expect(calculateBearingDeg(origin, eastPt)).toBeCloseTo(90, 0);

    // Due South
    const southPt = localMetricToLatLng({ x: 0, y: -100 }, origin);
    expect(calculateBearingDeg(origin, southPt)).toBeCloseTo(180, 0);

    // Due West
    const westPt = localMetricToLatLng({ x: -100, y: 0 }, origin);
    expect(calculateBearingDeg(origin, westPt)).toBeCloseTo(270, 0);
  });

  it('converts azimuth degrees to accurate compass cardinal and intercardinal headings', () => {
    expect(getCompassHeading(0)).toBe('N');
    expect(getCompassHeading(360)).toBe('N');
    expect(getCompassHeading(45)).toBe('NE');
    expect(getCompassHeading(90)).toBe('E');
    expect(getCompassHeading(135)).toBe('SE');
    expect(getCompassHeading(180)).toBe('S');
    expect(getCompassHeading(225)).toBe('SW');
    expect(getCompassHeading(270)).toBe('W');
    expect(getCompassHeading(315)).toBe('NW');
  });

  it('computes accurate downslope vectors pointing downward along azimuth slope', () => {
    // Facing South (180°): downward slope vector points South (dx ≈ 0, dy ≈ -1)
    const southVec = computeDownwardTiltVector(180, 10);
    expect(southVec.x).toBeCloseTo(0, 3);
    expect(southVec.y).toBeCloseTo(-10, 3);

    // Facing North (0°): downward slope vector points North (dx ≈ 0, dy ≈ 1)
    const northVec = computeDownwardTiltVector(0, 10);
    expect(northVec.x).toBeCloseTo(0, 3);
    expect(northVec.y).toBeCloseTo(10, 3);

    // Facing East (90°): downward slope vector points East (dx ≈ 1, dy ≈ 0)
    const eastVec = computeDownwardTiltVector(90, 10);
    expect(eastVec.x).toBeCloseTo(10, 3);
    expect(eastVec.y).toBeCloseTo(0, 3);

    // Facing West (270°): downward slope vector points West (dx ≈ -1, dy ≈ 0)
    const westVec = computeDownwardTiltVector(270, 10);
    expect(westVec.x).toBeCloseTo(-10, 3);
    expect(westVec.y).toBeCloseTo(0, 3);
  });

  it('calculates shortest angular difference correctly across boundary wraps', () => {
    expect(angularDifferenceDeg(10, 20)).toBe(10);
    expect(angularDifferenceDeg(350, 10)).toBe(20);
    expect(angularDifferenceDeg(10, 350)).toBe(20);
    expect(angularDifferenceDeg(0, 180)).toBe(180);
    expect(angularDifferenceDeg(45, 225)).toBe(180);
  });

  it('calculates outward downslope azimuth perpendicular to clicked edge facing towards clicked side', () => {
    // 20m x 10m rectangular building roof:
    // SW = (0, 0), SE = (20, 0), NE = (20, 10), NW = (0, 10)
    // Centroid at (10, 5)
    const sw = origin;
    const se = localMetricToLatLng({ x: 20, y: 0 }, origin);
    const ne = localMetricToLatLng({ x: 20, y: 10 }, origin);
    const nw = localMetricToLatLng({ x: 0, y: 10 }, origin);
    const centroid = computePolygonCentroid([sw, se, ne, nw]);

    // 1. South edge (SW -> SE): downward slope must face South (180°)
    const southAzimuth = calculateEdgeDownslopeAzimuth(sw, se, centroid);
    expect(southAzimuth).toBe(180);

    // 2. East edge (SE -> NE): downward slope must face East (90°)
    const eastAzimuth = calculateEdgeDownslopeAzimuth(se, ne, centroid);
    expect(eastAzimuth).toBe(90);

    // 3. North edge (NE -> NW): downward slope must face North (0°)
    const northAzimuth = calculateEdgeDownslopeAzimuth(ne, nw, centroid);
    expect(northAzimuth).toBe(0);

    // 4. West edge (NW -> SW): downward slope must face West (270°)
    const westAzimuth = calculateEdgeDownslopeAzimuth(nw, sw, centroid);
    expect(westAzimuth).toBe(270);

    // 5. Inverted/Clockwise order on South edge (SE -> SW): must STILL face South (180°)
    const southAzimuthCw = calculateEdgeDownslopeAzimuth(se, sw, centroid);
    expect(southAzimuthCw).toBe(180);
  });

  it('finds the closest polygon edge to right-clicked coordinates', () => {
    const sw = origin;
    const se = localMetricToLatLng({ x: 20, y: 0 }, origin);
    const ne = localMetricToLatLng({ x: 20, y: 10 }, origin);
    const nw = localMetricToLatLng({ x: 0, y: 10 }, origin);
    const polygon = [sw, se, ne, nw];

    // Click near south edge: (10, 0.5)
    const clickNearSouth = localMetricToLatLng({ x: 10, y: 0.5 }, origin);
    const closestSouth = findClosestPolygonEdge(clickNearSouth, polygon);
    expect(closestSouth.edgeIndex).toBe(0); // sw -> se

    // Click near north edge: (10, 9.5)
    const clickNearNorth = localMetricToLatLng({ x: 10, y: 9.5 }, origin);
    const closestNorth = findClosestPolygonEdge(clickNearNorth, polygon);
    expect(closestNorth.edgeIndex).toBe(2); // ne -> nw
  });
});
