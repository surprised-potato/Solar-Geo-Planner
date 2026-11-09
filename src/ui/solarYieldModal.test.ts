import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectStore } from '../store/projectStore';
import { SolarYieldModalUI } from './solarYieldModal';

describe('SolarYieldModalUI', () => {
  let store: ProjectStore;
  let elementMap: Map<string, any>;
  let windowListeners: Map<string, Function[]>;

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
    windowListeners = new Map();

    const mockBody = createMockElement('body');
    mockBody.appendChild = vi.fn((node: any) => {
      elementMap.set(node.id, node);
      return node;
    });
    mockBody.contains = vi.fn((node: any) => elementMap.has(node.id));

    (globalThis as any).document = {
      body: mockBody,
      createElement: (tag: string) => createMockElement(`mock-${Math.random()}`, tag),
      getElementById: (id: string) => elementMap.get(id) || null,
      querySelectorAll: () => []
    };

    (globalThis as any).window = {
      addEventListener: vi.fn((event, cb) => {
        if (!windowListeners.has(event)) windowListeners.set(event, []);
        windowListeners.get(event)!.push(cb);
      }),
      removeEventListener: vi.fn((event, cb) => {
        const list = windowListeners.get(event) || [];
        windowListeners.set(event, list.filter(fn => fn !== cb));
      }),
      dispatchEvent: (evt: any) => {
        const list = windowListeners.get(evt.type) || [];
        list.forEach(cb => cb(evt));
      }
    };

    store = new ProjectStore();
    store.clearAll();
  });

  it('initializes backdrop in DOM with custom-modal-backdrop class', () => {
    new SolarYieldModalUI(store);
    const backdrop = elementMap.get('solar-yield-modal-backdrop');
    expect(backdrop).toBeDefined();
    expect(backdrop?.className).toBe('custom-modal-backdrop');
    expect(backdrop?.style.display).toBe('none');
  });

  it('opens and displays flex when open() is called', () => {
    const modalUI = new SolarYieldModalUI(store);
    modalUI.open();
    const backdrop = elementMap.get('solar-yield-modal-backdrop');
    expect(backdrop?.style.display).toBe('flex');
    expect(backdrop?.innerHTML).toContain('Solar Yield &amp; System Simulations');
    expect(backdrop?.innerHTML).toContain('ESTIMATED ANNUAL YIELD');
    expect(backdrop?.innerHTML).toContain('SPECIFIC ANNUAL YIELD');
    expect(backdrop?.innerHTML).toContain('SYSTEM LOSS CASCADE');
  });

  it('renders simulations tab with combined solar & load, RE share, import/export, and diurnal curves', () => {
    const modalUI = new SolarYieldModalUI(store);
    modalUI.open(undefined, 'simulation');
    const backdrop = elementMap.get('solar-yield-modal-backdrop');
    expect(backdrop?.style.display).toBe('flex');
    expect(backdrop?.innerHTML).toContain('RENEWABLE ENERGY (RE) SHARE');
    expect(backdrop?.innerHTML).toContain('DIRECT SOLAR SELF-CONSUMPTION');
    expect(backdrop?.innerHTML).toContain('GRID ENERGY EXPORT');
    expect(backdrop?.innerHTML).toContain('GRID ENERGY IMPORT');
    expect(backdrop?.innerHTML).toContain('24-HOUR HOURLY DIURNAL DISPATCH CURVE');
    expect(backdrop?.innerHTML).toContain('12-MONTH ENERGY BALANCE');
  });

  it('closes when close button is clicked', () => {
    const modalUI = new SolarYieldModalUI(store);
    modalUI.open();
    const backdrop = elementMap.get('solar-yield-modal-backdrop');
    expect(backdrop?.style.display).toBe('flex');

    const closeBtn = elementMap.get('btn-close-yield-modal');
    closeBtn?.click();
    expect(backdrop?.style.display).toBe('none');
  });

  it('closes when Escape key is pressed', () => {
    const modalUI = new SolarYieldModalUI(store);
    modalUI.open();
    const backdrop = elementMap.get('solar-yield-modal-backdrop');
    expect(backdrop?.style.display).toBe('flex');

    (globalThis as any).window.dispatchEvent({ type: 'keydown', key: 'Escape' });
    expect(backdrop?.style.display).toBe('none');
  });

  it('closes when clicking backdrop overlay', () => {
    const modalUI = new SolarYieldModalUI(store);
    modalUI.open();
    const backdrop = elementMap.get('solar-yield-modal-backdrop');
    expect(backdrop?.style.display).toBe('flex');

    backdrop?.click();
    expect(backdrop?.style.display).toBe('none');
  });
});
