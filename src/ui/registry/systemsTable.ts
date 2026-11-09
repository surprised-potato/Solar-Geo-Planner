/**
 * Registry "systems" schedule table.
 */
import {
  SolarSystem,
  GENERIC_INVERTER_PRESETS,
  STANDARD_AC_VOLTAGES_3PHASE,
  STANDARD_AC_VOLTAGES_1PHASE
} from '../../types/solar';
import type { RegistryModalUI } from '../registryModal';
import { AcPhaseType, MdpTapType } from '../../types/solar';
import { escapeHtml } from '../../utils/html';

/**
 * 2. SYSTEMS TABLE VIEW
 * Allows directly modifying system properties: Name, Color, Inverter Preset, Inverter Count, AC Power, MPPTs, Strings/MPPT, Elevation Δh.
 */
export function renderSystemsTable(
  this: RegistryModalUI,
  systems: SolarSystem[],
  allSystems?: SolarSystem[]
): string {
  const sysList = allSystems || this.store.getSystems();
  let filteredSystems = systems;
  if (this.searchKeyword) {
    const q = this.searchKeyword.toLowerCase();
    filteredSystems = filteredSystems.filter(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
  }
  if (this.filterSystemId !== 'all') {
    filteredSystems = filteredSystems.filter(s => s.id === this.filterSystemId);
  }

  return `
    <div class="registry-toolbar">
      <div class="filters-row">
        <input type="search" id="modal-search" class="input-text" placeholder="Search system name or ID..." value="${this.searchKeyword}" />
        <select id="modal-system-filter" class="input-select" title="Filter by system">
          <option value="all">All Systems (${sysList.length})</option>
          ${sysList.map(s => `<option value="${s.id}" ${this.filterSystemId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="tbl-action-hint">
        <span class="icon">✏️</span> Edit system inverters, AC capacities, MPPT channels, and station elevations directly in the table!
      </div>
    </div>

    <div tabindex="0" role="region" aria-label="Systems Summary Table" class="table-container table-wrapper">
      <table class="registry-table responsive-data-table">
        <thead>
          <tr>
            <th>System Name</th>
            <th>Linked Arrays</th>
            <th>Panels & DC</th>
            <th>Inverter Preset</th>
            <th>Inverter Qty & AC</th>
            <th>AC Config</th>
            <th>MPPT & Strings</th>
            <th>DC/AC Ratio</th>
            <th>Station Point & &Delta;h</th>
            <th>AC PCC Point & &Delta;h</th>
            <th>AC Feeder & VDrop</th>
            <th>Total DC Wire</th>
            <th>Homerun</th>
            <th>Raceway</th>
            <th style="text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${
            filteredSystems.length === 0
              ? `<tr><td colspan="15" class="empty-table-cell">No systems found matching criteria.</td></tr>`
              : filteredSystems
                  .map(sys => {
                    const summary = this.store.getSystemSummary(sys.id);
                    const cableSummary = this.store.getSystemCableSummary(sys.id);
                    const feederSummary = this.store.getSystemAcFeederSummary(sys.id);
                    const linkedZones = this.store.getZones().filter(z => z.systemId === sys.id);
                    const dcAcClass = summary.dcAcRatio > 1.35 ? 'warning' : 'highlight';

                    return `
                <tr>
                  <td>
                    <div class="entity-badge-cell">
                      <input type="color" class="input-tbl-color input-tbl-sys-color" data-sys-id="${sys.id}" value="${sys.color}" title="Change system color" />
                      <input type="text" class="input-tbl-text input-tbl-sys-name" data-sys-id="${sys.id}" value="${escapeHtml(sys.name)}" title="Edit system name" style="width: 140px; font-weight: 600;" />
                    </div>
                  </td>
                  <td>
                    <div class="linked-zones-cell" title="${escapeHtml(linkedZones.map(z => z.name).join(', '))}">
                      <b>${linkedZones.length} arrays</b>
                      <small class="text-dim">(${escapeHtml(linkedZones.map(z => z.name).join(', ') || 'None')})</small>
                    </div>
                  </td>
                  <td>
                    <b>${summary.totalActivePanels}</b> <small class="text-dim">mods</small>
                    <div><strong style="color: var(--accent-green);">${summary.totalKwp.toFixed(2)} kWp</strong></div>
                  </td>
                  <td>
                    <select class="input-tbl-select sel-sys-inv-preset" data-sys-id="${sys.id}" title="Select Inverter Preset Model">
                      ${GENERIC_INVERTER_PRESETS.map(p => {
                        const isSelected = p.id === sys.inverter.id || p.modelName === sys.inverter.modelName || (p.ratedAcPowerKw === sys.inverter.ratedAcPowerKw && p.mpptCountPerInverter === sys.inverter.mpptCountPerInverter);
                        return `<option value="${p.id}" ${isSelected ? 'selected' : ''}>${escapeHtml(p.modelName)}</option>`;
                      }).join('')}
                    </select>
                  </td>
                  <td>
                    <div class="inline-field-pair">
                      <input type="number" class="input-tbl-num input-tbl-sys-inv-count" data-sys-id="${sys.id}" value="${sys.inverter.inverterCount}" min="1" max="100" title="Inverter Count" style="width: 40px;" /><span class="tbl-unit-label">x</span>
                      <input type="number" class="input-tbl-num input-tbl-sys-inv-kw" data-sys-id="${sys.id}" value="${sys.inverter.ratedAcPowerKw}" min="1" max="5000" step="1" title="Rated AC kW per inverter (e.g. 6 kW, 30 kW, 100 kW)" style="width: 56px;" /><span class="tbl-unit-label">kW</span>
                    </div>
                    <small class="text-dim">Total: <b>${summary.inverterAcKw} kW AC</b></small>
                  </td>
                  <td>
                    <div class="inline-field-pair" style="display: flex; gap: 4px; align-items: center;">
                      <select class="input-tbl-select sel-sys-inv-phase" data-sys-id="${sys.id}" title="Inverter AC Output Phase" style="width: 55px; font-size: 11px;">
                        <option value="three_phase" ${(sys.inverter.phase || 'three_phase') === 'three_phase' ? 'selected' : ''}>3Φ</option>
                        <option value="single_phase" ${(sys.inverter.phase || 'three_phase') === 'single_phase' ? 'selected' : ''}>1Φ</option>
                      </select>
                      <select class="input-tbl-select sel-sys-inv-voltage" data-sys-id="${sys.id}" title="Nominal Inverter AC Line Voltage" style="width: 65px; font-size: 11px;">
                        ${((sys.inverter.phase || 'three_phase') === 'single_phase' ? STANDARD_AC_VOLTAGES_1PHASE : STANDARD_AC_VOLTAGES_3PHASE).map((v: number) => `
                          <option value="${v}" ${(sys.inverter.acVoltage || ((sys.inverter.phase || 'three_phase') === 'single_phase' ? 230 : 400)) === v ? 'selected' : ''}>${v}V</option>
                        `).join('')}
                        <option value="custom" ${!STANDARD_AC_VOLTAGES_3PHASE.concat(STANDARD_AC_VOLTAGES_1PHASE).includes(sys.inverter.acVoltage || 400) ? 'selected' : ''}>Custom</option>
                      </select>
                    </div>
                    <div style="display: flex; gap: 4px; align-items: center; margin-top: 3px;">
                      <small class="text-dim" style="font-size: 10px;">Tap:</small>
                      <select class="input-tbl-select sel-sys-tap-voltage" data-sys-id="${sys.id}" title="System Tapping Point Voltage (PEC 4.50)" style="width: 65px; font-size: 11px;">
                        ${((sys.inverter.phase || 'three_phase') === 'single_phase' ? STANDARD_AC_VOLTAGES_1PHASE : STANDARD_AC_VOLTAGES_3PHASE).map((v: number) => `
                          <option value="${v}" ${(sys.systemVoltageV ?? sys.inverter.acVoltage ?? ((sys.inverter.phase || 'three_phase') === 'single_phase' ? 230 : 400)) === v ? 'selected' : ''}>${v}V</option>
                        `).join('')}
                      </select>
                      ${feederSummary.hasTransformer ? `<span class="badge warning" title="Transformer Required: ${feederSummary.transformerKva}kVA" style="font-size: 9px; padding: 1px 4px;">⚡ XFM ${feederSummary.transformerKva}kVA</span>` : ''}
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center; margin-top: 3px; font-size: 10px;">
                      <label title="Enable AC Combiner Box" style="display: flex; align-items: center; gap: 2px; cursor: pointer;">
                        <input type="checkbox" class="chk-sys-ac-combiner" data-sys-id="${sys.id}" ${sys.hasAcCombiner ? 'checked' : ''} />
                        <span>ACB</span>
                      </label>
                      <select class="input-tbl-select sel-sys-mdp-tap" data-sys-id="${sys.id}" title="MDP Interconnection Tap Type" style="font-size: 10px; padding: 1px 2px;">
                        <option value="load_side" ${(sys.mdpTapType || 'load_side') === 'load_side' ? 'selected' : ''}>Load-Side (120%)</option>
                        <option value="line_side" ${(sys.mdpTapType || 'load_side') === 'line_side' ? 'selected' : ''}>Line-Side (Supply)</option>
                      </select>
                    </div>
                  </td>
                  <td>
                    <div class="inline-field-pair">
                      <input type="number" class="input-tbl-num input-tbl-sys-inv-mppts" data-sys-id="${sys.id}" value="${sys.inverter.mpptCountPerInverter}" min="1" max="24" title="MPPT trackers per inverter" style="width: 38px;" /><span class="tbl-unit-label">MPPT</span>
                      <input type="number" class="input-tbl-num input-tbl-sys-inv-str-mppt" data-sys-id="${sys.id}" value="${sys.inverter.maxStringsPerMppt}" min="1" max="10" title="Max strings per MPPT" style="width: 36px;" /><span class="tbl-unit-label">str/mppt</span>
                    </div>
                  </td>
                  <td>
                    <span class="badge ${dcAcClass}">
                      ${summary.dcAcRatio.toFixed(2)}
                    </span>
                  </td>
                  <td>
                    ${
                      sys.inverterLocation
                        ? `<div class="inline-field-pair">
                            <span class="badge accent" title="Inverter Station Coords">📍 ${sys.inverterLocation.lat.toFixed(4)}, ${sys.inverterLocation.lng.toFixed(4)}</span>
                            <span class="tbl-unit-label">&Delta;h:</span>
                            <input type="number" class="input-tbl-num input-tbl-sys-inv-elev" data-sys-id="${sys.id}" value="${sys.inverterElevationM ?? 0}" step="0.5" title="Inverter Station Base Elevation (m)" style="width: 48px;" /><span class="tbl-unit-label">m</span>
                          </div>`
                        : `<span class="text-dim">Not geoplaced</span>`
                    }
                  </td>
                  <td>
                    ${
                      sys.acInterconnectionLocation
                        ? `<div class="inline-field-pair">
                            <span class="badge accent" title="PCC Coords">🏢 ${sys.acInterconnectionLocation.lat.toFixed(4)}, ${sys.acInterconnectionLocation.lng.toFixed(4)}</span>
                            <span class="tbl-unit-label">&Delta;h:</span>
                            <input type="number" class="input-tbl-num input-tbl-sys-pcc-elev" data-sys-id="${sys.id}" value="${sys.acInterconnectionElevationM ?? 0}" step="0.5" title="AC Interconnection Base Elevation (m)" style="width: 48px;" /><span class="tbl-unit-label">m</span>
                          </div>`
                        : `<span class="text-dim">Not pinned</span>`
                    }
                  </td>
                  <td>
                    ${
                      feederSummary.totalRunM > 0
                        ? `<div><b>${feederSummary.totalRunM} m</b> <span class="badge ${feederSummary.isCompliant ? 'highlight' : 'warning'}">${feederSummary.voltageDropPercent}% Vd</span></div>
                           <small class="text-dim">${escapeHtml(feederSummary.conductorCallout.split(' + ')[0])}</small>`
                        : `<span class="text-dim">—</span>`
                    }
                  </td>
                  <td>
                    <strong style="color: var(--accent-green);">${cableSummary.totalCableLengthM} m</strong>
                  </td>
                  <td>
                    ${cableSummary.totalHomerunM} m
                  </td>
                  <td>
                    ${
                      cableSummary.totalRacewayLengthM > 0
                        ? `<strong style="color: var(--accent-amber);">${cableSummary.totalRacewayLengthM} m</strong>`
                        : `<span class="text-dim">—</span>`
                    }
                  </td>
                  <td style="text-align: right; white-space: nowrap;">
                    <button class="btn btn-xs btn-jump-inverter" data-sys-id="${sys.id}" ${sys.inverterLocation ? '' : 'disabled'} title="Zoom to Inverter Station point">🎯 Station</button>
                    <button class="btn btn-xs btn-jump-pcc" data-sys-id="${sys.id}" ${sys.acInterconnectionLocation ? '' : 'disabled'} title="Zoom to AC PCC point">🎯 PCC</button>
                    <button class="btn btn-xs btn-select-system" data-sys-id="${sys.id}" title="Select this system">✏️ Select</button>
                    <button class="btn btn-xs btn-primary btn-auto-string-system" data-sys-id="${sys.id}" title="Auto-string all arrays in this system">⚡ Auto-String</button>
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

/** In-schedule property editing and actions for the systems table. */
export function attachSystemsTableListeners(this: RegistryModalUI): void {
  // 4. Systems Table Actions & In-Schedule Property Editing
  this.dialog.querySelectorAll('.input-tbl-sys-name').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const sysId = target.getAttribute('data-sys-id');
      if (sysId && target.value.trim()) {
        this.store.updateSystem(sysId, { name: target.value.trim() });
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-sys-color').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const sysId = target.getAttribute('data-sys-id');
      if (sysId) {
        this.store.updateSystem(sysId, { color: target.value });
      }
    });
  });

  this.dialog.querySelectorAll('.sel-sys-inv-preset').forEach(sel => {
    sel.addEventListener('change', e => {
      const target = e.currentTarget as HTMLSelectElement;
      const sysId = target.getAttribute('data-sys-id');
      if (sysId && target.value) {
        this.store.setSystemInverterPreset(sysId, target.value);
      }
    });
  });

  this.dialog.querySelectorAll('.sel-sys-inv-phase').forEach(sel => {
    sel.addEventListener('change', e => {
      const target = e.currentTarget as HTMLSelectElement;
      const sysId = target.getAttribute('data-sys-id');
      if (sysId) {
        const phase = target.value as AcPhaseType;
        const defaultVac = phase === 'single_phase' ? 230 : 400;
        this.store.updateSystemInverter(sysId, { phase, acVoltage: defaultVac });
        this.render();
      }
    });
  });

  this.dialog.querySelectorAll('.sel-sys-inv-voltage').forEach(sel => {
    sel.addEventListener('change', e => {
      const target = e.currentTarget as HTMLSelectElement;
      const sysId = target.getAttribute('data-sys-id');
      if (!sysId) return;
      if (target.value === 'custom') {
        const currentSys = this.store.getSystem(sysId);
        const val = prompt('Enter custom AC Line Voltage in Volts (e.g. 480, 208, 240, 230):', String(currentSys?.inverter.acVoltage || 400));
        if (val && Number(val) > 0) {
          this.store.updateSystemInverter(sysId, { acVoltage: Number(val) });
          this.render();
        }
      } else {
        const vac = Number(target.value);
        if (vac > 0) {
          this.store.updateSystemInverter(sysId, { acVoltage: vac });
        }
      }
    });
  });

  this.dialog.querySelectorAll('.sel-sys-tap-voltage').forEach(sel => {
    sel.addEventListener('change', e => {
      const target = e.currentTarget as HTMLSelectElement;
      const sysId = target.getAttribute('data-sys-id');
      if (sysId) {
        const v = Number(target.value);
        if (v > 0) {
          this.store.updateSystem(sysId, { systemVoltageV: v });
          this.render();
        }
      }
    });
  });

  this.dialog.querySelectorAll('.chk-sys-ac-combiner').forEach(chk => {
    chk.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const sysId = target.getAttribute('data-sys-id');
      if (sysId) {
        this.store.updateSystem(sysId, { hasAcCombiner: target.checked });
        this.render();
      }
    });
  });

  this.dialog.querySelectorAll('.sel-sys-mdp-tap').forEach(sel => {
    sel.addEventListener('change', e => {
      const target = e.currentTarget as HTMLSelectElement;
      const sysId = target.getAttribute('data-sys-id');
      if (sysId) {
        this.store.updateSystem(sysId, { mdpTapType: target.value as MdpTapType });
        this.render();
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-sys-inv-count').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const sysId = target.getAttribute('data-sys-id');
      if (sysId) {
        this.store.updateSystemInverter(sysId, {
          inverterCount: Math.max(1, parseInt(target.value) || 1)
        });
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-sys-inv-kw').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const sysId = target.getAttribute('data-sys-id');
      if (sysId) {
        this.store.updateSystemInverter(sysId, {
          ratedAcPowerKw: Math.max(1, parseFloat(target.value) || 100)
        });
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-sys-inv-mppts').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const sysId = target.getAttribute('data-sys-id');
      if (sysId) {
        this.store.updateSystemInverter(sysId, {
          mpptCountPerInverter: Math.max(1, parseInt(target.value) || 1)
        });
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-sys-inv-str-mppt').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const sysId = target.getAttribute('data-sys-id');
      if (sysId) {
        this.store.updateSystemInverter(sysId, {
          maxStringsPerMppt: Math.max(1, parseInt(target.value) || 1)
        });
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-sys-inv-elev').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const sysId = target.getAttribute('data-sys-id');
      if (sysId) {
        const sys = this.store.getSystem(sysId);
        this.store.setSystemInverterLocation(
          sysId,
          sys?.inverterLocation || null,
          parseFloat(target.value) || 0
        );
      }
    });
  });

  this.dialog.querySelectorAll('.btn-jump-inverter').forEach(btn => {
    btn.addEventListener('click', e => {
      const sysId = (e.currentTarget as HTMLElement).getAttribute('data-sys-id');
      if (sysId) {
        this.store.selectSystem(sysId);
        this.mapController?.zoomToInverter(sysId);
        this.close();
      }
    });
  });

  this.dialog.querySelectorAll('.btn-jump-pcc').forEach(btn => {
    btn.addEventListener('click', e => {
      const sysId = (e.currentTarget as HTMLElement).getAttribute('data-sys-id');
      if (sysId) {
        this.store.selectSystem(sysId);
        this.mapController?.zoomToAcInterconnection(sysId);
        this.close();
      }
    });
  });

  this.dialog.querySelectorAll('.input-tbl-sys-pcc-elev').forEach(input => {
    input.addEventListener('change', e => {
      const target = e.currentTarget as HTMLInputElement;
      const sysId = target.getAttribute('data-sys-id');
      if (sysId) {
        this.store.setSystemAcInterconnectionElevation(sysId, parseFloat(target.value) || 0);
      }
    });
  });

  this.dialog.querySelectorAll('.btn-select-system').forEach(btn => {
    btn.addEventListener('click', e => {
      const sysId = (e.currentTarget as HTMLElement).getAttribute('data-sys-id');
      if (sysId) {
        this.store.selectSystem(sysId);
        this.close();
      }
    });
  });

  this.dialog.querySelectorAll('.btn-auto-string-system').forEach(btn => {
    btn.addEventListener('click', e => {
      const sysId = (e.currentTarget as HTMLElement).getAttribute('data-sys-id');
      if (sysId) {
        const res = this.store.autoStringSystem(sysId);
        alert(
          `⚡ System Auto-Stringing Complete!\n\nStrings Formed: ${res.totalStrings}\nModules per String: ${res.modulesPerString}\nDC/AC Ratio: ${res.inverterLoadRatio}`
        );
      }
    });
  });
}
