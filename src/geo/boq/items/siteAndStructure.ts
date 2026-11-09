/**
 * Site works, mounting structure and DC raceway work items (D1–D3).
 */
import { DupaWorkItem, DupaMaterialRow, DupaLaborRow, DupaEquipmentRow } from '../../../types/solar';
import { recalculateDupaItem } from '../dupaMath';
import type { BoqContext } from '../boqContext';

/** D1: Mobilization, Demobilization, Safety & Temporary Facilities */
export function buildD1Item(ctx: BoqContext): DupaWorkItem {
  const { getMatRate, getLabRate, getEqRate, ocmPercent, profitPercent, vatPercent } = ctx;
  const d1Duration = 3;
  const d1Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D1',
    category: 'Solar Works',
    description: 'Mobilization, Demobilization, Safety & Temporary Facilities',
    durationDays: d1Duration,
    quantity: 1,
    unit: 'lot',
    materials: [
      {
        id: 'd1_m1',
        autoSourceKey: 'd1_safety_ppe',
        description: 'Safety PPE Package (Hard Hats, Safety Harnesses, High-Vis Vests, Steel-Toe Boots)',
        quantity: 1,
        unit: 'set',
        unitCostPhp: getMatRate('d1_safety_ppe', 'Safety PPE Package (Hard Hats, Safety Harnesses, High-Vis Vests, Steel-Toe Boots)', 15000),
        amountPhp: 0
      },
      {
        id: 'd1_m2',
        autoSourceKey: 'd1_barricades',
        description: 'Temporary Warning Signage, Safety Perimeter Barricades & Warning Tapes',
        quantity: 1,
        unit: 'set',
        unitCostPhp: getMatRate('d1_barricades', 'Temporary Warning Signage, Safety Perimeter Barricades & Warning Tapes', 8500),
        amountPhp: 0
      }
    ],
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
        unit: 'trip',
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
  return d1Item;
}

/** D2: Mounting structure (Roof, Ground, or Hybrid) */
export function buildD2Item(ctx: BoqContext): DupaWorkItem {
  const {
    totalPanelsCount, getMatRate, getLabRate, getEqRate, ocmPercent, profitPercent, vatPercent,
    totalAttachmentPointsCount, totalMidClamps, totalEndClamps, totalRailSplices, totalRoofPanels,
    totalGroundTables, totalGroundPanels, groundModulesUp, groundModulesWide, hasGround, hasRoof,
    isHybrid, isPureGround, aluminumRailPcs, modWatts
  } = ctx;
  const panelsPerTable = totalGroundTables > 0 ? (totalGroundPanels / totalGroundTables) : (groundModulesUp * groundModulesWide);
  const tableKw = (panelsPerTable * modWatts) / 1000;
  const groundMountCostPerKw = 6000; // Benchmark rate requested: ₱6k per kW
  const unitCostPerTablePhp = Math.round(tableKw * groundMountCostPerKw);

  const d2Quantity = isHybrid
    ? 1
    : (isPureGround ? totalGroundTables : (totalRoofPanels > 0 ? totalRoofPanels : (totalPanelsCount > 0 ? totalPanelsCount : 167)));
  const d2Unit = isHybrid ? 'system' : (isPureGround ? 'table' : 'panel');
  const d2Duration = isHybrid
    ? Math.max(5, Math.ceil(totalRoofPanels / 18 + totalGroundTables * 0.75))
    : (isPureGround
        ? Math.max(3, Math.ceil(totalGroundTables / 4))
        : Math.max(3, Math.min(30, Math.ceil((totalRoofPanels || totalPanelsCount || 100) / 16))));

  const d2Description = isHybrid
    ? `Solar mounting structure (${totalGroundTables} Ground Tables [${totalGroundPanels} Panels] + ${totalRoofPanels} Roof Panels)`
    : (isPureGround
        ? `Solar mounting structure (${totalGroundTables} Ground Tables, ${totalGroundPanels} Panels – ${tableKw.toFixed(2)} kWp/table @ ₱6k/kW)`
        : `Roof mounting structure (${d2Quantity} Panels)`);

  const d2Materials: DupaMaterialRow[] = [];

  if (hasGround && totalGroundTables > 0) {
    d2Materials.push({
      id: 'd2_m_ground',
      autoSourceKey: 'd2_ground_table_racking',
      description: `Fixed-Tilt Ground Mount Table Structure & Racking (${groundModulesUp}×${groundModulesWide}, ${tableKw.toFixed(2)} kWp/table, Rammed Posts, Rafters, Purlins & Hardware)`,
      quantity: totalGroundTables,
      unit: 'table',
      unitCostPhp: getMatRate(
        'd2_ground_table_racking',
        `Fixed-Tilt Ground Mount Table Structure & Racking (${groundModulesUp}×${groundModulesWide}, ${tableKw.toFixed(2)} kWp/table, Rammed Posts, Rafters, Purlins & Hardware)`,
        unitCostPerTablePhp
      ),
      amountPhp: 0
    });
  }

  if (hasRoof && (totalRoofPanels > 0 || !hasGround)) {
    d2Materials.push(
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
        unit: 'set',
        unitCostPhp: getMatRate('d2_bolts', 'Stainless Steel Lag Bolts & EPDM Washers', 16000),
        amountPhp: 0
      }
    );
  }

  const d2Labor: DupaLaborRow[] = hasGround
    ? [
        {
          id: 'd2_l1',
          description: 'Foreman / Structural Rigger',
          count: 1,
          days: d2Duration,
          unit: 'pax',
          ratePerDayPhp: getLabRate('Foreman / Structural Rigger', 1000),
          amountPhp: 0
        },
        {
          id: 'd2_l2',
          description: isHybrid ? 'Piling Lead & Roofing Specialist' : 'Piling / Racking Lead Installer',
          count: 2,
          days: d2Duration,
          unit: 'pax',
          ratePerDayPhp: getLabRate('Piling / Racking Lead Installer', 850),
          amountPhp: 0
        },
        {
          id: 'd2_l3',
          description: isHybrid ? 'Solar Racking & Rail Installer' : 'Solar Racking Installer',
          count: 4,
          days: d2Duration,
          unit: 'pax',
          ratePerDayPhp: getLabRate('Solar Racking Installer', 750),
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
      ]
    : [
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
      ];

  const d2Equipment: DupaEquipmentRow[] = [];
  if (hasGround) {
    d2Equipment.push({
      id: 'd2_e1',
      description: 'Hydraulic Post / Pile Ramming Machine Rental',
      count: 1,
      days: Math.max(2, Math.ceil(d2Duration * 0.7)),
      unit: 'unit',
      ratePerDayPhp: getEqRate('Hydraulic Post / Pile Ramming Machine Rental', 6500),
      amountPhp: 0
    });
  }
  if (hasRoof) {
    d2Equipment.push({
      id: 'd2_e_scaff',
      description: 'Scaffolding Rental',
      count: 1,
      days: d2Duration,
      unit: 'set',
      ratePerDayPhp: getEqRate('Scaffolding Rental', 500),
      amountPhp: 0
    });
  }
  d2Equipment.push({
    id: 'd2_e2',
    description: hasGround ? 'Electric Impact Wrench & Torque Tools' : 'Electric Impact Wrench',
    count: 2,
    days: d2Duration,
    unit: 'unit',
    ratePerDayPhp: getEqRate('Electric Impact Wrench & Torque Tools', 250),
    amountPhp: 0
  });

  const d2Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D2',
    category: 'Solar Works',
    description: d2Description,
    durationDays: d2Duration,
    quantity: d2Quantity,
    unit: d2Unit,
    materials: d2Materials,
    labor: d2Labor,
    equipment: d2Equipment,
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
  return d2Item;
}

