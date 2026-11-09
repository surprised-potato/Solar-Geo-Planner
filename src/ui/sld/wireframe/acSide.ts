/**
 * SLD wireframe AC side: combiner / transformer, utility grid, meter and MDP.
 */
import { type SldSystemModel } from '../../../geo/sldModel';
import type { SingleLineDiagramUI } from '../../sldView';
import type { AfterInverters, AfterAcCollection } from './layout';

/** AC combiner bus and transformer (or direct feeder) section. */
export function drawAcCollection(this: SingleLineDiagramUI, model: SldSystemModel, c: AfterInverters) {
  const { wireColor, wireAccent, wireWarning, wireDanger, wireNeutral, wireMuted, bgColor, hasTransformer, mdbBusX, acCombinerBreakerX, transformerX, xfmSecBreakerX, mdpX, startY, invTotalHeight } = c;
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

  return { mdbCenterY, acCombinerSvg, transformerOrFeederSvg };
}

/** Utility grid PCC, revenue meter and main distribution panel. */
export function drawServiceEntrance(this: SingleLineDiagramUI, model: SldSystemModel, c: AfterAcCollection) {
  const { wireColor, wireAccent, wireWarning, wireDanger, wireNeutral, wireMuted, bgColor, headerHeight, mdpX, mdpW, utilityCenterLineX, mdbCenterY, acCombinerSvg, transformerOrFeederSvg } = c;
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

  return { mdpBottomY, acDistributionSvg };
}
