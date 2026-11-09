/**
 * Engineering library for facility load profile modeling, standard diurnal curves,
 * normalization, and CSV ingestion (monthly utility bills, 24-hour diurnal curves,
 * and 8760 AMI/SCADA interval logs).
 *
 * Prepared for subsequent Renewable Energy (RE) Share matching and solar self-consumption.
 */

import { FacilityLoadProfile, LoadProfileArchetype, MonthlyLoadRecord } from '../types/solar';

export const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface ArchetypeCurveSet {
  name: string;
  description: string;
  weekday: number[];
  weekend: number[];
}

const RAW_ARCHETYPE_DIURNAL_CURVES: Record<LoadProfileArchetype, ArchetypeCurveSet> = {
  commercial_office: {
    name: 'Commercial Office',
    description: '8:00 AM – 5:00 PM corporate operations, sharp daytime bell, minimal nights & weekends',
    weekday: [
      0.015, 0.015, 0.015, 0.015, 0.020, 0.030, 0.050, 0.075,
      0.085, 0.090, 0.095, 0.090, 0.085, 0.085, 0.080, 0.070,
      0.050, 0.035, 0.025, 0.020, 0.015, 0.015, 0.015, 0.015
    ],
    weekend: [
      0.040, 0.040, 0.040, 0.040, 0.040, 0.040, 0.042, 0.045,
      0.045, 0.045, 0.045, 0.045, 0.045, 0.045, 0.045, 0.045,
      0.042, 0.040, 0.040, 0.040, 0.040, 0.040, 0.040, 0.040
    ]
  },
  industrial_1shift: {
    name: 'Industrial (1 Shift)',
    description: '7:00 AM – 4:00 PM single manufacturing shift, motor & process loads, off-peak idle',
    weekday: [
      0.018, 0.018, 0.018, 0.018, 0.020, 0.030, 0.060, 0.088,
      0.092, 0.092, 0.092, 0.088, 0.088, 0.085, 0.080, 0.040,
      0.025, 0.020, 0.020, 0.020, 0.018, 0.018, 0.018, 0.018
    ],
    weekend: [
      0.040, 0.040, 0.040, 0.040, 0.040, 0.040, 0.040, 0.042,
      0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042,
      0.040, 0.040, 0.040, 0.040, 0.040, 0.040, 0.040, 0.040
    ]
  },
  industrial_24_7: {
    name: 'Industrial (24/7 Continuous)',
    description: 'Continuous processing, heavy machinery, data centers, cold storage (identical every day)',
    weekday: Array(24).fill(1 / 24),
    weekend: Array(24).fill(1 / 24)
  },
  retail_commercial: {
    name: 'Retail & Shopping Mall',
    description: '10:00 AM – 9:00 PM customer hours, sustained lighting & HVAC with elevated weekend peaks',
    weekday: [
      0.015, 0.015, 0.015, 0.015, 0.015, 0.020, 0.030, 0.045,
      0.060, 0.075, 0.080, 0.085, 0.085, 0.080, 0.080, 0.080,
      0.075, 0.070, 0.060, 0.040, 0.025, 0.015, 0.015, 0.015
    ],
    weekend: [
      0.015, 0.015, 0.015, 0.015, 0.015, 0.020, 0.030, 0.045,
      0.065, 0.085, 0.095, 0.100, 0.100, 0.095, 0.090, 0.090,
      0.085, 0.075, 0.060, 0.040, 0.025, 0.015, 0.015, 0.015
    ]
  },
  school_institution: {
    name: 'School / Academic Campus',
    description: '7:30 AM – 5:00 PM academic daytime schedule, closed on weekends with standby baseload',
    weekday: [
      0.015, 0.015, 0.015, 0.015, 0.020, 0.035, 0.070, 0.095,
      0.100, 0.100, 0.095, 0.090, 0.085, 0.080, 0.070, 0.050,
      0.030, 0.020, 0.015, 0.015, 0.015, 0.015, 0.015, 0.015
    ],
    weekend: [
      0.040, 0.040, 0.040, 0.040, 0.040, 0.040, 0.040, 0.042,
      0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042,
      0.040, 0.040, 0.040, 0.040, 0.040, 0.040, 0.040, 0.040
    ]
  },
  hospital_healthcare: {
    name: 'Hospital / Healthcare',
    description: '24/7 continuous patient care baseload with elevated daytime clinical & surgery peaks',
    weekday: [
      0.032, 0.031, 0.030, 0.030, 0.032, 0.036, 0.042, 0.050,
      0.055, 0.056, 0.056, 0.055, 0.054, 0.054, 0.052, 0.050,
      0.048, 0.045, 0.042, 0.040, 0.038, 0.036, 0.034, 0.032
    ],
    weekend: [
      0.032, 0.031, 0.030, 0.030, 0.032, 0.035, 0.038, 0.044,
      0.048, 0.050, 0.050, 0.050, 0.048, 0.048, 0.046, 0.045,
      0.044, 0.042, 0.040, 0.038, 0.036, 0.035, 0.034, 0.032
    ]
  },
  residential_standard: {
    name: 'Residential (Standard Dual-Peak)',
    description: 'Morning preparation peak (6:00–9:00 AM) and evening family peak (6:00–10:00 PM)',
    weekday: [
      0.025, 0.020, 0.018, 0.018, 0.022, 0.035, 0.065, 0.075,
      0.055, 0.040, 0.035, 0.032, 0.030, 0.030, 0.032, 0.035,
      0.045, 0.060, 0.080, 0.095, 0.090, 0.070, 0.050, 0.035
    ],
    weekend: [
      0.030, 0.025, 0.020, 0.018, 0.020, 0.025, 0.040, 0.055,
      0.065, 0.065, 0.060, 0.055, 0.050, 0.048, 0.050, 0.055,
      0.065, 0.075, 0.085, 0.090, 0.080, 0.060, 0.045, 0.035
    ]
  },
  custom: {
    name: 'Custom User Profile',
    description: 'User-specified hourly shape or imported CSV curve',
    weekday: Array(24).fill(1 / 24),
    weekend: Array(24).fill(1 / 24)
  }
};

