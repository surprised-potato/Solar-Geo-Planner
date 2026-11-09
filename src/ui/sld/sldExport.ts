/**
 * SVG / PNG download of the current single-line diagram.
 */
import { buildSldSystemModel } from '../../geo/sldModel';
import type { SingleLineDiagramUI } from '../sldView';

/**
 * Export standalone SVG vector drawing
 */
export function exportSvg(this: SingleLineDiagramUI): void {
  if (typeof document === 'undefined') return;
  const model = buildSldSystemModel(this.store, this.currentSystemId);
  const svgContent = this.generateStandaloneSvg(model);
  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeSysName = (model.system.name || 'System').replace(/[^a-zA-Z0-9_-]/g, '_');
  const rotSuffix = this.rotation ? `_${this.rotation}deg` : '';
  a.download = `${safeSysName}_Single_Line_Diagram_2D_Wireframe${rotSuffix}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Export high-resolution PNG image (2x crisp retina resolution)
 */
export function exportPng(this: SingleLineDiagramUI): void {
  if (typeof document === 'undefined') return;
  const model = buildSldSystemModel(this.store, this.currentSystemId);
  const standaloneSvg = this.generateStandaloneSvg(model);
  const { totalSvgWidth: baseWidth, totalSvgHeight: baseHeight } = this.getSldDimensions(model);

  const isRotated = this.rotation === 90 || this.rotation === 270;
  const outWidth = isRotated ? baseHeight : baseWidth;
  const outHeight = isRotated ? baseWidth : baseHeight;

  const bgColor = this.currentTheme === 'cad-mono' ? '#090d16' : this.currentTheme === 'blueprint' ? '#081226' : '#f8fafc';
  const svgDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(standaloneSvg);
  const img = new Image();

  img.onload = () => {
    try {
      const scale = 2; // High-res 2x export
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(outWidth * scale);
      canvas.height = Math.round(outHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas 2D context creation failed');
      }

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const safeSysName = (model.system.name || 'System').replace(/[^a-zA-Z0-9_-]/g, '_');
      const rotSuffix = this.rotation ? `_${this.rotation}deg` : '';
      const filename = `${safeSysName}_Single_Line_Diagram_2D_Wireframe${rotSuffix}.png`;

      if (canvas.toBlob) {
        canvas.toBlob(blob => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 3000);
          } else {
            const dataUrl = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        }, 'image/png');
      } else {
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Failed to export PNG:', err);
      alert('PNG generation encountered an error. Please try exporting as SVG.');
    }
  };

  img.onerror = (err) => {
    console.error('SVG to Image load failed for PNG export:', err);
    alert('Could not render SVG to PNG in this browser. Please use the "Export SVG" button.');
  };

  img.src = svgDataUri;
}
