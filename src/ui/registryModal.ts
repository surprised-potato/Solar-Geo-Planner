import { ProjectStore } from '../store/projectStore';
import {
  SolarPanelObject,
  ArrayZone,
  SolarSystem,
  KeepOutPolygon,
  StringCableLength,
  GENERIC_INVERTER_PRESETS,
  MountType,
  AcPhaseType,
  MdpTapType,
  STANDARD_AC_VOLTAGES_3PHASE,
  STANDARD_AC_VOLTAGES_1PHASE
} from '../types/solar';
import { MapController } from '../map/mapController';
import { calculateGeodeticDistanceM, computePolygonAreaSqM, computePolygonCentroid } from '../geo/projection';
import { SingleLineDiagramUI } from './sldView';
import { BoqAndDupaUI } from './boqView';
import { exportBoqAndDupaCsv } from '../geo/boqCalculator';

export type TableViewTab = 'arrays' | 'systems' | 'raceways' | 'keepouts' | 'strings' | 'panels' | 'sld' | 'boq';

export class RegistryModalUI {
  private dialog: HTMLDialogElement;
  private store: ProjectStore;
  private mapController?: MapController;
  private activeTab: TableViewTab = 'arrays';
  private filterSystemId: string = 'all';
  private filterZoneId: string = 'all';
  private filterStatus: string = 'all';
  private searchKeyword: string = '';
  private panelPage: number = 1;
  private readonly panelPageSize: number = 100;

  constructor(dialogId: string, store: ProjectStore, mapController?: MapController) {
    const el = document.getElementById(dialogId) as HTMLDialogElement;
    if (!el) throw new Error(`Dialog #${dialogId} not found`);
    this.dialog = el;
    this.store = store;
    this.mapController = mapController;

    this.setupFallbackLightDismiss();
    this.setupEventListeners();
  }

  private setupFallbackLightDismiss(): void {
    if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
      this.dialog.addEventListener('click', (event: MouseEvent) => {
        if (event.target !== this.dialog) return;

        const rect = this.dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;

        if (!isDialogContent) {
          this.dialog.close();
        }
      });
    }
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

  private getFilteredPanels(): SolarPanelObject[] {
    let panels = this.store.getPanels();

    if (this.filterSystemId !== 'all') {
      panels = panels.filter(p => p.systemId === this.filterSystemId);
    }

    if (this.filterZoneId !== 'all') {
      panels = panels.filter(p => p.zoneId === this.filterZoneId);
    }

    if (this.filterStatus === 'active') {
      panels = panels.filter(p => p.active);
    } else if (this.filterStatus === 'disabled') {
      panels = panels.filter(p => !p.active);
    }

    if (this.searchKeyword) {
      const q = this.searchKeyword.toLowerCase();
      panels = panels.filter(
        p =>
          p.id.toLowerCase().includes(q) ||
          (p.stringId && p.stringId.toLowerCase().includes(q))
      );
    }

    return panels;
  }

