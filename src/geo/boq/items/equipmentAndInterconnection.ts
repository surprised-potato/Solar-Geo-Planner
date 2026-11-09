/**
 * Utility-scale equipment and interconnection work items.
 *
 *  E1  Battery energy storage system (per farm)
 *  I1  Primary line upgrade (13.2 kV overhead line)
 *  I2  Main switching station, protection & revenue metering
 *
 * Default rates and crews follow the Twin Taurus reference estimate; every rate is editable in the
 * DUPA sheet and survives a re-sync (they are looked up by description).
 */
import { BessConfig, DupaWorkItem, InterconnectionConfig } from '../../../types/solar';
import { recalculateDupaItem, unpricedTotals } from '../dupaMath';
import type { BoqContext } from '../boqContext';

/** E1: Battery Energy Storage System */
export function buildBessItem(ctx: BoqContext, bess: BessConfig): DupaWorkItem {
  const { getMatRate, getLabRate, getEqRate, ocmPercent, profitPercent, vatPercent } = ctx;
  const mwh = bess.capacityMwh;
  const duration = Math.max(10, Math.ceil(15 + 5 * mwh));
  const batteryDesc = `${bess.chemistry} Battery System, Containerized (${bess.powerMw} MW PCS-coupled)`;
  const bmsDesc = 'BESS Integrated BMS and Thermal Management System';
  const fireDesc = 'Fire Suppression and Safety Interlocks';
  const dcDesc = 'Battery DC Cabling, Busbars and Protections';

  return recalculateDupaItem({
    itemNo: 'E1',
    category: 'Solar Works',
    description: `Battery Energy Storage System (${mwh} MWh / ${bess.powerMw} MW, ${bess.chemistry})`,
    durationDays: duration,
    quantity: mwh,
    unit: 'MWh',
    materials: [
      { id: 'e1_m1', autoSourceKey: 'e1_battery', description: batteryDesc, quantity: mwh, unit: 'MWh',
        unitCostPhp: getMatRate('e1_battery', batteryDesc, 8372000), amountPhp: 0 },
      { id: 'e1_m2', autoSourceKey: 'e1_bms', description: bmsDesc, quantity: mwh, unit: 'MWh',
        unitCostPhp: getMatRate('e1_bms', bmsDesc, 1250000), amountPhp: 0 },
      { id: 'e1_m3', autoSourceKey: 'e1_fire', description: fireDesc, quantity: mwh, unit: 'MWh',
        unitCostPhp: getMatRate('e1_fire', fireDesc, 450000), amountPhp: 0 },
      { id: 'e1_m4', autoSourceKey: 'e1_dc', description: dcDesc, quantity: 1, unit: 'lot',
        unitCostPhp: getMatRate('e1_dc', dcDesc, 950000), amountPhp: 0 }
    ],
    labor: [
      { id: 'e1_l1', description: 'BESS Commissioning Specialist', count: 1, days: Math.ceil(duration / 2), unit: 'pax',
        ratePerDayPhp: getLabRate('BESS Commissioning Specialist', 5000), amountPhp: 0 },
      { id: 'e1_l2', description: 'Battery Technician', count: 4, days: duration, unit: 'pax',
        ratePerDayPhp: getLabRate('Battery Technician', 1200), amountPhp: 0 },
      { id: 'e1_l3', description: 'Helper', count: 6, days: duration, unit: 'pax',
        ratePerDayPhp: getLabRate('Helper', 500), amountPhp: 0 }
    ],
    equipment: [
      { id: 'e1_e1', description: 'Forklift / Heavy Lift Equipment (Battery Loading)', count: 1, days: 5, unit: 'day',
        ratePerDayPhp: getEqRate('Forklift / Heavy Lift Equipment (Battery Loading)', 8000), amountPhp: 0 },
      { id: 'e1_e2', description: 'Thermal Imaging Camera and Testing Tools', count: 1, days: Math.ceil(duration / 2), unit: 'day',
        ratePerDayPhp: getEqRate('Thermal Imaging Camera and Testing Tools', 1500), amountPhp: 0 }
    ],
    ...unpricedTotals(ocmPercent, profitPercent, vatPercent)
  });
}