/** D3: DC Raceways, Cable Trays, Conduits & Fasteners (Roof/Structure Mount) */
export function buildD3Item(ctx: BoqContext): DupaWorkItem {
  const {
    zones, getMatRate, getLabRate, getEqRate, ocmPercent, profitPercent, vatPercent, isHybrid,
    isPureGround, totalStrings, totalIntraStringM, totalDcRacewayM, totalDcRacewayBends
  } = ctx;
  const d3Meters = Math.max(1, Math.round(totalDcRacewayM));
  const d3TrayLengths = Math.max(2, Math.ceil((totalDcRacewayM * 1.05) / 2.44));
  const d3SplicePlates = d3TrayLengths * 2;
  const d3SupportBrackets = Math.max(4, Math.ceil(totalDcRacewayM / 1.5) + 2);
  const d3FastenerSets = (d3TrayLengths * 8) + (d3SupportBrackets * 4);
  const d3TrayBends = Math.max(2, totalDcRacewayBends);
  const d3BondingJumpers = d3TrayLengths;
  const d3FlexConduitM = Math.max(25, Math.ceil(totalIntraStringM > 0 ? totalIntraStringM * 0.35 : zones.length * 15));
  const d3Duration = Math.max(3, Math.ceil(totalDcRacewayM / 12));

  const trayModelDesc = totalStrings <= 8
    ? '100mm × 50mm (4-inch × 2-inch) Perforated Cable Tray w/ Cover (Hot-Dip Galvanized / Aluminum)'
    : '150mm × 100mm (6-inch × 4-inch) Perforated Cable Tray w/ Cover (Hot-Dip Galvanized / Aluminum)';

  const d3Item: DupaWorkItem = recalculateDupaItem({
    itemNo: 'D3',
    category: 'Solar Works',
    description: `DC Raceways, Cable Trays, Conduits & Fasteners (${d3Meters}m Trunk Run)`,
    durationDays: d3Duration,
    quantity: d3Meters,
    unit: 'm',
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
        description: isHybrid
          ? 'Cable Tray Stand-Off Posts / Earth Anchors & Roof Lag Brackets (@ 1.5m)'
          : (isPureGround
              ? 'Cable Tray Stand-Off Support Posts & Concrete/Earth Anchors (@ 1.5m)'
              : 'Cable Tray Roof Stand-Off Support Brackets & Lag Fasteners (@ 1.5m)'),
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
        unit: 'set',
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
        description: isHybrid
          ? 'Cable Tray Rigging, Grounding Tools & Scaffolding Rental'
          : (isPureGround ? 'Portable Cable Tray Rigging & Grounding Tools' : 'Scaffolding / Ladders Rig Rental'),
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
  return d3Item;
}
