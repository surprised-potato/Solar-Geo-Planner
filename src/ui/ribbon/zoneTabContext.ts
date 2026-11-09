import type { ProjectStore } from '../../store/projectStore';
import type { ArrayZone, ModuleModel, SolarSystem, StringTraverseDirection } from '../../types/solar';

/** Snapshot of store-derived values shared by the zone-scoped ribbon tabs. */
export interface ZoneTabContext {
  zone: ArrayZone;
  cfg: ArrayZone['config'];
  zoneSystem: SolarSystem | undefined;
  currentTraverseDir: StringTraverseDirection;
  currentModule: ModuleModel | undefined;
  modules: ModuleModel[];
  systems: SolarSystem[];
  zones: ArrayZone[];
  currentSystem: SolarSystem | undefined;
  currentSystemSummary: ReturnType<ProjectStore['getSystemSummary']> | null;
  selectedZones: ArrayZone[];
  isMultiSelect: boolean;
  totalSelectedPanels: number;
  totalSelectedKwp: number;
  isMatchingProps: boolean;
  drawingMode: ProjectStore['drawingMode'];
}
