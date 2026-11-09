/**
 * Cable schedule modal and PEC wire schedule SVG for the SLD.
 */
import { type SldSystemModel } from '../../geo/sldModel';
import type { SingleLineDiagramUI } from '../sldView';
import { escapeXml } from './escapeXml';
import { escapeHtml } from '../../utils/html';

/**
 * Modal dialog showing the formal Philippine Electrical Code (PEC 2017) Cable & Conduit Schedule table.
 */
export function renderCableScheduleModal(this: SingleLineDiagramUI, model: SldSystemModel): string {
  if (!this.showCableSchedule) return '';
  return `
    <div class="sld-modal-backdrop" id="sld-schedule-backdrop" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.75); z-index: 1000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
      <div class="sld-modal-content" style="width: 92%; max-width: 1100px; max-height: 85vh; background: #0b152d; border: 1px solid #38bdf8; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); display: flex; flex-direction: column; overflow: hidden; color: #f8fafc; font-family: monospace;">
        <!-- Modal Header -->
        <div style="padding: 14px 20px; background: #0f1c3d; border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <h3 style="margin: 0; font-size: 15px; color: #38bdf8; font-weight: bold; display: flex; align-items: center; gap: 8px;">
              <span>📋</span> PHILIPPINE ELECTRICAL CODE (PEC 2017) CABLE &amp; CONDUIT SCHEDULE
            </h3>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
              ${escapeHtml(model.system.name)} &bull; ${model.totalDcKwp} kWp DC &bull; ${model.totalAcKw} kW AC (${model.inverters.length} Inverter${model.inverters.length > 1 ? 's' : ''}) &bull; ${model.acVoltage}V ${model.isThreePhase ? '3-Phase' : 'Single-Phase'} ${model.gridFrequencyHz}Hz
            </div>
          </div>
          <button id="sld-btn-close-schedule" style="background: transparent; border: none; color: #94a3b8; font-size: 22px; cursor: pointer; padding: 4px 8px; line-height: 1;" title="Close">&times;</button>
        </div>

        <!-- Modal Body / Table -->
        <div style="padding: 16px 20px; overflow-y: auto; flex: 1;">
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
            <thead>
              <tr style="border-bottom: 2px solid #38bdf8; color: #38bdf8; background: rgba(56, 189, 248, 0.08);">
                <th style="padding: 8px 6px;">Circuit Tag</th>
                <th style="padding: 8px 6px;">Circuit Route</th>
                <th style="padding: 8px 6px;">Volts / Phase</th>
                <th style="padding: 8px 6px;">Rated (A)</th>
                <th style="padding: 8px 6px;">Design (A)</th>
                <th style="padding: 8px 6px;">OCPD Rating</th>
                <th style="padding: 8px 6px;">Conductors (Cu 75°C)</th>
                <th style="padding: 8px 6px;">EGC (Ground)</th>
                <th style="padding: 8px 6px;">Raceway / Conduit</th>
                <th style="padding: 8px 6px;">PEC Standard</th>
              </tr>
            </thead>
            <tbody>
              <!-- DC PV Strings Homerun Row -->
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.08);">
                <td style="padding: 8px 6px; font-weight: bold; color: #f59e0b;">DC-STR-01..${String(Math.max(model.strings.length, 1)).padStart(2, '0')}</td>
                <td style="padding: 8px 6px; color: #cbd5e1;">PV Strings to Inverter MPPTs</td>
                <td style="padding: 8px 6px;">1500V DC Max</td>
                <td style="padding: 8px 6px;">${model.module.isc} A (Isc)</td>
                <td style="padding: 8px 6px; color: #38bdf8; font-weight: bold;">${model.dcStringWireSizing.designCurrentA} A (1.56×)</td>
                <td style="padding: 8px 6px; color: #ef4444; font-weight: bold;">25A 2P DC MCB + Type 2 DC SPD (⏚)</td>
                <td style="padding: 8px 6px; color: #10b981; font-weight: bold;">2× ${model.dcStringWireSizing.cableMm2}mm² PV1-F</td>
                <td style="padding: 8px 6px;">1× 6.0mm² Cu</td>
                <td style="padding: 8px 6px;">${model.dcStringWireSizing.conduitLabel}</td>
                <td style="padding: 8px 6px; color: #94a3b8;">PEC 6.90.2.1 / IEC 62930</td>
              </tr>

              <!-- Inverter AC Feeders -->
              ${model.inverters.map(inv => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.08);">
                  <td style="padding: 8px 6px; font-weight: bold; color: #38bdf8;">INV-${String(inv.inverterIndex).padStart(2, '0')}-AC</td>
                  <td style="padding: 8px 6px; color: #cbd5e1;">INV #${inv.inverterIndex} to MDB Busbar</td>
                  <td style="padding: 8px 6px;">${inv.acVoltage}V ${model.isThreePhase ? '3Φ' : '1Φ'} ${inv.gridFrequencyHz}Hz</td>
                  <td style="padding: 8px 6px;">${inv.pecWireSizing.ratedCurrentA} A</td>
                  <td style="padding: 8px 6px; color: #38bdf8; font-weight: bold;">${inv.pecWireSizing.designCurrentA} A (125%)</td>
                  <td style="padding: 8px 6px; color: #ef4444; font-weight: bold;">${inv.pecWireSizing.ocpdRatingA}A ${model.isThreePhase ? '3P' : '2P'} MCCB</td>
                  <td style="padding: 8px 6px; color: #10b981; font-weight: bold;">${inv.pecWireSizing.numSets > 1 ? `${inv.pecWireSizing.numSets}×(` : ''}${inv.pecWireSizing.conductorsPerSet}× ${inv.pecWireSizing.phaseConductorLabel} THHN${inv.pecWireSizing.numSets > 1 ? ')' : ''}</td>
                  <td style="padding: 8px 6px;">1× ${inv.pecWireSizing.egcConductorLabel} Cu</td>
                  <td style="padding: 8px 6px;">${inv.pecWireSizing.conduitLabel}</td>
                  <td style="padding: 8px 6px; color: #94a3b8;">PEC Tab 3.10.2.6(b)(16) / 2.50.6.13</td>
                </tr>
              `).join('')}

              <!-- AC Combiner Collector Feeder (if enabled) -->
              ${
                model.hasAcCombiner
                  ? `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(16, 185, 129, 0.04);">
                  <td style="padding: 8px 6px; font-weight: bold; color: #10b981;">ACCB-COLLECTOR</td>
                  <td style="padding: 8px 6px; color: #cbd5e1;">AC Combiner Bus to ${model.transformerDesign.required ? 'Transformer Primary' : 'Revenue Meter / MDP'}</td>
                  <td style="padding: 8px 6px;">${model.acVoltage}V ${model.isThreePhase ? '3Φ' : '1Φ'} ${model.gridFrequencyHz}Hz</td>
                  <td style="padding: 8px 6px;">${model.acCombinerWireSizing.ratedCurrentA} A</td>
                  <td style="padding: 8px 6px; color: #38bdf8; font-weight: bold;">${model.acCombinerWireSizing.designCurrentA} A (125%)</td>
                  <td style="padding: 8px 6px; color: #ef4444; font-weight: bold;">${model.acCombinerBreakerRatingA}A ${model.isThreePhase ? '3P' : '2P'} MCCB</td>
                  <td style="padding: 8px 6px; color: #10b981; font-weight: bold;">${model.acCombinerWireSizing.numSets > 1 ? `${model.acCombinerWireSizing.numSets} Sets of ` : ''}${model.acCombinerWireSizing.conductorsPerSet}× ${model.acCombinerWireSizing.phaseConductorLabel} THHN</td>
                  <td style="padding: 8px 6px;">1× ${model.acCombinerWireSizing.egcConductorLabel} Cu</td>
                  <td style="padding: 8px 6px;">${model.acCombinerWireSizing.conduitLabel}</td>
                  <td style="padding: 8px 6px; color: #94a3b8;">PEC 6.90.2.1 / 3.10.2.6</td>
                </tr>
              `
                  : ''
              }

              <!-- Transformer Primary & Secondary Circuits (if voltages differ) -->
              ${
                model.transformerDesign.required
                  ? `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(245, 158, 11, 0.05);">
                  <td style="padding: 8px 6px; font-weight: bold; color: #f59e0b;">XFM-PRI-FEEDER</td>
                  <td style="padding: 8px 6px; color: #cbd5e1;">AC Combiner to Transformer Primary</td>
                  <td style="padding: 8px 6px;">${model.acVoltage}V ${model.isThreePhase ? '3Φ' : '1Φ'}</td>
                  <td style="padding: 8px 6px;">${model.transformerDesign.primaryRatedCurrentA} A</td>
                  <td style="padding: 8px 6px; color: #38bdf8; font-weight: bold;">${model.transformerDesign.primaryDesignCurrentA} A (125%)</td>
                  <td style="padding: 8px 6px; color: #ef4444; font-weight: bold;">${model.transformerDesign.primaryOcpdRatingA}A ${model.isThreePhase ? '3P' : '2P'} MCCB</td>
                  <td style="padding: 8px 6px; color: #10b981; font-weight: bold;">${model.transformerDesign.primaryConductors.conductorsPerSet}× ${model.transformerDesign.primaryConductors.phaseConductorLabel} THHN</td>
                  <td style="padding: 8px 6px;">1× ${model.transformerDesign.primaryConductors.egcConductorLabel} Cu</td>
                  <td style="padding: 8px 6px;">${model.transformerDesign.primaryConductors.conduitLabel}</td>
                  <td style="padding: 8px 6px; color: #94a3b8;">PEC 4.50.1.3</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(245, 158, 11, 0.08);">
                  <td style="padding: 8px 6px; font-weight: bold; color: #f59e0b;">XFM-EQUIPMENT</td>
                  <td style="padding: 8px 6px; font-weight: bold; color: #f59e0b;">${escapeHtml(model.transformerDesign.label)}</td>
                  <td style="padding: 8px 6px;">${model.acVoltage}V / ${model.systemVoltageV}V</td>
                  <td style="padding: 8px 6px;">—</td>
                  <td style="padding: 8px 6px;">${model.transformerDesign.kvaRating} kVA</td>
                  <td style="padding: 8px 6px; color: #10b981;">%Z: ${model.transformerDesign.impedancePercent}%</td>
                  <td style="padding: 8px 6px; color: #cbd5e1;">${model.transformerDesign.vectorGroup} Winding</td>
                  <td style="padding: 8px 6px;">Tank Ground (PE)</td>
                  <td style="padding: 8px 6px;">Enclosure NEMA 3R</td>
                  <td style="padding: 8px 6px; color: #94a3b8;">PEC Article 4.50</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(245, 158, 11, 0.05);">
                  <td style="padding: 8px 6px; font-weight: bold; color: #f59e0b;">XFM-SEC-FEEDER</td>
                  <td style="padding: 8px 6px; color: #cbd5e1;">Transformer Secondary to Revenue Meter / MDP</td>
                  <td style="padding: 8px 6px;">${model.systemVoltageV}V ${model.isThreePhase ? '3Φ' : '1Φ'}</td>
                  <td style="padding: 8px 6px;">${model.transformerDesign.secondaryRatedCurrentA} A</td>
                  <td style="padding: 8px 6px; color: #38bdf8; font-weight: bold;">${model.transformerDesign.secondaryDesignCurrentA} A (125%)</td>
                  <td style="padding: 8px 6px; color: #ef4444; font-weight: bold;">${model.transformerDesign.secondaryOcpdRatingA}A ${model.isThreePhase ? '3P' : '2P'} MCCB</td>
                  <td style="padding: 8px 6px; color: #10b981; font-weight: bold;">${model.transformerDesign.secondaryConductors.conductorsPerSet}× ${model.transformerDesign.secondaryConductors.phaseConductorLabel} THHN</td>
                  <td style="padding: 8px 6px;">1× ${model.transformerDesign.secondaryConductors.egcConductorLabel} Cu</td>
                  <td style="padding: 8px 6px;">${model.transformerDesign.secondaryConductors.conduitLabel}</td>
                  <td style="padding: 8px 6px; color: #94a3b8;">PEC 4.50.1.3 / 6.90</td>
                </tr>
              `
                  : ''
              }

              <!-- Main AC Interconnection Feeder Row to MDP -->
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(56, 189, 248, 0.05);">
                <td style="padding: 8px 6px; font-weight: bold; color: #ef4444;">MAIN-AC-SERVICE</td>
                <td style="padding: 8px 6px; font-weight: bold; color: #cbd5e1;">To MDP (${model.mdpTapType === 'load_side' ? 'Load-Side Tap' : 'Line-Side Tap'})</td>
                <td style="padding: 8px 6px;">${model.systemVoltageV}V ${model.isThreePhase ? '3Φ' : '1Φ'} ${model.gridFrequencyHz}Hz</td>
                <td style="padding: 8px 6px;">${model.mainFeederWireSizing.ratedCurrentA} A</td>
                <td style="padding: 8px 6px; color: #38bdf8; font-weight: bold;">${model.mainFeederWireSizing.designCurrentA} A (125%)</td>
                <td style="padding: 8px 6px; color: #ef4444; font-weight: bold;">${model.mainBreakerRatingA}A ${model.isThreePhase ? '3P' : '2P'} MCCB</td>
                <td style="padding: 8px 6px; color: #10b981; font-weight: bold;">${model.mainFeederWireSizing.numSets > 1 ? `${model.mainFeederWireSizing.numSets} Sets of ` : ''}${model.mainFeederWireSizing.conductorsPerSet}× ${model.mainFeederWireSizing.phaseConductorLabel} THHN</td>
                <td style="padding: 8px 6px;">1× ${model.mainFeederWireSizing.egcConductorLabel} Cu</td>
                <td style="padding: 8px 6px;">${model.mainFeederWireSizing.conduitLabel}${model.acFeederSummary.totalRunM > 0 ? ` (${model.acFeederSummary.totalRunM}m • Vd: ${model.acFeederSummary.voltageDropPercent}%)` : ''}</td>
                <td style="padding: 8px 6px; color: #94a3b8;">PEC 6.90.8 (${model.mdpTapType === 'load_side' ? '120% Bus' : 'Supply Tap'})</td>
              </tr>

              <!-- MDP Main Distribution Panel Service Row -->
              <tr style="border-bottom: 2px solid #38bdf8; background: rgba(56, 189, 248, 0.08);">
                <td style="padding: 8px 6px; font-weight: bold; color: #38bdf8;">MDP-MAIN-SERVICE</td>
                <td style="padding: 8px 6px; font-weight: bold; color: #38bdf8;">MDP Main Breaker & Building Distribution Bus (Load Tapped on Load Side)</td>
                <td style="padding: 8px 6px;">${model.systemVoltageV}V ${model.isThreePhase ? '3Φ' : '1Φ'}</td>
                <td style="padding: 8px 6px;">—</td>
                <td style="padding: 8px 6px;">—</td>
                <td style="padding: 8px 6px; color: #ef4444; font-weight: bold;">${model.mdpMainBreakerRatingA}A ${model.isThreePhase ? '3P' : '2P'} Main MCCB</td>
                <td style="padding: 8px 6px; color: #cbd5e1;">Service Entrance Busbar</td>
                <td style="padding: 8px 6px;">Main Ground Bus (GEC)</td>
                <td style="padding: 8px 6px;">NEMA 1 / NEMA 3R Switchboard</td>
                <td style="padding: 8px 6px; color: #94a3b8;">PEC Article 4.8 / 2.30</td>
              </tr>
            </tbody>
          </table>

          <!-- PEC Engineering Standards Compliance Footnotes -->
          <div style="margin-top: 16px; padding: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; font-size: 10px; color: #94a3b8; line-height: 1.6;">
            <strong style="color: #38bdf8;">Philippine Electrical Code (PEC 2017) Engineering Criteria:</strong><br/>
            &bull; <strong>Continuous Duty Sizing:</strong> Inverter AC output circuits sized at minimum 125% rated output current per PEC Article 6.90.2.1 and PEC 2.15.1.2.<br/>
            &bull; <strong>Voltage Drop Compliance:</strong> Feeder voltage drop computed using PEC Table 9 conductor resistance (target &le; 2.0%, maximum allowable &le; 3.0% per PEC Article 2.15.1.2 Informational Note).<br/>
            &bull; <strong>Conductor Material & Ampacity:</strong> 75°C Copper THHN/THWN-2 conductors sized per PEC Table 3.10.2.6(b)(16). For currents &gt; 355A, parallel sets sized per PEC 3.10.1.4.<br/>
            &bull; <strong>Equipment Grounding Conductor (EGC):</strong> Minimum copper size selected per PEC Table 2.50.6.13 based on the rating of the upstream circuit breaker (OCPD).<br/>
            &bull; <strong>Conduit Fill & Raceways:</strong> Trade conduit sizes computed per PEC Chapter 9 Table 10.1.1.4 (maximum 40% raceway fill for 3+ conductors).
          </div>
        </div>

        <!-- Modal Footer -->
        <div style="padding: 10px 20px; background: #0f1c3d; border-top: 1px solid #1e293b; display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
          <button id="sld-btn-close-schedule-footer" class="sld-btn primary" style="padding: 4px 16px; cursor: pointer;">Done</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generates pure 2D Wireframe vector SVG table for the Philippine Electrical Code (PEC 2017)
 * Cable & Conduit Schedule positioned compactly near the MDP with 2-row wrapped text cells.
 */
