import { describe, it, expect } from 'vitest';
import {
  simulateSolarAndLoadMatching,
  STANDARD_HOURLY_SOLAR_FRACTIONS
} from './energySimulation';
import { createDefaultLoadProfile } from './loadProfile';
import { calculateSolarSystemYield } from './solarYield';
import { ArrayZone, SolarSystem, LatLngPoint } from '../types/solar';

describe('Solar and Load Energy Matching Simulation Engine', () => {
  it('has standard hourly solar fractions active only between 06:00 and 18:00 summing to 1.0', () => {
    expect(STANDARD_HOURLY_SOLAR_FRACTIONS).toHaveLength(24);

    // Night hours must be 0
    for (let h = 0; h < 6; h++) {
      expect(STANDARD_HOURLY_SOLAR_FRACTIONS[h]).toBe(0);
    }
    for (let h = 18; h < 24; h++) {
      expect(STANDARD_HOURLY_SOLAR_FRACTIONS[h]).toBe(0);
    }

    // Midday peak should be around 11:00 - 13:00
    expect(STANDARD_HOURLY_SOLAR_FRACTIONS[11]).toBeGreaterThan(0.10);
    expect(STANDARD_HOURLY_SOLAR_FRACTIONS[12]).toBeGreaterThan(0.10);

    const sum = STANDARD_HOURLY_SOLAR_FRACTIONS.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 4);
  });

  it('correctly simulates annual solar and load matching with energy balance conservation', () => {
    const center: LatLngPoint = { lat: 14.5995, lng: 120.9842 }; // Manila
    const mockZone: ArrayZone = {
      id: 'z1',
      systemId: 'sys1',
      moduleId: 'm1',
      name: 'Array',
      color: '#3b82f6',
      vertices: [],
      keepOuts: [],
      config: {
        mountType: 'roof',
        panelWidthMm: 1134,
        panelLengthMm: 2382,
        orientation: 'portrait',
        azimuthDeg: 180,
        tiltDeg: 12,
        rowSpacingM: 0.5,
        colSpacingM: 0.02,
        setbackM: 1.0,
        alignmentOffsetX: 0,
        alignmentOffsetY: 0,
        electrical: {
          modelName: 'ZNShine 600W',
          nominalPowerW: 600,
          voc: 48.1,
          vmp: 40.2,
          isc: 15.85,
          imp: 14.93
        }
      },
      areaSqM: 600,
      usableAreaSqM: 600,
      panelCount: 167,
      activePanelCount: 167,
      totalKwp: 100.2
    };

    const mockSys: SolarSystem = {
      id: 'sys1',
      name: 'System 1',
      color: '#3b82f6',
      zoneIds: ['z1'],
      inverter: {
        id: 'inv1',
        modelName: 'Inverter 100kW',
        ratedAcPowerKw: 100,
        inverterCount: 1,
        mpptCountPerInverter: 4,
        maxStringsPerMppt: 3,
        maxDcVoltage: 1100,
        minMpptVoltage: 200,
        maxMpptVoltage: 1000,
        maxDcCurrentPerMppt: 30,
        maxDcAcRatio: 1.35
      }
    };

    const solarYield = calculateSolarSystemYield({
      projectCenter: center,
      totalKwp: 100.2,
      zones: [mockZone],
      systems: [mockSys]
    });

    const loadProfile = createDefaultLoadProfile(200000, 'commercial_office', 'Test Facility');

    const result = simulateSolarAndLoadMatching(solarYield, loadProfile);

    expect(result.annualSolarKwh).toBeGreaterThan(100000);
    expect(result.annualLoadKwh).toBeCloseTo(200000, -2);
    expect(result.annualReSharePercent).toBeGreaterThan(50); // ~130k / 200k ≈ 65%

    // Self-consumed + exported must equal solar generation
    expect(result.annualSelfConsumedKwh + result.annualExportedKwh).toBeCloseTo(result.annualSolarKwh, -2);

    // Self-consumed + imported must equal load
    expect(result.annualSelfConsumedKwh + result.annualImportedKwh).toBeCloseTo(result.annualLoadKwh, -2);

    // Diurnal curve hourly conservation check
    expect(result.diurnalCurve).toHaveLength(24);
    for (const h of result.diurnalCurve) {
      expect(h.selfConsumedKw + h.exportKw).toBeCloseTo(h.solarKw, 1);
      expect(h.selfConsumedKw + h.importKw).toBeCloseTo(h.loadKw, 1);
    }
  });

  it('supports monthly and weekly diurnal curve filters', () => {
    const center: LatLngPoint = { lat: 14.5995, lng: 120.9842 };
    const mockZone: ArrayZone = {
      id: 'z1',
      systemId: 'sys1',
      moduleId: 'm1',
      name: 'Array',
      color: '#3b82f6',
      vertices: [],
      keepOuts: [],
      config: {
        mountType: 'roof',
        panelWidthMm: 1134,
        panelLengthMm: 2382,
        orientation: 'portrait',
        azimuthDeg: 180,
        tiltDeg: 12,
        rowSpacingM: 0.5,
        colSpacingM: 0.02,
        setbackM: 1.0,
        alignmentOffsetX: 0,
        alignmentOffsetY: 0,
        electrical: {
          modelName: 'ZNShine 600W',
          nominalPowerW: 600,
          voc: 48.1,
          vmp: 40.2,
          isc: 15.85,
          imp: 14.93
        }
      },
      areaSqM: 600,
      usableAreaSqM: 600,
      panelCount: 167,
      activePanelCount: 167,
      totalKwp: 100.2
    };

    const mockSys: SolarSystem = {
      id: 'sys1',
      name: 'System 1',
      color: '#3b82f6',
      zoneIds: ['z1'],
      inverter: {
        id: 'inv1',
        modelName: 'Inverter 100kW',
        ratedAcPowerKw: 100,
        inverterCount: 1,
        mpptCountPerInverter: 4,
        maxStringsPerMppt: 3,
        maxDcVoltage: 1100,
        minMpptVoltage: 200,
        maxMpptVoltage: 1000,
        maxDcCurrentPerMppt: 30,
        maxDcAcRatio: 1.35
      }
    };

    const solarYield = calculateSolarSystemYield({
      projectCenter: center,
      totalKwp: 100.2,
      zones: [mockZone],
      systems: [mockSys]
    });

    const loadProfile = createDefaultLoadProfile(360000, 'commercial_office');

    // Filter by April (month index 3) and Weekday
    const aprWeekdayRes = simulateSolarAndLoadMatching(solarYield, loadProfile, {
      period: 3,
      weekly: 'weekday'
    });

    expect(aprWeekdayRes.selectedPeriodLabel).toContain('Apr');
    expect(aprWeekdayRes.selectedWeeklyLabel).toContain('Weekday');

    // Filter by April and Weekend
    const aprWeekendRes = simulateSolarAndLoadMatching(solarYield, loadProfile, {
      period: 3,
      weekly: 'weekend'
    });

    expect(aprWeekendRes.selectedWeeklyLabel).toContain('Weekend');
    // Office weekend daily load should be lower than weekday
    expect(aprWeekendRes.diurnalSummary.dailyLoadKwh).toBeLessThan(aprWeekdayRes.diurnalSummary.dailyLoadKwh);
    // Weekend export should be higher because office is closed but sun is shining
    expect(aprWeekendRes.diurnalSummary.dailyExportedKwh).toBeGreaterThan(aprWeekdayRes.diurnalSummary.dailyExportedKwh);
  });
});
