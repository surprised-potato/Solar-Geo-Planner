/**
 * PV modules, DC wiring and DC protection work items (D4–D6).
 */
import { DupaWorkItem } from '../../../types/solar';
import { recalculateDupaItem, unpricedTotals } from '../dupaMath';
import type { BoqContext } from '../boqContext';

/** D4: PV Panels */
export function buildD4Item(ctx: BoqContext): DupaWorkItem {
  const {
    totalPanelsCount, getMatRate, getLabRate, getEqRate, ocmPercent, profitPercent, vatPercent,
    firstMod, modWatts, modName
  } = ctx;
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
    ...unpricedTotals(ocmPercent, profitPercent, vatPercent)
  });
  return d4Item;
}

/** D5: DC Wiring – PV String to Combiner to Inverter (6mm² & 10mm² PV1-F) */
export function buildD5Item(ctx: BoqContext): DupaWorkItem {
  const {
    getMatRate, getLabRate, getEqRate, ocmPercent, profitPercent, vatPercent, totalStrings,
    dcWireLengthSinglePolarityM
  } = ctx;
  const d5Duration = Math.max(4, Math.ceil((totalStrings || 8) * 0.8));
  const mc4Count = Math.max(16, (totalStrings || 8) * 3 * 2);
  const totalDcWireM = dcWireLengthSinglePolarityM * 2;
  const d5Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D5',
    category: 'Solar Works',
    description: `DC Wiring – PV String to Combiner to Inverter (${totalDcWireM}m, 6mm² PV1-F)`,
    durationDays: d5Duration,
    quantity: totalDcWireM,
    unit: 'm',
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
        unit: 'set',
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
    ...unpricedTotals(ocmPercent, profitPercent, vatPercent)
  });
  return d5Item;
}

/** D6: DC Protections – Combiner Box, Fuses, SPD & DC Disconnect */
export function buildD6Item(ctx: BoqContext): DupaWorkItem {
  const {
    getMatRate, getLabRate, getEqRate, ocmPercent, profitPercent, vatPercent, totalStrings,
    totalInverterUnits, maxDcVoltage
  } = ctx;
  const d6Duration = 4;
  const d6Strings = Math.max(1, totalStrings || (totalInverterUnits * 4));
  const d6CombinerUnits = Math.max(1, Math.ceil((totalStrings || 8) / 4));
  const d6SpdCount = Math.max(totalStrings, totalInverterUnits * 8);
  const dcGroundRods = Math.max(1, d6CombinerUnits);
  const d6Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D6',
    category: 'Solar Works',
    description: `DC Protections – Combiner Box, Fuses, SPD, DC Disconnect & Earthing Rods (${d6Strings} Strings)`,
    durationDays: d6Duration,
    quantity: d6Strings,
    unit: 'string',
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
        unit: 'set',
        unitCostPhp: getMatRate('d6_hardware', 'Din Rails, Glands, Enclosure Hardware', 5000),
        amountPhp: 0
      },
      {
        id: 'd6_m5',
        autoSourceKey: 'd6_dc_ground_rod',
        description: 'DC Earthing Copper-Clad Ground Rod (5/8-inch dia × 3.0m) w/ Heavy-Duty Ground Clamp',
        quantity: dcGroundRods,
        unit: 'pc',
        unitCostPhp: getMatRate('d6_dc_ground_rod', 'DC Earthing Copper-Clad Ground Rod (5/8-inch dia × 3.0m) w/ Heavy-Duty Ground Clamp', 1250),
        amountPhp: 0
      },
      {
        id: 'd6_m6',
        autoSourceKey: 'd6_dc_ground_wire',
        description: '16mm² Bare Stranded Copper DC Grounding Electrode Conductor (Combiner Box / SPD to Ground Rod)',
        quantity: Math.max(10, dcGroundRods * 10),
        unit: 'm',
        unitCostPhp: getMatRate('d6_dc_ground_wire', '16mm² Bare Stranded Copper DC Grounding Electrode Conductor (Combiner Box / SPD to Ground Rod)', 280),
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
    ...unpricedTotals(ocmPercent, profitPercent, vatPercent)
  });
  return d6Item;
}
