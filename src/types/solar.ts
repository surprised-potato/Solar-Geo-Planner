export type MountType = 'roof' | 'ground';
export type PanelOrientation = 'portrait' | 'landscape';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface MetricPoint {
  x: number; // East in meters
  y: number; // North in meters
}

export interface ElectricalSpecs {
  modelName: string;
  nominalPowerW: number; // e.g. 600W
  voc: number;           // Open circuit voltage (V)
  vmp: number;           // Max power voltage (V)
  isc: number;           // Short circuit current (A)
  imp: number;           // Max power current (A)
}

export interface ModuleModel {
  id: string;
  name: string;
  manufacturer: string;
  nominalPowerW: number;
  voc: number;
  vmp: number;
  isc: number;
  imp: number;
  widthMm: number;
  lengthMm: number;
  bifacial: boolean;
  tempCoeffVoc: number;  // % / °C, typically -0.28
  tempCoeffPmax: number; // % / °C, typically -0.35
}

export interface MountTableObject {
  id: string;               // e.g. "zone1_t0_1"
  zoneId: string;
  tableIndex: number;       // 1, 2, ...
  rowIndex: number;         // Table line/row index along pitch
  colIndex: number;         // Table column index along row
  centroid: LatLngPoint;
  corners: [LatLngPoint, LatLngPoint, LatLngPoint, LatLngPoint]; // 4 corners of table rack in LatLng [TL, TR, BR, BL]
  panelIds: string[];       // IDs of panels belonging to this table
  modulesUp: number;        // Modules high
  modulesWide: number;      // Modules wide
}

export interface RoofRailObject {
  id: string;               // e.g. "z1_rail_r0_s0_0"
  zoneId: string;
  rowIndex?: number;        // Row index in portrait
  colIndex?: number;        // Column index in landscape
  segmentIndex: number;     // Index of contiguous panel run
  railIndex: number;        // 0, 1, 2
  positionType: 'end_1' | 'end_2' | 'center'; // Position across panel length
  start: LatLngPoint;       // Start coordinate (with cantilever overhang)
  end: LatLngPoint;         // End coordinate (with cantilever overhang)
  lengthM: number;          // Total rail span in meters
  panelIds: string[];       // Solar panel IDs clamped on this rail
  attachmentPoints?: LatLngPoint[]; // Geographic anchor points for roof L-feet / brackets
}

export interface LayoutConfig {
  mountType: MountType;
  panelWidthMm: number;      // e.g. 1134 mm
  panelLengthMm: number;     // e.g. 2382 mm
  orientation: PanelOrientation;
  azimuthDeg: number;        // 0° = North, 90° = East, 180° = South, 270° = West
  tiltDeg: number;           // 0° to 60°
  rowSpacingM: number;       // Inter-row pitch / gap (m)
  colSpacingM: number;       // Inter-panel clamp gap along row (m) (intra-table)
  setbackM: number;          // Edge setback distance (m)
  alignmentOffsetX: number;  // Fine-tuning grid shift X (m)
  alignmentOffsetY: number;  // Fine-tuning grid shift Y (m)
  electrical: ElectricalSpecs;

  // Roof Rails Racking Configuration:
  railCount?: 2 | 3;         // Number of parallel rails per panel: 2 (near ends) or 3 (ends + center)
  railOverhangM?: number;    // Cantilever overhang of rails past outer panel edges (m, e.g. 0.10m)

  // Ground Mount Table (Rack) Structure Configuration:
  modulesPerTableUp?: number;    // Modules high per table (e.g. 1, 2, 3, 4; default 2 for ground)
  modulesPerTableWide?: number;  // Modules wide per table (e.g. 6, 10, 14, 20, 28; default 14 for ground)
  tableSpacingM?: number;        // Spacing between tables along the row (e.g. 1.0 m)
  intraTableSpacingM?: number;   // Spacing between modules vertically inside the table (e.g. 0.02 m)

  // Stringing Configuration:
  stringTraverseDirection?: StringTraverseDirection; // Default 'short_side'
}

