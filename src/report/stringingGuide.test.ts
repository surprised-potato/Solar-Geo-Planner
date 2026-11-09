import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectStore } from '../store/projectStore';
import { localMetricToLatLng } from '../geo/projection';
import { generateStringingGuidePdf, pickStringingPaper, MIN_PANEL_MM } from './stringingGuide';

describe('Array stringing guide', () => {
  const origin = { lat: 14.5995, lng: 120.9842 };
  let store: ProjectStore;

  const box = (x: number, y: number, w: number, h: number) =>
    [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h }
    ].map(p => localMetricToLatLng(p, origin));

  beforeEach(() => {
    store = new ProjectStore();
    store.clearAll();
    const sys1 = store.getSystems()[0].id;
    const sys2 = store.addSystem('Ground Phase 2').id;
    store.addZone(box(0, 0, 36, 22), 'roof', 'Roof A', sys1);
    store.addZone(box(0, 40, 30, 20), 'roof', 'Roof B', sys1);
    store.addZone(box(60, 0, 50, 40), 'ground', 'Ground A', sys2);
  });

  it('produces an overview, one sheet per array and a string schedule', () => {
    const doc = generateStringingGuidePdf(store, { reportDate: '2026-11-09' });
    // overview + 3 arrays + schedule at minimum (tables may add continuation pages)
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(5);
    expect(doc.output('blob').size).toBeGreaterThan(5000);
  });

  it('scopes to one system when asked', () => {
    const all = generateStringingGuidePdf(store, {});
    const sys2 = store.getSystems()[1].id;
    const one = generateStringingGuidePdf(store, { systemId: sys2 });
    expect(one.getNumberOfPages()).toBeLessThan(all.getNumberOfPages());
  });

  it('still renders when the project has no arrays', () => {
    const empty = new ProjectStore();
    empty.clearAll();
    const doc = generateStringingGuidePdf(empty, {});
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('moves to larger paper when modules would be too small to number', () => {
    // 2.4 m module on a 30 m wide array fits A4
    expect(pickStringingPaper(30, 20, 1.1).format).toBe('a4');
    // a 400 m wide array needs a bigger sheet to keep modules legible
    const big = pickStringingPaper(400, 250, 1.1);
    expect(['a3', 'a2']).toContain(big.format);
    const { format } = pickStringingPaper(120, 80, 1.1);
    expect(format).not.toBe('a4');
    expect(MIN_PANEL_MM).toBeGreaterThan(0);
  });
});
