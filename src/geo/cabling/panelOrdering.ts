/**
 * Panel ordering for stringing: long-side axis, serpentine sort, contiguity clustering and chaining.
 */
import { SolarPanelObject, StringTraverseDirection } from '../../types/solar';
import { calculateGeodeticDistanceM, latLngToLocalMetric } from '../projection';

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
