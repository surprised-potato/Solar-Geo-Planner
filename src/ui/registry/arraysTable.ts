/**
 * Registry "arrays" schedule table.
 */
import { ArrayZone, SolarSystem } from '../../types/solar';
import { calculateGeodeticDistanceM, computePolygonAreaSqM } from '../../geo/projection';
import type { RegistryModalUI } from '../registryModal';
import { MountType } from '../../types/solar';
import { escapeHtml } from '../../utils/html';

/**
 * 1. ARRAYS TABLE VIEW
 * Allows directly modifying array properties: Name, Color, System, Mount, Model, Tilt, Azimuth, Orientation, Pitch, Gap, Setback, Raceway Δh.
 */
export function renderArraysTable(
  this: RegistryModalUI,
  zones: ArrayZone[],
  allSystems?: SolarSystem[]
): string {
  let filteredZones = zones;
  if (this.searchKeyword) {
    const q = this.searchKeyword.toLowerCase();
    filteredZones = filteredZones.filter(z => z.name.toLowerCase().includes(q) || z.id.toLowerCase().includes(q));
  }
  if (this.filterSystemId !== 'all') {
    filteredZones = filteredZones.filter(z => z.systemId === this.filterSystemId);
  }

  const systems = allSystems || this.store.getSystems();
  const modules = this.store.getModules();

  return `
    <div class="registry-toolbar">
      <div class="filters-row">
        <input type="search" id="modal-search" class="input-text" placeholder="Search array name or ID..." value="${this.searchKeyword}" />
        <select id="modal-system-filter" class="input-select" title="Filter by system">
          <option value="all">All Systems (${systems.length})</option>
          ${systems.map(s => `<option value="${s.id}" ${this.filterSystemId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="tbl-action-hint">
        <span class="icon">✏️</span> Edit array properties (System, Mount, Model, Tilt, Azimuth, Pitch, Gap, Setback, &Delta;h) directly in the table!
      </div>
    </div>

    <div tabindex="0" role="region" aria-label="Arrays Schedule Table" class="table-container table-wrapper">
      <table class="registry-table responsive-data-table">
        <thead>
          <tr>
            <th>Array Name</th>
            <th>System</th>
            <th>Mount</th>
            <th>Mount Structure / Tables</th>
            <th>Module Model</th>
            <th>Panels</th>
            <th>Capacity</th>
            <th>Tilt / Azimuth / Orient</th>
            <th>Pitch / Gap</th>
            <th>Setback</th>
            <th>Footprint</th>
            <th>Raceway & Δh</th>
            <th style="text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${
            filteredZones.length === 0
              ? `<tr><td colspan="13" class="empty-table-cell">No arrays found matching current criteria.</td></tr>`
              : filteredZones
                  .map(z => {
                    const areaSqM = computePolygonAreaSqM(z.vertices);
                    const totalZonePanels = this.store.getPanels().filter(p => p.zoneId === z.id).length;

                    let racewayPathLen = 0;
                    if (z.raceway && z.raceway.path && z.raceway.path.length >= 2) {
                      for (let i = 0; i < z.raceway.path.length - 1; i++) {
                        racewayPathLen += calculateGeodeticDistanceM(z.raceway.path[i], z.raceway.path[i + 1]);
                      }
                    }
                    const elevM = z.raceway ? z.raceway.elevationChangeM : (z.elevationDeltaM ?? 0);
                    const isGround = z.config.mountType === 'ground';

                    return `
                <tr>
                  <td>
                    <div class="entity-badge-cell">
                      <input type="color" class="input-tbl-color input-tbl-zone-color" data-zone-id="${z.id}" value="${z.color}" title="Change array color" />
                      <input type="text" class="input-tbl-text input-tbl-zone-name" data-zone-id="${z.id}" value="${escapeHtml(z.name)}" title="Edit array name" style="width: 120px; font-weight: 600;" />
                    </div>
                  </td>
                  <td>
                    <select class="input-tbl-select sel-zone-system" data-zone-id="${z.id}" title="Reassign array to an electrical system">
                      ${systems.map(s => `<option value="${s.id}" ${s.id === z.systemId ? 'selected' : ''}>${escapeHtml(s.name.split(':')[0])}</option>`).join('')}
                    </select>
                  </td>
                  <td>
                    <select class="input-tbl-select sel-zone-mount" data-zone-id="${z.id}" title="Toggle Roof Mount vs Ground Mount">
                      <option value="roof" ${z.config.mountType === 'roof' ? 'selected' : ''}>🏢 Roof</option>
                      <option value="ground" ${z.config.mountType === 'ground' ? 'selected' : ''}>🌱 Ground</option>
                    </select>
                  </td>
                  <td>
                    ${
                      isGround
                        ? `
                      <div class="inline-field-pair" style="flex-direction: column; align-items: flex-start; gap: 3px;">
                        <span class="badge highlight" style="font-size: 10px;">🏗️ ${z.tableCount ?? (z.tables ? z.tables.length : 0)} tbls</span>
                        <div style="display: flex; align-items: center; gap: 3px;">
                          <span class="tbl-unit-label" title="Modules Up (Table Rows)">Up:</span>
                          <input type="number" class="input-tbl-num input-tbl-zone-table-up" data-zone-id="${z.id}" value="${z.config.modulesPerTableUp ?? 2}" min="1" max="6" step="1" title="Modules Up (Table Rows)" style="width: 36px;" />
                          <span class="tbl-unit-label" title="Modules Wide (Table Columns)">W:</span>
                          <input type="number" class="input-tbl-num input-tbl-zone-table-wide" data-zone-id="${z.id}" value="${z.config.modulesPerTableWide ?? 14}" min="1" max="60" step="1" title="Modules Wide (Table Columns)" style="width: 40px;" />
                          <span class="tbl-unit-label" title="Inter-Table Gap / E-W Aisle (m)">Gap:</span>
                          <input type="number" class="input-tbl-num input-tbl-zone-table-gap" data-zone-id="${z.id}" value="${z.config.tableSpacingM ?? 1.0}" min="0.1" max="10" step="0.1" title="Inter-Table Gap / E-W Aisle (m)" style="width: 44px;" /><span class="tbl-unit-label">m</span>
                        </div>
                      </div>
                    `
                        : `
                      <div class="inline-field-pair" style="flex-direction: column; align-items: flex-start; gap: 3px;">
                        <span class="badge accent" style="font-size: 10px;">🛤️ ${z.railCount ?? (z.rails ? z.rails.length : 0)} rails</span>
                        <div style="display: flex; align-items: center; gap: 3px;">
                          <select class="input-tbl-select sel-zone-rail-count" data-zone-id="${z.id}" title="Parallel Rails per Panel" style="width: 72px;">
                            <option value="2" ${(z.config.railCount ?? 2) === 2 ? 'selected' : ''}>2 Rails</option>
                            <option value="3" ${(z.config.railCount ?? 2) === 3 ? 'selected' : ''}>3 Rails</option>
                          </select>
                        </div>
                      </div>
                    `
                    }
                  </td>
                  <td>
                    <select class="input-tbl-select sel-zone-module" data-zone-id="${z.id}" title="Select PV module model">
                      ${modules.map(m => `<option value="${m.id}" ${m.id === z.moduleId ? 'selected' : ''}>${escapeHtml(m.name.split(' ')[0])} ${m.nominalPowerW}W</option>`).join('')}
                    </select>
                  </td>
                  <td>
                    <b>${z.activePanelCount}</b> <small class="text-dim">/ ${totalZonePanels}</small>
                  </td>
                  <td>
                    <strong style="color: var(--accent-green);">${z.totalKwp.toFixed(2)} kWp</strong>
                  </td>
                  <td>
                    <div class="inline-field-pair">
                      <input type="number" class="input-tbl-num input-tbl-zone-tilt" data-zone-id="${z.id}" value="${z.config.tiltDeg}" min="0" max="90" step="1" title="Tilt angle (°)" style="width: 44px;" /><span class="tbl-unit-label">°</span>
                      <input type="number" class="input-tbl-num input-tbl-zone-azimuth" data-zone-id="${z.id}" value="${z.config.azimuthDeg}" min="0" max="360" step="1" title="Azimuth angle (°)" style="width: 48px;" /><span class="tbl-unit-label">°</span>
                      <select class="input-tbl-select sel-zone-orient" data-zone-id="${z.id}" title="Module orientation" style="width: 60px;">
                        <option value="portrait" ${z.config.orientation === 'portrait' ? 'selected' : ''}>Port</option>
                        <option value="landscape" ${z.config.orientation === 'landscape' ? 'selected' : ''}>Land</option>
                      </select>
                    </div>
                  </td>
                  <td>
                    <div class="inline-field-pair">
                      <span class="tbl-unit-label">P:</span>
                      <input type="number" class="input-tbl-num input-tbl-zone-row-spacing" data-zone-id="${z.id}" value="${z.config.rowSpacingM}" min="0.1" max="20" step="0.05" title="Row pitch (m)" style="width: 50px;" /><span class="tbl-unit-label">m</span>
                      <span class="tbl-unit-label">G:</span>
                      <input type="number" class="input-tbl-num input-tbl-zone-col-spacing" data-zone-id="${z.id}" value="${z.config.colSpacingM}" min="0.01" max="5" step="0.01" title="Module gap (m)" style="width: 46px;" /><span class="tbl-unit-label">m</span>
                    </div>
                  </td>
                  <td>
                    <div class="inline-field-pair">
                      <input type="number" class="input-tbl-num input-tbl-zone-setback" data-zone-id="${z.id}" value="${z.config.setbackM}" min="0" max="20" step="0.1" title="Boundary setback (m)" style="width: 48px;" /><span class="tbl-unit-label">m</span>
                    </div>
                  </td>
                  <td>
                    ${Math.round(areaSqM).toLocaleString()} m²
                  </td>
                  <td>
                    <div class="inline-field-pair">
                      ${
                        z.raceway
                          ? `<span class="badge highlight" title="Raceway conduit drawn: ${racewayPathLen.toFixed(1)}m">🛤️ ${racewayPathLen.toFixed(1)}m</span>`
                          : `<span class="badge" title="Direct point-to-point cable fallback">Direct</span>`
                      }
                      <span class="tbl-unit-label">&Delta;h:</span>
                      <input type="number" class="input-tbl-num input-tbl-zone-elev" data-zone-id="${z.id}" value="${elevM}" step="0.5" title="Vertical drop / riser &Delta;h (m)" style="width: 50px;" /><span class="tbl-unit-label">m</span>
                    </div>
                  </td>
                  <td style="text-align: right; white-space: nowrap;">
                    <button class="btn btn-xs btn-jump-zone" data-zone-id="${z.id}" title="Zoom map to this array">🎯 Zoom</button>
                    <button class="btn btn-xs btn-outline btn-opt-zone" data-zone-id="${z.id}" title="Optimize grid shift to maximize panel count and auto-string electrical strings">⚡ Opt</button>
                    <button class="btn btn-xs btn-outline danger btn-delete-zone" data-zone-id="${z.id}" title="Delete array">🗑️</button>
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

/** In-schedule property editing and actions for the arrays table. */
export function attachArraysTableListeners(this: RegistryModalUI): void {
  // 3. Arrays Table Actions & In-Schedule Property Editing
  this.dialog.querySelectorAll('.input-tbl-zone-name').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId) {
        this.store.updateZoneName(zoneId, target.value);
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-zone-color').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId) {
        this.store.updateZoneColor(zoneId, target.value);
      }
    });
  });

  this.dialog.querySelectorAll('.sel-zone-system').forEach(sel => {
    sel.addEventListener('change', e => {
      const target = e.currentTarget as HTMLSelectElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId && target.value) {
        this.store.linkZoneToSystem(zoneId, target.value);
      }
    });
  });

  this.dialog.querySelectorAll('.sel-zone-mount').forEach(sel => {
    sel.addEventListener('change', e => {
      const target = e.currentTarget as HTMLSelectElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId && target.value) {
        this.store.updateZoneConfig(zoneId, { mountType: target.value as MountType });
      }
    });
  });

  this.dialog.querySelectorAll('.sel-zone-module').forEach(sel => {
    sel.addEventListener('change', e => {
      const target = e.currentTarget as HTMLSelectElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId && target.value) {
        this.store.setArrayModule(zoneId, target.value);
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-zone-tilt').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId) {
        this.store.updateZoneConfig(zoneId, {
          tiltDeg: Math.max(0, Math.min(90, parseFloat(target.value) || 0))
        });
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-zone-azimuth').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId) {
        this.store.updateZoneConfig(zoneId, {
          azimuthDeg: Math.max(0, Math.min(360, parseFloat(target.value) || 0))
        });
      }
    });
  });

  this.dialog.querySelectorAll('.sel-zone-orient').forEach(sel => {
    sel.addEventListener('change', e => {
      const target = e.currentTarget as HTMLSelectElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId) {
        this.store.updateZoneConfig(zoneId, {
          orientation: target.value as 'portrait' | 'landscape'
        });
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-zone-row-spacing').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId) {
        this.store.updateZoneConfig(zoneId, {
          rowSpacingM: Math.max(0.1, parseFloat(target.value) || 1)
        });
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-zone-col-spacing').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId) {
        this.store.updateZoneConfig(zoneId, {
          colSpacingM: Math.max(0.01, parseFloat(target.value) || 0.02)
        });
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-zone-setback').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId) {
        this.store.updateZoneConfig(zoneId, {
          setbackM: Math.max(0, parseFloat(target.value) || 0)
        });
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-zone-table-up').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId) {
        this.store.updateZoneConfig(zoneId, {
          modulesPerTableUp: Math.max(1, Math.min(10, parseInt(target.value, 10) || 1))
        });
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-zone-table-wide').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId) {
        this.store.updateZoneConfig(zoneId, {
          modulesPerTableWide: Math.max(1, Math.min(100, parseInt(target.value, 10) || 1))
        });
      }
    });
  });

  this.dialog.querySelectorAll('.sel-zone-rail-count').forEach(select => {
    select.addEventListener('change', e => {
      const target = e.currentTarget as HTMLSelectElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId) {
        const count = parseInt(target.value, 10) === 3 ? 3 : 2;
        this.store.updateZoneConfig(zoneId, { railCount: count });
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-zone-table-gap').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId) {
        this.store.updateZoneConfig(zoneId, {
          tableSpacingM: Math.max(0.05, Math.min(20, parseFloat(target.value) || 0.1))
        });
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-zone-elev').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId) {
        this.store.setRacewayElevationChange(zoneId, parseFloat(target.value) || 0);
      }
    });
  });

  this.dialog.querySelectorAll('.btn-opt-zone').forEach(btn => {
    btn.addEventListener('click', e => {
      const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
      if (zoneId) {
        const res = this.store.optimizeZoneGridShift(zoneId);
        let msg = `⚡ Array Grid Shift Optimized & Auto-Strung!\n\nPanels increased from ${res.previousPanelCount} to ${res.maxPanelCount} panels.`;
        if (res.totalStrings !== undefined) {
          msg += `\n⚡ Auto-Strung into ${res.totalStrings} Strings (${res.modulesPerString || 0} modules/str)!`;
        }
        if (res.warnings && res.warnings.length > 0) {
          msg += `\n\n⚠️ Notices:\n` + res.warnings.join('\n');
        }
        alert(msg);
      }
    });
  });

  this.dialog.querySelectorAll('.btn-jump-zone').forEach(btn => {
    btn.addEventListener('click', e => {
      const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
      if (zoneId) {
        this.store.selectZone(zoneId);
        this.mapController?.zoomToZone(zoneId);
        this.close();
      }
    });
  });

  this.dialog.querySelectorAll('.btn-select-zone').forEach(btn => {
    btn.addEventListener('click', e => {
      const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
      if (zoneId) {
        this.store.selectZone(zoneId);
        this.mapController?.zoomToZone(zoneId);
        this.close();
      }
    });
  });

  this.dialog.querySelectorAll('.btn-delete-zone').forEach(btn => {
    btn.addEventListener('click', e => {
      const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
      if (zoneId) {
        const z = this.store.getZone(zoneId);
        if (confirm(`Delete array "${z?.name || zoneId}" and all its panels?`)) {
          this.store.removeZone(zoneId);
        }
      }
    });
  });
}
