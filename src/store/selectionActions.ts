/**
 * Selection state (arrays, panels, keep-outs, match-props mode) for ProjectStore.
 */
import { ArrayZone } from '../types/solar';
import type { ProjectStore } from './projectStore';

export function setMatchPropsMode(this: ProjectStore, enabled: boolean, sourceZoneId?: string | null): void {
  if (enabled) {
    this.matchPropsSourceZoneId = sourceZoneId || this.selectedZoneId || (this.zones.size > 0 ? this.zones.keys().next().value ?? null : null);
    this.drawingMode = 'match_props';
  } else {
    this.matchPropsSourceZoneId = null;
    this.drawingMode = 'none';
  }
  this.notify();
}

export function toggleXRayMode(this: ProjectStore): void {
  const nextState = !this.viewFilter.xRayMode;
  this.viewFilter.xRayMode = nextState;
  if (nextState) {
    this.viewFilter.panelVisibility = 'hidden';
    this.viewFilter.showArrayFill = false;
  } else {
    this.viewFilter.panelVisibility = 'full';
    this.viewFilter.showArrayFill = true;
  }
  this.notify();
}

export function selectKeepOut(this: ProjectStore, keepOutId: string | null): void {
  this.selectedKeepOutId = keepOutId;
  this.notify();
}

export function getSelectedZones(this: ProjectStore): ArrayZone[] {
  if (this.selectedPanelId !== null) return [];
  const list: ArrayZone[] = [];
  for (const id of this.selectedZoneIds) {
    const z = this.zones.get(id);
    if (z) list.push(z);
  }
  if (list.length === 0 && this.selectedZoneId) {
    const z = this.zones.get(this.selectedZoneId);
    if (z) list.push(z);
  }
  return list;
}

export function getSelectedZoneIds(this: ProjectStore): string[] {
  if (this.selectedPanelId !== null) return [];
  if (this.selectedZoneIds.size > 0) {
    return Array.from(this.selectedZoneIds);
  }
  return this.selectedZoneId ? [this.selectedZoneId] : [];
}

export function selectZone(this: ProjectStore, zoneId: string | null, isMulti: boolean = false): void {
  if (zoneId === null) {
    this.selectedZoneId = null;
    this.selectedZoneIds.clear();
    this.selectedPanelId = null;
    this.notify();
    return;
  }

  if (isMulti) {
    if (this.selectedZoneId && !this.selectedZoneIds.has(this.selectedZoneId)) {
      this.selectedZoneIds.add(this.selectedZoneId);
    }
    if (this.selectedZoneIds.has(zoneId)) {
      this.selectedZoneIds.delete(zoneId);
      if (this.selectedZoneId === zoneId) {
        this.selectedZoneId = this.selectedZoneIds.values().next().value ?? null;
      }
    } else {
      this.selectedZoneIds.add(zoneId);
      this.selectedZoneId = zoneId;
    }
  } else {
    this.selectedZoneIds.clear();
    this.selectedZoneIds.add(zoneId);
    this.selectedZoneId = zoneId;
  }

  this.selectedPanelId = null;
  const z = this.zones.get(zoneId);
  if (z) {
    this.selectedSystemId = z.systemId;
  }
  this.notify();
}

export function selectAllZones(this: ProjectStore): void {
  this.selectedZoneIds.clear();
  for (const z of this.zones.values()) {
    this.selectedZoneIds.add(z.id);
  }
  this.selectedZoneId = this.selectedZoneIds.values().next().value ?? null;
  this.selectedPanelId = null;
  this.notify();
}

export function clearZoneSelection(this: ProjectStore): void {
  this.selectedZoneId = null;
  this.selectedZoneIds.clear();
  this.selectedPanelId = null;
  this.notify();
}

export function selectPanel(this: ProjectStore, panelId: string | null): void {
  this.selectedPanelId = panelId;
  if (panelId) {
    const p = this.panels.get(panelId);
    if (p) {
      this.selectedSystemId = p.systemId;
    }
    this.selectedZoneId = null;
    this.selectedZoneIds.clear();
  }
  this.notify();
}

export function deleteSelected(this: ProjectStore): 'keepout' | 'zones' | 'zone' | null {
  if (this.selectedPanelId) {
    const pid = this.selectedPanelId;
    this.togglePanelActive(pid);
    return null;
  }
  if (this.selectedKeepOutId) {
    const koId = this.selectedKeepOutId;
    if (this.deleteKeepOut(koId)) {
      return 'keepout';
    }
  }
  if (this.selectedZoneIds.size > 1) {
    const ids = Array.from(this.selectedZoneIds);
    ids.forEach(id => this.removeZone(id));
    this.selectedZoneIds.clear();
    this.selectedZoneId = null;
    return 'zones';
  }
  if (this.selectedZoneId) {
    const id = this.selectedZoneId;
    this.removeZone(id);
    return 'zone';
  }
  return null;
}
