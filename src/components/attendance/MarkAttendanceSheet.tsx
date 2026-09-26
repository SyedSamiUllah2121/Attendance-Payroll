import React, { useEffect, useMemo, useState } from 'react';
import { Save, Search, RotateCcw, Clock, CheckCheck, UserX, Info } from 'lucide-react';
import { AttendanceRecord, AttendanceStatus, Employee, Shift } from '../../types';
import { storageService } from '../../services/storageService';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { evaluateAttendanceStatus } from '../../utils/attendanceEngine';

type MarkStatus = AttendanceStatus | '';

interface RowState {
  status: MarkStatus;
  checkIn: string;
  checkOut: string;
  notes: string;
  dirty: boolean;
}

interface Props {
  employees: Employee[];
  shifts: Shift[];
  attendance: AttendanceRecord[];
  departments: string[];
  onSaved: () => void;
}

const STATUS_BUTTONS: { status: AttendanceStatus; short: string; cls: string }[] = [
  { status: 'Present', short: 'P', cls: 'bg-emerald-600 text-white border-emerald-600' },
  { status: 'Late', short: 'L', cls: 'bg-amber-500 text-white border-amber-500' },
  { status: 'Half Day', short: 'HD', cls: 'bg-orange-500 text-white border-orange-500' },
  { status: 'Absent', short: 'A', cls: 'bg-rose-600 text-white border-rose-600' },
  { status: 'On Leave', short: 'LV', cls: 'bg-sky-600 text-white border-sky-600' },
];

const TIMED: MarkStatus[] = ['Present', 'Late', 'Half Day'];

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const inputClass =
  'px-2 py-1 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-900 dark:text-neutral-100';

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

  const holidays = useMemo(() => storageService.getHolidays(), []);
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
        };
        return;
      }
      const onLeave = leaves.some(
        (l) =>
          l.employeeId === emp.id && l.status === 'Approved' && l.fromDate <= date && l.toDate >= date
      );
      let status: MarkStatus = '';
      if (onLeave) status = 'On Leave';
      else if (holiday) status = 'Holiday';
      else if (!shiftOf(emp).workingDays.includes(dayOfWeek)) status = 'Weekend';
      next[emp.id] = { status, checkIn: '', checkOut: '', notes: '', dirty: false };
    });
    return next;
  };

  useEffect(() => {
    setRows(buildInitialRows());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, attendance, employees]);

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

  const setStatus = (emp: Employee, status: AttendanceStatus) => {
    const cur = rows[emp.id];
    const shift = shiftOf(emp);
    if (TIMED.includes(status)) {
      setRows((prev) => ({
        ...prev,
        [emp.id]: {
          ...cur,
          status,
          checkIn: cur.checkIn || shift.startTime,
          checkOut: cur.checkOut || (date === today ? '' : shift.endTime),
          dirty: true,
        },
      }));
    } else {
      setRows((prev) => ({
        ...prev,
        [emp.id]: { ...cur, status, checkIn: '', checkOut: '', dirty: true },
      }));
    }
  };

  const visible = activeEmployees
    .filter((e) => !dept || e.department === dept)
    .filter((e) => {
      const q = search.trim().toLowerCase();
      return !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q);
    });

  const markUnmarked = (status: 'Present' | 'Absent') => {
    let n = 0;
    setRows((prev) => {
      const next = { ...prev };
      visible.forEach((emp) => {
        const r = next[emp.id];
        if (!r || r.status !== '') return;
        const shift = shiftOf(emp);
        next[emp.id] =
          status === 'Present'
            ? { ...r, status, checkIn: shift.startTime, checkOut: shift.endTime, dirty: true }
            : { ...r, status, checkIn: '', checkOut: '', dirty: true };
        n++;
      });
      return next;
    });
    if (n === 0) warning('Nothing to mark', 'Everyone shown already has a status for this date.');
  };

  const dirtyIds = Object.keys(rows).filter((id) => rows[id]?.dirty);

  const handleSave = () => {
    const invalid = dirtyIds.filter((id) => {
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
    dirtyIds.forEach((id) => {
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
              <span className="px-2 py-0.5 rounded bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 font-semibold">
                Holiday: {holiday.name}
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
              onClick={() => markUnmarked('Present')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" /> Unmarked → Present
            </button>
            <button
              onClick={() => markUnmarked('Absent')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 flex items-center gap-1.5 cursor-pointer"
            >
              <UserX className="w-3.5 h-3.5" /> Unmarked → Absent
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
                        {r.dirty && <span className="ml-1.5 text-[10px] text-indigo-600 dark:text-indigo-400">● unsaved</span>}
                      </p>
                      <span className="text-[11px] text-neutral-400 font-mono">
                        {emp.id} · {shift.startTime}–{shift.endTime}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1">
                        {STATUS_BUTTONS.map((b) => (
                          <button
                            key={b.status}
                            onClick={() => setStatus(emp, b.status)}
                            title={b.status}
                            className={`min-w-8 px-1.5 py-1 rounded-md border text-[11px] font-bold transition-colors cursor-pointer ${
                              r.status === b.status
                                ? b.cls
                                : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                            }`}
                          >
                            {b.short}
                          </button>
                        ))}
                        {offDay && (
                          <span className="ml-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                            {r.status}
                          </span>
                        )}
                        {r.status === '' && (
                          <span className="ml-1 text-[10px] text-neutral-400 italic">not marked</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1">
                        <input
                          type="time"
                          value={r.checkIn}
                          disabled={!timed && r.status !== ''}
                          onChange={(e) => updateRow(emp, { checkIn: e.target.value })}
                          className={`${inputClass} font-mono disabled:opacity-40`}
                        />
                        {date === today && (
                          <button
                            onClick={() => updateRow(emp, { checkIn: nowTime() })}
                            title="Check in now"
                            className="p-1 text-neutral-400 hover:text-indigo-600 cursor-pointer"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1">
                        <input
                          type="time"
                          value={r.checkOut}
                          disabled={!timed}
                          onChange={(e) => updateRow(emp, { checkOut: e.target.value })}
                          className={`${inputClass} font-mono disabled:opacity-40`}
                        />
                        {date === today && timed && (
                          <button
                            onClick={() => updateRow(emp, { checkOut: nowTime() })}
                            title="Check out now"
                            className="p-1 text-neutral-400 hover:text-indigo-600 cursor-pointer"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                        )}
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
          {dirtyIds.length
            ? `${dirtyIds.length} unsaved change${dirtyIds.length === 1 ? '' : 's'}`
            : 'Status is worked out from the times using each shift’s grace period; click a status to override.'}
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
            disabled={!dirtyIds.length}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" /> Save Attendance
          </button>
        </div>
      </div>
    </div>
  );
};
