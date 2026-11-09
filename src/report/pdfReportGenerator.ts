import { jsPDF } from 'jspdf';
import { ProjectStore } from '../store/projectStore';
import {
  ReportExportOptions,
  ReportBundleData,
  ReportExecutiveMetrics,
  ReportZoneSummary,
  ReportElectricalBOS,
  ReportSystemData
} from './reportTypes';
import { simulateSolarAndLoadMatching } from '../geo/energySimulation';
import { buildSldSystemModel, buildSldScheduleTableRows } from '../ui/sldView';
import { ReportCtx, TocEntry } from './pdf/context';
import { renderCover, renderContents } from './pdf/sections/cover';
import { SECTIONS } from './pdf/sections';
import { sizePecAcFeeder, sizePecDcStringWire } from '../geo/pecWireSizing';
import { ZNSHINE_600W_BIFACIAL, GENERIC_INVERTER_PRESETS } from '../types/solar';

/**
 * Gathers and harmonizes all project data required for the engineering report.
 */
export function collectReportBundleData(
  store: ProjectStore,
  options: ReportExportOptions
): ReportBundleData {
  const systemId = options.systemId ?? 'all';
  const allSystems = store.getSystems();
  const targetSystems = systemId === 'all'
    ? allSystems
    : allSystems.filter(s => s.id === systemId);

  const allZones = store.getZones();
  const targetZones = systemId === 'all'
    ? allZones
    : allZones.filter(z => z.systemId === systemId);

  // Solar Yield calculation
  const solarYield = store.getSolarYieldEstimate(systemId === 'all' ? undefined : systemId);

  // Load Matching simulation (if facility load profile exists)
  let simulationResult = null;
  if (store.loadProfile) {
    simulationResult = simulateSolarAndLoadMatching(solarYield, store.loadProfile);
  }

  // Executive Metrics
  let totalDcKwp = 0;
  let totalAcKw = 0;
  let totalPanels = 0;
  let totalAreaSqM = 0;

  for (const z of targetZones) {
    totalDcKwp += z.totalKwp ?? 0;
    totalPanels += z.activePanelCount ?? z.panelCount ?? 0;
    totalAreaSqM += z.areaSqM ?? 0;
  }
  for (const s of targetSystems) {
    totalAcKw += (s.inverter.ratedAcPowerKw * (s.inverter.inverterCount || 1));
  }

  const dcAcRatio = totalAcKw > 0 ? totalDcKwp / totalAcKw : 1.0;

  const executiveMetrics: ReportExecutiveMetrics = {
    totalDcKwp: Number(totalDcKwp.toFixed(2)),
    totalAcKw: Number(totalAcKw.toFixed(1)),
    dcAcRatio: Number(dcAcRatio.toFixed(2)),
    totalPanels,
    totalInverters: targetSystems.reduce((sum, s) => sum + (s.inverter.inverterCount || 1), 0),
    totalAreaSqM: Math.round(totalAreaSqM),
    annualYieldMwh: Number((solarYield.annualYieldKwh / 1000).toFixed(1)),
    specificYieldKwhPerKwp: Number(solarYield.specificYieldKwhPerKwp.toFixed(1)),
    performanceRatio: Number(solarYield.performanceRatio.toFixed(1)),
    capacityFactor: Number(solarYield.capacityFactor.toFixed(1)),
    annualGhiKwhPerM2: Number(solarYield.annualGhiKwhPerM2.toFixed(1)),
    annualPoaKwhPerM2: Number(solarYield.annualPoaKwhPerM2.toFixed(1)),
    centroid: store.center
  };

  // Subarray Zone Summaries
  const zones: ReportZoneSummary[] = targetZones.map(z => {
    const parentSys = store.getSystem(z.systemId);
    const mod = store.getModule(z.moduleId) || ZNSHINE_600W_BIFACIAL;
    const zonePanels = store.getPanelsForZone(z.id);
    const activePanels = zonePanels.filter(p => p.active);
    const assignedStrings = Array.from(new Set(activePanels.filter(p => p.stringId).map(p => p.stringId!)));
    const modsPerStr = assignedStrings.length > 0
      ? Math.round(activePanels.filter(p => p.stringId).length / assignedStrings.length)
      : 0;

    return {
      id: z.id,
      systemId: z.systemId,
      name: z.name || 'Array Zone',
      systemName: parentSys?.name || 'Solar System',
      mountType: z.config.mountType,
      moduleModelName: mod.name,
      moduleCount: z.activePanelCount ?? z.panelCount ?? activePanels.length,
      totalKwp: Number((z.totalKwp ?? 0).toFixed(2)),
      tiltDeg: z.config.tiltDeg ?? 15,
      azimuthDeg: z.config.azimuthDeg ?? 180,
      pitchM: z.config.rowSpacingM ?? 2.5,
      areaSqM: Math.round(z.areaSqM ?? 0),
      orientation: z.config.orientation || 'portrait',
      setbackM: z.config.setbackM ?? 0.5,
      stringCount: assignedStrings.length,
      modulesPerString: modsPerStr,
      stringIds: assignedStrings,
      railCount: z.rails?.length ?? 0,
      tableCount: z.tables?.length ?? 0
    };
  });

  // Primary Module & Inverter Models
  const firstZone = targetZones[0];
  const primaryModule = firstZone ? (store.getModule(firstZone.moduleId) || ZNSHINE_600W_BIFACIAL) : ZNSHINE_600W_BIFACIAL;
  const firstSystem = targetSystems[0];
  const primaryInverter = firstSystem ? firstSystem.inverter : GENERIC_INVERTER_PRESETS[0];

  // Per-system electrical data (SLD model, PEC schedule, feeder and cable summaries)
  const systems: ReportSystemData[] = targetSystems.map(sys => {
    const sysZone = targetZones.find(z => z.systemId === sys.id);
    const sysModule = sysZone ? (store.getModule(sysZone.moduleId) || ZNSHINE_600W_BIFACIAL) : ZNSHINE_600W_BIFACIAL;
    const sldModel = buildSldSystemModel(store, sys.id);
    return {
      system: sys,
      module: sysModule,
      zones: zones.filter(zs => zs.systemId === sys.id),
      sldModel,
      scheduleRows: buildSldScheduleTableRows(sldModel),
      acFeeder: sldModel.acFeederSummary,
      cables: store.getSystemCableSummary(sys.id)
    };
  });

  // Electrical BOS & Wire Sizing
  const dcWire = sizePecDcStringWire(primaryModule.isc);
  const acPhase = primaryInverter.phase === 'single_phase' ? 'single_phase' : 'three_phase';
  const acFeeder = sizePecAcFeeder(
    primaryInverter.ratedAcPowerKw,
    acPhase,
    primaryInverter.acVoltage || 400,
    'ac_inverter'
  );

  const electricalBos: ReportElectricalBOS = {
    dcConductor: dcWire.fullCallout || `${dcWire.cableMm2} mm² PV1-F (1500V DC)`,
    dcConduit: dcWire.conduitLabel || '25 mmø PVC/EMT',
    acFeederConductor: acFeeder.compactCallout || `${acFeeder.phaseConductorLabel} Copper THHN`,
    acFeederConduit: acFeeder.conduitLabel || `${acFeeder.conduitTradeSizeMm} mmø Conduit`,
    inverterBreakerA: acFeeder.ocpdRatingA,
    mainBreakerA: Math.round(acFeeder.ocpdRatingA * 1.25),
    systemVoltageV: primaryInverter.acVoltage || 400,
    phase: primaryInverter.phase === 'single_phase' ? '1-Phase (1Φ 2-Wire)' : '3-Phase (3Φ 4-Wire)',
    interconnectionType: firstSystem?.mdpTapType === 'line_side' ? 'Line-Side Supply Tap' : 'Load-Side Backfed Breaker',
    hasTransformer: !!systems[0]?.sldModel.transformerDesign?.required,
    transformerKva: systems[0]?.sldModel.transformerDesign?.required ? systems[0].sldModel.transformerDesign.transformerKva : undefined
  };

  let sldScheduleRows = systems[0]?.scheduleRows;
  if (!sldScheduleRows) {
    const fallbackId = store.getSelectedSystem()?.id || store.getSystems()[0]?.id || '';
    sldScheduleRows = buildSldScheduleTableRows(buildSldSystemModel(store, fallbackId));
  }

  return {
    options,
    projectName: store.projectName || 'Solar Geo Project',
    createdAt: new Date().toISOString(),
    executiveMetrics,
    zones,
    primaryModule,
    primaryInverter,
    electricalBos,
    sldScheduleRows,
    solarYield,
    simulationResult,
    targetSystems,
    targetZones,
    systems
  };
}

