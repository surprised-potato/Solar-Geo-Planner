import { ProjectStore } from '../store/projectStore';
import { SolarPanelObject, ArrayZone, SolarSystem, KeepOutPolygon, StringCableLength } from '../types/solar';
import { MapController } from '../map/mapController';
import { renderArraysTable as renderArraysTableImpl } from './registry/arraysTable';
import { renderSystemsTable as renderSystemsTableImpl } from './registry/systemsTable';
import { renderRacewaysTable as renderRacewaysTableImpl } from './registry/racewaysTable';
import { renderStringsTable as renderStringsTableImpl } from './registry/stringsTable';
import {
  getFilteredPanels as getFilteredPanelsImpl,
  renderPanelsTable as renderPanelsTableImpl
} from './registry/panelsTable';
import { renderSldTab as renderSldTabImpl, renderBoqTab as renderBoqTabImpl } from './registry/embeddedTabs';
import { attachModalListeners as attachModalListenersImpl } from './registry/registryEvents';
import { exportActiveTabCsv as exportActiveTabCsvImpl } from './registry/registryCsvExport';
import { renderKeepOutsTable as renderKeepOutsTableImpl } from './registry/keepOutsTable';
import { escapeHtml } from '../utils/html';
import { enableBackdropDismiss } from '../utils/dialog';

export type TableViewTab = 'arrays' | 'systems' | 'raceways' | 'keepouts' | 'strings' | 'panels' | 'sld' | 'boq';

export class RegistryModalUI {
  dialog: HTMLDialogElement;
  store: ProjectStore;
  mapController?: MapController;
  activeTab: TableViewTab = 'arrays';
  filterSystemId: string = 'all';
  filterZoneId: string = 'all';
  filterStatus: string = 'all';
  searchKeyword: string = '';
  panelPage: number = 1;
  readonly panelPageSize: number = 100;

  constructor(dialogId: string, store: ProjectStore, mapController?: MapController) {
    const el = document.getElementById(dialogId) as HTMLDialogElement;
    if (!el) throw new Error(`Dialog #${dialogId} not found`);
    this.dialog = el;
    this.store = store;
    this.mapController = mapController;

    enableBackdropDismiss(this.dialog, () => this.dialog.close());
    this.setupEventListeners();
  }

  public open(tab?: TableViewTab): void {
    if (tab) {
      this.activeTab = tab;
    }
    this.render();
    this.dialog.showModal();
  }

  public close(): void {
    this.dialog.close();
  }

  public setActiveTab(tab: TableViewTab): void {
    this.activeTab = tab;
    this.render();
  }

  public setSystemFilter(systemId: string): void {
    this.filterSystemId = systemId;
    this.panelPage = 1;
    if (this.filterZoneId !== 'all' && this.filterSystemId !== 'all') {
      const zone = this.store.getZone(this.filterZoneId);
      if (zone && zone.systemId !== this.filterSystemId) {
        this.filterZoneId = 'all';
      }
    }
    this.render();
  }

  public getSystemFilter(): string {
    return this.filterSystemId;
  }

  private setupEventListeners(): void {
    document.getElementById('btn-open-tables')?.addEventListener('click', () => {
      this.open('arrays');
    });

    document.getElementById('btn-open-registry')?.addEventListener('click', () => {
      this.open('panels');
    });

    document.getElementById('btn-close-modal')?.addEventListener('click', () => {
      this.close();
    });

    document.getElementById('btn-export-modal-csv')?.addEventListener('click', () => {
      this.exportActiveTabCsv();
    });

    this.store.subscribe(() => {
      if (this.dialog.open) {
        this.render();
      }
    });
  }

  getFilteredPanels(): SolarPanelObject[] {
    return getFilteredPanelsImpl.call(this);
  }

