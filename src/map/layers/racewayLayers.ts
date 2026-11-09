/**
 * DC raceway and homerun layers. String lines and AC raceways live in their own modules (re-exported here).
 */
import L from 'leaflet';
import { getHomerunExitDirection, getSystemHomeruns } from '../../geo/stringCabling';
import type { MapController } from '../mapController';
import { escapeHtml } from '../../utils/html';
export { renderStringLines } from './stringLineLayers';
export { renderAcRaceways } from './acRacewayLayers';

export function renderRaceways(this: MapController): void {
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
   const sysHomeruns = getSystemHomeruns(sys);
   for (const homerun of sysHomeruns) {
    const homerunId = homerun.id;
    const trunkIdx = sysHomeruns.indexOf(homerun);
    const trunkLabel = sysHomeruns.length > 1 ? ` #${trunkIdx + 1}` : '';
    const isSelected = this.selectedHomerunSystemId === sys.id
      ? (!this.selectedHomerunId || this.selectedHomerunId === homerunId)
      : (!selectedZoneId && selectedSystemId === sys.id && trunkIdx === 0);
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
    const connectedZones = zones.filter(z => z.systemId === sys.id && !z.raceway && this.store.getHomerunForZone(z.id)?.id === homerunId);
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
      this.selectedHomerunId = homerunId;
      this.selectedRacewayZoneId = null;
      this.selectedInverterSystemId = null;
      this.store.selectKeepOut(null);
      this.store.selectSystem(sys.id, false);
    };

    casing.on('click', onHomerunSelect);
    conduit.on('click', onHomerunSelect);

    conduit.bindTooltip(
      `<strong>🛤️ Shared Homerun Trunk${trunkLabel} (${escapeHtml(sys.name)})</strong><br/>Path Length: ${pathLen2D.toFixed(1)}m | Elev Drop: ${elevM}m | Total Run: ${totalRunM}m<br/>Auto-Connected Arrays: ${connectedZones.length} (${totalPanels} modules)<br/><small>Click to edit nodes & bends</small>`,
      { sticky: true, className: 'solar-tooltip' }
    );

    this.racewayLayerGroup.addLayer(casing);
    this.racewayLayerGroup.addLayer(conduit);

    // Start and Exit Badges
    const exitInfo = getHomerunExitDirection(homerun.path, sys.inverterLocation || null);
    const startIdx = exitInfo.exitEnd === 'end' ? 0 : homerun.path.length - 1;
    const exitIdx = exitInfo.exitEnd === 'end' ? homerun.path.length - 1 : 0;

    const sysShortName = escapeHtml(sys.name.split(':')[0].trim());
    const startBadge = L.divIcon({
      className: 'raceway-entrance-icon',
      html: `<div class="raceway-marker-badge homerun" style="border-left: 4px solid ${sys.color || '#f59e0b'};" title="Shared Homerun Trunk (${escapeHtml(sys.name)})">🛤️ ${sysShortName} TRUNK${trunkLabel}</div>`,
      iconSize: [120, 20],
      iconAnchor: [60, 10]
    });
    const startMarker = L.marker(pathPts[startIdx], { icon: startBadge, interactive: true, zIndexOffset: 850 });
    startMarker.on('click', onHomerunSelect);
    this.racewayLayerGroup.addLayer(startMarker);

    const exitBadge = L.divIcon({
      className: 'raceway-entrance-icon',
      html: `<div class="raceway-marker-badge exit" style="border-left: 4px solid ${sys.color || '#f59e0b'};" title="Homerun Exit to ${escapeHtml(sys.name)} Inverter">⚡ TO ${sysShortName} INV</div>`,
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
          const currentHr = this.store.getSystemHomerun(sys.id, homerunId);
          if (currentHr) {
            const updatedPath = [...currentHr.path];
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
          const currentHr = this.store.getSystemHomerun(sys.id, homerunId);
          if (currentHr) {
            const updatedPath = [...currentHr.path];
            updatedPath[idx] = { lat: dragPos.lat, lng: dragPos.lng };
            this.store.updateSystemHomerunVertices(sys.id, updatedPath, homerunId);
          }
        });

        const deleteNode = (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          const currentHr = this.store.getSystemHomerun(sys.id, homerunId);
          if (currentHr && currentHr.path.length > 2) {
            this.store.deleteSystemHomerunVertex(sys.id, idx, homerunId);
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
          this.store.addSystemHomerunVertex(sys.id, j, { lat: midLat, lng: midLng }, homerunId);
        });

        this.racewayVertexGroup.addLayer(midHandle);
      }
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
    };

    casing.on('click', onRacewaySelect);
    conduit.on('click', onRacewaySelect);

    conduit.bindTooltip(
      `<strong>🛤️ Array Raceway: ${escapeHtml(raceway.name || zone.name)}</strong><br/>Path: ${pathLen2D.toFixed(1)}m | Elev Drop: ${elevM}m | Total Run: ${totalRunM}m<br/><small>Click to edit nodes & elevation</small>`,
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
