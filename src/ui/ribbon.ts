import L from 'leaflet';
import { ProjectStore } from '../store/projectStore';
import { calculateRecommendedRowSpacing, calculateStringLimits } from '../geo/autofill';
import {
  DEFAULT_GROUND_CONFIG,
  DEFAULT_ROOF_CONFIG,
  GENERIC_INVERTER_PRESETS,
  STANDARD_INVERTER_CAPACITIES_KW,
  STANDARD_AC_VOLTAGES_3PHASE,
  STANDARD_AC_VOLTAGES_1PHASE,
  AcPhaseType,
  MdpTapType,
  StringTraverseDirection,
  SolarSystem
} from '../types/solar';
import { MapController } from '../map/mapController';
import { calculateGeodeticDistanceM } from '../geo/projection';
import { sizePecTransformer, getRecommendedMdpMainBreaker } from '../geo/pecWireSizing';

export type RibbonTab = 'orientation' | 'spacing' | 'obstacles' | 'module' | 'stringing' | 'ac' | 'views';

export class RibbonUI {
  private container: HTMLElement;
  private store: ProjectStore;
  private mapController?: MapController;
  private activeTab: RibbonTab = 'orientation';
  private isCollapsed: boolean = false;
  private isInteractingSlider: boolean = false;
  private onViewModeChange?: (view: 'map' | 'sld' | 'boq') => void;

  constructor(
    containerId: string,
    store: ProjectStore,
    mapController?: MapController,
    onViewModeChange?: (view: 'map' | 'sld' | 'boq') => void
  ) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Element #${containerId} not found`);
    this.container = el;
    this.store = store;
    this.mapController = mapController;
    this.onViewModeChange = onViewModeChange;