export type StringTraverseDirection = 'long_side' | 'short_side' | 'rows' | 'columns';

export interface KeepOutPolygon {
  id: string;
  name: string;
  vertices: LatLngPoint[];
}

export type AcPhaseType = 'three_phase' | 'single_phase';

export type MdpTapType = 'load_side' | 'line_side';

export interface InverterConfig {
  id: string;
  modelName: string;
  ratedAcPowerKw: number;
  inverterCount: number;
  mpptCountPerInverter: number;
  maxStringsPerMppt: number;
  maxDcVoltage: number;        // e.g. 1100 V or 1500 V
  minMpptVoltage: number;      // e.g. 200 V
  maxMpptVoltage: number;      // e.g. 1000 V
  maxDcCurrentPerMppt: number; // e.g. 30 A
  maxDcAcRatio: number;        // e.g. 1.35
  phase?: AcPhaseType;         // 'three_phase' (3Φ) or 'single_phase' (1Φ)
  acVoltage?: number;          // Nominal AC voltage (V), e.g. 400V, 380V, 480V for 3Φ, or 230V, 220V, 240V for 1Φ
  gridFrequencyHz?: number;    // AC grid frequency (Hz), default 50 or 60
}

export interface SolarSystem {
  id: string;
  name: string;
  color: string;
  inverter: InverterConfig;
  zoneIds: string[]; // List of ArrayZone IDs linked into this system
  inverterLocation?: LatLngPoint | null; // Geolocation coordinates of Inverter Power House
  inverterElevationM?: number;           // Ground elevation of Inverter Power House (meters, default 0)
  homerunRaceway?: RacewayConfig | null; // Primary shared system-wide homerun trunk / raceway
  extraHomeruns?: RacewayConfig[];       // Additional homerun trunks drawn for this system (strings tap the nearest trunk)
  acInterconnectionLocation?: LatLngPoint | null; // Geolocation coordinates of AC Point of Common Coupling (PCC / Meter)
  acInterconnectionElevationM?: number;          // Ground elevation of AC Interconnection Point (meters, default 0)
  acRaceway?: RacewayConfig | null;              // AC Feeder Raceway from Inverter Station to PCC
  systemVoltageV?: number;                       // Nominal AC line voltage at the tapping point / MDP (V)
  hasAcCombiner?: boolean;                       // Whether an AC Combiner & Collector Breaker are used (default true)
  includeLightningProtection?: boolean;          // Whether D12 (External Lightning Protection & Perimeter Earthing Grid) is included or optional
  mdpTapType?: MdpTapType;                       // 'load_side' (backfed MDP bus) or 'line_side' (supply-side tap before main breaker)
  mdpMainBreakerA?: number;                      // Rating of Main Distribution Panel (MDP) main breaker in Amps
}

export interface SolarPanelObject {
  id: string;                // Unique ID, e.g. "z1_r03_c05"
  systemId: string;          // Parent independent solar system ID
  zoneId: string;            // Parent array zone ID
  moduleId: string;          // Assigned module model ID
  rowIndex: number;          // Row index along azimuth axis
  colIndex: number;          // Column index along row
  centroid: LatLngPoint;     // Center coordinate
  corners: [LatLngPoint, LatLngPoint, LatLngPoint, LatLngPoint]; // 4 geographic corners [TL, TR, BR, BL]
  azimuthDeg: number;
  tiltDeg: number;
  orientation: PanelOrientation;
  widthM: number;            // Panel width in meters
  lengthM: number;           // Panel actual length in meters
  projectedDepthM: number;   // Ground-projected length = length * cos(tilt)
  active: boolean;           // Can be toggled on/off
  electrical: ElectricalSpecs;

