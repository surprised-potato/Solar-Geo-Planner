/**
 * Floating selection and drawing HUD overlays for MapController.
 */
import type { MapController } from './mapController';

export function updateSelectionHud(this: MapController): void {
  const hud = document.getElementById('map-selection-hud');
  if (!hud) return;

  if (this.store.drawingMode !== 'none') {
    hud.hidden = true;
    return;
  }

  const badge = document.getElementById('hud-sel-badge');
  const title = document.getElementById('hud-sel-title');
  const sub = document.getElementById('hud-sel-sub');

  // 0a. Specific mount table selected in a ground mount zone
  if (this.selectedTableId && this.store.selectedZoneId) {
    const zone = this.store.getZone(this.store.selectedZoneId);
    const table = zone?.tables?.find(t => t.id === this.selectedTableId);
    if (zone && table) {
      hud.hidden = false;
      if (badge) badge.textContent = '🏗️';
      if (title) title.textContent = `Table #${table.tableIndex} (${zone.name})`;
      const activeModCount = table.panelIds.filter(pid => this.store.getPanel(pid)?.active ?? true).length;
      const modWp = zone.config.electrical?.nominalPowerW || 580;
      const kwp = ((activeModCount * modWp) / 1000).toFixed(2);
      if (sub) {
        sub.textContent = `Rack ${table.modulesUp}P × ${table.modulesWide} • ${activeModCount} Panels • ${kwp} kWp • Row ${table.rowIndex + 1}, Col ${table.colIndex + 1}`;
      }
      return;
    }
  }

  // 0. Solar Panel selected
  if (this.store.selectedPanelId) {
    const panel = this.store.getSelectedPanel();
    if (panel) {
      hud.hidden = false;
      if (badge) badge.textContent = '☀️';
      if (title) title.textContent = `Panel ${panel.id}`;
      const zone = this.store.getZone(panel.zoneId);
      if (sub) {
        sub.textContent = `Row ${panel.rowIndex}, Col ${panel.colIndex} • ${panel.electrical.nominalPowerW}W • ${zone?.name || 'Array'}${panel.stringId ? ` • String ${panel.stringId}` : ''}`;
      }
      return;
    }
  }

  // 1. Keep-out selected
  if (this.store.selectedKeepOutId) {
    for (const zone of this.store.getZones()) {
      const ko = zone.keepOuts.find(k => k.id === this.store.selectedKeepOutId);
      if (ko) {
        hud.hidden = false;
        if (badge) badge.textContent = '🚫';
        if (title) title.textContent = ko.name || 'Obstacle Keep-Out';
        if (sub) sub.textContent = `Inside ${zone.name} • ${ko.vertices.length} vertices`;
        return;
      }
    }
  }

  // 2. Homerun selected
  if (this.selectedHomerunSystemId) {
    const sys = this.store.getSystem(this.selectedHomerunSystemId);
    if (sys && sys.homerunRaceway) {
      hud.hidden = false;
      if (badge) badge.textContent = '🛤️';
      if (title) title.textContent = `Homerun Trunk (${sys.name})`;
      const pathLen = sys.homerunRaceway.path.length;
      if (sub) sub.textContent = `Shared Raceway • ${pathLen} nodes • Drop: ${sys.homerunRaceway.elevationChangeM}m`;
      return;
    }
  }

  // 3. Zone Raceway selected
  if (this.selectedRacewayZoneId) {
    const zone = this.store.getZone(this.selectedRacewayZoneId);
    if (zone && zone.raceway) {
      hud.hidden = false;
      if (badge) badge.textContent = '🛤️';
      if (title) title.textContent = zone.raceway.name || `Raceway (${zone.name})`;
      if (sub) sub.textContent = `Branch Raceway • ${zone.raceway.path.length} nodes • Drop: ${zone.raceway.elevationChangeM}m`;
      return;
    }
  }

  // 4. Inverter Station selected
  if (this.selectedInverterSystemId) {
    const sys = this.store.getSystem(this.selectedInverterSystemId);
    if (sys && sys.inverterLocation) {
      hud.hidden = false;
      if (badge) badge.textContent = '⚡';
      if (title) title.textContent = `Inverter Station (${sys.name})`;
      if (sub) sub.textContent = `${sys.inverter.modelName} • Elev: ${sys.inverterElevationM ?? 0}m`;
      return;
    }
  }

  // 5. AC PCC Selected
  if (this.selectedAcInterconnectionSystemId) {
    const sys = this.store.getSystem(this.selectedAcInterconnectionSystemId);
    if (sys && sys.acInterconnectionLocation) {
      hud.hidden = false;
      if (badge) badge.textContent = '🏢';
      if (title) title.textContent = `AC Point of Common Coupling (${sys.name})`;
      const feeder = this.store.getSystemAcFeederSummary(sys.id);
      if (sub) sub.textContent = `PCC Grid Interconnection • Elev: ${sys.acInterconnectionElevationM ?? 0}m • Run: ${feeder.totalRunM}m (${feeder.voltageDropPercent}% drop)`;
      return;
    }
  }

  // 6. AC Raceway Selected
  if (this.selectedAcRacewaySystemId) {
    const sys = this.store.getSystem(this.selectedAcRacewaySystemId);
    if (sys && sys.acRaceway) {
      hud.hidden = false;
      if (badge) badge.textContent = '⚡';
      if (title) title.textContent = `AC Feeder Conduit (${sys.name})`;
      const feeder = this.store.getSystemAcFeederSummary(sys.id);
      if (sub) sub.textContent = `AC Feeder • ${sys.acRaceway.path.length} nodes • Run: ${feeder.totalRunM}m • Vdrop: ${feeder.voltageDropPercent}%`;
      return;
    }
  }

  // 5. Multi-selected zones
  if (this.store.selectedZoneIds.size > 1) {
    hud.hidden = false;
    const count = this.store.selectedZoneIds.size;
    const zones = this.store.getSelectedZones();
    const totalPanels = zones.reduce((s, z) => s + z.activePanelCount, 0);
    const totalTables = zones.reduce((s, z) => s + (z.tables ? z.tables.length : 0), 0);
    const totalKwp = (zones.reduce((s, z) => s + (z.totalKwp || 0), 0)).toFixed(1);
    if (badge) badge.textContent = '✨';
    if (title) title.textContent = `${count} Arrays Selected`;
    const tableInfo = totalTables > 0 ? ` (${totalTables} Tables)` : '';
    if (sub) sub.textContent = `${totalPanels} Panels${tableInfo} • ${totalKwp} kWp Total`;
    return;
  }

  // 6. Single zone selected
  if (this.store.selectedZoneId) {
    const zone = this.store.getZone(this.store.selectedZoneId);
    if (zone) {
      hud.hidden = false;
      if (badge) badge.textContent = zone.config.mountType === 'ground' ? '🌱' : '🏠';
      if (title) title.textContent = zone.name;
      const tableInfo = zone.config.mountType === 'ground' && zone.tables && zone.tables.length > 0
        ? `${zone.tables.length} Tables • `
        : '';
      if (sub) sub.textContent = `${zone.config.mountType.toUpperCase()} • ${tableInfo}${zone.activePanelCount} Panels • ${zone.totalKwp.toFixed(1)} kWp`;
      return;
    }
  }

  // None selected
  hud.hidden = true;
}

