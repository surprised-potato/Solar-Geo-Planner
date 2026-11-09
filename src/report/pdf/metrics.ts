import { SolarYieldResult } from '../../geo/solarYield';
import { SldSystemModel } from '../../geo/sldModel';
import { InverterConfig, ModuleModel } from '../../types/solar';

export interface MonthlyPerformanceRow {
  monthName: string;
  ghiKwhM2: number;
  poaKwhM2: number;
  tAmbC: number;
  tCellC: number;
  eArrayMwh: number;
  eGridMwh: number;
  specificYieldKwhKwp: number;
  prPercent: number;
}

export interface MonthlyPerformance {
  rows: MonthlyPerformanceRow[];
  total: MonthlyPerformanceRow;
  /** Nameplate kWp implied by the annual result (energy / (PR * POA)). */
  referenceKwp: number;
}

/**
 * Derives per-month specific yield and Performance Ratio from the monthly breakdown.
 * PR_month = E_grid / (kWp * H_POA_month), using the same kWp basis as the annual PR.
 */
export function computeMonthlyPerformance(sy: SolarYieldResult): MonthlyPerformance {
  const months = sy.monthlyBreakdown;
  const poaOf = (m: (typeof months)[number]): number => m.poaKwhPerM2Day * m.daysInMonth;
  const poaSum = months.reduce((s, m) => s + poaOf(m), 0);
  const referenceKwp =
    sy.performanceRatio > 0 && poaSum > 0 ? sy.annualYieldKwh / ((sy.performanceRatio / 100) * poaSum) : 0;

  const rows: MonthlyPerformanceRow[] = months.map(m => {
    const poa = poaOf(m);
    const pr = referenceKwp > 0 && poa > 0 ? (m.netAcKwh / (referenceKwp * poa)) * 100 : 0;
    return {
      monthName: m.monthName,
      ghiKwhM2: m.ghiKwhPerM2Day * m.daysInMonth,
      poaKwhM2: poa,
      tAmbC: m.ambientTempC,
      tCellC: m.cellTempC,
      eArrayMwh: m.grossDcKwh / 1000,
      eGridMwh: m.netAcKwh / 1000,
      specificYieldKwhKwp: referenceKwp > 0 ? m.netAcKwh / referenceKwp : 0,
      prPercent: pr
    };
  });

  const n = Math.max(rows.length, 1);
  const sum = (f: (r: MonthlyPerformanceRow) => number): number => rows.reduce((s, r) => s + f(r), 0);
  const totalEGrid = sum(r => r.eGridMwh);
  const totalPoa = sum(r => r.poaKwhM2);
  const total: MonthlyPerformanceRow = {
    monthName: 'Year',
    ghiKwhM2: sum(r => r.ghiKwhM2),
    poaKwhM2: totalPoa,
    tAmbC: sum(r => r.tAmbC) / n,
    tCellC: sum(r => r.tCellC) / n,
    eArrayMwh: sum(r => r.eArrayMwh),
    eGridMwh: totalEGrid,
    specificYieldKwhKwp: referenceKwp > 0 ? (totalEGrid * 1000) / referenceKwp : 0,
    prPercent: referenceKwp > 0 && totalPoa > 0 ? ((totalEGrid * 1000) / (referenceKwp * totalPoa)) * 100 : 0
  };
  return { rows, total, referenceKwp };
}

export type CheckStatus = 'PASS' | 'FAIL' | 'N/A';

export interface DesignCheck {
  parameter: string;
  value: string;
  limit: string;
  status: CheckStatus;
  note?: string;
}

export const COLD_TEMP_C = -10;
export const HOT_CELL_TEMP_C = 70;
export const AC_VOLTAGE_DROP_LIMIT_PERCENT = 3;

/**
 * Builds the string/inverter design checks from the actual SLD stringing, not from
 * assumed values. A check with no data (e.g. no strings yet) is reported as N/A.
 */
