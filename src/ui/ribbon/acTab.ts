/**
 * Ribbon "ac" tab: inverter, AC interconnection and transformer settings.
 */
import {
  GENERIC_INVERTER_PRESETS,
  STANDARD_AC_VOLTAGES_3PHASE,
  STANDARD_AC_VOLTAGES_1PHASE,
  AcPhaseType,
  MdpTapType,
  SolarSystem
} from '../../types/solar';
import { sizePecTransformer, getRecommendedMdpMainBreaker } from '../../geo/pecWireSizing';
import type { RibbonUI } from '../ribbon';
import { escapeHtml } from '../../utils/html';

export function renderAcTab(this: RibbonUI, currentSystem?: SolarSystem | null): string {
  const activeSystem = currentSystem || this.store.getSelectedSystem() || this.store.getSystems()[0];
  const activeSystemId = activeSystem?.id || '';
  const inv = activeSystem?.inverter || GENERIC_INVERTER_PRESETS[0];
  const invCount = inv.inverterCount || 1;
  const invKw = inv.ratedAcPowerKw || 100;
  const totalKw = invCount * invKw;
  const phase: AcPhaseType = inv.phase || 'three_phase';
  const is3Ph = phase === 'three_phase';
  const invVoltageV = inv.acVoltage || (is3Ph ? 400 : 230);
  const systemVoltageV = activeSystem?.systemVoltageV || invVoltageV;
  const mdpTapType: MdpTapType = activeSystem?.mdpTapType || 'load_side';
  const hasAcCombiner = activeSystem?.hasAcCombiner !== false;

  const acFeederSummary = this.store.getSystemAcFeederSummary(activeSystemId);
  const xfmDesign = sizePecTransformer(totalKw, phase, invVoltageV, systemVoltageV);
  const isDrawingPcc = this.store.drawingMode === 'ac_interconnection';
  const isDrawingAcFeeder = this.store.drawingMode === 'ac_raceway';
  const loadProfile = this.store.getLoadProfile(activeSystemId);

  const standardVoltages = is3Ph ? STANDARD_AC_VOLTAGES_3PHASE : STANDARD_AC_VOLTAGES_1PHASE;
  const isCustomTapVoltage = !standardVoltages.includes(systemVoltageV);

  const standardBreakers = [60, 100, 125, 150, 175, 200, 225, 250, 300, 400, 600, 800, 1000, 1200, 1600, 2000, 2500];
  const recommendedMdpBreaker = getRecommendedMdpMainBreaker(acFeederSummary.ratedCurrentA * 1.25, activeSystem?.mdpMainBreakerA);
  const currentMdpBreaker = activeSystem?.mdpMainBreakerA || recommendedMdpBreaker;

  const invAmps = is3Ph
    ? (invKw * 1000) / (Math.sqrt(3) * invVoltageV)
    : (invKw * 1000) / invVoltageV;
  const totalInvAmps = invAmps * invCount;
  const collectorBreakerA = Math.ceil(totalInvAmps * 1.25);

  return `
    <div class="ribbon-panel" role="tabpanel" aria-label="AC Interconnection, Grid Voltage, Transformers and MDP">
      <!-- Pod 1: System Tapping Voltage & Transformer Design (PEC 4.50) -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">⚡ GRID TAP & XFM</span>
          <span class="cad-pod-tag ${xfmDesign.required ? 'warning' : 'accent'}">
            ${xfmDesign.required ? `${xfmDesign.kvaRating}kVA XFM` : 'DIRECT TAP'}
          </span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-field-row" style="display: flex; gap: 4px; align-items: center;">
            <div class="cad-input-unit-wrap sm" style="flex: 1.1;" title="Grid Interconnection / Tapping Point Nominal Voltage">
              <span class="cad-unit-prefix">Tap</span>
              <select id="ribbon-ac-tap-voltage" class="cad-select-sm" aria-label="System Tapping Voltage">
                ${standardVoltages.map(v => `
                  <option value="${v}" ${systemVoltageV === v ? 'selected' : ''}>${v}V (${is3Ph ? '3Φ' : '1Φ'})</option>
                `).join('')}
                <option value="custom" ${isCustomTapVoltage ? 'selected' : ''}>Custom (${systemVoltageV}V)</option>
              </select>
            </div>
            <div class="cad-val-chip" style="font-size: 10px; padding: 2px 5px;" title="Inverter Output AC Voltage configured in Inverter Station">
              Inv: ${invVoltageV}V
            </div>
          </div>

          <!-- Transformer Design Status HUD -->
          <div style="margin-top: 3px;">
            ${xfmDesign.required ? `
              <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 4px; padding: 3px 6px; font-size: 10px;">
                <div style="display: flex; justify-content: space-between; font-weight: 700; color: #f59e0b;">
                  <span>⚡ ${xfmDesign.type === 'step_up' ? 'Step-Up' : 'Step-Down'} (${xfmDesign.kvaRating} kVA)</span>
                  <span style="font-size: 9px; opacity: 0.85;">${xfmDesign.vectorGroup || 'Dyn11'}</span>
                </div>
                <div style="display: flex; justify-content: space-between; color: var(--text-muted, #94a3b8); font-size: 9px; margin-top: 1px;">
                  <span>Pri: ${xfmDesign.primaryVoltageV}V (${xfmDesign.primaryFullLoadCurrentA.toFixed(0)}A)</span>
                  <span>Sec: ${xfmDesign.secondaryVoltageV}V (${xfmDesign.secondaryFullLoadCurrentA.toFixed(0)}A)</span>
                </div>
              </div>
            ` : `
              <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 4px; padding: 4px 6px; font-size: 10px; display: flex; align-items: center; justify-content: center; gap: 4px; color: #10b981;">
                <span>✓ Direct Interconnection (${invVoltageV}V)</span>
              </div>
            `}
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">PEC 4.50 Transformer Sizing</span>
        </div>
      </div>

      <!-- Pod 2: AC Combiner Box & Collector Breaker -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">📦 AC COMBINER</span>
          <span class="cad-pod-tag ${hasAcCombiner ? 'accent' : ''}">${hasAcCombiner ? 'ENABLED' : 'BYPASS'}</span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-field-row">
            <label style="font-size: 11px; display: flex; align-items: center; gap: 5px; cursor: pointer; color: var(--text-main); font-weight: 500;" title="Consolidate multiple inverter branch circuits into an AC Combiner with a main collector breaker">
              <input type="checkbox" id="ribbon-ac-chk-combiner" ${hasAcCombiner ? 'checked' : ''} />
              <span>Enable Combiner</span>
            </label>
          </div>
          <div class="cad-field-row" style="margin-top: 3px;">
            <div class="cad-telemetry-chip ${hasAcCombiner ? 'highlight' : ''}" style="width: 100%;">
              <span class="chip-label">Collector OCPD:</span>
              <span class="chip-val"><strong>${hasAcCombiner ? `${collectorBreakerA}A` : 'Bypassed'}</strong></span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">${hasAcCombiner ? `${invCount} Inverters &bull; PEC 6.90.8` : 'Direct Inverter Feeds'}</span>
        </div>
      </div>

      <!-- Pod 3: Main Distribution Panel (MDP) & Interconnection Tap -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">🏢 MAIN PANEL (MDP)</span>
          <span class="cad-pod-tag ${mdpTapType === 'line_side' ? 'accent' : 'highlight'}">
            ${mdpTapType === 'line_side' ? 'LINE-SIDE' : 'LOAD-SIDE'}
          </span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-field-row" style="display: flex; gap: 4px;">
            <div class="cad-input-unit-wrap sm" style="flex: 1.1;" title="MDP Interconnection Tap Point Architecture (PEC 705.12)">
              <span class="cad-unit-prefix">Tap</span>
              <select id="ribbon-ac-mdp-tap" class="cad-select-sm" aria-label="MDP Interconnection Tap Architecture">
                <option value="load_side" ${mdpTapType === 'load_side' ? 'selected' : ''}>Load-Side (120%)</option>
                <option value="line_side" ${mdpTapType === 'line_side' ? 'selected' : ''}>Line-Side (Supply)</option>
              </select>
            </div>
            <div class="cad-input-unit-wrap sm" style="flex: 0.9;" title="MDP Main Circuit Breaker Rating in Amperes">
              <span class="cad-unit-prefix">Main</span>
              <select id="ribbon-ac-mdp-main-breaker" class="cad-select-sm" aria-label="MDP Main Circuit Breaker Rating">
                ${standardBreakers.map(b => `
                  <option value="${b}" ${currentMdpBreaker === b ? 'selected' : ''}>${b} A</option>
                `).join('')}
              </select>
            </div>
          </div>

          <!-- Interconnection Architecture Callout -->
          <div style="margin-top: 3px; font-size: 9.5px; padding: 3px 6px; border-radius: 4px; background: ${mdpTapType === 'load_side' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(16, 185, 129, 0.08)'}; border: 1px solid ${mdpTapType === 'load_side' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(16, 185, 129, 0.25)'}; color: ${mdpTapType === 'load_side' ? '#60a5fa' : '#34d399'};">
            ${mdpTapType === 'load_side' ? '🔌 Loads on Load Side • 120% Bus Rule' : '⚡ Loads on Load Side • Supply Side Tap'}
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">PEC 705 Interconnection</span>
        </div>
      </div>

      <!-- Pod 4: Point of Common Coupling (PCC) Interconnection Location -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">📍 PCC GRID POINT</span>
          <span class="cad-pod-tag ${activeSystem?.acInterconnectionLocation ? 'accent' : 'warning'}">
            ${activeSystem?.acInterconnectionLocation ? 'PINNED' : 'NOT SET'}
          </span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-field-row" style="display: flex; gap: 4px;">
            <button id="ribbon-btn-place-pcc" class="btn btn-xs ${isDrawingPcc ? 'btn-primary active-pulse' : 'btn-outline accent'}" style="flex: 1;" title="Click to pin AC Point of Common Coupling (PCC) on satellite map">
              ${isDrawingPcc ? '🎯 Click Map...' : '📍 Pin PCC'}
            </button>
            ${activeSystem?.acInterconnectionLocation ? `
              <button id="ribbon-btn-fly-pcc" class="btn btn-xs btn-outline" title="Zoom map to PCC point">🎯</button>
              <button id="ribbon-btn-clear-pcc" class="btn-icon xs danger" title="Clear PCC location">✕</button>
            ` : ''}
          </div>
          <div class="cad-field-row" style="margin-top: 4px;">
            <div class="cad-input-unit-wrap sm" style="width: 100%;" title="Ground elevation of AC PCC in meters">
              <span class="cad-unit-prefix">PCC Elev</span>
              <input type="number" id="ribbon-pcc-elevation" class="cad-num-input" value="${activeSystem?.acInterconnectionElevationM ?? 0}" step="0.5" aria-label="AC PCC Elevation in Meters" />
              <span class="cad-unit-addon">m</span>
            </div>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">${activeSystem?.acInterconnectionLocation ? 'Location pinned on map' : 'Click to pin PCC on map'}</span>
        </div>
      </div>

      <!-- Pod 5: AC Feeder Raceway & Sizing Telemetry (PEC 2.15) -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">⚡ AC FEEDER RACEWAY</span>
          <span class="cad-pod-tag ${acFeederSummary.totalRunM > 0 ? (acFeederSummary.isCompliant ? 'accent' : 'warning') : ''}">
            ${acFeederSummary.totalRunM > 0 ? (acFeederSummary.isCompliant ? 'PEC OK' : 'OVER 3%') : 'NO RUN'}
          </span>
        </div>
        <div class="cad-pod-body">
          <div class="cad-field-row" style="display: flex; gap: 4px;">
            <button id="ribbon-btn-draw-ac-feeder" class="btn btn-xs ${isDrawingAcFeeder ? 'btn-primary active-pulse' : 'btn-outline warning'}" style="flex: 1;" title="Draw AC Feeder Raceway polyline from Inverter/Combiner to PCC">
              ${isDrawingAcFeeder ? '✏️ Finish Feeder' : '⚡ Draw Feeder'}
            </button>
            ${activeSystem?.acRaceway ? `
              <button id="ribbon-btn-fly-ac-feeder" class="btn btn-xs btn-outline" title="Zoom to AC Feeder">🎯</button>
              <button id="ribbon-btn-clear-ac-feeder" class="btn-icon xs danger" title="Clear AC Feeder">✕</button>
            ` : ''}
          </div>
          <div class="cad-telemetry-hud-grid" style="grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 4px;">
            <div class="hud-item highlight" title="Total AC feeder route distance including riser elevation changes">
              <span class="hud-label">Run Length</span>
              <span class="hud-val">${acFeederSummary.totalRunM} <small>m</small></span>
            </div>
            <div class="hud-item ${acFeederSummary.isCompliant ? '' : 'danger'}" title="AC Feeder Voltage Drop percentage (PEC limit: 3.0%)">
              <span class="hud-label">V-Drop</span>
              <span class="hud-val">${acFeederSummary.voltageDropPercent}% <small>(${acFeederSummary.voltageDropV}V)</small></span>
            </div>
          </div>
          <div style="font-size: 9px; margin-top: 2px; color: var(--text-muted, #94a3b8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(acFeederSummary.conductorCallout || 'THHN Cu in Conduit')}">
            📐 <strong style="color: var(--text-main);">${escapeHtml(acFeederSummary.conductorCallout || 'THHN Cu in Conduit')}</strong>
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">${acFeederSummary.totalRunM > 0 ? (acFeederSummary.isCompliant ? '✓ Within 3.0% Limit (PEC 2.15)' : '⚠️ Exceeds 3.0% V-Drop') : 'Draw feeder route on map'}</span>
        </div>
      </div>

      <!-- Pod 6: Facility Load Profile & Demand -->
      <div class="cad-pod">
        <div class="cad-pod-header">
          <span class="cad-pod-title">🏢 LOAD PROFILE</span>
          <span class="cad-pod-tag accent">
            ${loadProfile ? `${(loadProfile.annualKwh / 1000).toFixed(0)}k kWh` : 'DEFAULT'}
          </span>
        </div>
        <div class="cad-pod-body">
          <button type="button" id="ribbon-btn-open-load-profile" class="btn btn-xs btn-outline" style="width: 100%; justify-content: center; gap: 4px; font-weight: 600; color: #f59e0b; border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.08);" title="Record monthly utility electric bills and 24-hour diurnal demand curves">
            ⚡ Load Profile & Demand
          </button>
          <div style="font-size: 9px; margin-top: 4px; color: var(--text-muted, #94a3b8); text-align: center;">
            ${loadProfile ? `${loadProfile.monthlyBreakdown.length} Months • ${loadProfile.archetype.replace('_', ' ')}` : 'Click to record facility bills'}
          </div>
        </div>
        <div class="cad-pod-footer">
          <span class="cad-hint-text">Prepares for RE Share Matching</span>
        </div>
      </div>
    </div>
  `;
}