/** Pole count for a line of the given length (one pole at each end, then every span). */
export function poleCount(lengthKm: number, spanM: number): number {
  if (lengthKm <= 0) return 0;
  return Math.ceil((lengthKm * 1000) / Math.max(10, spanM)) + 1;
}

/** I1: Primary line upgrading on existing poles */
export function buildPrimaryLineItem(ctx: BoqContext, cfg: InterconnectionConfig): DupaWorkItem {
  const { getMatRate, getLabRate, getEqRate, ocmPercent, profitPercent, vatPercent } = ctx;
  const km = cfg.lineLengthKm;
  const poles = poleCount(km, cfg.poleSpanM);
  const conductorM = Math.ceil(km * 1000 * 3 * 1.1); // 3 phases + 10% sag / slack
  const duration = Math.max(5, Math.ceil(km * 15));
  const crew = Math.max(1, Math.ceil(km / 4));

  const conductorDesc = '336.4 MCM ACSR Conductor (Linnet)';
  const insulatorDesc = '15kV Pin-Type and Suspension Insulators';
  const crossarmDesc = '10-ft Steel Cross-arms with Braces and Hardware';
  const hardwareDesc = 'Pre-formed Dead-ends and Line Hardware';

  return recalculateDupaItem({
    itemNo: 'I1',
    category: 'Interconnection',
    description: `Primary Line Upgrading (Existing 45ft Poles, ${poles} poles, ${cfg.voltageKv}kV, 336.4 MCM ACSR)`,
    durationDays: duration,
    quantity: km,
    unit: 'km',
    materials: [
      { id: 'i1_m1', autoSourceKey: 'i1_conductor', description: conductorDesc, quantity: conductorM, unit: 'meter',
        unitCostPhp: getMatRate('i1_conductor', conductorDesc, 165), amountPhp: 0 },
      { id: 'i1_m2', autoSourceKey: 'i1_insulators', description: insulatorDesc, quantity: poles * 2, unit: 'set',
        unitCostPhp: getMatRate('i1_insulators', insulatorDesc, 4500), amountPhp: 0 },
      { id: 'i1_m3', autoSourceKey: 'i1_crossarms', description: crossarmDesc, quantity: poles, unit: 'set',
        unitCostPhp: getMatRate('i1_crossarms', crossarmDesc, 8500), amountPhp: 0 },
      { id: 'i1_m4', autoSourceKey: 'i1_hardware', description: hardwareDesc, quantity: 1, unit: 'lot',
        unitCostPhp: getMatRate('i1_hardware', hardwareDesc, 450000), amountPhp: 0 }
    ],
    labor: [
      { id: 'i1_l1', description: 'Transmission/Distribution Engineer', count: 1, days: duration, unit: 'pax',
        ratePerDayPhp: getLabRate('Transmission/Distribution Engineer', 3500), amountPhp: 0 },
      { id: 'i1_l2', description: 'Lineman Crew (Removal of Existing Wires/Hardware)', count: 2, days: Math.ceil(duration / 3), unit: 'crew',
        ratePerDayPhp: getLabRate('Lineman Crew (Removal of Existing Wires/Hardware)', 7200), amountPhp: 0 },
      { id: 'i1_l3', description: 'Lineman Crew (Installation of New 336.4 MCM Wire/Hardware)', count: 2, days: Math.ceil((duration * 2) / 3), unit: 'crew',
        ratePerDayPhp: getLabRate('Lineman Crew (Installation of New 336.4 MCM Wire/Hardware)', 8500), amountPhp: 0 },
      { id: 'i1_l4', description: 'Helper (Ground Support)', count: 10 * crew, days: duration, unit: 'pax',
        ratePerDayPhp: getLabRate('Helper (Ground Support)', 500), amountPhp: 0 }
    ],
    equipment: [
      { id: 'i1_e1', description: 'Bucket Truck (Extended Reach for 45ft Poles)', count: 2, days: duration, unit: 'day',
        ratePerDayPhp: getEqRate('Bucket Truck (Extended Reach for 45ft Poles)', 12500), amountPhp: 0 },
      { id: 'i1_e2', description: 'Tensioner and Puller Set (Heavy Wire)', count: 1, days: Math.ceil((duration * 2) / 3), unit: 'day',
        ratePerDayPhp: getEqRate('Tensioner and Puller Set (Heavy Wire)', 9500), amountPhp: 0 },
      { id: 'i1_e3', description: 'Service Utility Vehicle', count: 1, days: duration, unit: 'day',
        ratePerDayPhp: getEqRate('Service Utility Vehicle', 2500), amountPhp: 0 }
    ],
    ...unpricedTotals(ocmPercent, profitPercent, vatPercent)
  });
}

