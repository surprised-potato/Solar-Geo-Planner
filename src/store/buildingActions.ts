/**
 * Project sections (farms) and poultry-house buildings for ProjectStore.
 */
import { BessConfig, Building, InterconnectionConfig, ProjectSection } from '../types/solar';
import { generatePoultryHouseLayout, PoultryHouseParams } from '../geo/poultryHouses';
import type { ProjectStore } from './projectStore';

export interface AddPoultryHousesOptions extends PoultryHouseParams {
  sectionId?: string;
  systemId?: string;
  eaveHeightM?: number;
  purlinSpacingM?: number;
  roofType?: Building['roofType'];
  corrosionClass?: Building['corrosionClass'];
}

function nextSectionCode(sections: Iterable<ProjectSection>): string {
  const used = new Set<string>();
  for (const s of sections) used.add(s.code);
  // 'I' is reserved for the interconnection package
  for (let c = 65; c <= 90; c++) {
    const code = String.fromCharCode(c);
    if (code !== 'I' && !used.has(code)) return code;
  }
  return `S${used.size + 1}`;
}

export function addSection(
  this: ProjectStore,
  kind: ProjectSection['kind'] = 'farm',
  name?: string
): ProjectSection {
  const code = kind === 'interconnection' ? 'I' : nextSectionCode(this.sections.values());
  const section: ProjectSection = {
    id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    code,
    name: name || (kind === 'interconnection' ? 'Interconnection' : `Farm ${code}`),
    kind,
    systemIds: []
  };
  this.sections.set(section.id, section);
  this.notify();
  return section;
}

export function addPoultryHouses(this: ProjectStore, opts: AddPoultryHousesOptions): Building[] {
  const existingSection = opts.sectionId ? this.sections.get(opts.sectionId) : undefined;
  const section = existingSection || this.addSection('farm');
  // Each farm is its own electrical system (own inverters / transformer / BOQ), so a new farm
  // gets a fresh system unless the caller names one. Existing farms reuse their first system.
  let systemId = opts.systemId ?? existingSection?.systemIds[0];
  if (!systemId) {
    systemId = this.addSystem(`${section.code}: ${section.name} PV Station`).id;
  }
  if (!section.systemIds.includes(systemId)) section.systemIds.push(systemId);
  const layouts = generatePoultryHouseLayout(opts);
  const existing = [...this.buildings.values()].filter(b => b.sectionId === section.id).length;
  const created: Building[] = [];

  for (const house of layouts) {
    const houseNo = existing + house.index;
    const zoneIds: string[] = [];
    house.roofPlanes.forEach((plane, i) => {
      const zone = this.addZone(
        plane.vertices,
        'roof',
        `${section.code}-House ${houseNo} ${i === 0 ? 'East' : 'West'} Plane`,
        systemId
      );
      this.updateZoneConfig(zone.id, { azimuthDeg: plane.azimuthDeg, tiltDeg: plane.tiltDeg });
      zoneIds.push(zone.id);
      if (!section.systemIds.includes(zone.systemId)) section.systemIds.push(zone.systemId);
    });

    const eave = opts.eaveHeightM ?? 3;
    const building: Building = {
      id: `bld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${houseNo}`,
      sectionId: section.id,
      name: `${section.code}-House ${houseNo}`,
      footprint: house.footprint,
      headingDeg: opts.headingDeg,
      lengthM: opts.lengthM,
      widthM: opts.widthM,
      eaveHeightM: eave,
      ridgeHeightM: eave + (opts.widthM / 2) * Math.tan((opts.roofPitchDeg * Math.PI) / 180),
      roofType: opts.roofType ?? 'corrugated_metal',
      purlinSpacingM: opts.purlinSpacingM ?? 1.2,
      corrosionClass: opts.corrosionClass ?? 'ammonia_humid',
      zoneIds
    };
    this.buildings.set(building.id, building);
    created.push(building);
  }

  this.notify();
  return created;
}

/** Drops a removed zone from any building that referenced it. */
export function detachZoneFromBuildings(this: ProjectStore, zoneId: string): void {
  for (const b of this.buildings.values()) {
    if (b.zoneIds.includes(zoneId)) b.zoneIds = b.zoneIds.filter(id => id !== zoneId);
  }
}

/** Sets (or clears, with null / zero capacity) the battery storage of a farm and refreshes the BOQ. */
export function setFarmBess(this: ProjectStore, sectionId: string, bess: BessConfig | null): void {
  const sec = this.sections.get(sectionId);
  if (!sec || sec.kind !== 'farm') return;
  sec.bess = bess && bess.capacityMwh > 0
    ? { capacityMwh: bess.capacityMwh, powerMw: Math.max(0, bess.powerMw), chemistry: bess.chemistry }
    : null;
  if (this.boqState) this.syncBoqFromCad();
  else this.notify();
}

/** Creates the interconnection section on first use and stores its line configuration. */
export function setInterconnection(this: ProjectStore, cfg: InterconnectionConfig | null): ProjectSection | undefined {
  let sec = [...this.sections.values()].find(s => s.kind === 'interconnection');
  if (!sec) {
    if (!cfg) return undefined;
    sec = this.addSection('interconnection');
  }
  sec.interconnection = cfg
    ? {
        lineLengthKm: Math.max(0, cfg.lineLengthKm),
        poleSpanM: Math.max(10, cfg.poleSpanM),
        voltageKv: cfg.voltageKv > 0 ? cfg.voltageKv : 13.2
      }
    : null;
  if (this.boqState) this.syncBoqFromCad();
  else this.notify();
  return sec;
}
