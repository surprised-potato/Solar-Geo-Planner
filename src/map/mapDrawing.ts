/**
 * Interactive polygon / polyline drawing workflow for MapController.
 */
import L from 'leaflet';
import { LatLngPoint } from '../types/solar';
import type { MapController } from './mapController';

export function addDrawingPoint(this: MapController, pt: LatLngPoint): void {
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

export function finishDrawing(this: MapController): void {
  const mode = this.store.drawingMode;
  if (mode === 'match_props') {
    this.store.setMatchPropsMode(false);
    this.cancelDrawing();
    return;
  }

  const minPoints = (mode === 'raceway' || mode === 'ac_raceway') ? 2 : 3;

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
  } else if (mode === 'ac_raceway') {
    const targetSystem = this.store.getSelectedSystem() || this.store.getSystems()[0];
    if (targetSystem) {
      const elev = Math.abs((targetSystem.acInterconnectionElevationM ?? 0) - (targetSystem.inverterElevationM ?? 0));
      this.store.setSystemAcRaceway(targetSystem.id, points, elev);
      this.selectedAcRacewaySystemId = targetSystem.id;
      this.store.selectSystem(targetSystem.id);
    }
  }
}

export function cancelDrawing(this: MapController): void {
  this.drawingPoints = [];
  if (this.drawingPreviewLayer) {
    this.map.removeLayer(this.drawingPreviewLayer);
    this.drawingPreviewLayer = null;
  }
  if (this.store.drawingMode === 'match_props') {
    this.store.setMatchPropsMode(false);
  } else {
    this.store.setDrawingMode('none');
  }
  this.updateDrawingHud();
  this.updateSelectionHud();
}
