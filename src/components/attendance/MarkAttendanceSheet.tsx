import React, { useEffect, useMemo, useState } from 'react';
import { Save, Search, RotateCcw, CheckCheck, Info, CalendarPlus, X } from 'lucide-react';
import { AttendanceRecord, AttendanceStatus, Employee, Holiday, Shift } from '../../types';
import { storageService } from '../../services/storageService';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { evaluateAttendanceStatus } from '../../utils/attendanceEngine';
import { TimeInput } from '../common/TimeInput';
import { Modal } from '../common/Modal';

type MarkStatus = AttendanceStatus | '';

interface RowState {
  status: MarkStatus;
  checkIn: string;
  checkOut: string;
  notes: string;
  dirty: boolean; // changed by the user
  auto: boolean; // defaulted to Present, not saved yet
}

interface Props {
  employees: Employee[];
  shifts: Shift[];
  attendance: AttendanceRecord[];
  departments: string[];
  onSaved: () => void;
}

// One button cycles Present -> Absent -> Leave -> Half Day -> Present.
const CYCLE: Record<string, AttendanceStatus> = {
  Present: 'Absent',
  Late: 'Absent',
  Absent: 'On Leave',
  'On Leave': 'Half Day',
  'Half Day': 'Present',
};

const STATUS_STYLE: Record<string, string> = {
  Present: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  Late: 'bg-amber-500 hover:bg-amber-600 text-white',
  'Half Day': 'bg-orange-500 hover:bg-orange-600 text-white',
  Absent: 'bg-rose-600 hover:bg-rose-700 text-white',
  'On Leave': 'bg-sky-600 hover:bg-sky-700 text-white',
  Holiday: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 hover:bg-violet-200',
  Weekend: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700',
};

const STATUS_LABEL: Record<string, string> = { 'On Leave': 'Leave' };

const TIMED: MarkStatus[] = ['Present', 'Late', 'Half Day'];

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const inputClass =
  'px-2 py-1 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-900 dark:text-neutral-100';

const labelClass = 'block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1';
const fieldClass =
  'w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100';

/** Evaluate times against the shift, ignoring weekend/holiday so manual marks on off-days still count hours. */
const evaluateTimes = (checkIn: string, checkOut: string, shift: Shift, date: string) =>
  evaluateAttendanceStatus(
    checkIn || undefined,
    checkOut || undefined,
    { ...shift, workingDays: [0, 1, 2, 3, 4, 5, 6] },
    date,
    [],
    false
  );

