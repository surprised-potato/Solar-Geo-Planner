/**
 * Sidebar event wiring for the empty state, batch (multi-array) state and active array state.
 */
import { calculateRecommendedRowSpacing } from '../../geo/autofill';
import { DEFAULT_GROUND_CONFIG, DEFAULT_ROOF_CONFIG } from '../../types/solar';
import type { SidebarUI } from '../sidebar';

export function attachBatchListeners(this: SidebarUI): void {
  document.getElementById('btn-sidebar-clear-sel')?.addEventListener('click', () => {
    this.store.clearZoneSelection();
  });

  document.getElementById('btn-sidebar-batch-del')?.addEventListener('click', () => {
    const count = this.store.selectedZoneIds.size;
    if (confirm(`Delete all ${count} selected arrays and their solar modules?`)) {
      this.store.deleteSelected();
    }
  });

  document.getElementById('btn-sidebar-batch-opt')?.addEventListener('click', () => {
    const res = this.store.optimizeSelectedZonesGridShift(12);
    const diff = res.totalMaxPanels - res.totalPreviousPanels;
    let msg = `🎉 Batch Grid Shift Optimized & Auto-Strung!\nOptimized ${res.optimizedCount} Selected Arrays\nTotal Fitted Panels: ${res.totalMaxPanels} (${diff >= 0 ? `+${diff}` : diff} panels)`;
    if (res.totalStrings !== undefined) {
      msg += `\n⚡ Auto-Strung into ${res.totalStrings} Strings!`;
    }
    alert(msg);
  });

  this.container.querySelectorAll<HTMLButtonElement>('.btn-sidebar-batch-setback').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = Number(btn.getAttribute('data-val'));
      if (!isNaN(val)) {
        this.store.updateSelectedZonesConfig({ setbackM: val });
      }
    });
  });

  const zoneItems = this.container.querySelectorAll('.zone-list-item');
  zoneItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const zoneId = item.getAttribute('data-zone-id');
      const isMulti = (e as MouseEvent).shiftKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey || true;
      if (zoneId) this.store.selectZone(zoneId, isMulti);
    });
  });
}

