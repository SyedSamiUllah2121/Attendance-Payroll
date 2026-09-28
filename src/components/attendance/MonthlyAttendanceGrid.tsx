import React, { useMemo, useState } from 'react';
import { ArrowRight, FileSpreadsheet, Printer, Search } from 'lucide-react';
import { AttendanceRecord, Employee, Holiday, LeaveRequest, LeaveType, Shift } from '../../types';
import { resolveUnmarkedDay, UnmarkedDayStatus } from '../../utils/attendanceEngine';
import { addDaysStr, currentMonthStr, monthEndStr, parseDateStr, todayStr } from '../../utils/dateUtils';
import { useSettings } from '../../context/SettingsContext';
import { useNotification } from '../../context/NotificationContext';

interface Props {
  /** Employees this user may see (already limited to their own record for employees). */
  employees: Employee[];
  shifts: Shift[];
  attendance: AttendanceRecord[];
  holidays: Holiday[];
  leaves: LeaveRequest[];
  canMark: boolean;
  /** Department filter and search; hidden when there is only one person to show. */
  showFilters: boolean;
  onEditDay: (emp: Employee, date: string, rec?: AttendanceRecord) => void;
}

type Tone = 'present' | 'late' | 'half' | 'absent' | 'leave' | 'holiday' | 'off' | 'pending' | 'empty';

interface Cell {
  code: string;
  tone: Tone;
  label: string;
}

const MAX_RANGE_DAYS = 62;

/**
 * Column widths (px). The name and total columns are fixed; day columns share whatever
 * width is left, so the grid fills the page (sidebar open or collapsed) and only
 * scrolls sideways once a day column would drop below MIN_DAY_WIDTH.
 */
const NAME_COL_WIDTH = 192;
const MIN_DAY_WIDTH = 21;
const SUMMARY_COLS: { label: string; hint: string; width: number }[] = [
  { label: 'Present', hint: 'Days present, including late arrivals', width: 60 },
  { label: 'Late', hint: 'Late arrivals', width: 44 },
  { label: 'Half Day', hint: 'Half days', width: 62 },
  { label: 'Absent', hint: 'Absent days', width: 54 },
  { label: 'Leave', hint: 'Days on approved leave', width: 48 },
  { label: 'Overtime', hint: 'Overtime hours', width: 70 },
];
const SUMMARY_WIDTH = SUMMARY_COLS.reduce((sum, c) => sum + c.width, 0);

const LEAVE_CODE: Record<LeaveType, string> = { Annual: 'AL', Sick: 'SL', Casual: 'CL', Unpaid: 'UL' };

const TONE_CLASS: Record<Tone, string> = {
  present: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  late: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  half: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  absent: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
  leave: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
  holiday: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  off: 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500',
  pending: 'bg-neutral-50 text-amber-500 ring-1 ring-inset ring-amber-300 dark:bg-neutral-800/60 dark:ring-amber-600/60',
  empty: 'bg-neutral-100/70 dark:bg-neutral-800/50',
};

/** Print colours (light, printer friendly). */
const TONE_PRINT: Record<Tone, string> = {
  present: '#dcfce7;color:#15803d',
  late: '#fef3c7;color:#b45309',
  half: '#ffedd5;color:#c2410c',
  absent: '#ffe4e6;color:#be123c',
  leave: '#e0f2fe;color:#0369a1',
  holiday: '#ede9fe;color:#6d28d9',
  off: '#f5f5f5;color:#a3a3a3',
  pending: '#fff;color:#d97706',
  empty: '#fafafa;color:#d4d4d4',
};

