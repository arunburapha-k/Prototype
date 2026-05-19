import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { forecastAdapter, ProphetModel } from '../forecast';
import { BACKEND_URL, ENTITY_ID } from '../constants';
import { telemetryService } from '../api/thingsboard';
import type { 
  DeviceTelemetry, 
  CroppedSegment, 
  SensorConfig, 
  ForecastBacktestMetrics,
  TelemetryData
} from '../types';

type ForecastBundle = {
  points: TelemetryData[];
  metrics: ForecastBacktestMetrics | null;
};

const getLatestTelemetryTs = (telemetry: DeviceTelemetry, sensorKey: string): number => {
  const points = forecastAdapter.toTimeSeries(telemetry, sensorKey);
  return points.length > 0 ? points[points.length - 1][0] : 0;
};

export const useForecast = (
  telemetry: DeviceTelemetry,
  _croppedSegments: CroppedSegment[],
  sensorConfigs: SensorConfig[]
) => {
  const [fullForecastData, setFullForecastData] = useState<DeviceTelemetry>({});
  const [forecastMetrics, setForecastMetrics] = useState<Record<string, ForecastBacktestMetrics>>({});
  const [forecastHorizon, setForecastHorizon] = useState<number | null>(null);
  const [forecastLoadingDays, setForecastLoadingDays] = useState<number | null>(null);
  const fullForecastDataRef = useRef<DeviceTelemetry>({});
  const inFlightForecastsRef = useRef<Map<string, Promise<ForecastBundle | null>>>(new Map());
  const forecastRequestIdRef = useRef(0);

  useEffect(() => {
    fullForecastDataRef.current = fullForecastData;
  }, [fullForecastData]);

  const visibleSensorKeys = useMemo(() => {
    return sensorConfigs
      .filter(config => config.visible)
      .map(config => config.key);
  }, [sensorConfigs]);

  const buildForecastForSensor = useCallback(async (sensorKey: string): Promise<ForecastBundle | null> => {
    // Fetch 3 months of historical data for the model
    const now = Date.now();
    const threeMonthsAgo = now - (90 * 24 * 60 * 60 * 1000);
    
    const historicalResult = await telemetryService.getTimeseries(
      'DEVICE',
      ENTITY_ID,
      sensorKey,
      threeMonthsAgo,
      now
    );

    const timeSeries = forecastAdapter.toTimeSeries(historicalResult.data, sensorKey);
    
    if (timeSeries.length < 2) return null;

    const intervalMs = forecastAdapter.inferIntervalMs(timeSeries);
    const lastHistoricalPoint = timeSeries[timeSeries.length - 1];

    try {
      const model = new ProphetModel();
      model.fit(timeSeries);
      // Always predict 20 days
      const forecastPoints = await model.predict(20, intervalMs);
      
      if (forecastPoints.length === 0) return null;

      let metrics: ForecastBacktestMetrics | null = null;
      try {
        const backtestResponse = await fetch(`${BACKEND_URL}/api/backtest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: timeSeries,
            horizonDays: 20,
            intervalMs
          })
        });

        if (backtestResponse.ok) {
          metrics = (await backtestResponse.json()) as ForecastBacktestMetrics;
        }
      } catch (backtestError) {
        console.error('Backtest API failed:', backtestError);
      }

      return {
        points: [
          { ts: lastHistoricalPoint[0], value: lastHistoricalPoint[1] },
          ...forecastPoints.filter(point => point.ts > lastHistoricalPoint[0])
        ],
        metrics
      };
    } catch (err) {
      console.error(err);
      return null;
    }
  }, []);

  const isForecastCacheFresh = useCallback((sensorKey: string): boolean => {
    const cachedPoints = fullForecastDataRef.current[sensorKey];
    if (!cachedPoints || cachedPoints.length < 2) return false;

    const latestTelemetryTs = getLatestTelemetryTs(telemetry, sensorKey);
    const cachedAnchorTs = Number(cachedPoints[0]?.ts) || 0;
    return latestTelemetryTs <= cachedAnchorTs;
  }, [telemetry]);

  const hasRenderableForecastCache = useCallback((sensorKeys: string[]): boolean => {
    return sensorKeys.some(sensorKey => isForecastCacheFresh(sensorKey));
  }, [isForecastCacheFresh]);

  const ensureForecastCache = useCallback(async (sensorKeys: string[], force = false) => {
    const uniqueSensorKeys = Array.from(new Set(sensorKeys)).filter(Boolean);
    if (uniqueSensorKeys.length === 0) return;

    const bundles = await Promise.all(
      uniqueSensorKeys.map(async sensorKey => {
        if (!force && isForecastCacheFresh(sensorKey)) {
          return { sensorKey, bundle: null };
        }

        let forecastPromise = !force ? inFlightForecastsRef.current.get(sensorKey) : undefined;
        if (!forecastPromise) {
          forecastPromise = buildForecastForSensor(sensorKey);
          inFlightForecastsRef.current.set(sensorKey, forecastPromise);
        }

        try {
          return {
            sensorKey,
            bundle: await forecastPromise
          };
        } finally {
          if (inFlightForecastsRef.current.get(sensorKey) === forecastPromise) {
            inFlightForecastsRef.current.delete(sensorKey);
          }
        }
      })
    );

    const newForecast: DeviceTelemetry = {};
    const newMetrics: Record<string, ForecastBacktestMetrics> = {};

    bundles.forEach(({ sensorKey, bundle }) => {
      if (!bundle) return;
      newForecast[sensorKey] = bundle.points;
      if (bundle.metrics) {
        newMetrics[sensorKey] = bundle.metrics;
      }
    });

    if (Object.keys(newForecast).length > 0) {
      fullForecastDataRef.current = {
        ...fullForecastDataRef.current,
        ...newForecast
      };
      setFullForecastData(prev => ({ ...prev, ...newForecast }));
    }

    if (Object.keys(newMetrics).length > 0) {
      setForecastMetrics(prev => ({ ...prev, ...newMetrics }));
    }
  }, [buildForecastForSensor, isForecastCacheFresh]);

  useEffect(() => {
    if (visibleSensorKeys.length === 0 || Object.keys(telemetry).length === 0) return;
    void ensureForecastCache(visibleSensorKeys);
  }, [ensureForecastCache, telemetry, visibleSensorKeys]);

  const handleForecast = useCallback((days: number) => {
    const requestId = forecastRequestIdRef.current + 1;
    forecastRequestIdRef.current = requestId;

    if (days === 0) {
      setForecastHorizon(null);
      setForecastLoadingDays(null);
      return;
    }

    setForecastHorizon(days);

    if (visibleSensorKeys.length === 0 || hasRenderableForecastCache(visibleSensorKeys)) {
      setForecastLoadingDays(null);
      void ensureForecastCache(visibleSensorKeys);
      return;
    }

    setForecastLoadingDays(days);
    void ensureForecastCache(visibleSensorKeys).then(() => {
      if (forecastRequestIdRef.current !== requestId) return;
      if (!hasRenderableForecastCache(visibleSensorKeys)) {
        setForecastLoadingDays(null);
      }
    });
  }, [ensureForecastCache, hasRenderableForecastCache, visibleSensorKeys]);

  const forecastData = useMemo(() => {
    if (!forecastHorizon || Object.keys(fullForecastData).length === 0) return {};
    
    const slicedForecast: DeviceTelemetry = {};
    const horizonMs = forecastHorizon * 24 * 60 * 60 * 1000;

    Object.keys(fullForecastData).forEach(key => {
      const points = fullForecastData[key];
      if (points.length === 0) return;
      
      const startTs = points[0].ts;
      const endTs = startTs + horizonMs;
      
      slicedForecast[key] = points.filter(p => p.ts <= endTs);
    });

    return slicedForecast;
  }, [fullForecastData, forecastHorizon]);

  const hasRenderedForecast = useMemo(() => {
    if (!forecastHorizon) return false;
    return visibleSensorKeys.some(key => (forecastData[key]?.length ?? 0) > 1);
  }, [forecastData, forecastHorizon, visibleSensorKeys]);

  useEffect(() => {
    if (forecastLoadingDays !== null && hasRenderedForecast) {
      setForecastLoadingDays(null);
    }
  }, [forecastLoadingDays, hasRenderedForecast]);

  const handleSensorPredict = useCallback((sensorKey: string) => {
    const requestId = forecastRequestIdRef.current + 1;
    forecastRequestIdRef.current = requestId;
    const days = 10;
    setForecastHorizon(days);

    if (hasRenderableForecastCache([sensorKey])) {
      setForecastLoadingDays(null);
      void ensureForecastCache([sensorKey]);
      return;
    }

    setForecastLoadingDays(days);
    void ensureForecastCache([sensorKey]).then(() => {
      if (forecastRequestIdRef.current !== requestId) return;
      if (!hasRenderableForecastCache([sensorKey])) {
        setForecastLoadingDays(null);
      }
    });
  }, [ensureForecastCache, hasRenderableForecastCache]);

  return {
    forecastData,
    forecastMetrics,
    forecastHorizon,
    forecastLoadingDays,
    isForecastLoading: forecastLoadingDays !== null,
    handleForecast,
    handleSensorPredict,
    setForecastData: (data: DeviceTelemetry) => {
      fullForecastDataRef.current = data;
      setFullForecastData(data);
    },
    setForecastMetrics,
    setForecastHorizon: (horizon: number | null) => {
      if (!horizon) {
        forecastRequestIdRef.current += 1;
        setForecastLoadingDays(null);
      }
      setForecastHorizon(horizon);
    }
  };
};