export function attachActiveStateListeners(this: SidebarUI, zoneId: string): void {
  const nameInput = document.getElementById('zone-name-input') as HTMLInputElement;
  nameInput?.addEventListener('change', () => {
    const z = this.store.getZone(zoneId);
    if (z) z.name = nameInput.value;
  });

  const btnDelete = document.getElementById('btn-delete-zone');
  btnDelete?.addEventListener('click', () => {
    if (confirm('Delete this array zone and all its panels?')) {
      this.store.removeZone(zoneId);
    }
  });

  // Mount switcher
  document.getElementById('mount-roof')?.addEventListener('click', () => {
    this.store.updateZoneConfig(zoneId, {
      ...DEFAULT_ROOF_CONFIG,
      mountType: 'roof'
    });
  });

  document.getElementById('mount-ground')?.addEventListener('click', () => {
    this.store.updateZoneConfig(zoneId, {
      ...DEFAULT_GROUND_CONFIG,
      mountType: 'ground'
    });
  });

  const tableUpEl = document.getElementById('table-up-input') as HTMLInputElement;
  tableUpEl?.addEventListener('change', () => {
    const up = Math.max(1, parseInt(tableUpEl.value) || 2);
    this.store.updateZoneConfig(zoneId, { modulesPerTableUp: up });
  });

  const tableWideEl = document.getElementById('table-wide-input') as HTMLInputElement;
  tableWideEl?.addEventListener('change', () => {
    const wide = Math.max(1, parseInt(tableWideEl.value) || 14);
    this.store.updateZoneConfig(zoneId, { modulesPerTableWide: wide });
  });

  const tableGapEl = document.getElementById('table-gap-input') as HTMLInputElement;
  tableGapEl?.addEventListener('change', () => {
    const gap = Math.max(0.1, parseFloat(tableGapEl.value) || 1.0);
    this.store.updateZoneConfig(zoneId, { tableSpacingM: gap });
  });

  // Orientation
  document.getElementById('orient-portrait')?.addEventListener('click', () => {
    this.store.updateZoneConfig(zoneId, { orientation: 'portrait' });
  });
  document.getElementById('orient-landscape')?.addEventListener('click', () => {
    this.store.updateZoneConfig(zoneId, { orientation: 'landscape' });
  });

  // Roof Rails (Parallel to Short Side)
  document.getElementById('sidebar-rails-2')?.addEventListener('click', () => {
    this.store.updateZoneConfig(zoneId, { railCount: 2 });
  });
  document.getElementById('sidebar-rails-3')?.addEventListener('click', () => {
    this.store.updateZoneConfig(zoneId, { railCount: 3 });
  });

  const overhangInput = document.getElementById('rail-overhang-input') as HTMLInputElement;
  overhangInput?.addEventListener('change', () => {
    const oh = Math.max(0, parseFloat(overhangInput.value) || 0.10);
    this.store.updateZoneConfig(zoneId, { railOverhangM: oh });
  });

  // Azimuth
  const azRange = document.getElementById('azimuth-range') as HTMLInputElement;
  const azNum = document.getElementById('azimuth-num') as HTMLInputElement;
  const syncAzimuth = (val: number) => {
    this.store.updateZoneConfig(zoneId, { azimuthDeg: Math.round(val) });
  };
  azRange?.addEventListener('input', () => syncAzimuth(Number(azRange.value)));
  azNum?.addEventListener('change', () => syncAzimuth(Number(azNum.value)));

  // Tilt
  const tiltRange = document.getElementById('tilt-range') as HTMLInputElement;
  const tiltNum = document.getElementById('tilt-num') as HTMLInputElement;
  const syncTilt = (val: number) => {
    this.store.updateZoneConfig(zoneId, { tiltDeg: Math.round(val) });
  };
  tiltRange?.addEventListener('input', () => syncTilt(Number(tiltRange.value)));
  tiltNum?.addEventListener('change', () => syncTilt(Number(tiltNum.value)));

  // Row Spacing
  const rowRange = document.getElementById('row-spacing-range') as HTMLInputElement;
  const rowNum = document.getElementById('row-spacing-num') as HTMLInputElement;
  const syncRow = (val: number) => {
    this.store.updateZoneConfig(zoneId, { rowSpacingM: val });
  };
  rowRange?.addEventListener('input', () => syncRow(Number(rowRange.value)));
  rowNum?.addEventListener('change', () => syncRow(Number(rowNum.value)));

  // Auto calculate pitch based on tilt
  document.getElementById('btn-calc-shadow')?.addEventListener('click', () => {
    const z = this.store.getZone(zoneId);
    if (!z) return;
    const lengthM =
      z.config.orientation === 'portrait'
        ? z.config.panelLengthMm / 1000
        : z.config.panelWidthMm / 1000;
    const recPitch = calculateRecommendedRowSpacing(z.config.tiltDeg, lengthM, this.store.center.lat);
    this.store.updateZoneConfig(zoneId, { rowSpacingM: recPitch });
  });

  // Col Spacing
  const colRange = document.getElementById('col-spacing-range') as HTMLInputElement;
  const colNum = document.getElementById('col-spacing-num') as HTMLInputElement;
  const syncCol = (val: number) => {
    this.store.updateZoneConfig(zoneId, { colSpacingM: val });
  };
  colRange?.addEventListener('input', () => syncCol(Number(colRange.value)));
  colNum?.addEventListener('change', () => syncCol(Number(colNum.value)));

  // Setback
  const setRange = document.getElementById('setback-range') as HTMLInputElement;
  const setNum = document.getElementById('setback-num') as HTMLInputElement;
  const syncSet = (val: number) => {
    this.store.updateZoneConfig(zoneId, { setbackM: val });
  };
  setRange?.addEventListener('input', () => syncSet(Number(setRange.value)));
  setNum?.addEventListener('change', () => syncSet(Number(setNum.value)));

  // Offsets
  const offX = document.getElementById('offset-x') as HTMLInputElement;
  const offY = document.getElementById('offset-y') as HTMLInputElement;
  offX?.addEventListener('change', () => {
    this.store.updateZoneConfig(zoneId, { alignmentOffsetX: Number(offX.value) });
  });
  offY?.addEventListener('change', () => {
    this.store.updateZoneConfig(zoneId, { alignmentOffsetY: Number(offY.value) });
  });

  // Keep-out button
  document.getElementById('btn-draw-keepout')?.addEventListener('click', () => {
    this.store.setDrawingMode(this.store.drawingMode === 'keepout' ? 'none' : 'keepout');
  });

  // Remove keep-out items
  this.container.querySelectorAll('.btn-remove-keepout').forEach(btn => {
    btn.addEventListener('click', e => {
      const koId = (e.currentTarget as HTMLElement).getAttribute('data-ko-id');
      if (koId) this.store.removeKeepOut(zoneId, koId);
    });
  });

  // Electrical inputs
  const modName = document.getElementById('module-name') as HTMLInputElement;
  const modW = document.getElementById('module-wattage') as HTMLInputElement;
  const modVoc = document.getElementById('module-voc') as HTMLInputElement;
  const modVmp = document.getElementById('module-vmp') as HTMLInputElement;
  const modIsc = document.getElementById('module-isc') as HTMLInputElement;
  const modDimW = document.getElementById('module-w') as HTMLInputElement;
  const modDimL = document.getElementById('module-l') as HTMLInputElement;

  const syncElectrical = () => {
    this.store.updateZoneConfig(zoneId, {
      panelWidthMm: Number(modDimW.value) || 1134,
      panelLengthMm: Number(modDimL.value) || 1762,
      electrical: {
        modelName: modName.value || 'Standard PV Module',
        nominalPowerW: Number(modW.value) || 400,
        voc: Number(modVoc.value) || 40,
        vmp: Number(modVmp.value) || 32,
        isc: Number(modIsc.value) || 13,
        imp: Number(modW.value) / (Number(modVmp.value) || 32)
      }
    });
  };

  [modName, modW, modVoc, modVmp, modIsc, modDimW, modDimL].forEach(input => {
    input?.addEventListener('change', syncElectrical);
  });
}

export function attachEmptyStateListeners(this: SidebarUI): void {
  const btnRoof = document.getElementById('btn-draw-roof');
  btnRoof?.addEventListener('click', () => {
    const isDrawingRoof = this.store.drawingMode === 'zone' && this.store.drawingMountType === 'roof';
    this.store.setDrawingMode(isDrawingRoof ? 'none' : 'zone', 'roof');
  });

  const btnGround = document.getElementById('btn-draw-ground');
  btnGround?.addEventListener('click', () => {
    const isDrawingGround = this.store.drawingMode === 'zone' && this.store.drawingMountType === 'ground';
    this.store.setDrawingMode(isDrawingGround ? 'none' : 'zone', 'ground');
  });

  const zoneItems = this.container.querySelectorAll('.zone-list-item');
  zoneItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const zoneId = item.getAttribute('data-zone-id');
      const isMulti = (e as MouseEvent).shiftKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey;
      if (zoneId) this.store.selectZone(zoneId, isMulti);
    });
  });
}
