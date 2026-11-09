/**
 * Ribbon "stringing" tab content (shown when an array zone is active).
 */
import { calculateStringLimits } from '../../geo/autofill';
import {
  GENERIC_INVERTER_PRESETS,
  STANDARD_INVERTER_CAPACITIES_KW,
  STANDARD_AC_VOLTAGES_3PHASE,
  STANDARD_AC_VOLTAGES_1PHASE
} from '../../types/solar';
import { calculateGeodeticDistanceM } from '../../geo/projection';
import type { RibbonUI } from '../ribbon';
import type { ZoneTabContext } from './zoneTabContext';
import { escapeHtml } from '../../utils/html';

export function renderStringingTab(this: RibbonUI, ctx: ZoneTabContext): string {
  const { zone, zoneSystem, currentTraverseDir, currentModule, currentSystem } = ctx;
  const activeSystem = currentSystem || zoneSystem || this.store.getSystems()[0];
  const inv = activeSystem?.inverter || GENERIC_INVERTER_PRESETS[0];
  const mod = currentModule || this.store.getModules()[0];
  const limits = calculateStringLimits(mod, inv);
  const activeSystemId = activeSystem?.id || zone.systemId;
  const sysSummary = this.store.getSystemSummary(activeSystemId);
  const cableSummary = this.store.getSystemCableSummary(activeSystemId);
  const isDrawingInv = this.store.drawingMode === 'inverter';
  const isDrawingRaceway = this.store.drawingMode === 'raceway';

  const activeHomerun = (zone && this.store.getHomerunForZone(zone.id)) || activeSystem?.homerunRaceway;
  let homerunPathLen = 0;
  if (activeHomerun && activeHomerun.path && activeHomerun.path.length >= 2) {
    for (let i = 0; i < activeHomerun.path.length - 1; i++) {
      homerunPathLen += calculateGeodeticDistanceM(activeHomerun.path[i], activeHomerun.path[i + 1]);
    }
  }

  return `
    <div class="ribbon-panel" role="tabpanel" aria-label="Inverter Sizing and String Cabling">
      <!-- Pod 1: Inverter Specifications -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">INVERTER STATION SPECS</span>
          <span class="cad-pod-tag accent">${inv.inverterCount}×${inv.ratedAcPowerKw} kW (${(inv.phase || 'three_phase') === 'three_phase' ? '3Φ' : '1Φ'} ${inv.acVoltage || ((inv.phase || 'three_phase') === 'single_phase' ? 230 : 400)}V)</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-field-row" style="display: flex; gap: 8px;">
            <div class="cad-input-unit-wrap" style="flex: 1.2;" title="Choose standard inverter capacity rating (e.g. 6 kW, 30 kW, 100 kW)">
              <span class="cad-unit-prefix">Rating</span>
              <select id="ribbon-inv-capacity-select" class="cad-select-sm" aria-label="Inverter Capacity Rating">
                ${STANDARD_INVERTER_CAPACITIES_KW.map(kw => `<option value="${kw}" ${kw === inv.ratedAcPowerKw ? 'selected' : ''}>${kw} kW</option>`).join('')}
                <option value="custom" ${!STANDARD_INVERTER_CAPACITIES_KW.includes(inv.ratedAcPowerKw) ? 'selected' : ''}>Custom (${inv.ratedAcPowerKw} kW)</option>
              </select>
            </div>
            <div style="flex: 1.8;">
              <select id="ribbon-inverter-preset-select" class="cad-select-sm" title="Load generic commercial inverter preset" aria-label="Inverter Model Preset">
                ${GENERIC_INVERTER_PRESETS.map(p => {
                  const isSelected = p.id === inv.id || p.modelName === inv.modelName || (p.ratedAcPowerKw === inv.ratedAcPowerKw && p.mpptCountPerInverter === inv.mpptCountPerInverter);
                  return `<option value="${p.id}" ${isSelected ? 'selected' : ''}>${escapeHtml(p.modelName)}</option>`;
                }).join('')}
              </select>
            </div>
          </div>
          <div class="cad-control-row compact-gap">
            <div class="cad-input-unit-wrap sm" title="Number of Inverter Units">
              <span class="cad-unit-prefix">Qty</span>
              <input type="number" id="ribbon-inv-count" class="cad-num-input" min="1" max="20" value="${inv.inverterCount}" aria-label="Inverter Units Count" />
            </div>
            <div class="cad-input-unit-wrap sm" title="Rated AC Power per Inverter in kW">
              <span class="cad-unit-prefix">kW</span>
              <input type="number" id="ribbon-inv-kw" class="cad-num-input" value="${inv.ratedAcPowerKw}" aria-label="Rated AC Power" />
            </div>
            <div class="cad-input-unit-wrap sm" title="MPPT Trackers per Inverter">
              <span class="cad-unit-prefix">MPPT</span>
              <input type="number" id="ribbon-inv-mppt" class="cad-num-input" min="1" max="24" value="${inv.mpptCountPerInverter}" aria-label="MPPT Count" />
            </div>
            <div class="cad-input-unit-wrap sm" title="Max Strings per MPPT">
              <span class="cad-unit-prefix">Str/Trk</span>
              <input type="number" id="ribbon-inv-str-mppt" class="cad-num-input" min="1" max="4" value="${inv.maxStringsPerMppt}" aria-label="Strings per MPPT" />
            </div>
            <div class="cad-input-unit-wrap sm" title="Max Input DC Voltage">
              <span class="cad-unit-prefix">Vmax</span>
              <input type="number" id="ribbon-inv-vmax" class="cad-num-input" value="${inv.maxDcVoltage}" aria-label="Max DC Voltage" />
            </div>
          </div>

          <!-- AC Side Output Configuration: Phase, Voltage, Frequency -->
          <div class="cad-control-row compact-gap" style="margin-top: 5px;">
            <div class="cad-input-unit-wrap sm" style="flex: 1.1;" title="Inverter AC Output Phase Configuration">
              <span class="cad-unit-prefix">Phase</span>
              <select id="ribbon-inv-phase" class="cad-select-sm" aria-label="Inverter AC Phase">
                <option value="three_phase" ${(inv.phase || 'three_phase') === 'three_phase' ? 'selected' : ''}>3Φ Three-Phase</option>
                <option value="single_phase" ${(inv.phase || 'three_phase') === 'single_phase' ? 'selected' : ''}>1Φ Single-Phase</option>
              </select>
            </div>
            <div class="cad-input-unit-wrap sm" style="flex: 1.1;" title="Inverter AC Output Line Voltage">
              <span class="cad-unit-prefix">VAC</span>
              <select id="ribbon-inv-ac-voltage-preset" class="cad-select-sm" aria-label="Inverter AC Voltage">
                ${((inv.phase || 'three_phase') === 'single_phase' ? STANDARD_AC_VOLTAGES_1PHASE : STANDARD_AC_VOLTAGES_3PHASE).map((v: number) => `
                  <option value="${v}" ${(inv.acVoltage || ((inv.phase || 'three_phase') === 'single_phase' ? 230 : 400)) === v ? 'selected' : ''}>${v} V</option>
                `).join('')}
                <option value="custom" ${!STANDARD_AC_VOLTAGES_3PHASE.concat(STANDARD_AC_VOLTAGES_1PHASE).includes(inv.acVoltage || 400) ? 'selected' : ''}>Custom (${inv.acVoltage || 400}V)</option>
              </select>
            </div>
            <div class="cad-input-unit-wrap sm" style="width: 76px;" title="Grid Frequency (Hz)">
              <span class="cad-unit-prefix">Freq</span>
              <select id="ribbon-inv-freq" class="cad-select-sm" aria-label="AC Frequency">
                <option value="50" ${(inv.gridFrequencyHz || 50) === 50 ? 'selected' : ''}>50Hz</option>
                <option value="60" ${(inv.gridFrequencyHz || 50) === 60 ? 'selected' : ''}>60Hz</option>
              </select>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">Total System Inverter Capacity: <strong>${sysSummary.inverterAcKw} kW AC</strong></span>
        </div>
      </div>

      <!-- Pod 2: Electrical Matching Analysis -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">ELECTRICAL MATCHING</span>
          <span class="cad-val-chip highlight">DC/AC ${sysSummary.dcAcRatio}</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-kpi-chips-column">
            <div class="cad-telemetry-chip highlight">
              <span class="chip-label">Optimal String Size:</span>
              <span class="chip-val"><strong>${limits.optimalPanelsPerString}</strong> mod/string</span>
            </div>
            <div class="cad-telemetry-chip">
              <span class="chip-label">Permitted Window:</span>
              <span class="chip-val">${limits.minPanelsPerString} – ${limits.maxPanelsPerString} mod/str</span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">${sysSummary.totalKwp} kWp DC on ${sysSummary.inverterAcKw} kW AC</span>
        </div>
      </div>

      <!-- Pod 3: Inverter Power House Geolocation -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">📍 INVERTER POWER HOUSE</span>
          <span class="cad-pod-tag ${activeSystem?.inverterLocation ? 'accent' : 'warning'}">${activeSystem?.inverterLocation ? 'LOCATED' : 'NOT SET'}</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-field-row">
            <button id="ribbon-btn-place-inverter" class="btn btn-xs ${isDrawingInv ? 'btn-primary active-pulse' : 'btn-outline warning'}" title="Click to geolocationally place the Inverter Power House on the satellite map">
              ${isDrawingInv ? '🎯 Click Map to Place...' : '📍 Place Station'}
            </button>
            ${
              activeSystem?.inverterLocation
                ? `
              <button id="ribbon-btn-fly-inverter" class="btn btn-xs btn-outline" title="Zoom map to inverter power house">🎯</button>
              <button id="ribbon-btn-clear-inverter" class="btn-icon xs danger" title="Clear inverter station point">✕</button>
            `
                : ''
            }
          </div>
          <div class="cad-field-row">
            <div class="cad-input-unit-wrap full" title="Ground elevation of Inverter Station in meters">
              <span class="cad-unit-prefix">Elevation</span>
              <input type="number" id="ribbon-inv-elevation" class="cad-num-input" value="${activeSystem?.inverterElevationM ?? 0}" step="0.5" aria-label="Inverter Elevation in Meters" />
              <span class="cad-unit-addon">m</span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">${activeSystem?.inverterLocation ? `${activeSystem.inverterLocation.lat.toFixed(5)}, ${activeSystem.inverterLocation.lng.toFixed(5)}` : 'Homerun cables estimate direct run'}</span>
        </div>
      </div>

      <!-- Pod 4: Shared Homerun Raceway / Conduit Trunk -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">🛤️ HOMERUN RACEWAY</span>
          <span class="cad-pod-tag ${activeHomerun ? 'highlight' : ''}">${activeHomerun ? `${homerunPathLen.toFixed(1)}m` : 'DIRECT'}</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-field-row">
            <button id="ribbon-btn-draw-raceway" class="btn btn-xs ${isDrawingRaceway ? 'btn-primary active-pulse' : 'btn-outline warning'}" title="Draw homerun conduit/cable tray polyline independent of arrays - all arrays auto-connect!">
              ${isDrawingRaceway ? '✅ Finish Homerun' : activeHomerun ? '✏️ Redraw Homerun' : '🛤️ Draw Homerun'}
            </button>
            ${
              activeHomerun
                ? `
              <button id="ribbon-btn-zoom-raceway" class="btn btn-xs btn-outline" title="Zoom to homerun path on map">🎯 View</button>
              <button id="ribbon-btn-clear-raceway" class="btn-icon xs danger" title="Clear homerun raceway">✕</button>
            `
                : ''
            }
          </div>
          <div class="cad-field-row">
            <div class="cad-input-unit-wrap full" title="Elevation drop or riser change along this homerun run in meters">
              <span class="cad-unit-prefix">&Delta;h Riser</span>
              <input type="number" id="ribbon-raceway-elev" class="cad-num-input" value="${activeHomerun ? activeHomerun.elevationChangeM : (zone?.elevationDeltaM ?? 0)}" step="0.5" aria-label="Raceway Elevation Change in Meters" />
              <span class="cad-unit-addon">m</span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">${activeHomerun ? `⚡ Auto-connected: ${activeHomerun.path.length} nodes recorded` : 'Independent homerun trunk'}</span>
        </div>
      </div>

      <!-- Pod 5: DC Cabling Telemetry HUD -->
      <div class="cad-pod wide">
        <div class="cad-pod-header">
          <span class="cad-pod-title">🔌 DC CABLE TELEMETRY</span>
          <span class="cad-val-chip highlight">${cableSummary.totalCableLengthM} m TOTAL</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-telemetry-hud-grid">
            <div class="hud-item highlight" title="Combined length of (+/-) homerun leads connecting strings to inverter">
              <span class="hud-label">Homeruns (+/-)</span>
              <span class="hud-val">${cableSummary.totalHomerunM} <small>m</small></span>
            </div>
            <div class="hud-item" title="Module-to-module interconnections inside string rows">
              <span class="hud-label">Intra-String</span>
              <span class="hud-val">${cableSummary.totalIntraStringM} <small>m</small></span>
            </div>
            <div class="hud-item" title="Vertical riser / roof-to-ground drops">
              <span class="hud-label">Riser Drops</span>
              <span class="hud-val">${cableSummary.totalElevationRiserM} <small>m</small></span>
            </div>
            <div class="hud-item" title="Average wire run per formed string">
              <span class="hud-label">Avg / String</span>
              <span class="hud-val">${cableSummary.avgStringCableLengthM} <small>m</small></span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">Geodetically calculated along raceways and array rows</span>
        </div>
      </div>

      <!-- Pod 6: Auto-Stringing Automation -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">AUTO-STRINGING</span>
          <span class="cad-pod-tag highlight">Automation</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-field-row">
            <div class="cad-input-unit-wrap sm" title="Target modules per series string">
              <span class="cad-unit-prefix">Panels</span>
              <input type="number" id="ribbon-str-target-size" class="cad-num-input" value="${limits.optimalPanelsPerString}" min="${limits.minPanelsPerString}" max="${limits.maxPanelsPerString}" aria-label="Target Modules per String" />
              <span class="cad-unit-addon">/str</span>
            </div>
            <button id="ribbon-btn-auto-string-inverter" class="btn btn-sm btn-primary highlight" title="Automatically cluster panels into optimal strings and route to inverter MPPTs">
              ⚡ Auto-String
            </button>
          </div>
          <div class="cad-field-row" style="margin-top: 4px;">
            <select id="ribbon-str-direction" class="cad-select-sm" title="Direction to traverse modules when forming strings" aria-label="String Traverse Direction">
              <option value="short_side" ${currentTraverseDir === 'short_side' ? 'selected' : ''}>↕ Traverse: Short Side (Default)</option>
              <option value="long_side" ${currentTraverseDir === 'long_side' ? 'selected' : ''}>↔ Traverse: Long Side</option>
              <option value="rows" ${currentTraverseDir === 'rows' ? 'selected' : ''}>↔ Follow Rows (Horizontal)</option>
              <option value="columns" ${currentTraverseDir === 'columns' ? 'selected' : ''}>↕ Follow Columns (Vertical)</option>
            </select>
          </div>
        </div>
        <div class="cad-pod-footer">
          <button id="ribbon-btn-open-reg" class="btn btn-xs btn-outline full" title="Open complete table registry of solar panel objects">
            📋 Open Object Registry
          </button>
        </div>
      </div>
    </div>
  `;
}
