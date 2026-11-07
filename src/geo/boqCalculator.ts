/**
 * Philippine Solar EPC Bill of Quantities (BOQ) & Detailed Unit Price Analysis (DUPA) Engine
 *
 * Implements strict DPWH / Solar EPC standard costing:
 * EDC (Estimated Direct Cost) = Materials (A) + Labor (B) + Equipment (C)
 * OCM = EDC * ocmPercent
 * Contractor's Profit = EDC * profitPercent
 * VAT = (EDC + OCM + Profit) * vatPercent
 * Total Item Cost = EDC + OCM + Profit + VAT
 * BOQ Unit Cost = Total Item Cost / Quantity
 */

import {
  DupaWorkItem,
  ProjectBoqState
} from '../types/solar';
import { ProjectStore } from '../store/projectStore';
import { buildSldSystemModel } from '../ui/sldView';
import { calculateGeodeticDistanceM } from './projection';

export const DEFAULT_OCM_PERCENT = 10.0;
export const DEFAULT_PROFIT_PERCENT = 8.0;
export const DEFAULT_VAT_PERCENT = 6.0;

/**
 * Standard DPWH / Solar EPC Unit Price Recalculation
 */
export function recalculateDupaItem(item: DupaWorkItem): DupaWorkItem {
  // 1. Recalculate Material amounts
  let totalMaterialsPhp = 0;
  for (const m of item.materials) {
    m.amountPhp = Number((m.quantity * m.unitCostPhp).toFixed(2));
    totalMaterialsPhp += m.amountPhp;
  }
  totalMaterialsPhp = Number(totalMaterialsPhp.toFixed(2));

  // 2. Recalculate Labor amounts
  let totalLaborPhp = 0;
  for (const l of item.labor) {
    l.amountPhp = Number((l.count * l.days * l.ratePerDayPhp).toFixed(2));
    totalLaborPhp += l.amountPhp;
  }
  totalLaborPhp = Number(totalLaborPhp.toFixed(2));

  // 3. Recalculate Equipment amounts
  let totalEquipmentPhp = 0;
  for (const e of item.equipment) {
    e.amountPhp = Number((e.count * e.days * e.ratePerDayPhp).toFixed(2));
    totalEquipmentPhp += e.amountPhp;
  }
  totalEquipmentPhp = Number(totalEquipmentPhp.toFixed(2));

  // 4. Estimated Direct Cost (EDC = A + B + C)
  const estimatedDirectCostPhp = Number((totalMaterialsPhp + totalLaborPhp + totalEquipmentPhp).toFixed(2));

  // 5. Indirect Costs
  const ocmPercent = item.ocmPercent ?? DEFAULT_OCM_PERCENT;
  const ocmAmountPhp = Number((estimatedDirectCostPhp * (ocmPercent / 100.0)).toFixed(2));

  const profitPercent = item.profitPercent ?? DEFAULT_PROFIT_PERCENT;
  const profitAmountPhp = Number((estimatedDirectCostPhp * (profitPercent / 100.0)).toFixed(2));

  const vatPercent = item.vatPercent ?? DEFAULT_VAT_PERCENT;
  const subtotalBeforeVat = estimatedDirectCostPhp + ocmAmountPhp + profitAmountPhp;
  const vatAmountPhp = Number((subtotalBeforeVat * (vatPercent / 100.0)).toFixed(2));

  const totalItemCostPhp = Number((subtotalBeforeVat + vatAmountPhp).toFixed(2));
  const qty = item.quantity > 0 ? item.quantity : 1;
  const unitCostPerItemPhp = Number((totalItemCostPhp / qty).toFixed(2));

  return {
    ...item,
    totalMaterialsPhp,
    totalLaborPhp,
    totalEquipmentPhp,
    estimatedDirectCostPhp,
    ocmPercent,
    ocmAmountPhp,
    profitPercent,
    profitAmountPhp,
    vatPercent,
    vatAmountPhp,
    totalItemCostPhp,
    unitCostPerItemPhp
  };
}

/**
 * Extracts Quantities and Technical Specifications from Spatial CAD Registry & PEC SLD
 */
