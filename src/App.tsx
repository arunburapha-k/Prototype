import React, { useState, useEffect, useMemo, useRef } from 'react';

// Layout & Components
import Header from './components/Layout/Header';
import SensorChart from './components/Dashboard/SensorChart';
import type { SensorChartRef } from './components/Dashboard/SensorChart';
import CroppedList from './components/Dashboard/CroppedList';
import FullscreenModal from './components/Modals/FullscreenModal';
import PreviewModal from './components/Modals/PreviewModal';

// Hooks & Utilities
import { useTelemetry } from './hooks/useTelemetry';
import { useForecast } from './hooks/useForecast';
import { formatForInput } from './utils';
import { THINGSBOARD_TOKEN } from './constants';

// Types
import type { 
  CroppedSegment, 
  DeviceTelemetry,
  SensorConfig 
} from './types/index';

// Icons
import { RefreshCcw, Database } from 'lucide-react';

const App: React.FC = () => {
  const chartRef = useRef<SensorChartRef>(null);
  
  // App State
  const [croppedSegments, setSegments] = useState<CroppedSegment[]>([]);
  const [sensorConfigs, setSensorConfigs] = useState<SensorConfig[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewSegment, setPreviewSegment] = useState<CroppedSegment | null>(null);

  // Time Range State
  const [startDateTime, setStartDateTime] = useState(formatForInput(new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)));
  const [endDateTime, setEndDateTime] = useState(formatForInput(new Date()));
  const [isRealtime, setIsRealtime] = useState(false);

  // Custom Hooks
  const { 
    telemetry, 
    loading, 
    deviceInfo, 
    connectionStatus, 
    fetchData
  } = useTelemetry(startDateTime, endDateTime, isRealtime);

  const {
    forecastData,
    forecastHorizon,
    forecastLoadingDays,
    isForecastLoading,
    handleForecast,
    handleSensorPredict,
    setForecastHorizon
  } = useForecast(telemetry, croppedSegments, sensorConfigs);

  // Initialization
  useEffect(() => {
    localStorage.setItem('tb_token', THINGSBOARD_TOKEN);
  }, []);

  // Fetch initial data
  useEffect(() => {
    fetchData();
  }, [startDateTime, endDateTime, isRealtime, fetchData]);

  // Derived State
  const existingClasses = useMemo(() => {
    const classes = croppedSegments.map(s => s.className);
    return Array.from(new Set(classes)).filter(Boolean);
  }, [croppedSegments]);

  // Handlers
  const handleReset = () => {
    const newStart = formatForInput(new Date(Date.now() - 20 * 24 * 60 * 60 * 1000));
    const newEnd = formatForInput(new Date());
    chartRef.current?.resetChart();
    setForecastHorizon(null);
    if (newStart === startDateTime && newEnd === endDateTime) {
      fetchData();
    } else {
      setStartDateTime(newStart);
      setEndDateTime(newEnd);
      setIsRealtime(false);
    }
  };

  const handleExport = () => {
    if (croppedSegments.length === 0) return;
    const exportData = croppedSegments.map(segment => {
      const segmentData: Record<string, DeviceTelemetry[string]> = {};
      segment.sensors.forEach(label => {
        const config = sensorConfigs.find(c => c.label === label || c.key === label);
        const key = config ? config.key : label;
        if (telemetry[key]) {
          segmentData[label] = telemetry[key].filter(d => d.ts >= segment.start && d.ts <= segment.end);
        }
      });
      return { ...segment, data: segmentData };
    });
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-segments-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Sync sensor configs when telemetry arrives
  useEffect(() => {
    if (sensorConfigs.length === 0 && Object.keys(telemetry).length > 0) {
      const keys = Object.keys(telemetry);
      const defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
      setSensorConfigs(keys.map((key, i) => ({
        key,
        label: key,
        color: defaultColors[i % defaultColors.length],
        visible: true
      })));
    }
  }, [telemetry, sensorConfigs.length]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Header deviceId={deviceInfo?.id?.id || ''} deviceName={deviceInfo?.name} />
      
      <main className="max-w-[1440px] mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 min-h-[900px] flex flex-col relative overflow-hidden">
              <div className="flex justify-between items-center mb-8 relative z-10">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Telemetry Stream</h2>
                    <div className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${ connectionStatus.isMock ? 'bg-amber-100 text-amber-700' : connectionStatus.hasData ? 'bg-emerald-100 text-green-700' : 'bg-slate-100 text-slate-500' }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${ connectionStatus.isMock ? 'bg-amber-500 animate-pulse' : connectionStatus.hasData ? 'bg-green-500' : 'bg-slate-400' }`} />
                      {connectionStatus.isMock ? 'Simulated' : connectionStatus.hasData ? 'Live Data' : 'No Data Found'}
                    </div>
                  </div>
                  <p className="text-sm text-slate-400 font-medium">Aggregated data preparation for AI models</p>
                </div>
                
                <button 
                  onClick={handleReset} 
                  disabled={loading} 
                  className="p-3 text-slate-400 hover:text-primary-600 hover:bg-blue-50 rounded-2xl transition-all disabled:opacity-50"
                  title="Reset to default range (Last 10 Days)"
                >
                  <RefreshCcw size={22} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>

              <SensorChart 
                ref={chartRef}
                data={telemetry}
                forecastData={forecastData}
                forecastHorizon={forecastHorizon}
                forecastLoadingDays={forecastLoadingDays}
                isForecastLoading={isForecastLoading}
                onSaveSegment={(s) => setSegments(p => [s, ...p])} 
                sensorConfigs={sensorConfigs}
                onUpdateConfig={setSensorConfigs}
                onFullscreen={() => setIsFullscreen(true)}
                startDate={startDateTime}
                endDate={endDateTime}
                isRealtime={isRealtime}
                onStartDateChange={setStartDateTime}
                onEndDateChange={setEndDateTime}
                onRealtimeToggle={setIsRealtime}
                onForecast={handleForecast}
                onPredict={handleSensorPredict}
                existingClasses={existingClasses}
                onViewRangeChange={(s, e) => fetchData(false, s, e)}
              />
            </div>
          </div>

          <div className="w-full lg:w-[400px] shrink-0">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 sticky top-24">
              <div className="flex items-center gap-2 mb-8">
                <div className="p-2 bg-primary-50 rounded-xl text-primary-600 shadow-sm"><Database size={20} /></div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight">AI Training Segments</h2>
                
                <span className="ml-auto bg-primary-600 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-lg shadow-primary-100">
                  {croppedSegments.length}
                </span>
              </div>

              <CroppedList 
                segments={croppedSegments} 
                onDelete={(id) => setSegments(p => p.filter(s => s.id !== id))} 
                onUpdate={(u) => setSegments(p => p.map(s => s.id === u.id ? u : s))} 
                onPreview={setPreviewSegment} 
              />
              
              {croppedSegments.length > 0 && (
                <div className="mt-10 pt-8 border-t border-slate-50">
                  <button onClick={handleExport} className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white text-xs font-black tracking-[0.2em] rounded-2xl shadow-xl shadow-primary-100 transition-all active:scale-[0.98] uppercase">
                    Export Dataset (.JSON)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {isFullscreen && (
        <FullscreenModal 
          data={telemetry}
          forecastData={forecastData}
          forecastHorizon={forecastHorizon}
          forecastLoadingDays={forecastLoadingDays}
          isForecastLoading={isForecastLoading}
          sensorConfigs={sensorConfigs}
          onUpdateConfig={setSensorConfigs}
          onClose={() => setIsFullscreen(false)}
          onSaveSegment={(s) => setSegments(p => [s, ...p])}
          startDate={startDateTime}
          endDate={endDateTime}
          isRealtime={isRealtime}
          onStartDateChange={setStartDateTime}
          onEndDateChange={setEndDateTime}
          onRealtimeToggle={setIsRealtime}
          onForecast={handleForecast}
          onPredict={handleSensorPredict}
          existingClasses={existingClasses}
        />
      )}

      {previewSegment && (
        <PreviewModal 
          segment={previewSegment} 
          data={telemetry} 
          sensorConfigs={sensorConfigs} 
          onClose={() => setPreviewSegment(null)} 
        />
      )}
    </div>
  );
};

export default App;
