/**
 * SLD SVG drawing: canvas sizing, the wireframe diagram and standalone export SVG.
 */
import { type SldSystemModel } from '../../geo/sldModel';
import type { SingleLineDiagramUI } from '../sldView';
import { escapeXml } from './escapeXml';

/**
 * Computes layout dimensions for the SLD drawing canvas based on system components,
 * string counts, inverter count, transformer presence, and the embedded PEC schedule table.
 * Ensures mathematically guaranteed clearance so the schedule table NEVER overlaps with the Title block.
 */
export function getSldDimensions(
  this: SingleLineDiagramUI,
  model: SldSystemModel
): { totalSvgWidth: number; totalSvgHeight: number } {
  const stringCount = Math.max(model.strings.length, 1);
  const rowHeight = 72;
  const headerHeight = 140;
  const footerHeight = 220;
  const contentHeight = Math.max(stringCount * rowHeight, 540);
  const hasTransformer = model.transformerDesign.required;
  const totalSvgWidth = hasTransformer ? 3550 : 2980;

  // Exact schedule table row count and height calculation
  const dcRows = 1;
  const invRows = model.inverters.length <= 4 ? model.inverters.length : 1;
  const combinerRows = model.hasAcCombiner ? 1 : 0;
  const xfmRows = model.transformerDesign.required ? 2 : 0;
  const mdpRows = 1;
  const scheduleRowCount = dcRows + invRows + combinerRows + xfmRows + mdpRows;
  const titleH = 22;
  const headerH = 26;
  const rowH = 26;
  const footerH = 18;
  const scheduleTableHeight = titleH + headerH + scheduleRowCount * rowH + footerH;

  // Exact MDP vertical placement
  const startY = headerHeight + 30;
  const invTotalHeight = Math.max((stringCount - 1) * rowHeight + 60, 540);
  const busTopY = startY + 10;
  const busBottomY = startY + invTotalHeight - 20;
  const mdbCenterY = (busTopY + busBottomY) / 2;
  const mdpTopY = mdbCenterY - 110;
  const mdpBottomY = mdpTopY + 275;

  const tableY = mdpBottomY + 20;
  const tableBottomY = tableY + scheduleTableHeight;

  const titleBlockH = 140;
  const bottomMargin = 35;
  const minGap = 40; // 40px guaranteed clearance between table bottom and title block top

  const minRequiredHeight = tableBottomY + minGap + titleBlockH + bottomMargin;
  const totalSvgHeight = Math.max(960, headerHeight + contentHeight + footerHeight, minRequiredHeight);

  return { totalSvgWidth, totalSvgHeight };
}

/**
 * Generates pure 2D Wireframe vector SVG string
 */
