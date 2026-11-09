import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  collection,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
  updateDoc,
  query,
  where,
  Unsubscribe,
  Firestore,
  QuerySnapshot,
  DocumentData
} from 'firebase/firestore';
import { decodeProjectPayload, encodeProjectPayload } from './payloadCodec';
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  Auth,
  User
} from 'firebase/auth';
import { ProjectStore } from '../store/projectStore';

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBc9QMiEAFiITtC22SM-NrGG4EeTQsyyLw",
  authDomain: "solar-geo-prt.firebaseapp.com",
  projectId: "solar-geo-prt",
  storageBucket: "solar-geo-prt.firebasestorage.app",
  messagingSenderId: "156014443244",
  appId: "1:156014443244:web:adaa480d4da9e920a543c9"
};

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error' | 'signed-out';

export interface CloudUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

const MAX_MEMBERS = 50;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower-cases, trims, validates and de-duplicates a list of emails for project sharing. */
export function normalizeMemberEmails(emails: string[]): string[] {
  const out = new Set<string>();
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (EMAIL_PATTERN.test(email)) out.add(email);
  }
  return Array.from(out).slice(0, MAX_MEMBERS);
}

export interface CloudProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  zoneCount: number;
  totalKwp: number;
  ownerUid: string;
  isOwner: boolean;
  memberEmails: string[];
}

export class FirebaseSyncService {
  private static instance: FirebaseSyncService | null = null;
  private db: Firestore | null = null;
  private auth: Auth | null = null;
  private user: User | null = null;
  private authListeners: Array<(user: CloudUser | null) => void> = [];
  private store: ProjectStore | null = null;
  private storeSubscribed = false;
  private onRemoteLoad?: (center: { lat: number; lng: number }, zoom: number) => void;
  private requestedProjectId: string | null = null;
  private activeProjectOwnerUid: string | null = null;
  private activeProjectId: string = 'default';
  private activeProjectCreatedAt: string = new Date().toISOString();
  private projectCreatedAtMap: Map<string, string> = new Map();
  
  private status: SyncStatus = 'syncing';
  private statusListeners: Array<(status: SyncStatus) => void> = [];
  private projectsListListeners: Array<(projects: CloudProjectSummary[]) => void> = [];

