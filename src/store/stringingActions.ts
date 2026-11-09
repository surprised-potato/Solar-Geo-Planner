/**
 * String traversal, auto-stringing, inverter distribution and string integrity for ProjectStore.
 */
import { ArrayZone, SolarPanelObject, ZNSHINE_600W_BIFACIAL, StringTraverseDirection } from '../types/solar';
import { calculateStringLimits } from '../geo/autofill';
import { partitionPanelsIntoStrings } from '../geo/stringCabling';
import type { ProjectStore } from './projectStore';
import { sanitizeIdentifier } from '../utils/sanitizeProjectData';

export function setStringTraverseDirection(
  this: ProjectStore,
  direction: StringTraverseDirection,
  zoneId?: string,
  autoReString: boolean = true
): void {
  this.stringTraverseDirection = direction;
  const targetZones = zoneId
    ? [this.zones.get(zoneId)].filter(Boolean) as ArrayZone[]
    : this.getSelectedZones();

  for (const z of targetZones) {
    z.config.stringTraverseDirection = direction;
  }

  if (autoReString) {
    const affectedSystemIds = new Set<string>();
    if (targetZones.length > 0) {
      for (const z of targetZones) {
        if (z.systemId) affectedSystemIds.add(z.systemId);
      }
    } else if (this.selectedSystemId) {
      affectedSystemIds.add(this.selectedSystemId);
    }
    for (const sysId of affectedSystemIds) {
      this.autoStringSystem(sysId, undefined, direction);
    }
  }

  this.saveToLocalStorage();
  this.notify();
}

