import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectStore } from '../store/projectStore';
import { localMetricToLatLng } from '../geo/projection';
import {
  collectReportBundleData,
  generatePvsystPdf,
  planReport
} from './pdfReportGenerator';
import { ReportExportOptions } from './reportTypes';
import { createDefaultLoadProfile } from '../geo/loadProfile';

describe('PVsyst PDF Report Generator (pdfReportGenerator)', () => {
  let store: ProjectStore;
  const origin = { lat: 37.7749, lng: -122.4194 };

  const defaultOptions: ReportExportOptions = {
    projectTitle: 'Commercial Rooftop PV Solar Project',
    clientName: 'Pacific Commercial Plaza',
    engineerName: 'Senior Solar Engineer, PE',
    companyName: 'Solar Geo Engineering',
    reportDate: '2026-11-08',
    systemId: 'all',
    includeCadView: true,
    includeSpecs: true,
    includeSimulation: true,
    includeSld: true,
    includeBoq: false,
    notes: 'Preliminary feasibility simulation variant P50'
  };

  beforeEach(() => {
    store = new ProjectStore();
    store.clearAll();

    // Setup realistic rooftop array
    const vertices = [
      origin,
      localMetricToLatLng({ x: 36, y: 0 }, origin),
      localMetricToLatLng({ x: 36, y: 22 }, origin),
      localMetricToLatLng({ x: 0, y: 22 }, origin)
    ];
    store.addZone(vertices, 'roof', 'Commercial Rooftop South');
  });

  it('aggregates complete project bundle data for engineering report', () => {
    const bundle = collectReportBundleData(store, defaultOptions);

    expect(bundle).toBeDefined();
    expect(bundle.projectName).toBeDefined();
    expect(bundle.executiveMetrics.totalDcKwp).toBeGreaterThan(0);
    expect(bundle.executiveMetrics.totalPanels).toBeGreaterThan(0);
    expect(bundle.executiveMetrics.performanceRatio).toBeGreaterThan(65);
    expect(bundle.executiveMetrics.specificYieldKwhPerKwp).toBeGreaterThan(1000);
    expect(bundle.zones.length).toBe(1);
    expect(bundle.primaryModule).toBeDefined();
    expect(bundle.primaryInverter).toBeDefined();
    expect(bundle.electricalBos.dcConductor).toBeDefined();
    expect(bundle.electricalBos.acFeederConductor).toBeDefined();
    expect(bundle.sldScheduleRows).toBeDefined();
    expect(bundle.sldScheduleRows.length).toBeGreaterThan(0);
    expect(bundle.solarYield.monthlyBreakdown.length).toBe(12);
  });

  it('generates a full report: cover, contents, then one sheet per enabled section', async () => {
    const plan = await planReport(store, defaultOptions);
    const doc = await generatePvsystPdf(store, defaultOptions);

    // The dry layout pass and the real render agree on the page count
    expect(doc.getNumberOfPages()).toBe(plan.totalPages);
    const ids = plan.toc.map(e => e.id);
    expect(ids).toEqual(['summary', 'layout', 'arrays', 'components', 'electrical', 'energy', 'losses', 'sld', 'notes']);
    // Cover = page 1, contents = page 2, first sheet starts on page 3
    expect(plan.toc[0].startPage).toBe(3);
    // Sheets are contiguous and in order
    for (let i = 1; i < plan.toc.length; i++) {
      expect(plan.toc[i].startPage).toBe(plan.toc[i - 1].endPage + 1);
    }
    expect(plan.toc[plan.toc.length - 1].endPage).toBe(plan.totalPages);

    const pdfBlob = doc.output('blob');
    expect(pdfBlob.size).toBeGreaterThan(1000);
  });

  it('adds BOQ and load-matching sheets only when applicable', async () => {
    const withBoq = await planReport(store, { ...defaultOptions, includeBoq: true });
    expect(withBoq.toc.map(e => e.id)).toContain('boq');
    expect(withBoq.toc.map(e => e.id)).not.toContain('load'); // no load profile yet

    const without = await planReport(store, defaultOptions);
    expect(withBoq.totalPages).toBeGreaterThan(without.totalPages);
  });

  it('respects section exclusions', async () => {
    const plan = await planReport(store, { ...defaultOptions, includeSld: false, includeCover: false });
    const ids = plan.toc.map(e => e.id);
    expect(ids).not.toContain('sld');
    expect(ids).not.toContain('notes');
    // No cover/contents: first sheet is page 1
    expect(plan.toc[0].startPage).toBe(1);
  });

  it('still produces a valid one-page document when nothing is selected', async () => {
    const doc = await generatePvsystPdf(store, {
      ...defaultOptions,
      includeCover: false,
      includeSummary: false,
      includeCadView: false,
      includeArraySchedule: false,
      includeSpecs: false,
      includeElectrical: false,
      includeSimulation: false,
      includeSld: false
    });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('builds per-system electrical data for every system in scope', () => {
    const bundle = collectReportBundleData(store, defaultOptions);
    expect(bundle.systems.length).toBe(bundle.targetSystems.length);
    expect(bundle.systems[0].scheduleRows.length).toBeGreaterThan(0);
    expect(bundle.systems[0].sldModel.system.id).toBe(bundle.targetSystems[0].id);
  });

  it('handles multi-system projects and system-scoped filtering', async () => {
    // Add a second independent ground system
    const sys2 = store.addSystem('Utility Ground System 2');
    const groundVertices = [
      localMetricToLatLng({ x: 50, y: 0 }, origin),
      localMetricToLatLng({ x: 100, y: 0 }, origin),
      localMetricToLatLng({ x: 100, y: 40 }, origin),
      localMetricToLatLng({ x: 50, y: 40 }, origin)
    ];
    store.addZone(groundVertices, 'ground', 'Ground Array 2', sys2.id);

    // Consolidated bundle
    const allBundle = collectReportBundleData(store, { ...defaultOptions, systemId: 'all' });
    expect(allBundle.targetZones.length).toBe(2);

    // Filtered bundle for second system
    const sys2Bundle = collectReportBundleData(store, { ...defaultOptions, systemId: sys2.id });
    expect(sys2Bundle.targetZones.length).toBe(1);
    expect(sys2Bundle.targetZones[0].name).toBe('Ground Array 2');
  });

  it('includes a dedicated Schedule of Arrays page when a project has lots of arrays (10+ arrays)', async () => {
    // Clear and create a project with 10 roof arrays (similar to Riverside Roof Array 1..10)
    store.clearAll();
    const sysId = store.getSystems()[0].id;
    for (let i = 1; i <= 10; i++) {
      const offsetX = (i % 5) * 25;
      const offsetY = Math.floor(i / 5) * 20;
      const vertices = [
        localMetricToLatLng({ x: offsetX, y: offsetY }, origin),
        localMetricToLatLng({ x: offsetX + 20, y: offsetY }, origin),
        localMetricToLatLng({ x: offsetX + 20, y: offsetY + 15 }, origin),
        localMetricToLatLng({ x: offsetX, y: offsetY + 15 }, origin)
      ];
      store.addZone(vertices, 'roof', `Roof Array ${i}`, sysId);
    }

    expect(store.getZones().length).toBe(10);

    const bundle = collectReportBundleData(store, defaultOptions);
    expect(bundle.zones.length).toBe(10);
    expect(bundle.zones[9].name).toBe('Roof Array 10');
    expect(bundle.zones[9].moduleCount).toBeGreaterThan(0);
    expect(bundle.zones[9].totalKwp).toBeGreaterThan(0);

    // Array schedule and sub-array overview paginate instead of truncating
    const plan = await planReport(store, defaultOptions);
    expect(plan.toc.map(e => e.id)).toContain('arrays');
    const doc = await generatePvsystPdf(store, defaultOptions);
    expect(doc.getNumberOfPages()).toBe(plan.totalPages);

    const noSchedule = await planReport(store, { ...defaultOptions, includeArraySchedule: false });
    expect(noSchedule.toc.map(e => e.id)).not.toContain('arrays');
    expect(noSchedule.totalPages).toBeLessThan(plan.totalPages);
  });

  describe('system scope', () => {
    function addSecondSystem(): string {
      const sys2 = store.addSystem('Ground System 2');
      store.addZone(
        [
          localMetricToLatLng({ x: 50, y: 0 }, origin),
          localMetricToLatLng({ x: 100, y: 0 }, origin),
          localMetricToLatLng({ x: 100, y: 40 }, origin),
          localMetricToLatLng({ x: 50, y: 40 }, origin)
        ],
        'ground',
        'Ground Array 2',
        sys2.id
      );
      return sys2.id;
    }

    it('does not match a load profile that belongs to another system', () => {
      const sys2Id = addSecondSystem();
      const sys1Id = store.getSystems()[0].id;
      store.loadProfile = createDefaultLoadProfile(360000, 'commercial_office', 'Meter', sys1Id);

      expect(collectReportBundleData(store, { ...defaultOptions, systemId: sys1Id }).simulationResult).not.toBeNull();
      expect(collectReportBundleData(store, { ...defaultOptions, systemId: sys2Id }).simulationResult).toBeNull();
      expect(collectReportBundleData(store, { ...defaultOptions, systemId: 'all' }).simulationResult).not.toBeNull();
    });

    it('exports a scoped BOQ without overwriting the project BOQ held in the store', async () => {
      const sys2Id = addSecondSystem();
      expect(store.boqState).toBeNull();
      const doc = await generatePvsystPdf(store, { ...defaultOptions, systemId: sys2Id, includeBoq: true });
      expect(doc.getNumberOfPages()).toBeGreaterThan(1);
      expect(store.boqState).toBeNull();
    });

    it('builds spec data for exactly the selected system', () => {
      const sys2Id = addSecondSystem();
      const bundle = collectReportBundleData(store, { ...defaultOptions, systemId: sys2Id });
      expect(bundle.systems.map(s => s.system.id)).toEqual([sys2Id]);
      expect(bundle.systems[0].zones.every(z => z.systemId === sys2Id)).toBe(true);
      expect(bundle.zones.map(z => z.name)).toEqual(['Ground Array 2']);
    });
  });
});
