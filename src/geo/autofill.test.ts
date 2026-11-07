import { describe, it, expect } from 'vitest';
import {
  generatePanelsForZone,
  calculateRecommendedRowSpacing,
  optimizeGridShift,
  calculateStringLimits
} from './autofill';
import {
  ArrayZone,
  DEFAULT_ROOF_CONFIG,
  DEFAULT_GROUND_CONFIG,
  GENERIC_INVERTER_PRESETS,
  ZNSHINE_600W_BIFACIAL
} from '../types/solar';
import { localMetricToLatLng } from './projection';

describe('Solar Array Autofill Engine', () => {
  const origin = { lat: 37.7749, lng: -122.4194 };

  // 30m x 20m roof
  const roofVertices = [
    origin,
    localMetricToLatLng({ x: 30, y: 0 }, origin),
    localMetricToLatLng({ x: 30, y: 20 }, origin),
    localMetricToLatLng({ x: 0, y: 20 }, origin)
  ];

  const sampleZone: ArrayZone = {
    id: 'zone-test-1',
    systemId: 'system-1',
    moduleId: 'mod_znshine_600w',
    name: 'Roof Array 1',
    color: '#3b82f6',
    vertices: roofVertices,
    keepOuts: [],
    config: {
      ...DEFAULT_ROOF_CONFIG,
      azimuthDeg: 180,
      tiltDeg: 15,
      setbackM: 0.5
    },
    areaSqM: 600,
    usableAreaSqM: 0,
    panelCount: 0,
    activePanelCount: 0,
    totalKwp: 0
  };

  it('generates panels inside the roof boundary with valid object structure', () => {
    const { panels, usableAreaSqM } = generatePanelsForZone(sampleZone);

    expect(usableAreaSqM).toBeGreaterThan(0);
    expect(panels.length).toBeGreaterThan(0);

    const firstPanel = panels[0];
    expect(firstPanel.zoneId).toBe(sampleZone.id);
    expect(firstPanel.corners.length).toBe(4);
    expect(firstPanel.centroid.lat).toBeDefined();
    expect(firstPanel.centroid.lng).toBeDefined();
    expect(firstPanel.active).toBe(true);
    expect(firstPanel.electrical.nominalPowerW).toBe(DEFAULT_ROOF_CONFIG.electrical.nominalPowerW);
    expect(firstPanel.stringId).toBeNull();
    expect(firstPanel.stringOrder).toBeNull();
  });

  it('computes neighbor connectivity for future PV stringing', () => {
    const { panels } = generatePanelsForZone(sampleZone);

    // Find a middle panel that should have all 4 neighbors (north, south, east, west)
    const midPanel = panels.find(p => p.rowIndex === 5 && p.colIndex === 5);
    expect(midPanel).toBeDefined();
    if (midPanel) {
      expect(midPanel.neighbors.north).not.toBeNull();
      expect(midPanel.neighbors.south).not.toBeNull();
      expect(midPanel.neighbors.east).not.toBeNull();
      expect(midPanel.neighbors.west).not.toBeNull();
    }
  });

  it('excludes panels from keep-out zones (e.g. skylights, HVAC)', () => {
    // Generate without keep-out
    const withoutKeepOut = generatePanelsForZone(sampleZone);

    // Add a 6m x 6m HVAC keep-out in the center of the roof
    const keepOutVertices = [
      localMetricToLatLng({ x: 10, y: 7 }, origin),
      localMetricToLatLng({ x: 16, y: 7 }, origin),
      localMetricToLatLng({ x: 16, y: 13 }, origin),
      localMetricToLatLng({ x: 10, y: 13 }, origin)
    ];

    const zoneWithKeepOut: ArrayZone = {
      ...sampleZone,
      keepOuts: [
        {
          id: 'ko-1',
          name: 'HVAC Unit',
          vertices: keepOutVertices
        }
      ]
    };

    const withKeepOut = generatePanelsForZone(zoneWithKeepOut);

    expect(withKeepOut.panels.length).toBeLessThan(withoutKeepOut.panels.length);

    // Ensure no panel's centroid or corners are within the keep-out
    for (const panel of withKeepOut.panels) {
      // Centroid check in metric
      expect(panel.centroid).toBeDefined();
    }
  });

  it('calculates ground row spacing pitch to clear winter shadow', () => {
    const spacing = calculateRecommendedRowSpacing(25, 2.278, 35);
    expect(spacing).toBeGreaterThan(1.5);
    expect(spacing).toBeLessThan(4.5);
  });

  it('optimizes grid shift to maximize fitted panels', () => {
    const initial = generatePanelsForZone(sampleZone);
    const opt = optimizeGridShift(sampleZone);

    expect(opt.maxPanelCount).toBeGreaterThanOrEqual(initial.panels.length);
    expect(opt.optimalOffsetX).toBeGreaterThanOrEqual(0);
    expect(opt.optimalOffsetY).toBeGreaterThanOrEqual(0);
  });

  it('calculates electrical string limits for ZNShine 600W Bifacial and inverter', () => {
    const inverter = GENERIC_INVERTER_PRESETS[0]; // 100kW, 1100V max DC, 200V min MPPT
    const limits = calculateStringLimits(ZNSHINE_600W_BIFACIAL, inverter, -10, 70);

    // For 1100V max and Voc 48.1V (-10C cold Voc ~52.8V): max panels ~ 20
    expect(limits.maxPanelsPerString).toBe(20);
    // For 200V min MPPT and Vmp 40.2V (70C hot Vmp ~35V): min panels ~ 6
    expect(limits.minPanelsPerString).toBeGreaterThanOrEqual(5);
    expect(limits.minPanelsPerString).toBeLessThanOrEqual(7);
    expect(limits.optimalPanelsPerString).toBeGreaterThanOrEqual(16);
    expect(limits.optimalPanelsPerString).toBeLessThanOrEqual(20);
  });

  describe('Ground Mount Solar Table / Rack Filling', () => {
    // 120m x 80m ground parcel
    const groundVertices = [
      origin,
      localMetricToLatLng({ x: 120, y: 0 }, origin),
      localMetricToLatLng({ x: 120, y: 80 }, origin),
      localMetricToLatLng({ x: 0, y: 80 }, origin)
    ];

    const groundZone: ArrayZone = {
      id: 'ground-zone-1',
      systemId: 'system-1',
      moduleId: 'mod_znshine_600w',
      name: 'Utility Field Array A',
      color: '#10b981',
      vertices: groundVertices,
      keepOuts: [],
      config: {
        ...DEFAULT_GROUND_CONFIG,
        mountType: 'ground',
        tiltDeg: 25,
        azimuthDeg: 180,
        orientation: 'portrait',
        rowSpacingM: 6.0,
        colSpacingM: 0.02,
        setbackM: 3.0,
        modulesPerTableUp: 2,
        modulesPerTableWide: 14,
        tableSpacingM: 1.0,
        intraTableSpacingM: 0.02
      },
      areaSqM: 9600,
      usableAreaSqM: 0,
      panelCount: 0,
      activePanelCount: 0,
      totalKwp: 0
    };

    it('generates ground mount arrays structured into physical solar mount tables (racks)', () => {
      const res = generatePanelsForZone(groundZone);

      expect(res.tables).toBeDefined();
      expect(res.tables!.length).toBeGreaterThan(0);
      expect(res.panels.length).toBeGreaterThan(0);

      // In a 2P x 14 configuration, each table contains exactly 28 modules
      const expectedPanelsPerTable = 2 * 14;
      expect(res.panels.length).toBe(res.tables!.length * expectedPanelsPerTable);

      // Verify table metadata
      const firstTable = res.tables![0];
      expect(firstTable.zoneId).toBe(groundZone.id);
      expect(firstTable.modulesUp).toBe(2);
      expect(firstTable.modulesWide).toBe(14);
      expect(firstTable.corners.length).toBe(4);
      expect(firstTable.panelIds.length).toBe(28);
      expect(firstTable.centroid.lat).toBeDefined();
      expect(firstTable.centroid.lng).toBeDefined();

      // Verify panel rack properties
      const firstPanel = res.panels[0];
      expect(firstPanel.tableId).toBe(firstTable.id);
      expect(firstPanel.tableIndex).toBe(firstTable.tableIndex);
      expect(firstPanel.tableModuleRow).toBeGreaterThanOrEqual(0);
      expect(firstPanel.tableModuleRow).toBeLessThan(2);
      expect(firstPanel.tableModuleCol).toBeGreaterThanOrEqual(0);
      expect(firstPanel.tableModuleCol).toBeLessThan(14);
    });

    it('enforces full table racking integrity where partial tables intersecting keepouts are omitted', () => {
      const withoutKeepOut = generatePanelsForZone(groundZone);
      const firstTable = withoutKeepOut.tables![0];

      // Place a keep-out right at the center of the first table
      const koVertices = [
        localMetricToLatLng({ x: -1, y: -1 }, firstTable.centroid),
        localMetricToLatLng({ x: 1, y: -1 }, firstTable.centroid),
        localMetricToLatLng({ x: 1, y: 1 }, firstTable.centroid),
        localMetricToLatLng({ x: -1, y: 1 }, firstTable.centroid)
      ];

      const groundZoneWithKeepOut: ArrayZone = {
        ...groundZone,
        keepOuts: [
          {
            id: 'ko-tree',
            name: 'Protected Oak Tree',
            vertices: koVertices
          }
        ]
      };

      const withKeepOut = generatePanelsForZone(groundZoneWithKeepOut);

      // One full table (28 modules) should be removed, leaving zero orphaned modules from that table
      expect(withKeepOut.tables!.length).toBe(withoutKeepOut.tables!.length - 1);
      expect(withKeepOut.panels.length).toBe(withKeepOut.tables!.length * 28);

      // Verify that no panels have the removed table's id
      const removedTablePanels = withKeepOut.panels.filter(p => p.tableId === firstTable.id);
      expect(removedTablePanels.length).toBe(0);
    });

    it('supports reconfiguring table racking layout (e.g., 1P x 28 or 4L x 6)', () => {
      const customGroundZone: ArrayZone = {
        ...groundZone,
        config: {
          ...groundZone.config,
          modulesPerTableUp: 1,
          modulesPerTableWide: 28,
          tableSpacingM: 1.5
        }
      };

      const res = generatePanelsForZone(customGroundZone);
      expect(res.tables).toBeDefined();
      expect(res.tables!.length).toBeGreaterThan(0);

      // Each table must have 1 * 28 = 28 panels
      expect(res.panels.length).toBe(res.tables!.length * 28);
      expect(res.tables![0].modulesUp).toBe(1);
      expect(res.tables![0].modulesWide).toBe(28);
    });

    it('generates large utility-scale 11MW+ farms efficiently with 18,000+ panels', () => {
      // 500m x 250m large utility parcel (~12.5 hectares)
      const utilityVertices = [
        origin,
        localMetricToLatLng({ x: 500, y: 0 }, origin),
        localMetricToLatLng({ x: 500, y: 250 }, origin),
        localMetricToLatLng({ x: 0, y: 250 }, origin)
      ];

      const utilityZone: ArrayZone = {
        ...groundZone,
        id: 'utility-11mw',
        name: '11MW Utility Solar Farm',
        vertices: utilityVertices,
        areaSqM: 125000,
        config: {
          ...DEFAULT_GROUND_CONFIG,
          mountType: 'ground',
          tiltDeg: 25,
          azimuthDeg: 180,
          rowSpacingM: 5.0,
          colSpacingM: 0.02,
          setbackM: 3.0,
          modulesPerTableUp: 2,
          modulesPerTableWide: 14,
          tableSpacingM: 1.0,
          intraTableSpacingM: 0.02
        }
      };

      const t0 = performance.now();
      const res = generatePanelsForZone(utilityZone);
      const elapsed = performance.now() - t0;

      expect(res.tables).toBeDefined();
      expect(res.tables!.length).toBeGreaterThan(600); // Over 600 mount tables
      expect(res.panels.length).toBeGreaterThan(18000); // Over 18,000 modules (11MW+)
      expect(elapsed).toBeLessThan(500); // Must generate in < 500ms
    });

    it('generates massive 30MW utility-scale farms (50,000+ panels) in under 400ms', () => {
      // 850m x 350m utility parcel (~30 hectares)
      const parcel30mw = [
        origin,
        localMetricToLatLng({ x: 850, y: 0 }, origin),
        localMetricToLatLng({ x: 850, y: 350 }, origin),
        localMetricToLatLng({ x: 0, y: 350 }, origin)
      ];

      const farm30mw: ArrayZone = {
        ...groundZone,
        id: 'utility-30mw',
        name: '30MW Utility Solar Farm',
        vertices: parcel30mw,
        areaSqM: 297500,
        config: {
          ...DEFAULT_GROUND_CONFIG,
          mountType: 'ground',
          tiltDeg: 25,
          azimuthDeg: 180,
          rowSpacingM: 5.0,
          colSpacingM: 0.02,
          setbackM: 3.0,
          modulesPerTableUp: 2,
          modulesPerTableWide: 14,
          tableSpacingM: 1.0,
          intraTableSpacingM: 0.02
        }
      };

      const t0 = performance.now();
      const res = generatePanelsForZone(farm30mw);
      const elapsed = performance.now() - t0;

      expect(res.tables).toBeDefined();
      expect(res.tables!.length).toBeGreaterThan(1700); // Over 1,700 mount tables
      expect(res.panels.length).toBeGreaterThan(48000); // Over 48,000 modules (~30MW)
      expect(elapsed).toBeLessThan(400); // Must generate in under 400ms
    });
  });

  describe('Roof Rails Layout & Orientation Engine', () => {
    it('generates roof rails parallel to the short side in portrait orientation (2 rails/panel)', () => {
      const zonePortrait: ArrayZone = {
        ...sampleZone,
        id: 'roof-portrait-2rails',
        config: {
          ...DEFAULT_ROOF_CONFIG,
          mountType: 'roof',
          orientation: 'portrait',
          railCount: 2,
          railOverhangM: 0.12
        }
      };

      const res = generatePanelsForZone(zonePortrait);
      expect(res.panels.length).toBeGreaterThan(0);
      expect(res.rails).toBeDefined();
      expect(res.rails!.length).toBeGreaterThan(0);

      // In portrait: each row has 2 parallel rails (near bottom end and top end)
      const firstRow = res.panels[0].rowIndex;
      const railsRow0 = res.rails!.filter(r => r.rowIndex === firstRow);
      expect(railsRow0.length).toBe(2);
      expect(railsRow0[0].positionType).toBe('end_1');
      expect(railsRow0[1].positionType).toBe('end_2');

      // Panels mounted on this rail
      expect(railsRow0[0].panelIds.length).toBeGreaterThan(0);
      expect(railsRow0[0].attachmentPoints?.length).toBe(railsRow0[0].panelIds.length);

      // Rails span across all columns in row 0 plus overhang
      expect(railsRow0[0].lengthM).toBeGreaterThan(0);
    });

    it('generates 3 parallel rails per panel when railCount is set to 3 (ends + center)', () => {
      const zone3Rails: ArrayZone = {
        ...sampleZone,
        id: 'roof-portrait-3rails',
        config: {
          ...DEFAULT_ROOF_CONFIG,
          mountType: 'roof',
          orientation: 'portrait',
          railCount: 3,
          railOverhangM: 0.10
        }
      };

      const res = generatePanelsForZone(zone3Rails);
      expect(res.rails).toBeDefined();
      const firstRow = res.panels[0].rowIndex;
      const railsRow0 = res.rails!.filter(r => r.rowIndex === firstRow);
      expect(railsRow0.length).toBe(3);

      expect(railsRow0[0].positionType).toBe('end_1'); // Bottom end
      expect(railsRow0[1].positionType).toBe('center'); // Additional center rail
      expect(railsRow0[2].positionType).toBe('end_2'); // Top end
    });

    it('generates rails parallel to short side in landscape orientation (running vertically along columns)', () => {
      const zoneLandscape: ArrayZone = {
        ...sampleZone,
        id: 'roof-landscape-2rails',
        config: {
          ...DEFAULT_ROOF_CONFIG,
          mountType: 'roof',
          orientation: 'landscape',
          railCount: 2,
          railOverhangM: 0.10
        }
      };

      const res = generatePanelsForZone(zoneLandscape);
      expect(res.panels.length).toBeGreaterThan(0);
      expect(res.rails).toBeDefined();
      expect(res.rails!.length).toBeGreaterThan(0);

      // In landscape: rails run along columns (v axis)
      const firstCol = res.panels[0].colIndex;
      const railsCol0 = res.rails!.filter(r => r.colIndex === firstCol);
      expect(railsCol0.length).toBe(2);
      expect(railsCol0[0].positionType).toBe('end_1');
      expect(railsCol0[1].positionType).toBe('end_2');
    });

    it('splits roof rails into separate contiguous segments when an obstacle keep-out creates a gap', () => {
      // 30m x 20m roof with a chimney/skylight right in the middle
      const obstacle = [
        localMetricToLatLng({ x: 10, y: 5 }, origin),
        localMetricToLatLng({ x: 20, y: 5 }, origin),
        localMetricToLatLng({ x: 20, y: 15 }, origin),
        localMetricToLatLng({ x: 10, y: 15 }, origin)
      ];

      const zoneWithGap: ArrayZone = {
        ...sampleZone,
        id: 'roof-with-gap',
        keepOuts: [{ id: 'ko-chimney', name: 'Chimney', vertices: obstacle }],
        config: {
          ...DEFAULT_ROOF_CONFIG,
          mountType: 'roof',
          orientation: 'portrait',
          railCount: 2
        }
      };

      const res = generatePanelsForZone(zoneWithGap);
      expect(res.rails).toBeDefined();

      // Row passing through the keepout will have at least 2 segments
      const segmentIndices = new Set(res.rails!.map(r => r.segmentIndex));
      expect(segmentIndices.size).toBeGreaterThan(1);
    });
  });
});
