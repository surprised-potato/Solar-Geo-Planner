/**
 * SLD wireframe annotations: PEC schedule, title block, notes, headers and border.
 */
import { type SldSystemModel } from '../../../geo/sldModel';
import type { SingleLineDiagramUI } from '../../sldView';
import type { AfterServiceEntrance } from './layout';
import { escapeXml } from '../escapeXml';

/** PEC schedule, title block, notes, column headers, SPD ground bus and border frame. */
export function drawAnnotations(this: SingleLineDiagramUI, model: SldSystemModel, c: AfterServiceEntrance) {
  const { isDark, wireColor, wireAccent, wireWarning, wireDanger, wireNeutral, wireMuted, bgColor, totalSvgWidth, totalSvgHeight, headerHeight, hasTransformer, strStartX, dcSpdX, dcBreakerX, invBoxX, invBoxW, acBreakerX, mdbBusX, acCombinerBreakerX, transformerX, xfmSecBreakerX, mdpX, mdpW, utilityCenterLineX, stringYPositions, mdpBottomY } = c;
  // 4. Philippine Electrical Code (PEC 2017) Cable & Conduit Schedule (Placed compactly near MDP in open space)
  const tableW = 640;
  const tableX = mdpX - 100;
  const tableY = mdpBottomY + 20;
  const { svg: pecScheduleSvg, height: scheduleTableHeight } = this.generatePecScheduleSvg(
    model,
    tableX,
    tableY,
    tableW,
    {
      wireColor,
      wireAccent,
      wireWarning,
      wireDanger,
      wireNeutral,
      wireMuted,
      bgColor,
      isDark
    }
  );

  // Standard CAD Engineering Drawing Title Block (Bottom Right)
  const titleBlockW = 580;
  const titleBlockH = 140;
  const titleBlockX = totalSvgWidth - titleBlockW - 50;
  const tableBottomY = tableY + scheduleTableHeight;
  // Guaranteed non-overlapping placement: Title Block is always at least 40px below the schedule table
  const titleBlockY = Math.max(totalSvgHeight - titleBlockH - 35, tableBottomY + 40);
  const effectiveSvgHeight = Math.max(totalSvgHeight, titleBlockY + titleBlockH + 35);
  const today = new Date().toISOString().split('T')[0];

  const titleBlockSvg = `
    <g class="wireframe-title-block" transform="translate(${titleBlockX}, ${titleBlockY})">
      <!-- Outer Title Block Frame -->
      <rect x="0" y="0" width="${titleBlockW}" height="${titleBlockH}" fill="none" stroke="${wireNeutral}" stroke-width="2" />

      <!-- Horizontal Divider Lines -->
      <line x1="0" y1="36" x2="${titleBlockW}" y2="36" stroke="${wireNeutral}" stroke-width="1.2" />
      <line x1="0" y1="72" x2="${titleBlockW}" y2="72" stroke="${wireNeutral}" stroke-width="1.2" />
      <line x1="0" y1="106" x2="${titleBlockW}" y2="106" stroke="${wireNeutral}" stroke-width="1.2" />

      <!-- Vertical Divider Lines -->
      <line x1="280" y1="0" x2="280" y2="72" stroke="${wireNeutral}" stroke-width="1.2" />
      <line x1="180" y1="72" x2="180" y2="${titleBlockH}" stroke="${wireNeutral}" stroke-width="1.2" />
      <line x1="380" y1="72" x2="380" y2="${titleBlockH}" stroke="${wireNeutral}" stroke-width="1.2" />

      <!-- Row 1: Project & Drawing Title -->
      <text x="12" y="16" fill="${wireMuted}" font-family="sans-serif" font-size="8">PROJECT:</text>
      <text x="12" y="28" fill="${wireNeutral}" font-family="monospace" font-size="11" font-weight="bold">${escapeXml(this.store.projectName || 'Solar Geo Planner')}</text>

      <text x="292" y="16" fill="${wireMuted}" font-family="sans-serif" font-size="8">DRAWING TYPE:</text>
      <text x="292" y="28" fill="${wireColor}" font-family="monospace" font-size="12" font-weight="bold">ELECTRICAL SINGLE LINE DIAGRAM (SLD)</text>

      <!-- Row 2: Selected System & Electrical Ratings -->
      <text x="12" y="50" fill="${wireMuted}" font-family="sans-serif" font-size="8">ELECTRICAL SYSTEM:</text>
      <text x="12" y="64" fill="${wireNeutral}" font-family="monospace" font-size="11" font-weight="bold">${escapeXml(model.system.name)}</text>

      <text x="292" y="50" fill="${wireMuted}" font-family="sans-serif" font-size="8">CAPACITY (DC / AC):</text>
      <text x="292" y="64" fill="${wireAccent}" font-family="monospace" font-size="11" font-weight="bold">${model.totalDcKwp} kWp DC  /  ${model.totalAcKw} kW AC  (DC/AC ${model.overallDcAcRatio})</text>

      <!-- Row 3: Design Specs & Standards -->
      <text x="12" y="86" fill="${wireMuted}" font-family="sans-serif" font-size="8">ELECTRICAL CODE &amp; WIRING:</text>
      <text x="12" y="98" fill="${wireAccent}" font-family="monospace" font-size="9.5" font-weight="bold">PEC 2017 Cu THHN/THWN-2</text>

      <text x="192" y="86" fill="${wireMuted}" font-family="sans-serif" font-size="8">VOLTAGE (INV / SYSTEM):</text>
      <text x="192" y="98" fill="${wireNeutral}" font-family="monospace" font-size="9.5">Inv: ${model.acVoltage}V / Tap: ${model.systemVoltageV}V ${model.isThreePhase ? '3Φ' : '1Φ'}</text>

      <text x="392" y="86" fill="${wireMuted}" font-family="sans-serif" font-size="8">MDP INTERCONNECTION:</text>
      <text x="392" y="98" fill="${wireAccent}" font-family="monospace" font-size="8.5" font-weight="bold">${model.mdpTapType === 'line_side' ? 'Line-Side Tap (PEC 6.90.8.1)' : 'Load-Side 120% (PEC 6.90.8.2)'} • ${model.mdpMainBreakerRatingA}A Main</text>

      <!-- Row 4: Meta, Scale & Date -->
      <text x="12" y="120" fill="${wireMuted}" font-family="sans-serif" font-size="8">DATE: ${today}</text>
      <text x="12" y="132" fill="${wireMuted}" font-family="sans-serif" font-size="8">SYSTEM ID: ${escapeXml(model.system.id)}</text>

      <text x="192" y="120" fill="${wireMuted}" font-family="sans-serif" font-size="8">CAD STATUS: 2D WIREFRAME ONLY</text>
      <text x="192" y="132" fill="${wireMuted}" font-family="sans-serif" font-size="8">STRINGS: ${model.strings.length} | COMBINER: ${model.hasAcCombiner ? 'YES' : 'NO'}${hasTransformer ? ` | XFM: ${model.transformerDesign.transformerKva}kVA` : ''}</text>

      <text x="392" y="124" fill="${wireWarning}" font-family="monospace" font-size="11" font-weight="bold">ANTIGRAVITY CAD</text>
    </g>
  `;

  // Drawing Legend / Notes Block (Bottom Left)
  const legendX = strStartX;
  const legendY = titleBlockY;
  const legendSvg = `
    <g class="wireframe-legend" transform="translate(${legendX}, ${legendY})">
      <rect x="0" y="0" width="500" height="${titleBlockH}" fill="none" stroke="${wireMuted}" stroke-width="1.2" stroke-dasharray="4,4" />
      <text x="12" y="18" fill="${wireMuted}" font-family="monospace" font-size="9.5" font-weight="bold">GENERAL ELECTRICAL NOTES (PHILIPPINE ELECTRICAL CODE 2017):</text>
      <text x="12" y="34" fill="${wireMuted}" font-family="sans-serif" font-size="8.2">1. DC Homeruns: ${model.dcStringWireSizing.cableMm2}mm² 1500V DC PV1-F solar cable (PEC 6.90.2.1 continuous duty 1.56× Isc).</text>
      <text x="12" y="48" fill="${wireMuted}" font-family="sans-serif" font-size="8.2">2. DC Protection: 2-pole DC Circuit Breakers (25A ${model.inverter.maxDcVoltage}V DC) with parallel grounded Type 2 DC SPDs.</text>
      <text x="12" y="62" fill="${wireMuted}" font-family="sans-serif" font-size="8.2">3. Inverter Feeders: ${model.inverters[0]?.pecWireSizing.fullCallout || 'Cu THHN/THWN-2 in EMT'} (PEC 3.10.2.6(b)(16) 75°C).</text>
      <text x="12" y="76" fill="${wireMuted}" font-family="sans-serif" font-size="8.2">4. Interconnection: MDP Main Breaker ${model.mdpMainBreakerRatingA}A. Interconnection method: ${model.mdpTapType === 'line_side' ? 'PEC 6.90.8.1 Line-Side Tap (Between Utility Meter &amp; Main Breaker)' : 'PEC 6.90.8.2 Load-Side Tap (120% Bus Rule)'}.</text>
      <text x="12" y="90" fill="${wireMuted}" font-family="sans-serif" font-size="8.2">5. Building Load: Always tapped on the Load Side of the MDP Main Breaker.</text>
      ${hasTransformer ? `<text x="12" y="104" fill="${wireAccent}" font-family="monospace" font-size="8.2">6. Transformer: ${model.transformerDesign.transformerKva}kVA ${model.transformerDesign.type === 'step_up' ? 'Step-Up' : 'Step-Down'} (${model.transformerDesign.primaryVoltageV}V➔${model.transformerDesign.secondaryVoltageV}V) sized per PEC 4.50 / Article 4.50.</text>` : `<text x="12" y="104" fill="${wireMuted}" font-family="sans-serif" font-size="8.2">6. Raceways &amp; Conduit: EMT / RMC sized per PEC Chapter 9 Table 10.1.1.4 (max 40% conduit fill).</text>`}
      <text x="12" y="120" fill="${wireAccent}" font-family="monospace" font-size="8.2">7. Grounding: Equipment Grounding Conductors (EGC) strictly sized per PEC 2017 Table 2.50.6.13.</text>
    </g>
  `;

  // Stage Column Headers
  const columnHeadersSvg = `
    <g class="wireframe-column-headers" transform="translate(0, ${headerHeight - 20})">
      <line x1="${strStartX}" y1="20" x2="${mdpX + mdpW}" y2="20" stroke="${wireMuted}" stroke-width="1" stroke-dasharray="2,4" />

      <text x="${strStartX + 130}" y="10" fill="${wireColor}" font-family="monospace" font-size="11" text-anchor="middle" font-weight="bold">1. PV STRINGS</text>
      <text x="${dcSpdX + 23}" y="10" fill="${wireColor}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">DC SPD (⏚)</text>
      <text x="${dcBreakerX + 22}" y="10" fill="${wireDanger}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">DC BREAKER</text>
      <text x="${invBoxX + invBoxW / 2}" y="10" fill="${wireColor}" font-family="monospace" font-size="11" text-anchor="middle" font-weight="bold">2. INVERTERS</text>
      <text x="${acBreakerX + 18}" y="10" fill="${wireAccent}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">INV CB</text>
      <text x="${mdbBusX}" y="10" fill="${wireAccent}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">${model.hasAcCombiner ? '3. AC COMBINER' : '3. AC BUS'}</text>
      ${model.hasAcCombiner ? `<text x="${acCombinerBreakerX + 20}" y="10" fill="${wireAccent}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">COMBINER CB</text>` : ''}
      ${hasTransformer ? `
        <text x="${transformerX + 42}" y="10" fill="${wireWarning}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">4. TRANSFORMER</text>
        <text x="${xfmSecBreakerX + 20}" y="10" fill="${wireDanger}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">SEC CB</text>
      ` : ''}
      <text x="${utilityCenterLineX}" y="10" fill="${wireNeutral}" font-family="monospace" font-size="10.5" text-anchor="middle" font-weight="bold">${hasTransformer ? '5.' : '4.'} UTILITY GRID ➔ METER ➔ MDP</text>
    </g>
  `;

  // Vertical Equipment Grounding Conductor (EGC) Bus for DC SPDs to Ground Rod
  let spdGroundBusSvg = '';
  if (model.strings.length > 0 && stringYPositions.length > 0) {
    const firstY = stringYPositions[0] + 20;
    const lastY = stringYPositions[stringYPositions.length - 1] + 20;
    const groundRodY = lastY + 36;
    spdGroundBusSvg = `
      <!-- DC SPD Equipment Grounding Conductor (EGC) Bus to Ground Rod -->
      <g class="wireframe-dc-ground-bus">
        <line x1="${dcSpdX + 20}" y1="${firstY}" x2="${dcSpdX + 20}" y2="${groundRodY}" stroke="${wireAccent}" stroke-width="1.8" />
        <!-- Earth ground symbol (⏚) -->
        <line x1="${dcSpdX + 11}" y1="${groundRodY}" x2="${dcSpdX + 29}" y2="${groundRodY}" stroke="${wireAccent}" stroke-width="2.5" />
        <line x1="${dcSpdX + 14}" y1="${groundRodY + 4}" x2="${dcSpdX + 26}" y2="${groundRodY + 4}" stroke="${wireAccent}" stroke-width="1.8" />
        <line x1="${dcSpdX + 17}" y1="${groundRodY + 8}" x2="${dcSpdX + 23}" y2="${groundRodY + 8}" stroke="${wireAccent}" stroke-width="1.4" />
        <text x="${dcSpdX + 20}" y="${groundRodY + 22}" fill="${wireAccent}" font-family="monospace" font-size="8" text-anchor="middle" font-weight="bold">TO GROUND ROD (PEC 2.50)</text>
      </g>
    `;
  }

  // Blueprint / CAD Engineering Border Frame
  const borderFrameSvg = `
    <rect x="20" y="20" width="${totalSvgWidth - 40}" height="${effectiveSvgHeight - 40}" fill="none" stroke="${wireNeutral}" stroke-width="2" />
    <rect x="26" y="26" width="${totalSvgWidth - 52}" height="${effectiveSvgHeight - 52}" fill="none" stroke="${wireNeutral}" stroke-width="1" />

    <!-- Top Title Banner -->
    <text x="45" y="60" fill="${wireNeutral}" font-family="monospace" font-size="18" font-weight="bold">ELECTRICAL SINGLE LINE DIAGRAM (2D WIREFRAME)</text>
    <text x="45" y="82" fill="${wireColor}" font-family="monospace" font-size="13">SYSTEM: ${escapeXml(model.system.name)} • ${model.totalDcKwp} kWp DC • ${model.totalAcKw} kW AC • ${model.strings.length} STRINGS</text>
    <text x="${totalSvgWidth - 50}" y="60" fill="${wireMuted}" font-family="monospace" font-size="11" text-anchor="end">PEC 2017 / NEC 690 / IEC 60364-7-712</text>
    <line x1="45" y1="95" x2="${totalSvgWidth - 50}" y2="95" stroke="${wireNeutral}" stroke-width="1.5" />
  `;

  return { pecScheduleSvg, effectiveSvgHeight, titleBlockSvg, legendSvg, columnHeadersSvg, spdGroundBusSvg, borderFrameSvg };
}
