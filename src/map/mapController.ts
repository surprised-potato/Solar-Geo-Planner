import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ProjectStore } from '../store/projectStore';
import { BasemapProvider, LatLngPoint, SolarPanelObject } from '../types/solar';
import { chainAdjacentPanels, getHomerunExitDirection } from '../geo/stringCabling';
import {
  calculateBearingDeg,
  calculateEdgeDownslopeAzimuth,
  computePolygonAreaSqM,
  computePolygonCentroid,
  findClosestPolygonEdge,
  getCompassHeading,
  localMetricToLatLng
} from '../geo/projection';

export class MapController {
  private map: L.Map;
  private store: ProjectStore;
  private isInteractingMapHandle: boolean = false;
  private selectedHomerunSystemId: string | null = null;
  private selectedRacewayZoneId: string | null = null;
  private selectedInverterSystemId: string | null = null;

  private zoneLayerGroup: L.LayerGroup;
  private keepOutLayerGroup: L.LayerGroup;
  private tableRackLayerGroup: L.LayerGroup;
  private roofRailLayerGroup: L.LayerGroup;
  private panelLayerGroup: L.LayerGroup;
  private tiltArrowLayerGroup: L.LayerGroup;
  private stringLinesLayerGroup: L.LayerGroup;
  private homerunLinesLayerGroup: L.LayerGroup;
  private racewayLayerGroup: L.LayerGroup;
  private racewayVertexGroup: L.LayerGroup;
  private inverterStationGroup: L.LayerGroup;
  private vertexMarkersGroup: L.LayerGroup;
  private drawingPreviewLayer: L.Polyline | null = null;
  private drawingPoints: LatLngPoint[] = [];

  private baseLayers: Record<BasemapProvider, L.TileLayer>;
  private currentBasemapKey: BasemapProvider = 'google-hybrid';
  private currentBasemapLayer: L.TileLayer | null = null;
  private labelLayers: {
    esri: L.TileLayer;
    google: L.TileLayer;
  };
  private panelLayerMap: Map<string, L.Polygon> = new Map();

