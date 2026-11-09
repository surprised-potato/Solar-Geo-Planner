/**
 * Solar Atlas & NASA POWER Climatology Integration Service
 *
 * Provides access to 30-year climatological solar irradiance and temperature measurements
 * via the NASA POWER API (free public REST API without authentication requirement).
 * Includes client-side caching and offline fallback.
 */

import { LatLngPoint } from '../types/solar';
import { CustomSolarResource } from '../geo/solarYield';

export interface NasaPowerClimatologyResponse {
  properties?: {
    parameter?: {
      ALLSKY_SFC_SW_DWN?: Record<string, number>; // Monthly GHI in kWh/m²/day ('JAN'..'DEC', 'ANN')
      T2M?: Record<string, number>;               // Monthly 2-meter air temperature in °C
    };
  };
  messages?: string[];
}

export class SolarAtlasService {
  private static instance: SolarAtlasService | null = null;
  private memoryCache = new Map<string, CustomSolarResource>();

  public static getInstance(): SolarAtlasService {
    if (!SolarAtlasService.instance) {
      SolarAtlasService.instance = new SolarAtlasService();
    }
    return SolarAtlasService.instance;
  }

  private getCacheKey(point: LatLngPoint): string {
    // Round to 1 decimal place (~11km grid) for effective caching
    return `solar_atlas_${point.lat.toFixed(1)}_${point.lng.toFixed(1)}`;
  }

  /**
   * Fetches monthly climatological solar irradiance and ambient temperatures for the specified location.
   */
  public async fetchClimatology(point: LatLngPoint): Promise<CustomSolarResource> {
    const cacheKey = this.getCacheKey(point);

    // 1. Check in-memory cache
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey)!;
    }

    // 2. Check localStorage cache
    try {
      const stored = localStorage.getItem(cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored) as CustomSolarResource;
        this.memoryCache.set(cacheKey, parsed);
        return parsed;
      }
    } catch {
      // LocalStorage error ignored
    }

    // 3. Query NASA POWER Climatology API
    // Parameters:
    // - ALLSKY_SFC_SW_DWN: All Sky Surface Shortwave Downward Irradiance (GHI, kWh/m²/day)
    // - T2M: Temperature at 2 Meters (°C)
    const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,T2M&community=RE&longitude=${point.lng.toFixed(4)}&latitude=${point.lat.toFixed(4)}&format=JSON`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`NASA POWER API HTTP ${response.status}: ${response.statusText}`);
      }

      const json: NasaPowerClimatologyResponse = await response.json();
      const params = json.properties?.parameter;

      if (!params || !params.ALLSKY_SFC_SW_DWN || !params.T2M) {
        throw new Error('Incomplete data received from NASA POWER API');
      }

      const monthKeys = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const monthlyGhiKwhPerM2Day: number[] = [];
      const monthlyAmbientTempC: number[] = [];

      for (const mKey of monthKeys) {
        const ghi = params.ALLSKY_SFC_SW_DWN[mKey];
        const temp = params.T2M[mKey];

        if (typeof ghi === 'number' && ghi > 0) {
          monthlyGhiKwhPerM2Day.push(Number(ghi.toFixed(2)));
        } else {
          throw new Error(`Invalid GHI data for month ${mKey}`);
        }

        if (typeof temp === 'number') {
          monthlyAmbientTempC.push(Number(temp.toFixed(1)));
        } else {
          monthlyAmbientTempC.push(25.0); // Fallback
        }
      }

      const resource: CustomSolarResource = {
        sourceName: `NASA POWER 30-Year Solar Climatology (${point.lat.toFixed(2)}°, ${point.lng.toFixed(2)}°)`,
        monthlyGhiKwhPerM2Day,
        monthlyAmbientTempC
      };

      // Store in memory and localStorage
      this.memoryCache.set(cacheKey, resource);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(resource));
      } catch {
        // LocalStorage quota error ignored
      }

      return resource;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  /**
   * Retrieves any cached resource for this point, or null if none is cached yet.
   */
  public getCachedResource(point: LatLngPoint): CustomSolarResource | null {
    const cacheKey = this.getCacheKey(point);
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey)!;
    }
    try {
      const stored = localStorage.getItem(cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored) as CustomSolarResource;
        this.memoryCache.set(cacheKey, parsed);
        return parsed;
      }
    } catch {
      // Ignored
    }
    return null;
  }
}
