import { ProjectStore } from '../store/projectStore';
import {
  SolarSystem,
  ArrayZone,
  SolarPanelObject,
  ModuleModel,
  InverterConfig,
  ZNSHINE_600W_BIFACIAL,
  AcPhaseType,
  AcFeederSummary,
  MdpTapType
} from '../types/solar';
import { calculateStringLimits } from '../geo/autofill';
import {
  sizePecAcFeeder,
  sizePecDcStringWire,
  PecWireSizingResult,
  sizePecTransformer,
  getRecommendedMdpMainBreaker,
  PecTransformerDesign
} from '../geo/pecWireSizing';

export type SldTheme = 'blueprint' | 'cad-mono' | 'paper';

export interface SldStringInfo {
  stringId: string;
  panelCount: number;
  nominalPowerW: number;
  totalKwp: number;
  vmp: number;
  voc: number;
  coldVoc: number;
  imp: number;
  isc: number;
  zoneId: string;
  zoneName: string;
  inverterIndex: number;
  mpptIndex: number;
  mpptId: string;
  isVoltageCompliant: boolean;
  voltageViolationMsg?: string;
}

export interface SldMpptInfo {
  mpptIndex: number;
  mpptId: string;
  strings: SldStringInfo[];
  totalPowerKw: number;
  totalCurrentA: number;
}

export interface SldInverterInfo {
  inverterIndex: number;
  modelName: string;
  ratedAcKw: number;
  mppts: SldMpptInfo[];
  totalDcKwp: number;
  dcAcRatio: number;
  ratedAcCurrentA: number;
  breakerRatingA: number;
  phase: AcPhaseType;
  acVoltage: number;
  gridFrequencyHz: number;
  pecWireSizing: PecWireSizingResult;
}

export interface SldSystemModel {
  system: SolarSystem;
  inverter: InverterConfig;
  zones: ArrayZone[];
  module: ModuleModel;
  strings: SldStringInfo[];
  inverters: SldInverterInfo[];
  totalDcKwp: number;
  totalAcKw: number;
  overallDcAcRatio: number;
  phase: AcPhaseType;
  isThreePhase: boolean;
  acVoltage: number;
  systemVoltageV: number;
  gridFrequencyHz: number;
  mainBreakerRatingA: number;
  totalActivePanels: number;
  hasVoltageViolations: boolean;
  maxAllowedPanelsPerString: number;
  optimalPanelsPerString: number;
  mainFeederWireSizing: PecWireSizingResult;
  dcStringWireSizing: ReturnType<typeof sizePecDcStringWire>;
  acFeederSummary: AcFeederSummary;
  transformerDesign: PecTransformerDesign;
  hasAcCombiner: boolean;
  acCombinerWireSizing: PecWireSizingResult;
  acCombinerBreakerRatingA: number;
  mdpTapType: MdpTapType;
  mdpMainBreakerRatingA: number;
}

/**
 * Builds the electrical schematic data model for a given solar system.
 */
