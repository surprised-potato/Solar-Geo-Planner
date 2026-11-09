import { ProjectStore } from '../store/projectStore';
import { SolarSystem, ArrayZone } from '../types/solar';
import { MapController } from '../map/mapController';
import { MatchPropsModalUI } from './matchPropsModal';
import { LoadProfileModalUI } from './loadProfileModal';
import { renderOrientationTab } from './ribbon/orientationTab';
import { renderSpacingTab } from './ribbon/spacingTab';
import { renderObstaclesTab } from './ribbon/obstaclesTab';
import { renderModuleTab } from './ribbon/moduleTab';
import { renderStringingTab } from './ribbon/stringingTab';
import type { ZoneTabContext } from './ribbon/zoneTabContext';
import { renderHomeTab as renderHomeTabImpl } from './ribbon/homeTab';
import {
  getActivePresetLabel as getActivePresetLabelImpl,
  renderViewsTab as renderViewsTabImpl
} from './ribbon/viewsTab';
import { renderReportsTab as renderReportsTabImpl } from './ribbon/reportsTab';
import { renderAcTab as renderAcTabImpl } from './ribbon/acTab';
import { renderTiltCrossSectionSvg as renderTiltCrossSectionSvgImpl } from './ribbon/tiltCrossSection';
import { attachEventListeners as attachEventListenersImpl } from './ribbon/ribbonEvents';
import { escapeHtml } from '../utils/html';
import { getCardinalDirection } from '../geo/projection';

export type RibbonTab = 'home' | 'orientation' | 'spacing' | 'obstacles' | 'module' | 'stringing' | 'ac' | 'views' | 'reports';

export class RibbonUI {
  container: HTMLElement;
  store: ProjectStore;
  mapController?: MapController;
  public matchPropsModal: MatchPropsModalUI;
  public loadProfileModal: LoadProfileModalUI;
  private activeTab: RibbonTab = 'home';
  private isCollapsed: boolean = false;
  private mapCollapsedState: boolean = false;
  private currentView: 'map' | 'sld' | 'boq' | 'simulation' = 'map';
  isInteractingSlider: boolean = false;
  isInteractingAzimuthSlider: boolean = false;
  private currentActiveZoneId: string | null = null;
  onViewModeChange?: (view: 'map' | 'sld' | 'boq' | 'simulation') => void;

  constructor(
    containerId: string | HTMLElement,
    store: ProjectStore,
    mapController?: MapController,
    onViewModeChange?: (view: 'map' | 'sld' | 'boq' | 'simulation') => void
  ) {
    const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!el) throw new Error(`Element #${containerId} not found`);
    this.container = el;
    this.store = store;
    this.mapController = mapController;
    this.onViewModeChange = onViewModeChange;
    this.matchPropsModal = new MatchPropsModalUI(this.store, this.mapController);
    this.loadProfileModal = new LoadProfileModalUI(this.store);

    if (typeof window !== 'undefined') {
      const onGlobalRelease = () => {
        if (this.isInteractingAzimuthSlider) {
          this.isInteractingAzimuthSlider = false;
          const zoneId = this.currentActiveZoneId;
          if (zoneId) {
            const currentZone = this.store.getZone(zoneId);
            if (currentZone) {
              this.store.optimizeZoneGridShift(zoneId, 12);
            }
          }
          this.render();
        } else if (this.isInteractingSlider) {
          this.isInteractingSlider = false;
          this.render();
        }
      };
      window.addEventListener('mouseup', onGlobalRelease);
      window.addEventListener('touchend', onGlobalRelease);
    }

