import { describe, it, expect, beforeEach } from 'vitest';
import {
  ARCHETYPE_DIURNAL_CURVES,
  createDefaultLoadProfile,
  scaleAnnualLoad,
  parseMonthlyBillingCsv,
  parseDiurnalCurveCsv,
  parse8760IntervalCsv,
  generateMonthlyBillCsvTemplate,
  generateDiurnalCurveCsvTemplate,
  normalizeDailyCurve
} from './loadProfile';
import { ProjectStore } from '../store/projectStore';
import { LoadProfileArchetype } from '../types/solar';

describe('Facility Load Profile Engineering Engine', () => {
  it('should have all 8 standard archetypes defined with exactly 24 hours summing to 1.0', () => {
    const archetypes = Object.keys(ARCHETYPE_DIURNAL_CURVES) as LoadProfileArchetype[];
    expect(archetypes.length).toBeGreaterThanOrEqual(7);

    for (const arch of archetypes) {
      const curveSet = ARCHETYPE_DIURNAL_CURVES[arch];
      expect(curveSet.weekday).toHaveLength(24);
      expect(curveSet.weekend).toHaveLength(24);

      const sumWeekday = curveSet.weekday.reduce((a, b) => a + b, 0);
      const sumWeekend = curveSet.weekend.reduce((a, b) => a + b, 0);

      expect(sumWeekday).toBeCloseTo(1.0, 3);
      expect(sumWeekend).toBeCloseTo(1.0, 3);
    }
  });

  it('should normalize daily curves correctly and handle empty/zero cases', () => {
    const uniform = normalizeDailyCurve([]);
    expect(uniform).toHaveLength(24);
    expect(uniform[0]).toBeCloseTo(1 / 24, 4);

    const custom = Array(24).fill(10);
    const normalized = normalizeDailyCurve(custom);
    expect(normalized).toHaveLength(24);
    expect(normalized[0]).toBeCloseTo(1 / 24, 4);

    const singleSpike = Array(24).fill(0);
    singleSpike[12] = 100; // Noon peak
    const normSpike = normalizeDailyCurve(singleSpike);
    expect(normSpike[12]).toBeCloseTo(1.0, 4);
    expect(normSpike[0]).toBe(0);
  });

  it('should create a default facility load profile with 12 months matching annual kWh', () => {
    const targetAnnual = 500000;
    const profile = createDefaultLoadProfile(targetAnnual, 'commercial_office', 'HQ Main Meter');

    expect(profile.name).toBe('HQ Main Meter');
    expect(profile.archetype).toBe('commercial_office');
    expect(profile.monthlyBreakdown).toHaveLength(12);

    const sumKwh = profile.monthlyBreakdown.reduce((sum, m) => sum + m.consumptionKwh, 0);
    expect(sumKwh).toBeCloseTo(targetAnnual, -1);
    expect(profile.annualKwh).toBe(sumKwh);

    // Verify February has 28 days and Jan has 31
    expect(profile.monthlyBreakdown[0].daysInMonth).toBe(31);
    expect(profile.monthlyBreakdown[1].daysInMonth).toBe(28);
    expect(profile.defaultDailyCurve).toHaveLength(24);
  });

  it('should scale monthly kWh proportionally when annual load is updated', () => {
    const profile = createDefaultLoadProfile(200000, 'industrial_24_7');
    const scaled = scaleAnnualLoad(profile, 400000);

    expect(scaled.annualKwh).toBeCloseTo(400000, -1);
    // Each month should have doubled
    expect(scaled.monthlyBreakdown[0].consumptionKwh).toBeCloseTo(
      profile.monthlyBreakdown[0].consumptionKwh * 2,
      -1
    );
  });

  describe('CSV Parsers & Ingestion', () => {
    it('should parse 12-month utility billing CSV correctly', () => {
      const csv = `Month,kWh,PeakKW,Cost
Jan,25000,65.2,262500
Feb,23000,60.1,241500
Mar,26000,67.0,273000
Apr,27000,70.5,283500
May,29000,74.0,304500
Jun,31000,78.2,325500
Jul,32000,80.0,336000
Aug,31500,79.1,330750
Sep,28500,72.4,299250
Oct,27000,69.0,283500
Nov,24500,63.5,257250
Dec,25500,66.0,267750`;

      const records = parseMonthlyBillingCsv(csv);
      expect(records).toHaveLength(12);
      expect(records[0].monthName).toBe('Jan');
      expect(records[0].consumptionKwh).toBe(25000);
      expect(records[0].peakDemandKw).toBe(65.2);
      expect(records[0].energyCostPhp).toBe(262500);

      expect(records[11].monthName).toBe('Dec');
      expect(records[11].consumptionKwh).toBe(25500);
    });

    it('should throw an error on invalid or truncated monthly billing CSV', () => {
      const truncatedCsv = `Month,kWh\nJan,10000\nFeb,9000`;
      expect(() => parseMonthlyBillingCsv(truncatedCsv)).toThrow(/12 monthly rows are required/);
    });

    it('should parse 24-hour diurnal profile CSV and normalize it', () => {
      let csv = 'Hour,kW\n';
      for (let h = 0; h < 24; h++) {
        csv += `${h},${h >= 8 && h <= 17 ? 50 : 10}\n`;
      }

      const curve = parseDiurnalCurveCsv(csv);
      expect(curve).toHaveLength(24);
      const sum = curve.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 4);
      // Daytime should be higher than nighttime
      expect(curve[12]).toBeGreaterThan(curve[2]);
    });

    it('should parse 8760 hourly interval SCADA data and derive both monthly totals and diurnal profile', () => {
      // Generate mock 8760 lines: higher during midday, higher in summer
      let csv = 'Datetime,Demand_kW\n';
      for (let r = 0; r < 8760; r++) {
        const hour = r % 24;
        const val = hour >= 8 && hour <= 17 ? 100 : 25;
        csv += `2025-01-01 ${hour}:00,${val}\n`;
      }

      const result = parse8760IntervalCsv(csv);
      expect(result.monthlyRecords).toHaveLength(12);
      expect(result.diurnalCurve).toHaveLength(24);
      expect(result.peakDemandKw).toBe(100);
      expect(result.annualKwh).toBeGreaterThan(0);
      expect(result.diurnalCurve[12]).toBeGreaterThan(result.diurnalCurve[2]);
    });

    it('should generate valid template CSV strings', () => {
      const monthlyTemplate = generateMonthlyBillCsvTemplate();
      expect(monthlyTemplate).toContain('Month,Consumption_kWh');
      const parsedRecords = parseMonthlyBillingCsv(monthlyTemplate);
      expect(parsedRecords).toHaveLength(12);

      const diurnalTemplate = generateDiurnalCurveCsvTemplate();
      expect(diurnalTemplate).toContain('Hour,Load_Fraction_Percent');
      const parsedDiurnal = parseDiurnalCurveCsv(diurnalTemplate);
      expect(parsedDiurnal).toHaveLength(24);
    });
  });

  describe('ProjectStore Integration', () => {
    let store: ProjectStore;

    beforeEach(() => {
      store = new ProjectStore();
    });

    it('should manage load profile state, ensure default, scale, and update monthly records', () => {
      expect(store.getLoadProfile()).toBeNull();

      const profile = store.ensureLoadProfile();
      expect(profile).not.toBeNull();
      expect(store.getLoadProfile()).toBe(profile);

      store.scaleAnnualLoad(600000);
      expect(store.getLoadProfile()?.annualKwh).toBeCloseTo(600000, -1);

      store.applyLoadArchetype('hospital_healthcare');
      expect(store.getLoadProfile()?.archetype).toBe('hospital_healthcare');

      store.updateMonthlyLoad(0, 55000, 110, 577500);
      expect(store.getLoadProfile()?.monthlyBreakdown[0].consumptionKwh).toBe(55000);
      expect(store.getLoadProfile()?.monthlyBreakdown[0].peakDemandKw).toBe(110);
    });

    it('should export and import load profile in ProjectData JSON without data loss', () => {
      store.ensureLoadProfile();
      store.scaleAnnualLoad(480000);
      store.applyLoadArchetype('retail_commercial');

      const json = store.exportProjectJson();
      const parsed = JSON.parse(json);
      expect(parsed.loadProfile).toBeDefined();
      expect(parsed.loadProfile.archetype).toBe('retail_commercial');
      expect(parsed.loadProfile.annualKwh).toBeCloseTo(480000, -1);

      const store2 = new ProjectStore();
      const success = store2.importProjectJson(json);
      expect(success).toBe(true);

      const importedProfile = store2.getLoadProfile();
      expect(importedProfile).not.toBeNull();
      expect(importedProfile?.archetype).toBe('retail_commercial');
      expect(importedProfile?.annualKwh).toBeCloseTo(480000, -1);
      expect(importedProfile?.monthlyBreakdown).toHaveLength(12);
    });
  });
});