export const MarkAttendanceSheet: React.FC<Props> = ({
  employees,
  shifts,
  attendance,
  departments,
  onSaved,
}) => {
  const { user } = useAuth();
  const { success, warning } = useNotification();

  const today = localDate(new Date());
  const [date, setDate] = useState(today);
  const [dept, setDept] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const [holidays, setHolidays] = useState<Holiday[]>(() => storageService.getHolidays());
  const [holidayForm, setHolidayForm] = useState<{
    date: string;
    name: string;
    type: Holiday['type'];
    applyToAll: boolean;
  } | null>(null);
  const leaves = useMemo(() => storageService.getLeaves(), []);

  const activeEmployees = employees.filter((e) => e.status === 'Active');
  const shiftOf = (emp: Employee) => shifts.find((s) => s.id === emp.shiftId) || shifts[0];
  const holiday = holidays.find((h) => h.date === date);
  const dayOfWeek = new Date(date + 'T00:00:00').getDay();

  const existingFor = (empId: string) =>
    attendance.find((r) => r.employeeId === empId && r.date === date);

  // Load the sheet for the chosen date from saved records, approved leave, holidays and weekends.
  const buildInitialRows = () => {
    const next: Record<string, RowState> = {};
    activeEmployees.forEach((emp) => {
      const rec = existingFor(emp.id);
      if (rec) {
        next[emp.id] = {
          status: rec.status,
          checkIn: rec.checkIn?.slice(0, 5) || '',
          checkOut: rec.checkOut?.slice(0, 5) || '',
          notes: rec.notes || '',
          dirty: false,
          auto: false,
        };
        return;
      }
      const onLeave = leaves.some(
        (l) =>
          l.employeeId === emp.id && l.status === 'Approved' && l.fromDate <= date && l.toDate >= date
      );
      const shift = shiftOf(emp);
      if (onLeave || holiday || !shift.workingDays.includes(dayOfWeek)) {
        const status: MarkStatus = onLeave ? 'On Leave' : holiday ? 'Holiday' : 'Weekend';
        next[emp.id] = { status, checkIn: '', checkOut: '', notes: '', dirty: false, auto: true };
        return;
      }
      // Working day with no record yet: everyone is Present by default.
      next[emp.id] = {
        status: 'Present',
        checkIn: shift.startTime,
        checkOut: date === today ? '' : shift.endTime,
        notes: '',
        dirty: false,
        auto: true,
      };
    });
    return next;
  };

  useEffect(() => {
    setRows(buildInitialRows());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, attendance, employees, holidays]);

  const openHolidayForm = () =>
    setHolidayForm({ date, name: '', type: 'Company', applyToAll: true });

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayForm) return;
    const name = holidayForm.name.trim();
    if (!name) {
      warning('Name required', 'Enter the holiday name or reason.');
      return;
    }
    const others = storageService.getHolidays().filter((h) => h.date !== holidayForm.date);
    const updated = [
      ...others,
      { id: `hol-${Date.now()}`, name, date: holidayForm.date, type: holidayForm.type },
    ].sort((a, b) => a.date.localeCompare(b.date));
    storageService.saveHolidays(updated);

    if (holidayForm.applyToAll) {
      // Turn every saved record for that day into a Holiday so payroll and reports agree.
      const list = storageService.getAttendance().map((r) =>
        r.date === holidayForm.date
          ? {
              ...r,
              status: 'Holiday' as AttendanceStatus,
              checkIn: undefined,
              checkOut: undefined,
              workedMinutes: 0,
              overtimeMinutes: 0,
              modifiedBy: user?.name,
            }
          : r
      );
      storageService.saveAttendance(list);
    }

    setHolidays(updated);
    setDate(holidayForm.date);
    setHolidayForm(null);
    success('Holiday Marked', `${name} on ${holidayForm.date} added to the holiday calendar.`);
    onSaved();
  };

  const handleRemoveHoliday = () => {
    if (!holiday) return;
    if (!window.confirm(`Remove the holiday "${holiday.name}" on ${date}?`)) return;
    const updated = storageService.getHolidays().filter((h) => h.id !== holiday.id);
    storageService.saveHolidays(updated);
    // Drop the Holiday records for that day so it can be marked normally again.
    storageService.saveAttendance(
      storageService.getAttendance().filter((r) => !(r.date === date && r.status === 'Holiday'))
    );
    setHolidays(updated);
    success('Holiday Removed', `${holiday.name} removed from ${date}.`);
    onSaved();
  };

  const updateRow = (emp: Employee, patch: Partial<RowState>) => {
    setRows((prev) => {
      const cur = prev[emp.id];
      const next: RowState = { ...cur, ...patch, dirty: true };
      // Editing times re-derives Present / Late / Half Day from the shift rules.
      if (('checkIn' in patch || 'checkOut' in patch) && next.checkIn) {
        next.status = evaluateTimes(next.checkIn, next.checkOut, shiftOf(emp), date).status;
      }
      return { ...prev, [emp.id]: next };
    });
  };

  const addMinutes = (hhmm: string, mins: number) => {
    const [h, m] = hhmm.split(':').map(Number);
    const t = (h * 60 + m + mins) % (24 * 60);
    return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
  };

  const setStatus = (emp: Employee, status: AttendanceStatus) => {
    const cur = rows[emp.id];
    const shift = shiftOf(emp);
    const timed = TIMED.includes(status);
    if (status === 'Half Day') {
      // Half a shift: check out just under the half-day threshold after the shift start.
      const workedMins = Math.round(shift.halfDayThresholdHours * 60) - 30;
      setRows((prev) => ({
        ...prev,
        [emp.id]: {
          ...cur,
          status,
          checkIn: shift.startTime,
          checkOut: addMinutes(shift.startTime, workedMins + shift.breakDurationMinutes),
          dirty: true,
        },
      }));
      return;
    }
    if (status === 'Present') {
      setRows((prev) => ({
        ...prev,
        [emp.id]: {
          ...cur,
          status,
          checkIn: shift.startTime,
          checkOut: date === today ? '' : shift.endTime,
          dirty: true,
        },
      }));
      return;
    }
    setRows((prev) => ({
      ...prev,
      [emp.id]: {
        ...cur,
        status,
        checkIn: timed ? cur.checkIn || shift.startTime : '',
        checkOut: timed ? cur.checkOut || (date === today ? '' : shift.endTime) : '',
        dirty: true,
      },
    }));
  };

  const cycleStatus = (emp: Employee) => {
    const cur = rows[emp.id];
    setStatus(emp, CYCLE[cur.status] ?? 'Present');
  };

  const visible = activeEmployees
    .filter((e) => !dept || e.department === dept)
    .filter((e) => {
      const q = search.trim().toLowerCase();
      return !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q);
    });

  const markAllPresent = () => {
    setRows((prev) => {
      const next = { ...prev };
      visible.forEach((emp) => {
        const r = next[emp.id];
        if (!r || TIMED.includes(r.status)) return;
        const shift = shiftOf(emp);
        next[emp.id] = {
          ...r,
          status: 'Present',
          checkIn: shift.startTime,
          checkOut: date === today ? '' : shift.endTime,
          dirty: true,
        };
      });
      return next;
    });
  };

  const dirtyIds = Object.keys(rows).filter((id) => rows[id]?.dirty);
  // Unsaved defaults are saved too, but only offer "discard" / confirm for real edits.
  const saveIds = Object.keys(rows).filter(
    (id) => rows[id]?.dirty || (rows[id]?.auto && TIMED.includes(rows[id].status))
  );

  const handleSave = () => {
    const invalid = saveIds.filter((id) => {
      const r = rows[id];
      return TIMED.includes(r.status) && (!r.checkIn || (r.checkOut && r.checkOut <= r.checkIn));
    });
    if (invalid.length) {
      const names = invalid.map((id) => employees.find((e) => e.id === id)?.name).join(', ');
      warning('Check the times', `Check-in is missing or check-out is before check-in for: ${names}`);
      return;
    }

    const list = storageService.getAttendance();
    let saved = 0;
    saveIds.forEach((id) => {
      const r = rows[id];
      if (!r.status) return;
      const emp = employees.find((e) => e.id === id)!;
      const timed = TIMED.includes(r.status);
      const ev = timed ? evaluateTimes(r.checkIn, r.checkOut, shiftOf(emp), date) : undefined;
      const idx = list.findIndex((x) => x.employeeId === id && x.date === date);
      const record: AttendanceRecord = {
        ...(idx >= 0 ? list[idx] : {}),
        id: idx >= 0 ? list[idx].id : `att-${id}-${date}`,
        employeeId: id,
        date,
        checkIn: timed ? r.checkIn : undefined,
        checkOut: timed && r.checkOut ? r.checkOut : undefined,
        status: r.status,
        workedMinutes: ev?.workedMinutes ?? 0,
        overtimeMinutes: ev?.overtimeMinutes ?? 0,
        isEarlyDeparture: ev?.isEarlyDeparture ?? false,
        notes: r.notes || undefined,
        modifiedBy: user?.name,
      };
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      saved++;
    });

    storageService.saveAttendance(list);
    success('Attendance Saved', `Saved ${saved} record${saved === 1 ? '' : 's'} for ${date}.`);
    onSaved();
  };

  const counts = visible.reduce<Record<string, number>>((acc, e) => {
    const s = rows[e.id]?.status || 'Unmarked';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-500">Date:</span>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => {
                if (dirtyIds.length && !window.confirm('Discard unsaved attendance changes?')) return;
                setDate(e.target.value);
              }}
              className={`${inputClass} py-1.5 font-mono`}
            />
            {date !== today && (
              <button
                onClick={() => setDate(today)}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Today
              </button>
            )}
          </div>
          <select value={dept} onChange={(e) => setDept(e.target.value)} className={`${inputClass} py-1.5`}>
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee..."
              className={`${inputClass} py-1.5 w-full pl-8`}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">{dateLabel}</span>
            {holiday && (
              <span className="pl-2 pr-1 py-0.5 rounded bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 font-semibold inline-flex items-center gap-1">
                Holiday: {holiday.name}
                <button
                  onClick={handleRemoveHoliday}
                  title="Remove holiday"
                  className="p-0.5 rounded hover:bg-violet-200 dark:hover:bg-violet-900 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {Object.entries(counts).map(([s, n]) => (
              <span
                key={s}
                className={`px-2 py-0.5 rounded font-semibold ${
                  s === 'Unmarked'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                }`}
              >
                {s}: {n}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={openHolidayForm}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/60 flex items-center gap-1.5 cursor-pointer"
            >
              <CalendarPlus className="w-3.5 h-3.5" /> Mark Holiday
            </button>
            <button
              onClick={markAllPresent}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" /> Mark all Present
            </button>
          </div>
        </div>
      </div>

      {/* Sheet */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 font-semibold border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Check-In</th>
                <th className="py-3 px-4">Check-Out</th>
                <th className="py-3 px-4">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {visible.map((emp) => {
                const r = rows[emp.id];
                if (!r) return null;
                const shift = shiftOf(emp);
                const timed = TIMED.includes(r.status);
                const offDay = r.status === 'Holiday' || r.status === 'Weekend';
                return (
                  <tr
                    key={emp.id}
                    className={
                      r.dirty
                        ? 'bg-indigo-50/60 dark:bg-indigo-950/30'
                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40'
                    }
                  >
                    <td className="py-2.5 px-4">
                      <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {emp.name}
                        {r.dirty && <span className="ml-1.5 text-[10px] text-indigo-600 dark:text-indigo-400">● edited</span>}
                      </p>
                      <span className="text-[11px] text-neutral-400 font-mono">
                        {emp.id} · {shift.startTime}–{shift.endTime}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <button
                        onClick={() => cycleStatus(emp)}
                        title="Click to change: Present → Absent → Leave → Half Day"
                        className={`w-24 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer select-none ${
                          STATUS_STYLE[r.status] || STATUS_STYLE.Present
                        }`}
                      >
                        {STATUS_LABEL[r.status] || r.status || 'Present'}
                      </button>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1">
                        <TimeInput
                          value={r.checkIn}
                          disabled={!timed && r.status !== ''}
                          onChange={(v) => updateRow(emp, { checkIn: v })}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1">
                        <TimeInput
                          value={r.checkOut}
                          disabled={!timed}
                          onChange={(v) => updateRow(emp, { checkOut: v })}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <input
                        value={r.notes}
                        onChange={(e) =>
                          setRows((prev) => ({
                            ...prev,
                            [emp.id]: { ...r, notes: e.target.value, dirty: true },
                          }))
                        }
                        placeholder="Optional"
                        className={`${inputClass} w-full min-w-[120px]`}
                      />
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-neutral-400">
                    No active employees match the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur border border-neutral-200 dark:border-neutral-800 shadow-md">
        <p className="text-xs text-neutral-500 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" />
          {saveIds.length
            ? `${saveIds.length} record${saveIds.length === 1 ? '' : 's'} to save · click a status to cycle Present → Absent → Leave → Half Day`
            : 'All saved. Click a status to cycle Present → Absent → Leave → Half Day.'}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRows(buildInitialRows())}
            disabled={!dirtyIds.length}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Discard
          </button>
          <button
            onClick={handleSave}
            disabled={!saveIds.length}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" /> Save Attendance
          </button>
        </div>
      </div>

      {holidayForm && (
        <Modal
          isOpen
          onClose={() => setHolidayForm(null)}
          title="Mark Holiday"
          subtitle="Declare a paid day off. It is added to the Holidays calendar."
          maxWidth="md"
        >
          <form onSubmit={handleAddHoliday} className="space-y-4">
            <div>
              <label className={labelClass}>Holiday Name / Reason *</label>
              <input
                autoFocus
                value={holidayForm.name}
                onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                placeholder="e.g. Eid ul Adha, Office maintenance, Heavy rain"
                className={fieldClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Date *</label>
                <input
                  type="date"
                  required
                  value={holidayForm.date}
                  onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                  className={`${fieldClass} font-mono`}
                />
              </div>
              <div>
                <label className={labelClass}>Type</label>
                <select
                  value={holidayForm.type}
                  onChange={(e) =>
                    setHolidayForm({ ...holidayForm, type: e.target.value as Holiday['type'] })
                  }
                  className={fieldClass}
                >
                  <option value="Company">Company</option>
                  <option value="Public">Public</option>
                  <option value="Gazetted">Gazetted</option>
                  <option value="Optional">Optional</option>
                </select>
              </div>
            </div>
            {holidays.some((h) => h.date === holidayForm.date) && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {holidayForm.date} is already a holiday (
                {holidays.find((h) => h.date === holidayForm.date)?.name}). Saving will replace it.
              </p>
            )}
            <label className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={holidayForm.applyToAll}
                onChange={(e) => setHolidayForm({ ...holidayForm, applyToAll: e.target.checked })}
                className="mt-0.5"
              />
              <span>
                Also change attendance already saved for this day to <b>Holiday</b>
              </span>
            </label>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setHolidayForm(null)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <CalendarPlus className="w-3.5 h-3.5" /> Mark Holiday
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
