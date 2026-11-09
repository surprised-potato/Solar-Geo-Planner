/**
 * Array Stringing Guide: an installer-facing PDF that shows every array with its strings
 * drawn on the module layout (colour per string, wiring order, start/end modules), plus
 * per-string tables with inverter/MPPT, voltages and cable runs.
 *
 * Drawn as vector graphics straight into jsPDF so it stays sharp at any zoom, works headless
 * and needs no image rasterization.
 */
import { jsPDF } from 'jspdf';
import { ProjectStore } from '../store/projectStore';
import { latLngToLocalMetric, localMetricToLatLng } from '../geo/projection';
import { renderSatelliteBasemapForView } from './cadSnapshot';
import { ArrayZone, LatLngPoint, MetricPoint, SolarPanelObject, StringCableLength } from '../types/solar';
import { collectReportBundleData } from './pdfReportGenerator';
import { ReportBundleData, ReportExportOptions, ReportSystemData } from './reportTypes';
import { COLORS, M, PaperFormat, ReportCtx, RGB, num, pageSizeMm } from './pdf/context';
import { drawTable } from './pdf/table';

export interface StringingGuideOptions {
  /** 'all' (default) or a single system id. */
  systemId?: string;
  projectTitle?: string;
  clientName?: string;
  engineerName?: string;
  companyName?: string;
  reportDate?: string;
  /** Satellite imagery for the overview site plan, from prefetchStringingBasemap(). */
  basemap?: StringingBasemap | null;
}

/** Square satellite image centred on the site, in local metres around the project origin. */
export interface StringingBasemap {
  dataUrl: string;
  centerX: number;
  centerY: number;
  sizeM: number;
}

/** Distinct colours, cycled per string. All are dark enough for white labels. */
export const STRING_PALETTE: RGB[] = [
  [37, 99, 235],
  [220, 38, 38],
  [22, 163, 74],
  [217, 119, 6],
  [147, 51, 234],
  [8, 145, 178],
  [219, 39, 119],
  [101, 163, 13],
  [79, 70, 229],
  [234, 88, 12],
  [13, 148, 136],
  [161, 98, 7]
];

/** Smallest module footprint (mm on paper) at which per-module numbers stay legible. */
export const MIN_PANEL_MM = 3.6;

const naturalCompare = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true });

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface View {
  scale: number;
  minX: number;
  maxY: number;
  offX: number;
  offY: number;
}

function boundsOf(points: MetricPoint[]): Bounds {
  const b: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const p of points) {
    b.minX = Math.min(b.minX, p.x);
    b.maxX = Math.max(b.maxX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxY = Math.max(b.maxY, p.y);
  }
  if (!Number.isFinite(b.minX)) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  return b;
}

function makeView(b: Bounds, box: { x: number; y: number; w: number; h: number }, pad = 5): View {
  const bw = Math.max(b.maxX - b.minX, 0.5);
  const bh = Math.max(b.maxY - b.minY, 0.5);
  const scale = Math.min((box.w - 2 * pad) / bw, (box.h - 2 * pad) / bh);
  return {
    scale,
    minX: b.minX,
    maxY: b.maxY,
    offX: box.x + (box.w - bw * scale) / 2,
    offY: box.y + (box.h - bh * scale) / 2
  };
}

const toPage = (v: View, p: MetricPoint): [number, number] => [v.offX + (p.x - v.minX) * v.scale, v.offY + (v.maxY - p.y) * v.scale];

