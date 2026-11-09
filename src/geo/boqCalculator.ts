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
import { buildBessItem, buildPrimaryLineItem, buildSwitchingItem } from './boq/items/equipmentAndInterconnection';
import { buildD11Item, buildD12Item, buildD13Item } from './boq/items/feedersGroundingTesting';
export {
  DEFAULT_OCM_PERCENT,
  DEFAULT_PROFIT_PERCENT,
  DEFAULT_VAT_PERCENT,
  normalizeDupaQuotes,
  recalculateDupaItem,
  getBoqProjectTotal,
  getBoqSectionTotals,
  templateNoOf
} from './boq/dupaMath';
export { exportBoqAndDupaCsv, extractCostedBom, exportCostedBomCsv } from './boq/boqExport';
export type { CostedBomItem } from './boq/boqExport';

type ItemBuilder = (ctx: ReturnType<typeof buildBoqContext>) => DupaWorkItem;

const ITEM_BUILDERS: ItemBuilder[] = [
  buildD1Item, buildD2Item, buildD3Item, buildD4Item, buildD5Item, buildD6Item, buildD7Item,
  buildD8Item, buildD9Item, buildD10Item, buildD11Item, buildD12Item, buildD13Item
];

/**
 * Extracts Quantities and Technical Specifications from Spatial CAD Registry & PEC SLD.
 *
 * Without farm sections this yields the classic flat D1-D13 list. When the project has farm
 * sections (poultry-house farms A, B, ...) each farm gets its own D1-D13 set numbered
 * '<code>1'..'<code>13', and any systems outside every farm keep the plain D-numbers.
 */
export function generateBoqFromRegistryAndSld(
  store: ProjectStore,
  systemId?: string,
  existingBoq?: ProjectBoqState
): ProjectBoqState {
  const isAll = !systemId || systemId === 'all';
  const farms = [...store.sections.values()].filter(s => s.kind === 'farm');
  const items: DupaWorkItem[] = [];
  let ctxForMarkups: ReturnType<typeof buildBoqContext> | undefined;

  const claimed = new Set<string>();
  for (const farm of farms) {
    // A system is billed to the first farm that claims it, never twice
    const ids = farm.systemIds.filter(id => store.systems.has(id) && !claimed.has(id) && (isAll || id === systemId));
    ids.forEach(id => claimed.add(id));
    if (ids.length === 0) continue;
    const ctx = buildBoqContext(store, ids, existingBoq);
    if (ctx.zones.length === 0) continue;
    ctxForMarkups = ctxForMarkups ?? ctx;
    ITEM_BUILDERS.forEach((build, i) => {
      const item = build(ctx);
      items.push({
        ...item,
        itemNo: `${farm.code}${i + 1}`,
        templateNo: item.itemNo,
        sectionId: farm.id,
        category: farm.name
      });
    });
    // Farm battery storage follows the farm's D-items (A14, B14, ...)
    if (farm.bess && farm.bess.capacityMwh > 0) {
      const bessItem = buildBessItem(ctx, farm.bess);
      items.push({
        ...bessItem,
        itemNo: `${farm.code}${ITEM_BUILDERS.length + 1}`,
        templateNo: bessItem.itemNo,
        sectionId: farm.id,
        category: farm.name
      });
    }
  }

  if (farms.length === 0) {
    const ctx = buildBoqContext(store, systemId, existingBoq);
    ctxForMarkups = ctx;
    items.push(...ITEM_BUILDERS.map(build => build(ctx)));
  } else {
    // Systems that are not part of any farm keep the plain D1-D13 numbering
    const leftover = store.getSystems().filter(
      s => !claimed.has(s.id) && (isAll || s.id === systemId) && s.zoneIds.length > 0
    );
    if (leftover.length > 0 || items.length === 0) {
      const ctx = buildBoqContext(store, leftover.length > 0 ? leftover.map(s => s.id) : systemId, existingBoq);
      ctxForMarkups = ctxForMarkups ?? ctx;
      items.push(...ITEM_BUILDERS.map(build => build(ctx)));
    }
  }

  // Interconnection package (primary line + switching / metering), billed once for the project
  if (isAll) {
    for (const sec of store.sections.values()) {
      if (sec.kind !== 'interconnection' || !sec.interconnection) continue;
      const cfg = sec.interconnection;
      ctxForMarkups = ctxForMarkups ?? buildBoqContext(store, undefined, existingBoq);
      const built: DupaWorkItem[] = [];
      if (cfg.lineLengthKm > 0) built.push(buildPrimaryLineItem(ctxForMarkups, cfg));
      built.push(buildSwitchingItem(ctxForMarkups, cfg));
      built.forEach((item, i) => {
        items.push({
          ...item,
          itemNo: `${sec.code}${i + 1}`,
          templateNo: item.itemNo,
          sectionId: sec.id,
          category: sec.name
        });
      });
    }
  }

  const ctx = ctxForMarkups!;
  return {
    ocmPercent: ctx.ocmPercent,
    profitPercent: ctx.profitPercent,
    vatPercent: ctx.vatPercent,
    items,
    lastSyncedAt: new Date().toISOString(),
    includeLightningProtection: ctx.includeLightning
  };
}
