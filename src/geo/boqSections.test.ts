import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectStore } from '../store/projectStore';
import { poleCount } from './boq/items/equipmentAndInterconnection';
import { exportBoqAndDupaCsv, getBoqProjectTotal, getBoqSectionTotals, templateNoOf } from './boqCalculator';

const base = {
  anchor: { lat: 15.0, lng: 120.5 },
  headingDeg: 0,
  lengthM: 60,
  widthM: 14,
  roofPitchDeg: 15,
  gapM: 10
};

describe('multi-farm BOQ', () => {
  let store: ProjectStore;

  beforeEach(() => {
    try { localStorage.clear(); } catch { /* no localStorage */ }
    store = new ProjectStore();
    store.clearAll();
  });

  function twoFarms() {
    const [a] = store.addPoultryHouses({ ...base, count: 2 });
    const [b] = store.addPoultryHouses({ ...base, anchor: { lat: 15.01, lng: 120.5 }, count: 3 });
    return {
      farmA: store.sections.get(a.sectionId)!,
      farmB: store.sections.get(b.sectionId)!
    };
  }

  it('gives each new farm its own electrical system', () => {
    const { farmA, farmB } = twoFarms();
    expect(farmA.systemIds).toHaveLength(1);
    expect(farmB.systemIds).toHaveLength(1);
    expect(farmA.systemIds[0]).not.toBe(farmB.systemIds[0]);
  });

  it('generates a D1-D13 set per farm numbered A1..A13 and B1..B13', () => {
    const { farmA, farmB } = twoFarms();
    const boq = store.getBoqState(undefined, true);
    expect(boq.items).toHaveLength(26);
    expect(boq.items.slice(0, 13).map(i => i.itemNo)).toEqual(Array.from({ length: 13 }, (_, i) => `A${i + 1}`));
    expect(boq.items.slice(13).map(i => i.itemNo)).toEqual(Array.from({ length: 13 }, (_, i) => `B${i + 1}`));
    expect(boq.items.slice(0, 13).every(i => i.sectionId === farmA.id)).toBe(true);
    expect(boq.items.slice(13).every(i => i.sectionId === farmB.id)).toBe(true);
    expect(new Set(boq.items.map(i => i.itemNo)).size).toBe(26);
    expect(boq.items.map(templateNoOf).slice(0, 13)).toEqual(Array.from({ length: 13 }, (_, i) => `D${i + 1}`));
  });

  it('sizes each farm from its own panels (no double counting)', () => {
    const { farmA, farmB } = twoFarms();
    const boq = store.getBoqState(undefined, true);
    const pv = (id: string) => boq.items.find(i => i.sectionId === id && templateNoOf(i) === 'D4')!;
    const kwpOf = (ids: string[]) => store.getZones().filter(z => ids.includes(z.systemId)).reduce((s, z) => s + z.totalKwp, 0);
    // Farm B has 3 houses vs 2 in farm A, so it should carry more PV cost
    expect(kwpOf(farmB.systemIds)).toBeGreaterThan(kwpOf(farmA.systemIds));
    expect(pv(farmB.id).totalItemCostPhp).toBeGreaterThan(pv(farmA.id).totalItemCostPhp);
  });

  it('section subtotals add up to the grand total', () => {
    twoFarms();
    const boq = store.getBoqState(undefined, true);
    const groups = getBoqSectionTotals(boq);
    expect(groups).toHaveLength(2);
    const sum = groups.reduce((s, g) => s + g.total, 0);
    expect(sum).toBeCloseTo(getBoqProjectTotal(boq).grandTotal, 1);
  });

  it('writes section headers and subtotals to the BOQ CSV', () => {
    twoFarms();
    const boq = store.getBoqState(undefined, true);
    const csv = exportBoqAndDupaCsv('Test', boq, store.sections);
    expect(csv).toContain('A - Farm A');
    expect(csv).toContain('B - Farm B');
    expect(csv).toContain('Subtotal (A)');
    expect(csv).toContain('Subtotal (B)');
  });

  it('never bills one system under two farms', () => {
    const { farmA, farmB } = twoFarms();
    farmB.systemIds.push(farmA.systemIds[0]);
    const boq = store.getBoqState(undefined, true);
    const pvA = boq.items.find(i => i.sectionId === farmA.id && templateNoOf(i) === 'D4')!;
    const pvB = boq.items.find(i => i.sectionId === farmB.id && templateNoOf(i) === 'D4')!;
    // Farm B only keeps its own system, so it does not duplicate farm A's panels
    expect(pvB.quantity).not.toBe(pvA.quantity);
    expect(getBoqProjectTotal(boq).grandTotal).toBeCloseTo(
      getBoqSectionTotals(boq).reduce((s, g) => s + g.total, 0), 1
    );
  });

  it('keeps the classic D1-D13 list when there are no farms', () => {
    const boq = store.getBoqState(undefined, true);
    expect(boq.items.map(i => i.itemNo)).toEqual(Array.from({ length: 13 }, (_, i) => `D${i + 1}`));
    expect(boq.items.every(i => !i.sectionId)).toBe(true);
  });

  describe('equipment and interconnection', () => {
    it('adds a BESS item (A14) to a farm that has storage, sized by MWh', () => {
      const { farmA, farmB } = twoFarms();
      store.setFarmBess(farmA.id, { capacityMwh: 2, powerMw: 1, chemistry: 'LFP' });
      const boq = store.getBoqState(undefined, true);
      const a14 = boq.items.find(i => i.itemNo === 'A14')!;
      expect(a14.templateNo).toBe('E1');
      expect(a14.sectionId).toBe(farmA.id);
      expect(a14.quantity).toBe(2);
      expect(a14.unit).toBe('MWh');
      const battery = a14.materials.find(m => m.autoSourceKey === 'e1_battery')!;
      expect(battery.quantity).toBe(2);
      expect(battery.amountPhp).toBeCloseTo(2 * 8372000, 0);
      expect(boq.items.some(i => i.itemNo === 'B14')).toBe(false);
      expect(boq.items.filter(i => i.sectionId === farmB.id)).toHaveLength(13);
    });

    it('removes the BESS item when capacity is cleared', () => {
      const { farmA } = twoFarms();
      store.setFarmBess(farmA.id, { capacityMwh: 1, powerMw: 0.5, chemistry: 'LFP' });
      store.getBoqState(undefined, true);
      store.setFarmBess(farmA.id, null);
      expect(store.getBoqState().items.some(i => i.itemNo === 'A14')).toBe(false);
    });

    it('counts poles from line length and span', () => {
      expect(poleCount(0, 35)).toBe(0);
      expect(poleCount(1, 50)).toBe(21);
      expect(poleCount(4.1, 35)).toBe(Math.ceil(4100 / 35) + 1);
    });

    it('builds the I1 line and I2 switching items in an interconnection section', () => {
      twoFarms();
      const sec = store.setInterconnection({ lineLengthKm: 4.1, poleSpanM: 35, voltageKv: 13.2 })!;
      expect(sec.code).toBe('I');
      const boq = store.getBoqState(undefined, true);
      const i1 = boq.items.find(i => i.itemNo === 'I1')!;
      const i2 = boq.items.find(i => i.itemNo === 'I2')!;
      expect(i1.sectionId).toBe(sec.id);
      expect(i1.quantity).toBeCloseTo(4.1);
      expect(i1.unit).toBe('km');
      const poles = poleCount(4.1, 35);
      expect(i1.materials.find(m => m.autoSourceKey === 'i1_crossarms')!.quantity).toBe(poles);
      expect(i1.materials.find(m => m.autoSourceKey === 'i1_conductor')!.quantity).toBe(Math.ceil(4100 * 3 * 1.1));
      expect(i2.unit).toBe('lot');
      const groups = getBoqSectionTotals(boq);
      expect(groups).toHaveLength(3);
      expect(groups.reduce((s, g) => s + g.total, 0)).toBeCloseTo(getBoqProjectTotal(boq).grandTotal, 1);
    });

    it('keeps edited rates when the BOQ is re-synced after a storage change', () => {
      const { farmA } = twoFarms();
      store.setFarmBess(farmA.id, { capacityMwh: 1, powerMw: 0.5, chemistry: 'LFP' });
      store.updateDupaWorkItem('A14', it => ({
        ...it,
        materials: it.materials.map(m => (m.autoSourceKey === 'e1_battery' ? { ...m, unitCostPhp: 7000000 } : m))
      }));
      store.setFarmBess(farmA.id, { capacityMwh: 3, powerMw: 1.5, chemistry: 'LFP' });
      const battery = store.getBoqState().items.find(i => i.itemNo === 'A14')!.materials.find(m => m.autoSourceKey === 'e1_battery')!;
      expect(battery.quantity).toBe(3);
      expect(battery.unitCostPhp).toBe(7000000);
    });

    it('round-trips BESS and interconnection config through export and import', () => {
      const { farmA } = twoFarms();
      store.setFarmBess(farmA.id, { capacityMwh: 2, powerMw: 1, chemistry: 'NMC' });
      store.setInterconnection({ lineLengthKm: 2, poleSpanM: 40, voltageKv: 13.2 });
      const restored = new ProjectStore();
      restored.clearAll();
      expect(restored.importProjectJson(store.exportProjectJson(true))).toBe(true);
      const secs = [...restored.sections.values()];
      expect(secs.find(s => s.id === farmA.id)!.bess).toEqual({ capacityMwh: 2, powerMw: 1, chemistry: 'NMC' });
      expect(secs.find(s => s.kind === 'interconnection')!.interconnection!.lineLengthKm).toBe(2);
    });
  });
});

