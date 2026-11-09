/**
 * Ribbon "reports" tab: exports, schedules and report generation.
 */
import type { RibbonUI } from '../ribbon';

export function renderReportsTab(this: RibbonUI): string {
  const totalPanels = this.store.getPanels().length;
  const totalKwp = this.store.getZones().reduce((acc, z) => acc + (z.totalKwp || 0), 0);

  return `
    <div class="ribbon-panel" role="tabpanel" aria-label="Engineering Reports, Table Schedules, CAD and Project Export">
      <!-- Pod 1: Engineering Reports & Documentation -->
      <div class="cad-pod wide">
        <div class="cad-pod-header">
          <span class="cad-pod-title">📄 ENGINEERING REPORTS &amp; PDF</span>
          <span class="cad-val-chip highlight">EXPORT DOSSIER</span>
        </div>
        <div class="cad-pod-body">
          <button id="ribbon-btn-gen-pdf" class="btn btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 700; width: 100%; padding: 7px 12px; margin-bottom: 6px;" title="Generate PVsyst-Style Multi-Page PDF Engineering Report">
            <span style="font-size: 15px;">📄</span> Generate Engineering PDF Report
          </button>
          <div class="cad-control-row compact-gap">
            <button id="ribbon-btn-rep-boq" class="btn btn-xs btn-outline flex-1" title="Open Construction BOQ &amp; DUPA Costing Workspace">
              💰 BOQ &amp; Costing
            </button>
            <button id="ribbon-btn-rep-sim" class="btn btn-xs btn-outline flex-1" title="Open 8760 Energy Simulation &amp; Diurnal Load Profile">
              📈 Energy Simulation
            </button>
            <button id="ribbon-btn-rep-sld" class="btn btn-xs btn-outline flex-1" title="Open 2D Single Line Diagram Workspace">
              ⚡ Single Line Diagram
            </button>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">PVsyst-style document with CAD layout, electrical specs, SLD, and BOQ costing</span>
        </div>
      </div>

      <!-- Pod 2: Schedules & Component Tables -->
      <div class="cad-pod wide">
        <div class="cad-pod-header">
          <span class="cad-pod-title">📊 SCHEDULES &amp; REGISTRY</span>
          <span class="cad-pod-tag accent">COMPONENT DATA</span>
        </div>
        <div class="cad-pod-body">
          <button id="ribbon-btn-open-tables-reg" class="btn btn-secondary" style="display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 600; width: 100%; padding: 6px 10px; margin-bottom: 6px;" title="Open Table Schedules for Arrays, Mount Tables, Strings, Inverters &amp; Panels">
            <span>📊</span> Table Schedules &amp; Array Registry
          </button>
          <div class="cad-control-row compact-gap">
            <button id="ribbon-btn-open-panel-reg" class="btn btn-xs btn-outline flex-1" title="Open Solar Panel Module Registry">
              📋 Panel Registry
            </button>
            <button id="ribbon-btn-export-csv" class="btn btn-xs btn-outline flex-1" title="Download Active Table Schedule as CSV / Excel">
              📥 Export CSV Schedule
            </button>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">Inspect arrays, mount table racks, string circuits, and panel module inventory</span>
        </div>
      </div>

      <!-- Pod 3: Project Backup & CAD Export -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">💾 BACKUP &amp; GIS EXPORT</span>
          <span class="cad-pod-tag">PROJECT STATE</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-control-row compact-gap">
            <button id="ribbon-btn-export-project-json" class="btn btn-xs btn-outline flex-1" title="Export complete project state to JSON file">
              💾 Export JSON
            </button>
            <button id="ribbon-btn-import-project-json" class="btn btn-xs btn-outline flex-1" title="Import existing project JSON backup file">
              📂 Import JSON
            </button>
          </div>
          <div class="cad-control-row compact-gap" style="margin-top: 6px;">
            <button id="ribbon-btn-export-geojson" class="btn btn-xs btn-outline flex-1" title="Export GIS GeoJSON polygons for AutoCAD or QGIS">
              🗺️ Export GeoJSON
            </button>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">${totalPanels} Modules • ${totalKwp.toFixed(1)} kWp Total • Cloud synced</span>
        </div>
      </div>
    </div>
  `;
}
