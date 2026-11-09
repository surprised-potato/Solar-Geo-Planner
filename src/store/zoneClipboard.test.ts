import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectStore } from './projectStore';
import { localMetricToLatLng } from '../geo/projection';

describe('Array copy / paste', () => {
  let store: ProjectStore;
  const origin = { lat: 37.7749, lng: -122.4194 };
  const square = [
    origin,
    localMetricToLatLng({ x: 30, y: 0 }, origin),
    localMetricToLatLng({ x: 30, y: 20 }, origin),
    localMetricToLatLng({ x: 0, y: 20 }, origin)
  ];

  beforeEach(() => {
    store = new ProjectStore();
    store.clearAll();
  });

  it('pastes an independent copy beside the original, keeping disabled panels', () => {
    const zone = store.addZone(square, 'roof', 'Roof A');
    const first = Array.from(store.panels.values()).find(p => p.zoneId === zone.id)!;
    first.active = false;
    store.regenerateZonePanels(zone.id);

    expect(store.copySelectedZones()).toBe(1);
    const [copy] = store.pasteZones();

    expect(copy.id).not.toBe(zone.id);
    expect(copy.name).toBe('Roof A 2');
    expect(copy.vertices[0].lng).toBeGreaterThan(zone.vertices[1].lng);
    expect(copy.panelCount).toBe(zone.panelCount);
    expect(copy.activePanelCount).toBe(zone.activePanelCount);
    expect(store.getSelectedZoneIds()).toEqual([copy.id]);
    expect(store.getSystems()[0].zoneIds).toContain(copy.id);

    expect(store.pasteZones()[0].name).toBe('Roof A 3');

    copy.vertices[0].lat += 1;
    expect(zone.vertices[0].lat).toBe(origin.lat);
  });

  it('pastes at an anchor point', () => {
    store.addZone(square, 'ground', 'G');
    store.copySelectedZones();
    const anchor = { lat: 38, lng: -121 };
    const [copy] = store.pasteZones(anchor);
    const cLat = copy.vertices.reduce((s, v) => s + v.lat, 0) / copy.vertices.length;
    expect(Math.abs(cLat - anchor.lat)).toBeLessThan(0.001);
  });
});

describe('Array transforms', () => {
  const origin = { lat: 37.7749, lng: -122.4194 };
  const square = [
    origin,
    localMetricToLatLng({ x: 30, y: 0 }, origin),
    localMetricToLatLng({ x: 30, y: 20 }, origin),
    localMetricToLatLng({ x: 0, y: 20 }, origin)
  ];

  it('moves by metres, preserving panel count', () => {
    const store = new ProjectStore();
    store.clearAll();
    const z = store.addZone(square, 'roof', 'A');
    const before = z.panelCount;
    store.moveSelectedZones(10, 0);
    const d = (z.vertices[0].lng - origin.lng);
    expect(d).toBeGreaterThan(0);
    expect(z.vertices[0].lat).toBeCloseTo(origin.lat, 8);
    expect(z.panelCount).toBe(before);
  });

  it('rotates clockwise, updating azimuth and returning to start after 360°', () => {
    const store = new ProjectStore();
    store.clearAll();
    const z = store.addZone(square, 'roof', 'A');
    const az = z.config.azimuthDeg;
    store.rotateSelectedZones(90);
    expect(z.config.azimuthDeg).toBeCloseTo((az + 90) % 360, 6);
    for (let i = 0; i < 3; i++) store.rotateSelectedZones(90);
    expect(z.vertices[0].lat).toBeCloseTo(origin.lat, 7);
    expect(z.vertices[0].lng).toBeCloseTo(origin.lng, 7);
  });

  it('flips horizontally about the centre and cuts/pastes', () => {
    const store = new ProjectStore();
    store.clearAll();
    const z = store.addZone(square, 'roof', 'A');
    store.flipSelectedZones('horizontal');
    expect(z.vertices[0].lng).toBeGreaterThan(z.vertices[1].lng);
    expect(store.cutSelectedZones()).toBe(1);
    expect(store.getZones().length).toBe(0);
    expect(store.pasteZones().length).toBe(1);
    expect(store.getZones().length).toBe(1);
  });
});
