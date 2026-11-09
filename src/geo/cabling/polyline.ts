/**
 * Polyline length, nearest-point and distance-along helpers used for raceway cable routing.
 */
import { LatLngPoint } from '../../types/solar';
import { calculateGeodeticDistanceM, latLngToLocalMetric, localMetricToLatLng } from '../projection';

export interface ClosestPointOnPolyline {
  point: LatLngPoint;
  segmentIndex: number;
  segmentT: number;
  distanceM: number;
}

/**
 * Calculates total 2D path length along a polyline.
 */
export function calculatePolylineLength(polyline: LatLngPoint[]): number {
  if (polyline.length < 2) return 0;
  let len = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    len += calculateGeodeticDistanceM(polyline[i], polyline[i + 1]);
  }
  return Number(len.toFixed(2));
}

/**
 * Finds the nearest orthogonal tap-in point along a polyline to an arbitrary geographic point.
 */
export function findClosestPointOnPolyline(
  target: LatLngPoint,
  polyline: LatLngPoint[]
): ClosestPointOnPolyline {
  if (polyline.length === 0) {
    return { point: target, segmentIndex: -1, segmentT: 0, distanceM: 0 };
  }
  if (polyline.length === 1) {
    return {
      point: polyline[0],
      segmentIndex: 0,
      segmentT: 0,
      distanceM: calculateGeodeticDistanceM(target, polyline[0])
    };
  }

  const origin = polyline[0];
  const targetMetric = latLngToLocalMetric(target, origin);

  let minDistanceM = Infinity;
  let bestPoint = polyline[0];
  let bestSegmentIndex = 0;
  let bestT = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const pA = latLngToLocalMetric(polyline[i], origin);
    const pB = latLngToLocalMetric(polyline[i + 1], origin);

    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 1e-9) {
      t = ((targetMetric.x - pA.x) * dx + (targetMetric.y - pA.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }

    const projX = pA.x + t * dx;
    const projY = pA.y + t * dy;
    const distSq = (targetMetric.x - projX) ** 2 + (targetMetric.y - projY) ** 2;
    const dist = Math.sqrt(distSq);

    if (dist < minDistanceM) {
      minDistanceM = dist;
      bestSegmentIndex = i;
      bestT = t;
      bestPoint = localMetricToLatLng({ x: projX, y: projY }, origin);
    }
  }

  return {
    point: bestPoint,
    segmentIndex: bestSegmentIndex,
    segmentT: bestT,
    distanceM: Number(minDistanceM.toFixed(2))
  };
}

/**
 * Calculates the metric distance along a polyline from a tap-in point (segmentIndex, segmentT)
 * to either the start or end of the polyline.
 */
export function calculateDistanceAlongPolyline(
  polyline: LatLngPoint[],
  segmentIndex: number,
  segmentT: number,
  direction: 'to_end' | 'to_start'
): number {
  if (polyline.length < 2 || segmentIndex < 0 || segmentIndex >= polyline.length - 1) {
    return 0;
  }

  const segDist = calculateGeodeticDistanceM(polyline[segmentIndex], polyline[segmentIndex + 1]);
  let totalAlongM = 0;

  if (direction === 'to_end') {
    totalAlongM += (1 - segmentT) * segDist;
    for (let i = segmentIndex + 1; i < polyline.length - 1; i++) {
      totalAlongM += calculateGeodeticDistanceM(polyline[i], polyline[i + 1]);
    }
  } else {
    totalAlongM += segmentT * segDist;
    for (let i = segmentIndex - 1; i >= 0; i--) {
      totalAlongM += calculateGeodeticDistanceM(polyline[i], polyline[i + 1]);
    }
  }

  return Number(totalAlongM.toFixed(2));
}
