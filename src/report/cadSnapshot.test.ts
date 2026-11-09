import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectStore } from '../store/projectStore';
import { localMetricToLatLng } from '../geo/projection';
import {
  computeProjectMetricBounds,
  computeCadViewTransform,
  getFriendlyScaleStep,
  renderCadViewSvg,
  renderCadViewPng,
  isPlaceholderTile,
  buildGoogleTileUrl
} from './cadSnapshot';

describe('CAD Snapshot Engine (cadSnapshot)', () => {
  let store: ProjectStore;
  const origin = { lat: 37.7749, lng: -122.4194 };

  beforeEach(() => {
    store = new ProjectStore();
    store.clearAll();

    // Add sample 30m x 20m commercial roof array
    const vertices = [
      origin,
      localMetricToLatLng({ x: 30, y: 0 }, origin),
      localMetricToLatLng({ x: 30, y: 20 }, origin),
      localMetricToLatLng({ x: 0, y: 20 }, origin)
    ];
    const zone = store.addZone(vertices, 'roof', 'Test Rooftop Solar Array');

    // Add sample keepout obstacle
    const obstacle = [
      localMetricToLatLng({ x: 10, y: 8 }, origin),
      localMetricToLatLng({ x: 15, y: 8 }, origin),
      localMetricToLatLng({ x: 15, y: 12 }, origin),
      localMetricToLatLng({ x: 10, y: 12 }, origin)
    ];
    store.addKeepOut(zone.id, obstacle);
  });

  it('computes accurate metric bounding boxes for project layout', () => {
    const bounds = computeProjectMetricBounds(store, origin, 'all');
    expect(bounds).toBeDefined();
    expect(bounds.spanX).toBeGreaterThanOrEqual(25);
    expect(bounds.spanY).toBeGreaterThanOrEqual(15);
    expect(bounds.centerX).toBeCloseTo(15, 0);
    expect(bounds.centerY).toBeCloseTo(10, 0);
  });

  it('handles empty projects with a safe fallback bounding box', () => {
    const emptyStore = new ProjectStore();
    emptyStore.clearAll();
    const bounds = computeProjectMetricBounds(emptyStore, origin, 'all');
    expect(bounds.spanX).toBeGreaterThan(0);
    expect(bounds.spanY).toBeGreaterThan(0);
  });

  it('calculates friendly metric scale steps', () => {
    expect(getFriendlyScaleStep(15)).toBe(5);
    expect(getFriendlyScaleStep(45)).toBe(10);
    expect(getFriendlyScaleStep(90)).toBe(20);
    expect(getFriendlyScaleStep(200)).toBe(50);
    expect(getFriendlyScaleStep(450)).toBe(100);
    expect(getFriendlyScaleStep(900)).toBe(200);
    expect(getFriendlyScaleStep(2500)).toBe(500);
  });

  it('generates a complete architectural CAD SVG drawing', () => {
    const svg = renderCadViewSvg(store, {
      width: 1400,
      height: 880,
      systemId: 'all',
      showLabels: true
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    // Verify true north compass
    expect(svg).toContain('>N<');
    expect(svg).toContain('>S<');
    // Verify scale bar
    expect(svg).toContain('SCALE 1 :');
    // Verify title block
    expect(svg).toContain('CAD SITE PLAN &amp; ARRAY LAYOUT');
    expect(svg).toContain('Coords:');
    // Verify zone polygon and panel group
    expect(svg).toContain('id="cad-panels"');
  });

  it('renders ground mount arrays as unified tables without individual panel duplication', () => {
    store.clearAll();
    const groundVertices = [
      origin,
      localMetricToLatLng({ x: 80, y: 0 }, origin),
      localMetricToLatLng({ x: 80, y: 50 }, origin),
      localMetricToLatLng({ x: 0, y: 50 }, origin)
    ];
    store.addZone(groundVertices, 'ground', 'Ground Mount Solar Farm');

    const svg = renderCadViewSvg(store, {
      width: 1200,
      height: 800,
      systemId: 'all'
    });

    expect(svg).toContain('id="cad-ground-tables"');
    // For ground mount, panels group should be empty of individual panels
    expect(svg).toContain('<g id="cad-panels"></g>');
  });

  it('renders CAD PNG data URI successfully', async () => {
    const pngUri = await renderCadViewPng(store, { width: 800, height: 500 });
    expect(pngUri).toBeDefined();
    expect(typeof pngUri).toBe('string');
    expect(pngUri.startsWith('data:')).toBe(true);
  });

  it('computes invertible CAD view transform for aligning satellite basemap tiles', () => {
    const t = computeCadViewTransform(store, 1400, 880, 'all');
    const centerScreen = t.toScreenPt(origin);
    const roundtrip = t.toLatLng(centerScreen.x, centerScreen.y);
    expect(roundtrip.lat).toBeCloseTo(origin.lat, 5);
    expect(roundtrip.lng).toBeCloseTo(origin.lng, 5);
  });

  it('safely handles isPlaceholderTile in non-DOM or headless environments', () => {
    const dummyImg = {} as HTMLImageElement;
    expect(isPlaceholderTile(dummyImg)).toBe(false);
  });

  it('constructs correct Google satellite and hybrid tile URLs matching Map View', () => {
    const urlHybrid = buildGoogleTileUrl(83857, 202648, 19, 'y');
    expect(urlHybrid).toMatch(/^https:\/\/mt[0-3]\.google\.com\/vt\/lyrs=y&x=83857&y=202648&z=19$/);

    const urlSat = buildGoogleTileUrl(83857, 202648, 19, 's');
    expect(urlSat).toMatch(/^https:\/\/mt[0-3]\.google\.com\/vt\/lyrs=s&x=83857&y=202648&z=19$/);
  });
});
