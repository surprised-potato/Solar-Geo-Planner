/**
 * DUPA (Detailed Unit Price Analysis) markup defaults, per-item recalculation and project totals.
 */
import { DupaWorkItem, ProjectBoqState } from '../../types/solar';

export const DEFAULT_OCM_PERCENT = 10.0;

export const DEFAULT_PROFIT_PERCENT = 8.0;

export const DEFAULT_VAT_PERCENT = 6.0;

/**
 * Normalizes inch symbols and quotation marks in DUPA strings so they don't break HTML attributes or get truncated.
 * Converts inch patterns like 4" x 2", 8", 5/8" to "4-inch x 2-inch", "8-inch", "5/8-inch"
 * and normalizes any remaining double quotes to single quotes.
 */
export function normalizeDupaQuotes(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    // Multi-dimension inch pattern e.g. 4" × 2" or 4" x 2" -> 4-inch × 2-inch
    .replace(/(\d+(?:\/\d+)?(?:\.\d+)?)\s*["”″]\s*([×xX*])\s*(\d+(?:\/\d+)?(?:\.\d+)?)\s*["”″]?/g, '$1-inch $2 $3-inch')
    // Dimension with single unit e.g. 8", 5/8", 1-1/2", 2.5", 2" -> 8-inch, 5/8-inch, etc.
    .replace(/(\d+-\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*["”″](?!\w)/g, '$1-inch')
    // Any remaining double quotes replaced by single quote to prevent HTML attribute truncation
    .replace(/["”″]/g, "'");
}

/**
 * Standard DPWH / Solar EPC Unit Price Recalculation
 */
export function recalculateDupaItem(item: DupaWorkItem): DupaWorkItem {
  // 0. Validate and normalize all descriptions and units
  const normalizedDesc = normalizeDupaQuotes(item.description);
  const normalizedUnit = normalizeDupaQuotes(item.unit);
  const materials = item.materials.map(m => ({
    ...m,
    description: normalizeDupaQuotes(m.description),
    unit: normalizeDupaQuotes(m.unit)
  }));
  const labor = item.labor.map(l => ({
    ...l,
    description: normalizeDupaQuotes(l.description),
    unit: normalizeDupaQuotes(l.unit)
  }));
  const equipment = item.equipment.map(e => ({
    ...e,
    description: normalizeDupaQuotes(e.description),
    unit: normalizeDupaQuotes(e.unit)
  }));

  // 1. Recalculate Material amounts
  let totalMaterialsPhp = 0;
  for (const m of materials) {
    m.amountPhp = Number((m.quantity * m.unitCostPhp).toFixed(2));
    totalMaterialsPhp += m.amountPhp;
  }
  totalMaterialsPhp = Number(totalMaterialsPhp.toFixed(2));

  // 2. Recalculate Labor amounts
  let totalLaborPhp = 0;
  for (const l of labor) {
    l.amountPhp = Number((l.count * l.days * l.ratePerDayPhp).toFixed(2));
    totalLaborPhp += l.amountPhp;
  }
  totalLaborPhp = Number(totalLaborPhp.toFixed(2));

  // 3. Recalculate Equipment amounts
  let totalEquipmentPhp = 0;
  for (const e of equipment) {
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
    description: normalizedDesc,
    unit: normalizedUnit,
    materials,
    labor,
    equipment,
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
