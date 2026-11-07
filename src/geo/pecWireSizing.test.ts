import { describe, it, expect } from 'vitest';
import {
  sizePecAcFeeder,
  sizePecEgc,
  sizePecDcStringWire,
  sizePecTransformer,
  getRecommendedMdpMainBreaker,
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

  it('sizes power transformers per PEC 4.50 when inverter voltage does not match system voltage', () => {
    // 1. Matching voltages: No transformer needed
    const matching = sizePecTransformer(100, 'three_phase', 400, 400);
    expect(matching.required).toBe(false);
    expect(matching.transformerKva).toBe(0);

    // 2. 100 kW 3-Phase 400V Inverter stepping down to 230V 3-Phase Grid Tap:
    // Min kVA = 100 * 1.25 = 125 kVA -> Standard rating = 125 kVA
    const stepDown = sizePecTransformer(100, 'three_phase', 400, 230);
    expect(stepDown.required).toBe(true);
    expect(stepDown.type).toBe('step_down');
    expect(stepDown.primaryVoltageV).toBe(400);
    expect(stepDown.secondaryVoltageV).toBe(230);
    expect(stepDown.transformerKva).toBe(125);
    expect(stepDown.vectorGroup).toContain('Dyn11');
    expect(stepDown.primaryFullLoadCurrentA).toBeGreaterThan(0);
    expect(stepDown.secondaryFullLoadCurrentA).toBeGreaterThan(0);
    expect(stepDown.primaryOcpdRatingA).toBeGreaterThan(0);
    expect(stepDown.secondaryOcpdRatingA).toBeGreaterThan(0);
    expect(stepDown.primaryPecSizing.phaseConductorMm2).toBeGreaterThan(0);
    expect(stepDown.secondaryPecSizing.phaseConductorMm2).toBeGreaterThan(0);

    // 3. 50 kW 3-Phase 400V Inverter stepping up to 480V 3-Phase Grid Tap:
    // Min kVA = 50 * 1.15 = 57.5 kVA -> Standard rating = 75 kVA
    const stepUp = sizePecTransformer(50, 'three_phase', 400, 480);
    expect(stepUp.required).toBe(true);
    expect(stepUp.type).toBe('step_up');
    expect(stepUp.primaryVoltageV).toBe(400);
    expect(stepUp.secondaryVoltageV).toBe(480);
    expect(stepUp.transformerKva).toBe(75);

    // 4. Single-phase 10 kW 230V Inverter stepping to 240V:
    // Min kVA = 10 * 1.15 = 11.5 kVA -> Standard rating = 15 kVA
    const singlePh = sizePecTransformer(10, 'single_phase', 230, 240);
    expect(singlePh.required).toBe(true);
    expect(singlePh.transformerKva).toBe(15);
    expect(singlePh.vectorGroup).toBe('1Φ Isolation');
  });

  it('computes recommended MDP Main Breaker sizing for facility service entrance', () => {
    // 100A Solar Breaker -> Recommended Main Breaker at least ~250A
    const mdpMain250 = getRecommendedMdpMainBreaker(100);
    expect(mdpMain250).toBeGreaterThanOrEqual(200);

    // High current solar (600A) -> Recommended Main Breaker >= 1200A
    const mdpMainHigh = getRecommendedMdpMainBreaker(600);
    expect(mdpMainHigh).toBeGreaterThanOrEqual(1200);
  });
});
