/**
 * Inverter station and AC interconnection (PCC) marker layers.
 */
import L from 'leaflet';
import type { MapController } from '../mapController';
import { escapeHtml } from '../../utils/html';

export function renderInverterStations(this: MapController): void {
  this.inverterStationGroup.clearLayers();
  if (this.store.viewFilter.showInverters === false || this.store.viewFilter.xRayMode) return;

  const systems = this.store.getSystems();
  const selectedSysId = this.store.selectedSystemId;

  for (const sys of systems) {
    if (!sys.inverterLocation) continue;

    const isSelected = sys.id === selectedSysId;
    const inv = sys.inverter;
    const color = sys.color || '#f59e0b';
    const cableSummary = this.store.getSystemCableSummary(sys.id);

    const icon = L.divIcon({
      className: 'inverter-station-div-icon',
      html: `
        <div class="inverter-station-marker ${isSelected ? 'selected' : ''}" style="--inv-color: ${color};">
          <div class="inv-pulse"></div>
          <div class="inv-badge">
            <span class="inv-icon">⚡</span>
            <span class="inv-title">${escapeHtml(sys.name.split(':')[0])}</span>
          </div>
          <div class="inv-pole"></div>
        </div>
      `,
      iconSize: [110, 48],
      iconAnchor: [55, 46]
    });

    const marker = L.marker([sys.inverterLocation.lat, sys.inverterLocation.lng], {
      icon,
      draggable: true,
      zIndexOffset: 1000
    });

    marker.on('dragend', (e: L.LeafletEvent) => {
      const latlng = (e.target as L.Marker).getLatLng();
      this.store.setSystemInverterLocation(sys.id, { lat: latlng.lat, lng: latlng.lng });
    });

    marker.on('click', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      this.selectedInverterSystemId = sys.id;
      this.selectedHomerunSystemId = null;
      this.selectedRacewayZoneId = null;
      this.store.selectKeepOut(null);
      this.store.selectSystem(sys.id);
      this.updateSelectionHud();
    });

    marker.on('popupopen', () => {
      const btnDel = document.querySelector(`.btn-del-inverter-loc[data-sys-id="${sys.id}"]`);
      btnDel?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.store.clearSystemInverterLocation(sys.id);
        this.selectedInverterSystemId = null;
        this.map.closePopup();
        this.updateSelectionHud();
      });
    });

    const popupContent = `
      <div class="inverter-popup">
        <h4>⚡ Inverter Power House</h4>
        <div class="inv-pop-row"><span>System:</span> <strong>${escapeHtml(sys.name)}</strong></div>
        <div class="inv-pop-row"><span>Model:</span> <strong>${escapeHtml(inv.modelName)}</strong></div>
        <div class="inv-pop-row"><span>Capacity:</span> <strong>${inv.inverterCount}x (${inv.inverterCount * inv.ratedAcPowerKw} kW AC)</strong></div>
        <div class="inv-pop-row"><span>Coords:</span> <small>${sys.inverterLocation.lat.toFixed(6)}, ${sys.inverterLocation.lng.toFixed(6)}</small></div>
        <div class="inv-pop-row"><span>Base Elevation:</span> <strong>${sys.inverterElevationM ?? 0} m</strong></div>
        <div class="inv-pop-divider"></div>
        <div class="inv-pop-row"><span>Connected Strings:</span> <strong>${cableSummary.totalStrings}</strong></div>
        <div class="inv-pop-row"><span>Total DC Cable:</span> <strong style="color: var(--accent-green);">${cableSummary.totalCableLengthM} m</strong></div>
        <div class="inv-pop-row"><span>Homerun Cabling:</span> <strong>${cableSummary.totalHomerunM} m</strong></div>
        <div class="inv-pop-row"><span>Riser Drop:</span> <strong>${cableSummary.totalElevationRiserM} m</strong></div>
        <div class="inv-pop-actions" style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-subtle, #334155); display: flex; justify-content: flex-end;">
          <button type="button" class="btn btn-xs btn-outline danger btn-del-inverter-loc" data-sys-id="${sys.id}" title="Remove power house location from map">🗑️ Remove Location</button>
        </div>
        <small class="inv-pop-hint">💡 Tip: Drag marker to reposition power house and recalculate lengths</small>
      </div>
    `;
    marker.bindPopup(popupContent, { className: 'solar-dark-popup' });

    marker.bindTooltip(`<strong>⚡ ${escapeHtml(sys.name)} Power House</strong><br/>${cableSummary.totalCableLengthM}m DC Cable &bull; Click to select/delete &bull; Drag to relocate`, {
      direction: 'top',
      offset: [0, -42],
      className: 'solar-tooltip'
    });

    this.inverterStationGroup.addLayer(marker);
  }
}

