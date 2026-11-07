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
    expect(svgStr).toContain('viewBox="0 0 1750');
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

    // DC SPDs running parallel and grounded
    expect(svg).toContain('wireframe-dc-spd');
    expect(svg).toContain('DC SPD');
    expect(svg).toContain('Type 2');
    expect(svg).toContain('PE GND');

    // Column headers
    expect(svg).toContain('DC BREAKER');
    expect(svg).toContain('DC SPD (⏚)');

    // General Electrical Notes
    expect(svg).toContain('2-pole DC Circuit Breakers');
    expect(svg).toContain('parallel grounded Type 2 DC SPDs');

    // Cable Schedule
    (sldUI as any).showCableSchedule = true;
    const schedule = sldUI.renderCableScheduleModal(model);
    expect(schedule).toContain('25A 2P DC MCB + Type 2 DC SPD (⏚)');
  });

  it('verifies TableViewTab includes sld tab for table schedules navigation', () => {
    const tab: TableViewTab = 'sld';
    expect(tab).toBe('sld');
  });
});
