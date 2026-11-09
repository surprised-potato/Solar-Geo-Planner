/**
 * Ribbon "home" tab: system / array selectors and CAD quick tools.
 */
import { SolarSystem, ArrayZone } from '../../types/solar';
import type { RibbonUI } from '../ribbon';
import { escapeHtml } from '../../utils/html';

export function renderHomeTab(
  this: RibbonUI,
  currentSystem: SolarSystem | undefined,
  zone: ArrayZone | null | undefined,
  selectedZones: ArrayZone[],
  systems: SolarSystem[],
  zones: ArrayZone[],
  isMultiSelect: boolean,
  drawingMode: string,
  totalSelectedKwp: number,
  totalSelectedPanels: number,
  currentSystemSummary: any
): string {
  const drawingMountType = this.store.drawingMountType;
  const hasSel = selectedZones.length > 0;
  const sysColor = currentSystem?.color || '#0284c7';
  const dcKwp = isMultiSelect ? totalSelectedKwp : (zone ? zone.totalKwp : (currentSystemSummary?.totalKwp || 0));
  const panels = isMultiSelect ? totalSelectedPanels : (zone ? zone.activePanelCount : (currentSystemSummary?.totalActivePanels || 0));

  return `
    <div class="ribbon-panel" role="tabpanel" aria-label="Project Home, System & Array Selectors, CAD Quick Tools">
      <!-- Pod 1: System Selection & Management -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">⚡ ELECTRICAL SYSTEM</span>
          <span class="cad-pod-tag accent" style="background: ${sysColor}20; color: ${sysColor}; border-color: ${sysColor}50;">
            ${escapeHtml(currentSystem ? currentSystem.name.toUpperCase() : 'NO SYSTEM')}
          </span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-field-row">
            <select id="ribbon-system-select" class="cad-select-sm" title="Switch active electrical solar system" aria-label="Select Electrical System">
              ${systems
                .map(
                  s => `
                <option value="${s.id}" ${currentSystem?.id === s.id ? 'selected' : ''}>
                  ${escapeHtml(s.name)} (${s.zoneIds.length} ${s.zoneIds.length === 1 ? 'array' : 'arrays'} • ${s.inverter.inverterCount * s.inverter.ratedAcPowerKw}kW AC)
                </option>
              `
                )
                .join('')}
            </select>
          </div>
          <div class="cad-control-row compact-gap" style="margin-top: 4px;">
            <button id="ribbon-btn-new-system" class="btn btn-xs btn-primary flex-1" title="Create a new independent electrical solar system / inverter station">
              + New System
            </button>
            <button id="ribbon-btn-edit-system" class="btn btn-xs btn-outline flex-1" title="Rename active system">
              ✏️ Rename
            </button>
            <button id="ribbon-btn-delete-system" class="btn btn-xs btn-outline danger" title="Delete active electrical system and all associated arrays, raceways, and inverters">
              🗑️ Delete
            </button>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">${currentSystem ? `${currentSystem.inverter.inverterCount}×${currentSystem.inverter.ratedAcPowerKw}kW Inverter(s) • ${currentSystem.systemVoltageV || 400}V Grid Tap` : 'Add or select an electrical system'}</span>
        </div>
      </div>

      <!-- Pod 2: Array Zone Selection & Actions -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">📐 ARRAY ZONE SELECTION</span>
          <span class="cad-pod-tag ${isMultiSelect ? 'highlight' : zone ? 'accent' : ''}">
            ${isMultiSelect ? `${selectedZones.length} ARRAYS BATCH` : zone ? zone.config.mountType.toUpperCase() : 'NO SELECTION'}
          </span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-field-row">
            ${
              zones.length > 0
                ? `
              <select id="ribbon-zone-select" class="cad-select-sm" aria-label="Select Array Zone">
                ${isMultiSelect ? `<option value="__batch__" selected>✨ All ${selectedZones.length} Selected Arrays</option>` : ''}
                ${zones
                  .map(
                    z => `
                  <option value="${z.id}" ${!isMultiSelect && zone?.id === z.id ? 'selected' : ''}>
                    ${this.store.isZoneSelected(z.id) ? '✓ ' : ''}${escapeHtml(z.name)} [${escapeHtml(this.store.getSystem(z.systemId)?.name?.split(':')[0] || 'Sys')}] (${z.activePanelCount}p • ${z.totalKwp}kWp)
                  </option>
                `
                  )
                  .join('')}
              </select>
            `
                : `<select class="cad-select-sm" disabled><option>No Arrays Plotted</option></select>`
            }
          </div>
          <div class="cad-control-row compact-gap" style="margin-top: 4px;">
            ${
              zones.length > 1
                ? `<button id="ribbon-btn-select-all" class="btn btn-xs btn-outline flex-1" title="Select all arrays for batch editing">${isMultiSelect && selectedZones.length === zones.length ? 'Clear Selection' : `Select All (${zones.length})`}</button>`
                : ''
            }
            <button id="ribbon-btn-zoom-array" class="btn btn-xs btn-outline flex-1" title="${isMultiSelect ? 'Zoom to fit all selected arrays' : 'Zoom map to fit this array'}">
              🎯 Fit View
            </button>
            <button id="ribbon-btn-match-props" class="btn btn-xs ${drawingMode === 'match_props' ? 'btn-primary active-pulse' : 'btn-outline'} flex-1" title="Match Properties (MATCHPROP): Copy racking, module, tilt, azimuth, or spacing from this array to other arrays" ${zones.length < 2 ? 'disabled' : ''}>
              🎨 Match Props
            </button>
            <button id="ribbon-delete-zone" class="btn btn-xs btn-outline danger icon-only" title="${isMultiSelect ? 'Delete all selected arrays' : 'Delete current array'}">
              🗑️
            </button>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">${isMultiSelect ? `Batch editing active: controls adjust all ${selectedZones.length} arrays` : zone ? `${escapeHtml(zone.name)} (${zone.activePanelCount} panels • ${zone.totalKwp} kWp)` : 'Select an array from map or dropdown'}</span>
        </div>
      </div>

      <!-- Pod 2b: Array Manipulation -->
      <div class="cad-pod wide">
        <div class="cad-pod-header">
          <span class="cad-pod-title">🛠️ ARRAY MANIPULATION</span>
          <span class="cad-pod-tag ${hasSel ? 'accent' : ''}">${hasSel ? `${selectedZones.length} SELECTED` : 'SELECT AN ARRAY'}</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-control-row compact-gap">
            <button id="ribbon-btn-copy" class="btn btn-xs btn-outline flex-1" ${hasSel ? '' : 'disabled'} title="Copy selected arrays (Ctrl+C)">📋 Copy</button>
            <button id="ribbon-btn-cut" class="btn btn-xs btn-outline flex-1" ${hasSel ? '' : 'disabled'} title="Cut selected arrays (Ctrl+X)">✂️ Cut</button>
            <button id="ribbon-btn-paste" class="btn btn-xs btn-outline flex-1" ${this.store.zoneClipboard.length ? '' : 'disabled'} title="Paste arrays at the cursor (Ctrl+V)">📥 Paste</button>
            <button id="ribbon-btn-duplicate" class="btn btn-xs btn-outline flex-1" ${hasSel ? '' : 'disabled'} title="Duplicate selected arrays beside the originals (Ctrl+D)">⧉ Duplicate</button>
            <button id="ribbon-btn-flip-h" class="btn btn-xs btn-outline flex-1" ${hasSel ? '' : 'disabled'} title="Mirror left/right about the selection centre">⇋ Flip H</button>
            <button id="ribbon-btn-flip-v" class="btn btn-xs btn-outline flex-1" ${hasSel ? '' : 'disabled'} title="Mirror top/bottom about the selection centre">⇅ Flip V</button>
          </div>
          <div class="cad-control-row compact-gap" style="margin-top: 4px; align-items: center;">
            <label class="cad-hint-text">E</label>
            <input id="ribbon-move-east" type="number" step="0.5" value="0" class="cad-select-sm" style="width: 56px;" title="Metres east (negative = west)" />
            <label class="cad-hint-text">N</label>
            <input id="ribbon-move-north" type="number" step="0.5" value="0" class="cad-select-sm" style="width: 56px;" title="Metres north (negative = south)" />
            <button id="ribbon-btn-move" class="btn btn-xs btn-outline" ${hasSel ? '' : 'disabled'} title="Move selection by the given metres (arrow keys nudge 1 m, Shift 10 m, Alt 0.1 m)">➡ Move (m)</button>
            <input id="ribbon-rotate-deg" type="number" step="1" value="15" class="cad-select-sm" style="width: 56px;" title="Rotation step in degrees" />
            <button id="ribbon-btn-rotate-ccw" class="btn btn-xs btn-outline" ${hasSel ? '' : 'disabled'} title="Rotate counter-clockwise ( [ key )">↺</button>
            <button id="ribbon-btn-rotate-cw" class="btn btn-xs btn-outline" ${hasSel ? '' : 'disabled'} title="Rotate clockwise ( ] key )">↻</button>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">Drag ✥ / ↻ handles on the map &bull; Arrows nudge &bull; [ ] rotate &bull; Ctrl+C/X/V/D/A</span>
        </div>
      </div>

      <!-- Pod 3: CAD Quick Drafting Tools -->
      <div class="cad-pod wide">
        <div class="cad-pod-header">
          <span class="cad-pod-title">✏️ CAD QUICK DRAFTING</span>
          <span class="cad-pod-tag ${drawingMode !== 'none' ? 'highlight' : ''}">
            ${drawingMode !== 'none' ? `DRAFTING: ${drawingMode.toUpperCase()}` : 'TOOLS'}
          </span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-control-row compact-gap">
            <button id="ribbon-btn-new-roof" class="btn btn-xs ${drawingMode === 'zone' && drawingMountType === 'roof' ? 'btn-primary active-pulse' : 'btn-outline'}" style="flex: 1;" title="Draw new rooftop array polygon">
              🏠 + Roof Array
            </button>
            <button id="ribbon-btn-new-ground" class="btn btn-xs ${drawingMode === 'zone' && drawingMountType === 'ground' ? 'btn-primary active-pulse' : 'btn-outline'}" style="flex: 1;" title="Draw new ground mount array polygon">
              🌱 + Ground Mount
            </button>
            <button id="ribbon-btn-new-ko" class="btn btn-xs ${drawingMode === 'keepout' ? 'btn-primary active-pulse' : 'btn-outline'}" style="flex: 1;" title="Draw obstacle / keep-out exclusion zone">
              🚫 + Keep-Out
            </button>
          </div>
          <div class="cad-control-row compact-gap" style="margin-top: 4px;">
            <button id="ribbon-btn-new-raceway" class="btn btn-xs ${drawingMode === 'raceway' ? 'btn-primary active-pulse' : 'btn-outline'}" style="flex: 1;" title="Draw shared homerun raceway trunk">
              🛤️ + Homerun
            </button>
            <button id="ribbon-btn-new-inverter" class="btn btn-xs ${drawingMode === 'inverter' ? 'btn-primary active-pulse' : 'btn-outline'}" style="flex: 1;" title="Place inverter powerhouse station on map">
              ⚡ + Inverter
            </button>
            <button id="ribbon-btn-new-pcc" class="btn btn-xs ${drawingMode === 'ac_interconnection' ? 'btn-primary active-pulse' : 'btn-outline'}" style="flex: 1;" title="Pin AC Interconnection Point (PCC) on satellite map">
              🏢 + PCC
            </button>
            <button id="ribbon-btn-new-ac-feeder" class="btn btn-xs ${drawingMode === 'ac_raceway' ? 'btn-primary active-pulse' : 'btn-outline'}" style="flex: 1;" title="Draw AC Feeder Conduit from Inverter Station to PCC">
              ⚡ + AC Feeder
            </button>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">${drawingMode !== 'none' ? 'Drafting active: click points on satellite view, double-click to finish' : 'Click any drafting tool to begin plotting on satellite map'}</span>
        </div>
      </div>

      <!-- Pod 4: Project Live Telemetry HUD -->
      <div class="cad-pod wide">
        <div class="cad-pod-header">
          <span class="cad-pod-title">📊 LIVE SYSTEM TELEMETRY</span>
          <div style="display: flex; gap: 4px; align-items: center;">
            <span class="cad-val-chip highlight">${dcKwp} kWp TOTAL</span>
            <button id="ribbon-btn-open-pdf" class="btn btn-xs btn-outline" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.4); background: rgba(56, 189, 248, 0.12); font-weight: 600; padding: 1px 6px;" title="Export Comprehensive PVsyst Engineering PDF Report">📄 PDF</button>
            <button id="ribbon-btn-home-tables" class="btn btn-xs btn-outline" style="color: #10b981; border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.12); font-weight: 600; padding: 1px 6px;" title="View Table Schedules & Component Registry">📊 Schedules</button>
          </div>
        </div>
        <div class="cad-pod-body">
          <div class="cad-telemetry-hud-grid">
            <div class="hud-item highlight" title="Total DC peak capacity for active selection">
              <span class="hud-label">DC Capacity</span>
              <span class="hud-val">${dcKwp} <small>kWp</small></span>
            </div>
            <div class="hud-item" title="Total active fitted solar panels">
              <span class="hud-label">Panel Count</span>
              <span class="hud-val">${panels} <small>Panels</small></span>
            </div>
            <div class="hud-item" title="Combined rated AC output of inverters">
              <span class="hud-label">Inverter AC</span>
              <span class="hud-val">${currentSystemSummary?.inverterAcKw || 0} <small>kW</small></span>
            </div>
            <div class="hud-item" title="DC to AC overload sizing ratio">
              <span class="hud-label">DC/AC Ratio</span>
              <span class="hud-val">${currentSystemSummary?.dcAcRatio || '1.0'}</span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">${currentSystemSummary?.totalStrings || 0} Series Strings Formed &bull; ${currentSystem?.systemVoltageV || 400}V Grid Interconnection</span>
        </div>
      </div>
    </div>
  `;
}
