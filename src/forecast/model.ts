import { DAY_MS, DEFAULT_FORECAST_INTERVAL_MS } from './adapter';
import { BACKEND_URL } from '../constants';
import type { TelemetryData } from '../types/index';

const WEEK_MS = 7 * DAY_MS;
const MIN_PATTERN_POINTS = 8;

const roundForecastValue = (value: number): number => parseFloat(value.toFixed(2));

const normalizeHistory = (data: [number, number][]): [number, number][] => {
  const deduped = new Map<number, number>();
  data.forEach(([ts, value]) => {
    if (Number.isFinite(ts) && Number.isFinite(value)) {
      deduped.set(Number(ts), Number(value));
    }
  });

  return Array.from(deduped.entries()).sort((a, b) => a[0] - b[0]);
};

const interpolateValueAt = (points: [number, number][], targetTs: number): number | null => {
  if (points.length === 0 || !Number.isFinite(targetTs)) return null;
  if (targetTs <= points[0][0]) return points[0][1];
  if (targetTs >= points[points.length - 1][0]) return points[points.length - 1][1];

  let low = 0;
  let high = points.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const [midTs, midValue] = points[mid];
    if (midTs === targetTs) return midValue;
    if (midTs < targetTs) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const before = points[Math.max(0, high)];
  const after = points[Math.min(points.length - 1, low)];
  const span = after[0] - before[0];
  if (span <= 0) return before[1];

  const ratio = (targetTs - before[0]) / span;
  return before[1] + ((after[1] - before[1]) * ratio);
};

