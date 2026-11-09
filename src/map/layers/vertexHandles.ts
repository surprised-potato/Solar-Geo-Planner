/**
 * Draggable vertex / midpoint edit handles for the selected geometry.
 */
import L from 'leaflet';
import {
  calculateEdgeDownslopeAzimuth,
  computePolygonCentroid,
  getCompassHeading
} from '../../geo/projection';
import type { MapController } from '../mapController';
import { escapeHtml } from '../../utils/html';

/** Pointer travel (px) before a handle press counts as a drag rather than a click. */
const DRAG_THRESHOLD_PX = 3;

export function renderVertexHandles(this: MapController): void {
  this.vertexMarkersGroup.clearLayers();
  if (this.store.viewFilter.showVertices === false) return;
  if (
    this.selectedHomerunSystemId ||
    this.selectedRacewayZoneId ||
    this.selectedInverterSystemId ||
    this.selectedAcRacewaySystemId ||
    this.selectedAcInterconnectionSystemId
  ) {
    return;
  }
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

      // A plain click (or the clicks of a double-click delete) must not re-run the
      // expensive layout optimisation or rebuild the handles: only commit real drags.
      const startPt = e.containerPoint;
      let moved = false;

      const onMouseMove = (moveEv: L.LeafletMouseEvent) => {
        if (!moved && moveEv.containerPoint.distanceTo(startPt) < DRAG_THRESHOLD_PX) return;
        moved = true;
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
        if (!moved) return;

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

        const startPt = e.containerPoint;
        let moved = false;

        const onMouseMove = (moveEv: L.LeafletMouseEvent) => {
          if (!moved && moveEv.containerPoint.distanceTo(startPt) < DRAG_THRESHOLD_PX) return;
          moved = true;
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
          if (!moved) return;

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
        `<b>${escapeHtml(ko.name)} - Vertex ${koIdx + 1}</b><br/><small>Drag to move &bull; Right-Click or Double-Click to Delete</small>`,
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
        `<b>+ Add Vertex to ${escapeHtml(ko.name)}</b>`,
        { direction: 'top', className: 'solar-tooltip' }
      );
      this.vertexMarkersGroup.addLayer(addKoVertexHandle);
    });
  }
}