  private render(): void {
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
                ⚡ ${s.name}
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
              Active Filter: ${activeSystem.name}
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
    let filteredZones = zones;
    if (this.searchKeyword) {
      const q = this.searchKeyword.toLowerCase();
      filteredZones = filteredZones.filter(z => z.name.toLowerCase().includes(q) || z.id.toLowerCase().includes(q));
    }
    if (this.filterSystemId !== 'all') {
      filteredZones = filteredZones.filter(z => z.systemId === this.filterSystemId);
    }

    const systems = allSystems || this.store.getSystems();
    const modules = this.store.getModules();

    return `
      <div class="registry-toolbar">
        <div class="filters-row">
          <input type="search" id="modal-search" class="input-text" placeholder="Search array name or ID..." value="${this.searchKeyword}" />
          <select id="modal-system-filter" class="input-select" title="Filter by system">
            <option value="all">All Systems (${systems.length})</option>
            ${systems.map(s => `<option value="${s.id}" ${this.filterSystemId === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="tbl-action-hint">
          <span class="icon">✏️</span> Edit array properties (System, Mount, Model, Tilt, Azimuth, Pitch, Gap, Setback, &Delta;h) directly in the table!
        </div>
      </div>

      <div tabindex="0" role="region" aria-label="Arrays Schedule Table" class="table-container table-wrapper">
        <table class="registry-table responsive-data-table">
          <thead>
            <tr>
              <th>Array Name</th>
              <th>System</th>
              <th>Mount</th>
              <th>Mount Structure / Tables</th>
              <th>Module Model</th>
              <th>Panels</th>
              <th>Capacity</th>
              <th>Tilt / Azimuth / Orient</th>
              <th>Pitch / Gap</th>
              <th>Setback</th>
              <th>Footprint</th>
              <th>Raceway & Δh</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              filteredZones.length === 0
                ? `<tr><td colspan="13" class="empty-table-cell">No arrays found matching current criteria.</td></tr>`
                : filteredZones
                    .map(z => {
                      const areaSqM = computePolygonAreaSqM(z.vertices);
                      const totalZonePanels = this.store.getPanels().filter(p => p.zoneId === z.id).length;

                      let racewayPathLen = 0;
                      if (z.raceway && z.raceway.path && z.raceway.path.length >= 2) {
                        for (let i = 0; i < z.raceway.path.length - 1; i++) {
                          racewayPathLen += calculateGeodeticDistanceM(z.raceway.path[i], z.raceway.path[i + 1]);
                        }
                      }
                      const elevM = z.raceway ? z.raceway.elevationChangeM : (z.elevationDeltaM ?? 0);
                      const isGround = z.config.mountType === 'ground';

                      return `
                  <tr>
                    <td>
                      <div class="entity-badge-cell">
                        <input type="color" class="input-tbl-color input-tbl-zone-color" data-zone-id="${z.id}" value="${z.color}" title="Change array color" />
                        <input type="text" class="input-tbl-text input-tbl-zone-name" data-zone-id="${z.id}" value="${z.name}" title="Edit array name" style="width: 120px; font-weight: 600;" />
                      </div>
                    </td>
                    <td>
                      <select class="input-tbl-select sel-zone-system" data-zone-id="${z.id}" title="Reassign array to an electrical system">
                        ${systems.map(s => `<option value="${s.id}" ${s.id === z.systemId ? 'selected' : ''}>${s.name.split(':')[0]}</option>`).join('')}
                      </select>
                    </td>
                    <td>
                      <select class="input-tbl-select sel-zone-mount" data-zone-id="${z.id}" title="Toggle Roof Mount vs Ground Mount">
                        <option value="roof" ${z.config.mountType === 'roof' ? 'selected' : ''}>🏢 Roof</option>
                        <option value="ground" ${z.config.mountType === 'ground' ? 'selected' : ''}>🌱 Ground</option>
                      </select>
                    </td>
                    <td>
                      ${
                        isGround
                          ? `
                        <div class="inline-field-pair" style="flex-direction: column; align-items: flex-start; gap: 3px;">
                          <span class="badge highlight" style="font-size: 10px;">🏗️ ${z.tableCount ?? (z.tables ? z.tables.length : 0)} tbls</span>
                          <div style="display: flex; align-items: center; gap: 3px;">
                            <span class="tbl-unit-label" title="Modules Up (Table Rows)">Up:</span>
                            <input type="number" class="input-tbl-num input-tbl-zone-table-up" data-zone-id="${z.id}" value="${z.config.modulesPerTableUp ?? 2}" min="1" max="6" step="1" title="Modules Up (Table Rows)" style="width: 36px;" />
                            <span class="tbl-unit-label" title="Modules Wide (Table Columns)">W:</span>
                            <input type="number" class="input-tbl-num input-tbl-zone-table-wide" data-zone-id="${z.id}" value="${z.config.modulesPerTableWide ?? 14}" min="1" max="60" step="1" title="Modules Wide (Table Columns)" style="width: 40px;" />
                            <span class="tbl-unit-label" title="Inter-Table Gap / E-W Aisle (m)">Gap:</span>
                            <input type="number" class="input-tbl-num input-tbl-zone-table-gap" data-zone-id="${z.id}" value="${z.config.tableSpacingM ?? 1.0}" min="0.1" max="10" step="0.1" title="Inter-Table Gap / E-W Aisle (m)" style="width: 44px;" /><span class="tbl-unit-label">m</span>
                          </div>
                        </div>
                      `
                          : `
                        <div class="inline-field-pair" style="flex-direction: column; align-items: flex-start; gap: 3px;">
                          <span class="badge accent" style="font-size: 10px;">🛤️ ${z.railCount ?? (z.rails ? z.rails.length : 0)} rails</span>
                          <div style="display: flex; align-items: center; gap: 3px;">
                            <select class="input-tbl-select sel-zone-rail-count" data-zone-id="${z.id}" title="Parallel Rails per Panel" style="width: 72px;">
                              <option value="2" ${(z.config.railCount ?? 2) === 2 ? 'selected' : ''}>2 Rails</option>
                              <option value="3" ${(z.config.railCount ?? 2) === 3 ? 'selected' : ''}>3 Rails</option>
                            </select>
                          </div>
                        </div>
                      `
                      }
                    </td>
                    <td>
                      <select class="input-tbl-select sel-zone-module" data-zone-id="${z.id}" title="Select PV module model">
                        ${modules.map(m => `<option value="${m.id}" ${m.id === z.moduleId ? 'selected' : ''}>${m.name.split(' ')[0]} ${m.nominalPowerW}W</option>`).join('')}
                      </select>
                    </td>
                    <td>
                      <b>${z.activePanelCount}</b> <small class="text-dim">/ ${totalZonePanels}</small>
                    </td>
                    <td>
                      <strong style="color: var(--accent-green);">${z.totalKwp.toFixed(2)} kWp</strong>
                    </td>
                    <td>
                      <div class="inline-field-pair">
                        <input type="number" class="input-tbl-num input-tbl-zone-tilt" data-zone-id="${z.id}" value="${z.config.tiltDeg}" min="0" max="90" step="1" title="Tilt angle (°)" style="width: 44px;" /><span class="tbl-unit-label">°</span>
                        <input type="number" class="input-tbl-num input-tbl-zone-azimuth" data-zone-id="${z.id}" value="${z.config.azimuthDeg}" min="0" max="360" step="1" title="Azimuth angle (°)" style="width: 48px;" /><span class="tbl-unit-label">°</span>
                        <select class="input-tbl-select sel-zone-orient" data-zone-id="${z.id}" title="Module orientation" style="width: 60px;">
                          <option value="portrait" ${z.config.orientation === 'portrait' ? 'selected' : ''}>Port</option>
                          <option value="landscape" ${z.config.orientation === 'landscape' ? 'selected' : ''}>Land</option>
                        </select>
                      </div>
                    </td>
                    <td>
                      <div class="inline-field-pair">
                        <span class="tbl-unit-label">P:</span>
                        <input type="number" class="input-tbl-num input-tbl-zone-row-spacing" data-zone-id="${z.id}" value="${z.config.rowSpacingM}" min="0.1" max="20" step="0.05" title="Row pitch (m)" style="width: 50px;" /><span class="tbl-unit-label">m</span>
                        <span class="tbl-unit-label">G:</span>
                        <input type="number" class="input-tbl-num input-tbl-zone-col-spacing" data-zone-id="${z.id}" value="${z.config.colSpacingM}" min="0.01" max="5" step="0.01" title="Module gap (m)" style="width: 46px;" /><span class="tbl-unit-label">m</span>
                      </div>
                    </td>
                    <td>
                      <div class="inline-field-pair">
                        <input type="number" class="input-tbl-num input-tbl-zone-setback" data-zone-id="${z.id}" value="${z.config.setbackM}" min="0" max="20" step="0.1" title="Boundary setback (m)" style="width: 48px;" /><span class="tbl-unit-label">m</span>
                      </div>
                    </td>
                    <td>
                      ${Math.round(areaSqM).toLocaleString()} m²
                    </td>
                    <td>
                      <div class="inline-field-pair">
                        ${
                          z.raceway
                            ? `<span class="badge highlight" title="Raceway conduit drawn: ${racewayPathLen.toFixed(1)}m">🛤️ ${racewayPathLen.toFixed(1)}m</span>`
                            : `<span class="badge" title="Direct point-to-point cable fallback">Direct</span>`
                        }
                        <span class="tbl-unit-label">&Delta;h:</span>
                        <input type="number" class="input-tbl-num input-tbl-zone-elev" data-zone-id="${z.id}" value="${elevM}" step="0.5" title="Vertical drop / riser &Delta;h (m)" style="width: 50px;" /><span class="tbl-unit-label">m</span>
                      </div>
                    </td>
                    <td style="text-align: right; white-space: nowrap;">
                      <button class="btn btn-xs btn-jump-zone" data-zone-id="${z.id}" title="Zoom map to this array">🎯 Zoom</button>
                      <button class="btn btn-xs btn-outline btn-opt-zone" data-zone-id="${z.id}" title="Optimize grid shift to maximize panel count and auto-string electrical strings">⚡ Opt</button>
                      <button class="btn btn-xs btn-outline danger btn-delete-zone" data-zone-id="${z.id}" title="Delete array">🗑️</button>
                    </td>
                  </tr>
                `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * 2. SYSTEMS TABLE VIEW
   * Allows directly modifying system properties: Name, Color, Inverter Preset, Inverter Count, AC Power, MPPTs, Strings/MPPT, Elevation Δh.
   */
  private renderSystemsTable(systems: SolarSystem[], allSystems?: SolarSystem[]): string {
    const sysList = allSystems || this.store.getSystems();
    let filteredSystems = systems;
    if (this.searchKeyword) {
      const q = this.searchKeyword.toLowerCase();
      filteredSystems = filteredSystems.filter(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
    }
    if (this.filterSystemId !== 'all') {
      filteredSystems = filteredSystems.filter(s => s.id === this.filterSystemId);
    }

    return `
      <div class="registry-toolbar">
        <div class="filters-row">
          <input type="search" id="modal-search" class="input-text" placeholder="Search system name or ID..." value="${this.searchKeyword}" />
          <select id="modal-system-filter" class="input-select" title="Filter by system">
            <option value="all">All Systems (${sysList.length})</option>
            ${sysList.map(s => `<option value="${s.id}" ${this.filterSystemId === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="tbl-action-hint">
          <span class="icon">✏️</span> Edit system inverters, AC capacities, MPPT channels, and station elevations directly in the table!
        </div>
      </div>

      <div tabindex="0" role="region" aria-label="Systems Summary Table" class="table-container table-wrapper">
        <table class="registry-table responsive-data-table">
          <thead>
            <tr>
              <th>System Name</th>
              <th>Linked Arrays</th>
              <th>Panels & DC</th>
              <th>Inverter Preset</th>
              <th>Inverter Qty & AC</th>
              <th>AC Config</th>
              <th>MPPT & Strings</th>
              <th>DC/AC Ratio</th>
              <th>Station Point & &Delta;h</th>
              <th>AC PCC Point & &Delta;h</th>
              <th>AC Feeder & VDrop</th>
              <th>Total DC Wire</th>
              <th>Homerun</th>
              <th>Raceway</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              filteredSystems.length === 0
                ? `<tr><td colspan="15" class="empty-table-cell">No systems found matching criteria.</td></tr>`
                : filteredSystems
                    .map(sys => {
                      const summary = this.store.getSystemSummary(sys.id);
                      const cableSummary = this.store.getSystemCableSummary(sys.id);
                      const feederSummary = this.store.getSystemAcFeederSummary(sys.id);
                      const linkedZones = this.store.getZones().filter(z => z.systemId === sys.id);
                      const dcAcClass = summary.dcAcRatio > 1.35 ? 'warning' : 'highlight';

                      return `
                  <tr>
                    <td>
                      <div class="entity-badge-cell">
                        <input type="color" class="input-tbl-color input-tbl-sys-color" data-sys-id="${sys.id}" value="${sys.color}" title="Change system color" />
                        <input type="text" class="input-tbl-text input-tbl-sys-name" data-sys-id="${sys.id}" value="${sys.name}" title="Edit system name" style="width: 140px; font-weight: 600;" />
                      </div>
                    </td>
                    <td>
                      <div class="linked-zones-cell" title="${linkedZones.map(z => z.name).join(', ')}">
                        <b>${linkedZones.length} arrays</b>
                        <small class="text-dim">(${linkedZones.map(z => z.name).join(', ') || 'None'})</small>
                      </div>
                    </td>
                    <td>
                      <b>${summary.totalActivePanels}</b> <small class="text-dim">mods</small>
                      <div><strong style="color: var(--accent-green);">${summary.totalKwp.toFixed(2)} kWp</strong></div>
                    </td>
                    <td>
                      <select class="input-tbl-select sel-sys-inv-preset" data-sys-id="${sys.id}" title="Select Inverter Preset Model">
                        ${GENERIC_INVERTER_PRESETS.map(p => {
                          const isSelected = p.id === sys.inverter.id || p.modelName === sys.inverter.modelName || (p.ratedAcPowerKw === sys.inverter.ratedAcPowerKw && p.mpptCountPerInverter === sys.inverter.mpptCountPerInverter);
                          return `<option value="${p.id}" ${isSelected ? 'selected' : ''}>${p.modelName}</option>`;
                        }).join('')}
                      </select>
                    </td>
                    <td>
                      <div class="inline-field-pair">
                        <input type="number" class="input-tbl-num input-tbl-sys-inv-count" data-sys-id="${sys.id}" value="${sys.inverter.inverterCount}" min="1" max="100" title="Inverter Count" style="width: 40px;" /><span class="tbl-unit-label">x</span>
                        <input type="number" class="input-tbl-num input-tbl-sys-inv-kw" data-sys-id="${sys.id}" value="${sys.inverter.ratedAcPowerKw}" min="1" max="5000" step="1" title="Rated AC kW per inverter (e.g. 6 kW, 30 kW, 100 kW)" style="width: 56px;" /><span class="tbl-unit-label">kW</span>
                      </div>
                      <small class="text-dim">Total: <b>${summary.inverterAcKw} kW AC</b></small>
                    </td>
                    <td>
                      <div class="inline-field-pair" style="display: flex; gap: 4px; align-items: center;">
                        <select class="input-tbl-select sel-sys-inv-phase" data-sys-id="${sys.id}" title="Inverter AC Output Phase" style="width: 55px; font-size: 11px;">
                          <option value="three_phase" ${(sys.inverter.phase || 'three_phase') === 'three_phase' ? 'selected' : ''}>3Φ</option>
                          <option value="single_phase" ${(sys.inverter.phase || 'three_phase') === 'single_phase' ? 'selected' : ''}>1Φ</option>
                        </select>
                        <select class="input-tbl-select sel-sys-inv-voltage" data-sys-id="${sys.id}" title="Nominal Inverter AC Line Voltage" style="width: 65px; font-size: 11px;">
                          ${((sys.inverter.phase || 'three_phase') === 'single_phase' ? STANDARD_AC_VOLTAGES_1PHASE : STANDARD_AC_VOLTAGES_3PHASE).map((v: number) => `
                            <option value="${v}" ${(sys.inverter.acVoltage || ((sys.inverter.phase || 'three_phase') === 'single_phase' ? 230 : 400)) === v ? 'selected' : ''}>${v}V</option>
                          `).join('')}
                          <option value="custom" ${!STANDARD_AC_VOLTAGES_3PHASE.concat(STANDARD_AC_VOLTAGES_1PHASE).includes(sys.inverter.acVoltage || 400) ? 'selected' : ''}>Custom</option>
                        </select>
                      </div>
                      <div style="display: flex; gap: 4px; align-items: center; margin-top: 3px;">
                        <small class="text-dim" style="font-size: 10px;">Tap:</small>
                        <select class="input-tbl-select sel-sys-tap-voltage" data-sys-id="${sys.id}" title="System Tapping Point Voltage (PEC 4.50)" style="width: 65px; font-size: 11px;">
                          ${((sys.inverter.phase || 'three_phase') === 'single_phase' ? STANDARD_AC_VOLTAGES_1PHASE : STANDARD_AC_VOLTAGES_3PHASE).map((v: number) => `
                            <option value="${v}" ${(sys.systemVoltageV ?? sys.inverter.acVoltage ?? ((sys.inverter.phase || 'three_phase') === 'single_phase' ? 230 : 400)) === v ? 'selected' : ''}>${v}V</option>
                          `).join('')}
                        </select>
                        ${feederSummary.hasTransformer ? `<span class="badge warning" title="Transformer Required: ${feederSummary.transformerKva}kVA" style="font-size: 9px; padding: 1px 4px;">⚡ XFM ${feederSummary.transformerKva}kVA</span>` : ''}
                      </div>
                      <div style="display: flex; gap: 6px; align-items: center; margin-top: 3px; font-size: 10px;">
                        <label title="Enable AC Combiner Box" style="display: flex; align-items: center; gap: 2px; cursor: pointer;">
                          <input type="checkbox" class="chk-sys-ac-combiner" data-sys-id="${sys.id}" ${sys.hasAcCombiner ? 'checked' : ''} />
                          <span>ACB</span>
                        </label>
                        <select class="input-tbl-select sel-sys-mdp-tap" data-sys-id="${sys.id}" title="MDP Interconnection Tap Type" style="font-size: 10px; padding: 1px 2px;">
                          <option value="load_side" ${(sys.mdpTapType || 'load_side') === 'load_side' ? 'selected' : ''}>Load-Side (120%)</option>
                          <option value="line_side" ${(sys.mdpTapType || 'load_side') === 'line_side' ? 'selected' : ''}>Line-Side (Supply)</option>
                        </select>
                      </div>
                    </td>
                    <td>
                      <div class="inline-field-pair">
                        <input type="number" class="input-tbl-num input-tbl-sys-inv-mppts" data-sys-id="${sys.id}" value="${sys.inverter.mpptCountPerInverter}" min="1" max="24" title="MPPT trackers per inverter" style="width: 38px;" /><span class="tbl-unit-label">MPPT</span>
                        <input type="number" class="input-tbl-num input-tbl-sys-inv-str-mppt" data-sys-id="${sys.id}" value="${sys.inverter.maxStringsPerMppt}" min="1" max="10" title="Max strings per MPPT" style="width: 36px;" /><span class="tbl-unit-label">str/mppt</span>
                      </div>
                    </td>
                    <td>
                      <span class="badge ${dcAcClass}">
                        ${summary.dcAcRatio.toFixed(2)}
                      </span>
                    </td>
                    <td>
                      ${
                        sys.inverterLocation
                          ? `<div class="inline-field-pair">
                              <span class="badge accent" title="Inverter Station Coords">📍 ${sys.inverterLocation.lat.toFixed(4)}, ${sys.inverterLocation.lng.toFixed(4)}</span>
                              <span class="tbl-unit-label">&Delta;h:</span>
                              <input type="number" class="input-tbl-num input-tbl-sys-inv-elev" data-sys-id="${sys.id}" value="${sys.inverterElevationM ?? 0}" step="0.5" title="Inverter Station Base Elevation (m)" style="width: 48px;" /><span class="tbl-unit-label">m</span>
                            </div>`
                          : `<span class="text-dim">Not geoplaced</span>`
                      }
                    </td>
                    <td>
                      ${
                        sys.acInterconnectionLocation
                          ? `<div class="inline-field-pair">
                              <span class="badge accent" title="PCC Coords">🏢 ${sys.acInterconnectionLocation.lat.toFixed(4)}, ${sys.acInterconnectionLocation.lng.toFixed(4)}</span>
                              <span class="tbl-unit-label">&Delta;h:</span>
                              <input type="number" class="input-tbl-num input-tbl-sys-pcc-elev" data-sys-id="${sys.id}" value="${sys.acInterconnectionElevationM ?? 0}" step="0.5" title="AC Interconnection Base Elevation (m)" style="width: 48px;" /><span class="tbl-unit-label">m</span>
                            </div>`
                          : `<span class="text-dim">Not pinned</span>`
                      }
                    </td>
                    <td>
                      ${
                        feederSummary.totalRunM > 0
                          ? `<div><b>${feederSummary.totalRunM} m</b> <span class="badge ${feederSummary.isCompliant ? 'highlight' : 'warning'}">${feederSummary.voltageDropPercent}% Vd</span></div>
                             <small class="text-dim">${feederSummary.conductorCallout.split(' + ')[0]}</small>`
                          : `<span class="text-dim">—</span>`
                      }
                    </td>
                    <td>
                      <strong style="color: var(--accent-green);">${cableSummary.totalCableLengthM} m</strong>
                    </td>
                    <td>
                      ${cableSummary.totalHomerunM} m
                    </td>
                    <td>
                      ${
                        cableSummary.totalRacewayLengthM > 0
                          ? `<strong style="color: var(--accent-amber);">${cableSummary.totalRacewayLengthM} m</strong>`
                          : `<span class="text-dim">—</span>`
                      }
                    </td>
                    <td style="text-align: right; white-space: nowrap;">
                      <button class="btn btn-xs btn-jump-inverter" data-sys-id="${sys.id}" ${sys.inverterLocation ? '' : 'disabled'} title="Zoom to Inverter Station point">🎯 Station</button>
                      <button class="btn btn-xs btn-jump-pcc" data-sys-id="${sys.id}" ${sys.acInterconnectionLocation ? '' : 'disabled'} title="Zoom to AC PCC point">🎯 PCC</button>
                      <button class="btn btn-xs btn-select-system" data-sys-id="${sys.id}" title="Select this system">✏️ Select</button>
                      <button class="btn btn-xs btn-primary btn-auto-string-system" data-sys-id="${sys.id}" title="Auto-string all arrays in this system">⚡ Auto-String</button>
                    </td>
                  </tr>
                `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * 3. RACEWAYS TABLE VIEW
   */
  private renderRacewaysTable(zones: ArrayZone[], allSystems?: SolarSystem[]): string {
    let filteredZones = zones;
    if (this.searchKeyword) {
      const q = this.searchKeyword.toLowerCase();
      filteredZones = filteredZones.filter(z => z.name.toLowerCase().includes(q) || z.id.toLowerCase().includes(q));
    }
    if (this.filterSystemId !== 'all') {
      filteredZones = filteredZones.filter(z => z.systemId === this.filterSystemId);
    }

    const systems = allSystems || this.store.getSystems();

    return `
      <div class="registry-toolbar">
        <div class="filters-row">
          <input type="search" id="modal-search" class="input-text" placeholder="Search array name..." value="${this.searchKeyword}" />
          <select id="modal-system-filter" class="input-select" title="Filter by system">
            <option value="all">All Systems (${systems.length})</option>
            ${systems.map(s => `<option value="${s.id}" ${this.filterSystemId === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="tbl-action-hint">
          <span class="icon">💡</span> Raceways provide physical conduit paths from array boundaries to the Inverter Power House.
        </div>
      </div>

      <div tabindex="0" role="region" aria-label="Raceways Schedule Table" class="table-container table-wrapper">
        <table class="registry-table responsive-data-table">
          <thead>
            <tr>
              <th>Array Zone</th>
              <th>System</th>
              <th>Status</th>
              <th>Waypoints</th>
              <th>2D Path Length</th>
              <th>Elevation Drop (&Delta;h)</th>
              <th>Exit to Inverter</th>
              <th>Conduit Run / Conductor</th>
              <th>Strings</th>
              <th>Total Conductor Wire</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              filteredZones.length === 0
                ? `<tr><td colspan="11" class="empty-table-cell">No raceways found matching criteria.</td></tr>`
                : filteredZones
                    .map(z => {
                      const sys = this.store.getSystem(z.systemId);
                      const activeHomerun = z.raceway || sys?.homerunRaceway;
                      const hasRaceway = Boolean(activeHomerun && activeHomerun.path && activeHomerun.path.length >= 2);
                      const isShared = !z.raceway && Boolean(sys?.homerunRaceway);

                      let pathLen2D = 0;
                      if (hasRaceway && activeHomerun) {
                        for (let i = 0; i < activeHomerun.path.length - 1; i++) {
                          pathLen2D += calculateGeodeticDistanceM(activeHomerun.path[i], activeHomerun.path[i + 1]);
                        }
                      }

                      const elevM = Math.abs(activeHomerun ? activeHomerun.elevationChangeM : (z.elevationDeltaM ?? 0));

                      let distToInv = 0;
                      if (hasRaceway && activeHomerun && sys?.inverterLocation) {
                        const exitPt = activeHomerun.path[activeHomerun.path.length - 1];
                        distToInv = calculateGeodeticDistanceM(exitPt, sys.inverterLocation);
                      }

                      const singleRunM = pathLen2D + elevM + distToInv;

                      const zonePanels = this.store.getPanels().filter(p => p.zoneId === z.id && p.active && p.stringId);
                      const stringSet = new Set(zonePanels.map(p => p.stringId));
                      const stringCount = stringSet.size;
                      const totalWireInRacewayM = stringCount * 2 * singleRunM;

                      return `
                  <tr>
                    <td>
                      <div class="entity-badge-cell">
                        <span class="color-badge" style="background: ${z.color};"></span>
                        <strong>${z.name}</strong>
                      </div>
                    </td>
                    <td>
                      <span class="badge" style="background: ${sys?.color || '#0284c7'}; color: #fff;">
                        ${sys?.name?.split(':')[0] || 'System'}
                      </span>
                    </td>
                    <td>
                      ${
                        isShared
                          ? `<span class="badge highlight">⚡ Auto Homerun</span>`
                          : hasRaceway
                          ? `<span class="badge highlight">🛤️ Array Raceway</span>`
                          : `<span class="badge" style="color: var(--text-dim);">Direct Fallback</span>`
                      }
                    </td>
                    <td>
                      ${hasRaceway && activeHomerun ? `<b>${activeHomerun.path.length}</b> nodes` : '<span class="text-dim">—</span>'}
                    </td>
                    <td>
                      ${hasRaceway ? `<b>${pathLen2D.toFixed(1)} m</b>` : '<span class="text-dim">—</span>'}
                    </td>
                    <td>
                      <div class="inline-field-pair">
                        <input type="number" class="input-tbl-num input-tbl-raceway-elev" data-zone-id="${z.id}" value="${elevM}" step="0.5" title="Conduit / vertical drop &Delta;h (m)" style="width: 58px;" /><span class="tbl-unit-label">m</span>
                      </div>
                    </td>
                    <td>
                      ${
                        sys?.inverterLocation
                          ? `${distToInv.toFixed(1)} m`
                          : `<span class="text-dim">No station</span>`
                      }
                    </td>
                    <td>
                      <strong style="color: var(--accent-green);">${singleRunM.toFixed(1)} m</strong>
                    </td>
                    <td>
                      <b>${stringCount} strings</b> <small class="text-dim">(${stringCount * 2} leads)</small>
                    </td>
                    <td>
                      ${
                        totalWireInRacewayM > 0
                          ? `<strong style="color: var(--accent-amber);">${totalWireInRacewayM.toFixed(1)} m</strong>`
                          : `<span class="text-dim">—</span>`
                      }
                    </td>
                    <td style="text-align: right; white-space: nowrap;">
                      ${
                        hasRaceway
                          ? `
                        <button class="btn btn-xs btn-jump-raceway" data-zone-id="${z.id}" title="Zoom to raceway path">🎯 Zoom</button>
                        <button class="btn btn-xs btn-draw-raceway-act" data-zone-id="${z.id}" title="Redraw raceway on map">✏️ Redraw</button>
                        <button class="btn btn-xs btn-outline danger btn-clear-raceway-act" data-zone-id="${z.id}" title="Clear raceway">✕ Clear</button>
                      `
                          : `
                        <button class="btn btn-xs btn-outline warning btn-draw-raceway-act" data-zone-id="${z.id}" title="Draw raceway on satellite map">🛤️ Draw Raceway</button>
                      `
                      }
                    </td>
                  </tr>
                `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>

      <!-- AC Feeder Raceways Schedule (Inverter to PCC Interconnection) -->
      <div style="margin-top: 24px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
        <h4 style="margin: 0; font-size: 13px; color: #06b6d4; font-weight: 700; display: flex; align-items: center; gap: 6px;">
          <span>⚡</span> AC FEEDER RACEWAYS &amp; INTERCONNECTION SCHEDULE (PEC Article 2.15)
        </h4>
        <span class="badge highlight">${systems.length} Systems Configured</span>
      </div>

      <div tabindex="0" role="region" aria-label="AC Feeder Raceways Table" class="table-container table-wrapper">
        <table class="registry-table responsive-data-table">
          <thead>
            <tr>
              <th>System</th>
              <th>AC Interconnection (PCC)</th>
              <th>Status</th>
              <th>Waypoints</th>
              <th>Route Length</th>
              <th>Elevation (&Delta;h)</th>
              <th>Total Feeder Run</th>
              <th>Conductor Sizing (PEC 75°C)</th>
              <th>Conduit (EMT/RMC)</th>
              <th>V-Drop (% &amp; V)</th>
              <th>PEC 2.15 Limit</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${systems.map(s => {
              const feeder = this.store.getSystemAcFeederSummary(s.id);
              return `
                <tr>
                  <td>
                    <div class="entity-badge-cell">
                      <span class="color-dot" style="background-color: ${s.color};"></span>
                      <b>${s.name}</b>
                    </div>
                  </td>
                  <td>
                    ${s.acInterconnectionLocation ? `<span class="badge accent">🏢 ${s.acInterconnectionLocation.lat.toFixed(4)}, ${s.acInterconnectionLocation.lng.toFixed(4)}</span>` : '<span class="text-dim">Not pinned</span>'}
                  </td>
                  <td>
                    ${feeder.hasRaceway ? '<span class="badge highlight">⚡ AC Feeder Drawn</span>' : s.acInterconnectionLocation && s.inverterLocation ? '<span class="badge">Direct Route</span>' : '<span class="badge warning">No Route</span>'}
                  </td>
                  <td>
                    ${s.acRaceway ? `<b>${s.acRaceway.path.length}</b> nodes` : '<span class="text-dim">—</span>'}
                  </td>
                  <td>
                    ${feeder.racewayLengthM > 0 ? `<b>${feeder.racewayLengthM.toFixed(1)} m</b>` : '<span class="text-dim">—</span>'}
                  </td>
                  <td>
                    ${feeder.elevationDeltaM} m
                  </td>
                  <td>
                    <strong style="color: var(--accent-green);">${feeder.totalRunM} m</strong>
                  </td>
                  <td>
                    <small style="color: #38bdf8; font-weight: 600;">${feeder.conductorCallout}</small>
                  </td>
                  <td>
                    <small>${feeder.conduitCallout}</small>
                  </td>
                  <td>
                    <strong style="color: ${feeder.isCompliant ? '#10b981' : '#ef4444'};">${feeder.voltageDropPercent}% (${feeder.voltageDropV}V)</strong>
                  </td>
                  <td>
                    <span class="badge ${feeder.isCompliant ? 'highlight' : 'danger'}">${feeder.isCompliant ? '✅ ≤3% OK' : '⚠️ >3% Drop'}</span>
                  </td>
                  <td style="text-align: right; white-space: nowrap;">
                    <button class="btn btn-xs btn-outline accent btn-jump-ac-raceway" data-sys-id="${s.id}" ${s.acRaceway ? '' : 'disabled'} title="Zoom to AC Feeder">🎯 Feeder</button>
                    <button class="btn btn-xs btn-outline warning btn-draw-ac-raceway-act" data-sys-id="${s.id}" title="Draw AC Feeder Raceway on satellite map">⚡ Draw Feeder</button>
                    ${s.acRaceway ? `<button class="btn btn-xs btn-outline danger btn-clear-ac-raceway-act" data-sys-id="${s.id}" title="Delete AC Feeder">🗑️</button>` : ''}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
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
    const systems = allSystems || this.store.getSystems();
    let filtered = allKeepOuts;
    if (this.searchKeyword) {
      const q = this.searchKeyword.toLowerCase();
      filtered = filtered.filter(
        item => item.keepOut.name.toLowerCase().includes(q) || item.zoneName.toLowerCase().includes(q)
      );
    }
    if (this.filterSystemId !== 'all') {
      filtered = filtered.filter(item => item.systemId === this.filterSystemId);
    }
    if (this.filterZoneId !== 'all') {
      filtered = filtered.filter(item => item.zoneId === this.filterZoneId);
    }

    const availableZones = this.filterSystemId !== 'all' ? zones.filter(z => z.systemId === this.filterSystemId) : zones;

    return `
      <div class="registry-toolbar">
        <div class="filters-row">
          <input type="search" id="modal-search" class="input-text" placeholder="Search obstacle name or array..." value="${this.searchKeyword}" />
          <select id="modal-system-filter" class="input-select" title="Filter by system">
            <option value="all">All Systems (${systems.length})</option>
            ${systems.map(s => `<option value="${s.id}" ${this.filterSystemId === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
          <select id="modal-zone-filter" class="input-select">
            <option value="all">${this.filterSystemId !== 'all' ? 'All Arrays in System' : 'All Arrays'} (${availableZones.length})</option>
            ${availableZones.map(z => `<option value="${z.id}" ${this.filterZoneId === z.id ? 'selected' : ''}>${z.name}</option>`).join('')}
          </select>
        </div>
        <div class="tbl-action-hint">
          <span class="icon">🔄</span> Change the <b>Associated Array</b> dropdown to instantly reassign a keep-out obstacle between arrays!
        </div>
      </div>

      <div tabindex="0" role="region" aria-label="Keep-Outs Schedule Table" class="table-container table-wrapper">
        <table class="registry-table responsive-data-table">
          <thead>
            <tr>
              <th>Keep-Out Name</th>
              <th>Associated Array (Editable)</th>
              <th>System</th>
              <th>Vertices</th>
              <th>Surface Area</th>
              <th>Centroid Coordinates</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered.length === 0
                ? `<tr><td colspan="7" class="empty-table-cell">No keep-out obstacles found matching criteria.</td></tr>`
                : filtered
                    .map(item => {
                      const ko = item.keepOut;
                      const areaSqM = computePolygonAreaSqM(ko.vertices);
                      const centroid = computePolygonCentroid(ko.vertices);
                      const sys = this.store.getSystem(item.systemId);

                      return `
                  <tr>
                    <td>
                      <div class="entity-badge-cell">
                        <span class="color-badge" style="background: #ef4444;"></span>
                        <input type="text" class="input-tbl-ko-name" data-zone-id="${item.zoneId}" data-ko-id="${ko.id}" value="${ko.name}" title="Edit obstacle name" />
                      </div>
                    </td>
                    <td>
                      <select class="input-select sm sel-reassign-ko" data-zone-id="${item.zoneId}" data-ko-id="${ko.id}" title="Reassign obstacle to a different array zone">
                        ${zones
                          .map(
                            z => `
                          <option value="${z.id}" ${z.id === item.zoneId ? 'selected' : ''}>
                            ${z.name} (${z.config.mountType})
                          </option>
                        `
                          )
                          .join('')}
                      </select>
                    </td>
                    <td>
                      <span class="badge" style="background: ${sys?.color || '#0284c7'}; color: #fff;">
                        ${sys?.name?.split(':')[0] || 'System'}
                      </span>
                    </td>
                    <td>
                      <b>${ko.vertices.length}</b> nodes
                    </td>
                    <td>
                      <strong style="color: #f87171;">${areaSqM.toFixed(1)} m²</strong>
                    </td>
                    <td>
                      <small>${centroid.lat.toFixed(6)}, ${centroid.lng.toFixed(6)}</small>
                    </td>
                    <td style="text-align: right; white-space: nowrap;">
                      <button class="btn btn-xs btn-jump-ko" data-zone-id="${item.zoneId}" data-ko-id="${ko.id}" title="Zoom to obstacle">🎯 Zoom</button>
                      <button class="btn btn-xs btn-edit-ko" data-zone-id="${item.zoneId}" data-ko-id="${ko.id}" title="Select array to edit obstacle vertices on map">✏️ Edit Vertices</button>
                      <button class="btn btn-xs btn-outline danger btn-delete-ko" data-zone-id="${item.zoneId}" data-ko-id="${ko.id}" title="Delete obstacle">🗑️</button>
                    </td>
                  </tr>
                `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * 5. STRINGS TABLE VIEW
   * Dedicated schedule where each row is an active PV string with electrical specs and cabling runs.
   */
  private renderStringsTable(stringCables: StringCableLength[], zones: ArrayZone[], allSystems?: SolarSystem[]): string {
    let filtered = stringCables;
    if (this.searchKeyword) {
      const q = this.searchKeyword.toLowerCase();
      filtered = filtered.filter(
        s => s.stringId.toLowerCase().includes(q) || s.zoneId.toLowerCase().includes(q)
      );
    }
    if (this.filterSystemId !== 'all') {
      filtered = filtered.filter(s => s.systemId === this.filterSystemId);
    }
    if (this.filterZoneId !== 'all') {
      filtered = filtered.filter(s => s.zoneId === this.filterZoneId);
    }

    const systems = allSystems || this.store.getSystems();
    const availableZones = this.filterSystemId !== 'all' ? zones.filter(z => z.systemId === this.filterSystemId) : zones;

    return `
      <div class="registry-toolbar">
        <div class="filters-row">
          <input type="search" id="modal-search" class="input-text" placeholder="Search string ID..." value="${this.searchKeyword}" />
          <select id="modal-system-filter" class="input-select" title="Filter by system">
            <option value="all">All Systems (${systems.length})</option>
            ${systems.map(s => `<option value="${s.id}" ${this.filterSystemId === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
          <select id="modal-zone-filter" class="input-select">
            <option value="all">${this.filterSystemId !== 'all' ? 'All Arrays in System' : 'All Arrays'} (${availableZones.length})</option>
            ${availableZones.map(z => `<option value="${z.id}" ${this.filterZoneId === z.id ? 'selected' : ''}>${z.name}</option>`).join('')}
          </select>
        </div>
        <div class="tbl-action-hint">
          <span class="icon">⚡</span> Each row summarizes a complete PV electrical series circuit and its DC cabling runs.
        </div>
      </div>

      <div tabindex="0" role="region" aria-label="Strings Schedule Table" class="table-container table-wrapper">
        <table class="registry-table responsive-data-table">
          <thead>
            <tr>
              <th>String ID</th>
              <th>System</th>
              <th>Array Zone</th>
              <th>Modules</th>
              <th>DC Capacity</th>
              <th>STC Voltages</th>
              <th>Inverter / MPPT</th>
              <th>Module Cable</th>
              <th>Homerun (+ / -)</th>
              <th>Raceway / Elev</th>
              <th>Total String Wire</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered.length === 0
                ? `<tr><td colspan="12" class="empty-table-cell">No active strings found matching criteria. Run Auto-Stringing to generate strings.</td></tr>`
                : filtered
                    .map(sc => {
                      const zone = this.store.getZone(sc.zoneId);
                      const sys = this.store.getSystem(sc.systemId);
                      const mod = zone ? this.store.getModule(zone.moduleId) : undefined;
                      const kwp = (sc.panelCount * (mod?.nominalPowerW || zone?.config.electrical.nominalPowerW || 600)) / 1000;
                      const voc = sc.panelCount * (mod?.voc || zone?.config.electrical.voc || 48.1);
                      const vmp = sc.panelCount * (mod?.vmp || zone?.config.electrical.vmp || 40.2);

                      // Find panel details
                      const p1 = this.store.getPanel(sc.startPanelId);

                      return `
                  <tr>
                    <td>
                      <input type="text" class="input-tbl-text input-tbl-string-id-edit" data-string-id="${sc.stringId}" value="${sc.stringId}" title="Rename String circuit ID" style="width: 120px; font-family: monospace; font-size: 11px;" />
                    </td>
                    <td>
                      <span class="badge" style="background: ${sys?.color || '#0284c7'}; color: #fff;">
                        ${sys?.name?.split(':')[0] || 'System'}
                      </span>
                    </td>
                    <td>
                      <div class="entity-badge-cell">
                        <span class="color-badge" style="background: ${zone?.color || '#333'};"></span>
                        <span>${zone?.name || sc.zoneId}</span>
                        <span class="badge ${zone?.config.mountType === 'roof' ? 'accent' : 'highlight'}" style="font-size: 9px; padding: 1px 4px;">
                          ${zone?.config.mountType === 'roof' ? 'Roof' : 'Ground'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <b>${sc.panelCount}</b> panels
                    </td>
                    <td>
                      <strong style="color: var(--accent-green);">${kwp.toFixed(2)} kWp</strong>
                    </td>
                    <td>
                      <small>Voc: ${voc.toFixed(1)}V &bull; Vmp: ${vmp.toFixed(1)}V</small>
                    </td>
                    <td>
                      <div class="inline-field-pair">
                        <select class="input-tbl-select sel-str-inv" data-string-id="${sc.stringId}" title="Assign String to Inverter Unit">
                          ${Array.from({ length: sys?.inverter.inverterCount || 1 }, (_, i) => `
                            <option value="${i + 1}" ${(p1?.inverterIndex || 1) === (i + 1) ? 'selected' : ''}>Inv ${i + 1}</option>
                          `).join('')}
                        </select>
                        <select class="input-tbl-select sel-str-mppt" data-string-id="${sc.stringId}" title="Assign String to MPPT Tracker">
                          ${Array.from({ length: sys?.inverter.mpptCountPerInverter || 1 }, (_, i) => `
                            <option value="INV${p1?.inverterIndex || 1}-MPPT${i + 1}" ${(p1?.mpptId || '').includes(`MPPT${i + 1}`) ? 'selected' : ''}>MPPT ${i + 1}</option>
                          `).join('')}
                        </select>
                      </div>
                    </td>
                    <td>
                      ${sc.intraStringLengthM} m
                    </td>
                    <td>
                      <small>${sc.homerunPositiveM}m (+) / ${sc.homerunNegativeM}m (-)</small>
                    </td>
                    <td>
                      ${
                        sc.hasRaceway
                          ? `<span class="badge highlight" title="Cables route through raceway conduit">
                              🛤️ ${sc.racewayPathLengthM ?? 0}m (&Delta;h: ${sc.elevationDeltaM}m)
                            </span>`
                          : `<span class="badge">Direct (&Delta;h: ${sc.elevationDeltaM}m)</span>`
                      }
                    </td>
                    <td>
                      <strong style="color: var(--accent-green);">${sc.totalStringCableM} m</strong>
                    </td>
                    <td style="text-align: right; white-space: nowrap;">
                      <button class="btn btn-xs btn-jump-string" data-string-id="${sc.stringId}" data-sys-id="${sc.systemId}" title="Zoom to fit this string on map">🎯 Zoom</button>
                      <button class="btn btn-xs btn-inspect-string" data-panel-id="${sc.startPanelId}" title="Inspect terminal module">🔍 Inspect</button>
                    </td>
                  </tr>
                `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * 6. SOLAR PANELS REGISTRY VIEW
   * High-performance virtualized/paginated rendering to ensure 60 FPS responsiveness even for 11MW+ farms (18,000+ modules).
   */
  private renderPanelsTable(allPanels: SolarPanelObject[], zones: ArrayZone[], systems: SolarSystem[], allSystems?: SolarSystem[]): string {
    const panels = this.getFilteredPanels();
    const totalFiltered = panels.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / this.panelPageSize));
    if (this.panelPage > totalPages) this.panelPage = totalPages;
    if (this.panelPage < 1) this.panelPage = 1;

    const startIdx = (this.panelPage - 1) * this.panelPageSize;
    const pagePanels = panels.slice(startIdx, startIdx + this.panelPageSize);
    const sysList = allSystems || systems;
    const availableZones = this.filterSystemId !== 'all' ? zones.filter(z => z.systemId === this.filterSystemId) : zones;

    return `
      <div class="registry-toolbar">
        <div class="filters-row">
          <input type="search" id="modal-search" class="input-text" placeholder="Search by ID or String..." value="${this.searchKeyword}" />

          <select id="modal-system-filter" class="input-select" title="Filter by system">
            <option value="all">All Systems (${sysList.length})</option>
            ${sysList.map(s => `<option value="${s.id}" ${this.filterSystemId === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>

          <select id="modal-zone-filter" class="input-select">
            <option value="all">${this.filterSystemId !== 'all' ? 'All Arrays in System' : 'All Arrays'} (${availableZones.length})</option>
            ${availableZones.map(z => `<option value="${z.id}" ${this.filterZoneId === z.id ? 'selected' : ''}>${z.name}</option>`).join('')}
          </select>

          <select id="modal-status-filter" class="input-select">
            <option value="all" ${this.filterStatus === 'all' ? 'selected' : ''}>All Statuses (${allPanels.length})</option>
            <option value="active" ${this.filterStatus === 'active' ? 'selected' : ''}>Active Only</option>
            <option value="disabled" ${this.filterStatus === 'disabled' ? 'selected' : ''}>Disabled Only</option>
          </select>
        </div>

        <div class="batch-stringing-bar">
          <span class="bar-title">🔌 Stringing Helper:</span>
          <input type="text" id="batch-str-id" class="input-text sm" placeholder="Prefix (e.g. STR-A)" />
          <button id="btn-auto-string" class="btn btn-sm btn-outline">Auto-String Rows (Serpentine)</button>
        </div>
      </div>

      <div class="pagination-bar" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: 6px; margin-bottom: 8px;">
        <div class="page-status" style="font-size: 12px; color: var(--text-dim);">
          Showing <b>${totalFiltered === 0 ? 0 : startIdx + 1}–${Math.min(startIdx + this.panelPageSize, totalFiltered)}</b> of <b>${totalFiltered.toLocaleString()}</b> panels
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn btn-xs btn-outline btn-page-prev" ${this.panelPage <= 1 ? 'disabled' : ''}>◀ Prev</button>
          <span style="font-size: 12px;">Page <b>${this.panelPage}</b> of <b>${totalPages}</b></span>
          <button class="btn btn-xs btn-outline btn-page-next" ${this.panelPage >= totalPages ? 'disabled' : ''}>Next ▶</button>
        </div>
      </div>

      <div tabindex="0" role="region" aria-label="Solar Panels Registry Table" class="table-container table-wrapper" style="content-visibility: auto; contain-intrinsic-size: auto none auto 500px;">
        <table class="registry-table responsive-data-table">
          <thead>
            <tr>
              <th>Panel ID</th>
              <th>System</th>
              <th>Array Zone</th>
              <th>Module Model</th>
              <th>Row, Col</th>
              <th>Watts</th>
              <th>Voc / Vmp</th>
              <th>String ID</th>
              <th>Order</th>
              <th>Active</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              pagePanels.length === 0
                ? `<tr><td colspan="11" class="empty-table-cell">No solar panels found matching current filters.</td></tr>`
                : pagePanels
                    .map(p => {
                      const z = this.store.getZone(p.zoneId);
                      const s = this.store.getSystem(p.systemId);
                      const m = this.store.getModule(p.moduleId);
                      return `
                  <tr class="${p.active ? '' : 'row-disabled'}">
                    <td><code>${p.id}</code></td>
                    <td>
                      <span class="badge" style="background: ${s?.color || '#0284c7'}">${s?.name?.split(':')[0] || 'System'}</span>
                    </td>
                    <td><span class="badge" style="background: ${z?.color || '#333'}">${z?.name || p.zoneId}</span></td>
                    <td><small title="${m?.name || p.electrical.modelName}">${m?.name?.split(' ')[0] || 'ZNShine'}</small></td>
                    <td>R${p.rowIndex}, C${p.colIndex}</td>
                    <td><strong>${p.electrical.nominalPowerW}W</strong></td>
                    <td>${p.electrical.voc}V / ${p.electrical.vmp}V</td>
                    <td>
                      <input type="text" class="input-tbl-string" data-panel-id="${p.id}" value="${p.stringId || ''}" placeholder="—" />
                    </td>
                    <td>
                      <input type="number" class="input-tbl-order" data-panel-id="${p.id}" value="${p.stringOrder || ''}" min="1" placeholder="—" />
                    </td>
                    <td>
                      <span class="status-indicator ${p.active ? 'active' : 'disabled'}">
                        ${p.active ? 'Active' : 'Off'}
                      </span>
                    </td>
                    <td style="text-align: right; white-space: nowrap;">
                      <button class="btn btn-xs btn-jump" data-panel-id="${p.id}" title="Locate on map">🎯 Zoom</button>
                      <button class="btn btn-xs ${p.active ? 'btn-warn' : 'btn-primary'} btn-toggle" data-panel-id="${p.id}" title="Toggle active">
                        ${p.active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>

      <div class="pagination-bar" style="display: flex; align-items: center; justify-content: flex-end; padding: 6px 12px; margin-top: 6px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn btn-xs btn-outline btn-page-prev" ${this.panelPage <= 1 ? 'disabled' : ''}>◀ Prev</button>
          <span style="font-size: 12px;">Page <b>${this.panelPage}</b> of <b>${totalPages}</b></span>
          <button class="btn btn-xs btn-outline btn-page-next" ${this.panelPage >= totalPages ? 'disabled' : ''}>Next ▶</button>
        </div>
      </div>
    `;
  }

  /**
   * 7. SINGLE LINE DIAGRAM TAB VIEW
   * Displays the 2D Wireframe Single Line Diagram for the selected system.
   */
  private renderSldTab(allSystems?: SolarSystem[]): string {
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
            <option value="all" ${this.filterSystemId === 'all' ? 'selected' : ''}>All Systems (Default: ${this.store.getSelectedSystem()?.name || 'Main'})</option>
            ${systems.map(s => `<option value="${s.id}" ${this.filterSystemId === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
          ${
            currentSys
              ? `<span class="badge" style="background: ${currentSys.color || '#0284c7'}; color: #fff;">Displaying: ${currentSys.name}</span>`
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
  private renderBoqTab(_allSystems?: SolarSystem[]): string {
    return `
      <div class="modal-boq-wrapper" style="display: flex; flex-direction: column; overflow-y: auto; max-height: calc(85vh - 180px);">
        <div id="modal-boq-mount" style="width: 100%;"></div>
      </div>
    `;
  }

  private attachModalListeners(): void {
    if (this.activeTab === 'sld') {
      const mountEl = this.dialog.querySelector('#modal-sld-mount') as HTMLElement;
      if (mountEl) {
        const sldSysId = this.filterSystemId !== 'all' ? this.filterSystemId : this.store.getSelectedSystem()?.id;
        new SingleLineDiagramUI(mountEl, this.store, sldSysId);
      }
    }

    if (this.activeTab === 'boq') {
      const mountEl = this.dialog.querySelector('#modal-boq-mount') as HTMLElement;
      if (mountEl) {
        new BoqAndDupaUI(mountEl, this.store, this.filterSystemId);
      }
    }

    // 1. Tab switching
    this.dialog.querySelectorAll('.tbl-tab-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const tab = (e.currentTarget as HTMLElement).getAttribute('data-tab') as TableViewTab;
        if (tab) {
          this.setActiveTab(tab);
        }
      });
    });

    // 2. Search & Filters
    const searchInput = document.getElementById('modal-search') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      this.searchKeyword = searchInput.value;
      this.panelPage = 1;
      this.render();
    });

    const onSystemFilterChange = (val: string) => {
      this.setSystemFilter(val);
    };

    const globalSysFilter = document.getElementById('modal-global-system-filter') as HTMLSelectElement;
    globalSysFilter?.addEventListener('change', () => onSystemFilterChange(globalSysFilter.value));

    const tabSysFilter = document.getElementById('modal-system-filter') as HTMLSelectElement;
    tabSysFilter?.addEventListener('change', () => onSystemFilterChange(tabSysFilter.value));

    document.getElementById('btn-reset-system-filter')?.addEventListener('click', () => {
      this.setSystemFilter('all');
    });

    const zoneFilter = document.getElementById('modal-zone-filter') as HTMLSelectElement;
    zoneFilter?.addEventListener('change', () => {
      this.filterZoneId = zoneFilter.value;
      this.panelPage = 1;
      this.render();
    });

    const statusFilter = document.getElementById('modal-status-filter') as HTMLSelectElement;
    statusFilter?.addEventListener('change', () => {
      this.filterStatus = statusFilter.value;
      this.panelPage = 1;
      this.render();
    });

    // Pagination buttons for Panels Table
    this.dialog.querySelectorAll('.btn-page-prev').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.panelPage > 1) {
          this.panelPage--;
          this.render();
        }
      });
    });

    this.dialog.querySelectorAll('.btn-page-next').forEach(btn => {
      btn.addEventListener('click', () => {
        this.panelPage++;
        this.render();
      });
    });

    // 3. Arrays Table Actions & In-Schedule Property Editing
    this.dialog.querySelectorAll('.input-tbl-zone-name').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId) {
          this.store.updateZoneName(zoneId, target.value);
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-zone-color').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId) {
          this.store.updateZoneColor(zoneId, target.value);
        }
      });
    });

    this.dialog.querySelectorAll('.sel-zone-system').forEach(sel => {
      sel.addEventListener('change', e => {
        const target = e.currentTarget as HTMLSelectElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId && target.value) {
          this.store.linkZoneToSystem(zoneId, target.value);
        }
      });
    });

    this.dialog.querySelectorAll('.sel-zone-mount').forEach(sel => {
      sel.addEventListener('change', e => {
        const target = e.currentTarget as HTMLSelectElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId && target.value) {
          this.store.updateZoneConfig(zoneId, { mountType: target.value as MountType });
        }
      });
    });

    this.dialog.querySelectorAll('.sel-zone-module').forEach(sel => {
      sel.addEventListener('change', e => {
        const target = e.currentTarget as HTMLSelectElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId && target.value) {
          this.store.setArrayModule(zoneId, target.value);
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-zone-tilt').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId) {
          this.store.updateZoneConfig(zoneId, {
            tiltDeg: Math.max(0, Math.min(90, parseFloat(target.value) || 0))
          });
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-zone-azimuth').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId) {
          this.store.updateZoneConfig(zoneId, {
            azimuthDeg: Math.max(0, Math.min(360, parseFloat(target.value) || 0))
          });
        }
      });
    });

    this.dialog.querySelectorAll('.sel-zone-orient').forEach(sel => {
      sel.addEventListener('change', e => {
        const target = e.currentTarget as HTMLSelectElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId) {
          this.store.updateZoneConfig(zoneId, {
            orientation: target.value as 'portrait' | 'landscape'
          });
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-zone-row-spacing').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId) {
          this.store.updateZoneConfig(zoneId, {
            rowSpacingM: Math.max(0.1, parseFloat(target.value) || 1)
          });
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-zone-col-spacing').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId) {
          this.store.updateZoneConfig(zoneId, {
            colSpacingM: Math.max(0.01, parseFloat(target.value) || 0.02)
          });
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-zone-setback').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId) {
          this.store.updateZoneConfig(zoneId, {
            setbackM: Math.max(0, parseFloat(target.value) || 0)
          });
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-zone-table-up').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId) {
          this.store.updateZoneConfig(zoneId, {
            modulesPerTableUp: Math.max(1, Math.min(10, parseInt(target.value, 10) || 1))
          });
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-zone-table-wide').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId) {
          this.store.updateZoneConfig(zoneId, {
            modulesPerTableWide: Math.max(1, Math.min(100, parseInt(target.value, 10) || 1))
          });
        }
      });
    });

    this.dialog.querySelectorAll('.sel-zone-rail-count').forEach(select => {
      select.addEventListener('change', e => {
        const target = e.currentTarget as HTMLSelectElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId) {
          const count = parseInt(target.value, 10) === 3 ? 3 : 2;
          this.store.updateZoneConfig(zoneId, { railCount: count });
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-zone-table-gap').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId) {
          this.store.updateZoneConfig(zoneId, {
            tableSpacingM: Math.max(0.05, Math.min(20, parseFloat(target.value) || 0.1))
          });
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-zone-elev').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId) {
          this.store.setRacewayElevationChange(zoneId, parseFloat(target.value) || 0);
        }
      });
    });

    this.dialog.querySelectorAll('.btn-opt-zone').forEach(btn => {
      btn.addEventListener('click', e => {
        const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
        if (zoneId) {
          const res = this.store.optimizeZoneGridShift(zoneId);
          let msg = `⚡ Array Grid Shift Optimized & Auto-Strung!\n\nPanels increased from ${res.previousPanelCount} to ${res.maxPanelCount} panels.`;
          if (res.totalStrings !== undefined) {
            msg += `\n⚡ Auto-Strung into ${res.totalStrings} Strings (${res.modulesPerString || 0} modules/str)!`;
          }
          if (res.warnings && res.warnings.length > 0) {
            msg += `\n\n⚠️ Notices:\n` + res.warnings.join('\n');
          }
          alert(msg);
        }
      });
    });

    this.dialog.querySelectorAll('.btn-jump-zone').forEach(btn => {
      btn.addEventListener('click', e => {
        const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
        if (zoneId) {
          this.store.selectZone(zoneId);
          this.mapController?.zoomToZone(zoneId);
          this.close();
        }
      });
    });

    this.dialog.querySelectorAll('.btn-select-zone').forEach(btn => {
      btn.addEventListener('click', e => {
        const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
        if (zoneId) {
          this.store.selectZone(zoneId);
          this.mapController?.zoomToZone(zoneId);
          this.close();
        }
      });
    });

    this.dialog.querySelectorAll('.btn-delete-zone').forEach(btn => {
      btn.addEventListener('click', e => {
        const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
        if (zoneId) {
          const z = this.store.getZone(zoneId);
          if (confirm(`Delete array "${z?.name || zoneId}" and all its panels?`)) {
            this.store.removeZone(zoneId);
          }
        }
      });
    });

    // 4. Systems Table Actions & In-Schedule Property Editing
    this.dialog.querySelectorAll('.input-tbl-sys-name').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const sysId = target.getAttribute('data-sys-id');
        if (sysId && target.value.trim()) {
          this.store.updateSystem(sysId, { name: target.value.trim() });
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-sys-color').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const sysId = target.getAttribute('data-sys-id');
        if (sysId) {
          this.store.updateSystem(sysId, { color: target.value });
        }
      });
    });

    this.dialog.querySelectorAll('.sel-sys-inv-preset').forEach(sel => {
      sel.addEventListener('change', e => {
        const target = e.currentTarget as HTMLSelectElement;
        const sysId = target.getAttribute('data-sys-id');
        if (sysId && target.value) {
          this.store.setSystemInverterPreset(sysId, target.value);
        }
      });
    });

    this.dialog.querySelectorAll('.sel-sys-inv-phase').forEach(sel => {
      sel.addEventListener('change', e => {
        const target = e.currentTarget as HTMLSelectElement;
        const sysId = target.getAttribute('data-sys-id');
        if (sysId) {
          const phase = target.value as AcPhaseType;
          const defaultVac = phase === 'single_phase' ? 230 : 400;
          this.store.updateSystemInverter(sysId, { phase, acVoltage: defaultVac });
          this.render();
        }
      });
    });

    this.dialog.querySelectorAll('.sel-sys-inv-voltage').forEach(sel => {
      sel.addEventListener('change', e => {
        const target = e.currentTarget as HTMLSelectElement;
        const sysId = target.getAttribute('data-sys-id');
        if (!sysId) return;
        if (target.value === 'custom') {
          const currentSys = this.store.getSystem(sysId);
          const val = prompt('Enter custom AC Line Voltage in Volts (e.g. 480, 208, 240, 230):', String(currentSys?.inverter.acVoltage || 400));
          if (val && Number(val) > 0) {
            this.store.updateSystemInverter(sysId, { acVoltage: Number(val) });
            this.render();
          }
        } else {
          const vac = Number(target.value);
          if (vac > 0) {
            this.store.updateSystemInverter(sysId, { acVoltage: vac });
          }
        }
      });
    });

    this.dialog.querySelectorAll('.sel-sys-tap-voltage').forEach(sel => {
      sel.addEventListener('change', e => {
        const target = e.currentTarget as HTMLSelectElement;
        const sysId = target.getAttribute('data-sys-id');
        if (sysId) {
          const v = Number(target.value);
          if (v > 0) {
            this.store.updateSystem(sysId, { systemVoltageV: v });
            this.render();
          }
        }
      });
    });

    this.dialog.querySelectorAll('.chk-sys-ac-combiner').forEach(chk => {
      chk.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const sysId = target.getAttribute('data-sys-id');
        if (sysId) {
          this.store.updateSystem(sysId, { hasAcCombiner: target.checked });
          this.render();
        }
      });
    });

    this.dialog.querySelectorAll('.sel-sys-mdp-tap').forEach(sel => {
      sel.addEventListener('change', e => {
        const target = e.currentTarget as HTMLSelectElement;
        const sysId = target.getAttribute('data-sys-id');
        if (sysId) {
          this.store.updateSystem(sysId, { mdpTapType: target.value as MdpTapType });
          this.render();
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-sys-inv-count').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const sysId = target.getAttribute('data-sys-id');
        if (sysId) {
          this.store.updateSystemInverter(sysId, {
            inverterCount: Math.max(1, parseInt(target.value) || 1)
          });
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-sys-inv-kw').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const sysId = target.getAttribute('data-sys-id');
        if (sysId) {
          this.store.updateSystemInverter(sysId, {
            ratedAcPowerKw: Math.max(1, parseFloat(target.value) || 100)
          });
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-sys-inv-mppts').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const sysId = target.getAttribute('data-sys-id');
        if (sysId) {
          this.store.updateSystemInverter(sysId, {
            mpptCountPerInverter: Math.max(1, parseInt(target.value) || 1)
          });
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-sys-inv-str-mppt').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const sysId = target.getAttribute('data-sys-id');
        if (sysId) {
          this.store.updateSystemInverter(sysId, {
            maxStringsPerMppt: Math.max(1, parseInt(target.value) || 1)
          });
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-sys-inv-elev').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const sysId = target.getAttribute('data-sys-id');
        if (sysId) {
          const sys = this.store.getSystem(sysId);
          this.store.setSystemInverterLocation(
            sysId,
            sys?.inverterLocation || null,
            parseFloat(target.value) || 0
          );
        }
      });
    });

    this.dialog.querySelectorAll('.btn-jump-inverter').forEach(btn => {
      btn.addEventListener('click', e => {
        const sysId = (e.currentTarget as HTMLElement).getAttribute('data-sys-id');
        if (sysId) {
          this.store.selectSystem(sysId);
          this.mapController?.zoomToInverter(sysId);
          this.close();
        }
      });
    });

    this.dialog.querySelectorAll('.btn-jump-pcc').forEach(btn => {
      btn.addEventListener('click', e => {
        const sysId = (e.currentTarget as HTMLElement).getAttribute('data-sys-id');
        if (sysId) {
          this.store.selectSystem(sysId);
          this.mapController?.zoomToAcInterconnection(sysId);
          this.close();
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-sys-pcc-elev').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const sysId = target.getAttribute('data-sys-id');
        if (sysId) {
          this.store.setSystemAcInterconnectionElevation(sysId, parseFloat(target.value) || 0);
        }
      });
    });

    this.dialog.querySelectorAll('.btn-select-system').forEach(btn => {
      btn.addEventListener('click', e => {
        const sysId = (e.currentTarget as HTMLElement).getAttribute('data-sys-id');
        if (sysId) {
          this.store.selectSystem(sysId);
          this.close();
        }
      });
    });

    this.dialog.querySelectorAll('.btn-auto-string-system').forEach(btn => {
      btn.addEventListener('click', e => {
        const sysId = (e.currentTarget as HTMLElement).getAttribute('data-sys-id');
        if (sysId) {
          const res = this.store.autoStringSystem(sysId);
          alert(
            `⚡ System Auto-Stringing Complete!\n\nStrings Formed: ${res.totalStrings}\nModules per String: ${res.modulesPerString}\nDC/AC Ratio: ${res.inverterLoadRatio}`
          );
        }
      });
    });

    // 5. Raceways Table Actions & In-Schedule Property Editing
    this.dialog.querySelectorAll('.input-tbl-raceway-elev').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const zoneId = target.getAttribute('data-zone-id');
        if (zoneId) {
          this.store.setRacewayElevationChange(zoneId, parseFloat(target.value) || 0);
        }
      });
    });

    this.dialog.querySelectorAll('.btn-jump-raceway').forEach(btn => {
      btn.addEventListener('click', e => {
        const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
        if (zoneId) {
          this.store.selectZone(zoneId);
          this.mapController?.zoomToRaceway(zoneId);
          this.close();
        }
      });
    });

    this.dialog.querySelectorAll('.btn-draw-raceway-act').forEach(btn => {
      btn.addEventListener('click', e => {
        const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
        if (zoneId) {
          this.store.selectZone(zoneId);
          this.mapController?.zoomToZone(zoneId);
          this.store.setDrawingMode('raceway');
          this.close();
        }
      });
    });

    this.dialog.querySelectorAll('.btn-clear-raceway-act').forEach(btn => {
      btn.addEventListener('click', e => {
        const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
        if (zoneId && confirm('Clear this raceway path?')) {
          this.store.clearZoneRaceway(zoneId);
        }
      });
    });

    this.dialog.querySelectorAll('.btn-jump-ac-raceway').forEach(btn => {
      btn.addEventListener('click', e => {
        const sysId = (e.currentTarget as HTMLElement).getAttribute('data-sys-id');
        if (sysId) {
          this.store.selectSystem(sysId);
          this.mapController?.zoomToAcRaceway(sysId);
          this.close();
        }
      });
    });

    this.dialog.querySelectorAll('.btn-draw-ac-raceway-act').forEach(btn => {
      btn.addEventListener('click', e => {
        const sysId = (e.currentTarget as HTMLElement).getAttribute('data-sys-id');
        if (sysId) {
          this.store.selectSystem(sysId);
          this.store.setDrawingMode('ac_raceway');
          this.close();
        }
      });
    });

    this.dialog.querySelectorAll('.btn-clear-ac-raceway-act').forEach(btn => {
      btn.addEventListener('click', e => {
        const sysId = (e.currentTarget as HTMLElement).getAttribute('data-sys-id');
        if (sysId && confirm('Clear AC Feeder raceway path?')) {
          this.store.clearSystemAcRaceway(sysId);
          this.render();
        }
      });
    });

    // 6. Keep-Outs (Obstacles) Table Actions
    this.dialog.querySelectorAll('.sel-reassign-ko').forEach(sel => {
      sel.addEventListener('change', e => {
        const target = e.currentTarget as HTMLSelectElement;
        const currentZoneId = target.getAttribute('data-zone-id');
        const keepOutId = target.getAttribute('data-ko-id');
        const targetZoneId = target.value;
        if (currentZoneId && keepOutId && targetZoneId) {
          const success = this.store.reassignKeepOutZone(currentZoneId, keepOutId, targetZoneId);
          if (success) {
            this.render();
          }
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-ko-name').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const zoneId = target.getAttribute('data-zone-id');
        const keepOutId = target.getAttribute('data-ko-id');
        if (zoneId && keepOutId) {
          this.store.updateKeepOutName(zoneId, keepOutId, target.value.trim());
        }
      });
    });

    this.dialog.querySelectorAll('.btn-jump-ko').forEach(btn => {
      btn.addEventListener('click', e => {
        const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
        const keepOutId = (e.currentTarget as HTMLElement).getAttribute('data-ko-id');
        if (zoneId && keepOutId) {
          this.store.selectZone(zoneId);
          this.store.selectKeepOut(keepOutId);
          this.mapController?.zoomToKeepOut(zoneId, keepOutId);
          this.close();
        }
      });
    });

    this.dialog.querySelectorAll('.btn-edit-ko').forEach(btn => {
      btn.addEventListener('click', e => {
        const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
        const keepOutId = (e.currentTarget as HTMLElement).getAttribute('data-ko-id');
        if (zoneId && keepOutId) {
          this.store.selectZone(zoneId);
          this.store.selectKeepOut(keepOutId);
          this.mapController?.zoomToKeepOut(zoneId, keepOutId);
          this.close();
        }
      });
    });

    this.dialog.querySelectorAll('.btn-delete-ko').forEach(btn => {
      btn.addEventListener('click', e => {
        const zoneId = (e.currentTarget as HTMLElement).getAttribute('data-zone-id');
        const keepOutId = (e.currentTarget as HTMLElement).getAttribute('data-ko-id');
        if (zoneId && keepOutId && confirm('Delete this obstacle polygon?')) {
          this.store.removeKeepOut(zoneId, keepOutId);
          this.render();
        }
      });
    });

    // 7. Strings Table Actions & In-Schedule Property Editing
    this.dialog.querySelectorAll('.input-tbl-string-id-edit').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const oldStringId = target.getAttribute('data-string-id');
        const newStringId = target.value.trim();
        if (oldStringId && newStringId && oldStringId !== newStringId) {
          this.store.renameString(oldStringId, newStringId);
        }
      });
    });

    this.dialog.querySelectorAll('.sel-str-inv').forEach(sel => {
      sel.addEventListener('change', e => {
        const target = e.currentTarget as HTMLSelectElement;
        const stringId = target.getAttribute('data-string-id');
        if (stringId) {
          this.store.updateStringAssignment(stringId, parseInt(target.value) || 1);
        }
      });
    });

    this.dialog.querySelectorAll('.sel-str-mppt').forEach(sel => {
      sel.addEventListener('change', e => {
        const target = e.currentTarget as HTMLSelectElement;
        const stringId = target.getAttribute('data-string-id');
        if (stringId) {
          this.store.updateStringAssignment(stringId, undefined, target.value);
        }
      });
    });

    this.dialog.querySelectorAll('.btn-jump-string').forEach(btn => {
      btn.addEventListener('click', e => {
        const stringId = (e.currentTarget as HTMLElement).getAttribute('data-string-id');
        const sysId = (e.currentTarget as HTMLElement).getAttribute('data-sys-id') || undefined;
        if (stringId) {
          this.mapController?.zoomToString(stringId, sysId);
          this.close();
        }
      });
    });

    this.dialog.querySelectorAll('.btn-inspect-string').forEach(btn => {
      btn.addEventListener('click', e => {
        const panelId = (e.currentTarget as HTMLElement).getAttribute('data-panel-id');
        if (panelId) {
          this.store.selectPanel(panelId);
          this.mapController?.zoomToPanel(panelId);
          this.close();
        }
      });
    });

    // 8. Panels Table String & Active Updates
    this.dialog.querySelectorAll('.input-tbl-string').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const panelId = target.getAttribute('data-panel-id');
        if (panelId) {
          const p = this.store.getPanel(panelId);
          this.store.updatePanelString(panelId, target.value.trim() || null, p?.stringOrder ?? null);
        }
      });
    });

    this.dialog.querySelectorAll('.input-tbl-order').forEach(input => {
      input.addEventListener('change', e => {
        const target = e.currentTarget as HTMLInputElement;
        const panelId = target.getAttribute('data-panel-id');
        if (panelId) {
          const p = this.store.getPanel(panelId);
          const order = target.value ? Number(target.value) : null;
          this.store.updatePanelString(panelId, p?.stringId ?? null, order);
        }
      });
    });

    this.dialog.querySelectorAll('.btn-jump').forEach(btn => {
      btn.addEventListener('click', e => {
        const panelId = (e.currentTarget as HTMLElement).getAttribute('data-panel-id');
        if (panelId) {
          this.store.selectPanel(panelId);
          this.mapController?.zoomToPanel(panelId);
          this.close();
        }
      });
    });

    this.dialog.querySelectorAll('.btn-toggle').forEach(btn => {
      btn.addEventListener('click', e => {
        const panelId = (e.currentTarget as HTMLElement).getAttribute('data-panel-id');
        if (panelId) {
          this.store.togglePanelActive(panelId);
        }
      });
    });

    document.getElementById('btn-auto-string')?.addEventListener('click', () => {
      const prefixInput = document.getElementById('batch-str-id') as HTMLInputElement;
      const prefix = prefixInput.value.trim() || 'STR';
      const filtered = this.getFilteredPanels().filter(p => p.active);

      // Separate roof mount arrays vs ground mount arrays (roof strings never jump arrays)
      const roofPanels = filtered.filter(p => this.store.getZone(p.zoneId)?.config.mountType === 'roof');
      const groundPanels = filtered.filter(p => this.store.getZone(p.zoneId)?.config.mountType === 'ground');

      let globalStringCount = 0;
      const modulesPerString = 20;

      // Group roof panels by zoneId
      const roofZoneIds = Array.from(new Set(roofPanels.map(p => p.zoneId)));
      for (const zid of roofZoneIds) {
        const zPanels = roofPanels.filter(p => p.zoneId === zid);
        zPanels.sort((a, b) => {
          if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
          return a.rowIndex % 2 === 0 ? a.colIndex - b.colIndex : b.colIndex - a.colIndex;
        });

        for (let i = 0; i < zPanels.length; i += modulesPerString) {
          globalStringCount++;
          const slice = zPanels.slice(i, i + modulesPerString);
          slice.forEach((p, seq) => {
            const strId = `${prefix}-${String(globalStringCount).padStart(2, '0')}`;
            this.store.updatePanelString(p.id, strId, seq + 1);
          });
        }
      }

      // Ground panels can continuous-string across ground arrays, respecting mount tables
      if (groundPanels.length > 0) {
        groundPanels.sort((a, b) => {
          if (a.zoneId !== b.zoneId) return a.zoneId.localeCompare(b.zoneId);
          if (a.tableIndex != null && b.tableIndex != null && a.tableIndex !== b.tableIndex) {
            return a.tableIndex - b.tableIndex;
          }
          if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
          return a.rowIndex % 2 === 0 ? a.colIndex - b.colIndex : b.colIndex - a.colIndex;
        });

        for (let i = 0; i < groundPanels.length; i += modulesPerString) {
          globalStringCount++;
          const slice = groundPanels.slice(i, i + modulesPerString);
          slice.forEach((p, seq) => {
            const strId = `${prefix}-${String(globalStringCount).padStart(2, '0')}`;
            this.store.updatePanelString(p.id, strId, seq + 1);
          });
        }
      }

      this.render();
    });
  }

  /**
   * Exports the currently active table view as a clean, standardized CSV file.
   */
  public exportActiveTabCsv(): void {
    let filename = '';
    let rows: string[][] = [];
    const isFiltered = this.filterSystemId !== 'all';
    const activeSys = isFiltered ? this.store.getSystem(this.filterSystemId) : undefined;
    const sysSlug = activeSys ? `_${activeSys.name.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '_all_systems';

    switch (this.activeTab) {
      case 'arrays': {
        filename = `solar_arrays_schedule${sysSlug}_${Date.now()}.csv`;
        rows = [
          [
            'Array_ID',
            'Array_Name',
            'System_ID',
            'System_Name',
            'Mount_Type',
            'Table_Count',
            'Modules_Per_Table_Up',
            'Modules_Per_Table_Wide',
            'Table_Spacing_M',
            'Module_Model',
            'Module_Watts',
            'Active_Panels',
            'Total_Panels',
            'Capacity_kWp',
            'Orientation',
            'Tilt_Deg',
            'Azimuth_Deg',
            'Row_Pitch_M',
            'Col_Spacing_M',
            'Setback_M',
            'Area_SqM',
            'Has_Raceway',
            'Raceway_Path_Length_M',
            'Elevation_Delta_M'
          ]
        ];

        let zones = this.store.getZones();
        if (isFiltered) {
          zones = zones.filter(z => z.systemId === this.filterSystemId);
        }

        for (const z of zones) {
          const sys = this.store.getSystem(z.systemId);
          const mod = this.store.getModule(z.moduleId);
          const area = computePolygonAreaSqM(z.vertices);
          const totalPanels = this.store.getPanels().filter(p => p.zoneId === z.id).length;

          let pathLen2D = 0;
          if (z.raceway && z.raceway.path && z.raceway.path.length >= 2) {
            for (let i = 0; i < z.raceway.path.length - 1; i++) {
              pathLen2D += calculateGeodeticDistanceM(z.raceway.path[i], z.raceway.path[i + 1]);
            }
          }
          const elevM = z.raceway ? z.raceway.elevationChangeM : (z.elevationDeltaM ?? 0);

          rows.push([
            z.id,
            z.name,
            z.systemId,
            sys?.name || '',
            z.config.mountType,
            String(z.tableCount ?? (z.config.mountType === 'ground' ? 0 : '')),
            String(z.config.modulesPerTableUp ?? ''),
            String(z.config.modulesPerTableWide ?? ''),
            String(z.config.tableSpacingM ?? ''),
            mod?.name || z.config.electrical.modelName,
            String(mod?.nominalPowerW || z.config.electrical.nominalPowerW),
            String(z.activePanelCount),
            String(totalPanels),
            z.totalKwp.toFixed(2),
            z.config.orientation,
            String(z.config.tiltDeg),
            String(z.config.azimuthDeg),
            String(z.config.rowSpacingM),
            String(z.config.colSpacingM),
            String(z.config.setbackM),
            area.toFixed(1),
            z.raceway ? 'TRUE' : 'FALSE',
            pathLen2D.toFixed(1),
            String(elevM)
          ]);
        }
        break;
      }

      case 'systems': {
        filename = `solar_systems_summary${sysSlug}_${Date.now()}.csv`;
        rows = [
          [
            'System_ID',
            'System_Name',
            'Linked_Arrays_Count',
            'Active_Panels',
            'Total_DC_Power_kWp',
            'Inverter_Model',
            'Inverter_Count',
            'Inverter_AC_kW',
            'DC_AC_Ratio',
            'Inverter_Lat',
            'Inverter_Lng',
            'Inverter_Elevation_M',
            'AC_PCC_Lat',
            'AC_PCC_Lng',
            'AC_PCC_Elevation_M',
            'AC_Feeder_Run_M',
            'AC_Voltage_Drop_Percent',
            'AC_Feeder_Conductor',
            'PEC_2_15_Compliant',
            'Total_DC_Cable_M',
            'Total_Homerun_Cable_M',
            'Total_Raceway_Cable_M'
          ]
        ];

        let systems = this.store.getSystems();
        if (isFiltered) {
          systems = systems.filter(s => s.id === this.filterSystemId);
        }

        for (const s of systems) {
          const sum = this.store.getSystemSummary(s.id);
          const cable = this.store.getSystemCableSummary(s.id);
          const feeder = this.store.getSystemAcFeederSummary(s.id);
          const zCount = this.store.getZones().filter(z => z.systemId === s.id).length;

          rows.push([
            s.id,
            s.name,
            String(zCount),
            String(sum.totalActivePanels),
            sum.totalKwp.toFixed(2),
            s.inverter.modelName,
            String(s.inverter.inverterCount),
            String(sum.inverterAcKw),
            sum.dcAcRatio.toFixed(2),
            s.inverterLocation ? String(s.inverterLocation.lat) : '',
            s.inverterLocation ? String(s.inverterLocation.lng) : '',
            String(s.inverterElevationM ?? 0),
            s.acInterconnectionLocation ? String(s.acInterconnectionLocation.lat) : '',
            s.acInterconnectionLocation ? String(s.acInterconnectionLocation.lng) : '',
            String(s.acInterconnectionElevationM ?? 0),
            String(feeder.totalRunM),
            String(feeder.voltageDropPercent),
            feeder.conductorCallout,
            feeder.isCompliant ? 'TRUE' : 'FALSE',
            String(cable.totalCableLengthM),
            String(cable.totalHomerunM),
            String(cable.totalRacewayLengthM)
          ]);
        }
        break;
      }

      case 'raceways': {
        filename = `solar_raceways_schedule${sysSlug}_${Date.now()}.csv`;
        rows = [
          [
            'Array_ID',
            'Array_Name',
            'System_ID',
            'System_Name',
            'Has_Raceway',
            'Waypoints_Count',
            'Path_2D_Length_M',
            'Elevation_Drop_M',
            'Exit_To_Inverter_M',
            'Conduit_Run_Per_Conductor_M',
            'Active_Strings_Count',
            'Total_Wire_In_Raceway_M'
          ]
        ];

        let zones = this.store.getZones();
        if (isFiltered) {
          zones = zones.filter(z => z.systemId === this.filterSystemId);
        }

        for (const z of zones) {
          const sys = this.store.getSystem(z.systemId);
          const hasRaceway = Boolean(z.raceway && z.raceway.path && z.raceway.path.length >= 2);

          let pathLen2D = 0;
          if (hasRaceway && z.raceway) {
            for (let i = 0; i < z.raceway.path.length - 1; i++) {
              pathLen2D += calculateGeodeticDistanceM(z.raceway.path[i], z.raceway.path[i + 1]);
            }
          }
          const elevM = Math.abs(z.raceway ? z.raceway.elevationChangeM : (z.elevationDeltaM ?? 0));

          let distToInv = 0;
          if (hasRaceway && z.raceway && sys?.inverterLocation) {
            const exitPt = z.raceway.path[z.raceway.path.length - 1];
            distToInv = calculateGeodeticDistanceM(exitPt, sys.inverterLocation);
          }
          const singleRunM = pathLen2D + elevM + distToInv;

          const zonePanels = this.store.getPanels().filter(p => p.zoneId === z.id && p.active && p.stringId);
          const stringCount = new Set(zonePanels.map(p => p.stringId)).size;
          const totalWireM = stringCount * 2 * singleRunM;

          rows.push([
            z.id,
            z.name,
            z.systemId,
            sys?.name || '',
            hasRaceway ? 'TRUE' : 'FALSE',
            String(z.raceway?.path.length ?? 0),
            pathLen2D.toFixed(1),
            elevM.toFixed(1),
            distToInv.toFixed(1),
            singleRunM.toFixed(1),
            String(stringCount),
            totalWireM.toFixed(1)
          ]);
        }
        break;
      }

      case 'keepouts': {
        filename = `solar_keepouts_schedule${sysSlug}_${Date.now()}.csv`;
        rows = [
          [
            'KeepOut_ID',
            'KeepOut_Name',
            'Zone_ID',
            'Zone_Name',
            'System_ID',
            'System_Name',
            'Mount_Type',
            'Vertex_Count',
            'Area_SqM',
            'Centroid_Lat',
            'Centroid_Lng'
          ]
        ];

        let keepOuts = this.store.getAllKeepOuts();
        if (isFiltered) {
          keepOuts = keepOuts.filter(k => k.systemId === this.filterSystemId);
        }
        if (this.filterZoneId !== 'all') {
          keepOuts = keepOuts.filter(k => k.zoneId === this.filterZoneId);
        }

        for (const item of keepOuts) {
          const ko = item.keepOut;
          const zone = this.store.getZone(item.zoneId);
          const sys = this.store.getSystem(item.systemId);
          const area = computePolygonAreaSqM(ko.vertices);
          const centroid = computePolygonCentroid(ko.vertices);

          rows.push([
            ko.id,
            ko.name,
            item.zoneId,
            item.zoneName,
            item.systemId,
            sys?.name || '',
            zone?.config.mountType || 'roof',
            String(ko.vertices.length),
            area.toFixed(2),
            centroid.lat.toFixed(6),
            centroid.lng.toFixed(6)
          ]);
        }
        break;
      }

      case 'strings': {
        filename = `solar_strings_schedule${sysSlug}_${Date.now()}.csv`;
        rows = [
          [
            'String_ID',
            'System_ID',
            'System_Name',
            'Zone_ID',
            'Zone_Name',
            'Mount_Type',
            'Panel_Count',
            'Total_Capacity_kWp',
            'Voc_STC_V',
            'Vmp_STC_V',
            'Inverter_Number',
            'MPPT_Channel',
            'Intra_String_Cable_M',
            'Homerun_Positive_M',
            'Homerun_Negative_M',
            'Elevation_Delta_M',
            'Total_Homerun_M',
            'Total_String_Cable_M',
            'Start_Panel_ID',
            'End_Panel_ID'
          ]
        ];

        let strings = this.store.getStringCables('all');
        if (isFiltered) {
          strings = strings.filter(s => s.systemId === this.filterSystemId);
        }
        if (this.filterZoneId !== 'all') {
          strings = strings.filter(s => s.zoneId === this.filterZoneId);
        }

        for (const sc of strings) {
          const zone = this.store.getZone(sc.zoneId);
          const sys = this.store.getSystem(sc.systemId);
          const mod = zone ? this.store.getModule(zone.moduleId) : undefined;
          const kwp = (sc.panelCount * (mod?.nominalPowerW || zone?.config.electrical.nominalPowerW || 600)) / 1000;
          const voc = sc.panelCount * (mod?.voc || zone?.config.electrical.voc || 48.1);
          const vmp = sc.panelCount * (mod?.vmp || zone?.config.electrical.vmp || 40.2);
          const p1 = this.store.getPanel(sc.startPanelId);

          rows.push([
            sc.stringId,
            sc.systemId,
            sys?.name || '',
            sc.zoneId,
            zone?.name || '',
            zone?.config.mountType || '',
            String(sc.panelCount),
            kwp.toFixed(2),
            voc.toFixed(1),
            vmp.toFixed(1),
            p1?.inverterIndex ? String(p1.inverterIndex) : '1',
            p1?.mpptId || '',
            String(sc.intraStringLengthM),
            String(sc.homerunPositiveM),
            String(sc.homerunNegativeM),
            String(sc.elevationDeltaM),
            String(sc.totalHomerunM),
            String(sc.totalStringCableM),
            sc.startPanelId,
            sc.endPanelId
          ]);
        }
        break;
      }

      case 'panels': {
        filename = `solar_panels_registry${sysSlug}_${Date.now()}.csv`;
        let panels = this.store.getPanels();
        if (isFiltered) {
          panels = panels.filter(p => p.systemId === this.filterSystemId);
        }
        if (this.filterZoneId !== 'all') {
          panels = panels.filter(p => p.zoneId === this.filterZoneId);
        }
        if (this.filterStatus === 'active') {
          panels = panels.filter(p => p.active);
        } else if (this.filterStatus === 'disabled') {
          panels = panels.filter(p => !p.active);
        }
        const allStringCables = new Map(this.store.getStringCables('all').map(sc => [sc.stringId, sc]));
        rows = [
          [
            'Panel_ID',
            'System_ID',
            'System_Name',
            'Zone_ID',
            'Zone_Name',
            'Module_Model',
            'Row_Index',
            'Col_Index',
            'Active',
            'Azimuth_Deg',
            'Tilt_Deg',
            'Nominal_Watts',
            'Voc_V',
            'Vmp_V',
            'Isc_A',
            'Imp_A',
            'Inverter_Index',
            'MPPT_ID',
            'String_ID',
            'String_Order',
            'Array_Elevation_Delta_M',
            'String_Total_Cable_M',
            'String_Homerun_Cable_M',
            'Centroid_Lat',
            'Centroid_Lng'
          ]
        ];

        for (const p of panels) {
          const s = this.store.getSystem(p.systemId);
          const z = this.store.getZone(p.zoneId);
          const m = this.store.getModule(p.moduleId);
          const sc = p.stringId ? allStringCables.get(p.stringId) : undefined;
          rows.push([
            p.id,
            p.systemId,
            s?.name || '',
            p.zoneId,
            z?.name || '',
            m?.name || p.electrical.modelName,
            String(p.rowIndex),
            String(p.colIndex),
            p.active ? 'TRUE' : 'FALSE',
            String(p.azimuthDeg),
            String(p.tiltDeg),
            String(p.electrical.nominalPowerW),
            String(p.electrical.voc),
            String(p.electrical.vmp),
            String(p.electrical.isc),
            String(p.electrical.imp),
            p.inverterIndex !== null && typeof p.inverterIndex === 'number' ? String(p.inverterIndex + 1) : '',
            p.mpptId || '',
            p.stringId || '',
            p.stringOrder ? String(p.stringOrder) : '',
            String(z?.elevationDeltaM ?? 0),
            sc ? String(sc.totalStringCableM) : '',
            sc ? String(sc.totalHomerunM) : '',
            p.centroid.lat.toFixed(6),
            p.centroid.lng.toFixed(6)
          ]);
        }
        break;
      }

      case 'sld': {
        const sys = (isFiltered ? activeSys : undefined) || this.store.getSelectedSystem() || this.store.getSystems()[0];
        filename = `sld_system_${sys?.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.csv`;
        const sum = this.store.getSystemSummary(sys?.id);
        rows = [
          ['System_ID', 'System_Name', 'Total_DC_kWp', 'Inverter_AC_kW', 'DC_AC_Ratio', 'Strings_Count', 'Inverter_Model'],
          [
            sys?.id || '',
            sys?.name || '',
            String(sum.totalKwp),
            String(sum.inverterAcKw),
            String(sum.dcAcRatio),
            String(this.store.getStringCables(sys?.id).length),
            sys?.inverter.modelName || ''
          ]
        ];
        break;
      }

      case 'boq': {
        const boq = this.store.getBoqState(this.filterSystemId);
        const csvContent = exportBoqAndDupaCsv(this.store.projectName, boq);
        filename = `${this.store.projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}_BOQ_and_DUPA_${Date.now()}.csv`;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
    }

    const csvContent = rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
