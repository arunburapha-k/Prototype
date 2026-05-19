import React, { useState } from 'react';
import { Eye, Edit3, Trash2, Database, Check, X } from 'lucide-react';
import { format, isValid } from 'date-fns';
import type { CroppedSegment } from '../../types/index';
import DeleteConfirmModal from '../Modals/DeleteConfirmModal';

interface CroppedListProps {
  segments: CroppedSegment[];
  onDelete: (id: number) => void;
  onUpdate: (segment: CroppedSegment) => void;
  onPreview: (segment: CroppedSegment) => void;
}

const CroppedList: React.FC<CroppedListProps> = ({ segments, onDelete, onUpdate, onPreview }) => {

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const handleStartEdit = (segment: CroppedSegment) => {
    setEditingId(segment.id);
    setEditValue(segment.className);
  };

  const handleSaveEdit = (segment: CroppedSegment) => {
    if (editValue.trim()) {
      onUpdate({ ...segment, className: editValue.trim() });
    }
    setEditingId(null);
  };

  const handleDeleteClick = (id: number) => {
    setConfirmDeleteId(id);
  };

  const handleConfirmDelete = () => {
    if (confirmDeleteId !== null) {
      onDelete(confirmDeleteId);
      setConfirmDeleteId(null);
    }
  };

  const segmentToDelete = segments.find(s => s.id === confirmDeleteId);

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <Database size={48} className="mb-4 opacity-20" />
        <p className="text-center text-sm">No data segments saved yet.<br/>Use the chart brush tool to crop segments.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
      {segments.map((segment) => (
        <div key={segment.id} className="p-4 border border-slate-100 rounded-xl bg-slate-50 hover:bg-white hover:shadow-md transition-all group">
          <div className="flex justify-between items-start mb-2">
            {editingId === segment.id ? (
              <div className="flex items-center gap-1 w-full mr-2">
                <input 
                  autoFocus
                  className="text-[10px] font-bold px-2 py-0.5 rounded border border-primary-300 focus:ring-1 focus:ring-primary-500 outline-none w-full"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(segment)}
                />
                <button onClick={() => handleSaveEdit(segment)} className="text-green-600 hover:text-green-700 p-0.5"><Check size={14} /></button>
                <button onClick={() => setEditingId(null)} className="text-red-500 hover:text-red-600 p-0.5"><X size={14} /></button>
              </div>
            ) : (
              <span className="bg-primary-100 text-primary-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider truncate max-w-[150px]">
                {segment.className}
              </span>
            )}
            
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button 
                onClick={() => onPreview(segment)}
                className="p-1.5 text-slate-400 hover:text-primary-600 transition-colors"
                title="Preview segment chart"
              >
                <Eye size={16} />
              </button>
              <button 
                onClick={() => handleStartEdit(segment)}
                className="p-1.5 text-slate-400 hover:text-primary-600 transition-colors"
                title="Edit class name"
              >
                <Edit3 size={16} />
              </button>
              <button 
                onClick={() => handleDeleteClick(segment.id)} 
                className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                title="Delete segment"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          
          <div className="text-[11px] text-slate-500 space-y-1">
            <div className="flex justify-between">
              <span>Start:</span>
              <span className="font-medium text-slate-700">
                {isValid(new Date(segment.start)) ? format(segment.start, 'HH:mm:ss.SSS') : 'Invalid Time'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>End:</span>
              <span className="font-medium text-slate-700">
                {isValid(new Date(segment.end)) ? format(segment.end, 'HH:mm:ss.SSS') : 'Invalid Time'}
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-200">
              <div className="flex flex-wrap gap-1 mt-1">
                {segment.sensors.map(s => (
                  <span key={s} className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-600 font-medium text-[9px]">{s}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}

      {confirmDeleteId !== null && segmentToDelete && (
        <DeleteConfirmModal 
          className={segmentToDelete.className}
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
};

export default CroppedList;
