import { describe, it, expect, beforeEach } from 'vitest';
import { FirebaseSyncService, CloudProjectSummary } from './firebaseSync';
import { ProjectStore } from '../store/projectStore';
import { localMetricToLatLng } from '../geo/projection';

describe('FirebaseSyncService & Multi-PC Synchronization', () => {
  let store: ProjectStore;
  let syncService: FirebaseSyncService;

  beforeEach(() => {
    store = new ProjectStore();
    store.clearAll();
    syncService = FirebaseSyncService.getInstance();
  });

  it('initializes with a valid default sync state', () => {
    expect(syncService).toBeDefined();
    expect(syncService.getActiveProjectId()).toBeDefined();
    expect(['synced', 'syncing', 'offline', 'error']).toContain(syncService.getStatus());
  });

  it('notifies status listeners when sync status updates', () => {
    const statuses: string[] = [];
    const unsubscribe = syncService.onStatusChange(s => statuses.push(s));

    syncService.setStatus('syncing');
    syncService.setStatus('synced');

    expect(statuses).toContain('syncing');
    expect(statuses).toContain('synced');
    unsubscribe();
  });

  it('manages available project list notifications', () => {
    let latestList: CloudProjectSummary[] = [];
    const unsubscribe = syncService.onProjectsListChange(list => {
      latestList = list;
    });

    expect(Array.isArray(latestList)).toBe(true);
    unsubscribe();
  });

  it('ensures project state export round-trip matches cloud JSON payload schema', () => {
    const json = store.exportProjectJson(true);
    expect(json).toBeDefined();
    expect(json.length).toBeLessThan(900000); // Must be strictly within Firestore limit

    const parsed = JSON.parse(json);
    expect(parsed.version).toBe('1.2.0');
    expect(parsed.modules).toBeInstanceOf(Array);
    expect(parsed.systems).toBeInstanceOf(Array);
    expect(parsed.zones).toBeInstanceOf(Array);
  });

  it('compacts large 10+ roof array projects (e.g. Riverside) well below Firestore size limits and restores full geometry on import', () => {
    const origin = { lat: 10.683, lng: 122.957 };
    const sysId = store.getSystems()[0].id;

    // Create 12 roof arrays (Roof Array 1 .. Roof Array 12) with ~600 panels total
    for (let i = 0; i < 12; i++) {
      const offsetX = (i % 4) * 30;
      const offsetY = Math.floor(i / 4) * 25;
      const vertices = [
        localMetricToLatLng({ x: offsetX, y: offsetY }, origin),
        localMetricToLatLng({ x: offsetX + 22, y: offsetY }, origin),
        localMetricToLatLng({ x: offsetX + 22, y: offsetY + 16 }, origin),
        localMetricToLatLng({ x: offsetX, y: offsetY + 16 }, origin)
      ];
      store.addZone(vertices, 'roof', `Roof Array ${i + 1}`, sysId);
    }

    store.autoStringSystem(sysId);

    const fullJson = store.exportProjectJson(false);
    const compactJson = store.exportProjectJson(true);

    // Compact JSON must be drastically smaller and well under 250KB even for 12 arrays
    expect(compactJson.length).toBeLessThan(fullJson.length * 0.25);
    expect(compactJson.length).toBeLessThan(250000);

    // Comparable payload must match between full and compact formats
    expect(syncService.getComparablePayload(compactJson)).toBe(syncService.getComparablePayload(fullJson));

    // Re-importing compact JSON must reconstruct all 12 zones, rails, panels, corners, and strings
    const restoredStore = new ProjectStore();
    restoredStore.clearAll();
    const ok = restoredStore.importProjectJson(compactJson);
    expect(ok).toBe(true);
    expect(restoredStore.getZones().length).toBe(12);
    expect(restoredStore.getPanels().length).toBe(store.getPanels().length);
    expect(restoredStore.getSystemSummary().totalKwp).toBeCloseTo(store.getSystemSummary().totalKwp, 2);

    const zone10 = restoredStore.getZones().find(z => z.name === 'Roof Array 10');
    expect(zone10).toBeDefined();
    expect(zone10?.rails?.length).toBeGreaterThan(0);

    const restoredPanels = restoredStore.getPanelsForZone(zone10!.id);
    expect(restoredPanels.length).toBeGreaterThan(0);
    expect(restoredPanels[0].corners.length).toBe(4);
    expect(restoredPanels[0].electrical.nominalPowerW).toBeGreaterThan(0);
    expect(restoredPanels[0].stringId).toBeTruthy();
  });
});
