import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('leaflet', () => ({
  default: {
    latLngBounds: vi.fn()
  }
}));

import { ProjectStore } from '../store/projectStore';
import { RibbonUI } from './ribbon';

describe('RibbonUI View Switching & Collapse Restoration', () => {
  let store: ProjectStore;
  let container: any;

  beforeEach(() => {
    store = new ProjectStore();
    store.clearAll();

    // Mock DOM elements
    const elementMap = new Map<string, any>();
    const createMockElement = (id: string) => {
      const el: any = {
        id,
        innerHTML: '',
        value: '',
        checked: false,
        disabled: false,
        style: {},
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          toggle: vi.fn(),
          contains: vi.fn()
        },
        setAttribute: vi.fn(),
        getAttribute: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        focus: vi.fn()
      };
      elementMap.set(id, el);
      return el;
    };

    container = createMockElement('test-ribbon');
    container.querySelectorAll = vi.fn().mockReturnValue([]);

    (globalThis as any).document = {
      getElementById: (id: string) => elementMap.get(id) || createMockElement(id),
      querySelectorAll: () => [],
      activeElement: null
    };
  });

  it('collapses by default when switching to SLD, BOQ, or Simulation and restores map collapsed state when returning', () => {
    let activeView: 'map' | 'sld' | 'boq' | 'simulation' = 'map';
    const ribbon = new RibbonUI(container, store, undefined, (v) => {
      activeView = v;
      ribbon.setView(v);
    });

    // 1. Initial state on map view: expanded
    expect(activeView).toBe('map');
    expect(ribbon.getCurrentView()).toBe('map');
    expect(ribbon.getIsCollapsed()).toBe(false);

    // 2. Switch from map to SLD view -> collapsed by default
    ribbon.setView('sld');
    expect(ribbon.getCurrentView()).toBe('sld');
    expect(ribbon.getIsCollapsed()).toBe(true);

    // 3. Switch from SLD to BOQ view -> collapsed by default
    ribbon.setView('boq');
    expect(ribbon.getCurrentView()).toBe('boq');
    expect(ribbon.getIsCollapsed()).toBe(true);

    // 4. Switch from BOQ to Simulation view -> collapsed by default
    ribbon.setView('simulation');
    expect(ribbon.getCurrentView()).toBe('simulation');
    expect(ribbon.getIsCollapsed()).toBe(true);

    // 5. Return to map view -> restores map's last setting (expanded = false)
    ribbon.setView('map');
    expect(ribbon.getCurrentView()).toBe('map');
    expect(ribbon.getIsCollapsed()).toBe(false);

    // 5. User collapses ribbon while on map view
    ribbon.toggleCollapse();
    expect(ribbon.getIsCollapsed()).toBe(true);

    // 6. Switch from map to SLD view -> collapsed by default
    ribbon.setView('sld');
    expect(ribbon.getCurrentView()).toBe('sld');
    expect(ribbon.getIsCollapsed()).toBe(true);

    // 7. User expands ribbon while inspecting SLD view
    ribbon.toggleCollapse();
    expect(ribbon.getIsCollapsed()).toBe(false);

    // 8. Return to map view -> restores map's last setting (collapsed = true)
    ribbon.setView('map');
    expect(ribbon.getCurrentView()).toBe('map');
    expect(ribbon.getIsCollapsed()).toBe(true);

    // 9. User clicks a tab (e.g. 'orientation') on map view -> expands ribbon
    ribbon.setActiveTab('orientation');
    expect(ribbon.getIsCollapsed()).toBe(false);

    // 10. Switch to BOQ view -> collapses by default
    ribbon.setView('boq');
    expect(ribbon.getCurrentView()).toBe('boq');
    expect(ribbon.getIsCollapsed()).toBe(true);

    // 11. Return to map view -> restores map's expanded state
    ribbon.setView('map');
    expect(ribbon.getCurrentView()).toBe('map');
    expect(ribbon.getIsCollapsed()).toBe(false);
  });

  it('keeps array tab rendered without switching to empty deck or deselecting when a PV module is selected', () => {
    const ribbon = new RibbonUI(container, store);
    const origin = { lat: 37.7749, lng: -122.4194 };
    const zone = store.addZone(
      [
        origin,
        { lat: 37.7749, lng: -122.4192 },
        { lat: 37.7751, lng: -122.4192 },
        { lat: 37.7751, lng: -122.4194 }
      ],
      'roof',
      'Roof A'
    );

    ribbon.setActiveTab('orientation');
    expect(container.innerHTML).toContain('ribbon-panel');
    expect(container.innerHTML).not.toContain('ribbon-empty-deck');

    const panels = store.getPanelsForZone(zone.id);
    expect(panels.length).toBeGreaterThan(0);

    const layoutVerBefore = store.layoutVersion;
    store.selectPanel(panels[0].id);

    // PV module stays selected, array zone is deselected on map, layout is not regenerated,
    // and Ribbon stays on orientation panel without collapsing/shifting to empty deck
    expect(store.selectedPanelId).toBe(panels[0].id);
    expect(store.isZoneSelected(zone.id)).toBe(false);
    expect(store.layoutVersion).toBe(layoutVerBefore);
    expect(container.innerHTML).toContain('ribbon-panel');
    expect(container.innerHTML).not.toContain('ribbon-empty-deck');
  });

  it('updates the store and SLD when changing AC System & Grid config even when no zone is selected', () => {
    const sys = store.getSelectedSystem()!;
    expect(sys).toBeDefined();

    const elementMap = new Map<string, any>();
    const createMockElement = (id: string) => {
      const el: any = {
        id,
        innerHTML: '',
        value: '',
        checked: false,
        disabled: false,
        style: {},
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          toggle: vi.fn(),
          contains: vi.fn()
        },
        setAttribute: vi.fn(),
        getAttribute: vi.fn(),
        addEventListener: vi.fn((event, handler) => {
          if (!el._listeners) el._listeners = {};
          if (!el._listeners[event]) el._listeners[event] = [];
          el._listeners[event].push(handler);
        }),
        trigger: (event: string) => {
          if (el._listeners && el._listeners[event]) {
            el._listeners[event].forEach((cb: any) => cb());
          }
        }
      };
      elementMap.set(id, el);
      return el;
    };

    (globalThis as any).document = {
      getElementById: (id: string) => elementMap.get(id) || createMockElement(id),
      querySelectorAll: () => [],
      activeElement: null
    };

    const ribbon = new RibbonUI(container, store);

    // Track SLD updates via store subscriber
    let sldUpdateCount = 0;
    store.subscribe(() => {
      sldUpdateCount++;
    });

    // Switch to AC tab with NO zone selected
    ribbon.setActiveTab('ac');
    expect(store.getSelectedZone()).toBeUndefined();

    // 1. Change Tapping Voltage to 230V
    const tapSelect = (globalThis as any).document.getElementById('ribbon-ac-tap-voltage');
    tapSelect.value = '230';
    tapSelect.trigger('change');

    expect(store.getSystem(sys.id)?.systemVoltageV).toBe(230);
    expect(sldUpdateCount).toBeGreaterThan(0);

    // 2. Change MDP Tap Type to line_side
    const mdpTapSelect = (globalThis as any).document.getElementById('ribbon-ac-mdp-tap');
    mdpTapSelect.value = 'line_side';
    mdpTapSelect.trigger('change');

    expect(store.getSystem(sys.id)?.mdpTapType).toBe('line_side');

    // 3. Change AC Combiner to false
    const combinerChk = (globalThis as any).document.getElementById('ribbon-ac-chk-combiner');
    combinerChk.checked = false;
    combinerChk.trigger('change');

    expect(store.getSystem(sys.id)?.hasAcCombiner).toBe(false);
  });

  it('renders Match Properties button on Home tab and manages match props mode', () => {
    const origin = { lat: 37.7749, lng: -122.4194 };
    const z1 = store.addZone([
      origin,
      { lat: 37.7749, lng: -122.4192 },
      { lat: 37.7751, lng: -122.4192 },
      { lat: 37.7751, lng: -122.4194 }
    ], 'roof', 'Array 1');

    const ribbon = new RibbonUI(container, store);
    ribbon.setActiveTab('home');

    // With 1 array, match props button is present but disabled
    expect(container.innerHTML).toContain('ribbon-btn-match-props');
    expect(container.innerHTML).toContain('disabled');

    // Add second array -> button is enabled
    store.addZone([
      { lat: 37.7752, lng: -122.4194 },
      { lat: 37.7752, lng: -122.4192 },
      { lat: 37.7754, lng: -122.4192 },
      { lat: 37.7754, lng: -122.4194 }
    ], 'roof', 'Array 2');

    ribbon.setActiveTab('home');
    expect(container.innerHTML).toContain('ribbon-btn-match-props');
    expect(container.innerHTML).toContain('🎨 Match Props');

    // Activating match properties mode renders the banner
    store.setMatchPropsMode(true, z1.id);
    expect(store.drawingMode).toBe('match_props');
    expect(store.matchPropsSourceZoneId).toBe(z1.id);

    expect(container.innerHTML).toContain('MATCH PROPERTIES ACTIVE');
    expect(container.innerHTML).toContain('ribbon-btn-exit-match-props');

    // Exiting match properties mode removes the banner
    store.setMatchPropsMode(false);
    expect(store.drawingMode).toBe('none');
    expect(store.matchPropsSourceZoneId).toBeNull();
    expect(container.innerHTML).not.toContain('MATCH PROPERTIES ACTIVE');
  });

  it('renders the Reports & Export tab with PDF generation, Schedules, and Project Export pods', () => {
    const ribbon = new RibbonUI(container, store);
    ribbon.setActiveTab('reports');

    expect(container.innerHTML).toContain('ENGINEERING REPORTS &amp; PDF');
    expect(container.innerHTML).toContain('ribbon-btn-gen-pdf');
    expect(container.innerHTML).toContain('SCHEDULES &amp; REGISTRY');
    expect(container.innerHTML).toContain('ribbon-btn-open-tables-reg');
    expect(container.innerHTML).toContain('BACKUP &amp; GIS EXPORT');
    expect(container.innerHTML).toContain('ribbon-btn-export-project-json');
    expect(container.innerHTML).toContain('ribbon-btn-import-project-json');
  });
});
