import { describe, it, expect } from 'vitest';
import { COMPRESSED_PREFIX, COMPRESS_THRESHOLD_CHARS, decodeProjectPayload, encodeProjectPayload } from './payloadCodec';
import { ProjectStore } from '../store/projectStore';

describe('cloud payload codec', () => {
  it('leaves small payloads as plain JSON', () => {
    const json = JSON.stringify({ a: 1 });
    expect(encodeProjectPayload(json)).toBe(json);
    expect(decodeProjectPayload(json)).toBe(json);
  });

  it('round-trips large payloads through gzip + base64', () => {
    const json = JSON.stringify({ rows: Array.from({ length: 20000 }, (_, i) => ({ id: `p${i}`, v: i % 7 })) });
    expect(json.length).toBeGreaterThan(COMPRESS_THRESHOLD_CHARS);
    const stored = encodeProjectPayload(json);
    expect(stored.startsWith(COMPRESSED_PREFIX)).toBe(true);
    expect(stored.length).toBeLessThan(json.length / 4);
    expect(decodeProjectPayload(stored)).toBe(json);
  });

  it('returns an empty string for a corrupted compressed payload instead of throwing', () => {
    expect(decodeProjectPayload(COMPRESSED_PREFIX + '!!!not-base64!!!')).toBe('');
  });

  it('keeps a multi-MWp rooftop project under the 1,000,000 character Firestore rule', () => {
    try { localStorage.clear(); } catch { /* no localStorage */ }
    const store = new ProjectStore();
    store.clearAll();
    store.addPoultryHouses({
      anchor: { lat: 15, lng: 120.5 }, headingDeg: 0, lengthM: 120, widthM: 14, roofPitchDeg: 15, count: 14, gapM: 10
    });
    const json = store.exportProjectJson(true);
    expect(json.length).toBeGreaterThan(1_000_000); // would not fit uncompressed
    const stored = encodeProjectPayload(json);
    expect(stored.length).toBeLessThan(1_000_000);

    const restored = new ProjectStore();
    restored.clearAll();
    expect(restored.importProjectJson(decodeProjectPayload(stored))).toBe(true);
    expect(restored.getPanels().length).toBe(store.getPanels().length);
    expect(restored.buildings.size).toBe(14);
  }, 60000);
});
