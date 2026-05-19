import { useState, useCallback, useEffect } from 'react';
import { telemetryService } from '../api/thingsboard';
import { ENTITY_ID, REALTIME_INTERVAL_MS } from '../constants';
import type { DeviceTelemetry, DeviceInfo } from '../types';

export const useTelemetry = (
  startDateTime: string,
  endDateTime: string,
  isRealtime: boolean
) => {
  const [telemetry, setTelemetry] = useState<DeviceTelemetry>({});
  const [loading, setLoading] = useState(true);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [connectionStatus, setConnectionStatus] = useState({
    isMock: true,
    count: 0,
    hasData: false,
    error: undefined as string | undefined
  });

  const fetchData = useCallback(async (isAuto = false, customStart?: number, customEnd?: number) => {
    const isDrillDown = !!customStart;
    if (!isAuto && !isDrillDown) setLoading(true);

    const startTs = customStart || new Date(startDateTime).getTime();
    const endTs = customEnd || (isRealtime ? Date.now() : new Date(endDateTime).getTime());
    
    // Calculate duration and determine aggregation
    const durationMs = endTs - startTs;
    const hourMs = 3600000;
    const dayMs = 86400000;
    
    let agg = 'NONE';
    let interval = 0;
    
    // Limit to ~500 points as per server constraint
    if (durationMs > (dayMs * 20)) {
      agg = 'AVG';
      // Calculate interval to get ~500 points, but snap to hourly increments
      const rawInterval = Math.floor(durationMs / 500);
      interval = Math.max(hourMs, Math.ceil(rawInterval / hourMs) * hourMs);
    } else if (durationMs > hourMs) {
      // For ranges up to 20 days, use hourly aggregation to ensure readability
      agg = 'AVG';
      interval = hourMs;
    }

    // Default sensor key from project context
    const sensorKeys = "data_value";

    const result = await telemetryService.getTimeseries(
      'DEVICE',
      ENTITY_ID,
      sensorKeys,
      startTs,
      endTs,
      50000,
      agg,
      interval
    );

    setTelemetry(result.data);
    setConnectionStatus({
      isMock: result.isMock,
      count: result.count || 0,
      hasData: result.hasData,
      error: result.error
    });

    if (!isAuto && !isDrillDown) setLoading(false);
  }, [startDateTime, endDateTime, isRealtime]);

  // Load device info once
  useEffect(() => {
    const loadDeviceInfo = async () => {
      const info = await telemetryService.getDevice(ENTITY_ID);
      setDeviceInfo(info);
    };
    loadDeviceInfo();
  }, []);

  // Poll for realtime data
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isRealtime) {
      interval = setInterval(() => {
        fetchData(true);
      }, REALTIME_INTERVAL_MS);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRealtime, fetchData]);

  return {
    telemetry,
    loading,
    deviceInfo,
    connectionStatus,
    fetchData,
    setLoading
  };
};
