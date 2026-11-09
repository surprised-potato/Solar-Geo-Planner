/**
 * SLD SVG drawing: canvas sizing, the wireframe diagram and standalone export SVG.
 */
import { type SldSystemModel } from '../../geo/sldModel';
import type { SingleLineDiagramUI } from '../sldView';
import { buildWireframeLayout } from './wireframe/layout';
import { drawStringRows, drawInverters } from './wireframe/dcSide';
import { drawAcCollection, drawServiceEntrance } from './wireframe/acSide';
import { drawAnnotations } from './wireframe/annotations';

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
  const layout = buildWireframeLayout.call(this, model);
  const c2 = { ...layout, ...drawStringRows.call(this, model, layout) };
  const c3 = { ...c2, ...drawInverters.call(this, model, c2) };
  const c4 = { ...c3, ...drawAcCollection.call(this, model, c3) };
  const c5 = { ...c4, ...drawServiceEntrance.call(this, model, c4) };
  const parts = { ...c5, ...drawAnnotations.call(this, model, c5) };
  const { wireGrid, bgColor, totalSvgWidth, stringsSvg, dcConnectionsSvg, invertersSvg, acDistributionSvg, pecScheduleSvg, effectiveSvgHeight, titleBlockSvg, legendSvg, columnHeadersSvg, spdGroundBusSvg, borderFrameSvg } = parts;

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
