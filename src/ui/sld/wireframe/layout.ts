/**
 * SLD wireframe theme palette, column layout and the context types passed between drawing sections.
 */
import { type SldSystemModel } from '../../../geo/sldModel';
import type { SingleLineDiagramUI } from '../../sldView';
import type { drawStringRows, drawInverters } from './dcSide';
import type { drawAcCollection, drawServiceEntrance } from './acSide';

/** Theme palette and column / row layout constants. */
export function buildWireframeLayout(this: SingleLineDiagramUI, model: SldSystemModel) {
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

  return { isDark, wireColor, wireAccent, wireWarning, wireDanger, wireNeutral, wireMuted, wireGrid, bgColor, totalSvgWidth, totalSvgHeight, headerHeight, rowHeight, hasTransformer, strStartX, dcSpdX, dcBreakerX, mpptBusX, invBoxX, invBoxW, acBreakerX, mdbBusX, acCombinerBreakerX, transformerX, xfmSecBreakerX, mdpX, mdpW, utilityCenterLineX };
}

export type WireframeLayout = ReturnType<typeof buildWireframeLayout>;

export type AfterStrings = WireframeLayout & ReturnType<typeof drawStringRows>;

export type AfterInverters = AfterStrings & ReturnType<typeof drawInverters>;

export type AfterAcCollection = AfterInverters & ReturnType<typeof drawAcCollection>;

export type AfterServiceEntrance = AfterAcCollection & ReturnType<typeof drawServiceEntrance>;
