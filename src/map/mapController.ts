import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ProjectStore } from '../store/projectStore';
import { ArrayZone, BasemapProvider, LatLngPoint, MountTableObject, SolarPanelObject } from '../types/solar';
import { getCompassHeading } from '../geo/projection';
import {
  setupMapEvents as setupMapEventsImpl,
  deleteSelectedElement as deleteSelectedElementImpl,
  fitSelectedElement as fitSelectedElementImpl
} from './mapEvents';
import {
  updateSelectionHud as updateSelectionHudImpl,
  updateDrawingHud as updateDrawingHudImpl
} from './mapHud';
import {
  addDrawingPoint as addDrawingPointImpl,
  finishDrawing as finishDrawingImpl,
  cancelDrawing as cancelDrawingImpl
} from './mapDrawing';
import {
  renderRaceways as renderRacewaysImpl,
  renderStringLines as renderStringLinesImpl,
  renderAcRaceways as renderAcRacewaysImpl
} from './layers/racewayLayers';
import {
  renderInverterStations as renderInverterStationsImpl,
  renderAcInterconnections as renderAcInterconnectionsImpl
} from './layers/equipmentLayers';
import {
  renderZones as renderZonesImpl,
  renderKeepOuts as renderKeepOutsImpl,
  updateMountTableStyles as updateMountTableStylesImpl,
  renderMountTables as renderMountTablesImpl,
  renderRoofRails as renderRoofRailsImpl,
  renderPanels as renderPanelsImpl
} from './layers/arrayLayers';
import { renderTiltArrows as renderTiltArrowsImpl } from './layers/tiltArrows';
import { renderVertexHandles as renderVertexHandlesImpl } from './layers/vertexHandles';
import { escapeHtml } from '../utils/html';

export class MapController {
  map: L.Map;
  store: ProjectStore;
  isInteractingMapHandle: boolean = false;
  selectedHomerunSystemId: string | null = null;
  selectedHomerunId: string | null = null;
  selectedRacewayZoneId: string | null = null;
  selectedInverterSystemId: string | null = null;
  selectedAcInterconnectionSystemId: string | null = null;
  selectedAcRacewaySystemId: string | null = null;
  selectedTableId: string | null = null;
  lastCursorLatLng: LatLngPoint | null = null;
  cursorOverMap = false;

  zoneLayerGroup: L.LayerGroup;
  keepOutLayerGroup: L.LayerGroup;
  tableRackLayerGroup: L.LayerGroup;
  roofRailLayerGroup: L.LayerGroup;
  panelLayerGroup: L.LayerGroup;
  tiltArrowLayerGroup: L.LayerGroup;
  stringLinesLayerGroup: L.LayerGroup;
  homerunLinesLayerGroup: L.LayerGroup;
  racewayLayerGroup: L.LayerGroup;
  racewayVertexGroup: L.LayerGroup;
  acRacewayGroup: L.LayerGroup;
  acRacewayVertexGroup: L.LayerGroup;
  inverterStationGroup: L.LayerGroup;
  acInterconnectionGroup: L.LayerGroup;
  vertexMarkersGroup: L.LayerGroup;
  drawingPreviewLayer: L.Polyline | null = null;
  drawingPoints: LatLngPoint[] = [];

  private baseLayers: Record<BasemapProvider, L.TileLayer>;
  private currentBasemapKey: BasemapProvider = 'google-hybrid';
  private currentBasemapLayer: L.TileLayer | null = null;
  private labelLayers: {
    esri: L.TileLayer;
    google: L.TileLayer;
  };
  panelLayerMap: Map<string, L.Polygon> = new Map();
  zoneLayerMap: Map<string, L.Polygon> = new Map();
  roofRailLayerMap: Map<string, L.Polyline[]> = new Map();
  tableRackLayerMap: Map<string, L.Polygon[]> = new Map();