export function generateWireframeSvg(this: SingleLineDiagramUI, model: SldSystemModel): string {
  const isDark = this.currentTheme !== 'paper';
  const wireColor = isDark ? '#38bdf8' : '#0369a1';
  const wireAccent = isDark ? '#10b981' : '#059669';
  const wireWarning = isDark ? '#f59e0b' : '#d97706';
  const wireDanger = isDark ? '#ef4444' : '#dc2626';
  const wireNeutral = isDark ? '#f8fafc' : '#0f172a';
  const wireMuted = isDark ? '#64748b' : '#94a3b8';
  const wireGrid = isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(15, 23, 42, 0.06)';
  const bgColor = this.currentTheme === 'cad-mono' ? '#090d16' : this.currentTheme === 'blueprint' ? '#081226' : '#f8fafc';

  // Layout Dimensions Calculation
  const { totalSvgWidth, totalSvgHeight } = this.getSldDimensions(model);
  const headerHeight = 140;
  const rowHeight = 72;
  const hasTransformer = model.transformerDesign.required;

  // Component Horizontal Columns:
  // Col 1: Strings (X: 60 - 320)
  // Col 2: DC Protection / Breakers (X: 380 - 424)
  // Col 3: DC Isolators & SPDs (X: 500 - 580)
  // Col 4: Inverter MPPT Inputs & Inverter Enclosure (X: 680 - 1080)
  // Col 5: AC Output & Breakers (X: 1080 - 1440)
  // Col 6: AC Combiner / Collector Bus (X: 1560) & Breaker (X: 1750)
  // Col 7: Transformer (if required) & Secondary Breaker (X: 2020 - 2400)
  // Col 8: Main Distribution Panel (MDP) with Load/Line side tap (X: 2580 or 2020)
  // Col 9: Bi-directional Revenue Utility Meter (X: 3120 or 2560) - Meter before MDP from Grid
  // Col 10: Point of Common Coupling (PCC Grid) (X: 3380 or 2820)

  const strStartX = 60;
  const dcSpdX = 410;
  const dcBreakerX = 520;
  const mpptBusX = 680;
  const invBoxX = 760;
  const invBoxW = 320;
  const acBreakerX = 1400;
  const mdbBusX = 1560;
  const acCombinerBreakerX = 1750;
  const transformerX = 2020;
  const xfmSecBreakerX = 2360;
  const mdpX = hasTransformer ? 2580 : 2020;
  const mdpW = 440;
  const utilityCenterLineX = mdpX + 200;

  let stringsSvg = '';
  let dcConnectionsSvg = '';

  // Calculate Y positions for each string row
  const startY = headerHeight + 30;
  const stringYPositions: number[] = [];

  if (model.strings.length === 0) {
    // Empty state placeholder wireframe
    stringsSvg = `
      <g class="wireframe-empty-state">
        <rect x="${strStartX}" y="${startY}" width="250" height="90" fill="none" stroke="${wireMuted}" stroke-width="1.5" stroke-dasharray="6,4" />
        <text x="${strStartX + 125}" y="${startY + 40}" fill="${wireMuted}" font-family="monospace" font-size="12" text-anchor="middle">NO ACTIVE STRINGS</text>
        <text x="${strStartX + 125}" y="${startY + 60}" fill="${wireMuted}" font-family="sans-serif" font-size="11" text-anchor="middle">Plot arrays &amp; auto-string system</text>
      </g>
    `;
    stringYPositions.push(startY + 45);
  } else {
    model.strings.forEach((str, idx) => {
      const y = startY + idx * rowHeight;
      stringYPositions.push(y);

      // 2D Wireframe PV String Symbol
      const isCompliant = str.isVoltageCompliant;
      stringsSvg += `
        <g class="wireframe-string ${!isCompliant ? 'wireframe-string-danger' : ''}" id="sld-str-${str.stringId}">
          <!-- String Outer Box -->
          <rect x="${strStartX}" y="${y - 25}" width="260" height="52" fill="none" stroke="${isCompliant ? wireNeutral : wireDanger}" stroke-width="${isCompliant ? '1.5' : '2.5'}" rx="3" />

          <!-- PV Module schematic symbol (diode cells & diagonal arrows) -->
          <rect x="${strStartX + 8}" y="${y - 18}" width="28" height="36" fill="none" stroke="${isCompliant ? wireColor : wireDanger}" stroke-width="1.2" />
          <line x1="${strStartX + 8}" y1="${y}" x2="${strStartX + 36}" y2="${y}" stroke="${isCompliant ? wireColor : wireDanger}" stroke-width="1.2" />
          <line x1="${strStartX + 22}" y1="${y - 18}" x2="${strStartX + 22}" y2="${y + 18}" stroke="${isCompliant ? wireColor : wireDanger}" stroke-width="1.2" />
          <!-- Solar Rays -->
          <line x1="${strStartX + 3}" y1="${y - 22}" x2="${strStartX + 10}" y2="${y - 15}" stroke="${wireWarning}" stroke-width="1" />
          <line x1="${strStartX + 8}" y1="${y - 25}" x2="${strStartX + 15}" y2="${y - 18}" stroke="${wireWarning}" stroke-width="1" />

          <!-- String Text Info -->
          <text x="${strStartX + 44}" y="${y - 8}" fill="${isCompliant ? wireNeutral : wireDanger}" font-family="monospace" font-size="12" font-weight="bold">${str.stringId}</text>
          <text x="${strStartX + 44}" y="${y + 7}" fill="${wireMuted}" font-family="monospace" font-size="10">${str.panelCount}× ${str.nominalPowerW}W (${str.totalKwp} kWp)</text>
          <text x="${strStartX + 44}" y="${y + 20}" fill="${isCompliant ? wireAccent : wireDanger}" font-family="monospace" font-size="10" ${!isCompliant ? 'font-weight="bold"' : ''}>Vmp: ${str.vmp}V | Voc: ${str.voc}V${!isCompliant ? ` (Cold: ${str.coldVoc}V > ${model.inverter.maxDcVoltage}V!)` : ''}</text>

          ${
            !isCompliant
              ? `
            <rect x="${strStartX + 135}" y="${y - 23}" width="120" height="15" fill="${wireDanger}" opacity="0.25" rx="2" />
            <text x="${strStartX + 195}" y="${y - 12}" fill="${wireDanger}" font-family="monospace" font-size="9" font-weight="bold" text-anchor="middle">⚠️ EXCEEDS VMAX</text>
          `
              : ''
          }

          <!-- Output Positive & Negative wireframe terminal lines from String to DC SPD -->
          <line x1="${strStartX + 260}" y1="${y - 12}" x2="${dcSpdX}" y2="${y - 12}" stroke="${wireDanger}" stroke-width="1.5" />
          <text x="${strStartX + 264}" y="${y - 15}" fill="${wireDanger}" font-family="monospace" font-size="8">(+) ${model.dcStringWireSizing.cableMm2}mm²</text>

          <line x1="${strStartX + 260}" y1="${y + 12}" x2="${dcSpdX}" y2="${y + 12}" stroke="${wireNeutral}" stroke-width="1.5" />
          <text x="${strStartX + 264}" y="${y + 22}" fill="${wireNeutral}" font-family="monospace" font-size="8">(−) ${model.dcStringWireSizing.cableMm2}mm²</text>

          <!-- 2-Pole Modular DC Surge Protective Device (DC SPD) tapped ahead of DC Breaker -->
          <g class="wireframe-dc-spd" id="sld-dc-spd-${str.stringId}" transform="translate(${dcSpdX}, ${y - 20})">
            <!-- Junction node dots tapping in parallel from (+) and (−) homerun feeders -->
            <circle cx="0" cy="8" r="2.5" fill="${wireDanger}" />
            <circle cx="0" cy="32" r="2.5" fill="${wireNeutral}" />

            <!-- Outer SPD Enclosure (2-Pole DIN Rail Modular Arrester) -->
            <rect x="0" y="0" width="46" height="40" fill="${bgColor}" stroke="${wireColor}" stroke-width="1.5" rx="2" />
            <!-- Pole separator divider -->
            <line x1="0" y1="20" x2="46" y2="20" stroke="${wireMuted}" stroke-width="0.8" stroke-dasharray="2,2" />

            <!-- Pole 1 (DC+) MOV Surge Arrester Symbol -->
            <line x1="0" y1="8" x2="12" y2="8" stroke="${wireDanger}" stroke-width="1.5" />
            <rect x="12" y="4" width="16" height="8" fill="none" stroke="${wireDanger}" stroke-width="1.2" />
            <line x1="10" y1="14" x2="30" y2="2" stroke="${wireDanger}" stroke-width="1.2" />
            <line x1="10" y1="14" x2="8" y2="14" stroke="${wireDanger}" stroke-width="1.2" />
            <line x1="28" y1="8" x2="46" y2="8" stroke="${wireDanger}" stroke-width="1.5" />
            <!-- Healthy MOV operating flag (Green indicator window) -->
            <rect x="33" y="5" width="8" height="6" fill="#10b981" rx="1" />
            <text x="6" y="6" fill="${wireDanger}" font-family="monospace" font-size="6.5" font-weight="bold">DC+</text>

            <!-- Pole 2 (DC-) MOV Surge Arrester Symbol -->
            <line x1="0" y1="32" x2="12" y2="32" stroke="${wireNeutral}" stroke-width="1.5" />
            <rect x="12" y="28" width="16" height="8" fill="none" stroke="${wireNeutral}" stroke-width="1.2" />
            <line x1="10" y1="38" x2="30" y2="26" stroke="${wireNeutral}" stroke-width="1.2" />
            <line x1="10" y1="38" x2="8" y2="38" stroke="${wireNeutral}" stroke-width="1.2" />
            <line x1="28" y1="32" x2="46" y2="32" stroke="${wireNeutral}" stroke-width="1.5" />
            <!-- Healthy MOV operating flag (Green indicator window) -->
            <rect x="33" y="29" width="8" height="6" fill="#10b981" rx="1" />
            <text x="6" y="38" fill="${wireNeutral}" font-family="monospace" font-size="6.5" font-weight="bold">DC−</text>

            <!-- Surge lightning symbol (⚡) -->
            <path d="M 5 17 L 8 20 L 4 20 L 7 23" fill="none" stroke="${wireWarning}" stroke-width="1.2" />

            <!-- Internal Ground Bus connecting both poles to Earth PE terminal -->
            <line x1="20" y1="8" x2="20" y2="32" stroke="${wireAccent}" stroke-width="1.5" />
            <line x1="20" y1="32" x2="20" y2="40" stroke="${wireAccent}" stroke-width="1.5" />
            <circle cx="20" cy="40" r="2" fill="${wireAccent}" />

            <!-- SPD Module Labels -->
            <text x="23" y="-12" fill="${wireColor}" font-family="monospace" font-size="8.5" text-anchor="middle" font-weight="bold">DC SPD</text>
            <text x="23" y="-4" fill="${wireMuted}" font-family="monospace" font-size="7" text-anchor="middle">Type 2</text>
            <text x="26" y="47" fill="${wireAccent}" font-family="monospace" font-size="6.5">PE GND</text>
          </g>

          <!-- Conductors continuing from DC SPD to 2-Pole DC MCB Breaker -->
          <line x1="${dcSpdX + 46}" y1="${y - 12}" x2="${dcBreakerX}" y2="${y - 12}" stroke="${wireDanger}" stroke-width="1.5" />
          <line x1="${dcSpdX + 46}" y1="${y + 12}" x2="${dcBreakerX}" y2="${y + 12}" stroke="${wireNeutral}" stroke-width="1.5" />

          <!-- 2-Pole DC Circuit Breaker (DC MCB) -->
          <g class="wireframe-dc-breaker" id="sld-dc-breaker-${str.stringId}" transform="translate(${dcBreakerX}, ${y - 20})">
            <!-- Outer Breaker Box -->
            <rect x="0" y="0" width="44" height="40" fill="none" stroke="${wireDanger}" stroke-width="1.8" rx="2" />

            <!-- Pole 1 (+) Trip Contact Cross -->
            <line x1="8" y1="4" x2="20" y2="12" stroke="${wireDanger}" stroke-width="1.8" />
            <line x1="20" y1="4" x2="8" y2="12" stroke="${wireDanger}" stroke-width="1.8" />
            <line x1="-6" y1="8" x2="8" y2="8" stroke="${wireDanger}" stroke-width="1.5" />
            <line x1="20" y1="8" x2="50" y2="8" stroke="${wireDanger}" stroke-width="1.5" />

            <!-- Pole 2 (−) Trip Contact Cross -->
            <line x1="8" y1="28" x2="20" y2="36" stroke="${wireNeutral}" stroke-width="1.8" />
            <line x1="20" y1="28" x2="8" y2="36" stroke="${wireNeutral}" stroke-width="1.8" />
            <line x1="-6" y1="32" x2="8" y2="32" stroke="${wireNeutral}" stroke-width="1.5" />
            <line x1="20" y1="32" x2="50" y2="32" stroke="${wireNeutral}" stroke-width="1.5" />

            <!-- Dashed ganged-pole mechanical trip tie -->
            <line x1="14" y1="13" x2="14" y2="27" stroke="${wireMuted}" stroke-width="1.2" stroke-dasharray="2,2" />

            <!-- Breaker labels -->
            <text x="22" y="-5" fill="${wireDanger}" font-family="monospace" font-size="8.5" text-anchor="middle" font-weight="bold">2P DC MCB</text>
            <text x="22" y="50" fill="${wireNeutral}" font-family="monospace" font-size="7.5" text-anchor="middle">25A ${model.inverter.maxDcVoltage}V</text>
          </g>

          <!-- Conductors from DC Breaker to MPPT Input Bus -->
          <line x1="${dcBreakerX + 44}" y1="${y - 12}" x2="${mpptBusX}" y2="${y - 12}" stroke="${wireDanger}" stroke-width="1.5" />
          <line x1="${dcBreakerX + 44}" y1="${y + 12}" x2="${mpptBusX}" y2="${y + 12}" stroke="${wireNeutral}" stroke-width="1.5" />

          <!-- Conductor callout -->
          <text x="${dcBreakerX + 50}" y="${y - 16}" fill="${wireAccent}" font-family="monospace" font-size="8">PEC: 2× ${model.dcStringWireSizing.cableMm2}mm² PV1-F</text>
        </g>
      `;
    });
  }

  // Inverter Section Generation
  let invertersSvg = '';
  const invCount = model.inverters.length;
  const invTotalHeight = Math.max(stringYPositions[stringYPositions.length - 1] - stringYPositions[0] + 60, 540);
  const singleInvHeight = Math.floor(invTotalHeight / invCount);

  model.inverters.forEach((inv, invIndex) => {
    const invY = startY + invIndex * singleInvHeight;
    const invCenterY = invY + singleInvHeight / 2;

    // MPPT input terminal channels
    let mpptChannelsSvg = '';
    inv.mppts.forEach((mppt, mIndex) => {
      const mpptY = invY + 40 + mIndex * Math.max(34, Math.floor((singleInvHeight - 70) / inv.mppts.length));

      // Connect matching strings to this MPPT terminal
      mppt.strings.forEach(str => {
        const strIdx = model.strings.findIndex(s => s.stringId === str.stringId);
        if (strIdx >= 0) {
          const strY = stringYPositions[strIdx];
          // Positive conductor path to MPPT
          dcConnectionsSvg += `
            <path d="M ${mpptBusX} ${strY - 12} L ${mpptBusX + 30} ${strY - 12} L ${mpptBusX + 50} ${mpptY} L ${invBoxX} ${mpptY}" fill="none" stroke="${wireDanger}" stroke-width="1.5" />
            <!-- Junction node dot -->
            <circle cx="${mpptBusX + 30}" cy="${strY - 12}" r="3" fill="${wireDanger}" />
          `;
          // Negative conductor path to MPPT
          dcConnectionsSvg += `
            <path d="M ${mpptBusX} ${strY + 12} L ${mpptBusX + 30} ${strY + 12} L ${mpptBusX + 50} ${mpptY + 6} L ${invBoxX} ${mpptY + 6}" fill="none" stroke="${wireNeutral}" stroke-width="1.5" />
            <circle cx="${mpptBusX + 30}" cy="${strY + 12}" r="3" fill="${wireNeutral}" />
          `;
        }
      });

      mpptChannelsSvg += `
        <g class="wireframe-mppt-channel" transform="translate(${invBoxX + 10}, ${mpptY - 10})">
          <rect x="0" y="0" width="85" height="24" fill="none" stroke="${wireColor}" stroke-width="1" />
          <text x="42" y="15" fill="${wireColor}" font-family="monospace" font-size="10" text-anchor="middle">MPPT #${mppt.mpptIndex} (${mppt.strings.length}S)</text>
        </g>
      `;
    });

    // Internal DC/AC Conversion Schematic Symbol (Square with diagonal dividing slash)
    const convX = invBoxX + 140;
    const convY = invCenterY - 45;
    const convSize = 90;

    // Inverter Unit Outer Boundary
    invertersSvg += `
      <g class="wireframe-inverter-unit" id="sld-inv-${inv.inverterIndex}">
        <!-- Inverter Enclosure (Dashed CAD wireframe boundary) -->
        <rect x="${invBoxX}" y="${invY}" width="${invBoxW}" height="${singleInvHeight - 15}" fill="none" stroke="${wireColor}" stroke-width="2" stroke-dasharray="6,4" rx="4" />

        <!-- Header label -->
        <rect x="${invBoxX}" y="${invY}" width="${invBoxW}" height="26" fill="none" stroke="${wireColor}" stroke-width="1.5" />
        <text x="${invBoxX + 10}" y="${invY + 17}" fill="${wireColor}" font-family="monospace" font-size="12" font-weight="bold">INVERTER #${inv.inverterIndex}: ${escapeXml(inv.modelName)}</text>

        <!-- MPPT Inputs -->
        ${mpptChannelsSvg}

        <!-- Internal Bus Lines to Inverter Conversion Block -->
        <line x1="${invBoxX + 95}" y1="${invCenterY}" x2="${convX}" y2="${invCenterY}" stroke="${wireDanger}" stroke-width="2" />

        <!-- Conversion Block (Square with Diagonal Slash) -->
        <rect x="${convX}" y="${convY}" width="${convSize}" height="${convSize}" fill="none" stroke="${wireNeutral}" stroke-width="2" />
        <line x1="${convX}" y1="${convY + convSize}" x2="${convX + convSize}" y2="${convY}" stroke="${wireNeutral}" stroke-width="2" />

        <!-- DC Symbol in bottom-left triangle: = -->
        <line x1="${convX + 15}" y1="${convY + convSize - 25}" x2="${convX + 40}" y2="${convY + convSize - 25}" stroke="${wireDanger}" stroke-width="2" />
        <line x1="${convX + 15}" y1="${convY + convSize - 18}" x2="${convX + 40}" y2="${convY + convSize - 18}" stroke="${wireDanger}" stroke-width="2" />
        <text x="${convX + 27}" y="${convY + convSize - 32}" fill="${wireDanger}" font-family="monospace" font-size="9" text-anchor="middle">DC</text>

        <!-- AC Sine Wave Symbol in top-right triangle: ~ -->
        <path d="M ${convX + convSize - 40} ${convY + 25} Q ${convX + convSize - 32} ${convY + 15}, ${convX + convSize - 25} ${convY + 25} T ${convX + convSize - 10} ${convY + 25}" fill="none" stroke="${wireAccent}" stroke-width="2" />
        <text x="${convX + convSize - 25}" y="${convY + 40}" fill="${wireAccent}" font-family="monospace" font-size="9" text-anchor="middle">AC ${model.isThreePhase ? '3Φ' : '1Φ'}</text>

        <!-- Inverter Telemetry Notes -->
        <text x="${convX + 45}" y="${convY + convSize + 18}" fill="${wireAccent}" font-family="monospace" font-size="11" text-anchor="middle" font-weight="bold">${inv.ratedAcKw} kW AC Output</text>
        <text x="${convX + 45}" y="${convY + convSize + 32}" fill="${wireMuted}" font-family="monospace" font-size="9" text-anchor="middle">${inv.ratedAcCurrentA}A @ ${inv.acVoltage}V ${inv.gridFrequencyHz}Hz</text>
        <text x="${convX + 45}" y="${convY + convSize + 44}" fill="${wireMuted}" font-family="monospace" font-size="9" text-anchor="middle">DC/AC Loading: ${inv.dcAcRatio}</text>

        <!-- Equipment Ground / Protective Earth (PE) -->
        <g class="wireframe-ground" transform="translate(${invBoxX + 40}, ${invY + singleInvHeight - 35})">
          <line x1="0" y1="0" x2="0" y2="12" stroke="${wireAccent}" stroke-width="1.5" />
          <line x1="-12" y1="12" x2="12" y2="12" stroke="${wireAccent}" stroke-width="1.8" />
          <line x1="-8" y1="16" x2="8" y2="16" stroke="${wireAccent}" stroke-width="1.8" />
          <line x1="-4" y1="20" x2="4" y2="20" stroke="${wireAccent}" stroke-width="1.8" />
          <text x="18" y="16" fill="${wireAccent}" font-family="monospace" font-size="9">PE Ground</text>
        </g>

        <!-- AC Output Lead from Inverter to AC Circuit Breaker -->
        <line x1="${convX + convSize}" y1="${invCenterY}" x2="${acBreakerX}" y2="${invCenterY}" stroke="${wireAccent}" stroke-width="2.5" />

        <!-- AC Phase conductor slash callout (positioned cleanly outside inverter enclosure) -->
        <line x1="1105" y1="${invCenterY - 6}" x2="1111" y2="${invCenterY + 6}" stroke="${wireAccent}" stroke-width="1.2" />
        <line x1="1109" y1="${invCenterY - 6}" x2="1115" y2="${invCenterY + 6}" stroke="${wireAccent}" stroke-width="1.2" />
        ${model.isThreePhase ? `<line x1="1113" y1="${invCenterY - 6}" x2="1119" y2="${invCenterY + 6}" stroke="${wireAccent}" stroke-width="1.2" />` : ''}
        <text x="1112" y="${invCenterY - 9}" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="middle">${model.isThreePhase ? '3P+N+PE' : 'L+N+PE'}</text>

        <!-- Inverter AC Output Feeder Wire Sizing Callout (PEC 2017) -->
        <g class="wireframe-pec-feeder-badge" transform="translate(1240, ${invCenterY - 18})">
          <rect x="-85" y="-10" width="170" height="20" fill="${bgColor}" stroke="${wireAccent}" stroke-width="1.2" rx="3" />
          <text x="0" y="3.5" fill="${wireAccent}" font-family="monospace" font-size="8.5" text-anchor="middle" font-weight="bold">PEC: ${inv.pecWireSizing.compactCallout}</text>
        </g>
        <text x="1240" y="${invCenterY + 16}" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="middle">in ${inv.pecWireSizing.conduitLabel}</text>

        <!-- Inverter AC Circuit Breaker (MCCB symbol) -->
        <g class="wireframe-ac-breaker" transform="translate(${acBreakerX}, ${invCenterY - 18})">
          <rect x="0" y="0" width="36" height="36" fill="none" stroke="${wireAccent}" stroke-width="1.8" />
          <line x1="6" y1="6" x2="30" y2="30" stroke="${wireDanger}" stroke-width="2" />
          <line x1="30" y1="6" x2="6" y2="30" stroke="${wireDanger}" stroke-width="2" />
          <text x="18" y="-6" fill="${wireAccent}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">${model.isThreePhase ? 'MCCB' : 'MCB'}</text>
          <text x="18" y="48" fill="${wireNeutral}" font-family="monospace" font-size="9" text-anchor="middle">${inv.breakerRatingA}A ${model.isThreePhase ? '3P' : '2P'}</text>
          <text x="18" y="59" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="middle">I_des: ${inv.pecWireSizing.designCurrentA}A</text>
        </g>

        <!-- Conductor from Breaker to Main AC Combiner Bus (MDB) -->
        <line x1="${acBreakerX + 36}" y1="${invCenterY}" x2="${mdbBusX}" y2="${invCenterY}" stroke="${wireAccent}" stroke-width="2.5" />
        <circle cx="${mdbBusX}" cy="${invCenterY}" r="4" fill="${wireAccent}" />
      </g>
    `;
  });

  // Main AC Distribution Busbar & Interconnection Section
  const busTopY = startY + 10;
  const busBottomY = startY + invTotalHeight - 20;
  const mdbCenterY = (busTopY + busBottomY) / 2;

  // Conductor starting point towards transformer/meter
  const combinerLeadOutX = model.hasAcCombiner ? acCombinerBreakerX + 40 : mdbBusX;

  // 1. AC Combiner Busbar & Collector Breaker SVG
  let acCombinerSvg = `
    <!-- Main Inverter AC Busbar (Combiner Bus if hasAcCombiner) -->
    <line x1="${mdbBusX}" y1="${busTopY}" x2="${mdbBusX}" y2="${busBottomY}" stroke="${wireAccent}" stroke-width="5" stroke-linecap="round" />
    <text x="${mdbBusX}" y="${busTopY - 10}" fill="${wireAccent}" font-family="monospace" font-size="11" text-anchor="middle" font-weight="bold">${model.isThreePhase ? '3-PHASE' : 'SINGLE-PHASE'} MAIN AC BUSBAR (MDB)${model.hasAcCombiner ? ' / COMBINER (ACB)' : ''}</text>
    <text x="${mdbBusX}" y="${busBottomY + 16}" fill="${wireMuted}" font-family="monospace" font-size="9" text-anchor="middle">${model.acVoltage}V ${model.isThreePhase ? '3Φ' : '1Φ'} ${model.gridFrequencyHz}Hz</text>

    <!-- Surge Protective Device on AC Busbar (Type 1+2 SPD) -->
    <g class="wireframe-ac-spd" transform="translate(${mdbBusX - 45}, ${busBottomY - 40})">
      <line x1="45" y1="15" x2="0" y2="15" stroke="${wireAccent}" stroke-width="1.5" />
      <circle cx="45" cy="15" r="3" fill="${wireAccent}" />
      <rect x="-35" y="0" width="35" height="30" fill="none" stroke="${wireColor}" stroke-width="1.5" />
      <text x="-17" y="18" fill="${wireColor}" font-family="monospace" font-size="8" text-anchor="middle">SPD T1+2</text>
      <line x1="-17" y1="30" x2="-17" y2="40" stroke="${wireColor}" stroke-width="1.5" />
      <line x1="-24" y1="40" x2="-10" y2="40" stroke="${wireColor}" stroke-width="1.5" />
      <line x1="-21" y1="43" x2="-13" y2="43" stroke="${wireColor}" stroke-width="1.5" />
      <line x1="-18" y1="46" x2="-16" y2="46" stroke="${wireColor}" stroke-width="1.5" />
    </g>
  `;

  if (model.hasAcCombiner) {
    acCombinerSvg += `
      <!-- Conductor from Combiner Bus to Combiner Collector Breaker -->
      <line x1="${mdbBusX}" y1="${mdbCenterY}" x2="${acCombinerBreakerX}" y2="${mdbCenterY}" stroke="${wireAccent}" stroke-width="3" />

      <!-- AC Combiner Collector Breaker (MCCB) -->
      <g class="wireframe-combiner-breaker" transform="translate(${acCombinerBreakerX}, ${mdbCenterY - 20})">
        <rect x="0" y="0" width="40" height="40" fill="none" stroke="${wireAccent}" stroke-width="2" />
        <line x1="8" y1="8" x2="32" y2="32" stroke="${wireDanger}" stroke-width="2.5" />
        <line x1="32" y1="8" x2="8" y2="32" stroke="${wireDanger}" stroke-width="2.5" />
        <text x="20" y="-8" fill="${wireAccent}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">COLLECTOR MCCB</text>
        <text x="20" y="52" fill="${wireNeutral}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">${model.acCombinerBreakerRatingA}A ${model.isThreePhase ? '3P' : '2P'}</text>
        <text x="20" y="64" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="middle">AC Combiner Box</text>
      </g>
    `;
  }

  // 2. Transformer or Direct Feeder SVG
  let transformerOrFeederSvg = '';

  if (hasTransformer) {
    const xfm = model.transformerDesign;
    const priMidX = Math.round((combinerLeadOutX + transformerX) / 2);
    const secMidX = Math.round((transformerX + 84 + xfmSecBreakerX) / 2);

    transformerOrFeederSvg = `
      <!-- Primary Feeder from Combiner/Bus to Transformer Primary -->
      <line x1="${combinerLeadOutX}" y1="${mdbCenterY}" x2="${transformerX}" y2="${mdbCenterY}" stroke="${wireAccent}" stroke-width="3" />

      <!-- Primary Feeder PEC Wire Sizing Badge -->
      <g class="wireframe-xfm-pri-badge" transform="translate(${priMidX}, ${mdbCenterY - 20})">
        <rect x="-85" y="-10" width="170" height="20" fill="${bgColor}" stroke="${wireAccent}" stroke-width="1.3" rx="3" />
        <text x="0" y="3.5" fill="${wireAccent}" font-family="monospace" font-size="8.5" text-anchor="middle" font-weight="bold">PRI: ${xfm.primaryPecSizing.compactCallout}</text>
      </g>
      <text x="${priMidX}" y="${mdbCenterY + 16}" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="middle">in ${xfm.primaryPecSizing.conduitLabel}</text>

      <!-- Power Transformer Symbol (Two overlapping circles + Core + Ground) -->
      <g class="wireframe-transformer" transform="translate(${transformerX}, ${mdbCenterY})">
        <!-- Primary Winding Circle -->
        <circle cx="28" cy="-14" r="26" fill="none" stroke="${wireColor}" stroke-width="2.5" />
        <!-- Secondary Winding Circle -->
        <circle cx="56" cy="14" r="26" fill="none" stroke="${wireAccent}" stroke-width="2.5" />
        <!-- Core Separation Lines -->
        <line x1="38" y1="-32" x2="46" y2="32" stroke="${wireNeutral}" stroke-width="1.5" stroke-dasharray="3,2" />

        <!-- Transformer Specs & Ratings -->
        <text x="42" y="-48" fill="${wireNeutral}" font-family="monospace" font-size="11" text-anchor="middle" font-weight="bold">POWER TRANSFORMER</text>
        <text x="42" y="-36" fill="${wireWarning}" font-family="monospace" font-size="9" text-anchor="middle" font-weight="bold">${xfm.transformerKva} kVA • ${xfm.type === 'step_up' ? 'STEP-UP' : 'STEP-DOWN'}</text>
        <text x="42" y="52" fill="${wireMuted}" font-family="monospace" font-size="8" text-anchor="middle">Pri: ${xfm.primaryVoltageV}V (${xfm.primaryFullLoadCurrentA}A) ➔ Sec: ${xfm.secondaryVoltageV}V (${xfm.secondaryFullLoadCurrentA}A)</text>
        <text x="42" y="64" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="middle">${xfm.vectorGroup} • 60Hz • PEC 4.50</text>

        <!-- Tank / Core Ground PE -->
        <line x1="42" y1="24" x2="42" y2="36" stroke="${wireAccent}" stroke-width="1.5" />
        <line x1="34" y1="36" x2="50" y2="36" stroke="${wireAccent}" stroke-width="1.8" />
        <line x1="37" y1="39" x2="47" y2="39" stroke="${wireAccent}" stroke-width="1.8" />
        <line x1="40" y1="42" x2="44" y2="42" stroke="${wireAccent}" stroke-width="1.8" />
      </g>

      <!-- Secondary Feeder from Transformer Secondary to Secondary MCCB -->
      <line x1="${transformerX + 82}" y1="${mdbCenterY}" x2="${xfmSecBreakerX}" y2="${mdbCenterY}" stroke="${wireAccent}" stroke-width="3" />

      <!-- Secondary Feeder PEC Wire Sizing Badge -->
      <g class="wireframe-xfm-sec-badge" transform="translate(${secMidX}, ${mdbCenterY - 20})">
        <rect x="-85" y="-10" width="170" height="20" fill="${bgColor}" stroke="${wireDanger}" stroke-width="1.3" rx="3" />
        <text x="0" y="3.5" fill="${wireDanger}" font-family="monospace" font-size="8.5" text-anchor="middle" font-weight="bold">SEC: ${xfm.secondaryPecSizing.compactCallout}</text>
      </g>
      <text x="${secMidX}" y="${mdbCenterY + 16}" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="middle">in ${xfm.secondaryPecSizing.conduitLabel}</text>

      <!-- Transformer Secondary MCCB Breaker -->
      <g class="wireframe-xfm-sec-breaker" transform="translate(${xfmSecBreakerX}, ${mdbCenterY - 20})">
        <rect x="0" y="0" width="40" height="40" fill="none" stroke="${wireDanger}" stroke-width="2" />
        <line x1="8" y1="8" x2="32" y2="32" stroke="${wireDanger}" stroke-width="2.5" />
        <line x1="32" y1="8" x2="8" y2="32" stroke="${wireDanger}" stroke-width="2.5" />
        <text x="20" y="-8" fill="${wireDanger}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">XFM SEC MCCB</text>
        <text x="20" y="52" fill="${wireNeutral}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">${xfm.secondaryOcpdRatingA}A ${model.isThreePhase ? '3P' : '2P'}</text>
        <text x="20" y="64" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="middle">I_des: ${xfm.secondaryPecSizing.designCurrentA}A</text>
      </g>

      <!-- Secondary Feeder from Transformer Secondary Breaker to MDP -->
      <line x1="${xfmSecBreakerX + 40}" y1="${mdbCenterY}" x2="${mdpX}" y2="${mdbCenterY}" stroke="${wireAccent}" stroke-width="3" />
    `;
  } else {
    const mainMidX = Math.round((combinerLeadOutX + mdpX) / 2);
    transformerOrFeederSvg = `
      <!-- Main Feeder from Combiner/Bus directly to MDP -->
      <line x1="${combinerLeadOutX}" y1="${mdbCenterY}" x2="${mdpX}" y2="${mdbCenterY}" stroke="${wireAccent}" stroke-width="3" />

      <!-- Main AC Feeder Conductor Callout (PEC 2017) -->
      <g class="wireframe-pec-main-feeder" transform="translate(${mainMidX}, ${mdbCenterY - 20})">
        <rect x="-95" y="-10" width="190" height="20" fill="${bgColor}" stroke="${wireDanger}" stroke-width="1.3" rx="3" />
        <text x="0" y="3.5" fill="${wireDanger}" font-family="monospace" font-size="8.5" text-anchor="middle" font-weight="bold">PEC MAIN: ${model.mainFeederWireSizing.compactCallout}</text>
      </g>
      <text x="${mainMidX}" y="${mdbCenterY + 16}" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="middle">in ${model.mainFeederWireSizing.conduitLabel}${model.acFeederSummary.totalRunM > 0 ? ` • ${model.acFeederSummary.totalRunM}m run` : ''}</text>
      ${
        model.acFeederSummary.totalRunM > 0
          ? `<text x="${mainMidX}" y="${mdbCenterY + 28}" fill="${model.acFeederSummary.isCompliant ? wireAccent : wireDanger}" font-family="monospace" font-size="7.5" text-anchor="middle" font-weight="bold">V_drop: ${model.acFeederSummary.voltageDropPercent}% (${model.acFeederSummary.voltageDropV}V) • ${model.acFeederSummary.isCompliant ? 'PEC 2.15 OK (≤3%)' : 'EXCEEDS 3% PEC LIMIT'}</text>`
          : ''
      }
    `;
  }

  // 3. Vertical Interconnection Assembly: Utility Grid ➔ Utility Meter ➔ Main Distribution Panel (MDP)
  const isLoadSideTap = model.mdpTapType === 'load_side';
  const mdpH = 275;
  const mdpTopY = mdbCenterY - 110;
  const mdpBottomY = mdpTopY + mdpH;
  const gridBoxW = 160;
  const gridBoxH = 65;
  const gridY = mdpTopY - 170;
  const meterY = mdpTopY - 55;
  const meterR = 26;

  // 3A. Utility Grid (PCC) Interconnection Symbol (Top of Vertical Service Entrance)
  const gridPccSvg = `
    ${
      gridY > headerHeight + 35
        ? `
      <!-- Vertical Service Entrance Centerline Guide from Column Header to Utility Grid -->
      <line x1="${utilityCenterLineX}" y1="${headerHeight}" x2="${utilityCenterLineX}" y2="${gridY}" stroke="${wireMuted}" stroke-width="1.2" stroke-dasharray="4,4" opacity="0.6" />
      <text x="${utilityCenterLineX + 8}" y="${headerHeight + 20}" fill="${wireMuted}" font-family="monospace" font-size="7.5" opacity="0.7">UTILITY INTERCONNECTION (PCC)</text>
    `
        : ''
    }
    <g class="wireframe-grid-pcc" transform="translate(${utilityCenterLineX}, ${gridY + gridBoxH / 2})">
      <rect x="${-gridBoxW / 2}" y="${-gridBoxH / 2}" width="${gridBoxW}" height="${gridBoxH}" fill="${bgColor}" stroke="${wireNeutral}" stroke-width="2" rx="4" />
      <!-- High voltage flash symbol -->
      <path d="M 3 -18 L -7 2 L 7 2 L -5 22" fill="none" stroke="${wireWarning}" stroke-width="2.5" />
      <text x="0" y="-17" fill="${wireNeutral}" font-family="monospace" font-size="10.5" text-anchor="middle" font-weight="bold">UTILITY GRID</text>
      <text x="0" y="8" fill="${wireAccent}" font-family="monospace" font-size="9" text-anchor="middle" font-weight="bold">PCC ${model.systemVoltageV}V ${model.isThreePhase ? '3Φ' : '1Φ'}</text>
      <text x="0" y="20" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="middle">${model.gridFrequencyHz}Hz ${model.isThreePhase ? 'Wye/Delta' : 'L+N+PE'}</text>
      ${
        model.acFeederSummary.acInterconnectionLocation
          ? `<text x="0" y="31" fill="${wireAccent}" font-family="monospace" font-size="6.5" text-anchor="middle">PINNED: ${model.acFeederSummary.acInterconnectionLocation.lat.toFixed(4)}, ${model.acFeederSummary.acInterconnectionLocation.lng.toFixed(4)}</text>`
          : ''
      }
    </g>
  `;

  // 3B. Bi-Directional Revenue kWh Utility Meter (Positioned Vertically between Grid & MDP)
  const meterSvg = `
    <!-- Vertical Conductor from Utility Grid to Utility Meter -->
    <line x1="${utilityCenterLineX}" y1="${gridY + gridBoxH}" x2="${utilityCenterLineX}" y2="${meterY - meterR}" stroke="${wireDanger}" stroke-width="3" />
    <text x="${utilityCenterLineX + 12}" y="${Math.round((gridY + gridBoxH + meterY - meterR) / 2) + 3}" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="start">UTILITY SERVICE</text>

    <!-- Revenue Meter Circle -->
    <g class="wireframe-utility-meter wireframe-revenue-meter" transform="translate(${utilityCenterLineX}, ${meterY})">
      <circle cx="0" cy="0" r="${meterR}" fill="${bgColor}" stroke="${wireColor}" stroke-width="2" />
      <text x="0" y="-4" fill="${wireNeutral}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">kWh</text>
      <!-- Bi-directional arrows ⇄ -->
      <path d="M -10 6 L 10 6 M 6 2 L 10 6 L 6 10" fill="none" stroke="${wireColor}" stroke-width="1.4" />
      <path d="M 10 10 L -10 10 L -6 6 M -10 10 L -6 14" fill="none" stroke="${wireColor}" stroke-width="1.4" />
      <text x="36" y="-3" fill="${wireColor}" font-family="monospace" font-size="8.5" text-anchor="start" font-weight="bold">UTILITY METER</text>
      <text x="36" y="9" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="start">Bi-Directional Net</text>
    </g>

    <!-- Vertical Conductor from Utility Meter into MDP Service Entrance -->
    <line x1="${utilityCenterLineX}" y1="${meterY + meterR}" x2="${utilityCenterLineX}" y2="${mdpTopY}" stroke="${wireDanger}" stroke-width="3" />
    <text x="${utilityCenterLineX + 12}" y="${Math.round((meterY + meterR + mdpTopY) / 2) + 3}" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="start">SERVICE ENTRANCE</text>
  `;

  // 3C. Main Distribution Panel (MDP) with Aligned Green Solar Feeder & Configurable Tapping Point
  const mdpSvg = `
    <g class="wireframe-mdp-enclosure">
      <!-- Panel Outer Frame -->
      <rect x="${mdpX}" y="${mdpTopY}" width="${mdpW}" height="${mdpH}" fill="none" stroke="${wireNeutral}" stroke-width="2" rx="4" />

      <!-- Header Banner -->
      <rect x="${mdpX}" y="${mdpTopY}" width="${mdpW}" height="26" fill="none" stroke="${wireNeutral}" stroke-width="1.5" />
      <text x="${mdpX + mdpW / 2}" y="${mdpTopY + 17}" fill="${wireNeutral}" font-family="monospace" font-size="10.5" text-anchor="middle" font-weight="bold">MAIN DISTRIBUTION PANEL (MDP) • ${model.systemVoltageV}V ${model.isThreePhase ? '3Φ' : '1Φ'}</text>

      <!-- Interactive Tap Toggle Button inside MDP -->
      <g class="wireframe-tap-toggle-btn" id="sld-svg-tap-toggle" style="cursor: pointer;" transform="translate(${mdpX + 10}, ${mdpTopY + 34})">
        <rect x="0" y="0" width="135" height="18" rx="3" fill="${bgColor}" stroke="${isLoadSideTap ? wireAccent : wireWarning}" stroke-width="1.2" />
        <text x="67.5" y="12" fill="${isLoadSideTap ? wireAccent : wireWarning}" font-family="monospace" font-size="7.5" text-anchor="middle" font-weight="bold">⇄ TAP: ${isLoadSideTap ? 'LOAD-SIDE (120%)' : 'LINE-SIDE (PEC)'}</text>
      </g>

      <!-- Perfectly Aligned Horizontal Green Solar Feeder inside MDP (straight line to tapping point) -->
      <line x1="${mdpX}" y1="${mdbCenterY}" x2="${mdpX + 55}" y2="${mdbCenterY}" stroke="${wireAccent}" stroke-width="3" />

      ${
        isLoadSideTap
          ? `
        <!-- PV Tie Circuit Breaker (Backfed on Load Side) - Aligned horizontally -->
        <g class="wireframe-pv-backfed-breaker" transform="translate(${mdpX + 55}, ${mdbCenterY - 18})">
          <rect x="0" y="0" width="36" height="36" fill="${bgColor}" stroke="${wireAccent}" stroke-width="1.8" />
          <line x1="6" y1="6" x2="30" y2="30" stroke="${wireDanger}" stroke-width="2" />
          <line x1="30" y1="6" x2="6" y2="30" stroke="${wireDanger}" stroke-width="2" />
          <text x="18" y="-6" fill="${wireAccent}" font-family="monospace" font-size="8" text-anchor="middle" font-weight="bold">PV TIE MCCB</text>
          <text x="18" y="48" fill="${wireNeutral}" font-family="monospace" font-size="7.5" text-anchor="middle">${model.mainBreakerRatingA}A (Backfed)</text>
        </g>
      `
          : `
        <!-- PV Supply Tap Circuit Breaker (Line Side Disconnect) - Aligned horizontally -->
        <g class="wireframe-pv-supply-breaker" transform="translate(${mdpX + 55}, ${mdbCenterY - 18})">
          <rect x="0" y="0" width="36" height="36" fill="${bgColor}" stroke="${wireWarning}" stroke-width="1.8" />
          <line x1="6" y1="6" x2="30" y2="30" stroke="${wireDanger}" stroke-width="2" />
          <line x1="30" y1="6" x2="6" y2="30" stroke="${wireDanger}" stroke-width="2" />
          <text x="18" y="-6" fill="${wireWarning}" font-family="monospace" font-size="8" text-anchor="middle" font-weight="bold">PV SUPPLY TAP CB</text>
          <text x="18" y="48" fill="${wireNeutral}" font-family="monospace" font-size="7.5" text-anchor="middle">${model.mainBreakerRatingA}A (Tap)</text>
        </g>
      `
      }

      <!-- Conductor from Breaker straight to Vertical Bus Tapping Point -->
      <line x1="${mdpX + 91}" y1="${mdbCenterY}" x2="${utilityCenterLineX}" y2="${mdbCenterY}" stroke="${wireAccent}" stroke-width="3" />

      <!-- Tapping Point Node on Vertical Bus -->
      <circle cx="${utilityCenterLineX}" cy="${mdbCenterY}" r="5" fill="${isLoadSideTap ? wireAccent : wireDanger}" />

      ${
        isLoadSideTap
          ? `
        <!-- Vertical Line Side Service Conductor (Top to Main Breaker above tap) -->
        <line x1="${utilityCenterLineX}" y1="${mdpTopY + 26}" x2="${utilityCenterLineX}" y2="${mdbCenterY - 56}" stroke="${wireDanger}" stroke-width="4" />
        <text x="${utilityCenterLineX + 14}" y="${mdpTopY + 45}" fill="${wireDanger}" font-family="monospace" font-size="8" font-weight="bold">LINE SIDE (UTILITY SERVICE)</text>

        <!-- MDP Main Breaker (Positioned ABOVE Tap Point on Vertical Bus) -->
        <g class="wireframe-mdp-main-breaker" transform="translate(${utilityCenterLineX - 18}, ${mdbCenterY - 56})">
          <rect x="0" y="0" width="36" height="36" fill="${bgColor}" stroke="${wireDanger}" stroke-width="2" />
          <line x1="6" y1="6" x2="30" y2="30" stroke="${wireDanger}" stroke-width="2.5" />
          <line x1="30" y1="6" x2="6" y2="30" stroke="${wireDanger}" stroke-width="2.5" />
          <text x="44" y="14" fill="${wireDanger}" font-family="monospace" font-size="8.5" font-weight="bold">${model.isThreePhase ? 'MDP MAIN MCCB' : 'MDP MAIN MCB'}</text>
          <text x="44" y="26" fill="${wireNeutral}" font-family="monospace" font-size="8">${model.mdpMainBreakerRatingA}A ${model.isThreePhase ? '3P' : '2P'}</text>
          <text x="44" y="36" fill="${wireMuted}" font-family="monospace" font-size="7">Main Service Disconnect</text>
        </g>

        <!-- Load Bus from Main Breaker down through Tap Point -->
        <line x1="${utilityCenterLineX}" y1="${mdbCenterY - 20}" x2="${utilityCenterLineX}" y2="${mdbCenterY}" stroke="${wireAccent}" stroke-width="4" stroke-linecap="round" />
        <text x="${utilityCenterLineX + 14}" y="${mdbCenterY - 8}" fill="${wireAccent}" font-family="monospace" font-size="8" font-weight="bold">LOAD SIDE (FACILITY BUS)</text>

        <text x="${utilityCenterLineX + 14}" y="${mdbCenterY + 5}" fill="${wireAccent}" font-family="monospace" font-size="8.5" font-weight="bold">LOAD TAP POINT</text>
        <text x="${utilityCenterLineX + 14}" y="${mdbCenterY + 16}" fill="${wireMuted}" font-family="monospace" font-size="7">Backfed into Load Bus</text>

        <!-- Load Bus down to Facility Load -->
        <line x1="${utilityCenterLineX}" y1="${mdbCenterY}" x2="${utilityCenterLineX}" y2="${mdbCenterY + 45}" stroke="${wireAccent}" stroke-width="3" />

        <!-- Facility Load Box -->
        <g class="wireframe-facility-load" transform="translate(${utilityCenterLineX - 55}, ${mdbCenterY + 45})">
          <rect x="0" y="0" width="110" height="34" fill="${bgColor}" stroke="${wireNeutral}" stroke-width="1.5" rx="3" />
          <text x="55" y="14" fill="${wireNeutral}" font-family="monospace" font-size="8.5" text-anchor="middle" font-weight="bold">FACILITY LOAD</text>
          <text x="55" y="26" fill="${wireMuted}" font-family="monospace" font-size="7" text-anchor="middle">Building Demand</text>
        </g>
        <text x="${utilityCenterLineX}" y="${mdbCenterY + 95}" fill="${wireAccent}" font-family="monospace" font-size="7.5" text-anchor="middle" font-weight="bold">▲ TAPPED ON LOAD SIDE</text>

        <!-- Compliance Summary -->
        <text x="${mdpX + mdpW / 2}" y="${mdpBottomY - 14}" fill="${wireAccent}" font-family="monospace" font-size="8" text-anchor="middle" font-weight="bold">✔ LOAD-SIDE TAP: PEC 6.90.8.2 / 7.5.1.2 (120% Bus Rule)</text>
        <text x="${mdpX + mdpW / 2}" y="${mdpBottomY - 4}" fill="${wireMuted}" font-family="monospace" font-size="7" text-anchor="middle">Main: ${model.mdpMainBreakerRatingA}A + PV: ${model.mainBreakerRatingA}A ≤ 120% Bus Ampacity</text>
      `
          : `
        <!-- Vertical Line Side Service Conductor (Top to Supply Tap Point) -->
        <line x1="${utilityCenterLineX}" y1="${mdpTopY + 26}" x2="${utilityCenterLineX}" y2="${mdbCenterY}" stroke="${wireDanger}" stroke-width="4" />
        <text x="${utilityCenterLineX + 14}" y="${mdpTopY + 45}" fill="${wireDanger}" font-family="monospace" font-size="8" font-weight="bold">LINE SIDE (UTILITY SERVICE)</text>

        <text x="${utilityCenterLineX + 14}" y="${mdbCenterY - 7}" fill="${wireWarning}" font-family="monospace" font-size="8.5" font-weight="bold">SUPPLY TAP POINT</text>
        <text x="${utilityCenterLineX + 14}" y="${mdbCenterY + 5}" fill="${wireMuted}" font-family="monospace" font-size="7">Ahead of Main Disconnect</text>

        <!-- Service Conductor from Tap Point down to MDP Main Breaker -->
        <line x1="${utilityCenterLineX}" y1="${mdbCenterY}" x2="${utilityCenterLineX}" y2="${mdbCenterY + 20}" stroke="${wireDanger}" stroke-width="3" />

        <!-- MDP Main Breaker (Positioned BELOW Tap Point on Vertical Bus) -->
        <g class="wireframe-mdp-main-breaker" transform="translate(${utilityCenterLineX - 18}, ${mdbCenterY + 20})">
          <rect x="0" y="0" width="36" height="36" fill="${bgColor}" stroke="${wireDanger}" stroke-width="2" />
          <line x1="6" y1="6" x2="30" y2="30" stroke="${wireDanger}" stroke-width="2.5" />
          <line x1="30" y1="6" x2="6" y2="30" stroke="${wireDanger}" stroke-width="2.5" />
          <text x="44" y="14" fill="${wireDanger}" font-family="monospace" font-size="8.5" font-weight="bold">${model.isThreePhase ? 'MDP MAIN MCCB' : 'MDP MAIN MCB'}</text>
          <text x="44" y="26" fill="${wireNeutral}" font-family="monospace" font-size="8">${model.mdpMainBreakerRatingA}A ${model.isThreePhase ? '3P' : '2P'}</text>
          <text x="44" y="36" fill="${wireMuted}" font-family="monospace" font-size="7">Main Service Disconnect</text>
        </g>

        <!-- Load Bus below Main Breaker down to Facility Load -->
        <line x1="${utilityCenterLineX}" y1="${mdbCenterY + 56}" x2="${utilityCenterLineX}" y2="${mdbCenterY + 86}" stroke="${wireAccent}" stroke-width="4" stroke-linecap="round" />
        <text x="${utilityCenterLineX + 14}" y="${mdbCenterY + 74}" fill="${wireAccent}" font-family="monospace" font-size="8" font-weight="bold">LOAD SIDE (FACILITY BUS)</text>

        <!-- Facility Load Box -->
        <g class="wireframe-facility-load" transform="translate(${utilityCenterLineX - 55}, ${mdbCenterY + 86})">
          <rect x="0" y="0" width="110" height="34" fill="${bgColor}" stroke="${wireNeutral}" stroke-width="1.5" rx="3" />
          <text x="55" y="14" fill="${wireNeutral}" font-family="monospace" font-size="8.5" text-anchor="middle" font-weight="bold">FACILITY LOAD</text>
          <text x="55" y="26" fill="${wireMuted}" font-family="monospace" font-size="7" text-anchor="middle">Building Demand</text>
        </g>
        <text x="${utilityCenterLineX}" y="${mdbCenterY + 136}" fill="${wireAccent}" font-family="monospace" font-size="7.5" text-anchor="middle" font-weight="bold">▲ TAPPED ON LOAD SIDE</text>

        <!-- Compliance Summary -->
        <text x="${mdpX + mdpW / 2}" y="${mdpBottomY - 14}" fill="${wireWarning}" font-family="monospace" font-size="8" text-anchor="middle" font-weight="bold">✔ LINE-SIDE TAP: PEC 6.90.8.1 (Supply-Side Ahead of Main)</text>
        <text x="${mdpX + mdpW / 2}" y="${mdpBottomY - 4}" fill="${wireMuted}" font-family="monospace" font-size="7" text-anchor="middle">Connected between Meter &amp; Main Disconnect • Not limited by 120% rule</text>
      `
      }
    </g>
  `;

  const acDistributionSvg = `
    <g class="wireframe-ac-distribution">
      ${acCombinerSvg}
      ${transformerOrFeederSvg}
      ${gridPccSvg}
      ${meterSvg}
      ${mdpSvg}
    </g>
  `;

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

  const isRotated = this.rotation === 90 || this.rotation === 270;
  const outViewBoxWidth = isRotated ? effectiveSvgHeight : totalSvgWidth;
  const outViewBoxHeight = isRotated ? totalSvgWidth : effectiveSvgHeight;

  let outRotationTransform = '';
  if (this.rotation === 90) {
    outRotationTransform = `transform="rotate(90) translate(0, -${effectiveSvgHeight})"`;
  } else if (this.rotation === 270) {
    outRotationTransform = `transform="rotate(270) translate(-${totalSvgWidth}, 0)"`;
  }

  return `
    <svg id="sld-svg-element" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${outViewBoxWidth} ${outViewBoxHeight}" width="100%" height="100%" style="background-color: ${bgColor};">
      <defs>
        <!-- 2D Wireframe Fine Engineering CAD Grid Pattern -->
        <pattern id="sldCadGrid" width="25" height="25" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="25" y2="0" stroke="${wireGrid}" stroke-width="0.5" />
          <line x1="0" y1="0" x2="0" y2="25" stroke="${wireGrid}" stroke-width="0.5" />
        </pattern>
      </defs>

      <!-- Solid Background Fill & Engineering CAD Grid -->
      <rect width="100%" height="100%" fill="${bgColor}" />
      <rect width="100%" height="100%" fill="url(#sldCadGrid)" />

      <!-- Viewport Group for Smooth Pan & Zoom -->
      <g id="sld-viewport-group">
        ${outRotationTransform ? `<g id="sld-rotation-group" ${outRotationTransform}>` : ''}
          ${borderFrameSvg}
          ${columnHeadersSvg}
          ${stringsSvg}
          ${spdGroundBusSvg}
          ${dcConnectionsSvg}
          ${invertersSvg}
          ${acDistributionSvg}
          ${pecScheduleSvg}
          ${titleBlockSvg}
          ${legendSvg}
        ${outRotationTransform ? '</g>' : ''}
      </g>
    </svg>
  `;
}

/**
 * Generates a fully self-contained, standalone valid XML SVG string
 * with explicit pixel dimensions, embedded font styles, and solid background
 * suitable for vector graphics tools (Inkscape, Illustrator, AutoCAD) and web viewers.
 */
export function generateStandaloneSvg(this: SingleLineDiagramUI, model: SldSystemModel): string {
  const rawSvg = this.generateWireframeSvg(model);
  const { totalSvgWidth: baseWidth, totalSvgHeight: baseHeight } = this.getSldDimensions(model);

  const isRotated = this.rotation === 90 || this.rotation === 270;
  const outWidth = isRotated ? baseHeight : baseWidth;
  const outHeight = isRotated ? baseWidth : baseHeight;

  // Replace root svg element opening with standalone XML declaration and explicit pixel width/height
  let standalone = rawSvg.replace(
    /<svg\s+id="sld-svg-element"[^>]*>/,
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${outWidth} ${outHeight}">`
  );

  // Embed standalone font styles inside <defs>
  const fontStyles = `
  <style type="text/css">
    text { font-family: 'Consolas', 'Monaco', 'Courier New', monospace, sans-serif; }
  </style>`;
  standalone = standalone.replace('<defs>', `<defs>${fontStyles}`);

  return standalone.trim();
}