  constructor(containerId: string, store: ProjectStore) {
    this.store = store;

    // Initialize Leaflet map with HTML5 Canvas renderer for 60 FPS performance on large utility farms (11MW+)
    // maxZoom: 23 allows users to zoom deep into individual roofs and structures without hitting limits
    this.map = L.map(containerId, {
      center: [store.center.lat, store.center.lng],
      zoom: store.zoom,
      maxZoom: 23,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true
    });

    // Add zoom control to top-right
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // Multi-source basemap tile layers
    this.baseLayers = {
      // High-resolution Google Hybrid (Satellite + place/road labels) with native detail down to zoom 21
      'google-hybrid': L.tileLayer(
        'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        {
          subdomains: ['0', '1', '2', '3'],
          attribution: '© Google Maps',
          maxNativeZoom: 21,
          maxZoom: 23
        }
      ),
      // Pure Google Satellite without labels
      'google-satellite': L.tileLayer(
        'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        {
          subdomains: ['0', '1', '2', '3'],
          attribution: '© Google Maps',
          maxNativeZoom: 21,
          maxZoom: 23
        }
      ),
      // Esri World Imagery (capped at maxNativeZoom: 18 so it gracefully stretches on deep zoom instead of showing "Map data not yet available")
      'esri': L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Esri World Imagery',
          maxNativeZoom: 18,
          maxZoom: 23
        }
      ),
      // OpenStreetMap Standard vector-rendered raster
      'osm': L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '© OpenStreetMap contributors',
          maxNativeZoom: 19,
          maxZoom: 23
        }
      ),
      // CartoDB Positron: Clean light monochrome / wireframe vicinity map
      'carto-light': L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        {
          subdomains: ['a', 'b', 'c', 'd'],
          attribution: '© OpenStreetMap contributors, © CARTO',
          maxNativeZoom: 20,
          maxZoom: 23
        }
      ),
      // CartoDB Dark Matter: High-contrast dark blueprint wireframe vicinity map
      'carto-dark': L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        {
          subdomains: ['a', 'b', 'c', 'd'],
          attribution: '© OpenStreetMap contributors, © CARTO',
          maxNativeZoom: 20,
          maxZoom: 23
        }
      )
    };

    // Reference label layers for basemaps that require separate overlay
    this.labelLayers = {
      google: L.tileLayer(
        'https://mt{s}.google.com/vt/lyrs=h&x={x}&y={y}&z={z}',
        {
          subdomains: ['0', '1', '2', '3'],
          maxNativeZoom: 21,
          maxZoom: 23
        }
      ),
      esri: L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          maxNativeZoom: 18,
          maxZoom: 23,
          opacity: 0.85
        }
      )
    };

    // Activate configured basemap (defaults to Google Hybrid)
    const initialBasemap = this.store.viewFilter.basemap || 'google-hybrid';
    this.setBasemap(initialBasemap);

    this.zoneLayerGroup = L.layerGroup().addTo(this.map);
    this.keepOutLayerGroup = L.layerGroup().addTo(this.map);
    this.tableRackLayerGroup = L.layerGroup().addTo(this.map);
    this.panelLayerGroup = L.layerGroup().addTo(this.map);
    this.roofRailLayerGroup = L.layerGroup().addTo(this.map);
    this.tiltArrowLayerGroup = L.layerGroup().addTo(this.map);
    this.stringLinesLayerGroup = L.layerGroup().addTo(this.map);
    this.homerunLinesLayerGroup = L.layerGroup().addTo(this.map);
    this.racewayLayerGroup = L.layerGroup().addTo(this.map);
    this.racewayVertexGroup = L.layerGroup().addTo(this.map);
    this.inverterStationGroup = L.layerGroup().addTo(this.map);
    this.vertexMarkersGroup = L.layerGroup().addTo(this.map);

    this.setupMapEvents();

    // Subscribe to store updates
    this.store.subscribe(() => {
      const desiredBasemap = this.store.viewFilter.basemap || 'google-hybrid';
      if (desiredBasemap !== this.currentBasemapKey) {
        this.setBasemap(desiredBasemap);
      } else {
        this.syncLabelVisibility();
      }
      this.render();
    });

    this.render();
  }

  public getMap(): L.Map {
    return this.map;
  }

  public setBasemap(provider: BasemapProvider): void {
    if (this.currentBasemapLayer && this.map.hasLayer(this.currentBasemapLayer)) {
      this.map.removeLayer(this.currentBasemapLayer);
    }
    const nextLayer = this.baseLayers[provider] || this.baseLayers['google-hybrid'];
    nextLayer.addTo(this.map);
    if ((nextLayer as any).bringToBack) {
      (nextLayer as any).bringToBack();
    }
    this.currentBasemapKey = provider;
    this.currentBasemapLayer = nextLayer;
    if (this.store.viewFilter.basemap !== provider) {
      this.store.setViewFilter({ basemap: provider });
    }
    this.syncLabelVisibility();
  }

  public getBasemap(): BasemapProvider {
    return this.currentBasemapKey;
  }

  private syncLabelVisibility(): void {
    const shouldShow = this.store.viewFilter.showLabels;

    // Detach any standalone overlay labels first
    if (this.map.hasLayer(this.labelLayers.google)) {
      this.map.removeLayer(this.labelLayers.google);
    }
    if (this.map.hasLayer(this.labelLayers.esri)) {
      this.map.removeLayer(this.labelLayers.esri);
    }

    if (!shouldShow) {
      // If currently on hybrid, switch base to pure satellite without labels
      if (this.currentBasemapKey === 'google-hybrid') {
        this.setBasemap('google-satellite');
      }
      return;
    }

    // When labels are enabled:
    if (this.currentBasemapKey === 'google-satellite') {
      this.setBasemap('google-hybrid');
      return;
    }

    if (this.currentBasemapKey === 'esri') {
      this.labelLayers.esri.addTo(this.map);
    }
  }

  public toggleLabels(): boolean {
    const next = !this.store.viewFilter.showLabels;
    let nextBasemap = this.currentBasemapKey;
    if (!next && this.currentBasemapKey === 'google-hybrid') {
      nextBasemap = 'google-satellite';
    } else if (next && this.currentBasemapKey === 'google-satellite') {
      nextBasemap = 'google-hybrid';
    }
    this.store.setViewFilter({ showLabels: next, basemap: nextBasemap });
    this.setBasemap(nextBasemap);
    return next;
  }

  public flyTo(lat: number, lng: number, zoom = 19): void {
    this.map.flyTo([lat, lng], zoom, { duration: 1.2 });
  }

  public zoomToZone(zoneId: string): void {
    const zone = this.store.getZone(zoneId);
    if (!zone || zone.vertices.length === 0) return;

    const bounds = L.latLngBounds(zone.vertices.map(v => [v.lat, v.lng] as [number, number]));
    this.map.fitBounds(bounds, {
      padding: [80, 80],
      maxZoom: 22,
      animate: true,
      duration: 1.0
    });
  }

  public zoomToPanel(panelId: string): void {
    const panel = this.store.getPanel(panelId);
    if (!panel) return;
    this.map.flyTo([panel.centroid.lat, panel.centroid.lng], Math.max(this.map.getZoom(), 22), {
      duration: 0.8
    });
  }

  public zoomToInverter(systemId: string): void {
    const sys = this.store.getSystem(systemId);
    if (!sys || !sys.inverterLocation) return;
    this.map.flyTo([sys.inverterLocation.lat, sys.inverterLocation.lng], Math.max(this.map.getZoom(), 21), {
      duration: 0.8
    });
  }

  public zoomToRaceway(zoneId?: string, systemId?: string): void {
    const homerun = (zoneId ? this.store.getHomerunForZone(zoneId) : null)
      || this.store.getSystemHomerun(systemId);
    if (!homerun || !homerun.path || homerun.path.length === 0) return;
    const latlngs = homerun.path.map((p: LatLngPoint) => [p.lat, p.lng] as [number, number]);
    const bounds = L.latLngBounds(latlngs);
    this.map.flyToBounds(bounds, {
      padding: [60, 60],
      maxZoom: 22,
      duration: 1.0
    });
  }

  public zoomToKeepOut(zoneId: string, keepOutId: string): void {
    const zone = this.store.getZone(zoneId);
    if (!zone) return;
    const ko = zone.keepOuts.find(k => k.id === keepOutId);
    if (!ko || ko.vertices.length === 0) return;
    const latlngs = ko.vertices.map(v => [v.lat, v.lng] as [number, number]);
    const bounds = L.latLngBounds(latlngs);
    this.map.flyToBounds(bounds, {
      padding: [80, 80],
      maxZoom: 22,
      duration: 1.0
    });
  }

  public invalidateSize(): void {
    this.map.invalidateSize();
  }

  public zoomToString(stringId: string, systemId?: string): void {
    const panels = this.store
      .getPanels()
      .filter(p => p.stringId === stringId && (!systemId || p.systemId === systemId));
    if (panels.length === 0) return;
    const points: [number, number][] = [];
    panels.forEach(p => {
      p.corners.forEach(c => points.push([c.lat, c.lng]));
    });
    const bounds = L.latLngBounds(points);
    this.map.flyToBounds(bounds, {
      padding: [70, 70],
      maxZoom: 22,
      duration: 1.0
    });
  }

  private setupMapEvents(): void {
    let moveEndTimer: ReturnType<typeof setTimeout> | null = null;
    this.map.on('moveend', () => {
      const c = this.map.getCenter();
      this.store.center = { lat: c.lat, lng: c.lng };
      this.store.zoom = this.map.getZoom();

      // Debounce viewport layer refresh by 40ms to keep rapid panning smooth
      if (moveEndTimer) clearTimeout(moveEndTimer);
      moveEndTimer = setTimeout(() => {
        if (this.store.getPanels().length > 300) {
          this.renderMountTables();
          this.renderRoofRails();
          this.renderPanels();
          this.renderTiltArrows();
          this.renderStringLines();
        }
      }, 40);
    });

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      if (this.store.drawingMode === 'inverter') {
        const pt: LatLngPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
        const currentSys = this.store.getSelectedSystem();
        if (currentSys) {
          this.store.setSystemInverterLocation(currentSys.id, pt);
        }
        this.store.setDrawingMode('none');
        return;
      }

      if (this.store.drawingMode === 'none') {
        const isTilePane = e.originalEvent.target === this.map.getContainer().querySelector('.leaflet-tile-pane');
        if (isTilePane) {
          this.clearMapSelection();
        }
        return;
      }

      const pt: LatLngPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
      this.addDrawingPoint(pt);
    });

    this.map.on('mousemove', (e: L.LeafletMouseEvent) => {
      if (this.store.drawingMode === 'none' || this.drawingPoints.length === 0) return;

      const cursorPt: LatLngPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
      const pts = [...this.drawingPoints, cursorPt];

      if (this.drawingPreviewLayer) {
        this.drawingPreviewLayer.setLatLngs(pts.map(p => [p.lat, p.lng]));
      } else {
        const previewColor =
          this.store.drawingMode === 'zone'
            ? '#38bdf8'
            : this.store.drawingMode === 'keepout'
            ? '#f43f5e'
            : '#f59e0b'; // Amber for raceway
        this.drawingPreviewLayer = L.polyline(
          pts.map(p => [p.lat, p.lng]),
          {
            color: previewColor,
            weight: 3,
            dashArray: '4, 4'
          }
        ).addTo(this.map);
      }
    });

    this.map.on('dblclick', (e: L.LeafletMouseEvent) => {
      if (this.store.drawingMode !== 'none') {
        L.DomEvent.stopPropagation(e);
        this.finishDrawing();
      }
    });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName.toUpperCase();
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target.isContentEditable) {
          return;
        }
        if (target.closest('dialog[open], .modal-overlay:not([hidden])')) {
          return;
        }
      }

      if (e.key === 'Escape') {
        if (this.store.drawingMode !== 'none') {
          this.cancelDrawing();
        } else {
          this.clearMapSelection();
        }
      } else if (e.key === 'Enter') {
        if (this.store.drawingMode !== 'none') {
          this.finishDrawing();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.store.drawingMode === 'none') {
          const deleted = this.deleteSelectedElement();
          if (deleted) {
            e.preventDefault();
          }
        }
      }
    });

    // Wire up Floating HUD Button Events
    document.getElementById('btn-hud-finish-draw')?.addEventListener('click', () => {
      this.finishDrawing();
    });
    document.getElementById('btn-hud-cancel-draw')?.addEventListener('click', () => {
      this.cancelDrawing();
    });
    document.getElementById('btn-hud-fit-element')?.addEventListener('click', () => {
      this.fitSelectedElement();
    });
    document.getElementById('btn-hud-delete-element')?.addEventListener('click', () => {
      this.deleteSelectedElement();
    });
    document.getElementById('btn-hud-deselect-element')?.addEventListener('click', () => {
      this.clearMapSelection();
    });
  }

  public clearMapSelection(): void {
    this.selectedHomerunSystemId = null;
    this.selectedRacewayZoneId = null;
    this.selectedInverterSystemId = null;
    this.store.selectKeepOut(null);
    this.store.selectPanel(null);
    this.store.selectZone(null);
    this.render();
    this.updateSelectionHud();
  }

  public deleteSelectedElement(): boolean {
    // 1. Keep-out selected
    if (this.store.selectedKeepOutId) {
      const koId = this.store.selectedKeepOutId;
      const success = this.store.deleteKeepOut(koId);
      if (success) {
        this.updateSelectionHud();
        return true;
      }
    }

    // 2. Homerun selected
    if (this.selectedHomerunSystemId) {
      const sysId = this.selectedHomerunSystemId;
      this.store.clearSystemHomerun(sysId);
      this.selectedHomerunSystemId = null;
      this.updateSelectionHud();
      return true;
    }

    // 3. Zone Raceway selected
    if (this.selectedRacewayZoneId) {
      const zoneId = this.selectedRacewayZoneId;
      this.store.clearZoneRaceway(zoneId);
      this.selectedRacewayZoneId = null;
      this.updateSelectionHud();
      return true;
    }

    // 4. Inverter Station selected
    if (this.selectedInverterSystemId) {
      const sysId = this.selectedInverterSystemId;
      this.store.clearSystemInverterLocation(sysId);
      this.selectedInverterSystemId = null;
      this.updateSelectionHud();
      return true;
    }

    // 5. Array Zones selected
    if (this.store.selectedZoneIds.size > 0 || this.store.selectedZoneId) {
      const res = this.store.deleteSelected();
      if (res) {
        this.updateSelectionHud();
        return true;
      }
    }

    return false;
  }

  public fitSelectedElement(): void {
    if (this.store.selectedKeepOutId) {
      for (const zone of this.store.getZones()) {
        const ko = zone.keepOuts.find(k => k.id === this.store.selectedKeepOutId);
        if (ko) {
          this.zoomToKeepOut(zone.id, ko.id);
          return;
        }
      }
    }
    if (this.selectedHomerunSystemId) {
      this.zoomToRaceway(undefined, this.selectedHomerunSystemId);
      return;
    }
    if (this.selectedRacewayZoneId) {
      this.zoomToRaceway(this.selectedRacewayZoneId);
      return;
    }
    if (this.selectedInverterSystemId) {
      this.zoomToInverter(this.selectedInverterSystemId);
      return;
    }
    if (this.store.selectedZoneIds.size > 1) {
      const allVerts: [number, number][] = [];
      for (const zid of this.store.selectedZoneIds) {
        const z = this.store.getZone(zid);
        if (z) {
          z.vertices.forEach(v => allVerts.push([v.lat, v.lng]));
        }
      }
      if (allVerts.length > 0) {
        this.map.fitBounds(L.latLngBounds(allVerts), { padding: [80, 80], maxZoom: 22, duration: 1.0 });
      }
      return;
    }
    if (this.store.selectedZoneId) {
      this.zoomToZone(this.store.selectedZoneId);
      return;
    }
  }

  public updateSelectionHud(): void {
    const hud = document.getElementById('map-selection-hud');
    if (!hud) return;

    if (this.store.drawingMode !== 'none') {
      hud.hidden = true;
      return;
    }

    const badge = document.getElementById('hud-sel-badge');
    const title = document.getElementById('hud-sel-title');
    const sub = document.getElementById('hud-sel-sub');

    // 1. Keep-out selected
    if (this.store.selectedKeepOutId) {
      for (const zone of this.store.getZones()) {
        const ko = zone.keepOuts.find(k => k.id === this.store.selectedKeepOutId);
        if (ko) {
          hud.hidden = false;
          if (badge) badge.textContent = '🚫';
          if (title) title.textContent = ko.name || 'Obstacle Keep-Out';
          if (sub) sub.textContent = `Inside ${zone.name} • ${ko.vertices.length} vertices`;
          return;
        }
      }
    }

    // 2. Homerun selected
    if (this.selectedHomerunSystemId) {
      const sys = this.store.getSystem(this.selectedHomerunSystemId);
      if (sys && sys.homerunRaceway) {
        hud.hidden = false;
        if (badge) badge.textContent = '🛤️';
        if (title) title.textContent = `Homerun Trunk (${sys.name})`;
        const pathLen = sys.homerunRaceway.path.length;
        if (sub) sub.textContent = `Shared Raceway • ${pathLen} nodes • Drop: ${sys.homerunRaceway.elevationChangeM}m`;
        return;
      }
    }

    // 3. Zone Raceway selected
    if (this.selectedRacewayZoneId) {
      const zone = this.store.getZone(this.selectedRacewayZoneId);
      if (zone && zone.raceway) {
        hud.hidden = false;
        if (badge) badge.textContent = '🛤️';
        if (title) title.textContent = zone.raceway.name || `Raceway (${zone.name})`;
        if (sub) sub.textContent = `Branch Raceway • ${zone.raceway.path.length} nodes • Drop: ${zone.raceway.elevationChangeM}m`;
        return;
      }
    }

    // 4. Inverter Station selected
    if (this.selectedInverterSystemId) {
      const sys = this.store.getSystem(this.selectedInverterSystemId);
      if (sys && sys.inverterLocation) {
        hud.hidden = false;
        if (badge) badge.textContent = '⚡';
        if (title) title.textContent = `Inverter Station (${sys.name})`;
        if (sub) sub.textContent = `${sys.inverter.modelName} • Elev: ${sys.inverterElevationM ?? 0}m`;
        return;
      }
    }

    // 5. Multi-selected zones
    if (this.store.selectedZoneIds.size > 1) {
      hud.hidden = false;
      const count = this.store.selectedZoneIds.size;
      const zones = this.store.getSelectedZones();
      const totalPanels = zones.reduce((s, z) => s + z.activePanelCount, 0);
      const totalKwp = (zones.reduce((s, z) => s + (z.totalKwp || 0), 0)).toFixed(1);
      if (badge) badge.textContent = '✨';
      if (title) title.textContent = `${count} Arrays Selected`;
      if (sub) sub.textContent = `${totalPanels} Panels • ${totalKwp} kWp Total`;
      return;
    }

    // 6. Single zone selected
    if (this.store.selectedZoneId) {
      const zone = this.store.getZone(this.store.selectedZoneId);
      if (zone) {
        hud.hidden = false;
        if (badge) badge.textContent = zone.config.mountType === 'ground' ? '🌱' : '🏠';
        if (title) title.textContent = zone.name;
        if (sub) sub.textContent = `${zone.config.mountType.toUpperCase()} • ${zone.activePanelCount} Panels • ${zone.totalKwp.toFixed(1)} kWp`;
        return;
      }
    }

    // None selected
    hud.hidden = true;
  }

  public updateDrawingHud(): void {
    const hud = document.getElementById('map-drawing-hud');
    if (!hud) return;

    const mode = this.store.drawingMode;
    if (mode === 'none') {
      hud.hidden = true;
      return;
    }

    hud.hidden = false;
    const title = document.getElementById('hud-drawing-title');
    const hint = document.getElementById('hud-drawing-hint');
    const btnFinish = document.getElementById('btn-hud-finish-draw') as HTMLButtonElement | null;

    const count = this.drawingPoints.length;
    const minPoints = mode === 'raceway' ? 2 : 3;

    if (btnFinish) {
      btnFinish.disabled = count < minPoints;
      btnFinish.style.display = mode === 'inverter' ? 'none' : '';
    }

    if (mode === 'zone') {
      const isRoof = this.store.drawingMountType === 'roof';
      if (title) title.textContent = isRoof ? '🏠 Drawing Roof Array' : '🌱 Drawing Ground Array';
      if (hint) {
        hint.textContent = count === 0
          ? 'Click map to place array perimeter corners'
          : `${count} vertices placed. Double-click or click start point to close.`;
      }
    } else if (mode === 'keepout') {
      if (title) title.textContent = '🚫 Drawing Keep-Out Obstacle';
      if (hint) {
        hint.textContent = count === 0
          ? 'Click map to outline obstacle (HVAC, skylight, vents)'
          : `${count} vertices placed. Double-click or click start point to close.`;
      }
    } else if (mode === 'raceway') {
      if (title) title.textContent = '🛤️ Drawing Homerun Cable Trunk';
      if (hint) {
        hint.textContent = count === 0
          ? 'Click map to place conduit start & route'
          : `${count} points placed. Double-click or click Finish when done.`;
      }
    } else if (mode === 'inverter') {
      if (title) title.textContent = '⚡ Placing Inverter Power House';
      if (hint) hint.textContent = 'Click anywhere on map to set power station position.';
    }
  }

  public addDrawingPoint(pt: LatLngPoint): void {
    this.drawingPoints.push(pt);

    // If first point clicked again and we have >= 4 points, finish
    if (this.drawingPoints.length >= 4) {
      const first = this.drawingPoints[0];
      const dist = this.map.distance([pt.lat, pt.lng], [first.lat, first.lng]);
      if (dist < 4) {
        this.drawingPoints.pop();
        this.finishDrawing();
        return;
      }
    }

    if (this.drawingPreviewLayer) {
      this.drawingPreviewLayer.setLatLngs(this.drawingPoints.map(p => [p.lat, p.lng]));
    }
    this.updateDrawingHud();
  }

  public finishDrawing(): void {
    const mode = this.store.drawingMode;
    const minPoints = mode === 'raceway' ? 2 : 3;

    if (this.drawingPoints.length < minPoints) {
      this.cancelDrawing();
      return;
    }

    const points = [...this.drawingPoints];
    this.cancelDrawing();

    if (mode === 'zone') {
      const mountType = this.store.drawingMountType || 'roof';
      const targetSystemId = this.store.selectedSystemId || undefined;
      this.store.addZone(points, mountType, undefined, targetSystemId);
    } else if (mode === 'keepout') {
      let targetZone = this.store.getSelectedZone();
      if (!targetZone) {
        const zones = this.store.getZones();
        for (const z of zones) {
          if (L.latLngBounds(z.vertices.map(v => [v.lat, v.lng])).contains([points[0].lat, points[0].lng])) {
            targetZone = z;
            break;
          }
        }
        if (!targetZone && zones.length > 0) {
          targetZone = zones[0];
        }
      }
      if (targetZone) {
        this.store.addKeepOut(targetZone.id, points);
        this.store.selectZone(targetZone.id);
      }
    } else if (mode === 'raceway') {
      const selectedZone = this.store.getSelectedZone();
      const targetSystem = (selectedZone ? this.store.getSystem(selectedZone.systemId) : null)
        || this.store.getSelectedSystem()
        || this.store.getSystems()[0];

      if (targetSystem) {
        this.store.setSystemHomerun(
          targetSystem.id,
          points,
          targetSystem.inverterElevationM || selectedZone?.elevationDeltaM || 0
        );
        this.selectedHomerunSystemId = targetSystem.id;
        this.store.selectSystem(targetSystem.id);
      }
    }
  }

  public cancelDrawing(): void {
    this.drawingPoints = [];
    if (this.drawingPreviewLayer) {
      this.map.removeLayer(this.drawingPreviewLayer);
      this.drawingPreviewLayer = null;
    }
    this.store.setDrawingMode('none');
    this.updateDrawingHud();
    this.updateSelectionHud();
  }

  public render(): void {
    this.renderZones();
    this.renderKeepOuts();
    this.renderMountTables();
    this.renderRoofRails();
    this.renderPanels();
    this.renderTiltArrows();
    this.renderRaceways();
    this.renderStringLines();
    this.renderInverterStations();
    if (!this.isInteractingMapHandle) {
      this.renderVertexHandles();
    }
    this.updateSelectionHud();
    this.updateDrawingHud();
  }

  private renderRaceways(): void {
    this.racewayLayerGroup.clearLayers();
    this.racewayVertexGroup.clearLayers();
    const vf = this.store.viewFilter;
    if (vf.showRaceways === false || vf.xRayMode) return;

    const zones = this.store.getZones();
    const systems = this.store.getSystems();
    const selectedZoneId = this.store.selectedZoneId;
    const selectedSystemId = this.store.selectedSystemId;

    // 1. Render Shared System Homerun Trunks
    for (const sys of systems) {
      const homerun = sys.homerunRaceway;
      if (!homerun || !homerun.path || homerun.path.length < 2) continue;

      const isSelected = this.selectedHomerunSystemId === sys.id || (!selectedZoneId && selectedSystemId === sys.id);
      const pathPts = homerun.path.map(p => [p.lat, p.lng] as [number, number]);

      let pathLen2D = 0;
      for (let j = 0; j < homerun.path.length - 1; j++) {
        pathLen2D += this.map.distance(
          [homerun.path[j].lat, homerun.path[j].lng],
          [homerun.path[j + 1].lat, homerun.path[j + 1].lng]
        );
      }
      const elevM = Math.abs(homerun.elevationChangeM);
      const totalRunM = (pathLen2D + elevM).toFixed(1);
      const connectedZones = zones.filter(z => z.systemId === sys.id && !z.raceway);
      const totalPanels = connectedZones.reduce((sum, z) => sum + z.activePanelCount, 0);

      // Outer casing for high visibility
      const casing = L.polyline(pathPts, {
        color: '#0b0f19',
        weight: isSelected ? 9 : 7,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: true
      });

      // Inner conduit polyline
      const conduit = L.polyline(pathPts, {
        color: isSelected ? '#fbbf24' : (sys.color || '#f59e0b'),
        weight: isSelected ? 5 : 3.5,
        opacity: 0.98,
        dashArray: '8, 4',
        lineCap: 'round',
        lineJoin: 'round',
        interactive: true
      });

      const onHomerunSelect = (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        this.selectedHomerunSystemId = sys.id;
        this.selectedRacewayZoneId = null;
        this.selectedInverterSystemId = null;
        this.store.selectKeepOut(null);
        this.store.selectSystem(sys.id);
        this.renderRaceways();
        this.updateSelectionHud();
      };

      casing.on('click', onHomerunSelect);
      conduit.on('click', onHomerunSelect);

      conduit.bindTooltip(
        `<strong>🛤️ Shared Homerun Trunk (${sys.name})</strong><br/>Path Length: ${pathLen2D.toFixed(1)}m | Elev Drop: ${elevM}m | Total Run: ${totalRunM}m<br/>Auto-Connected Arrays: ${connectedZones.length} (${totalPanels} modules)<br/><small>Click to edit nodes & bends</small>`,
        { sticky: true, className: 'solar-tooltip' }
      );

      this.racewayLayerGroup.addLayer(casing);
      this.racewayLayerGroup.addLayer(conduit);

      // Start and Exit Badges
      const exitInfo = getHomerunExitDirection(homerun.path, sys.inverterLocation || null);
      const startIdx = exitInfo.exitEnd === 'end' ? 0 : homerun.path.length - 1;
      const exitIdx = exitInfo.exitEnd === 'end' ? homerun.path.length - 1 : 0;

      const sysShortName = sys.name.split(':')[0].trim();
      const startBadge = L.divIcon({
        className: 'raceway-entrance-icon',
        html: `<div class="raceway-marker-badge homerun" style="border-left: 4px solid ${sys.color || '#f59e0b'};" title="Shared Homerun Trunk (${sys.name})">🛤️ ${sysShortName} TRUNK</div>`,
        iconSize: [120, 20],
        iconAnchor: [60, 10]
      });
      const startMarker = L.marker(pathPts[startIdx], { icon: startBadge, interactive: true, zIndexOffset: 850 });
      startMarker.on('click', onHomerunSelect);
      this.racewayLayerGroup.addLayer(startMarker);

      const exitBadge = L.divIcon({
        className: 'raceway-entrance-icon',
        html: `<div class="raceway-marker-badge exit" style="border-left: 4px solid ${sys.color || '#f59e0b'};" title="Homerun Exit to ${sys.name} Inverter">⚡ TO ${sysShortName} INV</div>`,
        iconSize: [110, 20],
        iconAnchor: [55, 10]
      });
      const exitMarker = L.marker(pathPts[exitIdx], { icon: exitBadge, interactive: true, zIndexOffset: 850 });
      exitMarker.on('click', onHomerunSelect);
      this.racewayLayerGroup.addLayer(exitMarker);

      // Render draggable vertex handles when homerun is selected
      if (isSelected && this.store.drawingMode === 'none' && this.store.viewFilter.showVertices !== false) {
        const racewayPath = homerun.path;
        racewayPath.forEach((pt, idx) => {
          const isExit = idx === exitIdx;
          const isStart = idx === startIdx;

          const handleIcon = L.divIcon({
            className: 'raceway-handle-container',
            html: `<div class="raceway-node-pill ${isExit ? 'exit' : isStart ? 'entrance' : 'bend'}" title="${isStart ? 'Homerun Trunk Start' : isExit ? 'Homerun Exit (to Inverter)' : `Homerun Node #${idx + 1}`}"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          });

          const handle = L.marker([pt.lat, pt.lng], {
            draggable: true,
            icon: handleIcon,
            zIndexOffset: 1200
          });

          handle.bindTooltip(
            `<b>${isStart ? 'Homerun Trunk Start' : isExit ? 'Homerun Exit' : `Homerun Node #${idx + 1}`}</b><br/><small>Drag to adjust &bull; Right-Click or Double-Click to Delete</small>`,
            { direction: 'top', className: 'solar-tooltip' }
          );

          handle.on('dragstart', () => {
            this.isInteractingMapHandle = true;
          });

          handle.on('drag', (e: L.LeafletEvent) => {
            const dragPos = (e.target as L.Marker).getLatLng();
            const currentSys = this.store.getSystem(sys.id);
            if (currentSys?.homerunRaceway) {
              const updatedPath = [...currentSys.homerunRaceway.path];
              updatedPath[idx] = { lat: dragPos.lat, lng: dragPos.lng };
              const polyCoords = updatedPath.map(p => [p.lat, p.lng] as [number, number]);
              conduit.setLatLngs(polyCoords);
              casing.setLatLngs(polyCoords);
              if (idx === startIdx) startMarker.setLatLng(dragPos);
              if (idx === exitIdx) exitMarker.setLatLng(dragPos);
            }
          });

          handle.on('dragend', (e: L.LeafletEvent) => {
            this.isInteractingMapHandle = false;
            const dragPos = (e.target as L.Marker).getLatLng();
            const currentSys = this.store.getSystem(sys.id);
            if (currentSys?.homerunRaceway) {
              const updatedPath = [...currentSys.homerunRaceway.path];
              updatedPath[idx] = { lat: dragPos.lat, lng: dragPos.lng };
              this.store.updateSystemHomerunVertices(sys.id, updatedPath);
            }
          });

          const deleteNode = (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            const currentSys = this.store.getSystem(sys.id);
            if (currentSys?.homerunRaceway && currentSys.homerunRaceway.path.length > 2) {
              this.store.deleteSystemHomerunVertex(sys.id, idx);
            } else {
              alert('A homerun path must have at least 2 points.');
            }
          };

          handle.on('contextmenu', deleteNode);
          handle.on('dblclick', deleteNode);

          this.racewayVertexGroup.addLayer(handle);
        });

        // Add midpoint "+" handles to insert vertices along homerun segments
        for (let j = 0; j < homerun.path.length - 1; j++) {
          const pA = homerun.path[j];
          const pB = homerun.path[j + 1];
          const midLat = (pA.lat + pB.lat) / 2;
          const midLng = (pA.lng + pB.lng) / 2;

          const midIcon = L.divIcon({
            className: 'raceway-midpoint-icon',
            html: `<div class="raceway-split-plus" title="Click to insert bend node">+</div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          });

          const midHandle = L.marker([midLat, midLng], {
            icon: midIcon,
            zIndexOffset: 1000
          });

          midHandle.bindTooltip('<b>+ Add Homerun Bend Node</b>', {
            direction: 'top',
            className: 'solar-tooltip'
          });

          midHandle.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            this.store.addSystemHomerunVertex(sys.id, j, { lat: midLat, lng: midLng });
          });

          this.racewayVertexGroup.addLayer(midHandle);
        }
      }
    }

    // 2. Render Any Dedicated Array Raceways
    for (const zone of zones) {
      const raceway = zone.raceway;
      if (!raceway || !raceway.path || raceway.path.length < 2) continue;

      const isSelected = zone.id === selectedZoneId;
      const pathPts = raceway.path.map(p => [p.lat, p.lng] as [number, number]);

      let pathLen2D = 0;
      for (let j = 0; j < raceway.path.length - 1; j++) {
        pathLen2D += this.map.distance(
          [raceway.path[j].lat, raceway.path[j].lng],
          [raceway.path[j + 1].lat, raceway.path[j + 1].lng]
        );
      }
      const elevM = Math.abs(raceway.elevationChangeM);
      const totalRunM = (pathLen2D + elevM).toFixed(1);

      const casing = L.polyline(pathPts, {
        color: '#0b0f19',
        weight: isSelected ? 8 : 6,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: true
      });

      const conduit = L.polyline(pathPts, {
        color: isSelected ? '#38bdf8' : '#0284c7',
        weight: isSelected ? 4 : 3,
        opacity: 0.95,
        dashArray: '8, 4',
        lineCap: 'round',
        lineJoin: 'round',
        interactive: true
      });

      const onRacewaySelect = (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        this.selectedRacewayZoneId = zone.id;
        this.selectedHomerunSystemId = null;
        this.selectedInverterSystemId = null;
        this.store.selectKeepOut(null);
        this.store.selectZone(zone.id);
        this.renderRaceways();
        this.updateSelectionHud();
      };

      casing.on('click', onRacewaySelect);
      conduit.on('click', onRacewaySelect);

      conduit.bindTooltip(
        `<strong>🛤️ Array Raceway: ${raceway.name || zone.name}</strong><br/>Path: ${pathLen2D.toFixed(1)}m | Elev Drop: ${elevM}m | Total Run: ${totalRunM}m<br/><small>Click to edit nodes & elevation</small>`,
        { sticky: true, className: 'solar-tooltip' }
      );

      this.racewayLayerGroup.addLayer(casing);
      this.racewayLayerGroup.addLayer(conduit);

      const entranceIcon = L.divIcon({
        className: 'raceway-entrance-icon',
        html: `<div class="raceway-marker-badge" title="Raceway DC Collection Entrance">🛤️ IN</div>`,
        iconSize: [44, 20],
        iconAnchor: [22, 10]
      });
      const entranceMarker = L.marker(pathPts[0], { icon: entranceIcon, interactive: true, zIndexOffset: 800 });
      entranceMarker.on('click', onRacewaySelect);
      this.racewayLayerGroup.addLayer(entranceMarker);

      if (isSelected && this.store.drawingMode === 'none') {
        const racewayPath = raceway.path;
        racewayPath.forEach((pt, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === racewayPath.length - 1;

          const handleIcon = L.divIcon({
            className: 'raceway-handle-container',
            html: `<div class="raceway-node-pill ${isFirst ? 'entrance' : isLast ? 'exit' : 'bend'}"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          });

          const handle = L.marker([pt.lat, pt.lng], {
            draggable: true,
            icon: handleIcon,
            zIndexOffset: 1200
          });

          handle.on('drag', () => {
            const currentLatLng = handle.getLatLng();
            const currentZone = this.store.getZone(zone.id);
            if (currentZone?.raceway) {
              const updatedPath = [...currentZone.raceway.path];
              updatedPath[idx] = { lat: currentLatLng.lat, lng: currentLatLng.lng };
              const polyCoords = updatedPath.map(p => [p.lat, p.lng] as [number, number]);
              conduit.setLatLngs(polyCoords);
              casing.setLatLngs(polyCoords);
              if (isFirst) entranceMarker.setLatLng(currentLatLng);
            }
          });

          handle.on('dragend', () => {
            const currentLatLng = handle.getLatLng();
            const currentZone = this.store.getZone(zone.id);
            if (currentZone?.raceway) {
              const updatedPath = [...currentZone.raceway.path];
              updatedPath[idx] = { lat: currentLatLng.lat, lng: currentLatLng.lng };
              this.store.updateRacewayVertices(zone.id, updatedPath);
            }
          });

          const deleteNode = (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            const currentZone = this.store.getZone(zone.id);
            if (currentZone?.raceway && currentZone.raceway.path.length > 2) {
              this.store.deleteRacewayVertex(zone.id, idx);
            } else {
              alert('A raceway path must have at least 2 points.');
            }
          };

          handle.on('contextmenu', deleteNode);
          handle.on('dblclick', deleteNode);

          this.racewayVertexGroup.addLayer(handle);
        });

        for (let j = 0; j < raceway.path.length - 1; j++) {
          const pA = raceway.path[j];
          const pB = raceway.path[j + 1];
          const midLat = (pA.lat + pB.lat) / 2;
          const midLng = (pA.lng + pB.lng) / 2;

          const midIcon = L.divIcon({
            className: 'raceway-midpoint-icon',
            html: `<div class="raceway-split-plus">+</div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          });

          const midHandle = L.marker([midLat, midLng], {
            icon: midIcon,
            zIndexOffset: 1000
          });

          midHandle.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            this.store.addRacewayVertex(zone.id, j, { lat: midLat, lng: midLng });
          });

          this.racewayVertexGroup.addLayer(midHandle);
        }
      }
    }
  }

  private renderStringLines(): void {
    this.stringLinesLayerGroup.clearLayers();
    this.homerunLinesLayerGroup.clearLayers();
    const vf = this.store.viewFilter;
    const showStrings = vf.showStringLines !== false;
    const showHomerun = vf.showHomerunLines !== false;
    if ((!showStrings && !showHomerun) || vf.xRayMode || vf.panelVisibility === 'hidden') return;

    const panels = this.store.getPanels().filter(p => p.active && p.stringId);
    if (panels.length === 0) return;

    // For large farms (>3000 modules), only render string circuits when zoomed in to level >= 17
    const currentZoom = this.map.getZoom();
    if (panels.length > 3000 && currentZoom <= 16) {
      return;
    }

    const stringMap = new Map<string, typeof panels>();
    for (const p of panels) {
      if (!p.stringId) continue;
      const groupKey = `${p.systemId || ''}::${p.stringId}`;
      if (!stringMap.has(groupKey)) {
        stringMap.set(groupKey, []);
      }
      stringMap.get(groupKey)!.push(p);
    }

    const STRING_PALETTE = [
      '#eab308', // Amber / Gold
      '#06b6d4', // Cyan
      '#ec4899', // Pink
      '#a855f7', // Purple
      '#10b981', // Emerald
      '#f97316', // Orange
      '#38bdf8', // Sky
      '#14b8a6'  // Teal
    ];

    let colorIdx = 0;
    let renderedStrings = 0;
    const MAX_RENDERED_STRINGS = 200;
    const viewBounds = panels.length > 300 ? this.map.getBounds().pad(0.35) : null;

    for (const [, strPanels] of stringMap.entries()) {
      if (strPanels.length < 2) continue;
      if (renderedStrings >= MAX_RENDERED_STRINGS) break;

      const stringId = strPanels[0].stringId!;
      const orderedPanels = chainAdjacentPanels(strPanels);

      // Viewport culling for string routes on large farms
      if (viewBounds) {
        const start = orderedPanels[0].centroid;
        const end = orderedPanels[orderedPanels.length - 1].centroid;
        if (!viewBounds.contains([start.lat, start.lng]) && !viewBounds.contains([end.lat, end.lng])) {
          continue;
        }
      }
      renderedStrings++;
      const color = STRING_PALETTE[colorIdx % STRING_PALETTE.length];
      colorIdx++;

      // 1. Intra-string polyline
      const latlngs = orderedPanels.map(p => [p.centroid.lat, p.centroid.lng] as [number, number]);
      const polyline = L.polyline(latlngs, {
        color,
        weight: 2.5,
        opacity: 0.9,
        dashArray: '3, 4'
      });

      polyline.bindTooltip(
        `<strong>String: ${stringId}</strong><br/>${orderedPanels.length} modules &bull; ${orderedPanels[0].mpptId || 'MPPT'}`,
        { sticky: true, className: 'solar-tooltip' }
      );

      if (showStrings) {
        this.stringLinesLayerGroup.addLayer(polyline);
      }

      // 2. Homerun lines to Inverter or Raceway Entrance
      const sys = this.store.getSystem(orderedPanels[0].systemId);
      const zone = this.store.getZone(orderedPanels[0].zoneId);
      const zoneRaceway = (zone && zone.systemId === sys?.id) ? zone.raceway : null;
      const activeHomerun = zoneRaceway || sys?.homerunRaceway;
      const hasRaceway = Boolean(activeHomerun && activeHomerun.path && activeHomerun.path.length >= 2);

      if (sys && showHomerun) {
        const startPt = orderedPanels[0].centroid;
        const endPt = orderedPanels[orderedPanels.length - 1].centroid;

        if (hasRaceway && activeHomerun && activeHomerun.path.length >= 2) {
          const sysCables = this.store.getStringCables(sys.id);
          const cableInfo = sysCables.find(c => c.stringId === stringId && c.systemId === sys.id);

          const tapPos = cableInfo?.tapPointPos || activeHomerun.path[0];
          const tapNeg = cableInfo?.tapPointNeg || activeHomerun.path[0];
          const posDist = this.map.distance([startPt.lat, startPt.lng], [tapPos.lat, tapPos.lng]);
          const negDist = this.map.distance([endPt.lat, endPt.lng], [tapNeg.lat, tapNeg.lng]);

          // Lead (+) from start panel to tap point on homerun trunk
          const posLine = L.polyline(
            [[startPt.lat, startPt.lng], [tapPos.lat, tapPos.lng]],
            { color: '#ef4444', weight: 1.5, opacity: 0.8, dashArray: '4, 4' }
          );
          posLine.bindTooltip(
            `<strong>${stringId} (+) Lead to ${cableInfo?.isSharedHomerun ? 'Homerun Trunk' : 'Raceway'}</strong><br/>Distance: ${posDist.toFixed(1)}m ➔ Taps into Conduit Trunk`,
            { sticky: true, className: 'solar-tooltip' }
          );
          this.homerunLinesLayerGroup.addLayer(posLine);

          // Lead (-) from end panel to tap point on homerun trunk
          const negLine = L.polyline(
            [[endPt.lat, endPt.lng], [tapNeg.lat, tapNeg.lng]],
            { color: '#3b82f6', weight: 1.5, opacity: 0.8, dashArray: '4, 4' }
          );
          negLine.bindTooltip(
            `<strong>${stringId} (-) Lead to ${cableInfo?.isSharedHomerun ? 'Homerun Trunk' : 'Raceway'}</strong><br/>Distance: ${negDist.toFixed(1)}m ➔ Taps into Conduit Trunk`,
            { sticky: true, className: 'solar-tooltip' }
          );
          this.homerunLinesLayerGroup.addLayer(negLine);

          // Connect raceway / homerun exit to inverter if not identical
          if (sys.inverterLocation) {
            const exitInfo = getHomerunExitDirection(activeHomerun.path, sys.inverterLocation);
            const exitPt = exitInfo.exitPoint;
            const distToInv = this.map.distance([exitPt.lat, exitPt.lng], [sys.inverterLocation.lat, sys.inverterLocation.lng]);
            if (distToInv > 1.0) {
              const connectLine = L.polyline(
                [[exitPt.lat, exitPt.lng], [sys.inverterLocation.lat, sys.inverterLocation.lng]],
                { color: '#f59e0b', weight: 2.5, opacity: 0.8, dashArray: '6, 4' }
              );
              connectLine.bindTooltip(`Homerun Trunk termination to Inverter (${distToInv.toFixed(1)}m)`, { sticky: true, className: 'solar-tooltip' });
              this.homerunLinesLayerGroup.addLayer(connectLine);
            }
          }
        } else if (sys.inverterLocation) {
          // Direct homerun fallback when no raceway is drawn
          const deltaElev = zone?.elevationDeltaM ?? 0;
          const invLoc = sys.inverterLocation;
          const posDist2D = this.map.distance([startPt.lat, startPt.lng], [invLoc.lat, invLoc.lng]);
          const negDist2D = this.map.distance([endPt.lat, endPt.lng], [invLoc.lat, invLoc.lng]);
          const posRun = (posDist2D + Math.abs(deltaElev)).toFixed(1);
          const negRun = (negDist2D + Math.abs(deltaElev)).toFixed(1);

          const posLine = L.polyline(
            [[startPt.lat, startPt.lng], [invLoc.lat, invLoc.lng]],
            { color: '#ef4444', weight: 1.5, opacity: 0.65, dashArray: '5, 5' }
          );
          posLine.bindTooltip(
            `<strong>${stringId} (+) Homerun</strong><br/>Ground: ${posDist2D.toFixed(1)}m | Δh: ${deltaElev}m | Wire: ${posRun}m`,
            { sticky: true, className: 'solar-tooltip' }
          );
          this.homerunLinesLayerGroup.addLayer(posLine);

          const negLine = L.polyline(
            [[endPt.lat, endPt.lng], [invLoc.lat, invLoc.lng]],
            { color: '#3b82f6', weight: 1.5, opacity: 0.65, dashArray: '5, 5' }
          );
          negLine.bindTooltip(
            `<strong>${stringId} (-) Homerun</strong><br/>Ground: ${negDist2D.toFixed(1)}m | Δh: ${deltaElev}m | Wire: ${negRun}m`,
            { sticky: true, className: 'solar-tooltip' }
          );
          this.homerunLinesLayerGroup.addLayer(negLine);
        }
      }
    }
  }

  private renderInverterStations(): void {
    this.inverterStationGroup.clearLayers();
    if (this.store.viewFilter.showInverters === false || this.store.viewFilter.xRayMode) return;

    const systems = this.store.getSystems();
    const selectedSysId = this.store.selectedSystemId;

    for (const sys of systems) {
      if (!sys.inverterLocation) continue;

      const isSelected = sys.id === selectedSysId;
      const inv = sys.inverter;
      const color = sys.color || '#f59e0b';
      const cableSummary = this.store.getSystemCableSummary(sys.id);

      const icon = L.divIcon({
        className: 'inverter-station-div-icon',
        html: `
          <div class="inverter-station-marker ${isSelected ? 'selected' : ''}" style="--inv-color: ${color};">
            <div class="inv-pulse"></div>
            <div class="inv-badge">
              <span class="inv-icon">⚡</span>
              <span class="inv-title">${sys.name.split(':')[0]}</span>
            </div>
            <div class="inv-pole"></div>
          </div>
        `,
        iconSize: [110, 48],
        iconAnchor: [55, 46]
      });

      const marker = L.marker([sys.inverterLocation.lat, sys.inverterLocation.lng], {
        icon,
        draggable: true,
        zIndexOffset: 1000
      });

      marker.on('dragend', (e: L.LeafletEvent) => {
        const latlng = (e.target as L.Marker).getLatLng();
        this.store.setSystemInverterLocation(sys.id, { lat: latlng.lat, lng: latlng.lng });
      });

      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        this.selectedInverterSystemId = sys.id;
        this.selectedHomerunSystemId = null;
        this.selectedRacewayZoneId = null;
        this.store.selectKeepOut(null);
        this.store.selectSystem(sys.id);
        this.updateSelectionHud();
      });

      marker.on('popupopen', () => {
        const btnDel = document.querySelector(`.btn-del-inverter-loc[data-sys-id="${sys.id}"]`);
        btnDel?.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.store.clearSystemInverterLocation(sys.id);
          this.selectedInverterSystemId = null;
          this.map.closePopup();
          this.updateSelectionHud();
        });
      });

      const popupContent = `
        <div class="inverter-popup">
          <h4>⚡ Inverter Power House</h4>
          <div class="inv-pop-row"><span>System:</span> <strong>${sys.name}</strong></div>
          <div class="inv-pop-row"><span>Model:</span> <strong>${inv.modelName}</strong></div>
          <div class="inv-pop-row"><span>Capacity:</span> <strong>${inv.inverterCount}x (${inv.inverterCount * inv.ratedAcPowerKw} kW AC)</strong></div>
          <div class="inv-pop-row"><span>Coords:</span> <small>${sys.inverterLocation.lat.toFixed(6)}, ${sys.inverterLocation.lng.toFixed(6)}</small></div>
          <div class="inv-pop-row"><span>Base Elevation:</span> <strong>${sys.inverterElevationM ?? 0} m</strong></div>
          <div class="inv-pop-divider"></div>
          <div class="inv-pop-row"><span>Connected Strings:</span> <strong>${cableSummary.totalStrings}</strong></div>
          <div class="inv-pop-row"><span>Total DC Cable:</span> <strong style="color: var(--accent-green);">${cableSummary.totalCableLengthM} m</strong></div>
          <div class="inv-pop-row"><span>Homerun Cabling:</span> <strong>${cableSummary.totalHomerunM} m</strong></div>
          <div class="inv-pop-row"><span>Riser Drop:</span> <strong>${cableSummary.totalElevationRiserM} m</strong></div>
          <div class="inv-pop-actions" style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-subtle, #334155); display: flex; justify-content: flex-end;">
            <button type="button" class="btn btn-xs btn-outline danger btn-del-inverter-loc" data-sys-id="${sys.id}" title="Remove power house location from map">🗑️ Remove Location</button>
          </div>
          <small class="inv-pop-hint">💡 Tip: Drag marker to reposition power house and recalculate lengths</small>
        </div>
      `;
      marker.bindPopup(popupContent, { className: 'solar-dark-popup' });

      marker.bindTooltip(`<strong>⚡ ${sys.name} Power House</strong><br/>${cableSummary.totalCableLengthM}m DC Cable &bull; Click to select/delete &bull; Drag to relocate`, {
        direction: 'top',
        offset: [0, -42],
        className: 'solar-tooltip'
      });

      this.inverterStationGroup.addLayer(marker);
    }
  }

  private renderZones(): void {
    this.zoneLayerGroup.clearLayers();
    const zones = this.store.getZones();
    const vf = this.store.viewFilter;
    const isDrawing = this.store.drawingMode !== 'none';

    for (const zone of zones) {
      const isSelected = this.store.isZoneSelected(zone.id);

      let fillOpacity = 0.15;
      if (!vf.showArrayFill || vf.xRayMode || isDrawing) {
        fillOpacity = isSelected ? 0.08 : 0;
      } else if (isSelected) {
        fillOpacity = 0.24;
      }

      const poly = L.polygon(
        zone.vertices.map(v => [v.lat, v.lng]),
        {
          color: isSelected ? '#fbbf24' : zone.color,
          weight: isSelected ? 3.5 : 2,
          fillColor: zone.color,
          fillOpacity,
          dashArray: isSelected ? undefined : '3, 3'
        }
      );

      poly.on('click', (e: L.LeafletMouseEvent) => {
        if (this.store.drawingMode === 'inverter') {
          const currentSys = this.store.getSelectedSystem();
          if (currentSys) {
            this.store.setSystemInverterLocation(currentSys.id, { lat: e.latlng.lat, lng: e.latlng.lng });
          }
          this.store.setDrawingMode('none');
          return;
        }

        // Forward clicks to drawing engine so user can draw keepouts directly over arrays!
        if (this.store.drawingMode !== 'none') {
          this.addDrawingPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
          return;
        }

        L.DomEvent.stopPropagation(e);
        const isMulti = e.originalEvent.shiftKey || e.originalEvent.ctrlKey || e.originalEvent.metaKey;
        this.selectedHomerunSystemId = null;
        this.selectedRacewayZoneId = null;
        this.selectedInverterSystemId = null;
        this.store.selectKeepOut(null);
        this.store.selectZone(zone.id, isMulti);
        this.updateSelectionHud();
      });

      poly.on('contextmenu', (e: L.LeafletMouseEvent) => {
        if (this.store.drawingMode !== 'none') return;
        L.DomEvent.stopPropagation(e);
        this.store.selectZone(zone.id);

        if (zone.vertices.length >= 3) {
          const centroid = computePolygonCentroid(zone.vertices);
          const closest = findClosestPolygonEdge({ lat: e.latlng.lat, lng: e.latlng.lng }, zone.vertices);
          const downslopeAzimuth = calculateEdgeDownslopeAzimuth(closest.v1, closest.v2, centroid);
          this.store.updateZoneConfig(zone.id, { azimuthDeg: downslopeAzimuth }, true, 12);
        }
      });

      const sys = this.store.getSystem(zone.systemId);
      poly.bindTooltip(
        `<strong>${zone.name}</strong> <span style="color: ${sys?.color || '#38bdf8'}; font-size: 11px;">[${sys?.name?.split(':')[0] || 'System'}]</span><br/>${zone.activePanelCount} panels &bull; ${zone.totalKwp} kWp<br/><small style="color: #94a3b8;">Click to select &bull; Shift+Click to multi-select</small>`,
        { sticky: true, className: 'solar-tooltip' }
      );

      this.zoneLayerGroup.addLayer(poly);
    }
  }

  private renderKeepOuts(): void {
    this.keepOutLayerGroup.clearLayers();
    if (!this.store.viewFilter.showKeepOuts) return;

    const zones = this.store.getZones();
    const selectedKoId = this.store.selectedKeepOutId;

    for (const zone of zones) {
      for (const ko of zone.keepOuts) {
        const isSelected = ko.id === selectedKoId;
        const poly = L.polygon(
          ko.vertices.map(v => [v.lat, v.lng]),
          {
            color: isSelected ? '#fbbf24' : '#ef4444',
            weight: isSelected ? 3 : 2,
            fillColor: '#ef4444',
            fillOpacity: isSelected ? 0.5 : 0.35,
            dashArray: '4, 4'
          }
        );

        poly.on('click', (e: L.LeafletMouseEvent) => {
          if (this.store.drawingMode === 'inverter') {
            const currentSys = this.store.getSelectedSystem();
            if (currentSys) {
              this.store.setSystemInverterLocation(currentSys.id, { lat: e.latlng.lat, lng: e.latlng.lng });
            }
            this.store.setDrawingMode('none');
            return;
          }

          if (this.store.drawingMode !== 'none') {
            this.addDrawingPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
            return;
          }
          L.DomEvent.stopPropagation(e);
          this.selectedHomerunSystemId = null;
          this.selectedRacewayZoneId = null;
          this.selectedInverterSystemId = null;
          this.store.selectZone(zone.id);
          this.store.selectKeepOut(ko.id);
          this.updateSelectionHud();
        });

        poly.bindTooltip(`Obstacle: ${ko.name}<br/><small>Click to edit vertices</small>`, {
          sticky: true,
          className: 'solar-tooltip'
        });
        this.keepOutLayerGroup.addLayer(poly);
      }
    }
  }

  private renderMountTables(): void {
    this.tableRackLayerGroup.clearLayers();

    const vf = this.store.viewFilter;
    if (vf.showMountTables === false || (vf.panelVisibility === 'hidden' && !vf.xRayMode)) {
      return;
    }

    const zones = this.store.getZones();
    const totalTables = zones.reduce((acc, z) => acc + (z.tables ? z.tables.length : 0), 0);
    const viewBounds = totalTables > 150 ? this.map.getBounds().pad(0.35) : null;
    let renderedTables = 0;
    const MAX_RENDERED_TABLES = 1200;

    for (const zone of zones) {
      if (zone.config.mountType !== 'ground' || !zone.tables || zone.tables.length === 0) {
        continue;
      }

      for (const table of zone.tables) {
        if (viewBounds) {
          if (!viewBounds.contains([table.centroid.lat, table.centroid.lng])) {
            continue;
          }
        }
        if (renderedTables >= MAX_RENDERED_TABLES) {
          break;
        }
        renderedTables++;

        const poly = L.polygon(
          table.corners.map(c => [c.lat, c.lng]),
          {
            color: '#64748b',
            weight: 1.5,
            dashArray: '4, 4',
            fillColor: '#1e293b',
            fillOpacity: 0.18,
            interactive: true
          }
        );

        poly.bindTooltip(
          `<div class="solar-tooltip rack-tooltip">
            <strong>Table #${table.tableIndex}</strong> (${table.modulesUp}P &times; ${table.modulesWide})<br>
            <span style="color: var(--accent-green);">${table.panelIds.length} Panels</span> &bull; ${zone.name}
          </div>`,
          { sticky: true, className: 'solar-tooltip' }
        );

        poly.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          this.store.selectZone(zone.id);
        });

        this.tableRackLayerGroup.addLayer(poly);
      }
      if (renderedTables >= MAX_RENDERED_TABLES) break;
    }
  }

  private renderRoofRails(): void {
    this.roofRailLayerGroup.clearLayers();

    const vf = this.store.viewFilter;
    if (vf.showRoofRails === false || (vf.panelVisibility === 'hidden' && !vf.xRayMode)) {
      return;
    }

    const zones = this.store.getZones();
    const isDimmed = vf.panelVisibility === 'dimmed' || this.store.drawingMode !== 'none';
    const viewBounds = this.map.getBounds().pad(0.35);

    for (const zone of zones) {
      if (zone.config.mountType !== 'roof' || !zone.rails || zone.rails.length === 0) {
        continue;
      }

      const isSelectedZone =
        this.store.selectedZoneId === zone.id || this.store.selectedZoneIds.has(zone.id);
      const railColor = isSelectedZone ? '#38bdf8' : '#94a3b8';
      const railWeight = isSelectedZone ? 3.0 : 2.2;
      const railOpacity = isDimmed ? 0.95 : 0.85;

      for (const rail of zone.rails) {
        if (
          !viewBounds.contains([rail.start.lat, rail.start.lng]) &&
          !viewBounds.contains([rail.end.lat, rail.end.lng])
        ) {
          continue;
        }

        const polyline = L.polyline(
          [
            [rail.start.lat, rail.start.lng],
            [rail.end.lat, rail.end.lng]
          ],
          {
            color: railColor,
            weight: railWeight,
            opacity: railOpacity,
            lineCap: 'square',
            interactive: true
          }
        );

        const positionLabel =
          rail.positionType === 'center'
            ? 'Center Rail (50%)'
            : rail.positionType === 'end_1'
              ? 'Near End Rail 1 (20%)'
              : 'Near End Rail 2 (80%)';

        polyline.bindTooltip(
          `<div class="solar-tooltip rail-tooltip">
            <strong style="color: #38bdf8;">Roof Rail: ${positionLabel}</strong><br>
            <span>Span: <b>${rail.lengthM.toFixed(2)} m</b></span> &bull; <span>${rail.panelIds.length} Panels</span><br>
            <small style="color: #94a3b8;">${zone.name} &bull; Parallel to short side</small>
          </div>`,
          { sticky: true, className: 'solar-tooltip' }
        );

        polyline.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          this.store.selectZone(zone.id);
        });

        this.roofRailLayerGroup.addLayer(polyline);

        // Render roof anchor attachment points (L-feet / brackets) when zoomed in
        if (rail.attachmentPoints && rail.attachmentPoints.length > 0 && this.map.getZoom() >= 18) {
          for (const apt of rail.attachmentPoints) {
            const anchorCircle = L.circleMarker([apt.lat, apt.lng], {
              radius: 2.5,
              color: '#0f172a',
              weight: 1,
              fillColor: isSelectedZone ? '#7dd3fc' : '#cbd5e1',
              fillOpacity: 0.95,
              interactive: false
            });
            this.roofRailLayerGroup.addLayer(anchorCircle);
          }
        }
      }
    }
  }

  private renderPanels(): void {
    this.panelLayerGroup.clearLayers();
    this.panelLayerMap.clear();

    const vf = this.store.viewFilter;
    const isDrawing = this.store.drawingMode !== 'none';

    // If hidden or in X-Ray / Tracing mode, don't render panels so satellite is completely visible
    if (vf.panelVisibility === 'hidden' || vf.xRayMode) {
      return;
    }

    const isDimmed = vf.panelVisibility === 'dimmed' || isDrawing;
    const panels = this.store.getPanels();
    const selectedPanelId = this.store.selectedPanelId;
    const totalPanels = panels.length;
    const currentZoom = this.map.getZoom();

    // Level of Detail (LOD) threshold:
    // When zoomed out (zoom <= 16) on large solar farms (> 3,000 modules, like 11MW-30MW),
    // individual panels are sub-pixel (< 1.5px).
    // In this macro scale, Mount Table Racks (tableRackLayerGroup) are rendered, giving
    // a clear CAD plan at 60 FPS without rendering tens of thousands of sub-pixel polygons.
    // Individual panels are rendered when zoomed in (zoom >= 17) for string & module inspection.
    if (totalPanels > 3000 && currentZoom <= 16 && !selectedPanelId) {
      return;
    }

    // Dynamic Viewport Culling:
    // Only instantiate/render panels within the extended viewport (with 25% buffer for smooth panning)
    const viewBounds = totalPanels > 300 ? this.map.getBounds().pad(0.25) : null;
    let renderedCount = 0;
    const MAX_VISIBLE_PANELS = 1800; // Hard cap guaranteeing 60 FPS under all zoom conditions

    const zones = this.store.getZones();
    for (const zone of zones) {
      if (zone.config.mountType === 'ground' && zone.tables && zone.tables.length > 0) {
        // Fast spatial indexing through tables (O(tables) instead of O(panels))
        for (const table of zone.tables) {
          if (viewBounds) {
            if (!viewBounds.contains([table.centroid.lat, table.centroid.lng])) {
              if (!selectedPanelId || !table.panelIds.includes(selectedPanelId)) {
                continue;
              }
            }
          }

          for (const pid of table.panelIds) {
            if (renderedCount >= MAX_VISIBLE_PANELS && pid !== selectedPanelId) {
              break;
            }
            const p = this.store.getPanel(pid);
            if (!p) continue;
            this.createPanelLayer(p, isDimmed, selectedPanelId);
            renderedCount++;
          }
          if (renderedCount >= MAX_VISIBLE_PANELS) break;
        }
      } else {
        // Rooftop continuous panels
        const zonePanels = this.store.getPanelsForZone(zone.id);
        for (const p of zonePanels) {
          if (renderedCount >= MAX_VISIBLE_PANELS && p.id !== selectedPanelId) {
            break;
          }
          if (viewBounds && p.id !== selectedPanelId) {
            if (!viewBounds.contains([p.centroid.lat, p.centroid.lng])) {
              continue;
            }
          }
          this.createPanelLayer(p, isDimmed, selectedPanelId);
          renderedCount++;
        }
      }
      if (renderedCount >= MAX_VISIBLE_PANELS) break;
    }
  }

  private createPanelLayer(
    panel: SolarPanelObject,
    isDimmed: boolean,
    selectedPanelId: string | null
  ): void {
    const isSelected = panel.id === selectedPanelId;

    let color = '#38bdf8';
    let fillColor = '#1e3a8a';
    let fillOpacity = isDimmed ? 0.2 : 0.85;
    let weight = isDimmed ? 0.8 : 1;

    if (!panel.active) {
      color = '#64748b';
      fillColor = '#334155';
      fillOpacity = isDimmed ? 0.1 : 0.35;
    } else if (isSelected) {
      color = '#ffffff';
      fillColor = '#f59e0b';
      fillOpacity = 0.95;
      weight = 2.5;
    } else if (panel.stringId) {
      let hash = 0;
      for (let i = 0; i < panel.stringId.length; i++) {
        hash = (hash << 5) - hash + panel.stringId.charCodeAt(i);
        hash |= 0;
      }
      const hue = Math.abs(hash) % 360;
      color = `hsl(${hue}, 90%, 65%)`;
      fillColor = `hsl(${hue}, 75%, 25%)`;
    }

    const poly = L.polygon(
      panel.corners.map(c => [c.lat, c.lng]),
      {
        color,
        weight,
        fillColor,
        fillOpacity
      }
    );

    poly.on('click', (e: L.LeafletMouseEvent) => {
      if (this.store.drawingMode === 'inverter') {
        const currentSys = this.store.getSelectedSystem();
        if (currentSys) {
          this.store.setSystemInverterLocation(currentSys.id, { lat: e.latlng.lat, lng: e.latlng.lng });
        }
        this.store.setDrawingMode('none');
        return;
      }

      // Forward click to drawing engine if currently drawing
      if (this.store.drawingMode !== 'none') {
        this.addDrawingPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
        return;
      }

      L.DomEvent.stopPropagation(e);
      this.store.selectPanel(panel.id);
    });

    const sys = this.store.getSystem(panel.systemId);
    const mod = this.store.getModule(panel.moduleId);
    poly.bindTooltip(
      `<div class="panel-hover-info">
        <div><strong>${panel.id}</strong> (${panel.active ? 'Active' : 'Disabled'})</div>
        <div><span style="color: ${sys?.color || '#38bdf8'}">${sys?.name?.split(':')[0] || 'System'}</span> &bull; ${mod?.name?.split(' ')[0] || 'Module'}</div>
        <div>Row ${panel.rowIndex}, Col ${panel.colIndex} &bull; ${panel.electrical.nominalPowerW}W</div>
        ${panel.stringId ? `<div>⚡ String: <b>${panel.stringId}</b> (#${panel.stringOrder})</div>` : ''}
        ${panel.mpptId ? `<div>🔌 Inverter/MPPT: <b>${panel.mpptId}</b></div>` : ''}
      </div>`,
      { sticky: true, className: 'solar-tooltip' }
    );

    this.panelLayerGroup.addLayer(poly);
    this.panelLayerMap.set(panel.id, poly);
  }

  private getCompassHeading(deg: number): string {
    return getCompassHeading(deg);
  }

  /**
   * Visualizes array and mount table tilt with downward slope arrows.
   * In solar engineering, panels slope downwards along the azimuth direction (from High Ridge to Low Eave).
   */
  private renderTiltArrows(): void {
    this.tiltArrowLayerGroup.clearLayers();
    const vf = this.store.viewFilter;
    if (vf.showTiltArrows === false || vf.xRayMode) {
      return;
    }

    const zones = this.store.getZones();
    const currentZoom = this.map.getZoom();
    const viewBounds = this.map.getBounds().pad(0.35);

    for (const zone of zones) {
      const tiltDeg = zone.config.tiltDeg;
      if (tiltDeg <= 0 || zone.vertices.length < 3) continue;

      const centroid = computePolygonCentroid(zone.vertices);
      const zoneBounds = L.latLngBounds(zone.vertices.map(v => [v.lat, v.lng] as [number, number]));
      if (!viewBounds.intersects(zoneBounds)) {
        continue;
      }

      const azimuthDeg = zone.config.azimuthDeg;
      const azimuthRad = (azimuthDeg * Math.PI) / 180.0;
      const sinA = Math.sin(azimuthRad);
      const cosA = Math.cos(azimuthRad);

      const area = computePolygonAreaSqM(zone.vertices);
      const spanM = Math.min(40, Math.max(12, Math.sqrt(area) * 0.16));
      const halfL = spanM / 2.0;

      // Downward direction vector (along azimuth)
      // Start (High edge/ridge): -direction
      // End (Low edge/eave, arrow tip pointing downhill): +direction
      const startMetric = { x: -sinA * halfL, y: -cosA * halfL };
      const endMetric = { x: sinA * halfL, y: cosA * halfL };

      const pStart = localMetricToLatLng(startMetric, centroid);
      const pEnd = localMetricToLatLng(endMetric, centroid);

      // High edge ridge crossbar (perpendicular to downslope arrow)
      const barHalfW = Math.max(3.5, spanM * 0.25);
      const pBar1 = localMetricToLatLng(
        { x: startMetric.x - cosA * barHalfW, y: startMetric.y + sinA * barHalfW },
        centroid
      );
      const pBar2 = localMetricToLatLng(
        { x: startMetric.x + cosA * barHalfW, y: startMetric.y - sinA * barHalfW },
        centroid
      );

      // Arrow stem (golden amber)
      const stemLine = L.polyline([[pStart.lat, pStart.lng], [pEnd.lat, pEnd.lng]], {
        color: '#f59e0b',
        weight: 3.5,
        opacity: 0.95,
        interactive: false
      });
      this.tiltArrowLayerGroup.addLayer(stemLine);

      // High edge ridge crossbar (shows top edge of panels)
      const ridgeBar = L.polyline([[pBar1.lat, pBar1.lng], [pBar2.lat, pBar2.lng]], {
        color: '#fbbf24',
        weight: 3.5,
        opacity: 0.95,
        interactive: false
      });
      this.tiltArrowLayerGroup.addLayer(ridgeBar);

      // Downward arrowhead barbs (pointing downslope towards pEnd)
      const barbL = Math.max(3.5, spanM * 0.22);
      const barbAngle1 = azimuthRad + Math.PI * 0.82;
      const barbAngle2 = azimuthRad - Math.PI * 0.82;
      const pBarb1 = localMetricToLatLng(
        {
          x: endMetric.x + Math.sin(barbAngle1) * barbL,
          y: endMetric.y + Math.cos(barbAngle1) * barbL
        },
        centroid
      );
      const pBarb2 = localMetricToLatLng(
        {
          x: endMetric.x + Math.sin(barbAngle2) * barbL,
          y: endMetric.y + Math.cos(barbAngle2) * barbL
        },
        centroid
      );

      const arrowhead = L.polygon(
        [
          [pEnd.lat, pEnd.lng],
          [pBarb1.lat, pBarb1.lng],
          [pBarb2.lat, pBarb2.lng]
        ],
        {
          color: '#f59e0b',
          fillColor: '#f59e0b',
          fillOpacity: 1,
          weight: 1.5,
          interactive: false
        }
      );
      this.tiltArrowLayerGroup.addLayer(arrowhead);

      const compassHeading = this.getCompassHeading(azimuthDeg);

      // Tilt badge on arrow shaft
      const tiltBadgeIcon = L.divIcon({
        className: 'tilt-indicator-div-icon',
        html: `
          <div class="tilt-arrow-badge">
            <div class="tilt-arrow-pill">
              <span class="tilt-down-glyph" style="transform: rotate(${azimuthDeg}deg);">▼</span>
              <span class="tilt-angle-val">${tiltDeg}°</span>
              <span class="tilt-dir-tag">${compassHeading}</span>
            </div>
            <div class="tilt-high-low-sub">HIGH ➔ LOW</div>
          </div>
        `,
        iconSize: [84, 38],
        iconAnchor: [42, 19]
      });

      const badgeMarker = L.marker([centroid.lat, centroid.lng], {
        icon: tiltBadgeIcon,
        zIndexOffset: 750
      });

      badgeMarker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        this.store.selectZone(zone.id);
      });

      badgeMarker.bindTooltip(
        `<div class="solar-tooltip">
          <strong>📐 ${zone.name} — Tilt & Downslope</strong><br/>
          Tilt Angle: <b>${tiltDeg}°</b><br/>
          Downward Slope Direction: <b>${azimuthDeg}° (${compassHeading})</b><br/>
          <small>Gravity/runoff flows downward from High Ridge ➔ Low Eave</small>
        </div>`,
        { direction: 'top', className: 'solar-tooltip' }
      );
      this.tiltArrowLayerGroup.addLayer(badgeMarker);

      // If this zone is selected, render a draggable compass knob on the arrow tip to rotate slope live
      if (zone.id === this.store.selectedZoneId) {
        const rotHandleIcon = L.divIcon({
          className: 'tilt-rotate-handle-icon',
          html: `
            <div class="tilt-rotate-knob" title="Drag around array to rotate slope direction / azimuth live">
              <span class="rotate-knob-core">🧭</span>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });

        const rotMarker = L.marker([pEnd.lat, pEnd.lng], {
          icon: rotHandleIcon,
          zIndexOffset: 1000
        });

        rotMarker.on('mousedown', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          this.isInteractingMapHandle = true;
          this.map.dragging.disable();

          let animFrameId: number | null = null;
          let currentDeg = azimuthDeg;

          const onMouseMove = (moveEv: L.LeafletMouseEvent) => {
            const bearing = calculateBearingDeg(centroid, moveEv.latlng);
            currentDeg = Math.round(bearing);

            if (animFrameId === null) {
              animFrameId = requestAnimationFrame(() => {
                animFrameId = null;
                this.store.updateZoneConfig(zone.id, { azimuthDeg: currentDeg }, true, 6);
              });
            }
          };

          const onMouseUp = () => {
            if (animFrameId !== null) {
              cancelAnimationFrame(animFrameId);
              animFrameId = null;
            }
            this.isInteractingMapHandle = false;
            this.map.dragging.enable();
            this.map.off('mousemove', onMouseMove);
            this.map.off('mouseup', onMouseUp);

            this.store.updateZoneConfig(zone.id, { azimuthDeg: currentDeg }, true, 12);
            this.render();
          };

          this.map.on('mousemove', onMouseMove);
          this.map.on('mouseup', onMouseUp);
        });

        rotMarker.bindTooltip(
          `<b>Slope Direction Handle (▼ ${azimuthDeg}°)</b><br/><small>Drag around array to rotate slope & optimize panels live</small>`,
          { direction: 'top', className: 'solar-tooltip' }
        );

        this.tiltArrowLayerGroup.addLayer(rotMarker);
      }

      // When zoomed in (zoom >= 17), also render subtle downslope arrows on visible mount tables
      if (currentZoom >= 17 && zone.config.mountType === 'ground' && zone.tables) {
        let tableArrowsCount = 0;
        const MAX_TABLE_ARROWS = 40;

        for (const table of zone.tables) {
          if (tableArrowsCount >= MAX_TABLE_ARROWS) break;
          if (!viewBounds.contains([table.centroid.lat, table.centroid.lng])) continue;

          tableArrowsCount++;
          const tableArrowIcon = L.divIcon({
            className: 'table-tilt-arrow-icon',
            html: `
              <div class="table-tilt-arrow">
                <span class="rack-slope-arrow" style="transform: rotate(${azimuthDeg}deg);">↓</span>
                <span class="rack-tilt-tag">${tiltDeg}°</span>
              </div>
            `,
            iconSize: [32, 22],
            iconAnchor: [16, 11]
          });

          const tableArrowMarker = L.marker([table.centroid.lat, table.centroid.lng], {
            icon: tableArrowIcon,
            interactive: false,
            zIndexOffset: 500
          });
          this.tiltArrowLayerGroup.addLayer(tableArrowMarker);
        }
      }
    }
  }

  private renderVertexHandles(): void {
    this.vertexMarkersGroup.clearLayers();
    if (this.store.viewFilter.showVertices === false) return;
    const selectedZone = this.store.getSelectedZone();
    if (!selectedZone || selectedZone.vertices.length < 3) return;

    const zoneCentroid = computePolygonCentroid(selectedZone.vertices);

    // --- 1. Array Zone Vertex Handles ---
    selectedZone.vertices.forEach((vertex, idx) => {
      const marker = L.circleMarker([vertex.lat, vertex.lng], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: '#f59e0b',
        fillOpacity: 1
      });

      let animFrameId: number | null = null;
      let lastMoveLatLng = { lat: vertex.lat, lng: vertex.lng };

      marker.on('mousedown', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        this.isInteractingMapHandle = true;
        lastMoveLatLng = { lat: vertex.lat, lng: vertex.lng };
        this.map.dragging.disable();

        const onMouseMove = (moveEv: L.LeafletMouseEvent) => {
          marker.setLatLng(moveEv.latlng);
          lastMoveLatLng = { lat: moveEv.latlng.lat, lng: moveEv.latlng.lng };

          if (animFrameId === null) {
            animFrameId = requestAnimationFrame(() => {
              animFrameId = null;
              const currentZone = this.store.getZone(selectedZone.id);
              if (!currentZone) return;
              const newVertices = [...currentZone.vertices];
              newVertices[idx] = lastMoveLatLng;
              // Live update boundary and optimize panels with fast 6-step sweep
              this.store.updateZoneVertices(selectedZone.id, newVertices, true, 6);
            });
          }
        };

        const onMouseUp = () => {
          if (animFrameId !== null) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
          }
          this.isInteractingMapHandle = false;
          this.map.dragging.enable();
          this.map.off('mousemove', onMouseMove);
          this.map.off('mouseup', onMouseUp);

          const currentZone = this.store.getZone(selectedZone.id);
          if (currentZone) {
            const newVertices = [...currentZone.vertices];
            newVertices[idx] = lastMoveLatLng;
            // Full 12-step optimization on release
            this.store.updateZoneVertices(selectedZone.id, newVertices, true, 12);
          }
          this.render();
        };

        this.map.on('mousemove', onMouseMove);
        this.map.on('mouseup', onMouseUp);
      });

      // Right-click or double-click to delete vertex
      marker.on('contextmenu', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (selectedZone.vertices.length <= 3) {
          alert('A polygon boundary must contain at least 3 vertices.');
          return;
        }
        if (confirm(`Delete vertex ${idx + 1}?`)) {
          this.store.deleteZoneVertex(selectedZone.id, idx);
        }
      });

      marker.on('dblclick', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (selectedZone.vertices.length > 3) {
          this.store.deleteZoneVertex(selectedZone.id, idx);
        }
      });

      marker.bindTooltip(
        `<b>Vertex ${idx + 1}</b><br/><small>Drag to move &bull; Right-Click or Double-Click to Delete</small>`,
        { direction: 'top', className: 'solar-tooltip' }
      );
      this.vertexMarkersGroup.addLayer(marker);

      // Edge midpoint: Add Vertex & Align Azimuth (Downward Slope towards this side)
      const nextIdx = (idx + 1) % selectedZone.vertices.length;
      const nextVertex = selectedZone.vertices[nextIdx];
      const midLat = (vertex.lat + nextVertex.lat) / 2;
      const midLng = (vertex.lng + nextVertex.lng) / 2;
      const downslopeAzimuth = calculateEdgeDownslopeAzimuth(vertex, nextVertex, zoneCentroid);
      const compassHeading = getCompassHeading(downslopeAzimuth);

      const splitEdgeHandle = L.circleMarker([midLat, midLng], {
        radius: 4.5,
        color: '#10b981',
        weight: 1.5,
        fillColor: '#064e3b',
        fillOpacity: 1
      });

      splitEdgeHandle.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        this.store.addZoneVertex(selectedZone.id, idx, { lat: midLat, lng: midLng });
      });

      splitEdgeHandle.on('contextmenu', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        this.store.updateZoneConfig(selectedZone.id, { azimuthDeg: downslopeAzimuth }, true, 12);
      });

      splitEdgeHandle.bindTooltip(
        `<b>+ Add Vertex (Split Edge)</b><br/><small>Right-Click to Slope Downward Towards this Side (▼ ${downslopeAzimuth}° ${compassHeading})</small>`,
        { direction: 'top', className: 'solar-tooltip' }
      );
      this.vertexMarkersGroup.addLayer(splitEdgeHandle);
    });

    // --- 2. Keep-Out Obstacle Vertex Handles ---
    for (const ko of selectedZone.keepOuts) {
      const isKoSelected = ko.id === this.store.selectedKeepOutId;

      ko.vertices.forEach((koVertex, koIdx) => {
        const koMarker = L.circleMarker([koVertex.lat, koVertex.lng], {
          radius: isKoSelected ? 5.5 : 4.5,
          color: '#ffffff',
          weight: 1.5,
          fillColor: '#ef4444',
          fillOpacity: 1
        });

        let animFrameId: number | null = null;
        let lastKoLatLng = { lat: koVertex.lat, lng: koVertex.lng };

        koMarker.on('mousedown', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          this.isInteractingMapHandle = true;
          lastKoLatLng = { lat: koVertex.lat, lng: koVertex.lng };
          this.map.dragging.disable();

          const onMouseMove = (moveEv: L.LeafletMouseEvent) => {
            koMarker.setLatLng(moveEv.latlng);
            lastKoLatLng = { lat: moveEv.latlng.lat, lng: moveEv.latlng.lng };

            if (animFrameId === null) {
              animFrameId = requestAnimationFrame(() => {
                animFrameId = null;
                const currentZone = this.store.getZone(selectedZone.id);
                if (!currentZone) return;
                const currentKo = currentZone.keepOuts.find(k => k.id === ko.id);
                if (!currentKo) return;
                const newVertices = [...currentKo.vertices];
                newVertices[koIdx] = lastKoLatLng;
                this.store.updateKeepOutVertices(selectedZone.id, ko.id, newVertices, true, 6);
              });
            }
          };

          const onMouseUp = () => {
            if (animFrameId !== null) {
              cancelAnimationFrame(animFrameId);
              animFrameId = null;
            }
            this.isInteractingMapHandle = false;
            this.map.dragging.enable();
            this.map.off('mousemove', onMouseMove);
            this.map.off('mouseup', onMouseUp);

            const currentZone = this.store.getZone(selectedZone.id);
            if (currentZone) {
              const currentKo = currentZone.keepOuts.find(k => k.id === ko.id);
              if (currentKo) {
                const newVertices = [...currentKo.vertices];
                newVertices[koIdx] = lastKoLatLng;
                this.store.updateKeepOutVertices(selectedZone.id, ko.id, newVertices, true, 12);
              }
            }
            this.render();
          };

          this.map.on('mousemove', onMouseMove);
          this.map.on('mouseup', onMouseUp);
        });

        koMarker.on('contextmenu', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          if (ko.vertices.length <= 3) {
            alert('An obstacle boundary must contain at least 3 vertices.');
            return;
          }
          if (confirm(`Delete obstacle vertex ${koIdx + 1}?`)) {
            this.store.deleteKeepOutVertex(selectedZone.id, ko.id, koIdx);
          }
        });

        koMarker.on('dblclick', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          if (ko.vertices.length > 3) {
            this.store.deleteKeepOutVertex(selectedZone.id, ko.id, koIdx);
          }
        });

        koMarker.bindTooltip(
          `<b>${ko.name} - Vertex ${koIdx + 1}</b><br/><small>Drag to move &bull; Right-Click or Double-Click to Delete</small>`,
          { direction: 'top', className: 'solar-tooltip' }
        );
        this.vertexMarkersGroup.addLayer(koMarker);

        // Keep-out edge midpoint: Add Vertex to Keep-Out
        const nextKoIdx = (koIdx + 1) % ko.vertices.length;
        const nextKoVertex = ko.vertices[nextKoIdx];
        const midKoLat = (koVertex.lat + nextKoVertex.lat) / 2;
        const midKoLng = (koVertex.lng + nextKoVertex.lng) / 2;

        const addKoVertexHandle = L.circleMarker([midKoLat, midKoLng], {
          radius: 4,
          color: '#f87171',
          weight: 1.5,
          fillColor: '#7f1d1d',
          fillOpacity: 0.95
        });

        addKoVertexHandle.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          this.store.addKeepOutVertex(selectedZone.id, ko.id, koIdx, {
            lat: midKoLat,
            lng: midKoLng
          });
        });

        addKoVertexHandle.bindTooltip(
          `<b>+ Add Vertex to ${ko.name}</b>`,
          { direction: 'top', className: 'solar-tooltip' }
        );
        this.vertexMarkersGroup.addLayer(addKoVertexHandle);
      });
    }
  }
}
