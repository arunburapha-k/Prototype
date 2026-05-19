import React from 'react';
import { X } from 'lucide-react';
import SensorChart from '../Dashboard/SensorChart';
import type { CroppedSegment, DeviceTelemetry, SensorConfig } from '../../types/index';

interface FullscreenModalProps {
  data: DeviceTelemetry;
  forecastData?: DeviceTelemetry;
  forecastHorizon?: number | null;
  forecastLoadingDays?: number | null;
  isForecastLoading?: boolean;
  sensorConfigs: SensorConfig[];
  onUpdateConfig?: (configs: SensorConfig[]) => void;
  onClose: () => void;
  onSaveSegment: (segment: CroppedSegment) => void;
  startDate: string;
  endDate: string;
  isRealtime: boolean;
  onStartDateChange: (val: string) => void;
  onEndDateChange: (val: string) => void;
  onRealtimeToggle: (val: boolean) => void;
  onForecast?: (days: number) => void;
  onPredict?: (sensorKey: string, sensorColor: string) => void;
  onViewRangeChange?: (start: number, end: number) => void;
  existingClasses: string[];
}

const FullscreenModal: React.FC<FullscreenModalProps> = ({ 
  data, 
  forecastData = {},
  forecastHorizon,
  forecastLoadingDays = null,
  isForecastLoading = false,
  sensorConfigs, 
  onUpdateConfig, 
  onClose, 
  onSaveSegment, 
  startDate,
  endDate,
  isRealtime,
  onStartDateChange,
  onEndDateChange,
  onRealtimeToggle,
  onForecast,
  onPredict,
  onViewRangeChange,
  existingClasses
}) => {  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in fade-in duration-300">
      <div className="flex justify-between items-center px-8 py-4 border-b border-slate-100">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Fullscreen Analysis</h3>
          <p className="text-sm text-slate-500">Advanced view for data cropping and inspection</p>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
        >
          <X size={28} />
        </button>
      </div>
      
      <div className="flex-1 p-8 overflow-hidden">
        <div className="bg-white h-full border border-slate-100 rounded-2xl p-6 shadow-sm overflow-y-auto flex flex-col">
          <SensorChart 
            data={data} 
            forecastData={forecastData}
            forecastHorizon={forecastHorizon}
            forecastLoadingDays={forecastLoadingDays}
            isForecastLoading={isForecastLoading}
            onSaveSegment={onSaveSegment} 
            sensorConfigs={sensorConfigs}
            onUpdateConfig={onUpdateConfig}
            isFullscreen={true}
            startDate={startDate}
            endDate={endDate}
            isRealtime={isRealtime}
            onStartDateChange={onStartDateChange}
            onEndDateChange={onEndDateChange}
            onRealtimeToggle={onRealtimeToggle}
            onForecast={onForecast}
            onPredict={onPredict}
            onViewRangeChange={onViewRangeChange}
            existingClasses={existingClasses}
          />
        </div>
      </div>
    </div>
  );
};

export default FullscreenModal;
