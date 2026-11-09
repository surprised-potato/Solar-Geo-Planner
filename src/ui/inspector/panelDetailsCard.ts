/**
 * Inspector for a selected solar panel: identity, electrical specs, string routing and neighbor navigation.
 */
import { ProjectStore } from '../../store/projectStore';
import { escapeHtml } from '../../utils/html';
import type { InspectorUI } from '../inspector';

export function renderPanelDetails(this: InspectorUI, panel: NonNullable<ReturnType<ProjectStore['getSelectedPanel']>>): void {
  const zone = this.store.getZone(panel.zoneId);
  const system = this.store.getSystem(panel.systemId);
  const mod = this.store.getModule(panel.moduleId);
  const strCables = panel.stringId ? this.store.getStringCables(panel.systemId) : [];
  const strCable = panel.stringId ? strCables.find(s => s.stringId === panel.stringId) : undefined;

  this.container.innerHTML = `
    <div class="inspector-card panel-details-card">
      <!-- Inspector Header -->
      <div class="inspector-header">
        <div class="title-with-badge">
          <span class="header-icon">☀️</span>
          <h3>Module Object</h3>
          <span class="status-pill ${panel.active ? 'active' : 'disabled'}" id="inspector-panel-status">
            ${panel.active ? 'ACTIVE' : 'DISABLED'}
          </span>
        </div>
        <div class="header-tools">
          <button type="button" id="btn-inspector-zoom-panel" class="btn-icon" title="Center map on this solar panel" aria-label="Center on panel">
            🎯
          </button>
          <button type="button" id="btn-minimize-inspector" class="btn-icon" title="Minimize inspector" aria-label="Minimize Inspector">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button type="button" id="btn-close-inspector" class="btn-icon danger" title="Deselect panel" aria-label="Deselect panel">✕</button>
        </div>
      </div>

      <!-- Panel ID & Context Banner -->
      <div class="panel-id-banner">
        <div class="id-wrapper">
          <span class="id-label">OBJECT ID</span>
          <code class="panel-code">${panel.id}</code>
        </div>
        <div class="banner-quick-actions">
          <button type="button" id="btn-copy-panel-id" class="btn-xs btn-outline" title="Copy panel ID to clipboard">📋 Copy</button>
          <button type="button" id="btn-inspector-zoom-zone" class="btn-xs btn-outline" style="border-color: ${zone?.color || '#38bdf8'};" title="Zoom map to fit this array">
            ${zone?.config.mountType === 'ground' ? '🌱' : '🏠'} ${escapeHtml(zone?.name || panel.zoneId)}
          </button>
        </div>
      </div>

      <!-- Scrollable Inspector Content Pods -->
      <div class="inspector-sections">
        <!-- Pod 1: Grid Coordinates & Geometry -->
        <div class="inspector-section-pod">
          <div class="pod-header">
            <span class="pod-title">📍 GRID & GEOMETRY</span>
            <span class="pod-badge highlight">Row ${panel.rowIndex} • Col ${panel.colIndex}</span>
          </div>
          <div class="pod-body-table">
            <div class="stat-row">
              <span>Model:</span>
              <strong style="color: var(--accent-amber);">${escapeHtml(mod?.name || 'Standard 600W Bifacial')}</strong>
            </div>
            <div class="stat-row">
              <span>System:</span>
              <span class="system-inline-pill" style="border-color: ${system?.color || '#0284c7'};">
                <span class="system-color-dot" style="background-color: ${system?.color || '#0284c7'};"></span>
                ${escapeHtml(system?.name || panel.systemId)}
              </span>
            </div>
            <div class="stat-row">
              <span>Centroid:</span>
              <div class="coord-tag">
                <small>${panel.centroid.lat.toFixed(6)}, ${panel.centroid.lng.toFixed(6)}</small>
                <button type="button" id="btn-copy-coords" class="btn-icon xs" title="Copy coordinates">📋</button>
              </div>
            </div>
            <div class="stat-row">
              <span>Dimensions:</span>
              <strong>${panel.widthM.toFixed(2)}m W × ${panel.lengthM.toFixed(2)}m L</strong>
            </div>
            <div class="stat-row">
              <span>Tilt & Footprint:</span>
              <strong>${panel.tiltDeg}° tilt (${panel.projectedDepthM.toFixed(2)}m ground footprint)</strong>
            </div>
            <div class="stat-row">
              <span>Azimuth / Compass:</span>
              <strong>${panel.azimuthDeg}° (${panel.orientation})</strong>
            </div>
          </div>
        </div>

        <!-- Pod 2: STC Electrical Specs -->
        <div class="inspector-section-pod">
          <div class="pod-header">
            <span class="pod-title">⚡ ELECTRICAL SPECS (STC)</span>
            <span class="pod-badge accent">${panel.electrical.nominalPowerW} Wp</span>
          </div>
          <div class="pod-body-grid-2">
            <div class="mini-spec-box">
              <span class="spec-label">Voc</span>
              <span class="spec-val">${panel.electrical.voc} <small>V</small></span>
            </div>
            <div class="mini-spec-box">
              <span class="spec-label">Vmp</span>
              <span class="spec-val">${panel.electrical.vmp} <small>V</small></span>
            </div>
            <div class="mini-spec-box">
              <span class="spec-label">Isc</span>
              <span class="spec-val">${panel.electrical.isc} <small>A</small></span>
            </div>
            <div class="mini-spec-box">
              <span class="spec-label">Imp</span>
              <span class="spec-val">${panel.electrical.imp.toFixed(2)} <small>A</small></span>
            </div>
          </div>
        </div>

        <!-- Pod: Roof Rails & Racking (for Roof Mount) -->
        ${
          zone?.config.mountType === 'roof'
            ? `
        <div class="inspector-section-pod">
          <div class="pod-header">
            <span class="pod-title">🛤️ ROOF RAILS & RACKING</span>
            <span class="pod-badge accent">${(zone.config.railCount ?? 2) === 3 ? '3 Rails' : '2 Rails'}</span>
          </div>
          <div class="pod-body-table">
            <div class="stat-row">
              <span>Racking Layout:</span>
              <strong style="color: #38bdf8;">Parallel to Short Side</strong>
            </div>
            <div class="stat-row">
              <span>Rail Direction:</span>
              <strong>${zone.config.orientation === 'portrait' ? 'Horizontal (along Row)' : 'Vertical (along Slope)'}</strong>
            </div>
            <div class="stat-row">
              <span>Parallel Rails:</span>
              <div class="segmented-control small" style="margin: 0; display: inline-flex; gap: 4px;">
                <button type="button" class="btn-xs ${(zone.config.railCount ?? 2) === 2 ? 'btn-primary' : 'btn-outline'}" id="inspector-rails-2">2 Rails</button>
                <button type="button" class="btn-xs ${(zone.config.railCount ?? 2) === 3 ? 'btn-primary' : 'btn-outline'}" id="inspector-rails-3">3 Rails</button>
              </div>
            </div>
            <div class="stat-row">
              <span>Array Total Rails:</span>
              <strong>${zone.railCount || (zone.rails ? zone.rails.length : 0)} rails (${(zone.rails ? zone.rails.reduce((acc, r) => acc + r.lengthM, 0) : 0).toFixed(1)}m)</strong>
            </div>
          </div>
        </div>
        `
            : ''
        }

        <!-- Pod 3: Directional Compass D-Pad ("Stringing Neighbors") -->
        <div class="inspector-section-pod">
          <div class="pod-header">
            <span class="pod-title">🧭 STRINGING NEIGHBORS</span>
            <span class="pod-badge">Topology D-Pad</span>
          </div>
          <div class="pod-body-center">
            <div class="compass-dpad">
              <!-- North Slot -->
              <div class="dpad-slot north">
                <span class="dpad-dir-label">NORTH</span>
                ${
                  panel.neighbors.north
                    ? `<button type="button" class="btn-jump-panel" data-dir="north" data-panel-id="${panel.neighbors.north}" title="Jump to North module (${panel.neighbors.north})">↑ Row ${panel.rowIndex - 1}</button>`
                    : '<span class="dpad-edge-pill">Edge</span>'
                }
              </div>

              <!-- Middle Row (West, Current, East) -->
              <div class="dpad-row">
                <div class="dpad-slot west">
                  <span class="dpad-dir-label">WEST</span>
                  ${
                    panel.neighbors.west
                      ? `<button type="button" class="btn-jump-panel" data-dir="west" data-panel-id="${panel.neighbors.west}" title="Jump to West module (${panel.neighbors.west})">← Col ${panel.colIndex - 1}</button>`
                      : '<span class="dpad-edge-pill">Edge</span>'
                  }
                </div>
                <div class="dpad-slot current-panel">
                  <span class="dpad-current-label">SELECTED</span>
                  <strong>R${panel.rowIndex}C${panel.colIndex}</strong>
                </div>
                <div class="dpad-slot east">
                  <span class="dpad-dir-label">EAST</span>
                  ${
                    panel.neighbors.east
                      ? `<button type="button" class="btn-jump-panel" data-dir="east" data-panel-id="${panel.neighbors.east}" title="Jump to East module (${panel.neighbors.east})">Col ${panel.colIndex + 1} →</button>`
                      : '<span class="dpad-edge-pill">Edge</span>'
                  }
                </div>
              </div>

              <!-- South Slot -->
              <div class="dpad-slot south">
                ${
                  panel.neighbors.south
                    ? `<button type="button" class="btn-jump-panel" data-dir="south" data-panel-id="${panel.neighbors.south}" title="Jump to South module (${panel.neighbors.south})">↓ Row ${panel.rowIndex + 1}</button>`
                    : '<span class="dpad-edge-pill">Edge</span>'
                }
                <span class="dpad-dir-label">SOUTH</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Pod 4: PV Stringing & Circuit Allocation -->
        <div class="inspector-section-pod">
          <div class="pod-header">
            <span class="pod-title">🔌 PV STRINGING & INVERTER</span>
            <span class="pod-badge ${panel.stringId ? 'highlight' : 'warning'}">
              ${panel.stringId ? 'MAPPED' : 'UNSTRINGED'}
            </span>
          </div>
          <div class="pod-body-table">
            <div class="cad-input-row">
              <label for="panel-string-id" class="input-inline-label">String ID:</label>
              <div class="cad-input-unit-wrap flex-1">
                <input type="text" id="panel-string-id" class="cad-text-input-sm" placeholder="e.g. STR-01" value="${panel.stringId || ''}" />
              </div>
              ${
                panel.stringId
                  ? `<button type="button" id="btn-inspector-zoom-string" class="btn-xs btn-outline" title="Zoom map to view entire string polyline">🎯 String</button>`
                  : ''
              }
            </div>

            <div class="cad-input-row">
              <label for="panel-string-order" class="input-inline-label">Sequence #:</label>
              <div class="cad-input-unit-wrap sm">
                <input type="number" id="panel-string-order" class="cad-num-input" min="1" placeholder="1" value="${panel.stringOrder || ''}" />
                <span class="cad-unit-addon">pos</span>
              </div>
              <button type="button" id="btn-string-inc" class="btn-xs btn-outline" title="Increment sequence number by 1">+1 Next</button>
            </div>

            ${
              typeof panel.inverterIndex === 'number'
                ? `
              <div class="stat-row">
                <span>Assigned Inverter:</span>
                <strong style="color: var(--accent-blue);">Inverter #${panel.inverterIndex + 1}</strong>
              </div>
            `
                : ''
            }

            ${
              panel.mpptId
                ? `
              <div class="stat-row">
                <span>MPPT Channel:</span>
                <strong style="color: var(--accent-green);">${panel.mpptId}</strong>
              </div>
            `
                : ''
            }

            ${
              strCable
                ? `
              <div class="cable-telemetry-box">
                <div class="stat-row highlight">
                  <span>String Total Wire:</span>
                  <strong style="color: var(--accent-green);">${strCable.totalStringCableM} m</strong>
                </div>
                <div class="stat-row">
                  <span>Intra-String:</span>
                  <span>${strCable.intraStringLengthM} m</span>
                </div>
                <div class="stat-row">
                  <span>Homerun (+ / -):</span>
                  <span>${strCable.homerunPositiveM}m / ${strCable.homerunNegativeM}m</span>
                </div>
                ${
                  strCable.hasRaceway
                    ? `
                  <div class="stat-row">
                    <span>Raceway Run:</span>
                    <strong style="color: var(--accent-amber);">${strCable.racewayPathLengthM ?? 0} m</strong>
                  </div>
                `
                    : ''
                }
                <div class="stat-row">
                  <span>Elevation Riser (&Delta;h):</span>
                  <span>${strCable.elevationDeltaM} m</span>
                </div>
              </div>
            `
                : ''
            }
          </div>
        </div>
      </div>

      <!-- Sticky Action Footer -->
      <div class="inspector-actions">
        <button type="button" id="btn-toggle-active" class="btn ${panel.active ? 'btn-outline warning' : 'btn-primary'}">
          <span>${panel.active ? '⛔' : '✅'}</span>
          ${panel.active ? 'Deactivate Module' : 'Activate Module'}
        </button>
        <button type="button" id="btn-remove-panel" class="btn btn-outline danger" title="Remove this module from the array layout">
          <span>🗑️</span> Delete
        </button>
      </div>
    </div>
  `;

  // Lock and restore scroll position so the card stays completely static
  const newCard = this.container.querySelector<HTMLElement>('.inspector-card');
  if (newCard && !newCard.classList.contains('inspector-minimized')) {
    newCard.addEventListener(
      'scroll',
      () => {
        this.lastScrollTop = newCard.scrollTop;
      },
      { passive: true }
    );

    if (this.lastScrollTop > 0) {
      newCard.scrollTop = this.lastScrollTop;
      requestAnimationFrame(() => {
        if (newCard) newCard.scrollTop = this.lastScrollTop;
      });
    }
  }

  this.attachPanelListeners(panel.id);

  // If a neighbor direction button was clicked, maintain focus without triggering auto-scroll
  if (this.lastClickedDirection) {
    const nextBtn = this.container.querySelector<HTMLButtonElement>(
      `.btn-jump-panel[data-dir="${this.lastClickedDirection}"]`
    );
    if (nextBtn) {
      try {
        nextBtn.focus({ preventScroll: true });
      } catch (_) {}
    }
    this.lastClickedDirection = null;
  }
}

