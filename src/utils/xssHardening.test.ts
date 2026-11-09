import { describe, it, expect } from 'vitest';
import { escapeHtml } from './html';
import { sanitizeColor, sanitizeIdentifier, sanitizeProjectData } from './sanitizeProjectData';
import { ProjectStore } from '../store/projectStore';
import { renderArraysTable } from '../ui/registry/arraysTable';
import type { RegistryModalUI } from '../ui/registryModal';

const PAYLOAD = '"><img src=x onerror="alert(1)">';

describe('escapeHtml', () => {
  it('escapes markup and both quote styles', () => {
    expect(escapeHtml(`<a href='x'>"Tom & Jerry"</a>`)).toBe(
      '&lt;a href=&#39;x&#39;&gt;&quot;Tom &amp; Jerry&quot;&lt;/a&gt;'
    );
  });

  it('renders null / undefined as empty and stringifies numbers', () => {
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('sanitizeProjectData', () => {
  it('keeps free-text fields verbatim (they are escaped at render time)', () => {
    const out = sanitizeProjectData({ name: `Bob's "Main" <Roof>`, description: '4-inch & 2-inch' });
    expect(out.name).toBe(`Bob's "Main" <Roof>`);
    expect(out.description).toBe('4-inch & 2-inch');
  });

  it('rewrites identifiers deterministically so cross-references survive', () => {
    const out = sanitizeProjectData({
      zones: [{ id: 'z1" onmouseover="x', systemId: 'sys<1>' }],
      systems: [{ id: 'sys<1>', zoneIds: ['z1" onmouseover="x'] }]
    });
    expect(out.zones[0].id).toBe(out.systems[0].zoneIds[0]);
    expect(out.zones[0].systemId).toBe(out.systems[0].id);
    expect(out.zones[0].id).not.toMatch(/["<>]/);
  });

  it('replaces non-color values in color fields', () => {
    expect(sanitizeColor('#10b981')).toBe('#10b981');
    expect(sanitizeColor('rgba(56, 189, 248, 0.4)')).toBe('rgba(56, 189, 248, 0.4)');
    expect(sanitizeColor('red;" onmouseover="alert(1)')).toBe('#64748b');
    expect(sanitizeProjectData({ color: 'url(javascript:alert(1))' }).color).toBe('#64748b');
  });

  it('strips markup characters from other structural strings', () => {
    const out = sanitizeProjectData({ config: { mountType: 'roof"><script>', tiltDeg: '<b>10</b>' } });
    expect(out.config.mountType).toBe('roofscript');
    expect(out.config.tiltDeg).toBe('b10/b');
  });

  it('drops prototype-polluting keys', () => {
    const out = sanitizeProjectData(JSON.parse('{"__proto__": {"polluted": true}, "a": 1}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(out)).toEqual(['a']);
  });

  it('restricts user-entered string IDs', () => {
    expect(sanitizeIdentifier('S1-01')).toBe('S1-01');
    expect(sanitizeIdentifier('S1"><svg onload=x>')).toBe('S1___svg onload_x_');
  });
});

describe('malicious shared project', () => {
  function buildMaliciousProjectJson(): string {
    const store = new ProjectStore();
    store.clearAll();
    const zone = store.addZone(
      [
        { lat: 14.5995, lng: 120.9842 },
        { lat: 14.5995, lng: 120.9846 },
        { lat: 14.5998, lng: 120.9846 },
        { lat: 14.5998, lng: 120.9842 }
      ],
      'roof',
      PAYLOAD
    );
    const data = JSON.parse(store.exportProjectJson());
    const z = data.zones.find((d: { id: string }) => d.id === zone.id);
    z.color = `#fff;" onmouseover="alert(2)`;
    return JSON.stringify(data);
  }

  it('imports without letting injected markup reach rendered tables', () => {
    const store = new ProjectStore();
    expect(store.importProjectJson(buildMaliciousProjectJson())).toBe(true);

    const zone = store.getZones()[0];
    expect(zone.name).toBe(PAYLOAD);
    expect(zone.color).toBe('#64748b');

    const fakeModal = { store, filterSystemId: 'all', searchKeyword: '' } as unknown as RegistryModalUI;
    const html = renderArraysTable.call(fakeModal, store.getZones(), store.getSystems());
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).not.toContain('onmouseover="alert(2)"');
    expect(html).toContain(escapeHtml(PAYLOAD));
  });

  it('sanitizes string IDs assigned through the store', () => {
    const store = new ProjectStore();
    store.importProjectJson(buildMaliciousProjectJson());
    const panel = store.getPanels()[0];
    store.updatePanelString(panel.id, 'S1"><b>', 1);
    expect(store.getPanel(panel.id)?.stringId).toBe('S1___b_');
  });
});
