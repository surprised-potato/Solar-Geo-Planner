import { COLORS, M, ReportCtx, num } from '../context';
import { drawTable } from '../table';

/** Site layout: CAD plan image, geographic parameters and a compact sub-array overview. */
export async function renderSiteLayout(ctx: ReportCtx): Promise<void> {
  const { bundle, options } = ctx;
  const em = bundle.executiveMetrics;
  ctx.beginSection('layout', 'Site Layout', {
    subtitle: `Client: ${options.clientName || '—'} • Designer: ${options.engineerName || '—'}`
  });

  ctx.kpiTiles([
    { label: 'System DC capacity', value: `${num(em.totalDcKwp, 1)} kWp`, sub: `${num(em.totalPanels)} modules` },
    { label: 'Inverter AC power', value: `${num(em.totalAcKw, 1)} kW`, sub: `DC/AC ${em.dcAcRatio}` },
    { label: 'Sub-arrays', value: String(bundle.zones.length), sub: 'Layout allocations' },
    { label: 'Solar footprint', value: `${num(em.totalAreaSqM)} m²`, sub: 'Gross array area' }
  ]);

  const w = ctx.contentW;
  const h = 98;
  ctx.ensureSpace(h + 6);
  const y = ctx.y;
  await ctx.image(async () => ({ uri: (await ctx.cadImage()) ?? '', aspect: 1400 / 880 }), M, y, w, h, 'CAD layout preview');
  ctx.y += h + 6;

  ctx.subheading('Sub-array overview');
  drawTable(ctx, {
    columns: [
      { header: 'Sub-array', width: 4, bold: true, color: COLORS.navy },
      { header: 'System', width: 3 },
      { header: 'Mount', width: 2.6 },
      { header: 'Modules', width: 1.8, align: 'right' },
      { header: 'kWp', width: 1.8, align: 'right', bold: true },
      { header: 'Tilt / Azimuth', width: 2.6 }
    ],
    rows: bundle.zones.map(z => [
      z.name,
      z.systemName,
      z.mountType === 'ground' ? 'Ground rack' : 'Rooftop',
      num(z.moduleCount),
      z.totalKwp.toFixed(2),
      `${z.tiltDeg}° / ${z.azimuthDeg}°`
    ]),
    totals: ['TOTAL', '', '', num(em.totalPanels), em.totalDcKwp.toFixed(2), ''],
    fontSize: 7
  });

  ctx.noteBox('Geographic coordinates & remarks', [
    `Centre coordinates: ${em.centroid.lat.toFixed(5)}°, ${em.centroid.lng.toFixed(5)}° (WGS84).`,
    options.notes ? `Site remarks: ${options.notes}` : 'Shading is evaluated with an isotropic sky model; no far-horizon profile is applied.'
  ]);
}

/** Full schedule of PV arrays (all zones, paginated). */
export function renderArraySchedule(ctx: ReportCtx): void {
  const { bundle } = ctx;
  const em = bundle.executiveMetrics;
  ctx.beginSection('arrays', 'Schedule of PV Arrays', {
    subtitle: 'Every sub-array with its racking, module allocation, orientation and stringing.'
  });

  drawTable(ctx, {
    columns: [
      { header: 'Sub-array', width: 3.2, bold: true, color: COLORS.navy },
      { header: 'Mount', width: 2.3 },
      { header: 'PV module', width: 3.4 },
      { header: 'Modules', width: 1.6, align: 'right' },
      { header: 'kWp', width: 1.5, align: 'right', bold: true },
      { header: 'Tilt / Az', width: 2 },
      { header: 'Pitch', width: 1.5, align: 'right' },
      { header: 'Strings', width: 2.4 }
    ],
    rows: bundle.zones.map(z => [
      z.name,
      z.mountType === 'ground' ? 'Ground rack' : 'Rooftop',
      z.moduleModelName,
      num(z.moduleCount),
      z.totalKwp.toFixed(2),
      `${z.tiltDeg}° / ${z.azimuthDeg}°`,
      `${z.pitchM.toFixed(2)} m`,
      z.stringCount ? `${z.stringCount} × ${z.modulesPerString}` : 'Auto'
    ]),
    totals: [`TOTAL (${bundle.zones.length})`, '', '', num(em.totalPanels), em.totalDcKwp.toFixed(2), '', '', ''],
    fontSize: 6.8,
    rowH: 5.2
  });

  ctx.noteBox('Mounting & racking notes', [
    'Rooftop: structural aluminium rails, stainless-steel hardware, mid/end clamps and L-feet with waterproof flashings.',
    'Ground mount: galvanised steel or anodised aluminium racks on driven-pile foundations.',
    'Structural design (wind and seismic loads) is to be confirmed by the structural engineer of record; NSCP 2015 applies in the Philippines.',
    'DC wiring is routed in UV-resistant raceway with a continuous equipment grounding conductor per PEC 2017 Article 6.90.'
  ]);
}