export function generateBoqFromRegistryAndSld(
  store: ProjectStore,
  systemId?: string,
  existingBoq?: ProjectBoqState
): ProjectBoqState {
  const isAll = !systemId || systemId === 'all';
  const allSystems = store.getSystems();
  const systems = isAll ? allSystems : allSystems.filter(s => s.id === systemId);

  const allPanels = isAll ? store.getPanels() : store.getPanelsForSystem(systemId);
  const activePanels = allPanels.filter(p => p.active);
  const totalPanelsCount = activePanels.length;

  const allZones = store.getZones();
  const zones = isAll ? allZones : allZones.filter(z => z.systemId === systemId);

  // Existing custom rates lookup map: autoSourceKey -> unitCostPhp / ratePerDayPhp
  const existingMaterialRates = new Map<string, number>();
  const existingLaborRates = new Map<string, number>();
  const existingEquipRates = new Map<string, number>();

  if (existingBoq?.items) {
    for (const item of existingBoq.items) {
      for (const m of item.materials) {
        if (m.autoSourceKey) existingMaterialRates.set(m.autoSourceKey, m.unitCostPhp);
        existingMaterialRates.set(m.description, m.unitCostPhp);
      }
      for (const l of item.labor) {
        existingLaborRates.set(l.description, l.ratePerDayPhp);
      }
      for (const e of item.equipment) {
        existingEquipRates.set(e.description, e.ratePerDayPhp);
      }
    }
  }

  const getMatRate = (key: string, desc: string, defaultRate: number) => {
    return existingMaterialRates.get(key) ?? existingMaterialRates.get(desc) ?? defaultRate;
  };
  const getLabRate = (desc: string, defaultRate: number) => {
    return existingLaborRates.get(desc) ?? defaultRate;
  };
  const getEqRate = (desc: string, defaultRate: number) => {
    return existingEquipRates.get(desc) ?? defaultRate;
  };

  const ocmPercent = existingBoq?.ocmPercent ?? DEFAULT_OCM_PERCENT;
  const profitPercent = existingBoq?.profitPercent ?? DEFAULT_PROFIT_PERCENT;
  const vatPercent = existingBoq?.vatPercent ?? DEFAULT_VAT_PERCENT;

  // Aggregate geometry from zones
  let totalRailCount = 0;
  let totalRailSpanM = 0;
  let totalAttachmentPointsCount = 0;
  let totalMidClamps = 0;
  let totalEndClamps = 0;
  let totalRailSplices = 0;
  let totalGroundTables = 0;

  for (const z of zones) {
    if (z.config.mountType === 'roof') {
      const rails = z.rails || [];
      totalRailCount += rails.length;
      for (const r of rails) {
        totalRailSpanM += r.lengthM;
        totalAttachmentPointsCount += r.attachmentPoints ? r.attachmentPoints.length : Math.max(2, Math.ceil(r.lengthM / 1.1));
        const pCount = r.panelIds.length;
        if (pCount > 0) {
          totalEndClamps += 2;
          totalMidClamps += Math.max(0, pCount - 1);
        }
        totalRailSplices += Math.max(0, Math.floor(r.lengthM / 4.4));
      }
    } else {
      totalGroundTables += z.tableCount ?? (z.tables ? z.tables.length : 0);
    }
  }

  // Fallbacks if zones haven't generated rails yet but panels exist
  if (totalRailCount === 0 && totalPanelsCount > 0) {
    // 4 panels share ~4.4m of 2 rails -> ~2.2m rail per panel
    totalRailSpanM = totalPanelsCount * 2.2;
    totalAttachmentPointsCount = Math.max(4, Math.ceil(totalPanelsCount * 2.1));
    totalEndClamps = Math.max(4, Math.ceil(totalPanelsCount * 0.7));
    totalMidClamps = Math.max(0, totalPanelsCount * 2 - totalEndClamps);
    totalRailSplices = Math.max(0, Math.ceil(totalRailSpanM / 20));
  }

  const aluminumRailPcs = Math.max(1, Math.ceil(totalRailSpanM / 4.2));

  // String & Cabling Aggregation
  const rawStringCables = store.getStringCables(isAll ? 'all' : systemId);
  const totalStrings = rawStringCables.length;
  let totalIntraStringM = 0;
  let totalHomerunM = 0;
  let totalRacewayPathM = 0;

  for (const sc of rawStringCables) {
    totalIntraStringM += sc.intraStringLengthM;
    totalHomerunM += sc.totalHomerunM;
    if (sc.racewayPathLengthM) totalRacewayPathM += sc.racewayPathLengthM;
  }

  // Deduplicated DC Raceway Geometry (CAD & Registry Synchronization)
  let totalDcRacewayM = 0;
  let totalDcRacewayBends = 0;
  let hasAnyDrawnDcRaceway = false;

  // 1. Shared system homerun raceways (counted once per system in scope)
  for (const s of systems) {
    if (s.homerunRaceway && s.homerunRaceway.path && s.homerunRaceway.path.length >= 2) {
      hasAnyDrawnDcRaceway = true;
      let pathLen2D = 0;
      for (let i = 0; i < s.homerunRaceway.path.length - 1; i++) {
        pathLen2D += calculateGeodeticDistanceM(s.homerunRaceway.path[i], s.homerunRaceway.path[i + 1]);
      }
      const elevM = Math.abs(s.homerunRaceway.elevationChangeM ?? 0);
      let distToInv = 0;
      if (s.inverterLocation) {
        const exitPt = s.homerunRaceway.path[s.homerunRaceway.path.length - 1];
        const rawDist = calculateGeodeticDistanceM(exitPt, s.inverterLocation);
        distToInv = rawDist > 5000 ? 0 : rawDist;
      }
      totalDcRacewayM += (pathLen2D + elevM + distToInv);
      totalDcRacewayBends += Math.max(1, s.homerunRaceway.path.length - 2) + (elevM > 0 ? 2 : 0);
    }
  }

  // 2. Dedicated array zone raceways (counted once per zone with dedicated raceway)
  for (const z of zones) {
    if (z.raceway && z.raceway.path && z.raceway.path.length >= 2) {
      if (!z.raceway.systemId || z.raceway.systemId === z.systemId) {
        hasAnyDrawnDcRaceway = true;
        let pathLen2D = 0;
        for (let i = 0; i < z.raceway.path.length - 1; i++) {
          pathLen2D += calculateGeodeticDistanceM(z.raceway.path[i], z.raceway.path[i + 1]);
        }
        const elevM = Math.abs(z.raceway.elevationChangeM ?? (z.elevationDeltaM ?? 0));
        const sys = store.getSystem(z.systemId);
        let distToInv = 0;
        if (sys?.inverterLocation) {
          const exitPt = z.raceway.path[z.raceway.path.length - 1];
          const rawDist = calculateGeodeticDistanceM(exitPt, sys.inverterLocation);
          distToInv = rawDist > 5000 ? 0 : rawDist;
        }
        totalDcRacewayM += (pathLen2D + elevM + distToInv);
        totalDcRacewayBends += Math.max(1, z.raceway.path.length - 2) + (elevM > 0 ? 2 : 0);
      }
    }
  }

  // Baseline fallback when no raceway polyline is drawn yet in CAD
  if (!hasAnyDrawnDcRaceway) {
    totalDcRacewayM = Math.max(15, Math.ceil(zones.length * 12));
    totalDcRacewayBends = Math.max(2, zones.length * 2);
  }

  // Inverter & SLD model aggregation
  let totalAcKw = 0;
  let totalInverterUnits = 0;
  let maxDcVoltage = 1100;
  let phaseStr = '3-Phase';
  let mainBreakerA = 400;
  let maxPhaseMm2 = 80;
  let totalFeederRunM = 0;
  let primaryInverterModel = '50kW String Inverter';

  for (const s of systems) {
    const sldModel = buildSldSystemModel(store, s.id);
    totalAcKw += sldModel.totalAcKw;
    totalInverterUnits += sldModel.inverter.inverterCount;
    if (sldModel.inverter.maxDcVoltage) maxDcVoltage = sldModel.inverter.maxDcVoltage;
    if (s.inverter.modelName) primaryInverterModel = s.inverter.modelName;
    if (!sldModel.isThreePhase) phaseStr = 'Single-Phase';
    if (sldModel.mainBreakerRatingA > mainBreakerA) mainBreakerA = sldModel.mainBreakerRatingA;
    if (sldModel.mainFeederWireSizing.phaseConductorMm2 > maxPhaseMm2) {
      maxPhaseMm2 = sldModel.mainFeederWireSizing.phaseConductorMm2;
    }
    const feederSum = store.getSystemAcFeederSummary(s.id);
    totalFeederRunM += feederSum.totalRunM;
  }

  if (totalInverterUnits === 0) totalInverterUnits = 1;

  // DC Wire Calculations: Black and Red PV1-F leads
  let dcWireLengthSinglePolarityM = Math.ceil(totalHomerunM / 2 + totalIntraStringM / 2);
  if (dcWireLengthSinglePolarityM < 100) {
    // Standard baseline fallback when homerun or inverter hasn't been pinned on map
    dcWireLengthSinglePolarityM = Math.max(100, Math.ceil(totalStrings > 0 ? totalStrings * 112.5 : totalPanelsCount * 11));
  }

  // Primary PV Module model
  const firstMod = zones.length > 0 && zones[0].moduleId ? store.getModule(zones[0].moduleId) : undefined;
  const modWatts = firstMod?.nominalPowerW || (activePanels.length > 0 ? activePanels[0].electrical.nominalPowerW : 600);
  const modName = firstMod?.name || `${modWatts}W Monocrystalline PV Module (Tier-1)`;

  // Build DUPA Work Items D1 through D9
  const items: DupaWorkItem[] = [];

  // ==========================================
  // D1: Mobilization and Demobilization
  // ==========================================
  const d1Duration = 3;
  const d1Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D1',
    category: 'Solar Works',
    description: 'Mobilization and Demobilization',
    durationDays: d1Duration,
    quantity: 1,
    unit: 'lot',
    materials: [],
    labor: [
      {
        id: 'd1_l1',
        description: 'Mobilization/Demobilization Crew',
        count: 4,
        days: d1Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Mobilization/Demobilization Crew', 600),
        amountPhp: 0
      }
    ],
    equipment: [
      {
        id: 'd1_e1',
        description: 'Pickup Truck + Small Trailer (local)',
        count: 2,
        days: 1,
        unit: 'trip',
        ratePerDayPhp: getEqRate('Pickup Truck + Small Trailer (local)', 8000),
        amountPhp: 0
      },
      {
        id: 'd1_e2',
        description: 'Scaffolding Delivery & Retrieval',
        count: 1,
        days: 1,
        unit: 'lot',
        ratePerDayPhp: getEqRate('Scaffolding Delivery & Retrieval', 5000),
        amountPhp: 0
      }
    ],
    totalMaterialsPhp: 0,
    totalLaborPhp: 0,
    totalEquipmentPhp: 0,
    estimatedDirectCostPhp: 0,
    ocmPercent,
    ocmAmountPhp: 0,
    profitPercent,
    profitAmountPhp: 0,
    vatPercent,
    vatAmountPhp: 0,
    totalItemCostPhp: 0,
    unitCostPerItemPhp: 0
  });
  items.push(d1Item);

  // ==========================================
  // D2: Roof mounting structure
  // ==========================================
  const d2Duration = Math.max(3, Math.min(30, Math.ceil((totalPanelsCount || 100) / 16)));
  const d2Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D2',
    category: 'Solar Works',
    description: totalGroundTables > 0 ? 'Solar mounting structure (Ground Table Racks & Hardware)' : 'Roof mounting structure',
    durationDays: d2Duration,
    quantity: 1,
    unit: 'lot',
    materials: [
      {
        id: 'd2_m1',
        autoSourceKey: 'd2_rails',
        description: 'Aluminum Rail (~4.4m, for 4 panels)',
        quantity: aluminumRailPcs,
        unit: 'pc',
        unitCostPhp: getMatRate('d2_rails', 'Aluminum Rail (~4.4m, for 4 panels)', 1200),
        amountPhp: 0
      },
      {
        id: 'd2_m2',
        autoSourceKey: 'd2_lfeet',
        description: 'L-Feet Bracket with EPDM & Bolt',
        quantity: totalAttachmentPointsCount,
        unit: 'pc',
        unitCostPhp: getMatRate('d2_lfeet', 'L-Feet Bracket with EPDM & Bolt', 150),
        amountPhp: 0
      },
      {
        id: 'd2_m3',
        autoSourceKey: 'd2_endclamps',
        description: 'End Clamp (35mm)',
        quantity: Math.max(4, totalEndClamps),
        unit: 'pc',
        unitCostPhp: getMatRate('d2_endclamps', 'End Clamp (35mm)', 50),
        amountPhp: 0
      },
      {
        id: 'd2_m4',
        autoSourceKey: 'd2_midclamps',
        description: 'Mid Clamp (35mm)',
        quantity: Math.max(4, totalMidClamps),
        unit: 'pc',
        unitCostPhp: getMatRate('d2_midclamps', 'Mid Clamp (35mm)', 50),
        amountPhp: 0
      },
      {
        id: 'd2_m5',
        autoSourceKey: 'd2_splices',
        description: 'Rail Splice / Connector',
        quantity: Math.max(2, totalRailSplices),
        unit: 'pc',
        unitCostPhp: getMatRate('d2_splices', 'Rail Splice / Connector', 85),
        amountPhp: 0
      },
      {
        id: 'd2_m6',
        autoSourceKey: 'd2_bolts',
        description: 'Stainless Steel Lag Bolts & EPDM Washers',
        quantity: 1,
        unit: 'lot',
        unitCostPhp: getMatRate('d2_bolts', 'Stainless Steel Lag Bolts & EPDM Washers', 16000),
        amountPhp: 0
      }
    ],
    labor: [
      {
        id: 'd2_l1',
        description: 'Foreman',
        count: 1,
        days: d2Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Foreman', 1000),
        amountPhp: 0
      },
      {
        id: 'd2_l2',
        description: 'Lead Installer',
        count: 2,
        days: d2Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Lead Installer', 850),
        amountPhp: 0
      },
      {
        id: 'd2_l3',
        description: 'Solar Installer',
        count: 2,
        days: d2Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Solar Installer', 750),
        amountPhp: 0
      },
      {
        id: 'd2_l4',
        description: 'Helper',
        count: 2,
        days: d2Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Helper', 500),
        amountPhp: 0
      }
    ],
    equipment: [
      {
        id: 'd2_e1',
        description: 'Scaffolding Rental',
        count: 1,
        days: d2Duration,
        unit: 'set',
        ratePerDayPhp: getEqRate('Scaffolding Rental', 500),
        amountPhp: 0
      },
      {
        id: 'd2_e2',
        description: 'Electric Impact Wrench',
        count: 2,
        days: d2Duration,
        unit: 'unit',
        ratePerDayPhp: getEqRate('Electric Impact Wrench', 250),
        amountPhp: 0
      }
    ],
    totalMaterialsPhp: 0,
    totalLaborPhp: 0,
    totalEquipmentPhp: 0,
    estimatedDirectCostPhp: 0,
    ocmPercent,
    ocmAmountPhp: 0,
    profitPercent,
    profitAmountPhp: 0,
    vatPercent,
    vatAmountPhp: 0,
    totalItemCostPhp: 0,
    unitCostPerItemPhp: 0
  });
  items.push(d2Item);

  // ==========================================
  // D3: DC Raceways, Cable Trays, Conduits & Fasteners (Roof/Structure Mount)
  // ==========================================
  const d3TrayLengths = Math.max(2, Math.ceil((totalDcRacewayM * 1.05) / 2.44));
  const d3SplicePlates = d3TrayLengths * 2;
  const d3SupportBrackets = Math.max(4, Math.ceil(totalDcRacewayM / 1.5) + 2);
  const d3FastenerSets = (d3TrayLengths * 8) + (d3SupportBrackets * 4);
  const d3TrayBends = Math.max(2, totalDcRacewayBends);
  const d3BondingJumpers = d3TrayLengths;
  const d3FlexConduitM = Math.max(25, Math.ceil(totalIntraStringM > 0 ? totalIntraStringM * 0.35 : zones.length * 15));
  const d3Duration = Math.max(3, Math.ceil(totalDcRacewayM / 12));

  const trayModelDesc = totalStrings <= 8
    ? '100mm × 50mm (4" × 2") Perforated Cable Tray w/ Cover (Hot-Dip Galvanized / Aluminum)'
    : '150mm × 100mm (6" × 4") Perforated Cable Tray w/ Cover (Hot-Dip Galvanized / Aluminum)';

  const d3Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D3',
    category: 'Solar Works',
    description: `DC Raceways, Cable Trays, Conduits & Fasteners (${Math.round(totalDcRacewayM)}m Trunk Run)`,
    durationDays: d3Duration,
    quantity: 1,
    unit: 'lot',
    materials: [
      {
        id: 'd3_m1',
        autoSourceKey: 'd3_cable_tray',
        description: trayModelDesc,
        quantity: d3TrayLengths,
        unit: 'lengths',
        unitCostPhp: getMatRate('d3_cable_tray', trayModelDesc, 1250),
        amountPhp: 0
      },
      {
        id: 'd3_m2',
        autoSourceKey: 'd3_tray_splices',
        description: 'Cable Tray Splice Connector Plates (per joint pair)',
        quantity: d3SplicePlates,
        unit: 'pc',
        unitCostPhp: getMatRate('d3_tray_splices', 'Cable Tray Splice Connector Plates (per joint pair)', 85),
        amountPhp: 0
      },
      {
        id: 'd3_m3',
        autoSourceKey: 'd3_tray_fasteners',
        description: 'SS304 Fastener Sets (M8 Bolt, Hex Nut, Flat & Lock Washers)',
        quantity: d3FastenerSets,
        unit: 'set',
        unitCostPhp: getMatRate('d3_tray_fasteners', 'SS304 Fastener Sets (M8 Bolt, Hex Nut, Flat & Lock Washers)', 18),
        amountPhp: 0
      },
      {
        id: 'd3_m4',
        autoSourceKey: 'd3_tray_brackets',
        description: 'Cable Tray Roof Stand-Off Support Brackets & Lag Fasteners (@ 1.5m)',
        quantity: d3SupportBrackets,
        unit: 'set',
        unitCostPhp: getMatRate('d3_tray_brackets', 'Cable Tray Roof Stand-Off Support Brackets & Lag Fasteners (@ 1.5m)', 280),
        amountPhp: 0
      },
      {
        id: 'd3_m5',
        autoSourceKey: 'd3_tray_bends',
        description: 'Cable Tray Fittings (Elbows, Tees, Risers & End Caps)',
        quantity: d3TrayBends,
        unit: 'pc',
        unitCostPhp: getMatRate('d3_tray_bends', 'Cable Tray Fittings (Elbows, Tees, Risers & End Caps)', 450),
        amountPhp: 0
      },
      {
        id: 'd3_m6',
        autoSourceKey: 'd3_bonding_jumpers',
        description: 'Copper Bonding Jumpers w/ Ground Lugs (1 per joint)',
        quantity: d3BondingJumpers,
        unit: 'pc',
        unitCostPhp: getMatRate('d3_bonding_jumpers', 'Copper Bonding Jumpers w/ Ground Lugs (1 per joint)', 95),
        amountPhp: 0
      },
      {
        id: 'd3_m7',
        autoSourceKey: 'd3_flex_conduit',
        description: '1-inch uPVC flexible conduit (Array to Tray transitions)',
        quantity: d3FlexConduitM,
        unit: 'm',
        unitCostPhp: getMatRate('d3_flex_conduit', '1-inch uPVC flexible conduit', 55),
        amountPhp: 0
      },
      {
        id: 'd3_m8',
        autoSourceKey: 'd3_jbox',
        description: 'Junction Boxes (NEMA 4X)',
        quantity: Math.max(2, Math.max(zones.length, Math.ceil(totalStrings / 4))),
        unit: 'pc',
        unitCostPhp: getMatRate('d3_jbox', 'Junction Boxes (NEMA 4X)', 1200),
        amountPhp: 0
      },
      {
        id: 'd3_m9',
        autoSourceKey: 'd3_glands',
        description: 'Cable Glands & Weatherproof Sealants',
        quantity: 1,
        unit: 'lot',
        unitCostPhp: getMatRate('d3_glands', 'Cable Glands & Weatherproof Sealants', 3500),
        amountPhp: 0
      }
    ],
    labor: [
      {
        id: 'd3_l1',
        description: 'Electrician',
        count: 1,
        days: d3Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Electrician', 850),
        amountPhp: 0
      },
      {
        id: 'd3_l2',
        description: 'Lead Installer',
        count: 2,
        days: d3Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Lead Installer', 850),
        amountPhp: 0
      },
      {
        id: 'd3_l3',
        description: 'Helper',
        count: 2,
        days: d3Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Helper', 500),
        amountPhp: 0
      }
    ],
    equipment: [
      {
        id: 'd3_e1',
        description: 'Electric Impact Wrench',
        count: 2,
        days: d3Duration,
        unit: 'unit',
        ratePerDayPhp: getEqRate('Electric Impact Wrench', 250),
        amountPhp: 0
      },
      {
        id: 'd3_e2',
        description: 'Scaffolding / Ladders Rig Rental',
        count: 1,
        days: Math.max(2, Math.ceil(d3Duration * 0.7)),
        unit: 'set',
        ratePerDayPhp: getEqRate('Scaffolding / Ladders Rig Rental', 500),
        amountPhp: 0
      }
    ],
    totalMaterialsPhp: 0,
    totalLaborPhp: 0,
    totalEquipmentPhp: 0,
    estimatedDirectCostPhp: 0,
    ocmPercent,
    ocmAmountPhp: 0,
    profitPercent,
    profitAmountPhp: 0,
    vatPercent,
    vatAmountPhp: 0,
    totalItemCostPhp: 0,
    unitCostPerItemPhp: 0
  });
  items.push(d3Item);

  // ==========================================
  // D4: PV Panels
  // ==========================================
  const d4Quantity = totalPanelsCount > 0 ? totalPanelsCount : 167;
  const d4Duration = Math.max(3, Math.ceil(d4Quantity / 14));
  const defaultPanelRate = modWatts >= 550 ? 5400 : Number((modWatts * 9.0).toFixed(2));
  const d4Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D4',
    category: 'Solar Works',
    description: `PV Panels (${d4Quantity} units, ${modWatts}W ${firstMod?.bifacial ? 'Bifacial' : 'Monocrystalline'})`,
    durationDays: d4Duration,
    quantity: d4Quantity,
    unit: 'pc',
    materials: [
      {
        id: 'd4_m1',
        autoSourceKey: 'd4_pv_module',
        description: modName,
        quantity: d4Quantity,
        unit: 'pc',
        unitCostPhp: getMatRate('d4_pv_module', modName, defaultPanelRate),
        amountPhp: 0
      }
    ],
    labor: [
      {
        id: 'd4_l1',
        description: 'Foreman',
        count: 1,
        days: d4Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Foreman', 1000),
        amountPhp: 0
      },
      {
        id: 'd4_l2',
        description: 'Lead Installer',
        count: 2,
        days: d4Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Lead Installer', 850),
        amountPhp: 0
      },
      {
        id: 'd4_l3',
        description: 'Solar Installer',
        count: 2,
        days: d4Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Solar Installer', 750),
        amountPhp: 0
      },
      {
        id: 'd4_l4',
        description: 'Helper',
        count: 2,
        days: d4Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Helper', 500),
        amountPhp: 0
      }
    ],
    equipment: [
      {
        id: 'd4_e1',
        description: 'Panel Lifting Rig / Hoist',
        count: 1,
        days: Math.max(2, Math.ceil(d4Duration / 3)),
        unit: 'unit',
        ratePerDayPhp: getEqRate('Panel Lifting Rig / Hoist', 500),
        amountPhp: 0
      }
    ],
    totalMaterialsPhp: 0,
    totalLaborPhp: 0,
    totalEquipmentPhp: 0,
    estimatedDirectCostPhp: 0,
    ocmPercent,
    ocmAmountPhp: 0,
    profitPercent,
    profitAmountPhp: 0,
    vatPercent,
    vatAmountPhp: 0,
    totalItemCostPhp: 0,
    unitCostPerItemPhp: 0
  });
  items.push(d4Item);

  // ==========================================
  // D5: DC Wiring – PV String to Combiner to Inverter (6mm² & 10mm² PV1-F)
  // ==========================================
  const d5Duration = Math.max(4, Math.ceil((totalStrings || 8) * 0.8));
  const mc4Count = Math.max(16, (totalStrings || 8) * 3 * 2);
  const d5Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D5',
    category: 'Solar Works',
    description: 'DC Wiring – PV String to Combiner to Inverter (6mm² & 10mm² PV1-F)',
    durationDays: d5Duration,
    quantity: 1,
    unit: 'lot',
    materials: [
      {
        id: 'd5_m1',
        autoSourceKey: 'd5_wire_black',
        description: '6mm² PV Wire PV1-F (Black)',
        quantity: dcWireLengthSinglePolarityM,
        unit: 'm',
        unitCostPhp: getMatRate('d5_wire_black', '6mm² PV Wire PV1-F (Black)', 65),
        amountPhp: 0
      },
      {
        id: 'd5_m2',
        autoSourceKey: 'd5_wire_red',
        description: '6mm² PV Wire PV1-F (Red)',
        quantity: dcWireLengthSinglePolarityM,
        unit: 'm',
        unitCostPhp: getMatRate('d5_wire_red', '6mm² PV Wire PV1-F (Red)', 65),
        amountPhp: 0
      },
      {
        id: 'd5_m3',
        autoSourceKey: 'd5_mc4',
        description: 'MC4 Connector Pairs (Tier-1)',
        quantity: mc4Count,
        unit: 'set',
        unitCostPhp: getMatRate('d5_mc4', 'MC4 Connector Pairs (Tier-1)', 125),
        amountPhp: 0
      },
      {
        id: 'd5_m4',
        autoSourceKey: 'd5_ties',
        description: 'Cable Ties, Labels, UV Clips',
        quantity: 1,
        unit: 'lot',
        unitCostPhp: getMatRate('d5_ties', 'Cable Ties, Labels, UV Clips', 5000),
        amountPhp: 0
      }
    ],
    labor: [
      {
        id: 'd5_l1',
        description: 'Electrician',
        count: 1,
        days: d5Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Electrician', 950),
        amountPhp: 0
      },
      {
        id: 'd5_l2',
        description: 'Helper',
        count: 2,
        days: d5Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Helper', 500),
        amountPhp: 0
      }
    ],
    equipment: [
      {
        id: 'd5_e1',
        description: 'MC4 Crimping Tool',
        count: 1,
        days: Math.max(2, Math.ceil(d5Duration * 0.6)),
        unit: 'unit',
        ratePerDayPhp: getEqRate('MC4 Crimping Tool', 300),
        amountPhp: 0
      }
    ],
    totalMaterialsPhp: 0,
    totalLaborPhp: 0,
    totalEquipmentPhp: 0,
    estimatedDirectCostPhp: 0,
    ocmPercent,
    ocmAmountPhp: 0,
    profitPercent,
    profitAmountPhp: 0,
    vatPercent,
    vatAmountPhp: 0,
    totalItemCostPhp: 0,
    unitCostPerItemPhp: 0
  });
  items.push(d5Item);

  // ==========================================
  // D6: DC Protections – Combiner Box, Fuses, SPD & DC Disconnect
  // ==========================================
  const d6Duration = 4;
  const d6CombinerUnits = Math.max(1, Math.ceil((totalStrings || 8) / 4));
  const d6SpdCount = Math.max(totalStrings, totalInverterUnits * 8);
  const d6Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D6',
    category: 'Solar Works',
    description: 'DC Protections – Combiner Box, Fuses, SPD & DC Disconnect',
    durationDays: d6Duration,
    quantity: 1,
    unit: 'lot',
    materials: [
      {
        id: 'd6_m1',
        autoSourceKey: 'd6_combiner_box',
        description: 'DC Combiner Box (IP65, 8-String)',
        quantity: d6CombinerUnits,
        unit: 'unit',
        unitCostPhp: getMatRate('d6_combiner_box', 'DC Combiner Box (IP65, 8-String)', 3500),
        amountPhp: 0
      },
      {
        id: 'd6_m2',
        autoSourceKey: 'd6_dc_breaker',
        description: `DC Breaker (15A, ${maxDcVoltage}VDC)`,
        quantity: d6SpdCount,
        unit: 'pc',
        unitCostPhp: getMatRate('d6_dc_breaker', `DC Breaker (15A, ${maxDcVoltage}VDC)`, 650),
        amountPhp: 0
      },
      {
        id: 'd6_m3',
        autoSourceKey: 'd6_dc_spd',
        description: `DC SPD Type II (${maxDcVoltage}VDC)`,
        quantity: d6SpdCount,
        unit: 'unit',
        unitCostPhp: getMatRate('d6_dc_spd', `DC SPD Type II (${maxDcVoltage}VDC)`, 850),
        amountPhp: 0
      },
      {
        id: 'd6_m4',
        autoSourceKey: 'd6_hardware',
        description: 'Din Rails, Glands, Enclosure Hardware',
        quantity: 1,
        unit: 'lot',
        unitCostPhp: getMatRate('d6_hardware', 'Din Rails, Glands, Enclosure Hardware', 5000),
        amountPhp: 0
      }
    ],
    labor: [
      {
        id: 'd6_l1',
        description: 'Master Electrician',
        count: 1,
        days: d6Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Master Electrician', 1200),
        amountPhp: 0
      },
      {
        id: 'd6_l2',
        description: 'Helper',
        count: 1,
        days: d6Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Helper', 500),
        amountPhp: 0
      }
    ],
    equipment: [
      {
        id: 'd6_e1',
        description: 'Insulation Tester',
        count: 1,
        days: 2,
        unit: 'unit',
        ratePerDayPhp: getEqRate('Insulation Tester', 1500),
        amountPhp: 0
      }
    ],
    totalMaterialsPhp: 0,
    totalLaborPhp: 0,
    totalEquipmentPhp: 0,
    estimatedDirectCostPhp: 0,
    ocmPercent,
    ocmAmountPhp: 0,
    profitPercent,
    profitAmountPhp: 0,
    vatPercent,
    vatAmountPhp: 0,
    totalItemCostPhp: 0,
    unitCostPerItemPhp: 0
  });
  items.push(d6Item);

  // ==========================================
  // D7: String Inverters – 2 × 50kW (Sungrow SG50CX or assigned model)
  // ==========================================
  const d7Duration = 4;
  const kwPerInverter = totalInverterUnits > 0 ? Math.round(totalAcKw / totalInverterUnits) : 50;
  // Estimate inverter unit cost based on kW rating: ~₱4,500/kW for commercial tier-1
  const defaultInverterCost = Math.max(45000, kwPerInverter * 4500);

  const d7Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D7',
    category: 'Solar Works',
    description: `String Inverters – ${totalInverterUnits} × ${kwPerInverter}kW (${primaryInverterModel})`,
    durationDays: d7Duration,
    quantity: 1,
    unit: 'lot',
    materials: [
      {
        id: 'd7_m1',
        autoSourceKey: 'd7_inverter_unit',
        description: `${kwPerInverter}kW String Inverter`,
        quantity: totalInverterUnits,
        unit: 'unit',
        unitCostPhp: getMatRate('d7_inverter_unit', `${kwPerInverter}kW String Inverter`, defaultInverterCost),
        amountPhp: 0
      },
      {
        id: 'd7_m2',
        autoSourceKey: 'd7_smart_meter',
        description: 'Smart Meter / Export Limiter Kit',
        quantity: systems.length,
        unit: 'set',
        unitCostPhp: getMatRate('d7_smart_meter', 'Smart Meter / Export Limiter Kit', 48000),
        amountPhp: 0
      },
      {
        id: 'd7_m3',
        autoSourceKey: 'd7_brackets',
        description: 'Inverter Mounting Bracket (wall/rack)',
        quantity: totalInverterUnits,
        unit: 'set',
        unitCostPhp: getMatRate('d7_brackets', 'Inverter Mounting Bracket (wall/rack)', 2500),
        amountPhp: 0
      },
      {
        id: 'd7_m4',
        autoSourceKey: 'd7_comms',
        description: 'Communication Module (WiFi/4G)',
        quantity: totalInverterUnits,
        unit: 'pc',
        unitCostPhp: getMatRate('d7_comms', 'Communication Module (WiFi/4G)', 3500),
        amountPhp: 0
      }
    ],
    labor: [
      {
        id: 'd7_l1',
        description: 'Systems Engineer (commissioning)',
        count: 1,
        days: 3,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Systems Engineer (commissioning)', 2500),
        amountPhp: 0
      },
      {
        id: 'd7_l2',
        description: 'Master Electrician',
        count: 1,
        days: d7Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Master Electrician', 1200),
        amountPhp: 0
      },
      {
        id: 'd7_l3',
        description: 'Helper',
        count: 1,
        days: d7Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Helper', 500),
        amountPhp: 0
      }
    ],
    equipment: [
      {
        id: 'd7_e1',
        description: 'Commissioning Laptop & Tools',
        count: 1,
        days: 2,
        unit: 'unit',
        ratePerDayPhp: getEqRate('Commissioning Laptop & Tools', 1000),
        amountPhp: 0
      }
    ],
    totalMaterialsPhp: 0,
    totalLaborPhp: 0,
    totalEquipmentPhp: 0,
    estimatedDirectCostPhp: 0,
    ocmPercent,
    ocmAmountPhp: 0,
    profitPercent,
    profitAmountPhp: 0,
    vatPercent,
    vatAmountPhp: 0,
    totalItemCostPhp: 0,
    unitCostPerItemPhp: 0
  });
  items.push(d7Item);

  // ==========================================
  // D8: AC Protection Panel – MCCBs, SPD, Metering (3-Phase, 400A)
  // ==========================================
  const d8Duration = 4;
  const invMccbRating = Math.max(50, Math.ceil((kwPerInverter * 1000) / (phaseStr.includes('3') ? 1.732 * 400 : 230) * 1.25));
  // Standard next breaker rating
  let ocpdPerInv = 250;
  if (invMccbRating <= 60) ocpdPerInv = 60;
  else if (invMccbRating <= 100) ocpdPerInv = 100;
  else if (invMccbRating <= 160) ocpdPerInv = 160;
  else if (invMccbRating <= 200) ocpdPerInv = 200;
  else if (invMccbRating <= 250) ocpdPerInv = 250;
  else ocpdPerInv = 400;

  const d8Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D8',
    category: 'Solar Works',
    description: `AC Protection Panel – MCCBs, SPD, Metering (${phaseStr}, ${mainBreakerA}A)`,
    durationDays: d8Duration,
    quantity: 1,
    unit: 'lot',
    materials: [
      {
        id: 'd8_m1',
        autoSourceKey: 'd8_enclosure',
        description: 'AC Breaker Enclosure',
        quantity: totalInverterUnits,
        unit: 'unit',
        unitCostPhp: getMatRate('d8_enclosure', 'AC Breaker Enclosure', 5000),
        amountPhp: 0
      },
      {
        id: 'd8_m2',
        autoSourceKey: 'd8_inv_mccb',
        description: `MCCB ${ocpdPerInv}A ${phaseStr.includes('3') ? '3-Pole' : '2-Pole'} (per inverter output)`,
        quantity: totalInverterUnits,
        unit: 'pc',
        unitCostPhp: getMatRate('d8_inv_mccb', `MCCB ${ocpdPerInv}A ${phaseStr.includes('3') ? '3-Pole' : '2-Pole'} (per inverter output)`, 35000),
        amountPhp: 0
      },
      {
        id: 'd8_m3',
        autoSourceKey: 'd8_ct',
        description: 'Current Transformers (200/5A)',
        quantity: phaseStr.includes('3') ? 3 : 1,
        unit: 'pc',
        unitCostPhp: getMatRate('d8_ct', 'Current Transformers (200/5A)', 2000),
        amountPhp: 0
      },
      {
        id: 'd8_m4',
        autoSourceKey: 'd8_busbars',
        description: 'Din Rails, Busbars, Hardware, Terminal Lugs',
        quantity: 1,
        unit: 'lot',
        unitCostPhp: getMatRate('d8_busbars', 'Din Rails, Busbars, Hardware, Terminal Lugs', 8000),
        amountPhp: 0
      }
    ],
    labor: [
      {
        id: 'd8_l1',
        description: 'Master Electrician',
        count: 1,
        days: d8Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Master Electrician', 1200),
        amountPhp: 0
      },
      {
        id: 'd8_l2',
        description: 'Electrician',
        count: 3,
        days: d8Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Electrician', 850),
        amountPhp: 0
      }
    ],
    equipment: [
      {
        id: 'd8_e1',
        description: 'Insulation/Loop Tester',
        count: 1,
        days: 2,
        unit: 'unit',
        ratePerDayPhp: getEqRate('Insulation/Loop Tester', 1500),
        amountPhp: 0
      }
    ],
    totalMaterialsPhp: 0,
    totalLaborPhp: 0,
    totalEquipmentPhp: 0,
    estimatedDirectCostPhp: 0,
    ocmPercent,
    ocmAmountPhp: 0,
    profitPercent,
    profitAmountPhp: 0,
    vatPercent,
    vatAmountPhp: 0,
    totalItemCostPhp: 0,
    unitCostPerItemPhp: 0
  });
  items.push(d8Item);

  // ==========================================
  // D9: AC Wiring & Feeder Raceway – Inverter to Building MDP
  // ==========================================
  const feederRunM = totalFeederRunM > 0 ? totalFeederRunM : 50;
  const d9Duration = Math.max(3, Math.ceil(feederRunM / 15));
  const thhnMeters = Math.ceil(feederRunM * (phaseStr.includes('3') ? 3 : 2));

  const acTrayMeters = feederRunM;
  const acTrayLengths = Math.max(2, Math.ceil((acTrayMeters * 1.05) / 2.44));
  const acSupportBrackets = Math.max(2, Math.ceil(acTrayMeters / 1.5) + 1);
  const acFastenerSets = (acTrayLengths * 8) + (acSupportBrackets * 4);

  // Unit rate for Cu THHN increases with mm2 gauge:
  let defaultThhnRate = 1045;
  if (maxPhaseMm2 <= 22) defaultThhnRate = 350;
  else if (maxPhaseMm2 <= 38) defaultThhnRate = 580;
  else if (maxPhaseMm2 <= 60) defaultThhnRate = 820;
  else if (maxPhaseMm2 <= 80) defaultThhnRate = 1045;
  else if (maxPhaseMm2 <= 125) defaultThhnRate = 1600;
  else defaultThhnRate = 2200;

  const d9Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D9',
    category: 'Solar Works',
    description: `AC Wiring & Feeder Raceway – Inverter to MDP (${maxPhaseMm2}mm² THHN, ${phaseStr})`,
    durationDays: d9Duration,
    quantity: 1,
    unit: 'lot',
    materials: [
      {
        id: 'd9_m1',
        autoSourceKey: 'd9_feeder_wire',
        description: `${maxPhaseMm2}mm² THHN/THWN-2 (Phase conductors, ${phaseStr.includes('3') ? '3' : '2'})`,
        quantity: thhnMeters,
        unit: 'm',
        unitCostPhp: getMatRate('d9_feeder_wire', `${maxPhaseMm2}mm² THHN/THWN-2 (Phase conductors, 3)`, defaultThhnRate),
        amountPhp: 0
      },
      {
        id: 'd9_m2',
        autoSourceKey: 'd9_lugs',
        description: 'Cable Lugs (Heavy Duty Compression Type)',
        quantity: phaseStr.includes('3') ? 12 : 8,
        unit: 'pc',
        unitCostPhp: getMatRate('d9_lugs', 'Cable Lugs (Heavy Duty Compression Type)', 350),
        amountPhp: 0
      },
      {
        id: 'd9_m3',
        autoSourceKey: 'd9_cable_tray',
        description: '200mm (8") Perforated AC Feeder Cable Tray w/ Cover (2.44m / length)',
        quantity: acTrayLengths,
        unit: 'lengths',
        unitCostPhp: getMatRate('d9_cable_tray', '200mm (8") Perforated AC Feeder Cable Tray w/ Cover (2.44m / length)', 1650),
        amountPhp: 0
      },
      {
        id: 'd9_m4',
        autoSourceKey: 'd9_tray_fasteners',
        description: 'AC Cable Tray Splice Connector Plates & SS304 Fastener Sets',
        quantity: acFastenerSets,
        unit: 'set',
        unitCostPhp: getMatRate('d9_tray_fasteners', 'AC Cable Tray Splice Connector Plates & SS304 Fastener Sets', 145),
        amountPhp: 0
      },
      {
        id: 'd9_m5',
        autoSourceKey: 'd9_tray_brackets',
        description: 'AC Cable Tray Wall/Floor Support Brackets & Concrete Anchors (@ 1.5m)',
        quantity: acSupportBrackets,
        unit: 'set',
        unitCostPhp: getMatRate('d9_tray_brackets', 'AC Cable Tray Wall/Floor Support Brackets & Concrete Anchors (@ 1.5m)', 350),
        amountPhp: 0
      },
      {
        id: 'd9_m6',
        autoSourceKey: 'd9_pvc_conduit',
        description: '2-inch Rigid PVC / Metallic Conduit (Terminal Risers)',
        quantity: Math.max(2, Math.ceil(feederRunM / 25)),
        unit: 'lengths',
        unitCostPhp: getMatRate('d9_pvc_conduit', '2-inch Rigid PVC / Metallic Conduit (Terminal Risers)', 650),
        amountPhp: 0
      }
    ],
    labor: [
      {
        id: 'd9_l1',
        description: 'Electrician',
        count: 1,
        days: d9Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Electrician', 950),
        amountPhp: 0
      },
      {
        id: 'd9_l2',
        description: 'Helper',
        count: 2,
        days: d9Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Helper', 500),
        amountPhp: 0
      }
    ],
    equipment: [
      {
        id: 'd9_e1',
        description: 'Hydraulic Crimping Tool',
        count: 1,
        days: 2,
        unit: 'unit',
        ratePerDayPhp: getEqRate('Hydraulic Crimping Tool', 800),
        amountPhp: 0
      }
    ],
    totalMaterialsPhp: 0,
    totalLaborPhp: 0,
    totalEquipmentPhp: 0,
    estimatedDirectCostPhp: 0,
    ocmPercent,
    ocmAmountPhp: 0,
    profitPercent,
    profitAmountPhp: 0,
    vatPercent,
    vatAmountPhp: 0,
    totalItemCostPhp: 0,
    unitCostPerItemPhp: 0
  });
  items.push(d9Item);

  return {
    ocmPercent,
    profitPercent,
    vatPercent,
    items,
    lastSyncedAt: new Date().toISOString()
  };
}