const averageInWindow = (points: [number, number][], startTs: number, endTs: number): number | null => {
  const values = points
    .filter(([ts]) => ts >= startTs && ts <= endTs)
    .map(([, value]) => value);

  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const calculateStdDev = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const choosePatternPeriodMs = (history: [number, number][], intervalMs?: number): number | null => {
  if (history.length < MIN_PATTERN_POINTS) return null;

  const firstTs = history[0][0];
  const lastTs = history[history.length - 1][0];
  const spanMs = lastTs - firstTs;
  const safeIntervalMs = Math.max(1, intervalMs || DEFAULT_FORECAST_INTERVAL_MS);
  const candidates = [WEEK_MS, DAY_MS];

  for (const periodMs of candidates) {
    const pointsInRecentPeriod = history.filter(([ts]) => ts > lastTs - periodMs && ts <= lastTs).length;
    const enoughCadence = pointsInRecentPeriod >= Math.max(MIN_PATTERN_POINTS, Math.floor(periodMs / safeIntervalMs * 0.35));
    if (spanMs >= periodMs * 1.5 && enoughCadence) {
      return periodMs;
    }
  }

  const fallbackCount = Math.min(history.length, Math.max(MIN_PATTERN_POINTS, Math.ceil(DAY_MS / safeIntervalMs)));
  const fallbackStartIndex = history.length - fallbackCount;
  const fallbackPeriodMs = lastTs - history[fallbackStartIndex][0];
  return fallbackPeriodMs > safeIntervalMs ? fallbackPeriodMs : null;
};

const shapeForecastToRecentPattern = (
  historyInput: [number, number][],
  forecastInput: TelemetryData[],
  intervalMs?: number
): TelemetryData[] => {
  const history = normalizeHistory(historyInput);
  const forecast = forecastInput
    .filter(point => point && Number.isFinite(Number(point.ts)) && Number.isFinite(Number(point.value)))
    .map(point => ({ ...point, ts: Number(point.ts), value: Number(point.value) }))
    .sort((a, b) => a.ts - b.ts);

  if (history.length < MIN_PATTERN_POINTS || forecast.length === 0) return forecastInput;

  const patternPeriodMs = choosePatternPeriodMs(history, intervalMs);
  if (!patternPeriodMs) return forecast;

  const lastHistoryTs = history[history.length - 1][0];
  const lastHistoryValue = history[history.length - 1][1];
  const recentPatternValues = history
    .filter(([ts]) => ts > lastHistoryTs - patternPeriodMs && ts <= lastHistoryTs)
    .map(([, value]) => value);

  if (recentPatternValues.length < MIN_PATTERN_POINTS) return forecast;

  const currentAvg = averageInWindow(history, lastHistoryTs - patternPeriodMs, lastHistoryTs);
  const previousAvg = averageInWindow(history, lastHistoryTs - (patternPeriodMs * 2), lastHistoryTs - patternPeriodMs);
  const patternStdDev = calculateStdDev(recentPatternValues);
  const rawPeriodDrift = currentAvg !== null && previousAvg !== null ? currentAvg - previousAvg : 0;
  const maxPeriodDrift = patternStdDev > 0 ? patternStdDev * 0.8 : Math.abs(rawPeriodDrift);
  const periodDrift = maxPeriodDrift > 0
    ? Math.max(-maxPeriodDrift, Math.min(maxPeriodDrift, rawPeriodDrift))
    : 0;
  const firstModelValue = Number(forecast[0].value) || lastHistoryValue;
  const fallbackBand = Math.max(patternStdDev * 0.45, Math.abs(lastHistoryValue) * 0.03, 1);

  return forecast.map((point, index) => {
    const futureDistanceMs = Math.max(1, point.ts - lastHistoryTs);
    const periodsAhead = Math.max(1, Math.ceil(futureDistanceMs / patternPeriodMs));
    const sourceTs = point.ts - (periodsAhead * patternPeriodMs);
    const sourceValue = interpolateValueAt(history, sourceTs) ?? lastHistoryValue;
    const seasonalValue = sourceValue + (periodDrift * periodsAhead);
    const modelTrendValue = lastHistoryValue + (Number(point.value) - firstModelValue);
    const horizonRatio = forecast.length <= 1 ? 0 : index / (forecast.length - 1);
    const patternWeight = Math.max(0.68, 0.9 - (horizonRatio * 0.18));
    const shapedValue = (seasonalValue * patternWeight) + (modelTrendValue * (1 - patternWeight));
    const baseValue = Number(point.value);
    const delta = shapedValue - baseValue;

    const shiftedLower = point.yhat_lower !== undefined && Number.isFinite(Number(point.yhat_lower))
      ? Number(point.yhat_lower) + delta
      : shapedValue - fallbackBand;
    const shiftedUpper = point.yhat_upper !== undefined && Number.isFinite(Number(point.yhat_upper))
      ? Number(point.yhat_upper) + delta
      : shapedValue + fallbackBand;

    return {
      ...point,
      value: roundForecastValue(shapedValue),
      yhat_lower: roundForecastValue(Math.min(shiftedLower, shiftedUpper)),
      yhat_upper: roundForecastValue(Math.max(shiftedLower, shiftedUpper))
    };
  });
};

/**
 * Interface for all forecasting models to ensure consistency.
 */
export interface ForecastModel {
  name: string;
  fit(data: [number, number][]): void;
  predict(horizonDays: number, intervalMs?: number): Promise<TelemetryData[]>;
}

type ProphetForecastPoint = {
  ts?: number | string;
  ds?: number | string;
  value?: number | string;
  yhat?: number | string;
  yhat_lower?: number | string;
  yhat_upper?: number | string;
};

/**
 * Implementation of a Linear Regression Model.
 * This is your "Model File" logic.
 */
export class LinearRegressionModel implements ForecastModel {
  public name = "Linear Regression";
  private slope: number = 0;
  private intercept: number = 0;
  private lastTimestamp: number = 0;
  private avgIntervalMs: number = DEFAULT_FORECAST_INTERVAL_MS;
  private originTimestamp: number = 0;
  private isFitted = false;

  /**
   * "Training" phase: Calculates the line of best fit for the data.
   */
  public fit(data: [number, number][]): void {
    const sortedData = data
      .filter(([ts, value]) => Number.isFinite(ts) && Number.isFinite(value))
      .sort((a, b) => a[0] - b[0]);

    if (sortedData.length < 2) return;

    this.originTimestamp = sortedData[0][0];
    const n = sortedData.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (const [timestamp, y] of sortedData) {
      const x = timestamp - this.originTimestamp;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const denominator = n * sumXX - sumX * sumX;
    this.slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
    this.intercept = (sumY - this.slope * sumX) / n;
    
    this.lastTimestamp = sortedData[sortedData.length - 1][0];

    const deltas: number[] = [];
    for (let i = 1; i < sortedData.length; i++) {
      const delta = sortedData[i][0] - sortedData[i - 1][0];
      if (Number.isFinite(delta) && delta > 0) {
        deltas.push(delta);
      }
    }
    deltas.sort((a, b) => a - b);
    this.avgIntervalMs = deltas[Math.floor(deltas.length / 2)] || DEFAULT_FORECAST_INTERVAL_MS;
    this.isFitted = true;
  }

  /**
   * "Inference" phase: Uses the learned slope/intercept to predict the future.
   */
  public async predict(horizonDays: number, intervalMs = this.avgIntervalMs): Promise<TelemetryData[]> {
    if (!this.isFitted || horizonDays <= 0) return [];

    const safeIntervalMs = Math.max(1, intervalMs || this.avgIntervalMs || DEFAULT_FORECAST_INTERVAL_MS);
    const horizonMs = horizonDays * DAY_MS;
    const horizonEndTimestamp = this.lastTimestamp + horizonMs;
    const steps = Math.max(1, Math.ceil(horizonMs / safeIntervalMs));

    const predictions: TelemetryData[] = [];
    for (let i = 1; i <= steps; i++) {
      const futureTs = Math.min(this.lastTimestamp + (safeIntervalMs * i), horizonEndTimestamp);
      const futureOffset = futureTs - this.originTimestamp;
      const futureVal = this.slope * futureOffset + this.intercept;
      predictions.push({
        ts: futureTs,
        value: parseFloat(futureVal.toFixed(2))
      });
    }

    return predictions;
  }
}

/**
 * Implementation of the Prophet Forecasting Model (Backend-backed).
 */
export class ProphetModel implements ForecastModel {
  public name = "Prophet (AI)";
  private history: [number, number][] = [];

  public fit(data: [number, number][]): void {
    this.history = data;
  }

  public async predict(horizonDays: number, intervalMs?: number): Promise<TelemetryData[]> {
    if (this.history.length < 2) return [];

    try {
      console.log(`[ProphetModel] Requesting forecast for ${horizonDays} days...`);
      const response = await fetch(`${BACKEND_URL}/api/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: this.history,
          horizonDays,
          intervalMs: intervalMs || DEFAULT_FORECAST_INTERVAL_MS
        })
      });

      if (!response.ok) throw new Error('Prophet API failed');
      const data = await response.json();
      console.log(`[ProphetModel] Received ${data.length} points.`);
      
      const forecast = data.map((p: ProphetForecastPoint) => ({
        ts: Number(p.ts || p.ds),
        value: Number(p.value ?? p.yhat),
        yhat_lower: p.yhat_lower !== undefined ? Number(p.yhat_lower) : undefined,
        yhat_upper: p.yhat_upper !== undefined ? Number(p.yhat_upper) : undefined
      } as TelemetryData));

      return shapeForecastToRecentPattern(this.history, forecast, intervalMs);
    } catch (err) {
      console.error("ProphetModel Error, falling back to pattern-shaped Linear Regression:", err);
      const fallback = new LinearRegressionModel();
      fallback.fit(this.history);
      const forecast = await fallback.predict(horizonDays, intervalMs);
      return shapeForecastToRecentPattern(this.history, forecast, intervalMs);
    }
  }
}