  // PV Stringing & Inverter mapping
  stringId: string | null;    // ID of the PV string (e.g. "INV1-MPPT1-A")
  stringOrder: number | null; // Sequence position within string (1, 2, 3...)
  mpptId: string | null;      // Target MPPT channel
  inverterIndex: number | null; // 1-based index of target inverter
  tableId?: string | null;    // ID of host mount table (e.g. "z1_t0_1")
  tableIndex?: number | null; // 1-based table sequence number in the array zone
  tableRow?: number;          // Table row index along pitch
  tableCol?: number;          // Table col index along table line
  tableModuleRow?: number;    // Local row index inside the table (0 to modulesUp-1)
  tableModuleCol?: number;    // Local col index inside the table (0 to modulesWide-1)
  neighbors: {
    north: string | null;
    south: string | null;
    east: string | null;
    west: string | null;
  };
}

export interface RacewayConfig {
  id: string;
  name?: string;
  path: LatLngPoint[];      // Polyline route vertices from array to inverter or inverter to PCC
  elevationChangeM: number; // Vertical elevation change / riser drop along this raceway (meters)
  systemId?: string;        // Optional associated system ID (for shared homerun trunk)
  racewayType?: 'dc_homerun' | 'ac_feeder'; // Default 'dc_homerun'
}

export interface StringCableLength {
  stringId: string;
  systemId: string;
  zoneId: string;
  panelCount: number;
  intraStringLengthM: number;       // Module-to-module interconnection wire length
  homerunPositiveM: number;         // Positive conductor to inverter (horizontal + elevation riser)
  homerunNegativeM: number;         // Negative conductor to inverter (horizontal + elevation riser)
  elevationDeltaM: number;          // Vertical elevation difference (from raceway or array fallback)
  direct3DDistanceM: number;        // Direct line-of-sight 3D Euclidean distance
  totalHomerunM: number;            // Total homerun conductor length (pos + neg)
  totalStringCableM: number;        // Total DC cable = intraString + totalHomerun
  inverterPoint: LatLngPoint | null;
  hasRaceway: boolean;              // Whether this array uses a drawn raceway
  racewayPathLengthM?: number;      // 2D distance along the drawn raceway
  leadToRacewayPosM?: number;       // Lead distance from start panel to raceway
  leadToRacewayNegM?: number;       // Lead distance from end panel to raceway
  startPanelId: string;
  endPanelId: string;
  startPoint: LatLngPoint;
  endPoint: LatLngPoint;
  tapPointPos?: LatLngPoint;        // Geographic tap-in junction point for (+) lead on homerun trunk
  tapPointNeg?: LatLngPoint;        // Geographic tap-in junction point for (-) lead on homerun trunk
  racewayId?: string;               // ID of the raceway / homerun trunk this string taps into
  isSharedHomerun?: boolean;        // True if connected via system-level shared homerun trunk
}

export interface SystemCableSummary {
  systemId: string;
  inverterLocation: LatLngPoint | null;
  inverterElevationM: number;
  totalStrings: number;
  totalIntraStringM: number;
  totalHomerunM: number;
  totalElevationRiserM: number;
  totalCableLengthM: number;
  avgStringCableLengthM: number;
  totalRacewayLengthM: number;      // Sum of horizontal raceway paths in this system
  strings: StringCableLength[];
}

export interface AcFeederSummary {
  systemId: string;
  inverterLocation: LatLngPoint | null;
  inverterElevationM: number;
  acInterconnectionLocation: LatLngPoint | null;
  acInterconnectionElevationM: number;
  directDistanceM: number;
  racewayLengthM: number;
  elevationDeltaM: number;
  totalRunM: number;
  hasRaceway: boolean;
  phase: AcPhaseType;
  voltageV: number;
  ratedCurrentA: number;
  designCurrentA: number;
  conductorCallout: string;
  conduitCallout: string;
  voltageDropV: number;
  voltageDropPercent: number;
  isCompliant: boolean;
  inverterVoltageV?: number;
  systemVoltageV?: number;
  hasTransformer?: boolean;
  transformerKva?: number;
  hasAcCombiner?: boolean;
  mdpTapType?: MdpTapType;
  mdpMainBreakerA?: number;
}

