/**
 * Workspace view presets (apply + detect active preset) for ProjectStore.
 */
import { ViewPresetKey } from '../types/solar';
import type { ProjectStore } from './projectStore';

export function applyViewPreset(this: ProjectStore, preset: ViewPresetKey): void {
  this.layoutVersion++;
  switch (preset) {
    case 'all':
      this.viewFilter = {
        ...this.viewFilter,
        panelVisibility: 'full',
        showArrayFill: true,
        showKeepOuts: true,
        showLabels: true,
        showStringLines: true,
        showHomerunLines: true,
        showRaceways: true,
        showTiltArrows: true,
        showVertices: true,
        showMountTables: true,
        showRoofRails: true,
        showInverters: true,
        xRayMode: false
      };
      break;
    case 'panels':
      this.viewFilter = {
        ...this.viewFilter,
        panelVisibility: 'full',
        showArrayFill: true,
        showKeepOuts: true,
        showLabels: true,
        showStringLines: false,
        showHomerunLines: false,
        showRaceways: false,
        showTiltArrows: false,
        showVertices: false,
        showMountTables: true,
        showRoofRails: true,
        showInverters: false,
        xRayMode: false
      };
      break;
    case 'wires':
      this.viewFilter = {
        ...this.viewFilter,
        panelVisibility: 'dimmed',
        showArrayFill: false,
        showKeepOuts: false,
        showLabels: false,
        showStringLines: true,
        showHomerunLines: true,
        showRaceways: true,
        showTiltArrows: false,
        showVertices: false,
        showMountTables: false,
        showRoofRails: false,
        showInverters: true,
        xRayMode: false
      };
      break;
    case 'presentation':
      this.viewFilter = {
        ...this.viewFilter,
        panelVisibility: 'full',
        showArrayFill: true,
        showKeepOuts: true,
        showLabels: true,
        showStringLines: false,
        showHomerunLines: false,
        showRaceways: true,
        showTiltArrows: false,
        showVertices: false,
        showMountTables: true,
        showRoofRails: true,
        showInverters: true,
        xRayMode: false
      };
      break;
    case 'civil':
      this.viewFilter = {
        ...this.viewFilter,
        panelVisibility: 'dimmed',
        showArrayFill: true,
        showKeepOuts: true,
        showLabels: true,
        showStringLines: false,
        showHomerunLines: false,
        showRaceways: true,
        showTiltArrows: true,
        showVertices: true,
        showMountTables: true,
        showRoofRails: true,
        showInverters: true,
        xRayMode: false
      };
      break;
    case 'tracing':
      this.viewFilter = {
        ...this.viewFilter,
        panelVisibility: 'hidden',
        showArrayFill: false,
        showKeepOuts: true,
        showLabels: true,
        showStringLines: false,
        showHomerunLines: false,
        showRaceways: false,
        showTiltArrows: false,
        showVertices: true,
        showMountTables: false,
        showRoofRails: false,
        showInverters: false,
        xRayMode: true
      };
      break;
    case 'vicinity':
      this.viewFilter = {
        ...this.viewFilter,
        basemap: 'carto-light',
        panelVisibility: 'dimmed',
        showArrayFill: true,
        showKeepOuts: true,
        showLabels: true,
        showStringLines: false,
        showHomerunLines: false,
        showRaceways: true,
        showTiltArrows: false,
        showVertices: false,
        showMountTables: true,
        showRoofRails: true,
        showInverters: true,
        xRayMode: false
      };
      break;
  }
  this.notify();
}

export function getActiveViewPreset(this: ProjectStore): ViewPresetKey | 'custom' {
  const vf = this.viewFilter;
  if (
    vf.panelVisibility === 'full' &&
    vf.showArrayFill &&
    vf.showKeepOuts &&
    vf.showStringLines &&
    vf.showHomerunLines !== false &&
    vf.showRaceways !== false &&
    vf.showTiltArrows !== false &&
    vf.showVertices !== false &&
    vf.showMountTables !== false &&
    vf.showRoofRails !== false &&
    vf.showInverters !== false &&
    !vf.xRayMode
  ) {
    return 'all';
  }
  if (
    vf.panelVisibility === 'full' &&
    vf.showArrayFill &&
    vf.showKeepOuts &&
    !vf.showStringLines &&
    !vf.showHomerunLines &&
    !vf.showRaceways &&
    !vf.showTiltArrows &&
    !vf.showVertices &&
    vf.showMountTables !== false &&
    vf.showRoofRails !== false &&
    !vf.showInverters &&
    !vf.xRayMode
  ) {
    return 'panels';
  }
  if (
    vf.panelVisibility === 'dimmed' &&
    !vf.showArrayFill &&
    !vf.showKeepOuts &&
    vf.showStringLines &&
    vf.showHomerunLines !== false &&
    vf.showRaceways !== false &&
    !vf.showTiltArrows &&
    !vf.showVertices &&
    !vf.showMountTables &&
    !vf.showRoofRails &&
    vf.showInverters !== false &&
    !vf.xRayMode
  ) {
    return 'wires';
  }
  if (
    vf.panelVisibility === 'full' &&
    vf.showArrayFill &&
    vf.showKeepOuts &&
    !vf.showStringLines &&
    !vf.showHomerunLines &&
    vf.showRaceways !== false &&
    !vf.showTiltArrows &&
    !vf.showVertices &&
    vf.showMountTables !== false &&
    vf.showRoofRails !== false &&
    vf.showInverters !== false &&
    !vf.xRayMode
  ) {
    return 'presentation';
  }
  if (
    vf.panelVisibility === 'dimmed' &&
    vf.showArrayFill &&
    vf.showKeepOuts &&
    !vf.showStringLines &&
    !vf.showHomerunLines &&
    vf.showRaceways !== false &&
    vf.showTiltArrows !== false &&
    vf.showVertices !== false &&
    vf.showMountTables !== false &&
    vf.showRoofRails !== false &&
    vf.showInverters !== false &&
    !vf.xRayMode
  ) {
    return 'civil';
  }
  if (
    vf.panelVisibility === 'hidden' &&
    !vf.showArrayFill &&
    vf.showKeepOuts &&
    !vf.showStringLines &&
    !vf.showHomerunLines &&
    !vf.showRaceways &&
    !vf.showTiltArrows &&
    vf.showVertices !== false &&
    !vf.showMountTables &&
    !vf.showRoofRails &&
    !vf.showInverters &&
    vf.xRayMode
  ) {
    return 'tracing';
  }
  if (
    vf.panelVisibility === 'dimmed' &&
    vf.showArrayFill &&
    vf.showKeepOuts &&
    !vf.showStringLines &&
    !vf.showHomerunLines &&
    vf.showRaceways !== false &&
    !vf.showTiltArrows &&
    !vf.showVertices &&
    vf.showMountTables !== false &&
    vf.showRoofRails !== false &&
    vf.showInverters !== false &&
    vf.basemap === 'carto-light' &&
    !vf.xRayMode
  ) {
    return 'vicinity';
  }
  return 'custom';
}