export function updateDrawingHud(this: MapController): void {
  const hud = document.getElementById('map-drawing-hud');
  if (!hud) return;

  const mode = this.store.drawingMode;
  if (mode === 'none') {
    hud.hidden = true;
    return;
  }

  hud.hidden = false;
  const title = document.getElementById('hud-drawing-title');
  const hint = document.getElementById('hud-drawing-hint');
  const btnFinish = document.getElementById('btn-hud-finish-draw') as HTMLButtonElement | null;

  const count = this.drawingPoints.length;
  const minPoints = (mode === 'raceway' || mode === 'ac_raceway') ? 2 : 3;

  if (btnFinish) {
    btnFinish.disabled = count < minPoints;
    btnFinish.style.display = (mode === 'inverter' || mode === 'ac_interconnection') ? 'none' : '';
  }

  if (mode === 'zone') {
    const isRoof = this.store.drawingMountType === 'roof';
    if (title) title.textContent = isRoof ? '🏠 Drawing Roof Array' : '🌱 Drawing Ground Array';
    if (hint) {
      hint.textContent = count === 0
        ? 'Click map to place array perimeter corners'
        : `${count} vertices placed. Double-click or click start point to close.`;
    }
  } else if (mode === 'keepout') {
    if (title) title.textContent = '🚫 Drawing Keep-Out Obstacle';
    if (hint) {
      hint.textContent = count === 0
        ? 'Click map to outline obstacle (HVAC, skylight, vents)'
        : `${count} vertices placed. Double-click or click start point to close.`;
    }
  } else if (mode === 'raceway') {
    if (title) title.textContent = '🛤️ Drawing Homerun Cable Trunk';
    if (hint) {
      hint.textContent = count === 0
        ? 'Click map to place conduit start & route'
        : `${count} points placed. Double-click or click Finish when done.`;
    }
  } else if (mode === 'ac_raceway') {
    if (title) title.textContent = '⚡ Drawing AC Feeder Raceway';
    if (hint) {
      hint.textContent = count === 0
        ? 'Click map along conduit path from Inverter Station to PCC'
        : `${count} points placed. Double-click or click Finish when done.`;
    }
  } else if (mode === 'inverter') {
    if (title) title.textContent = '⚡ Placing Inverter Power House';
    if (hint) hint.textContent = 'Click anywhere on map to set power station position.';
  } else if (mode === 'ac_interconnection') {
    if (title) title.textContent = '🏢 Placing AC Point of Common Coupling (PCC)';
    if (hint) hint.textContent = 'Click on satellite map to place the utility grid / transformer interconnection point.';
  } else if (mode === 'match_props') {
    const srcZone = this.store.matchPropsSourceZoneId ? this.store.getZone(this.store.matchPropsSourceZoneId) : null;
    if (title) title.textContent = '🎨 Match Array Properties (MATCHPROP)';
    if (hint) {
      hint.textContent = srcZone
        ? `Click any target array on map to copy properties from "${srcZone.name}". Click 'Finish' or Esc to exit.`
        : 'Click a source array on map to pick its properties.';
    }
    if (btnFinish) {
      btnFinish.disabled = false;
      btnFinish.style.display = '';
      btnFinish.textContent = '✓ Done Matching';
    }
  }
}