export type BasemapProvider =
  | 'google-hybrid'
  | 'google-satellite'
  | 'esri'
  | 'osm'
  | 'carto-light'
  | 'carto-dark';

export interface ViewFilterState {
  panelVisibility: 'full' | 'dimmed' | 'hidden';
  showArrayFill: boolean;
  showKeepOuts: boolean;
  showLabels: boolean;
  showStringLines: boolean; // Polylines showing string wiring sequence
  showHomerunLines?: boolean; // Show lines from string endpoints to Inverter Power House
  showRaceways?: boolean;    // Show raceway conduit paths
  showTiltArrows?: boolean;  // Show downward slope / tilt orientation arrows
  showVertices?: boolean;    // Show polygon corner vertices & edit handles
  showMountTables?: boolean; // Show ground mount racking frames / tables
  showRoofRails?: boolean;   // Show aluminum roof racking rails
  showInverters?: boolean;   // Show inverter station markers
  xRayMode: boolean;        // Quick 1-click tracing mode
  basemap?: BasemapProvider;
}

export type ViewPresetKey =
  | 'all'
  | 'panels'
  | 'wires'
  | 'presentation'
  | 'civil'
  | 'tracing'
  | 'vicinity';

export interface ArrayZone {
  id: string;
  systemId: string;          // Linked SolarSystem ID
  moduleId: string;          // Exactly one panel type per array
  name: string;
  color: string;
  vertices: LatLngPoint[];
  keepOuts: KeepOutPolygon[];
  config: LayoutConfig;
  areaSqM: number;
  usableAreaSqM: number;
  panelCount: number;
  activePanelCount: number;
  totalKwp: number;
  tableCount?: number;            // Total solar mount tables (for ground mount)
  tables?: MountTableObject[];    // Array of mount table structures
  railCount?: number;             // Total roof rails count (for roof mount)
  rails?: RoofRailObject[];       // Array of roof rail objects (for roof mount)
  raceway?: RacewayConfig | null; // Dedicated raceway conduit / cable tray path to inverter
  elevationDeltaM?: number;       // Fallback elevation difference if no raceway is drawn
}

export interface DupaMaterialRow {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitCostPhp: number;
  amountPhp: number;
  autoSourceKey?: string; // Links row to automated CAD/SLD QTO key for smart re-sync
}

export interface DupaLaborRow {
  id: string;
  description: string; // Trade / Role Description
  count: number;       // No. of personnel
  days: number;        // Duration in days
  unit: string;        // e.g. 'pax'
  ratePerDayPhp: number;
  amountPhp: number;
}

export interface DupaEquipmentRow {
  id: string;
  description: string; // Equipment / Machinery Description
  count: number;       // No. of units
  days: number;        // Duration in days
  unit: string;        // e.g. 'unit', 'set', 'trip', 'lot'
  ratePerDayPhp: number;
  amountPhp: number;
}

export interface DupaWorkItem {
  itemNo: string;          // 'D1' .. 'D13' (single-site) or '<farm code><n>' e.g. 'A1' (multi-farm)
  sectionId?: string;      // Owning farm section (multi-farm projects)
  templateNo?: string;     // Work-item template id 'D1' .. 'D13' when itemNo is farm-prefixed
  category: string;        // 'Solar Works'
  description: string;     // Work Description
  durationDays: number;    // Activity duration in days
  quantity: number;        // BOQ Quantity (e.g. 1 for lot, 167 for pc)
  unit: string;            // 'lot' | 'pc' | 'set'
  materials: DupaMaterialRow[];
  labor: DupaLaborRow[];
  equipment: DupaEquipmentRow[];
  // Computed Summary Fields:
  totalMaterialsPhp: number;
  totalLaborPhp: number;
  totalEquipmentPhp: number;
  estimatedDirectCostPhp: number; // EDC = A + B + C
  ocmPercent: number;             // Default 10.0
  ocmAmountPhp: number;
  profitPercent: number;          // Default 8.0
  profitAmountPhp: number;
  vatPercent: number;             // Default 6.0
  vatAmountPhp: number;
  totalItemCostPhp: number;       // EDC + OCM + Profit + VAT
  unitCostPerItemPhp: number;     // totalItemCostPhp / quantity
}

