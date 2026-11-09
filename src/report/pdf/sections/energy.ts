import { COLORS, M, ReportCtx, num, pct } from '../context';
import { drawTable } from '../table';
import { computeMonthlyPerformance } from '../metrics';
import {
  buildPvsystLossSteps,
  renderDiurnalCurveSvg,
  renderLossWaterfallSvg,
  renderMonthlyYieldChartSvg,
  svgToPngDataUri
} from '../../chartRenderer';

/** Monthly energy production: chart + balances and main results table. */
export async function renderEnergy(ctx: ReportCtx): Promise<void> {
  const sy = ctx.bundle.solarYield;
  const perf = computeMonthlyPerformance(sy);
  ctx.beginSection('energy', 'Energy Production', {
    subtitle: 'Monthly solar resource, array and grid energy, specific yield and performance ratio.'
  });

  if (sy.monthlyBreakdown.length === 0) {
    ctx.paragraph('No energy simulation is available: add at least one PV array to the project.', {
      style: 'italic',
      color: COLORS.muted
    });
    return;
  }

  const w = ctx.contentW;
  const h = w * (240 / 880);
  const y = ctx.y;
  await ctx.image(
    async () => svgToPngDataUri(renderMonthlyYieldChartSvg(sy.monthlyBreakdown, 880, 240), 880, 240),
    M,
    y,
    w,
    h,
    'Monthly yield chart'
  );
  ctx.y += h + 5;

  ctx.subheading('Balances and main results');
  const r = (n: number, d = 1): string => num(n, d);
  drawTable(ctx, {
    columns: [
      { header: 'Month', width: 1.6, bold: true },
      { header: 'GHI kWh/m²', width: 1.7, align: 'right' },
      { header: 'POA kWh/m²', width: 1.7, align: 'right' },
      { header: 'T amb °C', width: 1.4, align: 'right' },
      { header: 'T cell °C', width: 1.4, align: 'right' },
      { header: 'E_Array MWh', width: 1.8, align: 'right' },
      { header: 'E_Grid MWh', width: 1.8, align: 'right', bold: true },
      { header: 'Yield kWh/kWp', width: 1.9, align: 'right' },
      { header: 'PR %', width: 1.3, align: 'right', bold: true }
    ],
    rows: perf.rows.map(x => [
      x.monthName,
      r(x.ghiKwhM2),
      r(x.poaKwhM2),
      r(x.tAmbC),
      r(x.tCellC),
      r(x.eArrayMwh),
      r(x.eGridMwh),
      r(x.specificYieldKwhKwp, 0),
      r(x.prPercent)
    ]),
    totals: [
      'Year',
      r(perf.total.ghiKwhM2, 0),
      r(perf.total.poaKwhM2, 0),
      r(perf.total.tAmbC),
      r(perf.total.tCellC),
      r(perf.total.eArrayMwh),
      r(perf.total.eGridMwh),
      r(perf.total.specificYieldKwhKwp, 0),
      r(perf.total.prPercent)
    ],
    fontSize: 7,
    rowH: 5.4
  });

  ctx.noteBox('Definitions', [
    'GHI = global horizontal irradiation; POA = plane-of-array irradiation on the tilted modules.',
    'E_Array = effective DC energy at the array output; E_Grid = net AC energy injected.',
    'PR = E_Grid / (kWp × POA). Monthly PR is derived from the same nameplate basis as the annual value.',
    `Resource data: ${sy.dataSourceName || 'climatology'}.`
  ]);
}

/** Loss diagram + tabular breakdown of each loss step. */
export async function renderLosses(ctx: ReportCtx): Promise<void> {
  const sy = ctx.bundle.solarYield;
  ctx.beginSection('losses', 'Loss Diagram', {
    subtitle: 'Energy chain from ideal STC energy to net AC output; each step shows its gain or loss.'
  });

  const w = ctx.contentW;
  const h = w * (420 / 880);
  const y = ctx.y;
  await ctx.image(
    async () => svgToPngDataUri(renderLossWaterfallSvg(sy.lossCascade, 880, 420), 880, 420),
    M,
    y,
    w,
    h,
    'Loss diagram'
  );
  ctx.y += h + 5;

  ctx.subheading('Loss breakdown');
  const steps = buildPvsystLossSteps(sy.lossCascade);
  drawTable(ctx, {
    columns: [
      { header: 'Step', width: 6 },
      { header: 'Change', width: 1.8, align: 'right', bold: true },
      { header: 'Energy chain (% of STC)', width: 2.6, align: 'right' }
    ],
    rows: steps.map(s => [
      s.label,
      s.type === 'base' || s.type === 'result' ? '—' : `${s.stepDeltaPercent > 0 ? '+' : ''}${s.stepDeltaPercent.toFixed(1)} %`,
      `${s.nominalPercent.toFixed(1)} %`
    ]),
    cellColor: (_r, c, v) => (c === 1 ? (v.startsWith('+') ? COLORS.green : v.startsWith('-') ? COLORS.red : undefined) : undefined),
    fontSize: 7.2,
    rowH: 5.4
  });
  ctx.paragraph(
    `Overall: ${sy.lossCascade.totalLossPercent}% total system loss, performance ratio ${sy.performanceRatio}%.`,
    { style: 'bold', size: 8, color: COLORS.navy }
  );
}

