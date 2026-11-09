import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectStore } from '../store/projectStore';
import { SimulationWorkspaceUI } from './simulationView';

describe('SimulationWorkspaceUI', () => {
  let store: ProjectStore;
  let elementMap: Map<string, any>;

  const createMockElement = (id: string, tag: string = 'div') => {
    const listeners = new Map<string, Function[]>();
    const el: any = {
      id,
      tagName: tag.toUpperCase(),
      innerHTML: '',
      value: '',
      style: {},
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        toggle: vi.fn(),
        contains: vi.fn()
      },
      setAttribute: vi.fn(),
      getAttribute: vi.fn(),
      addEventListener: vi.fn((event, cb) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event)!.push(cb);
      }),
      removeEventListener: vi.fn(),
      click: () => {
        if (el.onclick) el.onclick({ target: el });
        const cbs = listeners.get('click') || [];
        cbs.forEach(cb => cb({ target: el }));
      },
      querySelector: vi.fn((sel: string) => {
        const matchId = sel.replace('#', '').replace('.', '');
        return elementMap.get(matchId) || createMockElement(matchId);
      }),
      querySelectorAll: vi.fn().mockReturnValue([])
    };
    elementMap.set(id, el);
    return el;
  };

  beforeEach(() => {
    elementMap = new Map();

    createMockElement('simulation-workspace-mount');
    (globalThis as any).document = {
      getElementById: (id: string) => elementMap.get(id) || null,
      createElement: (tag: string) => createMockElement(`mock-${Math.random()}`, tag),
      querySelectorAll: () => []
    };

    (globalThis as any).URL = {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: vi.fn()
    };

    store = new ProjectStore();
    store.clearAll();
  });

  it('renders all simulation sections into the mount container', () => {
    const mount = elementMap.get('simulation-workspace-mount');
    new SimulationWorkspaceUI(mount, store);

    expect(mount.innerHTML).toContain('Energy Simulation &amp; Diurnal Dispatch');
    expect(mount.innerHTML).toContain('RENEWABLE ENERGY (RE) SHARE');
    expect(mount.innerHTML).toContain('DIRECT SOLAR SELF-CONSUMPTION');
    expect(mount.innerHTML).toContain('GRID ENERGY EXPORT');
    expect(mount.innerHTML).toContain('GRID ENERGY IMPORT');
    expect(mount.innerHTML).toContain('24-HOUR HOURLY DIURNAL DISPATCH CURVE');
    expect(mount.innerHTML).toContain('12-MONTH ENERGY BALANCE');
    expect(mount.innerHTML).toContain('NET-BILLING &amp; ECONOMIC IMPACT');
  });

  it('renders diurnal period options and weekly selector', () => {
    const mount = elementMap.get('simulation-workspace-mount');
    new SimulationWorkspaceUI(mount, store);

    expect(mount.innerHTML).toContain('Annual Average Day');
    expect(mount.innerHTML).toContain('Jan (Monthly Average)');
    expect(mount.innerHTML).toContain('Full Week (7-Day Average)');
    expect(mount.innerHTML).toContain('Weekday (Mon – Fri)');
    expect(mount.innerHTML).toContain('Weekend (Sat – Sun)');
  });

  it('renders 12 months in the energy balance table', () => {
    const mount = elementMap.get('simulation-workspace-mount');
    new SimulationWorkspaceUI(mount, store);

    expect(mount.innerHTML).toContain('Jan');
    expect(mount.innerHTML).toContain('Jun');
    expect(mount.innerHTML).toContain('Dec');
    expect(mount.innerHTML).toContain('Total');
  });

  it('switches system scope and re-renders', () => {
    const mount = elementMap.get('simulation-workspace-mount');
    const simUI = new SimulationWorkspaceUI(mount, store);

    const sys = store.addSystem('Rooftop Ph1');
    simUI.setSystem(sys.id);

    expect(mount.innerHTML).toContain('Energy Simulation &amp; Diurnal Dispatch');
  });

  it('triggers onOpenSolarYield and onOpenLoadProfile callbacks', () => {
    const onOpenSolarYield = vi.fn();
    const onOpenLoadProfile = vi.fn();

    const mount = elementMap.get('simulation-workspace-mount');
    new SimulationWorkspaceUI(mount, store, {
      onOpenSolarYield,
      onOpenLoadProfile
    });

    const btnYield = elementMap.get('btn-sim-open-solar-yield');
    btnYield?.click();
    expect(onOpenSolarYield).toHaveBeenCalled();

    const btnLoad = elementMap.get('btn-sim-open-load-profile');
    btnLoad?.click();
    expect(onOpenLoadProfile).toHaveBeenCalled();
  });

  it('handles CSV export without crashing', () => {
    const mount = elementMap.get('simulation-workspace-mount');
    new SimulationWorkspaceUI(mount, store);

    const btnExport = elementMap.get('btn-sim-export-csv');
    expect(() => btnExport?.click()).not.toThrow();
  });

  it('breaks chart into distinct Solar Generation, Facility Load, and Combined Dispatch curves', () => {
    const mount = elementMap.get('simulation-workspace-mount');
    new SimulationWorkspaceUI(mount, store);

    expect(mount.innerHTML).toContain('1. SOLAR GENERATION CURVE');
    expect(mount.innerHTML).toContain('2. FACILITY LOAD DEMAND CURVE');
    expect(mount.innerHTML).toContain('3. COMBINED DISPATCH &amp; POWER BALANCE CURVE');
    expect(mount.innerHTML).toContain('eng-chart-xaxis-row');
    expect(mount.innerHTML).toContain('eng-chart-plot-row');
  });

  it('renders 24-hour diurnal dispatch calculation table with mathematical formulas', () => {
    const mount = elementMap.get('simulation-workspace-mount');
    new SimulationWorkspaceUI(mount, store);

    expect(mount.innerHTML).toContain('24-HOUR HOURLY DIURNAL DISPATCH &amp; POWER MATCHING (CALCULATIONS TABLE)');
    expect(mount.innerHTML).toContain('P<sub>self</sub> = min(P<sub>pv</sub>, P<sub>load</sub>)');
    expect(mount.innerHTML).toContain('P<sub>export</sub> = max(0, P<sub>pv</sub> - P<sub>load</sub>)');
    expect(mount.innerHTML).toContain('P<sub>import</sub> = max(0, P<sub>load</sub> - P<sub>pv</sub>)');
    expect(mount.innerHTML).toContain('00:00');
    expect(mount.innerHTML).toContain('12:00');
    expect(mount.innerHTML).toContain('23:00');
    expect(mount.innerHTML).toContain('&Sigma; 24-Hour Energy Balance');
  });

  it('renders net-billing financial calculation table with explicit formulas', () => {
    const mount = elementMap.get('simulation-workspace-mount');
    new SimulationWorkspaceUI(mount, store);

    expect(mount.innerHTML).toContain('NET-BILLING &amp; ECONOMIC IMPACT');
    expect(mount.innerHTML).toContain('Bill<sub>base</sub> = E<sub>load</sub> &times; T<sub>import</sub>');
    expect(mount.innerHTML).toContain('Bill<sub>net</sub> = max(0, Cost<sub>import</sub> - Credit<sub>export</sub>)');
    expect(mount.innerHTML).toContain('&Delta;Savings = Bill<sub>base</sub> - Bill<sub>net</sub>');
    expect(mount.innerHTML).toContain('Levelized Realized Value of Solar');
  });
});
