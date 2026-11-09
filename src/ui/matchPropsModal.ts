import { ProjectStore, MatchPropertiesOptions, DEFAULT_MATCH_PROPS_OPTIONS } from '../store/projectStore';
import { MapController } from '../map/mapController';
import { getCompassHeading } from '../geo/projection';
import { escapeHtml } from '../utils/html';
import { enableBackdropDismiss } from '../utils/dialog';

export class MatchPropsModalUI {
  private dialog: HTMLDialogElement;
  private store: ProjectStore;
  private mapController?: MapController;

  private selectedSourceId: string = '';
  private selectedTargetIds: Set<string> = new Set();
  private options: MatchPropertiesOptions = { ...DEFAULT_MATCH_PROPS_OPTIONS };

  constructor(store: ProjectStore, mapController?: MapController) {
    this.store = store;
    this.mapController = mapController;

    let el = document.getElementById('matchPropsModal') as HTMLDialogElement;
    if (!el) {
      el = document.createElement('dialog');
      el.id = 'matchPropsModal';
      el.className = 'modal-dialog match-props-modal';
      el.setAttribute('closedby', 'any');
      el.setAttribute('aria-labelledby', 'matchPropsTitle');
      document.body.appendChild(el);
    }
    this.dialog = el;

    enableBackdropDismiss(this.dialog, () => this.close());
  }

  public open(sourceZoneId?: string): void {
    const zones = this.store.getZones();
    if (zones.length < 2) {
      alert('Match Properties requires at least 2 arrays in the project. Please draw another array first.');
      return;
    }

    if (sourceZoneId && this.store.getZone(sourceZoneId)) {
      this.selectedSourceId = sourceZoneId;
    } else if (this.store.selectedZoneId && this.store.getZone(this.store.selectedZoneId)) {
      this.selectedSourceId = this.store.selectedZoneId;
    } else {
      this.selectedSourceId = zones[0].id;
    }

    // Initialize selected target IDs: if multiple zones were selected, preselect other selected zones; otherwise select all other zones
    this.selectedTargetIds.clear();
    const currentSelectedZoneIds = this.store.getSelectedZoneIds();
    const otherSelected = currentSelectedZoneIds.filter(id => id !== this.selectedSourceId);
    if (otherSelected.length > 0) {
      otherSelected.forEach(id => this.selectedTargetIds.add(id));
    } else {
      zones.filter(z => z.id !== this.selectedSourceId).forEach(z => this.selectedTargetIds.add(z.id));
    }

    this.render();
    if (typeof this.dialog.showModal === 'function') {
      try {
        this.dialog.showModal();
      } catch {
        this.dialog.setAttribute('open', '');
      }
    } else {
      this.dialog.setAttribute('open', '');
    }
  }

  public close(): void {
    if (typeof this.dialog.close === 'function') {
      try {
        this.dialog.close();
      } catch {
        this.dialog.removeAttribute('open');
      }
    } else {
      this.dialog.removeAttribute('open');
    }
  }

  public getIsOpen(): boolean {
    return this.dialog.hasAttribute('open');
  }

