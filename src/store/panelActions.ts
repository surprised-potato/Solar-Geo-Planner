/**
 * Individual panel toggling, removal and string assignment for ProjectStore.
 */
import { SolarPanelObject } from '../types/solar';
import { sanitizeIdentifier } from '../utils/sanitizeProjectData';
import type { ProjectStore } from './projectStore';

export function getPanelsForSystem(this: ProjectStore, systemId: string): SolarPanelObject[] {
  return Array.from(this.panels.values()).filter(p => {
    const z = this.zones.get(p.zoneId);
    if (z) {
      if (p.systemId !== z.systemId) {
        p.systemId = z.systemId;
      }
      return z.systemId === systemId;
    }
    return p.systemId === systemId;
  });
}

export function togglePanelActive(this: ProjectStore, panelId: string): void {
  const panel = this.panels.get(panelId);
  if (!panel) return;

  panel.active = !panel.active;
  const zone = this.zones.get(panel.zoneId);
  if (zone) {
    const zonePanels = this.getPanelsForZone(panel.zoneId);
    zone.activePanelCount = zonePanels.filter(p => p.active).length;
    const totalWp = zonePanels.reduce(
      (sum, p) => (p.active ? sum + p.electrical.nominalPowerW : sum),
      0
    );
    zone.totalKwp = Number((totalWp / 1000).toFixed(2));
  }

  this.layoutVersion++;
  this.notify();
}

export function removePanel(this: ProjectStore, panelId: string): void {
  const panel = this.panels.get(panelId);
  if (!panel) return;

  this.panels.delete(panelId);
  if (this.selectedPanelId === panelId) {
    this.selectedPanelId = null;
  }

  const zone = this.zones.get(panel.zoneId);
  if (zone) {
    const zonePanels = this.getPanelsForZone(panel.zoneId);
    zone.panelCount = zonePanels.length;
    zone.activePanelCount = zonePanels.filter(p => p.active).length;
    const totalWp = zonePanels.reduce(
      (sum, p) => (p.active ? sum + p.electrical.nominalPowerW : sum),
      0
    );
    zone.totalKwp = Number((totalWp / 1000).toFixed(2));
  }

  this.layoutVersion++;
  this.notify();
}

export function updatePanelString(this: ProjectStore, panelId: string, stringId: string | null, stringOrder: number | null, mpptId?: string | null, inverterIndex?: number | null): void {
  const panel = this.panels.get(panelId);
  if (!panel) return;
  panel.stringId = stringId === null ? null : sanitizeIdentifier(stringId);
  panel.stringOrder = stringOrder;
  if (mpptId !== undefined) panel.mpptId = mpptId;
  if (inverterIndex !== undefined) panel.inverterIndex = inverterIndex;
  this.notify();
}

export function updateStringAssignment(this: ProjectStore, stringId: string, inverterIndex?: number, mpptId?: string): void {
  for (const panel of this.panels.values()) {
    if (panel.stringId === stringId) {
      if (inverterIndex !== undefined) panel.inverterIndex = inverterIndex;
      if (mpptId !== undefined) panel.mpptId = mpptId;
    }
  }
  this.notify();
}