export interface ProjectBoqState {
  ocmPercent: number;      // Default 10%
  profitPercent: number;   // Default 8%
  vatPercent: number;      // Default 6%
  items: DupaWorkItem[];   // Source-of-truth DUPA items (D1..D9+)
  lastSyncedAt?: string;
  includeLightningProtection?: boolean; // Whether D12 (External Lightning Protection & Perimeter Earthing Grid) is included (default false = optional)
}

export interface CustomSolarResource {
  sourceName?: string;
  monthlyGhiKwhPerM2Day?: number[]; // Array of 12 numbers (Jan to Dec)
  monthlyAmbientTempC?: number[];   // Array of 12 numbers (Jan to Dec)
  syncedAt?: string;
}

export type LoadProfileArchetype =
  | 'commercial_office'    // 8am-5pm peak, low nights & weekends
  | 'industrial_1shift'    // 7am-4pm weekdays
  | 'industrial_24_7'      // Flat continuous high demand
  | 'retail_commercial'    // 10am-9pm 7 days a week
  | 'school_institution'   // 7am-5pm weekdays, holiday dips
  | 'hospital_healthcare'  // High continuous base load with daytime clinical peaks
  | 'residential_standard' // Dual peak: 6-9am morning & 6-10pm evening
  | 'custom';

export interface HourlyLoadCurve {
  values: number[]; // length 24, index 0 = 00:00-01:00 to index 23 = 23:00-24:00
}

export interface MonthlyLoadRecord {
  month: number;           // 0 = Jan, 11 = Dec
  monthName: string;       // 'Jan' .. 'Dec'
  daysInMonth: number;     // 28 - 31
  consumptionKwh: number;  // Total monthly energy consumption (kWh)
  peakDemandKw?: number;   // Peak demand registered on meter (kW)
  energyCostPhp?: number;  // Optional electricity bill amount
}

export interface FacilityLoadProfile {
  id: string;
  name: string;
  systemId?: string;       // 'all' / undefined = whole project; or specific system ID
  archetype: LoadProfileArchetype;
  annualKwh: number;       // Sum of 12 months consumption (kWh)
  monthlyBreakdown: MonthlyLoadRecord[]; // Exact 12 elements (Jan to Dec)
  hasWeekendProfile: boolean;
  defaultDailyCurve: number[];  // 24 hourly weights (0..23)
  weekendDailyCurve?: number[]; // 24 hourly weights for weekend if enabled
  sourceType: 'preset' | 'manual' | 'csv_monthly' | 'csv_hourly' | 'csv_8760';
  sourceFileName?: string;
  averageTariffRatePhp?: number; // e.g. 10.50 ₱/kWh
  notes?: string;
  updatedAt: string;
}

export type SectionKind = 'farm' | 'interconnection';

export type BessChemistry = 'LFP' | 'NMC';

/** Battery energy storage installed at a farm. */
export interface BessConfig {
  capacityMwh: number;
  powerMw: number;
  chemistry: BessChemistry;
}

/** Utility interconnection package: primary line upgrade plus switching / metering. */
export interface InterconnectionConfig {
  lineLengthKm: number;   // Primary (13.2 kV) line to upgrade
  poleSpanM: number;      // Average span between poles
  voltageKv: number;
}

/** Top-level BOQ grouping: a farm (A, B, ...) or the interconnection package (I). */
export interface ProjectSection {
  id: string;
  bess?: BessConfig | null;                    // Farm sections only
  interconnection?: InterconnectionConfig | null; // Interconnection section only
  code: string;        // 'A', 'B', ... 'I' - prefix for BOQ item numbers
  name: string;
  kind: SectionKind;
  systemIds: string[]; // Solar systems that belong to this section
}

export type RoofType = 'corrugated_metal' | 'standing_seam' | 'sandwich_panel';
export type CorrosionClass = 'standard' | 'ammonia_humid';

