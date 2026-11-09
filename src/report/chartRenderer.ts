import { SolarLossCascade, MonthlySolarData } from '../geo/solarYield';

export interface WaterfallLossStep {
  label: string;
  nominalPercent: number; // e.g. 100, 102.5, 99.9, ...
  stepDeltaPercent: number; // e.g. +2.5, -2.5, -10.2
  type: 'base' | 'gain' | 'loss' | 'result';
}

/**
 * Calculates ordered waterfall step metrics matching PVsyst loss diagram.
 */
export function buildPvsystLossSteps(cascade: SolarLossCascade): WaterfallLossStep[] {
  const steps: WaterfallLossStep[] = [];

  // Step 1: Nominal STC Array Energy
  let currentVal = 100.0;
  steps.push({
    label: 'Nominal STC Array Energy',
    nominalPercent: 100.0,
    stepDeltaPercent: 0,
    type: 'base'
  });

  // Step 2: Plane-of-Array (POA) Transposition
  const poaDelta = cascade.poaGainLossPercent ?? 3.5;
  currentVal += poaDelta;
  steps.push({
    label: 'POA Irradiance Transposition',
    nominalPercent: Number(currentVal.toFixed(1)),
    stepDeltaPercent: Number(poaDelta.toFixed(1)),
    type: poaDelta >= 0 ? 'gain' : 'loss'
  });

  // Step 3: Soiling Loss
  const soiling = cascade.soilingLossPercent ?? 2.5;
  currentVal -= soiling;
  steps.push({
    label: 'Soiling Loss Factor',
    nominalPercent: Number(currentVal.toFixed(1)),
    stepDeltaPercent: -Number(soiling.toFixed(1)),
    type: 'loss'
  });

  // Step 4: Light Induced Degradation (LID)
  const lid = cascade.lidLossPercent ?? 1.5;
  currentVal -= lid;
  steps.push({
    label: 'Light-Induced Degradation (LID)',
    nominalPercent: Number(currentVal.toFixed(1)),
    stepDeltaPercent: -Number(lid.toFixed(1)),
    type: 'loss'
  });

  // Step 5: Module Quality & Mismatch
  const mismatch = cascade.mismatchLossPercent ?? 1.5;
  currentVal -= mismatch;
  steps.push({
    label: 'Module Quality & Mismatch',
    nominalPercent: Number(currentVal.toFixed(1)),
    stepDeltaPercent: -Number(mismatch.toFixed(1)),
    type: 'loss'
  });

  // Step 6: Operating Cell Temperature Derate
  const thermal = cascade.thermalLossPercent ?? 10.5;
  currentVal -= thermal;
  steps.push({
    label: 'Cell Temperature Thermal Derate',
    nominalPercent: Number(currentVal.toFixed(1)),
    stepDeltaPercent: -Number(thermal.toFixed(1)),
    type: 'loss'
  });

  // Step 7: DC String & Homerun Ohmic Wiring Loss
  const dcWire = cascade.dcCableLossPercent ?? 1.4;
  currentVal -= dcWire;
  steps.push({
    label: 'DC Wiring & Conductor Ohmic Loss',
    nominalPercent: Number(currentVal.toFixed(1)),
    stepDeltaPercent: -Number(dcWire.toFixed(1)),
    type: 'loss'
  });

  // Step 8: Inverter Efficiency Loss
  const invLoss = cascade.inverterLossPercent ?? 1.8;
  currentVal -= invLoss;
  steps.push({
    label: 'Inverter Conversion Inefficiency',
    nominalPercent: Number(currentVal.toFixed(1)),
    stepDeltaPercent: -Number(invLoss.toFixed(1)),
    type: 'loss'
  });

  // Step 9: Inverter Clipping / Power Limiting
  const clip = cascade.clippingLossPercent ?? 0.2;
  if (clip > 0.05) {
    currentVal -= clip;
    steps.push({
      label: 'Inverter Power Clipping Loss',
      nominalPercent: Number(currentVal.toFixed(1)),
      stepDeltaPercent: -Number(clip.toFixed(1)),
      type: 'loss'
    });
  }

  // Step 10: AC Feeder Cable Loss
  const acWire = cascade.acWiringLossPercent ?? 0.8;
  currentVal -= acWire;
  steps.push({
    label: 'AC Feeder Cable Resistance Loss',
    nominalPercent: Number(currentVal.toFixed(1)),
    stepDeltaPercent: -Number(acWire.toFixed(1)),
    type: 'loss'
  });

  // Step 11: System Availability & Downtime
  const avail = cascade.availabilityLossPercent ?? 1.0;
  currentVal -= avail;
  steps.push({
    label: 'System Unavailability & Outages',
    nominalPercent: Number(currentVal.toFixed(1)),
    stepDeltaPercent: -Number(avail.toFixed(1)),
    type: 'loss'
  });

  // Step 12: Net AC Delivered Energy (Performance Ratio)
  steps.push({
    label: 'Delivered Net AC Energy (PR)',
    nominalPercent: Number(Math.max(0, currentVal).toFixed(1)),
    stepDeltaPercent: 0,
    type: 'result'
  });

  return steps;
}

