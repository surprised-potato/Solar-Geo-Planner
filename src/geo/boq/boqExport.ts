/**
 * CSV exports for the BOQ / DUPA sheet and the costed bill of materials.
 */
import { ProjectBoqState } from '../../types/solar';
import { getBoqProjectTotal, getBoqSectionTotals, normalizeDupaQuotes, templateNoOf } from './dupaMath';

function formatCsvCell(val: string | number | undefined | null): string {
  if (val == null) return '';
  const s = normalizeDupaQuotes(String(val));
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Exports both BOQ Schedule and DUPA Breakdown in CSV format
 */
export function exportBoqAndDupaCsv(
  projectName: string,
  boq: ProjectBoqState,
  sections?: Map<string, { code: string; name: string }>
): string {
  const exportDate = new Date().toLocaleDateString('en-US');
  const totals = getBoqProjectTotal(boq);

  const lines: string[] = [];

  // 1. BILL OF QUANTITIES (BOQ)
  lines.push('BILL OF QUANTITIES (BOQ),,,,,,');
  lines.push(`Project: ${formatCsvCell(projectName)},,,,,,`);
  lines.push(`Export Date: ${exportDate},,,,,,`);
  lines.push(',,,,,,');
  lines.push('Item No.,Category,Work Description,Quantity,Unit,Unit Cost (PHP),Total Cost (PHP)');
  lines.push('Solar Works,,,,,,');

  const hasSections = boq.items.some(i => i.sectionId);
  for (const group of getBoqSectionTotals(boq)) {
    const sec = group.sectionId ? sections?.get(group.sectionId) : undefined;
    if (hasSections) lines.push(`${formatCsvCell(sec ? `${sec.code} - ${sec.name}` : 'Other Systems')},,,,,,`);
    for (const it of group.items) {
      lines.push(`${it.itemNo},${formatCsvCell(it.category)},${formatCsvCell(it.description)},${it.quantity},${formatCsvCell(it.unit)},${it.unitCostPerItemPhp},${it.totalItemCostPhp}`);
    }
    if (hasSections) lines.push(`,,Subtotal${sec ? ` (${formatCsvCell(sec.code)})` : ''},,,,${group.total}`);
  }

  lines.push(`,,Subtotal (Solar Works),,,,${totals.subtotalSolarWorks}`);
  lines.push(`GRAND TOTAL PROJECT ESTIMATE,,,,,,${totals.grandTotal}`);

  // 2. DETAILED UNIT PRICE ANALYSIS (DUPA) FOR EACH ITEM
  for (const it of boq.items) {
    lines.push(',,,,,');
    lines.push('DETAILED UNIT PRICE ANALYSIS (DUPA),,,,,');
    lines.push(',,,,,');
    lines.push(`Item No.,${it.itemNo},Duration,${it.durationDays} days,,`);
    lines.push(`Category,${formatCsvCell(it.category)},Quantity,${it.quantity},,`);
    lines.push(`Description,${formatCsvCell(it.description)},Unit,${formatCsvCell(it.unit)},,`);
    lines.push(',,,,,');

    // A. MATERIALS
    lines.push('A. MATERIALS,,,,,');
    lines.push('Description,Quantity,Unit,Unit Cost (PHP),Amount (PHP),');
    for (const m of it.materials) {
      lines.push(`${formatCsvCell(m.description)},${m.quantity},${formatCsvCell(m.unit)},${m.unitCostPhp},${m.amountPhp},`);
    }
    lines.push(`Total Materials (A),,,,${it.totalMaterialsPhp},`);
    lines.push(',,,,,');

    // B. LABOR
    lines.push('B. LABOR,,,,,');
    lines.push('Description,No.,Days,Unit,Rate/Day (PHP),Amount (PHP)');
    for (const l of it.labor) {
      lines.push(`${formatCsvCell(l.description)},${l.count},${l.days},${formatCsvCell(l.unit)},${l.ratePerDayPhp},${l.amountPhp}`);
    }
    lines.push(`Total Labor (B),,,,,${it.totalLaborPhp}`);
    lines.push(',,,,,');

    // C. EQUIPMENT
    lines.push('C. EQUIPMENT,,,,,');
    lines.push('Description,No.,Days,Unit,Rate/Day (PHP),Amount (PHP)');
    for (const e of it.equipment) {
      lines.push(`${formatCsvCell(e.description)},${e.count},${e.days},${formatCsvCell(e.unit)},${e.ratePerDayPhp},${e.amountPhp}`);
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
    D1: 'Logistics, Safety & Preliminaries',
    D2: 'Mounting Structure & Racking',
    D3: 'DC Raceways, Cable Trays & Fasteners',
    D4: 'PV Modules',
    D5: 'DC String Cabling & Connectors',
    D6: 'DC Protections & Combiners',
    D7: 'String Inverters & Comms',
    D8: 'AC Combiner Panels & Collector Switchgear',
    D9: 'Power Transformer Station',
    D10: 'Main Distribution Panel & Switchgear',
    D11: 'AC Feeder Cables & Conduits',
    D12: 'Grounding & Lightning Protection',
    D13: 'Testing, Labelling & Handover',
    E1: 'Battery Energy Storage',
    I1: 'Primary Line & Interconnection Hardware',
    I2: 'Switching Station & Revenue Metering'
  };

  for (const dupa of boq.items) {
    for (const mat of dupa.materials) {
      result.push({
        id: mat.id || `bom_${seq}`,
        itemNo: `M${String(seq).padStart(2, '0')}`,
        dupaItemNo: dupa.itemNo,
        dupaWorkDescription: dupa.description,
        category: categoryMap[templateNoOf(dupa)] || 'General Materials',
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
    const desc = formatCsvCell(it.description);
    const cat = formatCsvCell(it.category);
    const src = formatCsvCell(`${it.dupaItemNo} - ${it.dupaWorkDescription}`);
    lines.push(`${it.itemNo},${cat},${desc},${src},${it.quantity},${formatCsvCell(it.unit)},${it.unitCostPhp},${it.amountPhp}`);
  }

  lines.push(',,,,,,,');
  lines.push(`,,,TOTAL MATERIAL COST (A),,,,${totalAmount}`);
  return lines.join('\n');
}
