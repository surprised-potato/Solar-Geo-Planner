/**
 * Solar Yield & Generation Analytics Modal UI
 *
 * Provides comprehensive photovoltaic engineering analytics:
 * 1. Solar Resource & Yield Analytics:
 *    - 12-Month Generation Bar Chart (Jan - Dec)
 *    - Complete System Loss Waterfall (POA, Thermal, Soiling, Cabling, Inverter, AC Feeder)
 *    - Integration with Solar Atlas & NASA POWER Climatology (1-click sync)
 *    - Financial Savings & Environmental Carbon Offset Projections
 * 2. Solar + Load Simulations & RE Share:
 *    - Combined Solar Generation & Facility Demand Matching
 *    - Renewable Energy (RE) Share & Direct Self-Consumption
 *    - Grid Energy Export (Surplus) and Import (Deficit)
 *    - Interactive 24-Hour Diurnal Dispatch Curves with Average Monthly and Weekly Options
 *    - 12-Month Energy Balance Breakdown Table
 *    - Net-Billing Economic Impact
 */

import { ProjectStore } from '../store/projectStore';
import { SolarAtlasService } from '../services/solarAtlasService';
import { SolarYieldResult } from '../geo/solarYield';
import {
  simulateSolarAndLoadMatching,
  SimulationResult,
  SimulationPeriodOption,
  SimulationWeeklyOption
} from '../geo/energySimulation';
import { MONTH_NAMES } from '../geo/loadProfile';
import { escapeHtml } from '../utils/html';

export type SolarYieldModalTab = 'yield' | 'simulation';

export class SolarYieldModalUI {
  private container: HTMLElement;
  private store: ProjectStore;
  private isOpen: boolean = false;
  private activeTab: SolarYieldModalTab = 'yield';
  private electricityRate: number = 10.0; // Default local currency unit per kWh
  private currencySymbol: string = '₱';
  private isSyncing: boolean = false;
  private syncError: string | null = null;
  private targetSystemId?: string;
  private onOpenLoadProfile?: (systemId?: string) => void;
  private onOpenSimulationWorkspace?: (systemId?: string) => void;

  // Simulation Options State
  private simPeriodOption: SimulationPeriodOption = 'annual';
  private simWeeklyOption: SimulationWeeklyOption = 'week_avg';
  private importTariffRate: number = 10.50;
  private exportTariffRate: number = 5.50;

  constructor(
    store: ProjectStore,
    onOpenLoadProfile?: (systemId?: string) => void,
    onOpenSimulationWorkspace?: (systemId?: string) => void
  ) {
    this.store = store;
    this.onOpenLoadProfile = onOpenLoadProfile;
    this.onOpenSimulationWorkspace = onOpenSimulationWorkspace;

    // Create or locate modal backdrop container
    let modalEl = document.getElementById('solar-yield-modal-backdrop');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'solar-yield-modal-backdrop';
      modalEl.className = 'custom-modal-backdrop';
      modalEl.style.display = 'none';
      document.body.appendChild(modalEl);
    }
    this.container = modalEl;

