/**
 * Listeners for the zone-scoped tabs (orientation, spacing, obstacles, module, stringing).
 */
import { calculateRecommendedRowSpacing } from '../../../geo/autofill';
import { DEFAULT_GROUND_CONFIG, DEFAULT_ROOF_CONFIG, StringTraverseDirection } from '../../../types/solar';
import type { RibbonUI } from '../../ribbon';

export function attachZoneTabListeners(this: RibbonUI, zoneId: string): void {
  // --- Tab 1: Orientation listeners ---
  const nameInput = document.getElementById('ribbon-zone-name') as HTMLInputElement;
  nameInput?.addEventListener('change', () => {
    const z = this.store.getZone(zoneId);
    if (z) z.name = nameInput.value;
  });

  document.getElementById('ribbon-delete-zone')?.addEventListener('click', () => {
    const selZones = this.store.getSelectedZones();
    if (selZones.length === 0) return;
    const msg = selZones.length > 1
      ? `Delete all ${selZones.length} selected arrays and their panels?`
      : `Delete array "${selZones[0].name}" and all its panels?`;
    if (confirm(msg)) {
      for (const z of selZones) {
        this.store.removeZone(z.id);
      }
    }
  });

  document.getElementById('ribbon-mount-roof')?.addEventListener('click', () => {
    this.store.updateZoneConfig(zoneId, {
      ...DEFAULT_ROOF_CONFIG,
      mountType: 'roof'
    });
  });

  document.getElementById('ribbon-mount-ground')?.addEventListener('click', () => {
    this.store.updateZoneConfig(zoneId, {
      ...DEFAULT_GROUND_CONFIG,
      mountType: 'ground'
    });
  });

  document.getElementById('ribbon-orient-portrait')?.addEventListener('click', () => {
    this.store.updateZoneConfig(zoneId, { orientation: 'portrait' });
  });
  document.getElementById('ribbon-orient-landscape')?.addEventListener('click', () => {
    this.store.updateZoneConfig(zoneId, { orientation: 'landscape' });
  });

  const setRailCount = (count: 2 | 3) => {
    const selZones = this.store.getSelectedZones();
    if (selZones.length > 0) {
      for (const z of selZones) {
        if (z.config.mountType === 'roof') {
          this.store.updateZoneConfig(z.id, { railCount: count });
        }
      }
    } else if (zoneId) {
      this.store.updateZoneConfig(zoneId, { railCount: count });
    }
  };

  document.getElementById('ribbon-rails-2')?.addEventListener('click', () => setRailCount(2));
  document.getElementById('ribbon-rails-3')?.addEventListener('click', () => setRailCount(3));
  document.getElementById('ribbon-spacing-rails-2')?.addEventListener('click', () => setRailCount(2));
  document.getElementById('ribbon-spacing-rails-3')?.addEventListener('click', () => setRailCount(3));

  const railOverhangInput = document.getElementById('ribbon-rail-overhang') as HTMLInputElement;
  railOverhangInput?.addEventListener('change', () => {
    const overhang = Math.max(0, parseFloat(railOverhangInput.value) || 0.10);
    this.store.updateZoneConfig(zoneId, { railOverhangM: overhang });
  });

  const azRange = document.getElementById('ribbon-azimuth-range') as HTMLInputElement;
  const azNum = document.getElementById('ribbon-azimuth-num') as HTMLInputElement;
  const azValBadge = document.getElementById('ribbon-azimuth-val');

  const syncAz = (val: number) => {
    const deg = Math.round(val);
    if (azNum && azNum.value !== String(deg)) azNum.value = String(deg);
    if (azRange && azRange.value !== String(deg)) azRange.value = String(deg);
    if (azValBadge) azValBadge.textContent = `${deg}° (${this.getCompassHeading(deg)})`;
    const steps = this.isInteractingAzimuthSlider ? 6 : 12;
    this.store.updateZoneConfig(zoneId, { azimuthDeg: deg }, true, steps);
  };

  azRange?.addEventListener('mousedown', () => { this.isInteractingAzimuthSlider = true; });
  azRange?.addEventListener('touchstart', () => { this.isInteractingAzimuthSlider = true; }, { passive: true });

  azRange?.addEventListener('input', () => syncAz(Number(azRange.value)));
  azNum?.addEventListener('change', () => syncAz(Number(azNum.value)));

  // Compass Preset Pills
  this.container.querySelectorAll<HTMLButtonElement>('[data-azimuth]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = Number(btn.getAttribute('data-azimuth'));
      if (!isNaN(val)) syncAz(val);
    });
  });

  const tiltRange = document.getElementById('ribbon-tilt-range') as HTMLInputElement;
  const tiltNum = document.getElementById('ribbon-tilt-num') as HTMLInputElement;
  const tiltValBadge = document.getElementById('ribbon-tilt-val');
  const footprintVal = document.getElementById('ribbon-footprint-val');

  const syncTilt = (val: number) => {
    const deg = Math.round(val);
    if (tiltNum && tiltNum.value !== String(deg)) tiltNum.value = String(deg);
    if (tiltRange && tiltRange.value !== String(deg)) tiltRange.value = String(deg);
    if (tiltValBadge) tiltValBadge.textContent = `${deg}°`;

    const z = this.store.getZone(zoneId);
    if (z && footprintVal) {
      const cfg = z.config;
      const fp = (
        cfg.orientation === 'portrait'
          ? (cfg.panelLengthMm / 1000) * Math.cos((deg * Math.PI) / 180)
          : (cfg.panelWidthMm / 1000) * Math.cos((deg * Math.PI) / 180)
      ).toFixed(2);
      footprintVal.innerHTML = `Footprint: <strong>${fp}m</strong>`;
    }

    this.store.updateZoneConfig(zoneId, { tiltDeg: deg });
  };

  tiltRange?.addEventListener('mousedown', () => { this.isInteractingSlider = true; });
  tiltRange?.addEventListener('touchstart', () => { this.isInteractingSlider = true; }, { passive: true });
  tiltRange?.addEventListener('input', () => syncTilt(Number(tiltRange.value)));
  tiltNum?.addEventListener('change', () => syncTilt(Number(tiltNum.value)));

  // Tilt Preset Pills
  this.container.querySelectorAll<HTMLButtonElement>('[data-tilt]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = Number(btn.getAttribute('data-tilt'));
      if (!isNaN(val)) syncTilt(val);
    });
  });

  document.getElementById('ribbon-btn-toggle-tilt-arrows')?.addEventListener('click', () => {
    const next = !(this.store.viewFilter.showTiltArrows !== false);
    this.store.setViewFilter({ showTiltArrows: next });
  });

  const tab1ElevInput = document.getElementById('ribbon-tab1-elev-delta') as HTMLInputElement;
  tab1ElevInput?.addEventListener('change', () => {
    const val = Number(tab1ElevInput.value) || 0;
    this.store.setZoneElevationDelta(zoneId, val);
    const z = this.store.getZone(zoneId);
    if (z?.raceway) {
      this.store.setRacewayElevationChange(zoneId, val);
    }
  });

  // --- Tab 2: Spacing & Optimizer listeners ---
  const tableUpInput = document.getElementById('ribbon-table-up') as HTMLInputElement;
  const tableWideInput = document.getElementById('ribbon-table-wide') as HTMLInputElement;
  tableUpInput?.addEventListener('change', () => {
    const up = Math.max(1, parseInt(tableUpInput.value) || 2);
    this.store.updateZoneConfig(zoneId, { modulesPerTableUp: up });
  });
  tableWideInput?.addEventListener('change', () => {
    const wide = Math.max(1, parseInt(tableWideInput.value) || 14);
    this.store.updateZoneConfig(zoneId, { modulesPerTableWide: wide });
  });

  this.container.querySelectorAll<HTMLButtonElement>('[data-table-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-table-preset');
      if (preset === '2x14') this.store.updateZoneConfig(zoneId, { modulesPerTableUp: 2, modulesPerTableWide: 14 });
      else if (preset === '2x20') this.store.updateZoneConfig(zoneId, { modulesPerTableUp: 2, modulesPerTableWide: 20 });
      else if (preset === '1x28') this.store.updateZoneConfig(zoneId, { modulesPerTableUp: 1, modulesPerTableWide: 28 });
      else if (preset === '4x6') this.store.updateZoneConfig(zoneId, { modulesPerTableUp: 4, modulesPerTableWide: 6 });
    });
  });

  const tableGapRange = document.getElementById('ribbon-table-gap-range') as HTMLInputElement;
  const tableGapNum = document.getElementById('ribbon-table-gap-num') as HTMLInputElement;
  const tableGapBadge = document.getElementById('ribbon-table-gap-val');

  const syncTableGap = (val: number) => {
    if (tableGapNum && tableGapNum.value !== String(val)) tableGapNum.value = String(val);
    if (tableGapRange && tableGapRange.value !== String(val)) tableGapRange.value = String(val);
    if (tableGapBadge) tableGapBadge.textContent = `${val.toFixed(2)} m`;
    this.store.updateZoneConfig(zoneId, { tableSpacingM: val });
  };

  tableGapRange?.addEventListener('mousedown', () => { this.isInteractingSlider = true; });
  tableGapRange?.addEventListener('touchstart', () => { this.isInteractingSlider = true; }, { passive: true });
  tableGapRange?.addEventListener('input', () => syncTableGap(Number(tableGapRange.value)));
  tableGapNum?.addEventListener('change', () => syncTableGap(Number(tableGapNum.value)));

  this.container.querySelectorAll<HTMLButtonElement>('[data-tablegap]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = Number(btn.getAttribute('data-tablegap'));
      if (!isNaN(val)) syncTableGap(val);
    });
  });

  const rowRange = document.getElementById('ribbon-row-range') as HTMLInputElement;
  const rowNum = document.getElementById('ribbon-row-num') as HTMLInputElement;
  const rowValBadge = document.getElementById('ribbon-row-val');

  const syncRow = (val: number) => {
    if (rowNum && rowNum.value !== String(val)) rowNum.value = String(val);
    if (rowRange && rowRange.value !== String(val)) rowRange.value = String(val);
    if (rowValBadge) rowValBadge.textContent = `${val.toFixed(2)} m`;
    this.store.updateZoneConfig(zoneId, { rowSpacingM: val });
  };

  rowRange?.addEventListener('mousedown', () => { this.isInteractingSlider = true; });
  rowRange?.addEventListener('touchstart', () => { this.isInteractingSlider = true; }, { passive: true });
  rowRange?.addEventListener('input', () => syncRow(Number(rowRange.value)));
  rowNum?.addEventListener('change', () => syncRow(Number(rowNum.value)));

  document.getElementById('ribbon-btn-calc-pitch')?.addEventListener('click', () => {
    const z = this.store.getZone(zoneId);
    if (!z) return;
    const lengthM =
      z.config.orientation === 'portrait'
        ? z.config.panelLengthMm / 1000
        : z.config.panelWidthMm / 1000;
    const recPitch = calculateRecommendedRowSpacing(z.config.tiltDeg, lengthM, this.store.center.lat);
    syncRow(recPitch);
  });

  const colRange = document.getElementById('ribbon-col-range') as HTMLInputElement;
  const colNum = document.getElementById('ribbon-col-num') as HTMLInputElement;
  const colValBadge = document.getElementById('ribbon-col-val');

  const syncCol = (val: number) => {
    if (colNum && colNum.value !== String(val)) colNum.value = String(val);
    if (colRange && colRange.value !== String(val)) colRange.value = String(val);
    if (colValBadge) colValBadge.textContent = `${val.toFixed(2)} m`;
    this.store.updateZoneConfig(zoneId, { colSpacingM: val });
  };

  colRange?.addEventListener('mousedown', () => { this.isInteractingSlider = true; });
  colRange?.addEventListener('touchstart', () => { this.isInteractingSlider = true; }, { passive: true });
  colRange?.addEventListener('input', () => syncCol(Number(colRange.value)));
  colNum?.addEventListener('change', () => syncCol(Number(colNum.value)));

  // Col Gap Presets
  this.container.querySelectorAll<HTMLButtonElement>('[data-colgap]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = Number(btn.getAttribute('data-colgap'));
      if (!isNaN(val)) syncCol(val);
    });
  });

  const setRange = document.getElementById('ribbon-set-range') as HTMLInputElement;
  const setNum = document.getElementById('ribbon-set-num') as HTMLInputElement;
  const setValBadge = document.getElementById('ribbon-set-val');

  const syncSet = (val: number) => {
    if (setNum && setNum.value !== String(val)) setNum.value = String(val);
    if (setRange && setRange.value !== String(val)) setRange.value = String(val);
    if (setValBadge) setValBadge.textContent = `${val.toFixed(2)} m`;
    this.store.updateZoneConfig(zoneId, { setbackM: val });
  };

  setRange?.addEventListener('mousedown', () => { this.isInteractingSlider = true; });
  setRange?.addEventListener('touchstart', () => { this.isInteractingSlider = true; }, { passive: true });
  setRange?.addEventListener('input', () => syncSet(Number(setRange.value)));
  setNum?.addEventListener('change', () => syncSet(Number(setNum.value)));

  // Setback Presets
  this.container.querySelectorAll<HTMLButtonElement>('[data-setback]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = Number(btn.getAttribute('data-setback'));
      if (!isNaN(val)) syncSet(val);
    });
  });

  const offX = document.getElementById('ribbon-off-x') as HTMLInputElement;
  const offY = document.getElementById('ribbon-off-y') as HTMLInputElement;
  offX?.addEventListener('change', () => {
    this.store.updateZoneConfig(zoneId, { alignmentOffsetX: Number(offX.value) });
  });
  offY?.addEventListener('change', () => {
    this.store.updateZoneConfig(zoneId, { alignmentOffsetY: Number(offY.value) });
  });

  // One-Click Grid Shift Optimizer & Traversal
  document.getElementById('ribbon-opt-str-direction')?.addEventListener('change', (e) => {
    const newDir = ((e.target as HTMLSelectElement).value as StringTraverseDirection) || 'short_side';
    this.store.setStringTraverseDirection(newDir, zoneId, true);
  });

  document.getElementById('ribbon-btn-opt-shift')?.addEventListener('click', () => {
    const selZones = this.store.getSelectedZones();
    const targetInput = document.getElementById('ribbon-str-target-size') as HTMLInputElement;
    const targetSize = targetInput?.value ? Number(targetInput.value) : undefined;
    const dirSelect = (document.getElementById('ribbon-opt-str-direction') || document.getElementById('ribbon-str-direction')) as HTMLSelectElement;
    const direction = (dirSelect?.value as StringTraverseDirection) || this.store.getStringTraverseDirection(zoneId) || 'short_side';

    if (selZones.length > 1) {
      const res = this.store.optimizeSelectedZonesGridShift(12, true, targetSize, direction);
      const diff = res.totalMaxPanels - res.totalPreviousPanels;
      let msg =
        `🎉 Batch Grid Shift Optimized & Auto-Strung!\n` +
        `Optimized ${res.optimizedCount} Selected Arrays\n` +
        `Total Fitted Panels: ${res.totalMaxPanels} (${diff >= 0 ? `+${diff}` : diff} panels)`;
      if (res.totalStrings !== undefined) {
        msg += `\n⚡ Auto-Strung into ${res.totalStrings} Strings!`;
      }
      if (res.warnings && res.warnings.length > 0) {
        msg += `\n\n⚠️ Notices:\n` + res.warnings.join('\n');
      }
      alert(msg);
    } else {
      const opt = this.store.optimizeZoneGridShift(zoneId, 12, true, targetSize, direction);
      const diff = opt.maxPanelCount - opt.previousPanelCount;
      let msg =
        `🎉 Grid Shift Optimized & Auto-Strung!\n` +
        `Optimal Phase Offset: X=${opt.optimalOffsetX}m, Y=${opt.optimalOffsetY}m\n` +
        `Total Fitted Panels: ${opt.maxPanelCount} (${diff >= 0 ? `+${diff}` : diff} panels)`;
      if (opt.totalStrings !== undefined) {
        msg += `\n⚡ Auto-Strung into ${opt.totalStrings} Strings (${opt.modulesPerString || 0} modules/str)!`;
      }
      if (opt.warnings && opt.warnings.length > 0) {
        msg += `\n\n⚠️ Notices:\n` + opt.warnings.join('\n');
      }
      alert(msg);
    }
  });

  // --- Tab 3: Keep-Out Obstacles ---
  document.getElementById('ribbon-btn-draw-ko')?.addEventListener('click', () => {
    this.store.setDrawingMode(this.store.drawingMode === 'keepout' ? 'none' : 'keepout');
  });

  this.container.querySelectorAll('.btn-ribbon-remove-ko').forEach(btn => {
    btn.addEventListener('click', e => {
      const koId = (e.currentTarget as HTMLElement).getAttribute('data-ko-id');
      if (koId) this.store.removeKeepOut(zoneId, koId);
    });
  });

  // --- Tab 4: Module Specs & Management ---
  const modSelect = document.getElementById('ribbon-module-select') as HTMLSelectElement;
  modSelect?.addEventListener('change', () => {
    if (modSelect.value) {
      this.store.setArrayModule(zoneId, modSelect.value);
    }
  });

  document.getElementById('ribbon-btn-new-module')?.addEventListener('click', () => {
    const name = prompt('Enter custom panel model name (e.g. Trina Solar Vertex 650W):');
    if (!name || !name.trim()) return;

    const wattage = Number(prompt('Nominal Power (Wp):', '600')) || 600;
    const voc = Number(prompt('Open Circuit Voltage Voc (V):', '48.1')) || 48.1;
    const vmp = Number(prompt('Max Power Voltage Vmp (V):', '40.2')) || 40.2;
    const isc = Number(prompt('Short Circuit Current Isc (A):', '15.85')) || 15.85;
    const imp = Number(prompt('Max Power Current Imp (A):', '14.93')) || 14.93;
    const width = Number(prompt('Width (mm):', '1134')) || 1134;
    const length = Number(prompt('Length (mm):', '2382')) || 2382;

    const newMod = {
      id: `mod_${Date.now()}`,
      name: name.trim(),
      manufacturer: 'Custom',
      nominalPowerW: wattage,
      voc,
      vmp,
      isc,
      imp,
      widthMm: width,
      lengthMm: length,
      bifacial: true,
      tempCoeffVoc: -0.28,
      tempCoeffPmax: -0.35
    };

    this.store.addModule(newMod);
    this.store.setArrayModule(zoneId, newMod.id);
  });

  const modW = document.getElementById('ribbon-mod-w') as HTMLInputElement;
  const modVoc = document.getElementById('ribbon-mod-voc') as HTMLInputElement;
  const modVmp = document.getElementById('ribbon-mod-vmp') as HTMLInputElement;
  const modIsc = document.getElementById('ribbon-mod-isc') as HTMLInputElement;
  const modImp = document.getElementById('ribbon-mod-imp') as HTMLInputElement;
  const modDimW = document.getElementById('ribbon-mod-dimw') as HTMLInputElement;
  const modDimL = document.getElementById('ribbon-mod-diml') as HTMLInputElement;

  const syncMod = () => {
    const zoneObj = this.store.getZone(zoneId);
    if (!zoneObj) return;

    this.store.updateZoneConfig(zoneId, {
      panelWidthMm: Number(modDimW?.value) || 1134,
      panelLengthMm: Number(modDimL?.value) || 2382,
      electrical: {
        modelName: zoneObj.config.electrical.modelName,
        nominalPowerW: Number(modW?.value) || 600,
        voc: Number(modVoc?.value) || 48.1,
        vmp: Number(modVmp?.value) || 40.2,
        isc: Number(modIsc?.value) || 15.85,
        imp: Number(modImp?.value) || 14.93
      }
    });
  };

  [modW, modVoc, modVmp, modIsc, modImp, modDimW, modDimL].forEach(input => {
    input?.addEventListener('change', syncMod);
  });
}
