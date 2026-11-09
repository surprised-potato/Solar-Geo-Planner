import { ProjectStore } from '../store/projectStore';
import {
  exportBoqAndDupaCsv,
  exportCostedBomCsv,
  extractCostedBom,
  getBoqProjectTotal,
  normalizeDupaQuotes
} from '../geo/boqCalculator';
import { DupaWorkItem } from '../types/solar';
import { escapeHtml } from '../utils/html';

export type BoqViewTab = 'boq' | 'bom' | string;

export class BoqAndDupaUI {
  private container: HTMLElement;
  private store: ProjectStore;
  private currentSystemId: string = 'all';
  private activeTab: BoqViewTab = 'boq';
  private bomSearchQuery: string = '';
  private bomCategoryFilter: string = 'all';

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

  private getItemShortTitle(itemNo: string): string {
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

  private getItemColor(itemNo: string): string {
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
  private renderBoqSummaryTab(
    boqState: ReturnType<ProjectStore['getBoqState']>,
    totals: ReturnType<typeof getBoqProjectTotal>
  ): string {
    return `
      <div class="boq-section-panel" style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; overflow: hidden;">
        <div style="padding: 12px 16px; background: rgba(56, 189, 248, 0.08); border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between;">
          <h3 style="margin: 0; font-size: 14px; font-weight: bold; color: #38bdf8; display: flex; align-items: center; gap: 8px;">
            <span>📋</span> BILL OF QUANTITIES (BOQ) — PROJECT SCHEDULE OF VALUES
          </h3>
          <span style="font-size: 11px; color: #94a3b8;">Click any item row to open its full Detailed Unit Price Analysis (DUPA) sheet</span>
        </div>

        <div class="table-wrapper" style="overflow-x: auto;">
          <table class="registry-table responsive-data-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background: rgba(255,255,255,0.02); border-bottom: 2px solid #334155; text-align: left;">
                <th style="padding: 10px 12px; width: 70px;">Item No.</th>
                <th style="padding: 10px 12px; width: 110px;">Category</th>
                <th style="padding: 10px 12px;">Work Description</th>
                <th style="padding: 10px 12px; text-align: right; width: 80px;">Quantity</th>
                <th style="padding: 10px 12px; width: 60px;">Unit</th>
                <th style="padding: 10px 12px; text-align: right; width: 140px;">Unit Cost (PHP)</th>
                <th style="padding: 10px 12px; text-align: right; width: 150px;">Total Cost (PHP)</th>
                <th style="padding: 10px 12px; text-align: center; width: 100px;">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr style="background: rgba(255,255,255,0.01); font-weight: bold; color: #38bdf8;">
                <td colspan="8" style="padding: 8px 12px;">Solar Works &amp; Balance of System (DPWH Standard Format)</td>
              </tr>
              ${boqState.items.map(it => {
                const itemColor = this.getItemColor(it.itemNo);
                return `
                  <tr class="boq-summary-row" data-item-no="${it.itemNo}" style="border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: background 0.15s;">
                    <td style="padding: 10px 12px; font-weight: bold; color: ${itemColor};">
                      <span class="badge" style="background: ${itemColor}; color: #000; font-size: 11px; padding: 2px 6px; font-weight: bold; border-radius: 4px;">${it.itemNo}</span>
                    </td>
                    <td style="padding: 10px 12px; color: #94a3b8;">${escapeHtml(it.category)}</td>
                    <td style="padding: 10px 12px; font-weight: 500;">
                      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span style="color: #f8fafc;">${escapeHtml(it.description)}</span>
                        ${it.itemNo === 'D12' ? `
                          <button class="btn btn-xs btn-outline btn-toggle-d12" style="padding: 1px 6px; font-size: 10px; border-radius: 4px; ${it.quantity > 0 ? 'border-color: #10b981; color: #10b981; background: rgba(16,185,129,0.1);' : 'border-color: #f59e0b; color: #f59e0b; background: rgba(245,158,11,0.1);'}" title="Toggle between Optional (Excluded from Base BOQ) and Included">
                            ${it.quantity > 0 ? '✓ Included' : '+ Optional (Click to Include)'}
                          </button>
                        ` : ''}
                      </div>
                      <small style="color: #64748b; font-size: 11px;">Duration: ${it.durationDays} days &bull; Materials: ${it.materials.length} line items</small>
                    </td>
                    <td style="padding: 10px 12px; text-align: right; font-weight: bold;">${it.quantity.toLocaleString()}</td>
                    <td style="padding: 10px 12px; color: #cbd5e1;">${it.unit}</td>
                    <td style="padding: 10px 12px; text-align: right; font-family: monospace;">₱${it.unitCostPerItemPhp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #10b981; font-family: monospace; font-size: 13px;">₱${it.totalItemCostPhp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="padding: 10px 12px; text-align: center;">
                      <button class="btn btn-xs btn-outline btn-jump-dupa" data-item-no="${it.itemNo}" style="padding: 3px 8px; font-size: 11px; border-color: ${itemColor}; color: ${itemColor};" title="Inspect full breakdown for ${it.itemNo}">
                        🔬 View DUPA
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
              <tr style="background: rgba(56, 189, 248, 0.05); border-top: 2px solid #334155; font-weight: bold;">
                <td colspan="6" style="padding: 12px; text-align: right; font-size: 13px;">Subtotal (Solar Works):</td>
                <td style="padding: 12px; text-align: right; color: #38bdf8; font-family: monospace; font-size: 14px;">₱${totals.subtotalSolarWorks.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td></td>
              </tr>
              <tr style="background: rgba(16, 185, 129, 0.1); border-top: 2px solid #10b981; font-weight: bold; font-size: 13px;">
                <td colspan="6" style="padding: 14px 12px; text-align: right; color: #10b981;">GRAND TOTAL PROJECT ESTIMATE:</td>
                <td style="padding: 14px 12px; text-align: right; color: #10b981; font-family: monospace; font-size: 16px;">₱${totals.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ========================================================
  // TAB 2: COSTED BILL OF MATERIALS (BOM)
  // ========================================================
  private renderCostedBomTab(boqState: ReturnType<ProjectStore['getBoqState']>): string {
    const allBom = extractCostedBom(boqState);
    const query = this.bomSearchQuery.trim().toLowerCase();

    const filteredBom = allBom.filter(item => {
      const matchSearch = !query ||
        item.description.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.dupaItemNo.toLowerCase().includes(query) ||
        item.itemNo.toLowerCase().includes(query);
      const matchCategory = this.bomCategoryFilter === 'all' || item.category === this.bomCategoryFilter;
      return matchSearch && matchCategory;
    });

    const categories = Array.from(new Set(allBom.map(i => i.category))).sort();
    const filteredTotalAmount = filteredBom.reduce((sum, i) => sum + i.amountPhp, 0);
    const totalMaterialsAll = allBom.reduce((sum, i) => sum + i.amountPhp, 0);

    return `
      <div class="bom-section-panel" style="display: flex; flex-direction: column; gap: 12px;">
        <!-- BOM Control Bar -->
        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 10px 14px;">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="font-size: 12px; color: #94a3b8;">🔍 Search:</span>
              <input type="search" id="bom-search-input" value="${escapeHtml(this.bomSearchQuery)}" placeholder="Filter material description, category..." style="padding: 4px 8px; font-size: 11px; background: #1e293b; color: #fff; border: 1px solid #475569; border-radius: 4px; width: 220px;" />
            </div>

            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="font-size: 12px; color: #94a3b8;">Category:</span>
              <select id="bom-category-select" style="padding: 4px 8px; font-size: 11px; background: #1e293b; color: #fff; border: 1px solid #475569; border-radius: 4px;">
                <option value="all" ${this.bomCategoryFilter === 'all' ? 'selected' : ''}>All Categories (${allBom.length} items)</option>
                ${categories.map(cat => `<option value="${cat}" ${this.bomCategoryFilter === cat ? 'selected' : ''}>${cat}</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="font-size: 12px; color: #cbd5e1;">
              Total: <strong style="color: #10b981; font-family: monospace;">₱${filteredTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              ${this.bomCategoryFilter !== 'all' || query ? `<small style="color: #64748b;"> of ₱${totalMaterialsAll.toLocaleString()}</small>` : ''}
            </div>
            <button id="bom-btn-export-csv" class="btn btn-xs btn-outline" style="border-color: #10b981; color: #10b981; padding: 4px 10px; font-weight: 600;">
              <span>📥</span> Export BOM CSV
            </button>
          </div>
        </div>

        <!-- BOM Table -->
        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; overflow: hidden;">
          <div class="table-wrapper" style="overflow-x: auto;">
            <table class="registry-table responsive-data-table" style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <thead>
                <tr style="background: rgba(255,255,255,0.02); border-bottom: 2px solid #334155; text-align: left;">
                  <th style="padding: 8px 10px; width: 50px;">Tag</th>
                  <th style="padding: 8px 10px; width: 140px;">Category</th>
                  <th style="padding: 8px 10px;">Material Description</th>
                  <th style="padding: 8px 10px; width: 110px;">DUPA Work Item</th>
                  <th style="padding: 8px 10px; text-align: right; width: 80px;">Quantity</th>
                  <th style="padding: 8px 10px; width: 50px;">Unit</th>
                  <th style="padding: 8px 10px; text-align: right; width: 110px;">Unit Cost (PHP)</th>
                  <th style="padding: 8px 10px; text-align: right; width: 130px;">Amount (PHP)</th>
                  <th style="padding: 8px 10px; text-align: center; width: 70px;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${filteredBom.length === 0 ? `
                  <tr><td colspan="9" style="padding: 24px; text-align: center; color: #64748b;">No materials match the filter criteria.</td></tr>
                ` : filteredBom.map(item => {
                  const itemColor = this.getItemColor(item.dupaItemNo);
                  return `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.12s;">
                      <td style="padding: 6px 10px; font-weight: bold; color: #94a3b8; font-family: monospace;">${item.itemNo}</td>
                      <td style="padding: 6px 10px; color: #cbd5e1; font-size: 11px;">
                        <span style="display: inline-block; padding: 1px 6px; background: rgba(255,255,255,0.05); border-radius: 3px;">${escapeHtml(item.category)}</span>
                      </td>
                      <td style="padding: 6px 10px; font-weight: 500; color: #f8fafc;">${escapeHtml(item.description)}</td>
                      <td style="padding: 6px 10px;">
                        <button class="btn btn-xs btn-outline btn-jump-dupa" data-item-no="${item.dupaItemNo}" style="padding: 1px 6px; font-size: 10px; border-color: ${itemColor}; color: ${itemColor};" title="Jump to ${item.dupaItemNo} DUPA sheet">
                          ${item.dupaItemNo}
                        </button>
                      </td>
                      <td style="padding: 6px 10px; text-align: right; font-weight: bold;">${item.quantity.toLocaleString()}</td>
                      <td style="padding: 6px 10px; color: #94a3b8;">${item.unit}</td>
                      <td style="padding: 6px 10px; text-align: right; font-family: monospace;">₱${item.unitCostPhp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style="padding: 6px 10px; text-align: right; font-weight: bold; color: #10b981; font-family: monospace;">₱${item.amountPhp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style="padding: 6px 10px; text-align: center;">
                        <button class="btn btn-xs btn-outline btn-jump-dupa" data-item-no="${item.dupaItemNo}" style="padding: 2px 6px; font-size: 10px;">
                          Inspect
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ========================================================
  // TAB 3-11: DEDICATED DUPA WORK ITEM SHEET
  // ========================================================
  private renderDedicatedDupaTab(it: DupaWorkItem, allItems: DupaWorkItem[]): string {
    const itemColor = this.getItemColor(it.itemNo);
    const currIdx = allItems.findIndex(x => x.itemNo === it.itemNo);
    const prevItem = currIdx > 0 ? allItems[currIdx - 1] : null;
    const nextItem = currIdx >= 0 && currIdx < allItems.length - 1 ? allItems[currIdx + 1] : null;

    return `
      <div class="dupa-dedicated-sheet" style="display: flex; flex-direction: column; gap: 14px;">
        
        ${it.itemNo === 'D12' ? `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 8px; background: ${it.quantity > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)'}; border: 1px solid ${it.quantity > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'};">
            <div>
              <strong style="color: ${it.quantity > 0 ? '#10b981' : '#f59e0b'}; display: flex; align-items: center; gap: 6px; font-size: 13px;">
                <span>⚡</span> Scope Option: Grounding &amp; Lightning Protection System
              </strong>
              <p style="margin: 3px 0 0; font-size: 11px; color: #94a3b8;">
                ${it.quantity > 0
                  ? 'This item is currently INCLUDED in the base contract estimate (quantity = 1 system).'
                  : 'This item is currently OPTIONAL / EXCLUDED from base BOQ (facility has existing earthing grid / LPS). Note: Dedicated DC-side earthing rod and bonding remain active under Item D6.'}
              </p>
            </div>
            <button class="btn btn-xs btn-toggle-d12" style="background: ${it.quantity > 0 ? '#f59e0b' : '#10b981'}; color: #000; font-weight: bold; padding: 5px 12px; border-radius: 4px; cursor: pointer; white-space: nowrap; margin-left: 12px;">
              ${it.quantity > 0 ? 'Exclude from Base BOQ' : 'Include in Base BOQ'}
            </button>
          </div>
        ` : ''}

        <!-- Sheet Header Banner -->
        <div style="background: #0f172a; border: 1px solid ${itemColor}40; border-top: 4px solid ${itemColor}; border-radius: 8px; padding: 14px 16px;">
          <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span class="badge" style="font-size: 16px; padding: 4px 12px; background: ${itemColor}; color: #000; font-weight: bold; border-radius: 6px;">
                ${it.itemNo}
              </span>
              <div>
                <h3 style="margin: 0; font-size: 16px; font-weight: bold; color: #f8fafc;">${escapeHtml(it.description)}</h3>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 3px;">
                  Category: <strong style="color: #cbd5e1;">${escapeHtml(it.category)}</strong> &bull; DPWH Detailed Unit Price Analysis Sheet
                </div>
              </div>
            </div>

            <!-- Header Quick Metrics -->
            <div style="display: flex; align-items: center; gap: 14px; background: rgba(0,0,0,0.3); padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
              <div style="text-align: right;">
                <span style="font-size: 10px; color: #94a3b8; display: block;">DIRECT COST (EDC)</span>
                <strong style="color: #f59e0b; font-family: monospace; font-size: 13px;">₱${it.estimatedDirectCostPhp.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
              </div>
              <div style="width: 1px; height: 24px; background: #334155;"></div>
              <div style="text-align: right;">
                <span style="font-size: 10px; color: #94a3b8; display: block;">UNIT COST</span>
                <strong style="color: #38bdf8; font-family: monospace; font-size: 13px;">₱${it.unitCostPerItemPhp.toLocaleString('en-US', { minimumFractionDigits: 2 })} / ${it.unit}</strong>
              </div>
              <div style="width: 1px; height: 24px; background: #334155;"></div>
              <div style="text-align: right;">
                <span style="font-size: 10px; color: #94a3b8; display: block;">TOTAL ITEM COST</span>
                <strong style="color: #10b981; font-family: monospace; font-size: 15px;">₱${it.totalItemCostPhp.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
              </div>
            </div>
          </div>

          <!-- Parameter Attributes Controls -->
          <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 11px;">
            <label style="display: flex; align-items: center; gap: 4px;">
              <span style="color: #94a3b8;">Work Description:</span>
              <input type="text" class="input-tbl-text input-dupa-desc" data-item-no="${it.itemNo}" value="${escapeHtml(it.description)}" style="width: 320px; font-weight: 600;" />
            </label>
            <label style="display: flex; align-items: center; gap: 4px;">
              <span style="color: #94a3b8;">Duration (days):</span>
              <input type="number" class="input-tbl-num input-dupa-duration" data-item-no="${it.itemNo}" value="${it.durationDays}" min="0" max="365" style="width: 50px;" />
            </label>
            <label style="display: flex; align-items: center; gap: 4px;">
              <span style="color: #94a3b8;">Work Quantity:</span>
              <input type="number" class="input-tbl-num input-dupa-qty" data-item-no="${it.itemNo}" value="${it.quantity}" min="0" step="1" style="width: 70px;" />
            </label>
            <label style="display: flex; align-items: center; gap: 4px;">
              <span style="color: #94a3b8;">Unit:</span>
              <input type="text" class="input-tbl-text input-dupa-unit" data-item-no="${it.itemNo}" value="${escapeHtml(it.unit)}" style="width: 50px;" />
            </label>
          </div>
        </div>

        <!-- BREAKDOWN SECTION A: MATERIALS -->
        <div class="dupa-subtable-block" style="background: #0f172a; border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; overflow: hidden;">
          <div style="padding: 8px 14px; background: rgba(56, 189, 248, 0.08); display: flex; align-items: center; justify-content: space-between;">
            <strong style="font-size: 12px; color: #38bdf8; display: flex; align-items: center; gap: 6px;">
              <span>📦</span> A. MATERIALS BREAKDOWN
            </strong>
            <button class="btn btn-xs btn-outline btn-add-material" data-item-no="${it.itemNo}" style="padding: 2px 8px; font-size: 11px; border-color: #38bdf8; color: #38bdf8;">
              + Add Material
            </button>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="border-bottom: 1px solid #1e293b; color: #94a3b8; text-align: left; background: rgba(255,255,255,0.01);">
                <th style="padding: 8px 10px;">Material Description</th>
                <th style="padding: 8px 10px; width: 90px; text-align: right;">Quantity</th>
                <th style="padding: 8px 10px; width: 60px;">Unit</th>
                <th style="padding: 8px 10px; width: 120px; text-align: right;">Unit Cost (PHP)</th>
                <th style="padding: 8px 10px; width: 130px; text-align: right;">Amount (PHP)</th>
                <th style="padding: 8px 10px; width: 40px; text-align: center;"></th>
              </tr>
            </thead>
            <tbody>
              ${it.materials.length === 0 ? `<tr><td colspan="6" style="padding: 10px; color: #64748b; font-style: italic;">No direct materials required for this work item.</td></tr>` : it.materials.map((m, mIdx) => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                  <td style="padding: 6px 10px;">
                    <input type="text" class="input-tbl-text input-mat-desc" data-item-no="${it.itemNo}" data-row-idx="${mIdx}" value="${escapeHtml(m.description)}" style="width: 100%;" />
                  </td>
                  <td style="padding: 6px 10px; text-align: right;">
                    <input type="number" class="input-tbl-num input-mat-qty" data-item-no="${it.itemNo}" data-row-idx="${mIdx}" value="${m.quantity}" step="any" min="0" style="width: 80px; text-align: right;" />
                  </td>
                  <td style="padding: 6px 10px;">
                    <input type="text" class="input-tbl-text input-mat-unit" data-item-no="${it.itemNo}" data-row-idx="${mIdx}" value="${escapeHtml(m.unit)}" style="width: 50px;" />
                  </td>
                  <td style="padding: 6px 10px; text-align: right;">
                    <input type="number" class="input-tbl-num input-mat-cost" data-item-no="${it.itemNo}" data-row-idx="${mIdx}" value="${m.unitCostPhp}" step="any" min="0" style="width: 100px; text-align: right; font-family: monospace;" />
                  </td>
                  <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-weight: bold; color: #f8fafc;">
                    ₱${m.amountPhp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style="padding: 6px 10px; text-align: center;">
                    <button class="btn btn-xs btn-outline danger btn-del-material" data-item-no="${it.itemNo}" data-row-idx="${mIdx}" style="padding: 0 4px; font-size: 10px;" title="Delete material row">✕</button>
                  </td>
                </tr>
              `).join('')}
              <tr style="background: rgba(56, 189, 248, 0.05); font-weight: bold; border-top: 1px solid #334155;">
                <td colspan="4" style="padding: 8px 10px; text-align: right; color: #cbd5e1;">Subtotal Materials (A):</td>
                <td style="padding: 8px 10px; text-align: right; color: #38bdf8; font-family: monospace; font-size: 12px;">₱${it.totalMaterialsPhp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- BREAKDOWN SECTION B: LABOR -->
        <div class="dupa-subtable-block" style="background: #0f172a; border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 8px; overflow: hidden;">
          <div style="padding: 8px 14px; background: rgba(245, 158, 11, 0.08); display: flex; align-items: center; justify-content: space-between;">
            <strong style="font-size: 12px; color: #f59e0b; display: flex; align-items: center; gap: 6px;">
              <span>👷</span> B. LABOR BREAKDOWN
            </strong>
            <button class="btn btn-xs btn-outline btn-add-labor" data-item-no="${it.itemNo}" style="padding: 2px 8px; font-size: 11px; border-color: #f59e0b; color: #f59e0b;">
              + Add Labor
            </button>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="border-bottom: 1px solid #1e293b; color: #94a3b8; text-align: left; background: rgba(255,255,255,0.01);">
                <th style="padding: 8px 10px;">Trade / Role Description</th>
                <th style="padding: 8px 10px; width: 70px; text-align: right;">No.</th>
                <th style="padding: 8px 10px; width: 70px; text-align: right;">Days</th>
                <th style="padding: 8px 10px; width: 60px;">Unit</th>
                <th style="padding: 8px 10px; width: 120px; text-align: right;">Rate/Day (PHP)</th>
                <th style="padding: 8px 10px; width: 130px; text-align: right;">Amount (PHP)</th>
                <th style="padding: 8px 10px; width: 40px; text-align: center;"></th>
              </tr>
            </thead>
            <tbody>
              ${it.labor.length === 0 ? `<tr><td colspan="7" style="padding: 10px; color: #64748b; font-style: italic;">No direct labor specified for this work item.</td></tr>` : it.labor.map((l, lIdx) => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                  <td style="padding: 6px 10px;">
                    <input type="text" class="input-tbl-text input-lab-desc" data-item-no="${it.itemNo}" data-row-idx="${lIdx}" value="${escapeHtml(l.description)}" style="width: 100%;" />
                  </td>
                  <td style="padding: 6px 10px; text-align: right;">
                    <input type="number" class="input-tbl-num input-lab-count" data-item-no="${it.itemNo}" data-row-idx="${lIdx}" value="${l.count}" min="1" style="width: 55px; text-align: right;" />
                  </td>
                  <td style="padding: 6px 10px; text-align: right;">
                    <input type="number" class="input-tbl-num input-lab-days" data-item-no="${it.itemNo}" data-row-idx="${lIdx}" value="${l.days}" min="1" style="width: 55px; text-align: right;" />
                  </td>
                  <td style="padding: 6px 10px;">
                    <input type="text" class="input-tbl-text input-lab-unit" data-item-no="${it.itemNo}" data-row-idx="${lIdx}" value="${escapeHtml(l.unit)}" style="width: 44px;" />
                  </td>
                  <td style="padding: 6px 10px; text-align: right;">
                    <input type="number" class="input-tbl-num input-lab-rate" data-item-no="${it.itemNo}" data-row-idx="${lIdx}" value="${l.ratePerDayPhp}" step="50" min="0" style="width: 100px; text-align: right; font-family: monospace;" />
                  </td>
                  <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-weight: bold; color: #f8fafc;">
                    ₱${l.amountPhp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style="padding: 6px 10px; text-align: center;">
                    <button class="btn btn-xs btn-outline danger btn-del-labor" data-item-no="${it.itemNo}" data-row-idx="${lIdx}" style="padding: 0 4px; font-size: 10px;" title="Delete labor row">✕</button>
                  </td>
                </tr>
              `).join('')}
              <tr style="background: rgba(245, 158, 11, 0.05); font-weight: bold; border-top: 1px solid #334155;">
                <td colspan="5" style="padding: 8px 10px; text-align: right; color: #cbd5e1;">Subtotal Labor (B):</td>
                <td style="padding: 8px 10px; text-align: right; color: #f59e0b; font-family: monospace; font-size: 12px;">₱${it.totalLaborPhp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- BREAKDOWN SECTION C: EQUIPMENT -->
        <div class="dupa-subtable-block" style="background: #0f172a; border: 1px solid rgba(139, 92, 246, 0.25); border-radius: 8px; overflow: hidden;">
          <div style="padding: 8px 14px; background: rgba(139, 92, 246, 0.08); display: flex; align-items: center; justify-content: space-between;">
            <strong style="font-size: 12px; color: #c4b5fd; display: flex; align-items: center; gap: 6px;">
              <span>🚜</span> C. EQUIPMENT BREAKDOWN
            </strong>
            <button class="btn btn-xs btn-outline btn-add-equip" data-item-no="${it.itemNo}" style="padding: 2px 8px; font-size: 11px; border-color: #c4b5fd; color: #c4b5fd;">
              + Add Equipment
            </button>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="border-bottom: 1px solid #1e293b; color: #94a3b8; text-align: left; background: rgba(255,255,255,0.01);">
                <th style="padding: 8px 10px;">Equipment Description</th>
                <th style="padding: 8px 10px; width: 70px; text-align: right;">No.</th>
                <th style="padding: 8px 10px; width: 70px; text-align: right;">Days</th>
                <th style="padding: 8px 10px; width: 60px;">Unit</th>
                <th style="padding: 8px 10px; width: 120px; text-align: right;">Rate/Day (PHP)</th>
                <th style="padding: 8px 10px; width: 130px; text-align: right;">Amount (PHP)</th>
                <th style="padding: 8px 10px; width: 40px; text-align: center;"></th>
              </tr>
            </thead>
            <tbody>
              ${it.equipment.length === 0 ? `<tr><td colspan="7" style="padding: 10px; color: #64748b; font-style: italic;">No heavy equipment rented for this work item.</td></tr>` : it.equipment.map((e, eIdx) => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                  <td style="padding: 6px 10px;">
                    <input type="text" class="input-tbl-text input-eq-desc" data-item-no="${it.itemNo}" data-row-idx="${eIdx}" value="${escapeHtml(e.description)}" style="width: 100%;" />
                  </td>
                  <td style="padding: 6px 10px; text-align: right;">
                    <input type="number" class="input-tbl-num input-eq-count" data-item-no="${it.itemNo}" data-row-idx="${eIdx}" value="${e.count}" min="1" style="width: 55px; text-align: right;" />
                  </td>
                  <td style="padding: 6px 10px; text-align: right;">
                    <input type="number" class="input-tbl-num input-eq-days" data-item-no="${it.itemNo}" data-row-idx="${eIdx}" value="${e.days}" min="1" style="width: 55px; text-align: right;" />
                  </td>
                  <td style="padding: 6px 10px;">
                    <input type="text" class="input-tbl-text input-eq-unit" data-item-no="${it.itemNo}" data-row-idx="${eIdx}" value="${escapeHtml(e.unit)}" style="width: 44px;" />
                  </td>
                  <td style="padding: 6px 10px; text-align: right;">
                    <input type="number" class="input-tbl-num input-eq-rate" data-item-no="${it.itemNo}" data-row-idx="${eIdx}" value="${e.ratePerDayPhp}" step="50" min="0" style="width: 100px; text-align: right; font-family: monospace;" />
                  </td>
                  <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-weight: bold; color: #f8fafc;">
                    ₱${e.amountPhp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style="padding: 6px 10px; text-align: center;">
                    <button class="btn btn-xs btn-outline danger btn-del-equip" data-item-no="${it.itemNo}" data-row-idx="${eIdx}" style="padding: 0 4px; font-size: 10px;" title="Delete equipment row">✕</button>
                  </td>
                </tr>
              `).join('')}
              <tr style="background: rgba(139, 92, 246, 0.05); font-weight: bold; border-top: 1px solid #334155;">
                <td colspan="5" style="padding: 8px 10px; text-align: right; color: #cbd5e1;">Subtotal Equipment (C):</td>
                <td style="padding: 8px 10px; text-align: right; color: #c4b5fd; font-family: monospace; font-size: 12px;">₱${it.totalEquipmentPhp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- DUPA RATE CALCULATION & INDIRECTS SUMMARY CARD -->
        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 14px 16px;">
          <h4 style="margin: 0 0 10px 0; font-size: 13px; font-weight: bold; color: #38bdf8;">
            🧮 DUPA SUMMARY &amp; INDIRECT MARKUPS (DPWH FORMAT)
          </h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; font-size: 12px;">
            <div style="padding: 8px 12px; background: rgba(255,255,255,0.02); border-radius: 6px;">
              <div style="color: #94a3b8; font-size: 11px;">Estimated Direct Cost (EDC = A + B + C)</div>
              <div style="font-size: 16px; font-weight: bold; color: #f59e0b; font-family: monospace; margin-top: 2px;">
                ₱${it.estimatedDirectCostPhp.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div style="padding: 8px 12px; background: rgba(255,255,255,0.02); border-radius: 6px;">
              <div style="color: #94a3b8; font-size: 11px;">OCM (${it.ocmPercent.toFixed(1)}% of EDC)</div>
              <div style="font-size: 15px; font-weight: 600; color: #cbd5e1; font-family: monospace; margin-top: 2px;">
                ₱${it.ocmAmountPhp.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div style="padding: 8px 12px; background: rgba(255,255,255,0.02); border-radius: 6px;">
              <div style="color: #94a3b8; font-size: 11px;">Contractor Profit (${it.profitPercent.toFixed(1)}% of EDC)</div>
              <div style="font-size: 15px; font-weight: 600; color: #cbd5e1; font-family: monospace; margin-top: 2px;">
                ₱${it.profitAmountPhp.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div style="padding: 8px 12px; background: rgba(255,255,255,0.02); border-radius: 6px;">
              <div style="color: #94a3b8; font-size: 11px;">VAT (${it.vatPercent.toFixed(1)}% of EDC + OCM + Profit)</div>
              <div style="font-size: 15px; font-weight: 600; color: #cbd5e1; font-family: monospace; margin-top: 2px;">
                ₱${it.vatAmountPhp.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div style="padding: 8px 12px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px;">
              <div style="color: #10b981; font-size: 11px; font-weight: bold;">TOTAL ITEM COST</div>
              <div style="font-size: 18px; font-weight: bold; color: #10b981; font-family: monospace; margin-top: 2px;">
                ₱${it.totalItemCostPhp.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div style="padding: 8px 12px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px;">
              <div style="color: #38bdf8; font-size: 11px; font-weight: bold;">UNIT COST PER ${it.unit.toUpperCase()}</div>
              <div style="font-size: 18px; font-weight: bold; color: #38bdf8; font-family: monospace; margin-top: 2px;">
                ₱${it.unitCostPerItemPhp.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        <!-- Sheet Footer Pagination -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 8px;">
          ${prevItem ? `
            <button class="btn btn-sm btn-outline btn-jump-dupa" data-item-no="${prevItem.itemNo}" style="display: flex; align-items: center; gap: 6px;">
              <span>←</span> Previous: ${prevItem.itemNo} (${this.getItemShortTitle(prevItem.itemNo)})
            </button>
          ` : `<div></div>`}

          <button class="btn btn-sm btn-secondary btn-jump-dupa" data-item-no="boq" style="display: flex; align-items: center; gap: 6px; font-weight: 600;">
            <span>📋</span> Return to BOQ Summary
          </button>

          ${nextItem ? `
            <button class="btn btn-sm btn-outline btn-jump-dupa" data-item-no="${nextItem.itemNo}" style="display: flex; align-items: center; gap: 6px;">
              Next: ${nextItem.itemNo} (${this.getItemShortTitle(nextItem.itemNo)}) <span>→</span>
            </button>
          ` : `<div></div>`}
        </div>

      </div>
    `;
  }

  // ========================================================
  // EVENT LISTENERS & IN-PLACE DUPA EDITING
  // ========================================================
  private attachEventListeners(): void {
    // 1. Tab Bar Navigation
    this.container.querySelectorAll('.boq-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-boq-tab');
        if (tab) {
          this.setActiveTab(tab);
        }
      });
    });

    // 2. Jump to DUPA or BOQ
    this.container.querySelectorAll('.btn-jump-dupa').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemNo = btn.getAttribute('data-item-no');
        if (itemNo) {
          this.setActiveTab(itemNo);
        }
      });
    });

    // 3. Row click on BOQ Summary Table
    this.container.querySelectorAll('.boq-summary-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'BUTTON') return;
        const itemNo = row.getAttribute('data-item-no');
        if (itemNo) {
          this.setActiveTab(itemNo);
        }
      });
    });

    // 4. System Selector
    const sysSelect = this.container.querySelector('#boq-system-select') as HTMLSelectElement;
    sysSelect?.addEventListener('change', () => {
      this.setSystem(sysSelect.value);
    });

    // 5. Markups Apply
    this.container.querySelector('#boq-btn-apply-markups')?.addEventListener('click', () => {
      const ocm = parseFloat((this.container.querySelector('#boq-input-ocm') as HTMLInputElement)?.value) || 10;
      const profit = parseFloat((this.container.querySelector('#boq-input-profit') as HTMLInputElement)?.value) || 8;
      const vat = parseFloat((this.container.querySelector('#boq-input-vat') as HTMLInputElement)?.value) || 6;
      this.store.updateBoqMarkups(ocm, profit, vat);
      this.render();
    });

    // 6. Sync from CAD & SLD
    this.container.querySelector('#boq-btn-sync-cad')?.addEventListener('click', () => {
      this.store.syncBoqFromCad(this.currentSystemId, false);
      this.render();
    });

    // 6b. Toggle Optional Lightning & Grounding (D12)
    this.container.querySelectorAll('#boq-btn-toggle-lightning, .btn-toggle-d12').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.store.toggleLightningProtection();
        this.render();
      });
    });

    // 7. Reset Benchmark Rates
    this.container.querySelector('#boq-btn-reset-rates')?.addEventListener('click', () => {
      if (confirm('Reset all DUPA material unit costs, labor daily rates, and equipment rates to standard DPWH benchmarks?')) {
        this.store.syncBoqFromCad(this.currentSystemId, true);
        this.render();
      }
    });

    // 8. Export BOQ & DUPA CSV
    this.container.querySelector('#boq-btn-export-csv')?.addEventListener('click', () => {
      const boq = this.store.getBoqState(this.currentSystemId);
      const csv = exportBoqAndDupaCsv(this.store.projectName, boq);
      this.triggerCsvDownload(csv, `${this.store.projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}_BOQ_and_DUPA_${Date.now()}.csv`);
    });

    // 9. Export BOM CSV
    const exportBomHandler = () => {
      const boq = this.store.getBoqState(this.currentSystemId);
      const csv = exportCostedBomCsv(this.store.projectName, boq);
      this.triggerCsvDownload(csv, `${this.store.projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Costed_BOM_${Date.now()}.csv`);
    };
    this.container.querySelector('#boq-btn-export-bom')?.addEventListener('click', exportBomHandler);
    this.container.querySelector('#bom-btn-export-csv')?.addEventListener('click', exportBomHandler);

    // 10. BOM Search & Category Filter
    const searchInput = this.container.querySelector('#bom-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      this.bomSearchQuery = searchInput.value;
      const contentEl = this.container.querySelector('.boq-tab-content-area');
      if (contentEl) {
        const boqState = this.store.getBoqState(this.currentSystemId);
        contentEl.innerHTML = this.renderCostedBomTab(boqState);
        this.attachEventListeners();
      }
    });

    const categorySelect = this.container.querySelector('#bom-category-select') as HTMLSelectElement;
    categorySelect?.addEventListener('change', () => {
      this.bomCategoryFilter = categorySelect.value;
      const contentEl = this.container.querySelector('.boq-tab-content-area');
      if (contentEl) {
        const boqState = this.store.getBoqState(this.currentSystemId);
        contentEl.innerHTML = this.renderCostedBomTab(boqState);
        this.attachEventListeners();
      }
    });

    // 11. In-place DUPA editing listeners
    this.container.querySelectorAll('.input-dupa-desc').forEach(input => {
      input.addEventListener('change', (e) => {
        const itemNo = (e.currentTarget as HTMLElement).getAttribute('data-item-no');
        if (itemNo) {
          const val = normalizeDupaQuotes((e.currentTarget as HTMLInputElement).value);
          this.store.updateDupaWorkItem(itemNo, (it) => ({ ...it, description: val }));
          this.render();
        }
      });
    });

    this.container.querySelectorAll('.input-dupa-duration').forEach(input => {
      input.addEventListener('change', (e) => {
        const itemNo = (e.currentTarget as HTMLElement).getAttribute('data-item-no');
        if (itemNo) {
          const val = parseInt((e.currentTarget as HTMLInputElement).value, 10) || 1;
          this.store.updateDupaWorkItem(itemNo, (it) => ({ ...it, durationDays: val }));
          this.render();
        }
      });
    });

    this.container.querySelectorAll('.input-dupa-qty').forEach(input => {
      input.addEventListener('change', (e) => {
        const itemNo = (e.currentTarget as HTMLElement).getAttribute('data-item-no');
        if (itemNo) {
          const parsed = parseFloat((e.currentTarget as HTMLInputElement).value);
          const val = isNaN(parsed) ? 0 : Math.max(0, parsed);
          this.store.updateDupaWorkItem(itemNo, (it) => ({ ...it, quantity: val }));
          this.render();
        }
      });
    });

    this.container.querySelectorAll('.input-dupa-unit').forEach(input => {
      input.addEventListener('change', (e) => {
        const itemNo = (e.currentTarget as HTMLElement).getAttribute('data-item-no');
        if (itemNo) {
          const val = normalizeDupaQuotes((e.currentTarget as HTMLInputElement).value);
          this.store.updateDupaWorkItem(itemNo, (it) => ({ ...it, unit: val }));
          this.render();
        }
      });
    });

    // 12. Materials Editing
    this.container.querySelectorAll('.input-mat-cost, .input-mat-qty, .input-mat-desc, .input-mat-unit').forEach(input => {
      input.addEventListener('change', (e) => {
        const target = e.currentTarget as HTMLInputElement;
        const itemNo = target.getAttribute('data-item-no');
        const rowIdx = parseInt(target.getAttribute('data-row-idx') || '0', 10);
        if (itemNo) {
          this.store.updateDupaWorkItem(itemNo, (it) => {
            const m = it.materials[rowIdx];
            if (m) {
              if (target.classList.contains('input-mat-cost')) m.unitCostPhp = parseFloat(target.value) || 0;
              if (target.classList.contains('input-mat-qty')) m.quantity = parseFloat(target.value) || 0;
              if (target.classList.contains('input-mat-desc')) m.description = normalizeDupaQuotes(target.value);
              if (target.classList.contains('input-mat-unit')) m.unit = normalizeDupaQuotes(target.value);
            }
            return it;
          });
          this.render();
        }
      });
    });

    // Delete Material
    this.container.querySelectorAll('.btn-del-material').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const itemNo = target.getAttribute('data-item-no');
        const rowIdx = parseInt(target.getAttribute('data-row-idx') || '0', 10);
        if (itemNo) {
          this.store.updateDupaWorkItem(itemNo, (it) => {
            it.materials.splice(rowIdx, 1);
            return it;
          });
          this.render();
        }
      });
    });

    // Add Material
    this.container.querySelectorAll('.btn-add-material').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemNo = (e.currentTarget as HTMLElement).getAttribute('data-item-no');
        if (itemNo) {
          this.store.updateDupaWorkItem(itemNo, (it) => {
            it.materials.push({
              id: `m_${Date.now()}`,
              description: 'New Material Item',
              quantity: 1,
              unit: 'set',
              unitCostPhp: 1000,
              amountPhp: 1000
            });
            return it;
          });
          this.render();
        }
      });
    });

    // 13. Labor Editing
    this.container.querySelectorAll('.input-lab-desc, .input-lab-count, .input-lab-days, .input-lab-unit, .input-lab-rate').forEach(input => {
      input.addEventListener('change', (e) => {
        const target = e.currentTarget as HTMLInputElement;
        const itemNo = target.getAttribute('data-item-no');
        const rowIdx = parseInt(target.getAttribute('data-row-idx') || '0', 10);
        if (itemNo) {
          this.store.updateDupaWorkItem(itemNo, (it) => {
            const l = it.labor[rowIdx];
            if (l) {
              if (target.classList.contains('input-lab-desc')) l.description = normalizeDupaQuotes(target.value);
              if (target.classList.contains('input-lab-count')) l.count = parseInt(target.value, 10) || 1;
              if (target.classList.contains('input-lab-days')) l.days = parseInt(target.value, 10) || 1;
              if (target.classList.contains('input-lab-unit')) l.unit = normalizeDupaQuotes(target.value);
              if (target.classList.contains('input-lab-rate')) l.ratePerDayPhp = parseFloat(target.value) || 0;
            }
            return it;
          });
          this.render();
        }
      });
    });

    // Delete Labor
    this.container.querySelectorAll('.btn-del-labor').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const itemNo = target.getAttribute('data-item-no');
        const rowIdx = parseInt(target.getAttribute('data-row-idx') || '0', 10);
        if (itemNo) {
          this.store.updateDupaWorkItem(itemNo, (it) => {
            it.labor.splice(rowIdx, 1);
            return it;
          });
          this.render();
        }
      });
    });

    // Add Labor
    this.container.querySelectorAll('.btn-add-labor').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemNo = (e.currentTarget as HTMLElement).getAttribute('data-item-no');
        if (itemNo) {
          this.store.updateDupaWorkItem(itemNo, (it) => {
            it.labor.push({
              id: `l_${Date.now()}`,
              description: 'Helper / Installer',
              count: 1,
              days: it.durationDays || 5,
              unit: 'pax',
              ratePerDayPhp: 500,
              amountPhp: 2500
            });
            return it;
          });
          this.render();
        }
      });
    });

    // 14. Equipment Editing
    this.container.querySelectorAll('.input-eq-desc, .input-eq-count, .input-eq-days, .input-eq-unit, .input-eq-rate').forEach(input => {
      input.addEventListener('change', (e) => {
        const target = e.currentTarget as HTMLInputElement;
        const itemNo = target.getAttribute('data-item-no');
        const rowIdx = parseInt(target.getAttribute('data-row-idx') || '0', 10);
        if (itemNo) {
          this.store.updateDupaWorkItem(itemNo, (it) => {
            const eq = it.equipment[rowIdx];
            if (eq) {
              if (target.classList.contains('input-eq-desc')) eq.description = normalizeDupaQuotes(target.value);
              if (target.classList.contains('input-eq-count')) eq.count = parseInt(target.value, 10) || 1;
              if (target.classList.contains('input-eq-days')) eq.days = parseInt(target.value, 10) || 1;
              if (target.classList.contains('input-eq-unit')) eq.unit = normalizeDupaQuotes(target.value);
              if (target.classList.contains('input-eq-rate')) eq.ratePerDayPhp = parseFloat(target.value) || 0;
            }
            return it;
          });
          this.render();
        }
      });
    });

    // Delete Equipment
    this.container.querySelectorAll('.btn-del-equip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const itemNo = target.getAttribute('data-item-no');
        const rowIdx = parseInt(target.getAttribute('data-row-idx') || '0', 10);
        if (itemNo) {
          this.store.updateDupaWorkItem(itemNo, (it) => {
            it.equipment.splice(rowIdx, 1);
            return it;
          });
          this.render();
        }
      });
    });

    // Add Equipment
    this.container.querySelectorAll('.btn-add-equip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemNo = (e.currentTarget as HTMLElement).getAttribute('data-item-no');
        if (itemNo) {
          this.store.updateDupaWorkItem(itemNo, (it) => {
            it.equipment.push({
              id: `e_${Date.now()}`,
              description: 'Installation Tools / Rig',
              count: 1,
              days: Math.max(1, Math.ceil((it.durationDays || 3) / 2)),
              unit: 'unit',
              ratePerDayPhp: 350,
              amountPhp: 350
            });
            return it;
          });
          this.render();
        }
      });
    });
  }

  private triggerCsvDownload(csvContent: string, fileName: string): void {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
