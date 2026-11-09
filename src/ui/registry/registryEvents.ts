/**
 * Event wiring for the registry modal's tables and inline editors.
 */
import { SingleLineDiagramUI } from '../sldView';
import { BoqAndDupaUI } from '../boqView';
import type { RegistryModalUI } from '../registryModal';
import { TableViewTab } from '../registryModal';
import { attachPanelsTableListeners } from './panelsTable';
import { attachStringsTableListeners } from './stringsTable';
import { attachKeepOutsTableListeners } from './keepOutsTable';
import { attachRacewaysTableListeners } from './racewaysTable';
import { attachSystemsTableListeners } from './systemsTable';
import { attachArraysTableListeners } from './arraysTable';
import { attachBuildingsTableListeners } from './buildingsTable';
import { attachEquipmentTableListeners } from './equipmentTable';

export function attachModalListeners(this: RegistryModalUI): void {
  if (this.activeTab === 'sld') {
    const mountEl = this.dialog.querySelector('#modal-sld-mount') as HTMLElement;
    if (mountEl) {
      const sldSysId = this.filterSystemId !== 'all' ? this.filterSystemId : this.store.getSelectedSystem()?.id;
      new SingleLineDiagramUI(mountEl, this.store, sldSysId);
    }
  }

  if (this.activeTab === 'boq') {
    const mountEl = this.dialog.querySelector('#modal-boq-mount') as HTMLElement;
    if (mountEl) {
      // One long-lived view: re-creating it on every modal render leaked store subscribers and
      // reset the BOQ tab back to the summary after each edit.
      if (this.boqUi) {
        this.boqUi.rebind(mountEl, this.filterSystemId);
      } else {
        this.boqUi = new BoqAndDupaUI(mountEl, this.store, this.filterSystemId);
      }
    }
  }

  // 1. Tab switching
  this.dialog.querySelectorAll('.tbl-tab-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const tab = (e.currentTarget as HTMLElement).getAttribute('data-tab') as TableViewTab;
      if (tab) {
        this.setActiveTab(tab);
      }
    });
  });

  // 2. Search & Filters
  const searchInput = document.getElementById('modal-search') as HTMLInputElement;
  searchInput?.addEventListener('input', () => {
    this.searchKeyword = searchInput.value;
    this.panelPage = 1;
    this.render();
  });

  const onSystemFilterChange = (val: string) => {
    this.setSystemFilter(val);
  };

  const globalSysFilter = document.getElementById('modal-global-system-filter') as HTMLSelectElement;
  globalSysFilter?.addEventListener('change', () => onSystemFilterChange(globalSysFilter.value));

  const tabSysFilter = document.getElementById('modal-system-filter') as HTMLSelectElement;
  tabSysFilter?.addEventListener('change', () => onSystemFilterChange(tabSysFilter.value));

  document.getElementById('btn-reset-system-filter')?.addEventListener('click', () => {
    this.setSystemFilter('all');
  });

  const zoneFilter = document.getElementById('modal-zone-filter') as HTMLSelectElement;
  zoneFilter?.addEventListener('change', () => {
    this.filterZoneId = zoneFilter.value;
    this.panelPage = 1;
    this.render();
  });

  const statusFilter = document.getElementById('modal-status-filter') as HTMLSelectElement;
  statusFilter?.addEventListener('change', () => {
    this.filterStatus = statusFilter.value;
    this.panelPage = 1;
    this.render();
  });

  // Pagination buttons for Panels Table
  this.dialog.querySelectorAll('.btn-page-prev').forEach(btn => {
    btn.addEventListener('click', () => {
      if (this.panelPage > 1) {
        this.panelPage--;
        this.render();
      }
    });
  });

  this.dialog.querySelectorAll('.btn-page-next').forEach(btn => {
    btn.addEventListener('click', () => {
      this.panelPage++;
      this.render();
    });
  });

  attachBuildingsTableListeners.call(this);
  attachEquipmentTableListeners.call(this);
  attachArraysTableListeners.call(this);
  attachSystemsTableListeners.call(this);
  attachRacewaysTableListeners.call(this);
  attachKeepOutsTableListeners.call(this);
  attachStringsTableListeners.call(this);
  attachPanelsTableListeners.call(this);
}
