import React from 'react';
import { Activity, User } from 'lucide-react';

interface HeaderProps {
  deviceId: string;
  deviceName?: string;
}

const Header: React.FC<HeaderProps> = ({ deviceId, deviceName }) => {
  return (
    <header className="bg-white border-b border-slate-100 px-6 py-4 flex justify-between items-center sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="bg-primary-600 p-2 rounded-lg text-white">
          <Activity size={24} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            {deviceName || 'SensorSlice Hub'}
            <span className="text-[10px] font-normal bg-slate-50 text-slate-400 px-1.5 py-0.5 rounded border border-slate-100">v2.3</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium truncate max-w-[300px]">
            ID: <span className="text-primary-600 font-mono">{deviceId}</span>
          </p>
        </div>
      </div>
...
      <div className="flex items-center gap-4">
        <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
          <User size={20} />
        </button>
      </div>
    </header>
  );
};

export default Header;