  private lastRenderedLayoutVersion: number = -1;
  private lastRenderedSelectedPanelId: string | null = null;
  private lastRenderedSelectedZoneId: string | null = null;
  private lastRenderedSelectedZoneIds: Set<string> = new Set();
  private lastRenderedHomerunSystemId: string | null = null;
  private lastRenderedHomerunId: string | null = null;
  private lastRenderedRacewayZoneId: string | null = null;

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
    this.acRacewayGroup = L.layerGroup().addTo(this.map);
    this.acRacewayVertexGroup = L.layerGroup().addTo(this.map);
    this.inverterStationGroup = L.layerGroup().addTo(this.map);
    this.acInterconnectionGroup = L.layerGroup().addTo(this.map);
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
    // Deprecated: Esri is mapped to Google Hybrid to prevent misalignment with design
    if ((provider as string) === 'esri') {
      provider = 'google-hybrid';
    }
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
    const zone = this.store.getZone(panel.zoneId);
    if (zone?.config.mountType === 'ground' && zone.tables) {
      const table = zone.tables.find(t => t.panelIds.includes(panelId));
      if (table) {
        this.selectedTableId = table.id;
        this.updateMountTableStyles();
      }
    }
    this.map.flyTo([panel.centroid.lat, panel.centroid.lng], Math.max(this.map.getZoom(), 22), {
      duration: 0.8
    });
  }

  public zoomToTable(table: MountTableObject): void {
    const latlngs = table.corners.map(c => [c.lat, c.lng] as [number, number]);
    const bounds = L.latLngBounds(latlngs);
    this.map.flyToBounds(bounds.pad(0.35), {
      maxZoom: 21,
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

  public zoomToAcInterconnection(systemId: string): void {
    const sys = this.store.getSystem(systemId);
    if (!sys || !sys.acInterconnectionLocation) return;
    this.map.flyTo([sys.acInterconnectionLocation.lat, sys.acInterconnectionLocation.lng], Math.max(this.map.getZoom(), 21), {
      duration: 0.8
    });
  }

  public zoomToAcRaceway(systemId: string): void {
    const sys = this.store.getSystem(systemId);
    if (!sys?.acRaceway || !sys.acRaceway.path || sys.acRaceway.path.length === 0) return;
    const latlngs = sys.acRaceway.path.map((p: LatLngPoint) => [p.lat, p.lng] as [number, number]);
    const bounds = L.latLngBounds(latlngs);
    this.map.flyToBounds(bounds, {
      padding: [40, 40],
      duration: 1.0,
      maxZoom: 21
    });
  }

  public zoomToRaceway(zoneId?: string, systemId?: string): void {
    const homerun = (zoneId ? this.store.getHomerunForZone(zoneId) : null)
      || this.store.getSystemHomerun(systemId, this.selectedHomerunId || undefined);
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
    return setupMapEventsImpl.call(this);
  }

  public clearMapSelection(): void {
    this.selectedTableId = null;
    this.selectedHomerunSystemId = null;
    this.selectedRacewayZoneId = null;
    this.selectedInverterSystemId = null;
    this.selectedAcInterconnectionSystemId = null;
    this.selectedAcRacewaySystemId = null;
    this.store.selectKeepOut(null);
    this.store.selectPanel(null);
    this.store.selectZone(null);
  }

  public deleteSelectedElement(): boolean {
    return deleteSelectedElementImpl.call(this);
  }

  public fitSelectedElement(): void {
    return fitSelectedElementImpl.call(this);
  }

  public updateSelectionHud(): void {
    return updateSelectionHudImpl.call(this);
  }

  public updateDrawingHud(): void {
    return updateDrawingHudImpl.call(this);
  }

  public addDrawingPoint(pt: LatLngPoint): void {
    return addDrawingPointImpl.call(this, pt);
  }

  public finishDrawing(): void {
    return finishDrawingImpl.call(this);
  }

  public cancelDrawing(): void {
    return cancelDrawingImpl.call(this);
  }

  public render(forceFull: boolean = false): void {
    const isLayoutDirty = forceFull || this.lastRenderedLayoutVersion !== this.store.layoutVersion;

    if (isLayoutDirty) {
      this.renderZones();
      this.renderKeepOuts();
      this.renderMountTables();
      this.renderRoofRails();
      this.renderPanels();
      this.renderTiltArrows();
      this.renderRaceways();
      this.renderAcRaceways();
      this.renderStringLines();
      this.renderInverterStations();
      this.renderAcInterconnections();
      if (!this.isInteractingMapHandle) {
        this.renderVertexHandles();
      }
      this.updateSelectionHud();
      this.updateDrawingHud();

      this.lastRenderedLayoutVersion = this.store.layoutVersion;
      this.lastRenderedSelectedPanelId = this.store.selectedPanelId;
      this.lastRenderedSelectedZoneId = this.store.selectedZoneId;
      this.lastRenderedSelectedZoneIds = new Set(this.store.selectedZoneIds);
      this.lastRenderedHomerunSystemId = this.selectedHomerunSystemId;
      this.lastRenderedHomerunId = this.selectedHomerunId;
      this.lastRenderedRacewayZoneId = this.selectedRacewayZoneId;
      return;
    }

    // --- Fast Selection-Only Update (Zero DOM thrash & zero panel recreation jitter) ---
    // 1. Panel highlight style update (never destroy/re-instantiate layers on selection)
    if (this.lastRenderedSelectedPanelId !== this.store.selectedPanelId) {
      const vf = this.store.viewFilter;
      const isDimmed = vf.panelVisibility === 'dimmed' || this.store.drawingMode !== 'none';
      if (this.lastRenderedSelectedPanelId) {
        const prevPanel = this.store.getPanel(this.lastRenderedSelectedPanelId);
        const prevPoly = this.panelLayerMap.get(this.lastRenderedSelectedPanelId);
        if (prevPanel && prevPoly) {
          prevPoly.setStyle(this.getPanelStyle(prevPanel, isDimmed, false));
        }
      }
      if (this.store.selectedPanelId) {
        const newPanel = this.store.getPanel(this.store.selectedPanelId);
        const newPoly = this.panelLayerMap.get(this.store.selectedPanelId);
        if (newPanel && newPoly) {
          newPoly.setStyle(this.getPanelStyle(newPanel, isDimmed, true));
          if ((newPoly as any).bringToFront) {
            (newPoly as any).bringToFront();
          }
        }
      }
      this.updateMountTableStyles();
      this.lastRenderedSelectedPanelId = this.store.selectedPanelId;
    }

    // 2. Zone polygon highlight styles
    this.updateZoneStyles();

    // 3. Roof rail styles
    this.updateRoofRailStyles();

    // 4. Ground mount table styles
    this.updateMountTableStyles();

    // 5. Tilt arrows (update slope rotate compass knob if zone selection changed)
    const zoneSelectionChanged =
      this.lastRenderedSelectedZoneId !== this.store.selectedZoneId ||
      this.lastRenderedSelectedZoneIds.size !== this.store.selectedZoneIds.size ||
      Array.from(this.store.selectedZoneIds).some(id => !this.lastRenderedSelectedZoneIds.has(id));

    if (
      zoneSelectionChanged ||
      this.lastRenderedHomerunSystemId !== this.selectedHomerunSystemId ||
      this.lastRenderedHomerunId !== this.selectedHomerunId ||
      this.lastRenderedRacewayZoneId !== this.selectedRacewayZoneId
    ) {
      this.renderTiltArrows();
    }

    // 5. Raceways & Homeruns
    this.renderRaceways();
    this.renderAcRaceways();

    // 6. Vertex handles
    if (!this.isInteractingMapHandle) {
      this.renderVertexHandles();
    }

    // 7. HUDs
    this.updateSelectionHud();
    this.updateDrawingHud();

    this.lastRenderedSelectedZoneId = this.store.selectedZoneId;
    this.lastRenderedSelectedZoneIds = new Set(this.store.selectedZoneIds);
    this.lastRenderedHomerunSystemId = this.selectedHomerunSystemId;
    this.lastRenderedHomerunId = this.selectedHomerunId;
    this.lastRenderedRacewayZoneId = this.selectedRacewayZoneId;
  }

  private updateZoneStyles(): void {
    const vf = this.store.viewFilter;
    const isDrawing = this.store.drawingMode !== 'none';

    for (const zone of this.store.getZones()) {
      const poly = this.zoneLayerMap.get(zone.id);
      if (!poly) continue;
      const isSelected = this.store.isZoneSelected(zone.id);

      let fillOpacity = 0.15;
      if (!vf.showArrayFill || vf.xRayMode || isDrawing) {
        fillOpacity = isSelected ? 0.08 : 0;
      } else if (isSelected) {
        fillOpacity = 0.24;
      }

      poly.setStyle({
        color: isSelected ? '#fbbf24' : zone.color,
        weight: isSelected ? 3.5 : 2,
        fillColor: zone.color,
        fillOpacity,
        dashArray: isSelected ? undefined : '3, 3'
      });
    }
  }

  private updateRoofRailStyles(): void {
    const vf = this.store.viewFilter;
    const isDimmed = vf.panelVisibility === 'dimmed' || this.store.drawingMode !== 'none';

    for (const [zoneId, rails] of this.roofRailLayerMap.entries()) {
      const isSelectedZone =
        this.store.selectedZoneId === zoneId || this.store.selectedZoneIds.has(zoneId);
      const railColor = isSelectedZone ? '#38bdf8' : '#94a3b8';
      const railWeight = isSelectedZone ? 3.0 : 2.2;
      const railOpacity = isDimmed ? 0.95 : 0.85;

      for (const rail of rails) {
        rail.setStyle({
          color: railColor,
          weight: railWeight,
          opacity: railOpacity
        });
      }
    }
  }

  private renderRaceways(): void {
    return renderRacewaysImpl.call(this);
  }

  renderStringLines(): void {
    return renderStringLinesImpl.call(this);
  }

  private renderInverterStations(): void {
    return renderInverterStationsImpl.call(this);
  }

  private renderAcInterconnections(): void {
    return renderAcInterconnectionsImpl.call(this);
  }

  renderAcRaceways(): void {
    return renderAcRacewaysImpl.call(this);
  }

  private renderZones(): void {
    return renderZonesImpl.call(this);
  }

  private renderKeepOuts(): void {
    return renderKeepOutsImpl.call(this);
  }

  getMountTableStyle(
    table: MountTableObject,
    _zone: ArrayZone,
    isDimmed: boolean,
    isSelectedZone: boolean,
    isSelectedTable: boolean
  ): L.PathOptions {
    const tablePanels = table.panelIds.map(id => this.store.getPanel(id)).filter(Boolean);
    const allInactive = tablePanels.length > 0 && tablePanels.every(p => !p?.active);

    if (allInactive) {
      return {
        color: '#64748b',
        weight: isSelectedTable ? 2.5 : 1,
        fillColor: '#334155',
        fillOpacity: isDimmed ? 0.1 : 0.35,
        interactive: true
      };
    }

    if (isSelectedTable) {
      return {
        color: '#ffffff',
        weight: 3,
        fillColor: '#f59e0b',
        fillOpacity: 0.95,
        interactive: true
      };
    }

    if (isDimmed) {
      return {
        color: isSelectedZone ? '#38bdf8' : '#64748b',
        weight: isSelectedZone ? 2 : 1,
        dashArray: '3, 3',
        fillColor: '#1e293b',
        fillOpacity: 0.25,
        interactive: true
      };
    }

    if (isSelectedZone) {
      return {
        color: '#38bdf8',
        weight: 2.2,
        fillColor: '#1d4ed8',
        fillOpacity: 0.9,
        interactive: true
      };
    }

    // Default clean, solid PV rack appearance
    return {
      color: '#38bdf8',
      weight: 1.2,
      fillColor: '#1e3a8a',
      fillOpacity: 0.85,
      interactive: true
    };
  }

  updateMountTableStyles(): void {
    return updateMountTableStylesImpl.call(this);
  }

  renderMountTables(): void {
    return renderMountTablesImpl.call(this);
  }

  renderRoofRails(): void {
    return renderRoofRailsImpl.call(this);
  }

  renderPanels(): void {
    return renderPanelsImpl.call(this);
  }

  private getPanelStyle(
    panel: SolarPanelObject,
    isDimmed: boolean,
    isSelected: boolean
  ): L.PathOptions {
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

    return { color, fillColor, fillOpacity, weight };
  }

  createPanelLayer(
    panel: SolarPanelObject,
    isDimmed: boolean,
    selectedPanelId: string | null
  ): void {
    const isSelected = panel.id === selectedPanelId;
    const style = this.getPanelStyle(panel, isDimmed, isSelected);

    const poly = L.polygon(
      panel.corners.map(c => [c.lat, c.lng]),
      style
    );

    poly.on('click', (e: L.LeafletMouseEvent) => {
      if (this.store.drawingMode === 'match_props') {
        L.DomEvent.stopPropagation(e);
        const targetZone = this.store.getZone(panel.zoneId);
        if (targetZone && this.store.matchPropsSourceZoneId && targetZone.id !== this.store.matchPropsSourceZoneId) {
          const res = this.store.matchZoneProperties(
            this.store.matchPropsSourceZoneId,
            targetZone.id,
            this.store.matchPropsOptions
          );
          if (res.success) {
            const hint = document.getElementById('hud-drawing-hint');
            if (hint) {
              hint.innerHTML = `<span style="color: #10b981; font-weight: bold;">✓ Matched properties to ${escapeHtml(targetZone.name)}!</span> Click another array or click Done to finish.`;
            }
          }
        }
        return;
      }

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
      this.selectedHomerunSystemId = null;
      this.selectedRacewayZoneId = null;
      this.selectedInverterSystemId = null;
      this.selectedAcRacewaySystemId = null;
      this.selectedAcInterconnectionSystemId = null;
      this.store.selectKeepOut(null);
      const isMulti = e.originalEvent.shiftKey || e.originalEvent.ctrlKey || e.originalEvent.metaKey;
      if (isMulti) {
        this.store.selectZone(panel.zoneId, true);
        this.updateSelectionHud();
        return;
      }

      this.store.selectPanel(panel.id);
    });

    const sys = this.store.getSystem(panel.systemId);
    const mod = this.store.getModule(panel.moduleId);
    poly.bindTooltip(
      `<div class="panel-hover-info">
        <div><strong>${panel.id}</strong> (${panel.active ? 'Active' : 'Disabled'})</div>
        <div><span style="color: ${sys?.color || '#38bdf8'}">${escapeHtml(sys?.name?.split(':')[0] || 'System')}</span> &bull; ${escapeHtml(mod?.name?.split(' ')[0] || 'Module')}</div>
        <div>Row ${panel.rowIndex}, Col ${panel.colIndex} &bull; ${panel.electrical.nominalPowerW}W</div>
        ${panel.stringId ? `<div>⚡ String: <b>${panel.stringId}</b> (#${panel.stringOrder})</div>` : ''}
        ${panel.mpptId ? `<div>🔌 Inverter/MPPT: <b>${panel.mpptId}</b></div>` : ''}
      </div>`,
      { sticky: true, className: 'solar-tooltip' }
    );

    this.panelLayerGroup.addLayer(poly);
    this.panelLayerMap.set(panel.id, poly);
  }

  getCompassHeading(deg: number): string {
    return getCompassHeading(deg);
  }

  /**
   * Visualizes array and mount table tilt with downward slope arrows.
   * In solar engineering, panels slope downwards along the azimuth direction (from High Ridge to Low Eave).
   */
  renderTiltArrows(): void {
    return renderTiltArrowsImpl.call(this);
  }

  private renderVertexHandles(): void {
    return renderVertexHandlesImpl.call(this);
  }
}
