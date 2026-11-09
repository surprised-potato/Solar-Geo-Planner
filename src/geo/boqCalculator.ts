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

import { DupaWorkItem, ProjectBoqState } from '../types/solar';
import { ProjectStore } from '../store/projectStore';
import { buildBoqContext } from './boq/boqContext';
import { buildD1Item, buildD2Item, buildD3Item } from './boq/items/siteAndStructure';
import { buildD4Item, buildD5Item, buildD6Item } from './boq/items/dcSystem';
import { buildD7Item, buildD8Item, buildD9Item, buildD10Item } from './boq/items/inverterAndAc';
import { buildD11Item, buildD12Item, buildD13Item } from './boq/items/feedersGroundingTesting';
export {
  DEFAULT_OCM_PERCENT,
  DEFAULT_PROFIT_PERCENT,
  DEFAULT_VAT_PERCENT,
  normalizeDupaQuotes,
  recalculateDupaItem,
  getBoqProjectTotal
} from './boq/dupaMath';
export { exportBoqAndDupaCsv, extractCostedBom, exportCostedBomCsv } from './boq/boqExport';
export type { CostedBomItem } from './boq/boqExport';

/**
 * Extracts Quantities and Technical Specifications from Spatial CAD Registry & PEC SLD
 */
export function generateBoqFromRegistryAndSld(
  store: ProjectStore,
  systemId?: string,
  existingBoq?: ProjectBoqState
): ProjectBoqState {
  const ctx = buildBoqContext(store, systemId, existingBoq);

  // DUPA work items D1 through D13
  const items: DupaWorkItem[] = [
    buildD1Item(ctx),
    buildD2Item(ctx),
    buildD3Item(ctx),
    buildD4Item(ctx),
    buildD5Item(ctx),
    buildD6Item(ctx),
    buildD7Item(ctx),
    buildD8Item(ctx),
    buildD9Item(ctx),
    buildD10Item(ctx),
    buildD11Item(ctx),
    buildD12Item(ctx),
    buildD13Item(ctx)
  ];

  return {
    ocmPercent: ctx.ocmPercent,
    profitPercent: ctx.profitPercent,
    vatPercent: ctx.vatPercent,
    items,
    lastSyncedAt: new Date().toISOString(),
    includeLightningProtection: ctx.includeLightning
  };
}