describe('XLSX export', () => {
  it('writes BOQ, BOM and one DUPA sheet per item with valid parts', async () => {
    const { unzipSync, strFromU8 } = await import('fflate');
    const { buildBoqXlsx, uniqueSheetName } = await import('./boq/xlsxExport');
    try { localStorage.clear(); } catch { /* no localStorage */ }
    const store = new ProjectStore();
    store.clearAll();
    const [a] = store.addPoultryHouses({ ...base, count: 2 });
    store.setFarmBess(a.sectionId, { capacityMwh: 1, powerMw: 0.5, chemistry: 'LFP' });
    store.setInterconnection({ lineLengthKm: 2, poleSpanM: 40, voltageKv: 13.2 });
    const boq = store.getBoqState(undefined, true);

    const files = unzipSync(buildBoqXlsx('Twin & "Taurus" <Test>', boq, store.sections));
    const sheetCount = 2 + boq.items.length; // BOQ + BOM + DUPA per item
    expect(Object.keys(files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))).toHaveLength(sheetCount);
    for (const required of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml']) {
      expect(files[required]).toBeDefined();
    }

    const workbook = strFromU8(files['xl/workbook.xml']);
    const names = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1]);
    expect(names.slice(0, 3)).toEqual(['BOQ', 'BOM', 'DUPA A1']);
    expect(names).toContain('DUPA A14');
    expect(names).toContain('DUPA I1');
    expect(new Set(names.map(n => n.toLowerCase())).size).toBe(names.length);

    // Project name with XML metacharacters is escaped, grand total is present
    const boqXml = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(boqXml).toContain('Twin &amp; &quot;Taurus&quot; &lt;Test&gt;');
    expect(boqXml).toContain('GRAND TOTAL PROJECT ESTIMATE');
    expect(boqXml).toContain(`<v>${getBoqProjectTotal(boq).grandTotal}</v>`);

    if (typeof DOMParser !== 'undefined') {
      for (const [path, bytes] of Object.entries(files)) {
        const doc = new DOMParser().parseFromString(strFromU8(bytes), 'application/xml');
        expect(doc.getElementsByTagName('parsererror'), path).toHaveLength(0);
      }
    }
    expect(uniqueSheetName('A:B/C?', new Set())).toBe('A-B-C-');
    const used = new Set(['dupa a1']);
    expect(uniqueSheetName('DUPA A1', used)).toBe('DUPA A1 (2)');
  });
});

describe('rate library via the store', () => {
  it('one library price updates every farm, and survives a re-sync', () => {
    try { localStorage.clear(); } catch { /* no localStorage */ }
    const store = new ProjectStore();
    store.clearAll();
    store.addPoultryHouses({ ...base, count: 1 });
    store.addPoultryHouses({ ...base, anchor: { lat: 15.01, lng: 120.5 }, count: 1 });
    const boq = store.getBoqState(undefined, true);
    const before = getBoqProjectTotal(boq).grandTotal;
    const changed = store.setLibraryRate('labor', 'Helper', 777);
    expect(changed).toBeGreaterThan(1); // rows in both farms
    const after = getBoqProjectTotal(store.getBoqState()).grandTotal;
    expect(after).not.toBe(before);

    const resynced = store.syncBoqFromCad();
    const helperRates = new Set(resynced.items.flatMap(i => i.labor.filter(l => l.description === 'Helper').map(l => l.ratePerDayPhp)));
    expect([...helperRates]).toEqual([777]);
  });
});
