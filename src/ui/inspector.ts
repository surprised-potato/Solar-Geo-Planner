import L from 'leaflet';
import { ProjectStore } from '../store/projectStore';
import { MapController } from '../map/mapController';
import { SolarYieldModalUI } from './solarYieldModal';
import { LoadProfileModalUI } from './loadProfileModal';
import { renderMinimized as renderMinimizedImpl, renderSystemScope as renderSystemScopeImpl, attachScopeListeners as attachScopeListenersImpl } from './inspector/systemScopeCard';
import { renderPanelDetails as renderPanelDetailsImpl, attachPanelListeners as attachPanelListenersImpl } from './inspector/panelDetailsCard';

export class InspectorUI {
  container: HTMLElement;
  store: ProjectStore;
  mapController?: MapController;
  private isMinimized: boolean = false;
  lastScrollTop: number = 0;
  lastClickedDirection: string | null = null;
  solarYieldModal: SolarYieldModalUI;
  loadProfileModal: LoadProfileModalUI;
  onOpenSimulationWorkspace?: (systemId?: string) => void;

  constructor(
    containerId: string,
    store: ProjectStore,
    mapController?: MapController,
    onOpenSimulationWorkspace?: (systemId?: string) => void
  ) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Element #${containerId} not found`);
    this.container = el;
    this.store = store;
    this.mapController = mapController;
    this.onOpenSimulationWorkspace = onOpenSimulationWorkspace;
    this.solarYieldModal = new SolarYieldModalUI(
      store,
      (sysId) => this.loadProfileModal.open(sysId),
      (sysId) => {
        this.solarYieldModal.close();
        this.onOpenSimulationWorkspace?.(sysId);
      }
    );
    this.loadProfileModal = new LoadProfileModalUI(store, (sysId) => this.solarYieldModal.open(sysId));

    // Prevent Leaflet map from capturing wheel, touch, or click events inside inspector
    L.DomEvent.disableScrollPropagation(this.container);
    L.DomEvent.disableClickPropagation(this.container);
    this.container.addEventListener(
      'wheel',
      e => {
        e.stopPropagation();
      },
      { passive: true }
    );

    this.store.subscribe(() => this.render());
    this.render();
  }

  public toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
    this.render();
  }

  private render(): void {
    // Preserve scroll position of the inspector card before modifying DOM
    const prevCard = this.container.querySelector<HTMLElement>('.inspector-card');
    if (prevCard && !prevCard.classList.contains('inspector-minimized')) {
      this.lastScrollTop = prevCard.scrollTop;
    }

    const panel = this.store.getSelectedPanel();
    const currentSystem = this.store.getSelectedSystem();
    const sysSummary = currentSystem ? this.store.getSystemSummary(currentSystem.id) : null;
    const projectSummary = this.store.getSystemSummary();
    const sysCable = currentSystem ? this.store.getSystemCableSummary(currentSystem.id) : null;
    const sysYield = this.store.getSolarYieldEstimate(currentSystem?.id);
    const projectYield = this.store.getSolarYieldEstimate();

    // Collapsed / Minimized HUD Pill State
    if (this.isMinimized) {
      this.renderMinimized(panel, currentSystem, sysSummary);
      return;
    }

    // Context A: No Panel Selected -> System & Site Scope HUD
    if (!panel) {
      this.renderSystemScope(currentSystem, sysSummary, projectSummary, sysCable, sysYield, projectYield);
      return;
    }

    // Context B: Panel Selected -> Detailed Solar Panel Object Inspector
    this.renderPanelDetails(panel);
  }

  private renderMinimized( panel: ReturnType<ProjectStore['getSelectedPanel']>, currentSystem: ReturnType<ProjectStore['getSelectedSystem']>, sysSummary: ReturnType<ProjectStore['getSystemSummary']> | null ) : void {
    return renderMinimizedImpl.call(this, panel, currentSystem, sysSummary);
  }

  private renderSystemScope( currentSystem: ReturnType<ProjectStore['getSelectedSystem']>, sysSummary: ReturnType<ProjectStore['getSystemSummary']> | null, projectSummary: ReturnType<ProjectStore['getSystemSummary']>, sysCable: ReturnType<ProjectStore['getSystemCableSummary']> | null, sysYield: ReturnType<ProjectStore['getSolarYieldEstimate']>, projectYield: ReturnType<ProjectStore['getSolarYieldEstimate']> ) : void {
    return renderSystemScopeImpl.call(this, currentSystem, sysSummary, projectSummary, sysCable, sysYield, projectYield);
  }

  private renderPanelDetails(panel: NonNullable<ReturnType<ProjectStore['getSelectedPanel']>>) : void {
    return renderPanelDetailsImpl.call(this, panel);
  }

  attachScopeListeners(systemId?: string) : void {
    return attachScopeListenersImpl.call(this, systemId);
  }

  attachPanelListeners(panelId: string) : void {
    return attachPanelListenersImpl.call(this, panelId);
  }

  public openSolarYieldModal(systemId?: string): void {
    this.solarYieldModal.open(systemId, 'yield');
  }

  public openLoadProfileModal(systemId?: string): void {
    this.loadProfileModal.open(systemId);
  }
}
