import axios from 'axios';
import type { DeviceTelemetry } from '../types/index';

// Base URL from the provided documentation link
const TB_BASE_URL = 'https://thingsboard.weaverbase.com';

const api = axios.create({
  baseURL: TB_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tb_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const telemetryService = {
  getDevice: async (deviceId: string) => {
    try {
      const response = await api.get(`/api/device/${deviceId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching device info:', error);
      return { name: 'Unknown Device', label: 'N/A' };
    }
  },
  getTimeseries: async (
    entityType: string, 
    entityId: string, 
    keys: string, 
    startTs: number, 
    endTs: number,
    limit: number = 50000,
    agg: string = 'NONE',
    interval: number = 0
    ) => {
    try {
      // Validation to prevent 400 errors on invalid ranges
      if (isNaN(startTs) || isNaN(endTs)) {
        throw new Error('Invalid timestamp range provided');
      }

      // Ensure startTs is not in the future relative to endTs
      if (startTs > endTs) {
        const temp = startTs;
        startTs = endTs;
        endTs = temp;
      }

      // Force limit to 50,000 for safety (Server cap)
      const safeLimit = Math.min(limit, 50000);

      const params: Record<string, string | number> = {
        keys,
        startTs,
        endTs,
        limit: safeLimit
      };

      if (agg !== 'NONE') {
        params.agg = agg;
        params.interval = interval;
      }

      const url = `/api/plugins/telemetry/${entityType}/${entityId}/values/timeseries`;
      
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, value.toString());
        }
      });

      const fullUrl = `${url}?${searchParams.toString()}`;
      console.log('ThingsBoard API Requesting: v2.4', fullUrl);

      const response = await api.get(fullUrl);

      const hasData = response.data && Object.keys(response.data).length > 0;
      let count = 0;
      if (hasData) {
        const firstKey = Object.keys(response.data)[0];
        count = Array.isArray(response.data[firstKey]) ? response.data[firstKey].length : 0;
      }

      return { 
        data: response.data, 
        isMock: false,
        hasData: hasData && count > 0,
        count: count
      };
    } catch (error: unknown) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`ThingsBoard API Error v2.3 [${status}]:`, message);

      return { 
        data: {}, 
        isMock: false,
        hasData: false,
        error: `Error ${status || ''}: ${message}`
      };
    }
  }      };export const mockTelemetryData = (keys: string[], startTs: number, endTs: number, limit: number = 1000) => {
  const data: DeviceTelemetry = {};
  const duration = endTs - startTs;
  // Use a reasonable number of points for mock data, but respect the requested continuity
  const points = Math.min(limit, 10000); 
  
  keys.forEach((key, keyIdx) => {
    data[key] = Array.from({ length: points }).map((_, i) => {
      const ts = startTs + (duration / points) * i;
      // Deterministic value based on timestamp + key index to create a "real-looking" wave
      const baseValue = 30 + (keyIdx * 10);
      const sineWave = Math.sin(ts / 1000000) * 10;
      const noise = Math.sin(ts / 50000) * 2; // High frequency noise
      const value = parseFloat((baseValue + sineWave + noise).toFixed(2));
      
      return { ts, value };
    });
  });
  return data;
};
