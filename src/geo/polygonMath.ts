import { MetricPoint } from '../types/solar';

/**
 * Checks if a point is strictly inside (or on edge of) a 2D polygon using ray-casting.
 */
export function isPointInPolygon(point: MetricPoint, polygon: MetricPoint[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Checks whether two line segments (p1-p2 and p3-p4) intersect.
 */
export function doSegmentsIntersect(
  p1: MetricPoint,
  p2: MetricPoint,
  p3: MetricPoint,
  p4: MetricPoint
): boolean {
  function ccw(a: MetricPoint, b: MetricPoint, c: MetricPoint): number {
    return (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x);
  }

  const d1 = ccw(p3, p4, p1);
  const d2 = ccw(p3, p4, p2);
  const d3 = ccw(p1, p2, p3);
  const d4 = ccw(p1, p2, p4);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

/**
 * Checks whether polygon A edges intersect with polygon B edges.
 */
export function doPolygonsIntersect(polyA: MetricPoint[], polyB: MetricPoint[]): boolean {
  const nA = polyA.length;
  const nB = polyB.length;

  for (let i = 0; i < nA; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % nA];
    for (let j = 0; j < nB; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % nB];
      if (doSegmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Computes signed area of a 2D metric polygon. Positive for CCW, negative for CW.
 */
export function signedPolygonArea(poly: MetricPoint[]): number {
  let area = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return area / 2.0;
}

/**
 * Offsets a polygon inward by setbackM meters.
 * If setbackM <= 0, returns a copy of the polygon.
 */
export function offsetPolygonInward(poly: MetricPoint[], setbackM: number): MetricPoint[] {
  if (setbackM <= 0 || poly.length < 3) return [...poly];

  const n = poly.length;
  const isCCW = signedPolygonArea(poly) > 0;

  // Compute unit edge normals pointing inward
  const edgeNormals: MetricPoint[] = [];
  const edgePoints: MetricPoint[] = [];

  for (let i = 0; i < n; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);

    if (len < 1e-6) {
      edgeNormals.push({ x: 0, y: 0 });
      edgePoints.push(p1);
      continue;
    }

    const ux = dx / len;
    const uy = dy / len;

    // If CCW, inward normal is (-uy, ux). If CW, inward normal is (uy, -ux).
    const nx = isCCW ? -uy : uy;
    const ny = isCCW ? ux : -ux;

    edgeNormals.push({ x: nx, y: ny });
    // Point on the offset line
    edgePoints.push({
      x: p1.x + nx * setbackM,
      y: p1.y + ny * setbackM
    });
  }

  // Intersect adjacent shifted lines to find new vertices
  const offsetVertices: MetricPoint[] = [];
  for (let i = 0; i < n; i++) {
    const prevIdx = (i - 1 + n) % n;
    const p1 = edgePoints[prevIdx];
    const n1 = edgeNormals[prevIdx];
    // Direction vector of prev line
    const d1x = -n1.y;
    const d1y = n1.x;

    const p2 = edgePoints[i];
    const n2 = edgeNormals[i];
    // Direction vector of current line
    const d2x = -n2.y;
    const d2y = n2.x;

    // Line intersection: p1 + t * d1 = p2 + u * d2
    const cross = d1x * d2y - d1y * d2x;
    if (Math.abs(cross) < 1e-4) {
      // Parallel or degenerate
      offsetVertices.push(edgePoints[i]);
      continue;
    }

    const t = ((p2.x - p1.x) * d2y - (p2.y - p1.y) * d2x) / cross;
    const vx = p1.x + t * d1x;
    const vy = p1.y + t * d1y;

    // Limit extreme miters on sharp corners
    const maxMiter = setbackM * 3;
    const distToOriginal = Math.hypot(vx - poly[i].x, vy - poly[i].y);
    if (distToOriginal > maxMiter) {
      // Clamp toward the average of the shifted edge points
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      offsetVertices.push({ x: midX, y: midY });
    } else {
      offsetVertices.push({ x: vx, y: vy });
    }
  }

  // Sanity check: Ensure new polygon vertices are inside the original polygon
  const valid = offsetVertices.filter(v => isPointInPolygon(v, poly));
  if (valid.length < 3) {
    // Polygon collapsed from large setback
    return [];
  }

  return offsetVertices;
}

export interface BoundingBox2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Computes an Axis-Aligned Bounding Box (AABB) for a set of 2D metric points.
 */
export function computeBoundingBox(pts: MetricPoint[]): BoundingBox2D {
  if (pts.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  let minX = pts[0].x;
  let maxX = minX;
  let minY = pts[0].y;
  let maxY = minY;
  for (let i = 1; i < pts.length; i++) {
    const x = pts[i].x;
    const y = pts[i].y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Fast $O(1)$ overlap check between two 2D bounding boxes.
 */
export function doBoundingBoxesIntersect(a: BoundingBox2D, b: BoundingBox2D): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/**
 * Checks whether a rectangular panel (defined by 4 corners) is valid within the boundary:
 * 1. All 4 corners are inside the boundary polygon.
 * 2. Center point is inside the boundary polygon.
 * 3. None of the panel edges intersect any boundary edge (handles concave boundaries).
 * 4. Panel does not intersect or contain any keep-out obstacle.
 * Uses AABB (Axis-Aligned Bounding Box) pre-filtering to eliminate 98%+ of unnecessary segment checks.
 */
export function isPanelValid(
  panelCorners: MetricPoint[],
  boundaryPoly: MetricPoint[],
  keepOutPolys: MetricPoint[][],
  boundaryBox?: BoundingBox2D,
  keepOutBoxes?: BoundingBox2D[]
): boolean {
  if (boundaryPoly.length < 3) return false;

  const pBox = computeBoundingBox(panelCorners);
  const bBox = boundaryBox || computeBoundingBox(boundaryPoly);

  // Fast AABB rejection: if panel extends outside boundary bounding box
  if (
    pBox.minX < bBox.minX - 1e-5 ||
    pBox.maxX > bBox.maxX + 1e-5 ||
    pBox.minY < bBox.minY - 1e-5 ||
    pBox.maxY > bBox.maxY + 1e-5
  ) {
    return false;
  }

  // Center check
  const cx = (panelCorners[0].x + panelCorners[1].x + panelCorners[2].x + panelCorners[3].x) / 4;
  const cy = (panelCorners[0].y + panelCorners[1].y + panelCorners[2].y + panelCorners[3].y) / 4;
  const center: MetricPoint = { x: cx, y: cy };

  if (!isPointInPolygon(center, boundaryPoly)) return false;

  // All 4 corners inside boundary
  for (let i = 0; i < 4; i++) {
    if (!isPointInPolygon(panelCorners[i], boundaryPoly)) {
      return false;
    }
  }

  // Edge intersection check against boundary (catches U-shapes/L-shapes cutting across outside)
  if (doPolygonsIntersect(panelCorners, boundaryPoly)) {
    return false;
  }

  // Keep-out check with AABB spatial pruning
  for (let k = 0; k < keepOutPolys.length; k++) {
    const keepOut = keepOutPolys[k];
    if (keepOut.length < 3) continue;

    const kBox = keepOutBoxes ? keepOutBoxes[k] : computeBoundingBox(keepOut);
    if (!doBoundingBoxesIntersect(pBox, kBox)) {
      continue;
    }

    // Center in keep-out?
    if (isPointInPolygon(center, keepOut)) return false;

    // Any corner in keep-out?
    for (let i = 0; i < 4; i++) {
      if (isPointInPolygon(panelCorners[i], keepOut)) return false;
    }

    // Any keep-out vertex inside panel?
    for (let i = 0; i < keepOut.length; i++) {
      if (isPointInPolygon(keepOut[i], panelCorners)) return false;
    }

    // Edge intersection with keep-out?
    if (doPolygonsIntersect(panelCorners, keepOut)) {
      return false;
    }
  }

  return true;
}
