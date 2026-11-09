import { ProjectStore } from '../store/projectStore';
import { LatLngPoint, MetricPoint } from '../types/solar';
import { getSystemHomeruns } from '../geo/stringCabling';
import { latLngToLocalMetric, localMetricToLatLng, computePolygonCentroid } from '../geo/projection';
import { escapeHtml } from '../utils/html';

export interface CadRenderOptions {
  width?: number;
  height?: number;
  systemId?: string; // 'all' or specific system ID
  backgroundColor?: string;
  theme?: 'white-paper' | 'blueprint' | 'dark';
  showLabels?: boolean;
  /** Pre-rendered satellite basemap (same width/height & transform) drawn beneath the CAD layers */
  basemap?: CanvasImageSource | null;
  /** When true, async renderers (renderCadViewPng) fetch satellite imagery tiles as the basemap */
  satellite?: boolean;
}

/** Google Satellite Tile Layer (CORS-enabled, matching MapController default) */
const SATELLITE_ATTRIBUTION = 'Imagery © Google Maps';
const SATELLITE_MAX_ZOOM = 21;
const SATELLITE_MAX_TILES = 64;

export function buildGoogleTileUrl(x: number, y: number, z: number, lyrs: 'y' | 's' = 'y'): string {
  const sub = Math.abs((x + y) % 4);
  return `https://mt${sub}.google.com/vt/lyrs=${lyrs}&x=${x}&y=${y}&z=${z}`;
}

export interface CadBoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  spanX: number;
  spanY: number;
  centerX: number;
  centerY: number;
}

/**
 * Computes metric bounding box for all relevant elements in the project/system.
 */
