/**
 * Inspector when no panel is selected: minimized pill and the system / site scope card.
 */
import { ProjectStore } from '../../store/projectStore';
import { escapeHtml } from '../../utils/html';
import type { InspectorUI } from '../inspector';

export function renderMinimized(this: InspectorUI, panel: ReturnType<ProjectStore['getSelectedPanel']>, currentSystem: ReturnType<ProjectStore['getSelectedSystem']>, sysSummary: ReturnType<ProjectStore['getSystemSummary']> | null): void {
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
}

export function renderSystemScope(this: InspectorUI, currentSystem: ReturnType<ProjectStore['getSelectedSystem']>, sysSummary: ReturnType<ProjectStore['getSystemSummary']> | null, projectSummary: ReturnType<ProjectStore['getSystemSummary']>, sysCable: ReturnType<ProjectStore['getSystemCableSummary']> | null, sysYield: ReturnType<ProjectStore['getSolarYieldEstimate']>, projectYield: ReturnType<ProjectStore['getSolarYieldEstimate']>): void {
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
          <strong class="system-title">${escapeHtml(currentSystem?.name || 'Default System')}</strong>
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
                      <span class="array-name">${escapeHtml(z.name)}</span>
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
            <strong style="color: var(--accent-blue);">${sysYield.annualYieldKwh.toLocaleString()} kWh/yr</strong>
          </div>
          <div class="stat-row">
            <span>Specific Yield:</span>
            <strong style="color: var(--accent-green);">${sysYield.specificYieldKwhPerKwp.toLocaleString()} kWh/kWp/yr</strong>
          </div>
          <div class="stat-row">
            <span>Performance Ratio:</span>
            <strong class="${sysYield.performanceRatio >= 80 ? 'text-accent-green' : 'text-accent-amber'}">${sysYield.performanceRatio}%</strong>
          </div>
          <button type="button" id="btn-open-solar-yield-analytics" class="btn-sm btn-outline" style="width: 100%; margin-top: 10px; justify-content: center; gap: 6px; font-weight: 600;">
            📊 Solar Yield & Generation Analytics
          </button>
          <button type="button" id="btn-open-simulation-modal" class="btn-sm btn-outline" style="width: 100%; margin-top: 6px; justify-content: center; gap: 6px; font-weight: 600; color: #10b981; border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.08);" title="Simulate Solar + Facility Load Matching, RE Share, and Import/Export Balance">
            ⚡ Solar + Load Simulation (RE Share)
          </button>
          <button type="button" id="btn-open-load-profile-modal" class="btn-sm btn-outline" style="width: 100%; margin-top: 6px; justify-content: center; gap: 6px; font-weight: 600; color: #f59e0b; border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.08);" title="Record monthly utility electric bills and 24-hour diurnal demand curves">
            🏢 Existing Load Profile ${this.store.getLoadProfile() ? `(${((this.store.getLoadProfile()?.annualKwh || 0) / 1000).toFixed(0)}k kWh/yr)` : '(Configure)'}
          </button>
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
          <div class="stat-row">
            <span>Total Site Annual Yield:</span>
            <strong style="color: var(--accent-blue);">${projectYield.annualYieldKwh.toLocaleString()} kWh/yr</strong>
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
}

export function attachScopeListeners(this: InspectorUI, systemId?: string): void {
  this.container.querySelector('#btn-minimize-inspector')?.addEventListener('click', () => {
    this.toggleMinimize();
  });

  const btnYield = this.container.querySelector<HTMLButtonElement>('#btn-open-solar-yield-analytics');
  if (btnYield) {
    btnYield.addEventListener('click', (e) => {
      e.stopPropagation();
      this.solarYieldModal.open(systemId, 'yield');
    });
  }

  const btnSim = this.container.querySelector<HTMLButtonElement>('#btn-open-simulation-modal');
  if (btnSim) {
    btnSim.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onOpenSimulationWorkspace) {
        this.onOpenSimulationWorkspace(systemId);
      } else {
        this.solarYieldModal.open(systemId, 'simulation');
      }
    });
  }

  const btnLoad = this.container.querySelector<HTMLButtonElement>('#btn-open-load-profile-modal');
  if (btnLoad) {
    btnLoad.addEventListener('click', (e) => {
      e.stopPropagation();
      this.loadProfileModal.open(systemId);
    });
  }

  this.container.querySelector('#btn-scope-zoom-inverter')?.addEventListener('click', () => {
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
