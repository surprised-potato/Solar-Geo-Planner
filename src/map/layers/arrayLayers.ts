/**
 * Array zones, keep-outs, ground-mount tables, roof rails and PV panel layers.
 */
import L from 'leaflet';
import { MountTableObject } from '../../types/solar';
import {
  calculateEdgeDownslopeAzimuth,
  computePolygonCentroid,
  findClosestPolygonEdge
} from '../../geo/projection';
import type { MapController } from '../mapController';
import { escapeHtml } from '../../utils/html';
import { isMultiSelectClick } from '../mapEvents';

export function renderZones(this: MapController): void {
  this.zoneLayerGroup.clearLayers();
  this.zoneLayerMap.clear();
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
      if (this.store.drawingMode === 'match_props') {
        L.DomEvent.stopPropagation(e);
        if (!this.store.matchPropsSourceZoneId) {
          this.store.matchPropsSourceZoneId = zone.id;
          this.updateDrawingHud();
          return;
        }
        if (zone.id === this.store.matchPropsSourceZoneId) {
          return;
        }
        const res = this.store.matchZoneProperties(
          this.store.matchPropsSourceZoneId,
          zone.id,
          this.store.matchPropsOptions
        );
        if (res.success) {
          const hint = document.getElementById('hud-drawing-hint');
          if (hint) {
            hint.innerHTML = `<span style="color: #10b981; font-weight: bold;">✓ Matched properties to ${escapeHtml(zone.name)}!</span> Click another array or click Done to finish.`;
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

      // Forward clicks to drawing engine so user can draw keepouts directly over arrays!
      if (this.store.drawingMode !== 'none') {
        this.addDrawingPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
        return;
      }

      L.DomEvent.stopPropagation(e);
      this.selectZoneFromMap(zone.id, isMultiSelectClick(e));
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
      `<strong>${escapeHtml(zone.name)}</strong> <span style="color: ${sys?.color || '#38bdf8'}; font-size: 11px;">[${escapeHtml(sys?.name?.split(':')[0] || 'System')}]</span><br/>${zone.activePanelCount} panels &bull; ${zone.totalKwp} kWp<br/><small style="color: #94a3b8;">Click to select &bull; Shift+Click to multi-select</small>`,
      { sticky: true, className: 'solar-tooltip' }
    );

    this.zoneLayerGroup.addLayer(poly);
    this.zoneLayerMap.set(zone.id, poly);
  }
}

export function renderKeepOuts(this: MapController): void {
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

      poly.bindTooltip(`Obstacle: ${escapeHtml(ko.name)}<br/><small>Click to edit vertices</small>`, {
        sticky: true,
        className: 'solar-tooltip'
      });
      this.keepOutLayerGroup.addLayer(poly);
    }
  }
}

export function updateMountTableStyles(this: MapController): void {
  const vf = this.store.viewFilter;
  const isDimmed = vf.panelVisibility === 'dimmed' || this.store.drawingMode !== 'none';
  const selectedPanelId = this.store.selectedPanelId;

  for (const [zoneId, polys] of this.tableRackLayerMap.entries()) {
    const zone = this.store.getZone(zoneId);
    if (!zone) continue;
    const isSelectedZone = this.store.isZoneSelected(zoneId);

    for (const poly of polys) {
      const table = (poly as any).__mountTable as MountTableObject | undefined;
      if (table) {
        const isSelectedTable =
          this.selectedTableId === table.id ||
          (selectedPanelId !== null && table.panelIds.includes(selectedPanelId));
        poly.setStyle(
          this.getMountTableStyle(table, zone, isDimmed, isSelectedZone, isSelectedTable)
        );
      }
    }
  }
}

