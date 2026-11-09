/**
 * Registry "Equipment" tab: per-farm battery storage and the project's interconnection package.
 * Each change re-syncs the BOQ (E1 per farm, I1/I2 for the interconnection section).
 */
import { BessChemistry } from '../../types/solar';
import type { RegistryModalUI } from '../registryModal';
import { escapeHtml } from '../../utils/html';
import { poleCount } from '../../geo/boq/items/equipmentAndInterconnection';

export function renderEquipmentTable(this: RegistryModalUI): string {
  const farms = [...this.store.sections.values()].filter(s => s.kind === 'farm');
  const ic = [...this.store.sections.values()].find(s => s.kind === 'interconnection');
  const cfg = ic?.interconnection;

  const farmRows = farms
    .map(f => {
      const kwp = this.store
        .getZones()
        .filter(z => f.systemIds.includes(z.systemId))
        .reduce((sum, z) => sum + z.totalKwp, 0);
      const b = f.bess;
      return `
        <tr>
          <td><strong>${escapeHtml(f.code)}</strong> — ${escapeHtml(f.name)}</td>
          <td>${kwp.toFixed(1)} kWp</td>
          <td><input type="number" class="input-tbl-num input-bess-mwh" data-section-id="${f.id}" value="${b?.capacityMwh ?? 0}" min="0" step="0.5" style="width: 70px;" /> MWh</td>
          <td><input type="number" class="input-tbl-num input-bess-mw" data-section-id="${f.id}" value="${b?.powerMw ?? 0}" min="0" step="0.5" style="width: 70px;" /> MW</td>
          <td>
            <select class="input-tbl-select sel-bess-chem" data-section-id="${f.id}">
              <option value="LFP" ${(b?.chemistry ?? 'LFP') === 'LFP' ? 'selected' : ''}>LFP</option>
              <option value="NMC" ${b?.chemistry === 'NMC' ? 'selected' : ''}>NMC</option>
            </select>
          </td>
          <td>${b ? `<span class="badge highlight">E1 in BOQ as ${escapeHtml(f.code)}14</span>` : '<span class="text-dim">no storage</span>'}</td>
        </tr>`;
    })
    .join('');

  return `
    <div class="registry-toolbar">
      <div class="tbl-action-hint">
        <span class="icon">🔋</span> Set battery storage per farm and the utility interconnection. Changes update the BOQ automatically.
      </div>
    </div>

    <fieldset style="margin: 8px 0; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--panel-radius);">
      <legend><strong>Battery energy storage (per farm)</strong></legend>
      <div tabindex="0" role="region" aria-label="Battery storage table" class="table-container table-wrapper">
        <table class="registry-table responsive-data-table">
          <thead><tr><th>Farm</th><th>PV</th><th>Energy</th><th>Power</th><th>Chemistry</th><th>BOQ</th></tr></thead>
          <tbody>${farmRows || '<tr><td colspan="6" class="empty-table-cell">Add a farm in the Buildings tab first.</td></tr>'}</tbody>
        </table>
      </div>
    </fieldset>

    <fieldset style="margin: 8px 0; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--panel-radius);">
      <legend><strong>Interconnection (primary line, switching &amp; metering)</strong></legend>
      <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: end;">
        <label>Primary line (km) <input type="number" id="ic-length" class="input-tbl-num" value="${cfg?.lineLengthKm ?? 4}" min="0" step="0.1" style="width: 70px;" /></label>
        <label>Pole span (m) <input type="number" id="ic-span" class="input-tbl-num" value="${cfg?.poleSpanM ?? 35}" min="10" step="1" style="width: 64px;" /></label>
        <label>Voltage (kV) <input type="number" id="ic-kv" class="input-tbl-num" value="${cfg?.voltageKv ?? 13.2}" min="1" step="0.1" style="width: 64px;" /></label>
        <button id="btn-ic-apply" class="btn btn-sm btn-primary">${cfg ? 'Update interconnection' : '➕ Add interconnection'}</button>
        ${cfg ? '<button id="btn-ic-remove" class="btn btn-sm btn-outline">Remove</button>' : ''}
      </div>
      ${
        cfg
          ? `<p class="text-dim" style="margin: 8px 0 0;">${poleCount(cfg.lineLengthKm, cfg.poleSpanM)} poles • BOQ items ${escapeHtml(ic!.code)}1 (line) and ${escapeHtml(ic!.code)}2 (switching &amp; metering)</p>`
          : ''
      }
    </fieldset>
  `;
}

export function attachEquipmentTableListeners(this: RegistryModalUI): void {
  const applyBess = (sectionId: string) => {
    const val = (cls: string) =>
      parseFloat((this.dialog.querySelector(`.${cls}[data-section-id="${sectionId}"]`) as HTMLInputElement | null)?.value ?? '0') || 0;
    const chem = (this.dialog.querySelector(`.sel-bess-chem[data-section-id="${sectionId}"]`) as HTMLSelectElement | null)?.value;
    this.store.setFarmBess(sectionId, {
      capacityMwh: val('input-bess-mwh'),
      powerMw: val('input-bess-mw'),
      chemistry: (chem as BessChemistry) || 'LFP'
    });
  };
  this.dialog.querySelectorAll('.input-bess-mwh, .input-bess-mw, .sel-bess-chem').forEach(el => {
    el.addEventListener('change', () => applyBess(el.getAttribute('data-section-id') || ''));
  });

  const num = (id: string, fallback: number) => {
    const v = parseFloat((document.getElementById(id) as HTMLInputElement | null)?.value ?? '');
    return Number.isFinite(v) ? v : fallback;
  };
  document.getElementById('btn-ic-apply')?.addEventListener('click', () => {
    this.store.setInterconnection({
      lineLengthKm: num('ic-length', 4),
      poleSpanM: num('ic-span', 35),
      voltageKv: num('ic-kv', 13.2)
    });
  });
  document.getElementById('btn-ic-remove')?.addEventListener('click', () => {
    this.store.setInterconnection(null);
  });
}