const LEGEND: { code: string; tone: Tone; label: string }[] = [
  { code: 'P', tone: 'present', label: 'Present' },
  { code: 'L', tone: 'late', label: 'Late' },
  { code: 'HD', tone: 'half', label: 'Half Day' },
  { code: 'A', tone: 'absent', label: 'Absent' },
  { code: 'AL', tone: 'leave', label: 'Annual' },
  { code: 'SL', tone: 'leave', label: 'Sick' },
  { code: 'CL', tone: 'leave', label: 'Casual' },
  { code: 'UL', tone: 'leave', label: 'Unpaid' },
  { code: 'H', tone: 'holiday', label: 'Holiday' },
  { code: 'W', tone: 'off', label: 'Off day' },
  { code: '•', tone: 'pending', label: 'Not marked yet' },
];

const UNMARKED_LABEL: Record<UnmarkedDayStatus, string> = {
  Holiday: 'Holiday',
  Weekend: 'Off day',
  'On Leave': 'On leave (approved)',
  Absent: 'Absent',
  Pending: 'Not marked yet',
  Upcoming: 'Upcoming',
  'Not Joined': 'Before joining date',
};

const fieldClass =
  'h-9 px-3 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100';
const buttonClass =
  'h-9 px-3.5 inline-flex items-center gap-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer';

const csvCell = (v: string | number) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const formatHours = (mins: number) => {
  if (!mins) return '—';
  const h = mins / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
};

