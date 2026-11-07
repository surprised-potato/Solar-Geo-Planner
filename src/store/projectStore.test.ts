import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectStore } from './projectStore';
import { localMetricToLatLng } from '../geo/projection';

describe('ProjectStore & Multi-System Linking', () => {
  let store: ProjectStore;
  const origin = { lat: 37.7749, lng: -122.4194 };

  beforeEach(() => {
    try {
      localStorage.clear();
    } catch (e) {
      // Ignore if localStorage is not in environment
    }
    store = new ProjectStore();
    store.clearAll();
  });

  it('initializes with a default system and links newly drawn array zones into it', () => {
    expect(store.getSystems().length).toBe(1);
    const defaultSys = store.getSystems()[0];

    const vertices = [
      origin,
      localMetricToLatLng({ x: 25, y: 0 }, origin),
      localMetricToLatLng({ x: 25, y: 15 }, origin),
      localMetricToLatLng({ x: 0, y: 15 }, origin)
    ];

    const zone = store.addZone(vertices, 'roof', 'Main Roof Face');
    expect(zone.systemId).toBe(defaultSys.id);
    expect(defaultSys.zoneIds).toContain(zone.id);

    const panels = store.getPanelsForZone(zone.id);
    expect(panels.length).toBeGreaterThan(0);
    expect(panels[0].systemId).toBe(defaultSys.id);
  });

  it('supports creating multiple independent systems and linking multiple arrays into them', () => {
    // System 1: Commercial Rooftop System
    const sys1 = store.getSystems()[0];
    store.updateSystem(sys1.id, { name: 'System 1: Main Building' });

    // System 2: Carport / Ground System
    const sys2 = store.addSystem('System 2: Parking Canopy');
    expect(store.getSystems().length).toBe(2);

    // Add Array 1 to System 1
    const poly1 = [
      origin,
      localMetricToLatLng({ x: 20, y: 0 }, origin),
      localMetricToLatLng({ x: 20, y: 15 }, origin),
      localMetricToLatLng({ x: 0, y: 15 }, origin)
    ];
    const array1 = store.addZone(poly1, 'roof', 'Roof South Face', sys1.id);

    // Add Array 2 to System 1 (linking 2 arrays into System 1)
    const poly2 = [
      localMetricToLatLng({ x: 25, y: 0 }, origin),
      localMetricToLatLng({ x: 45, y: 0 }, origin),
      localMetricToLatLng({ x: 45, y: 15 }, origin),
      localMetricToLatLng({ x: 25, y: 15 }, origin)
    ];
    const array2 = store.addZone(poly2, 'roof', 'Roof East Face', sys1.id);

    // Add Array 3 to System 2
    const poly3 = [
      localMetricToLatLng({ x: 0, y: 30 }, origin),
      localMetricToLatLng({ x: 30, y: 30 }, origin),
      localMetricToLatLng({ x: 30, y: 45 }, origin),
      localMetricToLatLng({ x: 0, y: 45 }, origin)
    ];
    const array3 = store.addZone(poly3, 'ground', 'Carport Array A', sys2.id);

    // Verify system linkage
    expect(sys1.zoneIds).toContain(array1.id);
    expect(sys1.zoneIds).toContain(array2.id);
    expect(sys2.zoneIds).toContain(array3.id);

    // Verify independent system summaries
    const summarySys1 = store.getSystemSummary(sys1.id);
    const summarySys2 = store.getSystemSummary(sys2.id);
    const globalSummary = store.getSystemSummary();

    expect(summarySys1.totalZones).toBe(2);
    expect(summarySys2.totalZones).toBe(1);
    expect(globalSummary.totalSystems).toBe(2);
    expect(globalSummary.totalZones).toBe(3);
    expect(globalSummary.totalKwp).toBeCloseTo(summarySys1.totalKwp + summarySys2.totalKwp, 1);
  });

  it('allows moving/re-linking an array zone between systems', () => {
    const sys1 = store.getSystems()[0];
    const sys2 = store.addSystem('System 2: Warehouse Expansion');

    const vertices = [
      origin,
      localMetricToLatLng({ x: 20, y: 0 }, origin),
      localMetricToLatLng({ x: 20, y: 10 }, origin),
      localMetricToLatLng({ x: 0, y: 10 }, origin)
    ];
    const zone = store.addZone(vertices, 'roof', 'Relocatable Array', sys1.id);
    expect(zone.systemId).toBe(sys1.id);
    expect(sys1.zoneIds).toContain(zone.id);

    // Re-link zone to System 2
    store.linkZoneToSystem(zone.id, sys2.id);

    expect(zone.systemId).toBe(sys2.id);
    expect(sys1.zoneIds).not.toContain(zone.id);
    expect(sys2.zoneIds).toContain(zone.id);

    // All panels in that zone should now reflect System 2
    const panels = store.getPanelsForZone(zone.id);
    for (const p of panels) {
      expect(p.systemId).toBe(sys2.id);
    }
  });

  it('exports and imports projects preserving multiple systems and linkages', () => {
    const sys1 = store.getSystems()[0];
    const sys2 = store.addSystem('Secondary System');

    const v1 = [
      origin,
      localMetricToLatLng({ x: 15, y: 0 }, origin),
      localMetricToLatLng({ x: 15, y: 10 }, origin),
      localMetricToLatLng({ x: 0, y: 10 }, origin)
    ];
    store.addZone(v1, 'roof', 'Array A', sys1.id);

    const v2 = [
      localMetricToLatLng({ x: 20, y: 0 }, origin),
      localMetricToLatLng({ x: 35, y: 0 }, origin),
      localMetricToLatLng({ x: 35, y: 10 }, origin),
      localMetricToLatLng({ x: 20, y: 10 }, origin)
    ];
    store.addZone(v2, 'ground', 'Array B', sys2.id);

    const json = store.exportProjectJson();

    const newStore = new ProjectStore();
    newStore.clearAll();
    const ok = newStore.importProjectJson(json);

    expect(ok).toBe(true);
    expect(newStore.getSystems().length).toBe(2);
    expect(newStore.getZones().length).toBe(2);

    const importedSys2 = newStore.getSystems().find(s => s.name === 'Secondary System');
    expect(importedSys2).toBeDefined();
    if (importedSys2) {
      const zonesInSys2 = newStore.getZonesForSystem(importedSys2.id);
      expect(zonesInSys2.length).toBe(1);
      expect(zonesInSys2[0].name).toBe('Array B');
    }
  });

  it('allows adding and deleting vertices on array polygons and keep-out obstacles', () => {
    const vertices = [
      origin,
      localMetricToLatLng({ x: 30, y: 0 }, origin),
      localMetricToLatLng({ x: 30, y: 20 }, origin),
      localMetricToLatLng({ x: 0, y: 20 }, origin)
    ];

    const zone = store.addZone(vertices, 'roof', 'Complex Roof');
    expect(zone.vertices.length).toBe(4);

    // Add a vertex splitting the first edge
    const midPoint = localMetricToLatLng({ x: 15, y: 0 }, origin);
    store.addZoneVertex(zone.id, 0, midPoint);
    expect(zone.vertices.length).toBe(5);
    expect(zone.vertices[1]).toEqual(midPoint);

    // Delete vertex at index 1
    const deletedOk = store.deleteZoneVertex(zone.id, 1);
    expect(deletedOk).toBe(true);
    expect(zone.vertices.length).toBe(4);

    // Prevent deleting when polygon has only 3 vertices
    store.deleteZoneVertex(zone.id, 0); // now 3 vertices
    expect(zone.vertices.length).toBe(3);
    const cannotDelete = store.deleteZoneVertex(zone.id, 0);
    expect(cannotDelete).toBe(false);
    expect(zone.vertices.length).toBe(3);

    // Keep-Out vertex editing
    const koVertices = [
      localMetricToLatLng({ x: 5, y: 5 }, origin),
      localMetricToLatLng({ x: 10, y: 5 }, origin),
      localMetricToLatLng({ x: 10, y: 10 }, origin),
      localMetricToLatLng({ x: 5, y: 10 }, origin)
    ];
    const ko = store.addKeepOut(zone.id, koVertices);
    expect(ko).toBeDefined();
    if (ko) {
      const koMid = localMetricToLatLng({ x: 7.5, y: 5 }, origin);
      store.addKeepOutVertex(zone.id, ko.id, 0, koMid);
      expect(ko.vertices.length).toBe(5);

      const koDeleted = store.deleteKeepOutVertex(zone.id, ko.id, 1);
      expect(koDeleted).toBe(true);
      expect(ko.vertices.length).toBe(4);
    }
  });

  it('toggles view filter settings and X-Ray / Tracing mode', () => {
    expect(store.viewFilter.panelVisibility).toBe('full');
    expect(store.viewFilter.xRayMode).toBe(false);
    expect(store.viewFilter.showTiltArrows).toBe(true);
    expect(store.viewFilter.showVertices).toBe(true);
    expect(store.viewFilter.showMountTables).toBe(true);
    expect(store.viewFilter.showRoofRails).toBe(true);
    expect(store.viewFilter.showInverters).toBe(true);

    store.toggleXRayMode();
    expect(store.viewFilter.xRayMode).toBe(true);
    expect(store.viewFilter.panelVisibility).toBe('hidden');
    expect(store.viewFilter.showArrayFill).toBe(false);

    store.toggleXRayMode();
    expect(store.viewFilter.xRayMode).toBe(false);
    expect(store.viewFilter.panelVisibility).toBe('full');
    expect(store.viewFilter.showArrayFill).toBe(true);

    store.setViewFilter({ panelVisibility: 'dimmed', showKeepOuts: false, showTiltArrows: false, showVertices: false });
    expect(store.viewFilter.panelVisibility).toBe('dimmed');
    expect(store.viewFilter.showKeepOuts).toBe(false);
    expect(store.viewFilter.showTiltArrows).toBe(false);
    expect(store.viewFilter.showVertices).toBe(false);

    store.setViewFilter({ showTiltArrows: true, showVertices: true });
    expect(store.viewFilter.showTiltArrows).toBe(true);
    expect(store.viewFilter.showVertices).toBe(true);
  });

  it('supports view presets including panel view, wires only, and custom presets', () => {
    // 1. All Elements / Full CAD
    store.applyViewPreset('all');
    expect(store.getActiveViewPreset()).toBe('all');
    expect(store.viewFilter.panelVisibility).toBe('full');
    expect(store.viewFilter.showStringLines).toBe(true);
    expect(store.viewFilter.showTiltArrows).toBe(true);
    expect(store.viewFilter.showVertices).toBe(true);

    // 2. Panel View: hides vertex handles, arrow slope indicators, and wires
    store.applyViewPreset('panels');
    expect(store.getActiveViewPreset()).toBe('panels');
    expect(store.viewFilter.panelVisibility).toBe('full');
    expect(store.viewFilter.showVertices).toBe(false);
    expect(store.viewFilter.showTiltArrows).toBe(false);
    expect(store.viewFilter.showStringLines).toBe(false);
    expect(store.viewFilter.showHomerunLines).toBe(false);
    expect(store.viewFilter.showMountTables).toBe(true);
    expect(store.viewFilter.showRoofRails).toBe(true);

    // 3. Wires & Electrical: highlights string wires, homeruns & raceways, dims panels, hides vertices and arrows
    store.applyViewPreset('wires');
    expect(store.getActiveViewPreset()).toBe('wires');
    expect(store.viewFilter.panelVisibility).toBe('dimmed');
    expect(store.viewFilter.showStringLines).toBe(true);
    expect(store.viewFilter.showRoofRails).toBe(false);
    expect(store.viewFilter.showHomerunLines).toBe(true);
    expect(store.viewFilter.showRaceways).toBe(true);
    expect(store.viewFilter.showInverters).toBe(true);
    expect(store.viewFilter.showVertices).toBe(false);
    expect(store.viewFilter.showTiltArrows).toBe(false);

    // 4. Custom preset detection when individual checkboxes are modified
    store.setViewFilter({ showVertices: true });
    expect(store.getActiveViewPreset()).toBe('custom');

    // 5. Presentation preset
    store.applyViewPreset('presentation');
    expect(store.getActiveViewPreset()).toBe('presentation');
    expect(store.viewFilter.panelVisibility).toBe('full');
    expect(store.viewFilter.showVertices).toBe(false);
    expect(store.viewFilter.showTiltArrows).toBe(false);

    // 6. Civil preset
    store.applyViewPreset('civil');
    expect(store.getActiveViewPreset()).toBe('civil');
    expect(store.viewFilter.showVertices).toBe(true);
    expect(store.viewFilter.showTiltArrows).toBe(true);
    expect(store.viewFilter.showMountTables).toBe(true);

    // 7. Tracing preset
    store.applyViewPreset('tracing');
    expect(store.getActiveViewPreset()).toBe('tracing');
    expect(store.viewFilter.panelVisibility).toBe('hidden');
    expect(store.viewFilter.xRayMode).toBe(true);
    expect(store.viewFilter.showVertices).toBe(true);

    // 8. Vicinity preset: monochrome wireframe basemap, dimmed panels, clean for location drawings
    store.applyViewPreset('vicinity');
    expect(store.getActiveViewPreset()).toBe('vicinity');
    expect(store.viewFilter.basemap).toBe('carto-light');
    expect(store.viewFilter.panelVisibility).toBe('dimmed');
    expect(store.viewFilter.showVertices).toBe(false);
    expect(store.viewFilter.showStringLines).toBe(false);
  });

  it('manages multiple panel models and allows choosing one type of panel per array', () => {
    const modules = store.getModules();
    expect(modules.length).toBeGreaterThanOrEqual(3);

    const defaultModule = store.getModule('mod_znshine_600w');
    expect(defaultModule?.name).toContain('ZNShine 600W');
    expect(defaultModule?.nominalPowerW).toBe(600);
    expect(defaultModule?.voc).toBe(48.1);

    const vertices = [
      origin,
      localMetricToLatLng({ x: 30, y: 0 }, origin),
      localMetricToLatLng({ x: 30, y: 20 }, origin),
      localMetricToLatLng({ x: 0, y: 20 }, origin)
    ];

    // Create array with default ZNShine 600W
    const zone = store.addZone(vertices, 'roof', 'Array With ZNShine');
    expect(zone.moduleId).toBe('mod_znshine_600w');
    const panelsZN = store.getPanelsForZone(zone.id);
    expect(panelsZN[0].electrical.nominalPowerW).toBe(600);

    // Switch array to 420W module
    store.setArrayModule(zone.id, 'mod_residential_420w');
    expect(zone.moduleId).toBe('mod_residential_420w');

    const panels420 = store.getPanelsForZone(zone.id);
    expect(panels420[0].electrical.nominalPowerW).toBe(420);
    expect(panels420[0].lengthM).toBeCloseTo(1.762, 2);
  });

  it('auto-strings system panels matching inverter specs and MPPT channels', () => {
    const sys = store.getSystems()[0];
    const vertices = [
      origin,
      localMetricToLatLng({ x: 35, y: 0 }, origin),
      localMetricToLatLng({ x: 35, y: 25 }, origin),
      localMetricToLatLng({ x: 0, y: 25 }, origin)
    ];

    const zone = store.addZone(vertices, 'roof', 'Large Roof Array', sys.id);
    const panels = store.getPanelsForZone(zone.id);
    expect(panels.length).toBeGreaterThan(20);

    // Run auto-stringing
    const res = store.autoStringSystem(sys.id, 20);
    expect(res.totalStrings).toBeGreaterThan(0);
    expect(res.modulesPerString).toBe(20);

    // Verify panels received string IDs and MPPT channels
    const activePanels = panels.filter(p => p.active);
    expect(activePanels[0].stringId).toBeDefined();
    expect(activePanels[0].stringId).toContain('INV1-M');
    expect(activePanels[0].mpptId).toBeDefined();
  });

  it('optimizes zone grid shift to maximize panel count and simultaneously auto-strings panels', () => {
    const vertices = [
      origin,
      localMetricToLatLng({ x: 26, y: 0 }, origin),
      localMetricToLatLng({ x: 26, y: 16 }, origin),
      localMetricToLatLng({ x: 0, y: 16 }, origin)
    ];

    const zone = store.addZone(vertices, 'roof');
    const prevCount = zone.panelCount;

    // Optimizing grid shift defaults to autoString: true
    const opt = store.optimizeZoneGridShift(zone.id);
    expect(opt.maxPanelCount).toBeGreaterThanOrEqual(prevCount);
    expect(zone.panelCount).toBe(opt.maxPanelCount);
    expect(opt.totalStrings).toBeDefined();
    expect(opt.totalStrings).toBeGreaterThan(0);
    expect(opt.modulesPerString).toBeGreaterThan(0);

    // Verify all active panels are now assigned valid stringId and mpptId
    const panels = store.getPanelsForZone(zone.id);
    expect(panels.length).toBe(opt.maxPanelCount);
    for (const p of panels) {
      expect(p.stringId).toBeTruthy();
      expect(p.stringId).toMatch(/^INV\d+-M\d+-[A-Z]$/);
      expect(p.mpptId).toBeTruthy();
      expect(p.stringOrder).toBeGreaterThan(0);
    }
  });

  it('guarantees unique string IDs across all strings without collision or jumbled lines', () => {
    const sys = store.getSystems()[0];
    // Create a large commercial roof (50m x 30m) with ~200 panels
    const vertices = [
      origin,
      localMetricToLatLng({ x: 50, y: 0 }, origin),
      localMetricToLatLng({ x: 50, y: 30 }, origin),
      localMetricToLatLng({ x: 0, y: 30 }, origin)
    ];
    const zone = store.addZone(vertices, 'roof');
    expect(zone.panelCount).toBeGreaterThan(100);

    const res = store.autoStringSystem(sys.id, 16);
    expect(res.totalStrings).toBeGreaterThan(6);

    const panels = store.getPanelsForSystem(sys.id);
    const stringPanelsMap = new Map<string, typeof panels>();

    for (const p of panels) {
      if (p.stringId) {
        if (!stringPanelsMap.has(p.stringId)) {
          stringPanelsMap.set(p.stringId, []);
        }
        stringPanelsMap.get(p.stringId)!.push(p);
      }
    }

    // Number of unique string IDs must match totalStrings exactly (no duplicate string IDs!)
    expect(stringPanelsMap.size).toBe(res.totalStrings);

    // Each string must have unique sequential stringOrders (1..N) without duplicate orders
    for (const [, strPanels] of stringPanelsMap.entries()) {
      const orders = strPanels.map(p => p.stringOrder);
      const uniqueOrders = new Set(orders);
      expect(uniqueOrders.size).toBe(strPanels.length);
      expect(Math.min(...(orders as number[]))).toBe(1);
      expect(Math.max(...(orders as number[]))).toBe(strPanels.length);
    }
  });

  it('allows disabling auto-stringing during grid shift optimization if requested', () => {
    const vertices = [
      origin,
      localMetricToLatLng({ x: 26, y: 0 }, origin),
      localMetricToLatLng({ x: 26, y: 16 }, origin),
      localMetricToLatLng({ x: 0, y: 16 }, origin)
    ];

    const zone = store.addZone(vertices, 'roof');
    const opt = store.optimizeZoneGridShift(zone.id, 12, false);
    expect(opt.maxPanelCount).toBeGreaterThan(0);
    expect(opt.totalStrings).toBeUndefined();

    // Panels remain unstrung
    const panels = store.getPanelsForZone(zone.id);
    for (const p of panels) {
      expect(p.stringId).toBeNull();
    }
  });

  it('calculates geolocational string lengths and elevation differences to inverter power house', () => {
    const sys = store.getSystems()[0];
    const vertices = [
      origin,
      localMetricToLatLng({ x: 25, y: 0 }, origin),
      localMetricToLatLng({ x: 25, y: 15 }, origin),
      localMetricToLatLng({ x: 0, y: 15 }, origin)
    ];

    const zone = store.addZone(vertices, 'roof', 'Rooftop Array', sys.id);
    // Set 15m building roof height difference
    store.setZoneElevationDelta(zone.id, 15.0);
    expect(zone.elevationDeltaM).toBe(15.0);

    // Geolocation of Inverter Power House placed 50m South of the roof
    const inverterPt = localMetricToLatLng({ x: 12.5, y: -50 }, origin);
    store.setSystemInverterLocation(sys.id, inverterPt, 0);
    expect(sys.inverterLocation).toEqual(inverterPt);

    // Run auto-stringing
    store.autoStringSystem(sys.id, 18);

    // Calculate geolocational cable lengths
    const stringCables = store.getStringCables(sys.id);
    expect(stringCables.length).toBeGreaterThan(0);

    const firstStr = stringCables[0];
    expect(firstStr.elevationDeltaM).toBe(15.0);
    expect(firstStr.intraStringLengthM).toBeGreaterThan(0);
    expect(firstStr.totalHomerunM).toBeGreaterThan(100); // 2 * ~50m ground + 2 * 15m riser
    expect(firstStr.totalStringCableM).toBeGreaterThan(firstStr.totalHomerunM);

    // Verify system cable summary
    const summary = store.getSystemCableSummary(sys.id);
    expect(summary.totalStrings).toBe(stringCables.length);
    expect(summary.totalHomerunM).toBeGreaterThan(0);
    expect(summary.totalElevationRiserM).toBe(stringCables.length * 30.0); // 2 * 15m per string
    expect(summary.totalCableLengthM).toBeGreaterThan(summary.totalHomerunM);
  });

  it('ensures strings NEVER jump arrays for roof mount arrays', () => {
    const sys = store.getSystems()[0];

    // Roof Array 1: 25m x 15m
    const v1 = [
      origin,
      localMetricToLatLng({ x: 25, y: 0 }, origin),
      localMetricToLatLng({ x: 25, y: 15 }, origin),
      localMetricToLatLng({ x: 0, y: 15 }, origin)
    ];
    const zone1 = store.addZone(v1, 'roof', 'Roof Array 1', sys.id);

    // Roof Array 2: 25m x 15m (placed 20m East)
    const o2 = localMetricToLatLng({ x: 45, y: 0 }, origin);
    const v2 = [
      o2,
      localMetricToLatLng({ x: 25, y: 0 }, o2),
      localMetricToLatLng({ x: 25, y: 15 }, o2),
      localMetricToLatLng({ x: 0, y: 15 }, o2)
    ];
    const zone2 = store.addZone(v2, 'roof', 'Roof Array 2', sys.id);

    expect(zone1.config.mountType).toBe('roof');
    expect(zone2.config.mountType).toBe('roof');

    // Run auto-stringing on system with 20 panels per string
    const result = store.autoStringSystem(sys.id, 20);
    expect(result.totalStrings).toBeGreaterThan(0);

    const allPanels = store.getPanelsForSystem(sys.id).filter(p => p.active && p.stringId);
    expect(allPanels.length).toBeGreaterThan(0);

    // Group panels by stringId
    const stringToZoneMap = new Map<string, Set<string>>();
    for (const p of allPanels) {
      if (!stringToZoneMap.has(p.stringId!)) {
        stringToZoneMap.set(p.stringId!, new Set());
      }
      stringToZoneMap.get(p.stringId!)!.add(p.zoneId);
    }

    // Verify EVERY string on roof mount contains panels from EXACTLY ONE array zone!
    for (const [, zoneSet] of stringToZoneMap.entries()) {
      expect(zoneSet.size).toBe(1);
    }
  });

  it('allows editing raceway vertices, inserting midpoint nodes, and deleting nodes', () => {
    const sys = store.getSystems()[0];
    const vertices = [
      origin,
      localMetricToLatLng({ x: 25, y: 0 }, origin),
      localMetricToLatLng({ x: 25, y: 15 }, origin),
      localMetricToLatLng({ x: 0, y: 15 }, origin)
    ];
    const zone = store.addZone(vertices, 'roof', 'Raceway Zone', sys.id);

    const initialPath = [
      { lat: 37.77490, lng: -122.41940 },
      { lat: 37.77495, lng: -122.41940 },
      { lat: 37.77500, lng: -122.41950 }
    ];
    store.setZoneRaceway(zone.id, initialPath, 10);
    expect(zone.raceway?.path.length).toBe(3);

    // Update vertices (dragging a node)
    const movedPath = [
      { lat: 37.77491, lng: -122.41942 },
      { lat: 37.77495, lng: -122.41940 },
      { lat: 37.77500, lng: -122.41950 }
    ];
    store.updateRacewayVertices(zone.id, movedPath);
    expect(zone.raceway?.path[0].lat).toBe(37.77491);

    // Insert a node after index 0 (midpoint handle)
    const midPoint = { lat: 37.77493, lng: -122.41941 };
    store.addRacewayVertex(zone.id, 0, midPoint);
    expect(zone.raceway?.path.length).toBe(4);
    expect(zone.raceway?.path[1]).toEqual(midPoint);

    // Delete vertex at index 1
    const deleted = store.deleteRacewayVertex(zone.id, 1);
    expect(deleted).toBe(true);
    expect(zone.raceway?.path.length).toBe(3);

    // Cannot delete if path has only 2 vertices
    store.deleteRacewayVertex(zone.id, 1);
    expect(zone.raceway?.path.length).toBe(2);
    const cannotDeleteMin = store.deleteRacewayVertex(zone.id, 0);
    expect(cannotDeleteMin).toBe(false);
    expect(zone.raceway?.path.length).toBe(2);
  });

  it('persists newly added systems and selectedSystemId across export and import', () => {
    // Add a new system
    const sys2 = store.addSystem('System 2: Solar Carport Farm');
    expect(store.getSystems().length).toBe(2);
    expect(store.selectedSystemId).toBe(sys2.id);

    // Export to JSON
    const exportedJson = store.exportProjectJson();
    const parsed = JSON.parse(exportedJson);
    expect(parsed.selectedSystemId).toBe(sys2.id);
    expect(parsed.systems.some((s: any) => s.id === sys2.id)).toBe(true);

    // Import into fresh store
    const freshStore = new ProjectStore();
    const success = freshStore.importProjectJson(exportedJson);
    expect(success).toBe(true);
    expect(freshStore.getSystems().length).toBe(2);
    expect(freshStore.selectedSystemId).toBe(sys2.id);
    expect(freshStore.getSelectedSystem()?.name).toBe('System 2: Solar Carport Farm');
  });

  it('correctly persists ground mounted arrays, mountType, tables, and panels', () => {
    const sys = store.getSystems()[0];
    const vertices = [
      origin,
      localMetricToLatLng({ x: 30, y: 0 }, origin),
      localMetricToLatLng({ x: 30, y: 25 }, origin),
      localMetricToLatLng({ x: 0, y: 25 }, origin)
    ];

    // Add ground mount array
    const groundZone = store.addZone(vertices, 'ground', 'Ground Mount Field A', sys.id);
    expect(groundZone.config.mountType).toBe('ground');
    expect(groundZone.tables).toBeDefined();
    expect(groundZone.tables!.length).toBeGreaterThan(0);
    expect(groundZone.panelCount).toBeGreaterThan(0);

    // Check panels have table association
    const panels = store.getPanelsForZone(groundZone.id);
    expect(panels.length).toBeGreaterThan(0);
    expect(panels[0].tableId).toBeTruthy();

    // Export and verify JSON contains ground mount configuration and tables
    const json = store.exportProjectJson();
    const parsed = JSON.parse(json);
    const exportedZone = parsed.zones.find((z: any) => z.id === groundZone.id);
    expect(exportedZone.config.mountType).toBe('ground');
    expect(exportedZone.tables.length).toBe(groundZone.tables!.length);

    // Reimport into a new store
    const newStore = new ProjectStore();
    newStore.importProjectJson(json);
    const importedZone = newStore.getZone(groundZone.id);
    expect(importedZone).toBeDefined();
    expect(importedZone?.config.mountType).toBe('ground');
    expect(importedZone?.tables?.length).toBe(groundZone.tables!.length);
    expect(newStore.getPanelsForZone(groundZone.id).length).toBe(panels.length);
  });

  it('tracks drawingMountType when setting drawing mode for roof vs ground arrays', () => {
    store.setDrawingMode('zone', 'roof');
    expect(store.drawingMode).toBe('zone');
    expect(store.drawingMountType).toBe('roof');

    store.setDrawingMode('zone', 'ground');
    expect(store.drawingMode).toBe('zone');
    expect(store.drawingMountType).toBe('ground');

    store.setDrawingMode('none');
    expect(store.drawingMode).toBe('none');
  });

  it('optimizes panels live when slope direction (azimuth) is changed', () => {
    const vertices = [
      origin,
      localMetricToLatLng({ x: 30, y: 0 }, origin),
      localMetricToLatLng({ x: 30, y: 18 }, origin),
      localMetricToLatLng({ x: 0, y: 18 }, origin)
    ];

    const zone = store.addZone(vertices, 'roof', 'Slope Test Roof');
    const initialAzimuth = zone.config.azimuthDeg;

    // Change slope direction to 225°
    store.updateZoneConfig(zone.id, { azimuthDeg: 225 });
    expect(zone.config.azimuthDeg).toBe(225);
    expect(zone.config.azimuthDeg).not.toBe(initialAzimuth);
    expect(zone.panelCount).toBeGreaterThan(0);
  });

  it('optimizes panels live when vertex is adjusted', () => {
    const vertices = [
      origin,
      localMetricToLatLng({ x: 25, y: 0 }, origin),
      localMetricToLatLng({ x: 25, y: 15 }, origin),
      localMetricToLatLng({ x: 0, y: 15 }, origin)
    ];

    const zone = store.addZone(vertices, 'roof', 'Vertex Drag Test Roof');
    const initialCount = zone.panelCount;

    // Expand boundary by adjusting vertex 1 outward
    const expandedVertices = [...zone.vertices];
    expandedVertices[1] = localMetricToLatLng({ x: 38, y: 0 }, origin);
    expandedVertices[2] = localMetricToLatLng({ x: 38, y: 15 }, origin);

    store.updateZoneVertices(zone.id, expandedVertices, true);
    expect(zone.panelCount).toBeGreaterThan(initialCount);
  });

  it('supports selecting multiple arrays and adjusting setbacks and layout all at once', () => {
    const v1 = [
      origin,
      localMetricToLatLng({ x: 20, y: 0 }, origin),
      localMetricToLatLng({ x: 20, y: 15 }, origin),
      localMetricToLatLng({ x: 0, y: 15 }, origin)
    ];
    const v2 = [
      localMetricToLatLng({ x: 30, y: 0 }, origin),
      localMetricToLatLng({ x: 50, y: 0 }, origin),
      localMetricToLatLng({ x: 50, y: 15 }, origin),
      localMetricToLatLng({ x: 30, y: 15 }, origin)
    ];

    const zone1 = store.addZone(v1, 'roof', 'Array North');
    const zone2 = store.addZone(v2, 'roof', 'Array South');

    // Multi-select both zones
    store.selectZone(zone1.id, false);
    store.selectZone(zone2.id, true);

    expect(store.getSelectedZones().length).toBe(2);
    expect(store.isZoneSelected(zone1.id)).toBe(true);
    expect(store.isZoneSelected(zone2.id)).toBe(true);

    // Batch update setback to 1.2m
    store.updateSelectedZonesConfig({ setbackM: 1.2 });
    expect(zone1.config.setbackM).toBe(1.2);
    expect(zone2.config.setbackM).toBe(1.2);

    // Batch update layout orientation to landscape and row spacing to 1.8m
    store.updateSelectedZonesConfig({
      orientation: 'landscape',
      rowSpacingM: 1.8
    });
    expect(zone1.config.orientation).toBe('landscape');
    expect(zone2.config.orientation).toBe('landscape');
    expect(zone1.config.rowSpacingM).toBe(1.8);
    expect(zone2.config.rowSpacingM).toBe(1.8);

    // Batch optimize both arrays and verify simultaneous auto-stringing
    const optResult = store.optimizeSelectedZonesGridShift(12);
    expect(optResult.optimizedCount).toBe(2);
    expect(optResult.totalMaxPanels).toBeGreaterThan(0);
    expect(optResult.totalStrings).toBeDefined();
    expect(optResult.totalStrings).toBeGreaterThan(0);
    expect(zone1.panelCount).toBeGreaterThan(0);
    expect(zone2.panelCount).toBeGreaterThan(0);

    const panelsZone1 = store.getPanelsForZone(zone1.id);
    const panelsZone2 = store.getPanelsForZone(zone2.id);
    expect(panelsZone1.every(p => p.stringId !== null)).toBe(true);
    expect(panelsZone2.every(p => p.stringId !== null)).toBe(true);
  });

  it('manages shared system homerun raceway independent of arrays', () => {
    const sysId = store.selectedSystemId!;
    expect(sysId).toBeTruthy();

    const homerunPts = [
      { lat: 37.775, lng: -122.420 },
      { lat: 37.776, lng: -122.421 },
      { lat: 37.777, lng: -122.422 }
    ];

    // Set homerun on the system
    store.setSystemHomerun(sysId, homerunPts, 8.5, 'Main Conduit Run');

    const homerun = store.getSystemHomerun(sysId);
    expect(homerun).toBeDefined();
    expect(homerun?.name).toBe('Main Conduit Run');
    expect(homerun?.elevationChangeM).toBe(8.5);
    expect(homerun?.path.length).toBe(3);

    // Any zone linked to this system gets this homerun if it has no dedicated raceway
    const zone = store.addZone([
      { lat: 37.774, lng: -122.419 },
      { lat: 37.775, lng: -122.419 },
      { lat: 37.775, lng: -122.420 },
      { lat: 37.774, lng: -122.420 }
    ], 'roof', 'Zone Alpha', sysId);

    const zoneHomerun = store.getHomerunForZone(zone.id);
    expect(zoneHomerun).toBeDefined();
    expect(zoneHomerun?.id).toBe(homerun?.id);

    // Insert vertex along the homerun
    store.addSystemHomerunVertex(sysId, 0, { lat: 37.7755, lng: -122.4205 });
    expect(store.getSystemHomerun(sysId)?.path.length).toBe(4);

    // Delete vertex
    store.deleteSystemHomerunVertex(sysId, 1);
    expect(store.getSystemHomerun(sysId)?.path.length).toBe(3);

    // Round-trip export and import JSON
    const json = store.exportProjectJson();
    const newStore = new ProjectStore();
    newStore.importProjectJson(json);

    const importedHomerun = newStore.getSystemHomerun(sysId);
    expect(importedHomerun).toBeDefined();
    expect(importedHomerun?.name).toBe('Main Conduit Run');
    expect(importedHomerun?.path.length).toBe(3);

    // Clear homerun
    store.clearSystemHomerun(sysId);
    expect(store.getSystemHomerun(sysId)).toBeNull();
  });

  it('allows user to select and configure inverter capacity including 6 kW and 30 kW', () => {
    const sysId = store.selectedSystemId!;
    expect(sysId).toBeTruthy();

    // Select 6 kW inverter capacity
    store.setSystemInverterCapacity(sysId, 6);
    let sys = store.getSystem(sysId)!;
    expect(sys.inverter.ratedAcPowerKw).toBe(6);
    expect(sys.inverter.mpptCountPerInverter).toBe(2);
    expect(store.getSystemSummary(sysId).inverterAcKw).toBe(6);

    // Select 30 kW inverter capacity
    store.setSystemInverterCapacity(sysId, 30);
    sys = store.getSystem(sysId)!;
    expect(sys.inverter.ratedAcPowerKw).toBe(30);
    expect(sys.inverter.mpptCountPerInverter).toBe(3);
    expect(store.getSystemSummary(sysId).inverterAcKw).toBe(30);

    // Multiple units: 2 x 30 kW = 60 kW AC
    store.updateSystemInverter(sysId, { inverterCount: 2 });
    expect(store.getSystemSummary(sysId).inverterAcKw).toBe(60);

    // Export/import persists capacity
    const json = store.exportProjectJson();
    const freshStore = new ProjectStore();
    freshStore.importProjectJson(json);
    expect(freshStore.getSystem(sysId)?.inverter.ratedAcPowerKw).toBe(30);
    expect(freshStore.getSystem(sysId)?.inverter.inverterCount).toBe(2);
  });

  it('synchronizes inverter preset, capacity, and active zone when switching systems', () => {
    const sys1 = store.getSystems()[0];
    const sys2 = store.addSystem('Sta. Ana Substation');

    // Configure sys2 with 50 kW preset
    store.setSystemInverterPreset(sys2.id, 'inv_commercial_50k');
    expect(store.getSystem(sys2.id)?.inverter.ratedAcPowerKw).toBe(50);
    expect(store.getSystemSummary(sys2.id).inverterAcKw).toBe(50);

    // Add array zones to sys1 and sys2
    const v1 = [
      origin,
      localMetricToLatLng({ x: 20, y: 0 }, origin),
      localMetricToLatLng({ x: 20, y: 10 }, origin),
      localMetricToLatLng({ x: 0, y: 10 }, origin)
    ];
    const z1 = store.addZone(v1, 'roof', 'System 1 Array', sys1.id);
    const z2 = store.addZone(v1, 'roof', 'Sta. Ana Array', sys2.id);

    // Select z1 (system 1)
    store.selectZone(z1.id);
    expect(store.selectedSystemId).toBe(sys1.id);
    expect(store.selectedZoneId).toBe(z1.id);

    // Now select sys2 in ribbon scope dropdown
    store.selectSystem(sys2.id);
    expect(store.selectedSystemId).toBe(sys2.id);
    expect(store.selectedZoneId).toBe(z2.id); // Synchronized to sys2 zone!

    // Update inverter capacity on sys2 to 100 kW
    store.setSystemInverterCapacity(sys2.id, 100);
    expect(store.getSystem(sys2.id)?.inverter.ratedAcPowerKw).toBe(100);
    expect(store.getSystemSummary(sys2.id).inverterAcKw).toBe(100);
    // sys1 remains unaffected
    expect(store.getSystem(sys1.id)?.inverter.ratedAcPowerKw).toBe(100);
  });

  it('autostrings panels strictly without mixing arrays from different systems', () => {
    const sys1 = store.getSystems()[0];
    const sys2 = store.addSystem('Secondary Inverter Station');

    const v1 = [
      origin,
      localMetricToLatLng({ x: 25, y: 0 }, origin),
      localMetricToLatLng({ x: 25, y: 15 }, origin),
      localMetricToLatLng({ x: 0, y: 15 }, origin)
    ];
    const z1 = store.addZone(v1, 'roof', 'System 1 Roof Array', sys1.id);

    const v2 = [
      localMetricToLatLng({ x: 30, y: 0 }, origin),
      localMetricToLatLng({ x: 55, y: 0 }, origin),
      localMetricToLatLng({ x: 55, y: 15 }, origin),
      localMetricToLatLng({ x: 30, y: 15 }, origin)
    ];
    const z2 = store.addZone(v2, 'ground', 'System 1 Ground Array', sys1.id);

    const v3 = [
      localMetricToLatLng({ x: 60, y: 0 }, origin),
      localMetricToLatLng({ x: 85, y: 0 }, origin),
      localMetricToLatLng({ x: 85, y: 15 }, origin),
      localMetricToLatLng({ x: 60, y: 15 }, origin)
    ];
    const z3 = store.addZone(v3, 'roof', 'System 2 Roof Array', sys2.id);

    const v4 = [
      localMetricToLatLng({ x: 90, y: 0 }, origin),
      localMetricToLatLng({ x: 115, y: 0 }, origin),
      localMetricToLatLng({ x: 115, y: 15 }, origin),
      localMetricToLatLng({ x: 90, y: 15 }, origin)
    ];
    const z4 = store.addZone(v4, 'ground', 'System 2 Ground Array', sys2.id);

    // Auto-string both systems (or maximize fitted panels on them)
    store.autoStringSystem(sys1.id, 18);
    store.autoStringSystem(sys2.id, 18);

    // 1. Verify panels in System 1 zones ONLY have System 1 string IDs
    const sys1Panels = store.getPanelsForSystem(sys1.id).filter(p => p.active && p.stringId);
    expect(sys1Panels.length).toBeGreaterThan(0);
    for (const p of sys1Panels) {
      expect(p.systemId).toBe(sys1.id);
      expect(p.stringId).toMatch(/^S1-INV\d+-M\d+-[A-Z]$/);
      expect([z1.id, z2.id]).toContain(p.zoneId);
      expect([z3.id, z4.id]).not.toContain(p.zoneId);
    }

    // 2. Verify panels in System 2 zones ONLY have System 2 string IDs
    const sys2Panels = store.getPanelsForSystem(sys2.id).filter(p => p.active && p.stringId);
    expect(sys2Panels.length).toBeGreaterThan(0);
    for (const p of sys2Panels) {
      expect(p.systemId).toBe(sys2.id);
      expect(p.stringId).toMatch(/^S2-INV\d+-M\d+-[A-Z]$/);
      expect([z3.id, z4.id]).toContain(p.zoneId);
      expect([z1.id, z2.id]).not.toContain(p.zoneId);
    }

    // 3. Ensure no string circuit contains panels from more than one system
    const allStrungPanels = store.getPanels().filter(p => p.active && p.stringId);
    const stringSystems = new Map<string, Set<string>>();
    for (const p of allStrungPanels) {
      if (!stringSystems.has(p.stringId!)) {
        stringSystems.set(p.stringId!, new Set());
      }
      stringSystems.get(p.stringId!)!.add(p.systemId);
    }

    for (const [, systemIds] of stringSystems.entries()) {
      expect(systemIds.size).toBe(1);
    }

    // 4. Verify cable calculation does not mix systems
    const sys1Cables = store.getStringCables(sys1.id);
    const sys2Cables = store.getStringCables(sys2.id);
    expect(sys1Cables.every(c => c.systemId === sys1.id)).toBe(true);
    expect(sys2Cables.every(c => c.systemId === sys2.id)).toBe(true);
  });

  it('strictly isolates raceways and homerun trunks to each individual system', () => {
    const sys1 = store.getSystems()[0];
    const sys2 = store.addSystem('Secondary System');

    const v1 = [
      origin,
      localMetricToLatLng({ x: 20, y: 0 }, origin),
      localMetricToLatLng({ x: 20, y: 15 }, origin),
      localMetricToLatLng({ x: 0, y: 15 }, origin)
    ];
    const zone1 = store.addZone(v1, 'roof', 'System 1 Array', sys1.id);

    const v2 = [
      localMetricToLatLng({ x: 50, y: 0 }, origin),
      localMetricToLatLng({ x: 70, y: 0 }, origin),
      localMetricToLatLng({ x: 70, y: 15 }, origin),
      localMetricToLatLng({ x: 50, y: 15 }, origin)
    ];
    const zone2 = store.addZone(v2, 'roof', 'System 2 Array', sys2.id);

    // Setup inverter locations
    const invLoc1 = { lat: 37.771, lng: -122.418 };
    const invLoc2 = { lat: 37.778, lng: -122.425 };
    store.setSystemInverterLocation(sys1.id, invLoc1);
    store.setSystemInverterLocation(sys2.id, invLoc2);

    // Give System 1 a homerun raceway
    const sys1HomerunPts = [
      { lat: 37.772, lng: -122.418 },
      { lat: 37.7715, lng: -122.418 },
      invLoc1
    ];
    store.setSystemHomerun(sys1.id, sys1HomerunPts, 4.0, 'System 1 Trunk');

    // Verify System 1 has the homerun and Zone 1 inherits it
    expect(store.getSystemHomerun(sys1.id)).toBeDefined();
    expect(store.getSystemHomerun(sys1.id)?.name).toBe('System 1 Trunk');
    expect(store.getHomerunForZone(zone1.id)?.name).toBe('System 1 Trunk');

    // System 2 has NOT been given a raceway:
    // It MUST NOT inherit or borrow System 1's homerun raceway!
    expect(store.getSystemHomerun(sys2.id)).toBeNull();
    expect(store.getHomerunForZone(zone2.id)).toBeNull();

    // Auto-string both systems
    store.autoStringSystem(sys1.id, 18);
    store.autoStringSystem(sys2.id, 18);

    // Verify cabling isolation
    const cables1 = store.getStringCables(sys1.id);
    const cables2 = store.getStringCables(sys2.id);

    // System 1 cables must use System 1's raceway
    expect(cables1.length).toBeGreaterThan(0);
    expect(cables1.every(c => c.hasRaceway === true && c.isSharedHomerun === true)).toBe(true);

    // System 2 cables must NOT use System 1's raceway
    expect(cables2.length).toBeGreaterThan(0);
    expect(cables2.every(c => c.hasRaceway === false)).toBe(true);
    expect(cables2.every(c => c.inverterPoint?.lat === invLoc2.lat && c.inverterPoint?.lng === invLoc2.lng)).toBe(true);

    // Now give System 2 its OWN independent homerun raceway
    const sys2HomerunPts = [
      { lat: 37.777, lng: -122.424 },
      invLoc2
    ];
    store.setSystemHomerun(sys2.id, sys2HomerunPts, 2.5, 'System 2 Trunk');

    expect(store.getSystemHomerun(sys2.id)?.name).toBe('System 2 Trunk');
    expect(store.getHomerunForZone(zone2.id)?.name).toBe('System 2 Trunk');

    const updatedCables2 = store.getStringCables(sys2.id);
    expect(updatedCables2.every(c => c.hasRaceway === true && c.isSharedHomerun === true)).toBe(true);
  });

  describe('Drawn Object Deletion & Audit Lifecycle', () => {
    it('deletes keep-out obstacle by id and resets selection', () => {
      const sys = store.getSystems()[0];
      const v = [
        origin,
        localMetricToLatLng({ x: 30, y: 0 }, origin),
        localMetricToLatLng({ x: 30, y: 20 }, origin),
        localMetricToLatLng({ x: 0, y: 20 }, origin)
      ];
      const zone = store.addZone(v, 'roof', 'Array With Obstacle', sys.id);

      const koPoly = [
        localMetricToLatLng({ x: 5, y: 5 }, origin),
        localMetricToLatLng({ x: 10, y: 5 }, origin),
        localMetricToLatLng({ x: 10, y: 10 }, origin),
        localMetricToLatLng({ x: 5, y: 10 }, origin)
      ];
      const ko = store.addKeepOut(zone.id, koPoly)!;
      expect(zone.keepOuts.length).toBe(1);

      store.selectKeepOut(ko.id);
      expect(store.selectedKeepOutId).toBe(ko.id);

      const deleted = store.deleteKeepOut(ko.id);
      expect(deleted).toBe(true);
      expect(store.getZone(zone.id)?.keepOuts.length).toBe(0);
      expect(store.selectedKeepOutId).toBeNull();
    });

    it('clears system inverter location', () => {
      const sys = store.getSystems()[0];
      store.setSystemInverterLocation(sys.id, { lat: 37.77, lng: -122.42 });
      expect(store.getSystem(sys.id)?.inverterLocation).not.toBeNull();

      store.clearSystemInverterLocation(sys.id);
      expect(store.getSystem(sys.id)?.inverterLocation).toBeNull();
    });

    it('deleteSelected cleanly handles keep-out, single zone, and multi-zone selections', () => {
      const sys = store.getSystems()[0];
      const v1 = [
        origin,
        localMetricToLatLng({ x: 20, y: 0 }, origin),
        localMetricToLatLng({ x: 20, y: 20 }, origin),
        localMetricToLatLng({ x: 0, y: 20 }, origin)
      ];
      const z1 = store.addZone(v1, 'roof', 'Zone 1', sys.id);

      const v2 = [
        localMetricToLatLng({ x: 30, y: 0 }, origin),
        localMetricToLatLng({ x: 50, y: 0 }, origin),
        localMetricToLatLng({ x: 50, y: 20 }, origin),
        localMetricToLatLng({ x: 30, y: 20 }, origin)
      ];
      const z2 = store.addZone(v2, 'ground', 'Zone 2', sys.id);

      // 1. Keep-out selection takes priority
      const ko = store.addKeepOut(z1.id, [
        localMetricToLatLng({ x: 2, y: 2 }, origin),
        localMetricToLatLng({ x: 5, y: 2 }, origin),
        localMetricToLatLng({ x: 5, y: 5 }, origin),
        localMetricToLatLng({ x: 2, y: 5 }, origin)
      ])!;
      store.selectZone(z1.id);
      store.selectKeepOut(ko.id);

      expect(store.deleteSelected()).toBe('keepout');
      expect(store.getZone(z1.id)?.keepOuts.length).toBe(0);
      expect(store.getZone(z1.id)).toBeDefined();

      // 2. Multi-zone selection
      store.selectZone(z1.id, false);
      store.selectZone(z2.id, true);
      expect(store.selectedZoneIds.size).toBe(2);

      expect(store.deleteSelected()).toBe('zones');
      expect(store.getZone(z1.id)).toBeUndefined();
      expect(store.getZone(z2.id)).toBeUndefined();
      expect(store.selectedZoneIds.size).toBe(0);
      expect(store.selectedZoneId).toBeNull();

      // 3. Single zone selection
      const z3 = store.addZone(v1, 'roof', 'Zone 3', sys.id);
      store.selectZone(z3.id);
      expect(store.deleteSelected()).toBe('zone');
      expect(store.getZone(z3.id)).toBeUndefined();
      expect(store.selectedZoneId).toBeNull();
    });

    it('defaults to traverse short side and persists string traversal selection reactively', () => {
      const sys = store.getSystems()[0];
      const vertices = [
        origin,
        localMetricToLatLng({ x: 40, y: 0 }, origin),
        localMetricToLatLng({ x: 40, y: 15 }, origin),
        localMetricToLatLng({ x: 0, y: 15 }, origin)
      ];
      const zone = store.addZone(vertices, 'roof', 'Traverse Test Array', sys.id);

      // 1. Initial state defaults to 'short_side'
      expect(store.getStringTraverseDirection()).toBe('short_side');
      expect(store.getStringTraverseDirection(zone.id)).toBe('short_side');

      // 2. Auto-stringing defaults to 'short_side'
      const resDefault = store.autoStringSystem(sys.id);
      expect(resDefault.stringDirection).toBe('short_side');
      expect(resDefault.totalStrings).toBeGreaterThan(0);

      // Verify strings are properly formed
      const panelsBefore = store.getPanelsForSystem(sys.id).filter(p => p.stringId);
      expect(panelsBefore.length).toBeGreaterThan(0);

      // 3. Update traversal direction to 'long_side'
      store.setStringTraverseDirection('long_side', zone.id, true);
      expect(store.getStringTraverseDirection(zone.id)).toBe('long_side');
      expect(zone.config.stringTraverseDirection).toBe('long_side');

      // 4. Update traversal direction to 'rows'
      store.setStringTraverseDirection('rows', zone.id, true);
      expect(store.getStringTraverseDirection(zone.id)).toBe('rows');

      // 5. Update traversal direction to 'columns'
      store.setStringTraverseDirection('columns', zone.id, true);
      expect(store.getStringTraverseDirection(zone.id)).toBe('columns');

      // 6. Reset to 'short_side' (default)
      store.setStringTraverseDirection('short_side', zone.id, true);
      expect(store.getStringTraverseDirection(zone.id)).toBe('short_side');

      // 7. Test serialization & JSON export / import persistence
      const json = store.exportProjectJson();
      expect(json).toContain('"stringTraverseDirection": "short_side"');

      // Load into fresh store
      const store2 = new ProjectStore();
      store2.importProjectJson(json);
      expect(store2.getStringTraverseDirection()).toBe('short_side');
    });

    it('configures parallel roof rails (2 vs 3 rails) and recalculates structural rails', () => {
      const vertices = [
        origin,
        localMetricToLatLng({ x: 25, y: 0 }, origin),
        localMetricToLatLng({ x: 25, y: 15 }, origin),
        localMetricToLatLng({ x: 0, y: 15 }, origin)
      ];
      const zone = store.addZone(vertices, 'roof', 'Roof Rail Config Test');
      expect(zone.config.mountType).toBe('roof');
      expect(zone.railCount).toBeGreaterThan(0);
      expect(zone.rails).toBeDefined();

      const initialRailCount = zone.railCount!;
      expect(zone.config.railCount).toBe(2);

      // Change to 3 rails in parallel (ends + center)
      store.updateZoneConfig(zone.id, { railCount: 3, railOverhangM: 0.15 });
      const updatedZone = store.getZone(zone.id)!;
      expect(updatedZone.config.railCount).toBe(3);
      expect(updatedZone.config.railOverhangM).toBe(0.15);
      expect(updatedZone.railCount).toBeGreaterThan(initialRailCount);

      // Verify center rails exist
      const centerRails = updatedZone.rails!.filter(r => r.positionType === 'center');
      expect(centerRails.length).toBeGreaterThan(0);

      // Change orientation to landscape -> rails now run vertically along columns
      store.updateZoneConfig(zone.id, { orientation: 'landscape', railCount: 2 });
      const landscapeZone = store.getZone(zone.id)!;
      expect(landscapeZone.config.orientation).toBe('landscape');
      expect(landscapeZone.rails!.some(r => r.colIndex !== undefined)).toBe(true);
    });
  });
});
