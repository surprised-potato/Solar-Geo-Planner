/**
 * String wiring polylines (panel-to-panel series order) on the map.
 */
import L from 'leaflet';
import { chainAdjacentPanels, getHomerunExitDirection, getSystemHomeruns, pickNearestHomerun } from '../../geo/stringCabling';
import type { MapController } from '../mapController';

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
