import { describe, it, expect } from 'vitest';
import {
  sizePecAcFeeder,
  sizePecEgc,
  sizePecDcStringWire,
  PEC_COPPER_THHN_75C,
  PEC_EGC_TABLE
} from './pecWireSizing';

describe('Philippine Electrical Code (PEC) Wire Sizing', () => {
  it('sizes 3-Phase 50 kW AC inverter feeder at 400V correctly per PEC', () => {
    expect(PEC_COPPER_THHN_75C.length).toBeGreaterThan(0);
    expect(PEC_EGC_TABLE.length).toBeGreaterThan(0);
    expect(sizePecEgc(100).copperSizeMm2).toBe(14);
    const res = sizePecAcFeeder(50, 'three_phase', 400, 'ac_inverter');

    // Rated current: 50,000 / (sqrt(3) * 400) = 72.2A
    expect(res.ratedCurrentA).toBe(72.2);
    // Design current: 72.2 * 1.25 = 90.25A -> 90.3A (continuous duty 125%)
    expect(res.designCurrentA).toBe(90.3);
    // Standard OCPD: 100A
    expect(res.ocpdRatingA).toBe(100);
    // Conductor ampacity >= 90.2A: 30 mm² (100A ampacity)
    expect(res.phaseConductorMm2).toBe(30);
    // EGC for 100A OCPD: 14 mm²
    expect(res.egcConductorMm2).toBe(14);
    expect(res.conductorsPerSet).toBe(4);
    expect(res.numSets).toBe(1);

    expect(res.fullCallout).toContain('4× 30 mm² THHN/THWN-2');
    expect(res.fullCallout).toContain('1× 14 mm² EGC');
    expect(res.fullCallout).toContain('40 mmø (1-1/2") EMT');
  });

  it('sizes 3-Phase 100 kW AC inverter feeder at 400V correctly per PEC', () => {
    const res = sizePecAcFeeder(100, 'three_phase', 400, 'ac_inverter');

    // Rated current: 100,000 / (sqrt(3) * 400) = 144.3A
    expect(res.ratedCurrentA).toBe(144.3);
    // Design current: 144.3 * 1.25 = 180.4A
    expect(res.designCurrentA).toBe(180.4);
    // Standard OCPD: 200A
    expect(res.ocpdRatingA).toBe(200);
    // Conductor ampacity >= 180.4A: 80 mm² (175A is < 180.4A, so 100 mm² with 200A ampacity)
    expect(res.phaseConductorMm2).toBe(100);
    // EGC for 200A OCPD: 22 mm²
    expect(res.egcConductorMm2).toBe(22);

    expect(res.fullCallout).toContain('4× 100 mm² THHN/THWN-2');
    expect(res.fullCallout).toContain('1× 22 mm² EGC');
  });

  it('sizes Single-Phase 10 kW AC inverter feeder at 230V correctly per PEC', () => {
    const res = sizePecAcFeeder(10, 'single_phase', 230, 'ac_inverter');

    // Rated current: 10,000 / 230 = 43.5A
    expect(res.ratedCurrentA).toBe(43.5);
    // Design current: 43.5 * 1.25 = 54.375A -> 54.4A
    expect(res.designCurrentA).toBe(54.4);
    // Conductor ampacity >= 54.3A: 14 mm² (65A ampacity)
    expect(res.phaseConductorMm2).toBe(14);
    // EGC for 60A/70A OCPD: 8.0 mm²
    expect(res.egcConductorMm2).toBe(8.0);
    expect(res.conductorsPerSet).toBe(2);

    expect(res.fullCallout).toContain('2× 14 mm² THHN/THWN-2');
    expect(res.fullCallout).toContain('1× 8.0 mm² EGC');
    expect(res.fullCallout).toContain('32 mmø');
  });

  it('sizes parallel conductors for high current systems (> 355A design current)', () => {
    // 350 kW @ 400V: Rated = 505.2A, Design = 631.5A
    const res = sizePecAcFeeder(350, 'three_phase', 400, 'ac_main');

    expect(res.numSets).toBeGreaterThan(1);
    expect(res.fullCallout).toContain('Sets of');
    expect(res.fullCallout).toContain('THHN/THWN-2');
  });

  it('sizes DC string wire and EGC correctly', () => {
    const singleStr = sizePecDcStringWire(15.8, false);
    expect(singleStr.cableMm2).toBe(4.0);
    expect(singleStr.fullCallout).toContain('2× 4.0mm² PV1-F (1500V DC)');

    const parallelStr = sizePecDcStringWire(15.8, true);
    expect(parallelStr.cableMm2).toBe(6.0);
    expect(parallelStr.fullCallout).toContain('2× 6.0mm² PV1-F (1500V DC)');
  });
});