/**
 * Escapes text content for safe embedding in strict-XML SVG documents.
 * (Unescaped '&' or '<' makes the SVG unparseable when rasterized via <img>.)
 */
export function escapeSvgText(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders the PVsyst-style Loss Diagram / Waterfall as an SVG string.
 */
export function renderLossWaterfallSvg(
  cascade: SolarLossCascade,
  width: number = 880,
  height: number = 420
): string {
  const steps = buildPvsystLossSteps(cascade);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="${width}" height="${height}" rx="6" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5"/>`;

  // Title header
  svg += `
    <rect width="${width}" height="32" rx="6" fill="#0f172a"/>
    <text x="16" y="21" font-family="sans-serif" font-size="12" font-weight="bold" fill="#ffffff">PVsyst Loss Diagram — Normalized System Energy Cascade</text>
  `;

  const topY = 48;
  const bottomMargin = 20;
  const usableH = height - topY - bottomMargin;
  const rowH = usableH / steps.length;

  const labelW = 270;
  const barStart = labelW + 20;
  const maxBarW = width - barStart - 85;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const y = topY + i * rowH;

    // Alternating zebra stripe
    if (i % 2 === 1) {
      svg += `<rect x="6" y="${y}" width="${width - 12}" height="${rowH}" fill="#f1f5f9" opacity="0.6"/>`;
    }

    // Step Label
    const isSpecial = step.type === 'base' || step.type === 'result';
    const textFontWeight = isSpecial ? 'bold' : 'normal';
    const textCol = isSpecial ? '#0f172a' : '#334155';
    svg += `<text x="18" y="${y + rowH * 0.65}" font-family="sans-serif" font-size="10.5" font-weight="${textFontWeight}" fill="${textCol}">${escapeSvgText(step.label)}</text>`;

    // Step Bar
    const barW = Math.max(8, (step.nominalPercent / 110.0) * maxBarW);
    let barColor = '#3b82f6';
    if (step.type === 'gain') barColor = '#10b981';
    if (step.type === 'loss') barColor = '#ef4444';
    if (step.type === 'result') barColor = '#059669';

    svg += `<rect x="${barStart}" y="${y + rowH * 0.2}" width="${barW.toFixed(1)}" height="${(rowH * 0.6).toFixed(1)}" rx="3" fill="${barColor}" fill-opacity="0.85"/>`;

    // Delta annotation (+2.5%, -1.4%)
    let deltaText = '';
    if (step.stepDeltaPercent > 0) deltaText = `+${step.stepDeltaPercent}%`;
    if (step.stepDeltaPercent < 0) deltaText = `${step.stepDeltaPercent}%`;

    if (deltaText) {
      svg += `<text x="${(barStart + barW + 8).toFixed(1)}" y="${y + rowH * 0.65}" font-family="sans-serif" font-size="9" font-weight="bold" fill="${step.type === 'gain' ? '#047857' : '#b91c1c'}">${deltaText}</text>`;
    }

    // Nominal percent value
    svg += `<text x="${width - 20}" y="${y + rowH * 0.65}" text-anchor="end" font-family="sans-serif" font-size="10.5" font-weight="${isSpecial ? 'bold' : '600'}" fill="#0f172a">${step.nominalPercent.toFixed(1)}%</text>`;
  }

  svg += `</svg>`;
  return svg;
}

/**
 * Renders the 12-Month Generation Bar Chart as an SVG string.
 */
