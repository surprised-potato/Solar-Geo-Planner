import { LatLngPoint, SolarPanelObject, ArrayZone, SolarSystem, RacewayConfig, StringCableLength, SystemCableSummary, StringTraverseDirection } from '../types/solar';
import { calculateGeodeticDistanceM, calculate3DDistanceM, latLngToLocalMetric, localMetricToLatLng } from './projection';

export interface CableCalculationOptions {
  moduleSlackM?: number;       // default 0.4m per module connection
  routingType?: 'riser_plus_ground' | 'direct_3d'; // default riser_plus_ground
}

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

/**
 * Determines whether the exit towards the inverter is at the end (index length-1) or start (index 0)
 * of the homerun polyline.
 */
export function getHomerunExitDirection(
  polyline: LatLngPoint[],
  inverterPoint: LatLngPoint | null
): { exitEnd: 'end' | 'start'; exitPoint: LatLngPoint; distanceToInverterM: number } {
  if (polyline.length === 0) {
    return { exitEnd: 'end', exitPoint: { lat: 0, lng: 0 }, distanceToInverterM: 0 };
  }
  const startPt = polyline[0];
  const endPt = polyline[polyline.length - 1];

  if (!inverterPoint) {
    return { exitEnd: 'end', exitPoint: endPt, distanceToInverterM: 0 };
  }

  const distFromStart = calculateGeodeticDistanceM(startPt, inverterPoint);
  const distFromEnd = calculateGeodeticDistanceM(endPt, inverterPoint);

  if (distFromStart < distFromEnd) {
    return { exitEnd: 'start', exitPoint: startPt, distanceToInverterM: distFromStart };
  } else {
    return { exitEnd: 'end', exitPoint: endPt, distanceToInverterM: distFromEnd };
  }
}

/**
 * Calculates geolocational string cable lengths including module-to-module links,
 * homerun distances to the Inverter Power House, and array-to-inverter elevation differences.
 * Supports both dedicated array raceways and shared system-wide homerun trunks.
 */
