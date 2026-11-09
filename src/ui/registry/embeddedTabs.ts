/**
 * SLD and BOQ tabs embedded in the registry modal.
 */
import { SolarSystem } from '../../types/solar';
import type { RegistryModalUI } from '../registryModal';
import { escapeHtml } from '../../utils/html';

/**
 * 7. SINGLE LINE DIAGRAM TAB VIEW
 * Displays the 2D Wireframe Single Line Diagram for the selected system.
 */
export function renderSldTab(this: RegistryModalUI, allSystems?: SolarSystem[]): string {
  const systems = allSystems || this.store.getSystems();
  const selectedSysId = this.filterSystemId !== 'all' ? this.filterSystemId : (this.store.getSelectedSystem()?.id || systems[0]?.id || '');
  const currentSys = systems.find(s => s.id === selectedSysId);

  return `
    <div class="registry-toolbar">
      <div class="filters-row">
        <label for="modal-system-filter" style="font-size: 13px; font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 4px;">
          <span class="icon">⚡</span> System:
        </label>
        <select id="modal-system-filter" class="input-select" title="Select electrical system for SLD">
          <option value="all" ${this.filterSystemId === 'all' ? 'selected' : ''}>All Systems (Default: ${escapeHtml(this.store.getSelectedSystem()?.name || 'Main')})</option>
          ${systems.map(s => `<option value="${s.id}" ${this.filterSystemId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
        ${
          currentSys
            ? `<span class="badge" style="background: ${currentSys.color || '#0284c7'}; color: #fff;">Displaying: ${escapeHtml(currentSys.name)}</span>`
            : ''
        }
      </div>
      <div class="tbl-action-hint">
        <span class="icon">⚡</span> 2D Single Line Diagram wireframe showing DC strings, inverter units, and AC panelboards.
      </div>
    </div>
    <div class="modal-sld-wrapper" style="height: 600px; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-color); border-radius: var(--panel-radius);">
      <div id="modal-sld-mount" style="flex: 1; width: 100%; height: 100%;"></div>
    </div>
  `;
}

/**
 * 8. BOQ & DUPA TAB VIEW
 */
export function renderBoqTab(this: RegistryModalUI, _allSystems?: SolarSystem[]): string {
  return `
    <div class="modal-boq-wrapper" style="display: flex; flex-direction: column; overflow-y: auto; max-height: calc(85vh - 180px);">
      <div id="modal-boq-mount" style="width: 100%;"></div>
    </div>
  `;
}
