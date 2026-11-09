/**
 * Inverter, AC combiner, transformer and MDP work items (D7–D10).
 */
import { DupaWorkItem } from '../../../types/solar';
import { recalculateDupaItem } from '../dupaMath';
import type { BoqContext } from '../boqContext';

/** D7: String Inverters – 2 × 50kW (Sungrow SG50CX or assigned model) */
export function buildD7Item(ctx: BoqContext): DupaWorkItem {
  const {
    systems, getMatRate, getLabRate, getEqRate, ocmPercent, profitPercent, vatPercent, totalAcKw,
    totalInverterUnits, primaryInverterModel
  } = ctx;
  const d7Duration = 4;
  const kwPerInverter = totalInverterUnits > 0 ? Math.round(totalAcKw / totalInverterUnits) : 50;
  // Estimate inverter unit cost based on kW rating: ~₱4,500/kW for commercial tier-1
  const defaultInverterCost = Math.max(45000, kwPerInverter * 4500);

  const d7Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D7',
    category: 'Solar Works',
    description: `String Inverters – ${totalInverterUnits} × ${kwPerInverter}kW (${primaryInverterModel})`,
    durationDays: d7Duration,
    quantity: totalInverterUnits,
    unit: 'unit',
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
  return d7Item;
}

/** D8: AC Combiner Panel & Collector Switchgear (Dedicated Item) */
export function buildD8Item(ctx: BoqContext): DupaWorkItem {
  const {
    getMatRate, getLabRate, getEqRate, ocmPercent, profitPercent, vatPercent, totalInverterUnits,
    phaseStr, hasAnyAcCombiner, totalAcCombinersCount, maxAcCombinerBreakerA, maxInverterBreakerA,
    primaryInverterVoltageV
  } = ctx;
  const d8Duration = Math.max(3, Math.ceil(totalInverterUnits * 1.5));
  const hasCombinerRequirement = hasAnyAcCombiner || totalInverterUnits > 1;
  const d8Circuits = hasCombinerRequirement ? totalInverterUnits : 0;
  const d8Description = hasCombinerRequirement
    ? `AC Combiner Panel & Collector Switchgear (${totalInverterUnits} Inverter Circuits, ${maxAcCombinerBreakerA}A Collector MCCB, ${primaryInverterVoltageV}V)`
    : `AC Combiner Panel (Not Required – Direct Inverter Output to MDP)`;

  const d8Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D8',
    category: 'Solar Works',
    description: d8Description,
    durationDays: d8Duration,
    quantity: d8Circuits,
    unit: 'circuit',
    materials: [
      {
        id: 'd8_m1',
        autoSourceKey: 'd8_enclosure',
        description: 'NEMA 4X / IP65 Powder-Coated Wall/Floor Mount Combiner Enclosure',
        quantity: hasCombinerRequirement ? Math.max(1, totalAcCombinersCount) : 0,
        unit: 'unit',
        unitCostPhp: getMatRate('d8_enclosure', 'NEMA 4X / IP65 Powder-Coated Wall/Floor Mount Combiner Enclosure', 25000),
        amountPhp: 0
      },
      {
        id: 'd8_m2',
        autoSourceKey: 'd8_collector_mccb',
        description: `Main Collector MCCB ${maxAcCombinerBreakerA}A ${phaseStr.includes('3') ? '3-Pole' : '2-Pole'} 36kAIC`,
        quantity: hasCombinerRequirement ? Math.max(1, totalAcCombinersCount) : 0,
        unit: 'pc',
        unitCostPhp: getMatRate('d8_collector_mccb', `Main Collector MCCB ${maxAcCombinerBreakerA}A ${phaseStr.includes('3') ? '3-Pole' : '2-Pole'} 36kAIC`, 18500),
        amountPhp: 0
      },
      {
        id: 'd8_m3',
        autoSourceKey: 'd8_inv_mccb',
        description: `Inverter Input Branch MCCB ${maxInverterBreakerA}A ${phaseStr.includes('3') ? '3-Pole' : '2-Pole'} 25kAIC`,
        quantity: hasCombinerRequirement ? totalInverterUnits : 0,
        unit: 'pc',
        unitCostPhp: getMatRate('d8_inv_mccb', `Inverter Input Branch MCCB ${maxInverterBreakerA}A ${phaseStr.includes('3') ? '3-Pole' : '2-Pole'} 25kAIC`, 6500),
        amountPhp: 0
      },
      {
        id: 'd8_m4',
        autoSourceKey: 'd8_ac_spd',
        description: 'AC Surge Protective Device (Type II SPD, 40kA 400V)',
        quantity: hasCombinerRequirement ? Math.max(1, totalAcCombinersCount) : 0,
        unit: 'set',
        unitCostPhp: getMatRate('d8_ac_spd', 'AC Surge Protective Device (Type II SPD, 40kA 400V)', 8500),
        amountPhp: 0
      },
      {
        id: 'd8_m5',
        autoSourceKey: 'd8_busbars',
        description: 'Tin-Plated High-Conductivity Copper Busbars, Supports & Terminal Lugs',
        quantity: hasCombinerRequirement ? Math.max(1, totalAcCombinersCount) : 0,
        unit: 'set',
        unitCostPhp: getMatRate('d8_busbars', 'Tin-Plated High-Conductivity Copper Busbars, Supports & Terminal Lugs', 14000),
        amountPhp: 0
      },
      {
        id: 'd8_m6',
        autoSourceKey: 'd8_power_meter',
        description: 'Digital Multi-Function Power Meter w/ CTs & Pilot Indicator Lights',
        quantity: hasCombinerRequirement ? Math.max(1, totalAcCombinersCount) : 0,
        unit: 'set',
        unitCostPhp: getMatRate('d8_power_meter', 'Digital Multi-Function Power Meter w/ CTs & Pilot Indicator Lights', 9500),
        amountPhp: 0
      }
    ],
    labor: hasCombinerRequirement
      ? [
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
            count: 2,
            days: d8Duration,
            unit: 'pax',
            ratePerDayPhp: getLabRate('Electrician', 850),
            amountPhp: 0
          }
        ]
      : [],
    equipment: hasCombinerRequirement
      ? [
          {
            id: 'd8_e1',
            description: 'Insulation / Loop Impedance Tester',
            count: 1,
            days: 2,
            unit: 'unit',
            ratePerDayPhp: getEqRate('Insulation / Loop Impedance Tester', 1500),
            amountPhp: 0
          }
        ]
      : [],
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
  return d8Item;
}

