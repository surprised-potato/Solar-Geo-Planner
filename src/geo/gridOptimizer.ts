/**
 * Grid-shift optimizer: searches panel grid offsets that maximize the number of panels that fit.
 */
import { ArrayZone } from '../types/solar';
import { generatePanelsForZone } from './autofill';

/**
 * Sweeps candidate grid phase offsets (X, Y) to find the alignment that maximizes total panels.
 */
export function optimizeGridShift(
  zone: ArrayZone,
  steps: number = 12
): {
  optimalOffsetX: number;
  optimalOffsetY: number;
  maxPanelCount: number;
  previousPanelCount: number;
} {
  const isPortrait = zone.config.orientation === 'portrait';
  const physWidthM = isPortrait
    ? zone.config.panelWidthMm / 1000.0
    : zone.config.panelLengthMm / 1000.0;
  const physLengthM = isPortrait
    ? zone.config.panelLengthMm / 1000.0
    : zone.config.panelWidthMm / 1000.0;

  const tiltRad = (zone.config.tiltDeg * Math.PI) / 180.0;
  const projectedDepthM = physLengthM * Math.cos(tiltRad);

  const isGround = zone.config.mountType === 'ground';
  let deltaU: number;
  let deltaV: number;

  if (isGround) {
    const modulesUp = Math.max(1, zone.config.modulesPerTableUp ?? 2);
    const modulesWide = Math.max(1, zone.config.modulesPerTableWide ?? 14);
    const intraModGapU = Math.max(0.005, zone.config.colSpacingM ?? 0.02);
    const intraModGapV = Math.max(0.005, zone.config.intraTableSpacingM ?? 0.02);
    const tableGapU = Math.max(0.05, zone.config.tableSpacingM ?? 1.0);

    const tableWidthM = modulesWide * physWidthM + (modulesWide - 1) * intraModGapU;
    const tableDepthM = modulesUp * projectedDepthM + (modulesUp - 1) * intraModGapV;

    deltaU = tableWidthM + tableGapU;
    deltaV =
      zone.config.rowSpacingM >= tableDepthM + 0.2
        ? zone.config.rowSpacingM
        : tableDepthM + Math.max(0.5, zone.config.rowSpacingM);
  } else {
    deltaU = physWidthM + Math.max(0.005, zone.config.colSpacingM);
    deltaV = projectedDepthM + Math.max(0.005, zone.config.rowSpacingM);
  }

  const currentResult = generatePanelsForZone(zone);
  const previousPanelCount = currentResult.panels.length;

  let bestCount = previousPanelCount;
  let bestX = zone.config.alignmentOffsetX;
  let bestY = zone.config.alignmentOffsetY;

  // Multi-phase sweep over [0, deltaU) x [0, deltaV)
  const sweepSteps = Math.max(2, steps);
  for (let i = 0; i < sweepSteps; i++) {
    const offX = Number(((i / sweepSteps) * deltaU).toFixed(3));
    for (let j = 0; j < sweepSteps; j++) {
      const offY = Number(((j / sweepSteps) * deltaV).toFixed(3));

      const testZone: ArrayZone = {
        ...zone,
        config: {
          ...zone.config,
          alignmentOffsetX: offX,
          alignmentOffsetY: offY
        }
      };

      const res = generatePanelsForZone(testZone);
      if (res.panels.length > bestCount) {
        bestCount = res.panels.length;
        bestX = offX;
        bestY = offY;
      }
    }
  }

  return {
    optimalOffsetX: bestX,
    optimalOffsetY: bestY,
    maxPanelCount: bestCount,
    previousPanelCount
  };
}
