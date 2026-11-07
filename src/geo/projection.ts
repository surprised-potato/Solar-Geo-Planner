import { LatLngPoint, MetricPoint } from '../types/solar';

// WGS-84 Ellipsoid constants
const WGS84_A = 6378137.0; // semi-major axis (meters)
const WGS84_E2 = 0.00669437999014; // first eccentricity squared

/**
 * Computes radii of curvature at a given latitude in radians.
 */
function getRadiiOfCurvature(latRad: number): { M: number; N: number } {
  const sinLat = Math.sin(latRad);
  const sin2Lat = sinLat * sinLat;
  const denom = Math.sqrt(1 - WGS84_E2 * sin2Lat);

  const M = (WGS84_A * (1 - WGS84_E2)) / (denom * denom * denom); // Meridional radius
  const N = WGS84_A / denom; // Prime vertical radius
  return { M, N };
}

/**
 * Projects a geographic coordinate (lat, lng) to a local metric tangent plane (x, y in meters)
 * centered at the given origin.
 * +x = East (meters)
 * +y = North (meters)
 */
export function latLngToLocalMetric(point: LatLngPoint, origin: LatLngPoint): MetricPoint {
  const originLatRad = (origin.lat * Math.PI) / 180;
  const { M, N } = getRadiiOfCurvature(originLatRad);

  const dLatRad = ((point.lat - origin.lat) * Math.PI) / 180;
  const dLngRad = ((point.lng - origin.lng) * Math.PI) / 180;

  const y = dLatRad * M;
  const x = dLngRad * N * Math.cos(originLatRad);

  return { x, y };
}

/**
 * Inverse projects a local metric coordinate (x, y in meters) back to geographic (lat, lng).
 */
export function localMetricToLatLng(metric: MetricPoint, origin: LatLngPoint): LatLngPoint {
  const originLatRad = (origin.lat * Math.PI) / 180;
  const { M, N } = getRadiiOfCurvature(originLatRad);

  const dLatRad = metric.y / M;
  const dLngRad = metric.x / (N * Math.cos(originLatRad));

  const lat = origin.lat + (dLatRad * 180) / Math.PI;
  const lng = origin.lng + (dLngRad * 180) / Math.PI;

  return { lat, lng };
}

/**
 * Computes the geographic centroid of a polygon.
 */
export function computePolygonCentroid(vertices: LatLngPoint[]): LatLngPoint {
  if (vertices.length === 0) return { lat: 0, lng: 0 };
  let sumLat = 0;
  let sumLng = 0;
  for (const v of vertices) {
    sumLat += v.lat;
    sumLng += v.lng;
  }
  return {
    lat: sumLat / vertices.length,
    lng: sumLng / vertices.length
  };
}

/**
 * Computes the area of a polygon in square meters using the local metric tangent plane.
 */
export function computePolygonAreaSqM(vertices: LatLngPoint[]): number {
  if (vertices.length < 3) return 0;
  const origin = vertices[0];
  const metricPts = vertices.map(v => latLngToLocalMetric(v, origin));

  let area = 0;
  const n = metricPts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += metricPts[i].x * metricPts[j].y;
    area -= metricPts[j].x * metricPts[i].y;
  }
  return Math.abs(area) / 2.0;
}

/**
 * Calculates geographic bearing (0° to 360° clockwise from True North) from point A to point B.
 */
export function calculateBearingDeg(from: LatLngPoint, to: LatLngPoint): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Computes horizontal ground distance in meters between two geographic coordinates.
 */
export function calculateGeodeticDistanceM(p1: LatLngPoint, p2: LatLngPoint): number {
  const metric = latLngToLocalMetric(p2, p1);
  return Math.sqrt(metric.x * metric.x + metric.y * metric.y);
}

/**
 * Computes 3D Euclidean distance in meters taking elevation difference into account.
 */
export function calculate3DDistanceM(p1: LatLngPoint, p2: LatLngPoint, deltaElevationM: number = 0): number {
  const d2D = calculateGeodeticDistanceM(p1, p2);
  return Math.sqrt(d2D * d2D + deltaElevationM * deltaElevationM);
}

