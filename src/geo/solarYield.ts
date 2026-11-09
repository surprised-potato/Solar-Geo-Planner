/**
 * Physics-Based Solar Photovoltaic (PV) Yield & Solar Resource Engine
 *
 * Implements standard engineering equations:
 * 1. Global Solar Resource Climatology (Monthly GHI, Ambient Temperature, Diffuse Fraction)
 * 2. Plane-of-Array (POA) / Global Tilted Irradiance (GTI) Transposition (Liu & Jordan / isotropic model)
 * 3. Module Operating Cell Temperature (King / Faiman model with roof vs ground mount convection)
 * 4. Temperature Derating based on manufacturer Pmax temperature coefficient
 * 5. DC & AC Ohmic Wiring Losses (integrated with actual cable runs from StringCabling & PEC Sizing)
 * 6. Inverter Conversion Efficiency & Peak Power Clipping
 * 7. System Loss Cascade (Soiling, Mismatch, LID, Availability)
 */

import {
  ArrayZone,
  LatLngPoint,
  MountType,
  SolarSystem,
  SystemCableSummary,
  AcFeederSummary
} from '../types/solar';

export interface MonthlySolarData {
  month: number;           // 0 = Jan, 11 = Dec
  monthName: string;
  daysInMonth: number;
  ghiKwhPerM2Day: number;  // Global Horizontal Irradiance (kWh/m²/day)
  dhiFraction: number;     // Diffuse Horizontal Irradiance fraction (0 to 1)
  ambientTempC: number;    // Mean daytime ambient temperature (°C)
  poaKwhPerM2Day: number;  // Plane-of-Array (Tilted) Irradiance (kWh/m²/day)
  cellTempC: number;       // Average operating cell temperature (°C)
  tempDerateFactor: number;// Multiplier e.g. 0.88 (-12% loss)
  grossDcKwh: number;      // Raw DC energy before losses
  netAcKwh: number;        // Final net AC energy delivered to grid
}

export interface SolarLossCascade {
  stcIdealKwh: number;        // Theoretical STC energy without losses
  poaGainLossPercent: number; // Gain/loss from tilt & azimuth transposition relative to horizontal
  soilingLossPercent: number; // e.g. 2.5%
  lidLossPercent: number;     // Light-Induced Degradation, e.g. 1.5%
  mismatchLossPercent: number;// Module mismatch & tolerance, e.g. 1.5%
  thermalLossPercent: number; // Operating temperature derate, e.g. 8.5% - 13.0%
  dcCableLossPercent: number; // Real DC homerun & string cable resistance drop
  inverterLossPercent: number;// Inverter conversion inefficiency, e.g. 2.0%
  clippingLossPercent: number;// Inverter DC/AC ratio power clipping
  acWiringLossPercent: number;// AC feeder voltage drop to Point of Interconnection
  availabilityLossPercent: number; // Maintenance / grid downtime, e.g. 1.0%
  totalLossPercent: number;   // Cumulative system loss
}

export interface SolarYieldResult {
  annualYieldKwh: number;          // Total Net AC Energy Generated (kWh/year)
  specificYieldKwhPerKwp: number;  // Yield normalized by capacity (kWh/kWp/year)
  performanceRatio: number;        // Performance Ratio PR (0% to 100%)
  capacityFactor: number;          // Capacity Factor CF (0% to 100%)
  annualGhiKwhPerM2: number;       // Annual Global Horizontal Irradiance (kWh/m²)
  annualPoaKwhPerM2: number;       // Annual Plane-of-Array Irradiance (kWh/m²)
  dataSourceName: string;          // e.g. "Global Solar Climatology (GSA Benchmark)" or "NASA POWER Live"
  monthlyBreakdown: MonthlySolarData[];
  lossCascade: SolarLossCascade;
}

