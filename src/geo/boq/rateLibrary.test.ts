import { describe, it, expect } from 'vitest';
import { applyRate, extractRateLibrary, importRateCsv, rateLibraryToCsv } from './rateLibrary';
import { recalculateDupaItem, getBoqProjectTotal } from './dupaMath';
import { DupaWorkItem, ProjectBoqState } from '../../types/solar';

const item = (itemNo: string, helperRate: number): DupaWorkItem => recalculateDupaItem({
  itemNo, category: 'x', description: itemNo, durationDays: 2, quantity: 1, unit: 'lot',
  materials: [{ id: 'm', description: 'Module, 600W', quantity: 10, unit: 'pc', unitCostPhp: 100, amountPhp: 0 }],
  labor: [{ id: 'l', description: 'Helper', count: 2, days: 3, unit: 'pax', ratePerDayPhp: helperRate, amountPhp: 0 }],
  equipment: [], totalMaterialsPhp: 0, totalLaborPhp: 0, totalEquipmentPhp: 0, estimatedDirectCostPhp: 0,
  ocmPercent: 10, ocmAmountPhp: 0, profitPercent: 8, profitAmountPhp: 0, vatPercent: 6, vatAmountPhp: 0,
  totalItemCostPhp: 0, unitCostPerItemPhp: 0
});
const boq = (): ProjectBoqState => ({ ocmPercent: 10, profitPercent: 8, vatPercent: 6, items: [item('A1', 500), item('B1', 600)] });

describe('rate library', () => {
  it('lists unique rows with usage counts and flags mixed prices', () => {
    const lib = extractRateLibrary(boq());
    expect(lib).toHaveLength(2);
    const helper = lib.find(e => e.description === 'Helper')!;
    expect(helper.uses).toBe(2);
    expect(helper.mixed).toBe(true);
    expect(helper.rate).toBe(500);
    expect(helper.maxRate).toBe(600);
    expect(lib.find(e => e.kind === 'material')!.mixed).toBe(false);
  });

  it('applies one price to every row and recalculates totals', () => {
    const b = boq();
    const before = getBoqProjectTotal(b).grandTotal;
    expect(applyRate(b, 'labor', 'Helper', 700)).toBe(2);
    expect(b.items.every(i => i.labor[0].ratePerDayPhp === 700)).toBe(true);
    expect(b.items[0].totalLaborPhp).toBe(2 * 3 * 700);
    expect(getBoqProjectTotal(b).grandTotal).toBeGreaterThan(before);
    expect(extractRateLibrary(b).find(e => e.description === 'Helper')!.mixed).toBe(false);
  });

  it('rejects invalid rates', () => {
    const b = boq();
    expect(applyRate(b, 'material', 'Module, 600W', -5)).toBe(0);
    expect(applyRate(b, 'material', 'Module, 600W', NaN)).toBe(0);
  });

  it('round-trips through CSV, including commas in descriptions', () => {
    const b = boq();
    const csv = rateLibraryToCsv(extractRateLibrary(b)).replace('"100"', '"250"');
    const target = boq();
    const res = importRateCsv(target, csv);
    expect(res.applied).toBe(2);
    expect(target.items[0].materials[0].unitCostPhp).toBe(250);
    expect(importRateCsv(target, 'Kind,Description,Unit,Rate_PHP\nbogus,x,y,1\nmaterial,Nope,pc,5').skipped).toBe(2);
  });
});
