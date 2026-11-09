import { ProjectStore } from '../store/projectStore';
import { FirebaseSyncService, SyncStatus, CloudProjectSummary, CloudUser } from '../services/firebaseSync';
import { MapController } from '../map/mapController';
import { escapeHtml } from '../utils/html';

export class ProjectDropdownUI {
  private store: ProjectStore;
  private syncService: FirebaseSyncService;
  private mapController?: MapController;

  private syncPill: HTMLElement | null = null;
  private syncLabel: HTMLElement | null = null;
  private currentNameEl: HTMLElement | null = null;
  private btnDropdown: HTMLElement | null = null;
  private menuEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;

  private btnNewProject: HTMLElement | null = null;
  private btnRenameProject: HTMLElement | null = null;
  private btnDeleteProject: HTMLElement | null = null;
  private btnShareProject: HTMLButtonElement | null = null;
  private btnAuth: HTMLButtonElement | null = null;
  private currentUser: CloudUser | null = null;

  constructor(store: ProjectStore, syncService: FirebaseSyncService, mapController?: MapController) {
    this.store = store;
    this.syncService = syncService;
    this.mapController = mapController;

    this.bindDom();
    this.setupListeners();
  }

  private bindDom(): void {
    this.syncPill = document.getElementById('cloud-sync-status');
    this.syncLabel = document.getElementById('cloud-sync-label');
    this.currentNameEl = document.getElementById('current-project-name');
    this.btnDropdown = document.getElementById('btn-project-dropdown');
    this.menuEl = document.getElementById('project-dropdown-menu');
    this.listEl = document.getElementById('project-dropdown-list');

    this.btnNewProject = document.getElementById('btn-dropdown-new-project');
    this.btnRenameProject = document.getElementById('btn-dropdown-rename-project');
    this.btnDeleteProject = document.getElementById('btn-dropdown-delete-project');
    this.btnShareProject = document.getElementById('btn-dropdown-share-project') as HTMLButtonElement | null;
    this.btnAuth = document.getElementById('btn-cloud-auth') as HTMLButtonElement | null;
  }

  private setupListeners(): void {
    // Sync status updates
    this.syncService.onStatusChange(status => {
      this.updateSyncStatusUI(status);
    });

    // Signed-in account
    this.syncService.onAuthChange(user => {
      this.currentUser = user;
      this.updateAuthUI();
      this.renderProjectsList(this.syncService.getAvailableProjects());
    });

    this.btnAuth?.addEventListener('click', async () => {
      try {
        if (this.currentUser) {
          if (confirm(`Sign out ${this.currentUser.email ?? ''}? Cloud sync stops; your current project stays on this device.`)) {
            await this.syncService.signOut();
          }
        } else {
          await this.syncService.signIn();
        }
      } catch (err: any) {
        if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
          alert('Sign-in failed: ' + (err.message || err));
        }
      }
    });

    // Available projects list updates
    this.syncService.onProjectsListChange(projects => {
      this.renderProjectsList(projects);
      this.updateCurrentName();
      this.updateOwnerActions();
    });

    // Share project action (owner only)
    this.btnShareProject?.addEventListener('click', async () => {
      this.closeDropdown();
      if (!this.syncService.canManageActiveProject()) {
        alert('Only the project owner can change sharing.');
        return;
      }
      const current = this.syncService.getActiveProjectMembers().join(', ');
      const input = prompt(
        'Share this project with Google accounts (comma-separated emails).\nThey can view and edit it; only you can delete it or change sharing. Leave empty to stop sharing.',
        current
      );
      if (input === null) return;
      try {
        const members = await this.syncService.setActiveProjectMembers(input.split(/[,;\s]+/));
        alert(members.length ? `Shared with: ${members.join(', ')}` : 'Project is now private.');
      } catch (err: any) {
        alert('Could not update sharing: ' + (err.message || err));
      }
    });

    // Store updates (e.g. project name changed)
    this.store.subscribe(() => {
      this.updateCurrentName();
    });

