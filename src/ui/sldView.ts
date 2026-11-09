import { ProjectStore } from '../store/projectStore';
import { attachEventListeners as attachEventListenersImpl } from './sld/sldEvents';
import {
  renderCableScheduleModal as renderCableScheduleModalImpl,
  generatePecScheduleSvg as generatePecScheduleSvgImpl
} from './sld/sldSchedules';
import {
  getSldDimensions as getSldDimensionsImpl,
  generateWireframeSvg as generateWireframeSvgImpl,
  generateStandaloneSvg as generateStandaloneSvgImpl
} from './sld/sldWireframe';
import { exportSvg as exportSvgImpl, exportPng as exportPngImpl } from './sld/sldExport';
import { type SldSystemModel, buildSldSystemModel } from '../geo/sldModel';
import { escapeXml } from './sld/escapeXml';
export { buildSldSystemModel } from '../geo/sldModel';
export type { SldStringInfo, SldMpptInfo, SldInverterInfo, SldSystemModel } from '../geo/sldModel';
export { buildSldScheduleTableRows } from './sld/sldScheduleRows';

export type SldTheme = 'blueprint' | 'cad-mono' | 'paper';


/**
 * 2D Wireframe Single Line Diagram Component
 */
export class SingleLineDiagramUI {
  container: HTMLElement;
  store: ProjectStore;
  currentSystemId: string;
  currentTheme: SldTheme = 'blueprint';
  zoomLevel: number = 1.0;
  panX: number = 0;
  panY: number = 0;
  isPanning: boolean = false;
  lastClientX: number = 0;
  lastClientY: number = 0;
  showCableSchedule: boolean = false;
  rotation: 0 | 90 | 270 = 0;
  onOpenPdfReport?: (systemId?: string) => void;
  private unsubscribeStore?: () => void;

