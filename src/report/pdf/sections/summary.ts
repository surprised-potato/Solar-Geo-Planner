import { COLORS, M, ReportCtx, num, pct } from '../context';
import { drawTable } from '../table';
import { buildDesignChecks, computeMonthlyPerformance, overallStatus } from '../metrics';
import { renderMonthlyYieldChartSvg, svgToPngDataUri } from '../../chartRenderer';

/** PVsyst page-1 style summary: system info, main results, design status. */
export async function renderSummary(ctx: ReportCtx): Promise<void> {
  const { bundle, options } = ctx;
  const em = bundle.executiveMetrics;
  const sy = bundle.solarYield;
  const perf = computeMonthlyPerformance(sy);
  ctx.beginSection('summary', 'Project Summary', {
    subtitle: 'Key system parameters, main simulation results and design status at a glance.'
  });

  ctx.kpiTiles([
    { label: 'Produced energy', value: `${num(em.annualYieldMwh, 1)} MWh/yr`, sub: 'Net AC at inverter output' },
    { label: 'Specific production', value: `${num(em.specificYieldKwhPerKwp)}`, sub: 'kWh / kWp / year' },
    { label: 'Performance ratio', value: `${em.performanceRatio} %`, sub: 'Annual PR' },
    { label: 'Capacity factor', value: `${em.capacityFactor} %`, sub: 'Net energy / (kWp × 8760 h)' }
  ]);

  // Specs come from every system in scope, not just the first one.
  const moduleNames = Array.from(new Set(bundle.systems.map(sys => sys.module.name)));
  const invGroups = new Map<string, number>();
  for (const sys of bundle.systems) {
    const inv = sys.system.inverter;
    const key = `${inv.ratedAcPowerKw} kW`;
    invGroups.set(key, (invGroups.get(key) ?? 0) + (inv.inverterCount || 1));
  }
  const moduleLabel = moduleNames.length === 1 ? moduleNames[0] : moduleNames.length ? `${moduleNames.length} models (see below)` : '\u2014';
  const inverterLabel = invGroups.size
    ? Array.from(invGroups.entries()).map(([kw, n]) => `${n} \u00d7 ${kw}`).join(' + ')
    : '\u2014';
  const variant = options.systemId === 'all' ? `All systems (${bundle.targetSystems.length})` : bundle.targetSystems[0]?.name ?? '—';
  ctx.kvCardsRow(
    {
      title: 'Project & site',
      rows: [
        ['Project', bundle.projectName],
        ['Variant', variant],
        ['Latitude', `${em.centroid.lat.toFixed(4)}°`],
        ['Longitude', `${em.centroid.lng.toFixed(4)}°`],
        ['Meteo data source', sy.dataSourceName || '—'],
        ['Annual GHI', `${num(em.annualGhiKwhPerM2)} kWh/m²`],
        ['Annual POA irradiation', `${num(em.annualPoaKwhPerM2)} kWh/m²`]
      ]
    },
    {
      title: 'System information',
      rows: [
        ['PV array nominal power (DC)', `${num(em.totalDcKwp, 1)} kWp`],
        ['Number of PV modules', num(em.totalPanels)],
        ['PV module', moduleLabel],
        ['Inverters', inverterLabel],
        ['Inverter AC power (total)', `${num(em.totalAcKw, 1)} kW`],
        ['DC / AC ratio', String(em.dcAcRatio)],
        ['Sub-arrays / footprint', `${bundle.zones.length} / ${num(em.totalAreaSqM)} m²`]
      ]
    }
  );

  if (bundle.systems.length > 0) {
    ctx.subheading('Systems in this report');
    drawTable(ctx, {
      columns: [
        { header: 'System', width: 3.4, bold: true, color: COLORS.navy },
        { header: 'Sub-arrays', width: 1.4, align: 'right' },
        { header: 'Modules', width: 1.4, align: 'right' },
        { header: 'DC kWp', width: 1.5, align: 'right', bold: true },
        { header: 'PV module', width: 3.2 },
        { header: 'Inverter(s)', width: 3.4 },
        { header: 'DC/AC', width: 1.2, align: 'right' }
      ],
      rows: bundle.systems.map(sys => {
        const inv = sys.system.inverter;
        return [
          sys.system.name,
          String(sys.zones.length),
          num(sys.zones.reduce((a, z) => a + z.moduleCount, 0)),
          sys.zones.reduce((a, z) => a + z.totalKwp, 0).toFixed(1),
          sys.module.name,
          `${inv.inverterCount || 1} \u00d7 ${inv.ratedAcPowerKw} kW ${inv.modelName}`,
          sys.sldModel.overallDcAcRatio.toFixed(2)
        ];
      }),
      fontSize: 6.8
    });
  }

  ctx.subheading('Main simulation results');
  const eArray = perf.total.eArrayMwh;
  drawTable(ctx, {
    columns: [
      { header: 'Quantity', width: 5 },
      { header: 'Value', width: 2, align: 'right', bold: true },
      { header: 'Unit', width: 2 },
      { header: 'Meaning', width: 7 }
    ],
    rows: [
      ['Global horizontal irradiation (GHI)', num(perf.total.ghiKwhM2), 'kWh/m²/yr', 'Sunlight on a flat horizontal surface'],
      ['Plane-of-array irradiation (POA)', num(perf.total.poaKwhM2), 'kWh/m²/yr', 'Sunlight on the tilted module plane'],
      ['E_Array — effective DC energy', num(eArray, 1), 'MWh/yr', 'DC energy before inverter and AC losses'],
      ['E_Grid — energy injected', num(em.annualYieldMwh, 1), 'MWh/yr', 'Net AC energy delivered'],
      ['Specific production', num(em.specificYieldKwhPerKwp), 'kWh/kWp/yr', 'E_Grid per installed kWp'],
      ['Performance ratio (PR)', `${em.performanceRatio}`, '%', 'E_Grid / (kWp × POA irradiation)'],
      ['Total system losses', `${sy.lossCascade.totalLossPercent}`, '%', 'Relative to ideal STC energy on POA']
    ],
    fontSize: 7.2
  });

  // Design status
  ctx.subheading('Design status');
  const statusRows: string[][] = [];
  const statuses: string[] = [];
  for (const s of bundle.systems) {
    const checks = buildDesignChecks(s.sldModel, s.system.inverter, s.module);
    const st = overallStatus(checks);
    const failed = checks.filter(c => c.status === 'FAIL').map(c => c.parameter);
    statusRows.push([
      s.system.name,
      `${s.sldModel.strings.length} strings • ${s.sldModel.inverters.length} inverter(s)`,
      failed.length ? failed.join('; ') : st === 'N/A' ? 'No stringing defined' : 'All checks passed',
      st === 'PASS' ? 'COMPLIANT' : st === 'FAIL' ? 'NON-COMPLIANT' : 'N/A'
    ]);
    statuses.push(st);
  }
  if (statusRows.length) {
    drawTable(ctx, {
      columns: [
        { header: 'System', width: 3, bold: true },
        { header: 'Stringing', width: 3 },
        { header: 'Findings', width: 5 },
        { header: 'Status', width: 2.4, bold: true }
      ],
      rows: statusRows,
      cellColor: (_r, c, v) =>
        c === 3 ? (v === 'COMPLIANT' ? COLORS.green : v === 'NON-COMPLIANT' ? COLORS.red : COLORS.muted) : undefined,
      fontSize: 7
    });
  } else {
    ctx.paragraph('No solar systems defined for this report.', { style: 'italic', color: COLORS.muted });
  }

  // Load matching teaser
  if (bundle.simulationResult) {
    const sim = bundle.simulationResult;
    ctx.subheading('Facility load matching');
    ctx.kpiTiles([
      { label: 'Renewable share', value: `${pct(sim.annualReSharePercent)} %`, sub: 'Solar / facility load' },
      { label: 'Self-sufficiency', value: `${pct(sim.annualSelfSufficiencyPercent)} %`, sub: 'Load covered on site' },
      { label: 'Self-consumption', value: `${pct(sim.annualSelfConsumptionPercent)} %`, sub: 'Solar used on site' },
      { label: 'Bill savings', value: `${num(sim.annualSavingsPhp)}`, sub: `PHP/yr (${pct(sim.billReductionPercent)}% lower)` }
    ]);
  }

  // Monthly chart fills the remaining room if it fits
  if (sy.monthlyBreakdown.length === 12) {
    const w = ctx.contentW;
    const h = w * (200 / 880);
    ctx.ensureSpace(h + 4);
    const y = ctx.y;
    await ctx.image(
      async () => svgToPngDataUri(renderMonthlyYieldChartSvg(sy.monthlyBreakdown, 880, 200), 880, 200),
      M,
      y,
      w,
      h,
      'Monthly energy chart'
    );
    ctx.y += h + 4;
  }
}
