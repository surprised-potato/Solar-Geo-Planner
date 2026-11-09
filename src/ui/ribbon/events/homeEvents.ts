/**
 * Home tab + global ribbon command listeners (system/array selectors, draw tools, view switching).
 */
import L from 'leaflet';
import type { RibbonTab } from '../../ribbon';
import type { RibbonUI } from '../../ribbon';

export function attachHomeTabListeners(this: RibbonUI, zoneId?: string): void {
  const sysSelect = document.getElementById('ribbon-system-select') as HTMLSelectElement;
  sysSelect?.addEventListener('change', () => {
    this.store.selectSystem(sysSelect.value);
  });

  document.getElementById('ribbon-btn-new-system')?.addEventListener('click', () => {
    const name = prompt('Enter a name for the new independent system (e.g., Inverter 2 / Carport System):');
    if (name && name.trim()) {
      this.store.addSystem(name.trim());
    }
  });

  document.getElementById('ribbon-btn-open-pdf')?.addEventListener('click', () => {
    if (typeof window !== 'undefined' && (window as any).openPdfReport) {
      (window as any).openPdfReport(this.store.getSelectedSystem()?.id);
    }
  });

  document.getElementById('ribbon-btn-edit-system')?.addEventListener('click', () => {
    const curSys = this.store.getSelectedSystem();
    if (!curSys) return;
    const newName = prompt('Rename system:', curSys.name);
    if (newName && newName.trim()) {
      this.store.updateSystem(curSys.id, { name: newName.trim() });
    }
  });

  document.getElementById('ribbon-btn-delete-system')?.addEventListener('click', () => {
    const curSys = this.store.getSelectedSystem();
    if (!curSys) return;

    const associatedZones = this.store.getZones().filter(z => z.systemId === curSys.id);
    const totalPanels = associatedZones.reduce((sum, z) => sum + z.activePanelCount, 0);
    const totalKwp = Number(associatedZones.reduce((sum, z) => sum + z.totalKwp, 0).toFixed(2));

    const warningMessage =
      `⚠️ WARNING: PERMANENT DELETION\n\n` +
      `Are you sure you want to delete electrical system "${curSys.name}"?\n\n` +
      `This will permanently delete:\n` +
      ` • The electrical system (${curSys.inverter.inverterCount}×${curSys.inverter.ratedAcPowerKw} kW Inverter Station)\n` +
      ` • ${associatedZones.length} associated array zone(s)\n` +
      ` • ${totalPanels} solar panels (${totalKwp} kWp)\n` +
      ` • All associated string circuits, homerun raceways, and AC feeders\n\n` +
      `This action cannot be undone. Do you wish to proceed?`;

    if (confirm(warningMessage)) {
      this.store.removeSystem(curSys.id, true);
    }
  });

  const zoneSelect = document.getElementById('ribbon-zone-select') as HTMLSelectElement;
  zoneSelect?.addEventListener('change', () => {
    if (zoneSelect.value === '__batch__') return;
    this.store.selectZone(zoneSelect.value, false);
    this.mapController?.zoomToZone(zoneSelect.value);
  });

  const num = (id: string, fallback: number): number => {
    const v = parseFloat((document.getElementById(id) as HTMLInputElement | null)?.value ?? '');
    return Number.isFinite(v) ? v : fallback;
  };
  document.getElementById('ribbon-btn-copy')?.addEventListener('click', () => { this.store.copySelectedZones(); this.store.notify(); });
  document.getElementById('ribbon-btn-cut')?.addEventListener('click', () => { this.store.cutSelectedZones(); });
  document.getElementById('ribbon-btn-paste')?.addEventListener('click', () => { this.store.pasteZones(); });
  document.getElementById('ribbon-btn-duplicate')?.addEventListener('click', () => { this.store.duplicateSelectedZones(); });
  document.getElementById('ribbon-btn-flip-h')?.addEventListener('click', () => { this.store.flipSelectedZones('horizontal'); });
  document.getElementById('ribbon-btn-flip-v')?.addEventListener('click', () => { this.store.flipSelectedZones('vertical'); });
  document.getElementById('ribbon-btn-move')?.addEventListener('click', () => {
    this.store.moveSelectedZones(num('ribbon-move-east', 0), num('ribbon-move-north', 0));
  });
  document.getElementById('ribbon-btn-rotate-cw')?.addEventListener('click', () => {
    this.store.rotateSelectedZones(num('ribbon-rotate-deg', 15));
  });
  document.getElementById('ribbon-btn-rotate-ccw')?.addEventListener('click', () => {
    this.store.rotateSelectedZones(-num('ribbon-rotate-deg', 15));
  });

  document.getElementById('ribbon-btn-select-all')?.addEventListener('click', () => {
    const allZones = this.store.getZones();
    const selZones = this.store.getSelectedZones();
    if (selZones.length === allZones.length) {
      this.store.clearZoneSelection();
    } else {
      this.store.selectAllZones();
    }
  });

  document.getElementById('ribbon-btn-batch-opt')?.addEventListener('click', () => {
    const res = this.store.optimizeSelectedZonesGridShift(12);
    const diff = res.totalMaxPanels - res.totalPreviousPanels;
    let msg = `🎉 Batch Grid Shift Optimized & Auto-Strung!\nOptimized ${res.optimizedCount} Selected Arrays\nTotal Fitted Panels: ${res.totalMaxPanels} (${diff >= 0 ? `+${diff}` : diff} panels)`;
    if (res.totalStrings !== undefined) {
      msg += `\n⚡ Auto-Strung into ${res.totalStrings} Strings!`;
    }
    if (res.warnings && res.warnings.length > 0) {
      msg += `\n\n⚠️ Notices:\n` + res.warnings.join('\n');
    }
    alert(msg);
  });

  document.getElementById('ribbon-btn-batch-clear')?.addEventListener('click', () => {
    this.store.clearZoneSelection();
  });

  document.getElementById('ribbon-btn-zoom-array')?.addEventListener('click', () => {
    const selZones = this.store.getSelectedZones();
    if (selZones.length === 1) {
      this.mapController?.zoomToZone(selZones[0].id);
    } else if (selZones.length > 1 && this.mapController) {
      const map = this.mapController.getMap();
      const allPoints: [number, number][] = [];
      for (const z of selZones) {
        for (const v of z.vertices) {
          allPoints.push([v.lat, v.lng]);
        }
      }
      if (allPoints.length > 0) {
        map.flyToBounds(L.latLngBounds(allPoints), { padding: [60, 60], maxZoom: 21, duration: 1.0 });
      }
    }
  });

  document.getElementById('ribbon-btn-match-props')?.addEventListener('click', () => {
    const zones = this.store.getZones();
    if (zones.length < 2) {
      alert('Match Properties requires at least 2 arrays in the project. Please draw another array first.');
      return;
    }
    this.matchPropsModal.open(this.store.selectedZoneId || undefined);
  });

  document.getElementById('ribbon-btn-exit-match-props')?.addEventListener('click', () => {
    this.store.setMatchPropsMode(false);
  });

  document.getElementById('ribbon-tab1-btn-zoom-array')?.addEventListener('click', () => {
    if (zoneId) {
      this.mapController?.zoomToZone(zoneId);
    }
  });

  document.getElementById('ribbon-tab1-btn-delete-array')?.addEventListener('click', () => {
    if (zoneId) {
      const zone = this.store.getZone(zoneId);
      if (confirm(`Delete array "${zone?.name || 'Array'}" and its modules from project?`)) {
        this.store.removeZone(zoneId);
      }
    }
  });

  const linkSysSelect = document.getElementById('ribbon-link-system-select') as HTMLSelectElement;
  linkSysSelect?.addEventListener('change', () => {
    if (zoneId && linkSysSelect.value) {
      this.store.linkZoneToSystem(zoneId, linkSysSelect.value);
    }
  });

  document.getElementById('ribbon-btn-new-roof')?.addEventListener('click', () => {
    const isDrawingRoof = this.store.drawingMode === 'zone' && this.store.drawingMountType === 'roof';
    this.store.setDrawingMode(isDrawingRoof ? 'none' : 'zone', 'roof');
  });
  document.getElementById('ribbon-btn-new-ground')?.addEventListener('click', () => {
    const isDrawingGround = this.store.drawingMode === 'zone' && this.store.drawingMountType === 'ground';
    this.store.setDrawingMode(isDrawingGround ? 'none' : 'zone', 'ground');
  });
  document.getElementById('ribbon-btn-new-ko')?.addEventListener('click', () => {
    const isDrawingKo = this.store.drawingMode === 'keepout';
    this.store.setDrawingMode(isDrawingKo ? 'none' : 'keepout');
  });
  document.getElementById('ribbon-btn-new-raceway')?.addEventListener('click', () => {
    if (this.store.drawingMode === 'raceway') {
      this.mapController?.finishDrawing();
    } else {
      this.store.setDrawingMode('raceway');
    }
  });
  document.getElementById('ribbon-btn-new-inverter')?.addEventListener('click', () => {
    const isPlacingInv = this.store.drawingMode === 'inverter';
    this.store.setDrawingMode(isPlacingInv ? 'none' : 'inverter');
  });
  document.getElementById('ribbon-btn-new-pcc')?.addEventListener('click', () => {
    const isPlacingPcc = this.store.drawingMode === 'ac_interconnection';
    this.store.setDrawingMode(isPlacingPcc ? 'none' : 'ac_interconnection');
  });
  document.getElementById('ribbon-btn-new-ac-feeder')?.addEventListener('click', () => {
    if (this.store.drawingMode === 'ac_raceway') {
      this.mapController?.finishDrawing();
    } else {
      this.store.setDrawingMode('ac_raceway');
    }
  });

  document.getElementById('ribbon-empty-roof')?.addEventListener('click', () => {
    this.store.setDrawingMode('zone', 'roof');
  });
  document.getElementById('ribbon-empty-ground')?.addEventListener('click', () => {
    this.store.setDrawingMode('zone', 'ground');
  });

  document.getElementById('ribbon-toggle-collapse')?.addEventListener('click', () => {
    this.toggleCollapse();
  });

  this.container.querySelectorAll('.ribbon-tab-item, .ribbon-tab-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab') as RibbonTab;
      if (tab) this.setActiveTab(tab);
    });
  });

  document.getElementById('ribbon-btn-open-full-sld')?.addEventListener('click', () => {
    this.onViewModeChange?.('sld');
  });

  document.getElementById('ribbon-btn-open-modal-sld')?.addEventListener('click', () => {
    const btnOpenTables = document.getElementById('btn-open-tables');
    btnOpenTables?.click();
  });

  document.getElementById('ribbon-btn-return-map')?.addEventListener('click', () => {
    this.setActiveTab('orientation');
    this.onViewModeChange?.('map');
  });
}