/**
 * Computes Total Project Estimate from BOQ Items
 */
export function getBoqProjectTotal(boq: ProjectBoqState): {
  subtotalSolarWorks: number;
  grandTotal: number;
  totalDirectCost: number;
  totalMaterials: number;
  totalLabor: number;
  totalEquipment: number;
  totalOcm: number;
  totalProfit: number;
  totalVat: number;
} {
  let totalMaterials = 0;
  let totalLabor = 0;
  let totalEquipment = 0;
  let totalDirectCost = 0;
  let totalOcm = 0;
  let totalProfit = 0;
  let totalVat = 0;
  let grandTotal = 0;

  for (const item of boq.items) {
    totalMaterials += item.totalMaterialsPhp;
    totalLabor += item.totalLaborPhp;
    totalEquipment += item.totalEquipmentPhp;
    totalDirectCost += item.estimatedDirectCostPhp;
    totalOcm += item.ocmAmountPhp;
    totalProfit += item.profitAmountPhp;
    totalVat += item.vatAmountPhp;
    grandTotal += item.totalItemCostPhp;
  }

  return {
    subtotalSolarWorks: Number(grandTotal.toFixed(2)),
    grandTotal: Number(grandTotal.toFixed(2)),
    totalDirectCost: Number(totalDirectCost.toFixed(2)),
    totalMaterials: Number(totalMaterials.toFixed(2)),
    totalLabor: Number(totalLabor.toFixed(2)),
    totalEquipment: Number(totalEquipment.toFixed(2)),
    totalOcm: Number(totalOcm.toFixed(2)),
    totalProfit: Number(totalProfit.toFixed(2)),
    totalVat: Number(totalVat.toFixed(2))
  };
}

