/**
 * Project rate library: one price per material / labor trade / equipment, shared by every work
 * item and farm. Rows are matched by description - the same key the BOQ generator uses to keep
 * edited rates across a re-sync - so a library price survives regeneration.
 */
import { ProjectBoqState } from '../../types/solar';
import { recalculateDupaItem, normalizeDupaQuotes } from './dupaMath';

export type RateKind = 'material' | 'labor' | 'equipment';

export interface RateEntry {
  kind: RateKind;
  description: string;
  unit: string;
  rate: number;       // unit cost (material) or rate per day (labor / equipment); lowest if mixed
  maxRate: number;
  mixed: boolean;     // rows with this description currently carry different prices
  uses: number;       // number of DUPA rows using it
}

export function extractRateLibrary(boq: ProjectBoqState): RateEntry[] {
  const map = new Map<string, RateEntry>();
  const touch = (kind: RateKind, description: string, unit: string, rate: number) => {
    const key = `${kind}|${description}`;
    const e = map.get(key);
    if (!e) {
      map.set(key, { kind, description, unit, rate, maxRate: rate, mixed: false, uses: 1 });
      return;
    }
    e.uses++;
    e.rate = Math.min(e.rate, rate);
    e.maxRate = Math.max(e.maxRate, rate);
    e.mixed = e.rate !== e.maxRate;
  };
  for (const it of boq.items) {
    for (const m of it.materials) touch('material', m.description, m.unit, m.unitCostPhp);
    for (const l of it.labor) touch('labor', l.description, l.unit, l.ratePerDayPhp);
    for (const e of it.equipment) touch('equipment', e.description, e.unit, e.ratePerDayPhp);
  }
  const order: Record<RateKind, number> = { material: 0, labor: 1, equipment: 2 };
  return [...map.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.description.localeCompare(b.description));
}

/** Sets one price on every DUPA row with that description and recalculates the touched items. Returns rows changed. */
export function applyRate(boq: ProjectBoqState, kind: RateKind, description: string, rate: number): number {
  if (!Number.isFinite(rate) || rate < 0) return 0;
  let changed = 0;
  boq.items = boq.items.map(it => {
    let touched = false;
    const next = { ...it };
    if (kind === 'material') {
      next.materials = it.materials.map(m => {
        if (m.description !== description || m.unitCostPhp === rate) return m;
        touched = true; changed++;
        return { ...m, unitCostPhp: rate };
      });
    } else if (kind === 'labor') {
      next.labor = it.labor.map(l => {
        if (l.description !== description || l.ratePerDayPhp === rate) return l;
        touched = true; changed++;
        return { ...l, ratePerDayPhp: rate };
      });
    } else {
      next.equipment = it.equipment.map(e => {
        if (e.description !== description || e.ratePerDayPhp === rate) return e;
        touched = true; changed++;
        return { ...e, ratePerDayPhp: rate };
      });
    }
    return touched ? recalculateDupaItem(next) : it;
  });
  return changed;
}

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export function rateLibraryToCsv(entries: RateEntry[]): string {
  const rows = [['Kind', 'Description', 'Unit', 'Rate_PHP']];
  for (const e of entries) rows.push([e.kind, e.description, e.unit, String(e.rate)]);
  return rows.map(r => r.map(csvCell).join(',')).join('\n');
}

/** Minimal CSV parser (quoted cells, doubled quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(x => x !== '')) rows.push(row);
  return rows;
}

/** Applies a CSV produced by rateLibraryToCsv. Returns how many library entries matched. */
export function importRateCsv(boq: ProjectBoqState, csv: string): { applied: number; skipped: number } {
  const rows = parseCsv(csv);
  let applied = 0;
  let skipped = 0;
  for (const [i, r] of rows.entries()) {
    if (i === 0 && /^kind$/i.test(r[0] ?? '')) continue;
    const kind = (r[0] ?? '').toLowerCase() as RateKind;
    const rate = parseFloat(r[3] ?? '');
    if (!['material', 'labor', 'equipment'].includes(kind) || !Number.isFinite(rate) || rate < 0) { skipped++; continue; }
    const desc = r[1] ?? '';
    // Descriptions are stored with normalized quotes; accept either spelling
    const changed = applyRate(boq, kind, desc, rate) + (normalizeDupaQuotes(desc) !== desc ? applyRate(boq, kind, normalizeDupaQuotes(desc), rate) : 0);
    if (changed > 0) applied++; else skipped++;
  }
  return { applied, skipped };
}
