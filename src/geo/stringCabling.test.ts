import { describe, it, expect } from 'vitest';
import {
  calculateStringCableLengths,
  summarizeSystemCabling,
  getArrayLongSideAxis,
  sortPanelsForStringing,
  chainAdjacentPanels,
  clusterContiguousPanels,
  partitionPanelsIntoStrings,
  findClosestPointOnPolyline
} from './stringCabling';
import { calculateGeodeticDistanceM, calculate3DDistanceM, localMetricToLatLng } from './projection';
import { SolarPanelObject, ArrayZone } from '../types/solar';

describe('String Geolocational Cabling Engine', () => {
  const origin = { lat: 37.7749, lng: -122.4194 }; // San Francisco

  it('calculates geodetic 2D and 3D distances with elevation accurately', () => {
    // 30m East, 40m North -> 2D distance = 50m
    const p2 = localMetricToLatLng({ x: 30, y: 40 }, origin);
    const d2D = calculateGeodeticDistanceM(origin, p2);
    expect(d2D).toBeCloseTo(50.0, 1);

    // With 15m elevation difference -> 3D distance = sqrt(50^2 + 15^2) = sqrt(2725) ≈ 52.20m
    const d3D = calculate3DDistanceM(origin, p2, 15);
    expect(d3D).toBeCloseTo(52.2, 1);
  });

  it('computes intra-string and homerun cabling with elevation difference', () => {
    // Create 3 panels in a string along a line spaced 2 meters apart
    const p1Coord = origin;
    const p2Coord = localMetricToLatLng({ x: 2, y: 0 }, origin);
    const p3Coord = localMetricToLatLng({ x: 4, y: 0 }, origin);

    const mockPanels: SolarPanelObject[] = [
      {
        id: 'p1',
        systemId: 'sys-1',
        zoneId: 'zone-1',
        moduleId: 'mod-1',
        rowIndex: 0,
        colIndex: 0,
        centroid: p1Coord,
        corners: [p1Coord, p1Coord, p1Coord, p1Coord],
        azimuthDeg: 180,
        tiltDeg: 15,
        orientation: 'portrait',
        widthM: 1.134,
        lengthM: 2.382,
        projectedDepthM: 2.3,
        active: true,
        electrical: { modelName: 'M', nominalPowerW: 600, voc: 48, vmp: 40, isc: 15, imp: 14 },
        stringId: 'STR-01',
        stringOrder: 1,
        mpptId: 'MPPT-1',
        inverterIndex: 1,
        neighbors: { north: null, south: null, east: 'p2', west: null }
      },
      {
        id: 'p2',
        systemId: 'sys-1',
        zoneId: 'zone-1',
        moduleId: 'mod-1',
        rowIndex: 0,
        colIndex: 1,
        centroid: p2Coord,
        corners: [p2Coord, p2Coord, p2Coord, p2Coord],
        azimuthDeg: 180,
        tiltDeg: 15,
        orientation: 'portrait',
        widthM: 1.134,
        lengthM: 2.382,
        projectedDepthM: 2.3,
        active: true,
        electrical: { modelName: 'M', nominalPowerW: 600, voc: 48, vmp: 40, isc: 15, imp: 14 },
        stringId: 'STR-01',
        stringOrder: 2,
        mpptId: 'MPPT-1',
        inverterIndex: 1,
        neighbors: { north: null, south: null, east: 'p3', west: 'p1' }
      },
      {
        id: 'p3',
        systemId: 'sys-1',
        zoneId: 'zone-1',
        moduleId: 'mod-1',
        rowIndex: 0,
        colIndex: 2,
        centroid: p3Coord,
        corners: [p3Coord, p3Coord, p3Coord, p3Coord],
        azimuthDeg: 180,
        tiltDeg: 15,
        orientation: 'portrait',
        widthM: 1.134,
        lengthM: 2.382,
        projectedDepthM: 2.3,
        active: true,
        electrical: { modelName: 'M', nominalPowerW: 600, voc: 48, vmp: 40, isc: 15, imp: 14 },
        stringId: 'STR-01',
        stringOrder: 3,
        mpptId: 'MPPT-1',
        inverterIndex: 1,
        neighbors: { north: null, south: null, east: null, west: 'p2' }
      }
    ];

    // Mock zone with 12m roof elevation above inverter
    const mockZones = new Map<string, ArrayZone>();
    mockZones.set('zone-1', {
      id: 'zone-1',
      systemId: 'sys-1',
      moduleId: 'mod-1',
      name: 'Roof Array',
      color: '#38bdf8',
      vertices: [origin],
      keepOuts: [],
      config: {} as any,
      areaSqM: 100,
      usableAreaSqM: 100,
      panelCount: 3,
      activePanelCount: 3,
      totalKwp: 1.8,
      elevationDeltaM: 12.0 // 12 meters height difference
    });

    // Inverter located 20m South of origin
    const inverterCoord = localMetricToLatLng({ x: 0, y: -20 }, origin);

    const stringCables = calculateStringCableLengths(mockPanels, mockZones, inverterCoord, { moduleSlackM: 0.5 });
    expect(stringCables).toHaveLength(1);

    const str1 = stringCables[0];
    expect(str1.stringId).toBe('STR-01');
    expect(str1.panelCount).toBe(3);

    // Intra-string: 2 spans of 2.0m + 0.5m slack = 2 * 2.5m = 5.0m
    expect(str1.intraStringLengthM).toBeCloseTo(5.0, 1);

    // Homerun Positive (from p1 at (0, 0) to inverter at (0, -20)):
    // 2D distance = 20m. With 12m elevation riser -> 20 + 12 = 32m
    expect(str1.homerunPositiveM).toBeCloseTo(32.0, 1);

    // Homerun Negative (from p3 at (4, 0) to inverter at (0, -20)):
    // 2D distance = sqrt(4^2 + 20^2) = sqrt(416) ≈ 20.40m.
    // With 12m elevation riser -> 20.40 + 12 = 32.40m
    expect(str1.homerunNegativeM).toBeCloseTo(32.4, 1);

    // Total homerun = 32.0 + 32.4 = 64.4m
    expect(str1.totalHomerunM).toBeCloseTo(64.4, 1);

    // Total string cable = 5.0 + 64.4 = 69.4m
    expect(str1.totalStringCableM).toBeCloseTo(69.4, 1);

    // Test system summary
    const summary = summarizeSystemCabling('sys-1', stringCables, inverterCoord, 0);
    expect(summary.totalStrings).toBe(1);
    expect(summary.totalIntraStringM).toBeCloseTo(5.0, 1);
    expect(summary.totalHomerunM).toBeCloseTo(64.4, 1);
    expect(summary.totalElevationRiserM).toBeCloseTo(24.0, 1); // 2 * 12m
    expect(summary.totalCableLengthM).toBeCloseTo(69.4, 1);
  });

  it('routes strings through drawn raceway path and applies elevation change there', () => {
    // String panels at (0, 0) and (2, 0)
    const p1Coord = origin;
    const p2Coord = localMetricToLatLng({ x: 2, y: 0 }, origin);

    const mockPanels: SolarPanelObject[] = [
      {
        id: 'p1',
        systemId: 'sys-1',
        zoneId: 'zone-1',
        moduleId: 'mod-1',
        rowIndex: 0,
        colIndex: 0,
        centroid: p1Coord,
        corners: [p1Coord, p1Coord, p1Coord, p1Coord],
        azimuthDeg: 180,
        tiltDeg: 15,
        orientation: 'portrait',
        widthM: 1.134,
        lengthM: 2.382,
        projectedDepthM: 2.3,
        active: true,
        electrical: { modelName: 'M', nominalPowerW: 600, voc: 48, vmp: 40, isc: 15, imp: 14 },
        stringId: 'STR-01',
        stringOrder: 1,
        mpptId: 'MPPT-1',
        inverterIndex: 1,
        neighbors: { north: null, south: null, east: 'p2', west: null }
      },
      {
        id: 'p2',
        systemId: 'sys-1',
        zoneId: 'zone-1',
        moduleId: 'mod-1',
        rowIndex: 0,
        colIndex: 1,
        centroid: p2Coord,
        corners: [p2Coord, p2Coord, p2Coord, p2Coord],
        azimuthDeg: 180,
        tiltDeg: 15,
        orientation: 'portrait',
        widthM: 1.134,
        lengthM: 2.382,
        projectedDepthM: 2.3,
        active: true,
        electrical: { modelName: 'M', nominalPowerW: 600, voc: 48, vmp: 40, isc: 15, imp: 14 },
        stringId: 'STR-01',
        stringOrder: 2,
        mpptId: 'MPPT-1',
        inverterIndex: 1,
        neighbors: { north: null, south: null, east: null, west: 'p1' }
      }
    ];

    // Define a raceway path:
    // Starts at (1, -2) [near array edge]
    // Goes to (1, -20) [2D length = 18m]
    // Goes to (10, -20) [2D length = 9m] -> total 2D path = 27m
    // Elevation change along raceway = 14m (e.g. wall riser)
    const rwStart = localMetricToLatLng({ x: 1, y: -2 }, origin);
    const rwMid = localMetricToLatLng({ x: 1, y: -20 }, origin);
    const rwEnd = localMetricToLatLng({ x: 10, y: -20 }, origin);

    const mockZones = new Map<string, ArrayZone>();
    mockZones.set('zone-1', {
      id: 'zone-1',
      systemId: 'sys-1',
      moduleId: 'mod-1',
      name: 'Roof Array',
      color: '#38bdf8',
      vertices: [origin],
      keepOuts: [],
      config: {} as any,
      areaSqM: 100,
      usableAreaSqM: 100,
      panelCount: 2,
      activePanelCount: 2,
      totalKwp: 1.2,
      raceway: {
        id: 'rw-1',
        name: 'Main Conduit Tray',
        path: [rwStart, rwMid, rwEnd],
        elevationChangeM: 14.0 // 14m riser drop through the raceway
      }
    });

    // Inverter is located directly at the end of the raceway (10, -20)
    const inverterCoord = rwEnd;

    const stringCables = calculateStringCableLengths(mockPanels, mockZones, inverterCoord, { moduleSlackM: 0.5 });
    expect(stringCables).toHaveLength(1);

    const str1 = stringCables[0];
    expect(str1.hasRaceway).toBe(true);
    // Raceway 2D path length: (1,-2) to (1,-20) = 18m, (1,-20) to (10,-20) = 9m -> 27m
    expect(str1.racewayPathLengthM).toBeCloseTo(27.0, 1);
    expect(str1.elevationDeltaM).toBe(14.0);

    // Lead from p1 at (0, 0) to raceway start at (1, -2): sqrt(1^2 + 2^2) = sqrt(5) ≈ 2.24m
    expect(str1.leadToRacewayPosM).toBeCloseTo(2.24, 1);
    // Lead from p2 at (2, 0) to raceway start at (1, -2): sqrt(1^2 + 2^2) = sqrt(5) ≈ 2.24m
    expect(str1.leadToRacewayNegM).toBeCloseTo(2.24, 1);

    // Common raceway run per conductor = 27m path + 0m connection + 14m riser = 41m
    // Homerun Pos = 2.24 + 41 = 43.24m
    // Homerun Neg = 2.24 + 41 = 43.24m
    // Total Homerun = 86.47m
    expect(str1.homerunPositiveM).toBeCloseTo(43.24, 1);
    expect(str1.homerunNegativeM).toBeCloseTo(43.24, 1);
    expect(str1.totalHomerunM).toBeCloseTo(86.5, 1);

    // Summary check
    const summary = summarizeSystemCabling('sys-1', stringCables, inverterCoord, 0);
    expect(summary.totalRacewayLengthM).toBeCloseTo(27.0, 1);
    expect(summary.totalElevationRiserM).toBeCloseTo(28.0, 1); // 2 * 14m
  });

  it('determines the long side axis correctly for wide vs tall arrays', () => {
    // 1. Array wider along columns (30m wide, 10m deep)
    const widePanels: SolarPanelObject[] = [
      { id: 'p1', rowIndex: 0, colIndex: 0, centroid: origin } as any,
      { id: 'p2', rowIndex: 0, colIndex: 10, centroid: localMetricToLatLng({ x: 30, y: 0 }, origin) } as any,
      { id: 'p3', rowIndex: 3, colIndex: 0, centroid: localMetricToLatLng({ x: 0, y: 10 }, origin) } as any,
      { id: 'p4', rowIndex: 3, colIndex: 10, centroid: localMetricToLatLng({ x: 30, y: 10 }, origin) } as any
    ];
    expect(getArrayLongSideAxis(widePanels, 180)).toBe('columns');

    // 2. Array taller along rows (10m wide, 40m deep)
    const tallPanels: SolarPanelObject[] = [
      { id: 't1', rowIndex: 0, colIndex: 0, centroid: origin } as any,
      { id: 't2', rowIndex: 0, colIndex: 3, centroid: localMetricToLatLng({ x: 10, y: 0 }, origin) } as any,
      { id: 't3', rowIndex: 15, colIndex: 0, centroid: localMetricToLatLng({ x: 0, y: 40 }, origin) } as any,
      { id: 't4', rowIndex: 15, colIndex: 3, centroid: localMetricToLatLng({ x: 10, y: 40 }, origin) } as any
    ];
    expect(getArrayLongSideAxis(tallPanels, 180)).toBe('rows');
  });

  it('traverses across the long side rather than the short side', () => {
    // Tall array: 4 rows (long side), 2 columns (short side)
    // Panels at (row, col):
    // (0,0), (0,1)
    // (1,0), (1,1)
    // (2,0), (2,1)
    // (3,0), (3,1)
    const panels: SolarPanelObject[] = [
      { id: 'r0c0', rowIndex: 0, colIndex: 0, centroid: localMetricToLatLng({ x: 0, y: 0 }, origin) } as any,
      { id: 'r0c1', rowIndex: 0, colIndex: 1, centroid: localMetricToLatLng({ x: 2, y: 0 }, origin) } as any,
      { id: 'r1c0', rowIndex: 1, colIndex: 0, centroid: localMetricToLatLng({ x: 0, y: 5 }, origin) } as any,
      { id: 'r1c1', rowIndex: 1, colIndex: 1, centroid: localMetricToLatLng({ x: 2, y: 5 }, origin) } as any,
      { id: 'r2c0', rowIndex: 2, colIndex: 0, centroid: localMetricToLatLng({ x: 0, y: 10 }, origin) } as any,
      { id: 'r2c1', rowIndex: 2, colIndex: 1, centroid: localMetricToLatLng({ x: 2, y: 10 }, origin) } as any,
      { id: 'r3c0', rowIndex: 3, colIndex: 0, centroid: localMetricToLatLng({ x: 0, y: 15 }, origin) } as any,
      { id: 'r3c1', rowIndex: 3, colIndex: 1, centroid: localMetricToLatLng({ x: 2, y: 15 }, origin) } as any
    ];

    // Long side is rows (spanY = 15m vs spanX = 2m)
    // Traversal along long side should visit column 0 down rows (r0->r1->r2->r3), then column 1 up rows (r3->r2->r1->r0)
    const sorted = sortPanelsForStringing(panels, 180, 'long_side');
    const orderIds = sorted.map(p => p.id);

    expect(orderIds).toEqual([
      'r0c0', 'r1c0', 'r2c0', 'r3c0', // down col 0 along the long side
      'r3c1', 'r2c1', 'r1c1', 'r0c1'  // up col 1 along the long side
    ]);

    // Omitting the preference parameter must default to 'short_side'
    const defaultSorted = sortPanelsForStringing(panels, 180);
    expect(defaultSorted.map(p => p.id)).toEqual([
      'r0c0', 'r0c1',
      'r1c1', 'r1c0',
      'r2c0', 'r2c1',
      'r3c1', 'r3c0'
    ]);

    // If forced to short_side, it moves across columns (r0c0, r0c1, then r1c1, r1c0...)
    const shortSorted = sortPanelsForStringing(panels, 180, 'short_side');
    const shortOrderIds = shortSorted.map(p => p.id);
    expect(shortOrderIds).toEqual([
      'r0c0', 'r0c1',
      'r1c1', 'r1c0',
      'r2c0', 'r2c1',
      'r3c1', 'r3c0'
    ]);

    // Explicit 'columns' preference behaves along columns
    const colSorted = sortPanelsForStringing(panels, 180, 'columns');
    expect(colSorted.map(p => p.id)).toEqual([
      'r0c0', 'r1c0', 'r2c0', 'r3c0',
      'r3c1', 'r2c1', 'r1c1', 'r0c1'
    ]);

    // Explicit 'rows' preference behaves along rows
    const rowSorted = sortPanelsForStringing(panels, 180, 'rows');
    expect(rowSorted.map(p => p.id)).toEqual([
      'r0c0', 'r0c1',
      'r1c1', 'r1c0',
      'r2c0', 'r2c1',
      'r3c1', 'r3c0'
    ]);
  });

  it('chains panels strictly by physical adjacency and heals jumbled cross-roof jumps', () => {
    // Simulate a 2x3 panel array
    const p_r0c0 = { id: 'r0c0', rowIndex: 0, colIndex: 0, centroid: localMetricToLatLng({ x: 0, y: 0 }, origin), stringOrder: 1 } as any;
    const p_r0c1 = { id: 'r0c1', rowIndex: 0, colIndex: 1, centroid: localMetricToLatLng({ x: 1.1, y: 0 }, origin), stringOrder: 2 } as any;
    const p_r0c2 = { id: 'r0c2', rowIndex: 0, colIndex: 2, centroid: localMetricToLatLng({ x: 2.2, y: 0 }, origin), stringOrder: 3 } as any;
    const p_r1c2 = { id: 'r1c2', rowIndex: 1, colIndex: 2, centroid: localMetricToLatLng({ x: 2.2, y: 2.3 }, origin), stringOrder: 4 } as any;
    const p_r1c1 = { id: 'r1c1', rowIndex: 1, colIndex: 1, centroid: localMetricToLatLng({ x: 1.1, y: 2.3 }, origin), stringOrder: 5 } as any;
    const p_r1c0 = { id: 'r1c0', rowIndex: 1, colIndex: 0, centroid: localMetricToLatLng({ x: 0, y: 2.3 }, origin), stringOrder: 6 } as any;

    // 1. Properly ordered panels remain in sequential order
    const cleanChain = chainAdjacentPanels([p_r0c0, p_r0c1, p_r0c2, p_r1c2, p_r1c1, p_r1c0]);
    expect(cleanChain.map(p => p.id)).toEqual(['r0c0', 'r0c1', 'r0c2', 'r1c2', 'r1c1', 'r1c0']);

    // 2. An interleaved/jumbled set of panels (jumping back and forth across 50m) is automatically healed
    // simulating the jumbled starburst scenario where distant panels had identical or interleaved stringOrders
    const distant_p0 = { id: 'top0', rowIndex: 0, colIndex: 0, centroid: localMetricToLatLng({ x: 0, y: 50 }, origin), stringOrder: 1 } as any;
    const distant_p1 = { id: 'bot0', rowIndex: 10, colIndex: 0, centroid: localMetricToLatLng({ x: 0, y: 0 }, origin), stringOrder: 1 } as any;
    const distant_p2 = { id: 'top1', rowIndex: 0, colIndex: 1, centroid: localMetricToLatLng({ x: 1.1, y: 50 }, origin), stringOrder: 2 } as any;
    const distant_p3 = { id: 'bot1', rowIndex: 10, colIndex: 1, centroid: localMetricToLatLng({ x: 1.1, y: 0 }, origin), stringOrder: 2 } as any;

    const healed = chainAdjacentPanels([distant_p0, distant_p1, distant_p2, distant_p3]);
    // It should traverse the top cluster together, then the bottom cluster (NOT interleaving top->bot->top->bot!)
    const ids = healed.map(p => p.id);
    const topTogether = (ids.indexOf('top0') - ids.indexOf('top1') === 1 || ids.indexOf('top1') - ids.indexOf('top0') === 1);
    const botTogether = (ids.indexOf('bot0') - ids.indexOf('bot1') === 1 || ids.indexOf('bot1') - ids.indexOf('bot0') === 1);
    expect(topTogether).toBe(true);
    expect(botTogether).toBe(true);
  });

  it('projects orthogonal tap-in points onto homerun polyline accurately', () => {
    // Polyline runs along X axis: (0, 0) -> (50, 0) -> (100, 0)
    const polyline = [
      localMetricToLatLng({ x: 0, y: 0 }, origin),
      localMetricToLatLng({ x: 50, y: 0 }, origin),
      localMetricToLatLng({ x: 100, y: 0 }, origin)
    ];

    // Target point is at (30, 20)
    const target = localMetricToLatLng({ x: 30, y: 20 }, origin);
    const result = findClosestPointOnPolyline(target, polyline);

    expect(result.distanceM).toBeCloseTo(20.0, 1);
    expect(result.segmentIndex).toBe(0); // between (0,0) and (50,0)
    expect(result.segmentT).toBeCloseTo(0.6, 2); // 30 / 50 = 0.6

    // Target point before start (-10, 15) -> clamps to segment 0 start (0, 0)
    const beforeStart = localMetricToLatLng({ x: -10, y: 15 }, origin);
    const resStart = findClosestPointOnPolyline(beforeStart, polyline);
    expect(resStart.segmentIndex).toBe(0);
    expect(resStart.segmentT).toBe(0);
    // Distance from (-10, 15) to (0, 0) is sqrt(10^2 + 15^2) ≈ 18.03m
    expect(resStart.distanceM).toBeCloseTo(18.03, 1);
  });

  it('auto-connects multiple independent arrays into a single shared homerun trunk', () => {
    // Array 1 at (0, 20), Array 2 at (60, 25)
    // Inverter is at (120, 0)
    // User draws ONE homerun trunk independent of arrays: (10, 5) -> (50, 5) -> (100, 0) -> (120, 0)
    const homerunPath = [
      localMetricToLatLng({ x: 10, y: 5 }, origin),
      localMetricToLatLng({ x: 50, y: 5 }, origin),
      localMetricToLatLng({ x: 100, y: 0 }, origin),
      localMetricToLatLng({ x: 120, y: 0 }, origin) // Ends at Inverter
    ];

    const inverterPt = localMetricToLatLng({ x: 120, y: 0 }, origin);

    const p1Arr1 = localMetricToLatLng({ x: 10, y: 25 }, origin);
    const p2Arr1 = localMetricToLatLng({ x: 12, y: 25 }, origin);

    const p1Arr2 = localMetricToLatLng({ x: 60, y: 30 }, origin);
    const p2Arr2 = localMetricToLatLng({ x: 62, y: 30 }, origin);

    const panels: SolarPanelObject[] = [
      // Array 1 string
      {
        id: 'a1_p1',
        systemId: 'sys-shared',
        zoneId: 'zone-1',
        moduleId: 'mod-1',
        rowIndex: 0,
        colIndex: 0,
        centroid: p1Arr1,
        corners: [p1Arr1, p1Arr1, p1Arr1, p1Arr1],
        azimuthDeg: 180,
        tiltDeg: 15,
        orientation: 'portrait',
        widthM: 1.134,
        lengthM: 2.382,
        projectedDepthM: 2.3,
        active: true,
        electrical: { modelName: 'M', nominalPowerW: 600, voc: 48, vmp: 40, isc: 15, imp: 14 },
        stringId: 'STR-ARR1',
        stringOrder: 1,
        mpptId: 'MPPT-1',
        inverterIndex: 1,
        neighbors: { north: null, south: null, east: 'a1_p2', west: null }
      },
      {
        id: 'a1_p2',
        systemId: 'sys-shared',
        zoneId: 'zone-1',
        moduleId: 'mod-1',
        rowIndex: 0,
        colIndex: 1,
        centroid: p2Arr1,
        corners: [p2Arr1, p2Arr1, p2Arr1, p2Arr1],
        azimuthDeg: 180,
        tiltDeg: 15,
        orientation: 'portrait',
        widthM: 1.134,
        lengthM: 2.382,
        projectedDepthM: 2.3,
        active: true,
        electrical: { modelName: 'M', nominalPowerW: 600, voc: 48, vmp: 40, isc: 15, imp: 14 },
        stringId: 'STR-ARR1',
        stringOrder: 2,
        mpptId: 'MPPT-1',
        inverterIndex: 1,
        neighbors: { north: null, south: null, east: null, west: 'a1_p1' }
      },
      // Array 2 string
      {
        id: 'a2_p1',
        systemId: 'sys-shared',
        zoneId: 'zone-2',
        moduleId: 'mod-1',
        rowIndex: 0,
        colIndex: 0,
        centroid: p1Arr2,
        corners: [p1Arr2, p1Arr2, p1Arr2, p1Arr2],
        azimuthDeg: 180,
        tiltDeg: 15,
        orientation: 'portrait',
        widthM: 1.134,
        lengthM: 2.382,
        projectedDepthM: 2.3,
        active: true,
        electrical: { modelName: 'M', nominalPowerW: 600, voc: 48, vmp: 40, isc: 15, imp: 14 },
        stringId: 'STR-ARR2',
        stringOrder: 1,
        mpptId: 'MPPT-1',
        inverterIndex: 1,
        neighbors: { north: null, south: null, east: 'a2_p2', west: null }
      },
      {
        id: 'a2_p2',
        systemId: 'sys-shared',
        zoneId: 'zone-2',
        moduleId: 'mod-1',
        rowIndex: 0,
        colIndex: 1,
        centroid: p2Arr2,
        corners: [p2Arr2, p2Arr2, p2Arr2, p2Arr2],
        azimuthDeg: 180,
        tiltDeg: 15,
        orientation: 'portrait',
        widthM: 1.134,
        lengthM: 2.382,
        projectedDepthM: 2.3,
        active: true,
        electrical: { modelName: 'M', nominalPowerW: 600, voc: 48, vmp: 40, isc: 15, imp: 14 },
        stringId: 'STR-ARR2',
        stringOrder: 2,
        mpptId: 'MPPT-1',
        inverterIndex: 1,
        neighbors: { north: null, south: null, east: null, west: 'a2_p1' }
      }
    ];

    const zones = new Map<string, ArrayZone>();
    zones.set('zone-1', { id: 'zone-1', name: 'Array North' } as any);
    zones.set('zone-2', { id: 'zone-2', name: 'Array South' } as any);

    const systems = new Map();
    systems.set('sys-shared', {
      id: 'sys-shared',
      name: 'System 1',
      homerunRaceway: {
        id: 'rw-shared',
        path: homerunPath,
        elevationChangeM: 5.0
      }
    });

    const results = calculateStringCableLengths(panels, zones, inverterPt, {}, systems);
    expect(results.length).toBe(2);

    const str1 = results.find(r => r.stringId === 'STR-ARR1')!;
    const str2 = results.find(r => r.stringId === 'STR-ARR2')!;

    // Both strings should be flagged as using shared homerun
    expect(str1.isSharedHomerun).toBe(true);
    expect(str1.hasRaceway).toBe(true);
    expect(str1.tapPointPos).toBeDefined();
    expect(str1.tapPointNeg).toBeDefined();

    expect(str2.isSharedHomerun).toBe(true);
    expect(str2.hasRaceway).toBe(true);
    expect(str2.tapPointPos).toBeDefined();
    expect(str2.tapPointNeg).toBeDefined();

    // Array 1 is further from inverter than Array 2, so its homerun conductor run is longer
    expect(str1.totalHomerunM).toBeGreaterThan(str2.totalHomerunM);

    // Summary counts shared homerun length once
    const summary = summarizeSystemCabling('sys-shared', results, inverterPt, 0);
    expect(summary.totalStrings).toBe(2);
    expect(summary.totalRacewayLengthM).toBeCloseTo(110.3, 0);
  });

  describe('Contiguous Subarray Clustering & Continuous Stringing', () => {
    it('correctly clusters rooftop panels separated by walkway aisles into independent blocks', () => {
      // 3 distinct 2x7 blocks separated by 2-meter aisles
      const panels: SolarPanelObject[] = [];
      for (let b = 0; b < 3; b++) {
        const xOffset = b * (7 * 1.134 + 2.0); // 2m aisle between blocks
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 7; c++) {
            const globalCol = b * 10 + c;
            panels.push({
              id: `b${b}_r${r}_c${c}`,
              systemId: 'sys-1',
              zoneId: 'zone-1',
              moduleId: 'mod-1',
              rowIndex: r,
              colIndex: globalCol,
              centroid: localMetricToLatLng({ x: xOffset + c * 1.134, y: r * 2.382 }, origin),
              corners: [origin, origin, origin, origin],
              azimuthDeg: 180,
              tiltDeg: 15,
              orientation: 'portrait',
              widthM: 1.134,
              lengthM: 2.382,
              projectedDepthM: 2.3,
              active: true,
              electrical: { modelName: 'M', nominalPowerW: 600, voc: 48, vmp: 40, isc: 15, imp: 14 },
              stringId: null,
              stringOrder: null,
              mpptId: null,
              inverterIndex: null,
              neighbors: { north: null, south: null, east: null, west: null }
            });
          }
        }
      }

      const clusters = clusterContiguousPanels(panels, 180);
      expect(clusters.length).toBe(3);
      expect(clusters[0].length).toBe(14);
      expect(clusters[1].length).toBe(14);
      expect(clusters[2].length).toBe(14);

      // Verify each cluster only contains panels from its respective block
      const foundBlocks = clusters.map(cl => cl[0].id.split('_')[0]).sort();
      expect(foundBlocks).toEqual(['b0', 'b1', 'b2']);
      for (const cluster of clusters) {
        const blockPrefix = cluster[0].id.split('_')[0];
        expect(cluster.every(p => p.id.startsWith(`${blockPrefix}_`))).toBe(true);
      }
    });

    it('partitions multi-block rooftops into 100% continuous dedicated strings without skipping panels or bridging aisles', () => {
      // Create 3 blocks of 2x7 = 14 panels each (total 42 panels)
      const panels: SolarPanelObject[] = [];
      for (let b = 0; b < 3; b++) {
        const xOffset = b * (7 * 1.134 + 2.0);
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 7; c++) {
            panels.push({
              id: `b${b}_r${r}_c${c}`,
              systemId: 'sys-1',
              zoneId: 'zone-1',
              moduleId: 'mod-1',
              rowIndex: r,
              colIndex: b * 10 + c,
              centroid: localMetricToLatLng({ x: xOffset + c * 1.134, y: r * 2.382 }, origin),
              corners: [origin, origin, origin, origin],
              azimuthDeg: 180,
              tiltDeg: 15,
              orientation: 'portrait',
              widthM: 1.134,
              lengthM: 2.382,
              projectedDepthM: 2.3,
              active: true,
              electrical: { modelName: 'M', nominalPowerW: 600, voc: 48, vmp: 40, isc: 15, imp: 14 },
              stringId: null,
              stringOrder: null,
              mpptId: null,
              inverterIndex: null,
              neighbors: { north: null, south: null, east: null, west: null }
            });
          }
        }
      }

      // Limits: min 8, max 20, optimal 18
      const limits = { minPanelsPerString: 8, maxPanelsPerString: 20, optimalPanelsPerString: 18 };
      const partition = partitionPanelsIntoStrings(panels, 180, limits, { direction: 'short_side' });

      // Each 14-panel block should form exactly 1 dedicated string (3 strings total)
      expect(partition.stringGroups.length).toBe(3);
      expect(partition.warnings.length).toBe(0);

      const stringBlocks = partition.stringGroups.map(str => str[0].id.split('_')[0]).sort();
      expect(stringBlocks).toEqual(['b0', 'b1', 'b2']);

      partition.stringGroups.forEach(strPanels => {
        expect(strPanels.length).toBe(14);
        const blockPrefix = strPanels[0].id.split('_')[0];
        // All panels in the string must belong strictly to this block
        expect(strPanels.every(p => p.id.startsWith(`${blockPrefix}_`))).toBe(true);

        // Verify continuity: every consecutive panel step in the string must be physically adjacent (<= 2.5m)
        for (let i = 0; i < strPanels.length - 1; i++) {
          const d = calculateGeodeticDistanceM(strPanels[i].centroid, strPanels[i + 1].centroid);
          expect(d).toBeLessThanOrEqual(2.5); // Never jumps across aisle (~2m) or skips rows
        }
      });
    });

    it('guarantees short_side serpentine traversal does not leave rows stranded', () => {
      // 1 single block of 2 rows x 4 columns = 8 panels
      const panels: SolarPanelObject[] = [];
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 4; c++) {
          panels.push({
            id: `r${r}_c${c}`,
            systemId: 'sys-1',
            zoneId: 'zone-1',
            moduleId: 'mod-1',
            rowIndex: r,
            colIndex: c,
            centroid: localMetricToLatLng({ x: c * 1.134, y: r * 2.382 }, origin),
            corners: [origin, origin, origin, origin],
            azimuthDeg: 180,
            tiltDeg: 15,
            orientation: 'portrait',
            widthM: 1.134,
            lengthM: 2.382,
            projectedDepthM: 2.3,
            active: true,
            electrical: { modelName: 'M', nominalPowerW: 600, voc: 48, vmp: 40, isc: 15, imp: 14 },
            stringId: null,
            stringOrder: null,
            mpptId: null,
            inverterIndex: null,
            neighbors: { north: null, south: null, east: null, west: null }
          });
        }
      }

      const limits = { minPanelsPerString: 6, maxPanelsPerString: 20, optimalPanelsPerString: 16 };
      const res = partitionPanelsIntoStrings(panels, 180, limits, { direction: 'short_side' });

      expect(res.stringGroups.length).toBe(1);
      const str = res.stringGroups[0];
      expect(str.length).toBe(8);

      // Verify every consecutive pair is adjacent
      for (let i = 0; i < str.length - 1; i++) {
        const d = calculateGeodeticDistanceM(str[i].centroid, str[i + 1].centroid);
        expect(d).toBeLessThanOrEqual(2.5);
      }
    });

    it('divides oversized blocks (> maxPanelsPerString) into balanced strings contained inside the block', () => {
      // 1 block of 2 rows x 14 columns = 28 panels
      const panels: SolarPanelObject[] = [];
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 14; c++) {
          panels.push({
            id: `r${r}_c${c}`,
            systemId: 'sys-1',
            zoneId: 'zone-1',
            moduleId: 'mod-1',
            rowIndex: r,
            colIndex: c,
            centroid: localMetricToLatLng({ x: c * 1.134, y: r * 2.382 }, origin),
            corners: [origin, origin, origin, origin],
            azimuthDeg: 180,
            tiltDeg: 15,
            orientation: 'portrait',
            widthM: 1.134,
            lengthM: 2.382,
            projectedDepthM: 2.3,
            active: true,
            electrical: { modelName: 'M', nominalPowerW: 600, voc: 48, vmp: 40, isc: 15, imp: 14 },
            stringId: null,
            stringOrder: null,
            mpptId: null,
            inverterIndex: null,
            neighbors: { north: null, south: null, east: null, west: null }
          });
        }
      }

      // Max 20 panels per string -> 28 panels divides into 2 balanced strings of 14 panels
      const limits = { minPanelsPerString: 8, maxPanelsPerString: 20, optimalPanelsPerString: 18 };
      const res = partitionPanelsIntoStrings(panels, 180, limits, { direction: 'short_side' });

      expect(res.stringGroups.length).toBe(2);
      expect(res.stringGroups[0].length).toBe(14);
      expect(res.stringGroups[1].length).toBe(14);

      // Each sub-string is continuous
      for (const str of res.stringGroups) {
        for (let i = 0; i < str.length - 1; i++) {
          const d = calculateGeodeticDistanceM(str[i].centroid, str[i + 1].centroid);
          expect(d).toBeLessThanOrEqual(2.5);
        }
      }
    });
  });
});