export function calculateStringCableLengths(
  panels: SolarPanelObject[],
  zones: Map<string, ArrayZone>,
  inverterPoint: LatLngPoint | null = null,
  options: CableCalculationOptions = {},
  systems?: Map<string, SolarSystem>
): StringCableLength[] {
  const moduleSlackM = options.moduleSlackM ?? 0.4;
  const activePanels = panels.filter(p => p.active && p.stringId);

  // Group by systemId and stringId so strings from different systems are never conflated
  const stringMap = new Map<string, SolarPanelObject[]>();
  for (const p of activePanels) {
    if (!p.stringId) continue;
    const groupKey = `${p.systemId || ''}::${p.stringId}`;
    if (!stringMap.has(groupKey)) {
      stringMap.set(groupKey, []);
    }
    stringMap.get(groupKey)!.push(p);
  }

  const results: StringCableLength[] = [];

  for (const [, strPanels] of stringMap.entries()) {
    // Sort panels in string order
    strPanels.sort((a, b) => (a.stringOrder ?? 0) - (b.stringOrder ?? 0));
    if (strPanels.length === 0) continue;

    const startPanel = strPanels[0];
    const endPanel = strPanels[strPanels.length - 1];
    const systemId = startPanel.systemId;
    const zoneId = startPanel.zoneId;
    const stringId = startPanel.stringId!;
    const zone = zones.get(zoneId);
    const system = systems?.get(systemId);
    const effectiveInverterPoint = system?.inverterLocation ?? inverterPoint;

    // Check for dedicated zone raceway OR shared system homerun trunk
    // Strictly isolate raceways: An array or system homerun MUST match this string's systemId
    const zoneRaceway = (zone && zone.systemId === systemId && (!zone.raceway?.systemId || zone.raceway.systemId === systemId))
      ? zone.raceway
      : null;
    const sharedHomerun = (system && (!system.homerunRaceway?.systemId || system.homerunRaceway.systemId === systemId))
      ? system.homerunRaceway
      : null;
    const isShared = !zoneRaceway && Boolean(sharedHomerun && sharedHomerun.path && sharedHomerun.path.length >= 2);
    const raceway: RacewayConfig | undefined = (zoneRaceway || sharedHomerun) ?? undefined;
    const hasRaceway = Boolean(raceway && raceway.path && raceway.path.length >= 2);

    // Vertical elevation change is taken through the raceway if present, else fallback
    const effectiveElevationM = hasRaceway
      ? (raceway?.elevationChangeM ?? 0)
      : (zone?.elevationDeltaM ?? 0);

    // 1. Calculate intra-string cabling (module to module)
    let intraStringLengthM = 0;
    for (let i = 0; i < strPanels.length - 1; i++) {
      const p1 = strPanels[i].centroid;
      const p2 = strPanels[i + 1].centroid;
      const dist = calculateGeodeticDistanceM(p1, p2);
      intraStringLengthM += dist + moduleSlackM;
    }

    // 2. Calculate homerun cabling
    let homerunPositiveM = 0;
    let homerunNegativeM = 0;
    let direct3DDistanceM = 0;
    let totalHomerunM = 0;
    let racewayPathLengthM = 0;
    let leadToRacewayPosM = 0;
    let leadToRacewayNegM = 0;
    let tapPointPos: LatLngPoint | undefined;
    let tapPointNeg: LatLngPoint | undefined;

    if (hasRaceway && raceway && raceway.path.length >= 2) {
      racewayPathLengthM = calculatePolylineLength(raceway.path);
      const riserDrop = Math.abs(effectiveElevationM);

      if (isShared) {
        // Auto-connect into shared homerun trunk of this system:
        // Project start and end panel centroids to nearest point along the homerun trunk
        const exitInfo = getHomerunExitDirection(raceway.path, effectiveInverterPoint);
        const posTap = findClosestPointOnPolyline(startPanel.centroid, raceway.path);
        const negTap = findClosestPointOnPolyline(endPanel.centroid, raceway.path);

        tapPointPos = posTap.point;
        tapPointNeg = negTap.point;
        leadToRacewayPosM = posTap.distanceM;
        leadToRacewayNegM = negTap.distanceM;

        const posTrunk = calculateDistanceAlongPolyline(
          raceway.path,
          posTap.segmentIndex,
          posTap.segmentT,
          exitInfo.exitEnd === 'start' ? 'to_start' : 'to_end'
        );
        const negTrunk = calculateDistanceAlongPolyline(
          raceway.path,
          negTap.segmentIndex,
          negTap.segmentT,
          exitInfo.exitEnd === 'start' ? 'to_start' : 'to_end'
        );

        homerunPositiveM = Number((leadToRacewayPosM + posTrunk + exitInfo.distanceToInverterM + riserDrop).toFixed(2));
        homerunNegativeM = Number((leadToRacewayNegM + negTrunk + exitInfo.distanceToInverterM + riserDrop).toFixed(2));
        totalHomerunM = Number((homerunPositiveM + homerunNegativeM).toFixed(2));
      } else {
        // Dedicated array raceway (traditional entrance at path[0])
        const racewayEnd = raceway.path[raceway.path.length - 1];
        const rawEndToInv = effectiveInverterPoint ? calculateGeodeticDistanceM(racewayEnd, effectiveInverterPoint) : 0;
        // Distance sanity check: Solar DC raceway to inverter should never exceed 5km (cross-continent leakage safeguard)
        const endToInv = rawEndToInv > 5000 ? 0 : rawEndToInv;
        const commonRacewayRun = racewayPathLengthM + endToInv + riserDrop;

        leadToRacewayPosM = Number(calculateGeodeticDistanceM(startPanel.centroid, raceway.path[0]).toFixed(2));
        leadToRacewayNegM = Number(calculateGeodeticDistanceM(endPanel.centroid, raceway.path[0]).toFixed(2));
        tapPointPos = raceway.path[0];
        tapPointNeg = raceway.path[0];

        homerunPositiveM = Number((leadToRacewayPosM + commonRacewayRun).toFixed(2));
        homerunNegativeM = Number((leadToRacewayNegM + commonRacewayRun).toFixed(2));
        totalHomerunM = Number((homerunPositiveM + homerunNegativeM).toFixed(2));
      }

      if (effectiveInverterPoint) {
        const dPos3D = calculate3DDistanceM(startPanel.centroid, effectiveInverterPoint, effectiveElevationM);
        const dNeg3D = calculate3DDistanceM(endPanel.centroid, effectiveInverterPoint, effectiveElevationM);
        direct3DDistanceM = Number(((dPos3D + dNeg3D) / 2).toFixed(2));
      }
    } else if (effectiveInverterPoint) {
      // Direct homerun fallback when no raceway polyline is drawn in this system
      const dPos2D = calculateGeodeticDistanceM(startPanel.centroid, effectiveInverterPoint);
      const dNeg2D = calculateGeodeticDistanceM(endPanel.centroid, effectiveInverterPoint);

      // Distance sanity check: Solar DC homerun should not exceed 5km.
      // If > 5km, it indicates cross-project or continental coordinate mismatch (e.g. SF vs Sta. Ana).
      if (dPos2D > 5000 || dNeg2D > 5000) {
        homerunPositiveM = 15;
        homerunNegativeM = 15;
        totalHomerunM = 30;
        direct3DDistanceM = 15;
      } else {
        const dPos3D = calculate3DDistanceM(startPanel.centroid, effectiveInverterPoint, effectiveElevationM);
        const dNeg3D = calculate3DDistanceM(endPanel.centroid, effectiveInverterPoint, effectiveElevationM);
        direct3DDistanceM = Number(((dPos3D + dNeg3D) / 2).toFixed(2));

        // Realistic wiring route: horizontal ground/tray run + vertical riser drop down structure
        const riserDrop = Math.abs(effectiveElevationM);
        homerunPositiveM = Number((dPos2D + riserDrop).toFixed(2));
        homerunNegativeM = Number((dNeg2D + riserDrop).toFixed(2));
        totalHomerunM = Number((homerunPositiveM + homerunNegativeM).toFixed(2));
      }
    }

    const totalStringCableM = Number((intraStringLengthM + totalHomerunM).toFixed(2));

    results.push({
      stringId,
      systemId,
      zoneId,
      panelCount: strPanels.length,
      intraStringLengthM: Number(intraStringLengthM.toFixed(2)),
      homerunPositiveM,
      homerunNegativeM,
      elevationDeltaM: effectiveElevationM,
      direct3DDistanceM,
      totalHomerunM,
      totalStringCableM,
      inverterPoint: effectiveInverterPoint,
      hasRaceway,
      racewayPathLengthM,
      leadToRacewayPosM,
      leadToRacewayNegM,
      startPanelId: startPanel.id,
      endPanelId: endPanel.id,
      startPoint: startPanel.centroid,
      endPoint: endPanel.centroid,
      tapPointPos,
      tapPointNeg,
      isSharedHomerun: isShared
    });
  }

  // Sort by string ID for deterministic listing
  results.sort((a, b) => a.stringId.localeCompare(b.stringId));
  return results;
}

