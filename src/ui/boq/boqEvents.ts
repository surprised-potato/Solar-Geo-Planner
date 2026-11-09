/**
 * Event wiring for the BOQ & DUPA workspace (tab switching, edits, CSV exports).
 */
import { exportBoqAndDupaCsv, exportCostedBomCsv, normalizeDupaQuotes } from '../../geo/boqCalculator';
import { downloadBlob, downloadCsv, safeFileName } from '../../utils/download';
import { buildBoqXlsx } from '../../geo/boq/xlsxExport';
import { attachRatesTabListeners } from './ratesTab';
import type { BoqAndDupaUI } from '../boqView';

// ========================================================
// EVENT LISTENERS & IN-PLACE DUPA EDITING
// ========================================================
export function attachEventListeners(this: BoqAndDupaUI): void {
  // 1. Tab Bar Navigation
  this.container.querySelectorAll('.boq-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-boq-tab');
      if (tab) {
        this.setActiveTab(tab);
      }
    });
  });

  attachRatesTabListeners.call(this);

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
    const csv = exportBoqAndDupaCsv(this.store.projectName, boq, this.store.sections);
    downloadCsv(csv, `${safeFileName(this.store.projectName)}_BOQ_and_DUPA_${Date.now()}.csv`);
  });

  // 8b. Export BOQ, BOM and DUPA sheets as an Excel workbook
  this.container.querySelector('#boq-btn-export-xlsx')?.addEventListener('click', () => {
    const boq = this.store.getBoqState(this.currentSystemId);
    const bytes = buildBoqXlsx(this.store.projectName, boq, this.store.sections);
    downloadBlob(
      new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `${safeFileName(this.store.projectName)}_BOQ_BOM_DUPA_${Date.now()}.xlsx`
    );
  });

  // 9. Export BOM CSV
  const exportBomHandler = () => {
    const boq = this.store.getBoqState(this.currentSystemId);
    const csv = exportCostedBomCsv(this.store.projectName, boq);
    downloadCsv(csv, `${safeFileName(this.store.projectName)}_Costed_BOM_${Date.now()}.csv`);
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
