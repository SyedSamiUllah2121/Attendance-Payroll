import React, { useState } from 'react';
import { Calendar, Plus, Trash2, CalendarDays, CheckCircle } from 'lucide-react';
import { Holiday } from '../types';
import { storageService } from '../services/storageService';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Modal } from '../components/common/Modal';

export const HolidaysPage: React.FC = () => {
  const { can } = useAuth();
  const canManage = can('holidays.manage');
  const { success, error } = useNotification();

  const [holidays, setHolidays] = useState<Holiday[]>(() => storageService.getHolidays());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    date: '2026-11-09',
    type: 'Gazetted' as 'Gazetted' | 'Optional',
    description: '',
  });

  const reloadHolidays = () => {
    setHolidays(storageService.getHolidays());
  };

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      error('Name required', 'Please specify the holiday title.');
      return;
    }

    const newH: Holiday = {
      id: `hol-${Date.now()}`,
      name: form.name,
      date: form.date,
      type: form.type,
      description: form.description,
    };

    const updated = [...holidays, newH].sort((a, b) => a.date.localeCompare(b.date));
    storageService.saveHolidays(updated);
    success('Holiday Added', `${form.name} added to company calendar.`);
    reloadHolidays();
    setIsAddModalOpen(false);
  };

  const handleDeleteHoliday = (id: string) => {
    const updated = holidays.filter((h) => h.id !== id);
    storageService.saveHolidays(updated);
    success('Holiday Removed', 'Holiday deleted from calendar.');
    reloadHolidays();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Company & Gazetted Holidays
          </h1>
          <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Official paid non-working days for 2026 (exempt from absenteeism calculations)
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 self-start sm:self-auto transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Holiday
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {holidays.map((h) => {
          const d = new Date(h.date + 'T00:00:00');
          const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
          const monthYear = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

          return (
            <div
              key={h.id}
              className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex items-start justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    {h.name}
                  </h4>
                  <p className="text-xs text-neutral-500 font-mono mt-0.5">
                    {monthYear} · {dayName}
                  </p>
                  {h.description && (
                    <p className="text-xs text-neutral-400 mt-1">{h.description}</p>
                  )}
                  <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                    {h.type}
                  </span>
                </div>
              </div>

              {canManage && (
                <button
                  onClick={() => handleDeleteHoliday(h.id)}
                  className="p-1 text-neutral-400 hover:text-rose-600 transition-colors"
                  title="Delete Holiday"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isAddModalOpen && (
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="Add New Holiday"
          subtitle="Declare a paid non-working holiday for the company"
          maxWidth="sm"
        >
          <form onSubmit={handleAddHoliday} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Holiday Name *
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Iqbal Day"
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Holiday Date *
              </label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Holiday Type
              </label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as 'Gazetted' | 'Optional' })
                }
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              >
                <option value="Gazetted">Gazetted (Mandatory Paid)</option>
                <option value="Optional">Optional (Religious/Festival)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Notes
              </label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional notes or details..."
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
              >
                Add Holiday
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
