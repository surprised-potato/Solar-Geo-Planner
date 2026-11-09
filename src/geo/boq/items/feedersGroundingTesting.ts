/**
 * AC feeders, grounding / lightning protection and commissioning work items (D11–D13).
 */
import { DupaWorkItem } from '../../../types/solar';
import { recalculateDupaItem, unpricedTotals } from '../dupaMath';
import type { BoqContext } from '../boqContext';

/** D11: AC Feeder Cables, Conduits & Interconnection Runs */
export function buildD11Item(ctx: BoqContext): DupaWorkItem {
  const {
    getMatRate, getLabRate, getEqRate, ocmPercent, profitPercent, vatPercent, phaseStr, maxPhaseMm2,
    totalFeederRunM
  } = ctx;
  const feederRunM = totalFeederRunM > 0 ? totalFeederRunM : 50;
  const feederMeters = Math.max(1, Math.round(feederRunM));
  const d11Duration = Math.max(3, Math.ceil(feederRunM / 15));
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

  const d11Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D11',
    category: 'Solar Works',
    description: `AC Feeder Cables, Conduits & Interconnection Runs (${feederMeters}m Run, ${maxPhaseMm2}mm² THHN/THWN-2, ${phaseStr})`,
    durationDays: d11Duration,
    quantity: feederMeters,
    unit: 'm',
    materials: [
      {
        id: 'd11_m1',
        autoSourceKey: 'd11_feeder_wire',
        description: `${maxPhaseMm2}mm² THHN/THWN-2 (Phase conductors, ${phaseStr.includes('3') ? '3-Wire' : '2-Wire'})`,
        quantity: thhnMeters,
        unit: 'm',
        unitCostPhp: getMatRate('d11_feeder_wire', `${maxPhaseMm2}mm² THHN/THWN-2 (Phase conductors, ${phaseStr.includes('3') ? '3-Wire' : '2-Wire'})`, defaultThhnRate),
        amountPhp: 0
      },
      {
        id: 'd11_m2',
        autoSourceKey: 'd11_ground_wire',
        description: 'Grounding Conductor (Bare / Green THHN Cu Wire)',
        quantity: Math.ceil(feederRunM * 1.05),
        unit: 'm',
        unitCostPhp: getMatRate('d11_ground_wire', 'Grounding Conductor (Bare / Green THHN Cu Wire)', 320),
        amountPhp: 0
      },
      {
        id: 'd11_m3',
        autoSourceKey: 'd11_cable_tray',
        description: '200mm (8-inch) Perforated AC Feeder Cable Tray w/ Cover (2.44m / length)',
        quantity: acTrayLengths,
        unit: 'lengths',
        unitCostPhp: getMatRate('d11_cable_tray', '200mm (8-inch) Perforated AC Feeder Cable Tray w/ Cover (2.44m / length)', 1650),
        amountPhp: 0
      },
      {
        id: 'd11_m4',
        autoSourceKey: 'd11_tray_fasteners',
        description: 'AC Cable Tray Splice Connector Plates & SS304 Fastener Sets',
        quantity: acFastenerSets,
        unit: 'set',
        unitCostPhp: getMatRate('d11_tray_fasteners', 'AC Cable Tray Splice Connector Plates & SS304 Fastener Sets', 145),
        amountPhp: 0
      },
      {
        id: 'd11_m5',
        autoSourceKey: 'd11_tray_brackets',
        description: 'AC Cable Tray Wall/Floor Support Brackets & Concrete Anchors (@ 1.5m)',
        quantity: acSupportBrackets,
        unit: 'set',
        unitCostPhp: getMatRate('d11_tray_brackets', 'AC Cable Tray Wall/Floor Support Brackets & Concrete Anchors (@ 1.5m)', 350),
        amountPhp: 0
      },
      {
        id: 'd11_m6',
        autoSourceKey: 'd11_conduit_risers',
        description: '2-inch Rigid Steel Conduit (RSC) / Metallic Terminal Risers & Weatherhead',
        quantity: Math.max(2, Math.ceil(feederRunM / 25)),
        unit: 'lengths',
        unitCostPhp: getMatRate('d11_conduit_risers', '2-inch Rigid Steel Conduit (RSC) / Metallic Terminal Risers & Weatherhead', 850),
        amountPhp: 0
      },
      {
        id: 'd11_m7',
        autoSourceKey: 'd11_lugs',
        description: 'Heavy-Duty Long-Barrel Compression Cable Lugs & Heat Shrink Termination Kits',
        quantity: phaseStr.includes('3') ? 12 : 8,
        unit: 'pc',
        unitCostPhp: getMatRate('d11_lugs', 'Heavy-Duty Long-Barrel Compression Cable Lugs & Heat Shrink Termination Kits', 350),
        amountPhp: 0
      }
    ],
    labor: [
      {
        id: 'd11_l1',
        description: 'Electrician',
        count: 2,
        days: d11Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Electrician', 850),
        amountPhp: 0
      },
      {
        id: 'd11_l2',
        description: 'Helper',
        count: 2,
        days: d11Duration,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Helper', 500),
        amountPhp: 0
      }
    ],
    equipment: [
      {
        id: 'd11_e1',
        description: 'Hydraulic Cable Crimper & Conduit Bender',
        count: 1,
        days: 2,
        unit: 'unit',
        ratePerDayPhp: getEqRate('Hydraulic Cable Crimper & Conduit Bender', 800),
        amountPhp: 0
      }
    ],
    ...unpricedTotals(ocmPercent, profitPercent, vatPercent)
  });
  return d11Item;
}

