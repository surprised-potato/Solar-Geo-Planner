import type { ArrayZone } from '../../types/solar';

/** Applies the registry search box and system filter to a list of arrays. */
export function filterZones(zones: ArrayZone[], searchKeyword: string, systemId: string): ArrayZone[] {
  const q = searchKeyword.toLowerCase();
  return zones.filter(
    z =>
      (!q || z.name.toLowerCase().includes(q) || z.id.toLowerCase().includes(q)) &&
      (systemId === 'all' || z.systemId === systemId)
  );
}
