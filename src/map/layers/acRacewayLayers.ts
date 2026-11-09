/**
 * AC raceway (inverter to interconnection) polylines and vertex handles on the map.
 */
import L from 'leaflet';
import type { MapController } from '../mapController';
import { escapeHtml } from '../../utils/html';

export function renderAcRaceways(this: MapController): void {
  this.acRacewayGroup.clearLayers();
  this.acRacewayVertexGroup.clearLayers();
  const vf = this.store.viewFilter;
  if (vf.showRaceways === false || vf.xRayMode) return;

  const systems = this.store.getSystems();
  const selectedSysId = this.store.selectedSystemId;

  for (const sys of systems) {
    const isSelected = sys.id === selectedSysId;
    const feederSummary = this.store.getSystemAcFeederSummary(sys.id);
    const acRaceway = sys.acRaceway;

    if (acRaceway && acRaceway.path && acRaceway.path.length >= 2) {
      const pathPts = acRaceway.path.map(p => [p.lat, p.lng] as [number, number]);

      // Outer dark cyan casing
      const casing = L.polyline(pathPts, {
        color: '#083344',
        weight: 7,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false
      });

      // Inner glowing electric cyan conduit
      const conduit = L.polyline(pathPts, {
        color: '#06b6d4',
        weight: 3.5,
        opacity: 1,
        dashArray: '8, 4',
        interactive: true
      });

      const popupContent = `
        <div class="inverter-popup">
          <h4 style="color: #06b6d4;">⚡ AC Feeder Raceway (${escapeHtml(sys.name)})</h4>
          <div class="inv-pop-row"><span>Route Length:</span> <strong>${feederSummary.racewayLengthM} m</strong></div>
          <div class="inv-pop-row"><span>Elevation Δh:</span> <strong>${feederSummary.elevationDeltaM} m</strong></div>
          <div class="inv-pop-row"><span>Total Feeder Run:</span> <strong style="color: var(--accent-green);">${feederSummary.totalRunM} m</strong></div>
          <div class="inv-pop-row"><span>Conductor:</span> <strong style="color: #38bdf8;">${escapeHtml(feederSummary.conductorCallout)}</strong></div>
          <div class="inv-pop-row"><span>Conduit:</span> <strong>${escapeHtml(feederSummary.conduitCallout)}</strong></div>
          <div class="inv-pop-divider"></div>
          <div class="inv-pop-row"><span>Voltage Drop:</span> <strong style="color: ${feederSummary.isCompliant ? '#10b981' : '#ef4444'};">${feederSummary.voltageDropPercent}% (${feederSummary.voltageDropV}V)</strong></div>
          <div class="inv-pop-row"><span>PEC 2.15 Limit:</span> <strong>${feederSummary.isCompliant ? '✅ Compliant (≤3%)' : '⚠️ Non-Compliant (>3%)'}</strong></div>
        </div>
      `;
      conduit.bindPopup(popupContent, { className: 'solar-dark-popup' });
      conduit.bindTooltip(`<strong>⚡ AC Feeder: ${escapeHtml(sys.name)}</strong><br/>${feederSummary.totalRunM}m Run • ${feederSummary.voltageDropPercent}% V-Drop • Click to inspect`, {
        direction: 'top',
        className: 'solar-tooltip'
      });

      conduit.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        this.selectedAcRacewaySystemId = sys.id;
        this.selectedAcInterconnectionSystemId = null;
        this.selectedInverterSystemId = null;
        this.selectedHomerunSystemId = null;
        this.selectedRacewayZoneId = null;
        this.store.selectSystem(sys.id);
        this.updateSelectionHud();
      });

      this.acRacewayGroup.addLayer(casing);
      this.acRacewayGroup.addLayer(conduit);

      // Entrance badge at start (Inverter station)
      const startPt = acRaceway.path[0];
      const startIcon = L.divIcon({
        className: 'raceway-entrance-icon',
        html: `<div class="raceway-marker-badge ac-feeder" title="AC Feeder Start at Inverter Station">⚡ INV AC OUT</div>`,
        iconSize: [90, 20],
        iconAnchor: [45, 10]
      });
      const startMarker = L.marker([startPt.lat, startPt.lng], { icon: startIcon, interactive: false });
      this.acRacewayGroup.addLayer(startMarker);

      // Exit badge at end (PCC point)
      const endPt = acRaceway.path[acRaceway.path.length - 1];
      const endIcon = L.divIcon({
        className: 'raceway-entrance-icon',
        html: `<div class="raceway-marker-badge ac-pcc" title="AC Feeder Arrival at PCC Grid">🏢 TO PCC GRID</div>`,
        iconSize: [95, 20],
        iconAnchor: [47, 10]
      });
      const endMarker = L.marker([endPt.lat, endPt.lng], { icon: endIcon, interactive: false });
      this.acRacewayGroup.addLayer(endMarker);

      // Interactive vertex handles when system is selected
      if (isSelected && this.store.drawingMode === 'none' && this.store.viewFilter.showVertices !== false) {
        const racewayPath = acRaceway.path;
        racewayPath.forEach((pt, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === racewayPath.length - 1;

          const handleIcon = L.divIcon({
            className: 'raceway-handle-container',
            html: `<div class="raceway-node-pill ac-bend ${isFirst ? 'entrance' : isLast ? 'exit' : ''}" title="${isFirst ? 'AC Feeder Start' : isLast ? 'AC Feeder End' : `Bend #${idx + 1}`}"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          });

          const handle = L.marker([pt.lat, pt.lng], {
            icon: handleIcon,
            draggable: true,
            zIndexOffset: 1200
          });

          handle.on('dragstart', () => {
            this.isInteractingMapHandle = true;
          });

          handle.on('drag', (ev: L.LeafletEvent) => {
            const m = ev.target as L.Marker;
            const newPos = m.getLatLng();
            const tempPath = [...acRaceway.path];
            tempPath[idx] = { lat: newPos.lat, lng: newPos.lng };
            const tempPts = tempPath.map(p => [p.lat, p.lng] as [number, number]);
            casing.setLatLngs(tempPts);
            conduit.setLatLngs(tempPts);
            if (isFirst) startMarker.setLatLng([newPos.lat, newPos.lng]);
            if (isLast) endMarker.setLatLng([newPos.lat, newPos.lng]);
          });

          handle.on('dragend', (ev: L.LeafletEvent) => {
            this.isInteractingMapHandle = false;
            const m = ev.target as L.Marker;
            const newPos = m.getLatLng();
            const updatedPath = [...acRaceway.path];
            updatedPath[idx] = { lat: newPos.lat, lng: newPos.lng };
            this.store.updateSystemAcRacewayVertices(sys.id, updatedPath);
            this.renderAcRaceways();
            this.updateSelectionHud();
          });

          handle.on('click', (ev: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(ev);
            if (racewayPath.length > 2) {
              if (confirm(`Delete AC Feeder node #${idx + 1}?`)) {
                this.store.deleteSystemAcRacewayVertex(sys.id, idx);
                this.renderAcRaceways();
                this.updateSelectionHud();
              }
            }
          });

          this.acRacewayVertexGroup.addLayer(handle);
        });

        // Midpoint '+' handles for inserting bends
        for (let j = 0; j < racewayPath.length - 1; j++) {
          const pA = racewayPath[j];
          const pB = racewayPath[j + 1];
          const midLat = (pA.lat + pB.lat) / 2;
          const midLng = (pA.lng + pB.lng) / 2;

          const midIcon = L.divIcon({
            className: 'raceway-midpoint-icon',
            html: `<div class="raceway-split-plus ac-plus" title="Click to insert bend node">+</div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          });

          const midHandle = L.marker([midLat, midLng], {
            icon: midIcon,
            zIndexOffset: 1150
          });

          midHandle.on('click', (ev: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(ev);
            this.store.addSystemAcRacewayVertex(sys.id, j, { lat: midLat, lng: midLng });
            this.renderAcRaceways();
            this.updateSelectionHud();
          });

          this.acRacewayVertexGroup.addLayer(midHandle);
        }
      }
    } else if (sys.inverterLocation && sys.acInterconnectionLocation) {
      // Direct AC Feeder guideline when no raceway is drawn yet
      const invPt = sys.inverterLocation;
      const pccPt = sys.acInterconnectionLocation;
      const guideLine = L.polyline(
        [[invPt.lat, invPt.lng], [pccPt.lat, pccPt.lng]],
        {
          color: '#06b6d4',
          weight: 2,
          dashArray: '5, 8',
          opacity: 0.75,
          interactive: false
        }
      );
      guideLine.bindTooltip(`<strong>⚡ Direct AC Feeder Path (${feederSummary.directDistanceM}m)</strong><br/>V-Drop: ${feederSummary.voltageDropPercent}% (${feederSummary.voltageDropV}V) • Click '+ AC Feeder' to draw real conduit path`, {
        direction: 'top',
        className: 'solar-tooltip'
      });
      this.acRacewayGroup.addLayer(guideLine);
    }
  }
}