/** Sections that will be rendered for these options, in order. */
export function plannedSections(options: ReportExportOptions, bundle: ReportBundleData) {
  return SECTIONS.filter(s => s.enabled(options, bundle));
}

async function renderPass(
  store: ProjectStore,
  bundle: ReportBundleData,
  options: ReportExportOptions,
  dry: boolean,
  priorToc: TocEntry[]
): Promise<ReportCtx> {
  const sections = plannedSections(options, bundle);
  const withCover = options.includeCover !== false;
  // Only start in landscape when the very first page is a landscape sheet.
  const startLandscape = !withCover && sections.length > 0 && !!sections[0].landscape;
  const ctx = new ReportCtx(store, bundle, options, dry, priorToc, startLandscape);
  ctx.planned = sections.map(s => ({ id: s.id, title: s.title, blurb: s.blurb }));

  if (withCover) {
    await renderCover(ctx);
    renderContents(ctx);
  }
  for (const s of sections) {
    await s.render(ctx);
  }
  if (ctx.pages.length === 0) {
    // Nothing selected: still produce a valid one-page document.
    ctx.newPage(false, { sheet: 0, title: 'Report', chrome: true });
    ctx.t('No report sections were selected.', 12, 40, { size: 10, color: [100, 116, 139] });
  }
  ctx.finalize();
  return ctx;
}

export interface ReportPlan {
  totalPages: number;
  toc: TocEntry[];
}

/**
 * Lays the report out without rasterizing images, returning the page count and the
 * table of contents. Cheap enough to call when the export options change.
 */
export async function planReport(store: ProjectStore, options: ReportExportOptions): Promise<ReportPlan> {
  const bundle = collectReportBundleData(store, options);
  const ctx = await renderPass(store, bundle, options, true, []);
  return { totalPages: ctx.pages.length, toc: ctx.toc };
}

/**
 * Generates the full PVsyst-style engineering PDF report. Two passes: a dry layout pass
 * to learn each sheet's page numbers (for the clickable contents), then the real render.
 */
export async function generatePvsystPdf(store: ProjectStore, options: ReportExportOptions): Promise<jsPDF> {
  const bundle = collectReportBundleData(store, options);
  const layout = await renderPass(store, bundle, options, true, []);
  const real = await renderPass(store, bundle, options, false, layout.toc);
  return real.doc;
}
