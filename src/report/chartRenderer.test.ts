import { describe, it, expect } from 'vitest';
import {
  buildPvsystLossSteps,
  renderLossWaterfallSvg,
  renderMonthlyYieldChartSvg
} from './chartRenderer';
import { SolarLossCascade, MonthlySolarData } from '../geo/solarYield';

describe('Chart Renderer & PVsyst Loss Waterfall Engine', () => {
  const sampleCascade: SolarLossCascade = {
    stcIdealKwh: 100000,
    poaGainLossPercent: 4.2,
    soilingLossPercent: 2.5,
    lidLossPercent: 1.5,
    mismatchLossPercent: 1.5,
    thermalLossPercent: 11.2,
    dcCableLossPercent: 1.4,
    inverterLossPercent: 1.8,
    clippingLossPercent: 0.2,
    acWiringLossPercent: 0.8,
    availabilityLossPercent: 1.0,
    totalLossPercent: 19.8
  };

  const sampleMonthlyData: MonthlySolarData[] = [
    { month: 0, monthName: 'Jan', daysInMonth: 31, ghiKwhPerM2Day: 4.5, dhiFraction: 0.35, ambientTempC: 25, poaKwhPerM2Day: 4.8, cellTempC: 45, tempDerateFactor: 0.9, grossDcKwh: 8500, netAcKwh: 8100 },
    { month: 1, monthName: 'Feb', daysInMonth: 28, ghiKwhPerM2Day: 5.0, dhiFraction: 0.32, ambientTempC: 26, poaKwhPerM2Day: 5.3, cellTempC: 46, tempDerateFactor: 0.89, grossDcKwh: 9000, netAcKwh: 8600 },
    { month: 2, monthName: 'Mar', daysInMonth: 31, ghiKwhPerM2Day: 5.5, dhiFraction: 0.30, ambientTempC: 28, poaKwhPerM2Day: 5.7, cellTempC: 48, tempDerateFactor: 0.88, grossDcKwh: 9500, netAcKwh: 9100 },
    { month: 3, monthName: 'Apr', daysInMonth: 30, ghiKwhPerM2Day: 6.0, dhiFraction: 0.28, ambientTempC: 30, poaKwhPerM2Day: 6.1, cellTempC: 50, tempDerateFactor: 0.87, grossDcKwh: 10000, netAcKwh: 9600 },
    { month: 4, monthName: 'May', daysInMonth: 31, ghiKwhPerM2Day: 5.8, dhiFraction: 0.32, ambientTempC: 30, poaKwhPerM2Day: 5.8, cellTempC: 50, tempDerateFactor: 0.87, grossDcKwh: 9800, netAcKwh: 9400 },
    { month: 5, monthName: 'Jun', daysInMonth: 30, ghiKwhPerM2Day: 5.2, dhiFraction: 0.40, ambientTempC: 29, poaKwhPerM2Day: 5.1, cellTempC: 49, tempDerateFactor: 0.88, grossDcKwh: 8800, netAcKwh: 8400 },
    { month: 6, monthName: 'Jul', daysInMonth: 31, ghiKwhPerM2Day: 5.0, dhiFraction: 0.45, ambientTempC: 28, poaKwhPerM2Day: 4.9, cellTempC: 48, tempDerateFactor: 0.88, grossDcKwh: 8600, netAcKwh: 8200 },
    { month: 7, monthName: 'Aug', daysInMonth: 31, ghiKwhPerM2Day: 5.0, dhiFraction: 0.45, ambientTempC: 28, poaKwhPerM2Day: 5.0, cellTempC: 48, tempDerateFactor: 0.88, grossDcKwh: 8700, netAcKwh: 8300 },
    { month: 8, monthName: 'Sep', daysInMonth: 30, ghiKwhPerM2Day: 5.1, dhiFraction: 0.42, ambientTempC: 28, poaKwhPerM2Day: 5.2, cellTempC: 48, tempDerateFactor: 0.88, grossDcKwh: 8900, netAcKwh: 8500 },
    { month: 9, monthName: 'Oct', daysInMonth: 31, ghiKwhPerM2Day: 4.9, dhiFraction: 0.38, ambientTempC: 28, poaKwhPerM2Day: 5.2, cellTempC: 47, tempDerateFactor: 0.89, grossDcKwh: 8800, netAcKwh: 8400 },
    { month: 10, monthName: 'Nov', daysInMonth: 30, ghiKwhPerM2Day: 4.6, dhiFraction: 0.35, ambientTempC: 27, poaKwhPerM2Day: 5.0, cellTempC: 46, tempDerateFactor: 0.90, grossDcKwh: 8400, netAcKwh: 8000 },
    { month: 11, monthName: 'Dec', daysInMonth: 31, ghiKwhPerM2Day: 4.3, dhiFraction: 0.36, ambientTempC: 26, poaKwhPerM2Day: 4.7, cellTempC: 45, tempDerateFactor: 0.91, grossDcKwh: 8100, netAcKwh: 7700 }
  ];

  it('builds accurate waterfall loss steps matching PVsyst', () => {
    const steps = buildPvsystLossSteps(sampleCascade);
    expect(steps.length).toBeGreaterThanOrEqual(10);
    expect(steps[0].label).toBe('Nominal STC Array Energy');
    expect(steps[0].nominalPercent).toBe(100.0);

    const resultStep = steps[steps.length - 1];
    expect(resultStep.label).toContain('Delivered Net AC Energy');
    expect(resultStep.nominalPercent).toBeGreaterThan(60);
    expect(resultStep.nominalPercent).toBeLessThan(90);
  });

  it('renders PVsyst Loss Waterfall SVG diagram with valid XML-escaped ampersands', () => {
    const svg = renderLossWaterfallSvg(sampleCascade, 880, 420);
    expect(svg).toContain('<svg');
    expect(svg).toContain('PVsyst Loss Diagram');
    expect(svg).toContain('Cell Temperature Thermal Derate');
    expect(svg).toContain('Inverter Conversion Inefficiency');
    expect(svg).toContain('Module Quality &amp; Mismatch');
    // Must not contain any raw unescaped '&' that would break XML image rasterization
    expect(svg).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
    expect(svg).toContain('</svg>');
  });

  it('renders 12-Month Generation Bar Chart SVG', () => {
    const svg = renderMonthlyYieldChartSvg(sampleMonthlyData, 880, 240);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Monthly Energy Production');
    expect(svg).toContain('Jan');
    expect(svg).toContain('Dec');
    expect(svg).toContain('</svg>');
  });
});
