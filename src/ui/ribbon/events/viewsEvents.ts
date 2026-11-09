/**
 * Views tab listeners: layer visibility filters, presets and basemap.
 */
import type { RibbonUI } from '../../ribbon';

export function attachViewsTabListeners(this: RibbonUI): void {
  // --- Views Tab Listeners (Global workspace view filters) ---
  this.container.querySelectorAll<HTMLButtonElement>('[data-view-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-view-preset') as any;
      if (preset) {
        this.store.applyViewPreset(preset);
      }
    });
  });

  const chkPanels = document.getElementById('chk-view-panels') as HTMLInputElement;
  chkPanels?.addEventListener('change', () => {
    this.store.setViewFilter({
      panelVisibility: chkPanels.checked ? 'full' : 'hidden'
    });
  });

  const selPanelMode = document.getElementById('view-panel-mode') as HTMLSelectElement;
  selPanelMode?.addEventListener('change', () => {
    this.store.setViewFilter({
      panelVisibility: selPanelMode.value as any
    });
  });

  const chkTables = document.getElementById('chk-view-tables') as HTMLInputElement;
  chkTables?.addEventListener('change', () => {
    this.store.setViewFilter({ showMountTables: chkTables.checked });
  });

  const chkRoofRails = document.getElementById('chk-view-roof-rails') as HTMLInputElement;
  chkRoofRails?.addEventListener('change', () => {
    this.store.setViewFilter({ showRoofRails: chkRoofRails.checked });
  });

  const chkArrayFill = document.getElementById('chk-view-array-fill') as HTMLInputElement;
  chkArrayFill?.addEventListener('change', () => {
    this.store.setViewFilter({ showArrayFill: chkArrayFill.checked });
  });

  const chkKeepouts = document.getElementById('chk-view-keepouts') as HTMLInputElement;
  chkKeepouts?.addEventListener('change', () => {
    this.store.setViewFilter({ showKeepOuts: chkKeepouts.checked });
  });

  const chkStrings = document.getElementById('chk-view-strings') as HTMLInputElement;
  chkStrings?.addEventListener('change', () => {
    this.store.setViewFilter({ showStringLines: chkStrings.checked });
  });

  const chkHomeruns = document.getElementById('chk-view-homeruns') as HTMLInputElement;
  chkHomeruns?.addEventListener('change', () => {
    this.store.setViewFilter({ showHomerunLines: chkHomeruns.checked });
  });

  const chkRaceways = document.getElementById('chk-view-raceways') as HTMLInputElement;
  chkRaceways?.addEventListener('change', () => {
    this.store.setViewFilter({ showRaceways: chkRaceways.checked });
  });

  const chkInverters = document.getElementById('chk-view-inverters') as HTMLInputElement;
  chkInverters?.addEventListener('change', () => {
    this.store.setViewFilter({ showInverters: chkInverters.checked });
  });

  const chkTiltArrows = document.getElementById('chk-view-tilt-arrows') as HTMLInputElement;
  chkTiltArrows?.addEventListener('change', () => {
    this.store.setViewFilter({ showTiltArrows: chkTiltArrows.checked });
  });

  const chkVertices = document.getElementById('chk-view-vertices') as HTMLInputElement;
  chkVertices?.addEventListener('change', () => {
    this.store.setViewFilter({ showVertices: chkVertices.checked });
  });

  const chkLabels = document.getElementById('chk-view-labels') as HTMLInputElement;
  chkLabels?.addEventListener('change', () => {
    this.store.setViewFilter({ showLabels: chkLabels.checked });
  });

  const selBasemap = document.getElementById('view-tab-basemap') as HTMLSelectElement;
  selBasemap?.addEventListener('change', () => {
    this.store.setViewFilter({ basemap: selBasemap.value as any });
    if (this.mapController) {
      this.mapController.setBasemap(selBasemap.value as any);
    }
  });

  document.getElementById('btn-view-select-all')?.addEventListener('click', () => {
    this.store.applyViewPreset('all');
  });

  document.getElementById('btn-view-clear-all')?.addEventListener('click', () => {
    this.store.setViewFilter({
      showStringLines: false,
      showHomerunLines: false,
      showRaceways: false,
      showTiltArrows: false,
      showVertices: false,
      showMountTables: false,
      showRoofRails: false,
      showInverters: false
    });
  });
}
