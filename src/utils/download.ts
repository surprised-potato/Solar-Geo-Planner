/**
 * Browser download helpers shared by every export button (JSON, CSV, SVG, PNG).
 */

/** Replaces anything outside `[A-Za-z0-9_-]` so a project / system name is safe inside a filename. */
export function safeFileName(name: string | undefined | null, fallback = 'Solar_Project'): string {
  return (name || fallback).replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** Saves a Blob as a file via a temporary anchor. */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Firefox only follows the click when the anchor is attached to the document.
  const host = document.body;
  host?.appendChild(a);
  a.click();
  host?.removeChild(a);
  // Revoke asynchronously: some browsers start the download after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Saves text content (JSON, CSV, SVG, ...) as a file. */
export function downloadText(content: string, filename: string, type: string): void {
  downloadBlob(new Blob([content], { type }), filename);
}

/** Saves CSV text as a UTF-8 `.csv` download. */
export function downloadCsv(content: string, filename: string): void {
  downloadText(content, filename, 'text/csv;charset=utf-8;');
}

/** Quotes every cell and joins rows into CSV text. */
export function rowsToCsv(rows: unknown[][]): string {
  return rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
}
