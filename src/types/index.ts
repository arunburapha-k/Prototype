export interface TelemetryData {
  ts: number;
  value: number | null;
  yhat_lower?: number;
  yhat_upper?: number;
}

export interface EvaluationMetricSummary {
  mae: number;
  rmse: number;
  mape: number;
  smape: number;
  coverage: number;
  count: number;
}

export interface MonthlyEvaluationMetric extends EvaluationMetricSummary {
  month: string;
  cutoffTs: number;
  cutoffLabel: string;
}

export interface ForecastBacktestMetrics {
  overall: EvaluationMetricSummary;
  monthly: MonthlyEvaluationMetric[];
  cutoffs: number;
}

export interface CroppedSegment {
  id: number;
  className: string;
  start: number;
  end: number;
  sensors: string[];
}

export interface DeviceTelemetry {
  [key: string]: TelemetryData[];
}

export interface SensorConfig {
  key: string;
  label: string; // User-editable display name
  color: string;
  visible: boolean;
}

export interface DeviceInfo {
  id: { id: string };
  name: string;
  type: string;
  label: string;
}

export interface StorageSegment {
  id?: number;
  external_id: number;
  className: string;
  start: number;
  end: number;
  sensors: string[];
  data?: Record<string, TelemetryData[]>;
}
