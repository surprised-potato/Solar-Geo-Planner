import {
  ArrayZone,
  LatLngPoint,
  MetricPoint,
  MountTableObject,
  RoofRailObject,
  SolarPanelObject
} from '../types/solar';
import {
  computePolygonCentroid,
  latLngToLocalMetric,
  localMetricToLatLng
} from './projection';
import {
  computeBoundingBox,
  isPanelValid,
  offsetPolygonInward
} from './polygonMath';
export { optimizeGridShift } from './gridOptimizer';
export { calculateStringLimits, calculateRecommendedRowSpacing } from './stringLimits';

/**
 * Rotates a 2D metric point (x, y) into the array orientation frame (u, v) aligned with azimuth.
 * u axis: along panel row (perpendicular to azimuth)
 * v axis: along azimuth direction (row step axis)
 */
function toRotatedFrame(pt: MetricPoint, sinA: number, cosA: number): { u: number; v: number } {
  return {
    u: pt.x * cosA - pt.y * sinA,
    v: pt.x * sinA + pt.y * cosA
  };
}

/**
 * Transforms a point in the rotated frame (u, v) back to metric tangent coordinates (x, y).
 */
function fromRotatedFrame(u: number, v: number, sinA: number, cosA: number): MetricPoint {
  return {
    x: u * cosA + v * sinA,
    y: -u * sinA + v * cosA
  };
}

/**
 * Generates an autofilled array of SolarPanelObjects for a given ArrayZone.
 * For ground mount, each polygon is filled with solar mount tables/arrays (each composed of modulesUp x modulesWide),
 * which in turn are filled with individual solar panels.
 */
