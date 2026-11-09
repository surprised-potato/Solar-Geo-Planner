/**
 * Ribbon "spacing" tab content (shown when an array zone is active).
 */
import type { RibbonUI } from '../ribbon';
import type { ZoneTabContext } from './zoneTabContext';

export function renderSpacingTab(this: RibbonUI, ctx: ZoneTabContext): string {
  const { zone, cfg, currentTraverseDir } = ctx;
  const isGround = cfg.mountType === 'ground';
  const tableUp = cfg.modulesPerTableUp || 2;
  const tableWide = cfg.modulesPerTableWide || 14;
  const tableTotal = tableUp * tableWide;
  const tableGap = cfg.tableSpacingM ?? 1.0;

  return `
    <div class="ribbon-panel" role="tabpanel" aria-label="Row and Column Spacing Settings">
      <!-- Pod 1: Boundary Setback (Perimeter Buffer) -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">BOUNDARY SETBACK</span>
          <span class="cad-val-chip" id="ribbon-set-val">${cfg.setbackM.toFixed(2)} m</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-control-row">
            <input type="range" id="ribbon-set-range" class="cad-slider" min="0" max="5.0" step="0.1" value="${cfg.setbackM}" aria-label="Boundary Setback Slider" />
            <div class="cad-input-unit-wrap">
              <input type="number" id="ribbon-set-num" class="cad-num-input" min="0" max="10" step="0.1" value="${cfg.setbackM}" aria-label="Boundary Setback in Meters" />
              <span class="cad-unit-addon">m</span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <div class="cad-preset-chips" role="group" aria-label="Setback Quick Presets">
            <button class="cad-preset-pill ${cfg.setbackM === 0 ? 'active' : ''}" data-setback="0.0">0.0m</button>
            ${
              isGround
                ? `
              <button class="cad-preset-pill ${Math.abs(cfg.setbackM - 1.0) < 0.05 ? 'active' : ''}" data-setback="1.0">1.0m</button>
              <button class="cad-preset-pill ${Math.abs(cfg.setbackM - 2.0) < 0.05 ? 'active' : ''}" data-setback="2.0">2.0m (Code)</button>
              <button class="cad-preset-pill ${Math.abs(cfg.setbackM - 3.0) < 0.05 ? 'active' : ''}" data-setback="3.0">3.0m</button>
            `
                : `
              <button class="cad-preset-pill ${Math.abs(cfg.setbackM - 0.5) < 0.05 ? 'active' : ''}" data-setback="0.5">0.5m (Gutter)</button>
              <button class="cad-preset-pill ${Math.abs(cfg.setbackM - 0.9) < 0.05 ? 'active' : ''}" data-setback="0.9">0.9m (Code 3ft)</button>
              <button class="cad-preset-pill ${Math.abs(cfg.setbackM - 1.5) < 0.05 ? 'active' : ''}" data-setback="1.5">1.5m (Ridge)</button>
            `
            }
          </div>
        </div>
      </div>

      ${
        !isGround
          ? `
      <!-- Pod 2: Roof Rails Racking -->
      <div class="cad-pod wide">
        <div class="cad-pod-header">
          <span class="cad-pod-title">ROOF RAILS (RACKING)</span>
          <span class="cad-val-chip accent" id="ribbon-rails-val">${(cfg.railCount ?? 2) === 3 ? '3 Rails (Center+Ends)' : '2 Rails (Ends)'}</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-control-row">
            <label class="cad-mini-label">Rails:</label>
            <div class="cad-segmented-control" role="group" aria-label="Parallel Rails Count">
              <button id="ribbon-spacing-rails-2" class="cad-seg-btn ${(cfg.railCount ?? 2) === 2 ? 'active' : ''}" style="padding: 2px 8px; font-size: 11px;" title="2 parallel rails: 1 near each end of panels (20% & 80% clamping span)">
                2 Rails (Ends)
              </button>
              <button id="ribbon-spacing-rails-3" class="cad-seg-btn ${(cfg.railCount ?? 2) === 3 ? 'active' : ''}" style="padding: 2px 8px; font-size: 11px;" title="3 parallel rails: 1 near each end + 1 at center (heavy wind/snow load)">
                3 Rails (Center+Ends)
              </button>
            </div>
            <label class="cad-mini-label" for="ribbon-rail-overhang" style="margin-left: 8px;">Overhang:</label>
            <div class="cad-input-unit-wrap sm" title="Cantilever rail overhang past outer panel edges">
              <input type="number" id="ribbon-rail-overhang" class="cad-num-input" min="0.0" max="0.5" step="0.05" value="${(cfg.railOverhangM ?? 0.10).toFixed(2)}" aria-label="Rail Cantilever in Meters" />
              <span class="cad-unit-addon">m</span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text" style="color: #38bdf8;">
            ⚡ Parallel to short side: <strong>${cfg.orientation === 'portrait' ? 'Horizontal along Row' : 'Vertical along Slope'}</strong>
          </span>
          <span class="cad-pod-tag highlight">${zone.railCount || (zone.rails ? zone.rails.length : 0)} Rails (${(zone.rails ? zone.rails.reduce((acc, r) => acc + r.lengthM, 0) : 0).toFixed(1)}m)</span>
        </div>
      </div>
      `
          : ''
      }

      ${
        isGround
          ? `
      <!-- Pod 2: Ground Mount Table Racking -->
      <div class="cad-pod wide">
        <div class="cad-pod-header">
          <span class="cad-pod-title">MOUNT TABLE (RACK)</span>
          <span class="cad-val-chip accent" id="ribbon-table-chip">${tableUp}P × ${tableWide} (${tableTotal} mods/tbl)</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-control-row">
            <label class="cad-mini-label" for="ribbon-table-up">Up:</label>
            <div class="cad-input-unit-wrap">
              <input type="number" id="ribbon-table-up" class="cad-num-input" min="1" max="8" value="${tableUp}" aria-label="Modules High Per Table" />
              <span class="cad-unit-addon">high</span>
            </div>
            <label class="cad-mini-label" for="ribbon-table-wide" style="margin-left: 8px;">Wide:</label>
            <div class="cad-input-unit-wrap">
              <input type="number" id="ribbon-table-wide" class="cad-num-input" min="1" max="50" value="${tableWide}" aria-label="Modules Wide Per Table" />
              <span class="cad-unit-addon">wide</span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <div class="cad-preset-chips" role="group" aria-label="Table Layout Presets">
            <button class="cad-preset-pill ${tableUp === 2 && tableWide === 14 ? 'active' : ''}" data-table-preset="2x14">2P × 14 (28)</button>
            <button class="cad-preset-pill ${tableUp === 2 && tableWide === 20 ? 'active' : ''}" data-table-preset="2x20">2P × 20 (40)</button>
            <button class="cad-preset-pill ${tableUp === 1 && tableWide === 28 ? 'active' : ''}" data-table-preset="1x28">1P × 28 (28)</button>
            <button class="cad-preset-pill ${tableUp === 4 && tableWide === 6 ? 'active' : ''}" data-table-preset="4x6">4L × 6 (24)</button>
          </div>
        </div>
      </div>
      `
          : ''
      }

      <!-- Pod: Row Pitch Gap / Solar Shadow Clearance -->
      <div class="cad-pod wide">
        <div class="cad-pod-header">
          <span class="cad-pod-title">${isGround ? 'ROW PITCH (N-S)' : (cfg.orientation === 'portrait' ? 'ROW PITCH (ACROSS RAILS)' : 'ROW GAP (ALONG RAILS)')}</span>
          <span class="cad-val-chip accent" id="ribbon-row-val">${cfg.rowSpacingM.toFixed(2)} m</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-control-row">
            <input type="range" id="ribbon-row-range" class="cad-slider" min="0.02" max="${isGround ? '12.0' : '6.0'}" step="0.05" value="${cfg.rowSpacingM}" aria-label="Row Pitch Gap Slider" />
            <div class="cad-input-unit-wrap">
              <input type="number" id="ribbon-row-num" class="cad-num-input" min="0.01" max="15" step="0.05" value="${cfg.rowSpacingM}" aria-label="Row Pitch Gap in Meters" />
              <span class="cad-unit-addon">m</span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <button id="ribbon-btn-calc-pitch" class="cad-action-btn highlight" title="Compute winter solstice non-shading row pitch gap based on array tilt and location latitude">
            ☀️ Auto-Calc Solar Pitch (${cfg.tiltDeg}°)
          </button>
        </div>
      </div>

      ${
        isGround
          ? `
      <!-- Pod: Table Spacing (Aisle Gap Along Row) -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">TABLE GAP (E-W)</span>
          <span class="cad-val-chip" id="ribbon-table-gap-val">${tableGap.toFixed(2)} m</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-control-row">
            <input type="range" id="ribbon-table-gap-range" class="cad-slider" min="0.1" max="4.0" step="0.1" value="${tableGap}" aria-label="Table Gap Slider" />
            <div class="cad-input-unit-wrap">
              <input type="number" id="ribbon-table-gap-num" class="cad-num-input" min="0.1" max="10" step="0.1" value="${tableGap}" aria-label="Table Gap in Meters" />
              <span class="cad-unit-addon">m</span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <div class="cad-preset-chips" role="group" aria-label="Table Gap Presets">
            <button class="cad-preset-pill ${Math.abs(tableGap - 0.5) < 0.05 ? 'active' : ''}" data-tablegap="0.5">0.5m</button>
            <button class="cad-preset-pill ${Math.abs(tableGap - 1.0) < 0.05 ? 'active' : ''}" data-tablegap="1.0">1.0m</button>
            <button class="cad-preset-pill ${Math.abs(tableGap - 1.5) < 0.05 ? 'active' : ''}" data-tablegap="1.5">1.5m</button>
          </div>
        </div>
      </div>
      `
          : ''
      }

      <!-- Pod: In-Row Panel Gap (Clamp) -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">${isGround ? 'CLAMP GAP' : (cfg.orientation === 'portrait' ? 'CLAMP GAP (ALONG RAILS)' : 'COLUMN PITCH (ACROSS RAILS)')}</span>
          <span class="cad-val-chip" id="ribbon-col-val">${cfg.colSpacingM.toFixed(2)} m</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-control-row">
            <input type="range" id="ribbon-col-range" class="cad-slider" min="0.01" max="0.5" step="0.01" value="${cfg.colSpacingM}" aria-label="Column Spacing Slider" />
            <div class="cad-input-unit-wrap">
              <input type="number" id="ribbon-col-num" class="cad-num-input" min="0.01" max="1" step="0.01" value="${cfg.colSpacingM}" aria-label="Column Spacing in Meters" />
              <span class="cad-unit-addon">m</span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <div class="cad-preset-chips" role="group" aria-label="Panel Gap Quick Presets">
            <button class="cad-preset-pill ${Math.abs(cfg.colSpacingM - 0.02) < 0.005 ? 'active' : ''}" data-colgap="0.02">0.02m (Clamp)</button>
            <button class="cad-preset-pill ${Math.abs(cfg.colSpacingM - 0.05) < 0.005 ? 'active' : ''}" data-colgap="0.05">0.05m</button>
            <button class="cad-preset-pill ${Math.abs(cfg.colSpacingM - 0.1) < 0.005 ? 'active' : ''}" data-colgap="0.10">0.10m</button>
          </div>
        </div>
      </div>

      <!-- Pod: Grid Shift Optimization -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">GRID PHASE SHIFT</span>
          <span class="cad-pod-tag highlight">Auto-Pack</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-control-row">
            <div class="cad-input-unit-wrap">
              <span class="cad-unit-prefix">X</span>
              <input type="number" id="ribbon-off-x" class="cad-num-input" step="0.1" value="${cfg.alignmentOffsetX.toFixed(1)}" aria-label="X Phase Offset in Meters" />
              <span class="cad-unit-addon">m</span>
            </div>
            <div class="cad-input-unit-wrap">
              <span class="cad-unit-prefix">Y</span>
              <input type="number" id="ribbon-off-y" class="cad-num-input" step="0.1" value="${cfg.alignmentOffsetY.toFixed(1)}" aria-label="Y Phase Offset in Meters" />
              <span class="cad-unit-addon">m</span>
            </div>
          </div>
          <div class="cad-field-row" style="margin-top: 4px;">
            <select id="ribbon-opt-str-direction" class="cad-select-sm full" title="Direction to traverse modules when auto-stringing" aria-label="Grid Shift Traverse Direction">
              <option value="short_side" ${currentTraverseDir === 'short_side' ? 'selected' : ''}>↕ Traverse: Short Side (Default)</option>
              <option value="long_side" ${currentTraverseDir === 'long_side' ? 'selected' : ''}>↔ Traverse: Long Side</option>
              <option value="rows" ${currentTraverseDir === 'rows' ? 'selected' : ''}>↔ Follow Rows (Horizontal)</option>
              <option value="columns" ${currentTraverseDir === 'columns' ? 'selected' : ''}>↕ Follow Columns (Vertical)</option>
            </select>
          </div>
        </div>
        <div class="cad-pod-footer">
          <button id="ribbon-btn-opt-shift" class="cad-action-btn energetic" title="Sweep grid phase coordinates to maximize fitted solar panels and auto-string electrical strings">
            🚀 Maximize & Auto-String Panels
          </button>
        </div>
      </div>
    </div>
  `;
}