export function autoStringSystem(
  this: ProjectStore,
  systemId: string,
  customModulesPerString?: number,
  direction?: StringTraverseDirection
): { totalStrings: number; modulesPerString: number; inverterLoadRatio: number; warnings: string[]; stringDirection?: StringTraverseDirection } {
  const sys = this.systems.get(systemId);
  if (!sys) {
    return { totalStrings: 0, modulesPerString: 0, inverterLoadRatio: 0, warnings: ['System not found'] };
  }

  const inv = sys.inverter;

  // Strict array boundaries: Identify all zones explicitly linked to this system
  const zonesInSystem = Array.from(this.zones.values()).filter(z => z.systemId === systemId);
  const zoneIdsInSystem = new Set(zonesInSystem.map(z => z.id));
  const effectiveDir = direction || this.getStringTraverseDirection(zonesInSystem[0]?.id) || 'short_side';

  // Ensure all panels in this system's zones are properly linked to systemId
  // and clear their existing string assignments prior to auto-stringing
  for (const panel of this.panels.values()) {
    if (zoneIdsInSystem.has(panel.zoneId)) {
      panel.systemId = systemId;
      panel.stringId = null;
      panel.stringOrder = null;
      panel.mpptId = null;
      panel.inverterIndex = null;
    }
  }

  // Active panels strictly from zones assigned to this system (never mix panels from other systems)
  const activePanels = Array.from(this.panels.values()).filter(
    p => p.active && zoneIdsInSystem.has(p.zoneId)
  );

  if (activePanels.length === 0) {
    this.notify();
    return { totalStrings: 0, modulesPerString: 0, inverterLoadRatio: 0, warnings: ['No active panels in this system'] };
  }

  // Determine representative module
  const firstModuleId = activePanels[0].moduleId;
  const mod = this.getModule(firstModuleId) || ZNSHINE_600W_BIFACIAL;
  const limits = calculateStringLimits(mod, inv);

  // Clamped string size: target size cannot exceed limits.maxPanelsPerString or inverter Vmax
  const rawTarget = customModulesPerString || limits.optimalPanelsPerString;
  const stringSize = Math.min(limits.maxPanelsPerString, Math.max(limits.minPanelsPerString, rawTarget));
  const warnings: string[] = [];

  if (customModulesPerString && customModulesPerString > limits.maxPanelsPerString) {
    warnings.push(`Specified ${customModulesPerString} panels/string exceeds cold Voc max voltage limit (${limits.maxPanelsPerString} panels for ${inv.maxDcVoltage}V max DC). Clamped to ${limits.maxPanelsPerString}.`);
  } else if (customModulesPerString && customModulesPerString < limits.minPanelsPerString) {
    warnings.push(`Warning: ${customModulesPerString} panels/string is below min MPPT voltage limit (${limits.minPanelsPerString} panels).`);
  }

  // Form strings respecting array boundaries and physical subarray/block boundaries
  const stringGroups: SolarPanelObject[][] = [];

  // Group 1: Roof mount zones in this system (form strings strictly within each array)
  const roofZones = zonesInSystem.filter(z => z.config.mountType === 'roof');
  for (const roofZone of roofZones) {
    const zonePanels = activePanels.filter(p => p.zoneId === roofZone.id);
    if (zonePanels.length === 0) continue;

    const zoneDir = direction || roofZone.config.stringTraverseDirection || this.stringTraverseDirection || 'short_side';
    const part = partitionPanelsIntoStrings(
      zonePanels,
      roofZone.config.azimuthDeg,
      limits,
      {
        customModulesPerString,
        direction: zoneDir,
        zoneName: roofZone.name
      }
    );
    stringGroups.push(...part.stringGroups);
    warnings.push(...part.warnings);
  }

  // Group 2: Ground mount zones in this system (strictly within this system's arrays)
  const groundZones = zonesInSystem.filter(z => z.config.mountType === 'ground');
  for (const gZone of groundZones) {
    const zonePanels = activePanels.filter(p => p.zoneId === gZone.id);
    if (zonePanels.length === 0) continue;

    const zoneDir = direction || gZone.config.stringTraverseDirection || this.stringTraverseDirection || 'short_side';
    const part = partitionPanelsIntoStrings(
      zonePanels,
      gZone.config.azimuthDeg,
      limits,
      {
        customModulesPerString,
        direction: zoneDir,
        zoneName: gZone.name
      }
    );
    stringGroups.push(...part.stringGroups);
    warnings.push(...part.warnings);
  }

  const totalStrings = stringGroups.length;
  const maxAllowedStrings = inv.inverterCount * inv.mpptCountPerInverter * inv.maxStringsPerMppt;

  if (totalStrings > maxAllowedStrings) {
    warnings.push(
      `Total strings (${totalStrings}) exceeds inverter capacity (${maxAllowedStrings} strings across ${inv.inverterCount} inverters). Consider adding inverters.`
    );
  }

  // Determine system prefix for unique string IDs across multiple systems
  const sysList = Array.from(this.systems.values());
  const sysIndex = sysList.findIndex(s => s.id === systemId) + 1;
  const sysPrefix = sysList.length > 1 ? `S${sysIndex > 0 ? sysIndex : 1}-` : '';

  const effectiveInvCount = Math.max(1, inv.inverterCount);
  const mpptCount = Math.max(1, inv.mpptCountPerInverter);
  const totalSlots = effectiveInvCount * mpptCount;

  // Assign strings, MPPT channels, and inverters (guaranteeing unique stringId per string)
  stringGroups.forEach((strPanels, stringIndex) => {
    const invIdx = (stringIndex % effectiveInvCount) + 1;
    const mpptIdx = (Math.floor(stringIndex / effectiveInvCount) % mpptCount) + 1;
    const channelSlotIdx = Math.floor(stringIndex / totalSlots);
    const subStringLetter =
      String.fromCharCode(65 + (channelSlotIdx % 26)) +
      (channelSlotIdx >= 26 ? String(Math.floor(channelSlotIdx / 26) + 1) : '');

    const stringId = `${sysPrefix}INV${invIdx}-M${mpptIdx}-${subStringLetter}`;
    const mpptId = `${sysPrefix}INV${invIdx}-MPPT${mpptIdx}`;

    strPanels.forEach((panel, orderIdx) => {
      panel.stringId = stringId;
      panel.stringOrder = orderIdx + 1;
      panel.mpptId = mpptId;
      panel.inverterIndex = invIdx;
      panel.systemId = systemId;
    });
  });

  const totalDcKw = (activePanels.length * mod.nominalPowerW) / 1000.0;
  const totalAcKw = inv.inverterCount * inv.ratedAcPowerKw;
  const inverterLoadRatio = totalAcKw > 0 ? Number((totalDcKw / totalAcKw).toFixed(2)) : 0;

  if (inverterLoadRatio > inv.maxDcAcRatio) {
    warnings.push(
      `DC/AC loading ratio (${inverterLoadRatio}) exceeds inverter design limit (${inv.maxDcAcRatio}).`
    );
  }

  this.layoutVersion++;
  this.notify();

  return {
    totalStrings,
    modulesPerString: stringSize,
    inverterLoadRatio,
    warnings,
    stringDirection: effectiveDir
  };
}

/**
 * Distributes existing strings evenly across all inverters of a system
 * and enforces strict voltage compliance (splitting strings exceeding inverter Vmax or limits.maxPanelsPerString).
 */
