/**
 * Workspace view presets (apply + detect active preset) for ProjectStore.
 */
import type { ViewFilterState, ViewPresetKey } from '../types/solar';
import type { ProjectStore } from './projectStore';

type LayerFlag =
  | 'showArrayFill'
  | 'showKeepOuts'
  | 'showStringLines'
  | 'showHomerunLines'
  | 'showRaceways'
  | 'showTiltArrows'
  | 'showVertices'
  | 'showMountTables'
  | 'showRoofRails'
  | 'showInverters'
  | 'xRayMode';

interface ViewPresetDefinition {
  panelVisibility: ViewFilterState['panelVisibility'];
  layers: Record<LayerFlag, boolean>;
  /** Labels are switched on/off when applying, but ignored when detecting the active preset. */
  showLabels: boolean;
  basemap?: ViewFilterState['basemap'];
}

function layers(on: LayerFlag[]): Record<LayerFlag, boolean> {
  const all: LayerFlag[] = [
    'showArrayFill', 'showKeepOuts', 'showStringLines', 'showHomerunLines', 'showRaceways', 'showTiltArrows',
    'showVertices', 'showMountTables', 'showRoofRails', 'showInverters', 'xRayMode'
  ];
  return Object.fromEntries(all.map(k => [k, on.includes(k)])) as Record<LayerFlag, boolean>;
}

/** Preset definitions, in detection priority order. */
export const VIEW_PRESETS: Record<ViewPresetKey, ViewPresetDefinition> = {
  all: {
    panelVisibility: 'full',
    showLabels: true,
    layers: layers([
      'showArrayFill', 'showKeepOuts', 'showStringLines', 'showHomerunLines', 'showRaceways', 'showTiltArrows',
      'showVertices', 'showMountTables', 'showRoofRails', 'showInverters'
    ])
  },
  panels: {
    panelVisibility: 'full',
    showLabels: true,
    layers: layers(['showArrayFill', 'showKeepOuts', 'showMountTables', 'showRoofRails'])
  },
  wires: {
    panelVisibility: 'dimmed',
    showLabels: false,
    layers: layers(['showStringLines', 'showHomerunLines', 'showRaceways', 'showInverters'])
  },
  presentation: {
    panelVisibility: 'full',
    showLabels: true,
    layers: layers(['showArrayFill', 'showKeepOuts', 'showRaceways', 'showMountTables', 'showRoofRails', 'showInverters'])
  },
  civil: {
    panelVisibility: 'dimmed',
    showLabels: true,
    layers: layers([
      'showArrayFill', 'showKeepOuts', 'showRaceways', 'showTiltArrows', 'showVertices',
      'showMountTables', 'showRoofRails', 'showInverters'
    ])
  },
  tracing: {
    panelVisibility: 'hidden',
    showLabels: true,
    layers: layers(['showKeepOuts', 'showVertices', 'xRayMode'])
  },
  vicinity: {
    panelVisibility: 'dimmed',
    showLabels: true,
    basemap: 'carto-light',
    layers: layers(['showArrayFill', 'showKeepOuts', 'showRaceways', 'showMountTables', 'showRoofRails', 'showInverters'])
  }
};

export function applyViewPreset(this: ProjectStore, preset: ViewPresetKey): void {
  const def = VIEW_PRESETS[preset];
  if (!def) return;
  this.layoutVersion++;
  this.viewFilter = {
    ...this.viewFilter,
    ...(def.basemap ? { basemap: def.basemap } : {}),
    panelVisibility: def.panelVisibility,
    showLabels: def.showLabels,
    ...def.layers
  };
  this.notify();
}

const REQUIRED_FLAGS = new Set<LayerFlag>(['showArrayFill', 'showKeepOuts', 'showStringLines', 'xRayMode']);

function matchesPreset(vf: ViewFilterState, def: ViewPresetDefinition): boolean {
  if (vf.panelVisibility !== def.panelVisibility) return false;
  if (def.basemap && vf.basemap !== def.basemap) return false;
  // Optional layer flags (`showHomerunLines?` etc.) count as visible when unset; required ones must be true.
  return (Object.entries(def.layers) as [LayerFlag, boolean][]).every(([flag, want]) => {
    if (!want) return !vf[flag];
    return REQUIRED_FLAGS.has(flag) ? !!vf[flag] : vf[flag] !== false;
  });
}

export function getActiveViewPreset(this: ProjectStore): ViewPresetKey | 'custom' {
  const key = (Object.keys(VIEW_PRESETS) as ViewPresetKey[]).find(k => matchesPreset(this.viewFilter, VIEW_PRESETS[k]));
  return key ?? 'custom';
}
