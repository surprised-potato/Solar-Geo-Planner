/**
 * Aggregates CAD registry geometry, cabling and SLD electrical data into the
 * quantities every DUPA work item builder needs, plus rate lookups that preserve
 * user-edited rates from an existing BOQ.
 */
import { ProjectBoqState } from '../../types/solar';
import { ProjectStore } from '../../store/projectStore';
import { buildSldSystemModel } from '../sldModel';
import { calculateGeodeticDistanceM } from '../projection';
import { getSystemHomeruns } from '../stringCabling';
import {
  DEFAULT_OCM_PERCENT,
  DEFAULT_PROFIT_PERCENT,
  DEFAULT_VAT_PERCENT,
  normalizeDupaQuotes
} from './dupaMath';

export function buildBoqContext(
  store: ProjectStore,
  systemIdOrIds?: string | string[],
  existingBoq?: ProjectBoqState
) {
  // A single id, 'all'/undefined for the whole project, or a list of ids (one farm's systems)
  const idSet: Set<string> | null = Array.isArray(systemIdOrIds)
    ? new Set(systemIdOrIds)
    : systemIdOrIds && systemIdOrIds !== 'all'
      ? new Set([systemIdOrIds])
      : null;
  const isAll = idSet === null;
  const systemId = Array.isArray(systemIdOrIds) ? undefined : systemIdOrIds;
  const allSystems = store.getSystems();
  const systems = idSet ? allSystems.filter(s => idSet.has(s.id)) : allSystems;

  const allPanels = idSet ? store.getPanels().filter(p => idSet.has(p.systemId)) : store.getPanels();
  const activePanels = allPanels.filter(p => p.active);
  const totalPanelsCount = activePanels.length;

  const allZones = store.getZones();
  const zones = idSet ? allZones.filter(z => idSet.has(z.systemId)) : allZones;

  // Existing custom rates lookup map: autoSourceKey -> unitCostPhp / ratePerDayPhp
  const existingMaterialRates = new Map<string, number>();
  const existingLaborRates = new Map<string, number>();
  const existingEquipRates = new Map<string, number>();

  if (existingBoq?.items) {
    for (const item of existingBoq.items) {
      for (const m of item.materials) {
        if (m.autoSourceKey) existingMaterialRates.set(m.autoSourceKey, m.unitCostPhp);
        existingMaterialRates.set(m.description, m.unitCostPhp);
      }
      for (const l of item.labor) {
        existingLaborRates.set(l.description, l.ratePerDayPhp);
      }
      for (const e of item.equipment) {
        existingEquipRates.set(e.description, e.ratePerDayPhp);
      }
    }
  }

  const getMatRate = (key: string, desc: string, defaultRate: number) => {
    return existingMaterialRates.get(key) ??
      existingMaterialRates.get(desc) ??
      existingMaterialRates.get(normalizeDupaQuotes(desc)) ??
      defaultRate;
  };
  const getLabRate = (desc: string, defaultRate: number) => {
    return existingLaborRates.get(desc) ?? defaultRate;
  };
  const getEqRate = (desc: string, defaultRate: number) => {
    return existingEquipRates.get(desc) ?? defaultRate;
  };

  const ocmPercent = existingBoq?.ocmPercent ?? DEFAULT_OCM_PERCENT;
  const profitPercent = existingBoq?.profitPercent ?? DEFAULT_PROFIT_PERCENT;
  const vatPercent = existingBoq?.vatPercent ?? DEFAULT_VAT_PERCENT;

  // Aggregate geometry from zones
  let totalRailCount = 0;
  let totalRailSpanM = 0;
  let totalAttachmentPointsCount = 0;
  let totalMidClamps = 0;
  let totalEndClamps = 0;
  let totalRailSplices = 0;
  let totalRoofPanels = 0;
  let totalGroundTables = 0;
  let totalGroundPanels = 0;
  let groundModulesUp = 2;
  let groundModulesWide = 14;

  for (const z of zones) {
    const zoneActivePanels = activePanels.filter(p => p.zoneId === z.id);
    const zPanelCount = zoneActivePanels.length > 0 ? zoneActivePanels.length : (z.panelCount || 0);

    if (z.config.mountType === 'roof') {
      totalRoofPanels += zPanelCount;
      const rails = z.rails || [];
      totalRailCount += rails.length;
      for (const r of rails) {
        totalRailSpanM += r.lengthM;
        totalAttachmentPointsCount += r.attachmentPoints ? r.attachmentPoints.length : Math.max(2, Math.ceil(r.lengthM / 1.1));
        const pCount = r.panelIds.length;
        if (pCount > 0) {
          totalEndClamps += 2;
          totalMidClamps += Math.max(0, pCount - 1);
        }
        totalRailSplices += Math.max(0, Math.floor(r.lengthM / 4.4));
      }
    } else {
      if (z.config.modulesPerTableUp) groundModulesUp = z.config.modulesPerTableUp;
      if (z.config.modulesPerTableWide) groundModulesWide = z.config.modulesPerTableWide;
      const tCount = z.tableCount ?? (z.tables ? z.tables.length : 0);
      totalGroundTables += tCount;
      if (z.tables && z.tables.length > 0) {
        const activeTables = tCount > 0 && tCount < z.tables.length ? z.tables.slice(0, tCount) : z.tables;
        for (const t of activeTables) {
          totalGroundPanels += t.panelIds.length;
        }
      } else {
        const panelsPerT = (z.config.modulesPerTableUp || groundModulesUp) * (z.config.modulesPerTableWide || groundModulesWide);
        totalGroundPanels += tCount > 0 ? tCount * panelsPerT : zPanelCount;
      }
    }
  }

  const hasGround = totalGroundTables > 0 || zones.some(z => z.config?.mountType === 'ground');
  const hasExplicitRoof = totalRoofPanels > 0 || totalRailCount > 0 || zones.some(z => z.config?.mountType === 'roof');
  const hasRoof = hasExplicitRoof || !hasGround;
  const isHybrid = hasGround && hasExplicitRoof;
  const isPureGround = hasGround && !hasExplicitRoof;

  const defaultTablePanels = groundModulesUp * groundModulesWide;
  if (hasGround) {
    if (totalGroundTables === 0) {
      totalGroundTables = Math.max(1, Math.ceil((totalGroundPanels || defaultTablePanels) / defaultTablePanels));
    }
    if (totalGroundPanels === 0) {
      totalGroundPanels = totalGroundTables * defaultTablePanels;
    }
  }

  // Fallbacks if zones haven't generated rails yet but panels exist
  if (hasRoof && totalRailCount === 0 && totalRoofPanels > 0) {
    // 4 panels share ~4.4m of 2 rails -> ~2.2m rail per panel
    totalRailSpanM = totalRoofPanels * 2.2;
    totalAttachmentPointsCount = Math.max(4, Math.ceil(totalRoofPanels * 2.1));
    totalEndClamps = Math.max(4, Math.ceil(totalRoofPanels * 0.7));
    totalMidClamps = Math.max(0, totalRoofPanels * 2 - totalEndClamps);
    totalRailSplices = Math.max(0, Math.ceil(totalRailSpanM / 20));
  }

  const aluminumRailPcs = Math.max(1, Math.ceil(totalRailSpanM / 4.2));

  // String & Cabling Aggregation
  const rawStringCables = idSet
    ? store.getStringCables('all').filter(c => idSet.has(c.systemId))
    : store.getStringCables('all');
  const totalStrings = rawStringCables.length;
  let totalIntraStringM = 0;
  let totalHomerunM = 0;
  let totalRacewayPathM = 0;

  for (const sc of rawStringCables) {
    totalIntraStringM += sc.intraStringLengthM;
    totalHomerunM += sc.totalHomerunM;
    if (sc.racewayPathLengthM) totalRacewayPathM += sc.racewayPathLengthM;
  }

  // Deduplicated DC Raceway Geometry (CAD & Registry Synchronization)
  let totalDcRacewayM = 0;
  let totalDcRacewayBends = 0;
  let hasAnyDrawnDcRaceway = false;

  // 1. Shared system homerun raceways (counted once per system in scope)
  for (const s of systems) {
    for (const hr of getSystemHomeruns(s)) {
      hasAnyDrawnDcRaceway = true;
      let pathLen2D = 0;
      for (let i = 0; i < hr.path.length - 1; i++) {
        pathLen2D += calculateGeodeticDistanceM(hr.path[i], hr.path[i + 1]);
      }
      const elevM = Math.abs(hr.elevationChangeM ?? 0);
      let distToInv = 0;
      if (s.inverterLocation) {
        const exitPt = hr.path[hr.path.length - 1];
        const rawDist = calculateGeodeticDistanceM(exitPt, s.inverterLocation);
        distToInv = rawDist > 5000 ? 0 : rawDist;
      }
      totalDcRacewayM += (pathLen2D + elevM + distToInv);
      totalDcRacewayBends += Math.max(1, hr.path.length - 2) + (elevM > 0 ? 2 : 0);
    }
  }

  // 2. Dedicated array zone raceways (counted once per zone with dedicated raceway)
  for (const z of zones) {
    if (z.raceway && z.raceway.path && z.raceway.path.length >= 2) {
      if (!z.raceway.systemId || z.raceway.systemId === z.systemId) {
        hasAnyDrawnDcRaceway = true;
        let pathLen2D = 0;
        for (let i = 0; i < z.raceway.path.length - 1; i++) {
          pathLen2D += calculateGeodeticDistanceM(z.raceway.path[i], z.raceway.path[i + 1]);
        }
        const elevM = Math.abs(z.raceway.elevationChangeM ?? (z.elevationDeltaM ?? 0));
        const sys = store.getSystem(z.systemId);
        let distToInv = 0;
        if (sys?.inverterLocation) {
          const exitPt = z.raceway.path[z.raceway.path.length - 1];
          const rawDist = calculateGeodeticDistanceM(exitPt, sys.inverterLocation);
          distToInv = rawDist > 5000 ? 0 : rawDist;
        }
        totalDcRacewayM += (pathLen2D + elevM + distToInv);
        totalDcRacewayBends += Math.max(1, z.raceway.path.length - 2) + (elevM > 0 ? 2 : 0);
      }
    }
  }

  // Baseline fallback when no raceway polyline is drawn yet in CAD
  if (!hasAnyDrawnDcRaceway) {
    totalDcRacewayM = Math.max(15, Math.ceil(zones.length * 12));
    totalDcRacewayBends = Math.max(2, zones.length * 2);
  }

  // Inverter & SLD model aggregation
  let totalAcKw = 0;
  let totalInverterUnits = 0;
  let maxDcVoltage = 1100;
  let phaseStr = '3-Phase';
  let mainBreakerA = 400;
  let maxPhaseMm2 = 80;
  let totalFeederRunM = 0;
  let primaryInverterModel = '50kW String Inverter';

  // Transformer & AC Combiner specifics from SLD
  let hasAnyTransformer = false;
  let totalTransformerKva = 0;
  let transformerTypeStr = 'Step-Up';
  let transformerPriV = 400;
  let transformerSecV = 400;
  let transformerPriOcpdA = 200;
  let transformerSecOcpdA = 200;
  let transformerVectorGroup = 'Dyn11 (Δ-Y)';
  let transformerStationsCount = 0;

  let hasAnyAcCombiner = false;
  let totalAcCombinersCount = 0;
  let maxAcCombinerBreakerA = 250;
  let maxInverterBreakerA = 100;
  let maxMdpMainBreakerA = 400;
  let primarySystemVoltageV = 400;
  let primaryInverterVoltageV = 400;

  for (const s of systems) {
    const sldModel = buildSldSystemModel(store, s.id);
    totalAcKw += sldModel.totalAcKw;
    totalInverterUnits += sldModel.inverter.inverterCount;
    if (sldModel.inverter.maxDcVoltage) maxDcVoltage = sldModel.inverter.maxDcVoltage;
    if (s.inverter.modelName) primaryInverterModel = s.inverter.modelName;
    if (!sldModel.isThreePhase) phaseStr = 'Single-Phase';
    if (sldModel.acVoltage) primaryInverterVoltageV = sldModel.acVoltage;
    if (sldModel.systemVoltageV) primarySystemVoltageV = sldModel.systemVoltageV;
    if (sldModel.mainBreakerRatingA > mainBreakerA) mainBreakerA = sldModel.mainBreakerRatingA;
    if (sldModel.mdpMainBreakerRatingA > maxMdpMainBreakerA) maxMdpMainBreakerA = sldModel.mdpMainBreakerRatingA;
    if (sldModel.mainFeederWireSizing.phaseConductorMm2 > maxPhaseMm2) {
      maxPhaseMm2 = sldModel.mainFeederWireSizing.phaseConductorMm2;
    }
    const feederSum = store.getSystemAcFeederSummary(s.id);
    totalFeederRunM += feederSum.totalRunM;

    // AC Combiner
    if (sldModel.hasAcCombiner) {
      hasAnyAcCombiner = true;
      totalAcCombinersCount += 1;
      if (sldModel.acCombinerBreakerRatingA > maxAcCombinerBreakerA) {
        maxAcCombinerBreakerA = sldModel.acCombinerBreakerRatingA;
      }
    }
    for (const inv of sldModel.inverters) {
      if (inv.breakerRatingA > maxInverterBreakerA) {
        maxInverterBreakerA = inv.breakerRatingA;
      }
    }

    // Transformer
    if (sldModel.transformerDesign && sldModel.transformerDesign.required) {
      hasAnyTransformer = true;
      transformerStationsCount += 1;
      totalTransformerKva += sldModel.transformerDesign.kvaRating;
      transformerTypeStr = sldModel.transformerDesign.transformerType === 'step_up' ? 'Step-Up' : sldModel.transformerDesign.transformerType === 'step_down' ? 'Step-Down' : 'Isolation';
      transformerPriV = sldModel.transformerDesign.primaryVoltageV;
      transformerSecV = sldModel.transformerDesign.secondaryVoltageV;
      transformerPriOcpdA = Math.max(transformerPriOcpdA, sldModel.transformerDesign.primaryOcpdRatingA);
      transformerSecOcpdA = Math.max(transformerSecOcpdA, sldModel.transformerDesign.secondaryOcpdRatingA);
      transformerVectorGroup = sldModel.transformerDesign.vectorGroup;
    }
  }

  if (totalInverterUnits === 0) totalInverterUnits = 1;
  if (totalAcCombinersCount === 0 && (hasAnyAcCombiner || totalInverterUnits > 1)) totalAcCombinersCount = 1;

  // DC Wire Calculations: Black and Red PV1-F leads
  let dcWireLengthSinglePolarityM = Math.ceil(totalHomerunM / 2 + totalIntraStringM / 2);
  if (dcWireLengthSinglePolarityM < 100) {
    // Standard baseline fallback when homerun or inverter hasn't been pinned on map
    dcWireLengthSinglePolarityM = Math.max(100, Math.ceil(totalStrings > 0 ? totalStrings * 112.5 : totalPanelsCount * 11));
  }

  // Primary PV Module model
  const firstMod = zones.length > 0 && zones[0].moduleId ? store.getModule(zones[0].moduleId) : undefined;
  const modWatts = firstMod?.nominalPowerW || (activePanels.length > 0 ? activePanels[0].electrical.nominalPowerW : 600);
  const modName = firstMod?.name || `${modWatts}W Monocrystalline PV Module (Tier-1)`;


  // ==========================================
  let includeLightning = false; // Optional by default per user request
  if (existingBoq && existingBoq.includeLightningProtection !== undefined) {
    includeLightning = existingBoq.includeLightningProtection;
  } else if (systems.some(s => s.includeLightningProtection === true)) {
    includeLightning = true;
  }

  return {
    store,
    systemId,
    existingBoq,
    isAll,
    allSystems,
    systems,
    allPanels,
    activePanels,
    totalPanelsCount,
    allZones,
    zones,
    existingMaterialRates,
    existingLaborRates,
    existingEquipRates,
    getMatRate,
    getLabRate,
    getEqRate,
    ocmPercent,
    profitPercent,
    vatPercent,
    totalRailCount,
    totalRailSpanM,
    totalAttachmentPointsCount,
    totalMidClamps,
    totalEndClamps,
    totalRailSplices,
    totalRoofPanels,
    totalGroundTables,
    totalGroundPanels,
    groundModulesUp,
    groundModulesWide,
    hasGround,
    hasExplicitRoof,
    hasRoof,
    isHybrid,
    isPureGround,
    defaultTablePanels,
    aluminumRailPcs,
    rawStringCables,
    totalStrings,
    totalIntraStringM,
    totalHomerunM,
    totalRacewayPathM,
    totalDcRacewayM,
    totalDcRacewayBends,
    hasAnyDrawnDcRaceway,
    totalAcKw,
    totalInverterUnits,
    maxDcVoltage,
    phaseStr,
    mainBreakerA,
    maxPhaseMm2,
    totalFeederRunM,
    primaryInverterModel,
    hasAnyTransformer,
    totalTransformerKva,
    transformerTypeStr,
    transformerPriV,
    transformerSecV,
    transformerPriOcpdA,
    transformerSecOcpdA,
    transformerVectorGroup,
    transformerStationsCount,
    hasAnyAcCombiner,
    totalAcCombinersCount,
    maxAcCombinerBreakerA,
    maxInverterBreakerA,
    maxMdpMainBreakerA,
    primarySystemVoltageV,
    primaryInverterVoltageV,
    dcWireLengthSinglePolarityM,
    firstMod,
    modWatts,
    modName,
    includeLightning
  };
}

export type BoqContext = ReturnType<typeof buildBoqContext>;
