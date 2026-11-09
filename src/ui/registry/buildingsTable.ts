/**
 * Registry "Buildings" tab: poultry-house quick-add form and per-house / per-farm roll-up table.
 */
import { Building, CorrosionClass, RoofType } from '../../types/solar';
import type { RegistryModalUI } from '../registryModal';
import { escapeHtml } from '../../utils/html';

const ROOF_TYPES: { value: RoofType; label: string }[] = [
  { value: 'corrugated_metal', label: 'Corrugated metal' },
  { value: 'standing_seam', label: 'Standing seam' },
  { value: 'sandwich_panel', label: 'Sandwich panel' }
];

const CORROSION_CLASSES: { value: CorrosionClass; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'ammonia_humid', label: 'Ammonia / humid' }
];

interface HouseTotals {
  panels: number;
  kwp: number;
  zones: number;
}

function houseTotals(this: RegistryModalUI, b: Building): HouseTotals {
  let panels = 0;
  let kwp = 0;
  let zones = 0;
  for (const zoneId of b.zoneIds) {
    const z = this.store.getZone(zoneId);
    if (!z) continue;
    zones++;
    panels += z.activePanelCount;
    kwp += z.totalKwp;
  }
  return { panels, kwp, zones };
}

function num(id: string, fallback: number): number {
  const v = parseFloat((document.getElementById(id) as HTMLInputElement | null)?.value ?? '');
  return Number.isFinite(v) ? v : fallback;
}

