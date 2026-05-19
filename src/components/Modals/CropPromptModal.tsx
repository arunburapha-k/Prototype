import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, Tag } from 'lucide-react';

interface CropPromptModalProps {
  range: [number, number];
  existingClasses: string[];
  onClose: () => void;
  onConfirm: (className: string) => void;
}

const CropPromptModal: React.FC<CropPromptModalProps> = ({ range, existingClasses = [], onClose, onConfirm }) => {
  const [className, setClassName] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredClasses = existingClasses.filter(c => 
    c.toLowerCase().includes(className.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">Save Data Segment</h3>
            <p className="text-xs text-slate-400 font-medium">Classify this data for AI training</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="space-y-6">
          <div className="relative" ref={dropdownRef}>
            <div className="flex justify-between items-end mb-2 px-1">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Class Name
              </label>
              {existingClasses.length > 0 && (
                <span className="text-[9px] font-bold text-primary-500 uppercase tracking-tight">
                  {existingClasses.length} existing found
                </span>
              )}
            </div>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors">
                <Tag size={18} />
              </div>
              <input 
                type="text"
                autoFocus
                placeholder="Select or type class name..."
                className="w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-primary-50 focus:border-primary-500 focus:bg-white outline-none transition-all font-bold text-slate-700"
                value={className}
                onFocus={() => setShowDropdown(true)}
                onChange={(e) => {
                  setClassName(e.target.value);
                  setShowDropdown(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && className) {
                    onConfirm(className);
                  }
                }}
              />
              <button 
                onClick={() => setShowDropdown(!showDropdown)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
              >
                <ChevronDown size={20} className={`transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {showDropdown && filteredClasses.length > 0 && (
              <div className="absolute z-10 w-full mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="max-h-[200px] overflow-y-auto py-2">
                  <p className="px-4 py-1 text-[10px] font-black text-slate-300 uppercase tracking-widest">Suggestions</p>
                  {filteredClasses.map((c, i) => (
                    <button
                      key={i}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm font-bold text-slate-700 transition-colors border-l-4 border-transparent hover:border-primary-500"
                      onClick={() => {
                        setClassName(c);
                        setShowDropdown(false);
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {existingClasses.length > 0 && !showDropdown && (
              <div className="mt-3">
                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-2 px-1">Quick Select</p>
                <div className="flex flex-wrap gap-1.5">
                  {existingClasses.slice(0, 8).map((c, i) => (
                    <button
                      key={i}
                      onClick={() => setClassName(c)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border ${
                        className === c 
                          ? 'bg-primary-50 border-primary-200 text-primary-700 shadow-sm' 
                          : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selected Time Range</p>
            </div>
            <div className="space-y-1 pl-3.5">
              <p className="text-xs font-bold text-slate-600 font-mono">{new Date(range[0]).toLocaleString()}</p>
              <div className="w-px h-2 bg-slate-200 ml-2" />
              <p className="text-xs font-bold text-slate-600 font-mono">{new Date(range[1]).toLocaleString()}</p>
            </div>
          </div>
          
          <div className="flex gap-4 pt-2">
            <button 
              onClick={onClose}
              className="flex-1 px-6 py-3.5 rounded-2xl font-black text-[10px] tracking-widest uppercase text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-all active:scale-[0.98]"
            >
              Cancel
            </button>
            <button 
              disabled={!className}
              onClick={() => onConfirm(className)}
              className="flex-1 px-6 py-3.5 rounded-2xl font-black text-[10px] tracking-widest uppercase text-white bg-primary-600 hover:bg-primary-700 shadow-xl shadow-primary-100 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              Save Segment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CropPromptModal;
