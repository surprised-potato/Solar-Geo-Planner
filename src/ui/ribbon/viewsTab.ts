/**
 * Ribbon "views" tab: workspace layer filters and view presets.
 */
import type { RibbonUI } from '../ribbon';

export function getActivePresetLabel(this: RibbonUI): string {
  const preset = this.store.getActiveViewPreset();
  switch (preset) {
    case 'all': return 'All';
    case 'panels': return 'Panels';
    case 'wires': return 'Wires';
    case 'presentation': return 'Present';
    case 'civil': return 'Civil';
    case 'tracing': return 'Tracing';
    case 'vicinity': return 'Vicinity';
    default: return 'Custom';
  }
}

export function renderViewsTab(this: RibbonUI): string {
  const vf = this.store.viewFilter;
  const activePreset = this.store.getActiveViewPreset();

  return `
    <div class="ribbon-panel" role="tabpanel" aria-label="Map View Visibility Filters and Presets">
      <!-- Pod 1: View Presets -->
      <div class="cad-pod wide">
        <div class="cad-pod-header">
          <span class="cad-pod-title">VIEW PRESETS</span>
          <span class="cad-val-chip ${activePreset !== 'custom' ? 'accent' : ''}">${this.getActivePresetLabel().toUpperCase()}</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-preset-grid" role="group" aria-label="Map View Presets">
            <button class="cad-preset-card ${activePreset === 'all' ? 'active' : ''}" data-view-preset="all" title="Full CAD: All elements visible (Panels, Wires, Racking, Handles, Arrows)">
              <span class="preset-icon">🌟</span>
              <span>Full CAD</span>
            </button>
            <button class="cad-preset-card ${activePreset === 'panels' ? 'active' : ''}" data-view-preset="panels" title="Panel View: Clean panels & tables; hides vertices, slope arrows & wires">
              <span class="preset-icon">☀️</span>
              <span>Panel View</span>
            </button>
            <button class="cad-preset-card ${activePreset === 'wires' ? 'active' : ''}" data-view-preset="wires" title="Wires & Electrical: Emphasizes string wiring circuits & homeruns, dims panels, hides arrows & vertices">
              <span class="preset-icon">⚡</span>
              <span>Wires Only</span>
            </button>
            <button class="cad-preset-card ${activePreset === 'presentation' ? 'active' : ''}" data-view-preset="presentation" title="Client Presentation: Clean aesthetic for client proposals, hides edit handles and slope arrows">
              <span class="preset-icon">🎨</span>
              <span>Presentation</span>
            </button>
            <button class="cad-preset-card ${activePreset === 'civil' ? 'active' : ''}" data-view-preset="civil" title="Civil & Layout: Mount tables, setbacks, tilt arrows & vertices for site civil engineering">
              <span class="preset-icon">📐</span>
              <span>Civil Layout</span>
            </button>
            <button class="cad-preset-card ${activePreset === 'tracing' ? 'active' : ''}" data-view-preset="tracing" title="Tracing Mode: Hides panels to clearly trace roof structures & obstacles">
              <span class="preset-icon">🔍</span>
              <span>Tracing</span>
            </button>
            <button class="cad-preset-card ${activePreset === 'vicinity' ? 'active' : ''}" data-view-preset="vicinity" title="Vicinity Map: Monochrome wireframe basemap with street & parcel lines for site location drawings">
              <span class="preset-icon">🗺️</span>
              <span>Vicinity Map</span>
            </button>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">1-click presets toggle visibility of CAD elements & gizmos</span>
        </div>
      </div>

      <!-- Pod 2: Physical & Racking Elements Checklist -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">MODULES & RACKING</span>
          <span class="cad-pod-tag">PHYSICAL</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-checklist">
            <label class="cad-check-item ${vf.panelVisibility !== 'hidden' ? 'active' : ''}">
              <div class="cad-check-label">
                <input type="checkbox" id="chk-view-panels" class="cad-check-input" ${vf.panelVisibility !== 'hidden' ? 'checked' : ''} />
                <span class="cad-check-icon">☀️</span>
                <span class="cad-check-text">Solar Panels</span>
              </div>
              <select id="view-panel-mode" class="cad-select-xs" title="Panel rendering mode">
                <option value="full" ${vf.panelVisibility === 'full' ? 'selected' : ''}>Full</option>
                <option value="dimmed" ${vf.panelVisibility === 'dimmed' ? 'selected' : ''}>Wireframe</option>
                <option value="hidden" ${vf.panelVisibility === 'hidden' ? 'selected' : ''}>Hidden</option>
              </select>
            </label>

            <label class="cad-check-item ${vf.showMountTables !== false ? 'active' : ''}">
              <div class="cad-check-label">
                <input type="checkbox" id="chk-view-tables" class="cad-check-input" ${vf.showMountTables !== false ? 'checked' : ''} />
                <span class="cad-check-icon">🏗️</span>
                <span class="cad-check-text">Mount Tables</span>
              </div>
              <span class="cad-check-sub">Racks</span>
            </label>

            <label class="cad-check-item ${vf.showRoofRails !== false ? 'active' : ''}">
              <div class="cad-check-label">
                <input type="checkbox" id="chk-view-roof-rails" class="cad-check-input" ${vf.showRoofRails !== false ? 'checked' : ''} />
                <span class="cad-check-icon">🛤️</span>
                <span class="cad-check-text">Roof Rails</span>
              </div>
              <span class="cad-check-sub">Rails</span>
            </label>

            <label class="cad-check-item ${vf.showArrayFill ? 'active' : ''}">
              <div class="cad-check-label">
                <input type="checkbox" id="chk-view-array-fill" class="cad-check-input" ${vf.showArrayFill ? 'checked' : ''} />
                <span class="cad-check-icon">📐</span>
                <span class="cad-check-text">Array Fill</span>
              </div>
              <span class="cad-check-sub">Boundary</span>
            </label>

            <label class="cad-check-item ${vf.showKeepOuts ? 'active' : ''}">
              <div class="cad-check-label">
                <input type="checkbox" id="chk-view-keepouts" class="cad-check-input" ${vf.showKeepOuts ? 'checked' : ''} />
                <span class="cad-check-icon">🚫</span>
                <span class="cad-check-text">Keep-Outs</span>
              </div>
              <span class="cad-check-sub">Setbacks</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Pod 3: Electrical & Wiring Checklist -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">CIRCUITING & CONDUIT</span>
          <span class="cad-pod-tag accent">ELECTRICAL</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-checklist">
            <label class="cad-check-item ${vf.showStringLines ? 'active' : ''}">
              <div class="cad-check-label">
                <input type="checkbox" id="chk-view-strings" class="cad-check-input" ${vf.showStringLines ? 'checked' : ''} />
                <span class="cad-check-icon">🔌</span>
                <span class="cad-check-text">String Wires</span>
              </div>
              <span class="cad-check-sub">Circuits</span>
            </label>

            <label class="cad-check-item ${vf.showHomerunLines !== false ? 'active' : ''}">
              <div class="cad-check-label">
                <input type="checkbox" id="chk-view-homeruns" class="cad-check-input" ${vf.showHomerunLines !== false ? 'checked' : ''} />
                <span class="cad-check-icon">🛤️</span>
                <span class="cad-check-text">Homerun Leads</span>
              </div>
              <span class="cad-check-sub">Return</span>
            </label>

            <label class="cad-check-item ${vf.showRaceways !== false ? 'active' : ''}">
              <div class="cad-check-label">
                <input type="checkbox" id="chk-view-raceways" class="cad-check-input" ${vf.showRaceways !== false ? 'checked' : ''} />
                <span class="cad-check-icon">🛣️</span>
                <span class="cad-check-text">Raceway Conduits</span>
              </div>
              <span class="cad-check-sub">Trunks</span>
            </label>

            <label class="cad-check-item ${vf.showInverters !== false ? 'active' : ''}">
              <div class="cad-check-label">
                <input type="checkbox" id="chk-view-inverters" class="cad-check-input" ${vf.showInverters !== false ? 'checked' : ''} />
                <span class="cad-check-icon">⚡</span>
                <span class="cad-check-text">Inverter Stations</span>
              </div>
              <span class="cad-check-sub">Power House</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Pod 4: CAD Gizmos & Handles (Hide Vertex, Slope Arrows) -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">ANNOTATIONS & HANDLES</span>
          <span class="cad-pod-tag warning">CAD GIZMOS</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-checklist">
            <label class="cad-check-item ${vf.showTiltArrows !== false ? 'active' : ''}">
              <div class="cad-check-label">
                <input type="checkbox" id="chk-view-tilt-arrows" class="cad-check-input" ${vf.showTiltArrows !== false ? 'checked' : ''} />
                <span class="cad-check-icon">🔻</span>
                <span class="cad-check-text">Slope / Tilt Arrows</span>
              </div>
              <span class="cad-check-sub">Azimuth</span>
            </label>

            <label class="cad-check-item ${vf.showVertices !== false ? 'active' : ''}">
              <div class="cad-check-label">
                <input type="checkbox" id="chk-view-vertices" class="cad-check-input" ${vf.showVertices !== false ? 'checked' : ''} />
                <span class="cad-check-icon">📍</span>
                <span class="cad-check-text">Vertex & Edit Pins</span>
              </div>
              <span class="cad-check-sub">Handles</span>
            </label>

            <label class="cad-check-item ${vf.showLabels ? 'active' : ''}">
              <div class="cad-check-label">
                <input type="checkbox" id="chk-view-labels" class="cad-check-input" ${vf.showLabels ? 'checked' : ''} />
                <span class="cad-check-icon">🏷️</span>
                <span class="cad-check-text">Satellite Road Labels</span>
              </div>
              <span class="cad-check-sub">Places</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Pod 5: Basemap & Batch Actions -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">BASEMAP & ACTIONS</span>
          <span class="cad-val-chip">${(vf.basemap || 'google-hybrid').toUpperCase()}</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-field-row">
            <label for="view-tab-basemap" class="cad-mini-label">Map / Satellite Layer</label>
            <select id="view-tab-basemap" class="cad-select-sm">
              <option value="google-hybrid" ${vf.basemap === 'google-hybrid' ? 'selected' : ''}>Google Satellite HD</option>
              <option value="google-satellite" ${vf.basemap === 'google-satellite' ? 'selected' : ''}>Google Sat (No Labels)</option>
              <option value="osm" ${vf.basemap === 'osm' ? 'selected' : ''}>OpenStreetMap</option>
              <option value="carto-light" ${vf.basemap === 'carto-light' ? 'selected' : ''}>Vicinity Map (Monochrome Light)</option>
              <option value="carto-dark" ${vf.basemap === 'carto-dark' ? 'selected' : ''}>Blueprint Wireframe (Dark)</option>
            </select>
          </div>
          <div class="cad-control-row compact-gap" style="margin-top: 4px;">
            <button id="btn-view-select-all" class="cad-action-btn flex-1" title="Show all layers and CAD gizmos">
              ✓ All Visible
            </button>
            <button id="btn-view-clear-all" class="cad-action-btn flex-1" title="Hide electrical and CAD overlays">
              ✕ Minimal
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}
