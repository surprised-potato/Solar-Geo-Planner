import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  collection,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
  Unsubscribe,
  Firestore
} from 'firebase/firestore';
import { ProjectStore } from '../store/projectStore';

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBc9QMiEAFiITtC22SM-NrGG4EeTQsyyLw",
  authDomain: "solar-geo-prt.firebaseapp.com",
  projectId: "solar-geo-prt",
  storageBucket: "solar-geo-prt.firebasestorage.app",
  messagingSenderId: "156014443244",
  appId: "1:156014443244:web:adaa480d4da9e920a543c9"
};

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export interface CloudProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  zoneCount: number;
  totalKwp: number;
}

export class FirebaseSyncService {
  private static instance: FirebaseSyncService | null = null;
  private db: Firestore | null = null;
  private store: ProjectStore | null = null;
  private activeProjectId: string = 'default';
  private activeProjectCreatedAt: string = new Date().toISOString();
  
  private status: SyncStatus = 'syncing';
  private statusListeners: Array<(status: SyncStatus) => void> = [];
  private projectsListListeners: Array<(projects: CloudProjectSummary[]) => void> = [];

  private unsubDoc: Unsubscribe | null = null;
  private unsubCol: Unsubscribe | null = null;
  private debounceTimer: any = null;
  private lastSyncedJson: string = '';
  private isApplyingRemoteUpdate: boolean = false;
  private availableProjects: CloudProjectSummary[] = [];

  private constructor() {
    this.initFirebase();
  }

  public static getInstance(): FirebaseSyncService {
    if (!FirebaseSyncService.instance) {
      FirebaseSyncService.instance = new FirebaseSyncService();
    }
    return FirebaseSyncService.instance;
  }

  private initFirebase(): void {
    try {
      const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
      this.db = getFirestore(app);
    } catch (err) {
      console.warn('[FirebaseSync] Firebase initialization failed:', err);
      this.setStatus('offline');
    }
  }

  public setStatus(status: SyncStatus): void {
    this.status = status;
    this.statusListeners.forEach(listener => listener(status));
  }

  public getStatus(): SyncStatus {
    return this.status;
  }

  public getActiveProjectId(): string {
    return this.activeProjectId;
  }

  public getAvailableProjects(): CloudProjectSummary[] {
    return this.availableProjects;
  }