    this.store.subscribe(() => {
      if (this.isOpen) {
        this.render();
      }
    });
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.isOpen) {
      this.close();
    }
  };

  public open(systemId?: string, defaultTab: SolarYieldModalTab = 'yield'): void {
    if (!document.body.contains(this.container)) {
      document.body.appendChild(this.container);
    }
    this.targetSystemId = systemId;
    this.activeTab = defaultTab;
    this.isOpen = true;
    this.syncError = null;
    this.container.style.display = 'flex';
    window.addEventListener('keydown', this.handleKeyDown);
    this.render();
  }

  public close(): void {
    this.isOpen = false;
    this.container.style.display = 'none';
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  private async handleSyncSolarAtlas(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.syncError = null;
    this.render();

    try {
      const atlasService = SolarAtlasService.getInstance();
      const resource = await atlasService.fetchClimatology(this.store.center);
      this.store.setCustomSolarResource(resource);
    } catch (err: any) {
      console.warn('Solar Atlas sync failed, falling back to built-in climatology:', err);
      this.syncError = err?.message || 'Failed to connect to solar data service. Using built-in climatology.';
    } finally {
      this.isSyncing = false;
      this.render();
    }
  }

  public render(): void {
    if (!this.isOpen) return;

    const currentSys = this.targetSystemId && this.targetSystemId !== 'all'
      ? this.store.getSystem(this.targetSystemId)
      : this.store.getSelectedSystem();

    const targetSysId = currentSys?.id;
    const yieldResult: SolarYieldResult = this.store.getSolarYieldEstimate(targetSysId);
    const summary = this.store.getSystemSummary(targetSysId);
    const loadProfile = this.store.ensureLoadProfile(targetSysId);

    // Compute simulation
    const simResult: SimulationResult = simulateSolarAndLoadMatching(yieldResult, loadProfile, {
      period: this.simPeriodOption,
      weekly: this.simWeeklyOption,
      importTariffPhp: this.importTariffRate,
      exportTariffPhp: this.exportTariffRate
    });

    const annualSavings = Math.round(yieldResult.annualYieldKwh * this.electricityRate);
    const co2OffsetTons = Number((yieldResult.annualYieldKwh * 0.0007).toFixed(1)); // 0.70 kg CO2 / kWh
    const treesEquivalent = Math.round(co2OffsetTons * 45); // approx 45 trees per ton CO2

    // Max monthly generation for scaling bar heights
    const maxMonthlyKwh = Math.max(1, ...yieldResult.monthlyBreakdown.map(m => m.netAcKwh));

    // Peak for diurnal chart
    const peakDiurnalKw = Math.max(
      1,
      simResult.diurnalSummary.peakSolarKw,
      simResult.diurnalSummary.peakLoadKw
    ) * 1.15;

    this.container.innerHTML = `
      <div class="custom-modal-dialog solar-yield-dialog" role="dialog" aria-modal="true" aria-labelledby="yield-modal-title">
        <!-- Header -->
        <div class="custom-modal-header">
          <div class="header-left">
            <span class="header-icon">☀️</span>
            <div>
              <h2 id="yield-modal-title" style="margin: 0; font-size: 17px; font-weight: 700; color: #fff;">
                Solar Yield &amp; System Simulations
              </h2>
              <span class="header-subtitle" style="font-size: 12px; color: var(--text-dim, #94a3b8);">
                ${escapeHtml(currentSys ? currentSys.name : 'All Systems')} &bull; ${summary.totalKwp} kWp Solar &bull; ${escapeHtml(loadProfile.name)} (${((loadProfile.annualKwh) / 1000).toFixed(0)}k kWh/yr Demand)
              </span>
            </div>
          </div>
          <button type="button" class="modal-close-btn" id="btn-close-yield-modal" title="Close" aria-label="Close">✕</button>
        </div>

        <!-- Navigation Tabs -->
        <div class="modal-tab-bar" role="tablist">
          <button class="modal-tab-btn ${this.activeTab === 'yield' ? 'active' : ''}" data-tab="yield" role="tab">
            ☀️ Solar Generation &amp; Losses
          </button>
          <button class="modal-tab-btn ${this.activeTab === 'simulation' ? 'active' : ''}" data-tab="simulation" role="tab">
            ⚡ Simulations &amp; RE Share
          </button>
        </div>

        <!-- Body Content -->
        <div class="custom-modal-body solar-yield-body">
          ${this.activeTab === 'yield' ? this.renderYieldTab(yieldResult, maxMonthlyKwh, annualSavings, co2OffsetTons, treesEquivalent) : this.renderSimulationTab(simResult, peakDiurnalKw)}
        </div>

        <!-- Footer -->
        <div class="custom-modal-footer">
          <div class="footer-left" style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${this.onOpenLoadProfile ? `
              <button type="button" class="btn btn-sm btn-outline" id="btn-open-load-from-yield" style="color: #f59e0b; border-color: rgba(245, 158, 11, 0.4);">
                🏢 Edit Facility Load Profile &amp; Billing
              </button>
            ` : ''}
            ${this.onOpenSimulationWorkspace ? `
              <button type="button" class="btn btn-sm btn-primary" id="btn-open-sim-tab-from-modal" style="gap: 6px; font-weight: 600;">
                📈 Open Dedicated Simulation Tab &rarr;
              </button>
            ` : ''}
          </div>
          <div class="footer-right">
            <button type="button" class="btn-secondary" id="btn-footer-close-yield">Close</button>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private renderYieldTab(
    yieldResult: SolarYieldResult,
    maxMonthlyKwh: number,
    annualSavings: number,
    co2OffsetTons: number,
    treesEquivalent: number
  ): string {
    return `
      <!-- KPI Top Cards -->
      <div class="yield-kpi-grid">
        <div class="kpi-card highlight">
          <span class="kpi-label">ESTIMATED ANNUAL YIELD</span>
          <strong class="kpi-value text-accent-blue">${yieldResult.annualYieldKwh.toLocaleString()} <span class="kpi-unit">kWh/yr</span></strong>
          <span class="kpi-sub">Total Net AC Energy to Grid</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">SPECIFIC ANNUAL YIELD</span>
          <strong class="kpi-value text-accent-green">${yieldResult.specificYieldKwhPerKwp.toLocaleString()} <span class="kpi-unit">kWh/kWp/yr</span></strong>
          <span class="kpi-sub">Normalized Energy Productivity</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">PERFORMANCE RATIO (PR)</span>
          <strong class="kpi-value ${yieldResult.performanceRatio >= 80 ? 'text-accent-green' : 'text-accent-amber'}">
            ${yieldResult.performanceRatio}%
          </strong>
          <span class="kpi-sub">Net System Efficiency</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">CAPACITY FACTOR (CF)</span>
          <strong class="kpi-value text-accent-cyan">${yieldResult.capacityFactor}%</strong>
          <span class="kpi-sub">Annual Utilization</span>
        </div>
      </div>

      <!-- Solar Resource Data Source Card -->
      <div class="yield-resource-banner">
        <div class="resource-info">
          <span class="resource-tag">SOLAR RESOURCE CLIMATOLOGY</span>
          <strong>${yieldResult.dataSourceName}</strong>
          <span class="resource-metrics">
            Annual GHI: <strong>${yieldResult.annualGhiKwhPerM2} kWh/m²</strong> &bull;
            Plane-of-Array POA: <strong>${yieldResult.annualPoaKwhPerM2} kWh/m²</strong>
            ${yieldResult.lossCascade.poaGainLossPercent >= 0 ? `(+${yieldResult.lossCascade.poaGainLossPercent}% tilt gain)` : `(${yieldResult.lossCascade.poaGainLossPercent}% tilt loss)`}
          </span>
        </div>
        <div class="resource-actions">
          <button type="button" id="btn-sync-solar-atlas" class="btn-sm btn-outline ${this.isSyncing ? 'loading' : ''}">
            ${this.isSyncing ? '⏳ Syncing...' : '🔄 Sync with NASA POWER'}
          </button>
        </div>
      </div>
      ${
        this.syncError
          ? `<div class="yield-sync-error">⚠️ ${this.syncError}</div>`
          : ''
      }

      <!-- Monthly Generation Bar Chart -->
      <div class="yield-chart-section">
        <div class="chart-header">
          <span class="chart-title">MONTHLY AC GENERATION PROFILE</span>
          <span class="chart-sub">12-Month Net Energy Output (kWh) &amp; Solar Transposition</span>
        </div>
        <div class="yield-bar-chart-container">
          ${yieldResult.monthlyBreakdown
            .map(m => {
              const heightPercent = Math.max(8, Math.round((m.netAcKwh / maxMonthlyKwh) * 100));
              return `
                <div class="chart-col" title="${m.monthName}: ${m.netAcKwh.toLocaleString()} kWh (POA: ${m.poaKwhPerM2Day} kWh/m²/day, Cell Temp: ${m.cellTempC}°C)">
                  <div class="bar-value-label">${(m.netAcKwh / 1000).toFixed(1)}k</div>
                  <div class="bar-track">
                    <div class="bar-fill" style="height: ${heightPercent}%;"></div>
                  </div>
                  <div class="bar-month-label">${m.monthName}</div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>

      <!-- System Loss Waterfall & Financial Section Grid -->
      <div class="yield-lower-grid">
        <!-- Left: Loss Waterfall -->
        <div class="yield-loss-box">
          <div class="box-header">
            <span>SYSTEM LOSS CASCADE (WATERFALL)</span>
            <span class="badge-total-loss">Total Loss: ${yieldResult.lossCascade.totalLossPercent}%</span>
          </div>
          <div class="loss-list">
            <div class="loss-row">
              <span class="loss-name">Plane-of-Array Gain/Loss</span>
              <span class="loss-val ${yieldResult.lossCascade.poaGainLossPercent >= 0 ? 'text-accent-green' : 'text-accent-amber'}">
                ${yieldResult.lossCascade.poaGainLossPercent >= 0 ? `+${yieldResult.lossCascade.poaGainLossPercent}%` : `${yieldResult.lossCascade.poaGainLossPercent}%`}
              </span>
            </div>
            <div class="loss-row">
              <span class="loss-name">Module Temperature Derate</span>
              <span class="loss-val text-accent-red">-${yieldResult.lossCascade.thermalLossPercent}%</span>
            </div>
            <div class="loss-row">
              <span class="loss-name">Soiling &amp; Surface Dust</span>
              <span class="loss-val text-accent-red">-${yieldResult.lossCascade.soilingLossPercent}%</span>
            </div>
            <div class="loss-row">
              <span class="loss-name">Light-Induced Degradation (LID)</span>
              <span class="loss-val text-accent-red">-${yieldResult.lossCascade.lidLossPercent}%</span>
            </div>
            <div class="loss-row">
              <span class="loss-name">Module Mismatch &amp; Quality</span>
              <span class="loss-val text-accent-red">-${yieldResult.lossCascade.mismatchLossPercent}%</span>
            </div>
            <div class="loss-row">
              <span class="loss-name">DC Homerun &amp; String Wiring</span>
              <span class="loss-val text-accent-red">-${yieldResult.lossCascade.dcCableLossPercent}%</span>
            </div>
            <div class="loss-row">
              <span class="loss-name">Inverter Inefficiency</span>
              <span class="loss-val text-accent-red">-${yieldResult.lossCascade.inverterLossPercent}%</span>
            </div>
            ${
              yieldResult.lossCascade.clippingLossPercent > 0
                ? `
              <div class="loss-row">
                <span class="loss-name">DC/AC Power Clipping</span>
                <span class="loss-val text-accent-amber">-${yieldResult.lossCascade.clippingLossPercent}%</span>
              </div>
            `
                : ''
            }
            <div class="loss-row">
              <span class="loss-name">AC Feeder Voltage Drop</span>
              <span class="loss-val text-accent-red">-${yieldResult.lossCascade.acWiringLossPercent}%</span>
            </div>
            <div class="loss-row">
              <span class="loss-name">System Maintenance &amp; Outages</span>
              <span class="loss-val text-accent-red">-${yieldResult.lossCascade.availabilityLossPercent}%</span>
            </div>
          </div>
        </div>

        <!-- Right: Financial & Environmental ROI -->
        <div class="yield-roi-box">
          <div class="box-header">
            <span>FINANCIAL &amp; ENVIRONMENTAL PROJECTIONS</span>
          </div>
          <div class="roi-tariff-row">
            <label for="inp-electricity-rate">Electricity Rate (${this.currencySymbol}/kWh):</label>
            <input
              type="number"
              id="inp-electricity-rate"
              class="inp-tariff"
              step="0.5"
              min="0"
              value="${this.electricityRate}"
            />
          </div>
          <div class="roi-metrics-list">
            <div class="roi-metric-item">
              <span class="roi-lbl">Est. Year 1 Electricity Savings</span>
              <strong class="roi-val text-accent-green">${this.currencySymbol} ${annualSavings.toLocaleString()}</strong>
            </div>
            <div class="roi-metric-item">
              <span class="roi-lbl">Est. 25-Year Cumulative Savings</span>
              <strong class="roi-val text-accent-green">${this.currencySymbol} ${(annualSavings * 25).toLocaleString()}</strong>
            </div>
            <div class="roi-metric-item">
              <span class="roi-lbl">Annual Carbon Avoidance</span>
              <strong class="roi-val text-accent-cyan">${co2OffsetTons} Tons CO₂ / yr</strong>
            </div>
            <div class="roi-metric-item">
              <span class="roi-lbl">Equivalent Trees Planted</span>
              <strong class="roi-val text-accent-green">🌳 ${treesEquivalent.toLocaleString()} trees / yr</strong>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderSimulationTab(simResult: SimulationResult, peakDiurnalKw: number): string {
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

  private attachEventListeners(): void {
    this.container.querySelector('#btn-close-yield-modal')?.addEventListener('click', () => this.close());
    this.container.querySelector('#btn-footer-close-yield')?.addEventListener('click', () => this.close());

    // Tab buttons
    this.container.querySelectorAll<HTMLButtonElement>('.modal-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') as SolarYieldModalTab;
        if (tab && tab !== this.activeTab) {
          this.activeTab = tab;
          this.render();
        }
      });
    });

    this.container.querySelector('#btn-open-load-from-yield')?.addEventListener('click', () => {
      this.close();
      this.onOpenLoadProfile?.(this.targetSystemId);
    });

    this.container.querySelector('#btn-open-sim-tab-from-modal')?.addEventListener('click', () => {
      this.close();
      this.onOpenSimulationWorkspace?.(this.targetSystemId);
    });

    this.container.onclick = (e: MouseEvent) => {
      if (e.target === this.container) {
        this.close();
      }
    };

    // Tab 1 listeners
    this.container.querySelector('#btn-sync-solar-atlas')?.addEventListener('click', () => {
      this.handleSyncSolarAtlas();
    });

    const rateInp = this.container.querySelector('#inp-electricity-rate') as HTMLInputElement | null;
    rateInp?.addEventListener('change', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (!isNaN(val) && val >= 0) {
        this.electricityRate = val;
        this.render();
      }
    });

    // Tab 2 Simulation listeners
    const selPeriod = this.container.querySelector('#sel-sim-period') as HTMLSelectElement | null;
    selPeriod?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      this.simPeriodOption = val === 'annual' ? 'annual' : parseInt(val, 10);
      this.render();
    });

    const selWeekly = this.container.querySelector('#sel-sim-weekly') as HTMLSelectElement | null;
    selWeekly?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value as SimulationWeeklyOption;
      this.simWeeklyOption = val;
      this.render();
    });

    const inpImport = this.container.querySelector('#inp-import-tariff') as HTMLInputElement | null;
    inpImport?.addEventListener('change', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (!isNaN(val) && val >= 0) {
        this.importTariffRate = val;
        this.render();
      }
    });

    const inpExport = this.container.querySelector('#inp-export-tariff') as HTMLInputElement | null;
    inpExport?.addEventListener('change', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (!isNaN(val) && val >= 0) {
        this.exportTariffRate = val;
        this.render();
      }
    });
  }
}