export function computeProjectMetricBounds(
  store: ProjectStore,
  origin: LatLngPoint,
  systemId: string = 'all'
): CadBoundingBox {
  const points: MetricPoint[] = [];

  const zones = store.getZones().filter(z => systemId === 'all' || z.systemId === systemId);
  for (const zone of zones) {
    for (const v of zone.vertices) {
      points.push(latLngToLocalMetric(v, origin));
    }
    for (const ko of zone.keepOuts) {
      for (const kv of ko.vertices) {
        points.push(latLngToLocalMetric(kv, origin));
      }
    }
    if (zone.raceway && zone.raceway.path) {
      for (const rv of zone.raceway.path) {
        points.push(latLngToLocalMetric(rv, origin));
      }
    }
  }

  const panels = store.getPanels().filter(p => systemId === 'all' || p.systemId === systemId);
  for (const panel of panels) {
    for (const c of panel.corners) {
      points.push(latLngToLocalMetric(c, origin));
    }
  }

  const systems = store.getSystems().filter(s => systemId === 'all' || s.id === systemId);
  for (const sys of systems) {
    if (sys.inverterLocation) {
      points.push(latLngToLocalMetric(sys.inverterLocation, origin));
    }
    if (sys.acInterconnectionLocation) {
      points.push(latLngToLocalMetric(sys.acInterconnectionLocation, origin));
    }
    for (const hr of getSystemHomeruns(sys)) {
      for (const p of hr.path) {
        points.push(latLngToLocalMetric(p, origin));
      }
    }
    if (sys.acRaceway && sys.acRaceway.path) {
      for (const p of sys.acRaceway.path) {
        points.push(latLngToLocalMetric(p, origin));
      }
    }
  }

  if (points.length === 0) {
    // Default 50x50m fallback bounding box
    return {
      minX: -25,
      maxX: 25,
      minY: -25,
      maxY: 25,
      spanX: 50,
      spanY: 50,
      centerX: 0,
      centerY: 0
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  // Ensure minimum dimensions
  if (maxX - minX < 10) {
    const midX = (minX + maxX) / 2;
    minX = midX - 5;
    maxX = midX + 5;
  }
  if (maxY - minY < 10) {
    const midY = (minY + maxY) / 2;
    minY = midY - 5;
    maxY = midY + 5;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    spanX: maxX - minX,
    spanY: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

/**
 * Calculates a friendly metric scale bar step in meters (e.g. 5, 10, 20, 50, 100, 200).
 */
export function getFriendlyScaleStep(spanMeters: number): number {
  if (spanMeters <= 20) return 5;
  if (spanMeters <= 50) return 10;
  if (spanMeters <= 100) return 20;
  if (spanMeters <= 250) return 50;
  if (spanMeters <= 500) return 100;
  if (spanMeters <= 1000) return 200;
  return 500;
}

/**
 * Renders an engineering 2D CAD site drawing as a clean standalone SVG string.
 */
export function renderCadViewSvg(
  store: ProjectStore,
  options: CadRenderOptions = {}
): string {
  const width = options.width ?? 1400;
  const height = options.height ?? 880;
  const systemId = options.systemId ?? 'all';
  const showLabels = options.showLabels ?? true;

  const origin = store.center;
  const bounds = computeProjectMetricBounds(store, origin, systemId);

  // Apply 14% margin around content
  const marginX = bounds.spanX * 0.14;
  const marginY = bounds.spanY * 0.14;
  const viewSpanX = bounds.spanX + marginX * 2;
  const viewSpanY = bounds.spanY + marginY * 2;

  const scaleX = width / viewSpanX;
  const scaleY = height / viewSpanY;
  const scale = Math.min(scaleX, scaleY);

  // Transformation: Metric (East +x, North +y) to Canvas (x right, y down)
  const toScreenX = (mx: number) => width / 2 + (mx - bounds.centerX) * scale;
  const toScreenY = (my: number) => height / 2 - (my - bounds.centerY) * scale;
  const toScreenPt = (latlng: LatLngPoint) => {
    const m = latLngToLocalMetric(latlng, origin);
    return { x: toScreenX(m.x), y: toScreenY(m.y) };
  };

  const zones = store.getZones().filter(z => systemId === 'all' || z.systemId === systemId);
  const panels = store.getPanels().filter(p => systemId === 'all' || p.systemId === systemId);
  const systems = store.getSystems().filter(s => systemId === 'all' || s.id === systemId);

  let svgElements = '';

  // 1. Technical Drawing Background & Grid
  svgElements += `<rect width="${width}" height="${height}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>`;

  // Architectural subtle grid
  const gridStepM = getFriendlyScaleStep(Math.max(viewSpanX, viewSpanY));
  const startGridX = Math.floor(bounds.minX / gridStepM) * gridStepM;
  const endGridX = Math.ceil(bounds.maxX / gridStepM) * gridStepM;
  const startGridY = Math.floor(bounds.minY / gridStepM) * gridStepM;
  const endGridY = Math.ceil(bounds.maxY / gridStepM) * gridStepM;

  svgElements += `<g opacity="0.4" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3">`;
  for (let gx = startGridX; gx <= endGridX; gx += gridStepM) {
    const sx = toScreenX(gx);
    if (sx >= 0 && sx <= width) {
      svgElements += `<line x1="${sx.toFixed(1)}" y1="0" x2="${sx.toFixed(1)}" y2="${height}"/>`;
    }
  }
  for (let gy = startGridY; gy <= endGridY; gy += gridStepM) {
    const sy = toScreenY(gy);
    if (sy >= 0 && sy <= height) {
      svgElements += `<line x1="0" y1="${sy.toFixed(1)}" x2="${width}" y2="${sy.toFixed(1)}"/>`;
    }
  }
  svgElements += `</g>`;

  // 2. Homeruns & Cable Raceways (drawn below arrays)
  const drawRaceway = (path: LatLngPoint[], color: string) => {
    if (!path || path.length < 2) return;
    const pts = path.map(toScreenPt).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    svgElements += `<polyline points="${pts}" fill="none" stroke="#0f172a" stroke-width="5" stroke-linecap="round" opacity="0.3"/>`;
    svgElements += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
  };

  for (const sys of systems) {
    for (const hr of getSystemHomeruns(sys)) {
      drawRaceway(hr.path, '#f59e0b');
    }
    if (sys.acRaceway?.path) {
      drawRaceway(sys.acRaceway.path, '#10b981');
    }
  }

  // 3. Array Zones & Setback Boundaries
  for (const zone of zones) {
    if (zone.vertices.length >= 3) {
      const pts = zone.vertices.map(toScreenPt).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const strokeCol = zone.color || '#2563eb';
      svgElements += `<polygon points="${pts}" fill="${strokeCol}" fill-opacity="0.08" stroke="${strokeCol}" stroke-width="2.5" stroke-linejoin="round"/>`;

      // Keepouts / Obstacles inside zone
      for (const ko of zone.keepOuts) {
        if (ko.vertices.length >= 3) {
          const koPts = ko.vertices.map(toScreenPt).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
          svgElements += `<polygon points="${koPts}" fill="#ef4444" fill-opacity="0.15" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,2"/>`;
        }
      }

      // Zone raceway
      if (zone.raceway?.path) {
        drawRaceway(zone.raceway.path, '#f59e0b');
      }
    }
  }

  // 4. Ground Mount Racks / Tables (if present)
  const groundZoneIds = new Set(
    zones
      .filter(z => z.config.mountType === 'ground' && z.tables && z.tables.length > 0)
      .map(z => z.id)
  );

  let groundTablesSvg = '';
  for (const zone of zones) {
    if (zone.tables && zone.tables.length > 0) {
      for (const table of zone.tables) {
        const tPts = table.corners.map(toScreenPt).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        groundTablesSvg += `<polygon points="${tPts}" fill="#1e3a8a" stroke="#60a5fa" stroke-width="1.2" opacity="0.9"/>`;
      }
    }
  }
  if (groundTablesSvg) {
    svgElements += `<g id="cad-ground-tables">${groundTablesSvg}</g>`;
  }

  // 5. Solar Panels (Crisp PV Cell Blue rectangles; ground mount arrays render tables instead of duplicate panels)
  const panelsToRender = panels.filter(p => !groundZoneIds.has(p.zoneId));
  svgElements += `<g id="cad-panels">`;
  for (const panel of panelsToRender) {
    if (!panel.corners || panel.corners.length !== 4) continue;
    const pts = panel.corners.map(toScreenPt).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const fillCol = panel.active ? '#1e3a8a' : '#94a3b8';
    const strokeCol = panel.active ? '#60a5fa' : '#64748b';
    svgElements += `<polygon points="${pts}" fill="${fillCol}" stroke="${strokeCol}" stroke-width="0.8" opacity="0.9"/>`;
  }
  svgElements += `</g>`;

  // 6. Inverter & Interconnection Markers
  for (const sys of systems) {
    if (sys.inverterLocation) {
      const invP = toScreenPt(sys.inverterLocation);
      svgElements += `
        <g transform="translate(${invP.x.toFixed(1)}, ${invP.y.toFixed(1)})">
          <circle r="14" fill="#fef3c7" stroke="#b45309" stroke-width="2"/>
          <text text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="bold" fill="#b45309">⚡</text>
          <text y="24" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="#78350f">${escapeHtml(sys.name)} Inverter</text>
        </g>
      `;
    }
    if (sys.acInterconnectionLocation) {
      const pccP = toScreenPt(sys.acInterconnectionLocation);
      svgElements += `
        <g transform="translate(${pccP.x.toFixed(1)}, ${pccP.y.toFixed(1)})">
          <circle r="14" fill="#d1fae5" stroke="#047857" stroke-width="2"/>
          <text text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="bold" fill="#047857">PCC</text>
          <text y="24" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="#065f46">Grid Tap (MDP)</text>
        </g>
      `;
    }
  }

  // 7. Array Zone Labels (if enabled - displays clean array name badge only)
  if (showLabels) {
    for (const zone of zones) {
      if (zone.vertices.length >= 3) {
        const centroid = computePolygonCentroid(zone.vertices);
        const pt = toScreenPt(centroid);
        const name = zone.name || 'Array Zone';
        const boxW = Math.max(name.length * 7.5 + 24, 80);

        svgElements += `
          <g transform="translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})">
            <rect x="${(-boxW / 2).toFixed(1)}" y="-12" width="${boxW.toFixed(1)}" height="24" rx="4" fill="#ffffff" fill-opacity="0.94" stroke="#3b82f6" stroke-width="1.5"/>
            <text y="4" text-anchor="middle" font-family="sans-serif" font-size="10.5" font-weight="bold" fill="#0f172a">${escapeHtml(name)}</text>
          </g>
        `;
      }
    }
  }

  // 8. Engineering Ornaments: True North Compass Rose (Top-Right)
  const compassX = width - 75;
  const compassY = 75;
  svgElements += `
    <g transform="translate(${compassX}, ${compassY})">
      <circle r="36" fill="#ffffff" fill-opacity="0.9" stroke="#94a3b8" stroke-width="1.5"/>
      <!-- North Pointer Arrow -->
      <polygon points="0,-30 8,-2 0,4 -8,-2" fill="#0f172a"/>
      <polygon points="0,-30 0,4 8,-2" fill="#dc2626"/>
      <!-- South Pointer Arrow -->
      <polygon points="0,30 6,2 0,-4 -6,2" fill="#94a3b8"/>
      <text y="-34" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="900" fill="#dc2626">N</text>
      <text y="42" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="600" fill="#64748b">S</text>
      <text x="36" y="3" dominant-baseline="middle" font-family="sans-serif" font-size="9" font-weight="600" fill="#64748b">E</text>
      <text x="-42" y="3" dominant-baseline="middle" font-family="sans-serif" font-size="9" font-weight="600" fill="#64748b">W</text>
    </g>
  `;

  // 9. Engineering Scale Bar (Bottom-Left)
  const scaleBarLengthM = getFriendlyScaleStep(bounds.spanX * 0.4);
  const scaleBarLengthPx = scaleBarLengthM * scale;
  const scaleXPos = 35;
  const scaleYPos = height - 40;

  svgElements += `
    <g transform="translate(${scaleXPos}, ${scaleYPos})">
      <rect x="-10" y="-22" width="${(scaleBarLengthPx + 45).toFixed(1)}" height="38" rx="4" fill="#ffffff" fill-opacity="0.92" stroke="#cbd5e1" stroke-width="1"/>
      <line x1="0" y1="0" x2="${scaleBarLengthPx.toFixed(1)}" y2="0" stroke="#0f172a" stroke-width="3"/>
      <line x1="0" y1="-5" x2="0" y2="5" stroke="#0f172a" stroke-width="2"/>
      <line x1="${(scaleBarLengthPx / 2).toFixed(1)}" y1="-3" x2="${(scaleBarLengthPx / 2).toFixed(1)}" y2="3" stroke="#0f172a" stroke-width="1.5"/>
      <line x1="${scaleBarLengthPx.toFixed(1)}" y1="-5" x2="${scaleBarLengthPx.toFixed(1)}" y2="5" stroke="#0f172a" stroke-width="2"/>
      <text x="0" y="-8" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="bold" fill="#0f172a">0</text>
      <text x="${(scaleBarLengthPx / 2).toFixed(1)}" y="-8" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="bold" fill="#0f172a">${(scaleBarLengthM / 2)}m</text>
      <text x="${scaleBarLengthPx.toFixed(1)}" y="-8" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="bold" fill="#0f172a">${scaleBarLengthM}m</text>
      <text x="${(scaleBarLengthPx / 2).toFixed(1)}" y="12" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="600" fill="#64748b">SCALE 1 : ${(1 / scale * 100).toFixed(0)} (m)</text>
    </g>
  `;

  // 10. Title Block & Coordinate Stamp (Bottom-Right)
  const summary = store.getSystemSummary(systemId === 'all' ? undefined : systemId);
  const totalKwp = summary.totalKwp;
  const totalPanels = summary.totalActivePanels;
  const stampW = 280;
  const stampH = 55;
  const stampX = width - stampW - 25;
  const stampY = height - stampH - 25;

  svgElements += `
    <g transform="translate(${stampX}, ${stampY})">
      <rect width="${stampW}" height="${stampH}" rx="4" fill="#ffffff" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.5"/>
      <rect width="${stampW}" height="20" fill="#0f172a"/>
      <text x="10" y="14" font-family="sans-serif" font-size="10.5" font-weight="bold" fill="#ffffff">CAD SITE PLAN &amp; ARRAY LAYOUT</text>
      <text x="10" y="34" font-family="sans-serif" font-size="9.5" font-weight="600" fill="#334155">${escapeHtml(store.projectName || 'Solar Geo Project')} • ${totalKwp.toFixed(1)} kWp (${totalPanels} Modules)</text>
      <text x="10" y="47" font-family="sans-serif" font-size="8.5" fill="#64748b">Coords: ${origin.lat.toFixed(5)}° N, ${origin.lng.toFixed(5)}° E • WGS84</text>
    </g>
  `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${svgElements}
</svg>`;
}

/**
 * Directly renders the engineering 2D CAD site drawing onto an HTML5 2D canvas.
 * 100% synchronous, instantaneous, and zero SVG-parsing dependency.
 */
export function renderCadViewToCanvas(
  store: ProjectStore,
  canvas: HTMLCanvasElement,
  options: CadRenderOptions = {}
): HTMLCanvasElement {
  const width = options.width ?? canvas.width ?? 1400;
  const height = options.height ?? canvas.height ?? 880;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const systemId = options.systemId ?? 'all';
  const showLabels = options.showLabels ?? true;
  const origin = store.center;
  const { bounds, scale, toScreenX, toScreenY, toScreenPt, viewSpanX, viewSpanY } =
    computeCadViewTransform(store, width, height, systemId);
  const hasBasemap = !!options.basemap;

  // 1. Background (satellite basemap or paper) & Grid
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);
  if (options.basemap) {
    try {
      ctx.drawImage(options.basemap, 0, 0, width, height);
    } catch (e) {
      // Basemap unusable (e.g. tainted) – keep paper background
    }
  }
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, width, height);

  const gridStepM = getFriendlyScaleStep(Math.max(viewSpanX, viewSpanY));
  const startGridX = Math.floor(bounds.minX / gridStepM) * gridStepM;
  const endGridX = Math.ceil(bounds.maxX / gridStepM) * gridStepM;
  const startGridY = Math.floor(bounds.minY / gridStepM) * gridStepM;
  const endGridY = Math.ceil(bounds.maxY / gridStepM) * gridStepM;

  ctx.save();
  ctx.strokeStyle = hasBasemap ? 'rgba(255, 255, 255, 0.18)' : '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  for (let gx = startGridX; gx <= endGridX; gx += gridStepM) {
    const sx = toScreenX(gx);
    if (sx >= 0 && sx <= width) {
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
    }
  }
  for (let gy = startGridY; gy <= endGridY; gy += gridStepM) {
    const sy = toScreenY(gy);
    if (sy >= 0 && sy <= height) {
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
    }
  }
  ctx.stroke();
  ctx.restore();

  const zones = store.getZones().filter(z => systemId === 'all' || z.systemId === systemId);
  const panels = store.getPanels().filter(p => systemId === 'all' || p.systemId === systemId);
  const systems = store.getSystems().filter(s => systemId === 'all' || s.id === systemId);

  // 2. Raceways
  const drawRacewayPath = (path: LatLngPoint[], color: string) => {
    if (!path || path.length < 2) return;
    const pts = path.map(toScreenPt);
    ctx.save();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  };

  for (const sys of systems) {
    for (const hr of getSystemHomeruns(sys)) drawRacewayPath(hr.path, '#f59e0b');
    if (sys.acRaceway?.path) drawRacewayPath(sys.acRaceway.path, '#10b981');
  }

  // 3. Array Zones & Keepouts
  for (const zone of zones) {
    if (zone.vertices.length >= 3) {
      const pts = zone.vertices.map(toScreenPt);
      ctx.save();
      ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
      ctx.strokeStyle = zone.color || '#2563eb';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      for (const ko of zone.keepOuts) {
        if (ko.vertices.length >= 3) {
          const kpts = ko.vertices.map(toScreenPt);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 2]);
          ctx.beginPath();
          ctx.moveTo(kpts[0].x, kpts[0].y);
          for (let i = 1; i < kpts.length; i++) ctx.lineTo(kpts[i].x, kpts[i].y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      if (zone.raceway?.path) {
        drawRacewayPath(zone.raceway.path, '#f59e0b');
      }
      ctx.restore();
    }
  }

  // 4. Ground Mount Racks / Tables (if present)
  const groundZoneIds = new Set(
    zones
      .filter(z => z.config.mountType === 'ground' && z.tables && z.tables.length > 0)
      .map(z => z.id)
  );

  for (const zone of zones) {
    if (zone.tables && zone.tables.length > 0) {
      ctx.save();
      ctx.fillStyle = '#1e3a8a';
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.9;
      for (const table of zone.tables) {
        const tpts = table.corners.map(toScreenPt);
        ctx.beginPath();
        ctx.moveTo(tpts[0].x, tpts[0].y);
        for (let i = 1; i < tpts.length; i++) ctx.lineTo(tpts[i].x, tpts[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 5. Solar Panels (Crisp PV Cell Blue rectangles; ground mount arrays render tables instead of duplicate panels)
  const panelsToRender = panels.filter(p => !groundZoneIds.has(p.zoneId));
  ctx.save();
  for (const panel of panelsToRender) {
    if (!panel.corners || panel.corners.length !== 4) continue;
    const pts = panel.corners.map(toScreenPt);
    ctx.fillStyle = panel.active ? '#1e3a8a' : '#94a3b8';
    ctx.strokeStyle = panel.active ? '#60a5fa' : '#64748b';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.lineTo(pts[3].x, pts[3].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // 6. Inverter & PCC Markers
  for (const sys of systems) {
    if (sys.inverterLocation) {
      const invP = toScreenPt(sys.inverterLocation);
      ctx.save();
      ctx.fillStyle = '#fef3c7';
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(invP.x, invP.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#b45309';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', invP.x, invP.y);

      ctx.font = 'bold 10.5px sans-serif';
      ctx.fillStyle = '#78350f';
      if (hasBasemap) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 3;
        ctx.strokeText(`${sys.name} Inverter`, invP.x, invP.y + 22);
      }
      ctx.fillText(`${sys.name} Inverter`, invP.x, invP.y + 22);
      ctx.restore();
    }

    if (sys.acInterconnectionLocation) {
      const pccP = toScreenPt(sys.acInterconnectionLocation);
      ctx.save();
      ctx.fillStyle = '#d1fae5';
      ctx.strokeStyle = '#047857';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pccP.x, pccP.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#047857';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PCC', pccP.x, pccP.y);

      ctx.font = 'bold 10.5px sans-serif';
      ctx.fillStyle = '#065f46';
      if (hasBasemap) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 3;
        ctx.strokeText('Grid Tap (MDP)', pccP.x, pccP.y + 22);
      }
      ctx.fillText('Grid Tap (MDP)', pccP.x, pccP.y + 22);
      ctx.restore();
    }
  }

  // 7. Zone Labels (clean array name badge only)
  if (showLabels) {
    for (const zone of zones) {
      if (zone.vertices.length >= 3) {
        const centroid = computePolygonCentroid(zone.vertices);
        const pt = toScreenPt(centroid);
        const name = zone.name || 'Array Zone';

        ctx.save();
        ctx.font = 'bold 10.5px sans-serif';
        const textW = ctx.measureText(name).width;
        const boxW = Math.max(textW + 18, 70);
        const boxH = 22;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if ((ctx as any).roundRect) {
          (ctx as any).roundRect(pt.x - boxW / 2, pt.y - boxH / 2, boxW, boxH, 4);
        } else {
          ctx.rect(pt.x - boxW / 2, pt.y - boxH / 2, boxW, boxH);
        }
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(name, pt.x, pt.y);
        ctx.restore();
      }
    }
  }

  // 8. True North Compass Rose (Top-Right)
  const compassX = width - 75;
  const compassY = 75;
  ctx.save();
  ctx.translate(compassX, compassY);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // North pointer
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(8, -2);
  ctx.lineTo(0, 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(-8, -2);
  ctx.lineTo(0, 4);
  ctx.closePath();
  ctx.fill();

  // South pointer
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.moveTo(0, 30);
  ctx.lineTo(6, 2);
  ctx.lineTo(0, -4);
  ctx.lineTo(-6, 2);
  ctx.closePath();
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 12px sans-serif';
  ctx.fillStyle = '#dc2626';
  ctx.fillText('N', 0, -34);

  ctx.font = '600 9px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('S', 0, 42);
  ctx.fillText('E', 36, 1);
  ctx.fillText('W', -36, 1);
  ctx.restore();

  // 9. Metric Scale Bar (Bottom-Left)
  const scaleBarLengthM = getFriendlyScaleStep(bounds.spanX * 0.4);
  const scaleBarLengthPx = scaleBarLengthM * scale;
  const scaleXPos = 35;
  const scaleYPos = height - 40;

  ctx.save();
  ctx.translate(scaleXPos, scaleYPos);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(-10, -22, scaleBarLengthPx + 45, 38, 4);
  } else {
    ctx.rect(-10, -22, scaleBarLengthPx + 45, 38);
  }
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(scaleBarLengthPx, 0);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -5); ctx.lineTo(0, 5);
  ctx.moveTo(scaleBarLengthPx, -5); ctx.lineTo(scaleBarLengthPx, 5);
  ctx.stroke();

  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(scaleBarLengthPx / 2, -3); ctx.lineTo(scaleBarLengthPx / 2, 3);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.fillText('0', 0, -8);
  ctx.fillText(`${scaleBarLengthM / 2}m`, scaleBarLengthPx / 2, -8);
  ctx.fillText(`${scaleBarLengthM}m`, scaleBarLengthPx, -8);

  ctx.font = '600 9px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(`SCALE 1 : ${(1 / scale * 100).toFixed(0)} (m)`, scaleBarLengthPx / 2, 12);
  ctx.restore();

  // 10. Title Block & Coordinate Stamp (Bottom-Right)
  const summary = store.getSystemSummary(systemId === 'all' ? undefined : systemId);
  const stampW = 290;
  const stampH = 55;
  const stampX = width - stampW - 25;
  const stampY = height - stampH - 25;

  ctx.save();
  ctx.translate(stampX, stampY);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(0, 0, stampW, stampH, 4);
  } else {
    ctx.rect(0, 0, stampW, stampH);
  }
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, stampW, 20);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('CAD SITE PLAN & ARRAY LAYOUT', 10, 14);

  ctx.fillStyle = '#334155';
  ctx.font = '600 9.5px sans-serif';
  ctx.fillText(`${store.projectName || 'Solar Geo Project'} • ${summary.totalKwp.toFixed(1)} kWp (${summary.totalActivePanels} Modules)`, 10, 34);

  ctx.fillStyle = '#64748b';
  ctx.font = '8.5px sans-serif';
  ctx.fillText(`Coords: ${origin.lat.toFixed(5)}° N, ${origin.lng.toFixed(5)}° E • WGS84`, 10, 47);
  ctx.restore();

  // 11. Imagery attribution (required by the satellite tile provider)
  if (hasBasemap) {
    ctx.save();
    ctx.font = '9px sans-serif';
    const attrW = ctx.measureText(SATELLITE_ATTRIBUTION).width + 12;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(width / 2 - attrW / 2, height - 16, attrW, 14);
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(SATELLITE_ATTRIBUTION, width / 2, height - 9);
    ctx.restore();
  }

  return canvas;
}

/**
 * Computes the shared metric→screen transform used by the CAD renderers and the satellite basemap,
 * guaranteeing both layers align pixel-for-pixel.
 */
export function computeCadViewTransform(
  store: ProjectStore,
  width: number,
  height: number,
  systemId: string = 'all'
) {
  const origin = store.center;
  const bounds = computeProjectMetricBounds(store, origin, systemId);

  // 14% margin around content
  const marginX = bounds.spanX * 0.14;
  const marginY = bounds.spanY * 0.14;
  const viewSpanX = bounds.spanX + marginX * 2;
  const viewSpanY = bounds.spanY + marginY * 2;
  const scale = Math.min(width / viewSpanX, height / viewSpanY);

  const toScreenX = (mx: number) => width / 2 + (mx - bounds.centerX) * scale;
  const toScreenY = (my: number) => height / 2 - (my - bounds.centerY) * scale;
  const toScreenPt = (latlng: LatLngPoint) => {
    const m = latLngToLocalMetric(latlng, origin);
    return { x: toScreenX(m.x), y: toScreenY(m.y) };
  };
  const toLatLng = (sx: number, sy: number): LatLngPoint =>
    localMetricToLatLng(
      { x: (sx - width / 2) / scale + bounds.centerX, y: bounds.centerY - (sy - height / 2) / scale },
      origin
    );

  return { origin, bounds, scale, viewSpanX, viewSpanY, toScreenX, toScreenY, toScreenPt, toLatLng };
}

function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * Math.pow(2, z);
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z);
}

function tileXToLng(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}

function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function loadTileImage(url: string, timeoutMs: number): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

/**
 * Detects if an Esri tile is the "Map data not yet available" placeholder (solid #cccccc gray background).
 */
export function isPlaceholderTile(img: HTMLImageElement): boolean {
  try {
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 16;
    testCanvas.height = 16;
    const tCtx = testCanvas.getContext('2d', { willReadFrequently: true });
    if (!tCtx) return false;
    tCtx.drawImage(img, 0, 0, 16, 16);
    const data = tCtx.getImageData(0, 0, 16, 16).data;
    let grayMatches = 0;
    const corners = [0, 15, 240, 255];
    for (const idx of corners) {
      const r = data[idx * 4];
      const g = data[idx * 4 + 1];
      const b = data[idx * 4 + 2];
      if (Math.abs(r - 204) <= 4 && Math.abs(g - 204) <= 4 && Math.abs(b - 204) <= 4) {
        grayMatches++;
      }
    }
    return grayMatches === 4;
  } catch (e) {
    return false;
  }
}

const basemapCache = new Map<string, HTMLCanvasElement>();

export function clearBasemapCache(): void {
  basemapCache.clear();
}

/** Pixel-space description of a view onto the ground, used to composite satellite tiles. */
export interface BasemapView {
  width: number;
  height: number;
  /** Screen px → geographic position. */
  toLatLng: (sx: number, sy: number) => LatLngPoint;
  /** Geographic position → screen px. */
  toScreenPt: (p: LatLngPoint) => { x: number; y: number };
  /** Screen pixels per metre (used to pick the tile zoom). */
  scale: number;
  lyrs: 'y' | 's';
  /** Cache key; omit to skip caching. */
  cacheKey?: string;
  timeoutMs?: number;
}

/**
 * Composites Google satellite tiles into an offscreen canvas for an arbitrary view.
 * Returns null if no imagery is available or the canvas is tainted.
 */
export async function renderSatelliteBasemapForView(view: BasemapView): Promise<HTMLCanvasElement | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const { width, height, lyrs, timeoutMs = 8000 } = view;

  const nw = view.toLatLng(0, 0);
  const se = view.toLatLng(width, height);
  const north = Math.max(nw.lat, se.lat);
  const south = Math.min(nw.lat, se.lat);
  const west = Math.min(nw.lng, se.lng);
  const east = Math.max(nw.lng, se.lng);
  if (![north, south, west, east].every(Number.isFinite)) return null;

  if (view.cacheKey && basemapCache.has(view.cacheKey)) {
    return basemapCache.get(view.cacheKey)!;
  }

  // Pick the zoom whose ground resolution is at least as fine as the canvas resolution
  const metersPerPx = 1 / view.scale;
  const centerLatRad = (((north + south) / 2) * Math.PI) / 180;
  let z = Math.ceil(Math.log2((156543.03392 * Math.cos(centerLatRad)) / metersPerPx));
  z = Math.max(1, Math.min(SATELLITE_MAX_ZOOM, z));

  // Probe candidate zoom levels in parallel to pick the sharpest available Google tile fast
  const centerLat = (north + south) / 2;
  const centerLng = (west + east) / 2;
  const probeZooms: number[] = [];
  for (let pz = z; pz >= 12; pz--) {
    probeZooms.push(pz);
  }
  const probeResults = await Promise.all(
    probeZooms.map(async pz => {
      const probeX = Math.floor(lngToTileX(centerLng, pz));
      const probeY = Math.floor(latToTileY(centerLat, pz));
      const probeUrl = buildGoogleTileUrl(probeX, probeY, pz, lyrs);
      const probeImg = await loadTileImage(probeUrl, 1800);
      return { pz, ok: probeImg !== null && !isPlaceholderTile(probeImg) };
    })
  );
  const validProbe = probeResults.find(r => r.ok);
  if (validProbe) {
    z = validProbe.pz;
  } else if (probeZooms.length > 0) {
    z = 14;
  }

  let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
  for (; z >= 1; z--) {
    x0 = Math.floor(lngToTileX(west, z));
    x1 = Math.floor(lngToTileX(east, z));
    y0 = Math.floor(latToTileY(north, z));
    y1 = Math.floor(latToTileY(south, z));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= SATELLITE_MAX_TILES) break;
  }

  const jobs: Promise<void>[] = [];
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(0, 0, width, height);

  let loaded = 0;
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      const url = buildGoogleTileUrl(tx, ty, z, lyrs);
      jobs.push(
        loadTileImage(url, timeoutMs).then(img => {
          if (!img || isPlaceholderTile(img)) return;
          const p0 = view.toScreenPt({ lat: tileYToLat(ty, z), lng: tileXToLng(tx, z) });
          const p1 = view.toScreenPt({ lat: tileYToLat(ty + 1, z), lng: tileXToLng(tx + 1, z) });
          // +0.5px overlap hides hairline seams between adjacent tiles
          ctx.drawImage(img, p0.x, p0.y, p1.x - p0.x + 0.5, p1.y - p0.y + 0.5);
          loaded++;
        })
      );
    }
  }
  await Promise.all(jobs);
  if (loaded === 0) return null;

  // Verify the canvas is not tainted (would break toDataURL in the PDF export)
  try {
    ctx.getImageData(0, 0, 1, 1);
  } catch (e) {
    return null;
  }
  if (view.cacheKey) basemapCache.set(view.cacheKey, out);
  return out;
}

/**
 * Fetches satellite imagery tiles covering the CAD view extent and composites them into
 * an offscreen canvas aligned with `computeCadViewTransform`. Returns null if unavailable.
 */
export async function renderSatelliteBasemap(
  store: ProjectStore,
  width: number,
  height: number,
  systemId: string = 'all',
  timeoutMs: number = 8000
): Promise<HTMLCanvasElement | null> {
  const t = computeCadViewTransform(store, width, height, systemId);
  // Google layer type: 's' for pure satellite, 'y' for satellite hybrid with roads/labels (matching Map View default)
  const lyrs: 'y' | 's' = store.viewFilter?.basemap === 'google-satellite' ? 's' : 'y';
  const cacheKey = `${width}x${height}_${systemId}_${lyrs}_${t.bounds.minX.toFixed(1)}_${t.bounds.maxX.toFixed(1)}_${t.bounds.minY.toFixed(1)}_${t.bounds.maxY.toFixed(1)}_${t.origin.lat.toFixed(5)}_${t.origin.lng.toFixed(5)}`;
  return renderSatelliteBasemapForView({
    width,
    height,
    toLatLng: t.toLatLng,
    toScreenPt: t.toScreenPt,
    scale: t.scale,
    lyrs,
    cacheKey,
    timeoutMs
  });
}

/**
 * Renders the CAD view instantly (paper background), then upgrades it to a satellite
 * underlay once imagery tiles have loaded. Resolves true if satellite imagery was applied.
 */
export async function renderCadViewToCanvasWithSatellite(
  store: ProjectStore,
  canvas: HTMLCanvasElement,
  options: CadRenderOptions = {}
): Promise<boolean> {
  const width = options.width ?? canvas.width ?? 1400;
  const height = options.height ?? canvas.height ?? 880;
  renderCadViewToCanvas(store, canvas, { ...options, width, height, basemap: null });
  const basemap = await renderSatelliteBasemap(store, width, height, options.systemId ?? 'all');
  if (!basemap) return false;
  renderCadViewToCanvas(store, canvas, { ...options, width, height, basemap });
  return true;
}

/**
 * Converts the 2D CAD engineering layout into a crisp PNG Data URL.
 * In DOM environments, renders directly via Canvas for instant, synchronous performance.
 */
export async function renderCadViewPng(
  store: ProjectStore,
  options: CadRenderOptions = {}
): Promise<string> {
  const width = options.width ?? 1400;
  const height = options.height ?? 880;

  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      let basemap = options.basemap ?? null;
      if (!basemap && options.satellite) {
        basemap = await renderSatelliteBasemap(store, width, height, options.systemId ?? 'all');
      }
      renderCadViewToCanvas(store, canvas, { ...options, width, height, basemap });
      // JPEG keeps satellite-backed PDFs small; PNG for crisp line-art on paper
      return basemap ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png');
    } catch (e) {
      // Fallback
    }
  }

  const svg = renderCadViewSvg(store, { ...options, width, height });
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