export function attachPanelListeners(this: InspectorUI, panelId: string): void {
  document.getElementById('btn-minimize-inspector')?.addEventListener('click', () => {
    this.toggleMinimize();
  });

  document.getElementById('btn-close-inspector')?.addEventListener('click', () => {
    this.lastScrollTop = 0;
    this.lastClickedDirection = null;
    this.store.selectPanel(null);
  });

  document.getElementById('btn-inspector-zoom-panel')?.addEventListener('click', () => {
    this.mapController?.zoomToPanel(panelId);
  });

  document.getElementById('btn-inspector-zoom-zone')?.addEventListener('click', () => {
    const p = this.store.getPanel(panelId);
    if (p) {
      this.mapController?.zoomToZone(p.zoneId);
    }
  });

  document.getElementById('inspector-rails-2')?.addEventListener('click', () => {
    const p = this.store.getPanel(panelId);
    if (p) {
      this.store.updateZoneConfig(p.zoneId, { railCount: 2 });
    }
  });

  document.getElementById('inspector-rails-3')?.addEventListener('click', () => {
    const p = this.store.getPanel(panelId);
    if (p) {
      this.store.updateZoneConfig(p.zoneId, { railCount: 3 });
    }
  });

  document.getElementById('btn-inspector-zoom-string')?.addEventListener('click', () => {
    const p = this.store.getPanel(panelId);
    if (p?.stringId) {
      this.mapController?.zoomToString(p.stringId, p.systemId);
    }
  });

  document.getElementById('btn-copy-panel-id')?.addEventListener('click', e => {
    navigator.clipboard?.writeText(panelId);
    const btn = e.currentTarget as HTMLButtonElement;
    const originalText = btn.innerHTML;
    btn.innerHTML = '✓ Copied';
    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 1500);
  });

  document.getElementById('btn-copy-coords')?.addEventListener('click', e => {
    const p = this.store.getPanel(panelId);
    if (p) {
      const text = `${p.centroid.lat.toFixed(6)}, ${p.centroid.lng.toFixed(6)}`;
      navigator.clipboard?.writeText(text);
      const btn = e.currentTarget as HTMLButtonElement;
      const originalText = btn.innerHTML;
      btn.innerHTML = '✓';
      setTimeout(() => {
        btn.innerHTML = originalText;
      }, 1500);
    }
  });

  document.getElementById('btn-toggle-active')?.addEventListener('click', () => {
    const card = this.container.querySelector<HTMLElement>('.inspector-card');
    if (card) {
      this.lastScrollTop = card.scrollTop;
    }
    this.store.togglePanelActive(panelId);
  });

  document.getElementById('btn-remove-panel')?.addEventListener('click', () => {
    if (confirm('Delete this individual solar panel module from the layout?')) {
      this.lastScrollTop = 0;
      this.store.removePanel(panelId);
    }
  });

  // Jump to neighbor button (preserve scroll position and track direction)
  this.container.querySelectorAll<HTMLButtonElement>('.btn-jump-panel').forEach(btn => {
    btn.addEventListener('click', e => {
      const targetBtn = e.currentTarget as HTMLButtonElement;
      const id = targetBtn.getAttribute('data-panel-id');
      const dir = targetBtn.getAttribute('data-dir');
      if (id) {
        const card = this.container.querySelector<HTMLElement>('.inspector-card');
        if (card) {
          this.lastScrollTop = card.scrollTop;
        }
        this.lastClickedDirection = dir;
        this.store.selectPanel(id);
        this.mapController?.zoomToPanel(id);
      }
    });
  });

  // String ID & sequence inputs
  const strInput = document.getElementById('panel-string-id') as HTMLInputElement;
  const orderInput = document.getElementById('panel-string-order') as HTMLInputElement;

  const syncStringing = () => {
    const stringId = strInput.value.trim() || null;
    const order = orderInput.value ? Number(orderInput.value) : null;
    this.store.updatePanelString(panelId, stringId, order);
  };

  strInput?.addEventListener('change', syncStringing);
  orderInput?.addEventListener('change', syncStringing);

  document.getElementById('btn-string-inc')?.addEventListener('click', () => {
    const cur = orderInput.value ? Number(orderInput.value) : 0;
    orderInput.value = String(cur + 1);
    syncStringing();
  });
}