/** D9: Power Transformer Station – Step-Up / Isolation (Dedicated Item If Any) */
export function buildD9Item(ctx: BoqContext): DupaWorkItem {
  const {
    getMatRate, getLabRate, getEqRate, ocmPercent, profitPercent, vatPercent, hasAnyTransformer,
    totalTransformerKva, transformerTypeStr, transformerPriV, transformerSecV, transformerPriOcpdA,
    transformerSecOcpdA, transformerVectorGroup, transformerStationsCount, primarySystemVoltageV
  } = ctx;
  const d9Duration = 4;
  const d9Quantity = hasAnyTransformer ? Math.max(1, transformerStationsCount) : 0;
  const d9Description = hasAnyTransformer
    ? `Power Transformer Station – ${totalTransformerKva} kVA ${transformerTypeStr} (${transformerPriV}V / ${transformerSecV}V, ${transformerVectorGroup})`
    : `Power Transformer Station (Not Required – Direct ${primarySystemVoltageV}V Grid Interconnection)`;

  const transformerUnitCost = Math.max(250000, totalTransformerKva * 2400);

  const d9Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D9',
    category: 'Solar Works',
    description: d9Description,
    durationDays: d9Duration,
    quantity: d9Quantity,
    unit: 'station',
    materials: [
      {
        id: 'd9_m1',
        autoSourceKey: 'd9_transformer_unit',
        description: `${totalTransformerKva || 150} kVA Dry-Type / Cast Resin Transformer (${transformerPriV}V/${transformerSecV}V, ${transformerVectorGroup})`,
        quantity: d9Quantity,
        unit: 'unit',
        unitCostPhp: getMatRate('d9_transformer_unit', `${totalTransformerKva || 150} kVA Dry-Type / Cast Resin Transformer (${transformerPriV}V/${transformerSecV}V, ${transformerVectorGroup})`, transformerUnitCost),
        amountPhp: 0
      },
      {
        id: 'd9_m2',
        autoSourceKey: 'd9_pri_breaker',
        description: `Primary Side Circuit Breaker / OCPD (${transformerPriOcpdA}A)`,
        quantity: d9Quantity,
        unit: 'pc',
        unitCostPhp: getMatRate('d9_pri_breaker', `Primary Side Circuit Breaker / OCPD (${transformerPriOcpdA}A)`, 28000),
        amountPhp: 0
      },
      {
        id: 'd9_m3',
        autoSourceKey: 'd9_sec_breaker',
        description: `Secondary Side Circuit Breaker / OCPD (${transformerSecOcpdA}A)`,
        quantity: d9Quantity,
        unit: 'pc',
        unitCostPhp: getMatRate('d9_sec_breaker', `Secondary Side Circuit Breaker / OCPD (${transformerSecOcpdA}A)`, 32000),
        amountPhp: 0
      },
      {
        id: 'd9_m4',
        autoSourceKey: 'd9_pad_enclosure',
        description: 'Transformer Reinforced Concrete Pad / Plinth, NEMA 3R Enclosure & Louvers',
        quantity: d9Quantity,
        unit: 'set',
        unitCostPhp: getMatRate('d9_pad_enclosure', 'Transformer Reinforced Concrete Pad / Plinth, NEMA 3R Enclosure & Louvers', 45000),
        amountPhp: 0
      },
      {
        id: 'd9_m5',
        autoSourceKey: 'd9_temp_ctrl',
        description: 'Temperature Controller, PT100 RTD Sensors & Alarm Annunciator',
        quantity: d9Quantity,
        unit: 'set',
        unitCostPhp: getMatRate('d9_temp_ctrl', 'Temperature Controller, PT100 RTD Sensors & Alarm Annunciator', 18000),
        amountPhp: 0
      },
      {
        id: 'd9_m6',
        autoSourceKey: 'd9_braid_connectors',
        description: 'Flexible Copper Braid Busbar Connectors & High-Current Compression Lugs',
        quantity: d9Quantity,
        unit: 'set',
        unitCostPhp: getMatRate('d9_braid_connectors', 'Flexible Copper Braid Busbar Connectors & High-Current Compression Lugs', 15000),
        amountPhp: 0
      }
    ],
    labor: hasAnyTransformer
      ? [
          {
            id: 'd9_l1',
            description: 'Electrical Engineer',
            count: 1,
            days: 3,
            unit: 'pax',
            ratePerDayPhp: getLabRate('Electrical Engineer', 2500),
            amountPhp: 0
          },
          {
            id: 'd9_l2',
            description: 'Master Electrician',
            count: 1,
            days: d9Duration,
            unit: 'pax',
            ratePerDayPhp: getLabRate('Master Electrician', 1200),
            amountPhp: 0
          },
          {
            id: 'd9_l3',
            description: 'Electrician / Rigger',
            count: 2,
            days: d9Duration,
            unit: 'pax',
            ratePerDayPhp: getLabRate('Electrician / Rigger', 850),
            amountPhp: 0
          },
          {
            id: 'd9_l4',
            description: 'Helper',
            count: 2,
            days: d9Duration,
            unit: 'pax',
            ratePerDayPhp: getLabRate('Helper', 500),
            amountPhp: 0
          }
        ]
      : [],
    equipment: hasAnyTransformer
      ? [
          {
            id: 'd9_e1',
            description: 'Boom Truck / Mobile Crane (10-Ton)',
            count: 1,
            days: 2,
            unit: 'unit',
            ratePerDayPhp: getEqRate('Boom Truck / Mobile Crane (10-Ton)', 12000),
            amountPhp: 0
          },
          {
            id: 'd9_e2',
            description: 'Transformer Turns Ratio (TTR) & Hi-Pot Insulation Tester',
            count: 1,
            days: 2,
            unit: 'unit',
            ratePerDayPhp: getEqRate('Transformer Turns Ratio (TTR) & Hi-Pot Insulation Tester', 3500),
            amountPhp: 0
          }
        ]
      : [],
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
  return d9Item;
}

