import { ProjectStore } from '../store/projectStore';
import { escapeHtml } from '../utils/html';
import { getCardinalDirection } from '../geo/projection';
import { attachBatchListeners as attachBatchListenersImpl, attachActiveStateListeners as attachActiveStateListenersImpl, attachEmptyStateListeners as attachEmptyStateListenersImpl } from './sidebar/sidebarEvents';

export class SidebarUI {
  container: HTMLElement;
  store: ProjectStore;

  constructor(containerId: string, store: ProjectStore) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Element #${containerId} not found`);
    this.container = el;
    this.store = store;

    this.store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const zone = this.store.getSelectedZone();
    const zones = this.store.getZones();
    const selectedZones = this.store.getSelectedZones();
    const isMultiSelect = selectedZones.length > 1;
    const drawingMode = this.store.drawingMode;

    if (isMultiSelect) {
      const totalPanels = selectedZones.reduce((sum, z) => sum + z.activePanelCount, 0);
      const totalKwp = Number(selectedZones.reduce((sum, z) => sum + z.totalKwp, 0).toFixed(2));

      this.container.innerHTML = `
        <div class="sidebar-header">
          <div class="zone-title-row">
            <span class="color-badge" style="background-color: #f59e0b;"></span>
            <span style="font-weight: 700; font-size: 14px;">✨ ${selectedZones.length} Arrays Selected</span>
            <button id="btn-sidebar-clear-sel" class="btn-icon" title="Clear Multi-Selection">✕</button>
          </div>

          <div class="zone-quick-stats">
            <div class="stat-badge highlight">
              <span class="label">Arrays</span>
              <span class="val">${selectedZones.length}</span>
            </div>
            <div class="stat-badge">
              <span class="label">Panels</span>
              <span class="val">${totalPanels}</span>
            </div>
            <div class="stat-badge highlight">
              <span class="label">DC Power</span>
              <span class="val">${totalKwp} kWp</span>
            </div>
          </div>
        </div>

        <div class="sidebar-scrollable">
          <div class="control-section">
            <h4>✨ Batch Actions</h4>
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
              <button id="btn-sidebar-batch-opt" class="btn btn-primary full">⚡ Maximize & Auto-String ${selectedZones.length} Arrays</button>
              <button id="btn-sidebar-batch-del" class="btn btn-danger full">🗑️ Delete All ${selectedZones.length} Selected Arrays</button>
            </div>
          </div>

          <div class="control-section">
            <h4>Batch Setback</h4>
            <div class="preset-buttons" style="display: flex; gap: 4px; margin-top: 6px;">
              <button class="btn btn-sm btn-outline btn-sidebar-batch-setback" data-val="0.0">0m</button>
              <button class="btn btn-sm btn-outline btn-sidebar-batch-setback" data-val="0.5">0.5m</button>
              <button class="btn btn-sm btn-outline btn-sidebar-batch-setback" data-val="1.0">1.0m</button>
              <button class="btn btn-sm btn-outline btn-sidebar-batch-setback" data-val="1.5">1.5m</button>
            </div>
          </div>

          <div class="zone-list-section" style="margin-top: 12px;">
            <h4>Selected Arrays</h4>
            <div class="zone-list">
              ${selectedZones
                .map(
                  z => `
                <div class="zone-list-item selected" data-zone-id="${z.id}">
                  <span class="color-badge" style="background-color: ${z.color}"></span>
                  <div class="zone-meta" style="flex: 1;">
                    <strong>${escapeHtml(z.name)}</strong>
                    <small>${z.activePanelCount} panels &bull; ${z.totalKwp} kWp</small>
                  </div>
                  <small style="color: var(--accent-blue); font-size: 11px;">✓ Selected</small>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        </div>
      `;

      this.attachBatchListeners();
      return;
    }

    if (!zone) {
      this.container.innerHTML = `
        <div class="sidebar-empty">
          <div class="empty-icon">☀️</div>
          <h3>Solar Geo Planner</h3>
          <p>Plot solar array polygons directly on high-resolution satellite imagery.</p>

          <div class="quick-start-actions">
            <button id="btn-draw-roof" class="btn btn-primary ${drawingMode === 'zone' && this.store.drawingMountType === 'roof' ? 'active' : ''}">
              <span class="icon">📐</span> Draw Roof Array
            </button>
            <button id="btn-draw-ground" class="btn btn-secondary ${drawingMode === 'zone' && this.store.drawingMountType === 'ground' ? 'active' : ''}">
              <span class="icon">🚜</span> Draw Ground Array
            </button>
          </div>

          ${
            zones.length > 0
              ? `
            <div class="zone-list-section">
              <h4>Existing Array Zones (${zones.length})</h4>
              <div class="zone-list">
                ${zones
                  .map(
                    z => `
                  <div class="zone-list-item ${this.store.isZoneSelected(z.id) ? 'selected' : ''}" data-zone-id="${z.id}">
                    <span class="color-badge" style="background-color: ${z.color}"></span>
                    <div class="zone-meta">
                      <strong>${escapeHtml(z.name)}</strong>
                      <small>${z.activePanelCount} panels &bull; ${z.totalKwp} kWp</small>
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>
          `
              : `
            <div class="tips-card">
              <h4>💡 How to use:</h4>
              <ol>
                <li>Click <b>Draw Roof Array</b> or <b>Draw Ground Array</b>.</li>
                <li>Click points on the satellite map around the roof or field boundary.</li>
                <li>Double-click (or click first point) to complete.</li>
                <li>Solar panels will instantly autofill with correct dimensions and spacing!</li>
              </ol>
            </div>
          `
          }
        </div>
      `;

      this.attachEmptyStateListeners();
      return;
    }

    const cfg = zone.config;

    this.container.innerHTML = `
      <div class="sidebar-header">
        <div class="zone-title-row">
          <span class="color-badge" style="background-color: ${zone.color}"></span>
          <input type="text" id="zone-name-input" class="zone-name-input" value="${escapeHtml(zone.name)}" />
          <button id="btn-delete-zone" class="btn-icon danger" title="Delete Zone">🗑️</button>
        </div>

        <div class="zone-quick-stats">
          <div class="stat-badge">
            <span class="label">Panels</span>
            <span class="val">${zone.activePanelCount}</span>
          </div>
          <div class="stat-badge highlight">
            <span class="label">DC Power</span>
            <span class="val">${zone.totalKwp} kWp</span>
          </div>
          <div class="stat-badge">
            <span class="label">Area</span>
            <span class="val">${Math.round(zone.areaSqM)} m²</span>
          </div>
        </div>
      </div>

      <div class="sidebar-scrollable">
        <!-- Presets / Mount Type Switcher -->
        <div class="control-group">
          <label>Mounting Configuration</label>
          <div class="segmented-control">
            <button id="mount-roof" class="seg-btn ${cfg.mountType === 'roof' ? 'active' : ''}">🏠 Roof Mount</button>
            <button id="mount-ground" class="seg-btn ${cfg.mountType === 'ground' ? 'active' : ''}">🌱 Ground Mount</button>
          </div>
        </div>

        ${
          cfg.mountType === 'ground'
            ? `
        <!-- Mount Table Racking -->
        <div class="control-section">
          <div class="section-header-row">
            <h4>🏗️ Solar Mount Tables (Racks)</h4>
            <span class="badge highlight">${zone.tableCount || 0} Tables</span>
          </div>
          <div class="grid-2col">
            <label>Modules Up (High)
              <input type="number" id="table-up-input" class="input-num" min="1" max="8" value="${cfg.modulesPerTableUp || 2}" />
            </label>
            <label>Modules Wide (Length)
              <input type="number" id="table-wide-input" class="input-num" min="1" max="50" value="${cfg.modulesPerTableWide || 14}" />
            </label>
          </div>
          <div class="control-row">
            <div class="label-with-val">
              <label for="table-gap-input">Table Spacing (E-W Aisle)</label>
              <span class="val-display">${(cfg.tableSpacingM ?? 1.0).toFixed(2)} m</span>
            </div>
            <input type="number" id="table-gap-input" class="input-num" min="0.1" max="10" step="0.1" value="${cfg.tableSpacingM ?? 1.0}" />
          </div>
        </div>
        `
            : ''
        }

        <!-- Orientation & Layout -->
        <div class="control-section">
          <h4>📐 Orientation & Angle</h4>

          <div class="control-row">
            <label>Panel Orientation</label>
            <div class="segmented-control small">
              <button id="orient-portrait" class="seg-btn ${cfg.orientation === 'portrait' ? 'active' : ''}">Portrait</button>
              <button id="orient-landscape" class="seg-btn ${cfg.orientation === 'landscape' ? 'active' : ''}">Landscape</button>
            </div>
          </div>

          ${
            cfg.mountType === 'roof'
              ? `
          <div class="control-row">
            <label>Roof Rails (Parallel to Short Side)</label>
            <div class="segmented-control small">
              <button id="sidebar-rails-2" class="seg-btn ${(cfg.railCount ?? 2) === 2 ? 'active' : ''}">2 Rails (Ends)</button>
              <button id="sidebar-rails-3" class="seg-btn ${(cfg.railCount ?? 2) === 3 ? 'active' : ''}">3 Rails (Ends+Center)</button>
            </div>
            <div class="rail-sidebar-note" style="margin-top: 5px; font-size: 11px; color: #38bdf8; background: rgba(56, 189, 248, 0.08); padding: 5px 8px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.2);">
              <span>⚡ Rails: <strong>${cfg.orientation === 'portrait' ? 'Horizontal (along Rows)' : 'Vertical (along Slope)'}</strong></span>
              <span style="color: #94a3b8; display: block; font-size: 10px; margin-top: 2px;">${zone.railCount || (zone.rails ? zone.rails.length : 0)} rails &bull; ${(cfg.railCount ?? 2) === 3 ? 'Ends @ 18%/82% + Center @ 50%' : 'Ends @ 20% & 80%'}</span>
            </div>
          </div>
          `
              : ''
          }

          <div class="control-row">
            <div class="label-with-val">
              <label for="azimuth-input">Azimuth (Heading)</label>
              <span class="val-display">${cfg.azimuthDeg}° (${this.getCompassHeading(cfg.azimuthDeg)})</span>
            </div>
            <div class="slider-row">
              <input type="range" id="azimuth-range" min="0" max="360" step="1" value="${cfg.azimuthDeg}" />
              <input type="number" id="azimuth-num" class="input-num" min="0" max="360" value="${cfg.azimuthDeg}" />
            </div>
            <small class="help-text">Right-click any edge marker (or roof edge) on the map to slope downward towards that side.</small>
          </div>

          <div class="control-row">
            <div class="label-with-val">
              <label for="tilt-input">Tilt Angle</label>
              <span class="val-display">${cfg.tiltDeg}°</span>
            </div>
            <div class="slider-row">
              <input type="range" id="tilt-range" min="0" max="60" step="1" value="${cfg.tiltDeg}" />
              <input type="number" id="tilt-num" class="input-num" min="0" max="60" value="${cfg.tiltDeg}" />
            </div>
            ${
              cfg.tiltDeg > 0
                ? `
            <div class="tilt-sidebar-indicator" style="display: flex; align-items: center; justify-content: space-between; margin-top: 6px; padding: 6px 10px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 6px; font-size: 11px;">
              <span style="color: #60a5fa; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                <span style="font-size: 13px;">▼</span> Downward Slope:
              </span>
              <span style="color: #cbd5e1; font-family: monospace; font-weight: 600;">
                ${cfg.azimuthDeg}° (${this.getCompassHeading(cfg.azimuthDeg)})
              </span>
            </div>
            `
                : ''
            }
          </div>
        </div>

        <!-- Spacing & Boundaries -->
        <div class="control-section">
          <h4>📏 Spacing & Setbacks</h4>

          <div class="control-row">
            <div class="label-with-val">
              <label for="row-spacing">${cfg.mountType === 'roof' ? (cfg.orientation === 'portrait' ? 'Row Pitch (Across Rails)' : 'Row Gap (Along Rails)') : 'Row Pitch Gap'}</label>
              <span class="val-display">${cfg.rowSpacingM.toFixed(2)} m</span>
            </div>
            <div class="slider-row">
              <input type="range" id="row-spacing-range" min="0.02" max="6.0" step="0.05" value="${cfg.rowSpacingM}" />
              <input type="number" id="row-spacing-num" class="input-num" min="0.01" max="10" step="0.05" value="${cfg.rowSpacingM}" />
            </div>
            <button id="btn-calc-shadow" class="btn btn-sm btn-ghost">☀️ Auto-Calc Solar Pitch (${cfg.tiltDeg}° tilt)</button>
          </div>

          <div class="control-row">
            <div class="label-with-val">
              <label for="col-spacing">${cfg.mountType === 'roof' ? (cfg.orientation === 'portrait' ? 'Clamp Gap (Along Rails)' : 'Col Pitch (Across Rails)') : 'Panel Gap (in row)'}</label>
              <span class="val-display">${cfg.colSpacingM.toFixed(2)} m</span>
            </div>
            <div class="slider-row">
              <input type="range" id="col-spacing-range" min="0.01" max="0.5" step="0.01" value="${cfg.colSpacingM}" />
              <input type="number" id="col-spacing-num" class="input-num" min="0.01" max="1" step="0.01" value="${cfg.colSpacingM}" />
            </div>
          </div>

          ${
            cfg.mountType === 'roof'
              ? `
          <div class="control-row">
            <div class="label-with-val">
              <label for="rail-overhang-input">Rail Cantilever Overhang</label>
              <span class="val-display">${(cfg.railOverhangM ?? 0.10).toFixed(2)} m</span>
            </div>
            <input type="number" id="rail-overhang-input" class="input-num" min="0" max="0.5" step="0.05" value="${cfg.railOverhangM ?? 0.10}" />
          </div>
          `
              : ''
          }

          <div class="control-row">
            <div class="label-with-val">
              <label for="setback">Boundary Setback</label>
              <span class="val-display">${cfg.setbackM.toFixed(2)} m</span>
            </div>
            <div class="slider-row">
              <input type="range" id="setback-range" min="0" max="5.0" step="0.1" value="${cfg.setbackM}" />
              <input type="number" id="setback-num" class="input-num" min="0" max="10" step="0.1" value="${cfg.setbackM}" />
            </div>
            ${cfg.mountType === 'roof' ? `<small class="help-text">Setback buffer ensures modules and ${(cfg.railOverhangM ?? 0.10) * 100}cm rail cantilevers stay inside roof edge.</small>` : ''}
          </div>

          <div class="control-row">
            <label>Grid Phase Alignment</label>
            <div class="dual-inputs">
              <label>X: <input type="number" id="offset-x" class="input-num" step="0.1" value="${cfg.alignmentOffsetX.toFixed(1)}" /> m</label>
              <label>Y: <input type="number" id="offset-y" class="input-num" step="0.1" value="${cfg.alignmentOffsetY.toFixed(1)}" /> m</label>
            </div>
          </div>
        </div>

        <!-- Obstacles / Keep-Outs -->
        <div class="control-section">
          <div class="section-header-row">
            <h4>🚫 Keep-Out Obstacles (${zone.keepOuts.length})</h4>
            <button id="btn-draw-keepout" class="btn btn-sm btn-outline danger ${drawingMode === 'keepout' ? 'active' : ''}">
              + Draw Obstacle
            </button>
          </div>
          ${
            zone.keepOuts.length > 0
              ? `
            <div class="keepout-list">
              ${zone.keepOuts
                .map(
                  ko => `
                <div class="keepout-item">
                  <span>${escapeHtml(ko.name)}</span>
                  <button class="btn-remove-keepout" data-ko-id="${ko.id}">✕</button>
                </div>
              `
                )
                .join('')}
            </div>
          `
              : `<small class="help-text">Add keep-out zones for chimneys, skylights, vents, or tree shading.</small>`
          }
        </div>

        <!-- Electrical & Module Sizing -->
        <div class="control-section">
          <h4>⚡ Module Specifications</h4>
          <div class="control-row">
            <label>Model Name</label>
            <input type="text" id="module-name" class="input-text" value="${escapeHtml(cfg.electrical.modelName)}" />
          </div>
          <div class="grid-2col">
            <label>Rated Power (W)
              <input type="number" id="module-wattage" class="input-num" value="${cfg.electrical.nominalPowerW}" />
            </label>
            <label>Voc (V)
              <input type="number" id="module-voc" class="input-num" step="0.1" value="${cfg.electrical.voc}" />
            </label>
            <label>Vmp (V)
              <input type="number" id="module-vmp" class="input-num" step="0.1" value="${cfg.electrical.vmp}" />
            </label>
            <label>Isc (A)
              <input type="number" id="module-isc" class="input-num" step="0.1" value="${cfg.electrical.isc}" />
            </label>
          </div>
          <div class="grid-2col">
            <label>Width (mm)
              <input type="number" id="module-w" class="input-num" value="${cfg.panelWidthMm}" />
            </label>
            <label>Length (mm)
              <input type="number" id="module-l" class="input-num" value="${cfg.panelLengthMm}" />
            </label>
          </div>
        </div>
      </div>
    `;

    this.attachActiveStateListeners(zone.id);
  }

  private getCompassHeading(deg: number): string {
    return getCardinalDirection(deg);
  }

  private attachEmptyStateListeners() : void {
    return attachEmptyStateListenersImpl.call(this);
  }

  private attachBatchListeners() : void {
    return attachBatchListenersImpl.call(this);
  }

  private attachActiveStateListeners(zoneId: string) : void {
    return attachActiveStateListenersImpl.call(this, zoneId);
  }
}
