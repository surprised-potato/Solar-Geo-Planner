/**
 * Inverter / AC / auto-stringing listeners for the active system.
 */
import { AcPhaseType, MdpTapType, StringTraverseDirection } from '../../../types/solar';
import type { RibbonUI } from '../../ribbon';

export function attachSystemListeners(this: RibbonUI, zoneId?: string): void {
  // --- Tab 5: Inverters & Auto-Stringing ---
  const activeSys = this.store.getSelectedSystem() || (zoneId ? this.store.getZone(zoneId)?.systemId ? this.store.getSystem(this.store.getZone(zoneId)!.systemId) : undefined : undefined) || this.store.getSystems()[0];
  const systemId = activeSys?.id;

  const capacitySelect = document.getElementById('ribbon-inv-capacity-select') as HTMLSelectElement;
  capacitySelect?.addEventListener('change', () => {
    if (systemId && capacitySelect.value !== 'custom') {
      const kw = Number(capacitySelect.value);
      if (kw > 0) {
        this.store.setSystemInverterCapacity(systemId, kw);
      }
    }
  });

  const presetSelect = document.getElementById('ribbon-inverter-preset-select') as HTMLSelectElement;
  presetSelect?.addEventListener('change', () => {
    if (systemId && presetSelect.value) {
      this.store.setSystemInverterPreset(systemId, presetSelect.value);
    }
  });

  const invCount = document.getElementById('ribbon-inv-count') as HTMLInputElement;
  const invKw = document.getElementById('ribbon-inv-kw') as HTMLInputElement;
  const invMppt = document.getElementById('ribbon-inv-mppt') as HTMLInputElement;
  const invStrMppt = document.getElementById('ribbon-inv-str-mppt') as HTMLInputElement;
  const invVmax = document.getElementById('ribbon-inv-vmax') as HTMLInputElement;
  const invPhase = document.getElementById('ribbon-inv-phase') as HTMLSelectElement;
  const invVac = document.getElementById('ribbon-inv-ac-voltage-preset') as HTMLSelectElement;
  const invFreq = document.getElementById('ribbon-inv-freq') as HTMLSelectElement;

  const syncInverter = () => {
    if (!systemId) return;
    this.store.updateSystemInverter(systemId, {
      inverterCount: Math.max(1, Number(invCount?.value) || 1),
      ratedAcPowerKw: Number(invKw?.value) || 100,
      mpptCountPerInverter: Math.max(1, Number(invMppt?.value) || 9),
      maxStringsPerMppt: Math.max(1, Number(invStrMppt?.value) || 2),
      maxDcVoltage: Number(invVmax?.value) || 1100,
      phase: (invPhase?.value as AcPhaseType) || 'three_phase',
      acVoltage: Number(invVac?.value) || 400,
      gridFrequencyHz: Number(invFreq?.value) || 50
    });
  };

  [invCount, invKw, invMppt, invStrMppt, invVmax].forEach(inp => {
    inp?.addEventListener('change', syncInverter);
  });

  invPhase?.addEventListener('change', () => {
    if (!systemId) return;
    const phase = invPhase.value as AcPhaseType;
    const defaultVac = phase === 'single_phase' ? 230 : 400;
    this.store.updateSystemInverter(systemId, {
      phase,
      acVoltage: defaultVac
    });
  });

  invVac?.addEventListener('change', () => {
    if (!systemId) return;
    if (invVac.value === 'custom') {
      const currentSys = this.store.getSystem(systemId);
      const val = prompt('Enter custom AC Line Voltage in Volts (e.g. 480, 208, 240, 230):', String(currentSys?.inverter.acVoltage || 400));
      if (val && Number(val) > 0) {
        this.store.updateSystemInverter(systemId, { acVoltage: Number(val) });
      }
    } else {
      const vac = Number(invVac.value);
      if (vac > 0) {
        this.store.updateSystemInverter(systemId, { acVoltage: vac });
      }
    }
  });

  invFreq?.addEventListener('change', () => {
    if (!systemId) return;
    this.store.updateSystemInverter(systemId, { gridFrequencyHz: Number(invFreq.value) || 50 });
  });

  document.getElementById('ribbon-btn-place-inverter')?.addEventListener('click', () => {
    this.store.setDrawingMode(this.store.drawingMode === 'inverter' ? 'none' : 'inverter');
  });

  document.getElementById('ribbon-btn-fly-inverter')?.addEventListener('click', () => {
    if (systemId) {
      this.mapController?.zoomToInverter(systemId);
    }
  });

  document.getElementById('ribbon-btn-clear-inverter')?.addEventListener('click', () => {
    if (systemId) {
      this.store.setSystemInverterLocation(systemId, null);
    }
  });

  document.getElementById('ribbon-btn-draw-raceway')?.addEventListener('click', () => {
    if (this.store.drawingMode === 'raceway') {
      this.mapController?.finishDrawing();
    } else {
      this.store.setDrawingMode('raceway');
    }
  });

  document.getElementById('ribbon-btn-zoom-raceway')?.addEventListener('click', () => {
    this.mapController?.zoomToRaceway(zoneId, systemId || undefined);
  });

  document.getElementById('ribbon-btn-clear-raceway')?.addEventListener('click', () => {
    if (zoneId) this.store.clearZoneRaceway(zoneId);
    if (systemId) this.store.clearSystemHomerun(systemId);
  });

  const racewayElevInput = document.getElementById('ribbon-raceway-elev') as HTMLInputElement;
  racewayElevInput?.addEventListener('change', () => {
    const elev = Number(racewayElevInput.value) || 0;
    if (zoneId) this.store.setZoneElevationDelta(zoneId, elev);
    if (systemId) this.store.setSystemHomerunElevation(systemId, elev);
  });

  const invElevInput = document.getElementById('ribbon-inv-elevation') as HTMLInputElement;
  invElevInput?.addEventListener('change', () => {
    if (systemId) {
      const sys = this.store.getSystem(systemId);
      this.store.setSystemInverterLocation(
        systemId,
        sys?.inverterLocation || null,
        Number(invElevInput.value) || 0
      );
    }
  });

  document.getElementById('ribbon-btn-place-pcc')?.addEventListener('click', () => {
    this.store.setDrawingMode(this.store.drawingMode === 'ac_interconnection' ? 'none' : 'ac_interconnection');
  });

  document.getElementById('ribbon-btn-fly-pcc')?.addEventListener('click', () => {
    if (systemId) {
      this.mapController?.zoomToAcInterconnection(systemId);
    }
  });

  document.getElementById('ribbon-btn-clear-pcc')?.addEventListener('click', () => {
    if (systemId) {
      this.store.clearSystemAcInterconnectionLocation(systemId);
    }
  });

  document.getElementById('ribbon-btn-draw-ac-feeder')?.addEventListener('click', () => {
    if (this.store.drawingMode === 'ac_raceway') {
      this.mapController?.finishDrawing();
    } else {
      this.store.setDrawingMode('ac_raceway');
    }
  });

  document.getElementById('ribbon-btn-fly-ac-feeder')?.addEventListener('click', () => {
    if (systemId) {
      this.mapController?.zoomToAcRaceway(systemId);
    }
  });

  document.getElementById('ribbon-btn-clear-ac-feeder')?.addEventListener('click', () => {
    if (systemId) {
      this.store.clearSystemAcRaceway(systemId);
    }
  });

  const pccElevInput = document.getElementById('ribbon-pcc-elevation') as HTMLInputElement;
  pccElevInput?.addEventListener('change', () => {
    if (systemId) {
      this.store.selectSystem(systemId);
      this.store.setSystemAcInterconnectionElevation(systemId, Number(pccElevInput.value) || 0);
    }
  });

  const tapVacSelect = (document.getElementById('ribbon-ac-tap-voltage') || document.getElementById('ribbon-system-tap-voltage')) as HTMLSelectElement;
  tapVacSelect?.addEventListener('change', () => {
    if (!systemId) return;
    this.store.selectSystem(systemId);
    if (tapVacSelect.value === 'custom') {
      const currentSys = this.store.getSystem(systemId);
      const val = prompt('Enter custom System Tapping Voltage in Volts (e.g. 480, 230, 400):', String(currentSys?.systemVoltageV || 400));
      if (val && Number(val) > 0) {
        this.store.updateSystem(systemId, { systemVoltageV: Number(val) });
      }
    } else {
      const v = Number(tapVacSelect.value);
      if (v > 0) {
        this.store.updateSystem(systemId, { systemVoltageV: v });
      }
    }
  });

  const mdpTapSelect = (document.getElementById('ribbon-ac-mdp-tap') || document.getElementById('ribbon-mdp-tap-type')) as HTMLSelectElement;
  mdpTapSelect?.addEventListener('change', () => {
    if (systemId) {
      this.store.selectSystem(systemId);
      this.store.updateSystem(systemId, { mdpTapType: mdpTapSelect.value as MdpTapType });
    }
  });

  const mdpBreakerSelect = document.getElementById('ribbon-ac-mdp-main-breaker') as HTMLSelectElement;
  mdpBreakerSelect?.addEventListener('change', () => {
    if (systemId) {
      this.store.selectSystem(systemId);
      this.store.updateSystem(systemId, { mdpMainBreakerA: Number(mdpBreakerSelect.value) });
    }
  });

  const acCombinerChk = (document.getElementById('ribbon-ac-chk-combiner') || document.getElementById('ribbon-chk-ac-combiner')) as HTMLInputElement;
  acCombinerChk?.addEventListener('change', () => {
    if (systemId) {
      this.store.selectSystem(systemId);
      this.store.updateSystem(systemId, { hasAcCombiner: acCombinerChk.checked });
    }
  });

  document.getElementById('ribbon-btn-open-load-profile')?.addEventListener('click', () => {
    this.loadProfileModal.open(systemId);
  });

  // Auto-String Traversal Direction Selection
  document.getElementById('ribbon-str-direction')?.addEventListener('change', (e) => {
    const newDir = ((e.target as HTMLSelectElement).value as StringTraverseDirection) || 'short_side';
    this.store.setStringTraverseDirection(newDir, zoneId, true);
  });

  // Auto-String Matching Inverter
  document.getElementById('ribbon-btn-auto-string-inverter')?.addEventListener('click', () => {
    if (!systemId) return;
    const targetInput = document.getElementById('ribbon-str-target-size') as HTMLInputElement;
    const targetSize = targetInput?.value ? Number(targetInput.value) : undefined;
    const dirSelect = (document.getElementById('ribbon-str-direction') || document.getElementById('ribbon-opt-str-direction')) as HTMLSelectElement;
    const direction = (dirSelect?.value as StringTraverseDirection) || this.store.getStringTraverseDirection(zoneId) || 'short_side';

    this.store.setStringTraverseDirection(direction, zoneId, false);
    const result = this.store.autoStringSystem(systemId, targetSize, direction);

    let dirLabel = '↕ Across Short Side (Default)';
    if (direction === 'long_side') dirLabel = '↔ Across Long Side';
    else if (direction === 'rows') dirLabel = '↔ Follow Rows (Horizontal)';
    else if (direction === 'columns') dirLabel = '↕ Follow Columns (Vertical)';

    let msg =
      `⚡ Auto-Stringing Complete!\n\n` +
      `Traverse Path: ${dirLabel}\n` +
      `Total Strings Formed: ${result.totalStrings}\n` +
      `Modules per String: ${result.modulesPerString}\n` +
      `System DC/AC Ratio: ${result.inverterLoadRatio}`;

    if (result.warnings.length > 0) {
      msg += `\n\n⚠️ Notices:\n` + result.warnings.join('\n');
    }

    alert(msg);
  });

  document.getElementById('ribbon-btn-open-reg')?.addEventListener('click', () => {
    document.getElementById('btn-open-registry')?.click();
  });
}
