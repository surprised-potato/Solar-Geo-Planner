/**
 * Simulation workspace event wiring and CSV export.
 */
import { SimulationResult, SimulationWeeklyOption } from '../../geo/energySimulation';
import { downloadCsv, safeFileName } from '../../utils/download';
import type { SimulationWorkspaceUI } from '../simulationView';
import { SimulationCurveFilter } from '../simulationView';

export function handleExportCsv(this: SimulationWorkspaceUI, simResult: SimulationResult): void {
  let csv = 'ENGINEERING ENERGY SIMULATION & POWER MATCHING REPORT\n';
  csv += `Scope,${this.currentSystemId}\n`;
  csv += `Period,${simResult.selectedPeriodLabel}\n`;
  csv += `Weekly_Profile,${simResult.selectedWeeklyLabel}\n`;
  csv += `Retail_Import_Tariff_Php_per_kWh,${this.importTariffRate}\n`;
  csv += `Feed_In_Export_Credit_Php_per_kWh,${this.exportTariffRate}\n\n`;

  csv += '1. 12-MONTH ENERGY BALANCE & RE SHARE (ANNUAL CALCULATIONS)\n';
  csv += 'Month,Days,Solar_Gen_kWh,Facility_Load_kWh,Self_Consumed_kWh,Grid_Export_kWh,Grid_Import_kWh,RE_Share_Pct,Self_Sufficiency_Pct,Self_Consumption_Pct\n';

  for (const m of simResult.monthlyRecords) {
    csv += `${m.monthName},${m.daysInMonth},${m.solarGenerationKwh},${m.facilityLoadKwh},${m.selfConsumedKwh},${m.exportedKwh},${m.importedKwh},${m.reSharePercent}%,${m.selfSufficiencyPercent}%,${m.selfConsumptionPercent}%\n`;
  }

  csv += `Annual_Total,365,${simResult.annualSolarKwh},${simResult.annualLoadKwh},${simResult.annualSelfConsumedKwh},${simResult.annualExportedKwh},${simResult.annualImportedKwh},${simResult.annualReSharePercent}%,${simResult.annualSelfSufficiencyPercent}%,${simResult.annualSelfConsumptionPercent}%\n\n`;

  csv += '2. 24-HOUR HOURLY DIURNAL DISPATCH & POWER MATCHING (CALCULATIONS)\n';
  csv += 'Hour,Solar_Gen_kW,Facility_Load_kW,Self_Consumed_kW,Grid_Export_kW,Grid_Import_kW,RE_Coverage_Pct,Self_Consumption_Pct,Status\n';
  for (const h of simResult.diurnalCurve) {
    const reCov = h.loadKw > 0 ? ((h.solarKw / h.loadKw) * 100).toFixed(1) : '0.0';
    const selfRatio = h.solarKw > 0 ? ((h.selfConsumedKw / h.solarKw) * 100).toFixed(1) : '0.0';
    const status = h.solarKw === 0 ? 'Night Import' : (h.exportKw > 0 ? 'Solar Surplus Export' : 'Solar Deficit Import');
    csv += `${h.hourLabel},${h.solarKw},${h.loadKw},${h.selfConsumedKw},${h.exportKw},${h.importKw},${reCov}%,${selfRatio}%,${status}\n`;
  }

  csv += '\n3. NET-BILLING FINANCIAL ECONOMICS SUMMARY\n';
  csv += `Original_Annual_Bill_Php,${simResult.originalBillPhp}\n`;
  csv += `New_Annual_Bill_Php,${simResult.newBillPhp}\n`;
  csv += `Annual_Net_Savings_Php,${simResult.annualSavingsPhp}\n`;
  csv += `Bill_Reduction_Pct,${simResult.billReductionPercent}%\n`;

  downloadCsv(csv, `energy_simulation_${safeFileName(this.currentSystemId, 'all')}_${Date.now()}.csv`);
}

export function attachEventListeners(this: SimulationWorkspaceUI, simResult: SimulationResult): void {
  // Scope change
  const selScope = this.container.querySelector('#sel-sim-sys-scope') as HTMLSelectElement | null;
  selScope?.addEventListener('change', (e) => {
    this.currentSystemId = (e.target as HTMLSelectElement).value;
    this.render();
  });

  // Modal shortcuts
  this.container.querySelector('#btn-sim-open-solar-yield')?.addEventListener('click', () => {
    this.callbacks?.onOpenSolarYield?.(this.currentSystemId);
  });

  this.container.querySelector('#btn-sim-open-load-profile')?.addEventListener('click', () => {
    this.callbacks?.onOpenLoadProfile?.(this.currentSystemId);
  });

  // CSV export
  this.container.querySelector('#btn-sim-export-csv')?.addEventListener('click', () => {
    this.handleExportCsv(simResult);
  });

  // PDF report export
  this.container.querySelector('#btn-sim-export-pdf')?.addEventListener('click', () => {
    this.callbacks?.onOpenPdfReport?.(this.currentSystemId);
  });

  // Diurnal controls
  const selPeriod = this.container.querySelector('#sel-sim-period-ws') as HTMLSelectElement | null;
  selPeriod?.addEventListener('change', (e) => {
    const val = (e.target as HTMLSelectElement).value;
    this.simPeriodOption = val === 'annual' ? 'annual' : parseInt(val, 10);
    this.render();
  });

  const selWeekly = this.container.querySelector('#sel-sim-weekly-ws') as HTMLSelectElement | null;
  selWeekly?.addEventListener('change', (e) => {
    this.simWeeklyOption = (e.target as HTMLSelectElement).value as SimulationWeeklyOption;
    this.render();
  });

  // Curve filter buttons
  this.container.querySelectorAll<HTMLButtonElement>('.btn-curve-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const curve = btn.getAttribute('data-curve') as SimulationCurveFilter;
      if (curve) {
        this.activeCurveView = curve;
        this.render();
      }
    });
  });

  // Tariff inputs
  const inpImport = this.container.querySelector('#inp-import-tariff-ws') as HTMLInputElement | null;
  inpImport?.addEventListener('change', (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(val) && val >= 0) {
      this.importTariffRate = val;
      this.render();
    }
  });

  const inpExport = this.container.querySelector('#inp-export-tariff-ws') as HTMLInputElement | null;
  inpExport?.addEventListener('change', (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(val) && val >= 0) {
      this.exportTariffRate = val;
      this.render();
    }
  });
}
