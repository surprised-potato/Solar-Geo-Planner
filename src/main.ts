import { ProjectStore } from './store/projectStore';
import { MapController } from './map/mapController';
import { RibbonUI } from './ui/ribbon';
import { InspectorUI } from './ui/inspector';
import { RegistryModalUI } from './ui/registryModal';
import { ProjectDropdownUI } from './ui/projectDropdown';
import { FirebaseSyncService } from './services/firebaseSync';
import { localMetricToLatLng } from './geo/projection';
import { BasemapProvider } from './types/solar';
import { SingleLineDiagramUI } from './ui/sldView';
import { BoqAndDupaUI } from './ui/boqView';
import { SimulationWorkspaceUI } from './ui/simulationView';
import { PdfReportModalUI } from './ui/pdfReportModal';
import { downloadText } from './utils/download';

// Initialize core store
const store = new ProjectStore();

// Initialize map controller
const mapController = new MapController('map', store);

// View switching between Map View, Single Line Diagram, BOQ & Costing, and Energy Simulation Workspace
let sldView: SingleLineDiagramUI | null = null;
let boqView: BoqAndDupaUI | null = null;
let simView: SimulationWorkspaceUI | null = null;
let ribbon: RibbonUI;
let inspector: InspectorUI;

function setMainView(view: 'map' | 'sld' | 'boq' | 'simulation', targetSystemId?: string): void {
  const btnMap = document.getElementById('btn-view-map');
  const btnSld = document.getElementById('btn-view-sld');
  const btnBoq = document.getElementById('btn-view-boq');
  const btnSim = document.getElementById('btn-view-simulation');
  const mapWorkspace = document.getElementById('map-workspace');
  const sldWorkspace = document.getElementById('sld-workspace');
  const boqWorkspace = document.getElementById('boq-workspace');
  const simWorkspace = document.getElementById('simulation-workspace');

  btnMap?.classList.toggle('active', view === 'map');
  btnMap?.setAttribute('aria-selected', String(view === 'map'));
  btnSld?.classList.toggle('active', view === 'sld');
  btnSld?.setAttribute('aria-selected', String(view === 'sld'));
  btnBoq?.classList.toggle('active', view === 'boq');
  btnBoq?.setAttribute('aria-selected', String(view === 'boq'));
  btnSim?.classList.toggle('active', view === 'simulation');
  btnSim?.setAttribute('aria-selected', String(view === 'simulation'));

  if (mapWorkspace) mapWorkspace.style.display = view === 'map' ? 'block' : 'none';
  if (sldWorkspace) sldWorkspace.style.display = view === 'sld' ? 'flex' : 'none';
  if (boqWorkspace) boqWorkspace.style.display = view === 'boq' ? 'flex' : 'none';
  if (simWorkspace) simWorkspace.style.display = view === 'simulation' ? 'flex' : 'none';

  ribbon?.setView(view);

  if (view === 'map') {
    mapController.invalidateSize();
    setTimeout(() => mapController.invalidateSize(), 50);
  } else if (view === 'sld') {
    if (!sldView) {
      sldView = new SingleLineDiagramUI('sld-workspace-mount', store);
    } else {
      sldView.render();
    }
  } else if (view === 'boq') {
    if (!boqView) {
      boqView = new BoqAndDupaUI('boq-workspace-mount', store);
    } else {
      boqView.render();
    }
  } else if (view === 'simulation') {
    if (!simView) {
      simView = new SimulationWorkspaceUI('simulation-workspace-mount', store, {
        onOpenSolarYield: (sysId) => inspector.openSolarYieldModal(sysId),
        onOpenLoadProfile: (sysId) => inspector.openLoadProfileModal(sysId),
        onOpenPdfReport: (sysId) => pdfReportModal.open(sysId)
      });
    }
    if (targetSystemId) {
      simView.setSystem(targetSystemId);
    } else {
      simView.render();
    }
  }
}

// Initialize PDF Report Modal
const pdfReportModal = new PdfReportModalUI('pdf-report-modal', store, () => {
  mapController.invalidateSize();
  setTimeout(() => {
    mapController.invalidateSize();
    mapController.render(true);
  }, 50);
});
(window as any).openPdfReport = (sysId?: string) => pdfReportModal.open(sysId);

document.getElementById('btn-open-pdf-report')?.addEventListener('click', () => {
  pdfReportModal.open();
});

// Initialize UI views
ribbon = new RibbonUI('ribbon', store, mapController, (view) => setMainView(view));
inspector = new InspectorUI('inspector', store, mapController, (targetSysId) => setMainView('simulation', targetSysId));
new RegistryModalUI('registryModal', store, mapController);
sldView = new SingleLineDiagramUI('sld-workspace-mount', store, (sysId) => pdfReportModal.open(sysId));

