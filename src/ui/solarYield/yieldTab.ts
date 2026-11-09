/**
 * Solar yield modal: annual / monthly generation and irradiance tab.
 */
import { SolarYieldResult } from '../../geo/solarYield';
import type { SolarYieldModalUI } from '../solarYieldModal';

export function renderYieldTab(this: SolarYieldModalUI, yieldResult: SolarYieldResult, maxMonthlyKwh: number, annualSavings: number, co2OffsetTons: number, treesEquivalent: number): string {
  return `
    <!-- KPI Top Cards -->
    <div class="yield-kpi-grid">
      <div class="kpi-card highlight">
        <span class="kpi-label">ESTIMATED ANNUAL YIELD</span>
        <strong class="kpi-value text-accent-blue">${yieldResult.annualYieldKwh.toLocaleString()} <span class="kpi-unit">kWh/yr</span></strong>
        <span class="kpi-sub">Total Net AC Energy to Grid</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">SPECIFIC ANNUAL YIELD</span>
        <strong class="kpi-value text-accent-green">${yieldResult.specificYieldKwhPerKwp.toLocaleString()} <span class="kpi-unit">kWh/kWp/yr</span></strong>
        <span class="kpi-sub">Normalized Energy Productivity</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">PERFORMANCE RATIO (PR)</span>
        <strong class="kpi-value ${yieldResult.performanceRatio >= 80 ? 'text-accent-green' : 'text-accent-amber'}">
          ${yieldResult.performanceRatio}%
        </strong>
        <span class="kpi-sub">Net System Efficiency</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">CAPACITY FACTOR (CF)</span>
        <strong class="kpi-value text-accent-cyan">${yieldResult.capacityFactor}%</strong>
        <span class="kpi-sub">Annual Utilization</span>
      </div>
    </div>

    <!-- Solar Resource Data Source Card -->
    <div class="yield-resource-banner">
      <div class="resource-info">
        <span class="resource-tag">SOLAR RESOURCE CLIMATOLOGY</span>
        <strong>${yieldResult.dataSourceName}</strong>
        <span class="resource-metrics">
          Annual GHI: <strong>${yieldResult.annualGhiKwhPerM2} kWh/m²</strong> &bull;
          Plane-of-Array POA: <strong>${yieldResult.annualPoaKwhPerM2} kWh/m²</strong>
          ${yieldResult.lossCascade.poaGainLossPercent >= 0 ? `(+${yieldResult.lossCascade.poaGainLossPercent}% tilt gain)` : `(${yieldResult.lossCascade.poaGainLossPercent}% tilt loss)`}
        </span>
      </div>
      <div class="resource-actions">
        <button type="button" id="btn-sync-solar-atlas" class="btn-sm btn-outline ${this.isSyncing ? 'loading' : ''}">
          ${this.isSyncing ? '⏳ Syncing...' : '🔄 Sync with NASA POWER'}
        </button>
      </div>
    </div>
    ${
      this.syncError
        ? `<div class="yield-sync-error">⚠️ ${this.syncError}</div>`
        : ''
    }

    <!-- Monthly Generation Bar Chart -->
    <div class="yield-chart-section">
      <div class="chart-header">
        <span class="chart-title">MONTHLY AC GENERATION PROFILE</span>
        <span class="chart-sub">12-Month Net Energy Output (kWh) &amp; Solar Transposition</span>
      </div>
      <div class="yield-bar-chart-container">
        ${yieldResult.monthlyBreakdown
          .map(m => {
            const heightPercent = Math.max(8, Math.round((m.netAcKwh / maxMonthlyKwh) * 100));
            return `
              <div class="chart-col" title="${m.monthName}: ${m.netAcKwh.toLocaleString()} kWh (POA: ${m.poaKwhPerM2Day} kWh/m²/day, Cell Temp: ${m.cellTempC}°C)">
                <div class="bar-value-label">${(m.netAcKwh / 1000).toFixed(1)}k</div>
                <div class="bar-track">
                  <div class="bar-fill" style="height: ${heightPercent}%;"></div>
                </div>
                <div class="bar-month-label">${m.monthName}</div>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>

    <!-- System Loss Waterfall & Financial Section Grid -->
    <div class="yield-lower-grid">
      <!-- Left: Loss Waterfall -->
      <div class="yield-loss-box">
        <div class="box-header">
          <span>SYSTEM LOSS CASCADE (WATERFALL)</span>
          <span class="badge-total-loss">Total Loss: ${yieldResult.lossCascade.totalLossPercent}%</span>
        </div>
        <div class="loss-list">
          <div class="loss-row">
            <span class="loss-name">Plane-of-Array Gain/Loss</span>
            <span class="loss-val ${yieldResult.lossCascade.poaGainLossPercent >= 0 ? 'text-accent-green' : 'text-accent-amber'}">
              ${yieldResult.lossCascade.poaGainLossPercent >= 0 ? `+${yieldResult.lossCascade.poaGainLossPercent}%` : `${yieldResult.lossCascade.poaGainLossPercent}%`}
            </span>
          </div>
          <div class="loss-row">
            <span class="loss-name">Module Temperature Derate</span>
            <span class="loss-val text-accent-red">-${yieldResult.lossCascade.thermalLossPercent}%</span>
          </div>
          <div class="loss-row">
            <span class="loss-name">Soiling &amp; Surface Dust</span>
            <span class="loss-val text-accent-red">-${yieldResult.lossCascade.soilingLossPercent}%</span>
          </div>
          <div class="loss-row">
            <span class="loss-name">Light-Induced Degradation (LID)</span>
            <span class="loss-val text-accent-red">-${yieldResult.lossCascade.lidLossPercent}%</span>
          </div>
          <div class="loss-row">
            <span class="loss-name">Module Mismatch &amp; Quality</span>
            <span class="loss-val text-accent-red">-${yieldResult.lossCascade.mismatchLossPercent}%</span>
          </div>
          <div class="loss-row">
            <span class="loss-name">DC Homerun &amp; String Wiring</span>
            <span class="loss-val text-accent-red">-${yieldResult.lossCascade.dcCableLossPercent}%</span>
          </div>
          <div class="loss-row">
            <span class="loss-name">Inverter Inefficiency</span>
            <span class="loss-val text-accent-red">-${yieldResult.lossCascade.inverterLossPercent}%</span>
          </div>
          ${
            yieldResult.lossCascade.clippingLossPercent > 0
              ? `
            <div class="loss-row">
              <span class="loss-name">DC/AC Power Clipping</span>
              <span class="loss-val text-accent-amber">-${yieldResult.lossCascade.clippingLossPercent}%</span>
            </div>
          `
              : ''
          }
          <div class="loss-row">
            <span class="loss-name">AC Feeder Voltage Drop</span>
            <span class="loss-val text-accent-red">-${yieldResult.lossCascade.acWiringLossPercent}%</span>
          </div>
          <div class="loss-row">
            <span class="loss-name">System Maintenance &amp; Outages</span>
            <span class="loss-val text-accent-red">-${yieldResult.lossCascade.availabilityLossPercent}%</span>
          </div>
        </div>
      </div>

      <!-- Right: Financial & Environmental ROI -->
      <div class="yield-roi-box">
        <div class="box-header">
          <span>FINANCIAL &amp; ENVIRONMENTAL PROJECTIONS</span>
        </div>
        <div class="roi-tariff-row">
          <label for="inp-electricity-rate">Electricity Rate (${this.currencySymbol}/kWh):</label>
          <input
            type="number"
            id="inp-electricity-rate"
            class="inp-tariff"
            step="0.5"
            min="0"
            value="${this.electricityRate}"
          />
        </div>
        <div class="roi-metrics-list">
          <div class="roi-metric-item">
            <span class="roi-lbl">Est. Year 1 Electricity Savings</span>
            <strong class="roi-val text-accent-green">${this.currencySymbol} ${annualSavings.toLocaleString()}</strong>
          </div>
          <div class="roi-metric-item">
            <span class="roi-lbl">Est. 25-Year Cumulative Savings</span>
            <strong class="roi-val text-accent-green">${this.currencySymbol} ${(annualSavings * 25).toLocaleString()}</strong>
          </div>
          <div class="roi-metric-item">
            <span class="roi-lbl">Annual Carbon Avoidance</span>
            <strong class="roi-val text-accent-cyan">${co2OffsetTons} Tons CO₂ / yr</strong>
          </div>
          <div class="roi-metric-item">
            <span class="roi-lbl">Equivalent Trees Planted</span>
            <strong class="roi-val text-accent-green">🌳 ${treesEquivalent.toLocaleString()} trees / yr</strong>
          </div>
        </div>
      </div>
    </div>
  `;
}