  public onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.statusListeners.push(callback);
    callback(this.status);
    return () => {
      this.statusListeners = this.statusListeners.filter(cb => cb !== callback);
    };
  }

  public onProjectsListChange(callback: (projects: CloudProjectSummary[]) => void): () => void {
    this.projectsListListeners.push(callback);
    callback(this.availableProjects);
    return () => {
      this.projectsListListeners = this.projectsListListeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Connects the ProjectStore with Firestore real-time cloud synchronization.
   */
  public connect(
    store: ProjectStore,
    initialProjectId?: string,
    onRemoteLoad?: (center: { lat: number; lng: number }, zoom: number) => void
  ): void {
    this.store = store;

    // Detect projectId from URL parameter, local storage, or default
    const urlParams = new URLSearchParams(window.location.search);
    const paramProjectId = urlParams.get('project');
    const storedProjectId = localStorage.getItem('solar_geo_active_project_id');
    const targetProjectId = initialProjectId || paramProjectId || storedProjectId || 'default';

    this.activeProjectId = targetProjectId;
    localStorage.setItem('solar_geo_active_project_id', this.activeProjectId);

    if (!this.db) {
      this.setStatus('offline');
      return;
    }

    // Subscribe to store changes to push local edits to the cloud
    this.store.subscribe(() => {
      if (this.isApplyingRemoteUpdate) return;
      if (!this.store) return;

      const currentJson = this.store.exportProjectJson();
      if (currentJson === this.lastSyncedJson) return;

      this.scheduleCloudPush();
    });

    // Start listening to the projects collection (for project switcher / list)
    this.listenToProjectsCollection();

    // Start listening to the active project document (for real-time multi-PC syncing)
    this.subscribeToActiveProject(this.activeProjectId, onRemoteLoad);
  }

  private listenToProjectsCollection(): void {
    if (!this.db) return;
    if (this.unsubCol) this.unsubCol();

    try {
      const colRef = collection(this.db, 'projects');
      this.unsubCol = onSnapshot(colRef, (snapshot) => {
        const list: CloudProjectSummary[] = [];
        snapshot.forEach(docSnap => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            name: d.name || 'Untitled Project',
            createdAt: d.createdAt || new Date().toISOString(),
            updatedAt: d.updatedAt || new Date().toISOString(),
            zoneCount: typeof d.zoneCount === 'number' ? d.zoneCount : 0,
            totalKwp: typeof d.totalKwp === 'number' ? d.totalKwp : 0
          });
        });

        // Sort by updatedAt descending
        list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        this.availableProjects = list;
        this.projectsListListeners.forEach(cb => cb(list));
      }, (err) => {
        console.warn('[FirebaseSync] Error listening to projects collection:', err);
      });
    } catch (err) {
      console.warn('[FirebaseSync] Failed to listen to collection:', err);
    }
  }

  private subscribeToActiveProject(
    projectId: string,
    onRemoteLoad?: (center: { lat: number; lng: number }, zoom: number) => void
  ): void {
    if (!this.db || !this.store) return;
    if (this.unsubDoc) {
      this.unsubDoc();
      this.unsubDoc = null;
    }

    this.setStatus('syncing');
    const docRef = doc(this.db, 'projects', projectId);

    this.unsubDoc = onSnapshot(docRef, async (docSnap) => {
      if (!this.store) return;

      if (!docSnap.exists()) {
        // Document does not exist yet in Firestore — push initial local state
        await this.pushCurrentStoreToCloud(true);
        this.setStatus('synced');
        return;
      }

      const docData = docSnap.data();
      const remoteJson = docData?.dataJson;
      if (docData?.createdAt) {
        this.activeProjectCreatedAt = docData.createdAt;
      }

      if (remoteJson && remoteJson !== this.lastSyncedJson) {
        // Only apply if it represents a different state
        const localJson = this.store.exportProjectJson();
        if (remoteJson !== localJson) {
          try {
            this.isApplyingRemoteUpdate = true;
            this.lastSyncedJson = remoteJson;
            const ok = this.store.importProjectJson(remoteJson);
            if (ok) {
              this.updateUrlParam(projectId);
              if (onRemoteLoad) {
                onRemoteLoad(this.store.center, this.store.zoom);
              }
            }
          } catch (e) {
            console.error('[FirebaseSync] Error applying remote update:', e);
          } finally {
            this.isApplyingRemoteUpdate = false;
          }
        } else {
          this.lastSyncedJson = remoteJson;
        }
      }
      this.setStatus('synced');
    }, (err) => {
      console.error('[FirebaseSync] Project document subscription error:', err);
      this.setStatus('error');
    });
  }

  private scheduleCloudPush(): void {
    this.setStatus('syncing');
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    // Debounce writes (500ms) to batch rapid mouse movements or slider inputs
    this.debounceTimer = setTimeout(() => {
      this.pushCurrentStoreToCloud(false);
    }, 500);
  }

  private async pushCurrentStoreToCloud(isInitial: boolean = false): Promise<void> {
    if (!this.db || !this.store) return;

    try {
      const currentJson = this.store.exportProjectJson();
      const stats = this.store.getSystemSummary();
      const nowIso = new Date().toISOString();

      if (isInitial && !this.activeProjectCreatedAt) {
        this.activeProjectCreatedAt = nowIso;
      }

      const docRef = doc(this.db, 'projects', this.activeProjectId);
      await setDoc(docRef, {
        id: this.activeProjectId,
        name: this.store.projectName || 'Solar Geo Project',
        createdAt: this.activeProjectCreatedAt,
        updatedAt: nowIso,
        dataJson: currentJson,
        zoneCount: this.store.getZones().length,
        totalKwp: stats.totalKwp
      });

      this.lastSyncedJson = currentJson;
      this.setStatus('synced');
    } catch (err) {
      console.error('[FirebaseSync] Failed to push project to cloud:', err);
      this.setStatus('error');
    }
  }

  /**
   * Switch the active project. Loads data from Firestore in real-time.
   */
  public async switchProject(projectId: string): Promise<boolean> {
    if (projectId === this.activeProjectId) return true;
    if (!this.db || !this.store) return false;

    this.setStatus('syncing');
    this.activeProjectId = projectId;
    localStorage.setItem('solar_geo_active_project_id', projectId);
    this.updateUrlParam(projectId);

    // Fetch once to populate immediately, then keep subscribed
    try {
      const docRef = doc(this.db, 'projects', projectId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const d = snap.data();
        if (d.dataJson) {
          this.isApplyingRemoteUpdate = true;
          this.lastSyncedJson = d.dataJson;
          this.store.importProjectJson(d.dataJson);
          this.isApplyingRemoteUpdate = false;
        }
      }
    } catch (e) {
      console.warn('[FirebaseSync] Error fetching project for switch:', e);
    }

    this.subscribeToActiveProject(projectId);
    return true;
  }

  /**
   * Create a new empty or named project and switch to it.
   */
  public async createProject(name: string): Promise<string> {
    if (!this.db || !this.store) throw new Error('Firestore not initialized');

    const cleanName = name.trim() || 'New Solar Project';
    const id = 'proj_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const nowIso = new Date().toISOString();

    // Clear current store and set new project name
    this.store.clearAll();
    this.store.projectName = cleanName;
    const currentJson = this.store.exportProjectJson();

    const docRef = doc(this.db, 'projects', id);
    await setDoc(docRef, {
      id,
      name: cleanName,
      createdAt: nowIso,
      updatedAt: nowIso,
      dataJson: currentJson,
      zoneCount: 0,
      totalKwp: 0
    });

    await this.switchProject(id);
    return id;
  }

  /**
   * Delete a project document.
   */
  public async deleteProject(projectId: string): Promise<void> {
    if (!this.db) return;
    if (this.availableProjects.length <= 1) {
      throw new Error('Cannot delete the only remaining project');
    }

    const docRef = doc(this.db, 'projects', projectId);
    await deleteDoc(docRef);

    // If we just deleted the active project, switch to the first remaining one
    if (projectId === this.activeProjectId) {
      const remaining = this.availableProjects.find(p => p.id !== projectId);
      if (remaining) {
        await this.switchProject(remaining.id);
      }
    }
  }

  private updateUrlParam(projectId: string): void {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('project', projectId);
      window.history.replaceState({}, '', url.toString());
    } catch (e) {
      // Ignore in non-browser or iframe contexts
    }
  }
}