export const MonthlyAttendanceGrid: React.FC<Props> = ({
  employees,
  shifts,
  attendance,
  holidays,
  leaves,
  canMark,
  showFilters,
  onEditDay,
}) => {
  const { settings } = useSettings();
  const { success, warning } = useNotification();
  const today = todayStr();

  const initialMonth = currentMonthStr();
  const [from, setFrom] = useState(`${initialMonth}-01`);
  const [to, setTo] = useState(monthEndStr(initialMonth));
  const [dept, setDept] = useState('');
  const [search, setSearch] = useState('');

  // The month picker shows a month only while the range is exactly that month.
  const month = from.endsWith('-01') && to === monthEndStr(from.slice(0, 7)) ? from.slice(0, 7) : '';

  const setRange = (nextFrom: string, nextTo: string) => {
    if (!nextFrom || !nextTo) return;
    let f = nextFrom;
    let t = nextTo;
    if (t < f) [f, t] = [t, f];
    const maxTo = addDaysStr(f, MAX_RANGE_DAYS - 1);
    if (t > maxTo) {
      t = maxTo;
      warning('Range shortened', `The grid shows up to ${MAX_RANGE_DAYS} days at a time.`);
    }
    setFrom(f);
    setTo(t);
  };

  const dates = useMemo(() => {
    const list: string[] = [];
    for (let d = from; d <= to; d = addDaysStr(d, 1)) list.push(d);
    return list;
  }, [from, to]);

  const departments = useMemo(
    () => Array.from(new Set(employees.map((e) => e.department).filter(Boolean))).sort(),
    [employees]
  );

  const recordByKey = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    attendance.forEach((r) => {
      if (r.date >= from && r.date <= to) map.set(`${r.employeeId}|${r.date}`, r);
    });
    return map;
  }, [attendance, from, to]);

  const holidayByDate = useMemo(() => new Map(holidays.map((h) => [h.date, h.name])), [holidays]);

  const shiftOf = (emp: Employee) => shifts.find((s) => s.id === emp.shiftId) || shifts[0];

  const leaveCodeOn = (empId: string, date: string) => {
    const leave = leaves.find(
      (l) => l.employeeId === empId && l.status === 'Approved' && l.fromDate <= date && l.toDate >= date
    );
    return leave ? { code: LEAVE_CODE[leave.leaveType] || 'LV', type: leave.leaveType } : { code: 'LV', type: '' };
  };

  const cellFor = (emp: Employee, date: string, rec?: AttendanceRecord): Cell => {
    if (rec) {
      switch (rec.status) {
        case 'Present':
          return { code: 'P', tone: 'present', label: 'Present' };
        case 'Late':
          return { code: 'L', tone: 'late', label: 'Late' };
        case 'Half Day':
          return { code: 'HD', tone: 'half', label: 'Half Day' };
        case 'Absent':
          return {
            code: 'A',
            tone: 'absent',
            label: rec.autoMarked ? 'Absent (no attendance recorded)' : 'Absent',
          };
        case 'On Leave': {
          const lv = leaveCodeOn(emp.id, date);
          return { code: lv.code, tone: 'leave', label: lv.type ? `${lv.type} leave` : 'On leave' };
        }
        case 'Holiday':
          return { code: 'H', tone: 'holiday', label: holidayByDate.get(date) || 'Holiday' };
        case 'Weekend':
          return { code: 'W', tone: 'off', label: 'Off day' };
      }
    }
    const status = resolveUnmarkedDay(emp, shiftOf(emp), date, holidays, leaves, today);
    switch (status) {
      case 'Holiday':
        return { code: 'H', tone: 'holiday', label: holidayByDate.get(date) || 'Holiday' };
      case 'Weekend':
        return { code: 'W', tone: 'off', label: 'Off day' };
      case 'On Leave': {
        const lv = leaveCodeOn(emp.id, date);
        return { code: lv.code, tone: 'leave', label: `${lv.type ? `${lv.type} leave` : 'Leave'} (approved)` };
      }
      case 'Absent':
        return { code: 'A', tone: 'absent', label: 'Absent' };
      case 'Pending':
        return { code: '•', tone: 'pending', label: UNMARKED_LABEL.Pending };
      default:
        return { code: '', tone: 'empty', label: UNMARKED_LABEL[status] };
    }
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees
      .filter((emp) => !dept || emp.department === dept)
      .filter((emp) => !q || emp.name.toLowerCase().includes(q) || emp.id.toLowerCase().includes(q))
      .filter(
        (emp) =>
          emp.status === 'Active' || dates.some((d) => recordByKey.has(`${emp.id}|${d}`))
      )
      .map((emp) => {
        const totals = { present: 0, late: 0, half: 0, absent: 0, leave: 0, worked: 0, overtime: 0 };
        const cells = dates.map((date) => {
          const rec = recordByKey.get(`${emp.id}|${date}`);
          if (rec) {
            if (rec.status === 'Present') totals.present++;
            else if (rec.status === 'Late') {
              totals.present++;
              totals.late++;
            } else if (rec.status === 'Half Day') totals.half++;
            else if (rec.status === 'Absent') totals.absent++;
            else if (rec.status === 'On Leave') totals.leave++;
            totals.worked += rec.workedMinutes || 0;
            totals.overtime += rec.overtimeMinutes || 0;
          }
          return { date, rec, cell: cellFor(emp, date, rec) };
        });
        return { emp, cells, totals };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, dept, search, dates, recordByKey, holidays, leaves, shifts, today]);

  const deptLabel = dept || 'All Departments';
  const periodLabel = month
    ? parseDateStr(from).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : `${parseDateStr(from).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} – ${parseDateStr(
        to
      ).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const fileSuffix = month || `${from}_to_${to}`;

  const handleExport = () => {
    if (!rows.length) {
      warning('Nothing to export', 'No employees match the current filters.');
      return;
    }
    const header = [
      'Employee ID',
      'Name',
      'Department',
      ...dates.map((d) => d),
      'Present',
      'Late',
      'Half Day',
      'Absent',
      'Leave',
      'Worked Hours',
      'Overtime Hours',
    ];
    const lines = rows.map(({ emp, cells, totals }) =>
      [
        emp.id,
        emp.name,
        emp.department,
        ...cells.map((c) => (c.cell.code === '•' ? '' : c.cell.code)),
        totals.present,
        totals.late,
        totals.half,
        totals.absent,
        totals.leave,
        (totals.worked / 60).toFixed(1),
        (totals.overtime / 60).toFixed(1),
      ]
        .map(csvCell)
        .join(',')
    );
    const legend = `Legend: ${LEGEND.filter((l) => l.code !== '•')
      .map((l) => `${l.code} = ${l.label}`)
      .join('; ')}`;
    const blob = new Blob(['﻿' + [header.map(csvCell).join(','), ...lines, '', csvCell(legend)].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Attendance_${fileSuffix}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    success('Export complete', `Downloaded attendance for ${periodLabel}.`);
  };

  const handlePrint = () => {
    if (!rows.length) {
      warning('Nothing to print', 'No employees match the current filters.');
      return;
    }
    const win = window.open('', '_blank', 'width=1200,height=800');
    if (!win) {
      warning('Pop-up blocked', 'Allow pop-ups for this site to print the attendance sheet.');
      return;
    }
    const cellStyle = (tone: Tone) => `background:${TONE_PRINT[tone]}`;
    const head = dates
      .map((d) => {
        const dt = parseDateStr(d);
        return `<th>${dt.getDate()}<br><span class="dow">${dt.toLocaleDateString('en-US', { weekday: 'narrow' })}</span></th>`;
      })
      .join('');
    const body = rows
      .map(
        ({ emp, cells, totals }) => `<tr>
          <td class="name"><b>${escapeHtml(emp.name)}</b> <span class="id">${escapeHtml(emp.id)}</span><br><span class="sub">${escapeHtml(
          emp.department
        )}</span></td>
          ${cells
            .map((c) => `<td><span class="c" style="${cellStyle(c.cell.tone)}">${c.cell.code === '•' ? '' : c.cell.code}</span></td>`)
            .join('')}
          <td class="n">${totals.present}</td><td class="n">${totals.late}</td><td class="n">${totals.half}</td>
          <td class="n">${totals.absent}</td><td class="n">${totals.leave}</td><td class="n">${formatHours(totals.overtime)}</td>
        </tr>`
      )
      .join('');
    const legend = LEGEND.filter((l) => l.code !== '•')
      .map((l) => `<span><span class="c" style="${cellStyle(l.tone)}">${l.code}</span> ${l.label}</span>`)
      .join('');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8">
      <title>Attendance ${escapeHtml(periodLabel)}</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #171717; margin: 0; font-size: 9px; }
        h1 { font-size: 14px; margin: 0 0 2px; }
        .meta { color: #737373; margin-bottom: 8px; font-size: 10px; }
        table { border-collapse: collapse; width: 100%; }
        th { font-weight: 600; color: #525252; padding: 3px 1px; border-bottom: 1px solid #d4d4d4; text-align: center; }
        th.left { text-align: left; }
        td { padding: 2px 1px; border-bottom: 1px solid #eee; text-align: center; }
        td.name { text-align: left; padding-right: 6px; white-space: nowrap; }
        .id { color: #737373; font-family: ui-monospace, monospace; }
        .sub { color: #a3a3a3; font-size: 8px; }
        .dow { color: #a3a3a3; font-weight: 400; }
        .c { display: inline-block; width: 18px; height: 16px; line-height: 16px; border-radius: 3px; font-weight: 700; font-size: 7.5px;
             -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        td.n { font-family: ui-monospace, monospace; text-align: right; padding: 0 4px; }
        .legend { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 10px; color: #525252; }
      </style></head><body>
      <h1>${escapeHtml(settings.company?.name || 'Monthly Attendance')}</h1>
      <div class="meta">Monthly Attendance · ${escapeHtml(deptLabel)} · ${escapeHtml(periodLabel)} · ${rows.length} employee${
      rows.length === 1 ? '' : 's'
    }</div>
      <table><thead><tr><th class="left">Employee</th>${head}
        <th>Present</th><th>Late</th><th>Half Day</th><th>Absent</th><th>Leave</th><th>Overtime</th></tr></thead>
      <tbody>${body}</tbody></table>
      <div class="legend">${legend}</div>
      <script>window.onload = function () { window.focus(); window.print(); };</script>
      </body></html>`);
    win.document.close();
  };

  const summaryNum = (value: number, color: string) => (
    <span className={value > 0 ? color : 'text-neutral-300 dark:text-neutral-600'}>{value}</span>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {showFilters && (
            <select value={dept} onChange={(e) => setDept(e.target.value)} className={`${fieldClass} min-w-44`}>
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
          <input
            type="month"
            value={month}
            onChange={(e) => {
              const m = e.target.value;
              if (m) setRange(`${m}-01`, monthEndStr(m));
            }}
            className={`${fieldClass} font-medium`}
            aria-label="Month"
          />
          <span className="text-xs text-neutral-400 px-1">or</span>
          <div className="flex items-center">
            <input
              type="date"
              value={from}
              onChange={(e) => setRange(e.target.value, to)}
              className={`${fieldClass} rounded-r-none font-mono`}
              aria-label="From date"
            />
            <span className="h-9 px-2 flex items-center border-y border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-400">
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
            <input
              type="date"
              value={to}
              onChange={(e) => setRange(from, e.target.value)}
              className={`${fieldClass} rounded-l-none font-mono`}
              aria-label="To date"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={handleExport} className={buttonClass} title="Download as a spreadsheet (opens in Excel)">
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </button>
            <button onClick={handlePrint} className={buttonClass}>
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {showFilters && (
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or employee ID..."
                className={`${fieldClass} w-full pl-8`}
              />
            </div>
          )}
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Monthly Attendance — {deptLabel} · {periodLabel} · {rows.length} employee{rows.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="w-full table-fixed text-xs border-separate border-spacing-0"
            style={{ minWidth: NAME_COL_WIDTH + dates.length * MIN_DAY_WIDTH + SUMMARY_WIDTH }}
          >
            <colgroup>
              <col style={{ width: NAME_COL_WIDTH }} />
              {dates.map((d) => (
                <col key={d} />
              ))}
              {SUMMARY_COLS.map((c) => (
                <col key={c.label} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400">
                <th className="sticky left-0 z-20 bg-neutral-50 dark:bg-neutral-800 text-left font-semibold px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
                  Employee
                </th>
                {dates.map((d, i) => {
                  const dt = parseDateStr(d);
                  const showMonth = i === 0 || dt.getDate() === 1;
                  const isToday = d === today;
                  const holidayName = holidayByDate.get(d);
                  return (
                    <th
                      key={d}
                      title={`${dt.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${
                        holidayName ? ` · ${holidayName}` : ''
                      }${isToday ? ' · Today' : ''}`}
                      className="px-px py-2 text-center font-semibold border-b border-neutral-200 dark:border-neutral-800 align-bottom"
                    >
                      {showMonth && (
                        <span className="block text-[9px] font-semibold text-indigo-600 dark:text-indigo-400 leading-none mb-0.5">
                          {dt.toLocaleDateString('en-US', { month: 'short' })}
                        </span>
                      )}
                      <span
                        className={`mx-auto flex items-center justify-center w-full max-w-6 h-5 rounded font-mono text-[11px] ${
                          isToday ? 'bg-indigo-600 text-white' : 'text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        {dt.getDate()}
                      </span>
                    </th>
                  );
                })}
                {SUMMARY_COLS.map(({ label, hint }, i) => (
                  <th
                    key={label}
                    title={hint}
                    className={`px-2 py-3 text-right font-semibold whitespace-nowrap border-b border-neutral-200 dark:border-neutral-800 ${
                      i === SUMMARY_COLS.length - 1 ? 'pr-4' : ''
                    }`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={dates.length + 7} className="py-14 text-center text-neutral-400">
                    No employees match the current filters.
                  </td>
                </tr>
              )}
              {rows.map(({ emp, cells, totals }) => {
                const shift = shiftOf(emp);
                return (
                  <tr key={emp.id} className="group">
                    <td
                      title={`${emp.name} (${emp.id})\n${emp.department}${shift ? ` · ${shift.name}` : ''}`}
                      className="sticky left-0 z-10 bg-white dark:bg-neutral-900 group-hover:bg-neutral-50 dark:group-hover:bg-neutral-800/60 px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800 transition-colors"
                    >
                      <p className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                        {emp.name}{' '}
                        <span className="font-mono font-normal text-neutral-400 dark:text-neutral-500">({emp.id})</span>
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                        {emp.department}
                        {shift ? ` · ${shift.name}` : ''}
                        {emp.status !== 'Active' ? ' · Inactive' : ''}
                      </p>
                    </td>
                    {cells.map(({ date, rec, cell }) => {
                      const editable = canMark && date <= today && cell.tone !== 'empty';
                      const times =
                        rec?.checkIn || rec?.checkOut ? `\nIn ${rec?.checkIn || '—'} · Out ${rec?.checkOut || '—'}` : '';
                      const note = rec?.notes && !rec.autoMarked ? `\nNote: ${rec.notes}` : '';
                      return (
                        <td
                          key={date}
                          onClick={() => editable && onEditDay(emp, date, rec)}
                          title={`${emp.name} · ${parseDateStr(date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}\n${cell.label}${times}${note}`}
                          className={`px-px py-2.5 text-center border-b border-neutral-100 dark:border-neutral-800 group-hover:bg-neutral-50 dark:group-hover:bg-neutral-800/40 transition-colors ${
                            editable ? 'cursor-pointer' : 'cursor-default'
                          }`}
                        >
                          <span
                            className={`mx-auto flex items-center justify-center w-full max-w-7 aspect-square rounded-md text-[10px] font-bold font-mono transition-transform ${
                              editable ? 'hover:scale-110' : ''
                            } ${TONE_CLASS[cell.tone]}`}
                          >
                            {cell.code}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-2 text-right font-mono tabular-nums font-semibold text-neutral-900 dark:text-neutral-100 border-b border-neutral-100 dark:border-neutral-800 group-hover:bg-neutral-50 dark:group-hover:bg-neutral-800/40">
                      {totals.present}
                    </td>
                    <td className="px-2 text-right font-mono tabular-nums border-b border-neutral-100 dark:border-neutral-800 group-hover:bg-neutral-50 dark:group-hover:bg-neutral-800/40">
                      {summaryNum(totals.late, 'text-amber-600 dark:text-amber-400')}
                    </td>
                    <td className="px-2 text-right font-mono tabular-nums border-b border-neutral-100 dark:border-neutral-800 group-hover:bg-neutral-50 dark:group-hover:bg-neutral-800/40">
                      {summaryNum(totals.half, 'text-orange-600 dark:text-orange-400')}
                    </td>
                    <td className="px-2 text-right font-mono tabular-nums border-b border-neutral-100 dark:border-neutral-800 group-hover:bg-neutral-50 dark:group-hover:bg-neutral-800/40">
                      {summaryNum(totals.absent, 'text-rose-600 dark:text-rose-400')}
                    </td>
                    <td className="px-2 text-right font-mono tabular-nums border-b border-neutral-100 dark:border-neutral-800 group-hover:bg-neutral-50 dark:group-hover:bg-neutral-800/40">
                      {summaryNum(totals.leave, 'text-sky-600 dark:text-sky-400')}
                    </td>
                    <td
                      title={`Worked ${formatHours(totals.worked)}`}
                      className="pl-2 pr-4 text-right font-mono tabular-nums text-neutral-700 dark:text-neutral-300 border-b border-neutral-100 dark:border-neutral-800 group-hover:bg-neutral-50 dark:group-hover:bg-neutral-800/40"
                    >
                      {formatHours(totals.overtime)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-t border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-500 dark:text-neutral-400">
          {LEGEND.map((l) => (
            <span key={l.code} className="inline-flex items-center gap-1.5">
              <span
                className={`inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold font-mono ${TONE_CLASS[l.tone]}`}
              >
                {l.code}
              </span>
              {l.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
