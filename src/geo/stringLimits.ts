/**
 * String sizing limits (min / max modules per string) and recommended row spacing.
 */
import { InverterConfig, ModuleModel } from '../types/solar';

/**
 * Calculates theoretical electrical string length limits (min/max modules per string)
 * for a given module and inverter specification under extreme temperature conditions.
 */
export function calculateStringLimits(
  module: ModuleModel,
  inverter: InverterConfig,
  minTempC: number = -10,
  maxTempC: number = 70
): {
  minPanelsPerString: number;
  maxPanelsPerString: number;
  optimalPanelsPerString: number;
  maxColdVoc: number;
  minHotVmp: number;
} {
  // Cold Voc increase: Voc_cold = Voc * [1 + (Tmin - 25) * tempCoeffVoc]
  const vocCoeffFraction = (module.tempCoeffVoc || -0.28) / 100.0;
  const coldVocPerPanel = module.voc * (1.0 + (minTempC - 25.0) * vocCoeffFraction);
  const maxColdVoc = Number(coldVocPerPanel.toFixed(2));

  // Max panels per string so that String_Voc_cold <= Inverter max DC voltage
  const maxPanels = Math.floor(inverter.maxDcVoltage / coldVocPerPanel);

  // Hot Vmp decrease: Vmp_hot = Vmp * [1 + (Tmax - 25) * tempCoeffVoc]
  const hotVmpPerPanel = module.vmp * (1.0 + (maxTempC - 25.0) * vocCoeffFraction);
  const minHotVmp = Number(hotVmpPerPanel.toFixed(2));

  // Min panels per string so that String_Vmp_hot >= Inverter min MPPT voltage
  const minPanels = Math.ceil(inverter.minMpptVoltage / hotVmpPerPanel);

  const safeMin = Math.max(1, minPanels);
  const safeMax = Math.max(safeMin, maxPanels);

  // Optimal string size in the upper-mid range for high inverter efficiency
  const target = Math.round(safeMin + (safeMax - safeMin) * 0.85);
  const optimalPanels = Math.min(safeMax, Math.max(safeMin, target));

  return {
    minPanelsPerString: safeMin,
    maxPanelsPerString: safeMax,
    optimalPanelsPerString: optimalPanels,
    maxColdVoc,
    minHotVmp
  };
}

/**
 * Calculates recommended ground mount row-to-row spacing based on tilt angle and latitude
 * to avoid winter solstice inter-row shading (9:00 AM - 3:00 PM).
 */
export function calculateRecommendedRowSpacing(
  tiltDeg: number,
  panelLengthM: number,
  latitudeDeg: number = 37.0
): number {
  const tiltRad = (tiltDeg * Math.PI) / 180.0;
  const panelHeight = panelLengthM * Math.sin(tiltRad);

  // Approximate winter solstice noon solar altitude: alpha = 90 - abs(lat) - 23.45
  const sunElevationDeg = Math.max(15, 90 - Math.abs(latitudeDeg) - 23.45);
  const sunElevationRad = (sunElevationDeg * Math.PI) / 180.0;

  // Inter-row pitch gap to clear shadow
  const shadowLength = panelHeight / Math.tan(sunElevationRad);
  return Math.round(shadowLength * 100) / 100;
}