document.getElementById('btn-open-boq')?.addEventListener('click', () => {
  setMainView('boq');
});

// Attach Main View Tabs listeners
document.getElementById('btn-view-map')?.addEventListener('click', () => {
  setMainView('map');
});

document.getElementById('btn-view-sld')?.addEventListener('click', () => {
  setMainView('sld');
});

document.getElementById('btn-view-boq')?.addEventListener('click', () => {
  setMainView('boq');
});

document.getElementById('btn-view-simulation')?.addEventListener('click', () => {
  setMainView('simulation');
});

// Initialize Cloud Sync & Multi-PC Project Management
const syncService = FirebaseSyncService.getInstance();
new ProjectDropdownUI(store, syncService, mapController);
syncService.connect(store, undefined, (center, zoom) => {
  mapController.flyTo(center.lat, center.lng, zoom);
});

// Setup sample demo zone on first run if project is empty and no saved state exists
const hasSavedProject = !!localStorage.getItem('solar_geo_planner_project');
if (!hasSavedProject && store.getZones().length === 0) {
  const origin = store.center;
  // A realistic 36m x 22m commercial flat roof in SF
  const demoRoof = [
    localMetricToLatLng({ x: -18, y: -11 }, origin),
    localMetricToLatLng({ x: 18, y: -11 }, origin),
    localMetricToLatLng({ x: 18, y: 11 }, origin),
    localMetricToLatLng({ x: -18, y: 11 }, origin)
  ];
  const zone = store.addZone(demoRoof, 'roof', 'Commercial Rooftop Demo');

  // Add sample skylight obstacle in center
  const skylight = [
    localMetricToLatLng({ x: -4, y: -3 }, origin),
    localMetricToLatLng({ x: 4, y: -3 }, origin),
    localMetricToLatLng({ x: 4, y: 3 }, origin),
    localMetricToLatLng({ x: -4, y: 3 }, origin)
  ];
  store.addKeepOut(zone.id, skylight);
}

// Consolidated Header Drawing Actions & CAD Menu Dropdown
const drawMenuBtn = document.getElementById('btn-hdr-draw-menu');
const drawPopover = document.getElementById('cad-draw-popover-menu');
const drawMenuIcon = document.getElementById('hdr-draw-menu-icon');
const drawMenuLabel = document.getElementById('hdr-draw-menu-label');

const closeDrawMenu = () => {
  if (drawPopover && !drawPopover.hidden) {
    drawPopover.hidden = true;
    drawMenuBtn?.setAttribute('aria-expanded', 'false');
  }
};

drawMenuBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!drawPopover) return;
  const isOpening = drawPopover.hidden;
  drawPopover.hidden = !isOpening;
  drawMenuBtn.setAttribute('aria-expanded', String(isOpening));
});

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement | null;
  if (target && !target.closest('#cad-draw-dropdown-group')) {
    closeDrawMenu();
  }
});

const ensureMapViewForDrafting = () => {
  setMainView('map');
};

document.getElementById('btn-hdr-draw-roof')?.addEventListener('click', () => {
  ensureMapViewForDrafting();
  closeDrawMenu();
  const isDrawingRoof = store.drawingMode === 'zone' && store.drawingMountType === 'roof';
  store.setDrawingMode(isDrawingRoof ? 'none' : 'zone', 'roof');
});

document.getElementById('btn-hdr-draw-ground')?.addEventListener('click', () => {
  ensureMapViewForDrafting();
  closeDrawMenu();
  const isDrawingGround = store.drawingMode === 'zone' && store.drawingMountType === 'ground';
  store.setDrawingMode(isDrawingGround ? 'none' : 'zone', 'ground');
});

document.getElementById('btn-hdr-draw-keepout')?.addEventListener('click', () => {
  ensureMapViewForDrafting();
  closeDrawMenu();
  const isDrawingKo = store.drawingMode === 'keepout';
  store.setDrawingMode(isDrawingKo ? 'none' : 'keepout');
});

const btnHdrHomerun = document.getElementById('btn-hdr-draw-homerun');
btnHdrHomerun?.addEventListener('click', () => {
  ensureMapViewForDrafting();
  closeDrawMenu();
  if (store.drawingMode === 'raceway') {
    mapController.finishDrawing();
  } else {
    store.setDrawingMode('raceway');
  }
});

document.getElementById('btn-hdr-draw-inverter')?.addEventListener('click', () => {
  ensureMapViewForDrafting();
  closeDrawMenu();
  const isPlacingInv = store.drawingMode === 'inverter';
  store.setDrawingMode(isPlacingInv ? 'none' : 'inverter');
});

