/**
 * Registry "strings" cable schedule table.
 */
import { ArrayZone, SolarSystem, StringCableLength } from '../../types/solar';
import type { RegistryModalUI } from '../registryModal';
import { escapeHtml } from '../../utils/html';

/**
 * 5. STRINGS TABLE VIEW
 * Dedicated schedule where each row is an active PV string with electrical specs and cabling runs.
 */
export function renderStringsTable(
  this: RegistryModalUI,
  stringCables: StringCableLength[],
  zones: ArrayZone[],
  allSystems?: SolarSystem[]
): string {
  let filtered = stringCables;
  if (this.searchKeyword) {
    const q = this.searchKeyword.toLowerCase();
    filtered = filtered.filter(
      s => s.stringId.toLowerCase().includes(q) || s.zoneId.toLowerCase().includes(q)
    );
  }
  if (this.filterSystemId !== 'all') {
    filtered = filtered.filter(s => s.systemId === this.filterSystemId);
  }
  if (this.filterZoneId !== 'all') {
    filtered = filtered.filter(s => s.zoneId === this.filterZoneId);
  }

  const systems = allSystems || this.store.getSystems();
  const availableZones = this.filterSystemId !== 'all' ? zones.filter(z => z.systemId === this.filterSystemId) : zones;

  return `
    <div class="registry-toolbar">
      <div class="filters-row">
        <input type="search" id="modal-search" class="input-text" placeholder="Search string ID..." value="${this.searchKeyword}" />
        <select id="modal-system-filter" class="input-select" title="Filter by system">
          <option value="all">All Systems (${systems.length})</option>
          ${systems.map(s => `<option value="${s.id}" ${this.filterSystemId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
        <select id="modal-zone-filter" class="input-select">
          <option value="all">${this.filterSystemId !== 'all' ? 'All Arrays in System' : 'All Arrays'} (${availableZones.length})</option>
          ${availableZones.map(z => `<option value="${z.id}" ${this.filterZoneId === z.id ? 'selected' : ''}>${escapeHtml(z.name)}</option>`).join('')}
        </select>
      </div>
      <div class="tbl-action-hint">
        <span class="icon">⚡</span> Each row summarizes a complete PV electrical series circuit and its DC cabling runs.
      </div>
    </div>

    <div tabindex="0" role="region" aria-label="Strings Schedule Table" class="table-container table-wrapper">
      <table class="registry-table responsive-data-table">
        <thead>
          <tr>
            <th>String ID</th>
            <th>System</th>
            <th>Array Zone</th>
            <th>Modules</th>
            <th>DC Capacity</th>
            <th>STC Voltages</th>
            <th>Inverter / MPPT</th>
            <th>Module Cable</th>
            <th>Homerun (+ / -)</th>
            <th>Raceway / Elev</th>
            <th>Total String Wire</th>
            <th style="text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${
            filtered.length === 0
              ? `<tr><td colspan="12" class="empty-table-cell">No active strings found matching criteria. Run Auto-Stringing to generate strings.</td></tr>`
              : filtered
                  .map(sc => {
                    const zone = this.store.getZone(sc.zoneId);
                    const sys = this.store.getSystem(sc.systemId);
                    const mod = zone ? this.store.getModule(zone.moduleId) : undefined;
                    const kwp = (sc.panelCount * (mod?.nominalPowerW || zone?.config.electrical.nominalPowerW || 600)) / 1000;
                    const voc = sc.panelCount * (mod?.voc || zone?.config.electrical.voc || 48.1);
                    const vmp = sc.panelCount * (mod?.vmp || zone?.config.electrical.vmp || 40.2);

                    // Find panel details
                    const p1 = this.store.getPanel(sc.startPanelId);

                    return `
                <tr>
                  <td>
                    <input type="text" class="input-tbl-text input-tbl-string-id-edit" data-string-id="${sc.stringId}" value="${sc.stringId}" title="Rename String circuit ID" style="width: 120px; font-family: monospace; font-size: 11px;" />
                  </td>
                  <td>
                    <span class="badge" style="background: ${sys?.color || '#0284c7'}; color: #fff;">
                      ${escapeHtml(sys?.name?.split(':')[0] || 'System')}
                    </span>
                  </td>
                  <td>
                    <div class="entity-badge-cell">
                      <span class="color-badge" style="background: ${zone?.color || '#333'};"></span>
                      <span>${escapeHtml(zone?.name || sc.zoneId)}</span>
                      <span class="badge ${zone?.config.mountType === 'roof' ? 'accent' : 'highlight'}" style="font-size: 9px; padding: 1px 4px;">
                        ${zone?.config.mountType === 'roof' ? 'Roof' : 'Ground'}
                      </span>
                    </div>
                  </td>
                  <td>
                    <b>${sc.panelCount}</b> panels
                  </td>
                  <td>
                    <strong style="color: var(--accent-green);">${kwp.toFixed(2)} kWp</strong>
                  </td>
                  <td>
                    <small>Voc: ${voc.toFixed(1)}V &bull; Vmp: ${vmp.toFixed(1)}V</small>
                  </td>
                  <td>
                    <div class="inline-field-pair">
                      <select class="input-tbl-select sel-str-inv" data-string-id="${sc.stringId}" title="Assign String to Inverter Unit">
                        ${Array.from({ length: sys?.inverter.inverterCount || 1 }, (_, i) => `
                          <option value="${i + 1}" ${(p1?.inverterIndex || 1) === (i + 1) ? 'selected' : ''}>Inv ${i + 1}</option>
                        `).join('')}
                      </select>
                      <select class="input-tbl-select sel-str-mppt" data-string-id="${sc.stringId}" title="Assign String to MPPT Tracker">
                        ${Array.from({ length: sys?.inverter.mpptCountPerInverter || 1 }, (_, i) => `
                          <option value="INV${p1?.inverterIndex || 1}-MPPT${i + 1}" ${(p1?.mpptId || '').includes(`MPPT${i + 1}`) ? 'selected' : ''}>MPPT ${i + 1}</option>
                        `).join('')}
                      </select>
                    </div>
                  </td>
                  <td>
                    ${sc.intraStringLengthM} m
                  </td>
                  <td>
                    <small>${sc.homerunPositiveM}m (+) / ${sc.homerunNegativeM}m (-)</small>
                  </td>
                  <td>
                    ${
                      sc.hasRaceway
                        ? `<span class="badge highlight" title="Cables route through raceway conduit">
                            🛤️ ${sc.racewayPathLengthM ?? 0}m (&Delta;h: ${sc.elevationDeltaM}m)
                          </span>`
                        : `<span class="badge">Direct (&Delta;h: ${sc.elevationDeltaM}m)</span>`
                    }
                  </td>
                  <td>
                    <strong style="color: var(--accent-green);">${sc.totalStringCableM} m</strong>
                  </td>
                  <td style="text-align: right; white-space: nowrap;">
                    <button class="btn btn-xs btn-jump-string" data-string-id="${sc.stringId}" data-sys-id="${sc.systemId}" title="Zoom to fit this string on map">🎯 Zoom</button>
                    <button class="btn btn-xs btn-inspect-string" data-panel-id="${sc.startPanelId}" title="Inspect terminal module">🔍 Inspect</button>
                  </td>
                </tr>
              `;
                  })
                  .join('')
          }
        </tbody>
      </table>
    </div>
  `;
}

/** In-schedule property editing for the strings table. */
export function attachStringsTableListeners(this: RegistryModalUI): void {
  // 7. Strings Table Actions & In-Schedule Property Editing
  this.dialog.querySelectorAll('.input-tbl-string-id-edit').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const oldStringId = target.getAttribute('data-string-id');
      const newStringId = target.value.trim();
      if (oldStringId && newStringId && oldStringId !== newStringId) {
        this.store.renameString(oldStringId, newStringId);
      }
    });
  });

  this.dialog.querySelectorAll('.sel-str-inv').forEach(sel => {
    sel.addEventListener('change', e => {
      const target = e.currentTarget as HTMLSelectElement;
      const stringId = target.getAttribute('data-string-id');
      if (stringId) {
        this.store.updateStringAssignment(stringId, parseInt(target.value) || 1);
      }
    });
  });

  this.dialog.querySelectorAll('.sel-str-mppt').forEach(sel => {
    sel.addEventListener('change', e => {
      const target = e.currentTarget as HTMLSelectElement;
      const stringId = target.getAttribute('data-string-id');
      if (stringId) {
        this.store.updateStringAssignment(stringId, undefined, target.value);
      }
    });
  });

  this.dialog.querySelectorAll('.btn-jump-string').forEach(btn => {
    btn.addEventListener('click', e => {
      const stringId = (e.currentTarget as HTMLElement).getAttribute('data-string-id');
      const sysId = (e.currentTarget as HTMLElement).getAttribute('data-sys-id') || undefined;
      if (stringId) {
        this.mapController?.zoomToString(stringId, sysId);
        this.close();
      }
    });
  });

  this.dialog.querySelectorAll('.btn-inspect-string').forEach(btn => {
    btn.addEventListener('click', e => {
      const panelId = (e.currentTarget as HTMLElement).getAttribute('data-panel-id');
      if (panelId) {
        this.store.selectPanel(panelId);
        this.mapController?.zoomToPanel(panelId);
        this.close();
      }
    });
  });
}