export function renderBuildingsTable(this: RegistryModalUI): string {
  const sections = [...this.store.sections.values()];
  const buildings = [...this.store.buildings.values()];
  const q = this.searchKeyword.toLowerCase();
  const filtered = q ? buildings.filter(b => b.name.toLowerCase().includes(q)) : buildings;

  const rows = sections
    .map(sec => {
      const list = filtered.filter(b => b.sectionId === sec.id);
      if (list.length === 0) return '';
      let panels = 0;
      let kwp = 0;
      const houseRows = list
        .map(b => {
          const t = houseTotals.call(this, b);
          panels += t.panels;
          kwp += t.kwp;
          return `
            <tr>
              <td><input type="text" class="input-tbl-text input-bld-name" data-building-id="${b.id}" value="${escapeHtml(b.name)}" style="width: 130px; font-weight: 600;" /></td>
              <td>${b.lengthM.toFixed(1)} × ${b.widthM.toFixed(1)} m</td>
              <td>${b.headingDeg.toFixed(0)}°</td>
              <td>
                <select class="input-tbl-select sel-bld-roof" data-building-id="${b.id}">
                  ${ROOF_TYPES.map(r => `<option value="${r.value}" ${r.value === b.roofType ? 'selected' : ''}>${r.label}</option>`).join('')}
                </select>
              </td>
              <td><input type="number" class="input-tbl-num input-bld-purlin" data-building-id="${b.id}" value="${b.purlinSpacingM}" min="0.3" max="3" step="0.1" style="width: 56px;" /> m</td>
              <td>
                <select class="input-tbl-select sel-bld-corrosion" data-building-id="${b.id}">
                  ${CORROSION_CLASSES.map(c => `<option value="${c.value}" ${c.value === b.corrosionClass ? 'selected' : ''}>${c.label}</option>`).join('')}
                </select>
              </td>
              <td>${t.zones}</td>
              <td>${t.panels.toLocaleString()}</td>
              <td>${t.kwp.toFixed(2)}</td>
              <td><button class="btn btn-xs btn-outline btn-bld-delete" data-building-id="${b.id}" title="Delete house and its roof arrays">🗑️</button></td>
            </tr>`;
        })
        .join('');
      return `
        <tr class="section-header-row"><td colspan="10"><strong>${escapeHtml(sec.code)} — ${escapeHtml(sec.name)}</strong> (${list.length} houses)</td></tr>
        ${houseRows}
        <tr class="section-subtotal-row"><td colspan="7"><strong>Subtotal ${escapeHtml(sec.code)}</strong></td><td><strong>${panels.toLocaleString()}</strong></td><td><strong>${kwp.toFixed(2)}</strong></td><td></td></tr>`;
    })
    .join('');

  const farmOptions = sections
    .filter(s => s.kind === 'farm')
    .map(s => `<option value="${s.id}">${escapeHtml(s.code)} — ${escapeHtml(s.name)}</option>`)
    .join('');

  return `
    <div class="registry-toolbar">
      <div class="filters-row">
        <input type="search" id="modal-search" class="input-text" placeholder="Search house name..." value="${escapeHtml(this.searchKeyword)}" />
      </div>
      <div class="tbl-action-hint">
        <span class="icon">🐔</span> Houses are placed at the current map center. Each gable house becomes 2 roof-mount arrays.
      </div>
    </div>

    <fieldset class="quick-add-houses" style="margin: 8px 0; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--panel-radius);">
      <legend><strong>Quick-add poultry houses</strong></legend>
      <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: end;">
        <label>Farm
          <select id="qa-farm" class="input-select">
            <option value="">New farm</option>
            ${farmOptions}
          </select>
        </label>
        <label>Houses <input type="number" id="qa-count" class="input-tbl-num" value="4" min="1" max="60" step="1" style="width: 56px;" /></label>
        <label>Length (m) <input type="number" id="qa-length" class="input-tbl-num" value="120" min="10" max="300" step="1" style="width: 64px;" /></label>
        <label>Width (m) <input type="number" id="qa-width" class="input-tbl-num" value="14" min="4" max="40" step="0.5" style="width: 64px;" /></label>
        <label>Roof pitch (°) <input type="number" id="qa-pitch" class="input-tbl-num" value="15" min="0" max="45" step="1" style="width: 56px;" /></label>
        <label>Gap (m) <input type="number" id="qa-gap" class="input-tbl-num" value="10" min="0" max="100" step="0.5" style="width: 56px;" /></label>
        <label>Heading (°) <input type="number" id="qa-heading" class="input-tbl-num" value="0" min="0" max="359" step="1" style="width: 60px;" /></label>
        <button id="btn-qa-add-houses" class="btn btn-sm btn-primary">➕ Add houses</button>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: end; margin-top: 8px;">
        <label><input type="checkbox" id="qa-ko-on" checked /> Ventilation keep-outs</label>
        <label>Ridge vent (m) <input type="number" id="qa-ko-ridge" class="input-tbl-num" value="0.6" min="0" step="0.1" style="width: 56px;" /></label>
        <label>Eave inlets (m) <input type="number" id="qa-ko-eave" class="input-tbl-num" value="0.5" min="0" step="0.1" style="width: 56px;" /></label>
        <label>Fan end (m) <input type="number" id="qa-ko-fan" class="input-tbl-num" value="3" min="0" step="0.5" style="width: 56px;" /></label>
        <label>Pad end (m) <input type="number" id="qa-ko-pad" class="input-tbl-num" value="2" min="0" step="0.5" style="width: 56px;" /></label>
      </div>
    </fieldset>

    <div tabindex="0" role="region" aria-label="Buildings Table" class="table-container table-wrapper">
      <table class="registry-table responsive-data-table">
        <thead>
          <tr>
            <th>House</th><th>Size</th><th>Heading</th><th>Roof Type</th><th>Purlin Spacing</th>
            <th>Corrosion Class</th><th>Roof Planes</th><th>Panels</th><th>kWp</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="10" class="empty-table-cell">No poultry houses yet. Use quick-add above.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

export function attachBuildingsTableListeners(this: RegistryModalUI): void {
  document.getElementById('btn-qa-add-houses')?.addEventListener('click', () => {
    this.store.addPoultryHouses({
      anchor: { ...this.store.center },
      headingDeg: num('qa-heading', 0),
      lengthM: num('qa-length', 120),
      widthM: num('qa-width', 14),
      roofPitchDeg: num('qa-pitch', 15),
      count: num('qa-count', 1),
      gapM: num('qa-gap', 10),
      roofKeepOuts: (document.getElementById('qa-ko-on') as HTMLInputElement | null)?.checked
        ? {
            ridgeVentWidthM: num('qa-ko-ridge', 0.6),
            eaveClearanceM: num('qa-ko-eave', 0.5),
            fanEndClearanceM: num('qa-ko-fan', 3),
            padEndClearanceM: num('qa-ko-pad', 2)
          }
        : null,
      sectionId: (document.getElementById('qa-farm') as HTMLSelectElement | null)?.value || undefined
    });
  });

  const withBuilding = (el: Element): Building | undefined =>
    this.store.buildings.get(el.getAttribute('data-building-id') || '');

  this.dialog.querySelectorAll('.input-bld-name').forEach(el => {
    el.addEventListener('change', () => {
      const b = withBuilding(el);
      if (b) {
        b.name = (el as HTMLInputElement).value;
        this.store.notify();
      }
    });
  });
  this.dialog.querySelectorAll('.sel-bld-roof').forEach(el => {
    el.addEventListener('change', () => {
      const b = withBuilding(el);
      if (b) {
        b.roofType = (el as HTMLSelectElement).value as RoofType;
        this.store.notify();
      }
    });
  });
  this.dialog.querySelectorAll('.sel-bld-corrosion').forEach(el => {
    el.addEventListener('change', () => {
      const b = withBuilding(el);
      if (b) {
        b.corrosionClass = (el as HTMLSelectElement).value as CorrosionClass;
        this.store.notify();
      }
    });
  });
  this.dialog.querySelectorAll('.input-bld-purlin').forEach(el => {
    el.addEventListener('change', () => {
      const b = withBuilding(el);
      const v = parseFloat((el as HTMLInputElement).value);
      if (b && Number.isFinite(v) && v >= 0.3) {
        b.purlinSpacingM = v;
        this.store.notify();
      }
    });
  });
  this.dialog.querySelectorAll('.btn-bld-delete').forEach(el => {
    el.addEventListener('click', () => {
      const b = withBuilding(el);
      if (!b || !window.confirm(`Delete ${b.name} and its roof arrays?`)) return;
      for (const zoneId of [...b.zoneIds]) this.store.removeZone(zoneId);
      this.store.buildings.delete(b.id);
      this.store.notify();
    });
  });
}
