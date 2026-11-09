import { ProjectStore } from '../store/projectStore';
import { getBoqProjectTotal } from '../geo/boqCalculator';
import { DupaWorkItem } from '../types/solar';
import { escapeHtml } from '../utils/html';
import { renderBoqSummaryTab as renderBoqSummaryTabImpl, renderCostedBomTab as renderCostedBomTabImpl } from './boq/summaryTabs';
import { renderDedicatedDupaTab as renderDedicatedDupaTabImpl } from './boq/dupaTab';
import { attachEventListeners as attachEventListenersImpl } from './boq/boqEvents';

export type BoqViewTab = 'boq' | 'bom' | string;

export class BoqAndDupaUI {
  container: HTMLElement;
  store: ProjectStore;
  currentSystemId: string = 'all';
  private activeTab: BoqViewTab = 'boq';
  bomSearchQuery: string = '';
  bomCategoryFilter: string = 'all';

  constructor(containerIdOrEl: string | HTMLElement, store: ProjectStore, initialSystemId?: string) {
    if (typeof containerIdOrEl === 'string') {
      const el = typeof document !== 'undefined' ? document.getElementById(containerIdOrEl) : null;
      if (!el && typeof document !== 'undefined') throw new Error(`Container #${containerIdOrEl} not found`);
      this.container = el as HTMLElement;
    } else {
      this.container = containerIdOrEl;
    }

    this.store = store;
    if (initialSystemId) {
      this.currentSystemId = initialSystemId;
    }

    this.store.subscribe(() => {
      // Re-render when store updates
      this.render();
    });

    this.render();
  }

  public setSystem(systemId: string): void {
    this.currentSystemId = systemId;
    this.render();
  }

  public setActiveTab(tab: BoqViewTab): void {
    this.activeTab = tab;
    this.render();
  }

  getItemShortTitle(itemNo: string): string {
    const titles: Record<string, string> = {
      D1: 'Mob / Safety',
      D2: 'Mounting Structure',
      D3: 'DC Trays & Raceways',
      D4: 'PV Modules',
      D5: 'DC String Cabling',
      D6: 'DC Protections',
      D7: 'Inverters & Comms',
      D8: 'AC Combiner Panel',
      D9: 'Transformer Station',
      D10: 'Main Dist. Panel (MDP)',
      D11: 'AC Feeder Runs',
      D12: 'Grounding & LP',
      D13: 'Testing & Handover'
    };
    return titles[itemNo] || itemNo;
  }

  getItemColor(itemNo: string): string {
    const colors: Record<string, string> = {
      D1: '#38bdf8',
      D2: '#f59e0b',
      D3: '#06b6d4',
      D4: '#10b981',
      D5: '#a855f7',
      D6: '#ec4899',
      D7: '#f97316',
      D8: '#6366f1',
      D9: '#8b5cf6',
      D10: '#3b82f6',
      D11: '#14b8a6',
      D12: '#eab308',
      D13: '#22c55e'
    };
    return colors[itemNo] || '#38bdf8';
  }

