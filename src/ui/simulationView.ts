/**
 * Dedicated Energy Simulation & Diurnal Dispatch Workspace UI
 *
 * Engineering-grade workspace for:
 * 1. 24-Hour Diurnal Curves broken into:
 *    - Solar PV Generation Curve (P_solar kW)
 *    - Facility Load Demand Curve (P_load kW)
 *    - Dispatch & Power Balance Curve (Self-Consumed, Export, Import kW)
 *    - Strictly aligned bar chart baselines decoupled from X-axis labels
 * 2. 24-Hour Diurnal Dispatch & Power Matching Calculation Table (hourly math)
 * 3. 12-Month Detailed Energy Balance & Solar Resource Calculation Table
 * 4. Net-Billing & Utility Tariff Financial Calculations Table with explicit formulas
 * 5. High-fidelity CSV export of all calculations and time-series
 */

import { ProjectStore } from '../store/projectStore';
import {
  simulateSolarAndLoadMatching,
  SimulationResult,
  SimulationPeriodOption,
  SimulationWeeklyOption,
  HourlyEnergyDispatch
} from '../geo/energySimulation';
import { SolarYieldResult } from '../geo/solarYield';
import { MONTH_NAMES } from '../geo/loadProfile';
import { escapeHtml } from '../utils/html';

export interface SimulationWorkspaceCallbacks {
  onOpenSolarYield?: (systemId?: string) => void;
  onOpenLoadProfile?: (systemId?: string) => void;
  onOpenPdfReport?: (systemId?: string) => void;
}

export type SimulationCurveFilter = 'all' | 'solar' | 'load' | 'dispatch';

export class SimulationWorkspaceUI {
  private container: HTMLElement;
  private store: ProjectStore;
  private callbacks?: SimulationWorkspaceCallbacks;
  private currentSystemId: string = 'all';

  // Diurnal Simulation Controls
  private simPeriodOption: SimulationPeriodOption = 'annual';
  private simWeeklyOption: SimulationWeeklyOption = 'week_avg';
  private activeCurveView: SimulationCurveFilter = 'all';
  private importTariffRate: number = 10.50;
  private exportTariffRate: number = 5.50;

  constructor(
    containerIdOrEl: string | HTMLElement,
    store: ProjectStore,
    callbacks?: SimulationWorkspaceCallbacks
  ) {
    if (typeof containerIdOrEl === 'string') {
      const el = typeof document !== 'undefined' ? document.getElementById(containerIdOrEl) : null;
      if (!el && typeof document !== 'undefined') throw new Error(`Container #${containerIdOrEl} not found`);
      this.container = el as HTMLElement;
    } else {
      this.container = containerIdOrEl;
    }

    this.store = store;
    this.callbacks = callbacks;

    this.store.subscribe(() => {
      this.render();
    });

    this.render();
  }

  public setSystem(systemId: string): void {
    this.currentSystemId = systemId;
    this.render();
  }

