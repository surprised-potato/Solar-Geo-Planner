import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectStore } from './projectStore';
import { localMetricToLatLng } from '../geo/projection';
import { getSystemHomeruns, pickNearestHomerun } from '../geo/stringCabling';

describe('Multiple homeruns per system', () => {
  let store: ProjectStore;
  const origin = { lat: 37.7749, lng: -122.4194 };
  const line = (x: number, y: number, x2: number, y2: number) => [
    localMetricToLatLng({ x, y }, origin),
    localMetricToLatLng({ x: x2, y: y2 }, origin)
  ];

  beforeEach(() => {
    store = new ProjectStore();
    store.clearAll();
  });

  it('adds several trunks; the first is primary, others are extras', () => {
    const sysId = store.getSystems()[0].id;
    const a = store.addSystemHomerun(sysId, line(0, 0, 50, 0), 1)!;
    const b = store.addSystemHomerun(sysId, line(0, 100, 50, 100), 2)!;
    expect(a.id).not.toBe(b.id);
    expect(store.getSystemHomerun(sysId)?.id).toBe(a.id);
    expect(store.getSystemHomeruns(sysId).map(h => h.id)).toEqual([a.id, b.id]);
  });

  it('edits and deletes a single trunk by id', () => {
    const sysId = store.getSystems()[0].id;
    const a = store.addSystemHomerun(sysId, line(0, 0, 50, 0))!;
    const b = store.addSystemHomerun(sysId, line(0, 100, 50, 100))!;

    store.addSystemHomerunVertex(sysId, 0, localMetricToLatLng({ x: 25, y: 110 }, origin), b.id);
    expect(store.getSystemHomerun(sysId, b.id)!.path.length).toBe(3);
    expect(store.getSystemHomerun(sysId, a.id)!.path.length).toBe(2);

    store.setSystemHomerunElevation(sysId, 4, b.id);
    expect(store.getSystemHomerun(sysId, b.id)!.elevationChangeM).toBe(4);
    expect(store.getSystemHomerun(sysId, a.id)!.elevationChangeM).toBe(0);

    // Deleting the primary promotes the next trunk.
    store.clearSystemHomerun(sysId, a.id);
    expect(store.getSystemHomerun(sysId)?.id).toBe(b.id);
    expect(store.getSystemHomeruns(sysId).length).toBe(1);

    // Clearing without an id removes everything.
    store.addSystemHomerun(sysId, line(0, 200, 50, 200));
    store.clearSystemHomerun(sysId);
    expect(store.getSystemHomeruns(sysId)).toEqual([]);
    expect(store.getSystemHomerun(sysId)).toBeNull();
  });

  it('picks the nearest trunk and survives a project export/import', () => {
    const sysId = store.getSystems()[0].id;
    const a = store.addSystemHomerun(sysId, line(0, 0, 50, 0))!;
    const b = store.addSystemHomerun(sysId, line(0, 100, 50, 100))!;
    const near = (y: number) => localMetricToLatLng({ x: 25, y }, origin);

    const homeruns = getSystemHomeruns(store.getSystem(sysId));
    expect(pickNearestHomerun(homeruns, near(10))!.id).toBe(a.id);
    expect(pickNearestHomerun(homeruns, near(90))!.id).toBe(b.id);

    const copy = new ProjectStore();
    copy.importProjectJson(store.exportProjectJson());
    expect(copy.getSystemHomeruns(sysId).map(h => h.id)).toEqual([a.id, b.id]);
  });
});