    this.store.subscribe(() => {
      // Avoid destroying DOM while user is actively scrubbing a slider
      if (!this.isInteractingSlider) {
        this.render();
      }
    });
    this.render();
  }

  public getActiveTab(): RibbonTab {
    return this.activeTab;
  }

  public setActiveTab(tab: RibbonTab): void {
    this.activeTab = tab;
    this.isCollapsed = false;
    this.render();
  }

  public toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    this.render();
  }

  private render(): void {
    // Preserve focused element ID if any text or number input is focused
    const focusedId = document.activeElement?.id;
    const selectionStart = (document.activeElement as HTMLInputElement)?.selectionStart;
    const selectionEnd = (document.activeElement as HTMLInputElement)?.selectionEnd;

    const systems = this.store.getSystems();
    const currentSystem = this.store.getSelectedSystem();
    const zone = this.store.getSelectedZone();
    const zones = this.store.getZones();
    const drawingMode = this.store.drawingMode;
    const modules = this.store.getModules();

    const currentSystemSummary = currentSystem
      ? this.store.getSystemSummary(currentSystem.id)
      : null;

    const selectedZones = this.store.getSelectedZones();
    const isMultiSelect = selectedZones.length > 1;
    const totalSelectedPanels = selectedZones.reduce((sum, z) => sum + z.activePanelCount, 0);
    const totalSelectedKwp = Number(selectedZones.reduce((sum, z) => sum + z.totalKwp, 0).toFixed(2));

    // Row 1: Ribbon Scope & Command Bar
    const scopeBarHtml = `
      <div class="ribbon-scope-bar">
        <!-- Scope Breadcrumb: System & Array Context -->
        <div class="ribbon-breadcrumb-trail">
          <!-- System Pill -->
          <div class="ribbon-scope-pill system-pill" title="Active Independent Electrical System">
            <span class="system-color-dot" style="background-color: ${currentSystem?.color || '#0284c7'}; box-shadow: 0 0 6px ${currentSystem?.color || '#0284c7'}80;"></span>
            <span class="scope-pill-label">System</span>
            <select id="ribbon-system-select" class="ribbon-scope-select" aria-label="Select Active Electrical System">
              ${systems
                .map(
                  s => `
                <option value="${s.id}" ${currentSystem?.id === s.id ? 'selected' : ''}>
                  ${s.name} (${s.zoneIds.length} ${s.zoneIds.length === 1 ? 'array' : 'arrays'} • ${s.inverter.inverterCount * s.inverter.ratedAcPowerKw}kW AC)
                </option>
              `
                )
                .join('')}
            </select>
            <button id="ribbon-btn-new-system" class="ribbon-pill-btn" title="Add new independent system">+ System</button>
            <button id="ribbon-btn-edit-system" class="ribbon-pill-btn icon-only" title="Rename active system">✏️</button>
          </div>

          <span class="ribbon-breadcrumb-arrow" aria-hidden="true">›</span>

          <!-- Array Zone Pill -->
          <div class="ribbon-scope-pill zone-pill ${isMultiSelect ? 'multi-select-active' : ''}" title="${isMultiSelect ? `${selectedZones.length} arrays selected for batch editing` : 'Selected Solar Array Zone'}">
            <span class="scope-pill-icon">${isMultiSelect ? '✨' : (zone ? (zone.config.mountType === 'ground' ? '🌱' : '🏠') : '📐')}</span>
            <span class="scope-pill-label">${isMultiSelect ? `Batch (${selectedZones.length})` : 'Array'}</span>
            ${
              zones.length > 0
                ? `
              <select id="ribbon-zone-select" class="ribbon-scope-select" aria-label="Select Array Zone">
                ${isMultiSelect ? `<option value="__batch__" selected>✨ All ${selectedZones.length} Selected Arrays</option>` : ''}
                ${zones
                  .map(
                    z => `
                  <option value="${z.id}" ${!isMultiSelect && zone?.id === z.id ? 'selected' : ''}>
                    ${this.store.isZoneSelected(z.id) ? '✓ ' : ''}${z.name} [${this.store.getSystem(z.systemId)?.name?.split(':')[0] || 'Sys'}] (${z.activePanelCount}p • ${z.totalKwp}kWp)
                  </option>
                `
                  )
                  .join('')}
              </select>
              ${
                zones.length > 1
                  ? `<button id="ribbon-btn-select-all" class="ribbon-pill-btn" title="Select all arrays for batch editing">${isMultiSelect && selectedZones.length === zones.length ? 'Clear' : `Select All (${zones.length})`}</button>`
                  : ''
              }
              <button id="ribbon-btn-zoom-array" class="ribbon-pill-btn" title="${isMultiSelect ? 'Zoom to fit all selected arrays' : 'Zoom map to fit this array'}">🎯 Fit</button>
              <button id="ribbon-delete-zone" class="ribbon-pill-btn danger icon-only" title="${isMultiSelect ? 'Delete all selected arrays' : 'Delete current array'}">🗑️</button>
            `
                : `<span class="ribbon-no-zones">No Array Plotted</span>`
            }
          </div>
        </div>

        <!-- Center: CAD Quick Drafting Action Buttons -->
        <div class="ribbon-drafting-actions">
          <button id="ribbon-btn-new-roof" class="ribbon-draft-btn ${drawingMode === 'zone' && this.store.drawingMountType === 'roof' ? 'active-pulse' : ''}" title="Draw new rooftop array into active system">
            <span class="draft-btn-icon">🏠</span>
            <span>+ Roof</span>
          </button>
          <button id="ribbon-btn-new-ground" class="ribbon-draft-btn ${drawingMode === 'zone' && this.store.drawingMountType === 'ground' ? 'active-pulse' : ''}" title="Draw new ground mount array into active system">
            <span class="draft-btn-icon">🌱</span>
            <span>+ Ground</span>
          </button>
          <button id="ribbon-btn-new-ko" class="ribbon-draft-btn ${drawingMode === 'keepout' ? 'active-pulse' : ''}" title="Draw obstacle / keep-out exclusion zone">
            <span class="draft-btn-icon">🚫</span>
            <span>+ Obstacle</span>
          </button>
          <button id="ribbon-btn-new-raceway" class="ribbon-draft-btn ${drawingMode === 'raceway' ? 'active-pulse' : ''}" title="Draw shared homerun raceway trunk">
            <span class="draft-btn-icon">🛤️</span>
            <span>+ Homerun</span>
          </button>
          <button id="ribbon-btn-new-inverter" class="ribbon-draft-btn ${drawingMode === 'inverter' ? 'active-pulse' : ''}" title="Place inverter powerhouse on map">
            <span class="draft-btn-icon">⚡</span>
            <span>+ Inverter</span>
          </button>
          <button id="ribbon-btn-new-pcc" class="ribbon-draft-btn ${drawingMode === 'ac_interconnection' ? 'active-pulse' : ''}" title="Pin AC Interconnection Point (PCC) on satellite map">
            <span class="draft-btn-icon">🏢</span>
            <span>+ PCC</span>
          </button>
          <button id="ribbon-btn-new-ac-feeder" class="ribbon-draft-btn ${drawingMode === 'ac_raceway' ? 'active-pulse' : ''}" title="Draw AC Feeder Conduit from Inverter Station to PCC">
            <span class="draft-btn-icon">⚡</span>
            <span>+ AC Feeder</span>
          </button>
        </div>

        <!-- Right: Telemetry & Collapse Control -->
        <div class="ribbon-scope-right">
          ${
            isMultiSelect
              ? `
            <div class="ribbon-live-kpi-badge batch-kpi" title="Combined metrics for ${selectedZones.length} selected arrays">
              <span class="kpi-metric highlight">✨ ${totalSelectedKwp} <small>kWp Total</small></span>
              <span class="kpi-sep">•</span>
              <span class="kpi-metric">${totalSelectedPanels} <small>Panels</small></span>
              <span class="kpi-sep">•</span>
              <span class="kpi-mount-tag">${selectedZones.length} ARRAYS</span>
            </div>
          `
              : zone
              ? `
            <div class="ribbon-live-kpi-badge" title="Active array production metrics">
              <span class="kpi-metric highlight">⚡ ${zone.totalKwp} <small>kWp</small></span>
              <span class="kpi-sep">•</span>
              <span class="kpi-metric">${zone.activePanelCount} <small>Panels</small></span>
              <span class="kpi-sep">•</span>
              <span class="kpi-mount-tag">${zone.config.mountType.toUpperCase()}</span>
            </div>
          `
              : currentSystem
              ? `
            <div class="ribbon-live-kpi-badge" title="Active system overall capacity">
              <span class="kpi-metric highlight">⚡ ${currentSystemSummary?.totalKwp || 0} <small>kWp Total</small></span>
              <span class="kpi-sep">•</span>
              <span class="kpi-metric">${currentSystemSummary?.totalActivePanels || 0} <small>Panels</small></span>
            </div>
          `
              : ''
          }

          <button id="ribbon-toggle-collapse" class="ribbon-collapse-toggle ${this.isCollapsed ? 'is-collapsed' : ''}" title="${this.isCollapsed ? 'Expand Ribbon Controls' : 'Collapse Ribbon Controls'}" aria-expanded="${!this.isCollapsed}">
            <svg class="collapse-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="${this.isCollapsed ? '6 9 12 15 18 9' : '18 15 12 9 6 15'}"></polyline>
            </svg>
            <span class="collapse-text">${this.isCollapsed ? 'Expand' : 'Collapse'}</span>
          </button>
        </div>
      </div>
    `;

    // Collapsed Mode: Slim bar with quick-jump tab buttons
    if (this.isCollapsed) {
      const collapsedTabsHtml = `
        <div class="ribbon-collapsed-strip">
          <div class="collapsed-quick-nav" role="tablist" aria-label="Quick Switch Tabs">
            <button class="ribbon-tab-pill ${this.activeTab === 'orientation' ? 'active' : ''}" data-tab="orientation" ${!zone ? 'disabled' : ''}>
              <span>📐</span> Orientation (${zone ? zone.config.tiltDeg + '°' : '-'})
            </button>
            <button class="ribbon-tab-pill ${this.activeTab === 'spacing' ? 'active' : ''}" data-tab="spacing" ${!zone ? 'disabled' : ''}>
              <span>📏</span> Spacing (${zone ? zone.config.rowSpacingM.toFixed(2) + 'm' : '-'})
            </button>
            <button class="ribbon-tab-pill ${this.activeTab === 'obstacles' ? 'active' : ''}" data-tab="obstacles" ${!zone ? 'disabled' : ''}>
              <span>🚫</span> Keep-Outs ${zone && zone.keepOuts.length > 0 ? `(${zone.keepOuts.length})` : ''}
            </button>
            <button class="ribbon-tab-pill ${this.activeTab === 'module' ? 'active' : ''}" data-tab="module" ${!zone ? 'disabled' : ''}>
              <span>⚡</span> Module (${zone ? zone.config.electrical.nominalPowerW + 'W' : '-'})
            </button>
            <button class="ribbon-tab-pill ${this.activeTab === 'stringing' ? 'active' : ''}" data-tab="stringing" ${!zone ? 'disabled' : ''}>
              <span>🔌</span> Stringing & Inverters
            </button>
            <button class="ribbon-tab-pill ${this.activeTab === 'ac' ? 'active' : ''}" data-tab="ac" title="AC Interconnection, Transformers & MDP">
              <span>⚡</span> AC System (${currentSystem ? (currentSystem.systemVoltageV || 400) + 'V' : '-'})
            </button>
            <button class="ribbon-tab-pill ${this.activeTab === 'views' ? 'active' : ''}" data-tab="views" title="Map View Visibility Filters & Presets">
              <span>👁️</span> Views (${this.getActivePresetLabel()})
            </button>
          </div>
          <span class="ribbon-collapsed-hint">Click any section or Expand to inspect parameters</span>
        </div>
      `;

      this.container.innerHTML = scopeBarHtml + collapsedTabsHtml;
      this.attachEventListeners(zone?.id);
      return;
    }

    // Row 2: Ribbon Navigation Tabs
    const tabsStripHtml = `
      <div class="ribbon-tabs-strip" role="tablist" aria-label="Array Configuration Toolsets">
        <button class="ribbon-tab-item ${this.activeTab === 'orientation' ? 'active' : ''}" data-tab="orientation" role="tab" aria-selected="${this.activeTab === 'orientation'}">
          <span class="tab-icon">📐</span>
          <span class="tab-title">Array & Orientation</span>
        </button>
        <button class="ribbon-tab-item ${this.activeTab === 'spacing' ? 'active' : ''}" data-tab="spacing" role="tab" aria-selected="${this.activeTab === 'spacing'}" ${!zone ? 'disabled' : ''}>
          <span class="tab-icon">📏</span>
          <span class="tab-title">Spacing & Setbacks</span>
        </button>
        <button class="ribbon-tab-item ${this.activeTab === 'obstacles' ? 'active' : ''}" data-tab="obstacles" role="tab" aria-selected="${this.activeTab === 'obstacles'}" ${!zone ? 'disabled' : ''}>
          <span class="tab-icon">🚫</span>
          <span class="tab-title">Keep-Outs</span>
          ${zone && zone.keepOuts.length > 0 ? `<span class="tab-counter-badge">${zone.keepOuts.length}</span>` : ''}
        </button>
        <button class="ribbon-tab-item ${this.activeTab === 'module' ? 'active' : ''}" data-tab="module" role="tab" aria-selected="${this.activeTab === 'module'}" ${!zone ? 'disabled' : ''}>
          <span class="tab-icon">⚡</span>
          <span class="tab-title">Module Specs</span>
          ${zone ? `<span class="tab-subtext-badge">${zone.config.electrical.nominalPowerW}W</span>` : ''}
        </button>
        <button class="ribbon-tab-item ${this.activeTab === 'stringing' ? 'active' : ''}" data-tab="stringing" role="tab" aria-selected="${this.activeTab === 'stringing'}" ${!zone && zones.length === 0 ? 'disabled' : ''}>
          <span class="tab-icon">🔌</span>
          <span class="tab-title">Stringing & Inverters</span>
          ${currentSystem ? `<span class="tab-subtext-badge">DC/AC ${currentSystemSummary?.dcAcRatio || '1.0'}</span>` : ''}
        </button>
        <button class="ribbon-tab-item ${this.activeTab === 'ac' ? 'active' : ''}" data-tab="ac" role="tab" aria-selected="${this.activeTab === 'ac'}" title="Configure System Tapping Voltage, Auto-Transformers, AC Combiner, and Main Distribution Panel">
          <span class="tab-icon">⚡</span>
          <span class="tab-title">AC System & Grid</span>
          ${currentSystem ? `<span class="tab-subtext-badge">${currentSystem.systemVoltageV || 400}V • ${currentSystem.mdpTapType === 'line_side' ? 'Line' : 'Load'}</span>` : ''}
        </button>
        <button class="ribbon-tab-item ${this.activeTab === 'views' ? 'active' : ''}" data-tab="views" role="tab" aria-selected="${this.activeTab === 'views'}" title="Configure what map elements are visible with quick presets">
          <span class="tab-icon">👁️</span>
          <span class="tab-title">Views & Filters</span>
          <span class="tab-subtext-badge">${this.getActivePresetLabel()}</span>
        </button>
      </div>
    `;

    // Row 3: Ribbon Tool Pod Panel
    let contentHtml = '';
    let batchBannerHtml = '';

    if (this.activeTab === 'views') {
      contentHtml = this.renderViewsTab();
    } else if (this.activeTab === 'ac') {
      contentHtml = this.renderAcTab(currentSystem);
    } else if (!zone) {
      contentHtml = `
        <div class="ribbon-empty-deck" role="region" aria-label="CAD Workspace Starter">
          <div class="empty-deck-icon">📐</div>
          <div class="empty-deck-text">
            <h4 class="empty-deck-title">No Array Selected</h4>
            <p class="empty-deck-desc">Select an array polygon from the satellite map or draft a new layout for <strong>${currentSystem?.name || 'Main System'}</strong> (${currentSystemSummary?.totalKwp || 0} kWp):</p>
          </div>
          <div class="empty-deck-actions">
            <button id="ribbon-empty-roof" class="btn btn-sm btn-primary">
              <span>🏠</span> Draw Roof Array
            </button>
            <button id="ribbon-empty-ground" class="btn btn-sm btn-secondary">
              <span>🌱</span> Draw Ground Mount
            </button>
          </div>
          <div class="empty-deck-tips">
            <span>💡 <strong>Tip:</strong> Draw perimeter polygon points on satellite view, double-click to finish.</span>
          </div>
        </div>
      `;
    } else {
      const cfg = zone.config;
      const zoneSystem = this.store.getSystem(zone.systemId);
      const currentTraverseDir = (zone.config.stringTraverseDirection) || this.store.getStringTraverseDirection(zone.id) || 'short_side';

      batchBannerHtml = isMultiSelect
        ? `
        <div class="ribbon-batch-banner">
          <span class="batch-badge">BATCH EDIT ACTIVE</span>
          <span>Adjusting setback, spacing, tilt, or layout below updates all <strong>${selectedZones.length} selected arrays</strong> simultaneously (${totalSelectedPanels} panels &bull; ${totalSelectedKwp} kWp).</span>
          <button id="ribbon-btn-batch-opt" class="btn-xs btn-primary">⚡ Optimize All (${selectedZones.length})</button>
          <button id="ribbon-btn-batch-clear" class="btn-xs btn-outline">✕ Exit Batch</button>
        </div>
      `
        : '';
      const currentModule = this.store.getModule(zone.moduleId);

      switch (this.activeTab) {
        case 'orientation': {
          const footprintM = (
            cfg.orientation === 'portrait'
              ? (cfg.panelLengthMm / 1000) * Math.cos((cfg.tiltDeg * Math.PI) / 180)
              : (cfg.panelWidthMm / 1000) * Math.cos((cfg.tiltDeg * Math.PI) / 180)
          ).toFixed(2);

          contentHtml = `
            <div class="ribbon-panel" role="tabpanel" aria-label="Array and Orientation Settings">
              <!-- Pod 1: Array Identity, Mount Type & Elevation Riser -->
              <div class="cad-pod wide">
                <div class="cad-pod-header">
                  <span class="cad-pod-title">ARRAY IDENTITY</span>
                  <span class="cad-pod-tag ${zone.config.mountType === 'ground' ? 'highlight' : 'accent'}">${zone.config.mountType.toUpperCase()}</span>
                </div>
                <div class="cad-pod-body">
                  <div class="cad-field-row">
                    <input type="text" id="ribbon-zone-name" class="cad-text-input ribbon-input-name" value="${zone.name}" title="Edit Array Zone Name" aria-label="Array Name" />
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
                          🔗 ${s.name}
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
                    <span class="cad-hint-text">Module: <strong>${currentModule ? currentModule.name.split(' ')[0] : 'Standard'}</strong></span>
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
          break;
        }

        case 'spacing': {
          const isGround = cfg.mountType === 'ground';
          const tableUp = cfg.modulesPerTableUp || 2;
          const tableWide = cfg.modulesPerTableWide || 14;
          const tableTotal = tableUp * tableWide;
          const tableGap = cfg.tableSpacingM ?? 1.0;

          contentHtml = `
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
          break;
        }

        case 'obstacles': {
          const isDrawingKo = drawingMode === 'keepout';
          contentHtml = `
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
                            <span class="obstacle-name">${ko.name}</span>
                            <button class="btn-ribbon-remove-ko" data-ko-id="${ko.id}" title="Delete this obstacle" aria-label="Remove obstacle ${ko.name}">✕</button>
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
          break;
        }

        case 'module': {
          contentHtml = `
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
                          ${m.name} (${m.nominalPowerW}W, ${m.widthMm}×${m.lengthMm}mm)
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
                  <span class="cad-hint-text">Manufacturer: <strong>${currentModule?.manufacturer || 'Generic'}</strong> (${currentModule?.bifacial ? 'Bifacial' : 'Monofacial'})</span>
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
          break;
        }

        case 'stringing': {
          const activeSystem = currentSystem || zoneSystem || this.store.getSystems()[0];
          const inv = activeSystem?.inverter || GENERIC_INVERTER_PRESETS[0];
          const mod = currentModule || this.store.getModules()[0];
          const limits = calculateStringLimits(mod, inv);
          const activeSystemId = activeSystem?.id || zone.systemId;
          const sysSummary = this.store.getSystemSummary(activeSystemId);
          const cableSummary = this.store.getSystemCableSummary(activeSystemId);
          const isDrawingInv = this.store.drawingMode === 'inverter';
          const isDrawingRaceway = this.store.drawingMode === 'raceway';

          const activeHomerun = (zone && this.store.getHomerunForZone(zone.id)) || activeSystem?.homerunRaceway;
          let homerunPathLen = 0;
          if (activeHomerun && activeHomerun.path && activeHomerun.path.length >= 2) {
            for (let i = 0; i < activeHomerun.path.length - 1; i++) {
              homerunPathLen += calculateGeodeticDistanceM(activeHomerun.path[i], activeHomerun.path[i + 1]);
            }
          }

          contentHtml = `
            <div class="ribbon-panel" role="tabpanel" aria-label="Inverter Sizing and String Cabling">
              <!-- Pod 1: Inverter Specifications -->
              <div class="cad-pod">
                <div class="cad-pod-header">
                  <span class="cad-pod-title">INVERTER STATION SPECS</span>
                  <span class="cad-pod-tag accent">${inv.inverterCount}×${inv.ratedAcPowerKw} kW (${(inv.phase || 'three_phase') === 'three_phase' ? '3Φ' : '1Φ'} ${inv.acVoltage || ((inv.phase || 'three_phase') === 'single_phase' ? 230 : 400)}V)</span>
                </div>
                <div class="cad-pod-body">
                  <div class="cad-field-row" style="display: flex; gap: 8px;">
                    <div class="cad-input-unit-wrap" style="flex: 1.2;" title="Choose standard inverter capacity rating (e.g. 6 kW, 30 kW, 100 kW)">
                      <span class="cad-unit-prefix">Rating</span>
                      <select id="ribbon-inv-capacity-select" class="cad-select-sm" aria-label="Inverter Capacity Rating">
                        ${STANDARD_INVERTER_CAPACITIES_KW.map(kw => `<option value="${kw}" ${kw === inv.ratedAcPowerKw ? 'selected' : ''}>${kw} kW</option>`).join('')}
                        <option value="custom" ${!STANDARD_INVERTER_CAPACITIES_KW.includes(inv.ratedAcPowerKw) ? 'selected' : ''}>Custom (${inv.ratedAcPowerKw} kW)</option>
                      </select>
                    </div>
                    <div style="flex: 1.8;">
                      <select id="ribbon-inverter-preset-select" class="cad-select-sm" title="Load generic commercial inverter preset" aria-label="Inverter Model Preset">
                        ${GENERIC_INVERTER_PRESETS.map(p => {
                          const isSelected = p.id === inv.id || p.modelName === inv.modelName || (p.ratedAcPowerKw === inv.ratedAcPowerKw && p.mpptCountPerInverter === inv.mpptCountPerInverter);
                          return `<option value="${p.id}" ${isSelected ? 'selected' : ''}>${p.modelName}</option>`;
                        }).join('')}
                      </select>
                    </div>
                  </div>
                  <div class="cad-control-row compact-gap">
                    <div class="cad-input-unit-wrap sm" title="Number of Inverter Units">
                      <span class="cad-unit-prefix">Qty</span>
                      <input type="number" id="ribbon-inv-count" class="cad-num-input" min="1" max="20" value="${inv.inverterCount}" aria-label="Inverter Units Count" />
                    </div>
                    <div class="cad-input-unit-wrap sm" title="Rated AC Power per Inverter in kW">
                      <span class="cad-unit-prefix">kW</span>
                      <input type="number" id="ribbon-inv-kw" class="cad-num-input" value="${inv.ratedAcPowerKw}" aria-label="Rated AC Power" />
                    </div>
                    <div class="cad-input-unit-wrap sm" title="MPPT Trackers per Inverter">
                      <span class="cad-unit-prefix">MPPT</span>
                      <input type="number" id="ribbon-inv-mppt" class="cad-num-input" min="1" max="24" value="${inv.mpptCountPerInverter}" aria-label="MPPT Count" />
                    </div>
                    <div class="cad-input-unit-wrap sm" title="Max Strings per MPPT">
                      <span class="cad-unit-prefix">Str/Trk</span>
                      <input type="number" id="ribbon-inv-str-mppt" class="cad-num-input" min="1" max="4" value="${inv.maxStringsPerMppt}" aria-label="Strings per MPPT" />
                    </div>
                    <div class="cad-input-unit-wrap sm" title="Max Input DC Voltage">
                      <span class="cad-unit-prefix">Vmax</span>
                      <input type="number" id="ribbon-inv-vmax" class="cad-num-input" value="${inv.maxDcVoltage}" aria-label="Max DC Voltage" />
                    </div>
                  </div>

                  <!-- AC Side Output Configuration: Phase, Voltage, Frequency -->
                  <div class="cad-control-row compact-gap" style="margin-top: 5px;">
                    <div class="cad-input-unit-wrap sm" style="flex: 1.1;" title="Inverter AC Output Phase Configuration">
                      <span class="cad-unit-prefix">Phase</span>
                      <select id="ribbon-inv-phase" class="cad-select-sm" aria-label="Inverter AC Phase">
                        <option value="three_phase" ${(inv.phase || 'three_phase') === 'three_phase' ? 'selected' : ''}>3Φ Three-Phase</option>
                        <option value="single_phase" ${(inv.phase || 'three_phase') === 'single_phase' ? 'selected' : ''}>1Φ Single-Phase</option>
                      </select>
                    </div>
                    <div class="cad-input-unit-wrap sm" style="flex: 1.1;" title="Inverter AC Output Line Voltage">
                      <span class="cad-unit-prefix">VAC</span>
                      <select id="ribbon-inv-ac-voltage-preset" class="cad-select-sm" aria-label="Inverter AC Voltage">
                        ${((inv.phase || 'three_phase') === 'single_phase' ? STANDARD_AC_VOLTAGES_1PHASE : STANDARD_AC_VOLTAGES_3PHASE).map((v: number) => `
                          <option value="${v}" ${(inv.acVoltage || ((inv.phase || 'three_phase') === 'single_phase' ? 230 : 400)) === v ? 'selected' : ''}>${v} V</option>
                        `).join('')}
                        <option value="custom" ${!STANDARD_AC_VOLTAGES_3PHASE.concat(STANDARD_AC_VOLTAGES_1PHASE).includes(inv.acVoltage || 400) ? 'selected' : ''}>Custom (${inv.acVoltage || 400}V)</option>
                      </select>
                    </div>
                    <div class="cad-input-unit-wrap sm" style="width: 76px;" title="Grid Frequency (Hz)">
                      <span class="cad-unit-prefix">Freq</span>
                      <select id="ribbon-inv-freq" class="cad-select-sm" aria-label="AC Frequency">
                        <option value="50" ${(inv.gridFrequencyHz || 50) === 50 ? 'selected' : ''}>50Hz</option>
                        <option value="60" ${(inv.gridFrequencyHz || 50) === 60 ? 'selected' : ''}>60Hz</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div class="cad-pod-footer">
                  <span class="cad-hint-text">Total System Inverter Capacity: <strong>${sysSummary.inverterAcKw} kW AC</strong></span>
                </div>
              </div>

              <!-- Pod 2: Electrical Matching Analysis -->
              <div class="cad-pod">
                <div class="cad-pod-header">
                  <span class="cad-pod-title">ELECTRICAL MATCHING</span>
                  <span class="cad-val-chip highlight">DC/AC ${sysSummary.dcAcRatio}</span>
                </div>
                <div class="cad-pod-body">
                  <div class="cad-kpi-chips-column">
                    <div class="cad-telemetry-chip highlight">
                      <span class="chip-label">Optimal String Size:</span>
                      <span class="chip-val"><strong>${limits.optimalPanelsPerString}</strong> mod/string</span>
                    </div>
                    <div class="cad-telemetry-chip">
                      <span class="chip-label">Permitted Window:</span>
                      <span class="chip-val">${limits.minPanelsPerString} – ${limits.maxPanelsPerString} mod/str</span>
                    </div>
                  </div>
                </div>
                <div class="cad-pod-footer">
                  <span class="cad-hint-text">${sysSummary.totalKwp} kWp DC on ${sysSummary.inverterAcKw} kW AC</span>
                </div>
              </div>

              <!-- Pod 3: Inverter Power House Geolocation -->
              <div class="cad-pod">
                <div class="cad-pod-header">
                  <span class="cad-pod-title">📍 INVERTER POWER HOUSE</span>
                  <span class="cad-pod-tag ${activeSystem?.inverterLocation ? 'accent' : 'warning'}">${activeSystem?.inverterLocation ? 'LOCATED' : 'NOT SET'}</span>
                </div>
                <div class="cad-pod-body">
                  <div class="cad-field-row">
                    <button id="ribbon-btn-place-inverter" class="btn btn-xs ${isDrawingInv ? 'btn-primary active-pulse' : 'btn-outline warning'}" title="Click to geolocationally place the Inverter Power House on the satellite map">
                      ${isDrawingInv ? '🎯 Click Map to Place...' : '📍 Place Station'}
                    </button>
                    ${
                      activeSystem?.inverterLocation
                        ? `
                      <button id="ribbon-btn-fly-inverter" class="btn btn-xs btn-outline" title="Zoom map to inverter power house">🎯</button>
                      <button id="ribbon-btn-clear-inverter" class="btn-icon xs danger" title="Clear inverter station point">✕</button>
                    `
                        : ''
                    }
                  </div>
                  <div class="cad-field-row">
                    <div class="cad-input-unit-wrap full" title="Ground elevation of Inverter Station in meters">
                      <span class="cad-unit-prefix">Elevation</span>
                      <input type="number" id="ribbon-inv-elevation" class="cad-num-input" value="${activeSystem?.inverterElevationM ?? 0}" step="0.5" aria-label="Inverter Elevation in Meters" />
                      <span class="cad-unit-addon">m</span>
                    </div>
                  </div>
                </div>
                <div class="cad-pod-footer">
                  <span class="cad-hint-text">${activeSystem?.inverterLocation ? `${activeSystem.inverterLocation.lat.toFixed(5)}, ${activeSystem.inverterLocation.lng.toFixed(5)}` : 'Homerun cables estimate direct run'}</span>
                </div>
              </div>

              <!-- Pod 4: Shared Homerun Raceway / Conduit Trunk -->
              <div class="cad-pod">
                <div class="cad-pod-header">
                  <span class="cad-pod-title">🛤️ HOMERUN RACEWAY</span>
                  <span class="cad-pod-tag ${activeHomerun ? 'highlight' : ''}">${activeHomerun ? `${homerunPathLen.toFixed(1)}m` : 'DIRECT'}</span>
                </div>
                <div class="cad-pod-body">
                  <div class="cad-field-row">
                    <button id="ribbon-btn-draw-raceway" class="btn btn-xs ${isDrawingRaceway ? 'btn-primary active-pulse' : 'btn-outline warning'}" title="Draw homerun conduit/cable tray polyline independent of arrays - all arrays auto-connect!">
                      ${isDrawingRaceway ? '✅ Finish Homerun' : activeHomerun ? '✏️ Redraw Homerun' : '🛤️ Draw Homerun'}
                    </button>
                    ${
                      activeHomerun
                        ? `
                      <button id="ribbon-btn-zoom-raceway" class="btn btn-xs btn-outline" title="Zoom to homerun path on map">🎯 View</button>
                      <button id="ribbon-btn-clear-raceway" class="btn-icon xs danger" title="Clear homerun raceway">✕</button>
                    `
                        : ''
                    }
                  </div>
                  <div class="cad-field-row">
                    <div class="cad-input-unit-wrap full" title="Elevation drop or riser change along this homerun run in meters">
                      <span class="cad-unit-prefix">&Delta;h Riser</span>
                      <input type="number" id="ribbon-raceway-elev" class="cad-num-input" value="${activeHomerun ? activeHomerun.elevationChangeM : (zone?.elevationDeltaM ?? 0)}" step="0.5" aria-label="Raceway Elevation Change in Meters" />
                      <span class="cad-unit-addon">m</span>
                    </div>
                  </div>
                </div>
                <div class="cad-pod-footer">
                  <span class="cad-hint-text">${activeHomerun ? `⚡ Auto-connected: ${activeHomerun.path.length} nodes recorded` : 'Independent homerun trunk'}</span>
                </div>
              </div>

              <!-- Pod 5: DC Cabling Telemetry HUD -->
              <div class="cad-pod wide">
                <div class="cad-pod-header">
                  <span class="cad-pod-title">🔌 DC CABLE TELEMETRY</span>
                  <span class="cad-val-chip highlight">${cableSummary.totalCableLengthM} m TOTAL</span>
                </div>
                <div class="cad-pod-body">
                  <div class="cad-telemetry-hud-grid">
                    <div class="hud-item highlight" title="Combined length of (+/-) homerun leads connecting strings to inverter">
                      <span class="hud-label">Homeruns (+/-)</span>
                      <span class="hud-val">${cableSummary.totalHomerunM} <small>m</small></span>
                    </div>
                    <div class="hud-item" title="Module-to-module interconnections inside string rows">
                      <span class="hud-label">Intra-String</span>
                      <span class="hud-val">${cableSummary.totalIntraStringM} <small>m</small></span>
                    </div>
                    <div class="hud-item" title="Vertical riser / roof-to-ground drops">
                      <span class="hud-label">Riser Drops</span>
                      <span class="hud-val">${cableSummary.totalElevationRiserM} <small>m</small></span>
                    </div>
                    <div class="hud-item" title="Average wire run per formed string">
                      <span class="hud-label">Avg / String</span>
                      <span class="hud-val">${cableSummary.avgStringCableLengthM} <small>m</small></span>
                    </div>
                  </div>
                </div>
                <div class="cad-pod-footer">
                  <span class="cad-hint-text">Geodetically calculated along raceways and array rows</span>
                </div>
              </div>

              <!-- Pod 6: Auto-Stringing Automation -->
              <div class="cad-pod">
                <div class="cad-pod-header">
                  <span class="cad-pod-title">AUTO-STRINGING</span>
                  <span class="cad-pod-tag highlight">Automation</span>
                </div>
                <div class="cad-pod-body">
                  <div class="cad-field-row">
                    <div class="cad-input-unit-wrap sm" title="Target modules per series string">
                      <span class="cad-unit-prefix">Panels</span>
                      <input type="number" id="ribbon-str-target-size" class="cad-num-input" value="${limits.optimalPanelsPerString}" min="${limits.minPanelsPerString}" max="${limits.maxPanelsPerString}" aria-label="Target Modules per String" />
                      <span class="cad-unit-addon">/str</span>
                    </div>
                    <button id="ribbon-btn-auto-string-inverter" class="btn btn-sm btn-primary highlight" title="Automatically cluster panels into optimal strings and route to inverter MPPTs">
                      ⚡ Auto-String
                    </button>
                  </div>
                  <div class="cad-field-row" style="margin-top: 4px;">
                    <select id="ribbon-str-direction" class="cad-select-sm" title="Direction to traverse modules when forming strings" aria-label="String Traverse Direction">
                      <option value="short_side" ${currentTraverseDir === 'short_side' ? 'selected' : ''}>↕ Traverse: Short Side (Default)</option>
                      <option value="long_side" ${currentTraverseDir === 'long_side' ? 'selected' : ''}>↔ Traverse: Long Side</option>
                      <option value="rows" ${currentTraverseDir === 'rows' ? 'selected' : ''}>↔ Follow Rows (Horizontal)</option>
                      <option value="columns" ${currentTraverseDir === 'columns' ? 'selected' : ''}>↕ Follow Columns (Vertical)</option>
                    </select>
                  </div>
                </div>
                <div class="cad-pod-footer">
                  <button id="ribbon-btn-open-reg" class="btn btn-xs btn-outline full" title="Open complete table registry of solar panel objects">
                    📋 Open Object Registry
                  </button>
                </div>
              </div>
            </div>
          `;
          break;
        }
      }
    }

    this.container.innerHTML = scopeBarHtml + tabsStripHtml + batchBannerHtml + contentHtml;
    this.attachEventListeners(zone?.id);
    this.attachTabKeyNav();

    // Restore focus if an input was being typed in
    if (focusedId) {
      const el = document.getElementById(focusedId) as HTMLInputElement;
      if (el) {
        el.focus();
        if (selectionStart !== null && selectionEnd !== null && el.setSelectionRange) {
          try {
            el.setSelectionRange(selectionStart, selectionEnd);
          } catch (_) {}
        }
      }
    }
  }

  private getCompassHeading(deg: number): string {
    const d = ((deg % 360) + 360) % 360;
    if (d >= 337.5 || d < 22.5) return 'N';
    if (d >= 22.5 && d < 67.5) return 'NE';
    if (d >= 67.5 && d < 112.5) return 'E';
    if (d >= 112.5 && d < 157.5) return 'SE';
    if (d >= 157.5 && d < 202.5) return 'S';
    if (d >= 202.5 && d < 247.5) return 'SW';
    if (d >= 247.5 && d < 292.5) return 'W';
    return 'NW';
  }

  /**
   * Renders a 2D cross-section SVG displaying the inclined solar panel face,
   * high ridge, low eave, and a downward slope arrow pointing in the direction of gravity runoff.
   */
  private renderTiltCrossSectionSvg(
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

  private attachTabKeyNav(): void {
    const tabs = Array.from(this.container.querySelectorAll<HTMLButtonElement>('.ribbon-tab-item:not(:disabled)'));
    tabs.forEach((tab, index) => {
      tab.addEventListener('keydown', (e: KeyboardEvent) => {
        let targetIndex: number | null = null;
        if (e.key === 'ArrowRight') {
          targetIndex = (index + 1) % tabs.length;
        } else if (e.key === 'ArrowLeft') {
          targetIndex = (index - 1 + tabs.length) % tabs.length;
        } else if (e.key === 'Home') {
          targetIndex = 0;
        } else if (e.key === 'End') {
          targetIndex = tabs.length - 1;
        }
        if (targetIndex !== null) {
          e.preventDefault();
          tabs[targetIndex].focus();
          tabs[targetIndex].click();
        }
      });
    });
  }

  private attachEventListeners(zoneId?: string): void {
    const sysSelect = document.getElementById('ribbon-system-select') as HTMLSelectElement;
    sysSelect?.addEventListener('change', () => {
      this.store.selectSystem(sysSelect.value);
    });

    document.getElementById('ribbon-btn-new-system')?.addEventListener('click', () => {
      const name = prompt('Enter a name for the new independent system (e.g., Inverter 2 / Carport System):');
      if (name && name.trim()) {
        this.store.addSystem(name.trim());
      }
    });

    document.getElementById('ribbon-btn-edit-system')?.addEventListener('click', () => {
      const curSys = this.store.getSelectedSystem();
      if (!curSys) return;
      const newName = prompt('Rename system:', curSys.name);
      if (newName && newName.trim()) {
        this.store.updateSystem(curSys.id, { name: newName.trim() });
      }
    });

    const zoneSelect = document.getElementById('ribbon-zone-select') as HTMLSelectElement;
    zoneSelect?.addEventListener('change', () => {
      if (zoneSelect.value === '__batch__') return;
      this.store.selectZone(zoneSelect.value, false);
      this.mapController?.zoomToZone(zoneSelect.value);
    });

    document.getElementById('ribbon-btn-select-all')?.addEventListener('click', () => {
      const allZones = this.store.getZones();
      const selZones = this.store.getSelectedZones();
      if (selZones.length === allZones.length) {
        this.store.clearZoneSelection();
      } else {
        this.store.selectAllZones();
      }
    });

    document.getElementById('ribbon-btn-batch-opt')?.addEventListener('click', () => {
      const res = this.store.optimizeSelectedZonesGridShift(12);
      const diff = res.totalMaxPanels - res.totalPreviousPanels;
      let msg = `🎉 Batch Grid Shift Optimized & Auto-Strung!\nOptimized ${res.optimizedCount} Selected Arrays\nTotal Fitted Panels: ${res.totalMaxPanels} (${diff >= 0 ? `+${diff}` : diff} panels)`;
      if (res.totalStrings !== undefined) {
        msg += `\n⚡ Auto-Strung into ${res.totalStrings} Strings!`;
      }
      if (res.warnings && res.warnings.length > 0) {
        msg += `\n\n⚠️ Notices:\n` + res.warnings.join('\n');
      }
      alert(msg);
    });

    document.getElementById('ribbon-btn-batch-clear')?.addEventListener('click', () => {
      this.store.clearZoneSelection();
    });

    document.getElementById('ribbon-btn-zoom-array')?.addEventListener('click', () => {
      const selZones = this.store.getSelectedZones();
      if (selZones.length === 1) {
        this.mapController?.zoomToZone(selZones[0].id);
      } else if (selZones.length > 1 && this.mapController) {
        const map = this.mapController.getMap();
        const allPoints: [number, number][] = [];
        for (const z of selZones) {
          for (const v of z.vertices) {
            allPoints.push([v.lat, v.lng]);
          }
        }
        if (allPoints.length > 0) {
          map.flyToBounds(L.latLngBounds(allPoints), { padding: [60, 60], maxZoom: 21, duration: 1.0 });
        }
      }
    });

    document.getElementById('ribbon-tab1-btn-zoom-array')?.addEventListener('click', () => {
      if (zoneId) {
        this.mapController?.zoomToZone(zoneId);
      }
    });

    document.getElementById('ribbon-tab1-btn-delete-array')?.addEventListener('click', () => {
      if (zoneId) {
        const zone = this.store.getZone(zoneId);
        if (confirm(`Delete array "${zone?.name || 'Array'}" and its modules from project?`)) {
          this.store.removeZone(zoneId);
        }
      }
    });

    const linkSysSelect = document.getElementById('ribbon-link-system-select') as HTMLSelectElement;
    linkSysSelect?.addEventListener('change', () => {
      if (zoneId && linkSysSelect.value) {
        this.store.linkZoneToSystem(zoneId, linkSysSelect.value);
      }
    });

    document.getElementById('ribbon-btn-new-roof')?.addEventListener('click', () => {
      const isDrawingRoof = this.store.drawingMode === 'zone' && this.store.drawingMountType === 'roof';
      this.store.setDrawingMode(isDrawingRoof ? 'none' : 'zone', 'roof');
    });
    document.getElementById('ribbon-btn-new-ground')?.addEventListener('click', () => {
      const isDrawingGround = this.store.drawingMode === 'zone' && this.store.drawingMountType === 'ground';
      this.store.setDrawingMode(isDrawingGround ? 'none' : 'zone', 'ground');
    });
    document.getElementById('ribbon-btn-new-ko')?.addEventListener('click', () => {
      const isDrawingKo = this.store.drawingMode === 'keepout';
      this.store.setDrawingMode(isDrawingKo ? 'none' : 'keepout');
    });
    document.getElementById('ribbon-btn-new-raceway')?.addEventListener('click', () => {
      if (this.store.drawingMode === 'raceway') {
        this.mapController?.finishDrawing();
      } else {
        this.store.setDrawingMode('raceway');
      }
    });
    document.getElementById('ribbon-btn-new-inverter')?.addEventListener('click', () => {
      const isPlacingInv = this.store.drawingMode === 'inverter';
      this.store.setDrawingMode(isPlacingInv ? 'none' : 'inverter');
    });
    document.getElementById('ribbon-btn-new-pcc')?.addEventListener('click', () => {
      const isPlacingPcc = this.store.drawingMode === 'ac_interconnection';
      this.store.setDrawingMode(isPlacingPcc ? 'none' : 'ac_interconnection');
    });
    document.getElementById('ribbon-btn-new-ac-feeder')?.addEventListener('click', () => {
      if (this.store.drawingMode === 'ac_raceway') {
        this.mapController?.finishDrawing();
      } else {
        this.store.setDrawingMode('ac_raceway');
      }
    });

    document.getElementById('ribbon-empty-roof')?.addEventListener('click', () => {
      this.store.setDrawingMode('zone', 'roof');
    });
    document.getElementById('ribbon-empty-ground')?.addEventListener('click', () => {
      this.store.setDrawingMode('zone', 'ground');
    });

    document.getElementById('ribbon-toggle-collapse')?.addEventListener('click', () => {
      this.toggleCollapse();
    });

    this.container.querySelectorAll('.ribbon-tab-item, .ribbon-tab-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') as RibbonTab;
        if (tab) this.setActiveTab(tab);
      });
    });

    document.getElementById('ribbon-btn-open-full-sld')?.addEventListener('click', () => {
      this.onViewModeChange?.('sld');
    });

    document.getElementById('ribbon-btn-open-modal-sld')?.addEventListener('click', () => {
      const btnOpenTables = document.getElementById('btn-open-tables');
      btnOpenTables?.click();
    });

    document.getElementById('ribbon-btn-return-map')?.addEventListener('click', () => {
      this.setActiveTab('orientation');
      this.onViewModeChange?.('map');
    });

    // --- Views Tab Listeners (Global workspace view filters) ---
    this.container.querySelectorAll<HTMLButtonElement>('[data-view-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-view-preset') as any;
        if (preset) {
          this.store.applyViewPreset(preset);
        }
      });
    });

    const chkPanels = document.getElementById('chk-view-panels') as HTMLInputElement;
    chkPanels?.addEventListener('change', () => {
      this.store.setViewFilter({
        panelVisibility: chkPanels.checked ? 'full' : 'hidden'
      });
    });

    const selPanelMode = document.getElementById('view-panel-mode') as HTMLSelectElement;
    selPanelMode?.addEventListener('change', () => {
      this.store.setViewFilter({
        panelVisibility: selPanelMode.value as any
      });
    });

    const chkTables = document.getElementById('chk-view-tables') as HTMLInputElement;
    chkTables?.addEventListener('change', () => {
      this.store.setViewFilter({ showMountTables: chkTables.checked });
    });

    const chkRoofRails = document.getElementById('chk-view-roof-rails') as HTMLInputElement;
    chkRoofRails?.addEventListener('change', () => {
      this.store.setViewFilter({ showRoofRails: chkRoofRails.checked });
    });

    const chkArrayFill = document.getElementById('chk-view-array-fill') as HTMLInputElement;
    chkArrayFill?.addEventListener('change', () => {
      this.store.setViewFilter({ showArrayFill: chkArrayFill.checked });
    });

    const chkKeepouts = document.getElementById('chk-view-keepouts') as HTMLInputElement;
    chkKeepouts?.addEventListener('change', () => {
      this.store.setViewFilter({ showKeepOuts: chkKeepouts.checked });
    });

    const chkStrings = document.getElementById('chk-view-strings') as HTMLInputElement;
    chkStrings?.addEventListener('change', () => {
      this.store.setViewFilter({ showStringLines: chkStrings.checked });
    });

    const chkHomeruns = document.getElementById('chk-view-homeruns') as HTMLInputElement;
    chkHomeruns?.addEventListener('change', () => {
      this.store.setViewFilter({ showHomerunLines: chkHomeruns.checked });
    });

    const chkRaceways = document.getElementById('chk-view-raceways') as HTMLInputElement;
    chkRaceways?.addEventListener('change', () => {
      this.store.setViewFilter({ showRaceways: chkRaceways.checked });
    });

    const chkInverters = document.getElementById('chk-view-inverters') as HTMLInputElement;
    chkInverters?.addEventListener('change', () => {
      this.store.setViewFilter({ showInverters: chkInverters.checked });
    });

    const chkTiltArrows = document.getElementById('chk-view-tilt-arrows') as HTMLInputElement;
    chkTiltArrows?.addEventListener('change', () => {
      this.store.setViewFilter({ showTiltArrows: chkTiltArrows.checked });
    });

    const chkVertices = document.getElementById('chk-view-vertices') as HTMLInputElement;
    chkVertices?.addEventListener('change', () => {
      this.store.setViewFilter({ showVertices: chkVertices.checked });
    });

    const chkLabels = document.getElementById('chk-view-labels') as HTMLInputElement;
    chkLabels?.addEventListener('change', () => {
      this.store.setViewFilter({ showLabels: chkLabels.checked });
    });

    const selBasemap = document.getElementById('view-tab-basemap') as HTMLSelectElement;
    selBasemap?.addEventListener('change', () => {
      this.store.setViewFilter({ basemap: selBasemap.value as any });
      if (this.mapController) {
        this.mapController.setBasemap(selBasemap.value as any);
      }
    });

    document.getElementById('btn-view-select-all')?.addEventListener('click', () => {
      this.store.applyViewPreset('all');
    });

    document.getElementById('btn-view-clear-all')?.addEventListener('click', () => {
      this.store.setViewFilter({
        showStringLines: false,
        showHomerunLines: false,
        showRaceways: false,
        showTiltArrows: false,
        showVertices: false,
        showMountTables: false,
        showRoofRails: false,
        showInverters: false
      });
    });

    if (!zoneId) return;

    // --- Tab 1: Orientation listeners ---
    const nameInput = document.getElementById('ribbon-zone-name') as HTMLInputElement;
    nameInput?.addEventListener('change', () => {
      const z = this.store.getZone(zoneId);
      if (z) z.name = nameInput.value;
    });

    document.getElementById('ribbon-delete-zone')?.addEventListener('click', () => {
      const selZones = this.store.getSelectedZones();
      if (selZones.length === 0) return;
      const msg = selZones.length > 1
        ? `Delete all ${selZones.length} selected arrays and their panels?`
        : `Delete array "${selZones[0].name}" and all its panels?`;
      if (confirm(msg)) {
        for (const z of selZones) {
          this.store.removeZone(z.id);
        }
      }
    });

    document.getElementById('ribbon-mount-roof')?.addEventListener('click', () => {
      this.store.updateZoneConfig(zoneId, {
        ...DEFAULT_ROOF_CONFIG,
        mountType: 'roof'
      });
    });

    document.getElementById('ribbon-mount-ground')?.addEventListener('click', () => {
      this.store.updateZoneConfig(zoneId, {
        ...DEFAULT_GROUND_CONFIG,
        mountType: 'ground'
      });
    });

    document.getElementById('ribbon-orient-portrait')?.addEventListener('click', () => {
      this.store.updateZoneConfig(zoneId, { orientation: 'portrait' });
    });
    document.getElementById('ribbon-orient-landscape')?.addEventListener('click', () => {
      this.store.updateZoneConfig(zoneId, { orientation: 'landscape' });
    });

    const setRailCount = (count: 2 | 3) => {
      const selZones = this.store.getSelectedZones();
      if (selZones.length > 0) {
        for (const z of selZones) {
          if (z.config.mountType === 'roof') {
            this.store.updateZoneConfig(z.id, { railCount: count });
          }
        }
      } else if (zoneId) {
        this.store.updateZoneConfig(zoneId, { railCount: count });
      }
    };

    document.getElementById('ribbon-rails-2')?.addEventListener('click', () => setRailCount(2));
    document.getElementById('ribbon-rails-3')?.addEventListener('click', () => setRailCount(3));
    document.getElementById('ribbon-spacing-rails-2')?.addEventListener('click', () => setRailCount(2));
    document.getElementById('ribbon-spacing-rails-3')?.addEventListener('click', () => setRailCount(3));

    const railOverhangInput = document.getElementById('ribbon-rail-overhang') as HTMLInputElement;
    railOverhangInput?.addEventListener('change', () => {
      const overhang = Math.max(0, parseFloat(railOverhangInput.value) || 0.10);
      this.store.updateZoneConfig(zoneId, { railOverhangM: overhang });
    });

    const azRange = document.getElementById('ribbon-azimuth-range') as HTMLInputElement;
    const azNum = document.getElementById('ribbon-azimuth-num') as HTMLInputElement;
    const azValBadge = document.getElementById('ribbon-azimuth-val');

    const syncAz = (val: number) => {
      const deg = Math.round(val);
      if (azNum && azNum.value !== String(deg)) azNum.value = String(deg);
      if (azRange && azRange.value !== String(deg)) azRange.value = String(deg);
      if (azValBadge) azValBadge.textContent = `${deg}° (${this.getCompassHeading(deg)})`;
      const steps = this.isInteractingSlider ? 6 : 12;
      this.store.updateZoneConfig(zoneId, { azimuthDeg: deg }, true, steps);
    };

    azRange?.addEventListener('mousedown', () => { this.isInteractingSlider = true; });
    azRange?.addEventListener('touchstart', () => { this.isInteractingSlider = true; }, { passive: true });
    window.addEventListener('mouseup', () => {
      if (this.isInteractingSlider) {
        this.isInteractingSlider = false;
        const currentZone = this.store.getZone(zoneId);
        if (currentZone) {
          this.store.optimizeZoneGridShift(zoneId, 12);
        }
        this.render();
      }
    });
    window.addEventListener('touchend', () => {
      if (this.isInteractingSlider) {
        this.isInteractingSlider = false;
        const currentZone = this.store.getZone(zoneId);
        if (currentZone) {
          this.store.optimizeZoneGridShift(zoneId, 12);
        }
        this.render();
      }
    });

    azRange?.addEventListener('input', () => syncAz(Number(azRange.value)));
    azNum?.addEventListener('change', () => syncAz(Number(azNum.value)));

    // Compass Preset Pills
    this.container.querySelectorAll<HTMLButtonElement>('[data-azimuth]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = Number(btn.getAttribute('data-azimuth'));
        if (!isNaN(val)) syncAz(val);
      });
    });

    const tiltRange = document.getElementById('ribbon-tilt-range') as HTMLInputElement;
    const tiltNum = document.getElementById('ribbon-tilt-num') as HTMLInputElement;
    const tiltValBadge = document.getElementById('ribbon-tilt-val');
    const footprintVal = document.getElementById('ribbon-footprint-val');

    const syncTilt = (val: number) => {
      const deg = Math.round(val);
      if (tiltNum && tiltNum.value !== String(deg)) tiltNum.value = String(deg);
      if (tiltRange && tiltRange.value !== String(deg)) tiltRange.value = String(deg);
      if (tiltValBadge) tiltValBadge.textContent = `${deg}°`;

      const z = this.store.getZone(zoneId);
      if (z && footprintVal) {
        const cfg = z.config;
        const fp = (
          cfg.orientation === 'portrait'
            ? (cfg.panelLengthMm / 1000) * Math.cos((deg * Math.PI) / 180)
            : (cfg.panelWidthMm / 1000) * Math.cos((deg * Math.PI) / 180)
        ).toFixed(2);
        footprintVal.innerHTML = `Footprint: <strong>${fp}m</strong>`;
      }

      this.store.updateZoneConfig(zoneId, { tiltDeg: deg });
    };

    tiltRange?.addEventListener('mousedown', () => { this.isInteractingSlider = true; });
    tiltRange?.addEventListener('touchstart', () => { this.isInteractingSlider = true; }, { passive: true });
    tiltRange?.addEventListener('input', () => syncTilt(Number(tiltRange.value)));
    tiltNum?.addEventListener('change', () => syncTilt(Number(tiltNum.value)));

    // Tilt Preset Pills
    this.container.querySelectorAll<HTMLButtonElement>('[data-tilt]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = Number(btn.getAttribute('data-tilt'));
        if (!isNaN(val)) syncTilt(val);
      });
    });

    document.getElementById('ribbon-btn-toggle-tilt-arrows')?.addEventListener('click', () => {
      const next = !(this.store.viewFilter.showTiltArrows !== false);
      this.store.setViewFilter({ showTiltArrows: next });
    });

    const tab1ElevInput = document.getElementById('ribbon-tab1-elev-delta') as HTMLInputElement;
    tab1ElevInput?.addEventListener('change', () => {
      const val = Number(tab1ElevInput.value) || 0;
      this.store.setZoneElevationDelta(zoneId, val);
      const z = this.store.getZone(zoneId);
      if (z?.raceway) {
        this.store.setRacewayElevationChange(zoneId, val);
      }
    });

    // --- Tab 2: Spacing & Optimizer listeners ---
    const tableUpInput = document.getElementById('ribbon-table-up') as HTMLInputElement;
    const tableWideInput = document.getElementById('ribbon-table-wide') as HTMLInputElement;
    tableUpInput?.addEventListener('change', () => {
      const up = Math.max(1, parseInt(tableUpInput.value) || 2);
      this.store.updateZoneConfig(zoneId, { modulesPerTableUp: up });
    });
    tableWideInput?.addEventListener('change', () => {
      const wide = Math.max(1, parseInt(tableWideInput.value) || 14);
      this.store.updateZoneConfig(zoneId, { modulesPerTableWide: wide });
    });

    this.container.querySelectorAll<HTMLButtonElement>('[data-table-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-table-preset');
        if (preset === '2x14') this.store.updateZoneConfig(zoneId, { modulesPerTableUp: 2, modulesPerTableWide: 14 });
        else if (preset === '2x20') this.store.updateZoneConfig(zoneId, { modulesPerTableUp: 2, modulesPerTableWide: 20 });
        else if (preset === '1x28') this.store.updateZoneConfig(zoneId, { modulesPerTableUp: 1, modulesPerTableWide: 28 });
        else if (preset === '4x6') this.store.updateZoneConfig(zoneId, { modulesPerTableUp: 4, modulesPerTableWide: 6 });
      });
    });

    const tableGapRange = document.getElementById('ribbon-table-gap-range') as HTMLInputElement;
    const tableGapNum = document.getElementById('ribbon-table-gap-num') as HTMLInputElement;
    const tableGapBadge = document.getElementById('ribbon-table-gap-val');

    const syncTableGap = (val: number) => {
      if (tableGapNum && tableGapNum.value !== String(val)) tableGapNum.value = String(val);
      if (tableGapRange && tableGapRange.value !== String(val)) tableGapRange.value = String(val);
      if (tableGapBadge) tableGapBadge.textContent = `${val.toFixed(2)} m`;
      this.store.updateZoneConfig(zoneId, { tableSpacingM: val });
    };

    tableGapRange?.addEventListener('mousedown', () => { this.isInteractingSlider = true; });
    tableGapRange?.addEventListener('touchstart', () => { this.isInteractingSlider = true; }, { passive: true });
    tableGapRange?.addEventListener('input', () => syncTableGap(Number(tableGapRange.value)));
    tableGapNum?.addEventListener('change', () => syncTableGap(Number(tableGapNum.value)));

    this.container.querySelectorAll<HTMLButtonElement>('[data-tablegap]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = Number(btn.getAttribute('data-tablegap'));
        if (!isNaN(val)) syncTableGap(val);
      });
    });

    const rowRange = document.getElementById('ribbon-row-range') as HTMLInputElement;
    const rowNum = document.getElementById('ribbon-row-num') as HTMLInputElement;
    const rowValBadge = document.getElementById('ribbon-row-val');

    const syncRow = (val: number) => {
      if (rowNum && rowNum.value !== String(val)) rowNum.value = String(val);
      if (rowRange && rowRange.value !== String(val)) rowRange.value = String(val);
      if (rowValBadge) rowValBadge.textContent = `${val.toFixed(2)} m`;
      this.store.updateZoneConfig(zoneId, { rowSpacingM: val });
    };

    rowRange?.addEventListener('mousedown', () => { this.isInteractingSlider = true; });
    rowRange?.addEventListener('touchstart', () => { this.isInteractingSlider = true; }, { passive: true });
    rowRange?.addEventListener('input', () => syncRow(Number(rowRange.value)));
    rowNum?.addEventListener('change', () => syncRow(Number(rowNum.value)));

    document.getElementById('ribbon-btn-calc-pitch')?.addEventListener('click', () => {
      const z = this.store.getZone(zoneId);
      if (!z) return;
      const lengthM =
        z.config.orientation === 'portrait'
          ? z.config.panelLengthMm / 1000
          : z.config.panelWidthMm / 1000;
      const recPitch = calculateRecommendedRowSpacing(z.config.tiltDeg, lengthM, this.store.center.lat);
      syncRow(recPitch);
    });

    const colRange = document.getElementById('ribbon-col-range') as HTMLInputElement;
    const colNum = document.getElementById('ribbon-col-num') as HTMLInputElement;
    const colValBadge = document.getElementById('ribbon-col-val');

    const syncCol = (val: number) => {
      if (colNum && colNum.value !== String(val)) colNum.value = String(val);
      if (colRange && colRange.value !== String(val)) colRange.value = String(val);
      if (colValBadge) colValBadge.textContent = `${val.toFixed(2)} m`;
      this.store.updateZoneConfig(zoneId, { colSpacingM: val });
    };

    colRange?.addEventListener('mousedown', () => { this.isInteractingSlider = true; });
    colRange?.addEventListener('touchstart', () => { this.isInteractingSlider = true; }, { passive: true });
    colRange?.addEventListener('input', () => syncCol(Number(colRange.value)));
    colNum?.addEventListener('change', () => syncCol(Number(colNum.value)));

    // Col Gap Presets
    this.container.querySelectorAll<HTMLButtonElement>('[data-colgap]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = Number(btn.getAttribute('data-colgap'));
        if (!isNaN(val)) syncCol(val);
      });
    });

    const setRange = document.getElementById('ribbon-set-range') as HTMLInputElement;
    const setNum = document.getElementById('ribbon-set-num') as HTMLInputElement;
    const setValBadge = document.getElementById('ribbon-set-val');

    const syncSet = (val: number) => {
      if (setNum && setNum.value !== String(val)) setNum.value = String(val);
      if (setRange && setRange.value !== String(val)) setRange.value = String(val);
      if (setValBadge) setValBadge.textContent = `${val.toFixed(2)} m`;
      this.store.updateZoneConfig(zoneId, { setbackM: val });
    };

    setRange?.addEventListener('mousedown', () => { this.isInteractingSlider = true; });
    setRange?.addEventListener('touchstart', () => { this.isInteractingSlider = true; }, { passive: true });
    setRange?.addEventListener('input', () => syncSet(Number(setRange.value)));
    setNum?.addEventListener('change', () => syncSet(Number(setNum.value)));

    // Setback Presets
    this.container.querySelectorAll<HTMLButtonElement>('[data-setback]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = Number(btn.getAttribute('data-setback'));
        if (!isNaN(val)) syncSet(val);
      });
    });

    const offX = document.getElementById('ribbon-off-x') as HTMLInputElement;
    const offY = document.getElementById('ribbon-off-y') as HTMLInputElement;
    offX?.addEventListener('change', () => {
      this.store.updateZoneConfig(zoneId, { alignmentOffsetX: Number(offX.value) });
    });
    offY?.addEventListener('change', () => {
      this.store.updateZoneConfig(zoneId, { alignmentOffsetY: Number(offY.value) });
    });

    // One-Click Grid Shift Optimizer & Traversal
    document.getElementById('ribbon-opt-str-direction')?.addEventListener('change', (e) => {
      const newDir = ((e.target as HTMLSelectElement).value as StringTraverseDirection) || 'short_side';
      this.store.setStringTraverseDirection(newDir, zoneId, true);
    });

    document.getElementById('ribbon-btn-opt-shift')?.addEventListener('click', () => {
      const selZones = this.store.getSelectedZones();
      const targetInput = document.getElementById('ribbon-str-target-size') as HTMLInputElement;
      const targetSize = targetInput?.value ? Number(targetInput.value) : undefined;
      const dirSelect = (document.getElementById('ribbon-opt-str-direction') || document.getElementById('ribbon-str-direction')) as HTMLSelectElement;
      const direction = (dirSelect?.value as StringTraverseDirection) || this.store.getStringTraverseDirection(zoneId) || 'short_side';

      if (selZones.length > 1) {
        const res = this.store.optimizeSelectedZonesGridShift(12, true, targetSize, direction);
        const diff = res.totalMaxPanels - res.totalPreviousPanels;
        let msg =
          `🎉 Batch Grid Shift Optimized & Auto-Strung!\n` +
          `Optimized ${res.optimizedCount} Selected Arrays\n` +
          `Total Fitted Panels: ${res.totalMaxPanels} (${diff >= 0 ? `+${diff}` : diff} panels)`;
        if (res.totalStrings !== undefined) {
          msg += `\n⚡ Auto-Strung into ${res.totalStrings} Strings!`;
        }
        if (res.warnings && res.warnings.length > 0) {
          msg += `\n\n⚠️ Notices:\n` + res.warnings.join('\n');
        }
        alert(msg);
      } else {
        const opt = this.store.optimizeZoneGridShift(zoneId, 12, true, targetSize, direction);
        const diff = opt.maxPanelCount - opt.previousPanelCount;
        let msg =
          `🎉 Grid Shift Optimized & Auto-Strung!\n` +
          `Optimal Phase Offset: X=${opt.optimalOffsetX}m, Y=${opt.optimalOffsetY}m\n` +
          `Total Fitted Panels: ${opt.maxPanelCount} (${diff >= 0 ? `+${diff}` : diff} panels)`;
        if (opt.totalStrings !== undefined) {
          msg += `\n⚡ Auto-Strung into ${opt.totalStrings} Strings (${opt.modulesPerString || 0} modules/str)!`;
        }
        if (opt.warnings && opt.warnings.length > 0) {
          msg += `\n\n⚠️ Notices:\n` + opt.warnings.join('\n');
        }
        alert(msg);
      }
    });

    // --- Tab 3: Keep-Out Obstacles ---
    document.getElementById('ribbon-btn-draw-ko')?.addEventListener('click', () => {
      this.store.setDrawingMode(this.store.drawingMode === 'keepout' ? 'none' : 'keepout');
    });

    this.container.querySelectorAll('.btn-ribbon-remove-ko').forEach(btn => {
      btn.addEventListener('click', e => {
        const koId = (e.currentTarget as HTMLElement).getAttribute('data-ko-id');
        if (koId) this.store.removeKeepOut(zoneId, koId);
      });
    });

    // --- Tab 4: Module Specs & Management ---
    const modSelect = document.getElementById('ribbon-module-select') as HTMLSelectElement;
    modSelect?.addEventListener('change', () => {
      if (modSelect.value) {
        this.store.setArrayModule(zoneId, modSelect.value);
      }
    });

    document.getElementById('ribbon-btn-new-module')?.addEventListener('click', () => {
      const name = prompt('Enter custom panel model name (e.g. Trina Solar Vertex 650W):');
      if (!name || !name.trim()) return;

      const wattage = Number(prompt('Nominal Power (Wp):', '600')) || 600;
      const voc = Number(prompt('Open Circuit Voltage Voc (V):', '48.1')) || 48.1;
      const vmp = Number(prompt('Max Power Voltage Vmp (V):', '40.2')) || 40.2;
      const isc = Number(prompt('Short Circuit Current Isc (A):', '15.85')) || 15.85;
      const imp = Number(prompt('Max Power Current Imp (A):', '14.93')) || 14.93;
      const width = Number(prompt('Width (mm):', '1134')) || 1134;
      const length = Number(prompt('Length (mm):', '2382')) || 2382;

      const newMod = {
        id: `mod_${Date.now()}`,
        name: name.trim(),
        manufacturer: 'Custom',
        nominalPowerW: wattage,
        voc,
        vmp,
        isc,
        imp,
        widthMm: width,
        lengthMm: length,
        bifacial: true,
        tempCoeffVoc: -0.28,
        tempCoeffPmax: -0.35
      };

      this.store.addModule(newMod);
      this.store.setArrayModule(zoneId, newMod.id);
    });

    const modW = document.getElementById('ribbon-mod-w') as HTMLInputElement;
    const modVoc = document.getElementById('ribbon-mod-voc') as HTMLInputElement;
    const modVmp = document.getElementById('ribbon-mod-vmp') as HTMLInputElement;
    const modIsc = document.getElementById('ribbon-mod-isc') as HTMLInputElement;
    const modImp = document.getElementById('ribbon-mod-imp') as HTMLInputElement;
    const modDimW = document.getElementById('ribbon-mod-dimw') as HTMLInputElement;
    const modDimL = document.getElementById('ribbon-mod-diml') as HTMLInputElement;

    const syncMod = () => {
      const zoneObj = this.store.getZone(zoneId);
      if (!zoneObj) return;

      this.store.updateZoneConfig(zoneId, {
        panelWidthMm: Number(modDimW?.value) || 1134,
        panelLengthMm: Number(modDimL?.value) || 2382,
        electrical: {
          modelName: zoneObj.config.electrical.modelName,
          nominalPowerW: Number(modW?.value) || 600,
          voc: Number(modVoc?.value) || 48.1,
          vmp: Number(modVmp?.value) || 40.2,
          isc: Number(modIsc?.value) || 15.85,
          imp: Number(modImp?.value) || 14.93
        }
      });
    };

    [modW, modVoc, modVmp, modIsc, modImp, modDimW, modDimL].forEach(input => {
      input?.addEventListener('change', syncMod);
    });

    // --- Tab 5: Inverters & Auto-Stringing ---
    const activeSys = this.store.getSelectedSystem() || (zoneId ? this.store.getZone(zoneId)?.systemId ? this.store.getSystem(this.store.getZone(zoneId)!.systemId) : undefined : undefined) || this.store.getSystems()[0];
    const systemId = activeSys?.id;

    const capacitySelect = document.getElementById('ribbon-inv-capacity-select') as HTMLSelectElement;
    capacitySelect?.addEventListener('change', () => {
      if (systemId && capacitySelect.value !== 'custom') {
        const kw = Number(capacitySelect.value);
        if (kw > 0) {
          this.store.setSystemInverterCapacity(systemId, kw);
        }
      }
    });

    const presetSelect = document.getElementById('ribbon-inverter-preset-select') as HTMLSelectElement;
    presetSelect?.addEventListener('change', () => {
      if (systemId && presetSelect.value) {
        this.store.setSystemInverterPreset(systemId, presetSelect.value);
      }
    });

    const invCount = document.getElementById('ribbon-inv-count') as HTMLInputElement;
    const invKw = document.getElementById('ribbon-inv-kw') as HTMLInputElement;
    const invMppt = document.getElementById('ribbon-inv-mppt') as HTMLInputElement;
    const invStrMppt = document.getElementById('ribbon-inv-str-mppt') as HTMLInputElement;
    const invVmax = document.getElementById('ribbon-inv-vmax') as HTMLInputElement;
    const invPhase = document.getElementById('ribbon-inv-phase') as HTMLSelectElement;
    const invVac = document.getElementById('ribbon-inv-ac-voltage-preset') as HTMLSelectElement;
    const invFreq = document.getElementById('ribbon-inv-freq') as HTMLSelectElement;

    const syncInverter = () => {
      if (!systemId) return;
      this.store.updateSystemInverter(systemId, {
        inverterCount: Math.max(1, Number(invCount?.value) || 1),
        ratedAcPowerKw: Number(invKw?.value) || 100,
        mpptCountPerInverter: Math.max(1, Number(invMppt?.value) || 9),
        maxStringsPerMppt: Math.max(1, Number(invStrMppt?.value) || 2),
        maxDcVoltage: Number(invVmax?.value) || 1100,
        phase: (invPhase?.value as AcPhaseType) || 'three_phase',
        acVoltage: Number(invVac?.value) || 400,
        gridFrequencyHz: Number(invFreq?.value) || 50
      });
    };

    [invCount, invKw, invMppt, invStrMppt, invVmax].forEach(inp => {
      inp?.addEventListener('change', syncInverter);
    });

    invPhase?.addEventListener('change', () => {
      if (!systemId) return;
      const phase = invPhase.value as AcPhaseType;
      const defaultVac = phase === 'single_phase' ? 230 : 400;
      this.store.updateSystemInverter(systemId, {
        phase,
        acVoltage: defaultVac
      });
    });

    invVac?.addEventListener('change', () => {
      if (!systemId) return;
      if (invVac.value === 'custom') {
        const currentSys = this.store.getSystem(systemId);
        const val = prompt('Enter custom AC Line Voltage in Volts (e.g. 480, 208, 240, 230):', String(currentSys?.inverter.acVoltage || 400));
        if (val && Number(val) > 0) {
          this.store.updateSystemInverter(systemId, { acVoltage: Number(val) });
        }
      } else {
        const vac = Number(invVac.value);
        if (vac > 0) {
          this.store.updateSystemInverter(systemId, { acVoltage: vac });
        }
      }
    });

    invFreq?.addEventListener('change', () => {
      if (!systemId) return;
      this.store.updateSystemInverter(systemId, { gridFrequencyHz: Number(invFreq.value) || 50 });
    });

    document.getElementById('ribbon-btn-place-inverter')?.addEventListener('click', () => {
      this.store.setDrawingMode(this.store.drawingMode === 'inverter' ? 'none' : 'inverter');
    });

    document.getElementById('ribbon-btn-fly-inverter')?.addEventListener('click', () => {
      if (systemId) {
        this.mapController?.zoomToInverter(systemId);
      }
    });

    document.getElementById('ribbon-btn-clear-inverter')?.addEventListener('click', () => {
      if (systemId) {
        this.store.setSystemInverterLocation(systemId, null);
      }
    });

    document.getElementById('ribbon-btn-draw-raceway')?.addEventListener('click', () => {
      if (this.store.drawingMode === 'raceway') {
        this.mapController?.finishDrawing();
      } else {
        this.store.setDrawingMode('raceway');
      }
    });

    document.getElementById('ribbon-btn-zoom-raceway')?.addEventListener('click', () => {
      this.mapController?.zoomToRaceway(zoneId, systemId || undefined);
    });

    document.getElementById('ribbon-btn-clear-raceway')?.addEventListener('click', () => {
      if (zoneId) this.store.clearZoneRaceway(zoneId);
      if (systemId) this.store.clearSystemHomerun(systemId);
    });

    const racewayElevInput = document.getElementById('ribbon-raceway-elev') as HTMLInputElement;
    racewayElevInput?.addEventListener('change', () => {
      const elev = Number(racewayElevInput.value) || 0;
      if (zoneId) this.store.setZoneElevationDelta(zoneId, elev);
      if (systemId) this.store.setSystemHomerunElevation(systemId, elev);
    });

    const invElevInput = document.getElementById('ribbon-inv-elevation') as HTMLInputElement;
    invElevInput?.addEventListener('change', () => {
      if (systemId) {
        const sys = this.store.getSystem(systemId);
        this.store.setSystemInverterLocation(
          systemId,
          sys?.inverterLocation || null,
          Number(invElevInput.value) || 0
        );
      }
    });

    document.getElementById('ribbon-btn-place-pcc')?.addEventListener('click', () => {
      this.store.setDrawingMode(this.store.drawingMode === 'ac_interconnection' ? 'none' : 'ac_interconnection');
    });

    document.getElementById('ribbon-btn-fly-pcc')?.addEventListener('click', () => {
      if (systemId) {
        this.mapController?.zoomToAcInterconnection(systemId);
      }
    });

    document.getElementById('ribbon-btn-clear-pcc')?.addEventListener('click', () => {
      if (systemId) {
        this.store.clearSystemAcInterconnectionLocation(systemId);
      }
    });

    document.getElementById('ribbon-btn-draw-ac-feeder')?.addEventListener('click', () => {
      if (this.store.drawingMode === 'ac_raceway') {
        this.mapController?.finishDrawing();
      } else {
        this.store.setDrawingMode('ac_raceway');
      }
    });

    document.getElementById('ribbon-btn-fly-ac-feeder')?.addEventListener('click', () => {
      if (systemId) {
        this.mapController?.zoomToAcRaceway(systemId);
      }
    });

    document.getElementById('ribbon-btn-clear-ac-feeder')?.addEventListener('click', () => {
      if (systemId) {
        this.store.clearSystemAcRaceway(systemId);
      }
    });

    const pccElevInput = document.getElementById('ribbon-pcc-elevation') as HTMLInputElement;
    pccElevInput?.addEventListener('change', () => {
      if (systemId) {
        this.store.setSystemAcInterconnectionElevation(systemId, Number(pccElevInput.value) || 0);
      }
    });

    const tapVacSelect = (document.getElementById('ribbon-ac-tap-voltage') || document.getElementById('ribbon-system-tap-voltage')) as HTMLSelectElement;
    tapVacSelect?.addEventListener('change', () => {
      if (!systemId) return;
      if (tapVacSelect.value === 'custom') {
        const currentSys = this.store.getSystem(systemId);
        const val = prompt('Enter custom System Tapping Voltage in Volts (e.g. 480, 230, 400):', String(currentSys?.systemVoltageV || 400));
        if (val && Number(val) > 0) {
          this.store.updateSystem(systemId, { systemVoltageV: Number(val) });
        }
      } else {
        const v = Number(tapVacSelect.value);
        if (v > 0) {
          this.store.updateSystem(systemId, { systemVoltageV: v });
        }
      }
    });

    const mdpTapSelect = (document.getElementById('ribbon-ac-mdp-tap') || document.getElementById('ribbon-mdp-tap-type')) as HTMLSelectElement;
    mdpTapSelect?.addEventListener('change', () => {
      if (systemId) {
        this.store.updateSystem(systemId, { mdpTapType: mdpTapSelect.value as MdpTapType });
      }
    });

    const mdpBreakerSelect = document.getElementById('ribbon-ac-mdp-main-breaker') as HTMLSelectElement;
    mdpBreakerSelect?.addEventListener('change', () => {
      if (systemId) {
        this.store.updateSystem(systemId, { mdpMainBreakerA: Number(mdpBreakerSelect.value) });
      }
    });

    const acCombinerChk = (document.getElementById('ribbon-ac-chk-combiner') || document.getElementById('ribbon-chk-ac-combiner')) as HTMLInputElement;
    acCombinerChk?.addEventListener('change', () => {
      if (systemId) {
        this.store.updateSystem(systemId, { hasAcCombiner: acCombinerChk.checked });
      }
    });

    // Auto-String Traversal Direction Selection
    document.getElementById('ribbon-str-direction')?.addEventListener('change', (e) => {
      const newDir = ((e.target as HTMLSelectElement).value as StringTraverseDirection) || 'short_side';
      this.store.setStringTraverseDirection(newDir, zoneId, true);
    });

    // Auto-String Matching Inverter
    document.getElementById('ribbon-btn-auto-string-inverter')?.addEventListener('click', () => {
      if (!systemId) return;
      const targetInput = document.getElementById('ribbon-str-target-size') as HTMLInputElement;
      const targetSize = targetInput?.value ? Number(targetInput.value) : undefined;
      const dirSelect = (document.getElementById('ribbon-str-direction') || document.getElementById('ribbon-opt-str-direction')) as HTMLSelectElement;
      const direction = (dirSelect?.value as StringTraverseDirection) || this.store.getStringTraverseDirection(zoneId) || 'short_side';

      this.store.setStringTraverseDirection(direction, zoneId, false);
      const result = this.store.autoStringSystem(systemId, targetSize, direction);

      let dirLabel = '↕ Across Short Side (Default)';
      if (direction === 'long_side') dirLabel = '↔ Across Long Side';
      else if (direction === 'rows') dirLabel = '↔ Follow Rows (Horizontal)';
      else if (direction === 'columns') dirLabel = '↕ Follow Columns (Vertical)';

      let msg =
        `⚡ Auto-Stringing Complete!\n\n` +
        `Traverse Path: ${dirLabel}\n` +
        `Total Strings Formed: ${result.totalStrings}\n` +
        `Modules per String: ${result.modulesPerString}\n` +
        `System DC/AC Ratio: ${result.inverterLoadRatio}`;

      if (result.warnings.length > 0) {
        msg += `\n\n⚠️ Notices:\n` + result.warnings.join('\n');
      }

      alert(msg);
    });

    document.getElementById('ribbon-btn-open-reg')?.addEventListener('click', () => {
      document.getElementById('btn-open-registry')?.click();
    });
  }

  private getActivePresetLabel(): string {
    const preset = this.store.getActiveViewPreset();
    switch (preset) {
      case 'all': return 'All';
      case 'panels': return 'Panels';
      case 'wires': return 'Wires';
      case 'presentation': return 'Present';
      case 'civil': return 'Civil';
      case 'tracing': return 'Tracing';
      case 'vicinity': return 'Vicinity';
      default: return 'Custom';
    }
  }

  private renderViewsTab(): string {
    const vf = this.store.viewFilter;
    const activePreset = this.store.getActiveViewPreset();

    return `
      <div class="ribbon-panel" role="tabpanel" aria-label="Map View Visibility Filters and Presets">
        <!-- Pod 1: View Presets -->
        <div class="cad-pod wide">
          <div class="cad-pod-header">
            <span class="cad-pod-title">VIEW PRESETS</span>
            <span class="cad-val-chip ${activePreset !== 'custom' ? 'accent' : ''}">${this.getActivePresetLabel().toUpperCase()}</span>
          </div>
          <div class="cad-pod-body">
            <div class="cad-preset-grid" role="group" aria-label="Map View Presets">
              <button class="cad-preset-card ${activePreset === 'all' ? 'active' : ''}" data-view-preset="all" title="Full CAD: All elements visible (Panels, Wires, Racking, Handles, Arrows)">
                <span class="preset-icon">🌟</span>
                <span>Full CAD</span>
              </button>
              <button class="cad-preset-card ${activePreset === 'panels' ? 'active' : ''}" data-view-preset="panels" title="Panel View: Clean panels & tables; hides vertices, slope arrows & wires">
                <span class="preset-icon">☀️</span>
                <span>Panel View</span>
              </button>
              <button class="cad-preset-card ${activePreset === 'wires' ? 'active' : ''}" data-view-preset="wires" title="Wires & Electrical: Emphasizes string wiring circuits & homeruns, dims panels, hides arrows & vertices">
                <span class="preset-icon">⚡</span>
                <span>Wires Only</span>
              </button>
              <button class="cad-preset-card ${activePreset === 'presentation' ? 'active' : ''}" data-view-preset="presentation" title="Client Presentation: Clean aesthetic for client proposals, hides edit handles and slope arrows">
                <span class="preset-icon">🎨</span>
                <span>Presentation</span>
              </button>
              <button class="cad-preset-card ${activePreset === 'civil' ? 'active' : ''}" data-view-preset="civil" title="Civil & Layout: Mount tables, setbacks, tilt arrows & vertices for site civil engineering">
                <span class="preset-icon">📐</span>
                <span>Civil Layout</span>
              </button>
              <button class="cad-preset-card ${activePreset === 'tracing' ? 'active' : ''}" data-view-preset="tracing" title="Tracing Mode: Hides panels to clearly trace roof structures & obstacles">
                <span class="preset-icon">🔍</span>
                <span>Tracing</span>
              </button>
              <button class="cad-preset-card ${activePreset === 'vicinity' ? 'active' : ''}" data-view-preset="vicinity" title="Vicinity Map: Monochrome wireframe basemap with street & parcel lines for site location drawings">
                <span class="preset-icon">🗺️</span>
                <span>Vicinity Map</span>
              </button>
            </div>
          </div>
          <div class="cad-pod-footer">
            <span class="cad-hint-text">1-click presets toggle visibility of CAD elements & gizmos</span>
          </div>
        </div>

        <!-- Pod 2: Physical & Racking Elements Checklist -->
        <div class="cad-pod">
          <div class="cad-pod-header">
            <span class="cad-pod-title">MODULES & RACKING</span>
            <span class="cad-pod-tag">PHYSICAL</span>
          </div>
          <div class="cad-pod-body">
            <div class="cad-checklist">
              <label class="cad-check-item ${vf.panelVisibility !== 'hidden' ? 'active' : ''}">
                <div class="cad-check-label">
                  <input type="checkbox" id="chk-view-panels" class="cad-check-input" ${vf.panelVisibility !== 'hidden' ? 'checked' : ''} />
                  <span class="cad-check-icon">☀️</span>
                  <span class="cad-check-text">Solar Panels</span>
                </div>
                <select id="view-panel-mode" class="cad-select-xs" title="Panel rendering mode">
                  <option value="full" ${vf.panelVisibility === 'full' ? 'selected' : ''}>Full</option>
                  <option value="dimmed" ${vf.panelVisibility === 'dimmed' ? 'selected' : ''}>Wireframe</option>
                  <option value="hidden" ${vf.panelVisibility === 'hidden' ? 'selected' : ''}>Hidden</option>
                </select>
              </label>

              <label class="cad-check-item ${vf.showMountTables !== false ? 'active' : ''}">
                <div class="cad-check-label">
                  <input type="checkbox" id="chk-view-tables" class="cad-check-input" ${vf.showMountTables !== false ? 'checked' : ''} />
                  <span class="cad-check-icon">🏗️</span>
                  <span class="cad-check-text">Mount Tables</span>
                </div>
                <span class="cad-check-sub">Racks</span>
              </label>

              <label class="cad-check-item ${vf.showRoofRails !== false ? 'active' : ''}">
                <div class="cad-check-label">
                  <input type="checkbox" id="chk-view-roof-rails" class="cad-check-input" ${vf.showRoofRails !== false ? 'checked' : ''} />
                  <span class="cad-check-icon">🛤️</span>
                  <span class="cad-check-text">Roof Rails</span>
                </div>
                <span class="cad-check-sub">Rails</span>
              </label>

              <label class="cad-check-item ${vf.showArrayFill ? 'active' : ''}">
                <div class="cad-check-label">
                  <input type="checkbox" id="chk-view-array-fill" class="cad-check-input" ${vf.showArrayFill ? 'checked' : ''} />
                  <span class="cad-check-icon">📐</span>
                  <span class="cad-check-text">Array Fill</span>
                </div>
                <span class="cad-check-sub">Boundary</span>
              </label>

              <label class="cad-check-item ${vf.showKeepOuts ? 'active' : ''}">
                <div class="cad-check-label">
                  <input type="checkbox" id="chk-view-keepouts" class="cad-check-input" ${vf.showKeepOuts ? 'checked' : ''} />
                  <span class="cad-check-icon">🚫</span>
                  <span class="cad-check-text">Keep-Outs</span>
                </div>
                <span class="cad-check-sub">Setbacks</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Pod 3: Electrical & Wiring Checklist -->
        <div class="cad-pod">
          <div class="cad-pod-header">
            <span class="cad-pod-title">CIRCUITING & CONDUIT</span>
            <span class="cad-pod-tag accent">ELECTRICAL</span>
          </div>
          <div class="cad-pod-body">
            <div class="cad-checklist">
              <label class="cad-check-item ${vf.showStringLines ? 'active' : ''}">
                <div class="cad-check-label">
                  <input type="checkbox" id="chk-view-strings" class="cad-check-input" ${vf.showStringLines ? 'checked' : ''} />
                  <span class="cad-check-icon">🔌</span>
                  <span class="cad-check-text">String Wires</span>
                </div>
                <span class="cad-check-sub">Circuits</span>
              </label>

              <label class="cad-check-item ${vf.showHomerunLines !== false ? 'active' : ''}">
                <div class="cad-check-label">
                  <input type="checkbox" id="chk-view-homeruns" class="cad-check-input" ${vf.showHomerunLines !== false ? 'checked' : ''} />
                  <span class="cad-check-icon">🛤️</span>
                  <span class="cad-check-text">Homerun Leads</span>
                </div>
                <span class="cad-check-sub">Return</span>
              </label>

              <label class="cad-check-item ${vf.showRaceways !== false ? 'active' : ''}">
                <div class="cad-check-label">
                  <input type="checkbox" id="chk-view-raceways" class="cad-check-input" ${vf.showRaceways !== false ? 'checked' : ''} />
                  <span class="cad-check-icon">🛣️</span>
                  <span class="cad-check-text">Raceway Conduits</span>
                </div>
                <span class="cad-check-sub">Trunks</span>
              </label>

              <label class="cad-check-item ${vf.showInverters !== false ? 'active' : ''}">
                <div class="cad-check-label">
                  <input type="checkbox" id="chk-view-inverters" class="cad-check-input" ${vf.showInverters !== false ? 'checked' : ''} />
                  <span class="cad-check-icon">⚡</span>
                  <span class="cad-check-text">Inverter Stations</span>
                </div>
                <span class="cad-check-sub">Power House</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Pod 4: CAD Gizmos & Handles (Hide Vertex, Slope Arrows) -->
        <div class="cad-pod">
          <div class="cad-pod-header">
            <span class="cad-pod-title">ANNOTATIONS & HANDLES</span>
            <span class="cad-pod-tag warning">CAD GIZMOS</span>
          </div>
          <div class="cad-pod-body">
            <div class="cad-checklist">
              <label class="cad-check-item ${vf.showTiltArrows !== false ? 'active' : ''}">
                <div class="cad-check-label">
                  <input type="checkbox" id="chk-view-tilt-arrows" class="cad-check-input" ${vf.showTiltArrows !== false ? 'checked' : ''} />
                  <span class="cad-check-icon">🔻</span>
                  <span class="cad-check-text">Slope / Tilt Arrows</span>
                </div>
                <span class="cad-check-sub">Azimuth</span>
              </label>

              <label class="cad-check-item ${vf.showVertices !== false ? 'active' : ''}">
                <div class="cad-check-label">
                  <input type="checkbox" id="chk-view-vertices" class="cad-check-input" ${vf.showVertices !== false ? 'checked' : ''} />
                  <span class="cad-check-icon">📍</span>
                  <span class="cad-check-text">Vertex & Edit Pins</span>
                </div>
                <span class="cad-check-sub">Handles</span>
              </label>

              <label class="cad-check-item ${vf.showLabels ? 'active' : ''}">
                <div class="cad-check-label">
                  <input type="checkbox" id="chk-view-labels" class="cad-check-input" ${vf.showLabels ? 'checked' : ''} />
                  <span class="cad-check-icon">🏷️</span>
                  <span class="cad-check-text">Satellite Road Labels</span>
                </div>
                <span class="cad-check-sub">Places</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Pod 5: Basemap & Batch Actions -->
        <div class="cad-pod">
          <div class="cad-pod-header">
            <span class="cad-pod-title">BASEMAP & ACTIONS</span>
            <span class="cad-val-chip">${(vf.basemap || 'google-hybrid').toUpperCase()}</span>
          </div>
          <div class="cad-pod-body">
            <div class="cad-field-row">
              <label for="view-tab-basemap" class="cad-mini-label">Map / Satellite Layer</label>
              <select id="view-tab-basemap" class="cad-select-sm">
                <option value="google-hybrid" ${vf.basemap === 'google-hybrid' ? 'selected' : ''}>Google Satellite HD</option>
                <option value="google-satellite" ${vf.basemap === 'google-satellite' ? 'selected' : ''}>Google Sat (No Labels)</option>
                <option value="esri" ${vf.basemap === 'esri' ? 'selected' : ''}>Esri World Imagery</option>
                <option value="osm" ${vf.basemap === 'osm' ? 'selected' : ''}>OpenStreetMap</option>
                <option value="carto-light" ${vf.basemap === 'carto-light' ? 'selected' : ''}>Vicinity Map (Monochrome Light)</option>
                <option value="carto-dark" ${vf.basemap === 'carto-dark' ? 'selected' : ''}>Blueprint Wireframe (Dark)</option>
              </select>
            </div>
            <div class="cad-control-row compact-gap" style="margin-top: 4px;">
              <button id="btn-view-select-all" class="cad-action-btn flex-1" title="Show all layers and CAD gizmos">
                ✓ All Visible
              </button>
              <button id="btn-view-clear-all" class="cad-action-btn flex-1" title="Hide electrical and CAD overlays">
                ✕ Minimal
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderAcTab(currentSystem?: SolarSystem | null): string {
    const activeSystem = currentSystem || this.store.getSelectedSystem() || this.store.getSystems()[0];
    const activeSystemId = activeSystem?.id || '';
    const inv = activeSystem?.inverter || GENERIC_INVERTER_PRESETS[0];
    const invCount = inv.inverterCount || 1;
    const invKw = inv.ratedAcPowerKw || 100;
    const totalKw = invCount * invKw;
    const phase: AcPhaseType = inv.phase || 'three_phase';
    const is3Ph = phase === 'three_phase';
    const invVoltageV = inv.acVoltage || (is3Ph ? 400 : 230);
    const systemVoltageV = activeSystem?.systemVoltageV || invVoltageV;
    const mdpTapType: MdpTapType = activeSystem?.mdpTapType || 'load_side';
    const hasAcCombiner = activeSystem?.hasAcCombiner !== false;

    const acFeederSummary = this.store.getSystemAcFeederSummary(activeSystemId);
    const xfmDesign = sizePecTransformer(totalKw, phase, invVoltageV, systemVoltageV);
    const isDrawingPcc = this.store.drawingMode === 'ac_interconnection';
    const isDrawingAcFeeder = this.store.drawingMode === 'ac_raceway';

    const standardVoltages = is3Ph ? STANDARD_AC_VOLTAGES_3PHASE : STANDARD_AC_VOLTAGES_1PHASE;
    const isCustomTapVoltage = !standardVoltages.includes(systemVoltageV);

    const standardBreakers = [60, 100, 125, 150, 175, 200, 225, 250, 300, 400, 600, 800, 1000, 1200, 1600, 2000, 2500];
    const recommendedMdpBreaker = getRecommendedMdpMainBreaker(acFeederSummary.ratedCurrentA * 1.25, activeSystem?.mdpMainBreakerA);
    const currentMdpBreaker = activeSystem?.mdpMainBreakerA || recommendedMdpBreaker;

    const invAmps = is3Ph
      ? (invKw * 1000) / (Math.sqrt(3) * invVoltageV)
      : (invKw * 1000) / invVoltageV;
    const totalInvAmps = invAmps * invCount;
    const collectorBreakerA = Math.ceil(totalInvAmps * 1.25);

    return `
      <div class="ribbon-panel" role="tabpanel" aria-label="AC Interconnection, Grid Voltage, Transformers and MDP">
        <!-- Pod 1: System Tapping Voltage & Transformer Design (PEC 4.50) -->
        <div class="cad-pod wide">
          <div class="cad-pod-header">
            <span class="cad-pod-title">⚡ GRID TAPPING VOLTAGE & TRANSFORMER</span>
            <span class="cad-pod-tag ${xfmDesign.required ? 'warning' : 'accent'}">
              ${xfmDesign.required ? `XFM: ${xfmDesign.kvaRating} kVA` : 'DIRECT TAP'}
            </span>
          </div>
          <div class="cad-pod-body">
            <div class="cad-field-row" style="display: flex; gap: 6px;">
              <div class="cad-input-unit-wrap sm" style="flex: 1.2;" title="Grid Interconnection / Tapping Point Nominal Voltage">
                <span class="cad-unit-prefix">Tap VAC</span>
                <select id="ribbon-ac-tap-voltage" class="cad-select-sm" aria-label="System Tapping Voltage">
                  ${standardVoltages.map(v => `
                    <option value="${v}" ${systemVoltageV === v ? 'selected' : ''}>${v} V (${is3Ph ? '3Φ' : '1Φ'})</option>
                  `).join('')}
                  <option value="custom" ${isCustomTapVoltage ? 'selected' : ''}>Custom (${systemVoltageV}V)</option>
                </select>
              </div>
              <div class="cad-telemetry-chip" style="flex: 1;" title="Inverter Output AC Voltage configured in Inverter Station">
                <span class="chip-label">Inverter:</span>
                <span class="chip-val"><strong>${invVoltageV}V</strong> (${is3Ph ? '3Φ' : '1Φ'})</span>
              </div>
            </div>

            <!-- Transformer Design Status HUD -->
            <div style="margin-top: 5px;">
              ${xfmDesign.required ? `
                <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 4px; padding: 5px 8px; font-size: 11px;">
                  <div style="display: flex; justify-content: space-between; font-weight: 600; color: #f59e0b; margin-bottom: 2px;">
                    <span>⚡ ${xfmDesign.type === 'step_up' ? 'Step-Up' : 'Step-Down'} Transformer Required (PEC 4.50)</span>
                    <span>${xfmDesign.kvaRating} kVA • ${xfmDesign.vectorGroup || 'Dyn11'}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; color: var(--text-muted, #94a3b8); font-size: 10px;">
                    <span>Pri: ${xfmDesign.primaryVoltageV}V (${xfmDesign.primaryFullLoadCurrentA.toFixed(1)}A FLA, ${xfmDesign.primaryPecSizing.ocpdRatingA}A OCPD)</span>
                    <span>Sec: ${xfmDesign.secondaryVoltageV}V (${xfmDesign.secondaryFullLoadCurrentA.toFixed(1)}A FLA, ${xfmDesign.secondaryPecSizing.ocpdRatingA}A OCPD)</span>
                  </div>
                </div>
              ` : `
                <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 4px; padding: 5px 8px; font-size: 11px; display: flex; align-items: center; gap: 6px; color: #10b981;">
                  <span>✓</span>
                  <span><strong>Matched Voltage (${invVoltageV}V)</strong> — Direct interconnection without power transformer</span>
                </div>
              `}
            </div>
          </div>
          <div class="cad-pod-footer">
            <span class="cad-hint-text">Inverter AC voltage (${invVoltageV}V) is configured in the Stringing & Inverters tab.</span>
          </div>
        </div>

        <!-- Pod 2: AC Combiner Box & Collector Breaker -->
        <div class="cad-pod">
          <div class="cad-pod-header">
            <span class="cad-pod-title">📦 AC COMBINER BOX</span>
            <span class="cad-pod-tag ${hasAcCombiner ? 'accent' : ''}">${hasAcCombiner ? 'COLLECTED' : 'DIRECT'}</span>
          </div>
          <div class="cad-pod-body">
            <div class="cad-field-row">
              <label style="font-size: 11px; display: flex; align-items: center; gap: 6px; cursor: pointer; color: var(--text-main); font-weight: 500;" title="Consolidate multiple inverter branch circuits into an AC Combiner with a main collector breaker">
                <input type="checkbox" id="ribbon-ac-chk-combiner" ${hasAcCombiner ? 'checked' : ''} />
                <span>Enable AC Combiner Box</span>
              </label>
            </div>
            <div class="cad-field-row" style="margin-top: 4px;">
              <div class="cad-telemetry-chip ${hasAcCombiner ? 'highlight' : ''}" style="width: 100%;">
                <span class="chip-label">Collector Breaker:</span>
                <span class="chip-val"><strong>${hasAcCombiner ? `${collectorBreakerA}A OCPD` : 'Bypassed'}</strong> ${hasAcCombiner ? `(${invCount} Inv × ${invAmps.toFixed(1)}A × 125%)` : ''}</span>
              </div>
            </div>
          </div>
          <div class="cad-pod-footer">
            <span class="cad-hint-text">${hasAcCombiner ? `Combines ${invCount} inverter outputs before transformer / MDP main bus` : 'Each inverter feeds separately to MDP or transformer'}</span>
          </div>
        </div>

        <!-- Pod 3: Main Distribution Panel (MDP) & Interconnection Tap -->
        <div class="cad-pod wide">
          <div class="cad-pod-header">
            <span class="cad-pod-title">🏢 MAIN DISTRIBUTION PANEL (MDP)</span>
            <span class="cad-pod-tag ${mdpTapType === 'line_side' ? 'accent' : 'highlight'}">
              ${mdpTapType === 'line_side' ? 'LINE-SIDE TAP' : 'LOAD-SIDE TAP'}
            </span>
          </div>
          <div class="cad-pod-body">
            <div class="cad-control-row compact-gap">
              <div class="cad-input-unit-wrap sm" style="flex: 1.2;" title="MDP Interconnection Tap Point Architecture (PEC 705.12)">
                <span class="cad-unit-prefix">Tap Type</span>
                <select id="ribbon-ac-mdp-tap" class="cad-select-sm" aria-label="MDP Interconnection Tap Architecture">
                  <option value="load_side" ${mdpTapType === 'load_side' ? 'selected' : ''}>Load-Side (120% Rule)</option>
                  <option value="line_side" ${mdpTapType === 'line_side' ? 'selected' : ''}>Line-Side (Supply Side)</option>
                </select>
              </div>
              <div class="cad-input-unit-wrap sm" style="flex: 1;" title="MDP Main Circuit Breaker Rating in Amperes">
                <span class="cad-unit-prefix">Main OCPD</span>
                <select id="ribbon-ac-mdp-main-breaker" class="cad-select-sm" aria-label="MDP Main Circuit Breaker Rating">
                  ${standardBreakers.map(b => `
                    <option value="${b}" ${currentMdpBreaker === b ? 'selected' : ''}>${b} A Main</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <!-- Interconnection Architecture Callout -->
            <div style="margin-top: 5px; font-size: 10.5px; padding: 4px 8px; border-radius: 4px; background: ${mdpTapType === 'load_side' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(16, 185, 129, 0.08)'}; border: 1px solid ${mdpTapType === 'load_side' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(16, 185, 129, 0.25)'};">
              <div style="font-weight: 600; color: ${mdpTapType === 'load_side' ? '#3b82f6' : '#10b981'}; margin-bottom: 2px;">
                ${mdpTapType === 'load_side' ? '🔌 Load-Side Tap: Subject to PEC 705.12 (120% Busbar Rule)' : '⚡ Line-Side Tap: Connected ahead of MDP Main Breaker (PEC 705.11)'}
              </div>
              <div style="color: var(--text-muted, #94a3b8); font-size: 10px;">
                ${mdpTapType === 'load_side'
                  ? '🏢 Facility Loads connected downstream on Load Side of MDP Main Breaker. Solar backfeeds opposite end of busbar.'
                  : '🏢 Facility Loads fed normally via MDP Main Breaker. Solar taps utility supply side without busbar ampacity limitation.'}
              </div>
            </div>
          </div>
          <div class="cad-pod-footer">
            <span class="cad-hint-text">SLD schematics dynamically reflect Line vs Load side tapping and facility load branch.</span>
          </div>
        </div>

        <!-- Pod 4: Point of Common Coupling (PCC) Interconnection Location -->
        <div class="cad-pod">
          <div class="cad-pod-header">
            <span class="cad-pod-title">📍 PCC INTERCONNECTION POINT</span>
            <span class="cad-pod-tag ${activeSystem?.acInterconnectionLocation ? 'accent' : 'warning'}">
              ${activeSystem?.acInterconnectionLocation ? 'PINNED' : 'NOT SET'}
            </span>
          </div>
          <div class="cad-pod-body">
            <div class="cad-field-row" style="display: flex; gap: 6px;">
              <button id="ribbon-btn-place-pcc" class="btn btn-xs ${isDrawingPcc ? 'btn-primary active-pulse' : 'btn-outline accent'}" style="flex: 1;" title="Click to pin AC Point of Common Coupling (PCC) on satellite map">
                ${isDrawingPcc ? '🎯 Click Map to Pin...' : '📍 Pin PCC'}
              </button>
              ${activeSystem?.acInterconnectionLocation ? `
                <button id="ribbon-btn-fly-pcc" class="btn btn-xs btn-outline" title="Zoom map to PCC point">🎯</button>
                <button id="ribbon-btn-clear-pcc" class="btn-icon xs danger" title="Clear PCC location">✕</button>
              ` : ''}
            </div>
            <div class="cad-field-row" style="margin-top: 4px;">
              <div class="cad-input-unit-wrap full" title="Ground elevation of AC PCC in meters">
                <span class="cad-unit-prefix">PCC Elev</span>
                <input type="number" id="ribbon-pcc-elevation" class="cad-num-input" value="${activeSystem?.acInterconnectionElevationM ?? 0}" step="0.5" aria-label="AC PCC Elevation in Meters" />
                <span class="cad-unit-addon">m</span>
              </div>
            </div>
          </div>
          <div class="cad-pod-footer">
            <span class="cad-hint-text">${activeSystem?.acInterconnectionLocation ? `${activeSystem.acInterconnectionLocation.lat.toFixed(5)}, ${activeSystem.acInterconnectionLocation.lng.toFixed(5)}` : 'Click Pin PCC to place grid connection on map'}</span>
          </div>
        </div>

        <!-- Pod 5: AC Feeder Raceway & Sizing Telemetry (PEC 2.15) -->
        <div class="cad-pod wide">
          <div class="cad-pod-header">
            <span class="cad-pod-title">⚡ AC FEEDER RACEWAY & SIZING (PEC)</span>
            <span class="cad-pod-tag ${acFeederSummary.isCompliant ? 'accent' : 'warning'}">
              ${acFeederSummary.totalRunM > 0 ? `${acFeederSummary.voltageDropPercent}% DROP` : 'NO FEEDER'}
            </span>
          </div>
          <div class="cad-pod-body">
            <div class="cad-field-row" style="display: flex; gap: 6px;">
              <button id="ribbon-btn-draw-ac-feeder" class="btn btn-xs ${isDrawingAcFeeder ? 'btn-primary active-pulse' : 'btn-outline warning'}" style="flex: 1;" title="Draw AC Feeder Raceway polyline from Inverter/Combiner to PCC">
                ${isDrawingAcFeeder ? '✏️ Finish Drawing' : '⚡ Draw AC Feeder'}
              </button>
              ${activeSystem?.acRaceway ? `
                <button id="ribbon-btn-fly-ac-feeder" class="btn btn-xs btn-outline" title="Zoom to AC Feeder">🎯</button>
                <button id="ribbon-btn-clear-ac-feeder" class="btn-icon xs danger" title="Clear AC Feeder">✕</button>
              ` : ''}
            </div>
            <div class="cad-telemetry-hud-grid" style="margin-top: 5px;">
              <div class="hud-item highlight" title="Total AC feeder route distance including riser elevation changes">
                <span class="hud-label">Feeder Run</span>
                <span class="hud-val">${acFeederSummary.totalRunM} <small>m</small></span>
              </div>
              <div class="hud-item ${acFeederSummary.isCompliant ? '' : 'danger'}" title="AC Feeder Voltage Drop percentage (PEC limit: 3.0%)">
                <span class="hud-label">Voltage Drop</span>
                <span class="hud-val">${acFeederSummary.voltageDropPercent}% <small>(${acFeederSummary.voltageDropV}V)</small></span>
              </div>
              <div class="hud-item" title="Recommended PEC phase conductor size">
                <span class="hud-label">Conductor</span>
                <span class="hud-val" style="font-size: 11px;">${acFeederSummary.conductorCallout || 'THHN Cu'}</span>
              </div>
              <div class="hud-item" title="Conduit diameter per PEC Chapter 9">
                <span class="hud-label">Conduit</span>
                <span class="hud-val" style="font-size: 11px;">${acFeederSummary.conduitCallout || 'PVC/RMC'}</span>
              </div>
            </div>
          </div>
          <div class="cad-pod-footer">
            <span class="cad-hint-text">${acFeederSummary.totalRunM > 0 ? (acFeederSummary.isCompliant ? '✓ Compliant with PEC 2.15 feeder voltage drop limit (≤ 3.0%)' : '⚠️ Voltage drop exceeds PEC 2.15 limit of 3.0% — increase conductor size') : 'Draw AC raceway polyline from inverter to PCC to compute drop'}</span>
          </div>
        </div>
      </div>
    `;
  }
}
