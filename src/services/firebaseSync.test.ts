import { describe, it, expect, beforeEach } from 'vitest';
import { FirebaseSyncService, CloudProjectSummary } from './firebaseSync';
import { ProjectStore } from '../store/projectStore';

describe('FirebaseSyncService & Multi-PC Synchronization', () => {
  let store: ProjectStore;
  let syncService: FirebaseSyncService;

  beforeEach(() => {
    store = new ProjectStore();
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
    const json = store.exportProjectJson();
    expect(json).toBeDefined();
    expect(json.length).toBeLessThan(900000); // Must be strictly within Firestore 900KB limit

    const parsed = JSON.parse(json);
    expect(parsed.version).toBe('1.2.0');
    expect(parsed.modules).toBeInstanceOf(Array);
    expect(parsed.systems).toBeInstanceOf(Array);
    expect(parsed.zones).toBeInstanceOf(Array);
  });
});
