import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectStore } from '../store/projectStore';
import {
  generateBoqFromRegistryAndSld,
  recalculateDupaItem,
  getBoqProjectTotal,
  exportBoqAndDupaCsv,
  extractCostedBom,
  exportCostedBomCsv,
  normalizeDupaQuotes
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

  it('generates 13 granular DUPA items (D1 to D13) from ProjectStore and SLD', () => {
    const boq = generateBoqFromRegistryAndSld(store);
    expect(boq.items.length).toBe(13);
    expect(boq.items.map(i => i.itemNo)).toEqual([
      'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13'
    ]);

    const totals = getBoqProjectTotal(boq);
    expect(totals.grandTotal).toBeGreaterThan(0);
    expect(totals.totalDirectCost).toBeGreaterThan(0);
    expect(totals.totalMaterials).toBeGreaterThan(0);
    expect(totals.totalLabor).toBeGreaterThan(0);
  });

  it('separates AC Combiner (D8) and Transformer Station (D9) based on SLD design parameters', () => {
    const sys = store.getSystems()[0];

    // Case 1: Default where system voltage matches inverter voltage (400V -> 400V)
    const boqNoXfm = generateBoqFromRegistryAndSld(store, sys.id);
    const d8Combiner = boqNoXfm.items.find(i => i.itemNo === 'D8');
    const d9Transformer = boqNoXfm.items.find(i => i.itemNo === 'D9');

    expect(d8Combiner).toBeDefined();
    expect(d8Combiner?.description).toContain('AC Combiner Panel');
    expect(d8Combiner?.materials.some(m => m.autoSourceKey === 'd8_collector_mccb')).toBe(true);

    expect(d9Transformer).toBeDefined();
    expect(d9Transformer?.quantity).toBe(0);
    expect(d9Transformer?.totalItemCostPhp).toBe(0);
    expect(d9Transformer?.description).toContain('Not Required');

    // Case 2: User sets system tapping voltage to 480V (requires Step-Up Transformer)
    store.updateSystem(sys.id, { systemVoltageV: 480 });
    const boqWithXfm = generateBoqFromRegistryAndSld(store, sys.id);
    const d9ActiveXfm = boqWithXfm.items.find(i => i.itemNo === 'D9');

    expect(d9ActiveXfm).toBeDefined();
    expect(d9ActiveXfm?.quantity).toBe(1);
    expect(d9ActiveXfm?.totalItemCostPhp).toBeGreaterThan(0);
    expect(d9ActiveXfm?.description).toContain('Power Transformer Station');
    expect(d9ActiveXfm?.description).toContain('400V / 480V');
    expect(d9ActiveXfm?.materials.some(m => m.autoSourceKey === 'd9_transformer_unit')).toBe(true);
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
    expect(bom.some(b => b.category === 'DC String Cabling & Connectors')).toBe(true);
    expect(bom.some(b => b.category === 'DC Raceways, Cable Trays & Fasteners')).toBe(true);
    expect(bom.some(b => b.category === 'String Inverters & Comms')).toBe(true);
    expect(bom.some(b => b.category === 'AC Combiner Panels & Collector Switchgear')).toBe(true);

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

  it('normalizes quotation marks and inch shorthand in DUPA strings to prevent cut-off in HTML attributes and CSV', () => {
    // 1. Multi-dimension inch test
    expect(normalizeDupaQuotes('100mm × 50mm (4" × 2") Perforated Tray')).toBe(
      '100mm × 50mm (4-inch × 2-inch) Perforated Tray'
    );
    expect(normalizeDupaQuotes('150mm x 100mm (6" x 4") Tray')).toBe(
      '150mm x 100mm (6-inch x 4-inch) Tray'
    );

    // 2. Single dimension inch test
    expect(normalizeDupaQuotes('200mm (8") Perforated Cable Tray')).toBe(
      '200mm (8-inch) Perforated Cable Tray'
    );
    expect(normalizeDupaQuotes('Copper Ground Rod (5/8" dia x 3.0m)')).toBe(
      'Copper Ground Rod (5/8-inch dia x 3.0m)'
    );
    expect(normalizeDupaQuotes('2" Rigid Steel Conduit')).toBe(
      '2-inch Rigid Steel Conduit'
    );
    expect(normalizeDupaQuotes('1-1/2" Metallic EMT')).toBe(
      '1-1/2-inch Metallic EMT'
    );

    // 3. Any arbitrary double quotes converted to single quotes
    expect(normalizeDupaQuotes('Tier-1 "Super High" Efficiency Panel')).toBe(
      "Tier-1 'Super High' Efficiency Panel"
    );

    // 4. recalculateDupaItem validates and normalizes all nested strings
    const rawWithQuotes: DupaWorkItem = {
      itemNo: 'D3',
      category: 'Solar Works',
      description: 'DC Raceways & 2" Conduits',
      durationDays: 3,
      quantity: 1,
      unit: 'lot',
      materials: [
        {
          id: 'm1',
          description: '200mm (8") Feeder Tray',
          quantity: 10,
          unit: 'lengths',
          unitCostPhp: 1500,
          amountPhp: 0
        },
        {
          id: 'm2',
          description: '5/8" Ground Rod',
          quantity: 4,
          unit: 'pc',
          unitCostPhp: 1200,
          amountPhp: 0
        }
      ],
      labor: [
        {
          id: 'l1',
          description: 'Lead "Certified" Installer',
          count: 1,
          days: 3,
          unit: 'pax',
          ratePerDayPhp: 1000,
          amountPhp: 0
        }
      ],
      equipment: [
        {
          id: 'e1',
          description: '3/4" Conduit Bender Rig',
          count: 1,
          days: 2,
          unit: 'unit',
          ratePerDayPhp: 500,
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

    const validated = recalculateDupaItem(rawWithQuotes);
    expect(validated.description).toBe('DC Raceways & 2-inch Conduits');
    expect(validated.materials[0].description).toBe('200mm (8-inch) Feeder Tray');
    expect(validated.materials[1].description).toBe('5/8-inch Ground Rod');
    expect(validated.labor[0].description).toBe("Lead 'Certified' Installer");
    expect(validated.equipment[0].description).toBe('3/4-inch Conduit Bender Rig');
    // Ensure no raw double quotes exist in any descriptions
    expect(validated.description).not.toContain('"');
    expect(validated.materials[0].description).not.toContain('"');
    expect(validated.materials[1].description).not.toContain('"');
    expect(validated.labor[0].description).not.toContain('"');
    expect(validated.equipment[0].description).not.toContain('"');
  });

  it('minimizes "lot" units across BOQ and DUPA, using meters for wires & raceways and strings/circuits for protections', () => {
    const boq = generateBoqFromRegistryAndSld(store);

    const d1 = boq.items.find(i => i.itemNo === 'D1');
    const d2 = boq.items.find(i => i.itemNo === 'D2');
    const d3 = boq.items.find(i => i.itemNo === 'D3');
    const d4 = boq.items.find(i => i.itemNo === 'D4');
    const d5 = boq.items.find(i => i.itemNo === 'D5');
    const d6 = boq.items.find(i => i.itemNo === 'D6');
    const d7 = boq.items.find(i => i.itemNo === 'D7');
    const d8 = boq.items.find(i => i.itemNo === 'D8');
    const d9 = boq.items.find(i => i.itemNo === 'D9');
    const d10 = boq.items.find(i => i.itemNo === 'D10');
    const d11 = boq.items.find(i => i.itemNo === 'D11');
    const d12 = boq.items.find(i => i.itemNo === 'D12');
    const d13 = boq.items.find(i => i.itemNo === 'D13');

    // Only D1 (Mobilization/Demobilization) retains 'lot'
    expect(d1?.unit).toBe('lot');

    // Mounting Structure measured per panel
    expect(d2?.unit).toBe('panel');
    expect(d2?.quantity).toBeGreaterThan(0);

    // Raceways measured in meters
    expect(d3?.unit).toBe('m');
    expect(d3?.quantity).toBeGreaterThan(0);

    // PV Modules measured in pcs
    expect(d4?.unit).toBe('pc');

    // DC Wiring measured in meters
    expect(d5?.unit).toBe('m');
    expect(d5?.quantity).toBeGreaterThan(0);

    // DC Protections quantified in strings
    expect(d6?.unit).toBe('string');
    expect(d6?.quantity).toBeGreaterThan(0);

    // Inverters quantified in units
    expect(d7?.unit).toBe('unit');
    expect(d7?.quantity).toBeGreaterThan(0);

    // AC Protections / Combiner quantified in circuits
    expect(d8?.unit).toBe('circuit');

    // Transformer station
    expect(d9?.unit).toBe('station');

    // MDP switchgear
    expect(d10?.unit).toBe('panel');
    expect(d10?.quantity).toBe(1);

    // AC Feeder cabling measured in meters
    expect(d11?.unit).toBe('m');
    expect(d11?.quantity).toBeGreaterThan(0);

    // Grounding and Testing in systems
    expect(d12?.unit).toBe('system');
    expect(d13?.unit).toBe('system');

    // Ensure NO nested materials anywhere use 'lot'
    for (const item of boq.items) {
      for (const m of item.materials) {
        expect(m.unit).not.toBe('lot');
      }
    }

    // Verify unit cost per item equals total item cost divided by quantity when quantity > 0
    for (const item of boq.items) {
      if (item.quantity > 0) {
        expect(item.unitCostPerItemPhp).toBeCloseTo(item.totalItemCostPhp / item.quantity, 1);
      }
    }
  });

  it('makes Item D12 (Lightning & Grounding) optional while including ground rods on the DC side (Item D6)', () => {
    // 1. Verify DC Side Earthing Rods exist in D6 by default
    const boq = generateBoqFromRegistryAndSld(store);
    const d6 = boq.items.find(i => i.itemNo === 'D6');
    expect(d6).toBeDefined();
    expect(d6?.description).toContain('Earthing Rods');

    const dcGroundRodMat = d6?.materials.find(m => m.autoSourceKey === 'd6_dc_ground_rod');
    const dcGroundWireMat = d6?.materials.find(m => m.autoSourceKey === 'd6_dc_ground_wire');

    expect(dcGroundRodMat).toBeDefined();
    expect(dcGroundRodMat?.description).toContain('Ground Rod');
    expect(dcGroundRodMat?.quantity).toBeGreaterThanOrEqual(1);
    expect(dcGroundRodMat?.unit).toBe('pc');

    expect(dcGroundWireMat).toBeDefined();
    expect(dcGroundWireMat?.description).toContain('Grounding');
    expect(dcGroundWireMat?.quantity).toBeGreaterThanOrEqual(10);
    expect(dcGroundWireMat?.unit).toBe('m');

    // 2. Verify D12 is optional (excluded by default: quantity = 0, cost = ₱0)
    const d12Default = boq.items.find(i => i.itemNo === 'D12');
    expect(d12Default).toBeDefined();
    expect(d12Default?.quantity).toBe(0);
    expect(d12Default?.totalItemCostPhp).toBe(0);
    expect(d12Default?.description).toContain('Optional Scope');

    // 3. Toggle D12 to included via store.toggleLightningProtection(true)
    store.toggleLightningProtection(true);
    const boqIncluded = store.getBoqState();
    const d12Included = boqIncluded.items.find(i => i.itemNo === 'D12');

    expect(d12Included).toBeDefined();
    expect(d12Included?.quantity).toBe(1);
    expect(d12Included?.totalItemCostPhp).toBeGreaterThan(0);
    expect(d12Included?.materials.some(m => m.quantity > 0)).toBe(true);
    expect(d12Included?.labor.length).toBeGreaterThan(0);
    expect(d12Included?.equipment.length).toBeGreaterThan(0);

    // 4. Toggle D12 back to optional / excluded
    store.toggleLightningProtection(false);
    const boqExcluded = store.getBoqState();
    const d12Excluded = boqExcluded.items.find(i => i.itemNo === 'D12');

    expect(d12Excluded?.quantity).toBe(0);
    expect(d12Excluded?.totalItemCostPhp).toBe(0);

    // 5. Ensure DC side ground rod in D6 is still present even when D12 is excluded
    const d6StillFunded = boqExcluded.items.find(i => i.itemNo === 'D6');
    const dcRod = d6StillFunded?.materials.find(m => m.autoSourceKey === 'd6_dc_ground_rod');
    expect(dcRod?.quantity).toBeGreaterThanOrEqual(1);
  });

  it('refines ground mount BOQ at ₱6,000/kW computed per table as unit cost per table materials', () => {
    // Set up a ground mount zone with 5 tables of 2x14 panels (28 panels per table = 140 panels total, 600W each)
    const groundStore = new ProjectStore();
    const sys = groundStore.getSystems()[0];

    // Create 5 tables
    const tables = [];
    for (let i = 1; i <= 5; i++) {
      const panelIds = Array.from({ length: 28 }, (_, pIdx) => `g_p_${i}_${pIdx}`);
      tables.push({
        id: `table_${i}`,
        zoneId: 'ground_zone_1',
        tableIndex: i,
        rowIndex: 1,
        colIndex: i,
        centroid: { lat: 14.5995, lng: 120.9842 },
        corners: [
          { lat: 14.5995, lng: 120.9842 },
          { lat: 14.5996, lng: 120.9842 },
          { lat: 14.5996, lng: 120.9843 },
          { lat: 14.5995, lng: 120.9843 }
        ] as [{ lat: number; lng: number }, { lat: number; lng: number }, { lat: number; lng: number }, { lat: number; lng: number }],
        panelIds,
        modulesUp: 2,
        modulesWide: 14
      });
    }

    // Add ground zone
    const boundary = [
      { lat: 14.599, lng: 120.984 },
      { lat: 14.600, lng: 120.984 },
      { lat: 14.600, lng: 120.985 },
      { lat: 14.599, lng: 120.985 }
    ];
    const zone = groundStore.addZone(boundary, 'ground', 'Ground Solar Farm Section A', sys.id);
    zone.tables = tables;
    zone.tableCount = 5;
    zone.config.modulesPerTableUp = 2;
    zone.config.modulesPerTableWide = 14;

    // Populate panels so totalPanelsCount aligns
    tables.forEach(t => {
      t.zoneId = zone.id;
      t.panelIds.forEach(pId => {
        (groundStore as any).panels.set(pId, {
          id: pId,
          systemId: sys.id,
          zoneId: zone.id,
          r: 1,
          c: 1,
          active: true,
          corners: t.corners,
          centroid: t.centroid,
          tableId: t.id,
          tableIndex: t.tableIndex,
          electrical: {
            nominalPowerW: 600,
            voc: 49.5,
            vmp: 41.5,
            isc: 15.2,
            imp: 14.46
          }
        });
      });
    });

    const boq = generateBoqFromRegistryAndSld(groundStore, sys.id);
    const d2 = boq.items.find(i => i.itemNo === 'D2');

    expect(d2).toBeDefined();
    // Work item measured per table
    expect(d2?.unit).toBe('table');
    expect(d2?.quantity).toBe(5);
    expect(d2?.description).toContain('5 Ground Tables');
    expect(d2?.description).toContain('16.80 kWp/table');
    expect(d2?.description).toContain('6k/kW');

    // Material row: 28 panels * 600W = 16.8 kWp. At ₱6,000/kW, unit cost per table = ₱100,800
    const tableMat = d2?.materials.find(m => m.autoSourceKey === 'd2_ground_table_racking');
    expect(tableMat).toBeDefined();
    expect(tableMat?.unit).toBe('table');
    expect(tableMat?.quantity).toBe(5);
    expect(tableMat?.unitCostPhp).toBe(100800);
    expect(tableMat?.amountPhp).toBe(504000); // 5 * 100,800 = 504,000

    // Equipment should have pile ramming machine and torque tools
    expect(d2?.equipment.some(e => e.description.includes('Ramming Machine'))).toBe(true);
    // Labor should have structural rigger / piling lead installer
    expect(d2?.labor.some(l => l.description.includes('Piling'))).toBe(true);
  });

  it('includes BOTH ground tables and roof rails in Item D2 materials breakdown for hybrid projects (e.g. Riverside)', () => {
    const hybridStore = new ProjectStore();
    hybridStore.clearAll();
    const sys = hybridStore.getSystems()[0];

    // 1. Add Roof Zone with 10 panels
    const roofBoundary = [
      { lat: 14.599, lng: 120.984 },
      { lat: 14.599, lng: 120.985 },
      { lat: 14.598, lng: 120.985 },
      { lat: 14.598, lng: 120.984 }
    ];
    const roofZone = hybridStore.addZone(roofBoundary, 'roof', 'Roof Array 1', sys.id);
    for (let p = 0; p < 10; p++) {
      const pId = `roof_p_${p}`;
      (hybridStore as any).panels.set(pId, {
        id: pId,
        systemId: sys.id,
        zoneId: roofZone.id,
        r: 1,
        c: p,
        active: true,
        corners: [roofBoundary[0], roofBoundary[1], roofBoundary[2], roofBoundary[3]],
        centroid: roofBoundary[0],
        electrical: { nominalPowerW: 600, voc: 48, vmp: 40, isc: 15, imp: 14 }
      });
    }

    // 2. Add Ground Zone with 2 tables (24 panels each = 48 panels)
    const groundBoundary = [
      { lat: 14.597, lng: 120.984 },
      { lat: 14.597, lng: 120.985 },
      { lat: 14.596, lng: 120.985 },
      { lat: 14.596, lng: 120.984 }
    ];
    const groundZone = hybridStore.addZone(groundBoundary, 'ground', 'Ground Table Array 1', sys.id);
    groundZone.tableCount = 2;
    groundZone.tables = [];
    groundZone.config.modulesPerTableUp = 2;
    groundZone.config.modulesPerTableWide = 12; // 24 panels per table @ 600W = 14.4 kWp/table
    for (let p = 0; p < 48; p++) {
      const pId = `ground_p_${p}`;
      (hybridStore as any).panels.set(pId, {
        id: pId,
        systemId: sys.id,
        zoneId: groundZone.id,
        r: Math.floor(p / 12),
        c: p % 12,
        active: true,
        corners: [groundBoundary[0], groundBoundary[1], groundBoundary[2], groundBoundary[3]],
        centroid: groundBoundary[0],
        tableId: `t_${Math.floor(p / 24)}`,
        electrical: { nominalPowerW: 600, voc: 48, vmp: 40, isc: 15, imp: 14 }
      });
    }

    // Generate BOQ
    const boq = generateBoqFromRegistryAndSld(hybridStore, sys.id);
    const d2 = boq.items.find(i => i.itemNo === 'D2');
    expect(d2).toBeDefined();

    // Verify D2 description mentions both ground tables and roof panels
    expect(d2?.description).toContain('2 Ground Tables');
    expect(d2?.description).toContain('Roof Panels');

    // Verify Materials breakdown contains BOTH:
    // 1. Ground Table Structure
    const tableMat = d2?.materials.find(m => m.autoSourceKey === 'd2_ground_table_racking');
    expect(tableMat).toBeDefined();
    expect(tableMat?.quantity).toBe(2);
    expect(tableMat?.unit).toBe('table');
    // 24 panels * 600W = 14.4 kWp. 14.4 * 6000 = 86,400 PHP/table
    expect(tableMat?.unitCostPhp).toBe(86400);
    expect(tableMat?.amountPhp).toBe(172800);

    // 2. Rooftop Aluminum Rails & L-Feet Brackets
    const railMat = d2?.materials.find(m => m.autoSourceKey === 'd2_rails');
    expect(railMat).toBeDefined();
    expect(railMat?.quantity).toBeGreaterThan(0);

    const lfeetMat = d2?.materials.find(m => m.autoSourceKey === 'd2_lfeet');
    expect(lfeetMat).toBeDefined();
    expect(lfeetMat?.quantity).toBeGreaterThan(0);

    // Costed BOM contains both table and rail items
    const bom = extractCostedBom(boq);
    expect(bom.some(b => b.description.includes('Ground Mount Table'))).toBe(true);
    expect(bom.some(b => b.description.includes('Aluminum Rail'))).toBe(true);

    // Test Auto-Reconciliation: If boqState was loaded without table racking, getBoqState refreshes it
    (hybridStore as any).boqState = {
      ...boq,
      items: boq.items.map(it => {
        if (it.itemNo === 'D2') {
          return {
            ...it,
            materials: it.materials.filter(m => m.autoSourceKey !== 'd2_ground_table_racking')
          };
        }
        return it;
      })
    };

    // Before reconciliation, saved state had no table
    const staleD2 = (hybridStore as any).boqState.items.find((i: any) => i.itemNo === 'D2');
    expect(staleD2.materials.some((m: any) => m.autoSourceKey === 'd2_ground_table_racking')).toBe(false);

    // Calling getBoqState() automatically detects missing ground table in D2 and reconciles
    const reconciledBoq = hybridStore.getBoqState(sys.id);
    const reconciledD2 = reconciledBoq.items.find(i => i.itemNo === 'D2');
    expect(reconciledD2?.materials.some(m => m.autoSourceKey === 'd2_ground_table_racking')).toBe(true);
  });
});