export function buildDesignChecks(model: SldSystemModel, inverter: InverterConfig, module: ModuleModel): DesignCheck[] {
  const checks: DesignCheck[] = [];
  const strings = model.strings;
  const hasStrings = strings.length > 0;

  // 1. Cold Voc
  if (hasStrings) {
    const worst = strings.reduce((a, b) => (b.coldVoc > a.coldVoc ? b : a));
    checks.push({
      parameter: `Max string Voc at ${COLD_TEMP_C}°C`,
      value: `${worst.coldVoc.toFixed(1)} V (${worst.panelCount} mods)`,
      limit: `<= ${inverter.maxDcVoltage} V DC`,
      status: worst.coldVoc <= inverter.maxDcVoltage ? 'PASS' : 'FAIL'
    });
  } else {
    checks.push({ parameter: `Max string Voc at ${COLD_TEMP_C}°C`, value: 'No strings', limit: `<= ${inverter.maxDcVoltage} V DC`, status: 'N/A' });
  }

  // 2. Hot Vmp (module data sheet has no Vmp coefficient: Pmax coefficient is used as the proxy)
  if (hasStrings) {
    const fewest = strings.reduce((a, b) => (b.panelCount < a.panelCount ? b : a));
    const coeff = module.tempCoeffPmax || -0.35;
    const vmpHot = fewest.panelCount * module.vmp * (1 + (coeff / 100) * (HOT_CELL_TEMP_C - 25));
    checks.push({
      parameter: `Min string Vmp at ${HOT_CELL_TEMP_C}°C cell`,
      value: `${vmpHot.toFixed(1)} V (${fewest.panelCount} mods)`,
      limit: `>= ${inverter.minMpptVoltage} V MPPT`,
      status: vmpHot >= inverter.minMpptVoltage ? 'PASS' : 'FAIL',
      note: 'Vmp temperature coefficient approximated by the Pmax coefficient.'
    });
  } else {
    checks.push({ parameter: `Min string Vmp at ${HOT_CELL_TEMP_C}°C cell`, value: 'No strings', limit: `>= ${inverter.minMpptVoltage} V MPPT`, status: 'N/A' });
  }

  // 3. MPPT current
  const mpptStringCounts: number[] = [];
  for (const inv of model.inverters) for (const m of inv.mppts) mpptStringCounts.push(m.strings.length);
  const maxStrPerMppt = mpptStringCounts.length ? Math.max(...mpptStringCounts) : 0;
  if (maxStrPerMppt > 0) {
    const isc = maxStrPerMppt * module.isc;
    checks.push({
      parameter: 'Max short-circuit current per MPPT',
      value: `${isc.toFixed(1)} A (${maxStrPerMppt} str)`,
      limit: `<= ${inverter.maxDcCurrentPerMppt} A`,
      status: isc <= inverter.maxDcCurrentPerMppt ? 'PASS' : 'FAIL'
    });
  } else {
    checks.push({ parameter: 'Max short-circuit current per MPPT', value: 'No strings', limit: `<= ${inverter.maxDcCurrentPerMppt} A`, status: 'N/A' });
  }

  // 4. DC/AC ratio
  if (model.totalAcKw > 0 && model.totalDcKwp > 0) {
    checks.push({
      parameter: 'DC / AC ratio',
      value: model.overallDcAcRatio.toFixed(2),
      limit: `<= ${inverter.maxDcAcRatio}`,
      status: model.overallDcAcRatio <= inverter.maxDcAcRatio ? 'PASS' : 'FAIL'
    });
  } else {
    checks.push({ parameter: 'DC / AC ratio', value: '—', limit: `<= ${inverter.maxDcAcRatio}`, status: 'N/A' });
  }

  // 5. AC feeder voltage drop
  const ac = model.acFeederSummary;
  if (ac && ac.totalRunM > 0) {
    checks.push({
      parameter: 'AC feeder voltage drop',
      value: `${ac.voltageDropPercent.toFixed(2)} % (${ac.totalRunM.toFixed(0)} m)`,
      limit: `<= ${AC_VOLTAGE_DROP_LIMIT_PERCENT} %`,
      status: ac.isCompliant ? 'PASS' : 'FAIL'
    });
  } else {
    checks.push({ parameter: 'AC feeder voltage drop', value: 'No feeder route', limit: `<= ${AC_VOLTAGE_DROP_LIMIT_PERCENT} %`, status: 'N/A' });
  }

  return checks;
}

export function overallStatus(checks: DesignCheck[]): CheckStatus {
  if (checks.some(c => c.status === 'FAIL')) return 'FAIL';
  if (checks.every(c => c.status === 'N/A')) return 'N/A';
  return 'PASS';
}
