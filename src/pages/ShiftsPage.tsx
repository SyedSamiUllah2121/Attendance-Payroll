import React, { useState } from 'react';
import { Clock, Plus, Users, Edit2, Shield } from 'lucide-react';
import { Shift, Employee } from '../types';
import { storageService } from '../services/storageService';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Modal } from '../components/common/Modal';

export const ShiftsPage: React.FC = () => {
  const { isHR } = useAuth();
  const { success, error } = useNotification();

  const [shifts, setShifts] = useState<Shift[]>(() => storageService.getShifts());
  const [employees] = useState<Employee[]>(() => storageService.getEmployees());

  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  const reloadShifts = () => {
    setShifts(storageService.getShifts());
  };

  const handleSaveShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift) return;

    const updated = shifts.map((s) => (s.id === editingShift.id ? editingShift : s));
    storageService.saveShifts(updated);
    success('Shift Updated', `Modified parameters for ${editingShift.name}`);
    reloadShifts();
    setEditingShift(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Work Shifts & Rosters
          </h1>
          <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Operating shifts, working hour standards, and break allocations
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {shifts.map((shift) => {
          const assignedCount = employees.filter((e) => e.shiftId === shift.id).length;

          return (
            <div
              key={shift.id}
              className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                    <Clock className="w-5 h-5" />
                  </div>
                  {isHR && (
                    <button
                      onClick={() => setEditingShift(shift)}
                      className="p-1.5 text-neutral-400 hover:text-indigo-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                      title="Edit Shift"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 mt-3">
                  {shift.name}
                </h3>
                <p className="text-xs font-mono font-medium text-neutral-600 dark:text-neutral-300 mt-1">
                  {shift.startTime} – {shift.endTime}
                </p>

                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 text-xs">
                  <div>
                    <span className="text-neutral-400">Duration</span>
                    <p className="font-mono font-semibold text-neutral-800 dark:text-neutral-200">
                      8.0 hrs
                    </p>
                  </div>
                  <div>
                    <span className="text-neutral-400">Meal Break</span>
                    <p className="font-mono font-semibold text-neutral-800 dark:text-neutral-200">
                      {shift.breakDurationMinutes} mins
                    </p>
                  </div>
                  <div>
                    <span className="text-neutral-400">Grace Allowance</span>
                    <p className="font-mono font-semibold text-neutral-800 dark:text-neutral-200">
                      {shift.gracePeriodMinutes} mins
                    </p>
                  </div>
                  <div>
                    <span className="text-neutral-400">Staff Assigned</span>
                    <p className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                      {assignedCount} employees
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
                <span className="font-mono text-[11px]">{shift.id}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600">
                  Active Shift
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {editingShift && (
        <Modal
          isOpen={Boolean(editingShift)}
          onClose={() => setEditingShift(null)}
          title={`Edit Shift: ${editingShift.name}`}
          subtitle="Configure shift start, end, and duration parameters"
          maxWidth="sm"
        >
          <form onSubmit={handleSaveShift} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Shift Name *
              </label>
              <input
                type="text"
                required
                value={editingShift.name}
                onChange={(e) =>
                  setEditingShift({ ...editingShift, name: e.target.value })
                }
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Start Time *
                </label>
                <input
                  type="time"
                  required
                  value={editingShift.startTime}
                  onChange={(e) =>
                    setEditingShift({ ...editingShift, startTime: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  End Time *
                </label>
                <input
                  type="time"
                  required
                  value={editingShift.endTime}
                  onChange={(e) =>
                    setEditingShift({ ...editingShift, endTime: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Grace Time (Mins)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={editingShift.gracePeriodMinutes}
                  onChange={(e) =>
                    setEditingShift({
                      ...editingShift,
                      gracePeriodMinutes: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Break Duration (Mins)
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={editingShift.breakDurationMinutes}
                  onChange={(e) =>
                    setEditingShift({
                      ...editingShift,
                      breakDurationMinutes: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setEditingShift(null)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
              >
                Save Shift
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