  public render(): void {
    const systems = this.store.getSystems();
    const boqState = this.store.getBoqState(this.currentSystemId);
    const totals = getBoqProjectTotal(boqState);

    // Active project capacity metrics
    const activePanels = (this.currentSystemId === 'all'
      ? this.store.getPanels()
      : this.store.getPanelsForSystem(this.currentSystemId)
    ).filter(p => p.active);
    const totalWatts = activePanels.reduce((sum, p) => sum + p.electrical.nominalPowerW, 0);
    const totalKwp = totalWatts / 1000.0;
    const costPerWatt = totalWatts > 0 ? (totals.grandTotal / totalWatts).toFixed(2) : '0.00';

    this.container.innerHTML = `
      <div class="boq-dupa-wrapper" style="display: flex; flex-direction: column; gap: 14px; padding: 14px; font-family: system-ui, -apple-system, sans-serif; color: var(--text-main, #f8fafc); height: 100%; box-sizing: border-box;">
        
        <!-- Top Toolbar & Global Controls -->
        <div class="boq-toolbar" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 14px;">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <label for="boq-system-select" style="font-size: 12px; font-weight: 600; color: #38bdf8; display: flex; align-items: center; gap: 4px;">
              <span>⚡</span> Scope:
            </label>
            <select id="boq-system-select" class="input-select sm" style="padding: 4px 8px; font-size: 12px; border-radius: 4px; background: #0f172a; color: #fff; border: 1px solid #334155;">
              <option value="all" ${this.currentSystemId === 'all' ? 'selected' : ''}>🌐 All Systems (${systems.length})</option>
              ${systems.map(s => `<option value="${s.id}" ${this.currentSystemId === s.id ? 'selected' : ''}>⚡ ${escapeHtml(s.name)}</option>`).join('')}
            </select>

            <!-- Global DPWH Markups -->
            <div style="display: flex; align-items: center; gap: 6px; margin-left: 6px; padding: 3px 8px; background: rgba(0,0,0,0.3); border-radius: 4px; border: 1px solid rgba(255,255,255,0.08); font-size: 11px;">
              <span style="color: #94a3b8; font-weight: 600;">Markups:</span>
              <label style="display: flex; align-items: center; gap: 2px;">
                <span>OCM:</span>
                <input type="number" id="boq-input-ocm" value="${boqState.ocmPercent}" min="0" max="100" step="0.5" style="width: 44px; padding: 2px 4px; font-size: 11px; background: #1e293b; color: #fff; border: 1px solid #475569; border-radius: 3px;" />%
              </label>
              <label style="display: flex; align-items: center; gap: 2px; margin-left: 4px;">
                <span>Profit:</span>
                <input type="number" id="boq-input-profit" value="${boqState.profitPercent}" min="0" max="100" step="0.5" style="width: 44px; padding: 2px 4px; font-size: 11px; background: #1e293b; color: #fff; border: 1px solid #475569; border-radius: 3px;" />%
              </label>
              <label style="display: flex; align-items: center; gap: 2px; margin-left: 4px;">
                <span>VAT:</span>
                <input type="number" id="boq-input-vat" value="${boqState.vatPercent}" min="0" max="100" step="0.5" style="width: 44px; padding: 2px 4px; font-size: 11px; background: #1e293b; color: #fff; border: 1px solid #475569; border-radius: 3px;" />%
              </label>
              <button id="boq-btn-apply-markups" class="btn btn-xs btn-outline" style="padding: 2px 6px; font-size: 10px; margin-left: 4px;" title="Apply markup changes to all DUPA items">Apply</button>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <button id="boq-btn-toggle-lightning" class="btn btn-xs btn-outline" style="display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-color: ${boqState.includeLightningProtection ? '#10b981' : '#f59e0b'}; color: ${boqState.includeLightningProtection ? '#10b981' : '#f59e0b'};" title="Toggle Lightning & Main Grounding Protection (D12) as optional or included">
              <span>⚡</span> LPS (D12): ${boqState.includeLightningProtection ? 'Included' : 'Optional (₱0)'}
            </button>
            <button id="boq-btn-sync-cad" class="btn btn-xs btn-outline primary" style="display: flex; align-items: center; gap: 4px; padding: 4px 10px;" title="Re-sync quantities from Spatial CAD and SLD while preserving custom unit prices">
              <span>🔄</span> Sync CAD &amp; SLD
            </button>
            <button id="boq-btn-reset-rates" class="btn btn-xs btn-outline warning" style="display: flex; align-items: center; gap: 4px; padding: 4px 8px;" title="Reset all rates to standard DPWH benchmark catalog">
              <span>↺</span> Reset Rates
            </button>
            <button id="boq-btn-export-bom" class="btn btn-xs btn-outline" style="display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-color: #38bdf8; color: #38bdf8;" title="Export Costed Bill of Materials to CSV">
              <span>📦</span> Export BOM
            </button>
            <button id="boq-btn-export-csv" class="btn btn-xs btn-primary" style="display: flex; align-items: center; gap: 4px; padding: 4px 12px; font-weight: bold;" title="Export BOQ Schedule & DUPAs to CSV">
              <span>📥</span> Export BOQ CSV
            </button>
          </div>
        </div>

        <!-- Project Estimate KPI Strip -->
        <div class="boq-kpi-bar" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px;">
          <div class="kpi-chip" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 8px 12px;">
            <span class="kpi-label" style="font-size: 11px; color: #94a3b8; display: block;">GRAND TOTAL PROJECT ESTIMATE</span>
            <span class="kpi-val" style="font-size: 18px; font-weight: bold; color: #10b981;">₱${totals.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="kpi-chip" style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; padding: 8px 12px;">
            <span class="kpi-label" style="font-size: 11px; color: #94a3b8; display: block;">CAPACITY &amp; UNIT EPC RATE</span>
            <span class="kpi-val" style="font-size: 16px; font-weight: bold; color: #38bdf8;">₱${costPerWatt}/Wp <small style="font-size: 11px; color: #cbd5e1;">(${totalKwp.toFixed(2)} kWp)</small></span>
          </div>
          <div class="kpi-chip" style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; padding: 8px 12px;">
            <span class="kpi-label" style="font-size: 11px; color: #94a3b8; display: block;">DIRECT COST (EDC)</span>
            <span class="kpi-val" style="font-size: 16px; font-weight: bold; color: #f59e0b;">₱${totals.totalDirectCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="kpi-chip" style="background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 6px; padding: 8px 12px;">
            <span class="kpi-label" style="font-size: 11px; color: #94a3b8; display: block;">MATERIALS (A)</span>
            <span class="kpi-val" style="font-size: 15px; font-weight: 600; color: #c4b5fd;">₱${totals.totalMaterials.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="kpi-chip" style="background: rgba(236, 72, 153, 0.1); border: 1px solid rgba(236, 72, 153, 0.3); border-radius: 6px; padding: 8px 12px;">
            <span class="kpi-label" style="font-size: 11px; color: #94a3b8; display: block;">LABOR &amp; EQUIP (B+C)</span>
            <span class="kpi-val" style="font-size: 15px; font-weight: 600; color: #f472b6;">₱${(totals.totalLabor + totals.totalEquipment).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        <!-- DEDICATED CONSTRUCTION MANAGEMENT TAB BAR -->
        <nav class="boq-tab-nav" role="tablist" style="display: flex; gap: 4px; border-bottom: 2px solid #334155; padding-bottom: 0; overflow-x: auto; scrollbar-width: thin;">
          <button class="boq-tab-btn ${this.activeTab === 'boq' ? 'active' : ''}" data-boq-tab="boq" style="display: flex; align-items: center; gap: 6px; padding: 8px 14px; font-size: 12px; font-weight: 600; border-radius: 6px 6px 0 0; border: 1px solid ${this.activeTab === 'boq' ? '#38bdf8' : 'transparent'}; border-bottom: none; background: ${this.activeTab === 'boq' ? '#0f172a' : 'transparent'}; color: ${this.activeTab === 'boq' ? '#38bdf8' : '#94a3b8'}; cursor: pointer; white-space: nowrap; transition: all 0.15s;">
            <span>📋</span> Bill of Quantities (BOQ)
          </button>
          
          <button class="boq-tab-btn ${this.activeTab === 'bom' ? 'active' : ''}" data-boq-tab="bom" style="display: flex; align-items: center; gap: 6px; padding: 8px 14px; font-size: 12px; font-weight: 600; border-radius: 6px 6px 0 0; border: 1px solid ${this.activeTab === 'bom' ? '#10b981' : 'transparent'}; border-bottom: none; background: ${this.activeTab === 'bom' ? '#0f172a' : 'transparent'}; color: ${this.activeTab === 'bom' ? '#10b981' : '#94a3b8'}; cursor: pointer; white-space: nowrap; transition: all 0.15s;">
            <span>📦</span> Costed BOM
          </button>

          <span style="display: inline-block; width: 1px; height: 20px; background: #334155; margin: auto 4px;"></span>

          ${boqState.items.map(it => {
            const isTabActive = this.activeTab === it.itemNo;
            const itemColor = this.getItemColor(it.itemNo);
            return `
              <button class="boq-tab-btn ${isTabActive ? 'active' : ''}" data-boq-tab="${it.itemNo}" title="${escapeHtml(it.description)}" style="display: flex; align-items: center; gap: 6px; padding: 8px 12px; font-size: 11px; font-weight: 500; border-radius: 6px 6px 0 0; border: 1px solid ${isTabActive ? itemColor : 'transparent'}; border-bottom: none; background: ${isTabActive ? '#0f172a' : 'transparent'}; color: ${isTabActive ? '#fff' : '#94a3b8'}; cursor: pointer; white-space: nowrap; transition: all 0.15s;">
                <span class="badge" style="font-size: 10px; padding: 1px 5px; background: ${itemColor}; color: #000; font-weight: bold; border-radius: 3px;">${it.itemNo}</span>
                <span>${this.getItemShortTitle(it.itemNo)}</span>
              </button>
            `;
          }).join('')}
        </nav>

        <!-- ACTIVE TAB CONTENT BODY -->
        <div class="boq-tab-content-area" style="flex: 1; overflow-y: auto;">
          ${this.renderActiveTabContent(boqState, totals)}
        </div>

      </div>
    `;

    this.attachEventListeners();
  }

