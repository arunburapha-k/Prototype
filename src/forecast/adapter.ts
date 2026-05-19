import type { DeviceTelemetry } from '../types/index';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_FORECAST_INTERVAL_MS = 30 * 60 * 1000;

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/**
 * Adapter to transform raw ThingsBoard telemetry into datasets 
 * suitable for forecasting models.
 */
export const forecastAdapter = {
  /**
   * Converts telemetry data into a flat array of numbers (values only)
   * for a specific sensor key.
   */
  toValueArray: (telemetry: DeviceTelemetry, key: string): number[] => {
    const sensorData = telemetry[key] || [];
    return sensorData
      .map(d => toNumberOrNull(d.value))
      .filter((value): value is number => value !== null);
  },

  /**
   * Converts telemetry data into [timestamp, value] pairs, 
   * normalized for time-series analysis. The returned series is always
   * oldest-to-newest so the model anchors on the latest historical point.
   */
  toTimeSeries: (telemetry: DeviceTelemetry, key: string): [number, number][] => {
    const sensorData = telemetry[key] || [];
    return sensorData
      .map(d => [Number(d.ts), toNumberOrNull(d.value)] as [number, number | null])
      .filter((d): d is [number, number] => Number.isFinite(d[0]) && d[1] !== null)
      .sort((a, b) => a[0] - b[0]);
  },

  /**
   * Infers the data cadence from historical timestamps.
   * Median delta is used so occasional missing samples do not stretch the
   * forecast horizon into too few points.
   */
  inferIntervalMs: (timeSeries: [number, number][]): number => {
    if (timeSeries.length < 2) return DEFAULT_FORECAST_INTERVAL_MS;

    const deltas: number[] = [];
    for (let i = 1; i < timeSeries.length; i++) {
      const delta = timeSeries[i][0] - timeSeries[i - 1][0];
      if (Number.isFinite(delta) && delta > 0) {
        deltas.push(delta);
      }
    }

    if (deltas.length === 0) return DEFAULT_FORECAST_INTERVAL_MS;

    deltas.sort((a, b) => a - b);
    return deltas[Math.floor(deltas.length / 2)];
  },

  getLastHistoricalPoint: (telemetry: DeviceTelemetry, key: string): [number, number] | null => {
    const timeSeries = forecastAdapter.toTimeSeries(telemetry, key);
    return timeSeries.length > 0 ? timeSeries[timeSeries.length - 1] : null;
  },

  /**
   * Prepares a window-based dataset for training (e.g., [x1, x2, x3] -> y)
   */
  toWindowedDataset: (data: number[], windowSize: number) => {
    const X: number[][] = [];
    const y: number[] = [];
    
    for (let i = 0; i < data.length - windowSize; i++) {
      X.push(data.slice(i, i + windowSize));
      y.push(data[i + windowSize]);
    }
    
    return { X, y };
  }
};
