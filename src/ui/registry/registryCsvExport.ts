/**
 * CSV export of whichever registry tab is active.
 */
import {
  calculateGeodeticDistanceM,
  computePolygonAreaSqM,
  computePolygonCentroid
} from '../../geo/projection';
import { exportBoqAndDupaCsv } from '../../geo/boqCalculator';
import type { RegistryModalUI } from '../registryModal';
import { downloadCsv, rowsToCsv, safeFileName } from '../../utils/download';

/**
 * Exports the currently active table view as a clean, standardized CSV file.
 */
export function exportActiveTabCsv(this: RegistryModalUI): void {
  let filename = '';
  let rows: string[][] = [];
  const isFiltered = this.filterSystemId !== 'all';
  const activeSys = isFiltered ? this.store.getSystem(this.filterSystemId) : undefined;
  const sysSlug = activeSys ? `_${safeFileName(activeSys.name)}` : '_all_systems';

  switch (this.activeTab) {
    case 'equipment': {
      filename = `battery_and_interconnection_${Date.now()}.csv`;
      rows = [['Section_Code', 'Section_Name', 'Kind', 'BESS_MWh', 'BESS_MW', 'Chemistry', 'Line_km', 'Pole_Span_m', 'Voltage_kV']];
      for (const sec of this.store.sections.values()) {
        rows.push([
          sec.code, sec.name, sec.kind,
          String(sec.bess?.capacityMwh ?? ''), String(sec.bess?.powerMw ?? ''), sec.bess?.chemistry ?? '',
          String(sec.interconnection?.lineLengthKm ?? ''), String(sec.interconnection?.poleSpanM ?? ''),
          String(sec.interconnection?.voltageKv ?? '')
        ]);
      }
      break;
    }

    case 'buildings': {
      filename = `poultry_houses_schedule_${Date.now()}.csv`;
      rows = [
        ['Farm_Code', 'Farm_Name', 'House_ID', 'House_Name', 'Length_M', 'Width_M', 'Heading_Deg', 'Eave_Height_M', 'Ridge_Height_M', 'Roof_Type', 'Purlin_Spacing_M', 'Corrosion_Class', 'Roof_Planes', 'Active_Panels', 'Capacity_kWp']
      ];
      for (const b of this.store.buildings.values()) {
        const sec = this.store.sections.get(b.sectionId);
        let panels = 0;
        let kwp = 0;
        for (const zoneId of b.zoneIds) {
          const z = this.store.getZone(zoneId);
          if (z) {
            panels += z.activePanelCount;
            kwp += z.totalKwp;
          }
        }
        rows.push([
          sec?.code || '', sec?.name || '', b.id, b.name,
          b.lengthM.toFixed(2), b.widthM.toFixed(2), b.headingDeg.toFixed(1),
          b.eaveHeightM.toFixed(2), b.ridgeHeightM.toFixed(2), b.roofType,
          String(b.purlinSpacingM), b.corrosionClass, String(b.zoneIds.length),
          String(panels), kwp.toFixed(2)
        ]);
      }
      break;
    }

    case 'arrays': {
      filename = `solar_arrays_schedule${sysSlug}_${Date.now()}.csv`;
      rows = [
        [
          'Array_ID',
          'Array_Name',
          'System_ID',
          'System_Name',
          'Mount_Type',
          'Table_Count',
          'Modules_Per_Table_Up',
          'Modules_Per_Table_Wide',
          'Table_Spacing_M',
          'Module_Model',
          'Module_Watts',
          'Active_Panels',
          'Total_Panels',
          'Capacity_kWp',
          'Orientation',
          'Tilt_Deg',
          'Azimuth_Deg',
          'Row_Pitch_M',
          'Col_Spacing_M',
          'Setback_M',
          'Area_SqM',
          'Has_Raceway',
          'Raceway_Path_Length_M',
          'Elevation_Delta_M'
        ]
      ];

      let zones = this.store.getZones();
      if (isFiltered) {
        zones = zones.filter(z => z.systemId === this.filterSystemId);
      }

      for (const z of zones) {
        const sys = this.store.getSystem(z.systemId);
        const mod = this.store.getModule(z.moduleId);
        const area = computePolygonAreaSqM(z.vertices);
        const totalPanels = this.store.getPanels().filter(p => p.zoneId === z.id).length;

        let pathLen2D = 0;
        if (z.raceway && z.raceway.path && z.raceway.path.length >= 2) {
          for (let i = 0; i < z.raceway.path.length - 1; i++) {
            pathLen2D += calculateGeodeticDistanceM(z.raceway.path[i], z.raceway.path[i + 1]);
          }
        }
        const elevM = z.raceway ? z.raceway.elevationChangeM : (z.elevationDeltaM ?? 0);

        rows.push([
          z.id,
          z.name,
          z.systemId,
          sys?.name || '',
          z.config.mountType,
          String(z.tableCount ?? (z.config.mountType === 'ground' ? 0 : '')),
          String(z.config.modulesPerTableUp ?? ''),
          String(z.config.modulesPerTableWide ?? ''),
          String(z.config.tableSpacingM ?? ''),
          mod?.name || z.config.electrical.modelName,
          String(mod?.nominalPowerW || z.config.electrical.nominalPowerW),
          String(z.activePanelCount),
          String(totalPanels),
          z.totalKwp.toFixed(2),
          z.config.orientation,
          String(z.config.tiltDeg),
          String(z.config.azimuthDeg),
          String(z.config.rowSpacingM),
          String(z.config.colSpacingM),
          String(z.config.setbackM),
          area.toFixed(1),
          z.raceway ? 'TRUE' : 'FALSE',
          pathLen2D.toFixed(1),
          String(elevM)
        ]);
      }
      break;
    }

    case 'systems': {
      filename = `solar_systems_summary${sysSlug}_${Date.now()}.csv`;
      rows = [
        [
          'System_ID',
          'System_Name',
          'Linked_Arrays_Count',
          'Active_Panels',
          'Total_DC_Power_kWp',
          'Inverter_Model',
          'Inverter_Count',
          'Inverter_AC_kW',
          'DC_AC_Ratio',
          'Inverter_Lat',
          'Inverter_Lng',
          'Inverter_Elevation_M',
          'AC_PCC_Lat',
          'AC_PCC_Lng',
          'AC_PCC_Elevation_M',
          'AC_Feeder_Run_M',
          'AC_Voltage_Drop_Percent',
          'AC_Feeder_Conductor',
          'PEC_2_15_Compliant',
          'Total_DC_Cable_M',
          'Total_Homerun_Cable_M',
          'Total_Raceway_Cable_M'
        ]
      ];

      let systems = this.store.getSystems();
      if (isFiltered) {
        systems = systems.filter(s => s.id === this.filterSystemId);
      }

      for (const s of systems) {
        const sum = this.store.getSystemSummary(s.id);
        const cable = this.store.getSystemCableSummary(s.id);
        const feeder = this.store.getSystemAcFeederSummary(s.id);
        const zCount = this.store.getZones().filter(z => z.systemId === s.id).length;

        rows.push([
          s.id,
          s.name,
          String(zCount),
          String(sum.totalActivePanels),
          sum.totalKwp.toFixed(2),
          s.inverter.modelName,
          String(s.inverter.inverterCount),
          String(sum.inverterAcKw),
          sum.dcAcRatio.toFixed(2),
          s.inverterLocation ? String(s.inverterLocation.lat) : '',
          s.inverterLocation ? String(s.inverterLocation.lng) : '',
          String(s.inverterElevationM ?? 0),
          s.acInterconnectionLocation ? String(s.acInterconnectionLocation.lat) : '',
          s.acInterconnectionLocation ? String(s.acInterconnectionLocation.lng) : '',
          String(s.acInterconnectionElevationM ?? 0),
          String(feeder.totalRunM),
          String(feeder.voltageDropPercent),
          feeder.conductorCallout,
          feeder.isCompliant ? 'TRUE' : 'FALSE',
          String(cable.totalCableLengthM),
          String(cable.totalHomerunM),
          String(cable.totalRacewayLengthM)
        ]);
      }
      break;
    }

    case 'raceways': {
      filename = `solar_raceways_schedule${sysSlug}_${Date.now()}.csv`;
      rows = [
        [
          'Array_ID',
          'Array_Name',
          'System_ID',
          'System_Name',
          'Has_Raceway',
          'Waypoints_Count',
          'Path_2D_Length_M',
          'Elevation_Drop_M',
          'Exit_To_Inverter_M',
          'Conduit_Run_Per_Conductor_M',
          'Active_Strings_Count',
          'Total_Wire_In_Raceway_M'
        ]
      ];

      let zones = this.store.getZones();
      if (isFiltered) {
        zones = zones.filter(z => z.systemId === this.filterSystemId);
      }

      for (const z of zones) {
        const sys = this.store.getSystem(z.systemId);
        const hasRaceway = Boolean(z.raceway && z.raceway.path && z.raceway.path.length >= 2);

        let pathLen2D = 0;
        if (hasRaceway && z.raceway) {
          for (let i = 0; i < z.raceway.path.length - 1; i++) {
            pathLen2D += calculateGeodeticDistanceM(z.raceway.path[i], z.raceway.path[i + 1]);
          }
        }
        const elevM = Math.abs(z.raceway ? z.raceway.elevationChangeM : (z.elevationDeltaM ?? 0));

        let distToInv = 0;
        if (hasRaceway && z.raceway && sys?.inverterLocation) {
          const exitPt = z.raceway.path[z.raceway.path.length - 1];
          distToInv = calculateGeodeticDistanceM(exitPt, sys.inverterLocation);
        }
        const singleRunM = pathLen2D + elevM + distToInv;

        const zonePanels = this.store.getPanels().filter(p => p.zoneId === z.id && p.active && p.stringId);
        const stringCount = new Set(zonePanels.map(p => p.stringId)).size;
        const totalWireM = stringCount * 2 * singleRunM;

        rows.push([
          z.id,
          z.name,
          z.systemId,
          sys?.name || '',
          hasRaceway ? 'TRUE' : 'FALSE',
          String(z.raceway?.path.length ?? 0),
          pathLen2D.toFixed(1),
          elevM.toFixed(1),
          distToInv.toFixed(1),
          singleRunM.toFixed(1),
          String(stringCount),
          totalWireM.toFixed(1)
        ]);
      }
      break;
    }

    case 'keepouts': {
      filename = `solar_keepouts_schedule${sysSlug}_${Date.now()}.csv`;
      rows = [
        [
          'KeepOut_ID',
          'KeepOut_Name',
          'Zone_ID',
          'Zone_Name',
          'System_ID',
          'System_Name',
          'Mount_Type',
          'Vertex_Count',
          'Area_SqM',
          'Centroid_Lat',
          'Centroid_Lng'
        ]
      ];

      let keepOuts = this.store.getAllKeepOuts();
      if (isFiltered) {
        keepOuts = keepOuts.filter(k => k.systemId === this.filterSystemId);
      }
      if (this.filterZoneId !== 'all') {
        keepOuts = keepOuts.filter(k => k.zoneId === this.filterZoneId);
      }

      for (const item of keepOuts) {
        const ko = item.keepOut;
        const zone = this.store.getZone(item.zoneId);
        const sys = this.store.getSystem(item.systemId);
        const area = computePolygonAreaSqM(ko.vertices);
        const centroid = computePolygonCentroid(ko.vertices);

        rows.push([
          ko.id,
          ko.name,
          item.zoneId,
          item.zoneName,
          item.systemId,
          sys?.name || '',
          zone?.config.mountType || 'roof',
          String(ko.vertices.length),
          area.toFixed(2),
          centroid.lat.toFixed(6),
          centroid.lng.toFixed(6)
        ]);
      }
      break;
    }

    case 'strings': {
      filename = `solar_strings_schedule${sysSlug}_${Date.now()}.csv`;
      rows = [
        [
          'String_ID',
          'System_ID',
          'System_Name',
          'Zone_ID',
          'Zone_Name',
          'Mount_Type',
          'Panel_Count',
          'Total_Capacity_kWp',
          'Voc_STC_V',
          'Vmp_STC_V',
          'Inverter_Number',
          'MPPT_Channel',
          'Intra_String_Cable_M',
          'Homerun_Positive_M',
          'Homerun_Negative_M',
          'Elevation_Delta_M',
          'Total_Homerun_M',
          'Total_String_Cable_M',
          'Start_Panel_ID',
          'End_Panel_ID'
        ]
      ];

      let strings = this.store.getStringCables('all');
      if (isFiltered) {
        strings = strings.filter(s => s.systemId === this.filterSystemId);
      }
      if (this.filterZoneId !== 'all') {
        strings = strings.filter(s => s.zoneId === this.filterZoneId);
      }

      for (const sc of strings) {
        const zone = this.store.getZone(sc.zoneId);
        const sys = this.store.getSystem(sc.systemId);
        const mod = zone ? this.store.getModule(zone.moduleId) : undefined;
        const kwp = (sc.panelCount * (mod?.nominalPowerW || zone?.config.electrical.nominalPowerW || 600)) / 1000;
        const voc = sc.panelCount * (mod?.voc || zone?.config.electrical.voc || 48.1);
        const vmp = sc.panelCount * (mod?.vmp || zone?.config.electrical.vmp || 40.2);
        const p1 = this.store.getPanel(sc.startPanelId);

        rows.push([
          sc.stringId,
          sc.systemId,
          sys?.name || '',
          sc.zoneId,
          zone?.name || '',
          zone?.config.mountType || '',
          String(sc.panelCount),
          kwp.toFixed(2),
          voc.toFixed(1),
          vmp.toFixed(1),
          p1?.inverterIndex ? String(p1.inverterIndex) : '1',
          p1?.mpptId || '',
          String(sc.intraStringLengthM),
          String(sc.homerunPositiveM),
          String(sc.homerunNegativeM),
          String(sc.elevationDeltaM),
          String(sc.totalHomerunM),
          String(sc.totalStringCableM),
          sc.startPanelId,
          sc.endPanelId
        ]);
      }
      break;
    }

    case 'panels': {
      filename = `solar_panels_registry${sysSlug}_${Date.now()}.csv`;
      let panels = this.store.getPanels();
      if (isFiltered) {
        panels = panels.filter(p => p.systemId === this.filterSystemId);
      }
      if (this.filterZoneId !== 'all') {
        panels = panels.filter(p => p.zoneId === this.filterZoneId);
      }
      if (this.filterStatus === 'active') {
        panels = panels.filter(p => p.active);
      } else if (this.filterStatus === 'disabled') {
        panels = panels.filter(p => !p.active);
      }
      const allStringCables = new Map(this.store.getStringCables('all').map(sc => [sc.stringId, sc]));
      rows = [
        [
          'Panel_ID',
          'System_ID',
          'System_Name',
          'Zone_ID',
          'Zone_Name',
          'Module_Model',
          'Row_Index',
          'Col_Index',
          'Active',
          'Azimuth_Deg',
          'Tilt_Deg',
          'Nominal_Watts',
          'Voc_V',
          'Vmp_V',
          'Isc_A',
          'Imp_A',
          'Inverter_Index',
          'MPPT_ID',
          'String_ID',
          'String_Order',
          'Array_Elevation_Delta_M',
          'String_Total_Cable_M',
          'String_Homerun_Cable_M',
          'Centroid_Lat',
          'Centroid_Lng'
        ]
      ];

      for (const p of panels) {
        const s = this.store.getSystem(p.systemId);
        const z = this.store.getZone(p.zoneId);
        const m = this.store.getModule(p.moduleId);
        const sc = p.stringId ? allStringCables.get(p.stringId) : undefined;
        rows.push([
          p.id,
          p.systemId,
          s?.name || '',
          p.zoneId,
          z?.name || '',
          m?.name || p.electrical.modelName,
          String(p.rowIndex),
          String(p.colIndex),
          p.active ? 'TRUE' : 'FALSE',
          String(p.azimuthDeg),
          String(p.tiltDeg),
          String(p.electrical.nominalPowerW),
          String(p.electrical.voc),
          String(p.electrical.vmp),
          String(p.electrical.isc),
          String(p.electrical.imp),
          p.inverterIndex !== null && typeof p.inverterIndex === 'number' ? String(p.inverterIndex + 1) : '',
          p.mpptId || '',
          p.stringId || '',
          p.stringOrder ? String(p.stringOrder) : '',
          String(z?.elevationDeltaM ?? 0),
          sc ? String(sc.totalStringCableM) : '',
          sc ? String(sc.totalHomerunM) : '',
          p.centroid.lat.toFixed(6),
          p.centroid.lng.toFixed(6)
        ]);
      }
      break;
    }

    case 'sld': {
      const sys = (isFiltered ? activeSys : undefined) || this.store.getSelectedSystem() || this.store.getSystems()[0];
      filename = `sld_system_${safeFileName(sys?.name, 'System')}_${Date.now()}.csv`;
      const sum = this.store.getSystemSummary(sys?.id);
      rows = [
        ['System_ID', 'System_Name', 'Total_DC_kWp', 'Inverter_AC_kW', 'DC_AC_Ratio', 'Strings_Count', 'Inverter_Model'],
        [
          sys?.id || '',
          sys?.name || '',
          String(sum.totalKwp),
          String(sum.inverterAcKw),
          String(sum.dcAcRatio),
          String(this.store.getStringCables(sys?.id).length),
          sys?.inverter.modelName || ''
        ]
      ];
      break;
    }

    case 'boq': {
      const boq = this.store.getBoqState(this.filterSystemId);
      const csvContent = exportBoqAndDupaCsv(this.store.projectName, boq, this.store.sections);
      downloadCsv(csvContent, `${safeFileName(this.store.projectName)}_BOQ_and_DUPA_${Date.now()}.csv`);
      return;
    }
  }

  downloadCsv(rowsToCsv(rows), filename);
}