export function renderMountTables(this: MapController): void {
  this.tableRackLayerGroup.clearLayers();
  this.tableRackLayerMap.clear();

  const vf = this.store.viewFilter;
  if (vf.showMountTables === false || (vf.panelVisibility === 'hidden' && !vf.xRayMode)) {
    return;
  }

  const zones = this.store.getZones();
  const isDimmed = vf.panelVisibility === 'dimmed' || this.store.drawingMode !== 'none';
  const selectedPanelId = this.store.selectedPanelId;
  const totalTables = zones.reduce((acc, z) => acc + (z.tables ? z.tables.length : 0), 0);
  const viewBounds = totalTables > 150 ? this.map.getBounds().pad(0.35) : null;
  let renderedTables = 0;
  const MAX_RENDERED_TABLES = 2500;

  for (const zone of zones) {
    if (zone.config.mountType !== 'ground' || !zone.tables || zone.tables.length === 0) {
      continue;
    }

    const isSelectedZone = this.store.isZoneSelected(zone.id);
    const zonePolys: L.Polygon[] = [];

    for (const table of zone.tables) {
      const isSelectedTable =
        this.selectedTableId === table.id ||
        (selectedPanelId !== null && table.panelIds.includes(selectedPanelId));

      if (viewBounds && !isSelectedTable) {
        if (!viewBounds.contains([table.centroid.lat, table.centroid.lng])) {
          continue;
        }
      }
      if (renderedTables >= MAX_RENDERED_TABLES && !isSelectedTable) {
        break;
      }
      renderedTables++;

      const poly = L.polygon(
        table.corners.map(c => [c.lat, c.lng]),
        this.getMountTableStyle(table, zone, isDimmed, isSelectedZone, isSelectedTable)
      );
      (poly as any).__mountTable = table;
      (poly as any).__zoneId = zone.id;

      const tablePanels = table.panelIds.map(id => this.store.getPanel(id)).filter(Boolean);
      const activeModCount = tablePanels.filter(p => p?.active).length;
      const modWp = zone.config.electrical?.nominalPowerW || 580;
      const tableKwp = (activeModCount * modWp) / 1000;
      const uniqueStrings = Array.from(new Set(tablePanels.map(p => p?.stringId).filter(Boolean)));

      poly.bindTooltip(
        `<div class="solar-tooltip rack-tooltip">
          <div style="font-weight: 700; color: #38bdf8; font-size: 12px;">🏗️ Table #${table.tableIndex}</div>
          <div style="color: #cbd5e1; font-size: 11px; margin-top: 2px;">
            <b>${table.modulesUp}P &times; ${table.modulesWide}</b> &bull; <span style="color: #10b981; font-weight: 600;">${activeModCount} Panels</span> &bull; <b>${tableKwp.toFixed(2)} kWp</b>
          </div>
          <div style="color: #94a3b8; font-size: 10px; margin-top: 2px;">
            <span>Zone: ${escapeHtml(zone.name)} &bull; Row ${table.rowIndex + 1}, Col ${table.colIndex + 1}</span>
          </div>
          ${uniqueStrings.length > 0 ? `<div style="color: #fbbf24; font-size: 10px; margin-top: 2px;">⚡ String ${uniqueStrings.join(', ')}</div>` : ''}
        </div>`,
        { sticky: true, className: 'solar-tooltip' }
      );

      poly.on('mouseover', () => {
        poly.setStyle({
          color: '#ffffff',
          weight: 2.5,
          fillOpacity: isDimmed ? 0.35 : 0.95
        });
      });

      poly.on('mouseout', () => {
        const currentSelectedZone = this.store.isZoneSelected(zone.id);
        const currentSelectedTable =
          this.selectedTableId === table.id ||
          (this.store.selectedPanelId !== null && table.panelIds.includes(this.store.selectedPanelId));
        const currentDimmed =
          this.store.viewFilter.panelVisibility === 'dimmed' || this.store.drawingMode !== 'none';
        poly.setStyle(
          this.getMountTableStyle(table, zone, currentDimmed, currentSelectedZone, currentSelectedTable)
        );
      });

      poly.on('click', (e: L.LeafletMouseEvent) => {
        if (this.store.drawingMode === 'match_props') {
          L.DomEvent.stopPropagation(e);
          if (this.store.matchPropsSourceZoneId && zone.id !== this.store.matchPropsSourceZoneId) {
            const res = this.store.matchZoneProperties(
              this.store.matchPropsSourceZoneId,
              zone.id,
              this.store.matchPropsOptions
            );
            if (res.success) {
              const hint = document.getElementById('hud-drawing-hint');
              if (hint) {
                hint.innerHTML = `<span style="color: #10b981; font-weight: bold;">✓ Matched properties to ${escapeHtml(zone.name)}!</span> Click another array or click Done to finish.`;
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

        if (this.store.drawingMode !== 'none') {
          this.addDrawingPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
          return;
        }

        L.DomEvent.stopPropagation(e);
        const isMulti = isMultiSelectClick(e);
        this.selectedHomerunSystemId = null;
        this.selectedRacewayZoneId = null;
        this.selectedInverterSystemId = null;
        this.selectedAcRacewaySystemId = null;
        this.selectedAcInterconnectionSystemId = null;
        this.store.selectKeepOut(null);
        this.store.selectPanel(null);

        if (isMulti) {
          this.selectedTableId = null;
          this.store.selectZone(zone.id, true);
        } else {
          this.selectedTableId = table.id;
          this.store.selectZone(zone.id, false);
        }
        this.updateMountTableStyles();
        this.updateSelectionHud();
      });

      this.tableRackLayerGroup.addLayer(poly);
      zonePolys.push(poly);
    }
    if (zonePolys.length > 0) {
      this.tableRackLayerMap.set(zone.id, zonePolys);
    }
    if (renderedTables >= MAX_RENDERED_TABLES) break;
  }
}

export function renderRoofRails(this: MapController): void {
  this.roofRailLayerGroup.clearLayers();
  this.roofRailLayerMap.clear();

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
    const zoneRails: L.Polyline[] = [];

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
          interactive: false
        }
      );

      this.roofRailLayerGroup.addLayer(polyline);
      zoneRails.push(polyline);

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
    this.roofRailLayerMap.set(zone.id, zoneRails);
  }
}

export function renderPanels(this: MapController): void {
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
    // Ground mount arrays: refine map view to only render mount tables (no individual panels)
    if (zone.config.mountType === 'ground') {
      continue;
    }

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
    if (renderedCount >= MAX_VISIBLE_PANELS) break;
  }
}