/** A poultry house (tunnel-vent building) whose roof planes carry PV array zones. */
export interface Building {
  id: string;
  sectionId: string;
  name: string;
  footprint: LatLngPoint[];  // Building outline (4 corners)
  headingDeg: number;        // Bearing of the long axis / ridge line (0 = north)
  lengthM: number;
  widthM: number;
  eaveHeightM: number;
  ridgeHeightM: number;
  roofType: RoofType;
  purlinSpacingM: number;
  corrosionClass: CorrosionClass;
  zoneIds: string[];         // Roof-plane array zones (2 for a gable)
}

export interface ProjectData {
  version: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  center: LatLngPoint;
  zoom: number;
  modules: ModuleModel[];
  systems: SolarSystem[];
  zones: ArrayZone[];
  panels: SolarPanelObject[];
  selectedSystemId?: string;
  selectedZoneId?: string | null;
  homerunRaceway?: RacewayConfig | null; // Shared system/project homerun trunk
  stringTraverseDirection?: StringTraverseDirection; // Global / project-level default traversal preference
  boqData?: ProjectBoqState;
  customSolarResource?: CustomSolarResource | null;
  loadProfile?: FacilityLoadProfile | null;
  sections?: ProjectSection[];
  buildings?: Building[];
}

// Datasheet Default: ZNShine 600W Bifacial (https://energiasirius.com/wp-content/uploads/2025/01/Datasheet-ZN-SHine-600W-Bifacial.pdf)
export const ZNSHINE_600W_BIFACIAL: ModuleModel = {
  id: 'mod_znshine_600w',
  name: 'ZNShine 600W Bifacial (ZXM7-UPLDD144)',
  manufacturer: 'ZNShine Solar',
  nominalPowerW: 600,
  voc: 48.1,
  vmp: 40.2,
  isc: 15.85,
  imp: 14.93,
  widthMm: 1134,
  lengthMm: 2382,
  bifacial: true,
  tempCoeffVoc: -0.28,
  tempCoeffPmax: -0.35
};

export const RESIDENTIAL_420W: ModuleModel = {
  id: 'mod_residential_420w',
  name: 'Residential All-Black 420W',
  manufacturer: 'Generic Tier 1',
  nominalPowerW: 420,
  voc: 38.8,
  vmp: 32.4,
  isc: 13.6,
  imp: 12.96,
  widthMm: 1134,
  lengthMm: 1762,
  bifacial: false,
  tempCoeffVoc: -0.28,
  tempCoeffPmax: -0.35
};

export const UTILITY_550W: ModuleModel = {
  id: 'mod_utility_550w',
  name: 'Commercial Utility Bifacial 550W',
  manufacturer: 'Generic Tier 1',
  nominalPowerW: 550,
  voc: 49.9,
  vmp: 41.9,
  isc: 14.05,
  imp: 13.13,
  widthMm: 1134,
  lengthMm: 2278,
  bifacial: true,
  tempCoeffVoc: -0.28,
  tempCoeffPmax: -0.35
};

export const DEFAULT_MODULE_MODELS: ModuleModel[] = [
  ZNSHINE_600W_BIFACIAL,
  RESIDENTIAL_420W,
  UTILITY_550W
];

export const STANDARD_INVERTER_CAPACITIES_KW: number[] = [
  3, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 500
];

export const STANDARD_AC_VOLTAGES_3PHASE: number[] = [230, 380, 400, 415, 480, 208, 220, 690, 800];
export const STANDARD_AC_VOLTAGES_1PHASE: number[] = [230, 220, 240, 120, 110];

