import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectStore } from '../store/projectStore';
import {
  generateBoqFromRegistryAndSld,
  recalculateDupaItem,
  getBoqProjectTotal,
  exportBoqAndDupaCsv,
  extractCostedBom,
  exportCostedBomCsv
} from './boqCalculator';
import { DupaWorkItem } from '../types/solar';

describe('boqCalculator Engine', () => {
  let store: ProjectStore;

  beforeEach(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
    } catch (e) {
      // Ignore
    }
    store = new ProjectStore();
  });

  it('recalculates DUPA item with exact DPWH markups: OCM 10%, Profit 8%, VAT 6%', () => {
    const rawItem: DupaWorkItem = {
      itemNo: 'D1',
      category: 'Solar Works',
      description: 'Mobilization and Demobilization',
      durationDays: 3,
      quantity: 1,
      unit: 'lot',
      materials: [],
      labor: [
        {
          id: 'l1',
          description: 'Crew',
          count: 4,
          days: 3,
          unit: 'pax',
          ratePerDayPhp: 600,
          amountPhp: 0
        }
      ],
      equipment: [
        {
          id: 'e1',
          description: 'Truck',
          count: 2,
          days: 1,
          unit: 'trip',
          ratePerDayPhp: 8000,
          amountPhp: 0
        },
        {
          id: 'e2',
          description: 'Scaffolding',
          count: 1,
          days: 1,
          unit: 'lot',
          ratePerDayPhp: 5000,
          amountPhp: 0
        }
      ],
      totalMaterialsPhp: 0,
      totalLaborPhp: 0,
      totalEquipmentPhp: 0,
      estimatedDirectCostPhp: 0,
      ocmPercent: 10,
      ocmAmountPhp: 0,
      profitPercent: 8,
      profitAmountPhp: 0,
      vatPercent: 6,
      vatAmountPhp: 0,
      totalItemCostPhp: 0,
      unitCostPerItemPhp: 0
    };

    const calculated = recalculateDupaItem(rawItem);

    // Labor: 4 * 3 * 600 = 7,200
    expect(calculated.totalLaborPhp).toBe(7200);
    // Equipment: (2 * 1 * 8000) + (1 * 1 * 5000) = 21,000
    expect(calculated.totalEquipmentPhp).toBe(21000);
    // EDC: 7200 + 21000 = 28,200
    expect(calculated.estimatedDirectCostPhp).toBe(28200);
    // OCM 10%: 2,820
    expect(calculated.ocmAmountPhp).toBe(2820);
    // Profit 8%: 2,256
    expect(calculated.profitAmountPhp).toBe(2256);
    // VAT 6% on (28200 + 2820 + 2256 = 33276): 1996.56
    expect(calculated.vatAmountPhp).toBe(1996.56);
    // Total Item Cost: 33276 + 1996.56 = 35,272.56
    expect(calculated.totalItemCostPhp).toBe(35272.56);
    expect(calculated.unitCostPerItemPhp).toBe(35272.56);
  });

  it('generates 9 DUPA items (D1 to D9) from ProjectStore', () => {
    const boq = generateBoqFromRegistryAndSld(store);
    expect(boq.items.length).toBe(9);
    expect(boq.items.map(i => i.itemNo)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9']);

    const totals = getBoqProjectTotal(boq);
    expect(totals.grandTotal).toBeGreaterThan(0);
    expect(totals.totalDirectCost).toBeGreaterThan(0);
    expect(totals.totalMaterials).toBeGreaterThan(0);
    expect(totals.totalLabor).toBeGreaterThan(0);
  });

  it('preserves custom user rates when re-syncing from CAD', () => {
    const initialBoq = generateBoqFromRegistryAndSld(store);
    // Modify a rate
    const d4 = initialBoq.items.find(i => i.itemNo === 'D4');
    expect(d4).toBeDefined();
    d4!.materials[0].unitCostPhp = 6100; // custom price override

    const resyncedBoq = generateBoqFromRegistryAndSld(store, undefined, initialBoq);
    const resyncedD4 = resyncedBoq.items.find(i => i.itemNo === 'D4');
    expect(resyncedD4?.materials[0].unitCostPhp).toBe(6100);
  });

  it('exports formatted BOQ and DUPA CSV matching reference layout', () => {
    const boq = generateBoqFromRegistryAndSld(store);
    const csv = exportBoqAndDupaCsv('Test Farm D Project', boq);

    expect(csv).toContain('BILL OF QUANTITIES (BOQ)');
    expect(csv).toContain('Project: Test Farm D Project');
    expect(csv).toContain('Item No.,Category,Work Description,Quantity,Unit,Unit Cost (PHP),Total Cost (PHP)');
    expect(csv).toContain('GRAND TOTAL PROJECT ESTIMATE');
    expect(csv).toContain('DETAILED UNIT PRICE ANALYSIS (DUPA)');
    expect(csv).toContain('A. MATERIALS');
    expect(csv).toContain('B. LABOR');
    expect(csv).toContain('C. EQUIPMENT');
    expect(csv).toContain('Estimated Direct Cost (EDC = A+B+C)');
  });

  it('extracts flattened Costed Bill of Materials (BOM) across all DUPA items', () => {
    const boq = generateBoqFromRegistryAndSld(store);
    const bom = extractCostedBom(boq);

    expect(bom.length).toBeGreaterThan(5);
    expect(bom[0].itemNo).toBe('M01');
    expect(bom.some(b => b.category === 'PV Modules')).toBe(true);
    expect(bom.some(b => b.category === 'Mounting Structure & Racking')).toBe(true);
    expect(bom.some(b => b.category === 'DC Cabling & Connectors')).toBe(true);
    expect(bom.some(b => b.category === 'Raceways, Cable Trays & Fasteners')).toBe(true);
    expect(bom.some(b => b.category === 'Inverters & AC Equipment')).toBe(true);

    const totalBomAmount = bom.reduce((sum, item) => sum + item.amountPhp, 0);
    const totals = getBoqProjectTotal(boq);
    expect(totalBomAmount).toBeCloseTo(totals.totalMaterials, 1);
  });

  it('harmonizes drawn CAD/Registry raceways into Item D3 cable trays, brackets and fasteners', () => {
    const sys = store.getSystems()[0];
    const initialBoq = generateBoqFromRegistryAndSld(store, sys.id);
    const d3Initial = initialBoq.items.find(i => i.itemNo === 'D3');
    expect(d3Initial).toBeDefined();

    // Now draw a 48m homerun raceway trunk in this system
    const racewayPath = [
      { lat: 37.7749, lng: -122.4194 },
      { lat: 37.7751, lng: -122.4194 },
      { lat: 37.7753, lng: -122.4194 }
    ];
    store.setSystemHomerun(sys.id, racewayPath, 6.0); // 6m riser drop

    const updatedBoq = generateBoqFromRegistryAndSld(store, sys.id);
    const d3Updated = updatedBoq.items.find(i => i.itemNo === 'D3');
    expect(d3Updated).toBeDefined();

    // Verify cable tray, splice plates, brackets, and SS fasteners exist in D3
    const trayMat = d3Updated?.materials.find(m => m.autoSourceKey === 'd3_cable_tray');
    const spliceMat = d3Updated?.materials.find(m => m.autoSourceKey === 'd3_tray_splices');
    const bracketMat = d3Updated?.materials.find(m => m.autoSourceKey === 'd3_tray_brackets');
    const fastenerMat = d3Updated?.materials.find(m => m.autoSourceKey === 'd3_tray_fasteners');

    expect(trayMat).toBeDefined();
    expect(trayMat?.quantity).toBeGreaterThan(5);
    expect(spliceMat).toBeDefined();
    expect(spliceMat?.quantity).toBe(trayMat!.quantity * 2);
    expect(bracketMat).toBeDefined();
    expect(bracketMat?.quantity).toBeGreaterThan(4);
    expect(fastenerMat).toBeDefined();
    expect(fastenerMat?.quantity).toBe((trayMat!.quantity * 8) + (bracketMat!.quantity * 4));
  });

  it('exports Costed Bill of Materials (BOM) to CSV format', () => {
    const boq = generateBoqFromRegistryAndSld(store);
    const csv = exportCostedBomCsv('Solar Rooftop Sta. Ana', boq);

    expect(csv).toContain('COSTED BILL OF MATERIALS (BOM)');
    expect(csv).toContain('Project: Solar Rooftop Sta. Ana');
    expect(csv).toContain('Item Tag,Category,Material Description,DUPA Source,Quantity,Unit,Unit Cost (PHP),Total Amount (PHP)');
    expect(csv).toContain('TOTAL MATERIAL COST (A)');
  });
});