store.subscribe(() => {
  const mode = store.drawingMode;
  const mountType = store.drawingMountType;

  if (drawMenuBtn) {
    drawMenuBtn.classList.toggle('active-pulse', mode !== 'none');
  }

  if (drawMenuIcon && drawMenuLabel) {
    if (mode === 'zone' && mountType === 'roof') {
      drawMenuIcon.textContent = '🏠';
      drawMenuLabel.textContent = 'Drawing Roof';
    } else if (mode === 'zone' && mountType === 'ground') {
      drawMenuIcon.textContent = '🌱';
      drawMenuLabel.textContent = 'Drawing Ground';
    } else if (mode === 'keepout') {
      drawMenuIcon.textContent = '🚫';
      drawMenuLabel.textContent = 'Drawing Obstacle';
    } else if (mode === 'raceway') {
      drawMenuIcon.textContent = '🛤️';
      drawMenuLabel.textContent = 'Drawing Homerun';
    } else if (mode === 'inverter') {
      drawMenuIcon.textContent = '⚡';
      drawMenuLabel.textContent = 'Placing Inverter';
    } else {
      drawMenuIcon.textContent = '📐';
      drawMenuLabel.textContent = 'Draw Element';
    }
  }

  const btnRoof = document.getElementById('btn-hdr-draw-roof');
  const btnGround = document.getElementById('btn-hdr-draw-ground');
  const btnKo = document.getElementById('btn-hdr-draw-keepout');
  const btnInv = document.getElementById('btn-hdr-draw-inverter');

  if (btnRoof) btnRoof.classList.toggle('active', mode === 'zone' && mountType === 'roof');
  if (btnGround) btnGround.classList.toggle('active', mode === 'zone' && mountType === 'ground');
  if (btnKo) btnKo.classList.toggle('active', mode === 'keepout');
  if (btnHdrHomerun) btnHdrHomerun.classList.toggle('active', mode === 'raceway');
  if (btnInv) btnInv.classList.toggle('active', mode === 'inverter');
});

document.getElementById('btn-toggle-labels')?.addEventListener('click', () => {
  mapController.toggleLabels();
});

// View Filter & Tracing Controls
const btnOpenViews = document.getElementById('btn-open-views-tab');
const btnToggleXRay = document.getElementById('btn-toggle-xray');
const btnToggleMulti = document.getElementById('btn-toggle-multi-select');
const lblMultiSelect = document.getElementById('lbl-multi-select');
const selectBasemap = document.getElementById('select-basemap') as HTMLSelectElement;
const selectPanelVis = document.getElementById('select-panel-visibility') as HTMLSelectElement;
const selectFillVis = document.getElementById('select-fill-visibility') as HTMLSelectElement;
const selectKoVis = document.getElementById('select-keepout-visibility') as HTMLSelectElement;
const selectTiltVis = document.getElementById('select-tilt-visibility') as HTMLSelectElement;

btnOpenViews?.addEventListener('click', () => {
  setMainView('map');
  ribbon.setActiveTab('views');
});

btnToggleXRay?.addEventListener('click', () => {
  store.toggleXRayMode();
});

btnToggleMulti?.addEventListener('click', () => {
  const allZones = store.getZones();
  const selZones = store.getSelectedZones();
  if (selZones.length === allZones.length && allZones.length > 0) {
    store.clearZoneSelection();
  } else {
    store.selectAllZones();
  }
});

selectBasemap?.addEventListener('change', () => {
  const provider = selectBasemap.value as BasemapProvider;
  mapController.setBasemap(provider);
});

selectPanelVis?.addEventListener('change', () => {
  store.setViewFilter({
    panelVisibility: selectPanelVis.value as 'full' | 'dimmed' | 'hidden',
    xRayMode: false
  });
});

selectFillVis?.addEventListener('change', () => {
  store.setViewFilter({
    showArrayFill: selectFillVis.value === 'fill',
    xRayMode: false
  });
});

selectKoVis?.addEventListener('change', () => {
  store.setViewFilter({
    showKeepOuts: selectKoVis.value === 'show'
  });
});

selectTiltVis?.addEventListener('change', () => {
  store.setViewFilter({
    showTiltArrows: selectTiltVis.value === 'show'
  });
});