/**
 * Summarizes DC cabling for an entire solar system.
 */
export function summarizeSystemCabling(
  systemId: string,
  stringCables: StringCableLength[],
  inverterPoint: LatLngPoint | null = null,
  inverterElevationM: number = 0
): SystemCableSummary {
  const sysStrings = stringCables.filter(s => s.systemId === systemId);
  const totalStrings = sysStrings.length;

  let totalIntraStringM = 0;
  let totalHomerunM = 0;
  let totalElevationRiserM = 0;
  let totalCableLengthM = 0;

  for (const s of sysStrings) {
    totalIntraStringM += s.intraStringLengthM;
    totalHomerunM += s.totalHomerunM;
    totalElevationRiserM += 2 * Math.abs(s.elevationDeltaM);
    totalCableLengthM += s.totalStringCableM;
  }

  const avgStringCableLengthM = totalStrings > 0 ? Number((totalCableLengthM / totalStrings).toFixed(2)) : 0;

  const uniqueZones = new Set<string>();
  let totalRacewayLengthM = 0;
  let hasSharedHomerunCounted = false;
  for (const s of sysStrings) {
    if (s.hasRaceway && s.racewayPathLengthM) {
      if (s.isSharedHomerun) {
        if (!hasSharedHomerunCounted) {
          hasSharedHomerunCounted = true;
          totalRacewayLengthM += s.racewayPathLengthM;
        }
      } else if (!uniqueZones.has(s.zoneId)) {
        uniqueZones.add(s.zoneId);
        totalRacewayLengthM += s.racewayPathLengthM;
      }
    }
  }

  return {
    systemId,
    inverterLocation: inverterPoint,
    inverterElevationM,
    totalStrings,
    totalIntraStringM: Number(totalIntraStringM.toFixed(2)),
    totalHomerunM: Number(totalHomerunM.toFixed(2)),
    totalElevationRiserM: Number(totalElevationRiserM.toFixed(2)),
    totalCableLengthM: Number(totalCableLengthM.toFixed(2)),
    avgStringCableLengthM,
    totalRacewayLengthM: Number(totalRacewayLengthM.toFixed(2)),
    strings: sysStrings
  };
}

