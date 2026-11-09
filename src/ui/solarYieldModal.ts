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
import { escapeHtml } from '../utils/html';
import { renderYieldTab as renderYieldTabImpl } from './solarYield/yieldTab';
import { renderSimulationTab as renderSimulationTabImpl } from './solarYield/simulationTab';

export type SolarYieldModalTab = 'yield' | 'simulation';

export class SolarYieldModalUI {
  private container: HTMLElement;
  private store: ProjectStore;
  private isOpen: boolean = false;
  private activeTab: SolarYieldModalTab = 'yield';
  electricityRate: number = 10.0; // Default local currency unit per kWh
  currencySymbol: string = '₱';
  isSyncing: boolean = false;
  syncError: string | null = null;
  private targetSystemId?: string;
  private onOpenLoadProfile?: (systemId?: string) => void;
  private onOpenSimulationWorkspace?: (systemId?: string) => void;

  // Simulation Options State
  simPeriodOption: SimulationPeriodOption = 'annual';
  simWeeklyOption: SimulationWeeklyOption = 'week_avg';
  importTariffRate: number = 10.50;
  exportTariffRate: number = 5.50;

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

  private renderYieldTab( yieldResult: SolarYieldResult, maxMonthlyKwh: number, annualSavings: number, co2OffsetTons: number, treesEquivalent: number ) : string {
    return renderYieldTabImpl.call(this, yieldResult, maxMonthlyKwh, annualSavings, co2OffsetTons, treesEquivalent);
  }

  private renderSimulationTab(simResult: SimulationResult, peakDiurnalKw: number) : string {
    return renderSimulationTabImpl.call(this, simResult, peakDiurnalKw);
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