/** Solar / facility load matching (only when a load profile exists). */
export async function renderLoadMatching(ctx: ReportCtx): Promise<void> {
  const sim = ctx.bundle.simulationResult;
  ctx.beginSection('load', 'Load Matching & Savings', {
    subtitle: 'How the solar output covers the facility load, and the resulting electricity-bill savings.'
  });
  if (!sim) {
    ctx.paragraph('No facility load profile is defined.', { style: 'italic', color: COLORS.muted });
    return;
  }

  ctx.kpiTiles([
    { label: 'Solar generation', value: `${num(sim.annualSolarKwh / 1000, 1)} MWh`, sub: 'per year' },
    { label: 'Facility load', value: `${num(sim.annualLoadKwh / 1000, 1)} MWh`, sub: 'per year' },
    { label: 'Self-sufficiency', value: `${pct(sim.annualSelfSufficiencyPercent)} %`, sub: 'Load covered by solar' },
    { label: 'Annual savings', value: `${num(sim.annualSavingsPhp)}`, sub: `PHP (${pct(sim.billReductionPercent)}% bill cut)` }
  ]);

  const w = ctx.contentW;
  const h = w * (260 / 880);
  ctx.ensureSpace(h + 4);
  const y = ctx.y;
  await ctx.image(
    async () => svgToPngDataUri(renderDiurnalCurveSvg(sim.diurnalCurve, 880, 260), 880, 260),
    M,
    y,
    w,
    h,
    'Average-day profile'
  );
  ctx.y += h + 5;

  ctx.kvCardsRow(
    {
      title: 'Energy balance (annual)',
      rows: [
        ['Self-consumed', `${num(sim.annualSelfConsumedKwh / 1000, 1)} MWh (${pct(sim.annualSelfConsumptionPercent)}% of solar)`],
        ['Exported to grid', `${num(sim.annualExportedKwh / 1000, 1)} MWh (${pct(sim.annualExportPercent)}%)`],
        ['Imported from grid', `${num(sim.annualImportedKwh / 1000, 1)} MWh (${pct(sim.annualImportPercent)}%)`],
        ['Renewable share', `${pct(sim.annualReSharePercent)} %`]
      ]
    },
    {
      title: 'Net billing',
      rows: [
        ['Bill without solar', `PHP ${num(sim.originalBillPhp)}`],
        ['Bill with solar', `PHP ${num(sim.newBillPhp)}`],
        ['Annual savings', `PHP ${num(sim.annualSavingsPhp)}`],
        ['Bill reduction', `${pct(sim.billReductionPercent)} %`]
      ]
    }
  );

  ctx.subheading('Monthly balance');
  drawTable(ctx, {
    columns: [
      { header: 'Month', width: 1.6, bold: true },
      { header: 'Solar MWh', width: 1.7, align: 'right' },
      { header: 'Load MWh', width: 1.7, align: 'right' },
      { header: 'Self-used MWh', width: 2, align: 'right' },
      { header: 'Export MWh', width: 1.8, align: 'right' },
      { header: 'Import MWh', width: 1.8, align: 'right' },
      { header: 'Self-suff. %', width: 1.8, align: 'right', bold: true }
    ],
    rows: sim.monthlyRecords.map(m => [
      m.monthName,
      num(m.solarGenerationKwh / 1000, 1),
      num(m.facilityLoadKwh / 1000, 1),
      num(m.selfConsumedKwh / 1000, 1),
      num(m.exportedKwh / 1000, 1),
      num(m.importedKwh / 1000, 1),
      pct(m.selfSufficiencyPercent).toFixed(1)
    ]),
    fontSize: 7,
    rowH: 5.2
  });
}