  private unsubDoc: Unsubscribe | null = null;
  private unsubCols: Unsubscribe[] = [];
  private ownedProjects: CloudProjectSummary[] = [];
  private sharedProjects: CloudProjectSummary[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSyncedJson: string = '';
  private lastSyncedComparableJson: string = '';
  private hasInitialLoadForProject: Set<string> = new Set();
  private isApplyingRemoteUpdate: boolean = false;
  private availableProjects: CloudProjectSummary[] = [];

  /**
   * Strips volatile timestamps, transient UI selection state, and derived geometry
   * so pure selection, clock ticks, or compact vs full JSON formats do not trigger
   * unnecessary cloud pushes or false remote diffs.
   */
  public getComparablePayload(jsonStr: string): string {
    if (!jsonStr) return '';
    try {
      const parsed = JSON.parse(jsonStr);
      delete parsed.createdAt;
      delete parsed.updatedAt;
      delete parsed.selectedZoneId;
      delete parsed.selectedSystemId;
      if (Array.isArray(parsed.zones)) {
        parsed.zones = parsed.zones.map((z: any) => {
          const { rails, tables, ...rest } = z;
          return rest;
        });
      }
      if (Array.isArray(parsed.panels)) {
        parsed.panels = parsed.panels.map((p: any) => {
          const slim: Record<string, any> = {
            id: p.id,
            zoneId: p.zoneId,
            rowIndex: p.rowIndex,
            colIndex: p.colIndex
          };
          if (p.active === false) slim.active = false;
          if (p.stringId) slim.stringId = p.stringId;
          if (p.stringOrder !== null && p.stringOrder !== undefined) slim.stringOrder = p.stringOrder;
          if (p.mpptId) slim.mpptId = p.mpptId;
          if (p.inverterIndex !== null && p.inverterIndex !== undefined) slim.inverterIndex = p.inverterIndex;
          return slim;
        });
      }
      return JSON.stringify(parsed);
    } catch {
      return jsonStr;
    }
  }

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
      this.auth = getAuth(app);
      onAuthStateChanged(this.auth, user => this.handleAuthChange(user));
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

  /** Currently signed-in Google account, or null when signed out. */
  public getCurrentUser(): CloudUser | null {
    return this.user ? { uid: this.user.uid, email: this.user.email, displayName: this.user.displayName } : null;
  }

  public onAuthChange(callback: (user: CloudUser | null) => void): () => void {
    this.authListeners.push(callback);
    callback(this.getCurrentUser());
    return () => {
      this.authListeners = this.authListeners.filter(cb => cb !== callback);
    };
  }

  /** Opens the Google sign-in popup. Cloud sync starts once auth state changes. */
  public async signIn(): Promise<void> {
    if (!this.auth) throw new Error('Firebase Auth is not available');
    await signInWithPopup(this.auth, new GoogleAuthProvider());
  }

  public async signOut(): Promise<void> {
    if (!this.auth) return;
    await firebaseSignOut(this.auth);
  }

  private handleAuthChange(user: User | null): void {
    const changed = this.user?.uid !== user?.uid;
    this.user = user;
    this.authListeners.forEach(cb => cb(this.getCurrentUser()));
    if (!changed || !this.store) return;
    if (user) {
      this.startSession();
    } else {
      this.stopSession();
    }
  }

  /** Each account gets its own default project document. */
  private getDefaultProjectId(): string {
    return this.user ? `default_${this.user.uid.replace(/[^A-Za-z0-9_-]/g, '')}` : 'default';
  }

  private isActiveProjectOwner(): boolean {
    return !!this.user && (this.activeProjectOwnerUid === null || this.activeProjectOwnerUid === this.user.uid);
  }

  /**
   * Connects the ProjectStore with Firestore real-time cloud synchronization.
   * Sync only runs while a user is signed in; otherwise the project stays local.
   */
  public connect(
    store: ProjectStore,
    initialProjectId?: string,
    onRemoteLoad?: (center: { lat: number; lng: number }, zoom: number) => void
  ): void {
    this.store = store;
    this.onRemoteLoad = onRemoteLoad;

    // Requested project from caller, URL parameter or last session; resolved once signed in
    const urlParams = new URLSearchParams(window.location.search);
    this.requestedProjectId =
      initialProjectId || urlParams.get('project') || localStorage.getItem('solar_geo_active_project_id');

    if (!this.db) {
      this.setStatus('offline');
      return;
    }

    if (!this.storeSubscribed) {
      this.storeSubscribed = true;
      // Subscribe to store changes to push local edits to the cloud
      this.store.subscribe(() => {
        if (this.isApplyingRemoteUpdate) return;
        if (!this.store || !this.user) return;

        const currentJson = this.store.exportProjectJson(true);
        if (currentJson === this.lastSyncedJson) return;

        const currentComparable = this.getComparablePayload(currentJson);
        if (currentComparable === this.lastSyncedComparableJson) return;

        this.scheduleCloudPush();
      });
    }

    if (this.user) {
      this.startSession();
    } else {
      this.setStatus('signed-out');
    }
  }

  private startSession(): void {
    if (!this.store || !this.user) return;
    this.activeProjectId = this.requestedProjectId || this.getDefaultProjectId();
    this.requestedProjectId = null;
    this.activeProjectOwnerUid = null;
    this.lastSyncedJson = '';
    this.lastSyncedComparableJson = '';
    localStorage.setItem('solar_geo_active_project_id', this.activeProjectId);

    // Project switcher list (owned + shared with me)
    this.listenToProjectsCollection();

    // Active project document (real-time multi-PC syncing)
    this.subscribeToActiveProject(this.activeProjectId, this.onRemoteLoad);
  }

  private stopSession(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    if (this.unsubDoc) this.unsubDoc();
    this.unsubDoc = null;
    this.unsubCols.forEach(unsub => unsub());
    this.unsubCols = [];
    this.ownedProjects = [];
    this.sharedProjects = [];
    this.publishProjectList();
    this.hasInitialLoadForProject.clear();
    this.activeProjectOwnerUid = null;
    this.setStatus('signed-out');
  }

  private listenToProjectsCollection(): void {
    if (!this.db || !this.user) return;
    this.unsubCols.forEach(unsub => unsub());
    this.unsubCols = [];

    // Security rules only allow list queries constrained to projects the user can access
    const colRef = collection(this.db, 'projects');
    const owned = query(colRef, where('ownerUid', '==', this.user.uid));
    this.unsubCols.push(onSnapshot(owned, snap => {
      this.ownedProjects = this.toSummaries(snap);
      this.publishProjectList();
    }, err => console.warn('[FirebaseSync] Error listening to owned projects:', err)));

    const email = this.user.email?.toLowerCase();
    if (email) {
      const shared = query(colRef, where('memberEmails', 'array-contains', email));
      this.unsubCols.push(onSnapshot(shared, snap => {
        this.sharedProjects = this.toSummaries(snap);
        this.publishProjectList();
      }, err => console.warn('[FirebaseSync] Error listening to shared projects:', err)));
    }
  }

  private toSummaries(snapshot: QuerySnapshot<DocumentData>): CloudProjectSummary[] {
    const list: CloudProjectSummary[] = [];
    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      if (d.createdAt) {
        this.projectCreatedAtMap.set(docSnap.id, String(d.createdAt));
      }
      const ownerUid = typeof d.ownerUid === 'string' ? d.ownerUid : '';
      list.push({
        id: docSnap.id,
        name: typeof d.name === 'string' && d.name ? d.name : 'Untitled Project',
        createdAt: d.createdAt || new Date().toISOString(),
        updatedAt: d.updatedAt || new Date().toISOString(),
        zoneCount: typeof d.zoneCount === 'number' ? d.zoneCount : 0,
        totalKwp: typeof d.totalKwp === 'number' ? d.totalKwp : 0,
        ownerUid,
        isOwner: !!this.user && ownerUid === this.user.uid,
        memberEmails: Array.isArray(d.memberEmails) ? d.memberEmails.filter((e: unknown) => typeof e === 'string') : []
      });
    });
    return list;
  }

  private publishProjectList(): void {
    const byId = new Map<string, CloudProjectSummary>();
    for (const p of [...this.sharedProjects, ...this.ownedProjects]) byId.set(p.id, p);
    const list = Array.from(byId.values());
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    this.availableProjects = list;
    this.projectsListListeners.forEach(cb => cb(list));
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
      const remoteJson = docData?.dataJson ? decodeProjectPayload(docData.dataJson) : docData?.dataJson;
      this.activeProjectOwnerUid = typeof docData?.ownerUid === 'string' ? docData.ownerUid : null;
      if (docData?.createdAt) {
        this.activeProjectCreatedAt = String(docData.createdAt);
        this.projectCreatedAtMap.set(projectId, String(docData.createdAt));
      }

      // Ignore local latency-compensated echo snapshots from this client
      if (docSnap.metadata?.hasPendingWrites && this.hasInitialLoadForProject.has(projectId)) {
        if (remoteJson) {
          this.lastSyncedJson = remoteJson;
          this.lastSyncedComparableJson = this.getComparablePayload(remoteJson);
        }
        this.setStatus('synced');
        return;
      }

      if (remoteJson && remoteJson !== this.lastSyncedJson) {
        const remoteComparable = this.getComparablePayload(remoteJson);
        const localJson = this.store.exportProjectJson(true);
        const localComparable = this.getComparablePayload(localJson);

        if (remoteComparable !== this.lastSyncedComparableJson && remoteComparable !== localComparable) {
          try {
            const prevSelectedPanelId = this.store.selectedPanelId;
            this.isApplyingRemoteUpdate = true;
            this.lastSyncedJson = remoteJson;
            this.lastSyncedComparableJson = remoteComparable;
            const ok = this.store.importProjectJson(remoteJson);
            if (ok) {
              if (prevSelectedPanelId && this.store.getPanel(prevSelectedPanelId)) {
                this.store.selectPanel(prevSelectedPanelId);
              }
              this.updateUrlParam(projectId);
              if (onRemoteLoad && !this.hasInitialLoadForProject.has(projectId)) {
                this.hasInitialLoadForProject.add(projectId);
                onRemoteLoad(this.store.center, this.store.zoom);
              } else {
                this.hasInitialLoadForProject.add(projectId);
              }
            }
          } catch (e) {
            console.error('[FirebaseSync] Error applying remote update:', e);
          } finally {
            this.isApplyingRemoteUpdate = false;
          }
        } else {
          this.lastSyncedJson = remoteJson;
          this.lastSyncedComparableJson = remoteComparable;
          this.hasInitialLoadForProject.add(projectId);
        }
      } else {
        this.hasInitialLoadForProject.add(projectId);
      }
      this.setStatus('synced');
    }, (err) => {
      console.error('[FirebaseSync] Project document subscription error:', err);
      // Stale or foreign project ID (e.g. from another account's URL): fall back to own default project
      if ((err as { code?: string }).code === 'permission-denied' && projectId !== this.getDefaultProjectId()) {
        void this.switchProject(this.getDefaultProjectId());
        return;
      }
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
    if (!this.db || !this.store || !this.user) return;

    try {
      const currentJson = this.store.exportProjectJson(true);
      const currentComparable = this.getComparablePayload(currentJson);
      if (!isInitial && currentComparable === this.lastSyncedComparableJson) {
        this.lastSyncedJson = currentJson;
        this.setStatus('synced');
        return;
      }

      // Record synced state BEFORE setDoc so synchronous local onSnapshot does not treat our write as a remote update
      this.lastSyncedJson = currentJson;
      this.lastSyncedComparableJson = currentComparable;
      this.hasInitialLoadForProject.add(this.activeProjectId);

      const stats = this.store.getSystemSummary();
      const nowIso = new Date().toISOString();

      const cachedCreatedAt = this.projectCreatedAtMap.get(this.activeProjectId);
      const createdAtToUse = cachedCreatedAt || this.activeProjectCreatedAt || nowIso;
      this.activeProjectCreatedAt = createdAtToUse;
      this.projectCreatedAtMap.set(this.activeProjectId, createdAtToUse);

      const docRef = doc(this.db, 'projects', this.activeProjectId);
      // merge keeps owner-managed sharing (memberEmails) intact when a member saves
      await setDoc(docRef, {
        id: this.activeProjectId,
        ownerUid: this.activeProjectOwnerUid ?? this.user.uid,
        name: this.store.projectName || 'Solar Geo Project',
        createdAt: createdAtToUse,
        updatedAt: nowIso,
        dataJson: encodeProjectPayload(currentJson),
        zoneCount: this.store.getZones().length,
        totalKwp: stats.totalKwp
      }, { merge: true });
      if (!this.activeProjectOwnerUid) this.activeProjectOwnerUid = this.user.uid;

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
    if (projectId === this.activeProjectId && this.unsubDoc) return true;
    if (!this.db || !this.store || !this.user) return false;

    this.setStatus('syncing');
    this.activeProjectId = projectId;
    this.activeProjectOwnerUid = null;
    localStorage.setItem('solar_geo_active_project_id', projectId);
    this.updateUrlParam(projectId);

    // Fetch once to populate immediately, then keep subscribed
    try {
      const docRef = doc(this.db, 'projects', projectId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const d = snap.data();
        this.activeProjectOwnerUid = typeof d.ownerUid === 'string' ? d.ownerUid : null;
        if (d.createdAt) {
          this.activeProjectCreatedAt = String(d.createdAt);
          this.projectCreatedAtMap.set(projectId, String(d.createdAt));
        }
        if (d.dataJson) {
          const plainJson = decodeProjectPayload(d.dataJson);
          this.isApplyingRemoteUpdate = true;
          this.lastSyncedJson = plainJson;
          this.lastSyncedComparableJson = this.getComparablePayload(plainJson);
          this.hasInitialLoadForProject.add(projectId);
          this.store.importProjectJson(plainJson);
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
    if (!this.user) throw new Error('Sign in with Google to create cloud projects');

    const cleanName = name.trim() || 'New Solar Project';
    const id = 'proj_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const nowIso = new Date().toISOString();

    // Clear current store and set new project name
    this.store.clearAll();
    this.store.projectName = cleanName;
    const currentJson = this.store.exportProjectJson(true);

    this.activeProjectCreatedAt = nowIso;
    this.projectCreatedAtMap.set(id, nowIso);

    const docRef = doc(this.db, 'projects', id);
    await setDoc(docRef, {
      id,
      ownerUid: this.user.uid,
      memberEmails: [],
      name: cleanName,
      createdAt: nowIso,
      updatedAt: nowIso,
      dataJson: encodeProjectPayload(currentJson),
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
    if (!this.db || !this.user) return;
    const target = this.availableProjects.find(p => p.id === projectId);
    if (target && !target.isOwner) {
      throw new Error('Only the project owner can delete this project');
    }
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

  /** Whether the signed-in user owns the active project (owners manage sharing and deletion). */
  public canManageActiveProject(): boolean {
    return this.isActiveProjectOwner();
  }

  public getActiveProjectMembers(): string[] {
    return this.availableProjects.find(p => p.id === this.activeProjectId)?.memberEmails ?? [];
  }

  /** Replaces the list of Google account emails the active project is shared with (owner only). */
  public async setActiveProjectMembers(emails: string[]): Promise<string[]> {
    if (!this.db || !this.user) throw new Error('Sign in with Google to share projects');
    if (!this.isActiveProjectOwner()) throw new Error('Only the project owner can change sharing');
    const memberEmails = normalizeMemberEmails(emails);
    await updateDoc(doc(this.db, 'projects', this.activeProjectId), { memberEmails });
    return memberEmails;
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
