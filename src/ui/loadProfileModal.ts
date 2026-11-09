/**
 * Existing Facility Load Profile & Demand Recording Modal UI
 *
 * Enables engineering recording of:
 * - 12-Month Utility Electric Bills (Jan - Dec kWh, Peak Demand kW, Energy Cost)
 * - 24-Hour Diurnal Daily Demand Curves (Hourly shape, Weekday vs Weekend, Archetype Presets)
 * - CSV Ingestion (12-Mo Bills, 24-Hour Shapes, 8760 SCADA/AMI meter logs)
 *
 * Prepared for subsequent Renewable Energy (RE) Share and self-consumption matching.
 */

import { ProjectStore } from '../store/projectStore';
import { FacilityLoadProfile, LoadProfileArchetype } from '../types/solar';
import {
  ARCHETYPE_DIURNAL_CURVES,
  generateMonthlyBillCsvTemplate,
  generateDiurnalCurveCsvTemplate
} from '../geo/loadProfile';
import { escapeHtml } from '../utils/html';
import { downloadCsv } from '../utils/download';
import { handleFileUpload as handleFileUploadImpl, attachEventListeners as attachEventListenersImpl } from './loadProfile/loadProfileEvents';

export type LoadModalTab = 'monthly' | 'diurnal' | 'import_export';
export type DiurnalViewMode = 'comparison' | 'weekday' | 'weekend';

export class LoadProfileModalUI {
  container: HTMLElement;
  store: ProjectStore;
  private isOpen: boolean = false;
  activeTab: LoadModalTab = 'monthly';
  diurnalViewMode: DiurnalViewMode = 'comparison';
  targetSystemId?: string;
  uploadMessage: { type: 'success' | 'error'; text: string } | null = null;
  onOpenYieldModal?: (systemId?: string, tab?: 'yield' | 'simulation') => void;

