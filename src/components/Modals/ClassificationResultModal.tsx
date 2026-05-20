import React from 'react';
import { X, Brain, Target, Percent } from 'lucide-react';

interface ClassificationResultModalProps {
  className: string;
  confidence: number;
  onClose: () => void;
}

const ClassificationResultModal: React.FC<ClassificationResultModalProps> = ({
  className,
  confidence,
  onClose
}) => {
  const confidencePercent = (confidence * 100).toFixed(2);
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary-50 rounded-2xl text-primary-600 shadow-sm">
                <Brain size={24} />
              </div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">AI Classification</h3>
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-2 bg-white rounded-xl text-emerald-500 shadow-sm border border-slate-100">
                  <Target size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Predicted Class</p>
                  <p className="text-2xl font-black text-slate-800">{className}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="p-2 bg-white rounded-xl text-blue-500 shadow-sm border border-slate-100">
                  <Percent size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Confidence Level</p>
                  <div className="flex items-center gap-3">
                    <p className="text-2xl font-black text-slate-800">{confidencePercent}%</p>
                    <div className="flex-1 h-2 w-24 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${confidencePercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black tracking-[0.2em] rounded-2xl shadow-xl shadow-slate-200 transition-all active:scale-[0.98] uppercase"
            >
              Close Result
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClassificationResultModal;