    // Dropdown toggle
    this.btnDropdown?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (this.menuEl && !this.menuEl.contains(e.target as Node) && !this.btnDropdown?.contains(e.target as Node)) {
        this.menuEl.style.display = 'none';
      }
    });

    // New project action
    this.btnNewProject?.addEventListener('click', async () => {
      this.closeDropdown();
      const name = prompt('Enter new project name:', 'Solar Farm Phase 1');
      if (name && name.trim()) {
        try {
          await this.syncService.createProject(name.trim());
          if (this.mapController) {
            this.mapController.flyTo(this.store.center.lat, this.store.center.lng, this.store.zoom);
          }
        } catch (err: any) {
          alert('Failed to create project: ' + (err.message || err));
        }
      }
    });

    // Rename project action
    this.btnRenameProject?.addEventListener('click', () => {
      this.closeDropdown();
      const newName = prompt('Rename current project:', this.store.projectName);
      if (newName && newName.trim() && newName.trim() !== this.store.projectName) {
        this.store.setProjectName(newName.trim());
        this.updateCurrentName();
      }
    });

    // Delete project action
    this.btnDeleteProject?.addEventListener('click', async () => {
      this.closeDropdown();
      const currentId = this.syncService.getActiveProjectId();
      const confirmDelete = confirm(`Are you sure you want to delete project "${this.store.projectName}"? This action cannot be undone.`);
      if (confirmDelete) {
        try {
          await this.syncService.deleteProject(currentId);
        } catch (err: any) {
          alert('Cannot delete project: ' + (err.message || err));
        }
      }
    });
  }

  private toggleDropdown(): void {
    if (!this.menuEl) return;
    const isVisible = this.menuEl.style.display === 'flex';
    this.menuEl.style.display = isVisible ? 'none' : 'flex';
  }

  private closeDropdown(): void {
    if (this.menuEl) {
      this.menuEl.style.display = 'none';
    }
  }

  private updateSyncStatusUI(status: SyncStatus): void {
    if (!this.syncPill || !this.syncLabel) return;

    this.syncPill.className = `sync-status-pill sync-${status}`;
    switch (status) {
      case 'synced':
        this.syncLabel.textContent = '☁️ Synced';
        this.syncPill.title = 'Real-time sync active across all PCs';
        break;
      case 'syncing':
        this.syncLabel.textContent = '🔄 Syncing...';
        this.syncPill.title = 'Synchronizing with cloud...';
        break;
      case 'offline':
        this.syncLabel.textContent = '⚠️ Offline';
        this.syncPill.title = 'Offline mode. Changes saved locally.';
        break;
      case 'error':
        this.syncLabel.textContent = '⚠️ Sync Error';
        this.syncPill.title = 'Cloud sync encountered an issue. Changes saved locally.';
        break;
      case 'signed-out':
        this.syncLabel.textContent = '💾 Local only';
        this.syncPill.title = 'Not signed in. Changes are saved on this device only. Sign in with Google to sync.';
        break;
    }
  }

  private updateAuthUI(): void {
    if (this.btnAuth) {
      if (this.currentUser) {
        this.btnAuth.textContent = `Sign out (${this.currentUser.email ?? this.currentUser.displayName ?? 'account'})`;
        this.btnAuth.title = 'Signed in with Google. Click to sign out.';
      } else {
        this.btnAuth.textContent = 'Sign in with Google';
        this.btnAuth.title = 'Sign in with Google to sync projects across devices';
      }
    }
    const signedIn = !!this.currentUser;
    for (const btn of [this.btnNewProject, this.btnShareProject, this.btnDeleteProject]) {
      if (btn) (btn as HTMLButtonElement).disabled = !signedIn;
    }
    this.updateOwnerActions();
  }

  /** Sharing and deletion are owner-only (also enforced by Firestore rules). */
  private updateOwnerActions(): void {
    const canManage = !!this.currentUser && this.syncService.canManageActiveProject();
    if (this.btnShareProject) this.btnShareProject.disabled = !canManage;
    if (this.btnDeleteProject) (this.btnDeleteProject as HTMLButtonElement).disabled = !canManage;
  }

  private updateCurrentName(): void {
    if (this.currentNameEl) {
      this.currentNameEl.textContent = this.store.projectName || 'Solar Geo Project';
    }
  }

  private renderProjectsList(projects: CloudProjectSummary[]): void {
    if (!this.listEl) return;
    const activeId = this.syncService.getActiveProjectId();

    if (projects.length === 0) {
      const message = this.currentUser
        ? 'No other projects found.'
        : 'Sign in with Google to sync and share projects. Until then, work is saved on this device only.';
      this.listEl.innerHTML = `
        <div style="padding: 10px 12px; font-size: 11px; color: var(--text-dim); text-align: center;">
          ${message}
        </div>
      `;
      return;
    }

    this.listEl.innerHTML = projects.map(p => {
      const isActive = p.id === activeId;
      const formattedDate = new Date(p.updatedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      return `
        <button class="project-dropdown-item ${isActive ? 'active' : ''}" data-project-id="${escapeHtml(p.id)}">
          <div style="overflow: hidden; text-overflow: ellipsis;">
            <div style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${isActive ? '✓ ' : ''}${escapeHtml(p.name)}
            </div>
            <div class="project-item-meta">
              ${p.isOwner ? '' : '👥 Shared • '}${p.zoneCount || 0} ${(p.zoneCount === 1 ? 'array' : 'arrays')} • ${(p.totalKwp || 0).toFixed(1)} kWp • ${escapeHtml(formattedDate)}
            </div>
          </div>
        </button>
      `;
    }).join('');

    // Attach click listeners to switch projects
    this.listEl.querySelectorAll('.project-dropdown-item').forEach(itemEl => {
      itemEl.addEventListener('click', async () => {
        const targetId = (itemEl as HTMLElement).getAttribute('data-project-id');
        if (targetId && targetId !== activeId) {
          this.closeDropdown();
          await this.syncService.switchProject(targetId);
          if (this.mapController) {
            this.mapController.flyTo(this.store.center.lat, this.store.center.lng, this.store.zoom);
          }
        }
      });
    });
  }
}
