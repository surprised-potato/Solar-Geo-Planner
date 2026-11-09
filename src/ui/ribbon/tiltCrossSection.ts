/**
 * 2D tilt cross-section SVG widget used by the orientation tab.
 */
import type { RibbonUI } from '../ribbon';

/**
 * Renders a 2D cross-section SVG displaying the inclined solar panel face,
 * high ridge, low eave, and a downward slope arrow pointing in the direction of gravity runoff.
 */
export function renderTiltCrossSectionSvg(
  this: RibbonUI,
  tiltDeg: number,
  azimuthDeg: number,
  orientation: 'portrait' | 'landscape',
  panelLengthMm: number,
  panelWidthMm: number
): string {
  const tiltRad = (tiltDeg * Math.PI) / 180;
  const compass = this.getCompassHeading(azimuthDeg);
  const modLenM = (orientation === 'portrait' ? panelLengthMm : panelWidthMm) / 1000;
  const riseM = (modLenM * Math.sin(tiltRad)).toFixed(2);
  const projM = (modLenM * Math.cos(tiltRad)).toFixed(2);

  // SVG coordinate space: (width: 230, height: 72)
  // Low pivot (eave) placed on right at (185, 54)
  const diagLen = 115;
  const xLow = 185;
  const yLow = 54;
  const xHigh = xLow - diagLen * Math.cos(tiltRad);
  const yHigh = yLow - diagLen * Math.sin(tiltRad);

  // Downward slope arrow coordinates (12px above and parallel to panel)
  const arrowOffset = 13;
  const normX = -Math.sin(tiltRad) * arrowOffset;
  const normY = -Math.cos(tiltRad) * arrowOffset;

  const ax1 = xHigh + normX + 10 * Math.cos(tiltRad);
  const ay1 = yHigh + normY + 10 * Math.sin(tiltRad);
  const ax2 = xLow + normX - 6 * Math.cos(tiltRad);
  const ay2 = yLow + normY - 6 * Math.sin(tiltRad);

  return `
    <div class="tilt-profile-card">
      <svg width="230" height="72" viewBox="0 0 230 72" class="tilt-profile-svg">
        <defs>
          <marker id="arrow-down-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
          </marker>
        </defs>

        <!-- Horizontal Reference Base Line (0°) -->
        <line x1="20" y1="58" x2="215" y2="58" stroke="#475569" stroke-width="1.5" stroke-dasharray="4,3" />
        <text x="24" y="68" fill="#64748b" font-size="8.5" font-family="sans-serif">Base 0°</text>

        <!-- Rear Standoff Post (High side) -->
        ${
          tiltDeg > 2
            ? `
          <line x1="${xHigh}" y1="58" x2="${xHigh}" y2="${yHigh}" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" />
          <text x="${Math.max(5, xHigh - 22)}" y="${(58 + yHigh) / 2 + 3}" fill="#38bdf8" font-size="8" font-weight="600" text-anchor="end">▲ ${riseM}m</text>
        `
            : ''
        }

        <!-- Front Footing / Pivot (Low side) -->
        <line x1="${xLow}" y1="54" x2="${xLow}" y2="58" stroke="#94a3b8" stroke-width="2.5" />
        <circle cx="${xLow}" cy="54" r="2.5" fill="#f59e0b" />

        <!-- Solar Module Sloped Face -->
        <line x1="${xHigh}" y1="${yHigh}" x2="${xLow}" y2="${yLow}" stroke="#38bdf8" stroke-width="4.5" stroke-linecap="round" />
        <line x1="${xHigh}" y1="${yHigh}" x2="${xLow}" y2="${yLow}" stroke="#0284c7" stroke-width="2" stroke-linecap="round" />

        <!-- Downward Slope Arrow (High Ridge ➔ Low Eave) -->
        ${
          tiltDeg > 0
            ? `
          <line x1="${ax1}" y1="${ay1}" x2="${ax2}" y2="${ay2}" stroke="#f59e0b" stroke-width="2" marker-end="url(#arrow-down-head)" />
          <text x="${(ax1 + ax2) / 2}" y="${(ay1 + ay2) / 2 - 4}" fill="#fbbf24" font-size="8.5" font-weight="700" text-anchor="middle">
            ▼ Downward Slope
          </text>
        `
            : ''
        }

        <!-- High/Low Indicators -->
        <text x="${xHigh}" y="${Math.max(10, yHigh - 5)}" fill="#94a3b8" font-size="8" text-anchor="middle">HIGH (Ridge)</text>
        <text x="${xLow}" y="48" fill="#94a3b8" font-size="8" text-anchor="middle">LOW (Eave)</text>
      </svg>

      <div class="tilt-profile-legend">
        <span class="legend-chip"><b>▼ Slope:</b> Facing ${azimuthDeg}° (${compass})</span>
        <span class="legend-chip"><b>Rise:</b> ${riseM}m &bull; <b>Run:</b> ${projM}m</span>
      </div>
    </div>
  `;
}
