/**
 * Load profile modal event wiring and CSV bill / diurnal-curve upload parsing.
 */
import { LoadProfileArchetype } from '../../types/solar';
import { parseMonthlyBillingCsv, parseDiurnalCurveCsv, parse8760IntervalCsv } from '../../geo/loadProfile';
import type { LoadProfileModalUI } from '../loadProfileModal';
import { LoadModalTab, DiurnalViewMode } from '../loadProfileModal';

export function handleFileUpload(this: LoadProfileModalUI, file: File): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    if (!text) return;

    try {
      const lineCount = text.split(/\r?\n/).filter(l => l.trim().length > 0).length;

      if (lineCount >= 8000) {
        // 8760 interval log
        const parsed = parse8760IntervalCsv(text);
        const current = this.store.ensureLoadProfile(this.targetSystemId);
        this.store.setLoadProfile({
          ...current,
          annualKwh: parsed.annualKwh,
          monthlyBreakdown: parsed.monthlyRecords,
          defaultDailyCurve: parsed.diurnalCurve,
          archetype: 'custom',
          sourceType: 'csv_8760',
          sourceFileName: file.name,
          updatedAt: new Date().toISOString()
        });
        this.uploadMessage = {
          type: 'success',
          text: `Successfully imported 8760 AMI dataset from "${file.name}"! Derived ${parsed.annualKwh.toLocaleString()} kWh/yr (Peak: ${parsed.peakDemandKw} kW).`
        };
      } else if (lineCount <= 26 && lineCount >= 23) {
        // 24-hour diurnal profile
        const curve = parseDiurnalCurveCsv(text);
        const current = this.store.ensureLoadProfile(this.targetSystemId);
        this.store.setLoadProfile({
          ...current,
          defaultDailyCurve: curve,
          archetype: 'custom',
          sourceType: 'csv_hourly',
          sourceFileName: file.name,
          updatedAt: new Date().toISOString()
        });
        this.uploadMessage = {
          type: 'success',
          text: `Successfully imported 24-hour diurnal profile curve from "${file.name}".`
        };
      } else {
        // Assume 12-month utility bills
        const records = parseMonthlyBillingCsv(text);
        const current = this.store.ensureLoadProfile(this.targetSystemId);
        const sumKwh = records.reduce((s, r) => s + r.consumptionKwh, 0);
        this.store.setLoadProfile({
          ...current,
          annualKwh: sumKwh,
          monthlyBreakdown: records,
          sourceType: 'csv_monthly',
          sourceFileName: file.name,
          updatedAt: new Date().toISOString()
        });
        this.uploadMessage = {
          type: 'success',
          text: `Successfully imported 12 monthly utility billing records from "${file.name}"! Total Annual Load: ${sumKwh.toLocaleString()} kWh.`
        };
      }
    } catch (err: any) {
      this.uploadMessage = {
        type: 'error',
        text: `CSV Parsing Failed: ${err?.message || 'Unknown format'}`
      };
    }
    this.render();
  };
  reader.readAsText(file);
}

