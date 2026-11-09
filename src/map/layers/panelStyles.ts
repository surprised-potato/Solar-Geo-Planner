/**
 * Leaflet styles for arrays, roof rails, mount tables and individual panel layers.
 */
import L from 'leaflet';
import { ArrayZone, MountTableObject, SolarPanelObject } from '../../types/solar';
import { isMultiSelectClick } from '../mapEvents';
import { escapeHtml } from '../../utils/html';
import type { MapController } from '../mapController';

export function updateZoneStyles(this: MapController): void {
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

export function updateRoofRailStyles(this: MapController): void {
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

export function getMountTableStyle(this: MapController, table: MountTableObject, _zone: ArrayZone, isDimmed: boolean, isSelectedZone: boolean, isSelectedTable: boolean): L.PathOptions {
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

export function getPanelStyle(this: MapController, panel: SolarPanelObject, isDimmed: boolean, isSelected: boolean): L.PathOptions {
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

export function createPanelLayer(this: MapController, panel: SolarPanelObject, isDimmed: boolean, selectedPanelId: string | null): void {
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
    const isMulti = isMultiSelectClick(e);
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
