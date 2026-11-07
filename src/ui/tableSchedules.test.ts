import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectStore } from '../store/projectStore';
import { calculateGeodeticDistanceM, computePolygonAreaSqM, localMetricToLatLng } from '../geo/projection';
import { RegistryModalUI } from './registryModal';

describe('Table View Schedules & Properties', () => {
  let store: ProjectStore;
  const origin = { lat: 37.7749, lng: -122.4194 };

  beforeEach(() => {
    store = new ProjectStore();
    store.clearAll();

    // Create sample array zone
    const vertices = [
      origin,
      localMetricToLatLng({ x: 30, y: 0 }, origin),
      localMetricToLatLng({ x: 30, y: 20 }, origin),
      localMetricToLatLng({ x: 0, y: 20 }, origin)
    ];
    store.addZone(vertices, 'roof', 'Commercial Rooftop South');
  });

  it('aggregates important properties for the Arrays table', () => {
    const zones = store.getZones();
    expect(zones.length).toBe(1);

    const zone = zones[0];
    const sys = store.getSystem(zone.systemId);
    const mod = store.getModule(zone.moduleId);
    const area = computePolygonAreaSqM(zone.vertices);
    const zonePanels = store.getPanels().filter(p => p.zoneId === zone.id);

    expect(zone.name).toBe('Commercial Rooftop South');
    expect(sys).toBeDefined();
    expect(mod).toBeDefined();
    expect(zone.activePanelCount).toBeGreaterThan(0);
    expect(zone.totalKwp).toBeGreaterThan(0);
    expect(area).toBeGreaterThan(0);
    expect(zone.config.mountType).toBe('roof');
    expect(zone.config.tiltDeg).toBeGreaterThanOrEqual(0);
    expect(zone.config.azimuthDeg).toBeGreaterThanOrEqual(0);
    expect(zonePanels.length).toBe(zone.activePanelCount);
  });

  it('aggregates important properties for the Systems table', () => {
    const systems = store.getSystems();
    expect(systems.length).toBe(1);

    const sys = systems[0];
    const summary = store.getSystemSummary(sys.id);
    const cableSummary = store.getSystemCableSummary(sys.id);
    const linkedZones = store.getZones().filter(z => z.systemId === sys.id);

    expect(sys.name).toBeDefined();
    expect(sys.color).toBeDefined();
    expect(linkedZones.length).toBe(1);
    expect(summary.totalKwp).toBeGreaterThan(0);
    expect(summary.inverterAcKw).toBeGreaterThan(0);
    expect(summary.dcAcRatio).toBeGreaterThan(0);
    expect(cableSummary).toBeDefined();
    expect(typeof cableSummary.totalCableLengthM).toBe('number');
  });

  it('calculates accurate metrics for the Raceways table view', () => {
    const zones = store.getZones();
    const zone = zones[0];

    // Configure a raceway path
    const racewayPath = [
      { lat: 37.77490, lng: -122.41940 },
      { lat: 37.77495, lng: -122.41940 },
      { lat: 37.77500, lng: -122.41950 }
    ];
    store.setZoneRaceway(zone.id, racewayPath, 12);

    const updatedZone = store.getZone(zone.id);
    expect(updatedZone?.raceway).toBeDefined();
    expect(updatedZone?.raceway?.path.length).toBe(3);
    expect(updatedZone?.raceway?.elevationChangeM).toBe(12);

    // Compute path length
    let pathLen2D = 0;
    for (let i = 0; i < updatedZone!.raceway!.path.length - 1; i++) {
      pathLen2D += calculateGeodeticDistanceM(
        updatedZone!.raceway!.path[i],
        updatedZone!.raceway!.path[i + 1]
      );
    }
    expect(pathLen2D).toBeGreaterThan(0);

    const elevM = Math.abs(updatedZone!.raceway!.elevationChangeM);
    expect(elevM).toBe(12);

    const singleConduitRun = pathLen2D + elevM;
    expect(singleConduitRun).toBeGreaterThan(12);
  });

  it('allows reassigning a keep-out obstacle between arrays and tracks them in Keep-Outs schedule', () => {
    const zones = store.getZones();
    const zone1 = zones[0];

    // Create a second array zone
    const o2 = localMetricToLatLng({ x: 40, y: 0 }, origin);
    const v2 = [
      o2,
      localMetricToLatLng({ x: 30, y: 0 }, o2),
      localMetricToLatLng({ x: 30, y: 20 }, o2),
      localMetricToLatLng({ x: 0, y: 20 }, o2)
    ];
    const zone2 = store.addZone(v2, 'roof', 'Commercial Rooftop North');

    // Add a keep-out obstacle on zone 1
    const koVertices = [
      localMetricToLatLng({ x: 5, y: 5 }, origin),
      localMetricToLatLng({ x: 10, y: 5 }, origin),
      localMetricToLatLng({ x: 10, y: 10 }, origin),
      localMetricToLatLng({ x: 5, y: 10 }, origin)
    ];
    const ko = store.addKeepOut(zone1.id, koVertices);
    expect(ko).toBeDefined();
    expect(zone1.keepOuts.length).toBe(1);
    expect(zone2.keepOuts.length).toBe(0);

    const allKoBefore = store.getAllKeepOuts();
    expect(allKoBefore.length).toBe(1);
    expect(allKoBefore[0].zoneId).toBe(zone1.id);
    expect(allKoBefore[0].zoneName).toBe('Commercial Rooftop South');

    // Reassign keepout from zone 1 to zone 2
    const success = store.reassignKeepOutZone(zone1.id, ko!.id, zone2.id);
    expect(success).toBe(true);

    const updatedZone1 = store.getZone(zone1.id);
    const updatedZone2 = store.getZone(zone2.id);
    expect(updatedZone1?.keepOuts.length).toBe(0);
    expect(updatedZone2?.keepOuts.length).toBe(1);
    expect(updatedZone2?.keepOuts[0].id).toBe(ko!.id);

    // Verify getAllKeepOuts reflects the new associated array
    const allKoAfter = store.getAllKeepOuts();
    expect(allKoAfter.length).toBe(1);
    expect(allKoAfter[0].zoneId).toBe(zone2.id);
    expect(allKoAfter[0].zoneName).toBe('Commercial Rooftop North');
  });

  it('aggregates electrical and cabling metrics for the Strings table view', () => {
    const sys = store.getSystems()[0];

    // Run auto-stringing
    const res = store.autoStringSystem(sys.id, 20);
    expect(res.totalStrings).toBeGreaterThan(0);

    const stringCables = store.getStringCables(sys.id);
    expect(stringCables.length).toBe(res.totalStrings);

    const firstStr = stringCables[0];
    expect(firstStr.stringId).toBeDefined();
    expect(firstStr.panelCount).toBeGreaterThan(0);
    expect(firstStr.intraStringLengthM).toBeGreaterThanOrEqual(0);
    expect(firstStr.totalHomerunM).toBeGreaterThanOrEqual(0);
    expect(firstStr.totalStringCableM).toBeGreaterThan(0);
    expect(firstStr.startPanelId).toBeDefined();
    expect(firstStr.endPanelId).toBeDefined();
  });

  it('allows modifying array properties directly and updates telemetry dynamically', () => {
    const zone = store.getZones()[0];
    const initialPanels = zone.activePanelCount;
    expect(initialPanels).toBeGreaterThan(0);

    // 1. Rename array
    store.updateZoneName(zone.id, 'Main Logistics Roof Array');
    expect(store.getZone(zone.id)?.name).toBe('Main Logistics Roof Array');

    // 2. Change color
    store.updateZoneColor(zone.id, '#ff0055');
    expect(store.getZone(zone.id)?.color).toBe('#ff0055');

    // 3. Reassign system
    const sys2 = store.addSystem('Secondary System B');
    store.linkZoneToSystem(zone.id, sys2.id);
    expect(store.getZone(zone.id)?.systemId).toBe(sys2.id);
    expect(store.getPanelsForZone(zone.id).every(p => p.systemId === sys2.id)).toBe(true);

    // 4. Modify orientation and row pitch
    store.updateZoneConfig(zone.id, {
      orientation: 'landscape',
      tiltDeg: 25,
      azimuthDeg: 200,
      rowSpacingM: 3.2
    });

    const updated = store.getZone(zone.id)!;
    expect(updated.config.orientation).toBe('landscape');
    expect(updated.config.tiltDeg).toBe(25);
    expect(updated.config.azimuthDeg).toBe(200);
    expect(updated.config.rowSpacingM).toBe(3.2);
    expect(updated.activePanelCount).toBeGreaterThan(0);
  });

  it('allows modifying system inverter properties and recalculates DC/AC ratios and capacities', () => {
    const sys = store.getSystems()[0];

    // Modify system name and color
    store.updateSystem(sys.id, { name: 'Refurbished Substation 1', color: '#10b981' });
    expect(store.getSystem(sys.id)?.name).toBe('Refurbished Substation 1');
    expect(store.getSystem(sys.id)?.color).toBe('#10b981');

    // Change inverter count and AC rating
    store.updateSystemInverter(sys.id, {
      inverterCount: 2,
      ratedAcPowerKw: 150,
      mpptCountPerInverter: 4,
      maxStringsPerMppt: 3
    });

    const summary = store.getSystemSummary(sys.id);
    expect(summary.inverterAcKw).toBe(300); // 2 x 150 kW
    expect(summary.dcAcRatio).toBeGreaterThan(0);

    const updatedSys = store.getSystem(sys.id)!;
    expect(updatedSys.inverter.inverterCount).toBe(2);
    expect(updatedSys.inverter.ratedAcPowerKw).toBe(150);
    expect(updatedSys.inverter.mpptCountPerInverter).toBe(4);
    expect(updatedSys.inverter.maxStringsPerMppt).toBe(3);
  });

  it('allows modifying raceway elevation change directly and updates conduit run lengths', () => {
    const zone = store.getZones()[0];
    store.setZoneRaceway(zone.id, [
      { lat: 37.77490, lng: -122.41940 },
      { lat: 37.77500, lng: -122.41940 }
    ], 5.0);

    expect(store.getZone(zone.id)?.raceway?.elevationChangeM).toBe(5.0);

    // Update elevation change directly from schedule
    store.setRacewayElevationChange(zone.id, 18.5);
    expect(store.getZone(zone.id)?.raceway?.elevationChangeM).toBe(18.5);
  });

  it('allows modifying string IDs and electrical assignments directly from the schedule', () => {
    const sys = store.getSystems()[0];
    store.autoStringSystem(sys.id, 20);

    const cables = store.getStringCables(sys.id);
    expect(cables.length).toBeGreaterThan(0);
    const origId = cables[0].stringId;

    // Rename string circuit ID
    store.renameString(origId, 'STR-ROOF-01');
    const updatedCables = store.getStringCables(sys.id);
    expect(updatedCables.some(c => c.stringId === 'STR-ROOF-01')).toBe(true);

    // Reassign inverter and MPPT channel
    store.updateStringAssignment('STR-ROOF-01', 2, 'INV2-MPPT3');
    const panelsInStr = store.getPanels().filter(p => p.stringId === 'STR-ROOF-01');
    expect(panelsInStr.length).toBeGreaterThan(0);
    expect(panelsInStr.every(p => p.inverterIndex === 2 && p.mpptId === 'INV2-MPPT3')).toBe(true);
  });

  it('configures and updates ground mount solar tables/racks in the schedule', () => {
    // Add a ground mount array
    const groundVertices = [
      origin,
      localMetricToLatLng({ x: 100, y: 0 }, origin),
      localMetricToLatLng({ x: 100, y: 60 }, origin),
      localMetricToLatLng({ x: 0, y: 60 }, origin)
    ];

    store.addZone(groundVertices, 'ground', 'Ground Mount Section 1');
    const groundZone = store.getZones().find(z => z.name === 'Ground Mount Section 1')!;

    expect(groundZone).toBeDefined();
    expect(groundZone.config.mountType).toBe('ground');
    expect(groundZone.tableCount).toBeGreaterThan(0);
    expect(groundZone.tables).toBeDefined();
    expect(groundZone.tables!.length).toBe(groundZone.tableCount);

    // Initial config: 2P x 14
    expect(groundZone.config.modulesPerTableUp).toBe(2);
    expect(groundZone.config.modulesPerTableWide).toBe(14);
    const initialTables = groundZone.tableCount!;
    expect(initialTables).toBeGreaterThan(0);

    // Reconfigure table dimensions in schedule: 1P x 28
    store.updateZoneConfig(groundZone.id, {
      modulesPerTableUp: 1,
      modulesPerTableWide: 28,
      tableSpacingM: 1.5
    });

    const updatedZone = store.getZone(groundZone.id)!;
    expect(updatedZone.config.modulesPerTableUp).toBe(1);
    expect(updatedZone.config.modulesPerTableWide).toBe(28);
    expect(updatedZone.config.tableSpacingM).toBe(1.5);
    expect(updatedZone.tableCount).toBeGreaterThan(0);
    expect(updatedZone.tables!.length).toBe(updatedZone.tableCount);
    // Every panel should reflect table index and table ID
    const groundPanels = store.getPanels().filter(p => p.zoneId === groundZone.id);
    expect(groundPanels.every(p => p.tableId && p.tableIndex !== null)).toBe(true);
  });

  describe('System-Specific Filtering for Tables & Schedules', () => {
    it('filters project tables and schedules across all systems or a specific system', () => {
      const sys1 = store.getSystems()[0];
      const zone1 = store.getZones()[0];
      expect(zone1.systemId).toBe(sys1.id);

      // Add a second system with its own array
      const sys2 = store.addSystem('Secondary System B', '#3b82f6');
      const o2 = localMetricToLatLng({ x: 50, y: 0 }, origin);
      const v2 = [
        o2,
        localMetricToLatLng({ x: 30, y: 0 }, o2),
        localMetricToLatLng({ x: 30, y: 20 }, o2),
        localMetricToLatLng({ x: 0, y: 20 }, o2)
      ];
      const zone2 = store.addZone(v2, 'roof', 'Commercial Rooftop North');
      store.linkZoneToSystem(zone2.id, sys2.id);

      // Add keepouts: one in zone 1 (sys1), one in zone 2 (sys2)
      const ko1 = store.addKeepOut(zone1.id, [
        localMetricToLatLng({ x: 2, y: 2 }, origin),
        localMetricToLatLng({ x: 5, y: 2 }, origin),
        localMetricToLatLng({ x: 5, y: 5 }, origin),
        localMetricToLatLng({ x: 2, y: 5 }, origin)
      ]);
      const ko2 = store.addKeepOut(zone2.id, [
        localMetricToLatLng({ x: 2, y: 2 }, o2),
        localMetricToLatLng({ x: 5, y: 2 }, o2),
        localMetricToLatLng({ x: 5, y: 5 }, o2),
        localMetricToLatLng({ x: 2, y: 5 }, o2)
      ]);

      // Set raceways on zone 1 and zone 2
      store.setZoneRaceway(zone1.id, [
        origin,
        localMetricToLatLng({ x: 0, y: -10 }, origin)
      ], 3.0);
      store.setZoneRaceway(zone2.id, [
        o2,
        localMetricToLatLng({ x: 0, y: -10 }, o2)
      ], 4.0);

      // Auto-string both systems
      store.autoStringSystem(sys1.id, 20);
      store.autoStringSystem(sys2.id, 20);

      // 1. Arrays Table filtering
      const allZones = store.getZones();
      expect(allZones.length).toBe(2);

      const sys1Zones = allZones.filter(z => z.systemId === sys1.id);
      expect(sys1Zones.length).toBe(1);
      expect(sys1Zones[0].id).toBe(zone1.id);

      const sys2Zones = allZones.filter(z => z.systemId === sys2.id);
      expect(sys2Zones.length).toBe(1);
      expect(sys2Zones[0].id).toBe(zone2.id);

      // 2. Systems Table filtering
      const allSystems = store.getSystems();
      expect(allSystems.length).toBe(2);
      const filteredSys1 = allSystems.filter(s => s.id === sys1.id);
      expect(filteredSys1.length).toBe(1);
      expect(filteredSys1[0].name).toBe(sys1.name);

      // 3. Raceways Table filtering
      const racewayZones = allZones.filter(z => z.raceway && z.raceway.path && z.raceway.path.length >= 2);
      expect(racewayZones.length).toBe(2);
      const sys1Raceways = racewayZones.filter(z => z.systemId === sys1.id);
      expect(sys1Raceways.length).toBe(1);
      expect(sys1Raceways[0].id).toBe(zone1.id);

      // 4. Keep-Outs Table filtering
      const allKeepOuts = store.getAllKeepOuts();
      expect(allKeepOuts.length).toBe(2);
      const sys1KeepOuts = allKeepOuts.filter(k => k.systemId === sys1.id);
      expect(sys1KeepOuts.length).toBe(1);
      expect(sys1KeepOuts[0].keepOut.id).toBe(ko1!.id);
      const sys2KeepOuts = allKeepOuts.filter(k => k.systemId === sys2.id);
      expect(sys2KeepOuts.length).toBe(1);
      expect(sys2KeepOuts[0].keepOut.id).toBe(ko2!.id);

      // 5. Strings Table filtering
      const allStrings = store.getStringCables('all');
      expect(allStrings.length).toBeGreaterThan(0);
      const sys1Strings = allStrings.filter(s => s.systemId === sys1.id);
      const sys2Strings = allStrings.filter(s => s.systemId === sys2.id);
      expect(sys1Strings.length).toBeGreaterThan(0);
      expect(sys2Strings.length).toBeGreaterThan(0);
      expect(sys1Strings.length + sys2Strings.length).toBe(allStrings.length);

      // 6. Panels Table filtering
      const allPanels = store.getPanels();
      const sys1Panels = allPanels.filter(p => p.systemId === sys1.id);
      const sys2Panels = allPanels.filter(p => p.systemId === sys2.id);
      expect(sys1Panels.length).toBeGreaterThan(0);
      expect(sys2Panels.length).toBeGreaterThan(0);
      expect(sys1Panels.length + sys2Panels.length).toBe(allPanels.length);

      // 7. System Summary KPI filtering
      const totalSiteSummary = store.getSystemSummary('all');
      const sys1Summary = store.getSystemSummary(sys1.id);
      const sys2Summary = store.getSystemSummary(sys2.id);

      expect(totalSiteSummary.totalSystems).toBe(2);
      expect(totalSiteSummary.totalZones).toBe(2);
      expect(totalSiteSummary.totalPanels).toBe(allPanels.length);
      expect(sys1Summary.totalZones).toBe(1);
      expect(sys2Summary.totalZones).toBe(1);
      expect(sys1Summary.totalPanels).toBe(sys1Panels.length);
      expect(sys2Summary.totalPanels).toBe(sys2Panels.length);
      expect(Number((sys1Summary.totalKwp + sys2Summary.totalKwp).toFixed(2))).toBe(totalSiteSummary.totalKwp);
    });

    it('supports RegistryModalUI system filter state and programmatic control', () => {
      // Mock minimal DOM for RegistryModalUI
      const mockDialog = {
        open: false,
        showModal: () => { mockDialog.open = true; },
        close: () => { mockDialog.open = false; },
        addEventListener: () => {},
        querySelector: () => ({ innerHTML: '' }),
        querySelectorAll: () => []
      };

      const originalDocument = globalThis.document;
      try {
        (globalThis as any).document = {
          getElementById: (id: string) => {
            if (id === 'testDialog') return mockDialog;
            return { addEventListener: () => {} };
          },
          querySelectorAll: () => []
        };

        const modal = new RegistryModalUI('testDialog', store);
        expect(modal.getSystemFilter()).toBe('all');

        const sys1 = store.getSystems()[0];
        modal.setSystemFilter(sys1.id);
        expect(modal.getSystemFilter()).toBe(sys1.id);

        modal.setSystemFilter('all');
        expect(modal.getSystemFilter()).toBe('all');
      } finally {
        (globalThis as any).document = originalDocument;
      }
    });
  });
});
