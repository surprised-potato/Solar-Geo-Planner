import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCardinalDirection } from '../geo/projection';
import { rowsToCsv, safeFileName, downloadText } from './download';
import { ProjectStore } from '../store/projectStore';
import { VIEW_PRESETS } from '../store/viewPresets';
import type { ViewPresetKey } from '../types/solar';
import { filterZones } from '../ui/registry/registryFilters';
import { unpricedTotals } from '../geo/boq/dupaMath';

describe('getCardinalDirection', () => {
  it('maps headings to 8 compass points with 22.5° boundaries', () => {
    expect(getCardinalDirection(0)).toBe('N');
    expect(getCardinalDirection(22.4)).toBe('N');
    expect(getCardinalDirection(22.5)).toBe('NE');
    expect(getCardinalDirection(180)).toBe('S');
    expect(getCardinalDirection(292.5)).toBe('NW');
    expect(getCardinalDirection(337.5)).toBe('N');
    expect(getCardinalDirection(-90)).toBe('W');
    expect(getCardinalDirection(450)).toBe('E');
  });
});

describe('download helpers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds quoted CSV and safe filenames', () => {
    expect(rowsToCsv([['a', 'b"c'], [1, 2]])).toBe('"a","b""c"\n"1","2"');
    expect(safeFileName('My Roof / East')).toBe('My_Roof___East');
    expect(safeFileName('', 'System')).toBe('System');
  });

  it('clicks a temporary anchor with the requested filename', () => {
    const anchor = { href: '', download: '', click: vi.fn() };
    const body = { appendChild: vi.fn(), removeChild: vi.fn() };
    vi.stubGlobal('document', { createElement: () => anchor, body });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() });
    downloadText('{}', 'p.json', 'application/json');
    expect(anchor.download).toBe('p.json');
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(body.appendChild).toHaveBeenCalledWith(anchor);
    expect(body.removeChild).toHaveBeenCalledWith(anchor);
  });
});

describe('view presets', () => {
  it('detects every preset right after applying it', () => {
    const store = new ProjectStore();
    for (const key of Object.keys(VIEW_PRESETS) as ViewPresetKey[]) {
      store.applyViewPreset(key);
      expect(store.getActiveViewPreset()).toBe(key);
    }
  });

  it('reports custom once a layer is toggled away from every preset', () => {
    const store = new ProjectStore();
    store.applyViewPreset('tracing');
    store.setViewFilter({ showRaceways: true });
    expect(store.getActiveViewPreset()).toBe('custom');
  });
});

describe('filterZones', () => {
  const zones = [
    { id: 'z1', name: 'North Roof', systemId: 's1' },
    { id: 'z2', name: 'Carport', systemId: 's2' }
  ] as never[];

  it('filters by search text and system', () => {
    expect(filterZones(zones, '', 'all')).toHaveLength(2);
    expect(filterZones(zones, 'north', 'all').map((z: { id: string }) => z.id)).toEqual(['z1']);
    expect(filterZones(zones, '', 's2').map((z: { id: string }) => z.id)).toEqual(['z2']);
    expect(filterZones(zones, 'north', 's2')).toHaveLength(0);
  });
});

describe('unpricedTotals', () => {
  it('zeroes every cost field and keeps the markup percentages', () => {
    const t = unpricedTotals(10, 8, 6);
    expect(t.ocmPercent).toBe(10);
    expect(t.profitPercent).toBe(8);
    expect(t.vatPercent).toBe(6);
    expect(t.totalItemCostPhp).toBe(0);
  });
});