/** D12: Grounding & Lightning Protection System (Optional Scope) */
export function buildD12Item(ctx: BoqContext): DupaWorkItem {
  const {
    getMatRate, getLabRate, getEqRate, ocmPercent, profitPercent, vatPercent, totalDcRacewayM,
    totalInverterUnits, totalAcCombinersCount, includeLightning
  } = ctx;
  // ==========================================
  // D12: Grounding & Lightning Protection System (Optional Scope)

  const d12Duration = 4;
  const d12GroundRods = Math.max(4, Math.ceil(totalInverterUnits * 2) + 2);
  const d12GroundLoopM = Math.max(50, Math.ceil(totalDcRacewayM * 0.5) + 30);
  const d12CadweldSets = Math.max(8, Math.ceil(totalInverterUnits * 4));
  const d12InspectionWells = Math.max(2, Math.ceil(totalInverterUnits));
  const d12Quantity = includeLightning ? 1 : 0;
  const d12Description = includeLightning
    ? 'Grounding & Lightning Protection System (PEC / IEC 62305 Compliant)'
    : 'Grounding & Lightning Protection System (Optional Scope – Excluded from Base BOQ)';

  const d12Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D12',
    category: 'Solar Works',
    description: d12Description,
    durationDays: includeLightning ? d12Duration : 0,
    quantity: d12Quantity,
    unit: 'system',
    materials: [
      {
        id: 'd12_m1',
        autoSourceKey: 'd12_ground_rods',
        description: 'Copper-Clad Ground Rods (5/8-inch dia × 3.0m length)',
        quantity: includeLightning ? d12GroundRods : 0,
        unit: 'pc',
        unitCostPhp: getMatRate('d12_ground_rods', 'Copper-Clad Ground Rods (5/8-inch dia × 3.0m length)', 1250),
        amountPhp: 0
      },
      {
        id: 'd12_m2',
        autoSourceKey: 'd12_ground_conductor',
        description: '50mm² Bare Stranded Copper Ground Loop / Ring Conductor',
        quantity: includeLightning ? d12GroundLoopM : 0,
        unit: 'm',
        unitCostPhp: getMatRate('d12_ground_conductor', '50mm² Bare Stranded Copper Ground Loop / Ring Conductor', 480),
        amountPhp: 0
      },
      {
        id: 'd12_m3',
        autoSourceKey: 'd12_cadweld',
        description: 'Exothermic Cadweld Molds, Weld Metal Cartridges & Heavy-Duty Ground Clamps',
        quantity: includeLightning ? d12CadweldSets : 0,
        unit: 'set',
        unitCostPhp: getMatRate('d12_cadweld', 'Exothermic Cadweld Molds, Weld Metal Cartridges & Heavy-Duty Ground Clamps', 850),
        amountPhp: 0
      },
      {
        id: 'd12_m4',
        autoSourceKey: 'd12_lightning_mast',
        description: 'Early Streamer Emission (ESE) / Franklin Lightning Air Terminal Mast & Down-Conductor',
        quantity: includeLightning ? 1 : 0,
        unit: 'set',
        unitCostPhp: getMatRate('d12_lightning_mast', 'Early Streamer Emission (ESE) / Franklin Lightning Air Terminal Mast & Down-Conductor', 28000),
        amountPhp: 0
      },
      {
        id: 'd12_m5',
        autoSourceKey: 'd12_ground_wells',
        description: 'Concrete Ground Inspection Pit / Well with Heavy-Duty Cast Cover',
        quantity: includeLightning ? d12InspectionWells : 0,
        unit: 'unit',
        unitCostPhp: getMatRate('d12_ground_wells', 'Concrete Ground Inspection Pit / Well with Heavy-Duty Cast Cover', 3200),
        amountPhp: 0
      },
      {
        id: 'd12_m6',
        autoSourceKey: 'd12_egb_busbar',
        description: 'Main Equipotential Grounding Busbar (EGB) w/ Disconnect Link',
        quantity: includeLightning ? Math.max(1, totalAcCombinersCount) : 0,
        unit: 'set',
        unitCostPhp: getMatRate('d12_egb_busbar', 'Main Equipotential Grounding Busbar (EGB) w/ Disconnect Link', 4500),
        amountPhp: 0
      }
    ],
    labor: includeLightning
      ? [
          {
            id: 'd12_l1',
            description: 'Master Electrician',
            count: 1,
            days: d12Duration,
            unit: 'pax',
            ratePerDayPhp: getLabRate('Master Electrician', 1200),
            amountPhp: 0
          },
          {
            id: 'd12_l2',
            description: 'Electrician',
            count: 1,
            days: d12Duration,
            unit: 'pax',
            ratePerDayPhp: getLabRate('Electrician', 850),
            amountPhp: 0
          },
          {
            id: 'd12_l3',
            description: 'Helper',
            count: 2,
            days: d12Duration,
            unit: 'pax',
            ratePerDayPhp: getLabRate('Helper', 500),
            amountPhp: 0
          }
        ]
      : [],
    equipment: includeLightning
      ? [
          {
            id: 'd12_e1',
            description: 'Earth Ground Resistance Clamp & 4-Pole Fall-of-Potential Tester',
            count: 1,
            days: 2,
            unit: 'unit',
            ratePerDayPhp: getEqRate('Earth Ground Resistance Clamp & 4-Pole Fall-of-Potential Tester', 1200),
            amountPhp: 0
          }
        ]
      : [],
    ...unpricedTotals(ocmPercent, profitPercent, vatPercent)
  });
  return d12Item;
}