/** D10: AC Main Distribution Panel (MDP), Switchgear & Net-Metering (PCC) */
export function buildD10Item(ctx: BoqContext): DupaWorkItem {
  const {
    getMatRate, getLabRate, getEqRate, ocmPercent, profitPercent, vatPercent, phaseStr,
    mainBreakerA, maxMdpMainBreakerA
  } = ctx;
  const d10Duration = 4;
  const d10Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D10',
    category: 'Solar Works',
    description: `AC Main Distribution Panel (MDP), Switchgear & Net-Metering (PCC Interconnection, ${maxMdpMainBreakerA}A)`,
    durationDays: d10Duration,
    quantity: 1,
    unit: 'panel',
    materials: [
      {
        id: 'd10_m1',
        autoSourceKey: 'd10_mdp_enclosure',
        description: 'NEMA 3R / IP54 Free-Standing MDP Switchboard Enclosure Section',
        quantity: 1,
        unit: 'unit',
        unitCostPhp: getMatRate('d10_mdp_enclosure', 'NEMA 3R / IP54 Free-Standing MDP Switchboard Enclosure Section', 35000),
        amountPhp: 0
      },
      {
        id: 'd10_m2',
        autoSourceKey: 'd10_main_breaker',
        description: `PV Interconnection Main Circuit Breaker (${mainBreakerA}A ${phaseStr.includes('3') ? '3-Pole' : '2-Pole'} 36kAIC)`,
        quantity: 1,
        unit: 'pc',
        unitCostPhp: getMatRate('d10_main_breaker', `PV Interconnection Main Circuit Breaker (${mainBreakerA}A ${phaseStr.includes('3') ? '3-Pole' : '2-Pole'} 36kAIC)`, 24000),
        amountPhp: 0
      },
      {
        id: 'd10_m3',
        autoSourceKey: 'd10_util_disconnect',
        description: 'Utility Lockable Visible-Break AC Disconnect Safety Switch (ERC Net-Metering Compliant)',
        quantity: 1,
        unit: 'pc',
        unitCostPhp: getMatRate('d10_util_disconnect', 'Utility Lockable Visible-Break AC Disconnect Safety Switch (ERC Net-Metering Compliant)', 18500),
        amountPhp: 0
      },
      {
        id: 'd10_m4',
        autoSourceKey: 'd10_revenue_meter_base',
        description: 'Class 0.2S Bi-directional Revenue Meter Socket Base & Utility CT Mounting Section',
        quantity: 1,
        unit: 'set',
        unitCostPhp: getMatRate('d10_revenue_meter_base', 'Class 0.2S Bi-directional Revenue Meter Socket Base & Utility CT Mounting Section', 16000),
        amountPhp: 0
      },
      {
        id: 'd10_m5',
        autoSourceKey: 'd10_busbars_lugs',
        description: 'Main Phase Busbars, Neutral/Ground Links & Heavy-Duty Mechanical Lugs',
        quantity: 1,
        unit: 'set',
        unitCostPhp: getMatRate('d10_busbars_lugs', 'Main Phase Busbars, Neutral/Ground Links & Heavy-Duty Mechanical Lugs', 12000),
        amountPhp: 0
      }
    ],
    labor: [
      {
        id: 'd10_l1',
        description: 'Master Electrician',
        count: 1,
        days: d10Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Master Electrician', 1200),
        amountPhp: 0
      },
      {
        id: 'd10_l2',
        description: 'Electrician',
        count: 2,
        days: d10Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Electrician', 850),
        amountPhp: 0
      },
      {
        id: 'd10_l3',
        description: 'Helper',
        count: 1,
        days: d10Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Helper', 500),
        amountPhp: 0
      }
    ],
    equipment: [
      {
        id: 'd10_e1',
        description: 'Secondary Current Injection & Relay Trip Test Set',
        count: 1,
        days: 2,
        unit: 'unit',
        ratePerDayPhp: getEqRate('Secondary Current Injection & Relay Trip Test Set', 2500),
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
  return d10Item;
}
