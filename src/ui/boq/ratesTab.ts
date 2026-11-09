/**
 * BOQ "Rates" tab: the project rate library. One price per material / trade / equipment,
 * applied to every farm and work item at once; CSV import/export for reuse across projects.
 */
import { ProjectStore } from '../../store/projectStore';
import { escapeHtml } from '../../utils/html';
import { extractRateLibrary, rateLibraryToCsv, RateKind } from '../../geo/boq/rateLibrary';
import { downloadCsv, safeFileName } from '../../utils/download';
import type { BoqAndDupaUI } from '../boqView';

const KIND_LABEL: Record<RateKind, string> = { material: '📦 Materials (₱/unit)', labor: '👷 Labor (₱/day)', equipment: '🚜 Equipment (₱/day)' };

export function renderRatesTab(this: BoqAndDupaUI, boqState: ReturnType<ProjectStore['getBoqState']>): string {
  const q = this.bomSearchQuery.trim().toLowerCase();
  const all = extractRateLibrary(boqState);
  const entries = q ? all.filter(e => e.description.toLowerCase().includes(q)) : all;
  const mixed = all.filter(e => e.mixed).length;

  const rows = (['material', 'labor', 'equipment'] as RateKind[])
    .map(kind => {
      const list = entries.filter(e => e.kind === kind);
      if (list.length === 0) return '';
      return `
        <tr style="background: rgba(255,255,255,0.03); font-weight: bold;"><td colspan="5" style="padding: 8px 12px;">${KIND_LABEL[kind]} — ${list.length}</td></tr>
        ${list.map(e => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 6px 12px;">${escapeHtml(e.description)}</td>
            <td style="padding: 6px 12px; color: #94a3b8;">${escapeHtml(e.unit)}</td>
            <td style="padding: 6px 12px; text-align: right;">${e.uses}</td>
            <td style="padding: 6px 12px; text-align: right;">
              <input type="number" class="input-tbl-num input-library-rate" data-kind="${kind}" data-desc="${escapeHtml(e.description)}" value="${e.rate}" min="0" step="any" style="width: 120px; text-align: right; font-family: monospace;" />
            </td>
            <td style="padding: 6px 12px;">${e.mixed ? `<span class="badge" style="background: #f59e0b; color: #000;" title="Rows currently differ: ${e.rate} to ${e.maxRate}">mixed</span>` : ''}</td>
          </tr>`).join('')}`;
    })
    .join('');

  return `
    <div class="boq-section-panel" style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; overflow: hidden;">
      <div style="padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
        <div>
          <strong style="color: #38bdf8;">💲 Project Rate Library</strong>
          <span style="font-size: 11px; color: #94a3b8; margin-left: 8px;">Edit a price once to update every farm and work item. ${mixed > 0 ? `${mixed} entries currently have different prices across rows.` : ''}</span>
        </div>
        <div style="display: flex; gap: 6px; align-items: center;">
          <input type="search" id="rates-search" class="input-text" placeholder="Search rates..." value="${escapeHtml(this.bomSearchQuery)}" style="width: 160px;" />
          <button id="rates-btn-export" class="btn btn-xs btn-outline">📥 Export CSV</button>
          <button id="rates-btn-import" class="btn btn-xs btn-outline">📤 Import CSV</button>
          <input type="file" id="rates-file" accept=".csv,text/csv" style="display: none;" />
        </div>
      </div>
      <div class="table-wrapper" style="overflow: auto; max-height: calc(85vh - 330px);">
        <table class="registry-table responsive-data-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead><tr style="text-align: left; border-bottom: 2px solid #334155;"><th style="padding: 8px 12px;">Description</th><th style="padding: 8px 12px; width: 70px;">Unit</th><th style="padding: 8px 12px; width: 60px; text-align: right;">Rows</th><th style="padding: 8px 12px; width: 150px; text-align: right;">Rate (PHP)</th><th style="width: 70px;"></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5" class="empty-table-cell">No rates match.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
}

export function attachRatesTabListeners(this: BoqAndDupaUI): void {
  const search = this.container.querySelector('#rates-search') as HTMLInputElement | null;
  search?.addEventListener('input', () => {
    this.bomSearchQuery = search.value;
    this.render();
    const el = this.container.querySelector('#rates-search') as HTMLInputElement | null;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  });

  this.container.querySelectorAll('.input-library-rate').forEach(el => {
    el.addEventListener('change', () => {
      const input = el as HTMLInputElement;
      this.store.setLibraryRate(
        input.getAttribute('data-kind') as RateKind,
        input.getAttribute('data-desc') || '',
        parseFloat(input.value)
      );
    });
  });

  this.container.querySelector('#rates-btn-export')?.addEventListener('click', () => {
    const csv = rateLibraryToCsv(extractRateLibrary(this.store.getBoqState(this.currentSystemId)));
    downloadCsv(csv, `${safeFileName(this.store.projectName)}_Rate_Library_${Date.now()}.csv`);
  });

  const file = this.container.querySelector('#rates-file') as HTMLInputElement | null;
  this.container.querySelector('#rates-btn-import')?.addEventListener('click', () => file?.click());
  file?.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    const res = this.store.importRateLibrary(await f.text());
    window.alert(`Rate import: ${res.applied} applied, ${res.skipped} skipped.`);
  });
}
