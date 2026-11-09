/**
 * Defensive cleanup for project data that comes from outside this browser
 * session: shared Firestore projects, imported JSON files and localStorage.
 *
 * Free-text fields (names, descriptions, ...) are kept verbatim and must be
 * escaped with `escapeHtml` wherever they are rendered. Every other string is
 * structural (IDs, enum values, colors, dates), so it is restricted here to a
 * character set that cannot break out of HTML text or attribute contexts.
 */

const FREE_TEXT_KEYS = new Set([
  'name',
  'projectName',
  'description',
  'modelName',
  'manufacturer',
  'notes',
  'sourceName',
  'sourceFileName',
  'category',
  'unit',
  'label',
  'title',
  'conductorCallout',
  'conduitCallout'
]);

const UNSAFE_IDENTIFIER_CHARS = /[^A-Za-z0-9 _.:#/()+-]/g;
const UNSAFE_MARKUP_CHARS = /[<>"'`]/g;
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s]+\))$/;
const FALLBACK_COLOR = '#64748b';

/** Restricts an identifier (zone / system / panel / string ID) to markup-safe characters. */
export function sanitizeIdentifier(value: string): string {
  return value.replace(UNSAFE_IDENTIFIER_CHARS, '_');
}

/** Returns the color if it is a plain hex / rgb(a) / hsl(a) value, otherwise a neutral fallback. */
export function sanitizeColor(value: string): string {
  const trimmed = value.trim();
  return SAFE_COLOR.test(trimmed) ? trimmed : FALLBACK_COLOR;
}

function isIdentifierKey(key: string): boolean {
  return key === 'id' || /Id$/.test(key);
}

function isIdentifierListKey(key: string): boolean {
  return /Ids$/.test(key);
}

function isColorKey(key: string): boolean {
  return key === 'color' || /Color$/.test(key);
}

function sanitizeString(key: string, value: string): string {
  if (isIdentifierKey(key)) return sanitizeIdentifier(value);
  if (isColorKey(key)) return sanitizeColor(value);
  if (FREE_TEXT_KEYS.has(key)) return value;
  return value.replace(UNSAFE_MARKUP_CHARS, '');
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (typeof value === 'string') return sanitizeString(key, value);
  if (Array.isArray(value)) {
    if (isIdentifierListKey(key)) {
      return value.map(v => (typeof v === 'string' ? sanitizeIdentifier(v) : sanitizeValue(key, v)));
    }
    return value.map(v => sanitizeValue(key, v));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[k] = sanitizeValue(k, v);
    }
    return out;
  }
  return value;
}

/** Deep-sanitizes parsed project JSON. Identifier rewriting is deterministic, so cross-references stay intact. */
export function sanitizeProjectData<T>(data: T): T {
  return sanitizeValue('', data) as T;
}
