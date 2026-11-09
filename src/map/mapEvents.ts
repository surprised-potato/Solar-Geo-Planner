/**
 * Map-level Leaflet event wiring and selection-driven actions for MapController.
 */
import L from 'leaflet';
import { LatLngPoint } from '../types/solar';
import type { MapController } from './mapController';

export function setupMapEvents(this: MapController): void {
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

    if (this.store.drawingMode === 'ac_interconnection') {
      const pt: LatLngPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
      const currentSys = this.store.getSelectedSystem() || this.store.getSystems()[0];
      if (currentSys) {
        this.store.setSystemAcInterconnectionLocation(currentSys.id, pt);
      }
      this.store.setDrawingMode('none');
      return;
    }

    if (this.store.drawingMode === 'none') {
      this.clearMapSelection();
      return;
    }

    const pt: LatLngPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
    this.addDrawingPoint(pt);
  });

  this.map.getContainer().addEventListener('mouseenter', () => { this.cursorOverMap = true; });
  this.map.getContainer().addEventListener('mouseleave', () => { this.cursorOverMap = false; });

  this.map.on('mousemove', (e: L.LeafletMouseEvent) => {
    this.lastCursorLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
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
          : (this.store.drawingMode === 'ac_raceway' || this.store.drawingMode === 'ac_interconnection')
          ? '#06b6d4'
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

  // Arrow keys nudge the selected arrays instead of panning the map.
  this.map.keyboard.disable();

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

    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'c' || e.key === 'C') && this.store.drawingMode === 'none') {
      if (this.store.selectedPanelId === null && this.store.getSelectedZoneIds().length > 0) {
        this.store.copySelectedZones();
        e.preventDefault();
      }
      return;
    }
    if (mod && (e.key === 'v' || e.key === 'V') && this.store.drawingMode === 'none') {
      if (this.store.zoneClipboard.length > 0) {
        this.store.pasteZones(this.cursorOverMap ? this.lastCursorLatLng ?? undefined : undefined);
        e.preventDefault();
      }
      return;
    }

    if (mod && (e.key === 'x' || e.key === 'X') && this.store.drawingMode === 'none') {
      if (this.store.selectedPanelId === null && this.store.getSelectedZoneIds().length > 0) {
        this.store.cutSelectedZones();
        e.preventDefault();
      }
      return;
    }
    if (mod && (e.key === 'd' || e.key === 'D') && this.store.drawingMode === 'none') {
      if (this.store.selectedPanelId === null && this.store.getSelectedZoneIds().length > 0) {
        this.store.duplicateSelectedZones();
        e.preventDefault();
      }
      return;
    }
    if (mod && (e.key === 'a' || e.key === 'A') && this.store.drawingMode === 'none') {
      this.store.selectAllZones();
      e.preventDefault();
      return;
    }

    // Nudge / rotate the selection from the keyboard.
    if (!mod && this.store.drawingMode === 'none' && this.store.selectedPanelId === null && this.store.getSelectedZoneIds().length > 0) {
      const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      const arrows: Record<string, [number, number]> = {
        ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [-step, 0], ArrowRight: [step, 0]
      };
      if (arrows[e.key]) {
        this.store.moveSelectedZones(arrows[e.key][0], arrows[e.key][1]);
        e.preventDefault();
        return;
      }
      if (e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}') {
        const deg = e.shiftKey ? 15 : e.altKey ? 0.1 : 1;
        this.store.rotateSelectedZones(e.key === ']' || e.key === '}' ? deg : -deg);
        e.preventDefault();
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

export function deleteSelectedElement(this: MapController): boolean {
  // 0. Ground mount table selected (toggle active state of modules in rack)
  if (this.selectedTableId && this.store.selectedZoneId) {
    const zone = this.store.getZone(this.store.selectedZoneId);
    const table = zone?.tables?.find(t => t.id === this.selectedTableId);
    if (table && table.panelIds.length > 0) {
      const firstPanel = this.store.getPanel(table.panelIds[0]);
      const targetActive = firstPanel ? !firstPanel.active : false;
      for (const pid of table.panelIds) {
        const p = this.store.getPanel(pid);
        if (p && p.active !== targetActive) {
          this.store.togglePanelActive(pid);
        }
      }
      this.updateMountTableStyles();
      this.updateSelectionHud();
      return true;
    }
  }

  // 0b. Solar Panel selected
  if (this.store.selectedPanelId) {
    const pid = this.store.selectedPanelId;
    this.store.togglePanelActive(pid);
    this.updateSelectionHud();
    return true;
  }

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
    this.store.clearSystemHomerun(sysId, this.selectedHomerunId || undefined);
    this.selectedHomerunSystemId = null;
    this.selectedHomerunId = null;
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

  // 5. AC PCC selected
  if (this.selectedAcInterconnectionSystemId) {
    const sysId = this.selectedAcInterconnectionSystemId;
    this.store.clearSystemAcInterconnectionLocation(sysId);
    this.selectedAcInterconnectionSystemId = null;
    this.updateSelectionHud();
    return true;
  }

  // 6. AC Raceway selected
  if (this.selectedAcRacewaySystemId) {
    const sysId = this.selectedAcRacewaySystemId;
    this.store.clearSystemAcRaceway(sysId);
    this.selectedAcRacewaySystemId = null;
    this.updateSelectionHud();
    return true;
  }

  // 7. Array Zones selected
  if (this.store.selectedZoneIds.size > 0 || this.store.selectedZoneId) {
    const res = this.store.deleteSelected();
    if (res) {
      this.updateSelectionHud();
      return true;
    }
  }

  return false;
}

export function fitSelectedElement(this: MapController): void {
  if (this.selectedTableId && this.store.selectedZoneId) {
    const zone = this.store.getZone(this.store.selectedZoneId);
    const table = zone?.tables?.find(t => t.id === this.selectedTableId);
    if (table) {
      this.zoomToTable(table);
      return;
    }
  }
  if (this.store.selectedPanelId) {
    this.zoomToPanel(this.store.selectedPanelId);
    return;
  }
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