export function renderAcInterconnections(this: MapController): void {
  this.acInterconnectionGroup.clearLayers();
  if (this.store.viewFilter.showInverters === false || this.store.viewFilter.xRayMode) return;

  const systems = this.store.getSystems();
  const selectedSysId = this.store.selectedSystemId;

  for (const sys of systems) {
    if (!sys.acInterconnectionLocation) continue;

    const isSelected = sys.id === selectedSysId;
    const feederSummary = this.store.getSystemAcFeederSummary(sys.id);

    const icon = L.divIcon({
      className: 'pcc-station-div-icon',
      html: `
        <div class="pcc-station-marker ${isSelected ? 'selected' : ''}">
          <div class="pcc-pulse"></div>
          <div class="pcc-badge">
            <span class="pcc-icon">🏢</span>
            <span class="pcc-title">${escapeHtml(sys.name.split(':')[0])} PCC</span>
          </div>
          <div class="pcc-pole"></div>
        </div>
      `,
      iconSize: [120, 48],
      iconAnchor: [60, 46]
    });

    const marker = L.marker([sys.acInterconnectionLocation.lat, sys.acInterconnectionLocation.lng], {
      icon,
      draggable: true,
      zIndexOffset: 1100
    });

    marker.on('dragend', (e: L.LeafletEvent) => {
      const latlng = (e.target as L.Marker).getLatLng();
      this.store.setSystemAcInterconnectionLocation(sys.id, { lat: latlng.lat, lng: latlng.lng });
    });

    marker.on('click', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      this.selectedAcInterconnectionSystemId = sys.id;
      this.selectedAcRacewaySystemId = null;
      this.selectedInverterSystemId = null;
      this.selectedHomerunSystemId = null;
      this.selectedRacewayZoneId = null;
      this.store.selectKeepOut(null);
      this.store.selectSystem(sys.id);
      this.updateSelectionHud();
    });

    marker.on('popupopen', () => {
      const btnDel = document.querySelector(`.btn-del-pcc-loc[data-sys-id="${sys.id}"]`);
      btnDel?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.store.clearSystemAcInterconnectionLocation(sys.id);
        this.selectedAcInterconnectionSystemId = null;
        this.map.closePopup();
        this.updateSelectionHud();
      });
    });

    const popupContent = `
      <div class="inverter-popup">
        <h4 style="color: #06b6d4;">🏢 AC Point of Common Coupling (PCC)</h4>
        <div class="inv-pop-row"><span>System:</span> <strong>${escapeHtml(sys.name)}</strong></div>
        <div class="inv-pop-row"><span>Grid Voltage:</span> <strong>${feederSummary.voltageV}V (${feederSummary.phase === 'single_phase' ? '1Φ' : '3Φ'})</strong></div>
        <div class="inv-pop-row"><span>Coords:</span> <small>${sys.acInterconnectionLocation.lat.toFixed(6)}, ${sys.acInterconnectionLocation.lng.toFixed(6)}</small></div>
        <div class="inv-pop-row"><span>Base Elevation:</span> <strong>${sys.acInterconnectionElevationM ?? 0} m</strong></div>
        <div class="inv-pop-divider"></div>
        <div class="inv-pop-row"><span>Feeder Conductor:</span> <strong style="color: #38bdf8;">${escapeHtml(feederSummary.conductorCallout)}</strong></div>
        <div class="inv-pop-row"><span>Feeder Conduit:</span> <strong>${escapeHtml(feederSummary.conduitCallout)}</strong></div>
        <div class="inv-pop-row"><span>Total Feeder Run:</span> <strong style="color: var(--accent-green);">${feederSummary.totalRunM} m</strong></div>
        <div class="inv-pop-row"><span>Calculated V-Drop:</span> <strong style="color: ${feederSummary.isCompliant ? '#10b981' : '#ef4444'};">${feederSummary.voltageDropPercent}% (${feederSummary.voltageDropV}V)</strong></div>
        <div class="inv-pop-row"><span>PEC 2.15 Status:</span> <strong style="color: ${feederSummary.isCompliant ? '#10b981' : '#ef4444'};">${feederSummary.isCompliant ? '✅ COMPLIANT (≤3%)' : '⚠️ EXCEEDS 3%'}</strong></div>
        <div class="inv-pop-actions" style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-subtle, #334155); display: flex; justify-content: flex-end;">
          <button type="button" class="btn btn-xs btn-outline danger btn-del-pcc-loc" data-sys-id="${sys.id}" title="Remove AC PCC location from map">🗑️ Remove Location</button>
        </div>
        <small class="inv-pop-hint">💡 Tip: Drag marker to reposition AC PCC and recalculate voltage drop</small>
      </div>
    `;
    marker.bindPopup(popupContent, { className: 'solar-dark-popup' });

    marker.bindTooltip(`<strong>🏢 ${escapeHtml(sys.name)} PCC Interconnection</strong><br/>${feederSummary.totalRunM}m Run &bull; ${feederSummary.voltageDropPercent}% V-Drop &bull; Drag to relocate`, {
      direction: 'top',
      offset: [0, -42],
      className: 'solar-tooltip'
    });

    this.acInterconnectionGroup.addLayer(marker);
  }
}