  render(): void {
    const allSystems = this.store.getSystems();
    if (this.filterSystemId !== 'all' && !allSystems.some(s => s.id === this.filterSystemId)) {
      this.filterSystemId = 'all';
    }
    const isFiltered = this.filterSystemId !== 'all';
    const activeSystem = isFiltered ? this.store.getSystem(this.filterSystemId) : undefined;

    const allZones = this.store.getZones();
    const zones = isFiltered ? allZones.filter(z => z.systemId === this.filterSystemId) : allZones;

    const systems = isFiltered ? allSystems.filter(s => s.id === this.filterSystemId) : allSystems;

    const allPanels = this.store.getPanels();
    const panels = isFiltered ? allPanels.filter(p => p.systemId === this.filterSystemId) : allPanels;

    const allRacewayZones = allZones.filter(z => z.raceway && z.raceway.path && z.raceway.path.length >= 2);
    const racewayZones = isFiltered ? zones.filter(z => z.raceway && z.raceway.path && z.raceway.path.length >= 2) : allRacewayZones;

    const rawKeepOuts = this.store.getAllKeepOuts();
    const allKeepOuts = isFiltered ? rawKeepOuts.filter(k => k.systemId === this.filterSystemId) : rawKeepOuts;

    const rawStrings = this.store.getStringCables('all');
    const allStrings = isFiltered ? rawStrings.filter(s => s.systemId === this.filterSystemId) : rawStrings;

    const projSummary = this.store.getSystemSummary(this.filterSystemId);

    const titleEl = document.getElementById('registryTitle');
    if (titleEl) {
      titleEl.innerHTML = `📊 Project Tables & Schedules`;
    }

    const bodyEl = this.dialog.querySelector('.modal-body');
    if (!bodyEl) return;

    // Render Tab Buttons Header
    const tabsHtml = `
      <div class="table-view-tabs" role="tablist">
        <button class="tbl-tab-btn ${this.activeTab === 'arrays' ? 'active' : ''}" data-tab="arrays">
          📐 Arrays (${zones.length}${isFiltered ? `/${allZones.length}` : ''})
        </button>
        <button class="tbl-tab-btn ${this.activeTab === 'systems' ? 'active' : ''}" data-tab="systems">
          ⚡ Systems (${systems.length}${isFiltered ? `/${allSystems.length}` : ''})
        </button>
        <button class="tbl-tab-btn ${this.activeTab === 'raceways' ? 'active' : ''}" data-tab="raceways">
          🛤️ Raceways (${racewayZones.length}/${zones.length})
        </button>
        <button class="tbl-tab-btn ${this.activeTab === 'keepouts' ? 'active' : ''}" data-tab="keepouts">
          🚫 Keep-Outs (${allKeepOuts.length}${isFiltered ? `/${rawKeepOuts.length}` : ''})
        </button>
        <button class="tbl-tab-btn ${this.activeTab === 'strings' ? 'active' : ''}" data-tab="strings">
          🔌 Strings (${allStrings.length}${isFiltered ? `/${rawStrings.length}` : ''})
        </button>
        <button class="tbl-tab-btn ${this.activeTab === 'panels' ? 'active' : ''}" data-tab="panels">
          🔲 Panels (${panels.length}${isFiltered ? `/${allPanels.length}` : ''})
        </button>
        <button class="tbl-tab-btn ${this.activeTab === 'sld' ? 'active' : ''}" data-tab="sld">
          ⚡ Single Line Diagram
        </button>
        <button class="tbl-tab-btn ${this.activeTab === 'boq' ? 'active' : ''}" data-tab="boq" style="color: #10b981; font-weight: bold;">
          💰 BOQ &amp; DUPA
        </button>
      </div>

      <!-- Universal System Filter Bar for Project Tables & Schedules -->
      <div class="table-system-filter-bar">
        <div class="system-filter-controls">
          <label for="modal-global-system-filter" class="system-filter-label">
            <span class="icon">⚡</span> <strong>System Filter:</strong>
          </label>
          <select id="modal-global-system-filter" class="input-select system-filter-select" title="Filter project tables & schedule for all systems or a specific system only">
            <option value="all" ${!isFiltered ? 'selected' : ''}>🌐 All Systems (${allSystems.length})</option>
            ${allSystems.map(s => `
              <option value="${s.id}" ${this.filterSystemId === s.id ? 'selected' : ''}>
                ⚡ ${escapeHtml(s.name)}
              </option>
            `).join('')}
          </select>
          ${
            isFiltered
              ? `<button id="btn-reset-system-filter" class="btn btn-xs btn-outline" title="Show All Systems">✕ Reset to All Systems</button>`
              : `<span class="system-filter-hint text-dim">Showing entire project across all electrical systems</span>`
          }
        </div>
        ${
          isFiltered && activeSystem
            ? `
          <div class="system-filter-tag">
            <span class="badge" style="background: ${activeSystem.color || '#0284c7'}; color: #fff;">
              Active Filter: ${escapeHtml(activeSystem.name)}
            </span>
          </div>
        `
            : ''
        }
      </div>

      <!-- KPI Summary Banner -->
      <div class="table-kpi-bar">
        <div class="kpi-chip">
          <span class="kpi-label">${isFiltered ? 'System DC Capacity' : 'Site DC Capacity'}</span>
          <span class="kpi-val" style="color: var(--accent-green);">${projSummary.totalKwp.toFixed(2)} kWp</span>
        </div>
        <div class="kpi-chip">
          <span class="kpi-label">Active Panels</span>
          <span class="kpi-val">${projSummary.totalActivePanels} / ${panels.length}</span>
        </div>
        <div class="kpi-chip">
          <span class="kpi-label">${isFiltered ? 'Arrays in System' : 'Total Arrays'}</span>
          <span class="kpi-val">${zones.length}</span>
        </div>
        <div class="kpi-chip">
          <span class="kpi-label">Strings Formed</span>
          <span class="kpi-val" style="color: var(--accent-blue);">${allStrings.length} formed</span>
        </div>
        <div class="kpi-chip">
          <span class="kpi-label">Raceways Configured</span>
          <span class="kpi-val" style="color: var(--accent-amber);">${racewayZones.length} / ${zones.length}</span>
        </div>
        <div class="kpi-chip">
          <span class="kpi-label">Keep-Outs</span>
          <span class="kpi-val" style="color: var(--accent-red, #ef4444);">${allKeepOuts.length} obstacles</span>
        </div>
      </div>
    `;

    let contentHtml = '';

    switch (this.activeTab) {
      case 'arrays':
        contentHtml = this.renderArraysTable(zones, allSystems);
        break;
      case 'systems':
        contentHtml = this.renderSystemsTable(systems, allSystems);
        break;
      case 'raceways':
        contentHtml = this.renderRacewaysTable(zones, allSystems);
        break;
      case 'keepouts':
        contentHtml = this.renderKeepOutsTable(allKeepOuts, zones, allSystems);
        break;
      case 'strings':
        contentHtml = this.renderStringsTable(allStrings, zones, allSystems);
        break;
      case 'panels':
        contentHtml = this.renderPanelsTable(allPanels, zones, systems, allSystems);
        break;
      case 'sld':
        contentHtml = this.renderSldTab(allSystems);
        break;
      case 'boq':
        contentHtml = this.renderBoqTab(allSystems);
        break;
    }

    bodyEl.innerHTML = tabsHtml + contentHtml;
    this.attachModalListeners();
  }

