import React from 'react';
import { Filter, ChevronDown, Activity, Edit2, Check, Loader2, Search } from 'lucide-react';
import type { SensorConfig } from '../../types/index';

interface ChartHeaderProps {
  startDate: string;
  endDate: string;
  isRealtime: boolean;
  onStartDateChange: (val: string) => void;
  onEndDateChange: (val: string) => void;
  onRealtimeToggle: (val: boolean) => void;
  sensorConfigs: SensorConfig[];
  onUpdateConfig: (configs: SensorConfig[]) => void;
  onForecast: (days: number) => void;
  forecastHorizon?: number | null;
  forecastLoadingDays?: number | null;
  isForecastLoading?: boolean;
  onCrop: () => void;
  isCropping: boolean;
  onMagnify: () => void;
  isMagnifying: boolean;
}

const ChartHeader: React.FC<ChartHeaderProps> = ({
  startDate,
  endDate,
  isRealtime,
  onStartDateChange,
  onEndDateChange,
  onRealtimeToggle,
  sensorConfigs,
  onUpdateConfig,
  onForecast,
  forecastHorizon,
  forecastLoadingDays = null,
  isForecastLoading = false,
  onCrop,
  isCropping,
  onMagnify,
  isMagnifying
}) => {
  const [isDropdownOpen, setDropdownOpen] = React.useState(false);
  const [editingKey, setEditingKey] = React.useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6 relative z-30">
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
        <div className="relative">
          <button 
            onClick={() => setDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded-lg transition-all"
          >
            <Filter size={14} className="text-primary-600" />
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Sensors</span>
            <ChevronDown size={12} className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && (
            <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-100 rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="space-y-3">
                {sensorConfigs.map((config) => (
                  <div key={config.key} className="flex items-center gap-3 group">
                    <input 
                      type="checkbox"
                      checked={config.visible}
                      onChange={() => onUpdateConfig(sensorConfigs.map(c => c.key === config.key ? { ...c, visible: !c.visible } : c))}
                      className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      {editingKey === config.key ? (
                        <div className="flex items-center gap-1">
                          <input 
                            autoFocus
                            className="text-[11px] font-bold px-2 py-0.5 rounded border border-primary-300 focus:ring-1 focus:ring-primary-500 outline-none w-full"
                            value={config.label}
                            onChange={(e) => onUpdateConfig(sensorConfigs.map(c => c.key === config.key ? { ...c, label: e.target.value } : c))}
                            onKeyDown={(e) => e.key === 'Enter' && setEditingKey(null)}
                          />
                          <button onClick={() => setEditingKey(null)} className="text-green-600 p-0.5"><Check size={14} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between group">
                          <span className="text-[11px] font-bold text-slate-700 truncate">{config.label}</span>
                          <button onClick={() => { setEditingKey(config.key); setDropdownOpen(true); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-primary-600"><Edit2 size={12} /></button>
                        </div>
                      )}
                    </div>
                    <div className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: config.color }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-slate-100 mx-2" />

        <div className="flex items-center gap-2">
          <input 
            type="date" 
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="bg-transparent text-[10px] font-bold text-slate-700 outline-none cursor-pointer hover:text-primary-600 transition-colors"
          />
          <span className="text-slate-300 font-bold">→</span>
          <input 
            type="date" 
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="bg-transparent text-[10px] font-bold text-slate-700 outline-none cursor-pointer hover:text-primary-600 transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-100 pr-2 mr-1">Forecast</span>
        <div className="flex items-center gap-1">
          {[5, 10, 15, 20].map(days => {
            const isActive = forecastHorizon === days;
            const isLoading = forecastLoadingDays === days;

            return (
              <button
                key={days}
                onClick={() => onForecast(days)}
                disabled={isForecastLoading}
                className={`flex h-5 min-w-[2.7rem] items-center justify-center rounded-lg border px-2 py-0.5 text-[10px] font-bold transition-all active:scale-95 disabled:cursor-wait disabled:opacity-75 ${
                  isActive
                    ? 'border-primary-100 bg-primary-50 text-primary-600'
                    : 'border-transparent text-slate-500 hover:border-primary-100 hover:bg-primary-50 hover:text-primary-600'
                }`}
              >
                {isLoading ? (
                  <span className="inline-flex items-center justify-center gap-1">
                    <Loader2 size={11} className="animate-spin" />
                    {days}D
                  </span>
                ) : (
                  `${days}D`
                )}
              </button>
            );
          })}
          <div className="w-px h-3 bg-slate-100 mx-1" />
          <button
            onClick={() => onForecast(0)}
            className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-red-400 hover:bg-red-50 hover:text-red-500 transition-all border border-transparent hover:border-red-100 active:scale-95"
          >
            CLEAR
          </button>
        </div>
      </div>

      <button 
        onClick={() => onRealtimeToggle(!isRealtime)}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all border ${
          isRealtime 
          ? 'bg-blue-50 text-primary-600 border-primary-200 shadow-lg shadow-blue-50' 
          : 'bg-slate-50 text-slate-400 border-slate-200'
        }`}
      >
        <Activity size={14} className={isRealtime ? 'animate-pulse' : ''} />
        {isRealtime ? 'REAL-TIME' : 'STATIC-VIEW'}
      </button>

      <button 
        onClick={onCrop}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all shadow-sm active:scale-95 border ${
          isCropping 
          ? 'bg-emerald-500 text-white border-emerald-400 shadow-emerald-100' 
          : 'bg-white text-slate-600 border-slate-200 hover:text-primary-600 hover:border-primary-100'
        }`}
      >
        {isCropping ? <Check size={14} /> : <Edit2 size={14} />}
        {isCropping ? 'CROP MODE' : 'SELECT RANGE'}
      </button>

      <button 
        onClick={onMagnify}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all shadow-sm active:scale-95 border ${
          isMagnifying 
          ? 'bg-indigo-500 text-white border-indigo-400 shadow-indigo-100' 
          : 'bg-white text-slate-600 border-slate-200 hover:text-primary-600 hover:border-primary-100'
        }`}
      >
        {isMagnifying ? <Check size={14} /> : <Search size={14} />}
        {isMagnifying ? 'MAGNIFYING' : 'AI CLASSIFY'}
      </button>
    </div>
  );
};

export default ChartHeader;