/**
 * Determines whether the primary long side of a panel collection is along columns (U) or rows (V).
 */
export function getArrayLongSideAxis(
  panels: SolarPanelObject[],
  azimuthDeg: number = 180
): 'columns' | 'rows' {
  if (panels.length <= 1) return 'columns';

  let sumLat = 0;
  let sumLng = 0;
  for (const p of panels) {
    sumLat += p.centroid.lat;
    sumLng += p.centroid.lng;
  }
  const centroid = { lat: sumLat / panels.length, lng: sumLng / panels.length };

  const azRad = (azimuthDeg * Math.PI) / 180;
  const sinA = Math.sin(azRad);
  const cosA = Math.cos(azRad);

  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (const p of panels) {
    const m = latLngToLocalMetric(p.centroid, centroid);
    const u = m.x * cosA - m.y * sinA;
    const v = m.x * sinA + m.y * cosA;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  const spanU = maxU - minU;
  const spanV = maxV - minV;

  if (Math.abs(spanU - spanV) < 0.2) {
    const minCol = Math.min(...panels.map(p => p.colIndex));
    const maxCol = Math.max(...panels.map(p => p.colIndex));
    const minRow = Math.min(...panels.map(p => p.rowIndex));
    const maxRow = Math.max(...panels.map(p => p.rowIndex));
    return (maxCol - minCol) >= (maxRow - minRow) ? 'columns' : 'rows';
  }

  return spanU >= spanV ? 'columns' : 'rows';
}

/**
 * Sorts panels into an optimal serpentine circuit path.
 * When preference is 'short_side' (default), the string path traverses across
 * the short dimension of the array first, rather than the long side.
 */
export function sortPanelsForStringing(
  panels: SolarPanelObject[],
  azimuthDeg: number = 180,
  preference: StringTraverseDirection | 'auto' = 'short_side'
): SolarPanelObject[] {
  if (panels.length <= 1) return [...panels];

  const longAxis = getArrayLongSideAxis(panels, azimuthDeg);

  let alongColumns = true;
  if (preference === 'rows') {
    alongColumns = true;
  } else if (preference === 'columns') {
    alongColumns = false;
  } else if (preference === 'long_side') {
    alongColumns = longAxis === 'columns';
  } else {
    // 'short_side' (default) or 'auto'
    alongColumns = longAxis === 'rows';
  }

  if (alongColumns) {
    // Traverse rows sequentially, snaking across columns
    const rowMap = new Map<number, SolarPanelObject[]>();
    for (const p of panels) {
      if (!rowMap.has(p.rowIndex)) {
        rowMap.set(p.rowIndex, []);
      }
      rowMap.get(p.rowIndex)!.push(p);
    }

    const rowIndices = Array.from(rowMap.keys()).sort((a, b) => a - b);
    const sorted: SolarPanelObject[] = [];
    let lastPanel: SolarPanelObject | null = null;

    for (let r = 0; r < rowIndices.length; r++) {
      const rIdx = rowIndices[r];
      const rPanels = rowMap.get(rIdx)!;
      if (rPanels.length === 0) continue;

      if (!lastPanel) {
        // First row: sort left-to-right (colIndex ascending)
        rPanels.sort((a, b) => a.colIndex - b.colIndex);
      } else {
        // Determine whether ascending or descending starts closer to lastPanel
        const asc = [...rPanels].sort((a, b) => a.colIndex - b.colIndex);
        const desc = [...rPanels].sort((a, b) => b.colIndex - a.colIndex);
        const distAsc = lastPanel.centroid && asc[0].centroid
          ? calculateGeodeticDistanceM(lastPanel.centroid, asc[0].centroid)
          : Math.abs(asc[0].colIndex - lastPanel.colIndex);
        const distDesc = lastPanel.centroid && desc[0].centroid
          ? calculateGeodeticDistanceM(lastPanel.centroid, desc[0].centroid)
          : Math.abs(desc[0].colIndex - lastPanel.colIndex);

        if (distDesc < distAsc) {
          rPanels.splice(0, rPanels.length, ...desc);
        } else {
          rPanels.splice(0, rPanels.length, ...asc);
        }
      }

      sorted.push(...rPanels);
      lastPanel = sorted[sorted.length - 1];
    }

    return sorted;
  } else {
    // Traverse columns sequentially, snaking down/up rows
    const colMap = new Map<number, SolarPanelObject[]>();
    for (const p of panels) {
      if (!colMap.has(p.colIndex)) {
        colMap.set(p.colIndex, []);
      }
      colMap.get(p.colIndex)!.push(p);
    }

    const colIndices = Array.from(colMap.keys()).sort((a, b) => a - b);
    const sorted: SolarPanelObject[] = [];
    let lastPanel: SolarPanelObject | null = null;

    for (let c = 0; c < colIndices.length; c++) {
      const cIdx = colIndices[c];
      const cPanels = colMap.get(cIdx)!;
      if (cPanels.length === 0) continue;

      if (!lastPanel) {
        // First column: sort top-to-bottom (rowIndex ascending)
        cPanels.sort((a, b) => a.rowIndex - b.rowIndex);
      } else {
        const asc = [...cPanels].sort((a, b) => a.rowIndex - b.rowIndex);
        const desc = [...cPanels].sort((a, b) => b.rowIndex - a.rowIndex);
        const distAsc = lastPanel.centroid && asc[0].centroid
          ? calculateGeodeticDistanceM(lastPanel.centroid, asc[0].centroid)
          : Math.abs(asc[0].rowIndex - lastPanel.rowIndex);
        const distDesc = lastPanel.centroid && desc[0].centroid
          ? calculateGeodeticDistanceM(lastPanel.centroid, desc[0].centroid)
          : Math.abs(desc[0].rowIndex - lastPanel.rowIndex);

        if (distDesc < distAsc) {
          cPanels.splice(0, cPanels.length, ...desc);
        } else {
          cPanels.splice(0, cPanels.length, ...asc);
        }
      }

      sorted.push(...cPanels);
      lastPanel = sorted[sorted.length - 1];
    }

    return sorted;
  }
}

/**
 * Groups panels into physically contiguous subarrays/blocks.
 * Panels in the same table (for ground mounts) or immediate spatial neighbors
 * with inter-panel distance <= adjacent threshold are clustered together.
 * Clusters are returned sorted in logical spatial layout order.
 */
export function clusterContiguousPanels(
  panels: SolarPanelObject[],
  azimuthDeg: number = 180
): SolarPanelObject[][] {
  if (panels.length <= 1) return panels.length === 1 ? [[panels[0]]] : [];

  const n = panels.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(i: number): number {
    if (parent[i] === i) return i;
    return (parent[i] = find(parent[i]));
  }
  function union(i: number, j: number): void {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parent[rootI] = rootJ;
  }

  // 1. Group by tableId if available (e.g. ground mount tables)
  const tableMap = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const tid = panels[i].tableId;
    if (tid) {
      if (!tableMap.has(tid)) tableMap.set(tid, []);
      tableMap.get(tid)!.push(i);
    }
  }
  for (const indices of tableMap.values()) {
    for (let k = 1; k < indices.length; k++) {
      union(indices[0], indices[k]);
    }
  }

  // 2. Spatial & grid neighbor clustering
  const idToIndex = new Map<string, number>();
  const gridMap = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    idToIndex.set(panels[i].id, i);
    gridMap.set(`${panels[i].rowIndex}_${panels[i].colIndex}`, i);
  }

  for (let i = 0; i < n; i++) {
    const p1 = panels[i];
    const maxDim = Math.max(p1.lengthM || 2.4, p1.widthM || 1.134);
    const maxNeighborDistM = maxDim * 1.75; // comfortably covers intra-cluster pitch & clamp spacing

    // Check explicit neighbors (north, south, east, west)
    if (p1.neighbors) {
      for (const neighborId of [p1.neighbors.north, p1.neighbors.south, p1.neighbors.east, p1.neighbors.west]) {
        if (neighborId && idToIndex.has(neighborId)) {
          const j = idToIndex.get(neighborId)!;
          const dist = calculateGeodeticDistanceM(p1.centroid, panels[j].centroid);
          if (dist <= maxNeighborDistM) {
            union(i, j);
          }
        }
      }
    }

    // Check adjacent grid positions (-1..1 in rows and cols)
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const neighborKey = `${p1.rowIndex + dr}_${p1.colIndex + dc}`;
        if (gridMap.has(neighborKey)) {
          const j = gridMap.get(neighborKey)!;
          const dist = calculateGeodeticDistanceM(p1.centroid, panels[j].centroid);
          if (dist <= maxNeighborDistM) {
            union(i, j);
          }
        }
      }
    }
  }

  // Collect clusters
  const clusterMap = new Map<number, SolarPanelObject[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root)!.push(panels[i]);
  }

  const clusters = Array.from(clusterMap.values());

  // Sort clusters in spatial order along the zone layout
  if (clusters.length > 1) {
    let sumLat = 0;
    let sumLng = 0;
    for (const p of panels) {
      sumLat += p.centroid.lat;
      sumLng += p.centroid.lng;
    }
    const refOrigin = { lat: sumLat / n, lng: sumLng / n };
    const azRad = (azimuthDeg * Math.PI) / 180;
    const sinA = Math.sin(azRad);
    const cosA = Math.cos(azRad);

    const clusterMetrics = clusters.map(cluster => {
      let cLat = 0;
      let cLng = 0;
      for (const p of cluster) {
        cLat += p.centroid.lat;
        cLng += p.centroid.lng;
      }
      const cCentroid = { lat: cLat / cluster.length, lng: cLng / cluster.length };
      const m = latLngToLocalMetric(cCentroid, refOrigin);
      const u = m.x * cosA - m.y * sinA;
      const v = m.x * sinA + m.y * cosA;
      return { cluster, u, v };
    });

    const uVals = clusterMetrics.map(cm => cm.u);
    const vVals = clusterMetrics.map(cm => cm.v);
    const spanU = Math.max(...uVals) - Math.min(...uVals);
    const spanV = Math.max(...vVals) - Math.min(...vVals);

    if (spanU >= spanV) {
      clusterMetrics.sort((a, b) => {
        if (Math.abs(a.u - b.u) > 0.5) return a.u - b.u;
        return a.v - b.v;
      });
    } else {
      clusterMetrics.sort((a, b) => {
        if (Math.abs(a.v - b.v) > 0.5) return a.v - b.v;
        return a.u - b.u;
      });
    }

    return clusterMetrics.map(cm => cm.cluster);
  }

  return clusters;
}

