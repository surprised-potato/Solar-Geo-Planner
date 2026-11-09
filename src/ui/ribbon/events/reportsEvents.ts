/**
 * Reports tab listeners: exports, imports and report launchers.
 */
import type { RibbonUI } from '../../ribbon';

export function attachReportsTabListeners(this: RibbonUI): void {
  // --- Reports Tab Listeners ---
  document.getElementById('ribbon-btn-gen-pdf')?.addEventListener('click', () => {
    if (typeof window !== 'undefined' && (window as any).openPdfReport) {
      (window as any).openPdfReport(this.store.getSelectedSystem()?.id);
    } else {
      document.getElementById('btn-open-pdf-report')?.click();
    }
  });

  document.getElementById('ribbon-btn-open-tables-reg')?.addEventListener('click', () => {
    document.getElementById('btn-open-tables')?.click();
  });

  document.getElementById('ribbon-btn-open-panel-reg')?.addEventListener('click', () => {
    document.getElementById('btn-open-registry')?.click();
  });

  document.getElementById('ribbon-btn-home-tables')?.addEventListener('click', () => {
    document.getElementById('btn-open-tables')?.click();
  });

  document.getElementById('ribbon-btn-export-csv')?.addEventListener('click', () => {
    document.getElementById('btn-export-modal-csv')?.click();
  });

  document.getElementById('ribbon-btn-export-project-json')?.addEventListener('click', () => {
    document.getElementById('btn-export-json')?.click();
  });

  document.getElementById('ribbon-btn-import-project-json')?.addEventListener('click', () => {
    document.getElementById('btn-import-json')?.click();
  });

  document.getElementById('ribbon-btn-export-geojson')?.addEventListener('click', () => {
    document.getElementById('btn-export-modal-geojson')?.click();
  });

  document.getElementById('ribbon-btn-rep-boq')?.addEventListener('click', () => {
    this.onViewModeChange?.('boq');
  });

  document.getElementById('ribbon-btn-rep-sim')?.addEventListener('click', () => {
    this.onViewModeChange?.('simulation');
  });

  document.getElementById('ribbon-btn-rep-sld')?.addEventListener('click', () => {
    this.onViewModeChange?.('sld');
  });
}
