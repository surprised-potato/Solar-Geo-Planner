import { COLORS, M, ReportCtx, num } from '../context';

/** Cover page: title block, project facts, headline results and site thumbnail. */
export async function renderCover(ctx: ReportCtx): Promise<void> {
  const { bundle, options } = ctx;
  const em = bundle.executiveMetrics;
  ctx.newPage(false, { sheet: 0, title: 'Cover', chrome: false });

  const doc = ctx.doc;
  ctx.fill(COLORS.navy);
  doc.rect(0, 0, 210, 82, 'F');
  ctx.fill(COLORS.amber);
  doc.rect(0, 82, 210, 2.2, 'F');

  ctx.t('PHOTOVOLTAIC SYSTEM', M + 2, 24, { style: 'bold', size: 9, color: COLORS.amber });
  const titleEnd = ctx.wrap(options.projectTitle || bundle.projectName, M + 2, 36, 186, { style: 'bold', size: 24, color: COLORS.white }, 10);
  ctx.t('Simulation & Engineering Report', M + 2, Math.max(titleEnd + 2, 58), {
    size: 12,
    color: [191, 219, 254]
  });
  ctx.t('Energy yield, loss analysis, electrical design and bill of quantities', M + 2, Math.max(titleEnd + 9, 65), {
    size: 8.5,
    color: [147, 197, 253]
  });

  // Project facts (two columns)
  const variant = options.systemId === 'all' ? 'Consolidated project (all systems)' : bundle.targetSystems[0]?.name ?? 'Selected system';
  const facts: [string, string][] = [
    ['Client', options.clientName || '—'],
    ['Prepared by', options.engineerName || '—'],
    ['Company', options.companyName || '—'],
    ['Report date', options.reportDate],
    ['Variant', variant],
    ['Location (WGS84)', `${em.centroid.lat.toFixed(5)}°, ${em.centroid.lng.toFixed(5)}°`]
  ];
  let y = 96;
  facts.forEach((f, i) => {
    const col = i % 2;
    const x = M + 2 + col * 96;
    if (col === 0 && i > 0) y += 11;
    ctx.t(f[0].toUpperCase(), x, y, { style: 'bold', size: 6.5, color: COLORS.muted });
    ctx.t(f[1], x, y + 5, { style: 'bold', size: 10, color: COLORS.ink, maxW: 90 });
  });
  y += 17;

  // Headline results
  ctx.y = y;
  ctx.kpiTiles([
    { label: 'DC capacity', value: `${num(em.totalDcKwp, 1)} kWp`, sub: `${num(em.totalPanels)} modules` },
    { label: 'AC capacity', value: `${num(em.totalAcKw, 1)} kW`, sub: `DC/AC ${em.dcAcRatio}` },
    { label: 'Annual energy', value: `${num(em.annualYieldMwh, 1)} MWh`, sub: `${num(em.specificYieldKwhPerKwp)} kWh/kWp` },
    { label: 'Performance ratio', value: `${em.performanceRatio}%`, sub: `CF ${em.capacityFactor}%` }
  ]);

  // Site thumbnail
  const imgY = ctx.y + 2;
  const imgH = Math.min(117, 280 - imgY);
  const imgW = imgH * (1400 / 880);
  await ctx.image(() => ctx.cadImage(), M + (186 - imgW) / 2, imgY, imgW, imgH, 'Site layout preview');
  ctx.t('Site layout — see Sheet 1 for the detailed plan', 105, imgY + imgH + 5, {
    style: 'italic',
    size: 7.5,
    color: COLORS.muted,
    align: 'center'
  });

  ctx.t('Confidential — prepared for the named client. Results are simulations, not guarantees.', 105, 289, {
    size: 6.8,
    color: COLORS.faint,
    align: 'center'
  });
}

/** Clickable table of contents plus a short "how to read this report" guide. */
export function renderContents(ctx: ReportCtx): void {
  ctx.newPage(false, { sheet: 0, title: 'Contents', chrome: true });
  ctx.t('Contents', M, 31, { style: 'bold', size: 16, color: COLORS.ink });
  ctx.t('Select a line to jump to that sheet.', M, 36.5, { size: 8.5, color: COLORS.slate });
  ctx.y = 44;

  const byId = new Map(ctx.priorToc.map(e => [e.id, e]));
  ctx.planned.forEach((sec, i) => {
    const rowH = 12;
    const y = ctx.y;
    const entry = byId.get(sec.id);
    ctx.fill(i % 2 === 0 ? COLORS.zebra : COLORS.white);
    ctx.doc.rect(M, y, ctx.contentW, rowH, 'F');
    ctx.fill(COLORS.navy);
    ctx.doc.roundedRect(M + 2, y + 2.2, 7.5, 7.5, 1, 1, 'F');
    ctx.t(String(i + 1), M + 5.75, y + 7.4, { style: 'bold', size: 8, color: COLORS.white, align: 'center' });
    ctx.t(sec.title, M + 13, y + 5.2, { style: 'bold', size: 9.5, color: COLORS.ink, maxW: 125 });
    ctx.t(sec.blurb, M + 13, y + 9.4, { size: 7, color: COLORS.muted, maxW: 140 });
    let pageLabel = '';
    if (entry) {
      pageLabel = entry.endPage > entry.startPage ? `pp. ${entry.startPage}–${entry.endPage}` : `p. ${entry.startPage}`;
      ctx.doc.link(M, y, ctx.contentW, rowH, { pageNumber: entry.startPage });
    }
    ctx.t(pageLabel, M + ctx.contentW - 3, y + 7, { style: 'bold', size: 9, color: COLORS.navy, align: 'right' });
    ctx.y += rowH;
  });

  ctx.y += 8;
  ctx.noteBox('How to read this report', [
    'Sheets are ordered from summary to detail: results first (Sheets 1–2), then design inputs, electrical design, energy analysis and costs.',
    'COMPLIANT / NON-COMPLIANT badges are computed from the project data (string voltages, currents, voltage drop) against the stated limit. N/A means the data needed for the check is not defined yet.',
    'Energy is net AC at the inverter output. PR (performance ratio) = E_grid / (kWp × plane-of-array irradiation).',
    'Loss percentages in the loss diagram are relative to the previous step of the energy chain.',
    'Currency is Philippine peso (PHP). Cost figures are estimates from the project BOQ (DUPA work items).'
  ]);
}
