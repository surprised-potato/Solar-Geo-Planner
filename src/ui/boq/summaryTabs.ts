/**
 * BOQ summary and costed bill-of-materials tabs.
 */
import { ProjectStore } from '../../store/projectStore';
import { extractCostedBom, getBoqProjectTotal } from '../../geo/boqCalculator';
import { escapeHtml } from '../../utils/html';
import type { BoqAndDupaUI } from '../boqView';

// ========================================================
// TAB 1: BILL OF QUANTITIES (BOQ) SUMMARY TABLE
// ========================================================
export function renderBoqSummaryTab(this: BoqAndDupaUI, boqState: ReturnType<ProjectStore['getBoqState']>, totals: ReturnType<typeof getBoqProjectTotal>): string {
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
export function renderCostedBomTab(this: BoqAndDupaUI, boqState: ReturnType<ProjectStore['getBoqState']>): string {
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
