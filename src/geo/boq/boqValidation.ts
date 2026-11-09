/**
 * Pre-export sanity checks for a multi-farm BOQ: unit-basis and structure consistency between
 * farms, missing prices, zero quantities and mount-type mismatches. Pure data in, issues out.
 */
import { DupaWorkItem, ProjectBoqState } from '../../types/solar';
import { templateNoOf } from './dupaMath';

export type IssueSeverity = 'error' | 'warning';

export interface BoqIssue {
  severity: IssueSeverity;
  itemNo?: string;
  message: string;
}

type SectionLookup = Map<string, { code: string; name: string; kind?: string }> | undefined;

function farmLabel(item: DupaWorkItem, sections: SectionLookup): string {
  const sec = item.sectionId ? sections?.get(item.sectionId) : undefined;
  return sec ? sec.code : 'Project';
}

export function validateBoq(boq: ProjectBoqState, sections?: SectionLookup): BoqIssue[] {
  const issues: BoqIssue[] = [];
  const add = (severity: IssueSeverity, message: string, itemNo?: string) => issues.push({ severity, itemNo, message });

  for (const it of boq.items) {
    const template = templateNoOf(it);

    // Optional scope that is switched off (lightning protection, "Not Required" transformer) is fine at 0
    const switchedOff = !(it.quantity > 0) && (template === 'D12' || /not required|excluded/i.test(it.description));
    if (switchedOff) continue;

    // Prices
    for (const m of it.materials) {
      if (!(m.unitCostPhp > 0)) add('error', `${it.itemNo}: material "${m.description}" has no unit cost`, it.itemNo);
      if (it.quantity > 0 && !(m.quantity > 0)) add('warning', `${it.itemNo}: material "${m.description}" has zero quantity`, it.itemNo);
    }
    for (const l of it.labor) {
      if (!(l.ratePerDayPhp > 0)) add('warning', `${it.itemNo}: labor "${l.description}" has no day rate`, it.itemNo);
    }
    for (const e of it.equipment) {
      if (!(e.ratePerDayPhp > 0)) add('warning', `${it.itemNo}: equipment "${e.description}" has no day rate`, it.itemNo);
    }

    if (!(it.quantity > 0)) {
      add('error', `${it.itemNo}: "${it.description}" has zero quantity`, it.itemNo);
    }

    // Mount type: ground structure items inside a rooftop (poultry-house) farm
    if (template === 'D2' && it.sectionId && /ground/i.test(it.description) && !/roof/i.test(it.description)) {
      add('warning', `${it.itemNo}: ground-mount structure in a rooftop farm (${farmLabel(it, sections)})`, it.itemNo);
    }
  }

  // Cross-farm consistency, per work-item template
  const byTemplate = new Map<string, DupaWorkItem[]>();
  for (const it of boq.items) {
    if (!it.sectionId) continue;
    const key = templateNoOf(it);
    byTemplate.set(key, [...(byTemplate.get(key) ?? []), it]);
  }
  for (const [template, group] of byTemplate) {
    const units = new Set(group.map(i => i.unit));
    if (units.size > 1) {
      const detail = group.map(i => `${i.itemNo}=${i.unit}`).join(', ');
      add('warning', `${template}: unit basis differs between farms (${detail})`, group[0].itemNo);
    }
  }

  // Same work-item order in every farm (ignoring optional extras such as battery storage)
  const sequences = new Map<string, string>();
  for (const it of boq.items) {
    if (!it.sectionId) continue;
    sequences.set(it.sectionId, (sequences.get(it.sectionId) ?? '') + `${templateNoOf(it)},`);
  }
  const farmSeqs = [...sequences.entries()].filter(([id]) => sections?.get(id)?.kind !== 'interconnection');
  const distinct = new Set(farmSeqs.map(([, seq]) => seq.replace(/E1,/g, '')));
  if (distinct.size > 1) add('warning', 'Work-item order differs between farms');

  return issues;
}

export function summarizeIssues(issues: BoqIssue[]): { errors: number; warnings: number } {
  return {
    errors: issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warning').length
  };
}