export const GENERIC_INVERTER_PRESETS: InverterConfig[] = [
  {
    id: 'inv_commercial_100k',
    modelName: '100 kW Commercial Inverter (9 MPPT, 1100V, 3Φ 400V)',
    ratedAcPowerKw: 100,
    inverterCount: 1,
    mpptCountPerInverter: 9,
    maxStringsPerMppt: 2,
    maxDcVoltage: 1100,
    minMpptVoltage: 200,
    maxMpptVoltage: 1000,
    maxDcCurrentPerMppt: 30,
    maxDcAcRatio: 1.35,
    phase: 'three_phase',
    acVoltage: 400,
    gridFrequencyHz: 50
  },
  {
    id: 'inv_commercial_50k',
    modelName: '50 kW Commercial Inverter (5 MPPT, 1100V, 3Φ 400V)',
    ratedAcPowerKw: 50,
    inverterCount: 1,
    mpptCountPerInverter: 5,
    maxStringsPerMppt: 2,
    maxDcVoltage: 1100,
    minMpptVoltage: 200,
    maxMpptVoltage: 1000,
    maxDcCurrentPerMppt: 30,
    maxDcAcRatio: 1.35,
    phase: 'three_phase',
    acVoltage: 400,
    gridFrequencyHz: 50
  },
  {
    id: 'inv_commercial_30k',
    modelName: '30 kW Commercial Three-Phase (3 MPPT, 1000V, 3Φ 400V)',
    ratedAcPowerKw: 30,
    inverterCount: 1,
    mpptCountPerInverter: 3,
    maxStringsPerMppt: 2,
    maxDcVoltage: 1000,
    minMpptVoltage: 200,
    maxMpptVoltage: 950,
    maxDcCurrentPerMppt: 26,
    maxDcAcRatio: 1.35,
    phase: 'three_phase',
    acVoltage: 400,
    gridFrequencyHz: 50
  },
  {
    id: 'inv_commercial_20k',
    modelName: '20 kW Commercial String (2 MPPT, 1000V, 3Φ 400V)',
    ratedAcPowerKw: 20,
    inverterCount: 1,
    mpptCountPerInverter: 2,
    maxStringsPerMppt: 2,
    maxDcVoltage: 1000,
    minMpptVoltage: 180,
    maxMpptVoltage: 900,
    maxDcCurrentPerMppt: 22,
    maxDcAcRatio: 1.30,
    phase: 'three_phase',
    acVoltage: 400,
    gridFrequencyHz: 50
  },
  {
    id: 'inv_commercial_15k',
    modelName: '15 kW Light Commercial (2 MPPT, 1000V, 3Φ 400V)',
    ratedAcPowerKw: 15,
    inverterCount: 1,
    mpptCountPerInverter: 2,
    maxStringsPerMppt: 2,
    maxDcVoltage: 1000,
    minMpptVoltage: 160,
    maxMpptVoltage: 850,
    maxDcCurrentPerMppt: 20,
    maxDcAcRatio: 1.30,
    phase: 'three_phase',
    acVoltage: 400,
    gridFrequencyHz: 50
  },
  {
    id: 'inv_residential_10k',
    modelName: '10 kW Residential Hybrid (2 MPPT, 600V, 1Φ 230V)',
    ratedAcPowerKw: 10,
    inverterCount: 1,
    mpptCountPerInverter: 2,
    maxStringsPerMppt: 2,
    maxDcVoltage: 600,
    minMpptVoltage: 120,
    maxMpptVoltage: 550,
    maxDcCurrentPerMppt: 16,
    maxDcAcRatio: 1.30,
    phase: 'single_phase',
    acVoltage: 230,
    gridFrequencyHz: 50
  },
  {
    id: 'inv_residential_6k',
    modelName: '6 kW Residential Hybrid (2 MPPT, 600V, 1Φ 230V)',
    ratedAcPowerKw: 6,
    inverterCount: 1,
    mpptCountPerInverter: 2,
    maxStringsPerMppt: 1,
    maxDcVoltage: 600,
    minMpptVoltage: 90,
    maxMpptVoltage: 550,
    maxDcCurrentPerMppt: 15,
    maxDcAcRatio: 1.30,
    phase: 'single_phase',
    acVoltage: 230,
    gridFrequencyHz: 50
  },
  {
    id: 'inv_residential_3k',
    modelName: '3 kW Residential String (1 MPPT, 500V, 1Φ 230V)',
    ratedAcPowerKw: 3,
    inverterCount: 1,
    mpptCountPerInverter: 1,
    maxStringsPerMppt: 1,
    maxDcVoltage: 500,
    minMpptVoltage: 70,
    maxMpptVoltage: 450,
    maxDcCurrentPerMppt: 13,
    maxDcAcRatio: 1.25,
    phase: 'single_phase',
    acVoltage: 230,
    gridFrequencyHz: 50
  },
  {
    id: 'inv_hybrid_125k',
    modelName: '125 kW Hybrid Inverter (Bi-directional, 800V AC, 3Φ)',
    ratedAcPowerKw: 125,
    inverterCount: 1,
    mpptCountPerInverter: 12,
    maxStringsPerMppt: 2,
    maxDcVoltage: 1500,
    minMpptVoltage: 500,
    maxMpptVoltage: 1500,
    maxDcCurrentPerMppt: 32,
    maxDcAcRatio: 1.5,
    phase: 'three_phase',
    acVoltage: 800,
    gridFrequencyHz: 60
  },
  {
    id: 'inv_utility_250k',
    modelName: '250 kW Utility Substation (12 MPPT, 1500V, 3Φ 800V)',
    ratedAcPowerKw: 250,
    inverterCount: 1,
    mpptCountPerInverter: 12,
    maxStringsPerMppt: 2,
    maxDcVoltage: 1500,
    minMpptVoltage: 500,
    maxMpptVoltage: 1500,
    maxDcCurrentPerMppt: 32,
    maxDcAcRatio: 1.40,
    phase: 'three_phase',
    acVoltage: 800,
    gridFrequencyHz: 50
  }
];

