import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectStore } from '../store/projectStore';
import { localMetricToLatLng } from '../geo/projection';
import { buildSldSystemModel, SingleLineDiagramUI } from './sldView';
import { TableViewTab } from './registryModal';

describe('Single Line Diagram (SLD) 2D Wireframe View', () => {
  let store: ProjectStore;
  const origin = { lat: 37.7749, lng: -122.4194 };

  beforeEach(() => {
    store = new ProjectStore();
    store.clearAll();

    // Create sample array zone in the default system
    const vertices = [
      origin,
      localMetricToLatLng({ x: 30, y: 0 }, origin),
      localMetricToLatLng({ x: 30, y: 20 }, origin),
      localMetricToLatLng({ x: 0, y: 20 }, origin)
    ];
    store.addZone(vertices, 'roof', 'Commercial Rooftop South');
  });

  it('emits well-formed XML (no bare ampersands) for both interconnection types', () => {
    const sys = store.getSelectedSystem()!;
    const sldUI = new SingleLineDiagramUI(null as unknown as HTMLElement, store);
    const bareAmp = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;
    for (const tap of ['line_side', 'load_side'] as const) {
      store.updateSystem(sys.id, { mdpTapType: tap });
      const svg = sldUI.generateWireframeSvg(buildSldSystemModel(store, sys.id));
      const offending = svg.split('\n').filter(l => !l.trim().startsWith('<!--') && bareAmp.test(l));
      expect(offending).toEqual([]);
    }
  });

  it('builds a valid electrical model for the selected system', () => {
    const systems = store.getSystems();
    expect(systems.length).toBeGreaterThan(0);
    const selectedSys = store.getSelectedSystem()!;
    expect(selectedSys).toBeDefined();

    const model = buildSldSystemModel(store, selectedSys.id);
    expect(model.system.id).toBe(selectedSys.id);
    expect(model.totalDcKwp).toBeGreaterThan(0);
    expect(model.totalAcKw).toBe(selectedSys.inverter.inverterCount * selectedSys.inverter.ratedAcPowerKw);
    expect(model.strings.length).toBeGreaterThan(0);
    expect(model.inverters.length).toBe(selectedSys.inverter.inverterCount);
    expect(model.acVoltage).toBe(400);
    expect(model.mainBreakerRatingA).toBeGreaterThan(0);

    // Verify string properties
    const str = model.strings[0];
    expect(str.stringId).toBeDefined();
    expect(str.panelCount).toBeGreaterThan(0);
    expect(str.vmp).toBeGreaterThan(0);
    expect(str.voc).toBeGreaterThan(str.vmp);
    expect(str.imp).toBeGreaterThan(0);
    expect(str.isc).toBeGreaterThan(str.imp);
    expect(str.inverterIndex).toBeGreaterThanOrEqual(1);
    expect(str.mpptIndex).toBeGreaterThanOrEqual(1);
  });

  it('generates clean 2D wireframe SVG schematic with required CAD symbols', () => {
    const selectedSys = store.getSelectedSystem()!;
    const model = buildSldSystemModel(store, selectedSys.id);

    const sldUI = new SingleLineDiagramUI(null as any, store, selectedSys.id);
    const svgStr = sldUI.generateWireframeSvg(model);

    // Check SVG container and 2D wireframe properties
    expect(svgStr).toContain('<svg');
    expect(svgStr).toContain('viewBox="0 0 2980');
    expect(svgStr).toContain('id="sldCadGrid"'); // 2D CAD engineering grid
    expect(svgStr).toContain('ELECTRICAL SINGLE LINE DIAGRAM (2D WIREFRAME)');

    // Check standard electrical schematic symbols are present
    expect(svgStr).toContain('wireframe-string'); // PV String symbol
    expect(svgStr).toContain('wireframe-dc-breaker'); // 2-Pole DC Circuit Breaker
    expect(svgStr).toContain('wireframe-dc-spd'); // Parallel DC Surge Protective Device
    expect(svgStr).toContain('DC BREAKER'); // DC Breaker column header
    expect(svgStr).toContain('DC SPD'); // DC SPD symbol and header
    expect(svgStr).toContain('PE GND'); // Grounding symbol on DC SPD
    expect(svgStr).toContain('wireframe-inverter-unit'); // Inverter enclosure
    expect(svgStr).toContain('MPPT'); // MPPT channel inputs
    expect(svgStr).toContain('wireframe-ac-breaker'); // AC circuit breaker
    expect(svgStr).toContain('MAIN AC BUSBAR'); // Main AC busbar
    expect(svgStr).toContain('UTILITY METER'); // Revenue meter
    expect(svgStr).toContain('UTILITY GRID'); // Point of Common Coupling (PCC)
    expect(svgStr).toContain('wireframe-title-block'); // ANSI/IEC title block
    expect(svgStr).toContain('wireframe-legend'); // Notes & legend

    // Check Title block content
    expect(svgStr).toContain(selectedSys.name);
    expect(svgStr).toContain('CAD STATUS: 2D WIREFRAME ONLY');
  });

  it('supports theme switching between Blueprint, Monochrome CAD, and Paper drafting', () => {
    const selectedSys = store.getSelectedSystem()!;
    const sldUI = new SingleLineDiagramUI(null as any, store, selectedSys.id);
    const model = buildSldSystemModel(store, selectedSys.id);

    // Default Blueprint theme
    const blueprintSvg = sldUI.generateWireframeSvg(model);
    expect(blueprintSvg).toContain('#081226'); // dark blueprint navy background

    // Monochrome CAD theme
    sldUI.setTheme('cad-mono');
    const cadSvg = sldUI.generateWireframeSvg(model);
    expect(cadSvg).toContain('#090d16');

    // Technical White Paper theme
    sldUI.setTheme('paper');
    const paperSvg = sldUI.generateWireframeSvg(model);
    expect(paperSvg).toContain('#f8fafc');
  });

  it('handles multi-inverter systems and groups strings correctly', () => {
    // Add a second inverter system
    const sys2 = store.addSystem('Substation B: Dual Inverters', '#10b981', {
      id: 'inv_dual',
      modelName: 'Commercial Dual 100kW',
      ratedAcPowerKw: 100,
      inverterCount: 2,
      mpptCountPerInverter: 6,
      maxStringsPerMppt: 2,
      maxDcVoltage: 1100,
      minMpptVoltage: 200,
      maxMpptVoltage: 1000,
      maxDcCurrentPerMppt: 30,
      maxDcAcRatio: 1.35
    });

    const vertices2 = [
      localMetricToLatLng({ x: 50, y: 0 }, origin),
      localMetricToLatLng({ x: 100, y: 0 }, origin),
      localMetricToLatLng({ x: 100, y: 40 }, origin),
      localMetricToLatLng({ x: 50, y: 40 }, origin)
    ];
    store.addZone(vertices2, 'ground', 'Ground Mount East', undefined, sys2.id);

    const model = buildSldSystemModel(store, sys2.id);
    expect(model.system.id).toBe(sys2.id);
    expect(model.inverters.length).toBe(2);
    expect(model.totalAcKw).toBe(200); // 2 x 100kW
    expect(model.strings.length).toBeGreaterThan(0);

    const sldUI = new SingleLineDiagramUI(null as any, store, sys2.id);
    const svgStr = sldUI.generateWireframeSvg(model);

    expect(svgStr).toContain('INVERTER #1');
    expect(svgStr).toContain('INVERTER #2');
    expect(svgStr).toContain('MAIN AC BUSBAR (MDB)');
  });

  it('handles empty systems with 0 active panels gracefully', () => {
    const emptySys = store.addSystem('Empty Future Array', '#f59e0b');
    const model = buildSldSystemModel(store, emptySys.id);

    expect(model.totalDcKwp).toBe(0);
    expect(model.strings.length).toBe(0);
    expect(model.totalActivePanels).toBe(0);

    const sldUI = new SingleLineDiagramUI(null as any, store, emptySys.id);
    const svgStr = sldUI.generateWireframeSvg(model);

    expect(svgStr).toContain('NO ACTIVE STRINGS');
    expect(svgStr).toContain('Empty Future Array');
  });

  it('connects strings across all inverters when system has 3 inverters', () => {
    const sys = store.getSelectedSystem()!;

    // Auto-string system with 1 inverter first
    store.autoStringSystem(sys.id, 18);
    const model1 = buildSldSystemModel(store, sys.id);
    expect(model1.inverters.length).toBe(1);
    expect(model1.strings.length).toBeGreaterThan(1);

    // Now update system to 3 inverters
    store.updateSystemInverter(sys.id, { inverterCount: 3 });

    // Build SLD model for the 3-inverter system
    const model3 = buildSldSystemModel(store, sys.id);
    expect(model3.inverters.length).toBe(3);

    // Verify strings are connected across all 3 inverters
    const inv1Strings = model3.strings.filter(s => s.inverterIndex === 1);
    const inv2Strings = model3.strings.filter(s => s.inverterIndex === 2);
    const inv3Strings = model3.strings.filter(s => s.inverterIndex === 3);

    expect(inv1Strings.length).toBeGreaterThan(0);
    expect(inv2Strings.length).toBeGreaterThan(0);
    expect(inv3Strings.length).toBeGreaterThan(0);

    // Every inverter has at least one MPPT populated with strings
    for (const inv of model3.inverters) {
      const populatedMppts = inv.mppts.filter(m => m.strings.length > 0);
      expect(populatedMppts.length).toBeGreaterThan(0);
      expect(inv.totalDcKwp).toBeGreaterThan(0);
      expect(inv.dcAcRatio).toBeGreaterThan(0);
    }

    // Verify wireframe SVG includes inverter units and connection paths
    const sldUI = new SingleLineDiagramUI(null as any, store, sys.id);
    const svgStr = sldUI.generateWireframeSvg(model3);
    expect(svgStr).toContain('INVERTER #1');
    expect(svgStr).toContain('INVERTER #2');
    expect(svgStr).toContain('INVERTER #3');
  });

  it('automatically splits oversized 37-panel strings to enforce inverter Vmax (1100V)', () => {
    const sys = store.getSelectedSystem()!;
    // Set 50kW commercial inverter with 1100V max DC
    store.updateSystemInverter(sys.id, {
      ratedAcPowerKw: 50,
      inverterCount: 3,
      maxDcVoltage: 1100
    });

    const activePanels = store.getPanelsForSystem(sys.id).filter(p => p.active);
    expect(activePanels.length).toBeGreaterThan(37);

    // Intentionally create an oversized legacy string of 37 panels that violates Vmax
    for (let i = 0; i < 37; i++) {
      activePanels[i].stringId = 'LEGACY-OVERSIZED-37';
      activePanels[i].stringOrder = i + 1;
      activePanels[i].inverterIndex = 1;
    }
    // And remaining panels in other strings
    for (let i = 37; i < activePanels.length; i++) {
      activePanels[i].stringId = 'STR-NORMAL';
      activePanels[i].stringOrder = i - 36;
      activePanels[i].inverterIndex = 1;
    }

    // Now call distributeStringsAcrossInverters or buildSldSystemModel
    const distributed = store.distributeStringsAcrossInverters(sys.id, 3, false);
    expect(distributed).toBe(true);

    // Build the SLD model
    const model = buildSldSystemModel(store, sys.id);

    // Verify that NO string has 37 panels and NO string exceeds maxPanelsPerString (20)
    expect(model.hasVoltageViolations).toBe(false);
    for (const str of model.strings) {
      expect(str.panelCount).toBeLessThanOrEqual(model.maxAllowedPanelsPerString);
      expect(str.panelCount).toBeLessThanOrEqual(20);
      expect(str.coldVoc).toBeLessThanOrEqual(1100);
      expect(str.isVoltageCompliant).toBe(true);
    }

    // Verify the oversized 37 panels were split into compliant sub-strings (e.g. 19 and 18)
    const splitSubStrings = model.strings.filter(s => s.panelCount === 18 || s.panelCount === 19);
    expect(splitSubStrings.length).toBeGreaterThanOrEqual(2);
  });

  it('flags voltage violations in wireframe SVG if any string exceeds max allowable DC voltage', () => {
    const sys = store.getSelectedSystem()!;
    const model = buildSldSystemModel(store, sys.id);

    // Artificially inject a non-compliant string into the model to test SVG visual alert rendering
    model.hasVoltageViolations = true;
    model.strings.push({
      stringId: 'TEST-OVERVOLTAGE',
      panelCount: 37,
      nominalPowerW: 600,
      totalKwp: 22.2,
      vmp: 1487.4,
      voc: 1779.7,
      coldVoc: 1954.1,
      imp: 14.93,
      isc: 15.8,
      zoneId: 'z1',
      zoneName: 'Test Zone',
      inverterIndex: 1,
      mpptIndex: 1,
      mpptId: 'INV1-MPPT1',
      isVoltageCompliant: false,
      voltageViolationMsg: 'Exceeds max allowable DC voltage'
    });

    const sldUI = new SingleLineDiagramUI(null as any, store, sys.id);
    const svgStr = sldUI.generateWireframeSvg(model);

    // Expect warning tag and alert styling in SVG
    expect(svgStr).toContain('⚠️ EXCEEDS VMAX');
    expect(svgStr).toContain('Cold: 1954.1V > 1100V');
    expect(svgStr).toContain('wireframe-string-danger');
  });

  it('supports single-phase and 3-phase AC configurations with dynamic voltage and current calculations', () => {
    const sys = store.getSelectedSystem()!;

    // 1. Configure as 3-Phase 480V (US Commercial)
    store.updateSystemInverter(sys.id, {
      ratedAcPowerKw: 100,
      inverterCount: 1,
      phase: 'three_phase',
      acVoltage: 480,
      gridFrequencyHz: 60
    });

    const model3Ph = buildSldSystemModel(store, sys.id);
    expect(model3Ph.phase).toBe('three_phase');
    expect(model3Ph.isThreePhase).toBe(true);
    expect(model3Ph.acVoltage).toBe(480);
    expect(model3Ph.gridFrequencyHz).toBe(60);

    // 3-Phase Current: I = P / (sqrt(3) * V) = 100,000 / (1.732 * 480) ≈ 120.3A
    const expectedCurrent3Ph = Number((100000 / (Math.sqrt(3) * 480)).toFixed(1));
    expect(model3Ph.inverters[0].ratedAcCurrentA).toBe(expectedCurrent3Ph);

    const sldUI3Ph = new SingleLineDiagramUI(null as any, store, sys.id);
    const svg3Ph = sldUI3Ph.generateWireframeSvg(model3Ph);
    expect(svg3Ph).toContain('AC 3Φ');
    expect(svg3Ph).toContain('480V 60Hz');
    expect(svg3Ph).toContain('3P+N+PE');
    expect(svg3Ph).toContain('3-PHASE MAIN AC BUSBAR');

    // 2. Switch to Single-Phase 230V
    store.updateSystemInverter(sys.id, {
      ratedAcPowerKw: 10,
      inverterCount: 1,
      phase: 'single_phase',
      acVoltage: 230,
      gridFrequencyHz: 50
    });

    const model1Ph = buildSldSystemModel(store, sys.id);
    expect(model1Ph.phase).toBe('single_phase');
    expect(model1Ph.isThreePhase).toBe(false);
    expect(model1Ph.acVoltage).toBe(230);
    expect(model1Ph.gridFrequencyHz).toBe(50);

    // Single-Phase Current: I = P / V = 10,000 / 230 ≈ 43.5A
    const expectedCurrent1Ph = Number((10000 / 230).toFixed(1));
    expect(model1Ph.inverters[0].ratedAcCurrentA).toBe(expectedCurrent1Ph);

    const sldUI1Ph = new SingleLineDiagramUI(null as any, store, sys.id);
    const svg1Ph = sldUI1Ph.generateWireframeSvg(model1Ph);
    expect(svg1Ph).toContain('AC 1Φ');
    expect(svg1Ph).toContain('230V 50Hz');
    expect(svg1Ph).toContain('SINGLE-PHASE MAIN AC BUSBAR');
    expect(svg1Ph).toContain('MAIN MCB');
    expect(svg1Ph).toContain('2P');
  });

  it('autocomputes AC and DC wire sizes following Philippine Electrical Code (PEC 2017) standards', () => {
    const sys = store.getSelectedSystem()!;

    // 50kW 3-Phase 400V system
    store.updateSystemInverter(sys.id, {
      ratedAcPowerKw: 50,
      inverterCount: 1,
      phase: 'three_phase',
      acVoltage: 400,
      gridFrequencyHz: 60
    });

    const model = buildSldSystemModel(store, sys.id);

    // Verify PEC calculation objects exist
    expect(model.mainFeederWireSizing).toBeDefined();
    expect(model.dcStringWireSizing).toBeDefined();
    expect(model.inverters[0].pecWireSizing).toBeDefined();

    // 50kW @ 400V 3-Phase:
    // I_rated = 50000 / (sqrt(3) * 400) = 72.17A
    // I_design = 72.17 * 1.25 = 90.21A
    // OCPD rating = 100A
    // Conductor ampacity >= 90.21A -> 30 mm² THHN (100A ampacity)
    // EGC for 100A OCPD -> 14 mm²
    const invSizing = model.inverters[0].pecWireSizing;
    expect(invSizing.ratedCurrentA).toBeCloseTo(72.2, 0);
    expect(invSizing.designCurrentA).toBeCloseTo(90.2, 0);
    expect(invSizing.ocpdRatingA).toBe(100);
    expect(invSizing.phaseConductorMm2).toBe(30);
    expect(invSizing.egcConductorMm2).toBe(14);
    expect(invSizing.fullCallout).toContain('4× 30 mm² THHN/THWN-2 + 1× 14 mm² EGC');
    expect(invSizing.conduitLabel).toContain('40 mmø');

    // DC String sizing: standard module Isc ~ 15.8A with paralleled strings -> 6.0mm² PV1-F solar cable
    expect(model.dcStringWireSizing.cableMm2).toBe(6.0);
    expect(model.dcStringWireSizing.fullCallout).toContain('PV1-F');

    // Generate SLD Wireframe SVG and verify visual PEC wire size tags
    const sldUI = new SingleLineDiagramUI(null as any, store, sys.id);
    const svg = sldUI.generateWireframeSvg(model);

    // 1. DC wire indicators
    expect(svg).toContain('(+) 6mm²');
    expect(svg).toContain('PEC: 2× 6mm² PV1-F');

    // 2. Inverter AC feeder callout badge
    expect(svg).toContain('wireframe-pec-feeder-badge');
    expect(svg).toContain('PEC: 4×30mm² + 14mm²G');
    expect(svg).toContain('in 40 mmø (1-1/2") EMT');
    expect(svg).toContain('100A 3P');

    // 3. Main AC feeder callout badge
    expect(svg).toContain('wireframe-pec-main-feeder');
    expect(svg).toContain('PEC MAIN: 4×30mm² + 14mm²G');

    // 4. Title block & General Notes with PEC citations
    expect(svg).toContain('PEC 2017 Cu THHN/THWN-2');
    expect(svg).toContain('GENERAL ELECTRICAL NOTES (PHILIPPINE ELECTRICAL CODE 2017)');
    expect(svg).toContain('PEC 6.90.2.1');
    expect(svg).toContain('PEC 2017 Table 2.50.6.13');

    // 5. Cable Schedule Modal rendering
    (sldUI as any).showCableSchedule = true;
    const modalHtml = sldUI.renderCableScheduleModal(model);
    expect(modalHtml).toContain('PHILIPPINE ELECTRICAL CODE (PEC 2017) CABLE &amp; CONDUIT SCHEDULE');
    expect(modalHtml).toContain('DC-STR-01..');
    expect(modalHtml).toContain('INV-01-AC');
    expect(modalHtml).toContain('MAIN-AC-SERVICE');
    expect(modalHtml).toContain('THHN');
    expect(modalHtml).toContain('25A 2P DC MCB + Type 2 DC SPD (⏚)');
  });

  it('renders DC breakers and parallel grounded DC SPDs for DC string protection in SLD', () => {
    const selectedSys = store.getSelectedSystem()!;
    const model = buildSldSystemModel(store, selectedSys.id);
    const sldUI = new SingleLineDiagramUI(null as any, store, selectedSys.id);
    const svg = sldUI.generateWireframeSvg(model);

    // 2-Pole DC Breakers
    expect(svg).toContain('wireframe-dc-breaker');
    expect(svg).toContain('2P DC MCB');
    expect(svg).toContain('25A');

    // DC SPDs running parallel and grounded ahead of the DC Breaker
    expect(svg).toContain('wireframe-dc-spd');
    expect(svg).toContain('DC SPD');
    expect(svg).toContain('Type 2');
    expect(svg).toContain('PE GND');
    expect(svg).toContain('wireframe-dc-ground-bus');
    expect(svg).toContain('TO GROUND ROD (PEC 2.50)');

    // Verify DC SPD is placed before DC Breaker in schematic flow
    const spdIndex = svg.indexOf('wireframe-dc-spd');
    const breakerIndex = svg.indexOf('wireframe-dc-breaker');
    expect(spdIndex).toBeGreaterThan(-1);
    expect(breakerIndex).toBeGreaterThan(-1);
    expect(spdIndex).toBeLessThan(breakerIndex);

    // Column headers order: DC SPD (⏚) ahead of DC BREAKER
    expect(svg).toContain('DC BREAKER');
    expect(svg).toContain('DC SPD (⏚)');
    const headerSpdIndex = svg.indexOf('DC SPD (⏚)');
    const headerBreakerIndex = svg.indexOf('DC BREAKER');
    expect(headerSpdIndex).toBeLessThan(headerBreakerIndex);

    // General Electrical Notes
    expect(svg).toContain('2-pole DC Circuit Breakers');
    expect(svg).toContain('parallel grounded Type 2 DC SPDs');

    // Cable Schedule
    (sldUI as any).showCableSchedule = true;
    const schedule = sldUI.renderCableScheduleModal(model);
    expect(schedule).toContain('25A 2P DC MCB + Type 2 DC SPD (⏚)');
  });

  it('ensures MDP enclosure remains neatly and appropriately sized when SLD is tall due to many strings', () => {
    // Add multiple large zones to generate many strings
    for (let i = 1; i <= 4; i++) {
      const vertices = [
        localMetricToLatLng({ x: 0, y: i * 30 }, origin),
        localMetricToLatLng({ x: 60, y: i * 30 }, origin),
        localMetricToLatLng({ x: 60, y: i * 30 + 25 }, origin),
        localMetricToLatLng({ x: 0, y: i * 30 + 25 }, origin)
      ];
      store.addZone(vertices, 'roof', `Commercial Rooftop Zone ${i}`);
    }

    const selectedSys = store.getSelectedSystem()!;
    const model = buildSldSystemModel(store, selectedSys.id);
    expect(model.strings.length).toBeGreaterThan(20);

    const sldUI = new SingleLineDiagramUI(null as any, store, selectedSys.id);
    const svg = sldUI.generateWireframeSvg(model);

    // Verify MDP outer frame height is appropriately sized (275px) and does not stretch
    const mdpFrameMatch = svg.match(/<g class="wireframe-mdp-enclosure">\s*<!-- Panel Outer Frame -->\s*<rect [^>]*height="(\d+)"/);
    expect(mdpFrameMatch).not.toBeNull();
    const mdpHeight = parseInt(mdpFrameMatch![1], 10);
    expect(mdpHeight).toBe(275); // Fixed, neat 275px height, not thousands of pixels!

    // Verify Utility Grid and Utility Meter are present and neatly proportioned
    expect(svg).toContain('wireframe-grid-pcc');
    expect(svg).toContain('wireframe-revenue-meter');
    expect(svg).toContain('UTILITY GRID');
    expect(svg).toContain('UTILITY METER');
    expect(svg).toContain('MAIN DISTRIBUTION PANEL (MDP)');
  });

  it('verifies TableViewTab includes sld tab for table schedules navigation', () => {
    const tab: TableViewTab = 'sld';
    expect(tab).toBe('sld');
  });

  it('zooms toward cursor location preserving the point under cursor', () => {
    const selectedSys = store.getSelectedSystem()!;
    const mockContainer = {
      innerHTML: '',
      querySelector: (sel: string) => {
        if (sel === '#sld-canvas-viewport') {
          return {
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
            addEventListener: () => {},
            style: {}
          };
        }
        if (sel === '#sld-svg-element') {
          return {
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
            viewBox: { baseVal: { width: 2000, height: 1200 } }
          };
        }
        if (sel === '#sld-viewport-group') {
          return {
            setAttribute: () => {}
          };
        }
        if (sel === '#sld-zoom-badge') {
          return { textContent: '' };
        }
        return null;
      },
      querySelectorAll: () => []
    };

    const sldUI = new SingleLineDiagramUI(mockContainer as any, store, selectedSys.id);
    expect(sldUI.getZoomLevel()).toBe(1.0);
    expect(sldUI.getPan()).toEqual({ x: 0, y: 0 });

    // Cursor at (400, 300) screen pixels -> in SVG viewBox space (with scale 2000/1000 = 2), this is (800, 600)
    const cursorClientX = 400;
    const cursorClientY = 300;
    const svgPointBefore = sldUI.clientToSvgPoint(cursorClientX, cursorClientY);
    expect(svgPointBefore.x).toBe(800);
    expect(svgPointBefore.y).toBe(600);

    // Initial local point under cursor: (svgPoint - pan) / zoom = (800 - 0) / 1.0 = 800
    const localXBefore = (svgPointBefore.x - sldUI.getPan().x) / sldUI.getZoomLevel();
    const localYBefore = (svgPointBefore.y - sldUI.getPan().y) / sldUI.getZoomLevel();

    // Zoom in at cursor location by 1.25x
    sldUI.zoomIn(cursorClientX, cursorClientY);
    expect(sldUI.getZoomLevel()).toBe(1.25);

    // After zooming, the same SVG point under cursor must map to the EXACT same local point
    const panAfter = sldUI.getPan();
    const localXAfter = (svgPointBefore.x - panAfter.x) / sldUI.getZoomLevel();
    const localYAfter = (svgPointBefore.y - panAfter.y) / sldUI.getZoomLevel();

    expect(localXAfter).toBeCloseTo(localXBefore, 2);
    expect(localYAfter).toBeCloseTo(localYBefore, 2);

    // Zoom out at cursor location
    sldUI.zoomOut(cursorClientX, cursorClientY);
    expect(sldUI.getZoomLevel()).toBe(1.0);
    expect(sldUI.getPan().x).toBeCloseTo(0, 1);
    expect(sldUI.getPan().y).toBeCloseTo(0, 1);

    // Reset zoom
    sldUI.resetZoom();
    expect(sldUI.getZoomLevel()).toBe(1.0);
    expect(sldUI.getPan()).toEqual({ x: 0, y: 0 });
  });

  it('designs and renders a power transformer when inverter AC voltage does not match system voltage', () => {
    const sys = store.getSelectedSystem()!;

    // Inverter 400V 3Φ, Grid Tapping Point 230V 3Φ -> Transformer required
    store.updateSystemInverter(sys.id, {
      acVoltage: 400,
      phase: 'three_phase',
      ratedAcPowerKw: 100
    });
    store.updateSystem(sys.id, {
      systemVoltageV: 230
    });

    const model = buildSldSystemModel(store, sys.id);
    expect(model.transformerDesign.required).toBe(true);
    expect(model.transformerDesign.type).toBe('step_down');
    expect(model.transformerDesign.primaryVoltageV).toBe(400);
    expect(model.transformerDesign.secondaryVoltageV).toBe(230);
    expect(model.transformerDesign.transformerKva).toBe(125);

    const sldUI = new SingleLineDiagramUI(null as any, store, sys.id);
    const svg = sldUI.generateWireframeSvg(model);

    // Verify Transformer schematic elements in SVG
    expect(svg).toContain('wireframe-transformer');
    expect(svg).toContain('POWER TRANSFORMER');
    expect(svg).toContain('125 kVA • STEP-DOWN');
    expect(svg).toContain('Dyn11');
    expect(svg).toContain('wireframe-xfm-pri-badge');
    expect(svg).toContain('wireframe-xfm-sec-badge');
    expect(svg).toContain('XFM SEC MCCB');
    expect(svg).toContain('viewBox="0 0 3550'); // Dynamic SVG width expansion for transformer
  });

  it('renders AC Combiner Box collector breaker when enabled, and bypasses when disabled', () => {
    const sys = store.getSelectedSystem()!;

    // 1. With AC Combiner enabled
    store.updateSystem(sys.id, {
      hasAcCombiner: true
    });
    const modelWithComb = buildSldSystemModel(store, sys.id);
    expect(modelWithComb.hasAcCombiner).toBe(true);
    const sldUIWith = new SingleLineDiagramUI(null as any, store, sys.id);
    const svgWith = sldUIWith.generateWireframeSvg(modelWithComb);

    expect(svgWith).toContain('wireframe-combiner-breaker');
    expect(svgWith).toContain('COLLECTOR MCCB');
    expect(svgWith).toContain('AC Combiner Box');

    // 2. With AC Combiner disabled
    store.updateSystem(sys.id, {
      hasAcCombiner: false
    });
    const modelWithoutComb = buildSldSystemModel(store, sys.id);
    expect(modelWithoutComb.hasAcCombiner).toBe(false);
    const sldUIWithout = new SingleLineDiagramUI(null as any, store, sys.id);
    const svgWithout = sldUIWithout.generateWireframeSvg(modelWithoutComb);

    expect(svgWithout).not.toContain('wireframe-combiner-breaker');
    expect(svgWithout).not.toContain('COLLECTOR MCCB');
  });

  it('renders Main Distribution Panel (MDP) with Load-Side vs Line-Side Tap and indicates Facility Load tap', () => {
    const sys = store.getSelectedSystem()!;

    // 1. Load-Side Tap (PEC 6.90.8.2 / 120% Bus Rule)
    store.updateSystem(sys.id, {
      mdpTapType: 'load_side'
    });
    const modelLoad = buildSldSystemModel(store, sys.id);
    const sldUILoad = new SingleLineDiagramUI(null as any, store, sys.id);
    const svgLoad = sldUILoad.generateWireframeSvg(modelLoad);

    // MDP Enclosure and Sections
    expect(svgLoad).toContain('wireframe-mdp-enclosure');
    expect(svgLoad).toContain('MAIN DISTRIBUTION PANEL (MDP)');
    expect(svgLoad).toContain('LOAD SIDE (FACILITY BUS)');
    expect(svgLoad).toContain('LINE SIDE (UTILITY SERVICE)');
    expect(svgLoad).toContain('MDP MAIN MCCB');

    // Facility Load must be tapped on Load Side
    expect(svgLoad).toContain('wireframe-facility-load');
    expect(svgLoad).toContain('FACILITY LOAD');
    expect(svgLoad).toContain('▲ TAPPED ON LOAD SIDE');

    // Load side backfed breaker
    expect(svgLoad).toContain('wireframe-pv-backfed-breaker');
    expect(svgLoad).toContain('PV TIE MCCB');
    expect(svgLoad).toContain('LOAD-SIDE TAP: PEC 6.90.8.2');

    // 2. Line-Side Tap (PEC 6.90.8.1 / Supply-Side Tap Ahead of Main Breaker)
    store.updateSystem(sys.id, {
      mdpTapType: 'line_side'
    });
    const modelLine = buildSldSystemModel(store, sys.id);
    const sldUILine = new SingleLineDiagramUI(null as any, store, sys.id);
    const svgLine = sldUILine.generateWireframeSvg(modelLine);

    // Line side supply tap breaker
    expect(svgLine).toContain('wireframe-pv-supply-breaker');
    expect(svgLine).toContain('PV SUPPLY TAP CB');
    expect(svgLine).toContain('SUPPLY TAP POINT');
    expect(svgLine).toContain('LINE-SIDE TAP: PEC 6.90.8.1');

    // Facility Load is still tapped on Load Side of MDP Main Breaker
    expect(svgLine).toContain('FACILITY LOAD');
    expect(svgLine).toContain('▲ TAPPED ON LOAD SIDE');
  });

  it('orients utility grid, meter, and MDP vertically and aligns solar connection to the tapping point', () => {
    const sys = store.getSelectedSystem()!;
    const model = buildSldSystemModel(store, sys.id);
    const sldUI = new SingleLineDiagramUI(null as any, store, sys.id);
    const svg = sldUI.generateWireframeSvg(model);

    // 1. Vertical sequence in SVG elements: Grid PCC -> Utility Meter -> MDP Enclosure
    const gridElemIdx = svg.indexOf('wireframe-grid-pcc');
    const meterElemIdx = svg.indexOf('wireframe-revenue-meter');
    const mdpElemIdx = svg.indexOf('wireframe-mdp-enclosure');

    expect(gridElemIdx).toBeGreaterThan(0);
    expect(meterElemIdx).toBeGreaterThan(gridElemIdx);
    expect(mdpElemIdx).toBeGreaterThan(meterElemIdx);

    // 2. Service conductor labels & connections:
    expect(svg).toContain('SERVICE ENTRANCE');
    expect(svg).toContain('UTILITY SERVICE');
    expect(svg).toContain('UTILITY METER');
    expect(svg).toContain('UTILITY GRID');
    expect(svg).toContain('MAIN DISTRIBUTION PANEL (MDP)');

    // 3. Aligned horizontal solar feeder with in-line breaker
    expect(svg).toContain('class="wireframe-tap-toggle-btn"');

    // 4. Test switching tapping point changes breaker orientation relative to tap point
    // Default or line_side: Breaker is below tap point
    store.updateSystem(sys.id, { mdpTapType: 'line_side' });
    const lineModel = buildSldSystemModel(store, sys.id);
    const lineSvg = sldUI.generateWireframeSvg(lineModel);
    expect(lineSvg).toContain('PV SUPPLY TAP CB');
    expect(lineSvg).toContain('SUPPLY TAP POINT');
    expect(lineSvg).toContain('LINE-SIDE TAP: PEC 6.90.8.1');

    // load_side: Breaker is above tap point
    store.updateSystem(sys.id, { mdpTapType: 'load_side' });
    const loadModel = buildSldSystemModel(store, sys.id);
    const loadSvg = sldUI.generateWireframeSvg(loadModel);
    expect(loadSvg).toContain('PV TIE MCCB');
    expect(loadSvg).toContain('LOAD TAP POINT');
    expect(loadSvg).toContain('LOAD-SIDE TAP: PEC 6.90.8.2');
  });

  it('generates fully compliant standalone SVG with explicit dimensions, solid background, and valid XML encoding', () => {
    const sys = store.getSelectedSystem()!;
    // Update system name with special characters to test XML escaping
    store.updateSystem(sys.id, {
      name: 'Commercial Solar & Storage <Phase 1>'
    });
    const model = buildSldSystemModel(store, sys.id);
    const sldUI = new SingleLineDiagramUI(null as any, store, sys.id);
    const standaloneSvg = sldUI.generateStandaloneSvg(model);

    // 1. Valid XML header & root svg tag
    expect(standaloneSvg.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="no"?>')).toBe(true);
    expect(standaloneSvg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(standaloneSvg).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');

    // 2. Explicit pixel dimensions matching CAD canvas
    expect(standaloneSvg).toMatch(/width="\d+"/);
    expect(standaloneSvg).toMatch(/height="\d+"/);
    expect(standaloneSvg).not.toMatch(/<svg[^>]+width="100%"/);

    // 3. Embedded font style block
    expect(standaloneSvg).toContain('<style type="text/css">');

    // 4. Solid background fill present
    expect(standaloneSvg).toContain('<rect width="100%" height="100%" fill="#081226" />');

    // 5. No invalid XML entities like &bull; or bare &
    expect(standaloneSvg).not.toContain('&bull;');
    expect(standaloneSvg).toContain('Commercial Solar &amp; Storage &lt;Phase 1&gt;');
  });

  it('renders refined toolbar with HUD telemetry bar, architecture badges, and export buttons', () => {
    const sys = store.getSelectedSystem()!;
    const mockContainer: any = {
      innerHTML: '',
      querySelector: () => null,
      querySelectorAll: () => []
    };
    const sldUI = new SingleLineDiagramUI(mockContainer, store, sys.id);
    sldUI.render();

    // Refined badge title
    expect(mockContainer.innerHTML).toContain('class="sld-badge-title"');
    expect(mockContainer.innerHTML).toContain('SLD');

    // Architecture badge strip
    expect(mockContainer.innerHTML).toContain('class="sld-arch-strip"');
    expect(mockContainer.innerHTML).toContain('class="sld-arch-tag inv"');
    expect(mockContainer.innerHTML).toContain('class="sld-arch-tag grid"');

    // Live Telemetry HUD Bar
    expect(mockContainer.innerHTML).toContain('class="sld-hud-bar"');
    expect(mockContainer.innerHTML).toContain('class="sld-hud-stat primary"');
    expect(mockContainer.innerHTML).toContain('class="sld-hud-stat ac"');

    // Export group buttons
    expect(mockContainer.innerHTML).toContain('class="sld-btn-group sld-export-group"');
    expect(mockContainer.innerHTML).toContain('id="sld-btn-export-svg"');
    expect(mockContainer.innerHTML).toContain('id="sld-btn-export-png"');

    // Test calling export methods safely
    expect(() => sldUI.exportSvg()).not.toThrow();
    expect(() => sldUI.exportPng()).not.toThrow();
  });

  it('supports rotating the SLD 90 degrees so the sheet expands horizontally (wider) rather than taller', () => {
    const sys = store.getSelectedSystem()!;
    const model = buildSldSystemModel(store, sys.id);

    const mockContainer: any = {
      innerHTML: '',
      querySelector: () => null,
      querySelectorAll: () => []
    };
    const sldUI = new SingleLineDiagramUI(mockContainer, store, sys.id);

    // Initial state: 0 degrees
    expect(sldUI.getRotation()).toBe(0);
    const standardSvg = sldUI.generateWireframeSvg(model);
    expect(standardSvg).toContain('viewBox="0 0 2980'); // standard orientation
    expect(standardSvg).not.toContain('id="sld-rotation-group"');

    // Rotate to 90 degrees wide
    sldUI.setRotation(90);
    expect(sldUI.getRotation()).toBe(90);

    const rotatedSvg = sldUI.generateWireframeSvg(model);
    // Base height for this model (e.g. 900px) should now be viewBox width, and 2980 is viewBox height
    const vbMatch = rotatedSvg.match(/viewBox="0 0 (\d+) (\d+)"/);
    expect(vbMatch).not.toBeNull();
    const rotatedW = parseInt(vbMatch![1], 10);
    const rotatedH = parseInt(vbMatch![2], 10);
    expect(rotatedH).toBe(2980); // base width became viewBox height
    expect(rotatedW).toBeLessThan(2980); // base height became viewBox width
    expect(rotatedSvg).toContain('id="sld-rotation-group"');
    expect(rotatedSvg).toContain(`transform="rotate(90) translate(0, -${rotatedW})"`);

    // Verify toolbar button state
    sldUI.render();
    expect(mockContainer.innerHTML).toContain('id="sld-btn-rotate"');
    expect(mockContainer.innerHTML).toContain('🔄 90° Wide');
    expect(mockContainer.innerHTML).toContain('active');

    // Verify standalone SVG export reflects rotated dimensions
    const standaloneRotated = sldUI.generateStandaloneSvg(model);
    expect(standaloneRotated).toContain(`width="${rotatedW}"`);
    expect(standaloneRotated).toContain(`height="${rotatedH}"`);
    expect(standaloneRotated).toContain(`viewBox="0 0 ${rotatedW} ${rotatedH}"`);

    // Test rotate() cycling (90 -> 270 -> 0)
    sldUI.rotate();
    expect(sldUI.getRotation()).toBe(270);
    sldUI.rotate();
    expect(sldUI.getRotation()).toBe(0);
  });

  it('embeds the PEC Cable and Conduit Schedule table directly on the SLD canvas near the MDP with compact 2-row wrapped text', () => {
    const sys = store.getSelectedSystem()!;
    const model = buildSldSystemModel(store, sys.id);
    const sldUI = new SingleLineDiagramUI(null as any, store, sys.id);

    const svg = sldUI.generateWireframeSvg(model);

    // 1. Table structure and container
    expect(svg).toContain('class="wireframe-pec-cable-schedule"');
    expect(svg).toContain('id="sld-pec-cable-schedule"');
    expect(svg).toContain('PEC 2017 CABLE &amp; CONDUIT SCHEDULE');

    // 2. Table Column Headers (wrapped across 2 rows maximum)
    expect(svg).toContain('CIRCUIT');
    expect(svg).toContain('TAG');
    expect(svg).toContain('ROUTE');
    expect(svg).toContain('VOLTS /');
    expect(svg).toContain('PHASE');
    expect(svg).toContain('RATED /');
    expect(svg).toContain('DESIGN');
    expect(svg).toContain('OCPD');
    expect(svg).toContain('RATING');
    expect(svg).toContain('CONDUCTORS');
    expect(svg).toContain('(Cu 75°C)');
    expect(svg).toContain('EGC');
    expect(svg).toContain('(GND)');
    expect(svg).toContain('CONDUIT /');
    expect(svg).toContain('RACEWAY');
    expect(svg).toContain('PEC');
    expect(svg).toContain('STD');

    // 3. Compact Circuit rows with 2-row wrapped content
    expect(svg).toContain('DC-STR-01'); // DC PV strings
    expect(svg).toContain('INV-01-AC'); // Inverter AC feeder
    expect(svg).toContain('ACCB-COLL'); // Combiner collector
    expect(svg).toContain('MDP-SERVICE'); // MDP service entrance

    // 4. Compact 640px width positioned directly under MDP (tableX = 1920, MDP is 2020..2460)
    expect(svg).toMatch(/transform="translate\(1920,\s*\d+\)"/);
    expect(svg).toContain('width="640"');

    // 5. Standalone SVG export contains embedded schedule table
    const standaloneSvg = sldUI.generateStandaloneSvg(model);
    expect(standaloneSvg).toContain('id="sld-pec-cable-schedule"');
    expect(standaloneSvg).toContain('PEC 2017 CABLE &amp; CONDUIT SCHEDULE');
    expect(standaloneSvg).toContain('width="640"');

    // 6. Mathematical non-overlap check: Title Block must be strictly below the schedule table
    const tableMatch = svg.match(/id="sld-pec-cable-schedule"\s+transform="translate\(\d+,\s*(\d+)\)"/);
    expect(tableMatch).not.toBeNull();
    const tableY = parseInt(tableMatch![1], 10);

    const titleBlockMatch = svg.match(/class="wireframe-title-block"\s+transform="translate\(\d+,\s*(\d+)\)"/);
    expect(titleBlockMatch).not.toBeNull();
    const titleBlockY = parseInt(titleBlockMatch![1], 10);

    // Title Block Y must be >= tableY + tableHeight + 40
    expect(titleBlockY).toBeGreaterThanOrEqual(tableY + 170 + 40);
  });

  it('guarantees no overlap between PEC schedule table and title block with multi-inverters and transformer', () => {
    // Replicate the exact system from user screenshot: 2 inverters, transformer required, 9 strings
    const sys2 = store.addSystem('Substation Commercial 100kW', '#10b981', {
      id: 'inv_dual_xfm',
      modelName: 'Commercial Dual 50kW',
      ratedAcPowerKw: 50,
      inverterCount: 2,
      mpptCountPerInverter: 4,
      maxStringsPerMppt: 2,
      maxDcVoltage: 1100,
      minMpptVoltage: 200,
      maxMpptVoltage: 1000,
      maxDcCurrentPerMppt: 30,
      maxDcAcRatio: 1.35
    });

    // Inverter voltage 230V, system voltage 400V -> requires transformer (6 rows in schedule)
    store.updateSystemInverter(sys2.id, { acVoltage: 230 });
    store.updateSystem(sys2.id, { systemVoltageV: 400 });

    const vertices = [
      origin,
      localMetricToLatLng({ x: 40, y: 0 }, origin),
      localMetricToLatLng({ x: 40, y: 30 }, origin),
      localMetricToLatLng({ x: 0, y: 30 }, origin)
    ];
    store.addZone(vertices, 'roof', 'Commercial Roof 2', undefined, sys2.id);

    const model = buildSldSystemModel(store, sys2.id);
    expect(model.transformerDesign.required).toBe(true);
    expect(model.inverters.length).toBe(2);

    const sldUI = new SingleLineDiagramUI(null as any, store, sys2.id);
    const svg = sldUI.generateWireframeSvg(model);

    // Extract table Y and Title Block Y
    const tableMatch = svg.match(/id="sld-pec-cable-schedule"\s+transform="translate\(\d+,\s*(\d+)\)"/);
    expect(tableMatch).not.toBeNull();
    const tableY = parseInt(tableMatch![1], 10);

    const titleBlockMatch = svg.match(/class="wireframe-title-block"\s+transform="translate\(\d+,\s*(\d+)\)"/);
    expect(titleBlockMatch).not.toBeNull();
    const titleBlockY = parseInt(titleBlockMatch![1], 10);

    // Schedule has 6 rows: DC + INV1 + INV2 + XFM-PRI + XFM-SEC + MDP = 222px table height
    // Title block MUST be at least 40px below the bottom of the table
    expect(titleBlockY).toBeGreaterThanOrEqual(tableY + 222 + 40);

    // Verify SVG viewBox height expanded to cleanly accommodate the non-overlapping layout
    const viewBoxMatch = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    expect(viewBoxMatch).not.toBeNull();
    const vbHeight = parseInt(viewBoxMatch![2], 10);
    expect(vbHeight).toBeGreaterThanOrEqual(titleBlockY + 140 + 35);
  });
});