  constructor(store: ProjectStore, onOpenYieldModal?: (systemId?: string, tab?: 'yield' | 'simulation') => void) {
    this.store = store;
    this.onOpenYieldModal = onOpenYieldModal;

    let modalEl = document.getElementById('load-profile-modal-backdrop');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'load-profile-modal-backdrop';
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

  public open(systemId?: string): void {
    if (!document.body.contains(this.container)) {
      document.body.appendChild(this.container);
    }
    this.targetSystemId = systemId;
    this.isOpen = true;
    this.uploadMessage = null;
    this.container.style.display = 'flex';
    window.addEventListener('keydown', this.handleKeyDown);
    this.store.ensureLoadProfile(systemId);
    this.render();
  }

  public close(): void {
    this.isOpen = false;
    this.container.style.display = 'none';
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  handleDownloadTemplate(type: 'monthly' | 'diurnal'): void {
    const csvContent = type === 'monthly' ? generateMonthlyBillCsvTemplate() : generateDiurnalCurveCsvTemplate();
    const fileName = type === 'monthly' ? 'monthly_utility_bills_template.csv' : '24h_diurnal_curve_template.csv';
    downloadCsv(csvContent, fileName);
  }

  handleFileUpload(file: File) : void {
    return handleFileUploadImpl.call(this, file);
  }

  public render(): void {
    if (!this.isOpen) return;

    const profile: FacilityLoadProfile = this.store.ensureLoadProfile(this.targetSystemId);
    const avgDailyKwh = Math.round(profile.annualKwh / 365);
    const avgMonthlyKwh = Math.round(profile.annualKwh / 12);
    const peakDemand = Math.max(...profile.monthlyBreakdown.map(m => m.peakDemandKw || 0));
    const tariffRate = profile.averageTariffRatePhp || 10.50;
    const estAnnualCost = Math.round(profile.annualKwh * tariffRate);

    const maxMonthlyKwh = Math.max(1, ...profile.monthlyBreakdown.map(m => m.consumptionKwh));
    const weekdayCurve = profile.defaultDailyCurve;
    const weekendCurve = (profile.weekendDailyCurve && profile.weekendDailyCurve.length === 24)
      ? profile.weekendDailyCurve
      : (ARCHETYPE_DIURNAL_CURVES[profile.archetype]?.weekend || profile.defaultDailyCurve);
    const maxDiurnalWeight = Math.max(0.01, ...weekdayCurve, ...(profile.hasWeekendProfile ? weekendCurve : []));

    this.container.innerHTML = `
      <div class="custom-modal-dialog load-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="load-modal-title">
        <!-- Header -->
        <div class="custom-modal-header">
          <div class="header-left">
            <h3 id="load-modal-title" class="custom-modal-title">
              <span class="header-icon">⚡</span> Existing Facility Load Profile &amp; Demand
            </h3>
            <p class="custom-modal-subtitle">
              Record 12-month utility consumption and 24-hour diurnal demand curves for RE share &amp; solar matching.
            </p>
          </div>
          <button type="button" class="modal-close-btn" id="btn-close-load-modal" title="Close" aria-label="Close">✕</button>
        </div>

        <!-- Body -->
        <div class="custom-modal-body load-profile-body">
          <!-- Top KPI Grid -->
          <div class="load-kpi-grid">
            <div class="kpi-card highlight">
              <span class="kpi-label">ANNUAL FACILITY CONSUMPTION</span>
              <strong class="kpi-value text-accent-blue">${profile.annualKwh.toLocaleString()} <span class="kpi-unit">kWh/yr</span></strong>
              <span class="kpi-sub">Total 12-Month Utility Demand</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">AVERAGE DAILY LOAD</span>
              <strong class="kpi-value text-accent-green">${avgDailyKwh.toLocaleString()} <span class="kpi-unit">kWh/day</span></strong>
              <span class="kpi-sub">~${avgMonthlyKwh.toLocaleString()} kWh / month</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">PEAK REGISTERED DEMAND</span>
              <strong class="kpi-value text-accent-amber">${peakDemand > 0 ? `${peakDemand} kW` : 'N/A'}</strong>
              <span class="kpi-sub">Highest monthly billing peak</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">ESTIMATED ELECTRICITY COST</span>
              <strong class="kpi-value text-accent-cyan">₱${estAnnualCost.toLocaleString()}</strong>
              <span class="kpi-sub">@ ₱${tariffRate.toFixed(2)}/kWh average tariff</span>
            </div>
          </div>

          <!-- Tab Navigation -->
          <div class="load-tab-bar" role="tablist">
            <button class="load-tab-btn ${this.activeTab === 'monthly' ? 'active' : ''}" data-tab="monthly" role="tab">
              📊 12-Month Utility Bills (kWh)
            </button>
            <button class="load-tab-btn ${this.activeTab === 'diurnal' ? 'active' : ''}" data-tab="diurnal" role="tab">
              ⏰ 24-Hour Diurnal Demand Shape
            </button>
            <button class="load-tab-btn ${this.activeTab === 'import_export' ? 'active' : ''}" data-tab="import_export" role="tab">
              📂 CSV Ingestion &amp; Templates
            </button>
          </div>

          ${this.uploadMessage ? `
            <div class="load-message ${this.uploadMessage.type === 'success' ? 'msg-success' : 'msg-error'}">
              ${this.uploadMessage.type === 'success' ? '✅' : '⚠️'} ${escapeHtml(this.uploadMessage.text)}
            </div>
          ` : ''}

          <!-- TAB 1: 12-Month Utility Bills -->
          ${this.activeTab === 'monthly' ? `
            <div class="tab-pane active">
              <!-- Quick Scale Helper -->
              <div class="load-quick-scale-bar">
                <div class="quick-scale-left">
                  <span class="quick-label">⚡ Fast Scale Total:</span>
                  <input type="number" id="input-quick-annual" class="form-input-sm" value="${profile.annualKwh}" step="1000" min="100" style="width: 140px;" />
                  <span class="unit-label">kWh/year</span>
                  <button type="button" id="btn-apply-annual-scale" class="btn btn-sm btn-primary">Distribute Evenly</button>
                </div>
                <div class="quick-scale-right">
                  <label class="tariff-label">Tariff Rate (₱/kWh):</label>
                  <input type="number" id="input-tariff-rate" class="form-input-sm" value="${tariffRate}" step="0.1" min="0" style="width: 80px;" />
                </div>
              </div>

              <!-- Monthly Visual Bar Chart -->
              <div class="load-chart-section">
                <div class="chart-header">
                  <span class="chart-title">MONTHLY CONSUMPTION BREAKDOWN</span>
                  <span class="chart-sub">Facility energy baseline across all 12 calendar months</span>
                </div>
                <div class="yield-bar-chart-container">
                  ${profile.monthlyBreakdown.map(m => {
                    const heightPercent = Math.max(6, Math.round((m.consumptionKwh / maxMonthlyKwh) * 100));
                    return `
                      <div class="chart-col" title="${m.monthName}: ${m.consumptionKwh.toLocaleString()} kWh (${m.daysInMonth} days)">
                        <div class="bar-value-label">${(m.consumptionKwh / 1000).toFixed(1)}k</div>
                        <div class="bar-track">
                          <div class="bar-fill bar-fill-load" style="height: ${heightPercent}%;"></div>
                        </div>
                        <div class="bar-col-label">${m.monthName}</div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>

              <!-- Editable Monthly Table -->
              <div class="load-table-container">
                <table class="load-monthly-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Days</th>
                      <th>Energy Consumption (kWh)</th>
                      <th>Peak Demand (kW)</th>
                      <th>Est. Bill (₱)</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${profile.monthlyBreakdown.map((m, idx) => `
                      <tr>
                        <td><strong>${m.monthName}</strong></td>
                        <td class="text-subtle">${m.daysInMonth}</td>
                        <td>
                          <input type="number" class="load-cell-input input-month-kwh" data-month="${idx}" value="${m.consumptionKwh}" min="0" step="100" />
                        </td>
                        <td>
                          <input type="number" class="load-cell-input input-month-peak" data-month="${idx}" value="${m.peakDemandKw ?? ''}" placeholder="Optional" min="0" step="0.5" />
                        </td>
                        <td class="text-muted">
                          ₱${(m.energyCostPhp ?? Math.round(m.consumptionKwh * tariffRate)).toLocaleString()}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>TOTAL</th>
                      <th>365</th>
                      <th>${profile.annualKwh.toLocaleString()} kWh</th>
                      <th>${peakDemand > 0 ? `${peakDemand} kW` : '-'}</th>
                      <th>₱${estAnnualCost.toLocaleString()}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ` : ''}

          <!-- TAB 2: 24-Hour Diurnal Demand Shape -->
          ${this.activeTab === 'diurnal' ? `
            <div class="tab-pane active">
              <!-- Archetype Selector Bar -->
              <div class="archetype-section">
                <span class="archetype-section-title">Select Facility Load Archetype (1-Click Preset):</span>
                <div class="archetype-btn-grid">
                  ${(Object.keys(ARCHETYPE_DIURNAL_CURVES) as LoadProfileArchetype[]).map(arch => {
                    const set = ARCHETYPE_DIURNAL_CURVES[arch];
                    const isActive = profile.archetype === arch;
                    return `
                      <button type="button" class="btn-archetype ${isActive ? 'active' : ''}" data-archetype="${arch}">
                        <div class="archetype-name">${escapeHtml(set.name)}</div>
                        <div class="archetype-desc">${escapeHtml(set.description)}</div>
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>

              <!-- 24-Hour Diurnal Curve Chart -->
              <div class="load-chart-section" style="margin-top: 16px;">
                <div class="chart-header">
                  <div>
                    <span class="chart-title">24-HOUR HOURLY LOAD DISTRIBUTION (00:00 to 23:00)</span>
                    <span class="chart-sub">Diurnal curve shape used for matching daylight solar yield against daytime facility demand</span>
                  </div>
                  <div class="diurnal-view-controls">
                    <div class="diurnal-mode-selector">
                      <button type="button" class="btn-diurnal-mode ${this.diurnalViewMode === 'comparison' ? 'active' : ''}" data-mode="comparison" title="Side-by-side comparison of Weekday and Weekend demand">
                        📊 Dual (Weekday vs. Weekend)
                      </button>
                      <button type="button" class="btn-diurnal-mode ${this.diurnalViewMode === 'weekday' ? 'active' : ''}" data-mode="weekday" title="Show Weekday (Mon–Fri) curve only">
                        🟠 Weekday
                      </button>
                      <button type="button" class="btn-diurnal-mode ${this.diurnalViewMode === 'weekend' ? 'active' : ''}" data-mode="weekend" title="Show Weekend (Sat–Sun) curve only">
                        🟣 Weekend
                      </button>
                    </div>
                  </div>
                </div>

                <div class="diurnal-legend-strip">
                  ${this.diurnalViewMode !== 'weekend' ? '<span class="legend-badge legend-weekday">● Weekday (Mon–Fri)</span>' : ''}
                  ${this.diurnalViewMode !== 'weekday' ? '<span class="legend-badge legend-weekend">● Weekend (Sat–Sun)</span>' : ''}
                  <span class="legend-archetype-tag">${escapeHtml(ARCHETYPE_DIURNAL_CURVES[profile.archetype]?.name || 'Custom')}</span>
                  ${profile.hasWeekendProfile ? '<span class="legend-badge legend-status-on">✓ Weekend Curve Active</span>' : '<span class="legend-badge legend-status-off">Weekend Profile Disabled</span>'}
                </div>

                <!-- 24-Bar Diurnal Chart -->
                <div class="diurnal-bar-chart-container">
                  ${Array.from({ length: 24 }).map((_, h) => {
                    const wDayFraction = weekdayCurve[h] || 0;
                    const wEndFraction = weekendCurve[h] || 0;
                    const wDayKw = Math.round((profile.annualKwh / 365) * wDayFraction);
                    const wEndKw = Math.round((profile.annualKwh / 365) * wEndFraction);

                    const wDayHeight = Math.max(3, Math.round((wDayFraction / maxDiurnalWeight) * 100));
                    const wEndHeight = Math.max(3, Math.round((wEndFraction / maxDiurnalWeight) * 100));
                    const hourLabel = `${h.toString().padStart(2, '0')}:00`;

                    return `
                      <div class="chart-col diurnal-col" title="${hourLabel}: Weekday ${(wDayFraction * 100).toFixed(2)}% (~${wDayKw} kW) | Weekend ${(wEndFraction * 100).toFixed(2)}% (~${wEndKw} kW)">
                        <div class="bar-value-label">
                          ${this.diurnalViewMode === 'comparison'
                            ? `${(wDayFraction * 100).toFixed(0)}%`
                            : this.diurnalViewMode === 'weekend'
                              ? `${(wEndFraction * 100).toFixed(1)}%`
                              : `${(wDayFraction * 100).toFixed(1)}%`
                          }
                        </div>
                        <div class="bar-track-base">
                          ${this.diurnalViewMode === 'comparison' ? `
                            <div class="bar-track-half" title="Weekday: ${(wDayFraction * 100).toFixed(2)}% (~${wDayKw} kW)">
                              <div class="bar-fill bar-fill-weekday" style="height: ${wDayHeight}%;"></div>
                            </div>
                            <div class="bar-track-half" title="Weekend: ${(wEndFraction * 100).toFixed(2)}% (~${wEndKw} kW)">
                              <div class="bar-fill bar-fill-weekend" style="height: ${wEndHeight}%;"></div>
                            </div>
                          ` : this.diurnalViewMode === 'weekend' ? `
                            <div class="bar-track-full" title="Weekend: ${(wEndFraction * 100).toFixed(2)}% (~${wEndKw} kW)">
                              <div class="bar-fill bar-fill-weekend" style="height: ${wEndHeight}%;"></div>
                            </div>
                          ` : `
                            <div class="bar-track-full" title="Weekday: ${(wDayFraction * 100).toFixed(2)}% (~${wDayKw} kW)">
                              <div class="bar-fill bar-fill-weekday" style="height: ${wDayHeight}%;"></div>
                            </div>
                          `}
                        </div>
                        <div class="axis-tick"></div>
                        <div class="bar-col-label">${h % 2 === 0 ? `${h}h` : '&nbsp;'}</div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>

              <!-- Weekend Profile Toggle -->
              <div class="weekend-toggle-bar">
                <label class="toggle-container">
                  <input type="checkbox" id="chk-weekend-profile" ${profile.hasWeekendProfile ? 'checked' : ''} />
                  <span class="toggle-label">Enable Distinct Weekend Load Profile (Lower Saturday / Sunday operations)</span>
                </label>
              </div>
            </div>
          ` : ''}

          <!-- TAB 3: CSV Ingestion & Templates -->
          ${this.activeTab === 'import_export' ? `
            <div class="tab-pane active">
              <div class="csv-import-grid">
                <!-- Dropzone Card -->
                <div class="csv-card">
                  <div class="csv-card-header">
                    <span class="icon">📤</span>
                    <h4>Import Facility Load CSV</h4>
                  </div>
                  <p class="csv-card-desc">
                    Upload your utility electric bills or smart meter logs. Supports:
                  </p>
                  <ul class="csv-spec-list">
                    <li><strong>12-Month Utility Bills:</strong> CSV with columns <code>Month, kWh, [PeakKW], [Cost]</code></li>
                    <li><strong>24-Hour Diurnal Curve:</strong> CSV with columns <code>Hour (0..23), Load_Fraction</code></li>
                    <li><strong>8760 AMI / SCADA Log:</strong> Full annual hourly meter log (auto-aggregates monthly totals &amp; extracts 24h curve)</li>
                  </ul>

                  <div class="csv-dropzone" id="csv-dropzone">
                    <span class="dropzone-icon">📁</span>
                    <strong>Drag &amp; Drop CSV File Here</strong>
                    <span class="dropzone-hint">or click to browse your computer</span>
                    <input type="file" id="file-load-csv-input" accept=".csv,.txt" style="display: none;" />
                  </div>
                </div>

                <!-- Template Download Card -->
                <div class="csv-card">
                  <div class="csv-card-header">
                    <span class="icon">📥</span>
                    <h4>Download Blank CSV Templates</h4>
                  </div>
                  <p class="csv-card-desc">
                    Need a formatted spreadsheet to input facility data? Download a pre-formatted template with standard headers:
                  </p>
                  <div class="template-btn-group">
                    <button type="button" id="btn-download-monthly-template" class="btn btn-outline">
                      📄 12-Month Billing Template (CSV)
                    </button>
                    <button type="button" id="btn-download-diurnal-template" class="btn btn-outline">
                      📈 24-Hour Diurnal Shape Template (CSV)
                    </button>
                  </div>

                  <div class="re-share-readiness-box">
                    <span class="box-icon">🎯</span>
                    <div>
                      <strong>Ready for RE Share Matching</strong>
                      <p>Once recorded, this load baseline will be matched directly against your solar PV array generation yield to compute Renewable Energy Share %, Solar Self-Consumption %, and Grid Spillover.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Footer -->
        <div class="custom-modal-footer">
          <div class="footer-left">
            ${this.onOpenYieldModal ? `
              <button type="button" id="btn-crosslink-solar-yield" class="btn btn-sm btn-outline">
                ☀️ Solar Yield &amp; Losses
              </button>
              <button type="button" id="btn-crosslink-simulation" class="btn btn-sm btn-outline" style="color: #10b981; border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.08);">
                ⚡ Solar + Load Simulation (RE Share)
              </button>
            ` : ''}
          </div>
          <div class="footer-right">
            <button type="button" id="btn-reset-load-defaults" class="btn btn-sm btn-outline danger-hover">
              Reset Defaults
            </button>
            <button type="button" id="btn-close-load-modal-footer" class="btn btn-sm btn-primary">
              Done &amp; Save
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners() : void {
    return attachEventListenersImpl.call(this);
  }
}
