/**
 * Partitions an array's panels into series strings within inverter MPPT limits.
 */
import { SolarPanelObject, StringTraverseDirection } from '../../types/solar';
import { chainAdjacentPanels, clusterContiguousPanels, sortPanelsForStringing } from './panelOrdering';

export interface StringPartitionOptions {
  customModulesPerString?: number;
  direction?: StringTraverseDirection;
  zoneName?: string;
}

export interface StringPartitionResult {
  stringGroups: SolarPanelObject[][];
  warnings: string[];
}

/**
 * Partitions panels in an ArrayZone into continuous strings, respecting physical
 * subarray/block boundaries (such as 2-row blocks separated by walkways).
 * Panels inside each block are kept contiguous and unbroken whenever possible.
 */
export function partitionPanelsIntoStrings(
  panels: SolarPanelObject[],
  azimuthDeg: number,
  limits: {
    minPanelsPerString: number;
    maxPanelsPerString: number;
    optimalPanelsPerString: number;
  },
  options: StringPartitionOptions = {}
): StringPartitionResult {
  const warnings: string[] = [];
  const stringGroups: SolarPanelObject[][] = [];
  if (panels.length === 0) {
    return { stringGroups, warnings };
  }

  const direction = options.direction || 'short_side';
  const targetSize = options.customModulesPerString
    ? Math.min(limits.maxPanelsPerString, Math.max(limits.minPanelsPerString, options.customModulesPerString))
    : limits.optimalPanelsPerString;

  // 1. Cluster panels into physically contiguous subarrays/blocks
  const clusters = clusterContiguousPanels(panels, azimuthDeg);

  let pendingPanels: SolarPanelObject[] = [];

  for (const cluster of clusters) {
    if (cluster.length === 0) continue;

    // Sort panels inside this cluster into a contiguous serpentine path
    const sortedCluster = sortPanelsForStringing(cluster, azimuthDeg, direction);
    const M = sortedCluster.length;

    // Check if cluster can stand alone as 1 or more strings within [minPanelsPerString, maxPanelsPerString]
    const kMin = Math.ceil(M / limits.maxPanelsPerString);
    const kMax = Math.floor(M / limits.minPanelsPerString);

    if (kMin <= kMax && kMax >= 1) {
      // If there were pending panels from a previous undersized cluster, resolve them first
      if (pendingPanels.length > 0) {
        if (pendingPanels.length + M <= limits.maxPanelsPerString) {
          stringGroups.push(chainAdjacentPanels([...pendingPanels, ...sortedCluster]));
          pendingPanels = [];
          continue;
        } else {
          stringGroups.push(chainAdjacentPanels(pendingPanels));
          if (pendingPanels.length < limits.minPanelsPerString) {
            warnings.push(
              `Array "${options.zoneName || 'Zone'}" string has ${pendingPanels.length} panels, below min MPPT voltage (${limits.minPanelsPerString} panels).`
            );
          }
          pendingPanels = [];
        }
      }

      // Choose optimal k
      let k = Math.round(M / targetSize);
      k = Math.max(kMin, Math.min(kMax, k));

      const baseSize = Math.floor(M / k);
      const remainder = M % k;
      let offset = 0;
      for (let i = 0; i < k; i++) {
        const count = baseSize + (i < remainder ? 1 : 0);
        const subPanels = sortedCluster.slice(offset, offset + count);
        offset += count;
        stringGroups.push(chainAdjacentPanels(subPanels));
        if (count < limits.minPanelsPerString) {
          warnings.push(
            `Array "${options.zoneName || 'Zone'}" string #${stringGroups.length} has ${count} panels, below min MPPT voltage (${limits.minPanelsPerString} panels).`
          );
        }
      }
    } else {
      // Cluster is too small to stand alone (M < minPanelsPerString) or cannot divide cleanly
      pendingPanels.push(...sortedCluster);

      if (pendingPanels.length >= limits.minPanelsPerString) {
        if (pendingPanels.length <= limits.maxPanelsPerString) {
          stringGroups.push(chainAdjacentPanels(pendingPanels));
          pendingPanels = [];
        } else {
          let k = Math.max(
            Math.ceil(pendingPanels.length / limits.maxPanelsPerString),
            Math.round(pendingPanels.length / targetSize)
          );
          while (Math.ceil(pendingPanels.length / k) > limits.maxPanelsPerString) {
            k++;
          }
          const baseSize = Math.floor(pendingPanels.length / k);
          const remainder = pendingPanels.length % k;
          let offset = 0;
          for (let i = 0; i < k; i++) {
            const count = baseSize + (i < remainder ? 1 : 0);
            const sub = pendingPanels.slice(offset, offset + count);
            offset += count;
            stringGroups.push(chainAdjacentPanels(sub));
          }
          pendingPanels = [];
        }
      }
    }
  }

  // Handle any remaining pending panels at the end of the zone
  if (pendingPanels.length > 0) {
    if (
      stringGroups.length > 0 &&
      stringGroups[stringGroups.length - 1].length + pendingPanels.length <= limits.maxPanelsPerString
    ) {
      const lastGroup = stringGroups.pop()!;
      stringGroups.push(chainAdjacentPanels([...lastGroup, ...pendingPanels]));
    } else {
      stringGroups.push(chainAdjacentPanels(pendingPanels));
      if (pendingPanels.length < limits.minPanelsPerString) {
        warnings.push(
          `Array "${options.zoneName || 'Zone'}" string #${stringGroups.length} has ${pendingPanels.length} panels, below min MPPT voltage (${limits.minPanelsPerString} panels).`
        );
      }
    }
  }

  return { stringGroups, warnings };
}
