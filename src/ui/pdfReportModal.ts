import { ProjectStore } from '../store/projectStore';
import { ReportExportOptions } from '../report/reportTypes';
import { generatePvsystPdf } from '../report/pdfReportGenerator';
import { escapeHtml } from '../utils/html';

export class PdfReportModalUI {
  private container: HTMLElement;
  private store: ProjectStore;
  private currentSystemId: string = 'all';
  private onClose?: () => void;
  private isOpen: boolean = false;
  private activeTab: 'preview' | 'settings' = 'preview';

  // Form states
  private clientName: string = '';
  private engineerName: string = '';
  private reportDate: string = '';
  private notes: string = '';
  private includeCadView: boolean = true;
  private includeArraySchedule: boolean = true;
  private includeSpecs: boolean = true;
  private includeSimulation: boolean = true;
  private includeSld: boolean = true;
  private includeBoq: boolean = false;
  private includeCover: boolean = true;
  private includeSummary: boolean = true;
  private includeElectrical: boolean = true;
  private useSatellite: boolean = true;
  private renderToken: number = 0;

  private totalPreviewPages: number = 4;
  private previewPdfBlobUrl: string | null = null;

  constructor(containerId: string, store: ProjectStore, onClose?: () => void) {
    let el = document.getElementById(containerId);
    if (!el) {
      el = document.createElement('div');
      el.id = containerId;
      document.body.appendChild(el);
    }
    // Guarantee it is attached to document.body, outside #app
    if (el.parentElement !== document.body) {
      document.body.appendChild(el);
    }
    el.className = 'custom-modal-backdrop pdf-report-modal-backdrop';
    el.style.display = 'none';
    this.container = el;

    this.store = store;
    this.onClose = onClose;

    try {
      this.clientName = localStorage.getItem('sgp_report_client_name') || 'Commercial Facility / ABC Corp';
      this.engineerName = localStorage.getItem('sgp_report_engineer_name') || 'Solar EPC Engineer';
    } catch (e) {
      this.clientName = 'Commercial Facility / ABC Corp';
      this.engineerName = 'Solar EPC Engineer';
    }

    this.reportDate = new Date().toISOString().slice(0, 10);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.isOpen) {
      this.close();
    }
  };

  public open(systemId?: string, defaultTab: 'preview' | 'settings' = 'preview'): void {
    if (systemId) {
      this.currentSystemId = systemId;
    }
    this.includeArraySchedule = this.store.getZones().length > 5;
    this.activeTab = defaultTab;
    this.isOpen = true;
    if (this.container.parentElement !== document.body) {
      document.body.appendChild(this.container);
    }
    this.container.style.display = 'flex';
    window.addEventListener('keydown', this.handleKeyDown);
    this.render();
  }

  public close(): void {
    this.isOpen = false;
    this.container.style.display = 'none';
    window.removeEventListener('keydown', this.handleKeyDown);
    if (this.previewPdfBlobUrl) {
      URL.revokeObjectURL(this.previewPdfBlobUrl);
      this.previewPdfBlobUrl = null;
    }
    if (this.onClose) {
      try {
        this.onClose();
      } catch (err) {
        console.error('Error executing pdfReportModal onClose:', err);
      }
    }
  }

  private getOptions(): ReportExportOptions {
    return {
      projectTitle: this.store.projectName || 'Solar Geo Project',
      clientName: this.clientName,
      engineerName: this.engineerName,
      companyName: 'Solar Geo Planner CAD',
      reportDate: this.reportDate,
      systemId: this.currentSystemId,
      includeCadView: this.includeCadView,
      includeArraySchedule: this.includeArraySchedule,
      includeSpecs: this.includeSpecs,
      includeSimulation: this.includeSimulation,
      includeSld: this.includeSld,
      includeBoq: this.includeBoq,
      includeCover: this.includeCover,
      includeSummary: this.includeSummary,
      includeElectrical: this.includeElectrical,
      satelliteBasemap: this.useSatellite,
      notes: this.notes
    };
  }

  /** Preview is the real generated PDF, so what you see is exactly what downloads. */
  private renderVisualPages(): void {
    const mount = this.container.querySelector('#pdf-preview-mount') as HTMLElement | null;
    if (!mount) return;

    const token = ++this.renderToken;
    mount.innerHTML = '<div class="pdf-preview-loading" style="padding:40px;text-align:center;color:#64748b">⏳ Building report preview…</div>';

    generatePvsystPdf(this.store, this.getOptions())
      .then(doc => {
        if (token !== this.renderToken) return;
        this.totalPreviewPages = doc.getNumberOfPages();
        const badge = this.container.querySelector('#report-pages-badge');
        if (badge) badge.textContent = `📄 ${this.totalPreviewPages} Page(s) Document`;
        if (this.previewPdfBlobUrl) URL.revokeObjectURL(this.previewPdfBlobUrl);
        this.previewPdfBlobUrl = URL.createObjectURL(doc.output('blob'));
        mount.innerHTML = `<iframe class="pdf-preview-frame" title="Report preview" src="${this.previewPdfBlobUrl}" style="width:100%;height:calc(100vh - 230px);min-height:480px;border:0;background:#fff"></iframe>`;
      })
      .catch(err => {
        if (token !== this.renderToken) return;
        mount.innerHTML = `<div class="pdf-preview-loading" style="padding:40px;text-align:center;color:#b91c1c">Could not build the preview: ${escapeHtml((err as Error).message)}</div>`;
      });
  }

  private async handleDownload(): Promise<void> {
    const btnDownload = this.container.querySelector('#btn-pdf-download') as HTMLButtonElement | null;
    if (btnDownload) {
      btnDownload.disabled = true;
      btnDownload.innerHTML = '<span>⏳</span> Compiling PDF...';
    }

    try {
      const options = this.getOptions();
      const doc = await generatePvsystPdf(this.store, options);
      const safeName = (this.store.projectName || 'Solar_Project').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${safeName}_PVsyst_Engineering_Report_${Date.now()}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('Download PDF failed:', err);
      alert('Could not download PDF report: ' + (err as Error).message);
    } finally {
      if (btnDownload) {
        btnDownload.disabled = false;
        btnDownload.innerHTML = '<span>📥</span> Download PDF';
      }
    }
  }

  private async handlePrint(): Promise<void> {
    try {
      const options = this.getOptions();
      const doc = await generatePvsystPdf(this.store, options);
      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(blobUrl);
      if (printWindow) {
        printWindow.focus();
      } else {
        window.print();
      }
    } catch (e) {
      window.print();
    }
  }

  /** Describes a system with its key specs so the scope picker name matches what the report shows. */
  private systemOptionLabel(sys: ReturnType<ProjectStore['getSystems']>[number]): string {
    const kwp = this.store.getSystemSummary(sys.id).totalKwp;
    const inv = sys.inverter;
    return `${sys.name} \u2014 ${kwp.toFixed(1)} kWp \u2022 ${inv.inverterCount || 1}\u00d7${inv.ratedAcPowerKw} kW inverter`;
  }

  public render(): void {
    const systems = this.store.getSystems();
    // The remembered scope may point at a system that was deleted or belongs to another project.
    if (this.currentSystemId !== 'all' && !systems.some(s => s.id === this.currentSystemId)) {
      this.currentSystemId = 'all';
    }
    const isPreview = this.activeTab === 'preview';

    this.container.innerHTML = `
      <div class="modal-dialog modal-xl pdf-report-dialog" role="dialog" aria-labelledby="pdf-modal-title">
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="modal-title-group">
            <span class="modal-badge-icon">📄</span>
            <div>
              <h2 id="pdf-modal-title" class="modal-title">PVsyst Engineering Report &amp; Live Document Preview</h2>
              <p class="modal-subtitle">PVsyst-standard simulation report with CAD layout, technical specs, loss cascade, and SLD</p>
            </div>
          </div>
          <button id="btn-pdf-modal-close" class="modal-close-btn" aria-label="Close modal">✕</button>
        </div>

        <!-- Navigation Tab Bar -->
        <div class="modal-tab-bar" role="tablist">
          <button id="tab-btn-preview" class="modal-tab-btn ${isPreview ? 'active' : ''}" role="tab" aria-selected="${isPreview}">
            <span>👁️</span> Document Preview
          </button>
          <button id="tab-btn-settings" class="modal-tab-btn ${!isPreview ? 'active' : ''}" role="tab" aria-selected="${!isPreview}">
            <span>⚙️</span> Report Settings &amp; Scope
          </button>
        </div>

        <!-- Modal Body -->
        <div class="modal-body pdf-report-body ${isPreview ? 'preview-mode' : 'settings-mode'}">
          ${isPreview ? `
            <!-- Top Preview Toolbar -->
            <div class="pdf-preview-toolbar">
              <div class="toolbar-left">
                <span class="toolbar-lbl">Scope:</span>
                <select id="sel-pdf-preview-system" class="form-input form-input-sm" title="Filter preview scope">
                  <option value="all" ${this.currentSystemId === 'all' ? 'selected' : ''}>All Systems (Consolidated Project Report)</option>
                  ${systems.map(s => `<option value="${s.id}" ${this.currentSystemId === s.id ? 'selected' : ''}>${escapeHtml(this.systemOptionLabel(s))}</option>`).join('')}
                </select>

                <label class="checkbox-label checkbox-inline" title="Toggle satellite imagery on Page 1 CAD layout">
                  <input type="checkbox" id="chk-pdf-preview-satellite" ${this.useSatellite ? 'checked' : ''} />
                  <span>🛰️ Satellite Basemap</span>
                </label>

                <button id="btn-pdf-preview-refresh" class="btn btn-xs btn-outline" title="Re-render all document pages">
                  <span>🔄</span> Refresh Preview
                </button>
                <button id="btn-pdf-preview-settings" class="btn btn-xs btn-outline" title="Edit client name, dates, notes, and included pages">
                  <span>⚙️</span> Edit Settings
                </button>
              </div>

              <div class="toolbar-right">
                <button id="btn-pdf-print" class="btn btn-sm btn-secondary" title="Print report via browser">
                  <span>🖨️</span> Print via Browser
                </button>
                <button id="btn-pdf-download" class="btn btn-sm btn-primary" title="Export PDF document">
                  <span>📥</span> Download PDF
                </button>
              </div>
            </div>

            <!-- Full-Width Live PDF Document Preview -->
            <div class="pdf-preview-pane full-preview">
              <div id="pdf-preview-mount" class="pdf-preview-mount">
                <!-- Rendered document sheets mounted here -->
              </div>
            </div>
          ` : `
            <!-- Settings & Configuration Form View -->
            <div class="pdf-settings-container">
              <div class="config-card">
                <h3 class="config-section-title">PROJECT &amp; CLIENT INFO</h3>
                <div class="form-grid-2">
                  <div class="form-group">
                    <label for="inp-pdf-client">Client / Facility Name:</label>
                    <input type="text" id="inp-pdf-client" class="form-input" value="${this.clientName}" placeholder="e.g. Acme Solar Corp / Commercial Facility" />
                  </div>
                  <div class="form-group">
                    <label for="inp-pdf-engineer">Prepared By / Engineer:</label>
                    <input type="text" id="inp-pdf-engineer" class="form-input" value="${this.engineerName}" placeholder="e.g. Lead Solar PV Engineer" />
                  </div>
                </div>
                <div class="form-group" style="margin-top: 10px;">
                  <label for="inp-pdf-date">Report Date:</label>
                  <input type="date" id="inp-pdf-date" class="form-input" value="${this.reportDate}" style="max-width: 240px;" />
                </div>
              </div>

              <div class="config-card">
                <h3 class="config-section-title">SCOPE &amp; SYSTEM SELECTION</h3>
                <div class="form-group">
                  <label for="sel-pdf-system">Target Solar System:</label>
                  <select id="sel-pdf-system" class="form-input">
                    <option value="all" ${this.currentSystemId === 'all' ? 'selected' : ''}>All Systems (Consolidated Project Report)</option>
                    ${systems.map(s => `<option value="${s.id}" ${this.currentSystemId === s.id ? 'selected' : ''}>${escapeHtml(this.systemOptionLabel(s))}</option>`).join('')}
                  </select>
                </div>
              </div>

              <div class="config-card">
                <h3 class="config-section-title">REPORT SHEETS (CHECKLIST)</h3>
                <div class="checkbox-group">
                  <label class="checkbox-label">
                    <input type="checkbox" id="chk-pdf-cover" ${this.includeCover ? 'checked' : ''} />
                    <span><strong>Cover, contents &amp; notes:</strong> title page, clickable table of contents, assumptions</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" id="chk-pdf-summary" ${this.includeSummary ? 'checked' : ''} />
                    <span><strong>Project summary:</strong> key results, system info, design status</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" id="chk-pdf-cad" ${this.includeCadView ? 'checked' : ''} />
                    <span><strong>Site layout:</strong> CAD plan and sub-array overview</span>
                  </label>
                  <label class="checkbox-label" style="padding-left: 20px;">
                    <input type="checkbox" id="chk-pdf-satellite" ${this.useSatellite ? 'checked' : ''} />
                    <span>🛰️ Satellite imagery background on site layout</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" id="chk-pdf-schedule" ${this.includeArraySchedule ? 'checked' : ''} />
                    <span><strong>Schedule of PV arrays:</strong> every sub-array with racking and strings</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" id="chk-pdf-specs" ${this.includeSpecs ? 'checked' : ''} />
                    <span><strong>Components &amp; design checks:</strong> datasheets and stringing verification</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" id="chk-pdf-electrical" ${this.includeElectrical ? 'checked' : ''} />
                    <span><strong>Electrical schedule:</strong> PEC cable &amp; protection, AC feeder, DC cables</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" id="chk-pdf-sim" ${this.includeSimulation ? 'checked' : ''} />
                    <span><strong>Energy &amp; losses:</strong> monthly production, loss diagram, load matching</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" id="chk-pdf-sld" ${this.includeSld ? 'checked' : ''} />
                    <span><strong>Single line diagram</strong> (one page per system)</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" id="chk-pdf-boq" ${this.includeBoq ? 'checked' : ''} />
                    <span><strong>Bill of quantities &amp; cost:</strong> DUPA summary, totals and itemised materials</span>
                  </label>
                </div>
              </div>

              <div class="config-card">
                <h3 class="config-section-title">NOTES / REMARKS</h3>
                <div class="form-group">
                  <textarea id="inp-pdf-notes" class="form-input textarea-notes" rows="3" placeholder="Optional notes for report cover...">${escapeHtml(this.notes)}</textarea>
                </div>
              </div>

              <div class="settings-actions">
                <button id="btn-pdf-save-view-preview" class="btn btn-primary btn-lg">
                  <span>👁️</span> View Document Preview →
                </button>
                <button id="btn-pdf-download-settings" class="btn btn-secondary">
                  <span>📥</span> Download PDF Directly
                </button>
              </div>
            </div>
          `}
        </div>

        <!-- Modal Footer Actions -->
        <div class="modal-footer pdf-modal-footer">
          <div class="footer-left">
            <span id="report-pages-badge" class="report-pages-badge">📄 ${this.totalPreviewPages} Page(s) Document</span>
            <span class="report-standard-badge">PVsyst &amp; PEC Compliant</span>
          </div>
          <div class="footer-right">
            ${isPreview ? `
              <button id="btn-pdf-footer-settings" class="btn btn-secondary">
                <span>⚙️</span> Report Settings
              </button>
              <button id="btn-pdf-footer-print" class="btn btn-secondary">
                <span>🖨️</span> Print via Browser
              </button>
              <button id="btn-pdf-footer-download" class="btn btn-primary">
                <span>📥</span> Download PDF
              </button>
            ` : `
              <button id="btn-pdf-footer-view-preview" class="btn btn-primary">
                <span>👁️</span> View Document Preview
              </button>
            `}
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
    if (isPreview) {
      this.renderVisualPages();
    }
  }

  private attachEvents(): void {
    // Modal Close Triggers
    this.container.querySelector('#btn-pdf-modal-close')?.addEventListener('click', () => this.close());
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });

    // Tab Switches
    this.container.querySelector('#tab-btn-preview')?.addEventListener('click', () => {
      if (this.activeTab !== 'preview') {
        this.activeTab = 'preview';
        this.render();
      }
    });

    this.container.querySelector('#tab-btn-settings')?.addEventListener('click', () => {
      if (this.activeTab !== 'settings') {
        this.activeTab = 'settings';
        this.render();
      }
    });

    if (this.activeTab === 'preview') {
      const selPreviewSystem = this.container.querySelector('#sel-pdf-preview-system') as HTMLSelectElement | null;
      selPreviewSystem?.addEventListener('change', () => {
        this.currentSystemId = selPreviewSystem.value;
        this.renderVisualPages();
      });

      const chkPreviewSat = this.container.querySelector('#chk-pdf-preview-satellite') as HTMLInputElement | null;
      chkPreviewSat?.addEventListener('change', () => {
        this.useSatellite = chkPreviewSat.checked;
        this.renderVisualPages();
      });

      this.container.querySelector('#btn-pdf-preview-refresh')?.addEventListener('click', () => {
        this.renderVisualPages();
      });

      this.container.querySelector('#btn-pdf-preview-settings')?.addEventListener('click', () => {
        this.activeTab = 'settings';
        this.render();
      });

      this.container.querySelector('#btn-pdf-footer-settings')?.addEventListener('click', () => {
        this.activeTab = 'settings';
        this.render();
      });

      this.container.querySelector('#btn-pdf-print')?.addEventListener('click', () => {
        this.handlePrint();
      });

      this.container.querySelector('#btn-pdf-footer-print')?.addEventListener('click', () => {
        this.handlePrint();
      });

      this.container.querySelector('#btn-pdf-download')?.addEventListener('click', () => {
        this.handleDownload();
      });

      this.container.querySelector('#btn-pdf-footer-download')?.addEventListener('click', () => {
        this.handleDownload();
      });
    } else {
      // Settings View Triggers
      const inpClient = this.container.querySelector('#inp-pdf-client') as HTMLInputElement | null;
      const inpEngineer = this.container.querySelector('#inp-pdf-engineer') as HTMLInputElement | null;
      const inpDate = this.container.querySelector('#inp-pdf-date') as HTMLInputElement | null;
      const inpNotes = this.container.querySelector('#inp-pdf-notes') as HTMLTextAreaElement | null;
      const selSystem = this.container.querySelector('#sel-pdf-system') as HTMLSelectElement | null;

      inpClient?.addEventListener('change', () => {
        this.clientName = inpClient.value;
        try { localStorage.setItem('sgp_report_client_name', this.clientName); } catch (e) {}
      });

      inpEngineer?.addEventListener('change', () => {
        this.engineerName = inpEngineer.value;
        try { localStorage.setItem('sgp_report_engineer_name', this.engineerName); } catch (e) {}
      });

      inpDate?.addEventListener('change', () => {
        this.reportDate = inpDate.value;
      });

      inpNotes?.addEventListener('change', () => {
        this.notes = inpNotes.value;
      });

      selSystem?.addEventListener('change', () => {
        this.currentSystemId = selSystem.value;
      });

      const chkCad = this.container.querySelector('#chk-pdf-cad') as HTMLInputElement | null;
      const chkSchedule = this.container.querySelector('#chk-pdf-schedule') as HTMLInputElement | null;
      const chkSpecs = this.container.querySelector('#chk-pdf-specs') as HTMLInputElement | null;
      const chkSim = this.container.querySelector('#chk-pdf-sim') as HTMLInputElement | null;
      const chkSld = this.container.querySelector('#chk-pdf-sld') as HTMLInputElement | null;
      const chkBoq = this.container.querySelector('#chk-pdf-boq') as HTMLInputElement | null;
      const chkSat = this.container.querySelector('#chk-pdf-satellite') as HTMLInputElement | null;
      const chkCover = this.container.querySelector('#chk-pdf-cover') as HTMLInputElement | null;
      const chkSummary = this.container.querySelector('#chk-pdf-summary') as HTMLInputElement | null;
      const chkElectrical = this.container.querySelector('#chk-pdf-electrical') as HTMLInputElement | null;

      const onCheckboxChange = () => {
        this.includeCadView = chkCad?.checked ?? true;
        this.includeArraySchedule = chkSchedule?.checked ?? true;
        this.includeSpecs = chkSpecs?.checked ?? true;
        this.includeSimulation = chkSim?.checked ?? true;
        this.includeSld = chkSld?.checked ?? true;
        this.includeBoq = chkBoq?.checked ?? false;
        this.useSatellite = chkSat?.checked ?? true;
        this.includeCover = chkCover?.checked ?? true;
        this.includeSummary = chkSummary?.checked ?? true;
        this.includeElectrical = chkElectrical?.checked ?? true;
      };

      chkCad?.addEventListener('change', onCheckboxChange);
      chkSchedule?.addEventListener('change', onCheckboxChange);
      chkSpecs?.addEventListener('change', onCheckboxChange);
      chkSim?.addEventListener('change', onCheckboxChange);
      chkSld?.addEventListener('change', onCheckboxChange);
      chkBoq?.addEventListener('change', onCheckboxChange);
      chkSat?.addEventListener('change', onCheckboxChange);
      chkCover?.addEventListener('change', onCheckboxChange);
      chkSummary?.addEventListener('change', onCheckboxChange);
      chkElectrical?.addEventListener('change', onCheckboxChange);

      const switchToPreview = () => {
        onCheckboxChange();
        if (inpClient) this.clientName = inpClient.value;
        if (inpEngineer) this.engineerName = inpEngineer.value;
        if (inpDate) this.reportDate = inpDate.value;
        if (inpNotes) this.notes = inpNotes.value;
        if (selSystem) this.currentSystemId = selSystem.value;
        this.activeTab = 'preview';
        this.render();
      };

      this.container.querySelector('#btn-pdf-save-view-preview')?.addEventListener('click', switchToPreview);
      this.container.querySelector('#btn-pdf-footer-view-preview')?.addEventListener('click', switchToPreview);

      this.container.querySelector('#btn-pdf-download-settings')?.addEventListener('click', () => {
        onCheckboxChange();
        if (inpClient) this.clientName = inpClient.value;
        if (inpEngineer) this.engineerName = inpEngineer.value;
        if (inpDate) this.reportDate = inpDate.value;
        if (inpNotes) this.notes = inpNotes.value;
        if (selSystem) this.currentSystemId = selSystem.value;
        this.handleDownload();
      });
    }
  }
}
