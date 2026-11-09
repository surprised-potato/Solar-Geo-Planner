/**
 * Ribbon "module" tab content (shown when an array zone is active).
 */
import type { RibbonUI } from '../ribbon';
import type { ZoneTabContext } from './zoneTabContext';
import { escapeHtml } from '../../utils/html';

export function renderModuleTab(this: RibbonUI, ctx: ZoneTabContext): string {
  const { zone, cfg, currentModule, modules } = ctx;
  return `
    <div class="ribbon-panel" role="tabpanel" aria-label="Solar Module Specification">
      <!-- Pod 1: Model Library -->
      <div class="cad-pod wide">
        <div class="cad-pod-header">
          <span class="cad-pod-title">ASSIGNED MODULE MODEL</span>
          <span class="cad-pod-tag highlight">1 Type / Array</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-field-row">
            <select id="ribbon-module-select" class="cad-select" title="Choose panel model from library" aria-label="Assigned Module Model">
              ${modules
                .map(
                  m => `
                <option value="${m.id}" ${m.id === zone.moduleId ? 'selected' : ''}>
                  ${escapeHtml(m.name)} (${m.nominalPowerW}W, ${m.widthMm}×${m.lengthMm}mm)
                </option>
              `
                )
                .join('')}
            </select>
            <button id="ribbon-btn-new-module" class="btn btn-xs btn-outline" title="Register custom panel model into library">
              + New
            </button>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">Manufacturer: <strong>${escapeHtml(currentModule?.manufacturer || 'Generic')}</strong> (${currentModule?.bifacial ? 'Bifacial' : 'Monofacial'})</span>
        </div>
      </div>

      <!-- Pod 2: STC Electrical Specs -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">ELECTRICAL RATINGS (STC)</span>
          <span class="cad-val-chip accent">${cfg.electrical.nominalPowerW} W</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-control-row compact-gap">
            <div class="cad-input-unit-wrap sm" title="Nominal STC Wattage (Pmax)">
              <span class="cad-unit-prefix">P</span>
              <input type="number" id="ribbon-mod-w" class="cad-num-input" value="${cfg.electrical.nominalPowerW}" aria-label="Wattage" />
              <span class="cad-unit-addon">W</span>
            </div>
            <div class="cad-input-unit-wrap sm" title="Open Circuit Voltage (Voc)">
              <span class="cad-unit-prefix">Voc</span>
              <input type="number" id="ribbon-mod-voc" class="cad-num-input" step="0.1" value="${cfg.electrical.voc}" aria-label="Voc" />
              <span class="cad-unit-addon">V</span>
            </div>
            <div class="cad-input-unit-wrap sm" title="Max Power Voltage (Vmp)">
              <span class="cad-unit-prefix">Vmp</span>
              <input type="number" id="ribbon-mod-vmp" class="cad-num-input" step="0.1" value="${cfg.electrical.vmp}" aria-label="Vmp" />
              <span class="cad-unit-addon">V</span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">Standard Test Conditions (1000W/m², 25°C)</span>
        </div>
      </div>

      <!-- Pod 3: Current & Physical Dimensions -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">CURRENT & DIMENSIONS</span>
          <span class="cad-val-chip">${cfg.panelWidthMm} × ${cfg.panelLengthMm} mm</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-control-row compact-gap">
            <div class="cad-input-unit-wrap sm" title="Short Circuit Current (Isc)">
              <span class="cad-unit-prefix">Isc</span>
              <input type="number" id="ribbon-mod-isc" class="cad-num-input" step="0.1" value="${cfg.electrical.isc}" aria-label="Isc" />
              <span class="cad-unit-addon">A</span>
            </div>
            <div class="cad-input-unit-wrap sm" title="Max Power Current (Imp)">
              <span class="cad-unit-prefix">Imp</span>
              <input type="number" id="ribbon-mod-imp" class="cad-num-input" step="0.1" value="${cfg.electrical.imp}" aria-label="Imp" />
              <span class="cad-unit-addon">A</span>
            </div>
            <div class="cad-input-unit-wrap sm" title="Module Width in millimeters">
              <span class="cad-unit-prefix">W</span>
              <input type="number" id="ribbon-mod-dimw" class="cad-num-input" value="${cfg.panelWidthMm}" aria-label="Width" />
              <span class="cad-unit-addon">mm</span>
            </div>
            <div class="cad-input-unit-wrap sm" title="Module Length in millimeters">
              <span class="cad-unit-prefix">L</span>
              <input type="number" id="ribbon-mod-diml" class="cad-num-input" value="${cfg.panelLengthMm}" aria-label="Length" />
              <span class="cad-unit-addon">mm</span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">Physical outer frame dimensions</span>
        </div>
      </div>
    </div>
  `;
}