export function generatePecScheduleSvg(
  this: SingleLineDiagramUI,
  model: SldSystemModel,
  tableX: number,
  tableY: number,
  tableW: number,
  colors: { wireColor: string; wireAccent: string; wireWarning: string; wireDanger: string; wireNeutral: string; wireMuted: string; bgColor: string; isDark: boolean; }
): { svg: string; height: number } {
  const { wireColor, wireAccent, wireWarning, wireDanger, wireNeutral, wireMuted, bgColor, isDark } = colors;

  interface PecScheduleCell {
    line1: string;
    line2?: string;
  }

  /**
   * Splits conduit / raceway labels into 2 wrapped lines so they never spill over adjacent table columns.
   * E.g. '65 mmø (2-1/2") RMC/EMT' -> line1: '65 mmø (2-1/2")', line2: 'RMC / EMT'
   * E.g. '80 mmø (3") RMC' -> line1: '80 mmø (3")', line2: 'RMC Conduit'
   * E.g. '25 mmø (1") PVC/EMT' -> line1: '25 mmø (1")', line2: 'PVC / EMT'
   */
  const formatConduitCell = (rawLabel: string | undefined): PecScheduleCell => {
    if (!rawLabel) return { line1: '—' };
    const str = rawLabel.trim();

    // Pattern: matches metric + inches in parens (e.g. '65 mmø (2-1/2")') and the rest (conduit type)
    const match = str.match(/^(.*?\(.*?\))\s*(.*)$/);
    if (match && match[1] && match[2]) {
      const sizePart = match[1].trim();
      let typePart = match[2].trim();
      if (typePart === 'RMC') typePart = 'RMC Conduit';
      else if (typePart === 'EMT') typePart = 'EMT Conduit';
      else if (typePart === 'PVC/EMT') typePart = 'PVC / EMT';
      else if (typePart === 'RMC/EMT') typePart = 'RMC / EMT';
      return { line1: sizePart, line2: typePart };
    }

    // Fallback: split at last space if string is long
    const spaceIdx = str.lastIndexOf(' ');
    if (spaceIdx > 0 && str.length > 10) {
      return { line1: str.substring(0, spaceIdx).trim(), line2: str.substring(spaceIdx + 1).trim() };
    }

    return { line1: str };
  };

  interface PecScheduleRow {
    tag: PecScheduleCell & { color: string };
    route: PecScheduleCell;
    voltage: PecScheduleCell;
    current: PecScheduleCell;
    ocpd: PecScheduleCell;
    conductors: PecScheduleCell;
    egc: PecScheduleCell;
    raceway: PecScheduleCell;
    standard: PecScheduleCell;
  }

  const rows: PecScheduleRow[] = [];

  // 1. DC PV Strings Homerun
  const strCount = Math.max(model.strings.length, 1);
  rows.push({
    tag: { line1: 'DC-STR-01', line2: `..${String(strCount).padStart(2, '0')}`, color: wireWarning },
    route: { line1: `PV Strings (${strCount}S)`, line2: 'to Inverter MPPTs' },
    voltage: { line1: `${model.inverter.maxDcVoltage}V DC`, line2: 'Max System' },
    current: { line1: `${model.module.isc}A (Isc)`, line2: `${model.dcStringWireSizing.designCurrentA}A (1.56×)` },
    ocpd: { line1: '25A 2P MCB', line2: '+ Type 2 SPD' },
    conductors: { line1: `2× ${model.dcStringWireSizing.cableMm2}mm²`, line2: 'PV1-F Solar Cu' },
    egc: { line1: '1× 6.0mm²', line2: 'Cu Ground' },
    raceway: formatConduitCell(model.dcStringWireSizing.conduitLabel),
    standard: { line1: 'PEC', line2: '6.90.2.1' }
  });

  // 2. Inverter AC Output Feeders
  if (model.inverters.length <= 4) {
    model.inverters.forEach(inv => {
      rows.push({
        tag: { line1: `INV-${String(inv.inverterIndex).padStart(2, '0')}-AC`, line2: `(${inv.ratedAcKw}kW AC)`, color: wireColor },
        route: { line1: `INV #${inv.inverterIndex} to`, line2: 'Main AC Bus' },
        voltage: { line1: `${inv.acVoltage}V ${model.isThreePhase ? '3Φ' : '1Φ'}`, line2: `${inv.gridFrequencyHz}Hz` },
        current: { line1: `${inv.pecWireSizing.ratedCurrentA}A Rated`, line2: `${inv.pecWireSizing.designCurrentA}A (125%)` },
        ocpd: { line1: `${inv.pecWireSizing.ocpdRatingA}A ${model.isThreePhase ? '3P' : '2P'}`, line2: 'MCCB' },
        conductors: {
          line1: inv.pecWireSizing.numSets > 1 ? `${inv.pecWireSizing.numSets} Sets of:` : `${inv.pecWireSizing.conductorsPerSet}× ${inv.pecWireSizing.phaseConductorLabel}`,
          line2: inv.pecWireSizing.numSets > 1 ? `${inv.pecWireSizing.conductorsPerSet}× ${inv.pecWireSizing.phaseConductorLabel} THHN` : 'Cu THHN/THWN-2'
        },
        egc: { line1: `1× ${inv.pecWireSizing.egcConductorLabel}`, line2: 'Cu Ground' },
        raceway: formatConduitCell(inv.pecWireSizing.conduitLabel),
        standard: { line1: 'PEC', line2: '3.10.2.6' }
      });
    });
  } else {
    const firstInv = model.inverters[0];
    rows.push({
      tag: { line1: `INV-01..${String(model.inverters.length).padStart(2, '0')}`, line2: `(×${model.inverters.length} Invs)`, color: wireColor },
      route: { line1: 'Inverter Feeders', line2: `(Typ ×${model.inverters.length} Invs)` },
      voltage: { line1: `${firstInv.acVoltage}V ${model.isThreePhase ? '3Φ' : '1Φ'}`, line2: `${firstInv.gridFrequencyHz}Hz` },
      current: { line1: `${firstInv.pecWireSizing.ratedCurrentA}A Rated`, line2: `${firstInv.pecWireSizing.designCurrentA}A (125%)` },
      ocpd: { line1: `${firstInv.pecWireSizing.ocpdRatingA}A ${model.isThreePhase ? '3P' : '2P'}`, line2: 'MCCB' },
      conductors: {
        line1: firstInv.pecWireSizing.numSets > 1 ? `${firstInv.pecWireSizing.numSets} Sets of:` : `${firstInv.pecWireSizing.conductorsPerSet}× ${firstInv.pecWireSizing.phaseConductorLabel}`,
        line2: firstInv.pecWireSizing.numSets > 1 ? `${firstInv.pecWireSizing.conductorsPerSet}× ${firstInv.pecWireSizing.phaseConductorLabel} THHN` : 'Cu THHN/THWN-2'
      },
      egc: { line1: `1× ${firstInv.pecWireSizing.egcConductorLabel}`, line2: 'Cu Ground' },
      raceway: formatConduitCell(firstInv.pecWireSizing.conduitLabel),
      standard: { line1: 'PEC', line2: '3.10.2.6' }
    });
  }

  // 3. AC Combiner Collector Feeder (if enabled)
  if (model.hasAcCombiner) {
    rows.push({
      tag: { line1: 'ACCB-COLL', line2: `(${model.acCombinerBreakerRatingA}A)`, color: wireAccent },
      route: { line1: 'Combiner Bus to', line2: model.transformerDesign.required ? 'Transformer' : 'MDP Main' },
      voltage: { line1: `${model.acVoltage}V ${model.isThreePhase ? '3Φ' : '1Φ'}`, line2: `${model.gridFrequencyHz}Hz` },
      current: { line1: `${model.acCombinerWireSizing.ratedCurrentA}A Rated`, line2: `${model.acCombinerWireSizing.designCurrentA}A (125%)` },
      ocpd: { line1: `${model.acCombinerBreakerRatingA}A ${model.isThreePhase ? '3P' : '2P'}`, line2: 'MCCB' },
      conductors: {
        line1: model.acCombinerWireSizing.numSets > 1 ? `${model.acCombinerWireSizing.numSets} Sets of:` : `${model.acCombinerWireSizing.conductorsPerSet}× ${model.acCombinerWireSizing.phaseConductorLabel}`,
        line2: model.acCombinerWireSizing.numSets > 1 ? `${model.acCombinerWireSizing.conductorsPerSet}× ${model.acCombinerWireSizing.phaseConductorLabel} THHN` : 'Cu THHN/THWN-2'
      },
      egc: { line1: `1× ${model.acCombinerWireSizing.egcConductorLabel}`, line2: 'Cu Ground' },
      raceway: formatConduitCell(model.acCombinerWireSizing.conduitLabel),
      standard: { line1: 'PEC', line2: '6.90.2.1' }
    });
  }

  // 4. Transformer Primary & Secondary Circuits (if required)
  if (model.transformerDesign.required) {
    rows.push({
      tag: { line1: 'XFM-PRI', line2: 'Primary', color: wireWarning },
      route: { line1: 'Combiner Bus to', line2: 'XFM Primary' },
      voltage: { line1: `${model.acVoltage}V 3Φ`, line2: `${model.gridFrequencyHz}Hz` },
      current: { line1: `${model.transformerDesign.primaryRatedCurrentA}A Rated`, line2: `${model.transformerDesign.primaryDesignCurrentA}A (125%)` },
      ocpd: { line1: `${model.transformerDesign.primaryOcpdRatingA}A 3P`, line2: 'MCCB' },
      conductors: { line1: `${model.transformerDesign.primaryConductors.conductorsPerSet}× ${model.transformerDesign.primaryConductors.phaseConductorLabel}`, line2: 'Cu THHN' },
      egc: { line1: `1× ${model.transformerDesign.primaryConductors.egcConductorLabel}`, line2: 'Cu Ground' },
      raceway: formatConduitCell(model.transformerDesign.primaryConductors.conduitLabel),
      standard: { line1: 'PEC', line2: '4.50.1.3' }
    });
    rows.push({
      tag: { line1: 'XFM-SEC', line2: 'Secondary', color: wireWarning },
      route: { line1: 'XFM Secondary', line2: 'to MDP Main' },
      voltage: { line1: `${model.systemVoltageV}V 3Φ`, line2: `${model.gridFrequencyHz}Hz` },
      current: { line1: `${model.transformerDesign.secondaryRatedCurrentA}A Rated`, line2: `${model.transformerDesign.secondaryDesignCurrentA}A (125%)` },
      ocpd: { line1: `${model.transformerDesign.secondaryOcpdRatingA}A 3P`, line2: 'MCCB' },
      conductors: { line1: `${model.transformerDesign.secondaryConductors.conductorsPerSet}× ${model.transformerDesign.secondaryConductors.phaseConductorLabel}`, line2: 'Cu THHN' },
      egc: { line1: `1× ${model.transformerDesign.secondaryConductors.egcConductorLabel}`, line2: 'Cu Ground' },
      raceway: formatConduitCell(model.transformerDesign.secondaryConductors.conduitLabel),
      standard: { line1: 'PEC', line2: '4.50.1.3' }
    });
  }

  // 5. MDP Main Feeder / Service
  rows.push({
    tag: { line1: 'MDP-SERVICE', line2: 'Main Bus', color: wireDanger },
    route: { line1: 'Utility Service to', line2: 'Building Demand' },
    voltage: { line1: `${model.systemVoltageV}V ${model.isThreePhase ? '3Φ' : '1Φ'}`, line2: `${model.gridFrequencyHz}Hz` },
    current: { line1: `${model.mainFeederWireSizing.designCurrentA}A Design`, line2: `${model.mdpMainBreakerRatingA}A Service` },
    ocpd: { line1: `${model.mdpMainBreakerRatingA}A ${model.isThreePhase ? '3P' : '2P'}`, line2: 'Main MCCB' },
    conductors: {
      line1: model.mainFeederWireSizing.numSets > 1 ? `${model.mainFeederWireSizing.numSets} Sets of:` : `${model.mainFeederWireSizing.conductorsPerSet}× ${model.mainFeederWireSizing.phaseConductorLabel}`,
      line2: model.mainFeederWireSizing.numSets > 1 ? `${model.mainFeederWireSizing.conductorsPerSet}× ${model.mainFeederWireSizing.phaseConductorLabel} THHN` : 'Cu THHN/THWN-2'
    },
    egc: { line1: `1× ${model.mainFeederWireSizing.egcConductorLabel}`, line2: 'Main GEC' },
    raceway: formatConduitCell(model.mainFeederWireSizing.conduitLabel),
    standard: { line1: 'PEC Art 4.8', line2: 'PEC Art 2.30' }
  });

  // Compact Column Definitions: Total width 640px
  const cols = [
    { label1: 'CIRCUIT', label2: 'TAG', width: 68, align: 'left' as const },
    { label1: 'CIRCUIT', label2: 'ROUTE', width: 96, align: 'left' as const },
    { label1: 'VOLTS /', label2: 'PHASE', width: 56, align: 'center' as const },
    { label1: 'RATED /', label2: 'DESIGN', width: 78, align: 'center' as const },
    { label1: 'OCPD', label2: 'RATING', width: 68, align: 'center' as const },
    { label1: 'CONDUCTORS', label2: '(Cu 75°C)', width: 98, align: 'left' as const },
    { label1: 'EGC', label2: '(GND)', width: 52, align: 'center' as const },
    { label1: 'CONDUIT /', label2: 'RACEWAY', width: 76, align: 'center' as const },
    { label1: 'PEC', label2: 'STD', width: 48, align: 'center' as const },
  ];

  let currX = 0;
  const colPositions = cols.map(col => {
    const pos = { ...col, x: currX };
    currX += col.width;
    return pos;
  });

  const titleH = 22;
  const headerH = 26;
  const rowH = 26;
  const footerH = 18;
  const totalTableH = titleH + headerH + rows.length * rowH + footerH;

  const renderCell = (
    cell: PecScheduleCell,
    col: { x: number; width: number; align: 'left' | 'center' },
    y: number,
    color: string,
    isBold: boolean = false
  ) => {
    const x = col.align === 'center' ? col.x + col.width / 2 : col.x + 6;
    const anchor = col.align === 'center' ? 'middle' : 'start';
    const weight = isBold ? ' font-weight="bold"' : '';

    if (cell.line2) {
      return `
        <text x="${x}" y="${y + 11}" fill="${color}" font-family="monospace" font-size="7.5"${weight} text-anchor="${anchor}">${escapeXml(cell.line1)}</text>
        <text x="${x}" y="${y + 21}" fill="${color}" font-family="monospace" font-size="7"${weight} text-anchor="${anchor}">${escapeXml(cell.line2)}</text>
      `;
    } else {
      return `
        <text x="${x}" y="${y + 16}" fill="${color}" font-family="monospace" font-size="7.5"${weight} text-anchor="${anchor}">${escapeXml(cell.line1)}</text>
      `;
    }
  };

  const svg = `
    <g class="wireframe-pec-cable-schedule" id="sld-pec-cable-schedule" transform="translate(${tableX}, ${tableY})">
      <!-- Outer Table Enclosure -->
      <rect x="0" y="0" width="${tableW}" height="${totalTableH}" fill="${bgColor}" stroke="${wireColor}" stroke-width="1.8" rx="3" />

      <!-- Table Title Header Bar -->
      <rect x="0" y="0" width="${tableW}" height="${titleH}" fill="${isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(3, 105, 161, 0.10)'}" stroke="${wireColor}" stroke-width="1.2" />
      <text x="10" y="15" fill="${wireColor}" font-family="monospace" font-size="9" font-weight="bold">📋 PEC 2017 CABLE &amp; CONDUIT SCHEDULE</text>
      <text x="${tableW - 10}" y="15" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="end">Cu 75°C • Max 40% Fill</text>

      <!-- Column Headers Bar (2 Rows) -->
      <rect x="0" y="${titleH}" width="${tableW}" height="${headerH}" fill="${isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.04)'}" stroke="${wireColor}" stroke-width="1" />
      ${colPositions.map((col, idx) => {
        const x = col.align === 'center' ? col.x + col.width / 2 : col.x + 6;
        const anchor = col.align === 'center' ? 'middle' : 'start';
        return `
          <text x="${x}" y="${titleH + 11}" fill="${wireColor}" font-family="monospace" font-size="7.5" font-weight="bold" text-anchor="${anchor}">${col.label1}</text>
          ${col.label2 ? `<text x="${x}" y="${titleH + 21}" fill="${wireColor}" font-family="monospace" font-size="7" font-weight="bold" text-anchor="${anchor}">${col.label2}</text>` : ''}
          ${idx > 0 ? `<line x1="${col.x}" y1="${titleH}" x2="${col.x}" y2="${titleH + headerH + rows.length * rowH}" stroke="${isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(15, 23, 42, 0.07)'}" stroke-width="1" />` : ''}
        `;
      }).join('')}

      <!-- Data Rows (2 Rows maximum wrapping) -->
      ${rows.map((row, rIdx) => {
        const y = titleH + headerH + rIdx * rowH;
        const rowBg = rIdx % 2 === 0 ? (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)') : 'transparent';
        const fullDesc = `${row.tag.line1}${row.tag.line2 ? ' ' + row.tag.line2 : ''}: ${row.route.line1} ${row.route.line2 || ''} | ${row.conductors.line1} ${row.conductors.line2 || ''} in ${row.raceway.line1} (${row.standard.line1} ${row.standard.line2 || ''})`;
        return `
          <g class="wireframe-schedule-row">
            <title>${escapeXml(fullDesc)}</title>
            <rect x="0" y="${y}" width="${tableW}" height="${rowH}" fill="${rowBg}" />
            <line x1="0" y1="${y + rowH}" x2="${tableW}" y2="${y + rowH}" stroke="${isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(3, 105, 161, 0.12)'}" stroke-width="0.8" stroke-dasharray="3,3" />

            <!-- Circuit Tag -->
            ${renderCell(row.tag, colPositions[0], y, row.tag.color, true)}

            <!-- Route -->
            ${renderCell(row.route, colPositions[1], y, wireNeutral)}

            <!-- Volts / Ph -->
            ${renderCell(row.voltage, colPositions[2], y, wireNeutral)}

            <!-- Rated / Design Amps -->
            ${renderCell(row.current, colPositions[3], y, wireColor)}

            <!-- OCPD Rating -->
            ${renderCell(row.ocpd, colPositions[4], y, wireDanger, true)}

            <!-- Conductors -->
            ${renderCell(row.conductors, colPositions[5], y, wireAccent, true)}

            <!-- EGC Ground -->
            ${renderCell(row.egc, colPositions[6], y, wireAccent)}

            <!-- Raceway -->
            ${renderCell(row.raceway, colPositions[7], y, wireNeutral)}

            <!-- Standard -->
            ${renderCell(row.standard, colPositions[8], y, wireMuted)}
          </g>
        `;
      }).join('')}

      <!-- Table Summary Footnote Row -->
      <line x1="0" y1="${titleH + headerH + rows.length * rowH}" x2="${tableW}" y2="${titleH + headerH + rows.length * rowH}" stroke="${wireColor}" stroke-width="1" />
      <rect x="0" y="${titleH + headerH + rows.length * rowH}" width="${tableW}" height="${footerH}" fill="${isDark ? 'rgba(56, 189, 248, 0.05)' : 'rgba(3, 105, 161, 0.05)'}" />
      <text x="10" y="${titleH + headerH + rows.length * rowH + 12}" fill="${wireMuted}" font-family="monospace" font-size="6.8">PEC 2017: 125% Cont. Duty • Feeder V_drop ≤ 3% • Grounding per Tab 2.50.6.13 • Raceways max 40% fill</text>
    </g>
  `;

  return { svg, height: totalTableH };
}
