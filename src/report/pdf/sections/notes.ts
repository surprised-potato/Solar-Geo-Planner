import { COLORS, ReportCtx } from '../context';

/** Closing sheet: remarks, assumptions, data sources and disclaimer. */
export function renderNotes(ctx: ReportCtx): void {
  const { bundle, options } = ctx;
  ctx.beginSection('notes', 'Notes & Assumptions', {
    subtitle: 'Remarks entered for this report, modelling assumptions, data sources and limitations.'
  });

  ctx.subheading('Project remarks');
  ctx.paragraph(options.notes?.trim() ? options.notes.trim() : 'No remarks were entered for this report.', {
    size: 8.5,
    style: options.notes?.trim() ? 'normal' : 'italic',
    color: options.notes?.trim() ? COLORS.body : COLORS.muted
  });

  ctx.noteBox('Modelling assumptions', [
    `Solar resource: ${bundle.solarYield.dataSourceName || 'climatology'} (monthly GHI and ambient temperature), transposed to the plane of array.`,
    'Losses modelled: POA transposition, soiling, LID, mismatch, thermal, DC cabling, inverter efficiency, clipping, AC wiring and availability.',
    'Shading uses an isotropic sky model; no far-horizon or detailed near-shading scene is applied.',
    'Yield is a long-term average (P50-style) estimate; inter-annual variability is not included.'
  ]);

  ctx.noteBox('Standards referenced', [
    'Philippine Electrical Code (PEC) 2017, Part 1, Article 6.90 (solar PV systems) and Article 7.05 (interconnected sources).',
    'NEC 2020 / NFPA 70: 125% continuous-duty ampacity and 120% busbar rule.',
    'IEC 62109 and UL 1699B for inverter safety, rapid shutdown and arc-fault protection; IEC 62930 for PV cable.',
    'NSCP 2015 for structural loads on mounting systems.'
  ]);

  ctx.noteBox('Disclaimer', [
    'This report is generated from the project model for feasibility and preliminary engineering. It does not replace a stamped design.',
    'Verify equipment limits, conductor sizing and structural capacity with the manufacturer datasheets and the engineers of record before construction or procurement.'
  ]);

  ctx.subheading('Report details');
  ctx.paragraph(
    `Project: ${bundle.projectName}   |   Client: ${options.clientName || '—'}   |   Prepared by: ${options.engineerName || '—'}   |   Date: ${options.reportDate}`,
    { size: 7.5, color: COLORS.slate }
  );
}