export function attachEventListeners(this: LoadProfileModalUI): void {
  // Close buttons
  this.container.querySelector('#btn-close-load-modal')?.addEventListener('click', () => this.close());
  this.container.querySelector('#btn-close-load-modal-footer')?.addEventListener('click', () => this.close());

  // Backdrop click
  this.container.onclick = (e) => {
    if (e.target === this.container) {
      this.close();
    }
  };

  // Cross-link to Solar Yield Modal
  this.container.querySelector('#btn-crosslink-solar-yield')?.addEventListener('click', () => {
    this.close();
    if (this.onOpenYieldModal) {
      this.onOpenYieldModal(this.targetSystemId, 'yield');
    }
  });

  this.container.querySelector('#btn-crosslink-simulation')?.addEventListener('click', () => {
    this.close();
    if (this.onOpenYieldModal) {
      this.onOpenYieldModal(this.targetSystemId, 'simulation');
    }
  });

  // Reset Defaults
  this.container.querySelector('#btn-reset-load-defaults')?.addEventListener('click', () => {
    if (confirm('Reset facility load profile to default commercial office baseline?')) {
      this.store.setLoadProfile(null);
      this.store.ensureLoadProfile(this.targetSystemId);
      this.uploadMessage = null;
      this.render();
    }
  });

  // Tab buttons
  this.container.querySelectorAll<HTMLElement>('.load-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab') as LoadModalTab;
      if (tab && tab !== this.activeTab) {
        this.activeTab = tab;
        this.render();
      }
    });
  });

  // Quick Annual Scale
  document.getElementById('btn-apply-annual-scale')?.addEventListener('click', () => {
    const inputEl = document.getElementById('input-quick-annual') as HTMLInputElement;
    if (inputEl) {
      const val = parseFloat(inputEl.value);
      if (!isNaN(val) && val > 0) {
        this.store.scaleAnnualLoad(val);
      }
    }
  });

  // Tariff rate change
  document.getElementById('input-tariff-rate')?.addEventListener('change', (e) => {
    const rate = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(rate) && rate >= 0) {
      const cur = this.store.ensureLoadProfile(this.targetSystemId);
      this.store.setLoadProfile({
        ...cur,
        averageTariffRatePhp: rate,
        updatedAt: new Date().toISOString()
      });
    }
  });

  // Monthly table input change
  this.container.querySelectorAll<HTMLInputElement>('.input-month-kwh').forEach(input => {
    input.addEventListener('change', () => {
      const monthIdx = parseInt(input.getAttribute('data-month') || '0', 10);
      const kwh = parseFloat(input.value) || 0;
      this.store.updateMonthlyLoad(monthIdx, kwh);
    });
  });

  this.container.querySelectorAll<HTMLInputElement>('.input-month-peak').forEach(input => {
    input.addEventListener('change', () => {
      const monthIdx = parseInt(input.getAttribute('data-month') || '0', 10);
      const peak = input.value.trim() ? parseFloat(input.value) : undefined;
      const curKwh = this.store.ensureLoadProfile(this.targetSystemId).monthlyBreakdown[monthIdx].consumptionKwh;
      this.store.updateMonthlyLoad(monthIdx, curKwh, peak);
    });
  });

  // Archetype selection
  this.container.querySelectorAll<HTMLElement>('.btn-archetype').forEach(btn => {
    btn.addEventListener('click', () => {
      const arch = btn.getAttribute('data-archetype') as LoadProfileArchetype;
      if (arch) {
        this.store.applyLoadArchetype(arch);
      }
    });
  });

  // Diurnal View Mode buttons (Dual, Weekday, Weekend)
  this.container.querySelectorAll<HTMLButtonElement>('.btn-diurnal-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode') as DiurnalViewMode;
      if (mode && mode !== this.diurnalViewMode) {
        this.diurnalViewMode = mode;
        this.render();
      }
    });
  });

  // Weekend Profile Checkbox
  document.getElementById('chk-weekend-profile')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    const cur = this.store.ensureLoadProfile(this.targetSystemId);
    this.store.setLoadProfile({
      ...cur,
      hasWeekendProfile: checked,
      updatedAt: new Date().toISOString()
    });
  });

  // CSV Template Downloads
  document.getElementById('btn-download-monthly-template')?.addEventListener('click', () => {
    this.handleDownloadTemplate('monthly');
  });

  document.getElementById('btn-download-diurnal-template')?.addEventListener('click', () => {
    this.handleDownloadTemplate('diurnal');
  });

  // CSV Dropzone
  const dropzone = document.getElementById('csv-dropzone');
  const fileInput = document.getElementById('file-load-csv-input') as HTMLInputElement;

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        this.handleFileUpload(fileInput.files[0]);
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.handleFileUpload(e.dataTransfer.files[0]);
      }
    });
  }
}
