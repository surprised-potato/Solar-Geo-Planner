/**
 * SLD wireframe DC side: PV string rows, DC protection and inverter enclosures.
 */
import { type SldSystemModel } from '../../../geo/sldModel';
import type { SingleLineDiagramUI } from '../../sldView';
import type { WireframeLayout, AfterStrings } from './layout';
import { escapeXml } from '../escapeXml';

/** PV string rows with DC SPDs, DC breakers and conductors to the MPPT bus. */
export function drawStringRows(this: SingleLineDiagramUI, model: SldSystemModel, c: WireframeLayout) {
  const { wireColor, wireAccent, wireWarning, wireDanger, wireNeutral, wireMuted, bgColor, headerHeight, rowHeight, strStartX, dcSpdX, dcBreakerX, mpptBusX } = c;
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

  return { stringsSvg, dcConnectionsSvg, startY, stringYPositions };
}

/** Inverter enclosures with MPPT inputs and AC output breakers. */
export function drawInverters(this: SingleLineDiagramUI, model: SldSystemModel, c: AfterStrings) {
  const { wireColor, wireAccent, wireDanger, wireNeutral, wireMuted, bgColor, mpptBusX, invBoxX, invBoxW, acBreakerX, mdbBusX, startY, stringYPositions } = c;
  let dcConnectionsSvg = c.dcConnectionsSvg;
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

  return { invertersSvg, invTotalHeight, dcConnectionsSvg };
}
