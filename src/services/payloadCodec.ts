/**
 * Cloud payload codec. Firestore documents are capped at 1 MiB, and a utility-scale rooftop
 * project (thousands of panels) exceeds that as plain JSON while compressing roughly 15x.
 *
 * Large payloads are stored as `gz1:<base64 gzip>`; small ones stay plain JSON so older clients
 * keep reading them. Decoding accepts both forms.
 */
import { gzipSync, gunzipSync, strFromU8, strToU8 } from 'fflate';

export const COMPRESSED_PREFIX = 'gz1:';
/** Plain JSON up to this many characters is stored as-is. */
export const COMPRESS_THRESHOLD_CHARS = 200_000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeProjectPayload(json: string): string {
  if (json.length <= COMPRESS_THRESHOLD_CHARS) return json;
  return COMPRESSED_PREFIX + toBase64(gzipSync(strToU8(json), { level: 6 }));
}

/** Returns the plain project JSON for either stored form; unparseable payloads come back unchanged. */
export function decodeProjectPayload(stored: string): string {
  if (typeof stored !== 'string' || !stored.startsWith(COMPRESSED_PREFIX)) return stored;
  try {
    return strFromU8(gunzipSync(fromBase64(stored.slice(COMPRESSED_PREFIX.length))));
  } catch (err) {
    console.error('[FirebaseSync] Failed to decompress project payload:', err);
    return '';
  }
}
