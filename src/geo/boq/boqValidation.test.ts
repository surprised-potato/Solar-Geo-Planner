import { describe, it, expect } from 'vitest';
import { validateBoq, summarizeIssues } from './boqValidation';
import { DupaWorkItem, ProjectBoqState } from '../../types/solar';

const item = (over: Partial<DupaWorkItem>): DupaWorkItem => ({
  itemNo: 'A4', sectionId: 'a', templateNo: 'D4', category: 'Farm A', description: 'PV Panels',
  durationDays: 5, quantity: 10, unit: 'pc',
  materials: [{ id: 'm', description: 'Module', quantity: 10, unit: 'pc', unitCostPhp: 100, amountPhp: 1000 }],
  labor: [], equipment: [],
  totalMaterialsPhp: 1000, totalLaborPhp: 0, totalEquipmentPhp: 0, estimatedDirectCostPhp: 1000,
  ocmPercent: 10, ocmAmountPhp: 0, profitPercent: 8, profitAmountPhp: 0, vatPercent: 6, vatAmountPhp: 0,
  totalItemCostPhp: 1000, unitCostPerItemPhp: 100,
  ...over
});
const boq = (items: DupaWorkItem[]): ProjectBoqState => ({ ocmPercent: 10, profitPercent: 8, vatPercent: 6, items });
const sections = new Map([['a', { code: 'A', name: 'Farm A' }], ['b', { code: 'B', name: 'Farm B' }]]);

describe('validateBoq', () => {
  it('passes a clean BOQ', () => {
    expect(validateBoq(boq([item({})]), sections)).toEqual([]);
  });

  it('flags missing prices and zero quantities', () => {
    const bad = item({ quantity: 0, materials: [{ id: 'm', description: 'Module', quantity: 1, unit: 'pc', unitCostPhp: 0, amountPhp: 0 }] });
    const { errors } = summarizeIssues(validateBoq(boq([bad]), sections));
    expect(errors).toBe(2);
  });

  it('allows D12 (optional lightning protection) to be zero', () => {
    const d12 = item({ itemNo: 'A12', templateNo: 'D12', quantity: 0 });
    expect(validateBoq(boq([d12]), sections).filter(i => i.severity === 'error')).toEqual([]);
  });

  it('skips a transformer item that is marked Not Required', () => {
    const d9 = item({ itemNo: 'A9', templateNo: 'D9', description: 'Power Transformer Station (Not Required – Direct 400V)', quantity: 0,
      materials: [{ id: 'm', description: 'Transformer', quantity: 0, unit: 'kVA', unitCostPhp: 1000, amountPhp: 0 }] });
    expect(validateBoq(boq([d9]), sections)).toEqual([]);
  });

  it('warns when the unit basis differs between farms for the same work item', () => {
    const issues = validateBoq(boq([item({ unit: 'kW' }), item({ itemNo: 'B4', sectionId: 'b', unit: 'pc' })]), sections);
    expect(issues.some(i => /unit basis differs/.test(i.message) && /A4=kW/.test(i.message))).toBe(true);
  });

  it('warns about ground-mount structure items in a rooftop farm', () => {
    const d2 = item({ itemNo: 'A2', templateNo: 'D2', description: 'Solar mounting structure (55 Ground Tables)' });
    expect(validateBoq(boq([d2]), sections).some(i => /ground-mount/.test(i.message))).toBe(true);
  });

  it('warns when work-item order differs between farms but ignores the optional battery item', () => {
    const a = [item({ itemNo: 'A1', templateNo: 'D1' }), item({ itemNo: 'A2', templateNo: 'D2', description: 'x' }), item({ itemNo: 'A3', templateNo: 'E1', description: 'BESS' })];
    const b = [item({ itemNo: 'B1', sectionId: 'b', templateNo: 'D1' }), item({ itemNo: 'B2', sectionId: 'b', templateNo: 'D2', description: 'x' })];
    expect(validateBoq(boq([...a, ...b]), sections).some(i => /order differs/.test(i.message))).toBe(false);
    const swapped = [item({ itemNo: 'B1', sectionId: 'b', templateNo: 'D2', description: 'x' }), item({ itemNo: 'B2', sectionId: 'b', templateNo: 'D1' })];
    expect(validateBoq(boq([...a, ...swapped]), sections).some(i => /order differs/.test(i.message))).toBe(true);
  });
});