export function renderMonthlyYieldChartSvg(
  monthlyData: MonthlySolarData[],
  width: number = 880,
  height: number = 240
): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="${width}" height="${height}" rx="6" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5"/>`;

  // Header
  svg += `
    <rect width="${width}" height="28" rx="6" fill="#0f172a"/>
    <text x="14" y="19" font-family="sans-serif" font-size="11.5" font-weight="bold" fill="#ffffff">Monthly Energy Production (MWh / month) &amp; Plane-of-Array Irradiance</text>
  `;

  const padLeft = 55;
  const padRight = 35;
  const padTop = 45;
  const padBottom = 35;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Max value calculation
  const maxKwh = Math.max(...monthlyData.map(d => d.netAcKwh), 100);
  const maxMwh = maxKwh / 1000;
  const niceMaxMwh = Math.ceil(maxMwh * 1.15);

  // Horizontal Grid Lines
  const gridLines = 4;
  for (let g = 0; g <= gridLines; g++) {
    const valMwh = (niceMaxMwh / gridLines) * g;
    const y = padTop + chartH - (g / gridLines) * chartH;
    svg += `<line x1="${padLeft}" y1="${y}" x2="${padLeft + chartW}" y2="${y}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2,2"/>`;
    svg += `<text x="${padLeft - 8}" y="${y + 3.5}" text-anchor="end" font-family="sans-serif" font-size="9" fill="#64748b">${valMwh.toFixed(1)}</text>`;
  }

  // Draw Bars
  const barSpacing = chartW / 12;
  const barWidth = barSpacing * 0.65;

  for (let i = 0; i < 12; i++) {
    const m = monthlyData[i];
    if (!m) continue;

    const mwh = m.netAcKwh / 1000;
    const barH = (mwh / niceMaxMwh) * chartH;
    const x = padLeft + i * barSpacing + (barSpacing - barWidth) / 2;
    const y = padTop + chartH - barH;

    // Bar rectangle
    svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="#2563eb" fill-opacity="0.85"/>`;

    // Value text above bar
    svg += `<text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="8.5" font-weight="bold" fill="#1e40af">${mwh.toFixed(1)}</text>`;

    // Month label below bar
    svg += `<text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 12}" text-anchor="middle" font-family="sans-serif" font-size="9.5" font-weight="600" fill="#334155">${m.monthName}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

/**
 * Converts any SVG string to a PNG data URL via canvas using a Blob URL for reliable image decoding.
 */
export async function svgToPngDataUri(svg: string, width: number, height: number): Promise<string> {
  if (typeof document === 'undefined') {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  return new Promise((resolve) => {
    const img = new Image();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(blobUrl);
          resolve(canvas.toDataURL ? canvas.toDataURL('image/png') : blobUrl);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(blobUrl);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        URL.revokeObjectURL(blobUrl);
        resolve(blobUrl);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      resolve('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    };

    img.src = blobUrl;
  });
}

/**
 * Renders the average-day solar vs. facility load curve (24 h) as an SVG string.
 */
export function renderDiurnalCurveSvg(
  curve: { hour: number; solarKw: number; loadKw: number }[],
  width: number = 880,
  height: number = 260
): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="${width}" height="${height}" rx="6" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5"/>`;
  svg += `<rect width="${width}" height="28" rx="6" fill="#0f172a"/>`;
  svg += `<text x="14" y="19" font-family="sans-serif" font-size="11.5" font-weight="bold" fill="#ffffff">Average Day: Solar Generation vs Facility Load (kW)</text>`;

  const left = 52, right = 20, top = 44, bottom = 34;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const maxKw = Math.max(1, ...curve.map(c => Math.max(c.solarKw, c.loadKw))) * 1.1;
  const xOf = (i: number): number => left + (curve.length > 1 ? (i / (curve.length - 1)) * plotW : 0);
  const yOf = (v: number): number => top + plotH - (v / maxKw) * plotH;

  for (let g = 0; g <= 4; g++) {
    const v = (maxKw / 4) * g;
    const y = yOf(v);
    svg += `<line x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`;
    svg += `<text x="${left - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-family="sans-serif" font-size="9" fill="#64748b">${v.toFixed(0)}</text>`;
  }
  for (let h = 0; h < curve.length; h += 3) {
    svg += `<text x="${xOf(h).toFixed(1)}" y="${height - 14}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#64748b">${String(h).padStart(2, '0')}:00</text>`;
  }

  if (curve.length > 1) {
    const solarPts = curve.map((c, i) => `${xOf(i).toFixed(1)},${yOf(c.solarKw).toFixed(1)}`);
    const area = `${xOf(0).toFixed(1)},${yOf(0).toFixed(1)} ${solarPts.join(' ')} ${xOf(curve.length - 1).toFixed(1)},${yOf(0).toFixed(1)}`;
    svg += `<polygon points="${area}" fill="#f59e0b" fill-opacity="0.3"/>`;
    svg += `<polyline points="${solarPts.join(' ')}" fill="none" stroke="#d97706" stroke-width="2.2"/>`;
    const loadPts = curve.map((c, i) => `${xOf(i).toFixed(1)},${yOf(c.loadKw).toFixed(1)}`);
    svg += `<polyline points="${loadPts.join(' ')}" fill="none" stroke="#1e3a8a" stroke-width="2.2" stroke-dasharray="6 3"/>`;
  }

  svg += `<rect x="${width - 230}" y="36" width="12" height="6" fill="#f59e0b"/><text x="${width - 213}" y="42" font-family="sans-serif" font-size="9.5" fill="#334155">Solar generation</text>`;
  svg += `<rect x="${width - 120}" y="36" width="12" height="6" fill="#1e3a8a"/><text x="${width - 103}" y="42" font-family="sans-serif" font-size="9.5" fill="#334155">Facility load</text>`;
  svg += `</svg>`;
  return svg;
}
