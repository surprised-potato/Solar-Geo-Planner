/**
 * Solar & Facility Load Matching Simulation Engine
 *
 * Implements combined energy simulation:
 * 1. 8760/diurnal solar generation curve synthesis from monthly Plane-of-Array yield
 * 2. Hourly matching against facility demand (weekday vs weekend diurnal curves)
 * 3. Energy balance dispatch:
 *    - Direct Solar Self-Consumption (kW & kWh)
 *    - Grid Energy Export (surplus solar, kW & kWh)
 *    - Grid Energy Import (facility net deficit, kW & kWh)
 * 4. Key Performance Indicators:
 *    - Renewable Energy (RE) Share (Total Solar / Total Load)
 *    - Solar Self-Sufficiency (Direct Solar Consumed / Total Load)
 *    - Solar Self-Consumption Ratio (Direct Solar Consumed / Total Solar)
 *    - Grid Dependency (Imported Energy / Total Load)
 * 5. Diurnal Dispatch Profile generation:
 *    - Monthly options (January through December, or Annual Average Day)
 *    - Weekly options (Full Week Blended, Weekday Monday-Friday, Weekend Saturday-Sunday)
 */

import { FacilityLoadProfile, MonthlyLoadRecord } from '../types/solar';
import { MonthlySolarData, SolarYieldResult } from './solarYield';
import { DAYS_PER_MONTH, MONTH_NAMES } from './loadProfile';

export interface HourlyEnergyDispatch {
  hour: number;          // 0..23
  hourLabel: string;     // "00:00", "01:00", ...
  solarKw: number;       // Solar generation power (kW)
  loadKw: number;        // Facility load demand (kW)
  selfConsumedKw: number;// min(solarKw, loadKw)
  exportKw: number;      // max(0, solarKw - loadKw)
  importKw: number;      // max(0, loadKw - solarKw)
}

export interface MonthlySimulationRecord {
  month: number;           // 0..11
  monthName: string;
  daysInMonth: number;
  solarGenerationKwh: number;
  facilityLoadKwh: number;
  selfConsumedKwh: number;
  exportedKwh: number;
  importedKwh: number;
  reSharePercent: number;        // (solar / load) * 100
  selfSufficiencyPercent: number;// (selfConsumed / load) * 100
  selfConsumptionPercent: number;// (selfConsumed / solar) * 100
}

export type SimulationPeriodOption = 'annual' | number; // 'annual' or 0..11 for specific month
export type SimulationWeeklyOption = 'week_avg' | 'weekday' | 'weekend';

export interface SimulationOptions {
  period: SimulationPeriodOption; // default 'annual'
  weekly: SimulationWeeklyOption; // default 'week_avg'
  importTariffPhp?: number;       // Retail electricity tariff (default 10.50 ₱/kWh)
  exportTariffPhp?: number;       // Feed-in / net-metering export credit (default 5.50 ₱/kWh)
}

export interface SimulationResult {
  annualSolarKwh: number;
  annualLoadKwh: number;
  annualSelfConsumedKwh: number;
  annualExportedKwh: number;
  annualImportedKwh: number;
  annualReSharePercent: number;         // (annualSolar / annualLoad) * 100
  annualSelfSufficiencyPercent: number; // (annualSelfConsumed / annualLoad) * 100
  annualSelfConsumptionPercent: number; // (annualSelfConsumed / annualSolar) * 100
  annualExportPercent: number;          // (annualExported / annualSolar) * 100
  annualImportPercent: number;          // (annualImported / annualLoad) * 100

  // Financial Net-Billing Summary
  originalBillPhp: number;
  newBillPhp: number;
  annualSavingsPhp: number;
  billReductionPercent: number;

  // Selected Diurnal Curve for Visualization
  selectedPeriodLabel: string;
  selectedWeeklyLabel: string;
  diurnalCurve: HourlyEnergyDispatch[];
  diurnalSummary: {
    peakSolarKw: number;
    peakLoadKw: number;
    dailySolarKwh: number;
    dailyLoadKwh: number;
    dailySelfConsumedKwh: number;
    dailyExportedKwh: number;
    dailyImportedKwh: number;
  };

  monthlyRecords: MonthlySimulationRecord[];
}

/**
 * Standard diurnal solar bell curve fractions (00:00 to 23:00) normalized to sum strictly to 1.0.
 * Active daylight hours from 06:00 to 18:00 peaking at solar noon (12:00).
 */
