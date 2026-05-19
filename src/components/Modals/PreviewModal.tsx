import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import type { DeviceTelemetry, CroppedSegment, SensorConfig } from '../../types/index';

interface PreviewModalProps {
  segment: CroppedSegment;
  data: DeviceTelemetry;
  sensorConfigs: SensorConfig[];
  onClose: () => void;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ segment, data, sensorConfigs, onClose }) => {
  const activeSensors = segment.sensors;
  
  const option = useMemo(() => {
    const series = activeSensors.map(labelOrKey => {
      // Find config where label or key matches
      const config = sensorConfigs.find(c => c.label === labelOrKey || c.key === labelOrKey);
      const dataKey = config ? config.key : labelOrKey;
      const color = config?.color || '#3b82f6';
      
      const filteredData = data[dataKey]?.filter(d => d.ts >= segment.start && d.ts <= segment.end) || [];
      
      return {
        name: config?.label || labelOrKey,
        type: 'line',
        symbol: 'circle',
        symbolSize: 4,
        showSymbol: false,
        smooth: 0.3,
        lineStyle: { width: 2 },
        itemStyle: { color: color },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: color + '22' },
            { offset: 1, color: color + '00' }
          ])
        },
        data: filteredData.map(d => [d.ts, d.value])
      };
    });

    return {
      backgroundColor: 'transparent',
      tooltip: { 
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 8,
        textStyle: { fontSize: 12 }
      },
      grid: { top: 40, left: 50, right: 30, bottom: 40, containLabel: true },
      xAxis: { 
        type: 'time',
        min: segment.start,
        max: segment.end,
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: { color: '#94a3b8', fontSize: 10 }
      },
      yAxis: { 
        type: 'value',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
        axisLabel: { color: '#94a3b8', fontSize: 10 }
      },
      series
    };
  }, [segment, data, sensorConfigs, activeSensors]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Data Segment Preview</h3>
            <p className="text-xs text-slate-500 font-medium">Class: <span className="text-primary-600 uppercase font-black">{segment.className}</span></p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6">
          <div className="bg-white rounded-xl p-2 border border-slate-100 shadow-inner">
            <ReactECharts 
              option={option} 
              style={{ height: '350px', width: '100%' }}
              notMerge={true}
            />
          </div>
          
          <div className="mt-6 flex justify-start items-center text-xs">
            <div className="flex gap-6 text-slate-500 font-medium">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase">Duration</span>
                <span>{((segment.end - segment.start) / 1000).toFixed(2)}s</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase">Sensors</span>
                <span>{segment.sensors.length} Active</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase">Data Points</span>
                <span>{option.series.reduce((acc, s) => acc + s.data.length, 0)} pts</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;