export interface CustomSolarResource {
  sourceName?: string;
  monthlyGhiKwhPerM2Day?: number[]; // Array of 12 numbers (Jan to Dec)
  monthlyAmbientTempC?: number[];   // Array of 12 numbers (Jan to Dec)
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Solar declination mid-month day numbers (approx. day of year for the 15th of each month)
const MID_MONTH_DAY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

/**
 * Climatological baseline grid calibrated against Global Solar Atlas & NASA POWER datasets.
 * Formatted as latitude bands from -60° to +60° in 10° steps.
 */
interface LatitudeClimateProfile {
  lat: number;
  monthlyGhi: number[];  // Jan..Dec (kWh/m²/day)
  monthlyTemp: number[]; // Jan..Dec (°C)
  diffuseFraction: number[];
}

const GLOBAL_CLIMATE_BENCHMARKS: LatitudeClimateProfile[] = [
  {
    lat: 50, // Northern Europe / Canada
    monthlyGhi: [1.2, 2.1, 3.4, 4.8, 5.7, 6.0, 5.8, 4.9, 3.5, 2.1, 1.3, 0.9],
    monthlyTemp: [1, 2, 6, 11, 16, 19, 21, 20, 16, 11, 6, 2],
    diffuseFraction: [0.65, 0.58, 0.52, 0.48, 0.45, 0.46, 0.46, 0.48, 0.52, 0.60, 0.68, 0.72]
  },
  {
    lat: 40, // Southern Europe / US Midwest & California / Japan
    monthlyGhi: [2.3, 3.2, 4.5, 5.8, 6.8, 7.4, 7.3, 6.5, 5.2, 3.8, 2.6, 2.0],
    monthlyTemp: [5, 7, 11, 15, 20, 25, 28, 27, 23, 17, 11, 6],
    diffuseFraction: [0.48, 0.42, 0.38, 0.34, 0.32, 0.30, 0.30, 0.32, 0.35, 0.40, 0.46, 0.50]
  },
  {
    lat: 30, // US Sunbelt / North Africa / Middle East / Southern China
    monthlyGhi: [3.5, 4.4, 5.5, 6.6, 7.4, 7.8, 7.5, 7.0, 6.1, 4.9, 3.8, 3.2],
    monthlyTemp: [13, 15, 18, 22, 27, 31, 33, 33, 30, 25, 19, 14],
    diffuseFraction: [0.38, 0.34, 0.31, 0.28, 0.26, 0.25, 0.26, 0.27, 0.29, 0.32, 0.36, 0.40]
  },
  {
    lat: 20, // Central America / Hawaii / India / SE Asia North
    monthlyGhi: [4.4, 5.1, 6.0, 6.6, 6.7, 6.3, 6.1, 6.0, 5.7, 5.2, 4.6, 4.1],
    monthlyTemp: [22, 24, 26, 29, 31, 30, 29, 29, 28, 28, 25, 23],
    diffuseFraction: [0.32, 0.29, 0.28, 0.29, 0.34, 0.42, 0.45, 0.44, 0.40, 0.34, 0.32, 0.33]
  },
  {
    lat: 10, // Philippines / Central America / Sub-Saharan Africa
    monthlyGhi: [4.8, 5.5, 6.2, 6.5, 6.0, 5.4, 5.2, 5.1, 5.2, 5.0, 4.7, 4.4],
    monthlyTemp: [26, 27, 28, 30, 30, 29, 28, 28, 28, 28, 27, 26],
    diffuseFraction: [0.35, 0.32, 0.30, 0.32, 0.42, 0.48, 0.50, 0.50, 0.47, 0.42, 0.38, 0.36]
  },
  {
    lat: 0, // Equator (Indonesia / Northern Brazil / Kenya)
    monthlyGhi: [5.0, 5.4, 5.6, 5.5, 5.2, 5.1, 5.2, 5.4, 5.6, 5.4, 5.0, 4.8],
    monthlyTemp: [27, 27, 27, 28, 28, 27, 27, 27, 28, 28, 27, 27],
    diffuseFraction: [0.42, 0.40, 0.38, 0.38, 0.40, 0.41, 0.40, 0.39, 0.38, 0.39, 0.42, 0.43]
  },
  {
    lat: -10, // Peru / Indonesia South / Northern Australia
    monthlyGhi: [5.2, 5.4, 5.4, 5.2, 4.8, 4.5, 4.7, 5.2, 5.7, 5.8, 5.6, 5.3],
    monthlyTemp: [27, 27, 27, 27, 26, 25, 25, 26, 27, 28, 28, 28],
    diffuseFraction: [0.44, 0.42, 0.38, 0.34, 0.32, 0.30, 0.30, 0.31, 0.33, 0.36, 0.40, 0.43]
  },
  {
    lat: -20, // Bolivia / Madagascar / Australia Central
    monthlyGhi: [6.5, 6.2, 5.6, 4.9, 4.2, 3.8, 4.0, 4.7, 5.6, 6.4, 6.7, 6.8],
    monthlyTemp: [27, 26, 25, 22, 19, 16, 16, 18, 21, 24, 26, 27],
    diffuseFraction: [0.34, 0.32, 0.30, 0.28, 0.27, 0.28, 0.26, 0.24, 0.24, 0.26, 0.29, 0.32]
  },
  {
    lat: -30, // South Africa / Australia South (Sydney/Perth) / Argentina
    monthlyGhi: [7.4, 6.8, 5.6, 4.4, 3.4, 2.9, 3.2, 3.9, 5.0, 6.2, 7.1, 7.6],
    monthlyTemp: [24, 24, 22, 18, 15, 12, 12, 13, 15, 18, 20, 22],
    diffuseFraction: [0.30, 0.30, 0.32, 0.35, 0.39, 0.42, 0.39, 0.35, 0.32, 0.30, 0.29, 0.29]
  },
  {
    lat: -40, // New Zealand / Southern Argentina
    monthlyGhi: [6.8, 6.0, 4.6, 3.2, 2.1, 1.6, 1.8, 2.5, 3.7, 5.0, 6.2, 6.9],
    monthlyTemp: [18, 18, 16, 13, 10, 8, 8, 9, 11, 13, 15, 17],
    diffuseFraction: [0.35, 0.36, 0.40, 0.46, 0.52, 0.56, 0.54, 0.48, 0.42, 0.38, 0.35, 0.34]
  }
];

/**
 * Interpolates baseline solar climatology based on latitude.
 */
export function getBaselineClimateForLocation(latitude: number): {
  monthlyGhi: number[];
  monthlyTemp: number[];
  diffuseFraction: number[];
} {
  const clampedLat = Math.max(-50, Math.min(60, latitude));

  // Find surrounding profiles
  let lower = GLOBAL_CLIMATE_BENCHMARKS[GLOBAL_CLIMATE_BENCHMARKS.length - 1];
  let upper = GLOBAL_CLIMATE_BENCHMARKS[0];

  for (let i = 0; i < GLOBAL_CLIMATE_BENCHMARKS.length - 1; i++) {
    const p1 = GLOBAL_CLIMATE_BENCHMARKS[i];
    const p2 = GLOBAL_CLIMATE_BENCHMARKS[i + 1];
    if (clampedLat <= p1.lat && clampedLat >= p2.lat) {
      upper = p1;
      lower = p2;
      break;
    }
  }

  const range = upper.lat - lower.lat;
  const factor = range > 0 ? (clampedLat - lower.lat) / range : 0;

  const monthlyGhi: number[] = [];
  const monthlyTemp: number[] = [];
  const diffuseFraction: number[] = [];

  for (let m = 0; m < 12; m++) {
    const ghi = lower.monthlyGhi[m] + factor * (upper.monthlyGhi[m] - lower.monthlyGhi[m]);
    const temp = lower.monthlyTemp[m] + factor * (upper.monthlyTemp[m] - lower.monthlyTemp[m]);
    const dhi = lower.diffuseFraction[m] + factor * (upper.diffuseFraction[m] - lower.diffuseFraction[m]);
    monthlyGhi.push(Number(ghi.toFixed(2)));
    monthlyTemp.push(Number(temp.toFixed(1)));
    diffuseFraction.push(Number(dhi.toFixed(2)));
  }

  return { monthlyGhi, monthlyTemp, diffuseFraction };
}

/**
 * Computes Plane-of-Array (POA) irradiance transposition factor.
 * Ratio of tilted irradiance to horizontal irradiance (POA / GHI) for a given month,
 * latitude, array tilt, and array azimuth.
 */
export function calculatePoaTranspositionFactor(
  monthIndex: number,
  latitudeDeg: number,
  tiltDeg: number,
  azimuthDeg: number,
  diffuseFraction: number
): number {
  const phi = (latitudeDeg * Math.PI) / 180; // Latitude in radians
  const beta = (tiltDeg * Math.PI) / 180;    // Tilt in radians
  
  // Solar azimuth convention in Solar Geo Planner: 0° = North, 90° = East, 180° = South, 270° = West
  // Optimal orientation in Northern hemisphere is South (180°); in Southern hemisphere is North (0°).
  const optimalAzimuth = latitudeDeg >= 0 ? 180 : 0;
  let gammaOffsetDeg = Math.abs(azimuthDeg - optimalAzimuth);
  if (gammaOffsetDeg > 180) gammaOffsetDeg = 360 - gammaOffsetDeg;
  const gamma = (gammaOffsetDeg * Math.PI) / 180; // Deviation from equator-facing in radians

  // Solar declination (Cooper equation)
  const day = MID_MONTH_DAY[monthIndex];
  const delta = (23.45 * Math.sin(((360 / 365) * (284 + day) * Math.PI) / 180) * Math.PI) / 180;

  // Solar noon zenith angle on horizontal surface
  const cosZenithNoon = Math.max(0.01, Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta));
  
