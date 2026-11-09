/**
 * Move (✥) and rotate (↻) drag handles for the selected array(s).
 * Hold Shift while rotating to snap to 15° steps.
 */
import L from 'leaflet';
import { calculateBearingDeg, calculateGeodeticDistanceM, localMetricToLatLng } from '../../geo/projection';
import { getZonesCenter } from '../../store/zoneTransforms';
import type { LatLngPoint } from '../../types/solar';
import type { MapController } from '../mapController';

const DRAG_THRESHOLD_PX = 3;

function handleIcon(glyph: string, title: string): L.DivIcon {
  return L.divIcon({
    className: 'transform-handle',
    html: `<div title="${title}" style="width:26px;height:26px;border-radius:50%;background:#0f172a;color:#fbbf24;border:2px solid #fbbf24;display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;cursor:grab;box-shadow:0 1px 4px rgba(0,0,0,.5)">${glyph}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
}

function normDelta(d: number): number {
  return ((d + 540) % 360) - 180;
}

export function renderTransformHandles(this: MapController): void {
  if (this.store.drawingMode !== 'none' || this.store.selectedPanelId) return;
  if (this.store.viewFilter.showVertices === false) return;
  const zones = this.store.getSelectedZones();
  const center = getZonesCenter(zones);
  if (zones.length === 0 || !center) return;

  const pts = zones.flatMap(z => z.vertices);
  const maxLat = Math.max(...pts.map(p => p.lat));
  const heightM = calculateGeodeticDistanceM({ lat: maxLat, lng: center.lng }, { lat: Math.min(...pts.map(p => p.lat)), lng: center.lng });
  const rotPos = localMetricToLatLng({ x: 0, y: heightM / 2 + Math.max(4, heightM * 0.12) }, center);

  // --- Move handle ---
  const moveMarker = L.marker([center.lat, center.lng], { icon: handleIcon('✥', 'Drag to move'), zIndexOffset: 1000 });
  moveMarker.on('mousedown', (e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    this.isInteractingMapHandle = true;
    this.map.dragging.disable();
    const startPx = e.containerPoint;
    let last: LatLngPoint = { lat: center.lat, lng: center.lng };
    let moved = false;
    let frame: number | null = null;
    let pending: LatLngPoint | null = null;

    const flush = () => {
      frame = null;
      if (!pending) return;
      const target = pending;
      pending = null;
      // Delta in metres between last applied handle position and the pointer.
      const dNorth = calculateGeodeticDistanceM(last, { lat: target.lat, lng: last.lng }) * Math.sign(target.lat - last.lat);
      const dEast = calculateGeodeticDistanceM(last, { lat: last.lat, lng: target.lng }) * Math.sign(target.lng - last.lng);
      this.store.moveSelectedZones(dEast, dNorth);
      last = target;
    };
    const onMove = (ev: L.LeafletMouseEvent) => {
      if (!moved && ev.containerPoint.distanceTo(startPx) < DRAG_THRESHOLD_PX) return;
      moved = true;
      moveMarker.setLatLng(ev.latlng);
      pending = { lat: ev.latlng.lat, lng: ev.latlng.lng };
      if (frame === null) frame = requestAnimationFrame(flush);
    };
    const onUp = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      flush();
      this.isInteractingMapHandle = false;
      this.map.dragging.enable();
      this.map.off('mousemove', onMove);
      this.map.off('mouseup', onUp);
      this.render();
    };
    this.map.on('mousemove', onMove);
    this.map.on('mouseup', onUp);
  });
  this.vertexMarkersGroup.addLayer(moveMarker);

  // --- Rotate handle ---
  const rotMarker = L.marker([rotPos.lat, rotPos.lng], { icon: handleIcon('↻', 'Drag to rotate (Shift = 15° snap)'), zIndexOffset: 1000 });
  rotMarker.on('mousedown', (e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    this.isInteractingMapHandle = true;
    this.map.dragging.disable();
    const pivot = { lat: center.lat, lng: center.lng };
    const startPx = e.containerPoint;
    const startAngle = calculateBearingDeg(pivot, rotPos);
    let applied = 0;
    let moved = false;
    let frame: number | null = null;
    let target = 0;

    const flush = () => {
      frame = null;
      const d = normDelta(target - applied);
      if (Math.abs(d) < 1e-6) return;
      this.store.rotateSelectedZones(d, pivot);
      applied = target;
    };
    const onMove = (ev: L.LeafletMouseEvent) => {
      if (!moved && ev.containerPoint.distanceTo(startPx) < DRAG_THRESHOLD_PX) return;
      moved = true;
      let total = normDelta(calculateBearingDeg(pivot, { lat: ev.latlng.lat, lng: ev.latlng.lng }) - startAngle);
      if (ev.originalEvent.shiftKey) total = Math.round(total / 15) * 15;
      // Keep the running total continuous across the ±180° seam.
      target = applied + normDelta(total - applied);
      rotMarker.setLatLng(ev.latlng);
      if (frame === null) frame = requestAnimationFrame(flush);
    };
    const onUp = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      flush();
      this.isInteractingMapHandle = false;
      this.map.dragging.enable();
      this.map.off('mousemove', onMove);
      this.map.off('mouseup', onUp);
      this.render();
    };
    this.map.on('mousemove', onMove);
    this.map.on('mouseup', onUp);
  });
  this.vertexMarkersGroup.addLayer(rotMarker);
}