  private handleExportCsv(simResult: SimulationResult): void {
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

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `energy_simulation_${this.currentSystemId}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  public render(): void {
    if (!this.container) return;

    const systems = this.store.getSystems();
    const currentSys = this.currentSystemId !== 'all' ? this.store.getSystem(this.currentSystemId) : undefined;
    const targetSysId = currentSys?.id;

    const yieldResult: SolarYieldResult = this.store.getSolarYieldEstimate(targetSysId);
    const summary = this.store.getSystemSummary(targetSysId);
    const loadProfile = this.store.ensureLoadProfile(targetSysId);

    const simResult: SimulationResult = simulateSolarAndLoadMatching(yieldResult, loadProfile, {
      period: this.simPeriodOption,
      weekly: this.simWeeklyOption,
      importTariffPhp: this.importTariffRate,
      exportTariffPhp: this.exportTariffRate
    });

    const hours = simResult.diurnalCurve;

    // Peak values for clean proportional Y-axis scaling
    const peakSolarKw = Math.max(1, simResult.diurnalSummary.peakSolarKw) * 1.12;
    const peakLoadKw = Math.max(1, simResult.diurnalSummary.peakLoadKw) * 1.12;
    const peakDispatchKw = Math.max(1, simResult.diurnalSummary.peakSolarKw, simResult.diurnalSummary.peakLoadKw) * 1.12;

    this.container.innerHTML = `
      <div class="sim-workspace-view">
        <!-- Top Workspace Control Toolbar -->
        <div class="sim-toolbar">
          <div class="toolbar-left">
            <span class="toolbar-icon">📈</span>
            <div class="toolbar-title-block">
              <h2 class="toolbar-title">Energy Simulation &amp; Diurnal Dispatch</h2>
              <span class="toolbar-sub">
                Photovoltaic Engineering &bull; Hourly Power Matching &bull; RE Share &bull; Net Grid Energy Flows
              </span>
            </div>
          </div>

          <div class="toolbar-right">
            <!-- System Scope Filter -->
            <div class="scope-filter-item">
              <label for="sel-sim-sys-scope">Scope:</label>
              <select id="sel-sim-sys-scope" class="form-select-sm">
                <option value="all" ${this.currentSystemId === 'all' ? 'selected' : ''}>All Systems (${summary.totalKwp} kWp Total)</option>
                ${systems.map(s => `
                  <option value="${s.id}" ${this.currentSystemId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>
                `).join('')}
              </select>
            </div>

            <!-- Modals Shortcut Buttons -->
            <button type="button" id="btn-sim-open-solar-yield" class="btn btn-sm btn-outline" title="Inspect Solar Resource, GSA Climatology, Tilt/Azimuth Transposition & System Losses">
              ☀️ Solar Yield &amp; Losses
            </button>
            <button type="button" id="btn-sim-open-load-profile" class="btn btn-sm btn-outline" style="color: #f59e0b; border-color: rgba(245, 158, 11, 0.4);" title="Configure 12-Month Utility Electric Bills & Hourly Load Archetypes">
              🏢 Load Profile &amp; Bills
            </button>
            <button type="button" id="btn-sim-export-csv" class="btn btn-sm btn-secondary" title="Export 12-Month Energy Balance and Diurnal Hourly Curve to CSV">
              📥 Export CSV
            </button>
            <button type="button" id="btn-sim-export-pdf" class="btn btn-sm btn-primary" title="Export Comprehensive PVsyst Engineering PDF Report with CAD, Specs, Losses & SLD">
              📄 Export PDF
            </button>
          </div>
        </div>

        <!-- Scrollable Workspace Body -->
        <div class="sim-workspace-body">
          <!-- Top KPI Cards Grid -->
          <div class="sim-kpi-grid">
            <div class="kpi-card highlight">
              <span class="kpi-label">RENEWABLE ENERGY (RE) SHARE</span>
              <strong class="kpi-value ${simResult.annualReSharePercent >= 50 ? 'text-accent-green' : 'text-accent-blue'}">
                ${simResult.annualReSharePercent}%
              </strong>
              <span class="kpi-sub">Total Solar (${(simResult.annualSolarKwh / 1000).toFixed(1)}k kWh) / Total Load (${(simResult.annualLoadKwh / 1000).toFixed(1)}k kWh)</span>
            </div>

            <div class="kpi-card">
              <span class="kpi-label">DIRECT SOLAR SELF-CONSUMPTION</span>
              <strong class="kpi-value text-accent-green">
                ${simResult.annualSelfConsumedKwh.toLocaleString()} <span class="kpi-unit">kWh/yr</span>
              </strong>
              <span class="kpi-sub">${simResult.annualSelfConsumptionPercent}% of Solar Generation Used Directly On-Site</span>
            </div>

            <div class="kpi-card">
              <span class="kpi-label">GRID ENERGY EXPORT</span>
              <strong class="kpi-value text-accent-amber">
                ${simResult.annualExportedKwh.toLocaleString()} <span class="kpi-unit">kWh/yr</span>
              </strong>
              <span class="kpi-sub">${simResult.annualExportPercent}% Surplus Solar Injected to Utility</span>
            </div>

            <div class="kpi-card">
              <span class="kpi-label">GRID ENERGY IMPORT</span>
              <strong class="kpi-value text-accent-cyan">
                ${simResult.annualImportedKwh.toLocaleString()} <span class="kpi-unit">kWh/yr</span>
              </strong>
              <span class="kpi-sub">${simResult.annualImportPercent}% Grid Dependency (${simResult.annualSelfSufficiencyPercent}% Solar Covered)</span>
            </div>
          </div>

          <!-- Diurnal Dispatch Section with 3 Curves Broken Down & Strictly Aligned Baselines -->
          <div class="sim-diurnal-section">
            <div class="diurnal-header-bar">
              <div class="diurnal-title-block">
                <span class="sim-section-title">24-HOUR HOURLY DIURNAL DISPATCH CURVE (kW)</span>
                <span class="sim-section-sub">
                  ${simResult.selectedPeriodLabel} &bull; ${simResult.selectedWeeklyLabel} &bull; Mathematical Hourly Matching
                </span>
              </div>

              <!-- Controls: Month, Weekly & Curve Filter -->
              <div class="diurnal-controls-block">
                <div class="sim-control-group">
                  <label for="sel-sim-period-ws">Period:</label>
                  <select id="sel-sim-period-ws" class="form-select-sm">
                    <option value="annual" ${this.simPeriodOption === 'annual' ? 'selected' : ''}>Annual Average Day</option>
                    ${MONTH_NAMES.map((m, idx) => `
                      <option value="${idx}" ${this.simPeriodOption === idx ? 'selected' : ''}>${m} (Monthly Average)</option>
                    `).join('')}
                  </select>
                </div>

                <div class="sim-control-group">
                  <label for="sel-sim-weekly-ws">Weekly Option:</label>
                  <select id="sel-sim-weekly-ws" class="form-select-sm">
                    <option value="week_avg" ${this.simWeeklyOption === 'week_avg' ? 'selected' : ''}>Full Week (7-Day Average)</option>
                    <option value="weekday" ${this.simWeeklyOption === 'weekday' ? 'selected' : ''}>Weekday (Mon – Fri)</option>
                    <option value="weekend" ${this.simWeeklyOption === 'weekend' ? 'selected' : ''}>Weekend (Sat – Sun)</option>
                  </select>
                </div>

                <!-- Curve View Toggle -->
                <div class="sim-curve-toggle-group" role="tablist">
                  <button type="button" class="btn-curve-toggle ${this.activeCurveView === 'all' ? 'active' : ''}" data-curve="all" title="Display all 3 curves (Solar, Load & Dispatch)">
                    All 3 Curves
                  </button>
                  <button type="button" class="btn-curve-toggle ${this.activeCurveView === 'solar' ? 'active' : ''}" data-curve="solar" title="Display Solar Generation curve only">
                    ☀️ Solar
                  </button>
                  <button type="button" class="btn-curve-toggle ${this.activeCurveView === 'load' ? 'active' : ''}" data-curve="load" title="Display Facility Load curve only">
                    🏢 Load
                  </button>
                  <button type="button" class="btn-curve-toggle ${this.activeCurveView === 'dispatch' ? 'active' : ''}" data-curve="dispatch" title="Display Combined Dispatch & Balance curve only">
                    ⚡ Dispatch
                  </button>
                </div>
              </div>
            </div>

            <!-- Diurnal Summary Chips Bar -->
            <div class="diurnal-stats-row">
              <div class="d-stat">Peak Solar Gen: <strong>${simResult.diurnalSummary.peakSolarKw} kW</strong></div>
              <div class="d-stat">Peak Facility Load: <strong>${simResult.diurnalSummary.peakLoadKw} kW</strong></div>
              <div class="d-stat">Daily Solar Yield: <strong>${simResult.diurnalSummary.dailySolarKwh.toLocaleString()} kWh</strong></div>
              <div class="d-stat">Daily Facility Demand: <strong>${simResult.diurnalSummary.dailyLoadKwh.toLocaleString()} kWh</strong></div>
              <div class="d-stat">Daily Self-Consumed: <strong class="text-accent-green">${simResult.diurnalSummary.dailySelfConsumedKwh.toLocaleString()} kWh</strong></div>
              <div class="d-stat">Daily Grid Export: <strong class="text-accent-amber">${simResult.diurnalSummary.dailyExportedKwh.toLocaleString()} kWh</strong></div>
              <div class="d-stat">Daily Grid Import: <strong class="text-accent-cyan">${simResult.diurnalSummary.dailyImportedKwh.toLocaleString()} kWh</strong></div>
            </div>

            <!-- 3 Clean Engineering Curves with Guaranteed Bottom Alignment -->
            <div class="sim-curves-container">
              <!-- Curve 1: Solar Generation Curve -->
              ${this.activeCurveView === 'all' || this.activeCurveView === 'solar' ? this.renderSolarCurveCard(hours, peakSolarKw, simResult) : ''}

              <!-- Curve 2: Facility Load Demand Curve -->
              ${this.activeCurveView === 'all' || this.activeCurveView === 'load' ? this.renderLoadCurveCard(hours, peakLoadKw, simResult) : ''}

              <!-- Curve 3: Combined Dispatch & Power Balance Curve -->
              ${this.activeCurveView === 'all' || this.activeCurveView === 'dispatch' ? this.renderDispatchCurveCard(hours, peakDispatchKw, simResult) : ''}
            </div>
          </div>

          <!-- Section A: 24-Hour Diurnal Dispatch & Power Matching Table (Hourly Calculations) -->
          <div class="sim-card-box full-width">
            <div class="box-header">
              <div>
                <span class="box-title">24-HOUR HOURLY DIURNAL DISPATCH &amp; POWER MATCHING (CALCULATIONS TABLE)</span>
                <span class="box-subtitle">
                  Step-by-step hourly calculations: Direct Self-Consumption P<sub>self</sub> = min(P<sub>pv</sub>, P<sub>load</sub>) &bull; Grid Export P<sub>export</sub> = max(0, P<sub>pv</sub> - P<sub>load</sub>) &bull; Grid Import P<sub>import</sub> = max(0, P<sub>load</sub> - P<sub>pv</sub>)
                </span>
              </div>
            </div>

            <div class="sim-calc-table-wrap">
              <table class="sim-table eng-calc-table">
                <thead>
                  <tr>
                    <th>Hour</th>
                    <th>Solar Gen P<sub>pv</sub> (kW)</th>
                    <th>Facility Load P<sub>load</sub> (kW)</th>
                    <th>Self-Consumed P<sub>self</sub> (kW)</th>
                    <th>Grid Export P<sub>export</sub> (kW)</th>
                    <th>Grid Import P<sub>import</sub> (kW)</th>
                    <th>RE Coverage (%)</th>
                    <th>Self-Consumption (%)</th>
                    <th>Net Balance (&plusmn; kW)</th>
                    <th>Power Flow Calculation Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${hours.map(h => {
                    const reCov = h.loadKw > 0 ? ((h.solarKw / h.loadKw) * 100).toFixed(1) : '0.0';
                    const selfRatio = h.solarKw > 0 ? ((h.selfConsumedKw / h.solarKw) * 100).toFixed(1) : '0.0';
                    const netBalance = h.solarKw - h.loadKw;
                    const netSign = netBalance > 0 ? `+${netBalance.toFixed(1)}` : netBalance.toFixed(1);
                    const netColor = netBalance > 0 ? 'text-accent-amber' : (netBalance < 0 ? 'text-muted' : 'text-accent-green');

                    let statusText = '';
                    let statusBadge = 'status-night';
                    if (h.solarKw === 0) {
                      statusText = '100% Grid Import (Night)';
                      statusBadge = 'status-night';
                    } else if (h.exportKw > 0) {
                      statusText = `Surplus Export (+${h.exportKw.toFixed(1)} kW)`;
                      statusBadge = 'status-export';
                    } else if (h.importKw > 0) {
                      statusText = `Solar Deficit (-${h.importKw.toFixed(1)} kW from Grid)`;
                      statusBadge = 'status-deficit';
                    } else {
                      statusText = '100% Balanced Self-Consumption';
                      statusBadge = 'status-balanced';
                    }

                    return `
                      <tr>
                        <td><strong>${h.hourLabel}</strong></td>
                        <td class="${h.solarKw > 0 ? 'text-accent-blue' : 'text-muted'}">${h.solarKw.toFixed(1)}</td>
                        <td class="${h.loadKw > 0 ? 'text-accent-amber' : 'text-muted'}">${h.loadKw.toFixed(1)}</td>
                        <td class="${h.selfConsumedKw > 0 ? 'text-accent-green font-semibold' : 'text-muted'}">${h.selfConsumedKw.toFixed(1)}</td>
                        <td class="${h.exportKw > 0 ? 'text-accent-amber font-semibold' : 'text-muted'}">${h.exportKw.toFixed(1)}</td>
                        <td class="${h.importKw > 0 ? 'text-muted' : 'text-muted'}">${h.importKw.toFixed(1)}</td>
                        <td><span class="pill-re ${parseFloat(reCov) >= 100 ? 'high' : ''}">${reCov}%</span></td>
                        <td><span class="pill-self">${selfRatio}%</span></td>
                        <td class="${netColor} font-semibold">${netSign}</td>
                        <td><span class="pill-calc-status ${statusBadge}">${statusText}</span></td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
                <tfoot>
                  <tr class="table-total-row">
                    <td>Daily Total (kWh)</td>
                    <td class="text-accent-blue font-bold">${simResult.diurnalSummary.dailySolarKwh.toLocaleString()}</td>
                    <td class="text-accent-amber font-bold">${simResult.diurnalSummary.dailyLoadKwh.toLocaleString()}</td>
                    <td class="text-accent-green font-bold">${simResult.diurnalSummary.dailySelfConsumedKwh.toLocaleString()}</td>
                    <td class="text-accent-amber font-bold">${simResult.diurnalSummary.dailyExportedKwh.toLocaleString()}</td>
                    <td class="text-muted font-bold">${simResult.diurnalSummary.dailyImportedKwh.toLocaleString()}</td>
                    <td class="font-bold">${simResult.diurnalSummary.dailyLoadKwh > 0 ? ((simResult.diurnalSummary.dailySolarKwh / simResult.diurnalSummary.dailyLoadKwh) * 100).toFixed(1) : 0}%</td>
                    <td class="font-bold">${simResult.diurnalSummary.dailySolarKwh > 0 ? ((simResult.diurnalSummary.dailySelfConsumedKwh / simResult.diurnalSummary.dailySolarKwh) * 100).toFixed(1) : 0}%</td>
                    <td class="font-bold">${(simResult.diurnalSummary.dailySolarKwh - simResult.diurnalSummary.dailyLoadKwh).toFixed(1)}</td>
                    <td class="text-accent-green font-bold">&Sigma; 24-Hour Energy Balance</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <!-- Section B & C Lower Grid: 12-Month Table & Net Billing Calculations Table -->
          <div class="sim-lower-grid">
            <!-- 12-Month Energy Balance Calculations Table -->
            <div class="sim-card-box">
              <div class="box-header">
                <div>
                  <span class="box-title">12-MONTH ENERGY BALANCE &amp; RE SHARE</span>
                  <span class="box-subtitle">
                    E<sub>solar</sub> = P<sub>DC</sub> &times; PSH &times; N<sub>days</sub> &times; PR &bull; RE Share = E<sub>solar</sub> / E<sub>load</sub>
                  </span>
                </div>
                <span class="badge-re-share">Annual RE Share: ${simResult.annualReSharePercent}%</span>
              </div>
              <div class="sim-monthly-table-wrap">
                <table class="sim-table eng-calc-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Days</th>
                      <th>Solar Gen (kWh)</th>
                      <th>Facility Load (kWh)</th>
                      <th>Self-Consumed (kWh)</th>
                      <th>Grid Export (kWh)</th>
                      <th>Grid Import (kWh)</th>
                      <th>RE Share</th>
                      <th>Self-Suff.</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${simResult.monthlyRecords.map(m => `
                      <tr>
                        <td><strong>${m.monthName}</strong></td>
                        <td class="text-muted">${m.daysInMonth}</td>
                        <td class="text-accent-blue font-semibold">${m.solarGenerationKwh.toLocaleString()}</td>
                        <td class="text-accent-amber">${m.facilityLoadKwh.toLocaleString()}</td>
                        <td class="text-accent-green font-semibold">${m.selfConsumedKwh.toLocaleString()}</td>
                        <td class="text-accent-amber">${m.exportedKwh.toLocaleString()}</td>
                        <td class="text-muted">${m.importedKwh.toLocaleString()}</td>
                        <td><span class="pill-re ${m.reSharePercent >= 50 ? 'high' : ''}">${m.reSharePercent}%</span></td>
                        <td><span class="pill-self">${m.selfSufficiencyPercent}%</span></td>
                      </tr>
                    `).join('')}
                  </tbody>
                  <tfoot>
                    <tr class="table-total-row">
                      <td>Total</td>
                      <td>365</td>
                      <td class="text-accent-blue font-bold">${simResult.annualSolarKwh.toLocaleString()}</td>
                      <td class="text-accent-amber font-bold">${simResult.annualLoadKwh.toLocaleString()}</td>
                      <td class="text-accent-green font-bold">${simResult.annualSelfConsumedKwh.toLocaleString()}</td>
                      <td class="text-accent-amber font-bold">${simResult.annualExportedKwh.toLocaleString()}</td>
                      <td class="text-muted font-bold">${simResult.annualImportedKwh.toLocaleString()}</td>
                      <td><span class="pill-re ${simResult.annualReSharePercent >= 50 ? 'high' : ''}">${simResult.annualReSharePercent}%</span></td>
                      <td><span class="pill-self font-bold">${simResult.annualSelfSufficiencyPercent}%</span></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <!-- Net-Billing & Financial Calculations Table -->
            <div class="sim-card-box">
              <div class="box-header">
                <div>
                  <span class="box-title">NET-BILLING &amp; ECONOMIC IMPACT</span>
                  <span class="box-subtitle">Explicit Tariff Formulas &amp; Utility Bill Reduction Calculations</span>
                </div>
              </div>

              <!-- Tariff Input Controls -->
              <div class="tariff-config-row">
                <div class="tariff-field">
                  <label for="inp-import-tariff-ws">Retail Import Tariff T<sub>import</sub> (₱/kWh):</label>
                  <input type="number" id="inp-import-tariff-ws" class="inp-tariff" step="0.25" min="0" value="${this.importTariffRate}" />
                </div>
                <div class="tariff-field">
                  <label for="inp-export-tariff-ws">Feed-in Export Credit T<sub>export</sub> (₱/kWh):</label>
                  <input type="number" id="inp-export-tariff-ws" class="inp-tariff" step="0.25" min="0" value="${this.exportTariffRate}" />
                </div>
              </div>

              <!-- Calculations Breakdown Table -->
              <div class="sim-calc-table-wrap">
                <table class="sim-table eng-formula-table">
                  <thead>
                    <tr>
                      <th style="width: 32px;">#</th>
                      <th>Economic Parameter / Metric</th>
                      <th>Mathematical Formula</th>
                      <th style="text-align: right;">Calculated Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>1</td>
                      <td>Annual Facility Demand (E<sub>load</sub>)</td>
                      <td class="formula-code">Metered / Archetype Annual Facility kWh</td>
                      <td class="val-col font-bold">${simResult.annualLoadKwh.toLocaleString()} kWh/yr</td>
                    </tr>
                    <tr>
                      <td>2</td>
                      <td>Baseline Utility Bill (No Solar)</td>
                      <td class="formula-code">Bill<sub>base</sub> = E<sub>load</sub> &times; T<sub>import</sub></td>
                      <td class="val-col font-bold">₱ ${simResult.originalBillPhp.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td>3</td>
                      <td>Annual Solar Generation (E<sub>solar</sub>)</td>
                      <td class="formula-code">PV Plant Annual Yield (kWh)</td>
                      <td class="val-col text-accent-blue font-bold">${simResult.annualSolarKwh.toLocaleString()} kWh/yr</td>
                    </tr>
                    <tr>
                      <td>4</td>
                      <td>Direct Solar Self-Consumption (E<sub>self</sub>)</td>
                      <td class="formula-code">&Sigma; min(P<sub>pv</sub>, P<sub>load</sub>) across all hours</td>
                      <td class="val-col text-accent-green font-bold">${simResult.annualSelfConsumedKwh.toLocaleString()} kWh/yr (${simResult.annualSelfConsumptionPercent}%)</td>
                    </tr>
                    <tr>
                      <td>5</td>
                      <td>Annual Grid Energy Import (E<sub>import</sub>)</td>
                      <td class="formula-code">E<sub>import</sub> = E<sub>load</sub> - E<sub>self</sub></td>
                      <td class="val-col text-muted font-bold">${simResult.annualImportedKwh.toLocaleString()} kWh/yr</td>
                    </tr>
                    <tr>
                      <td>6</td>
                      <td>Gross Utility Import Electricity Cost</td>
                      <td class="formula-code">Cost<sub>import</sub> = E<sub>import</sub> &times; T<sub>import</sub></td>
                      <td class="val-col font-semibold">₱ ${(Math.round(simResult.annualImportedKwh * this.importTariffRate)).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td>7</td>
                      <td>Annual Grid Energy Export Surplus (E<sub>export</sub>)</td>
                      <td class="formula-code">E<sub>export</sub> = E<sub>solar</sub> - E<sub>self</sub></td>
                      <td class="val-col text-accent-amber font-bold">${simResult.annualExportedKwh.toLocaleString()} kWh/yr</td>
                    </tr>
                    <tr>
                      <td>8</td>
                      <td>Grid Export Compensation Credit</td>
                      <td class="formula-code">Credit<sub>export</sub> = E<sub>export</sub> &times; T<sub>export</sub></td>
                      <td class="val-col text-accent-amber font-semibold">₱ ${(Math.round(simResult.annualExportedKwh * this.exportTariffRate)).toLocaleString()}</td>
                    </tr>
                    <tr class="table-highlight-row">
                      <td>9</td>
                      <td><strong>New Net Utility Electric Bill</strong></td>
                      <td class="formula-code"><strong>Bill<sub>net</sub> = max(0, Cost<sub>import</sub> - Credit<sub>export</sub>)</strong></td>
                      <td class="val-col text-accent-blue font-bold">₱ ${simResult.newBillPhp.toLocaleString()}</td>
                    </tr>
                    <tr class="table-highlight-row green">
                      <td>10</td>
                      <td><strong>Net Annual Electricity Cost Savings</strong></td>
                      <td class="formula-code"><strong>&Delta;Savings = Bill<sub>base</sub> - Bill<sub>net</sub></strong></td>
                      <td class="val-col text-accent-green font-bold">₱ ${simResult.annualSavingsPhp.toLocaleString()}</td>
                    </tr>
                    <tr class="table-highlight-row green">
                      <td>11</td>
                      <td><strong>Facility Utility Bill Reduction %</strong></td>
                      <td class="formula-code"><strong>(&Delta;Savings / Bill<sub>base</sub>) &times; 100%</strong></td>
                      <td class="val-col text-accent-green font-bold">${simResult.billReductionPercent}%</td>
                    </tr>
                    <tr>
                      <td>12</td>
                      <td>Levelized Realized Value of Solar</td>
                      <td class="formula-code">&Delta;Savings / E<sub>solar</sub></td>
                      <td class="val-col text-accent-cyan font-semibold">
                        ₱ ${simResult.annualSolarKwh > 0 ? (simResult.annualSavingsPhp / simResult.annualSolarKwh).toFixed(2) : '0.00'} / kWh
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners(simResult);
  }

  /**
   * Renders Curve 1: Solar Generation Curve with strict baseline bottom alignment.
   */
  private renderSolarCurveCard(hours: HourlyEnergyDispatch[], peakVal: number, simResult: SimulationResult): string {
    return `
      <div class="eng-curve-card solar-curve">
        <div class="curve-card-header">
          <div class="curve-card-title">
            <span class="curve-dot dot-solar"></span>
            <strong>1. SOLAR GENERATION CURVE P<sub>solar</sub> (kW)</strong>
            <span class="curve-meta">&bull; Normalized Solar Bell Curve &bull; Photovoltaic Output</span>
          </div>
          <div class="curve-card-stats">
            <span>Peak: <strong class="text-accent-blue">${simResult.diurnalSummary.peakSolarKw} kW</strong></span>
            <span>Daily: <strong class="text-accent-blue">${simResult.diurnalSummary.dailySolarKwh.toLocaleString()} kWh</strong></span>
          </div>
        </div>

        <div class="eng-chart-box">
          <div class="eng-chart-plot-row">
            <!-- Left Y-Axis Scale -->
            <div class="eng-chart-yaxis">
              <span>${Math.round(peakVal)} kW</span>
              <span>${Math.round(peakVal * 0.5)} kW</span>
              <span>0 kW</span>
            </div>

            <!-- Plot Area: 24 Strictly Bottom-Aligned Columns -->
            <div class="eng-chart-bars-wrap">
              <div class="eng-chart-grid-line line-100"></div>
              <div class="eng-chart-grid-line line-50"></div>
              ${hours.map(h => {
                const heightPct = Math.min(100, Math.round((h.solarKw / peakVal) * 100));
                const valText = h.solarKw >= 1 ? Math.round(h.solarKw) : '';
                const tooltip = `${h.hourLabel}\nSolar Generation: ${h.solarKw.toFixed(1)} kW`;

                return `
                  <div class="eng-chart-col" title="${tooltip}">
                    <div class="eng-col-track">
                      ${heightPct > 0 ? `
                        <div class="eng-col-bar bar-solar" style="height: ${heightPct}%;">
                          ${valText ? `<span class="eng-bar-val">${valText}</span>` : ''}
                        </div>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Dedicated X-Axis Labels Row Completely Decoupled from Bar Heights -->
          <div class="eng-chart-xaxis-row">
            <div class="eng-xaxis-spacer"></div>
            <div class="eng-chart-xaxis-labels">
              ${hours.map(h => `
                <div class="eng-xaxis-cell">${h.hour % 2 === 0 ? String(h.hour).padStart(2, '0') + ':00' : ''}</div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renders Curve 2: Facility Load Demand Curve with strict baseline bottom alignment.
   */
  private renderLoadCurveCard(hours: HourlyEnergyDispatch[], peakVal: number, simResult: SimulationResult): string {
    return `
      <div class="eng-curve-card load-curve">
        <div class="curve-card-header">
          <div class="curve-card-title">
            <span class="curve-dot dot-load"></span>
            <strong>2. FACILITY LOAD DEMAND CURVE P<sub>load</sub> (kW)</strong>
            <span class="curve-meta">&bull; Facility Consumption Archetype &bull; Diurnal Demand</span>
          </div>
          <div class="curve-card-stats">
            <span>Peak Demand: <strong class="text-accent-amber">${simResult.diurnalSummary.peakLoadKw} kW</strong></span>
            <span>Daily Demand: <strong class="text-accent-amber">${simResult.diurnalSummary.dailyLoadKwh.toLocaleString()} kWh</strong></span>
          </div>
        </div>

        <div class="eng-chart-box">
          <div class="eng-chart-plot-row">
            <!-- Left Y-Axis Scale -->
            <div class="eng-chart-yaxis">
              <span>${Math.round(peakVal)} kW</span>
              <span>${Math.round(peakVal * 0.5)} kW</span>
              <span>0 kW</span>
            </div>

            <!-- Plot Area: 24 Strictly Bottom-Aligned Columns -->
            <div class="eng-chart-bars-wrap">
              <div class="eng-chart-grid-line line-100"></div>
              <div class="eng-chart-grid-line line-50"></div>
              ${hours.map(h => {
                const heightPct = Math.min(100, Math.round((h.loadKw / peakVal) * 100));
                const valText = h.loadKw >= 1 ? Math.round(h.loadKw) : '';
                const tooltip = `${h.hourLabel}\nFacility Demand: ${h.loadKw.toFixed(1)} kW`;

                return `
                  <div class="eng-chart-col" title="${tooltip}">
                    <div class="eng-col-track">
                      ${heightPct > 0 ? `
                        <div class="eng-col-bar bar-load" style="height: ${heightPct}%;">
                          ${valText ? `<span class="eng-bar-val">${valText}</span>` : ''}
                        </div>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Dedicated X-Axis Labels Row Completely Decoupled from Bar Heights -->
          <div class="eng-chart-xaxis-row">
            <div class="eng-xaxis-spacer"></div>
            <div class="eng-chart-xaxis-labels">
              ${hours.map(h => `
                <div class="eng-xaxis-cell">${h.hour % 2 === 0 ? String(h.hour).padStart(2, '0') + ':00' : ''}</div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renders Curve 3: Combined Dispatch & Power Balance Curve with strict baseline bottom alignment.
   */
  private renderDispatchCurveCard(hours: HourlyEnergyDispatch[], peakVal: number, simResult: SimulationResult): string {
    return `
      <div class="eng-curve-card dispatch-curve">
        <div class="curve-card-header">
          <div class="curve-card-title">
            <span class="curve-dot dot-dispatch"></span>
            <strong>3. COMBINED DISPATCH &amp; POWER BALANCE CURVE (kW)</strong>
            <span class="curve-meta">&bull; Direct Solar Consumed &bull; Grid Export Surplus &bull; Grid Import Deficit</span>
          </div>
          <div class="curve-card-stats">
            <span>Self-Consumed: <strong class="text-accent-green">${simResult.diurnalSummary.dailySelfConsumedKwh.toLocaleString()} kWh</strong></span>
            <span>Export: <strong class="text-accent-amber">${simResult.diurnalSummary.dailyExportedKwh.toLocaleString()} kWh</strong></span>
            <span>Import: <strong class="text-accent-cyan">${simResult.diurnalSummary.dailyImportedKwh.toLocaleString()} kWh</strong></span>
          </div>
          <!-- Legend Bar -->
          <div class="diurnal-legend-bar" style="margin: 0; padding: 0; background: transparent;">
            <span class="legend-chip"><span class="chip-dot chip-self"></span> Direct Solar Consumed (kW)</span>
            <span class="legend-chip"><span class="chip-dot chip-export"></span> Solar Export to Grid (kW)</span>
            <span class="legend-chip"><span class="chip-dot chip-import"></span> Grid Import Needed (kW)</span>
            <span class="legend-chip"><span class="chip-line chip-solar-line"></span> Solar Gen Peak</span>
            <span class="legend-chip"><span class="chip-line chip-load-line"></span> Load Demand Peak</span>
          </div>
        </div>

        <div class="eng-chart-box">
          <div class="eng-chart-plot-row">
            <!-- Left Y-Axis Scale -->
            <div class="eng-chart-yaxis">
              <span>${Math.round(peakVal)} kW</span>
              <span>${Math.round(peakVal * 0.5)} kW</span>
              <span>0 kW</span>
            </div>

            <!-- Plot Area: 24 Strictly Bottom-Aligned Stacked Columns -->
            <div class="eng-chart-bars-wrap">
              <div class="eng-chart-grid-line line-100"></div>
              <div class="eng-chart-grid-line line-50"></div>
              ${hours.map(h => {
                const selfH = Math.round((h.selfConsumedKw / peakVal) * 100);
                const exportH = Math.round((h.exportKw / peakVal) * 100);
                const importH = Math.round((h.importKw / peakVal) * 100);
                const solarTop = Math.max(0, Math.min(96, Math.round(100 - (h.solarKw / peakVal) * 100)));
                const loadTop = Math.max(0, Math.min(96, Math.round(100 - (h.loadKw / peakVal) * 100)));

                const tooltip = `${h.hourLabel}\nSolar Gen: ${h.solarKw.toFixed(1)} kW\nFacility Load: ${h.loadKw.toFixed(1)} kW\nDirect Self-Consumed: ${h.selfConsumedKw.toFixed(1)} kW\nGrid Export Surplus: ${h.exportKw.toFixed(1)} kW\nGrid Import Deficit: ${h.importKw.toFixed(1)} kW`;

                return `
                  <div class="eng-chart-col" title="${tooltip}">
                    <div class="eng-col-track">
                      <!-- Reference Markers -->
                      ${h.solarKw > 0 ? `<div class="diurnal-marker marker-solar" style="top: ${solarTop}%;" title="Solar: ${h.solarKw.toFixed(1)} kW"></div>` : ''}
                      ${h.loadKw > 0 ? `<div class="diurnal-marker marker-load" style="top: ${loadTop}%;" title="Load: ${h.loadKw.toFixed(1)} kW"></div>` : ''}

                      <!-- Stacked Power Bars Anchored to Baseline -->
                      ${exportH > 0 ? `<div class="eng-col-bar bar-export" style="height: ${exportH}%;"></div>` : ''}
                      ${selfH > 0 ? `<div class="eng-col-bar bar-self" style="height: ${selfH}%;"></div>` : ''}
                      ${importH > 0 ? `<div class="eng-col-bar bar-import" style="height: ${importH}%;"></div>` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Dedicated X-Axis Labels Row Completely Decoupled from Bar Heights -->
          <div class="eng-chart-xaxis-row">
            <div class="eng-xaxis-spacer"></div>
            <div class="eng-chart-xaxis-labels">
              ${hours.map(h => `
                <div class="eng-xaxis-cell">${h.hour % 2 === 0 ? String(h.hour).padStart(2, '0') + ':00' : ''}</div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private attachEventListeners(simResult: SimulationResult): void {
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
}