export function buildSldSystemModel(store: ProjectStore, systemId: string): SldSystemModel {
  const system = store.getSystem(systemId) || store.getSystems()[0];
  const zones = store.getZones().filter(z => z.systemId === system.id);
  const invConfig = system.inverter;

  // Ensure strings are properly distributed across all inverters and voltage compliant
  store.distributeStringsAcrossInverters(system.id, invConfig.inverterCount, false);

  const allSystemPanels = store.getPanelsForSystem(system.id);
  const activePanels = allSystemPanels.filter(p => p.active);

  // Determine module model
  let module: ModuleModel = ZNSHINE_600W_BIFACIAL;
  if (zones.length > 0 && zones[0].moduleId) {
    const mod = store.getModule(zones[0].moduleId);
    if (mod) module = mod;
  }

  const limits = calculateStringLimits(module, invConfig);
  const optimalSize = limits.optimalPanelsPerString || 20;

  // Extract strings
  const stringMap = new Map<string, SolarPanelObject[]>();
  const unassignedPanels: SolarPanelObject[] = [];

  for (const p of activePanels) {
    if (p.stringId) {
      if (!stringMap.has(p.stringId)) {
        stringMap.set(p.stringId, []);
      }
      stringMap.get(p.stringId)!.push(p);
    } else {
      unassignedPanels.push(p);
    }
  }

  const strings: SldStringInfo[] = [];

  // Add assigned strings
  for (const [strId, panels] of stringMap.entries()) {
    const count = panels.length;
    const firstP = panels[0];
    const zone = store.getZone(firstP.zoneId);

    // Derive or fallback inverter and mppt indices
    let invIdx = firstP.inverterIndex || 1;
    let mpptIdx = 1;

    if (firstP.mpptId) {
      const match = firstP.mpptId.match(/MPPT(\d+)/i);
      if (match) mpptIdx = parseInt(match[1], 10);
      const invMatch = firstP.mpptId.match(/INV(\d+)/i);
      if (invMatch && (!firstP.inverterIndex || firstP.inverterIndex === 1)) {
        invIdx = parseInt(invMatch[1], 10);
      }
    } else {
      const matchStr = strId.match(/M(\d+)/i);
      if (matchStr) mpptIdx = parseInt(matchStr[1], 10);
      const invMatchStr = strId.match(/INV(\d+)/i);
      if (invMatchStr && (!firstP.inverterIndex || firstP.inverterIndex === 1)) {
        invIdx = parseInt(invMatchStr[1], 10);
      }
    }

    if (invIdx > invConfig.inverterCount) invIdx = ((invIdx - 1) % invConfig.inverterCount) + 1;
    if (mpptIdx > invConfig.mpptCountPerInverter) mpptIdx = ((mpptIdx - 1) % invConfig.mpptCountPerInverter) + 1;

    const vmp = Number((count * module.vmp).toFixed(1));
    const voc = Number((count * module.voc).toFixed(1));
    const coldVoc = Number((count * limits.maxColdVoc).toFixed(1));
    const isVoltageCompliant = count <= limits.maxPanelsPerString && coldVoc <= invConfig.maxDcVoltage;
    let voltageViolationMsg: string | undefined;
    if (!isVoltageCompliant) {
      if (count > limits.maxPanelsPerString) {
        voltageViolationMsg = `${count} panels exceeds max limit of ${limits.maxPanelsPerString}`;
      } else if (coldVoc > invConfig.maxDcVoltage) {
        voltageViolationMsg = `Cold Voc (${coldVoc}V) exceeds inverter Vmax (${invConfig.maxDcVoltage}V)`;
      }
    }
    const imp = module.imp;
    const isc = module.isc;
    const totalKwp = Number(((count * module.nominalPowerW) / 1000).toFixed(2));

    strings.push({
      stringId: strId,
      panelCount: count,
      nominalPowerW: module.nominalPowerW,
      totalKwp,
      vmp,
      voc,
      coldVoc,
      imp,
      isc,
      zoneId: firstP.zoneId,
      zoneName: zone ? zone.name : 'Solar Array',
      inverterIndex: invIdx,
      mpptIndex: mpptIdx,
      mpptId: `INV${invIdx}-MPPT${mpptIdx}`,
      isVoltageCompliant,
      voltageViolationMsg
    });
  }

  // If there are unassigned panels, group them into virtual strings so diagram is complete
  if (unassignedPanels.length > 0) {
    for (let i = 0; i < unassignedPanels.length; i += optimalSize) {
      const slice = unassignedPanels.slice(i, i + optimalSize);
      const count = slice.length;
      const strIdx = strings.length + 1;
      const invIdx = ((strIdx - 1) % invConfig.inverterCount) + 1;
      const mpptIdx = (Math.floor((strIdx - 1) / invConfig.inverterCount) % invConfig.mpptCountPerInverter) + 1;
      const strLetter = String.fromCharCode(65 + (Math.floor((strIdx - 1) / (invConfig.inverterCount * invConfig.mpptCountPerInverter)) % invConfig.maxStringsPerMppt));
      const strId = `STR-${String(strIdx).padStart(2, '0')} (INV${invIdx}-M${mpptIdx}-${strLetter})`;

      const vmp = Number((count * module.vmp).toFixed(1));
      const voc = Number((count * module.voc).toFixed(1));
      const coldVoc = Number((count * limits.maxColdVoc).toFixed(1));
      const isVoltageCompliant = count <= limits.maxPanelsPerString && coldVoc <= invConfig.maxDcVoltage;
      let voltageViolationMsg: string | undefined;
      if (!isVoltageCompliant) {
        if (count > limits.maxPanelsPerString) {
          voltageViolationMsg = `${count} panels exceeds max limit of ${limits.maxPanelsPerString}`;
        } else if (coldVoc > invConfig.maxDcVoltage) {
          voltageViolationMsg = `Cold Voc (${coldVoc}V) exceeds inverter Vmax (${invConfig.maxDcVoltage}V)`;
        }
      }
      const imp = module.imp;
      const isc = module.isc;
      const totalKwp = Number(((count * module.nominalPowerW) / 1000).toFixed(2));
      const zone = store.getZone(slice[0].zoneId);

      strings.push({
        stringId: strId,
        panelCount: count,
        nominalPowerW: module.nominalPowerW,
        totalKwp,
        vmp,
        voc,
        coldVoc,
        imp,
        isc,
        zoneId: slice[0].zoneId,
        zoneName: zone ? zone.name : 'Solar Array',
        inverterIndex: invIdx,
        mpptIndex: mpptIdx,
        mpptId: `INV${invIdx}-MPPT${mpptIdx}`,
        isVoltageCompliant,
        voltageViolationMsg
      });
    }
  }

  // Sort strings by inverter and MPPT
  strings.sort((a, b) => {
    if (a.inverterIndex !== b.inverterIndex) return a.inverterIndex - b.inverterIndex;
    if (a.mpptIndex !== b.mpptIndex) return a.mpptIndex - b.mpptIndex;
    return a.stringId.localeCompare(b.stringId);
  });

  // Determine AC configuration: Phase, Voltage, and Frequency
  const phase: AcPhaseType = invConfig.phase || (invConfig.ratedAcPowerKw <= 10 ? 'single_phase' : 'three_phase');
  const isThreePhase = phase === 'three_phase';
  const acVoltage = invConfig.acVoltage || (isThreePhase ? 400 : 230);
  const gridFrequencyHz = invConfig.gridFrequencyHz || 50;

  const inverters: SldInverterInfo[] = [];

  for (let invIdx = 1; invIdx <= invConfig.inverterCount; invIdx++) {
    const invStrings = strings.filter(s => s.inverterIndex === invIdx);
    const mppts: SldMpptInfo[] = [];

    for (let m = 1; m <= invConfig.mpptCountPerInverter; m++) {
      const mpptStrings = invStrings.filter(s => s.mpptIndex === m);
      const totalPowerKw = Number(mpptStrings.reduce((sum, s) => sum + s.totalKwp, 0).toFixed(2));
      const totalCurrentA = Number((mpptStrings.length * module.imp).toFixed(1));

      mppts.push({
        mpptIndex: m,
        mpptId: `INV${invIdx}-MPPT${m}`,
        strings: mpptStrings,
        totalPowerKw,
        totalCurrentA
      });
    }

    const totalDcKwp = Number(invStrings.reduce((sum, s) => sum + s.totalKwp, 0).toFixed(2));
    const ratedAcKw = invConfig.ratedAcPowerKw;
    const dcAcRatio = ratedAcKw > 0 ? Number((totalDcKwp / ratedAcKw).toFixed(2)) : 0;

    // Size Inverter AC Feeder and Breaker per Philippine Electrical Code (PEC 2017)
    const pecWireSizing = sizePecAcFeeder(ratedAcKw, phase, acVoltage, 'ac_inverter');
    const ratedAcCurrentA = pecWireSizing.ratedCurrentA;
    const breakerRatingA = pecWireSizing.ocpdRatingA;

    inverters.push({
      inverterIndex: invIdx,
      modelName: invConfig.modelName,
      ratedAcKw,
      mppts,
      totalDcKwp,
      dcAcRatio,
      ratedAcCurrentA,
      breakerRatingA,
      phase,
      acVoltage,
      gridFrequencyHz,
      pecWireSizing
    });
  }

  const totalDcKwp = Number(strings.reduce((sum, s) => sum + s.totalKwp, 0).toFixed(2));
  const totalAcKw = invConfig.inverterCount * invConfig.ratedAcPowerKw;
  const overallDcAcRatio = totalAcKw > 0 ? Number((totalDcKwp / totalAcKw).toFixed(2)) : 0;

  // System tapping point voltage (separate from inverter output voltage)
  const systemVoltageV = system.systemVoltageV || acVoltage;
  const hasAcCombiner = system.hasAcCombiner !== false;
  const mdpTapType: MdpTapType = system.mdpTapType || 'load_side';

  // Sizing of Step-Up / Step-Down Transformer if voltages differ
  const transformerDesign = sizePecTransformer(totalAcKw, phase, acVoltage, systemVoltageV);

  // Sizing of AC Combiner Collector Breaker & Bus (at inverter voltage)
  const acCombinerWireSizing = sizePecAcFeeder(totalAcKw, phase, acVoltage, 'ac_main');
  const acCombinerBreakerRatingA = acCombinerWireSizing.ocpdRatingA;

  // Sizing Main AC Service Feeder (at system tapping voltage)
  const mainFeederWireSizing = sizePecAcFeeder(totalAcKw, phase, systemVoltageV, 'ac_main');
  const mainBreakerRatingA = mainFeederWireSizing.ocpdRatingA;

  // MDP Main Breaker sizing
  const mdpMainBreakerRatingA = getRecommendedMdpMainBreaker(mainBreakerRatingA, system.mdpMainBreakerA);

  // Size DC PV String Homerun Wire per PEC 6.90
  const dcStringWireSizing = sizePecDcStringWire(module.isc, invConfig.maxStringsPerMppt > 1);

  const hasVoltageViolations = strings.some(s => !s.isVoltageCompliant);

  const acFeederSummary = store.getSystemAcFeederSummary(system.id);

  return {
    system,
    inverter: invConfig,
    zones,
    module,
    strings,
    inverters,
    totalDcKwp,
    totalAcKw,
    overallDcAcRatio,
    phase,
    isThreePhase,
    acVoltage,
    systemVoltageV,
    gridFrequencyHz,
    mainBreakerRatingA,
    totalActivePanels: activePanels.length,
    hasVoltageViolations,
    maxAllowedPanelsPerString: limits.maxPanelsPerString,
    optimalPanelsPerString: limits.optimalPanelsPerString,
    mainFeederWireSizing,
    dcStringWireSizing,
    acFeederSummary,
    transformerDesign,
    hasAcCombiner,
    acCombinerWireSizing,
    acCombinerBreakerRatingA,
    mdpTapType,
    mdpMainBreakerRatingA
  };
}

/**
 * 2D Wireframe Single Line Diagram Component
 */
export class SingleLineDiagramUI {
  private container: HTMLElement;
  private store: ProjectStore;
  private currentSystemId: string;
  private currentTheme: SldTheme = 'blueprint';
  private zoomLevel: number = 1.0;
  private panX: number = 0;
  private panY: number = 0;
  private isPanning: boolean = false;
  private lastClientX: number = 0;
  private lastClientY: number = 0;
  private showCableSchedule: boolean = false;

