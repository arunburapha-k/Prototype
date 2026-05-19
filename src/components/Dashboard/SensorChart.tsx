import { useRef, useState, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import ReactECharts from 'echarts-for-react';
import { Loader2, Maximize2 } from 'lucide-react';
import CropPromptModal from '../Modals/CropPromptModal';
import ChartHeader from './ChartHeader';
import type { CroppedSegment, DeviceTelemetry, SensorConfig, TelemetryData } from '../../types/index';

type ChartPoint = [number, number, number?, number?];
type BrushEndParams = {
  areas?: Array<{
    coordRange?: number[];
  }>;
};
type ChartAxisOption = {
  range?: [number, number];
  min?: number;
  max?: number;
};
type TooltipParam = {
  axisValue: number | string;
  seriesName: string;
  color?: string;
  value?: Array<number | string>;
};

const toTimeAxisData = (points: TelemetryData[] = []): ChartPoint[] => {
  if (!Array.isArray(points)) return [];
  return points
    .filter(point => (
      point && 
      (Number.isFinite(Number(point.ts)) || !isNaN(Number(point.ts))) &&
      point.value !== null && 
      point.value !== undefined
    ))
    .map(point => {
      const ts = Number(point.ts);
      const val = Number(point.value);
      const lower = point.yhat_lower !== undefined ? Number(point.yhat_lower) : undefined;
      const upper = point.yhat_upper !== undefined ? Number(point.yhat_upper) : undefined;
      return [ts, val, lower, upper] as ChartPoint;
    })
    .filter(p => !isNaN(p[0]) && !isNaN(p[1]))
    .sort((a, b) => a[0] - b[0]);
};

const withHistoryAnchor = (historyData: ChartPoint[], forecastData: ChartPoint[]): ChartPoint[] => {
  if (historyData.length === 0 || forecastData.length === 0) return forecastData;
  const lastHistoryPoint = historyData[historyData.length - 1];
  const futureForecastData = forecastData.filter(([timestamp]) => timestamp > lastHistoryPoint[0]);
  const anchor: ChartPoint = [lastHistoryPoint[0], lastHistoryPoint[1], lastHistoryPoint[1], lastHistoryPoint[1]];
  return [anchor, ...futureForecastData];
};

interface SensorChartProps {
  data: DeviceTelemetry;
  forecastData?: DeviceTelemetry;
  forecastHorizon?: number | null;
  forecastLoadingDays?: number | null;
  isForecastLoading?: boolean;
  onSaveSegment: (segment: CroppedSegment) => void;
  sensorConfigs: SensorConfig[];
  onUpdateConfig: (configs: SensorConfig[]) => void;
  onFullscreen?: () => void;
  isFullscreen?: boolean;
  startDate: string;
  endDate: string;
  isRealtime: boolean;
  onStartDateChange: (val: string) => void;
  onEndDateChange: (val: string) => void;
  onRealtimeToggle: (val: boolean) => void;
  onForecast: (days: number) => void;
  onPredict: (sensorKey: string, sensorColor: string) => void;
  onViewRangeChange?: (start: number, end: number) => void;
  existingClasses: string[];
}

export interface SensorChartRef {
  resetChart: () => void;
}

const SensorChart = forwardRef<SensorChartRef, SensorChartProps>(({ 
  data = {},
  forecastData = {},
  forecastHorizon,
  forecastLoadingDays = null,
  isForecastLoading = false,
  onSaveSegment, 
  sensorConfigs = [], 
  onUpdateConfig,
  onFullscreen,
  isFullscreen = false,
  startDate,
  endDate,
  isRealtime,
  onStartDateChange,
  onEndDateChange,
  onRealtimeToggle,
  onForecast,
  onViewRangeChange,
  existingClasses
}, ref) => {
  const chartRef = useRef<ReactECharts>(null);
  const [isModalOpen, setModalOpen] = useState(false);
  const [tempRange, setTempRange] = useState<[number, number] | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  useImperativeHandle(ref, () => ({
    resetChart: () => {
      chartRef.current?.getEchartsInstance().dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
    }
  }));

  const onBrushEnd = useCallback((params: BrushEndParams) => {
    const area = params.areas?.[0];
    if (area?.coordRange) {
      setTempRange([area.coordRange[0], area.coordRange[1]]);
      setModalOpen(true);
    }
  }, []);

  const handleDataZoom = useCallback(() => {
    if (!onViewRangeChange) return;
    const instance = chartRef.current?.getEchartsInstance();
    if (!instance) return;
    const option = instance.getOption() as { xAxis?: ChartAxisOption[] };
    const xAxis = option.xAxis?.[0];
    if (!xAxis) return;
    const range = xAxis.range || [xAxis.min, xAxis.max];
    if (range && range[0] && range[1]) {
      onViewRangeChange(range[0], range[1]);
    }
  }, [onViewRangeChange]);

  const option = useMemo(() => {
    const series: Array<Record<string, unknown>> = [];
    if (Array.isArray(sensorConfigs)) {
      sensorConfigs.forEach(config => {
        if (!config || !config.visible) return;
        const historyPoints = toTimeAxisData(data?.[config.key]);
        const forecastPoints = withHistoryAnchor(historyPoints, toTimeAxisData(forecastData?.[config.key]));

        series.push({
          name: config.label,
          type: 'line',
          data: historyPoints,
          smooth: true,
          showSymbol: false,
          lineStyle: { color: config.color, width: 2.5 },
          itemStyle: { color: config.color },
        });

        if (forecastPoints && forecastPoints.length > 0) {
          // 1. Lower Bound (Invisible but stacked)
          series.push({
            name: `${config.label} (Lower)`,
            type: 'line',
            data: forecastPoints.map(p => [p[0], p[2] ?? p[1]]),
            smooth: 0.35,
            smoothMonotone: 'x',
            lineStyle: { opacity: 0 },
            stack: 'confidence-' + config.key,
            symbol: 'none',
            connectNulls: true
          });

          // 2. Upper Bound (Stacked on Lower to create area)
          series.push({
            name: `${config.label} (Range)`,
            type: 'line',
            data: forecastPoints.map(p => [p[0], (p[3] ?? p[1]) - (p[2] ?? p[1])]),
            smooth: 0.35,
            smoothMonotone: 'x',
            stack: 'confidence-' + config.key,
            areaStyle: { 
              color: config.color, 
              opacity: 0.3,
              shadowBlur: 5,
              shadowColor: 'rgba(0,0,0,0.1)'
            },
            lineStyle: { opacity: 0.2, color: config.color }, 
            symbol: 'none',
            connectNulls: true
          });

          // 3. Main Forecast Line
          series.push({
            name: `${config.label} (Forecast)`,
            type: 'line',
            data: forecastPoints.map(p => [p[0], p[1]]),
            smooth: 0.35,
            smoothMonotone: 'x',
            showSymbol: false,
            lineStyle: { color: config.color, width: 2, type: 'dashed', opacity: 0.8 },
            itemStyle: { color: config.color },
          });
        }
      });
    }

    return {
      tooltip: { 
        trigger: 'axis', 
        backgroundColor: 'rgba(255, 255, 255, 0.95)', 
        borderWeight: 0, 
        shadowBlur: 10, 
        shadowColor: 'rgba(0,0,0,0.1)',
        formatter: (params: TooltipParam[]) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          let res = `<div style="font-weight: bold; margin-bottom: 4px;">${new Date(params[0].axisValue).toLocaleString()}</div>`;
          params.forEach((p) => {
            if (p.seriesName.includes('(Range)') || p.seriesName.includes('(Lower)')) return;
            res += `<div style="display: flex; align-items: center; gap: 8px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${p.color ?? '#64748b'};"></span>
              <span style="flex: 1; font-size: 11px; color: #64748b;">${p.seriesName}</span>
              <span style="font-weight: bold; color: #1e293b;">${p.value?.[1] ?? ''}</span>
            </div>`;
          });
          return res;
        }
      },
      legend: { show: false },
      toolbox: { show: false },
      grid: { left: '3%', right: '4%', bottom: 60, top: 30, containLabel: true },
      xAxis: { type: 'time', splitLine: { show: true, lineStyle: { color: '#f1f5f9' } }, axisLine: { show: false } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f1f5f9' } }, axisLine: { show: false } },
      dataZoom: [{ type: 'inside', start: 0, end: 100 }, { type: 'slider', bottom: 10, height: 30, borderColor: 'transparent', backgroundColor: '#f8fafc', fillerColor: 'rgba(59, 130, 246, 0.1)', handleStyle: { color: '#3b82f6' } }],
      brush: { xAxisIndex: 'all', brushLink: 'all', outOfBrush: { colorAlpha: 0.1 } },
      series
    };
  }, [data, forecastData, sensorConfigs]);

  const handleCrop = useCallback(() => {
    const instance = chartRef.current?.getEchartsInstance();
    if (instance) {
      const nextState = !isCropping;
      setIsCropping(nextState);
      
      instance.dispatchAction({
        type: 'takeGlobalCursor',
        key: 'brush',
        brushOption: nextState ? {
          brushType: 'lineX',
          brushMode: 'single'
        } : false
      });
    }
  }, [isCropping]);

  return (
    <div className={`flex flex-col flex-1 ${isFullscreen ? 'h-full' : ''} w-full`}>
      <div className="flex justify-between items-start mb-6">
        <ChartHeader 
          startDate={startDate}
          endDate={endDate}
          isRealtime={isRealtime}
          onStartDateChange={onStartDateChange}
          onEndDateChange={onEndDateChange}
          onRealtimeToggle={onRealtimeToggle}
          sensorConfigs={sensorConfigs}
          onUpdateConfig={onUpdateConfig}
          onForecast={onForecast}
          forecastHorizon={forecastHorizon}
          forecastLoadingDays={forecastLoadingDays}
          isForecastLoading={isForecastLoading}
          onCrop={handleCrop}
          isCropping={isCropping}
        />
        
        <div className="flex items-center gap-2">
          {!isFullscreen && (
            <button 
              onClick={onFullscreen}
              className="p-2.5 text-slate-400 hover:text-primary-600 bg-white border border-slate-200 rounded-xl transition-all shadow-sm"
            >
              <Maximize2 size={18} />
            </button>
          )}
        </div>
      </div>

      <div className={`bg-white rounded-2xl border border-slate-50 shadow-sm flex-1 relative ${isFullscreen ? 'min-h-0' : 'min-h-[400px]'}`}>
        <div className={isFullscreen ? 'absolute inset-0' : 'h-[400px]'}>
          <ReactECharts 
            ref={chartRef}
            option={option} 
            notMerge={true}
            style={{ height: '100%', width: '100%' }}
            onEvents={{ 'brushEnd': onBrushEnd, 'dataZoom': handleDataZoom }}
          />
        </div>
        {isForecastLoading && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/45 backdrop-blur-[1px]">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-100 bg-white shadow-lg shadow-slate-200/70">
              <Loader2 size={22} className="animate-spin text-primary-600" />
            </div>
          </div>
        )}
      </div>

      {isModalOpen && tempRange && (
        <CropPromptModal 
          range={tempRange}
          existingClasses={existingClasses}
          onClose={() => { 
            setModalOpen(false); 
            setTempRange(null);
            const instance = chartRef.current?.getEchartsInstance();
            if (instance) {
              instance.dispatchAction({
                type: 'brush',
                command: 'clear',
                areas: []
              });
            }
          }}
          onConfirm={(className) => {
            onSaveSegment({ id: Date.now(), className, start: tempRange[0], end: tempRange[1], sensors: sensorConfigs.filter(c => c.visible).map(c => c.label) });
            setModalOpen(false);
            setTempRange(null);
            const instance = chartRef.current?.getEchartsInstance();
            if (instance) {
              instance.dispatchAction({
                type: 'brush',
                command: 'clear',
                areas: []
              });
            }
          }}
        />
      )}
    </div>
  );
});

export default SensorChart;
