import {
  LatLngPoint,
  SolarPanelObject,
  ArrayZone,
  SolarSystem,
  RacewayConfig,
  StringCableLength,
  SystemCableSummary
} from '../types/solar';
import { calculateGeodeticDistanceM, calculate3DDistanceM } from './projection';
import { calculatePolylineLength, findClosestPointOnPolyline, calculateDistanceAlongPolyline } from './cabling/polyline';
export { calculatePolylineLength, findClosestPointOnPolyline, calculateDistanceAlongPolyline } from './cabling/polyline';
export type { ClosestPointOnPolyline } from './cabling/polyline';
export { getArrayLongSideAxis, sortPanelsForStringing, clusterContiguousPanels, chainAdjacentPanels } from './cabling/panelOrdering';
export { partitionPanelsIntoStrings } from './cabling/stringPartition';
export type { StringPartitionOptions, StringPartitionResult } from './cabling/stringPartition';

export interface CableCalculationOptions {
  moduleSlackM?: number;       // default 0.4m per module connection
  routingType?: 'riser_plus_ground' | 'direct_3d'; // default riser_plus_ground
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
    // A system may own several homerun trunks: the string taps the one nearest its first module.
    const sharedHomerun = system
      ? pickNearestHomerun(getSystemHomeruns(system).filter(h => !h.systemId || h.systemId === systemId), startPanel.centroid)
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
      racewayId: raceway?.id,
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
  const countedRacewayIds = new Set<string>();
  for (const s of sysStrings) {
    if (s.hasRaceway && s.racewayPathLengthM) {
      if (s.isSharedHomerun) {
        const key = s.racewayId ?? '__shared__';
        if (!countedRacewayIds.has(key)) {
          countedRacewayIds.add(key);
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


/** Every homerun trunk drawn for a system: the primary one first, then any extras. */
export function getSystemHomeruns(system: SolarSystem | null | undefined): RacewayConfig[] {
  if (!system) return [];
  const all: RacewayConfig[] = [];
  if (system.homerunRaceway) all.push(system.homerunRaceway);
  if (system.extraHomeruns) all.push(...system.extraHomeruns);
  return all.filter(h => h && h.path && h.path.length >= 2);
}

/** The homerun whose path passes closest to `point` (null when there are none). */
export function pickNearestHomerun(homeruns: RacewayConfig[], point: LatLngPoint): RacewayConfig | null {
  let best: RacewayConfig | null = null;
  let bestDist = Infinity;
  for (const h of homeruns) {
    if (!h.path || h.path.length < 2) continue;
    const d = findClosestPointOnPolyline(point, h.path).distanceM;
    if (d < bestDist) {
      bestDist = d;
      best = h;
    }
  }
  return best;
}
