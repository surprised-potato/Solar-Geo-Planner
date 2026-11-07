import L from 'leaflet';
import { ProjectStore } from '../store/projectStore';
import { MapController } from '../map/mapController';

export class InspectorUI {
  private container: HTMLElement;
  private store: ProjectStore;
  private mapController?: MapController;
  private isMinimized: boolean = false;
  private lastScrollTop: number = 0;
  private lastClickedDirection: string | null = null;

  constructor(containerId: string, store: ProjectStore, mapController?: MapController) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Element #${containerId} not found`);
    this.container = el;
    this.store = store;
    this.mapController = mapController;

    // Prevent Leaflet map from capturing wheel, touch, or click events inside inspector
    L.DomEvent.disableScrollPropagation(this.container);
    L.DomEvent.disableClickPropagation(this.container);
    this.container.addEventListener(
      'wheel',
      e => {
        e.stopPropagation();
      },
      { passive: true }
    );

    this.store.subscribe(() => this.render());
    this.render();
  }

  public toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
    this.render();
  }

  private render(): void {
    // Preserve scroll position of the inspector card before modifying DOM
    const prevCard = this.container.querySelector<HTMLElement>('.inspector-card');
    if (prevCard && !prevCard.classList.contains('inspector-minimized')) {
      this.lastScrollTop = prevCard.scrollTop;
    }

    const panel = this.store.getSelectedPanel();
    const currentSystem = this.store.getSelectedSystem();
    const sysSummary = currentSystem ? this.store.getSystemSummary(currentSystem.id) : null;
    const projectSummary = this.store.getSystemSummary();
    const sysCable = currentSystem ? this.store.getSystemCableSummary(currentSystem.id) : null;

    // Collapsed / Minimized HUD Pill State
    if (this.isMinimized) {
      this.container.innerHTML = `
        <div class="inspector-card inspector-minimized" title="Click to expand Object Inspector">
          <div class="minimized-pill-content">
            <span class="system-color-dot" style="background-color: ${currentSystem?.color || '#0284c7'};"></span>
            <span class="minimized-title">
              ${panel ? `Panel ${panel.id}` : (currentSystem?.name || 'System Scope')}
            </span>
            <span class="minimized-metric">
              ${panel ? `${panel.electrical.nominalPowerW}W` : `⚡ ${sysSummary?.totalKwp || 0} kWp`}
            </span>
            <button id="btn-expand-inspector" class="btn-minimized-expand" title="Expand Inspector" aria-label="Expand Inspector">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            </button>
          </div>
        </div>
      `;

      document.getElementById('btn-expand-inspector')?.addEventListener('click', e => {
        e.stopPropagation();
        this.toggleMinimize();
      });
      this.container.querySelector('.inspector-minimized')?.addEventListener('click', () => {
        this.toggleMinimize();
      });
      return;
    }

    // Context A: No Panel Selected -> System & Site Scope HUD
    if (!panel) {
      const linkedZones = currentSystem ? this.store.getZonesForSystem(currentSystem.id) : [];

      this.container.innerHTML = `
        <div class="inspector-card system-summary-card">
          <!-- Inspector Header -->
          <div class="inspector-header">
            <div class="title-with-badge">
              <span class="header-icon">⚡</span>
              <h3>System Scope</h3>
              <span class="system-color-dot" style="background-color: ${currentSystem?.color || '#0284c7'}; box-shadow: 0 0 6px ${currentSystem?.color || '#0284c7'}80;"></span>
            </div>
            <div class="header-tools">
              <button id="btn-minimize-inspector" class="btn-icon" title="Minimize to mini-dock" aria-label="Minimize Inspector">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>

          <!-- Active System Name Banner -->
          <div class="scope-name-banner">
            <div class="system-name-tag">
              <span class="scope-tag-label">ELECTRICAL SCOPE</span>
              <strong class="system-title">${currentSystem?.name || 'Default System'}</strong>
            </div>
            <span class="system-arrays-count">${linkedZones.length} ${linkedZones.length === 1 ? 'Array' : 'Arrays'}</span>
          </div>

          <!-- High-Impact Telemetry Metrics Grid -->
          <div class="metrics-grid">
            <div class="metric-item highlight" title="Peak direct current power generation of this system">
              <span class="m-label">DC Power</span>
              <span class="m-val">${sysSummary?.totalKwp || 0} <small>kWp</small></span>
              <span class="m-sub">${sysSummary?.totalActivePanels || 0} active panels</span>
            </div>
            <div class="metric-item accent" title="Inverter station rated AC grid output">
              <span class="m-label">AC Capacity</span>
              <span class="m-val">${sysSummary?.inverterAcKw || 0} <small>kW AC</small></span>
              <span class="m-sub">${currentSystem?.inverter.inverterCount || 1}×${currentSystem?.inverter.ratedAcPowerKw || 100}kW units</span>
            </div>
            <div class="metric-item ${sysSummary && sysSummary.dcAcRatio > 1.4 ? 'warning' : 'optimal'}" title="Direct-to-alternating current inverter loading ratio">
              <span class="m-label">DC/AC Loading</span>
              <span class="m-val">${sysSummary ? sysSummary.dcAcRatio.toFixed(2) : '1.00'}</span>
              <span class="m-sub">${sysSummary && sysSummary.dcAcRatio >= 1.1 && sysSummary.dcAcRatio <= 1.35 ? '⭐ Optimal' : 'Loading Factor'}</span>
            </div>
            <div class="metric-item" title="Total geographic panel collector surface area">
              <span class="m-label">Module Area</span>
              <span class="m-val">${sysSummary?.totalAreaSqM || 0} <small>m²</small></span>
              <span class="m-sub">Collector Footprint</span>
            </div>
          </div>

          <!-- Linked Arrays Section -->
          <div class="inspector-section-pod">
            <div class="pod-header">
              <span class="pod-title">LINKED ARRAYS (${linkedZones.length})</span>
              <span class="pod-badge">${linkedZones.reduce((sum, z) => sum + z.activePanelCount, 0)} Panels</span>
            </div>
            ${
              this.store.getSelectedZones().length > 1
                ? `
              <div class="inspector-batch-card">
                <div class="batch-card-header">
                  <span>✨ <strong>${this.store.getSelectedZones().length} Arrays Selected</strong></span>
                  <div style="display: flex; gap: 4px;">
                    <button id="btn-inspector-batch-delete" class="btn-xs btn-outline danger" title="Delete all selected arrays">🗑️ Delete</button>
                    <button id="btn-inspector-clear-sel" class="btn-xs btn-outline">Clear</button>
                  </div>
                </div>
                <div class="batch-quick-row">
                  <span class="batch-row-label">Batch Setback:</span>
                  <button class="btn-xs btn-outline btn-batch-setback" data-val="0.0">0m</button>
                  <button class="btn-xs btn-outline btn-batch-setback" data-val="0.5">0.5m</button>
                  <button class="btn-xs btn-outline btn-batch-setback" data-val="1.0">1.0m</button>
                  <button class="btn-xs btn-outline btn-batch-setback" data-val="1.5">1.5m</button>
                </div>
                <div class="batch-quick-row" style="margin-top: 6px;">
                  <button id="btn-inspector-batch-opt" class="btn-xs btn-primary full" title="Maximize fitted panels and auto-string electrical strings across selected arrays">⚡ Maximize & Auto-String ${this.store.getSelectedZones().length} Arrays</button>
                </div>
              </div>
            `
                : ''
            }
            <div class="linked-arrays-list">
              ${
                linkedZones.length > 0
                  ? linkedZones
                      .map(
                        z => `
                    <div class="linked-array-item ${this.store.isZoneSelected(z.id) ? 'selected' : ''}" data-zone-id="${z.id}">
                      <div class="array-item-left">
                        <input type="checkbox" class="chk-select-zone" data-zone-id="${z.id}" ${this.store.isZoneSelected(z.id) ? 'checked' : ''} title="Toggle selection for batch editing" />
                        <span class="array-mount-badge">${z.config.mountType === 'ground' ? '🌱' : '🏠'}</span>
                        <div class="array-item-info">
                          <span class="array-name">${z.name}</span>
                          <small class="array-meta">${z.activePanelCount} panels • ${z.totalKwp} kWp • Setback: ${z.config.setbackM}m</small>
                        </div>
                      </div>
                      <div style="display: flex; gap: 3px; align-items: center;">
                        <button class="btn-xs btn-outline btn-scope-zoom-zone" data-zone-id="${z.id}" title="Fit array in view">🎯</button>
                        <button class="btn-xs btn-outline danger btn-scope-del-zone" data-zone-id="${z.id}" title="Delete this array">🗑️</button>
                      </div>
                    </div>
                  `
                      )
                      .join('')
                  : `<div class="pod-empty-note">No arrays linked to this system yet. Click below to draft one.</div>`
              }
            </div>
          </div>

          <!-- Inverter & Cabling Telemetry Pod -->
          <div class="inspector-section-pod">
            <div class="pod-header">
              <span class="pod-title">INVERTER & DC INFRASTRUCTURE</span>
              <span class="pod-badge ${currentSystem?.inverterLocation ? 'highlight' : 'warning'}">
                ${currentSystem?.inverterLocation ? 'GEOLOCATED' : 'NOT PLACED'}
              </span>
            </div>
            <div class="pod-body-table">
              <div class="stat-row">
                <span>Inverter Station:</span>
                <strong>
                  ${
                    currentSystem?.inverterLocation
                      ? `${currentSystem.inverterLocation.lat.toFixed(5)}, ${currentSystem.inverterLocation.lng.toFixed(5)}`
                      : '<em class="text-dim">Not set on map</em>'
                  }
                </strong>
                ${
                  currentSystem?.inverterLocation
                    ? `<button id="btn-scope-zoom-inverter" class="btn-xs btn-outline icon-only" title="Zoom to Inverter Station">🎯</button>`
                    : ''
                }
              </div>
              <div class="stat-row">
                <span>Inverter Rating:</span>
                <strong>${currentSystem?.inverter.inverterCount || 1} × ${currentSystem?.inverter.ratedAcPowerKw || 100} kW (${sysSummary?.inverterAcKw || 0} kW AC)</strong>
              </div>
              <div class="stat-row">
                <span>Station Elevation:</span>
                <strong>${currentSystem?.inverterElevationM ?? 0} m</strong>
              </div>
              ${
                sysCable && sysCable.totalCableLengthM > 0
                  ? `
                <div class="stat-row">
                  <span>Total DC Wiring:</span>
                  <strong style="color: var(--accent-green);">${sysCable.totalCableLengthM} m</strong>
                </div>
                <div class="stat-row">
                  <span>Homerun Conductors:</span>
                  <strong>${sysCable.totalHomerunM} m</strong>
                </div>
                ${
                  sysCable.totalRacewayLengthM > 0
                    ? `
                  <div class="stat-row">
                    <span>Raceway Run:</span>
                    <strong style="color: var(--accent-amber);">${sysCable.totalRacewayLengthM} m</strong>
                  </div>
                `
                    : ''
                }
                <div class="stat-row">
                  <span>Average / String:</span>
                  <strong>${sysCable.avgStringCableLengthM} m</strong>
                </div>
              `
                  : ''
              }
              <div class="stat-row">
                <span>Estimated Annual Yield:</span>
                <strong style="color: var(--accent-blue);">${Math.round(projectSummary.totalKwp * 1350).toLocaleString()} kWh/yr</strong>
              </div>
            </div>
          </div>

          <!-- Overall Site Scope Pod -->
          <div class="inspector-section-pod">
            <div class="pod-header">
              <span class="pod-title">SITE TOTALS (ALL SYSTEMS)</span>
              <span class="pod-badge">${projectSummary.totalSystems} Systems</span>
            </div>
            <div class="pod-body-table">
              <div class="stat-row">
                <span>Total Site Capacity:</span>
                <strong style="color: var(--accent-blue); font-size: 13px;">${projectSummary.totalKwp} kWp</strong>
              </div>
              <div class="stat-row">
                <span>Total Site Arrays:</span>
                <strong>${projectSummary.totalZones} (${projectSummary.totalActivePanels} panels)</strong>
              </div>
            </div>
          </div>

          <!-- Map Inspection Helper Hint -->
          <div class="panel-select-hint">
            <span class="hint-icon">🔍</span>
            <span>Click any solar module rectangle on the map to inspect object properties, electrical specs, and string routing.</span>
          </div>
        </div>
      `;

      this.attachScopeListeners(currentSystem?.id);
      return;
    }

    // Context B: Panel Selected -> Detailed Solar Panel Object Inspector
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
              ${zone?.config.mountType === 'ground' ? '🌱' : '🏠'} ${zone?.name || panel.zoneId}
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
                <strong style="color: var(--accent-amber);">${mod?.name || 'Standard 600W Bifacial'}</strong>
              </div>
              <div class="stat-row">
                <span>System:</span>
                <span class="system-inline-pill" style="border-color: ${system?.color || '#0284c7'};">
                  <span class="system-color-dot" style="background-color: ${system?.color || '#0284c7'};"></span>
                  ${system?.name || panel.systemId}
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

  private attachScopeListeners(systemId?: string): void {
    document.getElementById('btn-minimize-inspector')?.addEventListener('click', () => {
      this.toggleMinimize();
    });

    document.getElementById('btn-scope-zoom-inverter')?.addEventListener('click', () => {
      if (systemId) {
        this.mapController?.zoomToInverter(systemId);
      }
    });

    this.container.querySelectorAll<HTMLButtonElement>('.btn-scope-zoom-zone').forEach(btn => {
      btn.addEventListener('click', () => {
        const zoneId = btn.getAttribute('data-zone-id');
        if (zoneId) {
          this.mapController?.zoomToZone(zoneId);
          this.store.selectZone(zoneId);
        }
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>('.btn-scope-del-zone').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const zoneId = btn.getAttribute('data-zone-id');
        if (zoneId) {
          const zone = this.store.getZone(zoneId);
          if (confirm(`Delete array "${zone?.name || 'Array'}" and its modules from project?`)) {
            this.store.removeZone(zoneId);
          }
        }
      });
    });

    this.container.querySelectorAll<HTMLElement>('.linked-array-item').forEach(item => {
      item.addEventListener('click', e => {
        // If clicked on button or checkbox, let child input handle it
        if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT') return;
        const zoneId = item.getAttribute('data-zone-id');
        if (zoneId) {
          const isMulti = (e as MouseEvent).shiftKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey;
          this.store.selectZone(zoneId, isMulti);
          this.mapController?.zoomToZone(zoneId);
        }
      });
    });

    this.container.querySelectorAll<HTMLInputElement>('.chk-select-zone').forEach(chk => {
      chk.addEventListener('change', e => {
        e.stopPropagation();
        const zoneId = chk.getAttribute('data-zone-id');
        if (zoneId) {
          this.store.selectZone(zoneId, true);
        }
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>('.btn-batch-setback').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = Number(btn.getAttribute('data-val'));
        if (!isNaN(val)) {
          this.store.updateSelectedZonesConfig({ setbackM: val });
        }
      });
    });

    document.getElementById('btn-inspector-batch-opt')?.addEventListener('click', () => {
      const res = this.store.optimizeSelectedZonesGridShift(12);
      const diff = res.totalMaxPanels - res.totalPreviousPanels;
      let msg = `🎉 Batch Grid Shift Optimized & Auto-Strung!\nOptimized ${res.optimizedCount} Selected Arrays\nTotal Fitted Panels: ${res.totalMaxPanels} (${diff >= 0 ? `+${diff}` : diff} panels)`;
      if (res.totalStrings !== undefined) {
        msg += `\n⚡ Auto-Strung into ${res.totalStrings} Strings!`;
      }
      alert(msg);
    });

    document.getElementById('btn-inspector-batch-delete')?.addEventListener('click', () => {
      const count = this.store.selectedZoneIds.size;
      if (confirm(`Delete all ${count} selected arrays and their solar modules?`)) {
        this.store.deleteSelected();
      }
    });

    document.getElementById('btn-inspector-clear-sel')?.addEventListener('click', () => {
      this.store.clearZoneSelection();
    });
  }

  private attachPanelListeners(panelId: string): void {
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
}
