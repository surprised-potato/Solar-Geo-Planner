import { describe, it, expect } from 'vitest';
import { ProjectStore } from '../../store/projectStore';
import { localMetricToLatLng } from '../../geo/projection';
import { collectReportBundleData } from '../pdfReportGenerator';
import { ReportExportOptions } from '../reportTypes';
import { ReportCtx, pdfSafe, php } from './context';
import { drawTable } from './table';
import { buildDesignChecks, computeMonthlyPerformance, overallStatus } from './metrics';

const options: ReportExportOptions = {
  projectTitle: 'T',
  clientName: 'C',
  engineerName: 'E',
  companyName: 'Co',
  reportDate: '2026-11-09',
  systemId: 'all',
  includeCadView: true,
  includeSpecs: true,
  includeSimulation: true,
  includeSld: true,
  includeBoq: true
};

function makeStore(): ProjectStore {
  const origin = { lat: 37.7749, lng: -122.4194 };
  const store = new ProjectStore();
  store.clearAll();
  store.addZone(
    [origin, localMetricToLatLng({ x: 36, y: 0 }, origin), localMetricToLatLng({ x: 36, y: 22 }, origin), localMetricToLatLng({ x: 0, y: 22 }, origin)],
    'roof',
    'Roof A'
  );
  return store;
}

describe('pdfSafe / php', () => {
  it('replaces glyphs Helvetica cannot render', () => {
    expect(pdfSafe('3Φ ≤ 5 ⏚')).toBe('3ph <= 5 (GND)');
    expect(pdfSafe('₱100')).toBe('PHP 100');
    expect(pdfSafe('100°C × 2 — ok')).toBe('100°C × 2 — ok');
    expect(pdfSafe('中')).toBe('?');
    expect(pdfSafe(null)).toBe('');
  });
  it('formats pesos', () => {
    expect(php(1234.5)).toBe('PHP 1,234.50');
    expect(php(undefined)).toBe('PHP 0.00');
  });
});

describe('drawTable pagination', () => {
  it('flows 150 rows over several pages and keeps a totals row', () => {
    const store = makeStore();
    const bundle = collectReportBundleData(store, options);
    const ctx = new ReportCtx(store, bundle, options, false, [], false);
    ctx.beginSection('t', 'Test');
    const rows = Array.from({ length: 150 }, (_, i) => [`R${i + 1}`, String(i)]);
    const drawn = drawTable(ctx, {
      columns: [{ header: 'Name', width: 1 }, { header: 'Val', width: 1, align: 'right' }],
      rows,
      totals: ['Total', '11175']
    });
    expect(drawn).toBe(150);
    expect(ctx.pages.length).toBeGreaterThan(2);
    // All continuation pages stay in the same sheet
    expect(new Set(ctx.pages.map(p => p.sheet)).size).toBe(1);
    expect(ctx.doc.getNumberOfPages()).toBe(ctx.pages.length);
  });
});

describe('computeMonthlyPerformance', () => {
  it('derives real monthly PR that is consistent with the annual PR', () => {
    const store = makeStore();
    const sy = store.getSolarYieldEstimate();
    const perf = computeMonthlyPerformance(sy);
    expect(perf.rows.length).toBe(12);
    expect(perf.total.eGridMwh * 1000).toBeCloseTo(
      sy.monthlyBreakdown.reduce((s, m) => s + m.netAcKwh, 0),
      3
    );
    expect(perf.total.prPercent).toBeCloseTo(sy.performanceRatio, 1);
    // Not a fabricated +/-0.4 wobble: monthly PR follows the actual monthly numbers
    const m0 = sy.monthlyBreakdown[0];
    const expected = (m0.netAcKwh / (perf.referenceKwp * m0.poaKwhPerM2Day * m0.daysInMonth)) * 100;
    expect(perf.rows[0].prPercent).toBeCloseTo(expected, 6);
  });
});

describe('buildDesignChecks', () => {
  it('flags a failing check from real stringing data instead of always passing', () => {
    const store = makeStore();
    const bundle = collectReportBundleData(store, options);
    const s = bundle.systems[0];
    const ok = buildDesignChecks(s.sldModel, s.system.inverter, s.module);
    expect(ok.length).toBe(5);

    // Make the inverter unable to take the string voltage
    const weak = { ...s.system.inverter, maxDcVoltage: 100 };
    const bad = buildDesignChecks(s.sldModel, weak, s.module);
    expect(bad[0].status).toBe(s.sldModel.strings.length ? 'FAIL' : 'N/A');
    if (s.sldModel.strings.length) expect(overallStatus(bad)).toBe('FAIL');
  });
});