export const STANDARD_HOURLY_SOLAR_FRACTIONS: number[] = (() => {
  const fractions: number[] = Array(24).fill(0);
  let sum = 0;
  for (let h = 6; h < 18; h++) {
    const t = h + 0.5; // mid-hour
    const val = Math.max(0, Math.sin(((t - 6.0) / 12.0) * Math.PI));
    fractions[h] = val;
    sum += val;
  }
  return fractions.map(v => (sum > 0 ? v / sum : 0));
})();

/**
 * Executes high-fidelity solar and facility load matching simulation.
 */
export function simulateSolarAndLoadMatching(
  solarYield: SolarYieldResult,
  loadProfile: FacilityLoadProfile,
  options: Partial<SimulationOptions> = {}
): SimulationResult {
  const periodOpt: SimulationPeriodOption = options.period ?? 'annual';
  const weeklyOpt: SimulationWeeklyOption = options.weekly ?? 'week_avg';
  const importTariff = options.importTariffPhp ?? loadProfile.averageTariffRatePhp ?? 10.50;
  const exportTariff = options.exportTariffPhp ?? (importTariff * 0.55); // Default Net-Metering export credit ~55% of retail

  const monthlyRecords: MonthlySimulationRecord[] = [];
  let totalAnnualSolar = 0;
  let totalAnnualLoad = 0;
  let totalAnnualSelf = 0;
  let totalAnnualExport = 0;
  let totalAnnualImport = 0;

  // Simulate each month individually (0 to 11)
  for (let m = 0; m < 12; m++) {
    const days = DAYS_PER_MONTH[m];
    const solarMonthData: MonthlySolarData | undefined = solarYield.monthlyBreakdown[m];
    const loadMonthData: MonthlyLoadRecord | undefined = loadProfile.monthlyBreakdown[m];

    const monthlySolarKwh = solarMonthData ? solarMonthData.netAcKwh : 0;
    const monthlyLoadKwh = loadMonthData ? loadMonthData.consumptionKwh : 0;

    // Approximate weekday vs weekend split: 5/7 weekdays, 2/7 weekends
    const weekdaysCount = Math.round(days * (5 / 7));
    const weekendCount = days - weekdaysCount;

    // Weekday vs weekend load distribution
    let weekdayDailyLoadKwh = monthlyLoadKwh / days;
    let weekendDailyLoadKwh = monthlyLoadKwh / days;

    if (loadProfile.hasWeekendProfile && loadProfile.weekendDailyCurve) {
      // For office/industrial, weekend operations are typically ~30-40% of weekday
      const weekendRatio = 0.35;
      weekdayDailyLoadKwh = monthlyLoadKwh / (weekdaysCount + weekendCount * weekendRatio);
      weekendDailyLoadKwh = weekdayDailyLoadKwh * weekendRatio;
    }

    const dailySolarKwh = days > 0 ? monthlySolarKwh / days : 0;

    // Simulate hourly dispatch for weekday
    let weekdaySelfKwh = 0;
    let weekdayExportKwh = 0;
    let weekdayImportKwh = 0;

    const weekdayCurve = loadProfile.defaultDailyCurve || Array(24).fill(1 / 24);
    for (let h = 0; h < 24; h++) {
      const sKw = dailySolarKwh * STANDARD_HOURLY_SOLAR_FRACTIONS[h];
      const lKw = weekdayDailyLoadKwh * weekdayCurve[h];
      weekdaySelfKwh += Math.min(sKw, lKw);
      weekdayExportKwh += Math.max(0, sKw - lKw);
      weekdayImportKwh += Math.max(0, lKw - sKw);
    }

    // Simulate hourly dispatch for weekend
    let weekendSelfKwh = 0;
    let weekendExportKwh = 0;
    let weekendImportKwh = 0;

    const weekendCurve = (loadProfile.hasWeekendProfile && loadProfile.weekendDailyCurve)
      ? loadProfile.weekendDailyCurve
      : weekdayCurve;

    for (let h = 0; h < 24; h++) {
      const sKw = dailySolarKwh * STANDARD_HOURLY_SOLAR_FRACTIONS[h];
      const lKw = weekendDailyLoadKwh * weekendCurve[h];
      weekendSelfKwh += Math.min(sKw, lKw);
      weekendExportKwh += Math.max(0, sKw - lKw);
      weekendImportKwh += Math.max(0, lKw - sKw);
    }

    // Monthly totals combined
    const monthSelfKwh = Math.round(weekdaySelfKwh * weekdaysCount + weekendSelfKwh * weekendCount);
    const monthExportKwh = Math.round(weekdayExportKwh * weekdaysCount + weekendExportKwh * weekendCount);
    const monthImportKwh = Math.round(weekdayImportKwh * weekdaysCount + weekendImportKwh * weekendCount);

    totalAnnualSolar += monthlySolarKwh;
    totalAnnualLoad += monthlyLoadKwh;
    totalAnnualSelf += monthSelfKwh;
    totalAnnualExport += monthExportKwh;
    totalAnnualImport += monthImportKwh;

    const reShare = monthlyLoadKwh > 0 ? Number(((monthlySolarKwh / monthlyLoadKwh) * 100).toFixed(1)) : 0;
    const selfSufficiency = monthlyLoadKwh > 0 ? Number(((monthSelfKwh / monthlyLoadKwh) * 100).toFixed(1)) : 0;
    const selfConsumption = monthlySolarKwh > 0 ? Number(((monthSelfKwh / monthlySolarKwh) * 100).toFixed(1)) : 0;

    monthlyRecords.push({
      month: m,
      monthName: MONTH_NAMES[m],
      daysInMonth: days,
      solarGenerationKwh: monthlySolarKwh,
      facilityLoadKwh: monthlyLoadKwh,
      selfConsumedKwh: monthSelfKwh,
      exportedKwh: monthExportKwh,
      importedKwh: monthImportKwh,
      reSharePercent: reShare,
      selfSufficiencyPercent: selfSufficiency,
      selfConsumptionPercent: selfConsumption
    });
  }

  // Annual Totals & KPIs
  const annualReSharePercent = totalAnnualLoad > 0
    ? Number(((totalAnnualSolar / totalAnnualLoad) * 100).toFixed(1))
    : 0;

  const annualSelfSufficiencyPercent = totalAnnualLoad > 0
    ? Number(((totalAnnualSelf / totalAnnualLoad) * 100).toFixed(1))
    : 0;

  const annualSelfConsumptionPercent = totalAnnualSolar > 0
    ? Number(((totalAnnualSelf / totalAnnualSolar) * 100).toFixed(1))
    : 0;

  const annualExportPercent = totalAnnualSolar > 0
    ? Number(((totalAnnualExport / totalAnnualSolar) * 100).toFixed(1))
    : 0;

  const annualImportPercent = totalAnnualLoad > 0
    ? Number(((totalAnnualImport / totalAnnualLoad) * 100).toFixed(1))
    : 0;

  // Financial Net-Billing Summary
  const originalBillPhp = Math.round(totalAnnualLoad * importTariff);
  const costOfImportPhp = totalAnnualImport * importTariff;
  const creditFromExportPhp = totalAnnualExport * exportTariff;
  const newBillPhp = Math.round(Math.max(0, costOfImportPhp - creditFromExportPhp));
  const annualSavingsPhp = Math.round(originalBillPhp - newBillPhp);
  const billReductionPercent = originalBillPhp > 0
    ? Number(((annualSavingsPhp / originalBillPhp) * 100).toFixed(1))
    : 0;

  // Generate Diurnal Dispatch Curve for Selected Options
  let repDailySolarKwh = 0;
  let repDailyLoadKwh = 0;
  let selectedPeriodLabel = 'Annual Average Day';
  let selectedWeeklyLabel = 'Full Week (7-Day Average)';

  if (typeof periodOpt === 'number' && periodOpt >= 0 && periodOpt <= 11) {
    const m = periodOpt;
    selectedPeriodLabel = `${MONTH_NAMES[m]} (Daily Average)`;
    const d = DAYS_PER_MONTH[m];
    repDailySolarKwh = monthlyRecords[m].solarGenerationKwh / d;

    const weekdaysCount = Math.round(d * (5 / 7));
    const weekendCount = d - weekdaysCount;
    const weekendRatio = loadProfile.hasWeekendProfile ? 0.35 : 1.0;
    const weekdayLoad = monthlyRecords[m].facilityLoadKwh / (weekdaysCount + weekendCount * weekendRatio);
    const weekendLoad = weekdayLoad * weekendRatio;

    if (weeklyOpt === 'weekday') {
      repDailyLoadKwh = weekdayLoad;
      selectedWeeklyLabel = 'Weekday (Mon – Fri)';
    } else if (weeklyOpt === 'weekend') {
      repDailyLoadKwh = weekendLoad;
      selectedWeeklyLabel = 'Weekend (Sat – Sun)';
    } else {
      repDailyLoadKwh = monthlyRecords[m].facilityLoadKwh / d;
      selectedWeeklyLabel = 'Full Week (7-Day Average)';
    }
  } else {
    // Annual Average Day
    selectedPeriodLabel = 'Annual Average Day';
    repDailySolarKwh = totalAnnualSolar / 365;

    const weekdayLoad = totalAnnualLoad / (260 + 105 * (loadProfile.hasWeekendProfile ? 0.35 : 1.0));
    const weekendLoad = weekdayLoad * (loadProfile.hasWeekendProfile ? 0.35 : 1.0);

    if (weeklyOpt === 'weekday') {
      repDailyLoadKwh = weekdayLoad;
      selectedWeeklyLabel = 'Weekday (Mon – Fri)';
    } else if (weeklyOpt === 'weekend') {
      repDailyLoadKwh = weekendLoad;
      selectedWeeklyLabel = 'Weekend (Sat – Sun)';
    } else {
      repDailyLoadKwh = totalAnnualLoad / 365;
      selectedWeeklyLabel = 'Full Week (7-Day Average)';
    }
  }

  // Load fraction curve for the diurnal profile
  let loadFractionCurve: number[] = loadProfile.defaultDailyCurve || Array(24).fill(1 / 24);
  if (weeklyOpt === 'weekend' && loadProfile.hasWeekendProfile && loadProfile.weekendDailyCurve) {
    loadFractionCurve = loadProfile.weekendDailyCurve;
  } else if (weeklyOpt === 'week_avg' && loadProfile.hasWeekendProfile && loadProfile.weekendDailyCurve) {
    // 5/7 weekday + 2/7 weekend weighted
    loadFractionCurve = loadFractionCurve.map((wVal, h) =>
      (wVal * 5.0 + loadProfile.weekendDailyCurve![h] * 2.0) / 7.0
    );
  }

  const diurnalCurve: HourlyEnergyDispatch[] = [];
  let peakSolar = 0;
  let peakLoad = 0;
  let sumDailySelf = 0;
  let sumDailyExport = 0;
  let sumDailyImport = 0;

  for (let h = 0; h < 24; h++) {
    const sKw = Number((repDailySolarKwh * STANDARD_HOURLY_SOLAR_FRACTIONS[h]).toFixed(1));
    const lKw = Number((repDailyLoadKwh * loadFractionCurve[h]).toFixed(1));

    if (sKw > peakSolar) peakSolar = sKw;
    if (lKw > peakLoad) peakLoad = lKw;

    const selfKw = Number(Math.min(sKw, lKw).toFixed(1));
    const expKw = Number(Math.max(0, sKw - lKw).toFixed(1));
    const impKw = Number(Math.max(0, lKw - sKw).toFixed(1));

    sumDailySelf += selfKw;
    sumDailyExport += expKw;
    sumDailyImport += impKw;

    diurnalCurve.push({
      hour: h,
      hourLabel: `${h.toString().padStart(2, '0')}:00`,
      solarKw: sKw,
      loadKw: lKw,
      selfConsumedKw: selfKw,
      exportKw: expKw,
      importKw: impKw
    });
  }

  return {
    annualSolarKwh: totalAnnualSolar,
    annualLoadKwh: totalAnnualLoad,
    annualSelfConsumedKwh: totalAnnualSelf,
    annualExportedKwh: totalAnnualExport,
    annualImportedKwh: totalAnnualImport,
    annualReSharePercent,
    annualSelfSufficiencyPercent,
    annualSelfConsumptionPercent,
    annualExportPercent,
    annualImportPercent,
    originalBillPhp,
    newBillPhp,
    annualSavingsPhp,
    billReductionPercent,
    selectedPeriodLabel,
    selectedWeeklyLabel,
    diurnalCurve,
    diurnalSummary: {
      peakSolarKw: peakSolar,
      peakLoadKw: peakLoad,
      dailySolarKwh: Math.round(repDailySolarKwh),
      dailyLoadKwh: Math.round(repDailyLoadKwh),
      dailySelfConsumedKwh: Math.round(sumDailySelf),
      dailyExportedKwh: Math.round(sumDailyExport),
      dailyImportedKwh: Math.round(sumDailyImport)
    },
    monthlyRecords
  };
}
