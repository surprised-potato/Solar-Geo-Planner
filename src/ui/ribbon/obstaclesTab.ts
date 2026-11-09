/**
 * Ribbon "obstacles" tab content (shown when an array zone is active).
 */
import type { RibbonUI } from '../ribbon';
import type { ZoneTabContext } from './zoneTabContext';
import { escapeHtml } from '../../utils/html';

export function renderObstaclesTab(this: RibbonUI, ctx: ZoneTabContext): string {
  const { zone, drawingMode } = ctx;
  const isDrawingKo = drawingMode === 'keepout';
  return `
    <div class="ribbon-panel" role="tabpanel" aria-label="Obstacles and Keep-Out Zones">
      <!-- Pod 1: Drafting Tool -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">ADD OBSTACLE</span>
          <span class="cad-pod-tag ${isDrawingKo ? 'pulse-tag' : ''}">${isDrawingKo ? 'DRAWING...' : 'TOOL'}</span>
        </div>
        <div class="cad-pod-body">
          <button id="ribbon-btn-draw-ko" class="btn btn-sm ${isDrawingKo ? 'btn-primary active-pulse' : 'btn-outline danger'}">
            <span>${isDrawingKo ? '✏️' : '➕'}</span>
            ${isDrawingKo ? 'Finish Drawing (Dbl-Click)' : 'Draw Keep-Out'}
          </button>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">Skylights, vents, HVAC units, or trees</span>
        </div>
      </div>

      <!-- Pod 2: Obstacles List -->
      <div class="cad-pod fill">
        <div class="cad-pod-header">
          <span class="cad-pod-title">ACTIVE KEEP-OUT ZONES (${zone.keepOuts.length})</span>
          <span class="cad-pod-tag">Array Internal</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-horizontal-list">
            ${
              zone.keepOuts.length > 0
                ? zone.keepOuts
                    .map(
                      ko => `
                  <div class="cad-obstacle-pill">
                    <span class="obstacle-name">${escapeHtml(ko.name)}</span>
                    <button class="btn-ribbon-remove-ko" data-ko-id="${ko.id}" title="Delete this obstacle" aria-label="Remove obstacle ${escapeHtml(ko.name)}">✕</button>
                  </div>
                `
                    )
                    .join('')
                : `<span class="cad-empty-msg">No obstacles inside this array boundary. Click "Draw Keep-Out" to trace around roof obstructions.</span>`
            }
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">Panels intersecting keep-out polygons are automatically excluded from the layout.</span>
        </div>
      </div>
    </div>
  `;
}
