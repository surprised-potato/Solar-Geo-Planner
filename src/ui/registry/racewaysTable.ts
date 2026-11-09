/**
 * Registry "raceways" (DC homerun / AC feeder) schedule table.
 */
import { ArrayZone, SolarSystem } from '../../types/solar';
import { calculateGeodeticDistanceM } from '../../geo/projection';
import type { RegistryModalUI } from '../registryModal';
import { escapeHtml } from '../../utils/html';
import { filterZones } from './registryFilters';

/**
 * 3. RACEWAYS TABLE VIEW
 */
export function renderRacewaysTable(
  this: RegistryModalUI,
  zones: ArrayZone[],
  allSystems?: SolarSystem[]
): string {
  const filteredZones = filterZones(zones, this.searchKeyword, this.filterSystemId);

  const systems = allSystems || this.store.getSystems();

  return `
    <div class="registry-toolbar">
      <div class="filters-row">
        <input type="search" id="modal-search" class="input-text" placeholder="Search array name..." value="${this.searchKeyword}" />
        <select id="modal-system-filter" class="input-select" title="Filter by system">
          <option value="all">All Systems (${systems.length})</option>
          ${systems.map(s => `<option value="${s.id}" ${this.filterSystemId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="tbl-action-hint">
        <span class="icon">💡</span> Raceways provide physical conduit paths from array boundaries to the Inverter Power House.
      </div>
    </div>

    <div tabindex="0" role="region" aria-label="Raceways Schedule Table" class="table-container table-wrapper">
      <table class="registry-table responsive-data-table">
        <thead>
          <tr>
            <th>Array Zone</th>
            <th>System</th>
            <th>Status</th>
            <th>Waypoints</th>
            <th>2D Path Length</th>
            <th>Elevation Drop (&Delta;h)</th>
            <th>Exit to Inverter</th>
            <th>Conduit Run / Conductor</th>
            <th>Strings</th>
            <th>Total Conductor Wire</th>
            <th style="text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${
            filteredZones.length === 0
              ? `<tr><td colspan="11" class="empty-table-cell">No raceways found matching criteria.</td></tr>`
              : filteredZones
                  .map(z => {
                    const sys = this.store.getSystem(z.systemId);
                    const activeHomerun = z.raceway || this.store.getHomerunForZone(z.id);
                    const hasRaceway = Boolean(activeHomerun && activeHomerun.path && activeHomerun.path.length >= 2);
                    const isShared = !z.raceway && Boolean(sys?.homerunRaceway);

                    let pathLen2D = 0;
                    if (hasRaceway && activeHomerun) {
                      for (let i = 0; i < activeHomerun.path.length - 1; i++) {
                        pathLen2D += calculateGeodeticDistanceM(activeHomerun.path[i], activeHomerun.path[i + 1]);
                      }
                    }

                    const elevM = Math.abs(activeHomerun ? activeHomerun.elevationChangeM : (z.elevationDeltaM ?? 0));

                    let distToInv = 0;
                    if (hasRaceway && activeHomerun && sys?.inverterLocation) {
                      const exitPt = activeHomerun.path[activeHomerun.path.length - 1];
                      distToInv = calculateGeodeticDistanceM(exitPt, sys.inverterLocation);
                    }

                    const singleRunM = pathLen2D + elevM + distToInv;

                    const zonePanels = this.store.getPanels().filter(p => p.zoneId === z.id && p.active && p.stringId);
                    const stringSet = new Set(zonePanels.map(p => p.stringId));
                    const stringCount = stringSet.size;
                    const totalWireInRacewayM = stringCount * 2 * singleRunM;

                    return `
                <tr>
                  <td>
                    <div class="entity-badge-cell">
                      <span class="color-badge" style="background: ${z.color};"></span>
                      <strong>${escapeHtml(z.name)}</strong>
                    </div>
                  </td>
                  <td>
                    <span class="badge" style="background: ${sys?.color || '#0284c7'}; color: #fff;">
                      ${escapeHtml(sys?.name?.split(':')[0] || 'System')}
                    </span>
                  </td>
                  <td>
                    ${
                      isShared
                        ? `<span class="badge highlight">⚡ Auto Homerun</span>`
                        : hasRaceway
                        ? `<span class="badge highlight">🛤️ Array Raceway</span>`
                        : `<span class="badge" style="color: var(--text-dim);">Direct Fallback</span>`
                    }
                  </td>
                  <td>
                    ${hasRaceway && activeHomerun ? `<b>${activeHomerun.path.length}</b> nodes` : '<span class="text-dim">—</span>'}
                  </td>
                  <td>
                    ${hasRaceway ? `<b>${pathLen2D.toFixed(1)} m</b>` : '<span class="text-dim">—</span>'}
                  </td>
                  <td>
                    <div class="inline-field-pair">
                      <input type="number" class="input-tbl-num input-tbl-raceway-elev" data-zone-id="${z.id}" value="${elevM}" step="0.5" title="Conduit / vertical drop &Delta;h (m)" style="width: 58px;" /><span class="tbl-unit-label">m</span>
                    </div>
                  </td>
                  <td>
                    ${
                      sys?.inverterLocation
                        ? `${distToInv.toFixed(1)} m`
                        : `<span class="text-dim">No station</span>`
                    }
                  </td>
                  <td>
                    <strong style="color: var(--accent-green);">${singleRunM.toFixed(1)} m</strong>
                  </td>
                  <td>
                    <b>${stringCount} strings</b> <small class="text-dim">(${stringCount * 2} leads)</small>
                  </td>
                  <td>
                    ${
                      totalWireInRacewayM > 0
                        ? `<strong style="color: var(--accent-amber);">${totalWireInRacewayM.toFixed(1)} m</strong>`
                        : `<span class="text-dim">—</span>`
                    }
                  </td>
                  <td style="text-align: right; white-space: nowrap;">
                    ${
                      hasRaceway
                        ? `
                      <button class="btn btn-xs btn-jump-raceway" data-zone-id="${z.id}" title="Zoom to raceway path">🎯 Zoom</button>
                      <button class="btn btn-xs btn-draw-raceway-act" data-zone-id="${z.id}" title="Redraw raceway on map">✏️ Redraw</button>
                      <button class="btn btn-xs btn-outline danger btn-clear-raceway-act" data-zone-id="${z.id}" title="Clear raceway">✕ Clear</button>
                    `
                        : `
                      <button class="btn btn-xs btn-outline warning btn-draw-raceway-act" data-zone-id="${z.id}" title="Draw raceway on satellite map">🛤️ Draw Raceway</button>
                    `
                    }
                  </td>
                </tr>
              `;
                  })
                  .join('')
          }
        </tbody>
      </table>
    </div>

    <!-- AC Feeder Raceways Schedule (Inverter to PCC Interconnection) -->
    <div style="margin-top: 24px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
      <h4 style="margin: 0; font-size: 13px; color: #06b6d4; font-weight: 700; display: flex; align-items: center; gap: 6px;">
        <span>⚡</span> AC FEEDER RACEWAYS &amp; INTERCONNECTION SCHEDULE (PEC Article 2.15)
      </h4>
      <span class="badge highlight">${systems.length} Systems Configured</span>
    </div>

    <div tabindex="0" role="region" aria-label="AC Feeder Raceways Table" class="table-container table-wrapper">
      <table class="registry-table responsive-data-table">
        <thead>
          <tr>
            <th>System</th>
            <th>AC Interconnection (PCC)</th>
            <th>Status</th>
            <th>Waypoints</th>
            <th>Route Length</th>
            <th>Elevation (&Delta;h)</th>
            <th>Total Feeder Run</th>
            <th>Conductor Sizing (PEC 75°C)</th>
            <th>Conduit (EMT/RMC)</th>
            <th>V-Drop (% &amp; V)</th>
            <th>PEC 2.15 Limit</th>
            <th style="text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${systems.map(s => {
            const feeder = this.store.getSystemAcFeederSummary(s.id);
            return `
              <tr>
                <td>
                  <div class="entity-badge-cell">
                    <span class="color-dot" style="background-color: ${s.color};"></span>
                    <b>${escapeHtml(s.name)}</b>
                  </div>
                </td>
                <td>
                  ${s.acInterconnectionLocation ? `<span class="badge accent">🏢 ${s.acInterconnectionLocation.lat.toFixed(4)}, ${s.acInterconnectionLocation.lng.toFixed(4)}</span>` : '<span class="text-dim">Not pinned</span>'}
                </td>
                <td>
                  ${feeder.hasRaceway ? '<span class="badge highlight">⚡ AC Feeder Drawn</span>' : s.acInterconnectionLocation && s.inverterLocation ? '<span class="badge">Direct Route</span>' : '<span class="badge warning">No Route</span>'}
                </td>
                <td>
                  ${s.acRaceway ? `<b>${s.acRaceway.path.length}</b> nodes` : '<span class="text-dim">—</span>'}
                </td>
                <td>
                  ${feeder.racewayLengthM > 0 ? `<b>${feeder.racewayLengthM.toFixed(1)} m</b>` : '<span class="text-dim">—</span>'}
                </td>
                <td>
                  ${feeder.elevationDeltaM} m
                </td>
                <td>
                  <strong style="color: var(--accent-green);">${feeder.totalRunM} m</strong>
                </td>
                <td>
                  <small style="color: #38bdf8; font-weight: 600;">${escapeHtml(feeder.conductorCallout)}</small>
                </td>
                <td>
                  <small>${escapeHtml(feeder.conduitCallout)}</small>
                </td>
                <td>
                  <strong style="color: ${feeder.isCompliant ? '#10b981' : '#ef4444'};">${feeder.voltageDropPercent}% (${feeder.voltageDropV}V)</strong>
                </td>
                <td>
                  <span class="badge ${feeder.isCompliant ? 'highlight' : 'danger'}">${feeder.isCompliant ? '✅ ≤3% OK' : '⚠️ >3% Drop'}</span>
                </td>
                <td style="text-align: right; white-space: nowrap;">
                  <button class="btn btn-xs btn-outline accent btn-jump-ac-raceway" data-sys-id="${s.id}" ${s.acRaceway ? '' : 'disabled'} title="Zoom to AC Feeder">🎯 Feeder</button>
                  <button class="btn btn-xs btn-outline warning btn-draw-ac-raceway-act" data-sys-id="${s.id}" title="Draw AC Feeder Raceway on satellite map">⚡ Draw Feeder</button>
                  ${s.acRaceway ? `<button class="btn btn-xs btn-outline danger btn-clear-ac-raceway-act" data-sys-id="${s.id}" title="Delete AC Feeder">🗑️</button>` : ''}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/** In-schedule property editing and actions for the raceways table. */
export function attachRacewaysTableListeners(this: RegistryModalUI): void {
  // 5. Raceways Table Actions & In-Schedule Property Editing
  this.dialog.querySelectorAll('.input-tbl-raceway-elev').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const zoneId = target.getAttribute('data-zone-id');
      if (zoneId) {
        this.store.setRacewayElevationChange(zoneId, parseFloat(target.value) || 0);
      }
    });
  });

  this.dialog.querySelectorAll('.btn-jump-raceway').forEach(btn => {
    btn.addEventListener('click', e => {
      const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
      if (zoneId) {
        this.store.selectZone(zoneId);
        this.mapController?.zoomToRaceway(zoneId);
        this.close();
      }
    });
  });

  this.dialog.querySelectorAll('.btn-draw-raceway-act').forEach(btn => {
    btn.addEventListener('click', e => {
      const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
      if (zoneId) {
        this.store.selectZone(zoneId);
        this.mapController?.zoomToZone(zoneId);
        this.store.setDrawingMode('raceway');
        this.close();
      }
    });
  });

  this.dialog.querySelectorAll('.btn-clear-raceway-act').forEach(btn => {
    btn.addEventListener('click', e => {
      const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
      if (zoneId && confirm('Clear this raceway path?')) {
        this.store.clearZoneRaceway(zoneId);
      }
    });
  });

  this.dialog.querySelectorAll('.btn-jump-ac-raceway').forEach(btn => {
    btn.addEventListener('click', e => {
      const sysId = (e.currentTarget as HTMLElement).getAttribute('data-sys-id');
      if (sysId) {
        this.store.selectSystem(sysId);
        this.mapController?.zoomToAcRaceway(sysId);
        this.close();
      }
    });
  });

  this.dialog.querySelectorAll('.btn-draw-ac-raceway-act').forEach(btn => {
    btn.addEventListener('click', e => {
      const sysId = (e.currentTarget as HTMLElement).getAttribute('data-sys-id');
      if (sysId) {
        this.store.selectSystem(sysId);
        this.store.setDrawingMode('ac_raceway');
        this.close();
      }
    });
  });

  this.dialog.querySelectorAll('.btn-clear-ac-raceway-act').forEach(btn => {
    btn.addEventListener('click', e => {
      const sysId = (e.currentTarget as HTMLElement).getAttribute('data-sys-id');
      if (sysId && confirm('Clear AC Feeder raceway path?')) {
        this.store.clearSystemAcRaceway(sysId);
        this.render();
      }
    });
  });
}
