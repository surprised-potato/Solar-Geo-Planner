import { COLORS, M, ReportCtx, num } from '../context';
import { drawTable } from '../table';
import { buildDesignChecks } from '../metrics';

/** Module / inverter datasheet cards and data-driven design checks, per system. */
export function renderComponents(ctx: ReportCtx): void {
  const { bundle } = ctx;
  ctx.beginSection('components', 'Components & Design Checks', {
    subtitle: 'Datasheet ratings of the selected equipment and verification of the stringing against inverter limits.'
  });

  if (bundle.systems.length === 0) {
    ctx.paragraph('No solar systems defined.', { style: 'italic', color: COLORS.muted });
    return;
  }

  bundle.systems.forEach((s, idx) => {
    const mod = s.module;
    const inv = s.system.inverter;
    if (bundle.systems.length > 1 || idx > 0) {
      ctx.ensureSpace(120);
      ctx.t(`System ${idx + 1}: ${s.system.name}`, M, ctx.y + 4, { style: 'bold', size: 10.5, color: COLORS.navy });
      ctx.y += 8;
    }

    ctx.kvCardsRow(
      {
        title: 'PV module (STC)',
        rows: [
          ['Model', mod.name],
          ['Manufacturer', mod.manufacturer || '—'],
          ['Nominal power (Pmax)', `${mod.nominalPowerW} Wp`],
          ['Open-circuit voltage (Voc)', `${mod.voc} V`],
          ['Max-power voltage (Vmp)', `${mod.vmp} V`],
          ['Short-circuit current (Isc)', `${mod.isc} A`],
          ['Max-power current (Imp)', `${mod.imp} A`],
          ['Dimensions', `${mod.lengthMm} × ${mod.widthMm} mm`],
          ['Technology', mod.bifacial ? 'Bifacial' : 'Monofacial'],
          ['Temp. coeff. Pmax', `${mod.tempCoeffPmax ?? -0.35} %/°C`],
          ['Temp. coeff. Voc', `${mod.tempCoeffVoc ?? -0.28} %/°C`]
        ]
      },
      {
        title: 'Inverter (grid-tied)',
        rows: [
          ['Model', inv.modelName],
          ['Rated AC power', `${inv.ratedAcPowerKw} kW`],
          ['Quantity', `${inv.inverterCount || 1} unit(s)`],
          ['MPPT inputs per inverter', String(inv.mpptCountPerInverter)],
          ['Max strings per MPPT', String(inv.maxStringsPerMppt || 2)],
          ['Max DC input voltage', `${inv.maxDcVoltage} V`],
          ['MPPT voltage window', `${inv.minMpptVoltage}–${inv.maxMpptVoltage} V`],
          ['Max DC current per MPPT', `${inv.maxDcCurrentPerMppt} A`],
          ['AC output', `${inv.acVoltage || 400} V, ${inv.phase === 'single_phase' ? '1-phase' : '3-phase'}`],
          ['Grid frequency', `${inv.gridFrequencyHz || 60} Hz`],
          ['Max recommended DC/AC', String(inv.maxDcAcRatio || 1.35)]
        ]
      }
    );

    ctx.subheading('Stringing & electrical design checks');
    const checks = buildDesignChecks(s.sldModel, inv, mod);
    drawTable(ctx, {
      columns: [
        { header: 'Check', width: 4.4 },
        { header: 'Design value', width: 3.2, bold: true },
        { header: 'Limit', width: 2.8 },
        { header: 'Status', width: 2.4, bold: true }
      ],
      rows: checks.map(c => [
        c.parameter,
        c.value,
        c.limit,
        c.status === 'PASS' ? 'COMPLIANT' : c.status === 'FAIL' ? 'NON-COMPLIANT' : 'N/A'
      ]),
      cellColor: (_r, c, v) =>
        c === 3 ? (v === 'COMPLIANT' ? COLORS.green : v === 'NON-COMPLIANT' ? COLORS.red : COLORS.muted) : undefined,
      fontSize: 7.2,
      rowH: 6
    });
    const notes = checks.filter(c => c.note).map(c => c.note!);
    if (notes.length) {
      ctx.paragraph(`Note: ${Array.from(new Set(notes)).join(' ')}`, { style: 'italic', size: 6.8, color: COLORS.muted });
    }

    const bad = s.sldModel.strings.filter(st => !st.isVoltageCompliant);
    if (bad.length > 0) {
      ctx.subheading(`Strings outside the voltage window (${bad.length})`);
      drawTable(ctx, {
        columns: [
          { header: 'String', width: 2.4, bold: true },
          { header: 'Sub-array', width: 3 },
          { header: 'Modules', width: 1.4, align: 'right' },
          { header: 'Cold Voc', width: 1.8, align: 'right' },
          { header: 'Issue', width: 6 }
        ],
        rows: bad.map(st => [
          st.stringId,
          st.zoneName,
          num(st.panelCount),
          `${st.coldVoc.toFixed(0)} V`,
          st.voltageViolationMsg || 'Voltage out of range'
        ]),
        fontSize: 6.8,
        cellColor: (_r, c) => (c === 4 ? COLORS.red : undefined)
      });
    }
  });

  ctx.noteBox('Design basis', [
    `Cold string Voc is evaluated at -10°C ambient; hot Vmp at a 70°C cell temperature.`,
    'Inverter limits are taken from the equipment registry; verify against the manufacturer datasheet before procurement.',
    'Applicable codes: PEC 2017 Part 1 Art. 6.90 and 7.05; NEC 2020 125% continuous-duty rule; IEC 62109 / UL 1699B for protection.'
  ]);
}