    this.store.subscribe(() => {
      // Avoid destroying DOM while user is actively scrubbing a slider
      if (!this.isInteractingSlider && !this.isInteractingAzimuthSlider) {
        this.render();
      }
    });
    this.render();
  }

  public getActiveTab(): RibbonTab {
    return this.activeTab;
  }

  public getIsCollapsed(): boolean {
    return this.isCollapsed;
  }

  public getCurrentView(): 'map' | 'sld' | 'boq' | 'simulation' {
    return this.currentView;
  }

  public setActiveTab(tab: RibbonTab): void {
    this.activeTab = tab;
    this.isCollapsed = false;
    if (this.currentView === 'map') {
      this.mapCollapsedState = false;
    }
    this.render();
    if (this.currentView === 'map' && this.mapController) {
      this.mapController.invalidateSize();
      setTimeout(() => this.mapController?.invalidateSize(), 50);
    }
  }

  public setCollapsed(collapsed: boolean): void {
    this.isCollapsed = collapsed;
    if (this.currentView === 'map') {
      this.mapCollapsedState = collapsed;
    }
    this.render();
    if (this.currentView === 'map' && this.mapController) {
      this.mapController.invalidateSize();
      setTimeout(() => this.mapController?.invalidateSize(), 50);
    }
  }

  public toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    if (this.currentView === 'map') {
      this.mapCollapsedState = this.isCollapsed;
    }
    this.render();
    if (this.currentView === 'map' && this.mapController) {
      this.mapController.invalidateSize();
      setTimeout(() => this.mapController?.invalidateSize(), 50);
    }
  }

  public setView(view: 'map' | 'sld' | 'boq' | 'simulation'): void {
    if (this.currentView === view) return;
    const prevView = this.currentView;
    this.currentView = view;

    if (prevView === 'map') {
      this.mapCollapsedState = this.isCollapsed;
    }

    if (view === 'map') {
      this.isCollapsed = this.mapCollapsedState;
    } else {
      // Switching to SLD, BOQ, or Simulation: collapse ribbon by default
      this.isCollapsed = true;
    }

    this.render();
    if (view === 'map' && this.mapController) {
      this.mapController.invalidateSize();
      setTimeout(() => this.mapController?.invalidateSize(), 50);
    }
  }

  private render(): void {
    // Preserve focused element ID if any text or number input is focused
    const focusedId = document.activeElement?.id;
    const selectionStart = (document.activeElement as HTMLInputElement)?.selectionStart;
    const selectionEnd = (document.activeElement as HTMLInputElement)?.selectionEnd;

    const systems = this.store.getSystems();
    const currentSystem = this.store.getSelectedSystem();
    const selectedPanel = this.store.getSelectedPanel();
    const zone = this.store.getSelectedZone() || (selectedPanel ? this.store.getZone(selectedPanel.zoneId) : undefined);
    this.currentActiveZoneId = zone?.id || null;
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

    // Collapsed Mode: Slim bar with quick-jump tab buttons
    if (this.isCollapsed) {
      const collapsedTabsHtml = `
        <div class="ribbon-collapsed-strip">
          <div class="collapsed-quick-nav" role="tablist" aria-label="Quick Switch Tabs">
            <button class="ribbon-tab-pill ${this.activeTab === 'home' ? 'active' : ''}" data-tab="home" title="Project Home: Systems, Arrays & Quick Tools">
              <span>🏠</span> Home
            </button>
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
            <button class="ribbon-tab-pill ${this.activeTab === 'reports' ? 'active' : ''}" data-tab="reports" title="Engineering Reports, Schedules, CAD & Project Export">
              <span>📑</span> Reports & Export
            </button>
          </div>
          <button id="ribbon-toggle-collapse" class="ribbon-collapse-toggle is-collapsed" style="margin-left: auto;" title="Expand Ribbon Controls" aria-expanded="false">
            <svg class="collapse-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
            <span class="collapse-text">Expand</span>
          </button>
        </div>
      `;

      this.container.innerHTML = collapsedTabsHtml;
      this.attachEventListeners(zone?.id);
      return;
    }

    // Row 1: Ribbon Navigation Tabs
    const tabsStripHtml = `
      <div class="ribbon-tabs-strip" role="tablist" aria-label="Array Configuration Toolsets">
        <button class="ribbon-tab-item ${this.activeTab === 'home' ? 'active' : ''}" data-tab="home" role="tab" aria-selected="${this.activeTab === 'home'}" title="Project Home: System Selection, Array Management, Quick CAD Drafting, and Live Telemetry">
          <span class="tab-icon">🏠</span>
          <span class="tab-title">Home</span>
          <span class="tab-subtext-badge">${escapeHtml(currentSystem?.name || 'Project')}</span>
        </button>
        <button class="ribbon-tab-item ${this.activeTab === 'orientation' ? 'active' : ''}" data-tab="orientation" role="tab" aria-selected="${this.activeTab === 'orientation'}" ${!zone ? 'disabled' : ''}>
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
        <button class="ribbon-tab-item ${this.activeTab === 'reports' ? 'active' : ''}" data-tab="reports" role="tab" aria-selected="${this.activeTab === 'reports'}" title="Engineering Reports, Component Schedules, CAD & Project Export">
          <span class="tab-icon">📑</span>
          <span class="tab-title">Reports & Export</span>
          <span class="tab-subtext-badge">PDF • DATA</span>
        </button>

        <button id="ribbon-toggle-collapse" class="ribbon-collapse-toggle ${this.isCollapsed ? 'is-collapsed' : ''}" style="margin-left: auto;" title="${this.isCollapsed ? 'Expand Ribbon Controls' : 'Collapse Ribbon Controls'}" aria-expanded="${!this.isCollapsed}">
          <svg class="collapse-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
          <span class="collapse-text">Collapse</span>
        </button>
      </div>
    `;

    // Row 2: Ribbon Tool Pod Panel
    let contentHtml = '';
    let batchBannerHtml = '';

    const isMatchingProps = this.store.drawingMode === 'match_props';
    const matchSourceZone = isMatchingProps && this.store.matchPropsSourceZoneId
      ? this.store.getZone(this.store.matchPropsSourceZoneId)
      : null;

    if (isMatchingProps && matchSourceZone) {
      batchBannerHtml = `
        <div class="ribbon-batch-banner" style="background: rgba(14, 165, 233, 0.15); border-color: rgba(14, 165, 233, 0.4);">
          <span class="batch-badge" style="background: #0284c7;">🎨 MATCH PROPERTIES ACTIVE</span>
          <span>Source: <strong>${escapeHtml(matchSourceZone.name)}</strong> (${matchSourceZone.config.mountType.toUpperCase()} &bull; ${matchSourceZone.config.tiltDeg}&deg; &bull; ${matchSourceZone.config.azimuthDeg}&deg; &bull; ${matchSourceZone.config.rowSpacingM}m pitch). Click any array on the map to match properties.</span>
          <button id="ribbon-btn-exit-match-props" class="btn-xs btn-primary">✓ Done Matching</button>
        </div>
      `;
    } else if (isMultiSelect) {
      batchBannerHtml = `
        <div class="ribbon-batch-banner">
          <span class="batch-badge">BATCH EDIT ACTIVE</span>
          <span>Adjusting setback, spacing, tilt, or layout below updates all <strong>${selectedZones.length} selected arrays</strong> simultaneously (${totalSelectedPanels} panels &bull; ${totalSelectedKwp} kWp).</span>
          <button id="ribbon-btn-batch-opt" class="btn-xs btn-primary">⚡ Optimize All (${selectedZones.length})</button>
          <button id="ribbon-btn-batch-clear" class="btn-xs btn-outline">✕ Exit Batch</button>
        </div>
      `;
    }

    if (this.activeTab === 'views') {
      contentHtml = this.renderViewsTab();
    } else if (this.activeTab === 'reports') {
      contentHtml = this.renderReportsTab();
    } else if (this.activeTab === 'ac') {
      contentHtml = this.renderAcTab(currentSystem);
    } else if (this.activeTab === 'home') {
      contentHtml = this.renderHomeTab(
        currentSystem,
        zone,
        selectedZones,
        systems,
        zones,
        isMultiSelect,
        drawingMode,
        totalSelectedKwp,
        totalSelectedPanels,
        currentSystemSummary
      );
    } else if (!zone) {
      contentHtml = `
        <div class="ribbon-empty-deck" role="region" aria-label="CAD Workspace Starter">
          <div class="empty-deck-icon">📐</div>
          <div class="empty-deck-text">
            <h4 class="empty-deck-title">No Array Selected</h4>
            <p class="empty-deck-desc">Select an array polygon from the satellite map or draft a new layout for <strong>${escapeHtml(currentSystem?.name || 'Main System')}</strong> (${currentSystemSummary?.totalKwp || 0} kWp):</p>
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

      if (!isMatchingProps) {
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
      }
      const currentModule = this.store.getModule(zone.moduleId);

      const tabCtx: ZoneTabContext = {
        zone,
        cfg,
        zoneSystem,
        currentTraverseDir,
        currentModule,
        modules,
        systems,
        zones,
        currentSystem,
        currentSystemSummary,
        selectedZones,
        isMultiSelect,
        totalSelectedPanels,
        totalSelectedKwp,
        isMatchingProps,
        drawingMode,
      };
      switch (this.activeTab) {
        case 'orientation':
          contentHtml = renderOrientationTab.call(this, tabCtx);
          break;
        case 'spacing':
          contentHtml = renderSpacingTab.call(this, tabCtx);
          break;
        case 'obstacles':
          contentHtml = renderObstaclesTab.call(this, tabCtx);
          break;
        case 'module':
          contentHtml = renderModuleTab.call(this, tabCtx);
          break;
        case 'stringing':
          contentHtml = renderStringingTab.call(this, tabCtx);
          break;
      }
    }

    this.container.innerHTML = tabsStripHtml + batchBannerHtml + contentHtml;
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

  getCompassHeading(deg: number): string {
    return getCardinalDirection(deg);
  }

  /**
   * Renders a 2D cross-section SVG displaying the inclined solar panel face,
   * high ridge, low eave, and a downward slope arrow pointing in the direction of gravity runoff.
   */
  renderTiltCrossSectionSvg(
    tiltDeg: number,
    azimuthDeg: number,
    orientation: 'portrait' | 'landscape',
    panelLengthMm: number,
    panelWidthMm: number
  ): string {
    return renderTiltCrossSectionSvgImpl.call(this, tiltDeg, azimuthDeg, orientation, panelLengthMm, panelWidthMm);
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
    return attachEventListenersImpl.call(this, zoneId);
  }

  getActivePresetLabel(): string {
    return getActivePresetLabelImpl.call(this);
  }

  private renderViewsTab(): string {
    return renderViewsTabImpl.call(this);
  }

  private renderReportsTab(): string {
    return renderReportsTabImpl.call(this);
  }

  private renderHomeTab(
    currentSystem: SolarSystem | undefined,
    zone: ArrayZone | null | undefined,
    selectedZones: ArrayZone[],
    systems: SolarSystem[],
    zones: ArrayZone[],
    isMultiSelect: boolean,
    drawingMode: string,
    totalSelectedKwp: number,
    totalSelectedPanels: number,
    currentSystemSummary: any
  ): string {
    return renderHomeTabImpl.call(this, currentSystem, zone, selectedZones, systems, zones, isMultiSelect, drawingMode, totalSelectedKwp, totalSelectedPanels, currentSystemSummary);
  }

  private renderAcTab(currentSystem?: SolarSystem | null): string {
    return renderAcTabImpl.call(this, currentSystem);
  }
}
