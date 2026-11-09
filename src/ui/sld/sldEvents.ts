/**
 * Toolbar, pan / zoom and theme event wiring for the single-line diagram.
 */
import { buildSldSystemModel } from '../../geo/sldModel';
import type { SingleLineDiagramUI } from '../sldView';
import { SldTheme } from '../sldView';

export function attachEventListeners(this: SingleLineDiagramUI): void {
  // System Select
  const sysSelect = this.container.querySelector('#sld-system-select') as HTMLSelectElement;
  sysSelect?.addEventListener('change', () => {
    this.setSystem(sysSelect.value);
  });

  // Rebalance / Connect Inverters
  this.container.querySelector('#sld-btn-rebalance-inverters')?.addEventListener('click', () => {
    this.store.distributeStringsAcrossInverters(this.currentSystemId, undefined, true);
    this.render();
  });

  // Auto-Fix Vmax violations
  const fixHandler = () => {
    this.store.distributeStringsAcrossInverters(this.currentSystemId, undefined, true);
    this.render();
  };
  this.container.querySelector('#sld-btn-fix-vmax')?.addEventListener('click', fixHandler);
  this.container.querySelector('#sld-btn-fix-vmax-banner')?.addEventListener('click', fixHandler);

  // Zoom Controls
  this.container.querySelector('#sld-btn-zoom-in')?.addEventListener('click', () => this.zoomIn());
  this.container.querySelector('#sld-btn-zoom-out')?.addEventListener('click', () => this.zoomOut());
  this.container.querySelector('#sld-btn-zoom-reset')?.addEventListener('click', () => this.resetZoom());
  this.container.querySelector('#sld-btn-rotate')?.addEventListener('click', () => this.rotate());

  // Theme selector
  this.container.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', e => {
      const theme = (e.currentTarget as HTMLElement).getAttribute('data-theme') as SldTheme;
      if (theme) this.setTheme(theme);
    });
  });

  // Interactive Tapping Point Toggle
  const handleTapToggle = () => {
    const model = buildSldSystemModel(this.store, this.currentSystemId);
    const nextTap = model.mdpTapType === 'line_side' ? 'load_side' : 'line_side';
    this.store.updateSystem(this.currentSystemId, { mdpTapType: nextTap });
    this.render();
  };
  this.container.querySelector('#sld-btn-tap-toggle')?.addEventListener('click', handleTapToggle);
  this.container.querySelector('#sld-svg-tap-toggle')?.addEventListener('click', handleTapToggle);

  // Export SVG
  this.container.querySelector('#sld-btn-export-svg')?.addEventListener('click', () => {
    this.exportSvg();
  });

  // Export PNG
  this.container.querySelector('#sld-btn-export-png')?.addEventListener('click', () => {
    this.exportPng();
  });

  // Export PDF Report
  this.container.querySelector('#sld-btn-export-pdf')?.addEventListener('click', () => {
    if (this.onOpenPdfReport) {
      this.onOpenPdfReport(this.currentSystemId);
    } else if (typeof window !== 'undefined' && (window as any).openPdfReport) {
      (window as any).openPdfReport(this.currentSystemId);
    }
  });

  // Cable Schedule Modal
  this.container.querySelector('#sld-btn-pec-schedule')?.addEventListener('click', () => {
    this.showCableSchedule = true;
    this.render();
  });
  this.container.querySelector('#sld-btn-close-schedule')?.addEventListener('click', () => {
    this.showCableSchedule = false;
    this.render();
  });
  this.container.querySelector('#sld-btn-close-schedule-footer')?.addEventListener('click', () => {
    this.showCableSchedule = false;
    this.render();
  });
  this.container.querySelector('#sld-schedule-backdrop')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'sld-schedule-backdrop') {
      this.showCableSchedule = false;
      this.render();
    }
  });

  // Pan & Zoom gestures on the SVG viewport
  const viewport = this.container.querySelector('#sld-canvas-viewport') as HTMLElement;
  if (viewport) {
    viewport.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      // Zoom centered directly where the mouse cursor is located
      const zoomFactor = e.deltaY < 0 ? 1.15 : (1 / 1.15);
      this.zoomAt(zoomFactor, e.clientX, e.clientY);
    }, { passive: false });

    viewport.addEventListener('dblclick', (e: MouseEvent) => {
      e.preventDefault();
      this.zoomIn(e.clientX, e.clientY);
    });

    viewport.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 0) {
        this.isPanning = true;
        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;
        viewport.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isPanning) return;
      const dx = e.clientX - this.lastClientX;
      const dy = e.clientY - this.lastClientY;
      this.lastClientX = e.clientX;
      this.lastClientY = e.clientY;

      const svg = this.container?.querySelector<SVGSVGElement>('#sld-svg-element');
      let scale = 1;
      if (svg) {
        const rect = svg.getBoundingClientRect();
        const vb = svg.viewBox?.baseVal;
        if (rect.width > 0 && vb && vb.width > 0) {
          scale = vb.width / rect.width;
        }
      }
      this.panX = Number((this.panX + dx * scale).toFixed(2));
      this.panY = Number((this.panY + dy * scale).toFixed(2));
      this.updateTransform();
    });

    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        if (viewport) viewport.style.cursor = 'grab';
      }
    });

    // Touch gestures: single-finger pan & two-finger pinch-to-zoom centered at pinch midpoint
    let initialPinchDist = 0;
    let initialPinchZoom = 1;

    viewport.addEventListener('touchstart', (e: TouchEvent) => {
      if (e.touches.length === 1) {
        this.isPanning = true;
        this.lastClientX = e.touches[0].clientX;
        this.lastClientY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        this.isPanning = false;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        initialPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        initialPinchZoom = this.zoomLevel;
      }
    }, { passive: true });

    viewport.addEventListener('touchmove', (e: TouchEvent) => {
      if (e.touches.length === 1 && this.isPanning) {
        const t = e.touches[0];
        const dx = t.clientX - this.lastClientX;
        const dy = t.clientY - this.lastClientY;
        this.lastClientX = t.clientX;
        this.lastClientY = t.clientY;

        const svg = this.container?.querySelector<SVGSVGElement>('#sld-svg-element');
        let scale = 1;
        if (svg) {
          const rect = svg.getBoundingClientRect();
          const vb = svg.viewBox?.baseVal;
          if (rect.width > 0 && vb && vb.width > 0) {
            scale = vb.width / rect.width;
          }
        }
        this.panX = Number((this.panX + dx * scale).toFixed(2));
        this.panY = Number((this.panY + dy * scale).toFixed(2));
        this.updateTransform();
      } else if (e.touches.length === 2 && initialPinchDist > 0) {
        if (e.cancelable) e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        const targetZoom = Math.max(0.3, Math.min(4.0, initialPinchZoom * (currentDist / initialPinchDist)));
        this.zoomAt(targetZoom / this.zoomLevel, midX, midY);
      }
    }, { passive: false });

    viewport.addEventListener('touchend', () => {
      this.isPanning = false;
      initialPinchDist = 0;
    }, { passive: true });
  }
}
