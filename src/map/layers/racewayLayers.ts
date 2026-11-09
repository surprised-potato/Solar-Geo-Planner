/**
 * DC raceways, homeruns, string wiring lines and AC feeder raceway layers.
 */
import L from 'leaflet';
import { chainAdjacentPanels, getHomerunExitDirection, getSystemHomeruns, pickNearestHomerun } from '../../geo/stringCabling';
import type { MapController } from '../mapController';
import { escapeHtml } from '../../utils/html';

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

export function renderStringLines(this: MapController): void {
  this.stringLinesLayerGroup.clearLayers();
  this.homerunLinesLayerGroup.clearLayers();
  const vf = this.store.viewFilter;
  const showStrings = vf.showStringLines !== false;
  const showHomerun = vf.showHomerunLines !== false;
  if ((!showStrings && !showHomerun) || vf.xRayMode || vf.panelVisibility === 'hidden') return;

  const panels = this.store.getPanels().filter(p => p.active && p.stringId);
  if (panels.length === 0) return;

  // For large farms (>3000 modules), only render string circuits when zoomed in to level >= 17
  const currentZoom = this.map.getZoom();
  if (panels.length > 3000 && currentZoom <= 16) {
    return;
  }

  const stringMap = new Map<string, typeof panels>();
  for (const p of panels) {
    if (!p.stringId) continue;
    const groupKey = `${p.systemId || ''}::${p.stringId}`;
    if (!stringMap.has(groupKey)) {
      stringMap.set(groupKey, []);
    }
    stringMap.get(groupKey)!.push(p);
  }

  const STRING_PALETTE = [
    '#eab308', // Amber / Gold
    '#06b6d4', // Cyan
    '#ec4899', // Pink
    '#a855f7', // Purple
    '#10b981', // Emerald
    '#f97316', // Orange
    '#38bdf8', // Sky
    '#14b8a6'  // Teal
  ];

  let colorIdx = 0;
  let renderedStrings = 0;
  const MAX_RENDERED_STRINGS = 200;
  const viewBounds = panels.length > 300 ? this.map.getBounds().pad(0.35) : null;

  for (const [, strPanels] of stringMap.entries()) {
    if (strPanels.length < 2) continue;
    if (renderedStrings >= MAX_RENDERED_STRINGS) break;

    const stringId = strPanels[0].stringId!;
    const orderedPanels = chainAdjacentPanels(strPanels);

    // Viewport culling for string routes on large farms
    if (viewBounds) {
      const start = orderedPanels[0].centroid;
      const end = orderedPanels[orderedPanels.length - 1].centroid;
      if (!viewBounds.contains([start.lat, start.lng]) && !viewBounds.contains([end.lat, end.lng])) {
        continue;
      }
    }
    renderedStrings++;
    const color = STRING_PALETTE[colorIdx % STRING_PALETTE.length];
    colorIdx++;

    // 1. Intra-string polyline
    const latlngs = orderedPanels.map(p => [p.centroid.lat, p.centroid.lng] as [number, number]);
    const polyline = L.polyline(latlngs, {
      color,
      weight: 2.5,
      opacity: 0.9,
      dashArray: '3, 4',
      interactive: false
    });

    polyline.bindTooltip(
      `<strong>String: ${stringId}</strong><br/>${orderedPanels.length} modules &bull; ${orderedPanels[0].mpptId || 'MPPT'}`,
      { sticky: true, className: 'solar-tooltip' }
    );

    if (showStrings) {
      this.stringLinesLayerGroup.addLayer(polyline);
    }

    // 2. Homerun lines to Inverter or Raceway Entrance
    const sys = this.store.getSystem(orderedPanels[0].systemId);
    const zone = this.store.getZone(orderedPanels[0].zoneId);
    const zoneRaceway = (zone && zone.systemId === sys?.id) ? zone.raceway : null;
    const activeHomerun = zoneRaceway || (sys ? pickNearestHomerun(getSystemHomeruns(sys), orderedPanels[0].centroid) : null);
    const hasRaceway = Boolean(activeHomerun && activeHomerun.path && activeHomerun.path.length >= 2);

    if (sys && showHomerun) {
      const startPt = orderedPanels[0].centroid;
      const endPt = orderedPanels[orderedPanels.length - 1].centroid;

      if (hasRaceway && activeHomerun && activeHomerun.path.length >= 2) {
        const sysCables = this.store.getStringCables(sys.id);
        const cableInfo = sysCables.find(c => c.stringId === stringId && c.systemId === sys.id);

        const tapPos = cableInfo?.tapPointPos || activeHomerun.path[0];
        const tapNeg = cableInfo?.tapPointNeg || activeHomerun.path[0];
        const posDist = this.map.distance([startPt.lat, startPt.lng], [tapPos.lat, tapPos.lng]);
        const negDist = this.map.distance([endPt.lat, endPt.lng], [tapNeg.lat, tapNeg.lng]);

        // Lead (+) from start panel to tap point on homerun trunk
        const posLine = L.polyline(
          [[startPt.lat, startPt.lng], [tapPos.lat, tapPos.lng]],
          { color: '#ef4444', weight: 1.5, opacity: 0.8, dashArray: '4, 4', interactive: false }
        );
        posLine.bindTooltip(
          `<strong>${stringId} (+) Lead to ${cableInfo?.isSharedHomerun ? 'Homerun Trunk' : 'Raceway'}</strong><br/>Distance: ${posDist.toFixed(1)}m ➔ Taps into Conduit Trunk`,
          { sticky: true, className: 'solar-tooltip' }
        );
        this.homerunLinesLayerGroup.addLayer(posLine);

        // Lead (-) from end panel to tap point on homerun trunk
        const negLine = L.polyline(
          [[endPt.lat, endPt.lng], [tapNeg.lat, tapNeg.lng]],
          { color: '#3b82f6', weight: 1.5, opacity: 0.8, dashArray: '4, 4', interactive: false }
        );
        negLine.bindTooltip(
          `<strong>${stringId} (-) Lead to ${cableInfo?.isSharedHomerun ? 'Homerun Trunk' : 'Raceway'}</strong><br/>Distance: ${negDist.toFixed(1)}m ➔ Taps into Conduit Trunk`,
          { sticky: true, className: 'solar-tooltip' }
        );
        this.homerunLinesLayerGroup.addLayer(negLine);

        // Connect raceway / homerun exit to inverter if not identical
        if (sys.inverterLocation) {
          const exitInfo = getHomerunExitDirection(activeHomerun.path, sys.inverterLocation);
          const exitPt = exitInfo.exitPoint;
          const distToInv = this.map.distance([exitPt.lat, exitPt.lng], [sys.inverterLocation.lat, sys.inverterLocation.lng]);
          if (distToInv > 1.0) {
            const connectLine = L.polyline(
              [[exitPt.lat, exitPt.lng], [sys.inverterLocation.lat, sys.inverterLocation.lng]],
              { color: '#f59e0b', weight: 2.5, opacity: 0.8, dashArray: '6, 4', interactive: false }
            );
            connectLine.bindTooltip(`Homerun Trunk termination to Inverter (${distToInv.toFixed(1)}m)`, { sticky: true, className: 'solar-tooltip' });
            this.homerunLinesLayerGroup.addLayer(connectLine);
          }
        }
      } else if (sys.inverterLocation) {
        // Direct homerun fallback when no raceway is drawn
        const deltaElev = zone?.elevationDeltaM ?? 0;
        const invLoc = sys.inverterLocation;
        const posDist2D = this.map.distance([startPt.lat, startPt.lng], [invLoc.lat, invLoc.lng]);
        const negDist2D = this.map.distance([endPt.lat, endPt.lng], [invLoc.lat, invLoc.lng]);
        const posRun = (posDist2D + Math.abs(deltaElev)).toFixed(1);
        const negRun = (negDist2D + Math.abs(deltaElev)).toFixed(1);

        const posLine = L.polyline(
          [[startPt.lat, startPt.lng], [invLoc.lat, invLoc.lng]],
          { color: '#ef4444', weight: 1.5, opacity: 0.65, dashArray: '5, 5', interactive: false }
        );
        posLine.bindTooltip(
          `<strong>${stringId} (+) Homerun</strong><br/>Ground: ${posDist2D.toFixed(1)}m | Δh: ${deltaElev}m | Wire: ${posRun}m`,
          { sticky: true, className: 'solar-tooltip' }
        );
        this.homerunLinesLayerGroup.addLayer(posLine);

        const negLine = L.polyline(
          [[endPt.lat, endPt.lng], [invLoc.lat, invLoc.lng]],
          { color: '#3b82f6', weight: 1.5, opacity: 0.65, dashArray: '5, 5', interactive: false }
        );
        negLine.bindTooltip(
          `<strong>${stringId} (-) Homerun</strong><br/>Ground: ${negDist2D.toFixed(1)}m | Δh: ${deltaElev}m | Wire: ${negRun}m`,
          { sticky: true, className: 'solar-tooltip' }
        );
        this.homerunLinesLayerGroup.addLayer(negLine);
      }
    }
  }
}

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