/**
 * Exports both BOQ Schedule and DUPA Breakdown in CSV format
 */
export function exportBoqAndDupaCsv(projectName: string, boq: ProjectBoqState): string {
  const exportDate = new Date().toLocaleDateString('en-US');
  const totals = getBoqProjectTotal(boq);

  const lines: string[] = [];

  // 1. BILL OF QUANTITIES (BOQ)
  lines.push('BILL OF QUANTITIES (BOQ),,,,,,');
  lines.push(`Project: ${projectName},,,,,,`);
  lines.push(`Export Date: ${exportDate},,,,,,`);
  lines.push(',,,,,,');
  lines.push('Item No.,Category,Work Description,Quantity,Unit,Unit Cost (PHP),Total Cost (PHP)');
  lines.push('Solar Works,,,,,,');

  for (const it of boq.items) {
    const desc = it.description.includes(',') ? `"${it.description}"` : it.description;
    lines.push(`${it.itemNo},${it.category},${desc},${it.quantity},${it.unit},${it.unitCostPerItemPhp},${it.totalItemCostPhp}`);
  }

  lines.push(`,,Subtotal (Solar Works),,,,${totals.subtotalSolarWorks}`);
  lines.push(`GRAND TOTAL PROJECT ESTIMATE,,,,,,${totals.grandTotal}`);

  // 2. DETAILED UNIT PRICE ANALYSIS (DUPA) FOR EACH ITEM
  for (const it of boq.items) {
    lines.push(',,,,,');
    lines.push('DETAILED UNIT PRICE ANALYSIS (DUPA),,,,,');
    lines.push(',,,,,');
    lines.push(`Item No.,${it.itemNo},Duration,${it.durationDays} days,,`);
    lines.push(`Category,${it.category},Quantity,${it.quantity},,`);
    const dDesc = it.description.includes(',') ? `"${it.description}"` : it.description;
    lines.push(`Description,${dDesc},Unit,${it.unit},,`);
    lines.push(',,,,,');

    // A. MATERIALS
    lines.push('A. MATERIALS,,,,,');
    lines.push('Description,Quantity,Unit,Unit Cost (PHP),Amount (PHP),');
    for (const m of it.materials) {
      const mDesc = m.description.includes(',') ? `"${m.description}"` : m.description;
      lines.push(`${mDesc},${m.quantity},${m.unit},${m.unitCostPhp},${m.amountPhp},`);
    }
    lines.push(`Total Materials (A),,,,${it.totalMaterialsPhp},`);
    lines.push(',,,,,');

    // B. LABOR
    lines.push('B. LABOR,,,,,');
    lines.push('Description,No.,Days,Unit,Rate/Day (PHP),Amount (PHP)');
    for (const l of it.labor) {
      const lDesc = l.description.includes(',') ? `"${l.description}"` : l.description;
      lines.push(`${lDesc},${l.count},${l.days},${l.unit},${l.ratePerDayPhp},${l.amountPhp}`);
    }
    lines.push(`Total Labor (B),,,,,${it.totalLaborPhp}`);
    lines.push(',,,,,');

    // C. EQUIPMENT
    lines.push('C. EQUIPMENT,,,,,');
    lines.push('Description,No.,Days,Unit,Rate/Day (PHP),Amount (PHP)');
    for (const e of it.equipment) {
      const eDesc = e.description.includes(',') ? `"${e.description}"` : e.description;
      lines.push(`${eDesc},${e.count},${e.days},${e.unit},${e.ratePerDayPhp},${e.amountPhp}`);
    }
    lines.push(`Total Equipment (C),,,,,${it.totalEquipmentPhp}`);
    lines.push(',,,,,');

    // SUMMARY
    lines.push('SUMMARY,,,,,');
    lines.push(`Estimated Direct Cost (EDC = A+B+C),,,,,${it.estimatedDirectCostPhp}`);
    lines.push(`OCM (${it.ocmPercent.toFixed(2)}%),,,,,${it.ocmAmountPhp}`);
    lines.push(`Contractor's Profit (${it.profitPercent.toFixed(2)}%),,,,,${it.profitAmountPhp}`);
    lines.push(`Value Added Tax (${it.vatPercent.toFixed(2)}%),,,,,${it.vatAmountPhp}`);
    lines.push(`TOTAL ITEM COST,,,,,${it.totalItemCostPhp}`);
    lines.push(`UNIT COST PER ITEM,,,,,${it.unitCostPerItemPhp}`);
  }

  return lines.join('\n');
}

