import { ReportCtx } from '../context';
import { ReportBundleData, ReportExportOptions } from '../../reportTypes';
import { renderSummary } from './summary';
import { renderSiteLayout, renderArraySchedule } from './layoutArrays';
import { renderComponents } from './components';
import { renderElectrical } from './electrical';
import { renderEnergy, renderLosses, renderLoadMatching } from './energy';
import { renderSld, renderBoq } from './sldBoq';
import { renderNotes } from './notes';

export interface SectionDef {
  id: string;
  title: string;
  blurb: string;
  landscape?: boolean;
  enabled: (o: ReportExportOptions, b: ReportBundleData) => boolean;
  render: (ctx: ReportCtx) => Promise<void> | void;
}

/** Sheets in report order. Each can be switched off through the export options. */
export const SECTIONS: SectionDef[] = [
  {
    id: 'summary',
    title: 'Project Summary',
    blurb: 'Key results, system parameters and design status at a glance',
    enabled: o => o.includeSummary !== false,
    render: renderSummary
  },
  {
    id: 'layout',
    title: 'Site Layout',
    blurb: 'CAD plan of the arrays, coordinates and sub-array overview',
    enabled: o => o.includeCadView,
    render: renderSiteLayout
  },
  {
    id: 'arrays',
    title: 'Schedule of PV Arrays',
    blurb: 'Every sub-array: mounting, modules, orientation and strings',
    enabled: o => o.includeArraySchedule !== false,
    render: renderArraySchedule
  },
  {
    id: 'components',
    title: 'Components & Design Checks',
    blurb: 'Module and inverter datasheets with stringing verification',
    enabled: o => o.includeSpecs,
    render: renderComponents
  },
  {
    id: 'electrical',
    title: 'Electrical Schedule',
    blurb: 'PEC cable and protection schedule, AC feeder and DC cable totals',
    enabled: o => o.includeElectrical !== false,
    render: renderElectrical
  },
  {
    id: 'energy',
    title: 'Energy Production',
    blurb: 'Monthly irradiation, energy, specific yield and performance ratio',
    enabled: o => o.includeSimulation,
    render: renderEnergy
  },
  {
    id: 'losses',
    title: 'Loss Diagram',
    blurb: 'Energy chain from ideal STC output to net AC energy',
    enabled: o => o.includeSimulation,
    render: renderLosses
  },
  {
    id: 'load',
    title: 'Load Matching & Savings',
    blurb: 'Solar vs facility load, self-sufficiency and bill savings',
    enabled: (o, b) => o.includeSimulation && !!b.simulationResult,
    render: renderLoadMatching
  },
  {
    id: 'sld',
    title: 'Single Line Diagram',
    blurb: 'Electrical schematic from strings to grid connection',
    landscape: true,
    enabled: o => o.includeSld,
    render: renderSld
  },
  {
    id: 'boq',
    title: 'Bill of Quantities & Cost',
    blurb: 'DUPA cost summary, totals with mark-ups, and itemised materials',
    enabled: o => o.includeBoq,
    render: renderBoq
  },
  {
    id: 'notes',
    title: 'Notes & Assumptions',
    blurb: 'Remarks, modelling assumptions, standards and disclaimer',
    enabled: o => o.includeCover !== false,
    render: renderNotes
  }
];
