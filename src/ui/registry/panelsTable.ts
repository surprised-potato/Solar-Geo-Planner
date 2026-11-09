/**
 * Registry "panels" table and its filtering.
 */
import { SolarPanelObject, ArrayZone, SolarSystem } from '../../types/solar';
import type { RegistryModalUI } from '../registryModal';
import { escapeHtml } from '../../utils/html';

export function getFilteredPanels(this: RegistryModalUI): SolarPanelObject[] {
  let panels = this.store.getPanels();

  if (this.filterSystemId !== 'all') {
    panels = panels.filter(p => p.systemId === this.filterSystemId);
  }

  if (this.filterZoneId !== 'all') {
    panels = panels.filter(p => p.zoneId === this.filterZoneId);
  }

  if (this.filterStatus === 'active') {
    panels = panels.filter(p => p.active);
  } else if (this.filterStatus === 'disabled') {
    panels = panels.filter(p => !p.active);
  }

  if (this.searchKeyword) {
    const q = this.searchKeyword.toLowerCase();
    panels = panels.filter(
      p =>
        p.id.toLowerCase().includes(q) ||
        (p.stringId && p.stringId.toLowerCase().includes(q))
    );
  }

  return panels;
}

/**
 * 6. SOLAR PANELS REGISTRY VIEW
 * High-performance virtualized/paginated rendering to ensure 60 FPS responsiveness even for 11MW+ farms (18,000+ modules).
 */