/**
 * Ensures panels in a string circuit are ordered by direct physical adjacency,
 * connecting consecutive adjacent panels and preventing cross-array crisscrossing.
 */
export function chainAdjacentPanels(panels: SolarPanelObject[]): SolarPanelObject[] {
  if (panels.length <= 2) return [...panels];

  // 1. If panels already have a distinct, valid stringOrder without long-distance jumps, use it
  const hasStringOrders = panels.every(p => p.stringOrder !== null && p.stringOrder !== undefined);
  if (hasStringOrders) {
    const sorted = [...panels].sort((a, b) => (a.stringOrder || 0) - (b.stringOrder || 0));
    const orderSet = new Set<number>();
    let hasOrderJump = false;

    for (let i = 0; i < sorted.length; i++) {
      if (orderSet.has(sorted[i].stringOrder!)) {
        hasOrderJump = true;
        break;
      }
      orderSet.add(sorted[i].stringOrder!);

      if (i > 0) {
        const dLat = sorted[i].centroid.lat - sorted[i - 1].centroid.lat;
        const dLng = sorted[i].centroid.lng - sorted[i - 1].centroid.lng;
        // An anomalous jump across disparate sections of an array exceeds ~15 meters (~0.00015 deg)
        if (dLat * dLat + dLng * dLng > 0.00015 * 0.00015) {
          hasOrderJump = true;
          break;
        }
      }
    }

    if (!hasOrderJump) {
      return sorted;
    }
  }

  // 2. If the input array `panels` is already in a continuous contiguous sequence (e.g. from sortPanelsForStringing),
  // preserve that sequence!
  let inputContiguous = true;
  for (let i = 1; i < panels.length; i++) {
    const dLat = panels[i].centroid.lat - panels[i - 1].centroid.lat;
    const dLng = panels[i].centroid.lng - panels[i - 1].centroid.lng;
    if (dLat * dLat + dLng * dLng > 0.00015 * 0.00015) {
      inputContiguous = false;
      break;
    }
  }
  if (inputContiguous) {
    return [...panels];
  }

  // 3. Fallback: If there are duplicate stringOrders or long-distance jumps across the roof,
  // chain panels greedily by spatial nearest neighbor to heal jumbled wiring.
  const remaining = [...panels];
  remaining.sort((a, b) => (a.rowIndex !== b.rowIndex ? a.rowIndex - b.rowIndex : a.colIndex - b.colIndex));
  const chain: SolarPanelObject[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const current = chain[chain.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dLat = remaining[i].centroid.lat - current.centroid.lat;
      const dLng = remaining[i].centroid.lng - current.centroid.lng;
      const d = dLat * dLat + dLng * dLng;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    chain.push(remaining.splice(bestIdx, 1)[0]);
  }

  return chain;
}

export interface StringPartitionOptions {
  customModulesPerString?: number;
  direction?: StringTraverseDirection;
  zoneName?: string;
}

export interface StringPartitionResult {
  stringGroups: SolarPanelObject[][];
  warnings: string[];
}

/**
 * Partitions panels in an ArrayZone into continuous strings, respecting physical
 * subarray/block boundaries (such as 2-row blocks separated by walkways).
 * Panels inside each block are kept contiguous and unbroken whenever possible.
 */
export function partitionPanelsIntoStrings(
  panels: SolarPanelObject[],
  azimuthDeg: number,
  limits: {
    minPanelsPerString: number;
    maxPanelsPerString: number;
    optimalPanelsPerString: number;
  },
  options: StringPartitionOptions = {}
): StringPartitionResult {
  const warnings: string[] = [];
  const stringGroups: SolarPanelObject[][] = [];
  if (panels.length === 0) {
    return { stringGroups, warnings };
  }

  const direction = options.direction || 'short_side';
  const targetSize = options.customModulesPerString
    ? Math.min(limits.maxPanelsPerString, Math.max(limits.minPanelsPerString, options.customModulesPerString))
    : limits.optimalPanelsPerString;

  // 1. Cluster panels into physically contiguous subarrays/blocks
  const clusters = clusterContiguousPanels(panels, azimuthDeg);

  let pendingPanels: SolarPanelObject[] = [];

  for (const cluster of clusters) {
    if (cluster.length === 0) continue;

    // Sort panels inside this cluster into a contiguous serpentine path
    const sortedCluster = sortPanelsForStringing(cluster, azimuthDeg, direction);
    const M = sortedCluster.length;

    // Check if cluster can stand alone as 1 or more strings within [minPanelsPerString, maxPanelsPerString]
    const kMin = Math.ceil(M / limits.maxPanelsPerString);
    const kMax = Math.floor(M / limits.minPanelsPerString);

    if (kMin <= kMax && kMax >= 1) {
      // If there were pending panels from a previous undersized cluster, resolve them first
      if (pendingPanels.length > 0) {
        if (pendingPanels.length + M <= limits.maxPanelsPerString) {
          stringGroups.push(chainAdjacentPanels([...pendingPanels, ...sortedCluster]));
          pendingPanels = [];
          continue;
        } else {
          stringGroups.push(chainAdjacentPanels(pendingPanels));
          if (pendingPanels.length < limits.minPanelsPerString) {
            warnings.push(
              `Array "${options.zoneName || 'Zone'}" string has ${pendingPanels.length} panels, below min MPPT voltage (${limits.minPanelsPerString} panels).`
            );
          }
          pendingPanels = [];
        }
      }

      // Choose optimal k
      let k = Math.round(M / targetSize);
      k = Math.max(kMin, Math.min(kMax, k));

      const baseSize = Math.floor(M / k);
      const remainder = M % k;
      let offset = 0;
      for (let i = 0; i < k; i++) {
        const count = baseSize + (i < remainder ? 1 : 0);
        const subPanels = sortedCluster.slice(offset, offset + count);
        offset += count;
        stringGroups.push(chainAdjacentPanels(subPanels));
        if (count < limits.minPanelsPerString) {
          warnings.push(
            `Array "${options.zoneName || 'Zone'}" string #${stringGroups.length} has ${count} panels, below min MPPT voltage (${limits.minPanelsPerString} panels).`
          );
        }
      }
    } else {
      // Cluster is too small to stand alone (M < minPanelsPerString) or cannot divide cleanly
      pendingPanels.push(...sortedCluster);

      if (pendingPanels.length >= limits.minPanelsPerString) {
        if (pendingPanels.length <= limits.maxPanelsPerString) {
          stringGroups.push(chainAdjacentPanels(pendingPanels));
          pendingPanels = [];
        } else {
          let k = Math.max(
            Math.ceil(pendingPanels.length / limits.maxPanelsPerString),
            Math.round(pendingPanels.length / targetSize)
          );
          while (Math.ceil(pendingPanels.length / k) > limits.maxPanelsPerString) {
            k++;
          }
          const baseSize = Math.floor(pendingPanels.length / k);
          const remainder = pendingPanels.length % k;
          let offset = 0;
          for (let i = 0; i < k; i++) {
            const count = baseSize + (i < remainder ? 1 : 0);
            const sub = pendingPanels.slice(offset, offset + count);
            offset += count;
            stringGroups.push(chainAdjacentPanels(sub));
          }
          pendingPanels = [];
        }
      }
    }
  }

  // Handle any remaining pending panels at the end of the zone
  if (pendingPanels.length > 0) {
    if (
      stringGroups.length > 0 &&
      stringGroups[stringGroups.length - 1].length + pendingPanels.length <= limits.maxPanelsPerString
    ) {
      const lastGroup = stringGroups.pop()!;
      stringGroups.push(chainAdjacentPanels([...lastGroup, ...pendingPanels]));
    } else {
      stringGroups.push(chainAdjacentPanels(pendingPanels));
      if (pendingPanels.length < limits.minPanelsPerString) {
        warnings.push(
          `Array "${options.zoneName || 'Zone'}" string #${stringGroups.length} has ${pendingPanels.length} panels, below min MPPT voltage (${limits.minPanelsPerString} panels).`
        );
      }
    }
  }

  return { stringGroups, warnings };
}
