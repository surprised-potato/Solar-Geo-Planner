/**
 * Solar yield modal: energy simulation and savings tab.
 */
import { SimulationResult } from '../../geo/energySimulation';
import { MONTH_NAMES } from '../../geo/loadProfile';
import type { SolarYieldModalUI } from '../solarYieldModal';

export function renderSimulationTab(this: SolarYieldModalUI, simResult: SimulationResult, peakDiurnalKw: number): string {
  return `
    <!-- Top Combined KPIs: RE Share, Self-Consumption, Export, Import -->
    <div class="sim-kpi-grid">
      <div class="kpi-card highlight">
        <span class="kpi-label">RENEWABLE ENERGY (RE) SHARE</span>
        <strong class="kpi-value ${simResult.annualReSharePercent >= 50 ? 'text-accent-green' : 'text-accent-blue'}">
          ${simResult.annualReSharePercent}%
        </strong>
        <span class="kpi-sub">Total Solar (${(simResult.annualSolarKwh / 1000).toFixed(0)}k) / Total Load (${(simResult.annualLoadKwh / 1000).toFixed(0)}k)</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">DIRECT SOLAR SELF-CONSUMPTION</span>
        <strong class="kpi-value text-accent-green">
          ${simResult.annualSelfConsumedKwh.toLocaleString()} <span class="kpi-unit">kWh/yr</span>
        </strong>
        <span class="kpi-sub">${simResult.annualSelfConsumptionPercent}% of Solar Generation Used On-Site</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">GRID ENERGY EXPORT</span>
        <strong class="kpi-value text-accent-amber">
          ${simResult.annualExportedKwh.toLocaleString()} <span class="kpi-unit">kWh/yr</span>
        </strong>
        <span class="kpi-sub">${simResult.annualExportPercent}% Surplus Solar Exported to Grid</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">GRID ENERGY IMPORT</span>
        <strong class="kpi-value text-accent-cyan">
          ${simResult.annualImportedKwh.toLocaleString()} <span class="kpi-unit">kWh/yr</span>
        </strong>
        <span class="kpi-sub">${simResult.annualImportPercent}% Grid Dependency (${simResult.annualSelfSufficiencyPercent}% Solar Covered)</span>
      </div>
    </div>

    <!-- Diurnal Curve Dispatch Section with Monthly & Weekly Controls -->
    <div class="sim-diurnal-section">
      <div class="diurnal-header-bar">
        <div class="diurnal-title-block">
          <span class="sim-section-title">24-HOUR HOURLY DIURNAL DISPATCH CURVE (kW)</span>
          <span class="sim-section-sub">
            ${simResult.selectedPeriodLabel} &bull; ${simResult.selectedWeeklyLabel}
          </span>
        </div>

        <!-- Controls: Month & Weekly Filter -->
        <div class="diurnal-controls-block">
          <div class="sim-control-group">
            <label for="sel-sim-period">Period:</label>
            <select id="sel-sim-period" class="form-select-sm">
              <option value="annual" ${this.simPeriodOption === 'annual' ? 'selected' : ''}>Annual Average Day</option>
              ${MONTH_NAMES.map((m, idx) => `
                <option value="${idx}" ${this.simPeriodOption === idx ? 'selected' : ''}>${m} (Monthly Average)</option>
              `).join('')}
            </select>
          </div>
          <div class="sim-control-group">
            <label for="sel-sim-weekly">Weekly Option:</label>
            <select id="sel-sim-weekly" class="form-select-sm">
              <option value="week_avg" ${this.simWeeklyOption === 'week_avg' ? 'selected' : ''}>Full Week (7-Day Avg)</option>
              <option value="weekday" ${this.simWeeklyOption === 'weekday' ? 'selected' : ''}>Weekday (Mon – Fri)</option>
              <option value="weekend" ${this.simWeeklyOption === 'weekend' ? 'selected' : ''}>Weekend (Sat – Sun)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Diurnal Chart Legend -->
      <div class="diurnal-legend-bar">
        <span class="legend-chip"><span class="chip-dot chip-self"></span> Direct Solar Consumed (kW)</span>
        <span class="legend-chip"><span class="chip-dot chip-export"></span> Solar Export to Grid (kW)</span>
        <span class="legend-chip"><span class="chip-dot chip-import"></span> Grid Import Needed (kW)</span>
        <span class="legend-chip"><span class="chip-line chip-load-line"></span> Facility Load Curve</span>
        <span class="legend-chip"><span class="chip-line chip-solar-line"></span> Solar Generation Curve</span>
      </div>

      <!-- 24-Hour Diurnal Chart Visual Grid with Strict Baseline Bottom Alignment -->
      <div class="eng-chart-box">
        <div class="eng-chart-plot-row">
          <div class="eng-chart-yaxis">
            <span>${Math.round(peakDiurnalKw)} kW</span>
            <span>${Math.round(peakDiurnalKw * 0.5)} kW</span>
            <span>0 kW</span>
          </div>
          <div class="eng-chart-bars-wrap" style="height: 160px;">
            ${simResult.diurnalCurve.map(h => {
              const selfH = Math.round((h.selfConsumedKw / peakDiurnalKw) * 100);
              const exportH = Math.round((h.exportKw / peakDiurnalKw) * 100);
              const importH = Math.round((h.importKw / peakDiurnalKw) * 100);
              const loadLineTop = Math.max(0, Math.min(96, Math.round(100 - (h.loadKw / peakDiurnalKw) * 100)));
              const solarLineTop = Math.max(0, Math.min(96, Math.round(100 - (h.solarKw / peakDiurnalKw) * 100)));

              const tooltip = `${h.hourLabel}\nSolar Gen: ${h.solarKw} kW\nFacility Load: ${h.loadKw} kW\nSelf-Consumed: ${h.selfConsumedKw} kW\nExport to Grid: ${h.exportKw} kW\nImport from Grid: ${h.importKw} kW`;

              return `
                <div class="eng-chart-col" title="${tooltip}">
                  <div class="eng-col-track">
                    <!-- Reference Markers -->
                    ${h.solarKw > 0 ? `<div class="diurnal-marker marker-solar" style="top: ${solarLineTop}%;" title="Solar: ${h.solarKw} kW"></div>` : ''}
                    ${h.loadKw > 0 ? `<div class="diurnal-marker marker-load" style="top: ${loadLineTop}%;" title="Load: ${h.loadKw} kW"></div>` : ''}

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
        <div class="eng-chart-xaxis-row">
          <div class="eng-xaxis-spacer"></div>
          <div class="eng-chart-xaxis-labels">
            ${simResult.diurnalCurve.map(h => `
              <div class="eng-xaxis-cell">${h.hour % 2 === 0 ? String(h.hour).padStart(2, '0') + ':00' : ''}</div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Diurnal Stat Chips -->
      <div class="diurnal-stats-row">
        <div class="d-stat">Peak Solar: <strong>${simResult.diurnalSummary.peakSolarKw} kW</strong></div>
        <div class="d-stat">Peak Load: <strong>${simResult.diurnalSummary.peakLoadKw} kW</strong></div>
        <div class="d-stat">Daily Solar: <strong>${simResult.diurnalSummary.dailySolarKwh.toLocaleString()} kWh</strong></div>
        <div class="d-stat">Daily Load: <strong>${simResult.diurnalSummary.dailyLoadKwh.toLocaleString()} kWh</strong></div>
        <div class="d-stat">Daily Self-Consumed: <strong class="text-accent-green">${simResult.diurnalSummary.dailySelfConsumedKwh.toLocaleString()} kWh</strong></div>
        <div class="d-stat">Daily Export: <strong class="text-accent-amber">${simResult.diurnalSummary.dailyExportedKwh.toLocaleString()} kWh</strong></div>
      </div>
    </div>

    <!-- Lower Section: Monthly Energy Balance Table & Net Billing Economics -->
    <div class="sim-lower-grid">
      <!-- Monthly Energy Balance Breakdown Table -->
      <div class="sim-card-box">
        <div class="box-header">
          <span>12-MONTH ENERGY BALANCE &amp; RE SHARE</span>
          <span class="badge-re-share">Annual RE Share: ${simResult.annualReSharePercent}%</span>
        </div>
        <div class="sim-monthly-table-wrap">
          <table class="sim-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Solar Gen</th>
                <th>Facility Load</th>
                <th>Self-Consumed</th>
                <th>Grid Export</th>
                <th>Grid Import</th>
                <th>RE Share</th>
              </tr>
            </thead>
            <tbody>
              ${simResult.monthlyRecords.map(m => `
                <tr>
                  <td><strong>${m.monthName}</strong></td>
                  <td class="text-accent-blue">${(m.solarGenerationKwh / 1000).toFixed(1)}k</td>
                  <td>${(m.facilityLoadKwh / 1000).toFixed(1)}k</td>
                  <td class="text-accent-green">${(m.selfConsumedKwh / 1000).toFixed(1)}k</td>
                  <td class="text-accent-amber">${(m.exportedKwh / 1000).toFixed(1)}k</td>
                  <td class="text-muted">${(m.importedKwh / 1000).toFixed(1)}k</td>
                  <td><span class="pill-re ${m.reSharePercent >= 50 ? 'high' : ''}">${m.reSharePercent}%</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Net-Billing / Financial Economics Card -->
      <div class="sim-card-box">
        <div class="box-header">
          <span>NET-BILLING &amp; ECONOMIC IMPACT</span>
        </div>
        <div class="tariff-config-row">
          <div class="tariff-field">
            <label for="inp-import-tariff">Retail Import Tariff (₱/kWh):</label>
            <input type="number" id="inp-import-tariff" class="inp-tariff" step="0.25" min="0" value="${this.importTariffRate}" />
          </div>
          <div class="tariff-field">
            <label for="inp-export-tariff">Feed-in Export Credit (₱/kWh):</label>
            <input type="number" id="inp-export-tariff" class="inp-tariff" step="0.25" min="0" value="${this.exportTariffRate}" />
          </div>
        </div>
        <div class="roi-metrics-list">
          <div class="roi-metric-item">
            <span class="roi-lbl">Original Annual Utility Bill (No Solar)</span>
            <strong class="roi-val">₱ ${simResult.originalBillPhp.toLocaleString()}</strong>
          </div>
          <div class="roi-metric-item">
            <span class="roi-lbl">New Annual Utility Bill (With Solar)</span>
            <strong class="roi-val text-accent-blue">₱ ${simResult.newBillPhp.toLocaleString()}</strong>
          </div>
          <div class="roi-metric-item">
            <span class="roi-lbl">Annual Net Electricity Savings</span>
            <strong class="roi-val text-accent-green">₱ ${simResult.annualSavingsPhp.toLocaleString()}</strong>
          </div>
          <div class="roi-metric-item highlight">
            <span class="roi-lbl">Facility Bill Reduction</span>
            <strong class="roi-val text-accent-green">📉 ${simResult.billReductionPercent}%</strong>
          </div>
          <div class="roi-metric-item">
            <span class="roi-lbl">Solar Self-Sufficiency (Load Coverage)</span>
            <strong class="roi-val text-accent-cyan">${simResult.annualSelfSufficiencyPercent}%</strong>
          </div>
        </div>
      </div>
    </div>
  `;
}
