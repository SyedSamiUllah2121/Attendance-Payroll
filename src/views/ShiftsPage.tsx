import React, { useState } from 'react';
import { Clock, Plus, Edit2, Trash2, AlertTriangle } from 'lucide-react';
import { Shift, Employee } from '../types';
import { storageService } from '../services/storageService';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Modal } from '../components/common/Modal';
import { TimeInput, formatTime12 } from '../components/common/TimeInput';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const inputClass =
  'w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100';
const labelClass = 'block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1';

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Paid working hours: end − start (handles overnight shifts) minus the break. */
const shiftHours = (s: Pick<Shift, 'startTime' | 'endTime' | 'breakDurationMinutes'>) => {
  if (!s.startTime || !s.endTime) return 0;
  let span = toMinutes(s.endTime) - toMinutes(s.startTime);
  if (span <= 0) span += 24 * 60;
  return Math.max(0, span - (s.breakDurationMinutes || 0)) / 60;
};

const newShiftTemplate = (): Shift => ({
  id: '',
  name: '',
  startTime: '09:00',
  endTime: '18:00',
  breakDurationMinutes: 60,
  gracePeriodMinutes: 15,
  halfDayThresholdHours: 4.5,
  workingDays: [1, 2, 3, 4, 5],
});

const makeShiftId = (name: string, existing: Shift[]) => {
  const base =
    'shift-' +
    (name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'custom');
  let id = base;
  for (let n = 2; existing.some((s) => s.id === id); n++) id = `${base}-${n}`;
  return id;
};

