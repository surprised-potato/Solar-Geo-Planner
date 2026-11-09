/**
 * Bill of quantities / DUPA state for ProjectStore.
 */
import { ProjectBoqState, DupaWorkItem } from '../types/solar';
import { generateBoqFromRegistryAndSld, recalculateDupaItem } from '../geo/boqCalculator';
import type { ProjectStore } from './projectStore';

export function getBoqState(this: ProjectStore, systemId?: string, forceRegenerate: boolean = false): ProjectBoqState {
  let needsRefresh = !this.boqState || forceRegenerate;
  if (!needsRefresh && this.boqState) {
    // Auto-reconcile if CAD has ground tables that are missing in saved BOQ
    const groundTablesInCad = this.getZones().reduce((acc, z) => {
      if (z.config?.mountType === 'ground') {
        return acc + (z.tableCount ?? (z.tables ? z.tables.length : 0));
      }
      return acc;
    }, 0);
    const d2 = this.boqState.items?.find(it => it.itemNo === 'D2');
    const hasTableInD2 = d2?.materials?.some(
      m => m.autoSourceKey === 'd2_ground_table_racking' || m.description.toLowerCase().includes('table')
    );
    if (groundTablesInCad > 0 && !hasTableInD2) {
      needsRefresh = true;
    }
  }
  if (needsRefresh || !this.boqState) {
    this.boqState = generateBoqFromRegistryAndSld(this, systemId, this.boqState || undefined);
  }
  return this.boqState;
}

export function syncBoqFromCad(this: ProjectStore, systemId?: string, resetRates: boolean = false): ProjectBoqState {
  this.boqState = generateBoqFromRegistryAndSld(
    this,
    systemId,
    resetRates ? undefined : (this.boqState || undefined)
  );
  this.notify();
  return this.boqState;
}

export function updateBoqMarkups(this: ProjectStore, ocmPercent: number, profitPercent: number, vatPercent: number): void {
  const boq = this.getBoqState();
  boq.ocmPercent = Math.max(0, ocmPercent);
  boq.profitPercent = Math.max(0, profitPercent);
  boq.vatPercent = Math.max(0, vatPercent);
  for (let i = 0; i < boq.items.length; i++) {
    boq.items[i].ocmPercent = boq.ocmPercent;
    boq.items[i].profitPercent = boq.profitPercent;
    boq.items[i].vatPercent = boq.vatPercent;
    boq.items[i] = recalculateDupaItem(boq.items[i]);
  }
  this.notify();
}

export function updateDupaWorkItem(this: ProjectStore, itemNo: string, updater: (item: DupaWorkItem) => DupaWorkItem): void {
  const boq = this.getBoqState();
  const idx = boq.items.findIndex(it => it.itemNo === itemNo);
  if (idx >= 0) {
    const updated = updater({ ...boq.items[idx] });
    boq.items[idx] = recalculateDupaItem(updated);
    this.notify();
  }
}

export function toggleLightningProtection(this: ProjectStore, include?: boolean): void {
  const boq = this.getBoqState();
  const current = boq.includeLightningProtection === true;
  const target = include !== undefined ? include : !current;
  boq.includeLightningProtection = target;
  // Re-generate BOQ preserving user rates and markups
  this.boqState = generateBoqFromRegistryAndSld(this, undefined, boq);
  this.notify();
}
