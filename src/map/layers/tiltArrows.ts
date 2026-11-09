/**
 * Downslope tilt arrow badges and slope rotation knobs.
 */
import L from 'leaflet';
import {
  calculateBearingDeg,
  computePolygonAreaSqM,
  computePolygonCentroid,
  localMetricToLatLng
} from '../../geo/projection';
import type { MapController } from '../mapController';
import { escapeHtml } from '../../utils/html';
import { isMultiSelectClick } from '../mapEvents';

/**
 * Visualizes array and mount table tilt with downward slope arrows.
 * In solar engineering, panels slope downwards along the azimuth direction (from High Ridge to Low Eave).
 */
export function renderTiltArrows(this: MapController): void {
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
      this.selectZoneFromMap(zone.id, isMultiSelectClick(e));
    });

    badgeMarker.bindTooltip(
      `<div class="solar-tooltip">
        <strong>📐 ${escapeHtml(zone.name)} — Tilt & Downslope</strong><br/>
        Tilt Angle: <b>${tiltDeg}°</b><br/>
        Downward Slope Direction: <b>${azimuthDeg}° (${compassHeading})</b><br/>
        <small>Gravity/runoff flows downward from High Ridge ➔ Low Eave</small>
      </div>`,
      { direction: 'top', className: 'solar-tooltip' }
    );
    this.tiltArrowLayerGroup.addLayer(badgeMarker);

    // If this zone is selected, render a draggable compass knob on the arrow tip to rotate slope live
    if (
      zone.id === this.store.selectedZoneId &&
      !this.selectedHomerunSystemId &&
      !this.selectedRacewayZoneId
    ) {
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
              <span class="rack-idx-tag">T${table.tableIndex}</span>
              <span class="rack-slope-arrow" style="transform: rotate(${azimuthDeg}deg);">↓</span>
              <span class="rack-tilt-tag">${tiltDeg}°</span>
            </div>
          `,
          iconSize: [46, 22],
          iconAnchor: [23, 11]
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