export const DEFAULT_ROOF_CONFIG: LayoutConfig = {
  mountType: 'roof',
  panelWidthMm: ZNSHINE_600W_BIFACIAL.widthMm,
  panelLengthMm: ZNSHINE_600W_BIFACIAL.lengthMm,
  orientation: 'portrait',
  azimuthDeg: 180,
  tiltDeg: 15,
  rowSpacingM: 0.05,
  colSpacingM: 0.02,
  setbackM: 0.5,
  alignmentOffsetX: 0,
  alignmentOffsetY: 0,
  railCount: 2,
  railOverhangM: 0.10,
  electrical: {
    modelName: ZNSHINE_600W_BIFACIAL.name,
    nominalPowerW: ZNSHINE_600W_BIFACIAL.nominalPowerW,
    voc: ZNSHINE_600W_BIFACIAL.voc,
    vmp: ZNSHINE_600W_BIFACIAL.vmp,
    isc: ZNSHINE_600W_BIFACIAL.isc,
    imp: ZNSHINE_600W_BIFACIAL.imp
  }
};

export const DEFAULT_GROUND_CONFIG: LayoutConfig = {
  mountType: 'ground',
  panelWidthMm: ZNSHINE_600W_BIFACIAL.widthMm,
  panelLengthMm: ZNSHINE_600W_BIFACIAL.lengthMm,
  orientation: 'portrait',
  azimuthDeg: 180,
  tiltDeg: 25,
  rowSpacingM: 5.0,
  colSpacingM: 0.02,
  setbackM: 2.0,
  alignmentOffsetX: 0,
  alignmentOffsetY: 0,
  modulesPerTableUp: 2,
  modulesPerTableWide: 14,
  tableSpacingM: 1.0,
  intraTableSpacingM: 0.02,
  electrical: {
    modelName: ZNSHINE_600W_BIFACIAL.name,
    nominalPowerW: ZNSHINE_600W_BIFACIAL.nominalPowerW,
    voc: ZNSHINE_600W_BIFACIAL.voc,
    vmp: ZNSHINE_600W_BIFACIAL.vmp,
    isc: ZNSHINE_600W_BIFACIAL.isc,
    imp: ZNSHINE_600W_BIFACIAL.imp
  }
};
