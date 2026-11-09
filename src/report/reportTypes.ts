import {
  LatLngPoint,
  ModuleModel,
  InverterConfig,
  ArrayZone,
  SolarSystem,
  AcFeederSummary,
  SystemCableSummary
} from '../types/solar';
import { SldSystemModel } from '../geo/sldModel';
import { SolarYieldResult } from '../geo/solarYield';
import { SimulationResult } from '../geo/energySimulation';

export interface ReportExportOptions {
  projectTitle: string;
  clientName: string;
  engineerName: string;
  companyName: string;
  reportDate: string;
  systemId: string; // 'all' or specific solar system ID
  includeCadView: boolean;
  includeArraySchedule?: boolean; // Schedule of Photovoltaic Arrays (all sub-arrays)
  includeSpecs: boolean;
  includeSimulation: boolean;
  includeSld: boolean;
  includeBoq: boolean;
  /** Cover page, contents and notes sheets (default true) */
  includeCover?: boolean;
  /** Project summary sheet, PVsyst page-1 style (default true) */
  includeSummary?: boolean;
  /** PEC cable/OCPD schedule, AC feeder and DC cable summaries (default true) */
  includeElectrical?: boolean;
  /** Use satellite imagery beneath the CAD site layout (default true) */
  satelliteBasemap?: boolean;
  notes?: string;
}

export interface ReportExecutiveMetrics {
  totalDcKwp: number;
  totalAcKw: number;
  dcAcRatio: number;
  totalPanels: number;
  totalInverters: number;
  totalAreaSqM: number;
  annualYieldMwh: number;
  specificYieldKwhPerKwp: number;
  performanceRatio: number;
  capacityFactor: number;
  annualGhiKwhPerM2: number;
  annualPoaKwhPerM2: number;
  centroid: LatLngPoint;
}

export interface ReportZoneSummary {
  id: string;
  systemId: string;
  name: string;
  systemName: string;
  mountType: 'roof' | 'ground';
  moduleModelName: string;
  moduleCount: number;
  totalKwp: number;
  tiltDeg: number;
  azimuthDeg: number;
  pitchM: number;
  areaSqM: number;
  orientation?: 'portrait' | 'landscape';
  setbackM?: number;
  stringCount?: number;
  modulesPerString?: number;
  stringIds?: string[];
  railCount?: number;
  tableCount?: number;
}

export interface ReportElectricalBOS {
  dcConductor: string;
  dcConduit: string;
  acFeederConductor: string;
  acFeederConduit: string;
  inverterBreakerA: number;
  mainBreakerA: number;
  systemVoltageV: number;
  phase: string;
  interconnectionType: string;
  hasTransformer: boolean;
  transformerKva?: number;
}

export interface SldScheduleTableRow {
  tag: string;
  route: string;
  voltsPhase: string;
  ratedDesignCurrent: string;
  ocpd: string;
  conductors: string;
  egc: string;
  conduit: string;
  standard: string;
}

/** Everything the electrical sheets need for one solar system. */
export interface ReportSystemData {
  system: SolarSystem;
  module: ModuleModel;
  zones: ReportZoneSummary[];
  sldModel: SldSystemModel;
  scheduleRows: SldScheduleTableRow[];
  acFeeder: AcFeederSummary;
  cables: SystemCableSummary;
}

export interface ReportBundleData {
  options: ReportExportOptions;
  projectName: string;
  createdAt: string;
  executiveMetrics: ReportExecutiveMetrics;
  zones: ReportZoneSummary[];
  primaryModule: ModuleModel;
  primaryInverter: InverterConfig;
  electricalBos: ReportElectricalBOS;
  sldScheduleRows: SldScheduleTableRow[];
  solarYield: SolarYieldResult;
  simulationResult?: SimulationResult | null;
  targetSystems: SolarSystem[];
  targetZones: ArrayZone[];
  /** Per-system electrical data for every system in scope. */
  systems: ReportSystemData[];
}