store.subscribe(() => {
  const vf = store.viewFilter;

  if (btnToggleXRay) {
    btnToggleXRay.classList.toggle('active', vf.xRayMode);
    btnToggleXRay.innerHTML = vf.xRayMode
      ? `<span class="icon">⚡</span> Tracing: Active`
      : `<span class="icon">👁️</span> Tracing Mode`;
  }

  const allZones = store.getZones();
  const selZones = store.getSelectedZones();
  if (btnToggleMulti && lblMultiSelect) {
    const isAllSelected = selZones.length > 0 && selZones.length === allZones.length;
    btnToggleMulti.classList.toggle('active', selZones.length > 1);
    lblMultiSelect.textContent = selZones.length > 1
      ? `Selected (${selZones.length})`
      : 'Select All';
    btnToggleMulti.title = isAllSelected
      ? 'Deselect all arrays'
      : `Select all (${allZones.length}) arrays for batch editing`;
  }

  if (selectBasemap && document.activeElement !== selectBasemap) {
    selectBasemap.value = vf.basemap || 'google-hybrid';
  }
  if (selectPanelVis && document.activeElement !== selectPanelVis) {
    selectPanelVis.value = vf.panelVisibility;
  }
  if (selectFillVis && document.activeElement !== selectFillVis) {
    selectFillVis.value = vf.showArrayFill ? 'fill' : 'outline';
  }
  if (selectKoVis && document.activeElement !== selectKoVis) {
    selectKoVis.value = vf.showKeepOuts ? 'show' : 'hide';
  }
  if (selectTiltVis && document.activeElement !== selectTiltVis) {
    selectTiltVis.value = vf.showTiltArrows !== false ? 'show' : 'hide';
  }
});

// Location Search (Coordinates or Geocoding)
const searchInput = document.getElementById('location-search-input') as HTMLInputElement;
const searchDropdown = document.getElementById('search-results') as HTMLElement;
let searchTimeout: any = null;

function parseCoordinates(str: string): { lat: number; lng: number } | null {
  const parts = str.split(',').map(s => s.trim());
  if (parts.length === 2) {
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

searchInput?.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = searchInput.value.trim();
  if (!q) {
    searchDropdown.style.display = 'none';
    return;
  }

  // Check if direct coordinate match
  const coords = parseCoordinates(q);
  if (coords) {
    searchDropdown.innerHTML = `
      <div class="search-result-item" data-lat="${coords.lat}" data-lng="${coords.lng}">
        📍 Jump to coordinates: <b>${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}</b>
      </div>
    `;
    searchDropdown.style.display = 'block';
    attachSearchResultEvents();
    return;
  }

  // Debounced Nominatim Search
  searchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        searchDropdown.innerHTML = data
          .map(
            (item: any) => `
          <div class="search-result-item" data-lat="${item.lat}" data-lng="${item.lon}">
            📍 ${item.display_name}
          </div>
        `
          )
          .join('');
        searchDropdown.style.display = 'block';
        attachSearchResultEvents();
      } else {
        searchDropdown.innerHTML = `<div class="search-result-item">No locations found.</div>`;
        searchDropdown.style.display = 'block';
      }
    } catch (err) {
      console.warn('Geocoding request failed:', err);
    }
  }, 350);
});

function attachSearchResultEvents(): void {
  searchDropdown.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const lat = parseFloat(item.getAttribute('data-lat') || '');
      const lng = parseFloat(item.getAttribute('data-lng') || '');
      if (!isNaN(lat) && !isNaN(lng)) {
        mapController.flyTo(lat, lng, 19);
        searchDropdown.style.display = 'none';
        searchInput.value = '';
      }
    });
  });
}

document.addEventListener('click', (e: MouseEvent) => {
  if (!searchInput.contains(e.target as Node) && !searchDropdown.contains(e.target as Node)) {
    searchDropdown.style.display = 'none';
  }
});

document.getElementById('btn-export-json')?.addEventListener('click', () => {
  const json = store.exportProjectJson();
  downloadText(json, `solar_project_${Date.now()}.json`, 'application/json');
});

document.getElementById('btn-export-modal-json')?.addEventListener('click', () => {
  const json = store.exportProjectJson();
  downloadText(json, `solar_project_${Date.now()}.json`, 'application/json');
});

document.getElementById('btn-export-modal-geojson')?.addEventListener('click', () => {
  const geojson = store.exportProjectGeoJson();
  downloadText(geojson, `solar_project_${Date.now()}.geojson`, 'application/geo+json');
});

// JSON Import
const fileInput = document.getElementById('file-import-input') as HTMLInputElement;
document.getElementById('btn-import-json')?.addEventListener('click', () => {
  fileInput.click();
});

fileInput?.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    if (text) {
      const ok = store.importProjectJson(text);
      if (ok) {
        mapController.flyTo(store.center.lat, store.center.lng, store.zoom);
      } else {
        alert('Invalid project JSON file format.');
      }
    }
  };
  reader.readAsText(file);
});