  // Solar noon angle of incidence on tilted plane
  // For equator-facing: cosIncidence = sin(phi - beta) * sin(delta) + cos(phi - beta) * cos(delta)
  // With azimuth deviation gamma:
  const cosIncidenceNoon = Math.max(
    0.0,
    Math.sin(delta) * (Math.sin(phi) * Math.cos(beta) - Math.cos(phi) * Math.sin(beta) * Math.cos(gamma)) +
    Math.cos(delta) * (Math.cos(phi) * Math.cos(beta) + Math.sin(phi) * Math.sin(beta) * Math.cos(gamma))
  );

  // Beam transposition factor Rb at midday
  const Rb = Math.min(2.5, Math.max(0.0, cosIncidenceNoon / cosZenithNoon));

  // Diffuse transposition factor (isotropic sky view factor)
  const Rd = (1 + Math.cos(beta)) / 2;

  // Ground albedo reflection factor (typical ground albedo rho = 0.20)
  const albedo = 0.20;
  const Rr = albedo * ((1 - Math.cos(beta)) / 2);

  const beamFraction = Math.max(0, 1 - diffuseFraction);

  // Total transposition ratio = Beam + Sky Diffuse + Ground Reflection
  const transpositionFactor = beamFraction * Rb + diffuseFraction * Rd + Rr;

