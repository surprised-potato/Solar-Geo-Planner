/**
 * Tabular SLD schedule rows used by the PDF report.
 */
import { type SldSystemModel } from '../../geo/sldModel';
import { SldScheduleTableRow } from '../../report/reportTypes';

/**
 * Builds the comprehensive Philippine Electrical Code (PEC 2017) Cable & Conduit Schedule table
 * prepared in the Single Line Diagram (SLD) model for inclusion in engineering reports.
 */
export function buildSldScheduleTableRows(model: SldSystemModel): SldScheduleTableRow[] {
  const rows: SldScheduleTableRow[] = [];

  // 1. DC PV Strings Homerun Row
  const strCount = Math.max(model.strings.length, 1);
  rows.push({
    tag: `DC-STR-01..${String(strCount).padStart(2, '0')}`,
    route: `PV Strings (${strCount}S) to Inverter MPPTs`,
    voltsPhase: `${model.inverter.maxDcVoltage}V DC Max`,
    ratedDesignCurrent: `${model.module.isc}A / ${model.dcStringWireSizing.designCurrentA}A (1.56×)`,
    ocpd: '25A 2P DC MCB + Type 2 DC SPD (⏚)',
    conductors: `2× ${model.dcStringWireSizing.cableMm2}mm² PV1-F Solar Cu`,
    egc: '1× 6.0mm² Cu Ground',
    conduit: model.dcStringWireSizing.conduitLabel,
    standard: 'PEC 6.90.2.1 / IEC 62930'
  });

  // 2. Inverter AC Feeders
  if (model.inverters.length <= 3) {
    for (const inv of model.inverters) {
      const condLabel = `${inv.pecWireSizing.numSets > 1 ? `${inv.pecWireSizing.numSets}×(` : ''}${inv.pecWireSizing.conductorsPerSet}× ${inv.pecWireSizing.phaseConductorLabel} THHN${inv.pecWireSizing.numSets > 1 ? ')' : ''}`;
      rows.push({
        tag: `INV-${String(inv.inverterIndex).padStart(2, '0')}-AC`,
        route: `INV #${inv.inverterIndex} to Main AC Busbar`,
        voltsPhase: `${inv.acVoltage}V ${model.isThreePhase ? '3Φ' : '1Φ'} ${inv.gridFrequencyHz}Hz`,
        ratedDesignCurrent: `${inv.pecWireSizing.ratedCurrentA}A / ${inv.pecWireSizing.designCurrentA}A (125%)`,
        ocpd: `${inv.pecWireSizing.ocpdRatingA}A ${model.isThreePhase ? '3P' : '2P'} MCCB`,
        conductors: condLabel,
        egc: `1× ${inv.pecWireSizing.egcConductorLabel} Cu`,
        conduit: inv.pecWireSizing.conduitLabel,
        standard: 'PEC Tab 3.10.2.6(b)(16)'
      });
    }
  } else {
    const firstInv = model.inverters[0];
    const condLabel = `${firstInv.pecWireSizing.numSets > 1 ? `${firstInv.pecWireSizing.numSets}×(` : ''}${firstInv.pecWireSizing.conductorsPerSet}× ${firstInv.pecWireSizing.phaseConductorLabel} THHN${firstInv.pecWireSizing.numSets > 1 ? ')' : ''}`;
    rows.push({
      tag: `INV-01..${String(model.inverters.length).padStart(2, '0')}-AC`,
      route: `Inverter Feeders (Typ ×${model.inverters.length} Inverters)`,
      voltsPhase: `${firstInv.acVoltage}V ${model.isThreePhase ? '3Φ' : '1Φ'} ${firstInv.gridFrequencyHz}Hz`,
      ratedDesignCurrent: `${firstInv.pecWireSizing.ratedCurrentA}A / ${firstInv.pecWireSizing.designCurrentA}A (125%)`,
      ocpd: `${firstInv.pecWireSizing.ocpdRatingA}A ${model.isThreePhase ? '3P' : '2P'} MCCB`,
      conductors: condLabel,
      egc: `1× ${firstInv.pecWireSizing.egcConductorLabel} Cu`,
      conduit: firstInv.pecWireSizing.conduitLabel,
      standard: 'PEC Tab 3.10.2.6(b)(16)'
    });
  }

  // 3. AC Combiner Collector Feeder (if enabled)
  if (model.hasAcCombiner) {
    const combCond = `${model.acCombinerWireSizing.numSets > 1 ? `${model.acCombinerWireSizing.numSets} Sets of ` : ''}${model.acCombinerWireSizing.conductorsPerSet}× ${model.acCombinerWireSizing.phaseConductorLabel} THHN`;
    rows.push({
      tag: 'ACCB-COLLECTOR',
      route: `AC Combiner Bus to ${model.transformerDesign.required ? 'Transformer Primary' : 'Revenue Meter / MDP'}`,
      voltsPhase: `${model.acVoltage}V ${model.isThreePhase ? '3Φ' : '1Φ'} ${model.gridFrequencyHz}Hz`,
      ratedDesignCurrent: `${model.acCombinerWireSizing.ratedCurrentA}A / ${model.acCombinerWireSizing.designCurrentA}A (125%)`,
      ocpd: `${model.acCombinerBreakerRatingA}A ${model.isThreePhase ? '3P' : '2P'} MCCB`,
      conductors: combCond,
      egc: `1× ${model.acCombinerWireSizing.egcConductorLabel} Cu`,
      conduit: model.acCombinerWireSizing.conduitLabel,
      standard: 'PEC 6.90.2.1 / 3.10.2.6'
    });
  }

  // 4. Transformer Primary & Secondary Circuits (if required)
  if (model.transformerDesign.required) {
    rows.push({
      tag: 'XFM-PRI-FEEDER',
      route: 'AC Combiner to Transformer Primary',
      voltsPhase: `${model.acVoltage}V ${model.isThreePhase ? '3Φ' : '1Φ'}`,
      ratedDesignCurrent: `${model.transformerDesign.primaryRatedCurrentA}A / ${model.transformerDesign.primaryDesignCurrentA}A`,
      ocpd: `${model.transformerDesign.primaryOcpdRatingA}A ${model.isThreePhase ? '3P' : '2P'} MCCB`,
      conductors: `${model.transformerDesign.primaryConductors.conductorsPerSet}× ${model.transformerDesign.primaryConductors.phaseConductorLabel} THHN`,
      egc: `1× ${model.transformerDesign.primaryConductors.egcConductorLabel} Cu`,
      conduit: model.transformerDesign.primaryConductors.conduitLabel,
      standard: 'PEC 4.50.1.3'
    });
    rows.push({
      tag: 'XFM-SEC-FEEDER',
      route: 'Transformer Secondary to Revenue Meter / MDP',
      voltsPhase: `${model.systemVoltageV}V ${model.isThreePhase ? '3Φ' : '1Φ'}`,
      ratedDesignCurrent: `${model.transformerDesign.secondaryRatedCurrentA}A / ${model.transformerDesign.secondaryDesignCurrentA}A`,
      ocpd: `${model.transformerDesign.secondaryOcpdRatingA}A ${model.isThreePhase ? '3P' : '2P'} MCCB`,
      conductors: `${model.transformerDesign.secondaryConductors.conductorsPerSet}× ${model.transformerDesign.secondaryConductors.phaseConductorLabel} THHN`,
      egc: `1× ${model.transformerDesign.secondaryConductors.egcConductorLabel} Cu`,
      conduit: model.transformerDesign.secondaryConductors.conduitLabel,
      standard: 'PEC 4.50.1.3 / 6.90'
    });
  }

  // 5. Main AC Interconnection Feeder Row to MDP
  const mainCond = `${model.mainFeederWireSizing.numSets > 1 ? `${model.mainFeederWireSizing.numSets} Sets of ` : ''}${model.mainFeederWireSizing.conductorsPerSet}× ${model.mainFeederWireSizing.phaseConductorLabel} THHN`;
  const mainConduitWithVd = `${model.mainFeederWireSizing.conduitLabel}${model.acFeederSummary.totalRunM > 0 ? ` (${model.acFeederSummary.totalRunM}m • Vd: ${model.acFeederSummary.voltageDropPercent}%)` : ''}`;
  rows.push({
    tag: 'MAIN-AC-SERVICE',
    route: `Interconnection to MDP (${model.mdpTapType === 'load_side' ? 'Load-Side Tap' : 'Line-Side Tap'})`,
    voltsPhase: `${model.systemVoltageV}V ${model.isThreePhase ? '3Φ' : '1Φ'} ${model.gridFrequencyHz}Hz`,
    ratedDesignCurrent: `${model.mainFeederWireSizing.ratedCurrentA}A / ${model.mainFeederWireSizing.designCurrentA}A (125%)`,
    ocpd: `${model.mainBreakerRatingA}A ${model.isThreePhase ? '3P' : '2P'} MCCB`,
    conductors: mainCond,
    egc: `1× ${model.mainFeederWireSizing.egcConductorLabel} Cu`,
    conduit: mainConduitWithVd,
    standard: `PEC 6.90.8 (${model.mdpTapType === 'load_side' ? '120% Bus' : 'Supply Tap'})`
  });

  return rows;
}