function dist(a: MetricPoint, b: MetricPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Picks the smallest paper (A4, A3, A2) on which the modules are still big enough to number. */
export function pickStringingPaper(
  bw: number,
  bh: number,
  minPanelM: number
): { format: PaperFormat; landscape: boolean } {
  const landscape = bw / Math.max(bh, 0.1) >= 0.9;
  for (const format of ['a4', 'a3', 'a2'] as PaperFormat[]) {
    const { w, h } = pageSizeMm(format, landscape);
    const boxW = w - 2 * M;
    const boxH = (h - 52) * 0.6;
    const scale = Math.min(boxW / Math.max(bw, 0.5), boxH / Math.max(bh, 0.5));
    if (minPanelM * scale >= MIN_PANEL_MM) return { format, landscape };
  }
  return { format: 'a2', landscape };
}

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

function polygon(ctx: ReportCtx, pts: [number, number][], style: 'S' | 'F' | 'FD'): void {
  if (pts.length < 3) return;
  const segs: number[][] = [];
  for (let i = 1; i < pts.length; i++) segs.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  ctx.doc.lines(segs, pts[0][0], pts[0][1], [1, 1], style, true);
}

function northArrow(ctx: ReportCtx, x: number, y: number): void {
  ctx.stroke(COLORS.ink, 0.35);
  ctx.fill(COLORS.ink);
  polygon(ctx, [[x, y - 6], [x - 2.2, y + 2], [x, y + 0.6], [x + 2.2, y + 2]], 'FD');
  ctx.t('N', x, y + 6.4, { style: 'bold', size: 7, color: COLORS.ink, align: 'center' });
}

function scaleBar(ctx: ReportCtx, v: View, x: number, y: number): void {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
  let len = steps[0];
  for (const s of steps) if (s * v.scale <= 45) len = s;
  const w = len * v.scale;
  ctx.stroke(COLORS.ink, 0.5);
  ctx.doc.line(x, y, x + w, y);
  ctx.doc.line(x, y - 1.2, x, y + 1.2);
  ctx.doc.line(x + w, y - 1.2, x + w, y + 1.2);
  ctx.t(`${len} m`, x + w / 2, y - 2, { size: 6.5, color: COLORS.ink, align: 'center' });
}

// ---------------------------------------------------------------------------
// Data preparation
// ---------------------------------------------------------------------------

interface StringTag {
  tag: string; // "S12"
  color: RGB;
}

interface ZoneStringRow {
  stringId: string;
  tag: string;
  panels: SolarPanelObject[]; // sorted by stringOrder, in this zone
  totalModules: number; // across the whole string (may span arrays)
}

function panelRef(p: SolarPanelObject): string {
  if (p.tableIndex) {
    return `Table ${p.tableIndex} R${(p.tableModuleRow ?? 0) + 1}C${(p.tableModuleCol ?? 0) + 1}`;
  }
  return `Row ${p.rowIndex + 1}, Col ${p.colIndex + 1}`;
}

interface GuideData {
  bundle: ReportBundleData;
  origin: LatLngPoint;
  tags: Map<string, StringTag>; // key: systemId|stringId
  cables: Map<string, StringCableLength>; // key: systemId|stringId
  systemOf: Map<string, ReportSystemData>;
  basemap: StringingBasemap | null;
}

const keyOf = (systemId: string, stringId: string): string => `${systemId}|${stringId}`;

function prepare(store: ProjectStore, bundle: ReportBundleData): GuideData {
  const tags = new Map<string, StringTag>();
  const cables = new Map<string, StringCableLength>();
  const systemOf = new Map<string, ReportSystemData>();
  let n = 0;
  for (const sys of bundle.systems) {
    systemOf.set(sys.system.id, sys);
    const ids = new Set<string>();
    for (const p of store.getPanelsForSystem(sys.system.id)) if (p.active && p.stringId) ids.add(p.stringId);
    Array.from(ids)
      .sort(naturalCompare)
      .forEach(id => {
        n++;
        tags.set(keyOf(sys.system.id, id), { tag: `S${n}`, color: STRING_PALETTE[(n - 1) % STRING_PALETTE.length] });
      });
    for (const c of sys.cables.strings) cables.set(keyOf(sys.system.id, c.stringId), c);
  }
  return { bundle, origin: store.center, tags, cables, systemOf, basemap: null };
}

function zoneStringRows(store: ProjectStore, zone: ArrayZone, data: GuideData): ZoneStringRow[] {
  const byString = new Map<string, SolarPanelObject[]>();
  for (const p of store.getPanelsForZone(zone.id)) {
    if (!p.active || !p.stringId) continue;
    if (!byString.has(p.stringId)) byString.set(p.stringId, []);
    byString.get(p.stringId)!.push(p);
  }
  const sysPanels = store.getPanelsForSystem(zone.systemId);
  const rows: ZoneStringRow[] = [];
  for (const [stringId, panels] of byString) {
    panels.sort((a, b) => (a.stringOrder ?? 0) - (b.stringOrder ?? 0));
    const tag = data.tags.get(keyOf(zone.systemId, stringId))?.tag ?? '?';
    rows.push({
      stringId,
      tag,
      panels,
      totalModules: sysPanels.filter(p => p.active && p.stringId === stringId).length
    });
  }
  return rows.sort((a, b) => naturalCompare(a.tag, b.tag));
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

function renderOverview(ctx: ReportCtx, store: ProjectStore, data: GuideData, arraySheetBase: number): void {
  const { bundle } = data;
  const zones = bundle.targetZones;
  ctx.beginSection('overview', 'Stringing Overview', {
    subtitle: 'Installer guide: where every string goes. Each array has its own sheet with the strings drawn on the module layout.'
  });

  let strungModules = 0;
  let unstrung = 0;
  let stringCount = 0;
  for (const sys of bundle.systems) {
    const panels = store.getPanelsForSystem(sys.system.id).filter(p => p.active);
    strungModules += panels.filter(p => p.stringId).length;
    unstrung += panels.filter(p => !p.stringId).length;
  }
  stringCount = data.tags.size;
  ctx.kpiTiles([
    { label: 'Arrays', value: String(zones.length), sub: `${bundle.systems.length} system(s)` },
    { label: 'Strings', value: String(stringCount), sub: 'to be wired' },
    { label: 'Modules strung', value: num(strungModules), sub: 'in a string' },
    { label: 'Modules unstrung', value: num(unstrung), sub: unstrung ? 'need a string' : 'none — complete' }
  ]);

  // Site plan
  const metric = (p: LatLngPoint): MetricPoint => latLngToLocalMetric(p, data.origin);
  const allPts = zones.flatMap(z => z.vertices.map(metric));
  if (allPts.length > 0) {
    const box = { x: M, y: ctx.y, w: ctx.contentW, h: Math.min(115, ctx.bottom - ctx.y - 95) };
    ctx.stroke(COLORS.border, 0.3);
    ctx.fill(COLORS.zebra);
    ctx.doc.rect(box.x, box.y, box.w, box.h, 'FD');
    const view = makeView(boundsOf(allPts), box, 12);
    const bm = data.basemap;
    if (bm) {
      // Clip to the plan box and lay the image on the same metric frame as the arrays.
      const tl = toPage(view, { x: bm.centerX - bm.sizeM / 2, y: bm.centerY + bm.sizeM / 2 });
      const side = bm.sizeM * view.scale;
      try {
        ctx.doc.saveGraphicsState();
        ctx.doc.rect(box.x, box.y, box.w, box.h, null as any);
        ctx.doc.clip();
        ctx.doc.discardPath();
        ctx.doc.addImage(bm.dataUrl, 'JPEG', tl[0], tl[1], side, side);
        ctx.doc.restoreGraphicsState();
        ctx.stroke(COLORS.border, 0.3);
        ctx.doc.rect(box.x, box.y, box.w, box.h, 'S');
      } catch {
        ctx.doc.restoreGraphicsState();
      }
    }
    zones.forEach((z, i) => {
      const sys = bundle.systems.find(s => s.system.id === z.systemId);
      const hex = sys?.system.color ?? '#38bdf8';
      const rgb = hexToRgb(hex);
      const pts = z.vertices.map(v => toPage(view, metric(v)));
      ctx.fill(bm ? rgb : lighten(rgb, 0.7));
      ctx.stroke(bm ? [255, 255, 255] : rgb, 0.5);
      if (bm) ctx.doc.setGState(new (ctx.doc as any).GState({ opacity: 0.35 }));
      polygon(ctx, pts, 'FD');
      if (bm) ctx.doc.setGState(new (ctx.doc as any).GState({ opacity: 1 }));
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const rows = zoneStringRows(store, z, data);
      const labelColor: RGB = bm ? [255, 255, 255] : COLORS.ink;
      ctx.t(`A${i + 1}`, cx, cy, { style: 'bold', size: 9, color: labelColor, align: 'center' });
      ctx.t(`${rows.length} str`, cx, cy + 3.6, { size: 6.5, color: bm ? [255, 255, 255] : COLORS.body, align: 'center' });
    });
    if (bm) {
      ctx.t('Imagery © Google Maps', box.x + box.w - 2, box.y + box.h - 1.5, { size: 5.5, color: [255, 255, 255], align: 'right' });
    }
    northArrow(ctx, box.x + box.w - 8, box.y + 9);
    scaleBar(ctx, view, box.x + 6, box.y + box.h - 5);
    ctx.y = box.y + box.h + 5;
  }

  ctx.noteBox('How to use this guide', [
    'Each array sheet shows its modules coloured by string. A tag such as S7 names the string; the legend table beneath lists its full ID.',
    'Modules are numbered in wiring order (1, 2, 3 …). Wire module 1 to module 2, and so on, following the thin line.',
    'The green (+) marks the START module: connect the string positive lead there. The red (−) marks the END module: connect the negative lead there.',
    'Run both leads back to the inverter MPPT shown in the table. Do not connect strings of different MPPTs in parallel.',
    'Grey modules are not in a string yet. Measure and record open-circuit voltage (Voc) for every string before closing the DC isolator.'
  ]);

  ctx.subheading('Array index');
  drawTable(ctx, {
    columns: [
      { header: 'Array', width: 1, bold: true, color: COLORS.navy },
      { header: 'Name', width: 3.4 },
      { header: 'System', width: 3.4 },
      { header: 'Mount', width: 2 },
      { header: 'Modules', width: 1.6, align: 'right' },
      { header: 'Strings', width: 1.4, align: 'right' },
      { header: 'Mods / string', width: 1.9, align: 'right' },
      { header: 'Sheet', width: 1.2, align: 'right' }
    ],
    rows: zones.map((z, i) => {
      const rows = zoneStringRows(store, z, data);
      const mods = rows.reduce((a, r) => a + r.panels.length, 0);
      const perString = rows.length ? Array.from(new Set(rows.map(r => r.totalModules))).sort((a, b) => a - b).join('/') : '—';
      const sys = bundle.systems.find(s => s.system.id === z.systemId);
      return [
        `A${i + 1}`,
        z.name,
        sys?.system.name ?? '',
        z.config.mountType === 'ground' ? 'Ground rack' : 'Rooftop',
        num(mods),
        String(rows.length),
        perString,
        String(arraySheetBase + i)
      ];
    }),
    fontSize: 7
  });
}

function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [56, 189, 248];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lighten(c: RGB, t: number): RGB {
  return [Math.round(c[0] + (255 - c[0]) * t), Math.round(c[1] + (255 - c[1]) * t), Math.round(c[2] + (255 - c[2]) * t)];
}

function renderArraySheet(ctx: ReportCtx, store: ProjectStore, data: GuideData, zone: ArrayZone, index: number): void {
  const metric = (p: LatLngPoint): MetricPoint => latLngToLocalMetric(p, data.origin);
  const sys = data.systemOf.get(zone.systemId);
  const panels = store.getPanelsForZone(zone.id).filter(p => p.active);
  const allPanels = store.getPanelsForZone(zone.id);
  const rows = zoneStringRows(store, zone, data);

  const cornerPts = new Map<string, MetricPoint[]>();
  for (const p of allPanels) cornerPts.set(p.id, p.corners.map(metric));
  const pts: MetricPoint[] = [...zone.vertices.map(metric)];
  for (const arr of cornerPts.values()) pts.push(...arr);
  const b = boundsOf(pts);
  const sample = cornerPts.get(panels[0]?.id ?? '') ?? [];
  const minPanelM = sample.length === 4 ? Math.min(dist(sample[0], sample[1]), dist(sample[1], sample[2])) : 1;
  const paper = pickStringingPaper(b.maxX - b.minX, b.maxY - b.minY, minPanelM);

  const modules = rows.reduce((a, r) => a + r.panels.length, 0);
  const unstrung = panels.filter(p => !p.stringId).length;
  ctx.beginSection(`array-${zone.id}`, `Array A${index + 1}: ${zone.name}`, {
    landscape: paper.landscape,
    format: paper.format,
    subtitle:
      `${sys?.system.name ?? ''} • ${zone.config.mountType === 'ground' ? 'Ground rack' : 'Rooftop'} • ` +
      `${num(modules)} modules in ${rows.length} string(s) • Tilt ${zone.config.tiltDeg}°, azimuth ${zone.config.azimuthDeg}°` +
      (unstrung ? ` • ${unstrung} module(s) NOT in a string` : '')
  });

  // Drawing box
  const boxH = Math.max(60, (ctx.bottom - ctx.y) * 0.62);
  const box = { x: M, y: ctx.y, w: ctx.contentW, h: boxH };
  ctx.stroke(COLORS.border, 0.3);
  ctx.fill([255, 255, 255]);
  ctx.doc.rect(box.x, box.y, box.w, box.h, 'FD');
  const view = makeView(b, box, 8);
  const panelMm = minPanelM * view.scale;
  const showNumbers = panelMm >= MIN_PANEL_MM;

  // Zone boundary + keep-outs
  ctx.stroke(COLORS.navy, 0.4);
  ctx.doc.setLineDashPattern([1.5, 1], 0);
  ctx.fill([255, 255, 255]);
  polygon(ctx, zone.vertices.map(v => toPage(view, metric(v))), 'S');
  ctx.doc.setLineDashPattern([], 0);
  for (const ko of zone.keepOuts) {
    ctx.fill([254, 226, 226]);
    ctx.stroke(COLORS.red, 0.3);
    polygon(ctx, ko.vertices.map(v => toPage(view, metric(v))), 'FD');
  }

  // Mount tables (ground racks)
  if (zone.config.mountType === 'ground' && zone.tables) {
    ctx.stroke(COLORS.muted, 0.25);
    for (const t of zone.tables) polygon(ctx, t.corners.map(c => toPage(view, metric(c))), 'S');
  }

  // Modules
  const centerOf = (p: SolarPanelObject): [number, number] => toPage(view, metric(p.centroid));
  for (const p of panels) {
    const poly = (cornerPts.get(p.id) ?? []).map(m => toPage(view, m));
    const info = p.stringId ? data.tags.get(keyOf(zone.systemId, p.stringId)) : undefined;
    ctx.fill(info ? info.color : [214, 218, 224]);
    ctx.stroke([255, 255, 255], 0.15);
    polygon(ctx, poly, 'FD');
  }

  // Wiring path, markers and numbers
  const fontPt = Math.max(3.5, Math.min(8, panelMm * 2.83 * 0.5));
  for (const row of rows) {
    const info = data.tags.get(keyOf(zone.systemId, row.stringId));
    const centres = row.panels.map(centerOf);
    ctx.stroke([255, 255, 255], Math.max(0.15, panelMm * 0.07));
    for (let i = 1; i < centres.length; i++) ctx.doc.line(centres[i - 1][0], centres[i - 1][1], centres[i][0], centres[i][1]);

    if (showNumbers) {
      row.panels.forEach((_p, i) => {
        if (i === 0 || i === row.panels.length - 1 || i === Math.floor(row.panels.length / 2)) return;
        ctx.t(String(i + 1), centres[i][0], centres[i][1] + fontPt * 0.12, {
          style: 'bold',
          size: fontPt,
          color: COLORS.white,
          align: 'center'
        });
      });
    }

    const r = Math.max(1.3, Math.min(2.6, panelMm * 0.42));
    const start = centres[0];
    const end = centres[centres.length - 1];
    if (start) {
      ctx.fill([22, 163, 74]);
      ctx.stroke(COLORS.white, 0.3);
      ctx.doc.circle(start[0], start[1], r, 'FD');
      ctx.t('+', start[0], start[1] + r * 0.5, { style: 'bold', size: r * 4, color: COLORS.white, align: 'center' });
    }
    if (end && centres.length > 1) {
      ctx.fill([185, 28, 28]);
      ctx.stroke(COLORS.white, 0.3);
      ctx.doc.circle(end[0], end[1], r, 'FD');
      ctx.t('-', end[0], end[1] + r * 0.5, { style: 'bold', size: r * 4, color: COLORS.white, align: 'center' });
    }
    // Tag on the middle module
    const mid = centres[Math.floor(centres.length / 2)];
    if (mid && info) {
      const tw = Math.max(5, row.tag.length * 1.7 + 2);
      ctx.fill(COLORS.white);
      ctx.stroke(info.color, 0.4);
      ctx.doc.roundedRect(mid[0] - tw / 2, mid[1] - 2.1, tw, 4.2, 0.8, 0.8, 'FD');
      ctx.t(row.tag, mid[0], mid[1] + 1.1, { style: 'bold', size: 6.5, color: info.color, align: 'center' });
    }
  }

  // Raceway path
  if (zone.raceway?.path && zone.raceway.path.length > 1) {
    ctx.stroke(COLORS.amber, 0.8);
    ctx.doc.setLineDashPattern([2.5, 1.5], 0);
    const rp = zone.raceway.path.map(v => toPage(view, metric(v)));
    for (let i = 1; i < rp.length; i++) ctx.doc.line(rp[i - 1][0], rp[i - 1][1], rp[i][0], rp[i][1]);
    ctx.doc.setLineDashPattern([], 0);
  }

  northArrow(ctx, box.x + box.w - 8, box.y + 9);
  scaleBar(ctx, view, box.x + 6, box.y + box.h - 5);
  // Legend strip
  const lx = box.x + 6;
  const ly = box.y + 4;
  ctx.fill([22, 163, 74]);
  ctx.doc.circle(lx + 1.2, ly, 1.2, 'F');
  ctx.t('START (+)', lx + 3.5, ly + 1, { size: 6.5, color: COLORS.ink });
  ctx.fill([185, 28, 28]);
  ctx.doc.circle(lx + 22, ly, 1.2, 'F');
  ctx.t('END (-)', lx + 24.3, ly + 1, { size: 6.5, color: COLORS.ink });
  ctx.fill([214, 218, 224]);
  ctx.doc.rect(lx + 40, ly - 1.2, 3, 2.4, 'F');
  ctx.t('not in a string', lx + 44.5, ly + 1, { size: 6.5, color: COLORS.ink });
  if (!showNumbers) {
    ctx.t('Modules too small to number on this sheet: follow each string line from START to END.', lx, ly + 5, {
      style: 'italic',
      size: 6.2,
      color: COLORS.muted
    });
  }
  ctx.y = box.y + box.h + 5;

  // String table
  ctx.subheading(`Strings in this array (${rows.length})`);
  if (rows.length === 0) {
    ctx.paragraph('No strings are defined for this array yet. Run auto-stringing in the CAD before issuing this guide.', {
      style: 'italic',
      color: COLORS.red
    });
    return;
  }
  const model = sys?.sldModel;
  drawTable(ctx, {
    columns: [
      { header: 'Tag', width: 1, bold: true },
      { header: 'String ID', width: 3 },
      { header: 'Modules', width: 1.4, align: 'right' },
      { header: 'Inverter MPPT', width: 2.4 },
      { header: 'START (+) module', width: 2.7 },
      { header: 'END (-) module', width: 2.7 },
      { header: 'Voc cold V', width: 1.5, align: 'right' },
      { header: 'Cable run m', width: 1.5, align: 'right' },
      { header: 'Wired', width: 1.1, align: 'center' },
      { header: 'Voc measured', width: 2, align: 'left' }
    ],
    rows: rows.map(r => {
      const si = model?.strings.find(s => s.stringId === r.stringId);
      const cable = data.cables.get(keyOf(zone.systemId, r.stringId));
      const first = r.panels[0];
      const last = r.panels[r.panels.length - 1];
      return [
        r.tag,
        r.stringId,
        r.totalModules === r.panels.length ? String(r.panels.length) : `${r.panels.length} of ${r.totalModules}`,
        si ? `INV ${si.inverterIndex} / ${si.mpptId}` : first?.mpptId ? `INV ${first.inverterIndex} / ${first.mpptId}` : '—',
        first ? panelRef(first) : '—',
        last ? panelRef(last) : '—',
        si ? si.coldVoc.toFixed(0) : '—',
        cable ? cable.totalStringCableM.toFixed(0) : '—',
        '[   ]',
        '________ V'
      ];
    }),
    cellColor: (ri, ci) => (ci === 0 ? data.tags.get(keyOf(zone.systemId, rows[ri].stringId))?.color : undefined),
    fontSize: 6.8,
    rowH: 6
  });
}

function renderSchedule(ctx: ReportCtx, store: ProjectStore, data: GuideData): void {
  ctx.beginSection('schedule', 'String Schedule', {
    subtitle: 'Every string in the project, grouped by inverter and MPPT, for commissioning and test records.'
  });
  const rows: { sort: string; cells: string[] }[] = [];
  for (const sys of data.bundle.systems) {
    const cableList = data.cables;
    for (const s of sys.sldModel.strings) {
      const tag = data.tags.get(keyOf(sys.system.id, s.stringId));
      const cable = cableList.get(keyOf(sys.system.id, s.stringId));
      const sysPanels = store.getPanelsForSystem(sys.system.id).filter(p => p.stringId === s.stringId && p.active);
      sysPanels.sort((a, b) => (a.stringOrder ?? 0) - (b.stringOrder ?? 0));
      rows.push({
        sort: `${sys.system.name}|${String(s.inverterIndex).padStart(3, '0')}|${s.mpptId}|${tag?.tag ?? ''}`,
        cells: [
          tag?.tag ?? '?',
          s.stringId,
          s.zoneName,
          sys.system.name,
          s.mpptId,
          String(s.panelCount),
          s.coldVoc.toFixed(0),
          s.vmp.toFixed(0),
          cable ? cable.totalStringCableM.toFixed(0) : '—',
          s.isVoltageCompliant ? 'OK' : 'CHECK',
          '________ V',
          '[   ]'
        ]
      });
    }
  }
  rows.sort((a, b) => naturalCompare(a.sort, b.sort));
  if (rows.length === 0) {
    ctx.paragraph('No strings have been defined.', { style: 'italic', color: COLORS.muted });
    return;
  }
  drawTable(ctx, {
    columns: [
      { header: 'Tag', width: 1, bold: true },
      { header: 'String ID', width: 3 },
      { header: 'Array', width: 2.6 },
      { header: 'System', width: 2.6 },
      { header: 'Inverter MPPT', width: 2.2 },
      { header: 'Mods', width: 1, align: 'right' },
      { header: 'Voc cold V', width: 1.4, align: 'right' },
      { header: 'Vmp V', width: 1.2, align: 'right' },
      { header: 'Cable m', width: 1.2, align: 'right' },
      { header: 'Voltage', width: 1.3 },
      { header: 'Voc measured', width: 2 },
      { header: 'Done', width: 1.1, align: 'center' }
    ],
    rows: rows.map(r => r.cells),
    cellColor: (_r, c, v) => (c === 9 ? (v === 'OK' ? COLORS.green : COLORS.red) : undefined),
    fontSize: 6.6,
    rowH: 5.6
  });
}

/** Builds the installer stringing guide PDF. */
export function generateStringingGuidePdf(store: ProjectStore, opts: StringingGuideOptions = {}): jsPDF {
  const options = buildOptions(store, opts);
  const bundle = collectReportBundleData(store, options);
  const data = prepare(store, bundle);
  data.basemap = opts.basemap ?? null;
  const ctx = new ReportCtx(store, bundle, options, false, [], false);
  ctx.reportTitle = 'SOLAR GEO PLANNER — ARRAY STRINGING GUIDE (INSTALLER COPY)';

  const zones = bundle.targetZones;
  renderOverview(ctx, store, data, 2);
  zones.forEach((z, i) => renderArraySheet(ctx, store, data, z, i));
  renderSchedule(ctx, store, data);
  ctx.finalize();
  return ctx.doc;
}

function buildOptions(store: ProjectStore, opts: StringingGuideOptions): ReportExportOptions {
  const systemId = opts.systemId ?? 'all';
  return {
    projectTitle: opts.projectTitle || store.projectName || 'Solar Geo Project',
    clientName: opts.clientName ?? '',
    engineerName: opts.engineerName ?? '',
    companyName: opts.companyName ?? '',
    reportDate: opts.reportDate || new Date().toISOString().slice(0, 10),
    systemId,
    includeCadView: false,
    includeSpecs: false,
    includeSimulation: false,
    includeSld: false,
    includeBoq: false
  };
}

/**
 * Fetches satellite imagery for the guide's overview site plan (needs network access).
 * Resolves null when imagery is unavailable, in which case the guide is drawn on plain paper.
 */
export async function prefetchStringingBasemap(
  store: ProjectStore,
  opts: StringingGuideOptions = {}
): Promise<StringingBasemap | null> {
  try {
    const bundle = collectReportBundleData(store, buildOptions(store, opts));
    const origin = store.center;
    const pts = bundle.targetZones.flatMap(z => z.vertices.map(v => latLngToLocalMetric(v, origin)));
    if (pts.length === 0) return null;
    const b = boundsOf(pts);
    // Large enough that the clipped plan box is always filled whatever its aspect ratio.
    const sizeM = Math.max(b.maxX - b.minX, b.maxY - b.minY, 10) * 3 + 30;
    const centerX = (b.minX + b.maxX) / 2;
    const centerY = (b.minY + b.maxY) / 2;
    const px = 2048;
    const toMetric = (sx: number, sy: number) => ({
      x: centerX + (sx / px - 0.5) * sizeM,
      y: centerY - (sy / px - 0.5) * sizeM
    });
    const canvas = await renderSatelliteBasemapForView({
      width: px,
      height: px,
      scale: px / sizeM,
      lyrs: store.viewFilter?.basemap === 'google-satellite' ? 's' : 'y',
      toLatLng: (sx, sy) => localMetricToLatLng(toMetric(sx, sy), origin),
      toScreenPt: p => {
        const m = latLngToLocalMetric(p, origin);
        return { x: ((m.x - centerX) / sizeM + 0.5) * px, y: (0.5 - (m.y - centerY) / sizeM) * px };
      }
    });
    if (!canvas) return null;
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), centerX, centerY, sizeM };
  } catch {
    return null;
  }
}
