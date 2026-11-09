/**
 * Registry "keepouts" (obstacles) schedule table.
 */
import { ArrayZone, SolarSystem, KeepOutPolygon } from '../../types/solar';
import { computePolygonAreaSqM, computePolygonCentroid } from '../../geo/projection';
import type { RegistryModalUI } from '../registryModal';
import { escapeHtml } from '../../utils/html';

/**
 * 4. KEEP-OUTS (OBSTACLES) TABLE VIEW
 * Allows editing the associated array zone, renaming obstacles, and zooming.
 */
export function renderKeepOutsTable(
  this: RegistryModalUI,
  allKeepOuts: { keepOut: KeepOutPolygon; zoneId: string; zoneName: string; systemId: string }[],
  zones: ArrayZone[],
  allSystems?: SolarSystem[]
): string {
  const systems = allSystems || this.store.getSystems();
  let filtered = allKeepOuts;
  if (this.searchKeyword) {
    const q = this.searchKeyword.toLowerCase();
    filtered = filtered.filter(
      item => item.keepOut.name.toLowerCase().includes(q) || item.zoneName.toLowerCase().includes(q)
    );
  }
  if (this.filterSystemId !== 'all') {
    filtered = filtered.filter(item => item.systemId === this.filterSystemId);
  }
  if (this.filterZoneId !== 'all') {
    filtered = filtered.filter(item => item.zoneId === this.filterZoneId);
  }

  const availableZones = this.filterSystemId !== 'all' ? zones.filter(z => z.systemId === this.filterSystemId) : zones;

  return `
    <div class="registry-toolbar">
      <div class="filters-row">
        <input type="search" id="modal-search" class="input-text" placeholder="Search obstacle name or array..." value="${this.searchKeyword}" />
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
        <span class="icon">🔄</span> Change the <b>Associated Array</b> dropdown to instantly reassign a keep-out obstacle between arrays!
      </div>
    </div>

    <div tabindex="0" role="region" aria-label="Keep-Outs Schedule Table" class="table-container table-wrapper">
      <table class="registry-table responsive-data-table">
        <thead>
          <tr>
            <th>Keep-Out Name</th>
            <th>Associated Array (Editable)</th>
            <th>System</th>
            <th>Vertices</th>
            <th>Surface Area</th>
            <th>Centroid Coordinates</th>
            <th style="text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${
            filtered.length === 0
              ? `<tr><td colspan="7" class="empty-table-cell">No keep-out obstacles found matching criteria.</td></tr>`
              : filtered
                  .map(item => {
                    const ko = item.keepOut;
                    const areaSqM = computePolygonAreaSqM(ko.vertices);
                    const centroid = computePolygonCentroid(ko.vertices);
                    const sys = this.store.getSystem(item.systemId);

                    return `
                <tr>
                  <td>
                    <div class="entity-badge-cell">
                      <span class="color-badge" style="background: #ef4444;"></span>
                      <input type="text" class="input-tbl-ko-name" data-zone-id="${item.zoneId}" data-ko-id="${ko.id}" value="${escapeHtml(ko.name)}" title="Edit obstacle name" />
                    </div>
                  </td>
                  <td>
                    <select class="input-select sm sel-reassign-ko" data-zone-id="${item.zoneId}" data-ko-id="${ko.id}" title="Reassign obstacle to a different array zone">
                      ${zones
                        .map(
                          z => `
                        <option value="${z.id}" ${z.id === item.zoneId ? 'selected' : ''}>
                          ${escapeHtml(z.name)} (${z.config.mountType})
                        </option>
                      `
                        )
                        .join('')}
                    </select>
                  </td>
                  <td>
                    <span class="badge" style="background: ${sys?.color || '#0284c7'}; color: #fff;">
                      ${escapeHtml(sys?.name?.split(':')[0] || 'System')}
                    </span>
                  </td>
                  <td>
                    <b>${ko.vertices.length}</b> nodes
                  </td>
                  <td>
                    <strong style="color: #f87171;">${areaSqM.toFixed(1)} m²</strong>
                  </td>
                  <td>
                    <small>${centroid.lat.toFixed(6)}, ${centroid.lng.toFixed(6)}</small>
                  </td>
                  <td style="text-align: right; white-space: nowrap;">
                    <button class="btn btn-xs btn-jump-ko" data-zone-id="${item.zoneId}" data-ko-id="${ko.id}" title="Zoom to obstacle">🎯 Zoom</button>
                    <button class="btn btn-xs btn-edit-ko" data-zone-id="${item.zoneId}" data-ko-id="${ko.id}" title="Select array to edit obstacle vertices on map">✏️ Edit Vertices</button>
                    <button class="btn btn-xs btn-outline danger btn-delete-ko" data-zone-id="${item.zoneId}" data-ko-id="${ko.id}" title="Delete obstacle">🗑️</button>
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

/** Actions for the keep-outs table. */
export function attachKeepOutsTableListeners(this: RegistryModalUI): void {
  // 6. Keep-Outs (Obstacles) Table Actions
  this.dialog.querySelectorAll('.sel-reassign-ko').forEach(sel => {
    sel.addEventListener('change', e => {
      const target = e.currentTarget as HTMLSelectElement;
      const currentZoneId = target.getAttribute('data-zone-id');
      const keepOutId = target.getAttribute('data-ko-id');
      const targetZoneId = target.value;
      if (currentZoneId && keepOutId && targetZoneId) {
        const success = this.store.reassignKeepOutZone(currentZoneId, keepOutId, targetZoneId);
        if (success) {
          this.render();
        }
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-ko-name').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const zoneId = target.getAttribute('data-zone-id');
      const keepOutId = target.getAttribute('data-ko-id');
      if (zoneId && keepOutId) {
        this.store.updateKeepOutName(zoneId, keepOutId, target.value.trim());
      }
    });
  });

  this.dialog.querySelectorAll('.btn-jump-ko').forEach(btn => {
    btn.addEventListener('click', e => {
      const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
      const keepOutId = (e.currentTarget as HTMLElement).getAttribute('data-ko-id');
      if (zoneId && keepOutId) {
        this.store.selectZone(zoneId);
        this.store.selectKeepOut(keepOutId);
        this.mapController?.zoomToKeepOut(zoneId, keepOutId);
        this.close();
      }
    });
  });

  this.dialog.querySelectorAll('.btn-edit-ko').forEach(btn => {
    btn.addEventListener('click', e => {
      const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
      const keepOutId = (e.currentTarget as HTMLElement).getAttribute('data-ko-id');
      if (zoneId && keepOutId) {
        this.store.selectZone(zoneId);
        this.store.selectKeepOut(keepOutId);
        this.mapController?.zoomToKeepOut(zoneId, keepOutId);
        this.close();
      }
    });
  });

  this.dialog.querySelectorAll('.btn-delete-ko').forEach(btn => {
    btn.addEventListener('click', e => {
      const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
      const keepOutId = (e.currentTarget as HTMLElement).getAttribute('data-ko-id');
      if (zoneId && keepOutId && confirm('Delete this obstacle polygon?')) {
        this.store.removeKeepOut(zoneId, keepOutId);
        this.render();
      }
    });
  });
}
