import { COLORS, M, ReportCtx, num } from '../context';
import { drawTable } from '../table';
import { AC_VOLTAGE_DROP_LIMIT_PERCENT } from '../metrics';

/** PEC cable/OCPD schedule, AC feeder and DC cable summaries for every system. */
export function renderElectrical(ctx: ReportCtx): void {
  const { bundle } = ctx;
  ctx.beginSection('electrical', 'Electrical Schedule', {
    subtitle: 'Conductor, overcurrent protection and raceway schedule (PEC 2017) with feeder and cable-length summaries.'
  });

  if (bundle.systems.length === 0) {
    ctx.paragraph('No solar systems defined.', { style: 'italic', color: COLORS.muted });
    return;
  }

  bundle.systems.forEach((s, idx) => {
    if (bundle.systems.length > 1) {
      ctx.ensureSpace(30);
      ctx.t(`System ${idx + 1}: ${s.system.name}`, M, ctx.y + 4, { style: 'bold', size: 10.5, color: COLORS.navy });
      ctx.y += 8;
    }

    ctx.subheading('Cable & protection schedule');
    drawTable(ctx, {
      columns: [
        { header: 'Tag', width: 2.4, bold: true, color: COLORS.navy },
        { header: 'Route', width: 3.8 },
        { header: 'Volts / phase', width: 2.2 },
        { header: 'Rated / design A', width: 2.6 },
        { header: 'OCPD', width: 3 },
        { header: 'Conductors', width: 3.2 },
        { header: 'Raceway / EGC', width: 3.4 }
      ],
      rows: s.scheduleRows.map(r => [
        r.tag,
        r.route,
        r.voltsPhase,
        r.ratedDesignCurrent,
        r.ocpd,
        r.conductors,
        `${r.conduit} (${r.egc})`
      ]),
      fontSize: 5.8,
      rowH: 6
    });

    const ac = s.acFeeder;
    const tx = s.sldModel.transformerDesign;
    const acRows: [string, string][] = [
      ['Inverter AC voltage', `${ac.inverterVoltageV ?? ac.voltageV} V`],
      ['Rated / design current', `${ac.ratedCurrentA.toFixed(1)} / ${ac.designCurrentA.toFixed(1)} A`],
      ['Feeder conductor', ac.conductorCallout || '—'],
      ['Conduit', ac.conduitCallout || '—'],
      ['Total run length', `${ac.totalRunM.toFixed(1)} m${ac.hasRaceway ? ' (via raceway)' : ' (direct)'}`],
      ['Voltage drop', `${ac.voltageDropV.toFixed(2)} V / ${ac.voltageDropPercent.toFixed(2)} % (limit ${AC_VOLTAGE_DROP_LIMIT_PERCENT} %)`],
      ['Status', ac.totalRunM > 0 ? (ac.isCompliant ? 'COMPLIANT' : 'NON-COMPLIANT') : 'No feeder route']
    ];
    if (tx && tx.required) {
      acRows.push(['Transformer', `${tx.transformerKva} kVA ${tx.vectorGroup}, ${tx.primaryVoltageV}/${tx.secondaryVoltageV} V`]);
    }
    const cab = s.cables;
    const dcRows: [string, string][] = [
      ['Strings', num(cab.totalStrings)],
      ['Intra-string wiring', `${num(cab.totalIntraStringM)} m`],
      ['Homerun cable (+/−)', `${num(cab.totalHomerunM)} m`],
      ['Elevation risers', `${num(cab.totalElevationRiserM)} m`],
      ['Total DC cable', `${num(cab.totalCableLengthM)} m`],
      ['Average per string', `${cab.avgStringCableLengthM.toFixed(1)} m`],
      ['Raceway length', `${num(cab.totalRacewayLengthM)} m`]
    ];
    ctx.kvCardsRow({ title: 'AC feeder summary', rows: acRows }, { title: 'DC cable summary', rows: dcRows });
  });

  ctx.noteBox('Notes', [
    'Conductors are copper THHN (AC) and PV1-F solar cable (DC), sized at 125% of continuous current per PEC 2017 Art. 6.90.',
    'Cable lengths come from the drawn raceways and array geometry; where no raceway is drawn a direct 3D distance is used.',
    'Final conductor selection must be confirmed against site conditions (ambient correction, grouping, installation method).'
  ]);
}
