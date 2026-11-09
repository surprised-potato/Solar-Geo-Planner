/**
 * Escapes a value for safe interpolation into HTML text or a quoted attribute.
 *
 * Use it for any user- or project-supplied string that ends up in `innerHTML`,
 * a Leaflet tooltip/popup/divIcon, or an attribute value. Project data can come
 * from shared cloud projects and imported JSON files, so it must never be
 * trusted as markup.
 */
export function escapeHtml(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