  constructor(containerIdOrEl: string | HTMLElement, store: ProjectStore, initialSystemId?: string) {
    if (typeof containerIdOrEl === 'string') {
      const el = typeof document !== 'undefined' ? document.getElementById(containerIdOrEl) : null;
      if (!el && typeof document !== 'undefined') throw new Error(`Container #${containerIdOrEl} not found`);
      this.container = el as HTMLElement;
    } else {
      this.container = containerIdOrEl;
    }

    this.store = store;
    const selectedSys = this.store ? this.store.getSelectedSystem() : undefined;
    this.currentSystemId = initialSystemId || (selectedSys ? selectedSys.id : (this.store ? this.store.getSystems()[0]?.id || '' : ''));

    if (this.store) {
      this.store.subscribe(() => {
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

  private updateTransform(): void {
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
            <span class="sld-badge-label">2D WIREFRAME SLD</span>
            <div class="sld-system-select-wrap">
              <span class="sld-color-dot" style="background-color: ${model.system.color || '#38bdf8'};"></span>
              <select id="sld-system-select" class="sld-select" aria-label="Select Electrical System for Single Line Diagram">
                ${systems
                  .map(
                    s => `
                  <option value="${s.id}" ${s.id === model.system.id ? 'selected' : ''}>
                    ${s.name} (${s.inverter.inverterCount * s.inverter.ratedAcPowerKw}kW AC)
                  </option>
                `
                  )
                  .join('')}
              </select>
            </div>

            <!-- Read-only Electrical Architecture Status Strip -->
            <div class="sld-ac-status-strip" style="display: flex; align-items: center; gap: 6px; padding: 3px 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; font-size: 11px;">
              <span style="color: var(--text-dim, #94a3b8);" title="Inverter AC Output Voltage (Configured in Inverters Tab)">Inv: <strong style="color: #38bdf8;">${model.acVoltage}V ${model.isThreePhase ? '3Φ' : '1Φ'}</strong></span>
              <span style="color: rgba(255,255,255,0.2);">|</span>
              <span style="color: var(--text-dim, #94a3b8);" title="Grid Tapping Point System Voltage (Configured in AC System Tab)">Tap: <strong style="color: #f59e0b;">${model.systemVoltageV}V</strong></span>
              ${
                model.transformerDesign.required
                  ? `<span class="badge warning" style="font-size: 9.5px; padding: 1px 4px; background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #f59e0b; border-radius: 3px;" title="${model.transformerDesign.label}">🔄 ${model.transformerDesign.compactCallout}</span>`
                  : ''
              }
              <span style="color: rgba(255,255,255,0.2);">|</span>
              <span style="color: var(--text-dim, #94a3b8);" title="AC Combiner Box Collector (Configured in AC System Tab)">Combiner: <strong style="color: ${model.hasAcCombiner ? '#10b981' : '#64748b'};">${model.hasAcCombiner ? 'Yes' : 'No'}</strong></span>
              <span style="color: rgba(255,255,255,0.2);">|</span>
              <span style="color: var(--text-dim, #94a3b8);" title="MDP Interconnection Tap Side & Main Breaker (Configured in AC System Tab)">MDP: <strong style="color: #38bdf8;">${model.mdpTapType === 'line_side' ? 'Line-Side Tap' : 'Load-Side (120%)'} (${model.mdpMainBreakerRatingA}A)</strong></span>
            </div>
          </div>

          <!-- Electrical KPI Badges -->
          <div class="sld-kpi-group">
            <div class="sld-kpi-chip">
              <span class="lbl">DC Array:</span>
              <span class="val highlight">${model.totalDcKwp} kWp</span>
            </div>
            <div class="sld-kpi-chip">
              <span class="lbl">AC Inverter:</span>
              <span class="val">${model.totalAcKw} kW</span>
            </div>
            <div class="sld-kpi-chip">
              <span class="lbl">DC/AC:</span>
              <span class="val">${model.overallDcAcRatio}</span>
            </div>
            <div class="sld-kpi-chip">
              <span class="lbl">Strings:</span>
              <span class="val">${model.strings.length}</span>
            </div>
            <div class="sld-kpi-chip">
              <span class="lbl">Panels:</span>
              <span class="val">${model.totalActivePanels}</span>
            </div>
          </div>

          <!-- View Controls: Zoom, Pan, Themes, Exports -->
          <div class="sld-toolbar-right">
            ${
              model.hasVoltageViolations
                ? `
              <div class="sld-btn-group" role="group" aria-label="Voltage violation alert">
                <button id="sld-btn-fix-vmax" class="sld-btn danger" style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; font-weight: bold;" title="Strings violate ${model.inverter.maxDcVoltage}V Vmax. Click to re-string to max ${model.maxAllowedPanelsPerString} panels.">
                  ⚠️ Fix Vmax Violations
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
              <button id="sld-btn-zoom-reset" class="sld-btn" title="Fit to Screen (100%)">🎯 Fit</button>
            </div>

            <div class="sld-btn-group" role="group" aria-label="Theme selector">
              <button class="sld-btn ${this.currentTheme === 'blueprint' ? 'active' : ''}" data-theme="blueprint" title="Dark Blueprint Wireframe">📐 Blueprint</button>
              <button class="sld-btn ${this.currentTheme === 'cad-mono' ? 'active' : ''}" data-theme="cad-mono" title="Monochrome CAD Wireframe">🖥️ CAD</button>
              <button class="sld-btn ${this.currentTheme === 'paper' ? 'active' : ''}" data-theme="paper" title="Technical White Drafting Paper">📄 Paper</button>
            </div>

            <div class="sld-btn-group" role="group" aria-label="Cable schedule and exports">
              <button id="sld-btn-pec-schedule" class="sld-btn highlight" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.4); background: rgba(56, 189, 248, 0.1); font-weight: 600;" title="View Philippine Electrical Code (PEC 2017) Cable Schedule">📋 PEC Cable Schedule</button>
            </div>

            <div class="sld-btn-group" role="group" aria-label="Export options">
              <button id="sld-btn-export-svg" class="sld-btn primary" title="Download standalone 2D wireframe vector SVG file">💾 Export SVG</button>
              <button id="sld-btn-export-png" class="sld-btn" title="Download PNG schematic">🖼️ PNG</button>
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
    // System Select
    const sysSelect = this.container.querySelector('#sld-system-select') as HTMLSelectElement;
    sysSelect?.addEventListener('change', () => {
      this.setSystem(sysSelect.value);
    });

    // Rebalance / Connect Inverters
    this.container.querySelector('#sld-btn-rebalance-inverters')?.addEventListener('click', () => {
      this.store.distributeStringsAcrossInverters(this.currentSystemId, undefined, true);
      this.render();
    });

    // Auto-Fix Vmax violations
    const fixHandler = () => {
      this.store.distributeStringsAcrossInverters(this.currentSystemId, undefined, true);
      this.render();
    };
    this.container.querySelector('#sld-btn-fix-vmax')?.addEventListener('click', fixHandler);
    this.container.querySelector('#sld-btn-fix-vmax-banner')?.addEventListener('click', fixHandler);

    // Zoom Controls
    this.container.querySelector('#sld-btn-zoom-in')?.addEventListener('click', () => this.zoomIn());
    this.container.querySelector('#sld-btn-zoom-out')?.addEventListener('click', () => this.zoomOut());
    this.container.querySelector('#sld-btn-zoom-reset')?.addEventListener('click', () => this.resetZoom());

    // Theme selector
    this.container.querySelectorAll('[data-theme]').forEach(btn => {
      btn.addEventListener('click', e => {
        const theme = (e.currentTarget as HTMLElement).getAttribute('data-theme') as SldTheme;
        if (theme) this.setTheme(theme);
      });
    });

    // Export SVG
    this.container.querySelector('#sld-btn-export-svg')?.addEventListener('click', () => {
      this.exportSvg();
    });

    // Export PNG
    this.container.querySelector('#sld-btn-export-png')?.addEventListener('click', () => {
      this.exportPng();
    });

    // Cable Schedule Modal
    this.container.querySelector('#sld-btn-pec-schedule')?.addEventListener('click', () => {
      this.showCableSchedule = true;
      this.render();
    });
    this.container.querySelector('#sld-btn-close-schedule')?.addEventListener('click', () => {
      this.showCableSchedule = false;
      this.render();
    });
    this.container.querySelector('#sld-btn-close-schedule-footer')?.addEventListener('click', () => {
      this.showCableSchedule = false;
      this.render();
    });
    this.container.querySelector('#sld-schedule-backdrop')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'sld-schedule-backdrop') {
        this.showCableSchedule = false;
        this.render();
      }
    });

    // Pan & Zoom gestures on the SVG viewport
    const viewport = this.container.querySelector('#sld-canvas-viewport') as HTMLElement;
    if (viewport) {
      viewport.addEventListener('wheel', (e: WheelEvent) => {
        e.preventDefault();
        // Zoom centered directly where the mouse cursor is located
        const zoomFactor = e.deltaY < 0 ? 1.15 : (1 / 1.15);
        this.zoomAt(zoomFactor, e.clientX, e.clientY);
      }, { passive: false });

      viewport.addEventListener('dblclick', (e: MouseEvent) => {
        e.preventDefault();
        this.zoomIn(e.clientX, e.clientY);
      });

      viewport.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button === 0) {
          this.isPanning = true;
          this.lastClientX = e.clientX;
          this.lastClientY = e.clientY;
          viewport.style.cursor = 'grabbing';
        }
      });

      window.addEventListener('mousemove', (e: MouseEvent) => {
        if (!this.isPanning) return;
        const dx = e.clientX - this.lastClientX;
        const dy = e.clientY - this.lastClientY;
        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;

        const svg = this.container?.querySelector<SVGSVGElement>('#sld-svg-element');
        let scale = 1;
        if (svg) {
          const rect = svg.getBoundingClientRect();
          const vb = svg.viewBox?.baseVal;
          if (rect.width > 0 && vb && vb.width > 0) {
            scale = vb.width / rect.width;
          }
        }
        this.panX = Number((this.panX + dx * scale).toFixed(2));
        this.panY = Number((this.panY + dy * scale).toFixed(2));
        this.updateTransform();
      });

      window.addEventListener('mouseup', () => {
        if (this.isPanning) {
          this.isPanning = false;
          if (viewport) viewport.style.cursor = 'grab';
        }
      });

      // Touch gestures: single-finger pan & two-finger pinch-to-zoom centered at pinch midpoint
      let initialPinchDist = 0;
      let initialPinchZoom = 1;

      viewport.addEventListener('touchstart', (e: TouchEvent) => {
        if (e.touches.length === 1) {
          this.isPanning = true;
          this.lastClientX = e.touches[0].clientX;
          this.lastClientY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
          this.isPanning = false;
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          initialPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
          initialPinchZoom = this.zoomLevel;
        }
      }, { passive: true });

      viewport.addEventListener('touchmove', (e: TouchEvent) => {
        if (e.touches.length === 1 && this.isPanning) {
          const t = e.touches[0];
          const dx = t.clientX - this.lastClientX;
          const dy = t.clientY - this.lastClientY;
          this.lastClientX = t.clientX;
          this.lastClientY = t.clientY;

          const svg = this.container?.querySelector<SVGSVGElement>('#sld-svg-element');
          let scale = 1;
          if (svg) {
            const rect = svg.getBoundingClientRect();
            const vb = svg.viewBox?.baseVal;
            if (rect.width > 0 && vb && vb.width > 0) {
              scale = vb.width / rect.width;
            }
          }
          this.panX = Number((this.panX + dx * scale).toFixed(2));
          this.panY = Number((this.panY + dy * scale).toFixed(2));
          this.updateTransform();
        } else if (e.touches.length === 2 && initialPinchDist > 0) {
          if (e.cancelable) e.preventDefault();
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
          const midX = (t1.clientX + t2.clientX) / 2;
          const midY = (t1.clientY + t2.clientY) / 2;
          const targetZoom = Math.max(0.3, Math.min(4.0, initialPinchZoom * (currentDist / initialPinchDist)));
          this.zoomAt(targetZoom / this.zoomLevel, midX, midY);
        }
      }, { passive: false });

      viewport.addEventListener('touchend', () => {
        this.isPanning = false;
        initialPinchDist = 0;
      }, { passive: true });
    }
  }

  /**
   * Modal dialog showing the formal Philippine Electrical Code (PEC 2017) Cable & Conduit Schedule table.
   */
  public renderCableScheduleModal(model: SldSystemModel): string {
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
                ${model.system.name} &bull; ${model.totalDcKwp} kWp DC &bull; ${model.totalAcKw} kW AC (${model.inverters.length} Inverter${model.inverters.length > 1 ? 's' : ''}) &bull; ${model.acVoltage}V ${model.isThreePhase ? '3-Phase' : 'Single-Phase'} ${model.gridFrequencyHz}Hz
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
                    <td style="padding: 8px 6px; font-weight: bold; color: #f59e0b;">${model.transformerDesign.label}</td>
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
   * Generates pure 2D Wireframe vector SVG string
   */
  public generateWireframeSvg(model: SldSystemModel): string {
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
    // Base width 1700, dynamic height based on string count
    const stringCount = Math.max(model.strings.length, 1);
    const rowHeight = 72;
    const headerHeight = 140;
    const footerHeight = 220;
    const contentHeight = Math.max(stringCount * rowHeight, 480);
    const totalSvgHeight = Math.max(920, headerHeight + contentHeight + footerHeight);
    const hasTransformer = model.transformerDesign.required;
    const totalSvgWidth = hasTransformer ? 3550 : 2980;

    // Component Horizontal Columns:
    // Col 1: Strings (X: 60 - 320)
    // Col 2: DC Protection / Breakers (X: 380 - 424)
    // Col 3: DC Isolators & SPDs (X: 500 - 580)
    // Col 4: Inverter MPPT Inputs & Inverter Enclosure (X: 680 - 1080)
    // Col 5: AC Output & Breakers (X: 1080 - 1440)
    // Col 6: AC Combiner / Collector Bus (X: 1560) & Breaker (X: 1750)
    // Col 7: Transformer (if required) & Secondary Breaker (X: 2020 - 2400)
    // Col 8: Bi-directional Revenue Meter (X: 2570 or 2000)
    // Col 9: Main Distribution Panel (MDP) with Load/Line side tap (X: 2760 or 2190)
    // Col 10: Point of Common Coupling (PCC Grid) (X: 3380 or 2810)

    const strStartX = 60;
    const dcBreakerX = 380;
    const dcSpdX = 500;
    const mpptBusX = 680;
    const invBoxX = 760;
    const invBoxW = 320;
    const acBreakerX = 1400;
    const mdbBusX = 1560;
    const acCombinerBreakerX = 1750;
    const transformerX = 2020;
    const xfmSecBreakerX = 2360;
    const meterX = hasTransformer ? 2570 : 2000;
    const mdpX = hasTransformer ? 2760 : 2190;
    const mdpW = 500;
    const gridX = hasTransformer ? 3380 : 2810;

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
          <text x="${strStartX + 125}" y="${startY + 60}" fill="${wireMuted}" font-family="sans-serif" font-size="11" text-anchor="middle">Plot arrays & auto-string system</text>
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

            <!-- Output Positive & Negative wireframe terminal lines to DC Breaker -->
            <line x1="${strStartX + 260}" y1="${y - 12}" x2="${dcBreakerX}" y2="${y - 12}" stroke="${wireDanger}" stroke-width="1.5" />
            <text x="${strStartX + 264}" y="${y - 15}" fill="${wireDanger}" font-family="monospace" font-size="8">(+) ${model.dcStringWireSizing.cableMm2}mm²</text>

            <line x1="${strStartX + 260}" y1="${y + 12}" x2="${dcBreakerX}" y2="${y + 12}" stroke="${wireNeutral}" stroke-width="1.5" />
            <text x="${strStartX + 264}" y="${y + 22}" fill="${wireNeutral}" font-family="monospace" font-size="8">(−) ${model.dcStringWireSizing.cableMm2}mm²</text>

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

            <!-- DC Surge Protective Device (DC SPD) connected in parallel to DC Breaker & Grounded -->
            <g class="wireframe-dc-spd" id="sld-dc-spd-${str.stringId}" transform="translate(${dcSpdX}, ${y})">
              <!-- Junction node dots tapping in parallel from (+) and (−) feeders -->
              <circle cx="0" cy="-12" r="2.5" fill="${wireDanger}" />
              <circle cx="0" cy="12" r="2.5" fill="${wireNeutral}" />

              <!-- Parallel branch tap leads into DC SPD -->
              <line x1="0" y1="-12" x2="14" y2="-12" stroke="${wireDanger}" stroke-width="1.2" />
              <line x1="14" y1="-12" x2="14" y2="-6" stroke="${wireDanger}" stroke-width="1.2" />

              <line x1="0" y1="12" x2="14" y2="12" stroke="${wireNeutral}" stroke-width="1.2" />
              <line x1="14" y1="12" x2="14" y2="6" stroke="${wireNeutral}" stroke-width="1.2" />

              <!-- SPD Enclosure -->
              <rect x="14" y="-14" width="38" height="28" fill="${bgColor}" stroke="${wireColor}" stroke-width="1.5" rx="2" />
              <!-- Surge lightning symbol -->
              <path d="M 28 -7 L 24 0 L 33 0 L 29 7" fill="none" stroke="${wireWarning}" stroke-width="1.5" />
              <text x="33" y="-17" fill="${wireColor}" font-family="monospace" font-size="8" text-anchor="middle" font-weight="bold">DC SPD</text>
              <text x="33" y="21" fill="${wireMuted}" font-family="monospace" font-size="7" text-anchor="middle">Type 2</text>

              <!-- Earth / PE Ground lead extending from SPD -->
              <line x1="52" y1="0" x2="68" y2="0" stroke="${wireAccent}" stroke-width="1.5" />
              <!-- Ground symbol (⏚) -->
              <line x1="68" y1="-6" x2="68" y2="6" stroke="${wireAccent}" stroke-width="1.8" />
              <line x1="71" y1="-4" x2="71" y2="4" stroke="${wireAccent}" stroke-width="1.5" />
              <line x1="74" y1="-2" x2="74" y2="2" stroke="${wireAccent}" stroke-width="1.5" />
              <text x="70" y="14" fill="${wireAccent}" font-family="monospace" font-size="7" text-anchor="middle">PE GND</text>
            </g>

            <!-- Conductor callout -->
            <text x="${dcSpdX + 85}" y="${y - 16}" fill="${wireAccent}" font-family="monospace" font-size="8">PEC: 2× ${model.dcStringWireSizing.cableMm2}mm² PV1-F</text>
          </g>
        `;
      });
    }

    // Inverter Section Generation
    let invertersSvg = '';
    const invCount = model.inverters.length;
    const invTotalHeight = Math.max(stringYPositions[stringYPositions.length - 1] - stringYPositions[0] + 60, 260);
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
          <text x="${invBoxX + 10}" y="${invY + 17}" fill="${wireColor}" font-family="monospace" font-size="12" font-weight="bold">INVERTER #${inv.inverterIndex}: ${inv.modelName}</text>

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
    const leadToMeterX = hasTransformer ? xfmSecBreakerX + 40 : combinerLeadOutX;

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
      `;
    } else {
      const mainMidX = Math.round((combinerLeadOutX + meterX) / 2);
      transformerOrFeederSvg = `
        <!-- Main Feeder from Combiner/Bus to Revenue Meter -->
        <line x1="${combinerLeadOutX}" y1="${mdbCenterY}" x2="${meterX}" y2="${mdbCenterY}" stroke="${wireAccent}" stroke-width="3" />

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

    // 3. Bi-Directional Revenue kWh Meter
    const meterSvg = `
      <!-- Conductor from Previous Stage to Meter -->
      <line x1="${leadToMeterX}" y1="${mdbCenterY}" x2="${meterX}" y2="${mdbCenterY}" stroke="${wireAccent}" stroke-width="3" />

      <!-- Bi-Directional Revenue Energy Meter -->
      <g class="wireframe-revenue-meter" transform="translate(${meterX}, ${mdbCenterY})">
        <circle cx="28" cy="0" r="28" fill="none" stroke="${wireColor}" stroke-width="2" />
        <text x="28" y="-5" fill="${wireNeutral}" font-family="monospace" font-size="11" text-anchor="middle" font-weight="bold">kWh</text>
        <!-- Bi-directional arrows ⇄ -->
        <path d="M 18 10 L 38 10 M 34 6 L 38 10 L 34 14" fill="none" stroke="${wireColor}" stroke-width="1.5" />
        <path d="M 38 14 L 18 14 M 22 10 L 18 14 L 22 18" fill="none" stroke="${wireColor}" stroke-width="1.5" />
        <text x="28" y="42" fill="${wireColor}" font-family="monospace" font-size="9" text-anchor="middle">UTILITY METER</text>
        <text x="28" y="54" fill="${wireMuted}" font-family="monospace" font-size="8" text-anchor="middle">Bi-Directional Net</text>
      </g>

      <!-- Conductor from Meter to MDP Entrance -->
      <line x1="${meterX + 56}" y1="${mdbCenterY}" x2="${mdpX}" y2="${mdbCenterY}" stroke="${wireAccent}" stroke-width="3" />
    `;

    // 4. Main Distribution Panel (MDP) with Load-Side or Line-Side Interconnection
    const mdpMainBreakerX = mdpX + 230;
    const isLoadSideTap = model.mdpTapType === 'load_side';

    let mdpInternalWiringSvg = '';

    if (isLoadSideTap) {
      // LOAD-SIDE TAP (PEC 6.90.8.2 / 7.5.1.2 120% Bus Rule):
      // PV conductor enters, connects to PV Backfed Breaker at mdpX + 110.
      // Load-side bus connects Facility Load, PV Breaker, and MDP Main Breaker Load terminals.
      mdpInternalWiringSvg = `
        <!-- Load Side Busbar -->
        <line x1="${mdpX + 185}" y1="${mdbCenterY - 35}" x2="${mdpX + 185}" y2="${mdbCenterY + 45}" stroke="${wireAccent}" stroke-width="4" stroke-linecap="round" />
        <text x="${mdpX + 185}" y="${mdbCenterY - 42}" fill="${wireAccent}" font-family="monospace" font-size="7.5" text-anchor="middle">LOAD BUS</text>

        <!-- Conductor from Meter to PV Backfed Breaker -->
        <line x1="${mdpX}" y1="${mdbCenterY + 25}" x2="${mdpX + 110}" y2="${mdbCenterY + 25}" stroke="${wireAccent}" stroke-width="2.5" />

        <!-- PV Backfed Circuit Breaker -->
        <g class="wireframe-pv-backfed-breaker" transform="translate(${mdpX + 110}, ${mdbCenterY + 7})">
          <rect x="0" y="0" width="36" height="36" fill="none" stroke="${wireAccent}" stroke-width="1.8" />
          <line x1="6" y1="6" x2="30" y2="30" stroke="${wireDanger}" stroke-width="2" />
          <line x1="30" y1="6" x2="6" y2="30" stroke="${wireDanger}" stroke-width="2" />
          <text x="18" y="-6" fill="${wireAccent}" font-family="monospace" font-size="8.5" text-anchor="middle" font-weight="bold">PV TIE MCCB</text>
          <text x="18" y="48" fill="${wireNeutral}" font-family="monospace" font-size="8" text-anchor="middle">${model.mainBreakerRatingA}A (Backfed)</text>
        </g>

        <!-- Conductor from PV Breaker to Load Side Busbar -->
        <line x1="${mdpX + 146}" y1="${mdbCenterY + 25}" x2="${mdpX + 185}" y2="${mdbCenterY + 25}" stroke="${wireAccent}" stroke-width="2.5" />
        <circle cx="${mdpX + 185}" cy="${mdbCenterY + 25}" r="3" fill="${wireAccent}" />

        <!-- Conductor from Facility Load to Load Side Busbar -->
        <line x1="${mdpX + 70}" y1="${mdbCenterY - 15}" x2="${mdpX + 185}" y2="${mdbCenterY - 15}" stroke="${wireNeutral}" stroke-width="2" />
        <circle cx="${mdpX + 185}" cy="${mdbCenterY - 15}" r="3" fill="${wireNeutral}" />

        <!-- Conductor from Load Side Busbar to MDP Main Breaker Load Terminal -->
        <line x1="${mdpX + 185}" y1="${mdbCenterY}" x2="${mdpMainBreakerX}" y2="${mdbCenterY}" stroke="${wireAccent}" stroke-width="3" />

        <!-- Conductor from MDP Main Breaker Line Terminal to Service Entrance -->
        <line x1="${mdpMainBreakerX + 40}" y1="${mdbCenterY}" x2="${mdpX + mdpW}" y2="${mdbCenterY}" stroke="${wireDanger}" stroke-width="3" />

        <!-- Load Side 120% Rule Compliance Callout -->
        <text x="${mdpX + mdpW / 2}" y="${mdbCenterY + 86}" fill="${wireAccent}" font-family="monospace" font-size="8" text-anchor="middle" font-weight="bold">✔ LOAD-SIDE TAP: PEC 6.90.8.2 / 7.5.1.2 (120% Bus Rule)</text>
        <text x="${mdpX + mdpW / 2}" y="${mdbCenterY + 98}" fill="${wireMuted}" font-family="monospace" font-size="7" text-anchor="middle">Main: ${model.mdpMainBreakerRatingA}A + PV: ${model.mainBreakerRatingA}A ≤ 120% Bus Ampacity</text>
      `;
    } else {
      // LINE-SIDE TAP (PEC 6.90.8.1 Supply-Side Disconnect Ahead of Main Breaker):
      // PV conductor enters, connects to PV Supply Tap Breaker at mdpX + 310.
      // Facility Load is powered through MDP Main Breaker only.
      // PV tap connects ahead of the MDP Main Breaker on the Line Side.
      mdpInternalWiringSvg = `
        <!-- Conductor from Facility Load to MDP Main Breaker Load Terminal -->
        <line x1="${mdpX + 70}" y1="${mdbCenterY - 15}" x2="${mdpMainBreakerX}" y2="${mdbCenterY}" stroke="${wireNeutral}" stroke-width="2.5" />

        <!-- Conductor from MDP Main Breaker Line Terminal to Grid Line -->
        <line x1="${mdpMainBreakerX + 40}" y1="${mdbCenterY}" x2="${mdpX + mdpW}" y2="${mdbCenterY}" stroke="${wireDanger}" stroke-width="3" />

        <!-- PV Feeder bypassing Load Side straight to Line Side Tap Breaker -->
        <path d="M ${mdpX} ${mdbCenterY + 30} L ${mdpX + 310} ${mdbCenterY + 30}" fill="none" stroke="${wireAccent}" stroke-width="2.5" />

        <!-- PV Supply Tap Circuit Breaker (Line Side Disconnect) -->
        <g class="wireframe-pv-supply-breaker" transform="translate(${mdpX + 310}, ${mdbCenterY + 12})">
          <rect x="0" y="0" width="36" height="36" fill="none" stroke="${wireWarning}" stroke-width="1.8" />
          <line x1="6" y1="6" x2="30" y2="30" stroke="${wireDanger}" stroke-width="2" />
          <line x1="30" y1="6" x2="6" y2="30" stroke="${wireDanger}" stroke-width="2" />
          <text x="18" y="-6" fill="${wireWarning}" font-family="monospace" font-size="8.5" text-anchor="middle" font-weight="bold">PV SUPPLY TAP CB</text>
          <text x="18" y="48" fill="${wireNeutral}" font-family="monospace" font-size="8" text-anchor="middle">${model.mainBreakerRatingA}A (Tap)</text>
        </g>

        <!-- Tap Conductor connecting into Line Side Service Conductor -->
        <path d="M ${mdpX + 346} ${mdbCenterY + 30} L ${mdpX + 410} ${mdbCenterY + 30} L ${mdpX + 410} ${mdbCenterY}" fill="none" stroke="${wireAccent}" stroke-width="2.5" />
        <circle cx="${mdpX + 410}" cy="${mdbCenterY}" r="4" fill="${wireDanger}" />
        <text x="${mdpX + 410}" y="${mdbCenterY - 10}" fill="${wireWarning}" font-family="monospace" font-size="7.5" text-anchor="middle" font-weight="bold">SUPPLY TAP POINT</text>

        <!-- Line Side Supply Tap Compliance Callout -->
        <text x="${mdpX + mdpW / 2}" y="${mdbCenterY + 86}" fill="${wireWarning}" font-family="monospace" font-size="8" text-anchor="middle" font-weight="bold">✔ LINE-SIDE TAP: PEC 6.90.8.1 (Supply-Side Ahead of Main)</text>
        <text x="${mdpX + mdpW / 2}" y="${mdbCenterY + 98}" fill="${wireMuted}" font-family="monospace" font-size="7" text-anchor="middle">Connected between Meter &amp; Main Disconnect • Not limited by 120% rule</text>
      `;
    }

    const mdpSvg = `
      <!-- Main Distribution Panel Enclosure -->
      <g class="wireframe-mdp-enclosure">
        <!-- Panel Outer Frame -->
        <rect x="${mdpX}" y="${mdbCenterY - 110}" width="${mdpW}" height="225" fill="none" stroke="${wireNeutral}" stroke-width="2" rx="4" />
        
        <!-- Header Banner -->
        <rect x="${mdpX}" y="${mdbCenterY - 110}" width="${mdpW}" height="28" fill="none" stroke="${wireNeutral}" stroke-width="1.5" />
        <text x="${mdpX + mdpW / 2}" y="${mdbCenterY - 92}" fill="${wireNeutral}" font-family="monospace" font-size="11" text-anchor="middle" font-weight="bold">MAIN DISTRIBUTION PANEL (MDP) • ${model.systemVoltageV}V ${model.isThreePhase ? '3Φ' : '1Φ'}</text>

        <!-- Internal Load/Line Divider Line -->
        <line x1="${mdpX + 250}" y1="${mdbCenterY - 82}" x2="${mdpX + 250}" y2="${mdbCenterY + 72}" stroke="${wireMuted}" stroke-width="1" stroke-dasharray="3,3" />
        <text x="${mdpX + 125}" y="${mdbCenterY - 65}" fill="${wireAccent}" font-family="monospace" font-size="9.5" text-anchor="middle" font-weight="bold">LOAD SIDE (FACILITY BUS)</text>
        <text x="${mdpX + 375}" y="${mdbCenterY - 65}" fill="${wireDanger}" font-family="monospace" font-size="9.5" text-anchor="middle" font-weight="bold">LINE SIDE (UTILITY SERVICE)</text>

        <!-- Facility / Building Load Box (Tapped on Load Side) -->
        <g class="wireframe-facility-load" transform="translate(${mdpX + 20}, ${mdbCenterY - 55})">
          <rect x="0" y="0" width="100" height="40" fill="none" stroke="${wireNeutral}" stroke-width="1.5" rx="3" />
          <text x="50" y="16" fill="${wireNeutral}" font-family="monospace" font-size="9" text-anchor="middle" font-weight="bold">FACILITY LOAD</text>
          <text x="50" y="28" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="middle">Building Demand</text>
          <line x1="50" y1="40" x2="50" y2="55" stroke="${wireNeutral}" stroke-width="2" />
        </g>
        <text x="${mdpX + 70}" y="${mdbCenterY + 10}" fill="${wireNeutral}" font-family="monospace" font-size="7" text-anchor="middle" font-weight="bold">▲ TAPPED ON LOAD SIDE</text>

        <!-- MDP Main Breaker (MCCB/MCB) -->
        <g class="wireframe-mdp-main-breaker" transform="translate(${mdpMainBreakerX}, ${mdbCenterY - 20})">
          <rect x="0" y="0" width="40" height="40" fill="none" stroke="${wireDanger}" stroke-width="2" />
          <line x1="8" y1="8" x2="32" y2="32" stroke="${wireDanger}" stroke-width="2.5" />
          <line x1="32" y1="8" x2="8" y2="32" stroke="${wireDanger}" stroke-width="2.5" />
          <text x="20" y="-8" fill="${wireDanger}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">${model.isThreePhase ? 'MDP MAIN MCCB' : 'MDP MAIN MCB'}</text>
          <text x="20" y="52" fill="${wireNeutral}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">${model.mdpMainBreakerRatingA}A ${model.isThreePhase ? '3P' : '2P'}</text>
          <text x="20" y="64" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="middle">Main Service Disconnect</text>
        </g>

        <!-- Direction Indicators -->
        <text x="${mdpMainBreakerX - 25}" y="${mdbCenterY - 26}" fill="${wireAccent}" font-family="monospace" font-size="8" text-anchor="middle">LOAD ➔</text>
        <text x="${mdpMainBreakerX + 65}" y="${mdbCenterY - 26}" fill="${wireDanger}" font-family="monospace" font-size="8" text-anchor="middle">➔ LINE</text>

        <!-- Dynamic Tap Interconnection Wiring -->
        ${mdpInternalWiringSvg}
      </g>
    `;

    // 5. Utility Grid (PCC) Interconnection
    const gridPccSvg = `
      <!-- Conductor from MDP Service Exit to Grid PCC -->
      <line x1="${mdpX + mdpW}" y1="${mdbCenterY}" x2="${gridX}" y2="${mdbCenterY}" stroke="${wireDanger}" stroke-width="3" />
      <text x="${Math.round((mdpX + mdpW + gridX) / 2)}" y="${mdbCenterY - 8}" fill="${wireMuted}" font-family="monospace" font-size="7.5" text-anchor="middle">SERVICE ENTRANCE</text>

      <!-- Utility Grid (PCC) Symbol -->
      <g class="wireframe-grid-pcc" transform="translate(${gridX}, ${mdbCenterY})">
        <rect x="0" y="-35" width="70" height="70" fill="none" stroke="${wireNeutral}" stroke-width="2" rx="4" />
        <!-- High voltage flash symbol -->
        <path d="M 38 -20 L 28 0 L 42 0 L 30 22" fill="none" stroke="${wireWarning}" stroke-width="2.5" />
        <text x="35" y="-45" fill="${wireNeutral}" font-family="monospace" font-size="11" text-anchor="middle" font-weight="bold">UTILITY GRID</text>
        <text x="35" y="48" fill="${wireAccent}" font-family="monospace" font-size="9" text-anchor="middle" font-weight="bold">PCC ${model.systemVoltageV}V ${model.isThreePhase ? '3Φ' : '1Φ'}</text>
        <text x="35" y="60" fill="${wireMuted}" font-family="monospace" font-size="8" text-anchor="middle">${model.gridFrequencyHz}Hz ${model.isThreePhase ? 'Wye/Delta' : 'L+N+PE'}</text>
        ${
          model.acFeederSummary.acInterconnectionLocation
            ? `<text x="35" y="72" fill="${wireAccent}" font-family="monospace" font-size="7" text-anchor="middle">PINNED: ${model.acFeederSummary.acInterconnectionLocation.lat.toFixed(4)}, ${model.acFeederSummary.acInterconnectionLocation.lng.toFixed(4)}</text>`
            : ''
        }
      </g>
    `;

    const acDistributionSvg = `
      <g class="wireframe-ac-distribution">
        ${acCombinerSvg}
        ${transformerOrFeederSvg}
        ${meterSvg}
        ${mdpSvg}
        ${gridPccSvg}
      </g>
    `;

    // Standard CAD Engineering Drawing Title Block (Bottom Right)
    const titleBlockW = 580;
    const titleBlockH = 140;
    const titleBlockX = totalSvgWidth - titleBlockW - 50;
    const titleBlockY = totalSvgHeight - titleBlockH - 35;
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
        <text x="12" y="28" fill="${wireNeutral}" font-family="monospace" font-size="11" font-weight="bold">${this.store.projectName || 'Solar Geo Planner'}</text>

        <text x="292" y="16" fill="${wireMuted}" font-family="sans-serif" font-size="8">DRAWING TYPE:</text>
        <text x="292" y="28" fill="${wireColor}" font-family="monospace" font-size="12" font-weight="bold">ELECTRICAL SINGLE LINE DIAGRAM (SLD)</text>

        <!-- Row 2: Selected System & Electrical Ratings -->
        <text x="12" y="50" fill="${wireMuted}" font-family="sans-serif" font-size="8">ELECTRICAL SYSTEM:</text>
        <text x="12" y="64" fill="${wireNeutral}" font-family="monospace" font-size="11" font-weight="bold">${model.system.name}</text>

        <text x="292" y="50" fill="${wireMuted}" font-family="sans-serif" font-size="8">CAPACITY (DC / AC):</text>
        <text x="292" y="64" fill="${wireAccent}" font-family="monospace" font-size="11" font-weight="bold">${model.totalDcKwp} kWp DC  /  ${model.totalAcKw} kW AC  (DC/AC ${model.overallDcAcRatio})</text>

        <!-- Row 3: Design Specs & Standards -->
        <text x="12" y="86" fill="${wireMuted}" font-family="sans-serif" font-size="8">ELECTRICAL CODE & WIRING:</text>
        <text x="12" y="98" fill="${wireAccent}" font-family="monospace" font-size="9.5" font-weight="bold">PEC 2017 Cu THHN/THWN-2</text>

        <text x="192" y="86" fill="${wireMuted}" font-family="sans-serif" font-size="8">VOLTAGE (INV / SYSTEM):</text>
        <text x="192" y="98" fill="${wireNeutral}" font-family="monospace" font-size="9.5">Inv: ${model.acVoltage}V / Tap: ${model.systemVoltageV}V ${model.isThreePhase ? '3Φ' : '1Φ'}</text>

        <text x="392" y="86" fill="${wireMuted}" font-family="sans-serif" font-size="8">MDP INTERCONNECTION:</text>
        <text x="392" y="98" fill="${wireAccent}" font-family="monospace" font-size="8.5" font-weight="bold">${model.mdpTapType === 'line_side' ? 'Line-Side Tap (PEC 6.90.8.1)' : 'Load-Side 120% (PEC 6.90.8.2)'} • ${model.mdpMainBreakerRatingA}A Main</text>

        <!-- Row 4: Meta, Scale & Date -->
        <text x="12" y="120" fill="${wireMuted}" font-family="sans-serif" font-size="8">DATE: ${today}</text>
        <text x="12" y="132" fill="${wireMuted}" font-family="sans-serif" font-size="8">SYSTEM ID: ${model.system.id}</text>

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
        <text x="12" y="76" fill="${wireMuted}" font-family="sans-serif" font-size="8.2">4. Interconnection: MDP Main Breaker ${model.mdpMainBreakerRatingA}A. Interconnection method: ${model.mdpTapType === 'line_side' ? 'PEC 6.90.8.1 Line-Side Tap' : 'PEC 6.90.8.2 Load-Side Tap (120% Bus Rule)'}.</text>
        <text x="12" y="90" fill="${wireMuted}" font-family="sans-serif" font-size="8.2">5. Building Load: Always tapped on the Load Side of the MDP Main Breaker.</text>
        ${hasTransformer ? `<text x="12" y="104" fill="${wireAccent}" font-family="monospace" font-size="8.2">6. Transformer: ${model.transformerDesign.transformerKva}kVA ${model.transformerDesign.type === 'step_up' ? 'Step-Up' : 'Step-Down'} (${model.transformerDesign.primaryVoltageV}V➔${model.transformerDesign.secondaryVoltageV}V) sized per PEC 4.50 / Article 4.50.</text>` : `<text x="12" y="104" fill="${wireMuted}" font-family="sans-serif" font-size="8.2">6. Raceways &amp; Conduit: EMT / RMC sized per PEC Chapter 9 Table 10.1.1.4 (max 40% conduit fill).</text>`}
        <text x="12" y="120" fill="${wireAccent}" font-family="monospace" font-size="8.2">7. Grounding: Equipment Grounding Conductors (EGC) strictly sized per PEC 2017 Table 2.50.6.13.</text>
      </g>
    `;

    // Stage Column Headers
    const columnHeadersSvg = `
      <g class="wireframe-column-headers" transform="translate(0, ${headerHeight - 20})">
        <line x1="${strStartX}" y1="20" x2="${gridX + 70}" y2="20" stroke="${wireMuted}" stroke-width="1" stroke-dasharray="2,4" />

        <text x="${strStartX + 130}" y="10" fill="${wireColor}" font-family="monospace" font-size="11" text-anchor="middle" font-weight="bold">1. PV STRINGS</text>
        <text x="${dcBreakerX + 22}" y="10" fill="${wireDanger}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">DC BREAKER</text>
        <text x="${dcSpdX + 35}" y="10" fill="${wireColor}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">DC SPD (⏚)</text>
        <text x="${invBoxX + invBoxW / 2}" y="10" fill="${wireColor}" font-family="monospace" font-size="11" text-anchor="middle" font-weight="bold">2. INVERTERS</text>
        <text x="${acBreakerX + 18}" y="10" fill="${wireAccent}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">INV CB</text>
        <text x="${mdbBusX}" y="10" fill="${wireAccent}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">${model.hasAcCombiner ? '3. AC COMBINER' : '3. AC BUS'}</text>
        ${model.hasAcCombiner ? `<text x="${acCombinerBreakerX + 20}" y="10" fill="${wireAccent}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">COMBINER CB</text>` : ''}
        ${hasTransformer ? `
          <text x="${transformerX + 42}" y="10" fill="${wireWarning}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">4. TRANSFORMER</text>
          <text x="${xfmSecBreakerX + 20}" y="10" fill="${wireDanger}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">SEC CB</text>
        ` : ''}
        <text x="${meterX + 28}" y="10" fill="${wireColor}" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">METER</text>
        <text x="${mdpX + mdpW / 2}" y="10" fill="${wireNeutral}" font-family="monospace" font-size="11" text-anchor="middle" font-weight="bold">5. MAIN DISTRIBUTION PANEL (MDP)</text>
        <text x="${gridX + 35}" y="10" fill="${wireNeutral}" font-family="monospace" font-size="11" text-anchor="middle" font-weight="bold">6. UTILITY GRID</text>
      </g>
    `;

    // Blueprint / CAD Engineering Border Frame
    const borderFrameSvg = `
      <rect x="20" y="20" width="${totalSvgWidth - 40}" height="${totalSvgHeight - 40}" fill="none" stroke="${wireNeutral}" stroke-width="2" />
      <rect x="26" y="26" width="${totalSvgWidth - 52}" height="${totalSvgHeight - 52}" fill="none" stroke="${wireNeutral}" stroke-width="1" />

      <!-- Top Title Banner -->
      <text x="45" y="60" fill="${wireNeutral}" font-family="monospace" font-size="18" font-weight="bold">ELECTRICAL SINGLE LINE DIAGRAM (2D WIREFRAME)</text>
      <text x="45" y="82" fill="${wireColor}" font-family="monospace" font-size="13">SYSTEM: ${model.system.name} &bull; ${model.totalDcKwp} kWp DC &bull; ${model.totalAcKw} kW AC &bull; ${model.strings.length} STRINGS</text>
      <text x="${totalSvgWidth - 50}" y="60" fill="${wireMuted}" font-family="monospace" font-size="11" text-anchor="end">PEC 2017 / NEC 690 / IEC 60364-7-712</text>
      <line x1="45" y1="95" x2="${totalSvgWidth - 50}" y2="95" stroke="${wireNeutral}" stroke-width="1.5" />
    `;

    return `
      <svg id="sld-svg-element" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSvgWidth} ${totalSvgHeight}" width="100%" height="100%" style="background-color: ${bgColor};">
        <defs>
          <!-- 2D Wireframe Fine Engineering CAD Grid Pattern -->
          <pattern id="sldCadGrid" width="25" height="25" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="25" y2="0" stroke="${wireGrid}" stroke-width="0.5" />
            <line x1="0" y1="0" x2="0" y2="25" stroke="${wireGrid}" stroke-width="0.5" />
          </pattern>
        </defs>

        <!-- Background CAD Grid -->
        <rect width="100%" height="100%" fill="url(#sldCadGrid)" />

        <!-- Viewport Group for Smooth Pan & Zoom -->
        <g id="sld-viewport-group">
          ${borderFrameSvg}
          ${columnHeadersSvg}
          ${stringsSvg}
          ${dcConnectionsSvg}
          ${invertersSvg}
          ${acDistributionSvg}
          ${titleBlockSvg}
          ${legendSvg}
        </g>
      </svg>
    `;
  }

  /**
   * Export standalone SVG file
   */
  public exportSvg(): void {
    const model = buildSldSystemModel(this.store, this.currentSystemId);
    const svgContent = this.generateWireframeSvg(model);
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.system.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_Single_Line_Diagram_2D_Wireframe.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Export high-resolution PNG image
   */
  public exportPng(): void {
    const model = buildSldSystemModel(this.store, this.currentSystemId);
    const svgContent = this.generateWireframeSvg(model);
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 3500; // 2x high resolution
      canvas.height = 2200;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = this.currentTheme === 'paper' ? '#ffffff' : '#081226';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `${model.system.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_Single_Line_Diagram_2D_Wireframe.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
    };

    img.src = url;
  }
}