/** I2: Main switching station (MV switchgear, protection), DC control power and revenue metering */
export function buildSwitchingItem(ctx: BoqContext, cfg: InterconnectionConfig): DupaWorkItem {
  const { getMatRate, getLabRate, getEqRate, ocmPercent, profitPercent, vatPercent } = ctx;
  const duration = 20;
  const switchgearDesc = `${cfg.voltageKv}kV Main Switching Station (VCB, Disconnect Switches, Protection Relays, CT/PT)`;
  const controlDesc = 'DC Control Power System (110VDC Battery Bank and Charger)';
  const meterDesc = 'Revenue-Grade Power Quality Metering System (CT/PT, Meter, Comms)';

  return recalculateDupaItem({
    itemNo: 'I2',
    category: 'Interconnection',
    description: `Main Switching Station, Protection & Revenue Metering (${cfg.voltageKv}kV)`,
    durationDays: duration,
    quantity: 1,
    unit: 'lot',
    materials: [
      { id: 'i2_m1', autoSourceKey: 'i2_switchgear', description: switchgearDesc, quantity: 1, unit: 'lot',
        unitCostPhp: getMatRate('i2_switchgear', switchgearDesc, 1500000), amountPhp: 0 },
      { id: 'i2_m2', autoSourceKey: 'i2_control_power', description: controlDesc, quantity: 1, unit: 'lot',
        unitCostPhp: getMatRate('i2_control_power', controlDesc, 450000), amountPhp: 0 },
      { id: 'i2_m3', autoSourceKey: 'i2_metering', description: meterDesc, quantity: 1, unit: 'set',
        unitCostPhp: getMatRate('i2_metering', meterDesc, 320000), amountPhp: 0 }
    ],
    labor: [
      { id: 'i2_l1', description: 'Substation Specialist', count: 1, days: 15, unit: 'pax',
        ratePerDayPhp: getLabRate('Substation Specialist', 5000), amountPhp: 0 },
      { id: 'i2_l2', description: 'Senior Master Electrician', count: 2, days: duration, unit: 'pax',
        ratePerDayPhp: getLabRate('Senior Master Electrician', 1500), amountPhp: 0 },
      { id: 'i2_l3', description: 'Electrical Engineer (Testing & Commissioning)', count: 1, days: 10, unit: 'pax',
        ratePerDayPhp: getLabRate('Electrical Engineer (Testing & Commissioning)', 2500), amountPhp: 0 },
      { id: 'i2_l4', description: 'Helper', count: 4, days: duration, unit: 'pax',
        ratePerDayPhp: getLabRate('Helper', 500), amountPhp: 0 }
    ],
    equipment: [
      { id: 'i2_e1', description: 'Boom Truck / Crane (Switchgear Placement)', count: 1, days: 3, unit: 'day',
        ratePerDayPhp: getEqRate('Boom Truck / Crane (Switchgear Placement)', 15000), amountPhp: 0 },
      { id: 'i2_e2', description: 'Relay Test Set and Power Quality Analyzer', count: 1, days: 8, unit: 'day',
        ratePerDayPhp: getEqRate('Relay Test Set and Power Quality Analyzer', 4000), amountPhp: 0 }
    ],
    ...unpricedTotals(ocmPercent, profitPercent, vatPercent)
  });
}