/**
 * Converts degree heading (0° - 360°) to cardinal / intercardinal compass direction string.
 */
export function getCompassHeading(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  const directions = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
  ];
  const index = Math.round(normalized / 22.5) % 16;
  return directions[index];
}

/**
 * Computes the downslope metric vector along which gravity / tilt falls, from high ridge to low eave.
 * In solar array geometry, panels face towards the azimuth direction, so the downward slope is parallel to azimuth.
 */
export function computeDownwardTiltVector(azimuthDeg: number, lengthM: number = 1.0): MetricPoint {
  const rad = (azimuthDeg * Math.PI) / 180;
  return {
    x: Math.sin(rad) * lengthM,
    y: Math.cos(rad) * lengthM
  };
}

/**
 * Calculates the shortest angular difference in degrees between two bearings (0° to 180°).
 */
export function angularDifferenceDeg(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/**
 * Calculates the azimuth angle (0° to 360°) perpendicular to an edge (v1 -> v2)
 * oriented outward from the polygon centroid so that the downward slope faces towards the clicked side.
 */
export function calculateEdgeDownslopeAzimuth(
  v1: LatLngPoint,
  v2: LatLngPoint,
  centroid: LatLngPoint
): number {
  const edgeBearing = calculateBearingDeg(v1, v2);
  const cand1 = (edgeBearing + 90) % 360;
  const cand2 = (edgeBearing - 90 + 360) % 360;

  const midPoint: LatLngPoint = {
    lat: (v1.lat + v2.lat) / 2,
    lng: (v1.lng + v2.lng) / 2
  };

  const bearingFromCentroid = calculateBearingDeg(centroid, midPoint);

  const diff1 = angularDifferenceDeg(cand1, bearingFromCentroid);
  const diff2 = angularDifferenceDeg(cand2, bearingFromCentroid);

  return Math.round(diff1 <= diff2 ? cand1 : cand2) % 360;
}

/**
 * Finds the edge of a polygon closest to a given geographic point (e.g. right-clicked point).
 */
export function findClosestPolygonEdge(
  point: LatLngPoint,
  vertices: LatLngPoint[]
): { edgeIndex: number; v1: LatLngPoint; v2: LatLngPoint; distanceM: number } {
  if (vertices.length < 2) {
    return {
      edgeIndex: 0,
      v1: vertices[0] || point,
      v2: vertices[0] || point,
      distanceM: 0
    };
  }

  const pMetric = latLngToLocalMetric(point, vertices[0]);
  let minDistanceM = Infinity;
  let closestEdge = {
    edgeIndex: 0,
    v1: vertices[0],
    v2: vertices[1],
    distanceM: Infinity
  };

  for (let i = 0; i < vertices.length; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % vertices.length];
    const aMetric = latLngToLocalMetric(v1, vertices[0]);
    const bMetric = latLngToLocalMetric(v2, vertices[0]);

    const abx = bMetric.x - aMetric.x;
    const aby = bMetric.y - aMetric.y;
    const abLenSq = abx * abx + aby * aby;

    let distM: number;
    if (abLenSq < 1e-8) {
      const dx = pMetric.x - aMetric.x;
      const dy = pMetric.y - aMetric.y;
      distM = Math.sqrt(dx * dx + dy * dy);
    } else {
      const apx = pMetric.x - aMetric.x;
      const apy = pMetric.y - aMetric.y;
      let t = (apx * abx + apy * aby) / abLenSq;
      t = Math.max(0, Math.min(1, t));
      const projX = aMetric.x + t * abx;
      const projY = aMetric.y + t * aby;
      const dx = pMetric.x - projX;
      const dy = pMetric.y - projY;
      distM = Math.sqrt(dx * dx + dy * dy);
    }

    if (distM < minDistanceM) {
      minDistanceM = distM;
      closestEdge = {
        edgeIndex: i,
        v1,
        v2,
        distanceM: distM
      };
    }
  }

  return closestEdge;
}