/** D13: Testing, Pre-Commissioning, Labelling & Regulatory Handover */
export function buildD13Item(ctx: BoqContext): DupaWorkItem {
  const {
    systems, getMatRate, getLabRate, getEqRate, ocmPercent, profitPercent, vatPercent,
    totalInverterUnits
  } = ctx;
  const d13Duration = 5;
  const d13Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D13',
    category: 'Solar Works',
    description: 'Testing, Pre-Commissioning, Labelling & Regulatory Handover (ERC / Utility Compliant)',
    durationDays: d13Duration,
    quantity: Math.max(1, systems.length),
    unit: 'system',
    materials: [
      {
        id: 'd13_m1',
        autoSourceKey: 'd13_warning_placards',
        description: 'UV-Resistant Engraved Traffolyte PV Warning, Caution & Operational Placards',
        quantity: Math.max(12, totalInverterUnits * 6),
        unit: 'set',
        unitCostPhp: getMatRate('d13_warning_placards', 'UV-Resistant Engraved Traffolyte PV Warning, Caution & Operational Placards', 450),
        amountPhp: 0
      },
      {
        id: 'd13_m2',
        autoSourceKey: 'd13_asbuilt_frame',
        description: 'As-Built Single-Line Diagram (SLD) & Emergency Shutdown Schematic Acrylic Frame',
        quantity: 2,
        unit: 'set',
        unitCostPhp: getMatRate('d13_asbuilt_frame', 'As-Built Single-Line Diagram (SLD) & Emergency Shutdown Schematic Acrylic Frame', 2500),
        amountPhp: 0
      },
      {
        id: 'd13_m3',
        autoSourceKey: 'd13_loto_kits',
        description: 'Commissioning Consumables, Terminal Marking Ferrules, LOTO Padlocks & Tags',
        quantity: 1,
        unit: 'set',
        unitCostPhp: getMatRate('d13_loto_kits', 'Commissioning Consumables, Terminal Marking Ferrules, LOTO Padlocks & Tags', 5000),
        amountPhp: 0
      }
    ],
    labor: [
      {
        id: 'd13_l1',
        description: 'Professional Electrical Engineer (PEE) – Sign & Seal of As-Built & CFEI',
        count: 1,
        days: 2,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Professional Electrical Engineer (PEE) – Sign & Seal of As-Built & CFEI', 8000),
        amountPhp: 0
      },
      {
        id: 'd13_l2',
        description: 'Solar Commissioning Lead Engineer',
        count: 1,
        days: 4,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Solar Commissioning Lead Engineer', 2500),
        amountPhp: 0
      },
      {
        id: 'd13_l3',
        description: 'Testing Technician',
        count: 1,
        days: 4,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Testing Technician', 1000),
        amountPhp: 0
      },
      {
        id: 'd13_l4',
        description: 'Helper',
        count: 1,
        days: 4,
        unit: 'pax',
        ratePerDayPhp: getLabRate('Helper', 500),
        amountPhp: 0
      }
    ],
    equipment: [
      {
        id: 'd13_e1',
        description: 'Solar I-V Curve Tracer & Solar Irradiance Meter',
        count: 1,
        days: 2,
        unit: 'unit',
        ratePerDayPhp: getEqRate('Solar I-V Curve Tracer & Solar Irradiance Meter', 3500),
        amountPhp: 0
      },
      {
        id: 'd13_e2',
        description: 'Calibrated Infrared Thermal Imaging Camera (IR Thermography)',
        count: 1,
        days: 2,
        unit: 'unit',
        ratePerDayPhp: getEqRate('Calibrated Infrared Thermal Imaging Camera (IR Thermography)', 2500),
        amountPhp: 0
      },
      {
        id: 'd13_e3',
        description: 'Power Quality & Grid Harmonics Analyzer (IEEE 519 / PEC Handover)',
        count: 1,
        days: 2,
        unit: 'unit',
        ratePerDayPhp: getEqRate('Power Quality & Grid Harmonics Analyzer (IEEE 519 / PEC Handover)', 4000),
        amountPhp: 0
      }
    ],
    ...unpricedTotals(ocmPercent, profitPercent, vatPercent)
  });
  return d13Item;
}