/**
 * Normalizes an array of numbers so their sum equals 1.0.
 * If all values are 0 or empty, returns a uniform 1/N array.
 */
export function normalizeDailyCurve(curve: number[]): number[] {
  if (!curve || curve.length === 0) return Array(24).fill(1 / 24);
  const targetLen = 24;
  const values = curve.slice(0, targetLen);
  while (values.length < targetLen) values.push(0);

  const sum = values.reduce((acc, v) => acc + (isNaN(v) || v < 0 ? 0 : v), 0);
  if (sum <= 0) return Array(targetLen).fill(1 / targetLen);

  return values.map(v => Math.max(0, (isNaN(v) ? 0 : v) / sum));
}

/**
 * Standard 24-hour diurnal curves normalized to hourly fractions summing strictly to 1.0.
 * Index 0 corresponds to 00:00 - 01:00, index 12 to 12:00 - 13:00, index 23 to 23:00 - 24:00.
 */
export const ARCHETYPE_DIURNAL_CURVES: Record<LoadProfileArchetype, ArchetypeCurveSet> = (() => {
  const normalized: Partial<Record<LoadProfileArchetype, ArchetypeCurveSet>> = {};
  for (const [key, set] of Object.entries(RAW_ARCHETYPE_DIURNAL_CURVES)) {
    const arch = key as LoadProfileArchetype;
    normalized[arch] = {
      name: set.name,
      description: set.description,
      weekday: normalizeDailyCurve(set.weekday),
      weekend: normalizeDailyCurve(set.weekend)
    };
  }
  return normalized as Record<LoadProfileArchetype, ArchetypeCurveSet>;
})();

/**
 * Creates a default FacilityLoadProfile pre-populated with standard 12-month records
 * and archetype diurnal curves.
 */