export function distributeStringsAcrossInverters(
  this: ProjectStore,
  systemId: string,
  targetInverterCount?: number,
  force: boolean = false
): boolean {
  const sys = this.systems.get(systemId);
  if (!sys) return false;
  const invCount = targetInverterCount !== undefined ? targetInverterCount : sys.inverter.inverterCount;

  // Get all active panels for this system
  const systemPanels = this.getPanelsForSystem(systemId).filter(p => p.active);
  if (systemPanels.length === 0) return false;

  // Determine module & electrical limits for current inverter specification
  const firstModuleId = systemPanels[0].moduleId;
  const mod = this.getModule(firstModuleId) || ZNSHINE_600W_BIFACIAL;
  const limits = calculateStringLimits(mod, sys.inverter);

  // Group panels by existing stringId
  const stringMap = new Map<string, SolarPanelObject[]>();
  for (const p of systemPanels) {
    if (p.stringId) {
      if (!stringMap.has(p.stringId)) {
        stringMap.set(p.stringId, []);
      }
      stringMap.get(p.stringId)!.push(p);
    }
  }

  if (stringMap.size === 0) {
    this.autoStringSystem(systemId);
    return true;
  }

  // Check if any existing string violates max panels per string or cold Voc > maxDcVoltage
  let hasVoltageViolation = false;
  for (const panels of stringMap.values()) {
    const coldVoc = panels.length * limits.maxColdVoc;
    if (panels.length > limits.maxPanelsPerString || coldVoc > sys.inverter.maxDcVoltage) {
      hasVoltageViolation = true;
      break;
    }
  }

  // Check if strings are already distributed across multiple inverters and voltage compliant
  if (!force && !hasVoltageViolation) {
    if (invCount <= 1) return false;
    const distinctInverters = new Set<number>();
    for (const panels of stringMap.values()) {
      const inv = panels[0].inverterIndex || 1;
      distinctInverters.add(inv);
    }
    // If already distributed across more than 1 inverter and matches invCount, leave as is
    if (distinctInverters.size > 1 && distinctInverters.size === invCount) {
      return false;
    }
  }

  // Build compliant strings: split any oversized strings into balanced chunks <= limits.maxPanelsPerString
  const compliantStringsList: SolarPanelObject[][] = [];
  for (const panels of stringMap.values()) {
    if (panels.length <= limits.maxPanelsPerString) {
      compliantStringsList.push(panels);
    } else {
      // Sort to preserve panel order within the string
      panels.sort((a, b) => (a.stringOrder ?? 0) - (b.stringOrder ?? 0));
      const N = panels.length;
      let k = Math.ceil(N / limits.maxPanelsPerString);
      if (limits.optimalPanelsPerString > 0) {
        k = Math.max(k, Math.round(N / limits.optimalPanelsPerString));
      }
      while (Math.ceil(N / k) > limits.maxPanelsPerString) {
        k++;
      }
      const baseSize = Math.floor(N / k);
      const remainder = N % k;
      let offset = 0;
      for (let i = 0; i < k; i++) {
        const count = baseSize + (i < remainder ? 1 : 0);
        const subPanels = panels.slice(offset, offset + count);
        offset += count;
        compliantStringsList.push(subPanels);
      }
    }
  }

  const mpptCount = Math.max(1, sys.inverter.mpptCountPerInverter || 5);
  const sysList = Array.from(this.systems.values());
  const sysIndex = sysList.findIndex(s => s.id === systemId) + 1;
  const sysPrefix = sysList.length > 1 ? `S${sysIndex > 0 ? sysIndex : 1}-` : '';

  const effectiveInvCount = Math.max(1, invCount);
  const totalSlots = effectiveInvCount * mpptCount;

  // Distribute compliant strings evenly across inverters and MPPT channels (guaranteeing unique stringId)
  compliantStringsList.forEach((panels, i) => {
    const invIdx = (i % effectiveInvCount) + 1;
    const mpptIdx = (Math.floor(i / effectiveInvCount) % mpptCount) + 1;
    const channelSlotIdx = Math.floor(i / totalSlots);
    const letter =
      String.fromCharCode(65 + (channelSlotIdx % 26)) +
      (channelSlotIdx >= 26 ? String(Math.floor(channelSlotIdx / 26) + 1) : '');

    const newStringId = `${sysPrefix}INV${invIdx}-M${mpptIdx}-${letter}`;
    const newMpptId = `${sysPrefix}INV${invIdx}-MPPT${mpptIdx}`;

    panels.forEach((p, orderIdx) => {
      p.inverterIndex = invIdx;
      p.stringId = newStringId;
      p.mpptId = newMpptId;
      p.stringOrder = orderIdx + 1;
      p.systemId = systemId;
    });
  });

  this.notify();
  return true;
}

export function renameString(this: ProjectStore, oldStringId: string, newStringId: string): void {
  const trimmed = sanitizeIdentifier(newStringId.trim());
  if (!trimmed || trimmed === oldStringId) return;
  for (const panel of this.panels.values()) {
    if (panel.stringId === oldStringId) {
      panel.stringId = trimmed;
    }
  }
  this.notify();
}

export function sanitizeStringIntegrity(this: ProjectStore): void {
  for (const sys of this.systems.values()) {
    const sysPanels = this.getPanelsForSystem(sys.id).filter(p => p.active && p.stringId);
    if (sysPanels.length === 0) continue;

    const strMap = new Map<string, SolarPanelObject[]>();
    for (const p of sysPanels) {
      if (!strMap.has(p.stringId!)) strMap.set(p.stringId!, []);
      strMap.get(p.stringId!)!.push(p);
    }

    let needsReString = false;
    for (const [, pList] of strMap.entries()) {
      const orderSet = new Set<number>();
      for (const p of pList) {
        if (p.stringOrder === null || p.stringOrder === undefined || orderSet.has(p.stringOrder)) {
          needsReString = true;
          break;
        }
        orderSet.add(p.stringOrder);
      }
      if (needsReString) break;
    }

    if (needsReString) {
      this.autoStringSystem(sys.id);
    }
  }
}
