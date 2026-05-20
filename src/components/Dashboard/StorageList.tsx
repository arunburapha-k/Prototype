import React, { useMemo } from 'react';
import { Database, Trash2, Clock, Tag } from 'lucide-react';
import { format, isValid } from 'date-fns';

interface StorageSegment {
  id?: number;
  external_id: number;
  className: string;
  start: number;
  end: number;
  sensors: string[];
}

interface StorageListProps {
  segments: StorageSegment[];
  onClear: () => void;
  loading?: boolean;
}

const StorageList: React.FC<StorageListProps> = ({ segments, onClear, loading }) => {
  const groupedSegments = useMemo(() => {
    // 1. Group by base class
    const groups = segments.reduce((acc, seg) => {
      const base = seg.className.includes('_') 
        ? seg.className.split('_').slice(0, -1).join('_') 
        : seg.className;
      if (!acc[base]) acc[base] = [];
      acc[base].push(seg);
      return acc;
    }, {} as Record<string, typeof segments>);

    // 2. Convert to array and sort groups by the minimum ID in each group
    // This ensures the groups appear in the order they were first created
    return Object.entries(groups).sort((a, b) => {
      const minIdA = Math.min(...a[1].map(s => s.id || 0));
      const minIdB = Math.min(...b[1].map(s => s.id || 0));
      return minIdA - minIdB;
    });
  }, [segments]);

  if (loading && segments.length === 0) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-slate-100 rounded-xl border border-slate-50" />
        ))}
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
        <Database size={32} className="mb-2 opacity-20" />
        <p className="text-center text-[11px]">SQLite Storage is empty.<br/>Send segments to persist them.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SQLite Records ({segments.length})</span>
          {loading && <div className="w-3 h-3 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />}
        </div>
        <button 
          onClick={onClear}
          className="text-[10px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors"
        >
          <Trash2 size={12} /> Clear All
        </button>
      </div>
      
      <div className="max-h-[450px] overflow-y-auto pr-2 custom-scrollbar space-y-6">
        {groupedSegments.map(([groupName, groupSegments]) => (
          <div key={groupName} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                {groupName}
              </span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            
            <div className="space-y-2">
              {groupSegments.map((segment) => (
                <div key={segment.id} className="p-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:border-primary-200 transition-all group/item">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Tag size={12} className="text-primary-500" />
                    <span className="text-[11px] font-bold text-slate-700 truncate">
                      {segment.className}
                    </span>
                    <span className="ml-auto text-[9px] text-slate-400 font-mono bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 group-hover/item:border-primary-100 group-hover/item:text-primary-500 transition-colors">
                      ID: {segment.id}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <div className="flex items-center gap-1">
                      <Clock size={10} />
                      <span>{isValid(new Date(segment.start)) ? format(segment.start, 'HH:mm:ss') : 'N/A'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {segment.sensors.slice(0, 2).map(s => (
                        <span key={s} className="px-1 bg-slate-50 rounded text-[9px] border border-slate-100">{s}</span>
                      ))}
                      {segment.sensors.length > 2 && <span className="text-[9px] text-slate-400">+{segment.sensors.length - 2}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StorageList;
