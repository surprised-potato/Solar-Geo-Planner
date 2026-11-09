/**
 * Ribbon "orientation" tab content (shown when an array zone is active).
 */
import type { RibbonUI } from '../ribbon';
import type { ZoneTabContext } from './zoneTabContext';
import { escapeHtml } from '../../utils/html';

export function renderOrientationTab(this: RibbonUI, ctx: ZoneTabContext): string {
  const { zone, cfg, currentModule, systems } = ctx;
  const footprintM = (
    cfg.orientation === 'portrait'
      ? (cfg.panelLengthMm / 1000) * Math.cos((cfg.tiltDeg * Math.PI) / 180)
      : (cfg.panelWidthMm / 1000) * Math.cos((cfg.tiltDeg * Math.PI) / 180)
  ).toFixed(2);

  return `
    <div class="ribbon-panel" role="tabpanel" aria-label="Array and Orientation Settings">
      <!-- Pod 1: Array Identity, Mount Type & Elevation Riser -->
      <div class="cad-pod wide">
        <div class="cad-pod-header">
          <span class="cad-pod-title">ARRAY IDENTITY</span>
          <span class="cad-pod-tag ${zone.config.mountType === 'ground' ? 'highlight' : 'accent'}">${zone.config.mountType.toUpperCase()}</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-field-row">
            <input type="text" id="ribbon-zone-name" class="cad-text-input ribbon-input-name" value="${escapeHtml(zone.name)}" title="Edit Array Zone Name" aria-label="Array Name" />
            <button id="ribbon-tab1-btn-zoom-array" class="btn btn-xs btn-outline" title="Zoom map to fit this array">🎯 Fit</button>
            <button id="ribbon-tab1-btn-delete-array" class="btn btn-xs btn-outline danger" title="Delete this array zone from project (Del)">🗑️</button>
          </div>
          <div class="cad-field-row">
            <div class="cad-segmented-control" role="group" aria-label="Mount Type">
              <button id="ribbon-mount-roof" class="cad-seg-btn ${cfg.mountType === 'roof' ? 'active' : ''}">🏠 Roof</button>
              <button id="ribbon-mount-ground" class="cad-seg-btn ${cfg.mountType === 'ground' ? 'active' : ''}">🌱 Ground</button>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <div style="display: flex; align-items: center; gap: 4px;">
            <label class="cad-mini-label" for="ribbon-link-system-select">Wired To:</label>
            <select id="ribbon-link-system-select" class="cad-select-xs" title="Change electrical system this array feeds">
              ${systems
                .map(
                  s => `
                <option value="${s.id}" ${s.id === zone.systemId ? 'selected' : ''}>
                  🔗 ${escapeHtml(s.name)}
                </option>
              `
                )
                .join('')}
            </select>
          </div>
          <div class="cad-input-unit-wrap sm" title="Vertical elevation difference (Δh) / riser drop to inverter station">
            <span class="cad-unit-prefix">Δh</span>
            <input type="number" id="ribbon-tab1-elev-delta" class="cad-num-input" value="${zone.raceway ? zone.raceway.elevationChangeM : (zone.elevationDeltaM ?? 0)}" step="0.5" aria-label="Elevation Difference in Meters" />
            <span class="cad-unit-addon">m</span>
          </div>
        </div>
      </div>

      <!-- Pod 2: Panel Aspect, Orientation & Roof Rails -->
      <div class="cad-pod ${cfg.mountType === 'roof' ? 'wide' : ''}">
        <div class="cad-pod-header">
          <span class="cad-pod-title">ORIENTATION & ROOF RAILS</span>
          <span class="cad-val-chip">${cfg.orientation === 'portrait' ? `${cfg.panelWidthMm}×${cfg.panelLengthMm}mm` : `${cfg.panelLengthMm}×${cfg.panelWidthMm}mm`}</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-segmented-control" role="group" aria-label="Panel Orientation">
            <button id="ribbon-orient-portrait" class="cad-seg-btn ${cfg.orientation === 'portrait' ? 'active' : ''}">
              <span>📱</span> Portrait
            </button>
            <button id="ribbon-orient-landscape" class="cad-seg-btn ${cfg.orientation === 'landscape' ? 'active' : ''}">
              <span>💻</span> Landscape
            </button>
          </div>
          ${
            cfg.mountType === 'roof'
              ? `
          <div style="margin-top: 6px; display: flex; align-items: center; justify-content: space-between; gap: 6px;">
            <span style="font-size: 11px; color: #94a3b8; font-weight: 600;">Parallel Rails:</span>
            <div class="cad-segmented-control" role="group" aria-label="Parallel Rails per Panel" style="margin: 0;">
              <button id="ribbon-rails-2" class="cad-seg-btn ${(cfg.railCount ?? 2) === 2 ? 'active' : ''}" style="padding: 2px 8px; font-size: 10px;" title="2 parallel rails: 1 near each end of panels (20% & 80% clamping span)">
                2 Rails (Ends)
              </button>
              <button id="ribbon-rails-3" class="cad-seg-btn ${(cfg.railCount ?? 2) === 3 ? 'active' : ''}" style="padding: 2px 8px; font-size: 10px;" title="3 parallel rails: 1 near each end + 1 at center (heavy wind/snow load)">
                3 Rails (Center+Ends)
              </button>
            </div>
          </div>
          `
              : ''
          }
        </div>
        <div class="cad-pod-footer">
          ${
            cfg.mountType === 'roof'
              ? `
            <span class="cad-hint-text" style="color: #38bdf8;" title="Roof rails are always parallel to the short side of solar panels">
              ⚡ Rails: <strong>${cfg.orientation === 'portrait' ? 'Along Rows (E-W)' : 'Along Slope (N-S)'}</strong>
            </span>
            <span class="cad-pod-tag accent">${zone.railCount || (zone.rails ? zone.rails.length : 0)} rails</span>
          `
              : `
            <span class="cad-hint-text">Module: <strong>${escapeHtml(currentModule ? currentModule.name.split(' ')[0] : 'Standard')}</strong></span>
            <span class="cad-pod-tag">${cfg.electrical.nominalPowerW}W</span>
          `
          }
        </div>
      </div>

      <!-- Pod 3: Azimuth / Compass Direction -->
      <div class="cad-pod wide">
        <div class="cad-pod-header">
          <span class="cad-pod-title">AZIMUTH / COMPASS</span>
          <span class="cad-val-chip accent" id="ribbon-azimuth-val">${cfg.azimuthDeg}° (${this.getCompassHeading(cfg.azimuthDeg)})</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-control-row">
            <input type="range" id="ribbon-azimuth-range" class="cad-slider" min="0" max="360" step="1" value="${cfg.azimuthDeg}" aria-label="Azimuth Slider" />
            <div class="cad-input-unit-wrap">
              <input type="number" id="ribbon-azimuth-num" class="cad-num-input" min="0" max="360" value="${cfg.azimuthDeg}" aria-label="Azimuth Degrees" />
              <span class="cad-unit-addon">°</span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <div class="cad-preset-chips" role="group" aria-label="Azimuth Quick Presets">
            <button class="cad-preset-pill ${cfg.azimuthDeg === 180 ? 'active' : ''}" data-azimuth="180" title="Due South (Standard Northern Hemisphere)">S 180°</button>
            <button class="cad-preset-pill ${cfg.azimuthDeg === 225 ? 'active' : ''}" data-azimuth="225" title="South-West">SW 225°</button>
            <button class="cad-preset-pill ${cfg.azimuthDeg === 270 ? 'active' : ''}" data-azimuth="270" title="Due West">W 270°</button>
            <button class="cad-preset-pill ${cfg.azimuthDeg === 135 ? 'active' : ''}" data-azimuth="135" title="South-East">SE 135°</button>
            <button class="cad-preset-pill ${cfg.azimuthDeg === 90 ? 'active' : ''}" data-azimuth="90" title="Due East">E 90°</button>
            <button class="cad-preset-pill ${cfg.azimuthDeg === 0 ? 'active' : ''}" data-azimuth="0" title="Due North">N 0°</button>
          </div>
        </div>
      </div>

      <!-- Pod 4: Tilt Angle & Ground Footprint -->
      <div class="cad-pod wide">
        <div class="cad-pod-header">
          <span class="cad-pod-title">TILT ANGLE</span>
          <span class="cad-val-chip accent" id="ribbon-tilt-val">${cfg.tiltDeg}°</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-control-row">
            <input type="range" id="ribbon-tilt-range" class="cad-slider" min="0" max="60" step="1" value="${cfg.tiltDeg}" aria-label="Tilt Slider" />
            <div class="cad-input-unit-wrap">
              <input type="number" id="ribbon-tilt-num" class="cad-num-input" min="0" max="60" value="${cfg.tiltDeg}" aria-label="Tilt Degrees" />
              <span class="cad-unit-addon">°</span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <div class="cad-preset-chips" role="group" aria-label="Tilt Angle Quick Presets">
            <button class="cad-preset-pill ${cfg.tiltDeg === 0 ? 'active' : ''}" data-tilt="0" title="Flush roof mount">0° Flush</button>
            <button class="cad-preset-pill ${cfg.tiltDeg === 15 ? 'active' : ''}" data-tilt="15" title="Low slope commercial">15°</button>
            <button class="cad-preset-pill ${cfg.tiltDeg === 25 ? 'active' : ''}" data-tilt="25" title="Standard commercial">25°</button>
            <button class="cad-preset-pill ${cfg.tiltDeg === 35 ? 'active' : ''}" data-tilt="35" title="High latitude optimal">35°</button>
          </div>
          <span class="cad-footprint-tag" id="ribbon-footprint-val">Footprint: <strong>${footprintM}m</strong></span>
        </div>
      </div>

      <!-- Pod 5: Downslope Cross-Section Profile & Map Arrows -->
      <div class="cad-pod wide">
        <div class="cad-pod-header">
          <span class="cad-pod-title">DOWNSLOPE PROFILE</span>
          <button id="ribbon-btn-toggle-tilt-arrows" class="cad-seg-btn ${this.store.viewFilter.showTiltArrows !== false ? 'active' : ''}" style="padding: 2px 8px; font-size: 11px;" title="Toggle CAD downward tilt arrows on the map">
            📐 Map Arrows: ${this.store.viewFilter.showTiltArrows !== false ? 'ON' : 'OFF'}
          </button>
        </div>
        <div class="cad-pod-body">
          ${this.renderTiltCrossSectionSvg(cfg.tiltDeg, cfg.azimuthDeg, cfg.orientation, cfg.panelLengthMm, cfg.panelWidthMm)}
        </div>
      </div>
    </div>
  `;
}