export function createDefaultLoadProfile(
  annualKwh: number = 360000,
  archetype: LoadProfileArchetype = 'commercial_office',
  name: string = 'Facility Main Meter Load',
  systemId?: string
): FacilityLoadProfile {
  const curveSet = ARCHETYPE_DIURNAL_CURVES[archetype] || ARCHETYPE_DIURNAL_CURVES.commercial_office;
  const daysInYear = 365;

  // Distribute annual kWh proportionally according to days in each month
  const monthlyBreakdown: MonthlyLoadRecord[] = DAYS_PER_MONTH.map((days, idx) => {
    const monthlyFraction = days / daysInYear;
    const monthlyKwh = Math.round(annualKwh * monthlyFraction);
    // Approximate peak demand based on typical commercial load factor ~ 0.55 - 0.70
    const hoursInMonth = days * 24;
    const avgKw = monthlyKwh / hoursInMonth;
    const peakKw = Number((avgKw / 0.60).toFixed(1));

    return {
      month: idx,
      monthName: MONTH_NAMES[idx],
      daysInMonth: days,
      consumptionKwh: monthlyKwh,
      peakDemandKw: peakKw,
      energyCostPhp: Math.round(monthlyKwh * 10.50)
    };
  });

  const exactAnnualKwh = monthlyBreakdown.reduce((sum, m) => sum + m.consumptionKwh, 0);

  return {
    id: `load_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name,
    systemId: systemId || undefined,
    archetype,
    annualKwh: exactAnnualKwh,
    monthlyBreakdown,
    hasWeekendProfile: archetype !== 'industrial_24_7',
    defaultDailyCurve: normalizeDailyCurve(curveSet.weekday),
    weekendDailyCurve: normalizeDailyCurve(curveSet.weekend),
    sourceType: 'preset',
    averageTariffRatePhp: 10.50,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Scales all 12 monthly kWh consumptions proportionally to match a new annual kWh total.
 */
export function scaleAnnualLoad(profile: FacilityLoadProfile, newAnnualKwh: number): FacilityLoadProfile {
  if (newAnnualKwh <= 0) return profile;

  const currentTotal = profile.monthlyBreakdown.reduce((acc, m) => acc + m.consumptionKwh, 0);
  const factor = currentTotal > 0 ? newAnnualKwh / currentTotal : newAnnualKwh / 365;

  const updatedBreakdown: MonthlyLoadRecord[] = profile.monthlyBreakdown.map((m, idx) => {
    const newKwh = currentTotal > 0
      ? Math.round(m.consumptionKwh * factor)
      : Math.round(newAnnualKwh * (DAYS_PER_MONTH[idx] / 365));

    const hours = m.daysInMonth * 24;
    const avgKw = newKwh / hours;
    const peakKw = m.peakDemandKw ? Number((m.peakDemandKw * factor).toFixed(1)) : Number((avgKw / 0.60).toFixed(1));
    const cost = profile.averageTariffRatePhp ? Math.round(newKwh * profile.averageTariffRatePhp) : m.energyCostPhp;

    return {
      ...m,
      consumptionKwh: newKwh,
      peakDemandKw: peakKw,
      energyCostPhp: cost
    };
  });

  const sumKwh = updatedBreakdown.reduce((acc, m) => acc + m.consumptionKwh, 0);

  return {
    ...profile,
    annualKwh: sumKwh,
    monthlyBreakdown: updatedBreakdown,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Parses a 12-month utility billing CSV string.
 * Supports flexible headers:
 *   Month, kWh, [PeakKW], [Cost]
 * or 12 numeric lines.
 */
export function parseMonthlyBillingCsv(csvText: string): MonthlyLoadRecord[] {
  if (!csvText || !csvText.trim()) {
    throw new Error('CSV text is empty.');
  }

  const lines = csvText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length < 12) {
    throw new Error(`CSV contains ${lines.length} rows, but 12 monthly rows are required.`);
  }

  // Check if first line is a header
  let dataLines = lines;
  const firstCols = lines[0].toLowerCase().split(/[,\t;]/).map(s => s.trim().replace(/['"]/g, ''));
  const isHeader = isNaN(Number(firstCols[0])) && !MONTH_NAMES.some(m => m.toLowerCase() === firstCols[0]);

  if (isHeader) {
    dataLines = lines.slice(1);
  }

  if (dataLines.length < 12) {
    throw new Error(`After removing header, found only ${dataLines.length} rows. Exactly 12 months (Jan–Dec) are required.`);
  }

  const records: MonthlyLoadRecord[] = [];

  for (let i = 0; i < 12; i++) {
    const parts = dataLines[i].split(/[,\t;]/).map(s => s.trim().replace(/['"]/g, ''));
    let kwhVal = 0;
    let peakVal: number | undefined = undefined;
    let costVal: number | undefined = undefined;

    // Detect if column 0 is month name / index, or if column 0 is directly the kWh value
    if (parts.length === 1) {
      kwhVal = parseFloat(parts[0]);
    } else {
      const num0 = parseFloat(parts[0]);
      const num1 = parseFloat(parts[1]);

      if (!isNaN(num0) && isNaN(num1)) {
        // e.g. "12000, Jan"
        kwhVal = num0;
      } else if (isNaN(num0) && !isNaN(num1)) {
        // e.g. "Jan, 12000, 45, 120000"
        kwhVal = num1;
        if (parts.length > 2 && !isNaN(parseFloat(parts[2]))) peakVal = parseFloat(parts[2]);
        if (parts.length > 3 && !isNaN(parseFloat(parts[3]))) costVal = parseFloat(parts[3]);
      } else {
        // e.g. "1, 12000" or "12000, 45"
        kwhVal = num1;
        if (parts.length > 2 && !isNaN(parseFloat(parts[2]))) peakVal = parseFloat(parts[2]);
      }
    }

    if (isNaN(kwhVal) || kwhVal < 0) {
      throw new Error(`Invalid consumption value for month ${MONTH_NAMES[i]} on row ${i + 1}: "${dataLines[i]}"`);
    }

    const days = DAYS_PER_MONTH[i];
    records.push({
      month: i,
      monthName: MONTH_NAMES[i],
      daysInMonth: days,
      consumptionKwh: Math.round(kwhVal),
      peakDemandKw: peakVal !== undefined ? Number(peakVal.toFixed(1)) : undefined,
      energyCostPhp: costVal !== undefined ? Math.round(costVal) : undefined
    });
  }

  return records;
}

/**
 * Parses a 24-hour diurnal load curve CSV string.
 * Supports headers: Hour (0..23), kW or Weight/Fraction.
 */
export function parseDiurnalCurveCsv(csvText: string): number[] {
  if (!csvText || !csvText.trim()) {
    throw new Error('CSV text is empty.');
  }

  const lines = csvText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  let dataLines = lines;
  const firstCols = lines[0].toLowerCase().split(/[,\t;]/).map(s => s.trim().replace(/['"]/g, ''));
  const isHeader = isNaN(Number(firstCols[0])) && isNaN(Number(firstCols[1]));
  if (isHeader) {
    dataLines = lines.slice(1);
  }

  if (dataLines.length < 24) {
    throw new Error(`CSV contains ${dataLines.length} rows, but 24 hourly rows (00:00 to 23:00) are required.`);
  }

  const rawValues: number[] = [];

  for (let h = 0; h < 24; h++) {
    const parts = dataLines[h].split(/[,\t;]/).map(s => s.trim().replace(/['"]/g, ''));
    let val = 0;
    if (parts.length === 1) {
      val = parseFloat(parts[0]);
    } else {
      val = parseFloat(parts[1]);
      if (isNaN(val)) val = parseFloat(parts[0]);
    }

    if (isNaN(val) || val < 0) {
      throw new Error(`Invalid hourly load value for hour ${h}:00 on row ${h + 1}: "${dataLines[h]}"`);
    }
    rawValues.push(val);
  }

  return normalizeDailyCurve(rawValues);
}

/**
 * Parses a raw 8760 hourly smart meter / AMI / SCADA interval CSV log.
 * Computes 12-month totals, peak kW, and extracts the averaged 24-hour diurnal profile.
 */
export function parse8760IntervalCsv(csvText: string): {
  monthlyRecords: MonthlyLoadRecord[];
  diurnalCurve: number[];
  annualKwh: number;
  peakDemandKw: number;
} {
  if (!csvText || !csvText.trim()) {
    throw new Error('CSV text is empty.');
  }

  const lines = csvText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  let dataLines = lines;
  const firstCols = lines[0].toLowerCase().split(/[,\t;]/).map(s => s.trim().replace(/['"]/g, ''));
  const isHeader = isNaN(Number(firstCols[0])) && isNaN(Number(firstCols[1]));
  if (isHeader) {
    dataLines = lines.slice(1);
  }

  if (dataLines.length < 8000) {
    throw new Error(`Found ${dataLines.length} interval rows. An 8760 AMI dataset requires at least 8,000 hourly rows.`);
  }

  const monthlySums = Array(12).fill(0);
  const monthlyPeaks = Array(12).fill(0);
  const hourlyHourSums = Array(24).fill(0);
  const hourlyHourCounts = Array(24).fill(0);
  let overallPeak = 0;

  // Determine days in cumulative sequence to map 8760 row index to month and hour
  // Hour index 0..8759
  let dayOfYear = 0;
  let hourOfDay = 0;

  for (let r = 0; r < dataLines.length && r < 8760; r++) {
    const parts = dataLines[r].split(/[,\t;]/).map(s => s.trim().replace(/['"]/g, ''));
    let val = 0;
    if (parts.length === 1) {
      val = parseFloat(parts[0]);
    } else {
      val = parseFloat(parts[1]);
      if (isNaN(val)) val = parseFloat(parts[0]);
    }

    if (isNaN(val) || val < 0) val = 0;

    // Track peak
    if (val > overallPeak) overallPeak = val;

    // Determine month based on day of year
    dayOfYear = Math.floor(r / 24);
    hourOfDay = r % 24;

    let mIdx = 0;
    let accumulatedDays = 0;
    for (let m = 0; m < 12; m++) {
      if (dayOfYear < accumulatedDays + DAYS_PER_MONTH[m]) {
        mIdx = m;
        break;
      }
      accumulatedDays += DAYS_PER_MONTH[m];
    }

    monthlySums[mIdx] += val;
    if (val > monthlyPeaks[mIdx]) monthlyPeaks[mIdx] = val;

    hourlyHourSums[hourOfDay] += val;
    hourlyHourCounts[hourOfDay]++;
  }

  const annualKwh = Math.round(monthlySums.reduce((a, b) => a + b, 0));

  const monthlyRecords: MonthlyLoadRecord[] = DAYS_PER_MONTH.map((days, idx) => ({
    month: idx,
    monthName: MONTH_NAMES[idx],
    daysInMonth: days,
    consumptionKwh: Math.round(monthlySums[idx]),
    peakDemandKw: Number(monthlyPeaks[idx].toFixed(1)),
    energyCostPhp: Math.round(monthlySums[idx] * 10.50)
  }));

  const averagedDiurnal = hourlyHourSums.map((sum, h) =>
    hourlyHourCounts[h] > 0 ? sum / hourlyHourCounts[h] : 0
  );

  return {
    monthlyRecords,
    diurnalCurve: normalizeDailyCurve(averagedDiurnal),
    annualKwh,
    peakDemandKw: Number(overallPeak.toFixed(1))
  };
}

/**
 * Generates a clean, ready-to-fill CSV template for 12-month utility billing.
 */
export function generateMonthlyBillCsvTemplate(): string {
  let csv = 'Month,Consumption_kWh,Peak_Demand_kW,Energy_Cost_PHP\n';
  MONTH_NAMES.forEach((m, idx) => {
    const demoKwh = Math.round(30000 * (DAYS_PER_MONTH[idx] / 30));
    const demoPeak = Number((demoKwh / (DAYS_PER_MONTH[idx] * 24 * 0.6)).toFixed(1));
    const demoCost = Math.round(demoKwh * 10.5);
    csv += `${m},${demoKwh},${demoPeak},${demoCost}\n`;
  });
  return csv;
}

/**
 * Generates a clean, ready-to-fill CSV template for 24-hour diurnal profile.
 */
export function generateDiurnalCurveCsvTemplate(): string {
  let csv = 'Hour,Load_Fraction_Percent\n';
  const defaultCurve = ARCHETYPE_DIURNAL_CURVES.commercial_office.weekday;
  for (let h = 0; h < 24; h++) {
    const hourLabel = `${h.toString().padStart(2, '0')}:00`;
    const pct = Number((defaultCurve[h] * 100).toFixed(2));
    csv += `${hourLabel},${pct}\n`;
  }
  return csv;
}
