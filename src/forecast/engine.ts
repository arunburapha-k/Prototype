import { DAY_MS, DEFAULT_FORECAST_INTERVAL_MS } from './adapter';

/**
 * Basic Forecasting Engine implementing standard algorithms
 * for time-series prediction.
 */
export const forecastEngine = {
  /**
   * Simple Linear Regression to predict future values
   * Formula: y = mx + b
   */
  predictLinear: (data: [number, number][], horizonDays: number, intervalMs = DEFAULT_FORECAST_INTERVAL_MS): [number, number][] => {
    const sortedData = data
      .filter(([ts, value]) => Number.isFinite(ts) && Number.isFinite(value))
      .sort((a, b) => a[0] - b[0]);

    if (sortedData.length < 2 || horizonDays <= 0) return [];

    // Calculate means
    const originTs = sortedData[0][0];
    const n = sortedData.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (const [timestamp, y] of sortedData) {
      const x = timestamp - originTs;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const denominator = n * sumXX - sumX * sumX;
    const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    // Last timestamp to start prediction from
    const lastTs = sortedData[sortedData.length - 1][0];
    const safeIntervalMs = Math.max(1, intervalMs || DEFAULT_FORECAST_INTERVAL_MS);
    const horizonMs = horizonDays * DAY_MS;
    const horizonEndTs = lastTs + horizonMs;
    const steps = Math.max(1, Math.ceil(horizonMs / safeIntervalMs));

    const predictions: [number, number][] = [];
    for (let i = 1; i <= steps; i++) {
      const futureTs = Math.min(lastTs + (safeIntervalMs * i), horizonEndTs);
      const futureVal = slope * (futureTs - originTs) + intercept;
      predictions.push([futureTs, parseFloat(futureVal.toFixed(2))]);
    }

    return predictions;
  },

  /**
   * Simple Moving Average Forecast
   */
  predictMovingAverage: (data: number[], windowSize: number, horizon: number): number[] => {
    if (data.length < windowSize) return [];
    
    const results = [...data];
    for (let i = 0; i < horizon; i++) {
      const window = results.slice(-windowSize);
      const avg = window.reduce((a, b) => a + b, 0) / windowSize;
      results.push(avg);
    }
    
    return results.slice(-horizon);
  }
};