export function generatePanelsForZone(
  zone: ArrayZone,
  existingPanelsMap?: Map<string, SolarPanelObject>
): {
  panels: SolarPanelObject[];
  usableAreaSqM: number;
  tables?: MountTableObject[];
  rails?: RoofRailObject[];
} {
  if (!zone.vertices || zone.vertices.length < 3) {
    return { panels: [], usableAreaSqM: 0, tables: [], rails: [] };
  }

  const origin = computePolygonCentroid(zone.vertices);
  const metricPoly = zone.vertices.map(v => latLngToLocalMetric(v, origin));
  const metricKeepOuts = zone.keepOuts.map(ko =>
    ko.vertices.map(v => latLngToLocalMetric(v, origin))
  );

  // Apply setback buffer
  const setbackPoly = offsetPolygonInward(metricPoly, zone.config.setbackM);
  if (setbackPoly.length < 3) {
    return { panels: [], usableAreaSqM: 0, tables: [], rails: [] };
  }

  // Calculate usable setback area in m^2
  let usableArea = 0;
  for (let i = 0; i < setbackPoly.length; i++) {
    const j = (i + 1) % setbackPoly.length;
    usableArea += setbackPoly[i].x * setbackPoly[j].y - setbackPoly[j].x * setbackPoly[i].y;
  }
  const usableAreaSqM = Math.abs(usableArea) / 2.0;

  // Precompute spatial bounding boxes for $O(1)$ fast AABB rejection
  const boundaryBox = computeBoundingBox(setbackPoly);
  const keepOutBoxes = metricKeepOuts.map(computeBoundingBox);

  // Panel physical dimensions (m)
  const isPortrait = zone.config.orientation === 'portrait';
  const panelWidthMm = zone.config.panelWidthMm || 1134;
  const panelLengthMm = zone.config.panelLengthMm || 2278;
  const physWidthM = isPortrait
    ? panelWidthMm / 1000.0
    : panelLengthMm / 1000.0;
  const physLengthM = isPortrait
    ? panelLengthMm / 1000.0
    : panelWidthMm / 1000.0;

  // Ground projected depth based on tilt angle
  const tiltRad = (zone.config.tiltDeg * Math.PI) / 180.0;
  const projectedDepthM = physLengthM * Math.cos(tiltRad);

  // Rotation angles for azimuth
  const azimuthRad = (zone.config.azimuthDeg * Math.PI) / 180.0;
  const sinA = Math.sin(azimuthRad);
  const cosA = Math.cos(azimuthRad);

  // Transform setback polygon vertices into (u, v) rotated frame to find bounding box
  const rotatedSetbackPts = setbackPoly.map(p => toRotatedFrame(p, sinA, cosA));
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (const p of rotatedSetbackPts) {
    if (p.u < minU) minU = p.u;
    if (p.u > maxU) maxU = p.u;
    if (p.v < minV) minV = p.v;
    if (p.v > maxV) maxV = p.v;
  }

  const isGround = zone.config.mountType === 'ground';
  const tables: MountTableObject[] = [];

  const candidatePanels: Array<{
    id: string;
    r: number;
    c: number;
    centroidLat: LatLngPoint;
    cornersLat: [LatLngPoint, LatLngPoint, LatLngPoint, LatLngPoint];
    tableId?: string | null;
    tableIndex?: number | null;
    tableRow?: number;
    tableCol?: number;
    tableModuleRow?: number;
    tableModuleCol?: number;
  }> = [];

  const panelGridMap = new Map<string, string>(); // "r_c" -> panelId

  const deltaU = physWidthM + Math.max(0.005, zone.config.colSpacingM);
  const deltaV = projectedDepthM + Math.max(0.005, zone.config.rowSpacingM);
  const startU = minU + (((zone.config.alignmentOffsetX % deltaU) + deltaU) % deltaU);
  const startV = minV + (((zone.config.alignmentOffsetY % deltaV) + deltaV) % deltaV);

  if (isGround) {
    // -------------------------------------------------------------
    // GROUND MOUNT: HIERARCHICAL SOLAR MOUNT TABLES / RACKS FILL
    // -------------------------------------------------------------
    let modulesUp = Math.max(1, zone.config.modulesPerTableUp ?? 2);
    let modulesWide = Math.max(1, zone.config.modulesPerTableWide ?? 14);
    const intraModGapU = Math.max(0.005, zone.config.colSpacingM ?? 0.02);
    const intraModGapV = Math.max(0.005, zone.config.intraTableSpacingM ?? 0.02);
    const tableGapU = Math.max(0.05, zone.config.tableSpacingM ?? 1.0);

    // Adaptive sizing: if setback boundary is narrower than default table rack dimensions,
    // gracefully scale down modulesWide / modulesUp so at least 1 table fits the drawn polygon.
    const availableWidthM = maxU - minU;
    let tableWidthM = modulesWide * physWidthM + (modulesWide - 1) * intraModGapU;
    if (tableWidthM > availableWidthM && availableWidthM >= physWidthM) {
      const maxPossibleWide = Math.max(1, Math.floor((availableWidthM + intraModGapU) / (physWidthM + intraModGapU)));
      modulesWide = Math.min(modulesWide, maxPossibleWide);
      tableWidthM = modulesWide * physWidthM + (modulesWide - 1) * intraModGapU;
    }

    const availableDepthM = maxV - minV;
    let tableDepthM = modulesUp * projectedDepthM + (modulesUp - 1) * intraModGapV;
    if (tableDepthM > availableDepthM && availableDepthM >= projectedDepthM) {
      const maxPossibleUp = Math.max(1, Math.floor((availableDepthM + intraModGapV) / (projectedDepthM + intraModGapV)));
      modulesUp = Math.min(modulesUp, maxPossibleUp);
      tableDepthM = modulesUp * projectedDepthM + (modulesUp - 1) * intraModGapV;
    }

    // Table stepping intervals
    const deltaTableU = tableWidthM + tableGapU;
    // Row pitch: front-to-front if rowSpacingM is configured as pitch, or aisle clearance
    const deltaTableV =
      zone.config.rowSpacingM >= tableDepthM + 0.2
        ? zone.config.rowSpacingM
        : tableDepthM + Math.max(0.5, zone.config.rowSpacingM);

    const startTableU = minU + (((zone.config.alignmentOffsetX % deltaTableU) + deltaTableU) % deltaTableU);
    const startTableV = minV + (((zone.config.alignmentOffsetY % deltaTableV) + deltaTableV) % deltaTableV);

    let tableRowIdx = 0;
    let tableSeq = 0;

    for (let tv = startTableV; tv + tableDepthM <= maxV + 1e-4; tv += deltaTableV) {
      let tableColIdx = 0;
      for (let tu = startTableU; tu + tableWidthM <= maxU + 1e-4; tu += deltaTableU) {
        // Fast table rack envelope check: Test the outer boundary of the entire mount table.
        // If the table envelope is inside setbackPoly without keepout overlap, all modules inside are guaranteed valid.
        const tableCornersRot = [
          { u: tu, v: tv + tableDepthM },
          { u: tu + tableWidthM, v: tv + tableDepthM },
          { u: tu + tableWidthM, v: tv },
          { u: tu, v: tv }
        ];
        const tableCornersMetric = tableCornersRot.map(p => fromRotatedFrame(p.u, p.v, sinA, cosA));
        const tableCentroidMetric = fromRotatedFrame(tu + tableWidthM / 2.0, tv + tableDepthM / 2.0, sinA, cosA);

        // Slightly contract envelope test corners inward towards center (by 0.2%) to prevent
        // ray-casting edge-coincidence boundary false rejections on exact setback alignment
        const testCorners = tableCornersMetric.map(p => ({
          x: p.x + (tableCentroidMetric.x - p.x) * 0.002,
          y: p.y + (tableCentroidMetric.y - p.y) * 0.002
        }));

        if (!isPanelValid(testCorners, setbackPoly, metricKeepOuts, boundaryBox, keepOutBoxes)) {
          tableColIdx++;
          continue;
        }

        tableSeq++;
        const tableId = `${zone.id}_t${tableRowIdx}_${tableColIdx}`;

        const tableCornersLat = tableCornersMetric.map(c => localMetricToLatLng(c, origin)) as [
          LatLngPoint,
          LatLngPoint,
          LatLngPoint,
          LatLngPoint
        ];
        const tableCentroidLat = localMetricToLatLng(tableCentroidMetric, origin);

        const panelIdsForTable: string[] = [];

        for (let modRow = 0; modRow < modulesUp; modRow++) {
          const modV = tv + modRow * (projectedDepthM + intraModGapV);
          for (let modCol = 0; modCol < modulesWide; modCol++) {
            const modU = tu + modCol * (physWidthM + intraModGapU);

            const cornersRot = [
              { u: modU, v: modV + projectedDepthM },
              { u: modU + physWidthM, v: modV + projectedDepthM },
              { u: modU + physWidthM, v: modV },
              { u: modU, v: modV }
            ];

            const cornersMetric = cornersRot.map(p => fromRotatedFrame(p.u, p.v, sinA, cosA));
            const uCenter = modU + physWidthM / 2.0;
            const vCenter = modV + projectedDepthM / 2.0;
            const centroidMetric = fromRotatedFrame(uCenter, vCenter, sinA, cosA);
            const centroidLat = localMetricToLatLng(centroidMetric, origin);
            const cornersLat = cornersMetric.map(c => localMetricToLatLng(c, origin)) as [
              LatLngPoint,
              LatLngPoint,
              LatLngPoint,
              LatLngPoint
            ];

            const globalRow = tableRowIdx * modulesUp + modRow;
            const globalCol = tableColIdx * modulesWide + modCol;
            const panelId = `${zone.id}_r${globalRow}_c${globalCol}`;

            panelGridMap.set(`${globalRow}_${globalCol}`, panelId);
            panelIdsForTable.push(panelId);

            candidatePanels.push({
              id: panelId,
              r: globalRow,
              c: globalCol,
              centroidLat,
              cornersLat,
              tableId,
              tableIndex: tableSeq,
              tableRow: tableRowIdx,
              tableCol: tableColIdx,
              tableModuleRow: modRow,
              tableModuleCol: modCol
            });
          }
        }

        tables.push({
          id: tableId,
          zoneId: zone.id,
          tableIndex: tableSeq,
          rowIndex: tableRowIdx,
          colIndex: tableColIdx,
          centroid: tableCentroidLat,
          corners: tableCornersLat,
          panelIds: panelIdsForTable,
          modulesUp,
          modulesWide
        });

        tableColIdx++;
      }
      tableRowIdx++;
    }
  } else {
    // -------------------------------------------------------------
    // ROOFTOP: CONTINUOUS MODULAR FILL
    // -------------------------------------------------------------
    let rowIndex = 0;
    for (let v = startV; v + projectedDepthM <= maxV + 1e-4; v += deltaV) {
      let colIndex = 0;
      for (let u = startU; u + physWidthM <= maxU + 1e-4; u += deltaU) {
        const cornersRot = [
          { u, v: v + projectedDepthM },
          { u: u + physWidthM, v: v + projectedDepthM },
          { u: u + physWidthM, v },
          { u, v }
        ];

        const cornersMetric: MetricPoint[] = cornersRot.map(p =>
          fromRotatedFrame(p.u, p.v, sinA, cosA)
        );

        if (isPanelValid(cornersMetric, setbackPoly, metricKeepOuts, boundaryBox, keepOutBoxes)) {
          const uCenter = u + physWidthM / 2.0;
          const vCenter = v + projectedDepthM / 2.0;
          const centroidMetric = fromRotatedFrame(uCenter, vCenter, sinA, cosA);

          const centroidLat = localMetricToLatLng(centroidMetric, origin);
          const cornersLat = cornersMetric.map(c =>
            localMetricToLatLng(c, origin)
          ) as [LatLngPoint, LatLngPoint, LatLngPoint, LatLngPoint];

          const panelId = `${zone.id}_r${rowIndex}_c${colIndex}`;
          panelGridMap.set(`${rowIndex}_${colIndex}`, panelId);

          candidatePanels.push({
            id: panelId,
            r: rowIndex,
            c: colIndex,
            centroidLat,
            cornersLat
          });
        }

        colIndex++;
      }
      rowIndex++;
    }
  }

  // -------------------------------------------------------------
  // ROOF RAILS: STRUCTURAL ALUMINUM MOUNTING RAILS
  // Mind how roof rails are laid out: they are ALWAYS parallel to the
  // short side of the solar panel.
  // - Portrait: short side is along u (row axis). Rails run along u (across row).
  // - Landscape: short side is along v (slope axis). Rails run along v (along columns).
  // - Rails in parallel: 2 rails (near ends) or 3 rails (near ends + center).
  // -------------------------------------------------------------
  const rails: RoofRailObject[] = [];
  if (!isGround && candidatePanels.length > 0) {
    const railCount = zone.config.railCount === 3 ? 3 : 2;
    const overhangM = zone.config.railOverhangM ?? 0.10;

    if (isPortrait) {
      // In portrait: Short side is along u (width/row).
      // Rails run horizontally along u.
      // Along v (long side / projectedDepthM), rails are distributed parallel to short side:
      const railFractions =
        railCount === 3
          ? [
              { frac: 0.18, type: 'end_1' as const, idx: 0 },
              { frac: 0.50, type: 'center' as const, idx: 1 },
              { frac: 0.82, type: 'end_2' as const, idx: 2 }
            ]
          : [
              { frac: 0.20, type: 'end_1' as const, idx: 0 },
              { frac: 0.80, type: 'end_2' as const, idx: 1 }
            ];

      // Group panels by rowIndex to identify continuous horizontal runs along the rails
      const rowMap = new Map<number, Array<{ c: number; id: string }>>();
      for (const cp of candidatePanels) {
        if (!rowMap.has(cp.r)) rowMap.set(cp.r, []);
        rowMap.get(cp.r)!.push({ c: cp.c, id: cp.id });
      }

      for (const [r, panelCols] of rowMap.entries()) {
        panelCols.sort((a, b) => a.c - b.c);

        let segIdx = 0;
        let startIdx = 0;
        while (startIdx < panelCols.length) {
          let endIdx = startIdx;
          while (
            endIdx + 1 < panelCols.length &&
            panelCols[endIdx + 1].c === panelCols[endIdx].c + 1
          ) {
            endIdx++;
          }

          const runCols = panelCols.slice(startIdx, endIdx + 1);
          const firstCol = runCols[0].c;
          const lastCol = runCols[runCols.length - 1].c;
          const runPanelIds = runCols.map(p => p.id);

          const uRunStart = startU + firstCol * deltaU;
          const uRunEnd = startU + lastCol * deltaU + physWidthM;
          const uRailStart = uRunStart - overhangM;
          const uRailEnd = uRunEnd + overhangM;
          const lengthM = Number((uRailEnd - uRailStart).toFixed(3));

          const vBase = startV + r * deltaV;

          for (const rf of railFractions) {
            const vRail = vBase + rf.frac * projectedDepthM;
            const ptStartMetric = fromRotatedFrame(uRailStart, vRail, sinA, cosA);
            const ptEndMetric = fromRotatedFrame(uRailEnd, vRail, sinA, cosA);

            const startLat = localMetricToLatLng(ptStartMetric, origin);
            const endLat = localMetricToLatLng(ptEndMetric, origin);

            // Roof anchor points (L-feet brackets) under each module in this run
            const attachmentPoints: LatLngPoint[] = runCols.map(rc => {
              const uMid = startU + rc.c * deltaU + physWidthM / 2.0;
              const ptAttachMetric = fromRotatedFrame(uMid, vRail, sinA, cosA);
              return localMetricToLatLng(ptAttachMetric, origin);
            });

            rails.push({
              id: `${zone.id}_rail_r${r}_s${segIdx}_${rf.idx}`,
              zoneId: zone.id,
              rowIndex: r,
              segmentIndex: segIdx,
              railIndex: rf.idx,
              positionType: rf.type,
              start: startLat,
              end: endLat,
              lengthM,
              panelIds: runPanelIds,
              attachmentPoints
            });
          }

          segIdx++;
          startIdx = endIdx + 1;
        }
      }
    } else {
      // In landscape: Short side is along v (depth/column/slope).
      // Rails run vertically along v (along columns / up-down the slope).
      // Along u (long side / physWidthM), rails are distributed parallel to short side:
      const railFractions =
        railCount === 3
          ? [
              { frac: 0.18, type: 'end_1' as const, idx: 0 },
              { frac: 0.50, type: 'center' as const, idx: 1 },
              { frac: 0.82, type: 'end_2' as const, idx: 2 }
            ]
          : [
              { frac: 0.20, type: 'end_1' as const, idx: 0 },
              { frac: 0.80, type: 'end_2' as const, idx: 1 }
            ];

      // Group panels by colIndex to identify continuous vertical runs along the rails
      const colMap = new Map<number, Array<{ r: number; id: string }>>();
      for (const cp of candidatePanels) {
        if (!colMap.has(cp.c)) colMap.set(cp.c, []);
        colMap.get(cp.c)!.push({ r: cp.r, id: cp.id });
      }

      for (const [c, panelRows] of colMap.entries()) {
        panelRows.sort((a, b) => a.r - b.r);

        let segIdx = 0;
        let startIdx = 0;
        while (startIdx < panelRows.length) {
          let endIdx = startIdx;
          while (
            endIdx + 1 < panelRows.length &&
            panelRows[endIdx + 1].r === panelRows[endIdx].r + 1
          ) {
            endIdx++;
          }

          const runRows = panelRows.slice(startIdx, endIdx + 1);
          const firstRow = runRows[0].r;
          const lastRow = runRows[runRows.length - 1].r;
          const runPanelIds = runRows.map(p => p.id);

          const vRunStart = startV + firstRow * deltaV;
          const vRunEnd = startV + lastRow * deltaV + projectedDepthM;
          const vRailStart = vRunStart - overhangM;
          const vRailEnd = vRunEnd + overhangM;
          const lengthM = Number((vRailEnd - vRailStart).toFixed(3));

          const uBase = startU + c * deltaU;

          for (const rf of railFractions) {
            const uRail = uBase + rf.frac * physWidthM;
            const ptStartMetric = fromRotatedFrame(uRail, vRailStart, sinA, cosA);
            const ptEndMetric = fromRotatedFrame(uRail, vRailEnd, sinA, cosA);

            const startLat = localMetricToLatLng(ptStartMetric, origin);
            const endLat = localMetricToLatLng(ptEndMetric, origin);

            // Roof anchor points (L-feet brackets) under each module in this run
            const attachmentPoints: LatLngPoint[] = runRows.map(rr => {
              const vMid = startV + rr.r * deltaV + projectedDepthM / 2.0;
              const ptAttachMetric = fromRotatedFrame(uRail, vMid, sinA, cosA);
              return localMetricToLatLng(ptAttachMetric, origin);
            });

            rails.push({
              id: `${zone.id}_rail_c${c}_s${segIdx}_${rf.idx}`,
              zoneId: zone.id,
              colIndex: c,
              segmentIndex: segIdx,
              railIndex: rf.idx,
              positionType: rf.type,
              start: startLat,
              end: endLat,
              lengthM,
              panelIds: runPanelIds,
              attachmentPoints
            });
          }

          segIdx++;
          startIdx = endIdx + 1;
        }
      }
    }
  }

  // Build full SolarPanelObjects with topology and stringing readiness
  const panels: SolarPanelObject[] = candidatePanels.map(p => {
    const existing = existingPanelsMap?.get(p.id);

    return {
      id: p.id,
      systemId: zone.systemId || 'sys_default',
      zoneId: zone.id,
      moduleId: zone.moduleId || 'mod_znshine_600w',
      rowIndex: p.r,
      colIndex: p.c,
      centroid: p.centroidLat,
      corners: p.cornersLat,
      azimuthDeg: zone.config.azimuthDeg,
      tiltDeg: zone.config.tiltDeg,
      orientation: zone.config.orientation,
      widthM: physWidthM,
      lengthM: physLengthM,
      projectedDepthM,
      active: existing ? existing.active : true,
      electrical: { ...zone.config.electrical },
      stringId: existing?.stringId ?? null,
      stringOrder: existing?.stringOrder ?? null,
      mpptId: existing?.mpptId ?? null,
      inverterIndex: existing?.inverterIndex ?? null,
      tableId: p.tableId ?? null,
      tableIndex: p.tableIndex ?? null,
      tableRow: p.tableRow,
      tableCol: p.tableCol,
      tableModuleRow: p.tableModuleRow,
      tableModuleCol: p.tableModuleCol,
      neighbors: {
        north: panelGridMap.get(`${p.r + 1}_${p.c}`) ?? null,
        south: panelGridMap.get(`${p.r - 1}_${p.c}`) ?? null,
        east: panelGridMap.get(`${p.r}_${p.c + 1}`) ?? null,
        west: panelGridMap.get(`${p.r}_${p.c - 1}`) ?? null
      }
    };
  });

  return { panels, usableAreaSqM, tables, rails };
}