/**
 * Single aggregated material item in the Costed Bill of Materials (BOM)
 */
export interface CostedBomItem {
  id: string;
  itemNo: string;
  dupaItemNo: string;
  dupaWorkDescription: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitCostPhp: number;
  amountPhp: number;
  autoSourceKey?: string;
}

/**
 * Extracts a flattened, sorted, and categorized Costed Bill of Materials (BOM) across all DUPA items
 */
export function extractCostedBom(boq: ProjectBoqState): CostedBomItem[] {
  const result: CostedBomItem[] = [];
  let seq = 1;

  const categoryMap: Record<string, string> = {
    D1: 'Logistics & Preliminaries',
    D2: 'Mounting Structure & Racking',
    D3: 'Raceways, Cable Trays & Fasteners',
    D4: 'PV Modules',
    D5: 'DC Cabling & Connectors',
    D6: 'Grounding & Surge Protection',
    D7: 'Testing & Commissioning',
    D8: 'Inverters & AC Equipment',
    D9: 'AC Feeders & Interconnection'
  };

  for (const dupa of boq.items) {
    for (const mat of dupa.materials) {
      result.push({
        id: mat.id || `bom_${seq}`,
        itemNo: `M${String(seq).padStart(2, '0')}`,
        dupaItemNo: dupa.itemNo,
        dupaWorkDescription: dupa.description,
        category: categoryMap[dupa.itemNo] || 'General Materials',
        description: mat.description,
        quantity: mat.quantity,
        unit: mat.unit,
        unitCostPhp: mat.unitCostPhp,
        amountPhp: mat.amountPhp,
        autoSourceKey: mat.autoSourceKey
      });
      seq++;
    }
  }

  return result;
}