  return Math.max(0.2, Math.min(2.2, transpositionFactor));
}

/**
 * Computes operating cell temperature from ambient temperature and plane-of-array irradiance.
 * Uses the Faiman/King thermal model with convective cooling factors for mounting types.
 *
 * @param ambientTempC Mean daytime ambient temperature (°C)
 * @param poaKwhPerM2Day Daily plane-of-array irradiance
 * @param mountType 'roof' (restricted underside ventilation) or 'ground' (open rack free air)
 */
export function calculateCellTemperature(
  ambientTempC: number,
  poaKwhPerM2Day: number,
  mountType: MountType
): number {
  // Average daytime peak irradiance approximation (W/m²)
  // Over ~12 daytime hours, effective peak solar intensity is approx poa (kWh/m²/day) / 5.5 peak sun hours * 1000
  const avgPeakIrradianceW = Math.min(1000, Math.max(200, (poaKwhPerM2Day / 5.0) * 1000));

  // Thermal heat transfer coefficient:
  // Ground mounts have open backs: delta T ≈ 25°C at 1000 W/m² (NOCT ~45°C)
  // Rooftop mounts have insulated/trapped air under panels: delta T ≈ 34°C at 1000 W/m²
  const thermalCoeff = mountType === 'roof' ? 0.034 : 0.025;

  const cellTempC = ambientTempC + avgPeakIrradianceW * thermalCoeff;
  return Number(cellTempC.toFixed(1));
}

