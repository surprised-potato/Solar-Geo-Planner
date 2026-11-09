import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectStore } from './projectStore';

const params = {
  anchor: { lat: 15.0, lng: 120.5 },
  headingDeg: 0,
  lengthM: 60,
  widthM: 14,
  roofPitchDeg: 15,
  count: 2,
  gapM: 10
};

describe('poultry houses in ProjectStore', () => {
  let store: ProjectStore;

  beforeEach(() => {
    try { localStorage.clear(); } catch { /* no localStorage */ }
    store = new ProjectStore();
    store.clearAll();
  });

  it('adds N houses, each with 2 roof-plane zones, under a new farm section', () => {
    const houses = store.addPoultryHouses(params);
    expect(houses).toHaveLength(2);
    expect(store.sections.size).toBe(1);
    const section = [...store.sections.values()][0];
    expect(section.code).toBe('A');
    expect(section.kind).toBe('farm');
    expect(store.zones.size).toBe(4);
    for (const h of houses) {
      expect(h.sectionId).toBe(section.id);
      expect(h.zoneIds).toHaveLength(2);
      const [a, b] = h.zoneIds.map(id => store.zones.get(id)!);
      expect(a.config.mountType).toBe('roof');
      expect(a.config.tiltDeg).toBe(15);
      expect(a.config.azimuthDeg).toBe(90);
      expect(b.config.azimuthDeg).toBe(270);
      expect(a.panelCount).toBeGreaterThan(0);
    }
  });

  it('uses the next farm code for a second farm and numbers houses per farm', () => {
    store.addPoultryHouses(params);
    const second = store.addPoultryHouses({ ...params, count: 1 });
    const sections = [...store.sections.values()];
    expect(sections.map(s => s.code)).toEqual(['A', 'B']);
    expect(second[0].name).toBe('B-House 1');
  });

  it('removes a deleted zone from its building', () => {
    const [house] = store.addPoultryHouses(params);
    const [first, second] = house.zoneIds;
    store.removeZone(first);
    expect(store.buildings.get(house.id)!.zoneIds).toEqual([second]);
  });

  it('round-trips sections and buildings through export and import', () => {
    const houses = store.addPoultryHouses(params);
    const json = store.exportProjectJson(true);

    const restored = new ProjectStore();
    restored.clearAll();
    expect(restored.importProjectJson(json)).toBe(true);
    expect(restored.sections.size).toBe(1);
    expect(restored.buildings.size).toBe(2);
    const b = restored.buildings.get(houses[0].id)!;
    expect(b.zoneIds).toEqual(houses[0].zoneIds);
    expect(b.roofType).toBe('corrugated_metal');
    expect(b.corrosionClass).toBe('ammonia_humid');
    expect(b.ridgeHeightM).toBeGreaterThan(b.eaveHeightM);
  });
});
