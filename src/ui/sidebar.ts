import { ProjectStore } from '../store/projectStore';
import { calculateRecommendedRowSpacing } from '../geo/autofill';
import { DEFAULT_GROUND_CONFIG, DEFAULT_ROOF_CONFIG } from '../types/solar';
import { escapeHtml } from '../utils/html';

export class SidebarUI {
  private container: HTMLElement;
  private store: ProjectStore;

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
    const d = (deg % 360 + 360) % 360;
    if (d >= 337.5 || d < 22.5) return 'N';
    if (d >= 22.5 && d < 67.5) return 'NE';
    if (d >= 67.5 && d < 112.5) return 'E';
    if (d >= 112.5 && d < 157.5) return 'SE';
    if (d >= 157.5 && d < 202.5) return 'S';
    if (d >= 202.5 && d < 247.5) return 'SW';
    if (d >= 247.5 && d < 292.5) return 'W';
    return 'NW';
  }

  private attachEmptyStateListeners(): void {
    const btnRoof = document.getElementById('btn-draw-roof');
    btnRoof?.addEventListener('click', () => {
      const isDrawingRoof = this.store.drawingMode === 'zone' && this.store.drawingMountType === 'roof';
      this.store.setDrawingMode(isDrawingRoof ? 'none' : 'zone', 'roof');
    });

    const btnGround = document.getElementById('btn-draw-ground');
    btnGround?.addEventListener('click', () => {
      const isDrawingGround = this.store.drawingMode === 'zone' && this.store.drawingMountType === 'ground';
      this.store.setDrawingMode(isDrawingGround ? 'none' : 'zone', 'ground');
    });

    const zoneItems = this.container.querySelectorAll('.zone-list-item');
    zoneItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const zoneId = item.getAttribute('data-zone-id');
        const isMulti = (e as MouseEvent).shiftKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey;
        if (zoneId) this.store.selectZone(zoneId, isMulti);
      });
    });
  }

  private attachBatchListeners(): void {
    document.getElementById('btn-sidebar-clear-sel')?.addEventListener('click', () => {
      this.store.clearZoneSelection();
    });

    document.getElementById('btn-sidebar-batch-del')?.addEventListener('click', () => {
      const count = this.store.selectedZoneIds.size;
      if (confirm(`Delete all ${count} selected arrays and their solar modules?`)) {
        this.store.deleteSelected();
      }
    });

    document.getElementById('btn-sidebar-batch-opt')?.addEventListener('click', () => {
      const res = this.store.optimizeSelectedZonesGridShift(12);
      const diff = res.totalMaxPanels - res.totalPreviousPanels;
      let msg = `🎉 Batch Grid Shift Optimized & Auto-Strung!\nOptimized ${res.optimizedCount} Selected Arrays\nTotal Fitted Panels: ${res.totalMaxPanels} (${diff >= 0 ? `+${diff}` : diff} panels)`;
      if (res.totalStrings !== undefined) {
        msg += `\n⚡ Auto-Strung into ${res.totalStrings} Strings!`;
      }
      alert(msg);
    });

    this.container.querySelectorAll<HTMLButtonElement>('.btn-sidebar-batch-setback').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = Number(btn.getAttribute('data-val'));
        if (!isNaN(val)) {
          this.store.updateSelectedZonesConfig({ setbackM: val });
        }
      });
    });

    const zoneItems = this.container.querySelectorAll('.zone-list-item');
    zoneItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const zoneId = item.getAttribute('data-zone-id');
        const isMulti = (e as MouseEvent).shiftKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey || true;
        if (zoneId) this.store.selectZone(zoneId, isMulti);
      });
    });
  }

  private attachActiveStateListeners(zoneId: string): void {
    const nameInput = document.getElementById('zone-name-input') as HTMLInputElement;
    nameInput?.addEventListener('change', () => {
      const z = this.store.getZone(zoneId);
      if (z) z.name = nameInput.value;
    });

    const btnDelete = document.getElementById('btn-delete-zone');
    btnDelete?.addEventListener('click', () => {
      if (confirm('Delete this array zone and all its panels?')) {
        this.store.removeZone(zoneId);
      }
    });

    // Mount switcher
    document.getElementById('mount-roof')?.addEventListener('click', () => {
      this.store.updateZoneConfig(zoneId, {
        ...DEFAULT_ROOF_CONFIG,
        mountType: 'roof'
      });
    });

    document.getElementById('mount-ground')?.addEventListener('click', () => {
      this.store.updateZoneConfig(zoneId, {
        ...DEFAULT_GROUND_CONFIG,
        mountType: 'ground'
      });
    });

    const tableUpEl = document.getElementById('table-up-input') as HTMLInputElement;
    tableUpEl?.addEventListener('change', () => {
      const up = Math.max(1, parseInt(tableUpEl.value) || 2);
      this.store.updateZoneConfig(zoneId, { modulesPerTableUp: up });
    });

    const tableWideEl = document.getElementById('table-wide-input') as HTMLInputElement;
    tableWideEl?.addEventListener('change', () => {
      const wide = Math.max(1, parseInt(tableWideEl.value) || 14);
      this.store.updateZoneConfig(zoneId, { modulesPerTableWide: wide });
    });

    const tableGapEl = document.getElementById('table-gap-input') as HTMLInputElement;
    tableGapEl?.addEventListener('change', () => {
      const gap = Math.max(0.1, parseFloat(tableGapEl.value) || 1.0);
      this.store.updateZoneConfig(zoneId, { tableSpacingM: gap });
    });

    // Orientation
    document.getElementById('orient-portrait')?.addEventListener('click', () => {
      this.store.updateZoneConfig(zoneId, { orientation: 'portrait' });
    });
    document.getElementById('orient-landscape')?.addEventListener('click', () => {
      this.store.updateZoneConfig(zoneId, { orientation: 'landscape' });
    });

    // Roof Rails (Parallel to Short Side)
    document.getElementById('sidebar-rails-2')?.addEventListener('click', () => {
      this.store.updateZoneConfig(zoneId, { railCount: 2 });
    });
    document.getElementById('sidebar-rails-3')?.addEventListener('click', () => {
      this.store.updateZoneConfig(zoneId, { railCount: 3 });
    });

    const overhangInput = document.getElementById('rail-overhang-input') as HTMLInputElement;
    overhangInput?.addEventListener('change', () => {
      const oh = Math.max(0, parseFloat(overhangInput.value) || 0.10);
      this.store.updateZoneConfig(zoneId, { railOverhangM: oh });
    });

    // Azimuth
    const azRange = document.getElementById('azimuth-range') as HTMLInputElement;
    const azNum = document.getElementById('azimuth-num') as HTMLInputElement;
    const syncAzimuth = (val: number) => {
      this.store.updateZoneConfig(zoneId, { azimuthDeg: Math.round(val) });
    };
    azRange?.addEventListener('input', () => syncAzimuth(Number(azRange.value)));
    azNum?.addEventListener('change', () => syncAzimuth(Number(azNum.value)));

    // Tilt
    const tiltRange = document.getElementById('tilt-range') as HTMLInputElement;
    const tiltNum = document.getElementById('tilt-num') as HTMLInputElement;
    const syncTilt = (val: number) => {
      this.store.updateZoneConfig(zoneId, { tiltDeg: Math.round(val) });
    };
    tiltRange?.addEventListener('input', () => syncTilt(Number(tiltRange.value)));
    tiltNum?.addEventListener('change', () => syncTilt(Number(tiltNum.value)));

    // Row Spacing
    const rowRange = document.getElementById('row-spacing-range') as HTMLInputElement;
    const rowNum = document.getElementById('row-spacing-num') as HTMLInputElement;
    const syncRow = (val: number) => {
      this.store.updateZoneConfig(zoneId, { rowSpacingM: val });
    };
    rowRange?.addEventListener('input', () => syncRow(Number(rowRange.value)));
    rowNum?.addEventListener('change', () => syncRow(Number(rowNum.value)));

    // Auto calculate pitch based on tilt
    document.getElementById('btn-calc-shadow')?.addEventListener('click', () => {
      const z = this.store.getZone(zoneId);
      if (!z) return;
      const lengthM =
        z.config.orientation === 'portrait'
          ? z.config.panelLengthMm / 1000
          : z.config.panelWidthMm / 1000;
      const recPitch = calculateRecommendedRowSpacing(z.config.tiltDeg, lengthM, this.store.center.lat);
      this.store.updateZoneConfig(zoneId, { rowSpacingM: recPitch });
    });

    // Col Spacing
    const colRange = document.getElementById('col-spacing-range') as HTMLInputElement;
    const colNum = document.getElementById('col-spacing-num') as HTMLInputElement;
    const syncCol = (val: number) => {
      this.store.updateZoneConfig(zoneId, { colSpacingM: val });
    };
    colRange?.addEventListener('input', () => syncCol(Number(colRange.value)));
    colNum?.addEventListener('change', () => syncCol(Number(colNum.value)));

    // Setback
    const setRange = document.getElementById('setback-range') as HTMLInputElement;
    const setNum = document.getElementById('setback-num') as HTMLInputElement;
    const syncSet = (val: number) => {
      this.store.updateZoneConfig(zoneId, { setbackM: val });
    };
    setRange?.addEventListener('input', () => syncSet(Number(setRange.value)));
    setNum?.addEventListener('change', () => syncSet(Number(setNum.value)));

    // Offsets
    const offX = document.getElementById('offset-x') as HTMLInputElement;
    const offY = document.getElementById('offset-y') as HTMLInputElement;
    offX?.addEventListener('change', () => {
      this.store.updateZoneConfig(zoneId, { alignmentOffsetX: Number(offX.value) });
    });
    offY?.addEventListener('change', () => {
      this.store.updateZoneConfig(zoneId, { alignmentOffsetY: Number(offY.value) });
    });

    // Keep-out button
    document.getElementById('btn-draw-keepout')?.addEventListener('click', () => {
      this.store.setDrawingMode(this.store.drawingMode === 'keepout' ? 'none' : 'keepout');
    });

    // Remove keep-out items
    this.container.querySelectorAll('.btn-remove-keepout').forEach(btn => {
      btn.addEventListener('click', e => {
        const koId = (e.currentTarget as HTMLElement).getAttribute('data-ko-id');
        if (koId) this.store.removeKeepOut(zoneId, koId);
      });
    });

    // Electrical inputs
    const modName = document.getElementById('module-name') as HTMLInputElement;
    const modW = document.getElementById('module-wattage') as HTMLInputElement;
    const modVoc = document.getElementById('module-voc') as HTMLInputElement;
    const modVmp = document.getElementById('module-vmp') as HTMLInputElement;
    const modIsc = document.getElementById('module-isc') as HTMLInputElement;
    const modDimW = document.getElementById('module-w') as HTMLInputElement;
    const modDimL = document.getElementById('module-l') as HTMLInputElement;

    const syncElectrical = () => {
      this.store.updateZoneConfig(zoneId, {
        panelWidthMm: Number(modDimW.value) || 1134,
        panelLengthMm: Number(modDimL.value) || 1762,
        electrical: {
          modelName: modName.value || 'Standard PV Module',
          nominalPowerW: Number(modW.value) || 400,
          voc: Number(modVoc.value) || 40,
          vmp: Number(modVmp.value) || 32,
          isc: Number(modIsc.value) || 13,
          imp: Number(modW.value) / (Number(modVmp.value) || 32)
        }
      });
    };

    [modName, modW, modVoc, modVmp, modIsc, modDimW, modDimL].forEach(input => {
      input?.addEventListener('change', syncElectrical);
    });
  }
}
