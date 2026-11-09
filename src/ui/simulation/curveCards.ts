/**
 * Solar generation, facility load and combined dispatch curve cards for the simulation workspace.
 */
import { SimulationResult, HourlyEnergyDispatch } from '../../geo/energySimulation';
import type { SimulationWorkspaceUI } from '../simulationView';

/**
 * Renders Curve 1: Solar Generation Curve with strict baseline bottom alignment.
 */
export function renderSolarCurveCard(this: SimulationWorkspaceUI, hours: HourlyEnergyDispatch[], peakVal: number, simResult: SimulationResult): string {
  return `
    <div class="eng-curve-card solar-curve">
      <div class="curve-card-header">
        <div class="curve-card-title">
          <span class="curve-dot dot-solar"></span>
          <strong>1. SOLAR GENERATION CURVE P<sub>solar</sub> (kW)</strong>
          <span class="curve-meta">&bull; Normalized Solar Bell Curve &bull; Photovoltaic Output</span>
        </div>
        <div class="curve-card-stats">
          <span>Peak: <strong class="text-accent-blue">${simResult.diurnalSummary.peakSolarKw} kW</strong></span>
          <span>Daily: <strong class="text-accent-blue">${simResult.diurnalSummary.dailySolarKwh.toLocaleString()} kWh</strong></span>
        </div>
      </div>

      <div class="eng-chart-box">
        <div class="eng-chart-plot-row">
          <!-- Left Y-Axis Scale -->
          <div class="eng-chart-yaxis">
            <span>${Math.round(peakVal)} kW</span>
            <span>${Math.round(peakVal * 0.5)} kW</span>
            <span>0 kW</span>
          </div>

          <!-- Plot Area: 24 Strictly Bottom-Aligned Columns -->
          <div class="eng-chart-bars-wrap">
            <div class="eng-chart-grid-line line-100"></div>
            <div class="eng-chart-grid-line line-50"></div>
            ${hours.map(h => {
              const heightPct = Math.min(100, Math.round((h.solarKw / peakVal) * 100));
              const valText = h.solarKw >= 1 ? Math.round(h.solarKw) : '';
              const tooltip = `${h.hourLabel}\nSolar Generation: ${h.solarKw.toFixed(1)} kW`;

              return `
                <div class="eng-chart-col" title="${tooltip}">
                  <div class="eng-col-track">
                    ${heightPct > 0 ? `
                      <div class="eng-col-bar bar-solar" style="height: ${heightPct}%;">
                        ${valText ? `<span class="eng-bar-val">${valText}</span>` : ''}
                      </div>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Dedicated X-Axis Labels Row Completely Decoupled from Bar Heights -->
        <div class="eng-chart-xaxis-row">
          <div class="eng-xaxis-spacer"></div>
          <div class="eng-chart-xaxis-labels">
            ${hours.map(h => `
              <div class="eng-xaxis-cell">${h.hour % 2 === 0 ? String(h.hour).padStart(2, '0') + ':00' : ''}</div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders Curve 2: Facility Load Demand Curve with strict baseline bottom alignment.
 */
export function renderLoadCurveCard(this: SimulationWorkspaceUI, hours: HourlyEnergyDispatch[], peakVal: number, simResult: SimulationResult): string {
  return `
    <div class="eng-curve-card load-curve">
      <div class="curve-card-header">
        <div class="curve-card-title">
          <span class="curve-dot dot-load"></span>
          <strong>2. FACILITY LOAD DEMAND CURVE P<sub>load</sub> (kW)</strong>
          <span class="curve-meta">&bull; Facility Consumption Archetype &bull; Diurnal Demand</span>
        </div>
        <div class="curve-card-stats">
          <span>Peak Demand: <strong class="text-accent-amber">${simResult.diurnalSummary.peakLoadKw} kW</strong></span>
          <span>Daily Demand: <strong class="text-accent-amber">${simResult.diurnalSummary.dailyLoadKwh.toLocaleString()} kWh</strong></span>
        </div>
      </div>

      <div class="eng-chart-box">
        <div class="eng-chart-plot-row">
          <!-- Left Y-Axis Scale -->
          <div class="eng-chart-yaxis">
            <span>${Math.round(peakVal)} kW</span>
            <span>${Math.round(peakVal * 0.5)} kW</span>
            <span>0 kW</span>
          </div>

          <!-- Plot Area: 24 Strictly Bottom-Aligned Columns -->
          <div class="eng-chart-bars-wrap">
            <div class="eng-chart-grid-line line-100"></div>
            <div class="eng-chart-grid-line line-50"></div>
            ${hours.map(h => {
              const heightPct = Math.min(100, Math.round((h.loadKw / peakVal) * 100));
              const valText = h.loadKw >= 1 ? Math.round(h.loadKw) : '';
              const tooltip = `${h.hourLabel}\nFacility Demand: ${h.loadKw.toFixed(1)} kW`;

              return `
                <div class="eng-chart-col" title="${tooltip}">
                  <div class="eng-col-track">
                    ${heightPct > 0 ? `
                      <div class="eng-col-bar bar-load" style="height: ${heightPct}%;">
                        ${valText ? `<span class="eng-bar-val">${valText}</span>` : ''}
                      </div>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Dedicated X-Axis Labels Row Completely Decoupled from Bar Heights -->
        <div class="eng-chart-xaxis-row">
          <div class="eng-xaxis-spacer"></div>
          <div class="eng-chart-xaxis-labels">
            ${hours.map(h => `
              <div class="eng-xaxis-cell">${h.hour % 2 === 0 ? String(h.hour).padStart(2, '0') + ':00' : ''}</div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders Curve 3: Combined Dispatch & Power Balance Curve with strict baseline bottom alignment.
 */
export function renderDispatchCurveCard(this: SimulationWorkspaceUI, hours: HourlyEnergyDispatch[], peakVal: number, simResult: SimulationResult): string {
  return `
    <div class="eng-curve-card dispatch-curve">
      <div class="curve-card-header">
        <div class="curve-card-title">
          <span class="curve-dot dot-dispatch"></span>
          <strong>3. COMBINED DISPATCH &amp; POWER BALANCE CURVE (kW)</strong>
          <span class="curve-meta">&bull; Direct Solar Consumed &bull; Grid Export Surplus &bull; Grid Import Deficit</span>
        </div>
        <div class="curve-card-stats">
          <span>Self-Consumed: <strong class="text-accent-green">${simResult.diurnalSummary.dailySelfConsumedKwh.toLocaleString()} kWh</strong></span>
          <span>Export: <strong class="text-accent-amber">${simResult.diurnalSummary.dailyExportedKwh.toLocaleString()} kWh</strong></span>
          <span>Import: <strong class="text-accent-cyan">${simResult.diurnalSummary.dailyImportedKwh.toLocaleString()} kWh</strong></span>
        </div>
        <!-- Legend Bar -->
        <div class="diurnal-legend-bar" style="margin: 0; padding: 0; background: transparent;">
          <span class="legend-chip"><span class="chip-dot chip-self"></span> Direct Solar Consumed (kW)</span>
          <span class="legend-chip"><span class="chip-dot chip-export"></span> Solar Export to Grid (kW)</span>
          <span class="legend-chip"><span class="chip-dot chip-import"></span> Grid Import Needed (kW)</span>
          <span class="legend-chip"><span class="chip-line chip-solar-line"></span> Solar Gen Peak</span>
          <span class="legend-chip"><span class="chip-line chip-load-line"></span> Load Demand Peak</span>
        </div>
      </div>

      <div class="eng-chart-box">
        <div class="eng-chart-plot-row">
          <!-- Left Y-Axis Scale -->
          <div class="eng-chart-yaxis">
            <span>${Math.round(peakVal)} kW</span>
            <span>${Math.round(peakVal * 0.5)} kW</span>
            <span>0 kW</span>
          </div>

          <!-- Plot Area: 24 Strictly Bottom-Aligned Stacked Columns -->
          <div class="eng-chart-bars-wrap">
            <div class="eng-chart-grid-line line-100"></div>
            <div class="eng-chart-grid-line line-50"></div>
            ${hours.map(h => {
              const selfH = Math.round((h.selfConsumedKw / peakVal) * 100);
              const exportH = Math.round((h.exportKw / peakVal) * 100);
              const importH = Math.round((h.importKw / peakVal) * 100);
              const solarTop = Math.max(0, Math.min(96, Math.round(100 - (h.solarKw / peakVal) * 100)));
              const loadTop = Math.max(0, Math.min(96, Math.round(100 - (h.loadKw / peakVal) * 100)));

              const tooltip = `${h.hourLabel}\nSolar Gen: ${h.solarKw.toFixed(1)} kW\nFacility Load: ${h.loadKw.toFixed(1)} kW\nDirect Self-Consumed: ${h.selfConsumedKw.toFixed(1)} kW\nGrid Export Surplus: ${h.exportKw.toFixed(1)} kW\nGrid Import Deficit: ${h.importKw.toFixed(1)} kW`;

              return `
                <div class="eng-chart-col" title="${tooltip}">
                  <div class="eng-col-track">
                    <!-- Reference Markers -->
                    ${h.solarKw > 0 ? `<div class="diurnal-marker marker-solar" style="top: ${solarTop}%;" title="Solar: ${h.solarKw.toFixed(1)} kW"></div>` : ''}
                    ${h.loadKw > 0 ? `<div class="diurnal-marker marker-load" style="top: ${loadTop}%;" title="Load: ${h.loadKw.toFixed(1)} kW"></div>` : ''}

                    <!-- Stacked Power Bars Anchored to Baseline -->
                    ${exportH > 0 ? `<div class="eng-col-bar bar-export" style="height: ${exportH}%;"></div>` : ''}
                    ${selfH > 0 ? `<div class="eng-col-bar bar-self" style="height: ${selfH}%;"></div>` : ''}
                    ${importH > 0 ? `<div class="eng-col-bar bar-import" style="height: ${importH}%;"></div>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Dedicated X-Axis Labels Row Completely Decoupled from Bar Heights -->
        <div class="eng-chart-xaxis-row">
          <div class="eng-xaxis-spacer"></div>
          <div class="eng-chart-xaxis-labels">
            ${hours.map(h => `
              <div class="eng-xaxis-cell">${h.hour % 2 === 0 ? String(h.hour).padStart(2, '0') + ':00' : ''}</div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}
