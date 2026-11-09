import { describe, it, expect } from 'vitest';
import {
  getBaselineClimateForLocation,
  calculatePoaTranspositionFactor,
  calculateCellTemperature,
  calculateSolarSystemYield
} from './solarYield';
import { ArrayZone, SolarSystem, LatLngPoint } from '../types/solar';

describe('Solar Yield & Solar Atlas Physics Engine', () => {
  it('correctly provides baseline climate profiles across latitudes', () => {
    const equator = getBaselineClimateForLocation(0);
    const manila = getBaselineClimateForLocation(14.5);
    const sanFrancisco = getBaselineClimateForLocation(37.7);
    const london = getBaselineClimateForLocation(51.5);
    const sydney = getBaselineClimateForLocation(-33.8);

    expect(equator.monthlyGhi.length).toBe(12);
    expect(manila.monthlyGhi.length).toBe(12);
    expect(sanFrancisco.monthlyGhi.length).toBe(12);

    // Manila (tropical) should have higher average ambient temperatures than San Francisco
    const avgTempManila = manila.monthlyTemp.reduce((a, b) => a + b, 0) / 12;
    const avgTempSF = sanFrancisco.monthlyTemp.reduce((a, b) => a + b, 0) / 12;
    expect(avgTempManila).toBeGreaterThan(avgTempSF);

    // Sydney (Southern Hemisphere) peak solar irradiance should occur in Dec/Jan, not June
    expect(sydney.monthlyGhi[0]).toBeGreaterThan(sydney.monthlyGhi[5]); // Jan > June
    // London (Northern Hemisphere) peak solar irradiance should occur in June/July, not Dec
    expect(london.monthlyGhi[5]).toBeGreaterThan(london.monthlyGhi[11]); // June > Dec
  });

  it('calculates higher Plane-of-Array irradiance at optimal tilt than flat at mid-latitudes', () => {
    // In San Francisco (lat 37.7°), winter (e.g. Month 0 = January):
    // A tilted panel (e.g. 30°) facing South (180°) intercepts much more direct sunlight than 0° flat
    const flatTransfactor = calculatePoaTranspositionFactor(0, 37.7, 0, 180, 0.40);
    const tiltedTransfactor = calculatePoaTranspositionFactor(0, 37.7, 30, 180, 0.40);

    expect(tiltedTransfactor).toBeGreaterThan(flatTransfactor);
  });

  it('correctly accounts for azimuth orientation', () => {
    // In Northern Hemisphere (lat 35°), South facing (180°) should perform better in annual total than North facing (0°)
    const southFactor = calculatePoaTranspositionFactor(2, 35, 25, 180, 0.35); // March South
    const northFactor = calculatePoaTranspositionFactor(2, 35, 25, 0, 0.35);   // March North

    expect(southFactor).toBeGreaterThan(northFactor);
  });

  it('models rooftop mounts as hotter than open-rack ground mounts due to ventilation', () => {
    const ambientTemp = 30; // 30°C hot day
    const poaKwhDay = 5.5;  // 5.5 kWh/m²/day

    const roofCellTemp = calculateCellTemperature(ambientTemp, poaKwhDay, 'roof');
    const groundCellTemp = calculateCellTemperature(ambientTemp, poaKwhDay, 'ground');

    // Roof should run significantly hotter due to reduced airflow under flush panels
    expect(roofCellTemp).toBeGreaterThan(groundCellTemp);
    expect(roofCellTemp - groundCellTemp).toBeGreaterThanOrEqual(8);
  });

  it('computes full solar yield results and performance ratio for a realistic project', () => {
    const projectCenter: LatLngPoint = { lat: 14.5995, lng: 120.9842 }; // Manila, Philippines
    const totalKwp = 100; // 100 kWp commercial system

    const mockZone: ArrayZone = {
      id: 'zone_1',
      systemId: 'sys_1',
      moduleId: 'mod_1',
      name: 'Rooftop Array 1',
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
      usableAreaSqM: 550,
      panelCount: 167,
      activePanelCount: 167,
      totalKwp: 100.2
    };

    const mockSystem: SolarSystem = {
      id: 'sys_1',
      name: 'System 1',
      color: '#3b82f6',
      zoneIds: ['zone_1'],
      inverter: {
        id: 'inv_1',
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

    const result = calculateSolarSystemYield({
      projectCenter,
      totalKwp,
      zones: [mockZone],
      systems: [mockSystem]
    });

    expect(result.annualYieldKwh).toBeGreaterThan(100000); // 100 kWp in Manila produces > 130,000 kWh/yr
    expect(result.specificYieldKwhPerKwp).toBeGreaterThan(1200);
    expect(result.specificYieldKwhPerKwp).toBeLessThan(1800);
    expect(result.performanceRatio).toBeGreaterThan(70);
    expect(result.performanceRatio).toBeLessThan(88);
    expect(result.capacityFactor).toBeGreaterThan(12);
    expect(result.monthlyBreakdown.length).toBe(12);

    // Sum of 12 months netAcKwh should equal annualYieldKwh (within rounding)
    const monthlySum = result.monthlyBreakdown.reduce((sum, m) => sum + m.netAcKwh, 0);
    expect(Math.abs(monthlySum - result.annualYieldKwh)).toBeLessThanOrEqual(2);
  });

  it('reflects higher cable loss when long DC homerun conductors are present', () => {
    const projectCenter: LatLngPoint = { lat: 37.7749, lng: -122.4194 };
    const totalKwp = 50;

    const mockZone: ArrayZone = {
      id: 'zone_1',
      systemId: 'sys_1',
      moduleId: 'mod_1',
      name: 'Array',
      color: '#3b82f6',
      vertices: [],
      keepOuts: [],
      config: {
        mountType: 'ground',
        panelWidthMm: 1134,
        panelLengthMm: 2382,
        orientation: 'portrait',
        azimuthDeg: 180,
        tiltDeg: 20,
        rowSpacingM: 2.0,
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
      areaSqM: 500,
      usableAreaSqM: 500,
      panelCount: 84,
      activePanelCount: 84,
      totalKwp: 50.4
    };

    const mockSystem: SolarSystem = {
      id: 'sys_1',
      name: 'System 1',
      color: '#3b82f6',
      zoneIds: ['zone_1'],
      inverter: {
        id: 'inv_1',
        modelName: 'Inverter 50kW',
        ratedAcPowerKw: 50,
        inverterCount: 1,
        mpptCountPerInverter: 2,
        maxStringsPerMppt: 2,
        maxDcVoltage: 1100,
        minMpptVoltage: 200,
        maxMpptVoltage: 1000,
        maxDcCurrentPerMppt: 30,
        maxDcAcRatio: 1.35
      }
    };

    // Case 1: Short cables
    const resShortCables = calculateSolarSystemYield({
      projectCenter,
      totalKwp,
      zones: [mockZone],
      systems: [mockSystem],
      cableSummary: {
        systemId: 'sys_1',
        inverterLocation: null,
        inverterElevationM: 0,
        totalStrings: 4,
        totalIntraStringM: 40,
        totalHomerunM: 80,
        totalElevationRiserM: 0,
        totalCableLengthM: 120,
        avgStringCableLengthM: 30,
        totalRacewayLengthM: 0,
        strings: []
      }
    });

    // Case 2: Very long homerun runs across large field
    const resLongCables = calculateSolarSystemYield({
      projectCenter,
      totalKwp,
      zones: [mockZone],
      systems: [mockSystem],
      cableSummary: {
        systemId: 'sys_1',
        inverterLocation: null,
        inverterElevationM: 0,
        totalStrings: 4,
        totalIntraStringM: 40,
        totalHomerunM: 1400,
        totalElevationRiserM: 0,
        totalCableLengthM: 1440,
        avgStringCableLengthM: 360,
        totalRacewayLengthM: 200,
        strings: []
      }
    });

    expect(resLongCables.lossCascade.dcCableLossPercent).toBeGreaterThan(
      resShortCables.lossCascade.dcCableLossPercent
    );
    expect(resShortCables.annualYieldKwh).toBeGreaterThan(resLongCables.annualYieldKwh);
  });
});
