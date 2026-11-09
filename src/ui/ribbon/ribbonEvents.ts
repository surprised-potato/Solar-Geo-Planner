/**
 * DOM event wiring for every ribbon tab, re-attached after each render.
 */
import type { RibbonUI } from '../ribbon';
import { attachHomeTabListeners } from './events/homeEvents';
import { attachViewsTabListeners } from './events/viewsEvents';
import { attachReportsTabListeners } from './events/reportsEvents';
import { attachZoneTabListeners } from './events/zoneEvents';
import { attachSystemListeners } from './events/systemEvents';

export function attachEventListeners(this: RibbonUI, zoneId?: string): void {
  attachHomeTabListeners.call(this, zoneId);
  attachViewsTabListeners.call(this);
  attachReportsTabListeners.call(this);
  if (zoneId) {
    attachZoneTabListeners.call(this, zoneId);
  }
  attachSystemListeners.call(this, zoneId);
}