  /**
   * Detaches this SLD instance from store updates (used by headless/offscreen report renderers).
   */
  public dispose(): void {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = undefined;
    }
  }

  constructor(
    containerIdOrEl: string | HTMLElement,
    store: ProjectStore,
    initialSystemIdOrCallback?: string | ((systemId?: string) => void),
    onOpenPdfReportCallback?: (systemId?: string) => void
  ) {
    if (typeof containerIdOrEl === 'string') {
      const el = typeof document !== 'undefined' ? document.getElementById(containerIdOrEl) : null;
      if (!el && typeof document !== 'undefined') throw new Error(`Container #${containerIdOrEl} not found`);
      this.container = el as HTMLElement;
    } else {
      this.container = containerIdOrEl;
    }

    if (typeof initialSystemIdOrCallback === 'function') {
      this.onOpenPdfReport = initialSystemIdOrCallback;
    } else {
      this.onOpenPdfReport = onOpenPdfReportCallback;
    }

    const initialSystemId = typeof initialSystemIdOrCallback === 'string' ? initialSystemIdOrCallback : undefined;

    this.store = store;
    const selectedSys = this.store ? this.store.getSelectedSystem() : undefined;
    this.currentSystemId = initialSystemId || (selectedSys ? selectedSys.id : (this.store ? this.store.getSystems()[0]?.id || '' : ''));

    if (this.store) {
      this.unsubscribeStore = this.store.subscribe(() => {
        // If selected system changed in store, keep in sync
        const activeSys = this.store.getSelectedSystem();
        if (activeSys && activeSys.id !== this.currentSystemId) {
          this.currentSystemId = activeSys.id;
        }
        if (typeof document !== 'undefined' && this.container) {
          this.render();
        }
      });
    }

    if (typeof document !== 'undefined' && this.container) {
      this.render();
    }
  }

  public setSystem(systemId: string): void {
    this.currentSystemId = systemId;
    this.store.selectSystem(systemId);
    this.resetZoom();
    this.render();
  }

  public setTheme(theme: SldTheme): void {
    this.currentTheme = theme;
    if (this.container) this.render();
  }

  public getRotation(): 0 | 90 | 270 {
    return this.rotation;
  }

  public setRotation(deg: 0 | 90 | 270): void {
    this.rotation = deg;
    this.resetZoom();
    if (this.container) this.render();
  }

  public rotate(): void {
    // Cycle: 0° (Normal) -> 90° (Clockwise Wide) -> 270° (Counter-Clockwise Wide) -> 0°
    if (this.rotation === 0) {
      this.rotation = 90;
    } else if (this.rotation === 90) {
      this.rotation = 270;
    } else {
      this.rotation = 0;
    }
    this.resetZoom();
    if (this.container) this.render();
  }

  public getZoomLevel(): number {
    return this.zoomLevel;
  }

  public getPan(): { x: number; y: number } {
    return { x: this.panX, y: this.panY };
  }

  public resetZoom(): void {
    this.zoomLevel = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.updateTransform();
  }

  /**
   * Converts client screen coordinates (clientX, clientY) to SVG root coordinate space (viewBox units).
   */
  public clientToSvgPoint(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.container) return { x: clientX, y: clientY };
    const svg = this.container.querySelector<SVGSVGElement>('#sld-svg-element');
    if (svg) {
      if (typeof svg.getScreenCTM === 'function') {
        const ctm = svg.getScreenCTM();
        if (ctm) {
          const pt = svg.createSVGPoint ? svg.createSVGPoint() : null;
          if (pt) {
            pt.x = clientX;
            pt.y = clientY;
            const svgPt = pt.matrixTransform(ctm.inverse());
            return { x: svgPt.x, y: svgPt.y };
          }
          const inv = ctm.inverse();
          return {
            x: clientX * inv.a + clientY * inv.c + inv.e,
            y: clientX * inv.b + clientY * inv.d + inv.f
          };
        }
      }
      const rect = svg.getBoundingClientRect();
      const viewBox = svg.viewBox?.baseVal;
      const vbWidth = viewBox && viewBox.width > 0 ? viewBox.width : (rect.width || 3550);
      const vbHeight = viewBox && viewBox.height > 0 ? viewBox.height : (rect.height || 1000);
      const scaleX = rect.width > 0 ? vbWidth / rect.width : 1;
      const scaleY = rect.height > 0 ? vbHeight / rect.height : 1;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }
    return { x: clientX, y: clientY };
  }

  /**
   * Zooms by a scale factor centered at a specific client coordinate (e.g. mouse cursor position),
   * or centered at the viewport midpoint if no cursor coordinate is provided.
   */
  public zoomAt(factor: number, clientX?: number, clientY?: number): void {
    const oldZoom = this.zoomLevel;
    const newZoom = Math.max(0.3, Math.min(4.0, Number((oldZoom * factor).toFixed(3))));
    if (newZoom === oldZoom) return;

    let pivotX: number;
    let pivotY: number;

    if (clientX !== undefined && clientY !== undefined) {
      const pt = this.clientToSvgPoint(clientX, clientY);
      pivotX = pt.x;
      pivotY = pt.y;
    } else {
      const viewport = this.container ? this.container.querySelector('#sld-canvas-viewport') : null;
      if (viewport) {
        const rect = viewport.getBoundingClientRect();
        const pt = this.clientToSvgPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        pivotX = pt.x;
        pivotY = pt.y;
      } else {
        pivotX = 0;
        pivotY = 0;
      }
    }

    // Anchor equation: keeps the pivot point stationary under the cursor:
    // P_viewBox = Pan + Zoom * P_local
    // newPan = pivot - (pivot - oldPan) * (newZoom / oldZoom)
    const zoomRatio = newZoom / oldZoom;
    this.panX = Number((pivotX - (pivotX - this.panX) * zoomRatio).toFixed(2));
    this.panY = Number((pivotY - (pivotY - this.panY) * zoomRatio).toFixed(2));
    this.zoomLevel = newZoom;

    this.updateTransform();
  }

  public zoomIn(clientX?: number, clientY?: number): void {
    this.zoomAt(1.25, clientX, clientY);
  }

  public zoomOut(clientX?: number, clientY?: number): void {
    this.zoomAt(1 / 1.25, clientX, clientY);
  }

  updateTransform(): void {
    if (!this.container) return;
    const sldGroup = this.container.querySelector<SVGGElement>('#sld-viewport-group');
    if (sldGroup) {
      sldGroup.setAttribute(
        'transform',
        `translate(${this.panX}, ${this.panY}) scale(${this.zoomLevel})`
      );
    }
    const zoomBadge = this.container.querySelector('#sld-zoom-badge');
    if (zoomBadge) {
      zoomBadge.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }
  }

  public render(): void {
    const model = buildSldSystemModel(this.store, this.currentSystemId);
    const systems = this.store.getSystems();

    // Container HTML structure
    this.container.innerHTML = `
      <div class="sld-shell theme-${this.currentTheme}">
        <!-- Top SLD Command & Scope Bar -->
        <div class="sld-toolbar">
          <div class="sld-toolbar-left">
            <span class="sld-badge-title" title="Electrical Single Line Diagram (2D CAD Wireframe)">
              <span class="sld-badge-icon">⚡</span>
              <span>SLD</span>
            </span>

            <div class="sld-system-select-wrap" title="Selected Electrical System">
              <span class="sld-color-dot" style="background-color: ${model.system.color || '#38bdf8'};"></span>
              <select id="sld-system-select" class="sld-select" aria-label="Select Electrical System for Single Line Diagram">
                ${systems
                  .map(
                    s => `
                  <option value="${s.id}" ${s.id === model.system.id ? 'selected' : ''}>
                    ${escapeXml(s.name)} (${s.inverter.inverterCount * s.inverter.ratedAcPowerKw}kW AC)
                  </option>
                `
                  )
                  .join('')}
              </select>
            </div>

            <!-- Refined Electrical Architecture Status Strip -->
            <div class="sld-arch-strip" title="Single Line Diagram AC Architecture & Interconnection Summary">
              <span class="sld-arch-tag inv" title="Inverter AC Output Rating: ${model.acVoltage}V ${model.isThreePhase ? '3-Phase' : 'Single-Phase'}">
                <span class="tag-lbl">INV</span>
                <span class="tag-val">${model.acVoltage}V ${model.isThreePhase ? '3Φ' : '1Φ'}</span>
              </span>
              <span class="sld-arch-sep">➔</span>
              <span class="sld-arch-tag grid" title="Utility Grid Tapping Voltage: ${model.systemVoltageV}V">
                <span class="tag-lbl">TAP</span>
                <span class="tag-val">${model.systemVoltageV}V</span>
              </span>
              ${
                model.transformerDesign.required
                  ? `<span class="sld-arch-tag xfm" title="${escapeXml(model.transformerDesign.label)}">🔄 ${model.transformerDesign.transformerKva}kVA</span>`
                  : ''
              }
              ${
                model.hasAcCombiner
                  ? `<span class="sld-arch-tag comb" title="AC Combiner Collector Breaker: ${model.acCombinerBreakerRatingA}A ${model.isThreePhase ? '3P' : '2P'}">⚡ Combiner</span>`
                  : ''
              }
              <button id="sld-btn-tap-toggle" class="sld-arch-tag mdp sld-tap-btn" title="Click to toggle between Line-Side Tap (PEC 6.90.8.1) and Load-Side Tap (PEC 6.90.8.2)">
                <span class="tag-lbl">TAP</span>
                <span class="tag-val">${model.mdpTapType === 'line_side' ? '⚡ Line Tap' : '⚡ Load Tap'} (${model.mdpMainBreakerRatingA}A) ⇄</span>
              </button>
            </div>
          </div>

          <!-- Compact Live Telemetry HUD -->
          <div class="sld-hud-bar" role="status" aria-label="Electrical System Telemetry">
            <div class="sld-hud-stat primary" title="Total Installed DC Peak Capacity">
              <span class="hud-icon">☀️</span>
              <span class="hud-num">${model.totalDcKwp}</span>
              <span class="hud-unit">kWp</span>
            </div>
            <div class="sld-hud-sep"></div>
            <div class="sld-hud-stat ac" title="Total Inverter Rated AC Capacity">
              <span class="hud-icon">⚡</span>
              <span class="hud-num">${model.totalAcKw}</span>
              <span class="hud-unit">kW AC</span>
            </div>
            <div class="sld-hud-sep"></div>
            <div class="sld-hud-stat ratio ${model.overallDcAcRatio > 1.35 ? 'warn' : ''}" title="DC to AC Sizing Ratio (PEC/NEC standard: 1.10 - 1.35)">
              <span class="hud-label">DC/AC</span>
              <span class="hud-num">${model.overallDcAcRatio}</span>
            </div>
            <div class="sld-hud-sep"></div>
            <div class="sld-hud-stat strings" title="${model.strings.length} Strings with ${model.totalActivePanels} Total Modules">
              <span class="hud-icon">📐</span>
              <span class="hud-num">${model.strings.length}</span>
              <span class="hud-unit">Str</span>
              <span class="hud-sub">(${model.totalActivePanels} mods)</span>
            </div>
          </div>

          <!-- View Controls: Zoom, Pan, Themes, Exports -->
          <div class="sld-toolbar-right">
            ${
              model.hasVoltageViolations
                ? `
              <div class="sld-btn-group" role="group" aria-label="Voltage violation alert">
                <button id="sld-btn-fix-vmax" class="sld-btn danger" style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; font-weight: bold;" title="Strings violate ${model.inverter.maxDcVoltage}V Vmax. Click to re-string to max ${model.maxAllowedPanelsPerString} panels.">
                  ⚠️ Fix Vmax
                </button>
              </div>
            `
                : ''
            }
            ${
              model.inverter.inverterCount > 1
                ? `
              <div class="sld-btn-group" role="group" aria-label="Inverter distribution">
                <button id="sld-btn-rebalance-inverters" class="sld-btn highlight" title="Balance and connect strings evenly across all ${model.inverter.inverterCount} inverters">
                  ⚡ Connect Inverters (${model.inverter.inverterCount})
                </button>
              </div>
            `
                : ''
            }
            <div class="sld-btn-group" role="group" aria-label="Zoom controls">
              <button id="sld-btn-zoom-out" class="sld-btn" title="Zoom Out (−)">−</button>
              <span id="sld-zoom-badge" class="sld-zoom-level">${Math.round(this.zoomLevel * 100)}%</span>
              <button id="sld-btn-zoom-in" class="sld-btn" title="Zoom In (+)">+</button>
              <button id="sld-btn-zoom-reset" class="sld-btn" title="Fit Entire Single Line Diagram to Screen">🎯 Fit</button>
            </div>

            <div class="sld-btn-group sld-rotate-group" role="group" aria-label="Sheet rotation">
              <button id="sld-btn-rotate" class="sld-btn ${this.rotation !== 0 ? 'active' : ''}" style="${this.rotation !== 0 ? 'color: #38bdf8; border-color: rgba(56, 189, 248, 0.4); background: rgba(56, 189, 248, 0.12); font-weight: 600;' : ''}" title="Rotate SLD 90° (Widescreen layout: expands horizontally as PV strings increase, so sheet gets wider and not taller)">
                🔄 ${this.rotation === 0 ? 'Rotate 90°' : `${this.rotation}° Wide`}
              </button>
            </div>

            <div class="sld-btn-group sld-theme-group" role="group" aria-label="Theme selector">
              <button class="sld-btn ${this.currentTheme === 'blueprint' ? 'active' : ''}" data-theme="blueprint" title="Dark Blueprint Wireframe">📐 Blueprint</button>
              <button class="sld-btn ${this.currentTheme === 'cad-mono' ? 'active' : ''}" data-theme="cad-mono" title="Monochrome CAD Wireframe">🖥️ CAD</button>
              <button class="sld-btn ${this.currentTheme === 'paper' ? 'active' : ''}" data-theme="paper" title="Technical White Drafting Paper">📄 Paper</button>
            </div>

            <div class="sld-btn-group" role="group" aria-label="Cable schedule and exports">
              <button id="sld-btn-pec-schedule" class="sld-btn highlight" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.4); background: rgba(56, 189, 248, 0.12); font-weight: 600;" title="View Philippine Electrical Code (PEC 2017) Cable Schedule">📋 PEC Schedule</button>
            </div>

            <div class="sld-btn-group sld-export-group" role="group" aria-label="Export options">
              <button id="sld-btn-export-svg" class="sld-btn primary sld-export-btn" title="Download standalone 2D vector CAD SVG schematic">💾 SVG</button>
              <button id="sld-btn-export-png" class="sld-btn sld-export-btn" title="Download high-resolution (2x DPI) PNG schematic">🖼️ PNG</button>
              <button id="sld-btn-export-pdf" class="sld-btn sld-export-btn" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.4); background: rgba(56, 189, 248, 0.12); font-weight: 600;" title="Export Comprehensive PVsyst Engineering PDF Report with CAD, Specs, Losses & SLD">📄 PDF Report</button>
            </div>
          </div>
        </div>

        ${
          model.hasVoltageViolations
            ? `
          <div class="sld-voltage-warning-banner" style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 4px; padding: 6px 14px; margin: 0 12px 10px 12px; display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #fca5a5;">
            <span>⚠️ <strong>Inverter Voltage Limit Exceeded:</strong> One or more strings exceed the maximum allowable DC voltage of the inverter (${model.inverter.maxDcVoltage}V, max ${model.maxAllowedPanelsPerString} panels per string).</span>
            <button id="sld-btn-fix-vmax-banner" class="sld-btn danger" style="padding: 4px 10px; font-size: 11px; background: #ef4444; color: #fff; border: none; border-radius: 3px; cursor: pointer; font-weight: bold;">⚡ Auto-Fix & Enforce Vmax</button>
          </div>
        `
            : ''
        }

        <!-- Interactive SVG Canvas Container -->
        <div class="sld-canvas-container" id="sld-canvas-viewport">
          ${this.generateWireframeSvg(model)}
        </div>

        ${this.renderCableScheduleModal(model)}
      </div>
    `;

    this.attachEventListeners();
    this.updateTransform();
  }

  private attachEventListeners(): void {
    return attachEventListenersImpl.call(this);
  }

  /**
   * Modal dialog showing the formal Philippine Electrical Code (PEC 2017) Cable & Conduit Schedule table.
   */
  public renderCableScheduleModal(model: SldSystemModel): string {
    return renderCableScheduleModalImpl.call(this, model);
  }

  /**
   * Computes layout dimensions for the SLD drawing canvas based on system components,
   * string counts, inverter count, transformer presence, and the embedded PEC schedule table.
   * Ensures mathematically guaranteed clearance so the schedule table NEVER overlaps with the Title block.
   */
  public getSldDimensions(model: SldSystemModel): { totalSvgWidth: number; totalSvgHeight: number } {
    return getSldDimensionsImpl.call(this, model);
  }

  /**
   * Generates pure 2D Wireframe vector SVG table for the Philippine Electrical Code (PEC 2017)
   * Cable & Conduit Schedule positioned compactly near the MDP with 2-row wrapped text cells.
   */
  generatePecScheduleSvg(
    model: SldSystemModel,
    tableX: number,
    tableY: number,
    tableW: number,
    colors: { wireColor: string; wireAccent: string; wireWarning: string; wireDanger: string; wireNeutral: string; wireMuted: string; bgColor: string; isDark: boolean; }
  ): { svg: string; height: number } {
    return generatePecScheduleSvgImpl.call(this, model, tableX, tableY, tableW, colors);
  }

  /**
   * Generates pure 2D Wireframe vector SVG string
   */
  public generateWireframeSvg(model: SldSystemModel): string {
    return generateWireframeSvgImpl.call(this, model);
  }

  /**
   * Generates a fully self-contained, standalone valid XML SVG string
   * with explicit pixel dimensions, embedded font styles, and solid background
   * suitable for vector graphics tools (Inkscape, Illustrator, AutoCAD) and web viewers.
   */
  public generateStandaloneSvg(model: SldSystemModel): string {
    return generateStandaloneSvgImpl.call(this, model);
  }

  /**
   * Export standalone SVG vector drawing
   */
  public exportSvg(): void {
    return exportSvgImpl.call(this);
  }

  /**
   * Export high-resolution PNG image (2x crisp retina resolution)
   */
  public exportPng(): void {
    return exportPngImpl.call(this);
  }
}

/**
 * Headless SLD renderer for reports/exports.
 * Produces a standalone SVG (strict XML) plus its intrinsic pixel dimensions,
 * without mounting into the DOM or leaving store subscriptions behind.
 */
export function renderSldReportSvg(
  store: ProjectStore,
  systemId: string,
  theme: SldTheme = 'paper'
): { svg: string; width: number; height: number } {
  const sldUi = new SingleLineDiagramUI(null as unknown as HTMLElement, store, systemId);
  try {
    sldUi.setTheme(theme);
    const model = buildSldSystemModel(store, systemId);
    const svg = sldUi.generateStandaloneSvg(model);
    const { totalSvgWidth, totalSvgHeight } = sldUi.getSldDimensions(model);
    return { svg, width: totalSvgWidth, height: totalSvgHeight };
  } finally {
    sldUi.dispose();
  }
}
