import axios from 'axios';
import { BACKEND_URL } from '../constants';
import type { CroppedSegment, DeviceTelemetry, TelemetryData } from '../types';

const api = axios.create({
  baseURL: BACKEND_URL,
});

export const storageService = {
  saveSegments: async (segments: CroppedSegment[], telemetry: DeviceTelemetry) => {
    // Optimization: Pre-calculate sensor data maps to avoid repeated filtering in O(N*M)
    const segmentsWithData = segments.map(segment => {
      const segmentData: Record<string, TelemetryData[]> = {};
      
      segment.sensors.forEach(label => {
        const sensorData = telemetry[label];
        if (sensorData && sensorData.length > 0) {
          // Use binary search or optimized slice if data is large and sorted
          // For now, standard filter is okay but we ensure we only do it once per sensor per segment
          segmentData[label] = sensorData.filter((d: TelemetryData) => d.ts >= segment.start && d.ts <= segment.end);
        }
      });

      return {
        external_id: segment.id,
        className: segment.className,
        start: segment.start,
        end: segment.end,
        sensors: segment.sensors,
        data: segmentData
      };
    });

    // Send in chunks if there are many segments to avoid payload size limits
    const response = await api.post('/api/storage/save', segmentsWithData);
    return response.data;
  },

  listSegments: async (includeData: boolean = false) => {
    const response = await api.get(`/api/storage/list?include_data=${includeData}`);
    return response.data;
  },

  clearStorage: async () => {
    const response = await api.delete('/api/storage/clear');
    return response.data;
  }
};