export function renderPanelsTable(
  this: RegistryModalUI,
  allPanels: SolarPanelObject[],
  zones: ArrayZone[],
  systems: SolarSystem[],
  allSystems?: SolarSystem[]
): string {
  const panels = this.getFilteredPanels();
  const totalFiltered = panels.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / this.panelPageSize));
  if (this.panelPage > totalPages) this.panelPage = totalPages;
  if (this.panelPage < 1) this.panelPage = 1;

  const startIdx = (this.panelPage - 1) * this.panelPageSize;
  const pagePanels = panels.slice(startIdx, startIdx + this.panelPageSize);
  const sysList = allSystems || systems;
  const availableZones = this.filterSystemId !== 'all' ? zones.filter(z => z.systemId === this.filterSystemId) : zones;

  return `
    <div class="registry-toolbar">
      <div class="filters-row">
        <input type="search" id="modal-search" class="input-text" placeholder="Search by ID or String..." value="${this.searchKeyword}" />

        <select id="modal-system-filter" class="input-select" title="Filter by system">
          <option value="all">All Systems (${sysList.length})</option>
          ${sysList.map(s => `<option value="${s.id}" ${this.filterSystemId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>

        <select id="modal-zone-filter" class="input-select">
          <option value="all">${this.filterSystemId !== 'all' ? 'All Arrays in System' : 'All Arrays'} (${availableZones.length})</option>
          ${availableZones.map(z => `<option value="${z.id}" ${this.filterZoneId === z.id ? 'selected' : ''}>${escapeHtml(z.name)}</option>`).join('')}
        </select>

        <select id="modal-status-filter" class="input-select">
          <option value="all" ${this.filterStatus === 'all' ? 'selected' : ''}>All Statuses (${allPanels.length})</option>
          <option value="active" ${this.filterStatus === 'active' ? 'selected' : ''}>Active Only</option>
          <option value="disabled" ${this.filterStatus === 'disabled' ? 'selected' : ''}>Disabled Only</option>
        </select>
      </div>

      <div class="batch-stringing-bar">
        <span class="bar-title">🔌 Stringing Helper:</span>
        <input type="text" id="batch-str-id" class="input-text sm" placeholder="Prefix (e.g. STR-A)" />
        <button id="btn-auto-string" class="btn btn-sm btn-outline">Auto-String Rows (Serpentine)</button>
      </div>
    </div>

    <div class="pagination-bar" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: 6px; margin-bottom: 8px;">
      <div class="page-status" style="font-size: 12px; color: var(--text-dim);">
        Showing <b>${totalFiltered === 0 ? 0 : startIdx + 1}–${Math.min(startIdx + this.panelPageSize, totalFiltered)}</b> of <b>${totalFiltered.toLocaleString()}</b> panels
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button class="btn btn-xs btn-outline btn-page-prev" ${this.panelPage <= 1 ? 'disabled' : ''}>◀ Prev</button>
        <span style="font-size: 12px;">Page <b>${this.panelPage}</b> of <b>${totalPages}</b></span>
        <button class="btn btn-xs btn-outline btn-page-next" ${this.panelPage >= totalPages ? 'disabled' : ''}>Next ▶</button>
      </div>
    </div>

    <div tabindex="0" role="region" aria-label="Solar Panels Registry Table" class="table-container table-wrapper" style="content-visibility: auto; contain-intrinsic-size: auto none auto 500px;">
      <table class="registry-table responsive-data-table">
        <thead>
          <tr>
            <th>Panel ID</th>
            <th>System</th>
            <th>Array Zone</th>
            <th>Module Model</th>
            <th>Row, Col</th>
            <th>Watts</th>
            <th>Voc / Vmp</th>
            <th>String ID</th>
            <th>Order</th>
            <th>Active</th>
            <th style="text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${
            pagePanels.length === 0
              ? `<tr><td colspan="11" class="empty-table-cell">No solar panels found matching current filters.</td></tr>`
              : pagePanels
                  .map(p => {
                    const z = this.store.getZone(p.zoneId);
                    const s = this.store.getSystem(p.systemId);
                    const m = this.store.getModule(p.moduleId);
                    return `
                <tr class="${p.active ? '' : 'row-disabled'}">
                  <td><code>${p.id}</code></td>
                  <td>
                    <span class="badge" style="background: ${s?.color || '#0284c7'}">${escapeHtml(s?.name?.split(':')[0] || 'System')}</span>
                  </td>
                  <td><span class="badge" style="background: ${z?.color || '#333'}">${escapeHtml(z?.name || p.zoneId)}</span></td>
                  <td><small title="${escapeHtml(m?.name || p.electrical.modelName)}">${escapeHtml(m?.name?.split(' ')[0] || 'ZNShine')}</small></td>
                  <td>R${p.rowIndex}, C${p.colIndex}</td>
                  <td><strong>${p.electrical.nominalPowerW}W</strong></td>
                  <td>${p.electrical.voc}V / ${p.electrical.vmp}V</td>
                  <td>
                    <input type="text" class="input-tbl-string" data-panel-id="${p.id}" value="${p.stringId || ''}" placeholder="—" />
                  </td>
                  <td>
                    <input type="number" class="input-tbl-order" data-panel-id="${p.id}" value="${p.stringOrder || ''}" min="1" placeholder="—" />
                  </td>
                  <td>
                    <span class="status-indicator ${p.active ? 'active' : 'disabled'}">
                      ${p.active ? 'Active' : 'Off'}
                    </span>
                  </td>
                  <td style="text-align: right; white-space: nowrap;">
                    <button class="btn btn-xs btn-jump" data-panel-id="${p.id}" title="Locate on map">🎯 Zoom</button>
                    <button class="btn btn-xs ${p.active ? 'btn-warn' : 'btn-primary'} btn-toggle" data-panel-id="${p.id}" title="Toggle active">
                      ${p.active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              `;
                  })
                  .join('')
          }
        </tbody>
      </table>
    </div>

    <div class="pagination-bar" style="display: flex; align-items: center; justify-content: flex-end; padding: 6px 12px; margin-top: 6px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <button class="btn btn-xs btn-outline btn-page-prev" ${this.panelPage <= 1 ? 'disabled' : ''}>◀ Prev</button>
        <span style="font-size: 12px;">Page <b>${this.panelPage}</b> of <b>${totalPages}</b></span>
        <button class="btn btn-xs btn-outline btn-page-next" ${this.panelPage >= totalPages ? 'disabled' : ''}>Next ▶</button>
      </div>
    </div>
  `;
}

/** String assignment and active toggles in the panels table. */
export function attachPanelsTableListeners(this: RegistryModalUI): void {
  // 8. Panels Table String & Active Updates
  this.dialog.querySelectorAll('.input-tbl-string').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const panelId = target.getAttribute('data-panel-id');
      if (panelId) {
        const p = this.store.getPanel(panelId);
        this.store.updatePanelString(panelId, target.value.trim() || null, p?.stringOrder ?? null);
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-order').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const panelId = target.getAttribute('data-panel-id');
      if (panelId) {
        const p = this.store.getPanel(panelId);
        const order = target.value ? Number(target.value) : null;
        this.store.updatePanelString(panelId, p?.stringId ?? null, order);
      }
    });
  });

  this.dialog.querySelectorAll('.btn-jump').forEach(btn => {
    btn.addEventListener('click', e => {
      const panelId = (e.currentTarget as HTMLElement).getAttribute('data-panel-id');
      if (panelId) {
        this.store.selectPanel(panelId);
        this.mapController?.zoomToPanel(panelId);
        this.close();
      }
    });
  });

  this.dialog.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      const panelId = (e.currentTarget as HTMLElement).getAttribute('data-panel-id');
      if (panelId) {
        this.store.togglePanelActive(panelId);
      }
    });
  });

  document.getElementById('btn-auto-string')?.addEventListener('click', () => {
    const prefixInput = document.getElementById('batch-str-id') as HTMLInputElement;
    const prefix = prefixInput.value.trim() || 'STR';
    const filtered = this.getFilteredPanels().filter(p => p.active);

    // Separate roof mount arrays vs ground mount arrays (roof strings never jump arrays)
    const roofPanels = filtered.filter(p => this.store.getZone(p.zoneId)?.config.mountType === 'roof');
    const groundPanels = filtered.filter(p => this.store.getZone(p.zoneId)?.config.mountType === 'ground');

    let globalStringCount = 0;
    const modulesPerString = 20;

    // Group roof panels by zoneId
    const roofZoneIds = Array.from(new Set(roofPanels.map(p => p.zoneId)));
    for (const zid of roofZoneIds) {
      const zPanels = roofPanels.filter(p => p.zoneId === zid);
      zPanels.sort((a, b) => {
        if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
        return a.rowIndex % 2 === 0 ? a.colIndex - b.colIndex : b.colIndex - a.colIndex;
      });

      for (let i = 0; i < zPanels.length; i += modulesPerString) {
        globalStringCount++;
        const slice = zPanels.slice(i, i + modulesPerString);
        slice.forEach((p, seq) => {
          const strId = `${prefix}-${String(globalStringCount).padStart(2, '0')}`;
          this.store.updatePanelString(p.id, strId, seq + 1);
        });
      }
    }

    // Ground panels can continuous-string across ground arrays, respecting mount tables
    if (groundPanels.length > 0) {
      groundPanels.sort((a, b) => {
        if (a.zoneId !== b.zoneId) return a.zoneId.localeCompare(b.zoneId);
        if (a.tableIndex != null && b.tableIndex != null && a.tableIndex !== b.tableIndex) {
          return a.tableIndex - b.tableIndex;
        }
        if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
        return a.rowIndex % 2 === 0 ? a.colIndex - b.colIndex : b.colIndex - a.colIndex;
      });

      for (let i = 0; i < groundPanels.length; i += modulesPerString) {
        globalStringCount++;
        const slice = groundPanels.slice(i, i + modulesPerString);
        slice.forEach((p, seq) => {
          const strId = `${prefix}-${String(globalStringCount).padStart(2, '0')}`;
          this.store.updatePanelString(p.id, strId, seq + 1);
        });
      }
    }

    this.render();
  });
}