  public render(): void {
    const zones = this.store.getZones();
    const sourceZone = this.store.getZone(this.selectedSourceId) || zones[0];
    if (!sourceZone) return;

    this.selectedSourceId = sourceZone.id;
    const sourceSys = this.store.getSystem(sourceZone.systemId);
    const sourceMod = this.store.getModule(sourceZone.moduleId);
    const sourceCfg = sourceZone.config;
    const targetZones = zones.filter(z => z.id !== sourceZone.id);

    // Format source specs preview
    const mountSummary = sourceCfg.mountType === 'ground'
      ? `Ground Mount (${sourceCfg.modulesPerTableUp || 2}×${sourceCfg.modulesPerTableWide || 14} Table &bull; ${sourceCfg.tableSpacingM ?? 1.0}m spacing)`
      : `Roof Mount (${sourceCfg.railCount || 2} Rails &bull; ${sourceCfg.railOverhangM ?? 0.10}m overhang)`;

    const compass = getCompassHeading(sourceCfg.azimuthDeg);

    this.dialog.innerHTML = `
      <div class="modal-content match-props-modal-content">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <h2 id="matchPropsTitle" style="font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 6px;">
              <span>🎨</span> Match Array Properties <span class="cad-val-chip highlight">MATCHPROP</span>
            </h2>
          </div>
          <button id="btn-close-match-props" class="btn-icon" aria-label="Close dialog">✕</button>
        </div>

        <div class="modal-body match-props-modal-body" style="padding: 16px; overflow-y: auto; max-height: calc(85vh - 120px);">
          <!-- Pod 1: Source Array Selection & Live Spec Card -->
          <div class="match-props-section">
            <div class="match-props-section-header">
              <span class="match-props-step-badge">STEP 1</span>
              <strong style="color: var(--text-main);">Select Source Array (Properties Origin)</strong>
            </div>
            <div style="display: flex; gap: 10px; align-items: center; margin-top: 6px;">
              <select id="match-props-source-select" class="cad-select-sm" style="flex: 1; font-weight: 600;" aria-label="Select Source Array">
                ${zones.map(z => `
                  <option value="${z.id}" ${z.id === sourceZone.id ? 'selected' : ''}>
                    ${escapeHtml(z.name)} [${escapeHtml(this.store.getSystem(z.systemId)?.name?.split(':')[0] || 'Sys')}] (${z.config.mountType.toUpperCase()} &bull; ${z.activePanelCount}p &bull; ${z.totalKwp} kWp)
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- Source Array Card -->
            <div class="match-props-source-card" style="margin-top: 8px;">
              <div class="source-card-header">
                <div>
                  <strong style="color: var(--accent-color, #38bdf8); font-size: 13px;">${escapeHtml(sourceZone.name)}</strong>
                  <span class="cad-val-chip" style="margin-left: 6px;">${escapeHtml(sourceSys?.name || 'Main System')}</span>
                </div>
                <span class="cad-pod-tag accent">${sourceCfg.mountType.toUpperCase()}</span>
              </div>
              <div class="source-card-grid">
                <div class="source-spec-item">
                  <span class="spec-label">Module:</span>
                  <span class="spec-val"><strong>${escapeHtml(sourceMod?.name || 'PV Module')}</strong> (${sourceCfg.electrical.nominalPowerW}W, ${sourceCfg.panelWidthMm}×${sourceCfg.panelLengthMm}mm)</span>
                </div>
                <div class="source-spec-item">
                  <span class="spec-label">Mounting:</span>
                  <span class="spec-val">${mountSummary}</span>
                </div>
                <div class="source-spec-item">
                  <span class="spec-label">Orientation & Tilt:</span>
                  <span class="spec-val"><strong>${sourceCfg.orientation.toUpperCase()}</strong> &bull; <strong>${sourceCfg.tiltDeg}°</strong> Tilt</span>
                </div>
                <div class="source-spec-item">
                  <span class="spec-label">Azimuth / Downslope:</span>
                  <span class="spec-val"><strong>${sourceCfg.azimuthDeg}°</strong> (${compass})</span>
                </div>
                <div class="source-spec-item">
                  <span class="spec-label">Spacing & Pitch:</span>
                  <span class="spec-val">Row: <strong>${sourceCfg.rowSpacingM.toFixed(2)}m</strong> &bull; Col: <strong>${sourceCfg.colSpacingM.toFixed(2)}m</strong></span>
                </div>
                <div class="source-spec-item">
                  <span class="spec-label">Setback & Traverse:</span>
                  <span class="spec-val">Setback: <strong>${sourceCfg.setbackM.toFixed(2)}m</strong> &bull; Wiring: <strong>${sourceCfg.stringTraverseDirection || 'short_side'}</strong></span>
                </div>
              </div>
            </div>
          </div>

          <!-- Pod 2: Property Checkboxes -->
          <div class="match-props-section" style="margin-top: 14px;">
            <div class="match-props-section-header" style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span class="match-props-step-badge">STEP 2</span>
                <strong style="color: var(--text-main);">Choose Properties to Match</strong>
              </div>
              <div style="display: flex; gap: 6px;">
                <button type="button" id="btn-match-props-all-props" class="btn btn-xs btn-outline">Check All</button>
                <button type="button" id="btn-match-props-none-props" class="btn btn-xs btn-outline">Clear All</button>
              </div>
            </div>

            <div class="match-props-checkbox-grid" style="margin-top: 8px;">
              <label class="match-props-check-item ${this.options.matchModule ? 'active' : ''}">
                <input type="checkbox" id="chk-mp-module" ${this.options.matchModule ? 'checked' : ''} />
                <div class="check-item-content">
                  <span class="check-item-title">⚡ Module Specs</span>
                  <span class="check-item-sub">Panel model, wattage (${sourceCfg.electrical.nominalPowerW}W), Voc, Vmp & outer dimensions</span>
                </div>
              </label>

              <label class="match-props-check-item ${this.options.matchMountType ? 'active' : ''}">
                <input type="checkbox" id="chk-mp-mount" ${this.options.matchMountType ? 'checked' : ''} />
                <div class="check-item-content">
                  <span class="check-item-title">🏗️ Mount Type & Racking</span>
                  <span class="check-item-sub">${sourceCfg.mountType === 'ground' ? 'Ground mount tables (rack dimensions & spacing)' : 'Roof mount rails (rail count & cantilever)'}</span>
                </div>
              </label>

              <label class="match-props-check-item ${this.options.matchOrientation ? 'active' : ''}">
                <input type="checkbox" id="chk-mp-orient" ${this.options.matchOrientation ? 'checked' : ''} />
                <div class="check-item-content">
                  <span class="check-item-title">📐 Panel Orientation</span>
                  <span class="check-item-sub">${sourceCfg.orientation.toUpperCase()}</span>
                </div>
              </label>

              <label class="match-props-check-item ${this.options.matchTilt ? 'active' : ''}">
                <input type="checkbox" id="chk-mp-tilt" ${this.options.matchTilt ? 'checked' : ''} />
                <div class="check-item-content">
                  <span class="check-item-title">📐 Tilt Angle</span>
                  <span class="check-item-sub">${sourceCfg.tiltDeg}° Tilt</span>
                </div>
              </label>

              <label class="match-props-check-item ${this.options.matchAzimuth ? 'active' : ''}">
                <input type="checkbox" id="chk-mp-azimuth" ${this.options.matchAzimuth ? 'checked' : ''} />
                <div class="check-item-content">
                  <span class="check-item-title">🧭 Azimuth Direction</span>
                  <span class="check-item-sub">${sourceCfg.azimuthDeg}° (${compass})</span>
                </div>
              </label>

              <label class="match-props-check-item ${this.options.matchSpacing ? 'active' : ''}">
                <input type="checkbox" id="chk-mp-spacing" ${this.options.matchSpacing ? 'checked' : ''} />
                <div class="check-item-content">
                  <span class="check-item-title">📏 Row & Col Spacing</span>
                  <span class="check-item-sub">Pitch: ${sourceCfg.rowSpacingM.toFixed(2)}m &bull; Gap: ${sourceCfg.colSpacingM.toFixed(2)}m</span>
                </div>
              </label>

              <label class="match-props-check-item ${this.options.matchSetback ? 'active' : ''}">
                <input type="checkbox" id="chk-mp-setback" ${this.options.matchSetback ? 'checked' : ''} />
                <div class="check-item-content">
                  <span class="check-item-title">🚫 Boundary Setback</span>
                  <span class="check-item-sub">${sourceCfg.setbackM.toFixed(2)}m from boundary edges</span>
                </div>
              </label>

              <label class="match-props-check-item ${this.options.matchTraverse ? 'active' : ''}">
                <input type="checkbox" id="chk-mp-traverse" ${this.options.matchTraverse ? 'checked' : ''} />
                <div class="check-item-content">
                  <span class="check-item-title">🔌 Stringing Traverse</span>
                  <span class="check-item-sub">${sourceCfg.stringTraverseDirection || 'short_side'} route</span>
                </div>
              </label>

              <label class="match-props-check-item ${this.options.matchSystem ? 'active' : ''}">
                <input type="checkbox" id="chk-mp-system" ${this.options.matchSystem ? 'checked' : ''} />
                <div class="check-item-content">
                  <span class="check-item-title">⚡ Electrical System Link</span>
                  <span class="check-item-sub">Re-link destination arrays to "${escapeHtml(sourceSys?.name || 'Source System')}"</span>
                </div>
              </label>

              <label class="match-props-check-item ${this.options.autoOptimize ? 'active' : ''}">
                <input type="checkbox" id="chk-mp-optimize" ${this.options.autoOptimize ? 'checked' : ''} />
                <div class="check-item-content">
                  <span class="check-item-title">✨ Auto-Optimize Shift</span>
                  <span class="check-item-sub">Automatically run grid phase shift optimizer to maximize panel count</span>
                </div>
              </label>
            </div>
          </div>

          <!-- Pod 3: Target Array Selection -->
          <div class="match-props-section" style="margin-top: 14px;">
            <div class="match-props-section-header" style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span class="match-props-step-badge">STEP 3</span>
                <strong style="color: var(--text-main);">Select Destination Arrays (${this.selectedTargetIds.size} of ${targetZones.length} selected)</strong>
              </div>
              <div style="display: flex; gap: 6px;">
                <button type="button" id="btn-match-props-all-targets" class="btn btn-xs btn-outline">All Other Arrays (${targetZones.length})</button>
                <button type="button" id="btn-match-props-same-sys-targets" class="btn btn-xs btn-outline">Same System</button>
                <button type="button" id="btn-match-props-clear-targets" class="btn btn-xs btn-outline">Clear</button>
              </div>
            </div>

            <div class="match-props-targets-list" style="margin-top: 8px;">
              ${targetZones.map(tz => {
                const isChecked = this.selectedTargetIds.has(tz.id);
                const tzSys = this.store.getSystem(tz.systemId);
                const tzMod = this.store.getModule(tz.moduleId);
                return `
                  <label class="match-props-target-row ${isChecked ? 'selected' : ''}">
                    <div style="display: flex; align-items: center; gap: 8px; flex: 1.5;">
                      <input type="checkbox" class="match-props-target-chk" data-target-id="${tz.id}" ${isChecked ? 'checked' : ''} />
                      <div>
                        <strong style="color: var(--text-main); font-size: 13px;">${escapeHtml(tz.name)}</strong>
                        <div style="font-size: 11px; color: var(--text-muted);">
                          System: <span style="color: ${tzSys?.color || '#38bdf8'}">${escapeHtml(tzSys?.name || 'Default System')}</span>
                        </div>
                      </div>
                    </div>
                    <div style="flex: 1.2; font-size: 11.5px; color: var(--text-muted);">
                      <div>Mount: <strong>${tz.config.mountType.toUpperCase()}</strong> &bull; ${escapeHtml(tzMod?.name?.split(' ')[0] || 'Mod')}</div>
                      <div>Orient: ${tz.config.orientation} &bull; ${tz.config.tiltDeg}° &bull; ${tz.config.azimuthDeg}°</div>
                    </div>
                    <div style="flex: 0.9; text-align: right; font-size: 12px;">
                      <span class="cad-val-chip highlight">${tz.activePanelCount} panels</span>
                      <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${tz.totalKwp} kWp</div>
                    </div>
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="modal-footer" style="padding: 12px 16px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: var(--bg-primary);">
          <button type="button" id="btn-match-props-pick-map" class="btn btn-sm btn-outline" title="Close dialog and click arrays directly on the satellite map to copy properties">
            <span>🎯</span> Pick on Map (Interactive Brush)
          </button>
          <div style="display: flex; gap: 8px;">
            <button type="button" id="btn-match-props-cancel" class="btn btn-sm btn-outline">Cancel</button>
            <button type="button" id="btn-match-props-apply" class="btn btn-sm btn-primary" ${this.selectedTargetIds.size === 0 ? 'disabled' : ''}>
              ✓ Apply Match Properties (${this.selectedTargetIds.size} ${this.selectedTargetIds.size === 1 ? 'array' : 'arrays'})
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    document.getElementById('btn-close-match-props')?.addEventListener('click', () => this.close());
    document.getElementById('btn-match-props-cancel')?.addEventListener('click', () => this.close());

    const sourceSelect = document.getElementById('match-props-source-select') as HTMLSelectElement;
    sourceSelect?.addEventListener('change', () => {
      this.selectedSourceId = sourceSelect.value;
      this.render();
    });

    // Property checkboxes listeners
    const bindOption = (elemId: string, optKey: keyof MatchPropertiesOptions) => {
      const chk = document.getElementById(elemId) as HTMLInputElement;
      chk?.addEventListener('change', () => {
        this.options[optKey] = chk.checked;
        const parent = chk.closest('.match-props-check-item');
        if (parent) parent.classList.toggle('active', chk.checked);
      });
    };

    bindOption('chk-mp-module', 'matchModule');
    bindOption('chk-mp-mount', 'matchMountType');
    bindOption('chk-mp-orient', 'matchOrientation');
    bindOption('chk-mp-tilt', 'matchTilt');
    bindOption('chk-mp-azimuth', 'matchAzimuth');
    bindOption('chk-mp-spacing', 'matchSpacing');
    bindOption('chk-mp-setback', 'matchSetback');
    bindOption('chk-mp-traverse', 'matchTraverse');
    bindOption('chk-mp-system', 'matchSystem');
    bindOption('chk-mp-optimize', 'autoOptimize');

    document.getElementById('btn-match-props-all-props')?.addEventListener('click', () => {
      this.setAllOptions(true);
      this.render();
    });

    document.getElementById('btn-match-props-none-props')?.addEventListener('click', () => {
      this.setAllOptions(false);
      this.render();
    });

    // Destination target selection
    this.dialog.querySelectorAll<HTMLInputElement>('.match-props-target-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const targetId = chk.getAttribute('data-target-id');
        if (targetId) {
          if (chk.checked) {
            this.selectedTargetIds.add(targetId);
          } else {
            this.selectedTargetIds.delete(targetId);
          }
          const row = chk.closest('.match-props-target-row');
          if (row) row.classList.toggle('selected', chk.checked);

          const btnApply = document.getElementById('btn-match-props-apply') as HTMLButtonElement;
          if (btnApply) {
            btnApply.disabled = this.selectedTargetIds.size === 0;
            btnApply.textContent = `✓ Apply Match Properties (${this.selectedTargetIds.size} ${this.selectedTargetIds.size === 1 ? 'array' : 'arrays'})`;
          }
        }
      });
    });

    document.getElementById('btn-match-props-all-targets')?.addEventListener('click', () => {
      const zones = this.store.getZones().filter(z => z.id !== this.selectedSourceId);
      zones.forEach(z => this.selectedTargetIds.add(z.id));
      this.render();
    });

    document.getElementById('btn-match-props-same-sys-targets')?.addEventListener('click', () => {
      const srcZone = this.store.getZone(this.selectedSourceId);
      if (srcZone) {
        this.selectedTargetIds.clear();
        this.store.getZones()
          .filter(z => z.id !== srcZone.id && z.systemId === srcZone.systemId)
          .forEach(z => this.selectedTargetIds.add(z.id));
        this.render();
      }
    });

    document.getElementById('btn-match-props-clear-targets')?.addEventListener('click', () => {
      this.selectedTargetIds.clear();
      this.render();
    });

    // Apply button
    document.getElementById('btn-match-props-apply')?.addEventListener('click', () => {
      if (this.selectedTargetIds.size === 0) return;
      const targetIds = Array.from(this.selectedTargetIds);
      const res = this.store.matchZoneProperties(this.selectedSourceId, targetIds, this.options);

      if (res.success) {
        const srcZone = this.store.getZone(this.selectedSourceId);
        this.close();
        alert(
          `🎉 Match Properties Applied!\n\n` +
          `Source Array: "${srcZone?.name || 'Source'}"\n` +
          `Updated Arrays (${res.matchedCount}):\n • ${res.targetNames.join('\n • ')}\n\n` +
          `All matching geometry, racking, and electrical capacities have been regenerated.`
        );
      }
    });

    // Interactive Pick on Map button
    document.getElementById('btn-match-props-pick-map')?.addEventListener('click', () => {
      this.store.matchPropsOptions = { ...this.options };
      this.store.setMatchPropsMode(true, this.selectedSourceId);
      if (this.mapController) {
        this.mapController.zoomToZone(this.selectedSourceId);
      }
      this.close();
    });
  }

  private setAllOptions(val: boolean): void {
    this.options.matchModule = val;
    this.options.matchMountType = val;
    this.options.matchOrientation = val;
    this.options.matchAzimuth = val;
    this.options.matchTilt = val;
    this.options.matchSpacing = val;
    this.options.matchSetback = val;
    this.options.matchTraverse = val;
    // Keep system re-link opt-in unless explicitly checked
    this.options.matchSystem = false;
    this.options.autoOptimize = val;
  }
}