  /**
   * 1. ARRAYS TABLE VIEW
   * Allows directly modifying array properties: Name, Color, System, Mount, Model, Tilt, Azimuth, Orientation, Pitch, Gap, Setback, Raceway Δh.
   */
  private renderArraysTable(zones: ArrayZone[], allSystems?: SolarSystem[]): string {
    return renderArraysTableImpl.call(this, zones, allSystems);
  }

  /**
   * 2. SYSTEMS TABLE VIEW
   * Allows directly modifying system properties: Name, Color, Inverter Preset, Inverter Count, AC Power, MPPTs, Strings/MPPT, Elevation Δh.
   */
  private renderSystemsTable(systems: SolarSystem[], allSystems?: SolarSystem[]): string {
    return renderSystemsTableImpl.call(this, systems, allSystems);
  }

  /**
   * 3. RACEWAYS TABLE VIEW
   */
  private renderRacewaysTable(zones: ArrayZone[], allSystems?: SolarSystem[]): string {
    return renderRacewaysTableImpl.call(this, zones, allSystems);
  }

  /**
   * 4. KEEP-OUTS (OBSTACLES) TABLE VIEW
   * Allows editing the associated array zone, renaming obstacles, and zooming.
   */
  private renderKeepOutsTable(
    allKeepOuts: { keepOut: KeepOutPolygon; zoneId: string; zoneName: string; systemId: string }[],
    zones: ArrayZone[],
    allSystems?: SolarSystem[]
  ): string {
    return renderKeepOutsTableImpl.call(this, allKeepOuts, zones, allSystems);
  }

  /**
   * 5. STRINGS TABLE VIEW
   * Dedicated schedule where each row is an active PV string with electrical specs and cabling runs.
   */
  private renderStringsTable(
    stringCables: StringCableLength[],
    zones: ArrayZone[],
    allSystems?: SolarSystem[]
  ): string {
    return renderStringsTableImpl.call(this, stringCables, zones, allSystems);
  }

  /**
   * 6. SOLAR PANELS REGISTRY VIEW
   * High-performance virtualized/paginated rendering to ensure 60 FPS responsiveness even for 11MW+ farms (18,000+ modules).
   */
  private renderPanelsTable(
    allPanels: SolarPanelObject[],
    zones: ArrayZone[],
    systems: SolarSystem[],
    allSystems?: SolarSystem[]
  ): string {
    return renderPanelsTableImpl.call(this, allPanels, zones, systems, allSystems);
  }

  /**
   * 7. SINGLE LINE DIAGRAM TAB VIEW
   * Displays the 2D Wireframe Single Line Diagram for the selected system.
   */
  private renderSldTab(allSystems?: SolarSystem[]): string {
    return renderSldTabImpl.call(this, allSystems);
  }

  /**
   * 8. BOQ & DUPA TAB VIEW
   */
  private renderBoqTab(_allSystems?: SolarSystem[]): string {
    return renderBoqTabImpl.call(this, _allSystems);
  }

  private attachModalListeners(): void {
    return attachModalListenersImpl.call(this);
  }

  /**
   * Exports the currently active table view as a clean, standardized CSV file.
   */
  public exportActiveTabCsv(): void {
    return exportActiveTabCsvImpl.call(this);
  }
}