  private renderActiveTabContent(
    boqState: ReturnType<ProjectStore['getBoqState']>,
    totals: ReturnType<typeof getBoqProjectTotal>
  ): string {
    if (this.activeTab === 'boq') {
      return this.renderBoqSummaryTab(boqState, totals);
    }
    if (this.activeTab === 'bom') {
      return this.renderCostedBomTab(boqState);
    }
    const item = boqState.items.find(it => it.itemNo === this.activeTab);
    if (item) {
      return this.renderDedicatedDupaTab(item, boqState.items);
    }
    return this.renderBoqSummaryTab(boqState, totals);
  }

  // ========================================================
  // TAB 1: BILL OF QUANTITIES (BOQ) SUMMARY TABLE
  // ========================================================
  private renderBoqSummaryTab( boqState: ReturnType<ProjectStore['getBoqState']>, totals: ReturnType<typeof getBoqProjectTotal> ) : string {
    return renderBoqSummaryTabImpl.call(this, boqState, totals);
  }

  // ========================================================
  // TAB 2: COSTED BILL OF MATERIALS (BOM)
  // ========================================================
  renderCostedBomTab(boqState: ReturnType<ProjectStore['getBoqState']>) : string {
    return renderCostedBomTabImpl.call(this, boqState);
  }

  // ========================================================
  // TAB 3-11: DEDICATED DUPA WORK ITEM SHEET
  // ========================================================
  private renderDedicatedDupaTab(it: DupaWorkItem, allItems: DupaWorkItem[]) : string {
    return renderDedicatedDupaTabImpl.call(this, it, allItems);
  }

  // ========================================================
  // EVENT LISTENERS & IN-PLACE DUPA EDITING
  // ========================================================
  attachEventListeners() : void {
    return attachEventListenersImpl.call(this);
  }
}
