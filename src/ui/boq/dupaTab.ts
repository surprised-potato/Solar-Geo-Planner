/**
 * Detailed Unit Price Analysis (DUPA) tab: per-item materials, labor and equipment editor.
 */
import { DupaWorkItem } from '../../types/solar';
import { escapeHtml } from '../../utils/html';
import { templateNoOf } from '../../geo/boqCalculator';
import type { BoqAndDupaUI } from '../boqView';

// ========================================================
// TAB 3-11: DEDICATED DUPA WORK ITEM SHEET
// ========================================================
export function renderDedicatedDupaTab(this: BoqAndDupaUI, it: DupaWorkItem, allItems: DupaWorkItem[]): string {
  const itemColor = this.getItemColor(templateNoOf(it));
  const currIdx = allItems.findIndex(x => x.itemNo === it.itemNo);
  const prevItem = currIdx > 0 ? allItems[currIdx - 1] : null;
  const nextItem = currIdx >= 0 && currIdx < allItems.length - 1 ? allItems[currIdx + 1] : null;

  return `
    <div class="dupa-dedicated-sheet" style="display: flex; flex-direction: column; gap: 14px;">
      
      ${templateNoOf(it) === 'D12' ? `
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