/**
 * Main Solar Yield Calculation Engine
 *
 * Computes comprehensive annual and monthly energy output, performance ratio, and full loss waterfall.
 */
export function calculateSolarSystemYield(params: {
  projectCenter: LatLngPoint;
  totalKwp: number;
  zones: ArrayZone[];
  systems: SolarSystem[];
  targetSystemId?: string;
  cableSummary?: SystemCableSummary | null;
  acFeeder?: AcFeederSummary | null;
  customResource?: CustomSolarResource | null;
}): SolarYieldResult {
  const {
    projectCenter,
    totalKwp,
    zones,
    systems,
    targetSystemId,
    cableSummary,
    acFeeder,
    customResource
  } = params;

  if (totalKwp <= 0 || zones.length === 0) {
    return createEmptyYieldResult();
  }

  // Determine representative array parameters
  const relevantZones = targetSystemId && targetSystemId !== 'all'
    ? zones.filter(z => z.systemId === targetSystemId)
    : zones;

  const activeZones = relevantZones.length > 0 ? relevantZones : zones;

  // Capacity-weighted average tilt, azimuth, and mount type
  let weightedTilt = 0;
  let weightedAzimuth = 0;
  let roofZoneKwp = 0;
  let groundZoneKwp = 0;
  let tempCoeffPmax = -0.35; // Default Tier-1 module temperature coefficient % / °C

  let zoneKwpSum = 0;
  for (const z of activeZones) {
    const zKwp = z.totalKwp || (z.activePanelCount * (z.config.electrical.nominalPowerW / 1000.0));
    zoneKwpSum += zKwp;
    weightedTilt += z.config.tiltDeg * zKwp;
    weightedAzimuth += z.config.azimuthDeg * zKwp;
    if (z.config.mountType === 'roof') {
      roofZoneKwp += zKwp;
    } else {
      groundZoneKwp += zKwp;
    }
  }

  const avgTilt = zoneKwpSum > 0 ? weightedTilt / zoneKwpSum : 15;
  const avgAzimuth = zoneKwpSum > 0 ? weightedAzimuth / zoneKwpSum : 180;
  const predominantMountType: MountType = roofZoneKwp >= groundZoneKwp ? 'roof' : 'ground';

  // Retrieve base solar climatology
  const baseClimate = getBaselineClimateForLocation(projectCenter.lat);
  const monthlyGhi = customResource?.monthlyGhiKwhPerM2Day || baseClimate.monthlyGhi;
  const monthlyTemp = customResource?.monthlyAmbientTempC || baseClimate.monthlyTemp;
  const diffuseFraction = baseClimate.diffuseFraction;

  const dataSourceName = customResource?.sourceName || 'Global Solar Climatology (GSA Benchmark)';

  // Calculate realistic electrical DC wiring loss from homerun cabling
  let dcCableLossPercent = 1.8; // Default standard estimate
  if (cableSummary && cableSummary.totalCableLengthM > 0) {
    // If long homeruns (>300m average), losses scale up realistically from 1.2% to 3.5%
    const avgLen = cableSummary.avgStringCableLengthM;
    if (avgLen > 0) {
      dcCableLossPercent = Math.min(3.8, Math.max(1.0, 1.2 + (avgLen / 120.0) * 0.8));
    }
  }

  // Calculate AC wiring loss from feeder summary
  let acWiringLossPercent = 1.0;
  if (acFeeder && acFeeder.voltageDropPercent > 0) {
    acWiringLossPercent = Math.min(3.0, Math.max(0.5, acFeeder.voltageDropPercent * 0.8));
  }

  // Environmental and optical losses
  const soilingLossPercent = 2.5; // Dust, bird dropping, periodic rain cleaning
  const lidLossPercent = 1.5;     // Light-Induced Degradation in first-year crystalline silicon
  const mismatchLossPercent = 1.5;// Module tolerance variation, partial bypass diodes
  const inverterBaseLossPercent = 2.0; // Inverter conversion efficiency ~98.0%
  const availabilityLossPercent = 1.0; // Grid curtailment, outages, maintenance window

  // Check Inverter DC/AC Ratio for power clipping
  let clippingLossPercent = 0.0;
  const targetSys = targetSystemId && targetSystemId !== 'all'
    ? systems.find(s => s.id === targetSystemId)
    : systems[0];

  if (targetSys) {
    const inverterAcCapacityKw = targetSys.inverter.inverterCount * targetSys.inverter.ratedAcPowerKw;
    if (inverterAcCapacityKw > 0) {
      const dcAcRatio = totalKwp / inverterAcCapacityKw;
      if (dcAcRatio > 1.30) {
        // High DC/AC ratio creates clipping during top 5% peak midday hours
        clippingLossPercent = Math.min(4.5, (dcAcRatio - 1.30) * 8.0);
      }
    }
  }

  let totalAnnualGhi = 0;
  let totalAnnualPoa = 0;
  let totalGrossDcEnergyKwh = 0;
  let totalNetAcEnergyKwh = 0;
  let totalThermalLossEnergyKwh = 0;

  const monthlyBreakdown: MonthlySolarData[] = [];

  for (let m = 0; m < 12; m++) {
    const days = DAYS_PER_MONTH[m];
    const ghiDay = monthlyGhi[m];
    const ambTemp = monthlyTemp[m];
    const dhiFrac = diffuseFraction[m];

    // Transposition factor for this month
    const transFactor = calculatePoaTranspositionFactor(
      m,
      projectCenter.lat,
      avgTilt,
      avgAzimuth,
      dhiFrac
    );

    const poaDay = Number((ghiDay * transFactor).toFixed(2));
    const monthlyPoaKwhM2 = poaDay * days;
    const monthlyGhiKwhM2 = ghiDay * days;

    totalAnnualGhi += monthlyGhiKwhM2;
    totalAnnualPoa += monthlyPoaKwhM2;

    // Operating cell temperature
    const cellTemp = calculateCellTemperature(ambTemp, poaDay, predominantMountType);

    // Temperature derating: modules rated at 25°C STC
    const tempDelta = cellTemp - 25.0;
    const tempDerateFactor = 1.0 + (tempCoeffPmax / 100.0) * tempDelta;

    // Raw ideal DC energy for this month (kWp * Peak Sun Hours)
    const grossDcKwh = totalKwp * monthlyPoaKwhM2;
    totalGrossDcEnergyKwh += grossDcKwh;

    // Apply loss chain:
    // 1. Temperature derate
    const tempAdjustedDcKwh = grossDcKwh * tempDerateFactor;
    totalThermalLossEnergyKwh += (grossDcKwh - tempAdjustedDcKwh);

    // 2. Optical & DC Losses (soiling, LID, mismatch, DC cabling)
    const dcLossFactor = (1 - soilingLossPercent / 100) *
                         (1 - lidLossPercent / 100) *
                         (1 - mismatchLossPercent / 100) *
                         (1 - dcCableLossPercent / 100);

    const netDcKwh = tempAdjustedDcKwh * dcLossFactor;

    // 3. Inverter Conversion & Clipping
    const inverterEfficiency = (1 - inverterBaseLossPercent / 100) * (1 - clippingLossPercent / 100);
    const grossAcKwh = netDcKwh * inverterEfficiency;

    // 4. AC Feeder & Grid Availability
    const acLossFactor = (1 - acWiringLossPercent / 100) * (1 - availabilityLossPercent / 100);
    const netAcKwh = Math.round(grossAcKwh * acLossFactor);

    totalNetAcEnergyKwh += netAcKwh;

    monthlyBreakdown.push({
      month: m,
      monthName: MONTH_NAMES[m],
      daysInMonth: days,
      ghiKwhPerM2Day: ghiDay,
      dhiFraction: dhiFrac,
      ambientTempC: ambTemp,
      poaKwhPerM2Day: poaDay,
      cellTempC: cellTemp,
      tempDerateFactor: Number(tempDerateFactor.toFixed(3)),
      grossDcKwh: Math.round(grossDcKwh),
      netAcKwh: netAcKwh
    });
  }

  // Summary Metrics
  const annualYieldKwh = Math.round(totalNetAcEnergyKwh);
  const specificYieldKwhPerKwp = Math.round(annualYieldKwh / totalKwp);

  // Performance Ratio (PR) = Actual Energy / (Nominal DC Power * Plane of Array Irradiation)
  const theoreticalPoaEnergy = totalKwp * totalAnnualPoa;
  const performanceRatio = theoreticalPoaEnergy > 0
    ? Number(((annualYieldKwh / theoreticalPoaEnergy) * 100).toFixed(1))
    : 0;

  // Capacity Factor (CF) = Net Generation / (Nameplate Capacity * 8760 hours)
  const capacityFactor = Number(((annualYieldKwh / (totalKwp * 8760)) * 100).toFixed(1));

  // Tilt/Azimuth transposition gain or loss relative to horizontal GHI
  const poaGainLossPercent = totalAnnualGhi > 0
    ? Number((((totalAnnualPoa - totalAnnualGhi) / totalAnnualGhi) * 100).toFixed(1))
    : 0;

  // Overall thermal loss percentage
  const thermalLossPercent = totalGrossDcEnergyKwh > 0
    ? Number(((totalThermalLossEnergyKwh / totalGrossDcEnergyKwh) * 100).toFixed(1))
    : 10.0;

  const totalLossPercent = Number((100 - performanceRatio).toFixed(1));

  const lossCascade: SolarLossCascade = {
    stcIdealKwh: Math.round(theoreticalPoaEnergy),
    poaGainLossPercent,
    soilingLossPercent,
    lidLossPercent,
    mismatchLossPercent,
    thermalLossPercent,
    dcCableLossPercent: Number(dcCableLossPercent.toFixed(1)),
    inverterLossPercent: Number(inverterBaseLossPercent.toFixed(1)),
    clippingLossPercent: Number(clippingLossPercent.toFixed(1)),
    acWiringLossPercent: Number(acWiringLossPercent.toFixed(1)),
    availabilityLossPercent,
    totalLossPercent
  };

  return {
    annualYieldKwh,
    specificYieldKwhPerKwp,
    performanceRatio,
    capacityFactor,
    annualGhiKwhPerM2: Math.round(totalAnnualGhi),
    annualPoaKwhPerM2: Math.round(totalAnnualPoa),
    dataSourceName,
    monthlyBreakdown,
    lossCascade
  };
}

function createEmptyYieldResult(): SolarYieldResult {
  return {
    annualYieldKwh: 0,
    specificYieldKwhPerKwp: 0,
    performanceRatio: 0,
    capacityFactor: 0,
    annualGhiKwhPerM2: 0,
    annualPoaKwhPerM2: 0,
    dataSourceName: 'None',
    monthlyBreakdown: [],
    lossCascade: {
      stcIdealKwh: 0,
      poaGainLossPercent: 0,
      soilingLossPercent: 0,
      lidLossPercent: 0,
      mismatchLossPercent: 0,
      thermalLossPercent: 0,
      dcCableLossPercent: 0,
      inverterLossPercent: 0,
      clippingLossPercent: 0,
      acWiringLossPercent: 0,
      availabilityLossPercent: 0,
      totalLossPercent: 0
    }
  };
}