export const ShiftsPage: React.FC = () => {
  const { can } = useAuth();
  const canManage = can('shifts.manage');
  const { success, error } = useNotification();

  const [shifts, setShifts] = useState<Shift[]>(() => storageService.getShifts());
  const [employees, setEmployees] = useState<Employee[]>(() => storageService.getEmployees());

  // Add / edit form: isNew distinguishes "Add Shift" from editing an existing one
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Delete flow: staff on the deleted shift are moved to reassignTo
  const [deletingShift, setDeletingShift] = useState<Shift | null>(null);
  const [reassignTo, setReassignTo] = useState('');

  const reload = () => {
    setShifts(storageService.getShifts());
    setEmployees(storageService.getEmployees());
  };

  const openAdd = () => {
    setIsNew(true);
    setEditingShift(newShiftTemplate());
  };

  const openEdit = (shift: Shift) => {
    setIsNew(false);
    setEditingShift({ ...shift, workingDays: [...shift.workingDays] });
  };

  const toggleDay = (day: number) => {
    if (!editingShift) return;
    const days = editingShift.workingDays.includes(day)
      ? editingShift.workingDays.filter((d) => d !== day)
      : [...editingShift.workingDays, day].sort();
    setEditingShift({ ...editingShift, workingDays: days });
  };

  const handleSaveShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift) return;
    const name = editingShift.name.trim();
    if (!name) {
      error('Name required', 'Please give the shift a name.');
      return;
    }
    if (!editingShift.startTime || !editingShift.endTime) {
      error('Times required', 'Please set both a start and an end time.');
      return;
    }
    if (editingShift.startTime === editingShift.endTime) {
      error('Invalid times', 'Start and end time cannot be the same.');
      return;
    }
    if (editingShift.workingDays.length === 0) {
      error('Working days required', 'Select at least one working day.');
      return;
    }
    if (shifts.some((s) => s.name.toLowerCase() === name.toLowerCase() && s.id !== editingShift.id)) {
      error('Duplicate name', `A shift called "${name}" already exists.`);
      return;
    }

    const shift: Shift = {
      ...editingShift,
      name,
      workingHours: shiftHours(editingShift),
      id: isNew ? makeShiftId(name, shifts) : editingShift.id,
    };
    const updated = isNew ? [...shifts, shift] : shifts.map((s) => (s.id === shift.id ? shift : s));
    storageService.saveShifts(updated);
    success(isNew ? 'Shift Added' : 'Shift Updated', `${name} (${formatTime12(shift.startTime)} – ${formatTime12(shift.endTime)})`);
    reload();
    setEditingShift(null);
  };

  const openDelete = (shift: Shift) => {
    if (shifts.length <= 1) {
      error('Cannot delete', 'At least one shift is required.');
      return;
    }
    setDeletingShift(shift);
    setReassignTo(shifts.find((s) => s.id !== shift.id)?.id || '');
  };

  const assignedTo = (shiftId: string) => employees.filter((e) => e.shiftId === shiftId);

  const handleConfirmDelete = () => {
    if (!deletingShift) return;
    const affected = assignedTo(deletingShift.id);
    if (affected.length && !reassignTo) {
      error('Choose a shift', 'Select where to move the assigned employees.');
      return;
    }
    if (affected.length) {
      storageService.saveEmployees(
        employees.map((e) => (e.shiftId === deletingShift.id ? { ...e, shiftId: reassignTo } : e))
      );
    }
    storageService.saveShifts(shifts.filter((s) => s.id !== deletingShift.id));
    const target = shifts.find((s) => s.id === reassignTo);
    success(
      'Shift Deleted',
      affected.length
        ? `${deletingShift.name} removed · ${affected.length} employee${affected.length === 1 ? '' : 's'} moved to ${target?.name}`
        : `${deletingShift.name} removed`
    );
    reload();
    setDeletingShift(null);
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
        {canManage && (
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 self-start sm:self-auto transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Shift
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {shifts.map((shift) => {
          const assignedCount = assignedTo(shift.id).length;

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
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(shift)}
                        className="p-1.5 text-neutral-400 hover:text-indigo-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                        title="Edit Shift"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openDelete(shift)}
                        className="p-1.5 text-neutral-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Delete Shift"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 mt-3">
                  {shift.name}
                </h3>
                <p className="text-xs font-mono font-medium text-neutral-600 dark:text-neutral-300 mt-1">
                  {formatTime12(shift.startTime)} – {formatTime12(shift.endTime)}
                </p>

                <div className="flex gap-1 mt-3">
                  {DAY_LABELS.map((d, i) => (
                    <span
                      key={d}
                      className={`w-8 py-0.5 rounded text-center text-[10px] font-semibold ${
                        shift.workingDays.includes(i)
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                          : 'bg-neutral-50 dark:bg-neutral-800/60 text-neutral-400'
                      }`}
                    >
                      {d}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 text-xs">
                  <div>
                    <span className="text-neutral-400">Duration</span>
                    <p className="font-mono font-semibold text-neutral-800 dark:text-neutral-200">
                      {shiftHours(shift).toFixed(1)} hrs
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
                      {assignedCount} employee{assignedCount === 1 ? '' : 's'}
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

      {/* Add / Edit shift */}
      {editingShift && (
        <Modal
          isOpen
          onClose={() => setEditingShift(null)}
          title={isNew ? 'Add New Shift' : `Edit Shift: ${editingShift.name}`}
          subtitle="Set the shift timings, break, grace period and working days"
          maxWidth="md"
        >
          <form onSubmit={handleSaveShift} className="space-y-4">
            <div>
              <label className={labelClass}>Shift Name *</label>
              <input
                type="text"
                autoFocus={isNew}
                value={editingShift.name}
                onChange={(e) => setEditingShift({ ...editingShift, name: e.target.value })}
                placeholder="e.g. Night Shift, Ramadan Timings"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Start Time *</label>
                <TimeInput
                  value={editingShift.startTime}
                  onChange={(v) => setEditingShift({ ...editingShift, startTime: v })}
                />
              </div>
              <div>
                <label className={labelClass}>End Time *</label>
                <TimeInput
                  value={editingShift.endTime}
                  onChange={(v) => setEditingShift({ ...editingShift, endTime: v })}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Working Days *</label>
              <div className="flex flex-wrap gap-1.5">
                {DAY_LABELS.map((d, i) => {
                  const on = editingShift.workingDays.includes(i);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`w-11 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        on
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white dark:bg-neutral-900 text-neutral-500 border-neutral-200 dark:border-neutral-700 hover:border-indigo-300'
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Break (mins)</label>
                <input
                  type="number"
                  min="0"
                  max="180"
                  value={editingShift.breakDurationMinutes}
                  onChange={(e) =>
                    setEditingShift({
                      ...editingShift,
                      breakDurationMinutes: Math.max(0, parseInt(e.target.value) || 0),
                    })
                  }
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div>
                <label className={labelClass}>Grace (mins)</label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={editingShift.gracePeriodMinutes}
                  onChange={(e) =>
                    setEditingShift({
                      ...editingShift,
                      gracePeriodMinutes: Math.max(0, parseInt(e.target.value) || 0),
                    })
                  }
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div>
                <label className={labelClass}>Half day below (hrs)</label>
                <input
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  value={editingShift.halfDayThresholdHours}
                  onChange={(e) =>
                    setEditingShift({
                      ...editingShift,
                      halfDayThresholdHours: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className={`${inputClass} font-mono`}
                />
              </div>
            </div>

            <p className="text-[11px] text-neutral-500">
              Paid hours: <span className="font-mono font-semibold">{shiftHours(editingShift).toFixed(1)} hrs</span>{' '}
              per day · Late after{' '}
              <span className="font-mono font-semibold">
                {editingShift.startTime
                  ? formatTime12(
                      (() => {
                        const t = toMinutes(editingShift.startTime) + editingShift.gracePeriodMinutes;
                        return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
                      })()
                    )
                  : '—'}
              </span>
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingShift(null)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs cursor-pointer"
              >
                {isNew ? 'Add Shift' : 'Save Shift'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete shift */}
      {deletingShift && (
        <Modal
          isOpen
          onClose={() => setDeletingShift(null)}
          title={`Delete ${deletingShift.name}?`}
          subtitle="This removes the shift permanently."
          maxWidth="md"
        >
          {(() => {
            const affected = assignedTo(deletingShift.id);
            return (
              <div className="space-y-4">
                {affected.length > 0 ? (
                  <>
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        {affected.length} employee{affected.length === 1 ? ' is' : 's are'} on this shift:{' '}
                        <b>{affected.map((e) => e.name).join(', ')}</b>. Choose a shift to move them to.
                      </span>
                    </div>
                    <div>
                      <label className={labelClass}>Move employees to *</label>
                      <select
                        value={reassignTo}
                        onChange={(e) => setReassignTo(e.target.value)}
                        className={inputClass}
                      >
                        {shifts
                          .filter((s) => s.id !== deletingShift.id)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({formatTime12(s.startTime)} – {formatTime12(s.endTime)})
                            </option>
                          ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-neutral-600 dark:text-neutral-300">
                    No employees are assigned to this shift. Past attendance records are not affected.
                  </p>
                )}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeletingShift(null)}
                    className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {affected.length ? 'Move & Delete' : 'Delete Shift'}
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
};