/**
 * Exports the Costed Bill of Materials (BOM) to CSV
 */
export function exportCostedBomCsv(projectName: string, boq: ProjectBoqState): string {
  const exportDate = new Date().toLocaleDateString('en-US');
  const bom = extractCostedBom(boq);
  const totalAmount = bom.reduce((sum, item) => sum + item.amountPhp, 0);

  const lines: string[] = [];
  lines.push('COSTED BILL OF MATERIALS (BOM),,,,,,,');
  lines.push(`Project: ${projectName},,,,,,,`);
  lines.push(`Export Date: ${exportDate},,,,,,,`);
  lines.push(',,,,,,,');
  lines.push('Item Tag,Category,Material Description,DUPA Source,Quantity,Unit,Unit Cost (PHP),Total Amount (PHP)');

  for (const it of bom) {
    const desc = it.description.includes(',') ? `"${it.description}"` : it.description;
    const cat = it.category.includes(',') ? `"${it.category}"` : it.category;
    const src = it.dupaWorkDescription.includes(',') ? `"${it.dupaWorkDescription}"` : it.dupaWorkDescription;
    lines.push(`${it.itemNo},${cat},${desc},${it.dupaItemNo} - ${src},${it.quantity},${it.unit},${it.unitCostPhp},${it.amountPhp}`);
  }

  lines.push(',,,,,,,');
  lines.push(`,,,TOTAL MATERIAL COST (A),,,,${totalAmount}`);
  return lines.join('\n');
}
