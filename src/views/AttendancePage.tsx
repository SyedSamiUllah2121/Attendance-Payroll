import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  Filter,
  Download,
  CheckCircle,
  XCircle,
  Check,
  X,
  Edit2,
  Users,
  Grid,
  List,
  AlertCircle,
  FileCheck,
  UserCheck,
} from 'lucide-react';
import {
  AttendanceRecord,
  AttendanceStatus,
  Employee,
  Holiday,
  LeaveRequest,
  RegularizationRequest,
  Shift,
} from '../types';
import { storageService } from '../services/storageService';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { evaluateAttendanceStatus, resolveUnmarkedDay, UnmarkedDayStatus } from '../utils/attendanceEngine';
import { addDaysStr, currentMonthStr, todayStr } from '../utils/dateUtils';

const TIMED_STATUSES: AttendanceStatus[] = ['Present', 'Late', 'Half Day'];

/** Label for a day with no saved record. */
const UNMARKED_LABEL: Record<UnmarkedDayStatus, string> = {
  Holiday: 'Holiday',
  Weekend: 'Weekend',
  'On Leave': 'On Leave',
  Absent: 'Absent',
  Pending: 'Not Marked',
  Upcoming: 'Upcoming',
  'Not Joined': 'Not Joined',
};

/** Evaluate times against the shift, ignoring weekend/holiday so work on an off-day still counts. */
const evaluateTimes = (checkIn: string, checkOut: string, shift: Shift, date: string) =>
  evaluateAttendanceStatus(
    checkIn || undefined,
    checkOut || undefined,
    { ...shift, workingDays: [0, 1, 2, 3, 4, 5, 6] },
    date,
    [],
    false
  );

const isOvernight = (shift?: Shift) => Boolean(shift && shift.endTime <= shift.startTime);

const csvCell = (v: string | number) => {
  const str = String(v ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};
import { MarkAttendanceSheet } from '../components/attendance/MarkAttendanceSheet';
import { reviewRegularization } from '../services/approvalService';

export const AttendancePage: React.FC = () => {
  const { user, isEmployee, can } = useAuth();
  const canView = can('attendance.view');
  const canMark = can('attendance.mark');
  const canApprove = can('attendance.approve');
  const { settings } = useSettings();
  const { success, warning, error } = useNotification();

  // Mode: Daily view, Monthly Matrix grid, or Regularization Requests
  const [viewMode, setViewMode] = useState<'mark' | 'daily' | 'monthly' | 'regularizations'>(
    () => {
      // Another screen (e.g. the notification bell) can ask to open a specific tab once.
      try {
        const requested = sessionStorage.getItem('workpulse_attendance_view');
        if (requested === 'regularizations' || requested === 'mark' || requested === 'monthly') {
          sessionStorage.removeItem('workpulse_attendance_view');
          return requested;
        }
      } catch {
        // storage unavailable: fall back to the default tab
      }
      return 'daily';
    }
  );
  const today = todayStr();
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr());
  const [departmentFilter, setDepartmentFilter] = useState('');

  // Switch tabs when asked while this page is already open (e.g. from the notification bell)
  useEffect(() => {
    const onRequest = (e: Event) => {
      const view = (e as CustomEvent<string>).detail;
      if (view === 'regularizations' || view === 'mark' || view === 'monthly' || view === 'daily') {
        setViewMode(view);
        try {
          sessionStorage.removeItem('workpulse_attendance_view');
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('workpulse:attendance-view', onRequest);
    return () => window.removeEventListener('workpulse:attendance-view', onRequest);
  }, []);

  // Storage data
  const [employees, setEmployees] = useState<Employee[]>(() => storageService.getEmployees());
  const [shifts, setShifts] = useState<Shift[]>(() => storageService.getShifts());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => storageService.getAttendance());
  const [holidays, setHolidays] = useState<Holiday[]>(() => storageService.getHolidays());
  const [leaves, setLeaves] = useState<LeaveRequest[]>(() => storageService.getLeaves());
  const [regularizations, setRegularizations] = useState<RegularizationRequest[]>(() =>
    storageService.getRegularizations()
  );

  // Edit Single Record Modal
  const [editingRecord, setEditingRecord] = useState<{
    employeeId: string;
    employeeName: string;
    date: string;
    checkIn: string;
    checkOut: string;
    /** '' = work it out from the check-in / check-out times. */
    status: AttendanceStatus | '';
    notes: string;
  } | null>(null);

  // New Regularization Modal (for Employee)
  const [isRegModalOpen, setIsRegModalOpen] = useState(false);
  const [regForm, setRegForm] = useState({
    date: addDaysStr(today, -1),
    requestedCheckIn: '09:00',
    requestedCheckOut: '18:00',
    reason: '',
  });

  // Bulk Marker Modal
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkCheckIn, setBulkCheckIn] = useState('09:00');
  const [bulkCheckOut, setBulkCheckOut] = useState('18:00');
  const [bulkDept, setBulkDept] = useState('');
  const [bulkDate, setBulkDate] = useState(today);

  const departments = Array.from(new Set(employees.map((e) => e.department).filter(Boolean))).sort();

  const reloadData = () => {
    setEmployees(storageService.getEmployees());
    setShifts(storageService.getShifts());
    setHolidays(storageService.getHolidays());
    setLeaves(storageService.getLeaves());
    setAttendance(storageService.getAttendance());
    setRegularizations(storageService.getRegularizations());
  };

  const shiftOf = (emp?: Employee) => shifts.find((s) => s.id === emp?.shiftId) || shifts[0];
  const ownEmployeeId = user?.employeeId;

  /** What a day with no record means for this employee (holiday, off day, leave, absent, not marked yet...). */
  const unmarkedStatus = (emp: Employee, date: string) =>
    resolveUnmarkedDay(emp, shiftOf(emp), date, holidays, leaves, today);

  /** Open the edit dialog for one employee-day, pre-filled from its record or the shift. */
  const openEditor = (emp: Employee, date: string, rec?: AttendanceRecord) => {
    const shift = shiftOf(emp);
    const unmarked = rec ? undefined : unmarkedStatus(emp, date);
    let status: AttendanceStatus | '' = '';
    if (rec) status = rec.status;
    else if (unmarked === 'Holiday' || unmarked === 'Weekend' || unmarked === 'On Leave') status = unmarked;
    setEditingRecord({
      employeeId: emp.id,
      employeeName: emp.name,
      date,
      checkIn: rec?.checkIn?.slice(0, 5) || shift?.startTime || '09:00',
      checkOut: rec?.checkOut?.slice(0, 5) || (date === today ? '' : shift?.endTime || '18:00'),
      status,
      notes: rec && !rec.autoMarked ? rec.notes || '' : '',
    });
  };

  // -------------------------------------------------------------
  // Daily View Computations
  // -------------------------------------------------------------
  const filteredEmployees = employees.filter((emp) => {
    if (isEmployee && emp.id !== ownEmployeeId) return false;
    if (departmentFilter && emp.department !== departmentFilter) return false;
    // Former staff only appear for periods where they still have attendance.
    if (emp.status !== 'Active') {
      const period = viewMode === 'monthly' ? selectedMonth : selectedDate;
      return attendance.some((r) => r.employeeId === emp.id && r.date.startsWith(period));
    }
    return true;
  });

  const visibleRegularizations = isEmployee
    ? regularizations.filter((r) => r.employeeId === ownEmployeeId)
    : regularizations;

  const dailyRecordsMap = new Map<string, AttendanceRecord>();
  attendance
    .filter((r) => r.date === selectedDate)
    .forEach((r) => dailyRecordsMap.set(r.employeeId, r));

  // Handle Save Manual Override
  const handleSaveOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;

    const emp = employees.find((e) => e.id === editingRecord.employeeId);
    const shift = shiftOf(emp);
    const timed = editingRecord.status === '' || TIMED_STATUSES.includes(editingRecord.status);

    if (editingRecord.date > today) {
      warning('Future date', 'Attendance can only be recorded for today or earlier. Use Leave Management to plan leave.');
      return;
    }
    if (timed) {
      if (!editingRecord.checkIn) {
        warning('Check-in required', 'Enter a check-in time, or pick a status such as Absent or On Leave.');
        return;
      }
      if (
        editingRecord.checkOut &&
        (editingRecord.checkOut === editingRecord.checkIn ||
          (!isOvernight(shift) && editingRecord.checkOut < editingRecord.checkIn))
      ) {
        warning('Check the times', 'Check-out must be after check-in.');
        return;
      }
    }

    const evaluation = timed
      ? evaluateTimes(editingRecord.checkIn, editingRecord.checkOut, shift, editingRecord.date)
      : undefined;
    const existing = attendance.find(
      (r) => r.employeeId === editingRecord.employeeId && r.date === editingRecord.date
    );

    const record: AttendanceRecord = {
      ...existing,
      id: existing?.id || `att-${editingRecord.employeeId}-${editingRecord.date}`,
      employeeId: editingRecord.employeeId,
      date: editingRecord.date,
      checkIn: timed ? editingRecord.checkIn : undefined,
      checkOut: timed && editingRecord.checkOut ? editingRecord.checkOut : undefined,
      status: editingRecord.status || evaluation!.status,
      workedMinutes: evaluation?.workedMinutes ?? 0,
      overtimeMinutes: evaluation?.overtimeMinutes ?? 0,
      isEarlyDeparture: evaluation?.isEarlyDeparture ?? false,
      notes: editingRecord.notes || undefined,
      modifiedBy: user?.name,
      autoMarked: undefined,
    };

    storageService.saveOrUpdateAttendanceRecord(record);
    success('Attendance Updated', `Saved record for ${editingRecord.employeeName}`);
    reloadData();
    setEditingRecord(null);
  };

  // Handle Bulk Attendance Mark
  const handleApplyBulk = () => {
    if (!bulkDate || bulkDate > today) {
      warning('Invalid date', 'Bulk attendance can only be marked for today or earlier.');
      return;
    }
    if (!bulkCheckIn) {
      warning('Check-in required', 'Enter the check-in time to apply.');
      return;
    }
    const targets = employees.filter(
      (e) => e.status === 'Active' && (!bulkDept || e.department === bulkDept)
    );
    let count = 0;
    let skipped = 0;

    targets.forEach((emp) => {
      const shift = shiftOf(emp);
      if (bulkCheckOut && (bulkCheckOut === bulkCheckIn || (!isOvernight(shift) && bulkCheckOut < bulkCheckIn))) {
        skipped++;
        return;
      }
      const existing = attendance.find((r) => r.employeeId === emp.id && r.date === bulkDate);
      // Never overwrite attendance someone already recorded, and skip off days / leave.
      const dayType = resolveUnmarkedDay(emp, shift, bulkDate, holidays, leaves, today);
      if ((existing && !existing.autoMarked) || (dayType !== 'Absent' && dayType !== 'Pending')) {
        skipped++;
        return;
      }
      const evaluation = evaluateTimes(bulkCheckIn, bulkCheckOut, shift, bulkDate);

      const record: AttendanceRecord = {
        id: existing?.id || `att-${emp.id}-${bulkDate}`,
        employeeId: emp.id,
        date: bulkDate,
        checkIn: bulkCheckIn,
        checkOut: bulkCheckOut || undefined,
        status: evaluation.status,
        workedMinutes: evaluation.workedMinutes,
        overtimeMinutes: evaluation.overtimeMinutes,
        isEarlyDeparture: evaluation.isEarlyDeparture,
        notes: 'Bulk marked',
        modifiedBy: user?.name,
      };
      storageService.saveOrUpdateAttendanceRecord(record);
      count++;
    });

    if (count === 0) {
      warning(
        'Nothing to mark',
        'Everyone selected is already marked, off, on leave, or the times are invalid for their shift.'
      );
      return;
    }
    success(
      'Bulk Attendance Applied',
      `Marked ${count} employee${count === 1 ? '' : 's'} for ${bulkDate}` +
        (skipped ? `; skipped ${skipped} already marked, off or on leave.` : '.')
    );
    reloadData();
    setIsBulkModalOpen(false);
  };

  // Submit Regularization
  const handleSubmitRegularization = (e: React.FormEvent) => {
    e.preventDefault();
    const empId = ownEmployeeId;
    if (!empId) {
      error('No employee profile', 'Your account is not linked to an employee record.');
      return;
    }
    const emp = employees.find((x) => x.id === empId);
    if (regForm.date > today) {
      warning('Future date', 'A correction can only be requested for today or an earlier day.');
      return;
    }
    if (emp?.joiningDate && regForm.date < emp.joiningDate) {
      warning('Invalid date', 'That date is before your joining date.');
      return;
    }
    if (
      regForm.requestedCheckOut === regForm.requestedCheckIn ||
      (!isOvernight(shiftOf(emp)) && regForm.requestedCheckOut < regForm.requestedCheckIn)
    ) {
      warning('Check the times', 'Check-out must be after check-in.');
      return;
    }
    if (!regForm.reason.trim()) {
      warning('Reason required', 'Explain why the attendance needs correcting.');
      return;
    }
    if (regularizations.some((r) => r.employeeId === empId && r.date === regForm.date && r.status === 'Pending')) {
      warning('Already requested', `You already have a pending correction for ${regForm.date}.`);
      return;
    }
    const current = attendance.find((r) => r.employeeId === empId && r.date === regForm.date);

    const newReq: RegularizationRequest = {
      id: `reg-${Date.now()}`,
      employeeId: empId,
      date: regForm.date,
      currentCheckIn: current?.checkIn,
      currentCheckOut: current?.checkOut,
      requestedCheckIn: regForm.requestedCheckIn,
      requestedCheckOut: regForm.requestedCheckOut,
      reason: regForm.reason.trim(),
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };

    storageService.addRegularization(newReq);
    success('Regularization Submitted', 'Your request has been sent to HR for approval.');
    reloadData();
    setIsRegModalOpen(false);
  };

  // Approve / Reject Regularization
  const handleReviewRegularization = (
    req: RegularizationRequest,
    action: 'Approved' | 'Rejected'
  ) => {
    reviewRegularization(req, action, user?.name || 'Manager');

    success(
      `Request ${action}`,
      `Regularization for ${req.employeeId} on ${req.date} has been ${action.toLowerCase()}.`
    );
    reloadData();
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Employee ID', 'Name', 'Department', 'Date', 'Check-In', 'Check-Out', 'Status', 'Worked (Hrs)', 'OT (Hrs)'];
    const visibleIds = new Set(filteredEmployees.map((e) => e.id));
    const rows = attendance
      .filter((r) => r.date.startsWith(selectedMonth) && visibleIds.has(r.employeeId))
      .sort((a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId))
      .map((r) => {
        const emp = employees.find((e) => e.id === r.employeeId);
        return [
          r.employeeId,
          emp?.name || '',
          emp?.department || '',
          r.date,
          r.checkIn || '',
          r.checkOut || '',
          r.status,
          ((r.workedMinutes || 0) / 60).toFixed(1),
          ((r.overtimeMinutes || 0) / 60).toFixed(1),
        ]
          .map(csvCell)
          .join(',');
      });

    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `WorkPulse_Attendance_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    success('Export Complete', `Downloaded attendance for ${selectedMonth}`);
  };

  // -------------------------------------------------------------
  // Monthly Grid Computations
  // -------------------------------------------------------------
  const [yearStr, monthStr] = selectedMonth.split('-');
  const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
    const day = String(i + 1).padStart(2, '0');
    return `${selectedMonth}-${day}`;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Attendance Register
          </h1>
          <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Monitor daily punch timestamps, monthly attendance matrices, and corrections
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View switcher pills */}
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
            {canMark && (
              <button
                onClick={() => setViewMode('mark')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  viewMode === 'mark'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" /> Mark Attendance
              </button>
            )}
            <button
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'daily'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              <List className="w-3.5 h-3.5" /> Daily
            </button>
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'monthly'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              <Grid className="w-3.5 h-3.5" /> Monthly Grid
            </button>
            <button
              onClick={() => setViewMode('regularizations')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors relative ${
                viewMode === 'regularizations'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" /> Regularizations
              {visibleRegularizations.some((r) => r.status === 'Pending') && (
                <span className="w-2 h-2 rounded-full bg-amber-500" />
              )}
            </button>
          </div>

          {/* Action buttons */}
          {isEmployee && (
            <button
              onClick={() => setIsRegModalOpen(true)}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" /> Request Correction
            </button>
          )}

          {canView && (
            <>
              {canMark && (<button
                onClick={() => {
                  setBulkDate(viewMode === 'daily' && selectedDate <= today ? selectedDate : today);
                  setIsBulkModalOpen(true);
                }}
                className="px-3.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-lg text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
              >
                Mark Bulk
              </button>)}
              <button
                onClick={handleExportCSV}
                className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'mark' && canMark && (
        <MarkAttendanceSheet
          employees={employees}
          shifts={shifts}
          attendance={attendance}
          departments={departments}
          onSaved={reloadData}
        />
      )}

      {/* Control Bar */}
      {viewMode !== 'mark' && (
      <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {viewMode === 'daily' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-500">Date:</span>
              <input
                type="date"
                value={selectedDate}
                max={today}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-500">Month:</span>
              <input
                type="month"
                value={selectedMonth}
                max={currentMonthStr()}
                onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                className="px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
              />
            </div>
          )}

          {canView && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-500">Department:</span>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {viewMode === 'monthly' && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 font-medium">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> P (Present)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> L (Late)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> A (Absent)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-orange-500" /> HD (Half Day)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" /> LV (Leave)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-purple-500" /> H (Holiday)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-neutral-300 dark:bg-neutral-600" /> W (Off day)
            </span>
          </div>
        )}
      </div>

      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. Daily View */}
      {/* ------------------------------------------------------------- */}
      {viewMode === 'daily' && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 font-semibold border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Assigned Shift</th>
                  <th className="py-3 px-4">Check-In</th>
                  <th className="py-3 px-4">Check-Out</th>
                  <th className="py-3 px-4">Worked Hours</th>
                  <th className="py-3 px-4">Overtime</th>
                  <th className="py-3 px-4">Status</th>
                  {canMark && <th className="py-3 px-4 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={canMark ? 9 : 8} className="py-12 text-center text-neutral-400">
                      No employees to show.
                    </td>
                  </tr>
                )}
                {filteredEmployees.map((emp) => {
                  const rec = dailyRecordsMap.get(emp.id);
                  const shift = shifts.find((s) => s.id === emp.shiftId);
                  const dayStatus = rec ? rec.status : UNMARKED_LABEL[unmarkedStatus(emp, selectedDate)];

                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center font-bold text-xs">
                            {emp.name[0]}
                          </div>
                          <div>
                            <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                              {emp.name}
                            </p>
                            <span className="text-[11px] text-neutral-400 font-mono">{emp.id}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-300">
                        {emp.department}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-500 font-mono">
                        {shift ? `${shift.startTime} – ${shift.endTime}` : '09:00 – 18:00'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-neutral-900 dark:text-neutral-100 tabular-nums">
                        {rec?.checkIn || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-neutral-900 dark:text-neutral-100 tabular-nums">
                        {rec?.checkOut || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-neutral-700 dark:text-neutral-300">
                        {rec?.workedMinutes ? `${(rec.workedMinutes / 60).toFixed(1)} hrs` : '0 hrs'}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-neutral-500">
                        {rec?.overtimeMinutes
                          ? `${(rec.overtimeMinutes / 60).toFixed(1)} hrs`
                          : '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge status={dayStatus} />
                        {rec?.autoMarked && rec.status === 'Absent' && (
                          <span className="block text-[10px] text-neutral-400 mt-0.5">No attendance recorded</span>
                        )}
                      </td>
                      {canMark && (
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => openEditor(emp, selectedDate, rec)}
                            disabled={selectedDate > today}
                            className="p-1.5 text-neutral-400 hover:text-indigo-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                            title="Edit Record"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. Monthly Grid Matrix */}
      {/* ------------------------------------------------------------- */}
      {viewMode === 'monthly' && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 font-semibold border-b border-neutral-200 dark:border-neutral-800 sticky top-0">
                <tr>
                  <th className="py-3 px-3 min-w-36 sticky left-0 bg-neutral-50 dark:bg-neutral-800 z-10">
                    Employee
                  </th>
                  {monthDays.map((dStr) => {
                    const dayNum = dStr.slice(8);
                    const dow = new Date(dStr + 'T00:00:00').getDay();
                    const isWk = dow === 0 || dow === 6;
                    const isToday = dStr === today;
                    const holidayName = holidays.find((h) => h.date === dStr)?.name;
                    return (
                      <th
                        key={dStr}
                        className={`py-2 px-1 text-center w-8 min-w-8 text-[11px] font-mono ${
                          isToday
                            ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                            : isWk
                            ? 'bg-neutral-100 dark:bg-neutral-800/80 text-neutral-400'
                            : ''
                        }`}
                        title={`${dStr}${holidayName ? ` · ${holidayName}` : ''}${isToday ? ' · Today' : ''}`}
                      >
                        {dayNum}
                      </th>
                    );
                  })}
                  <th className="py-3 px-2 text-center text-emerald-600 font-bold">P</th>
                  <th className="py-3 px-2 text-center text-amber-600 font-bold">L</th>
                  <th className="py-3 px-2 text-center text-orange-600 font-bold">HD</th>
                  <th className="py-3 px-2 text-center text-rose-600 font-bold">A</th>
                  <th className="py-3 px-2 text-center text-sky-600 font-bold">LV</th>
                  <th className="py-3 px-3 text-right">Total Hrs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {filteredEmployees.map((emp) => {
                  const empRecords = attendance.filter(
                    (r) => r.employeeId === emp.id && r.date.startsWith(selectedMonth)
                  );
                  const recordMap = new Map(empRecords.map((r) => [r.date, r]));
                  const empShift = shiftOf(emp);

                  let countP = 0;
                  let countL = 0;
                  let countHD = 0;
                  let countA = 0;
                  let countLV = 0;
                  let totalMins = 0;

                  empRecords.forEach((r) => {
                    if (r.status === 'Present') countP++;
                    else if (r.status === 'Late') countL++;
                    else if (r.status === 'Half Day') countHD++;
                    else if (r.status === 'Absent') countA++;
                    else if (r.status === 'On Leave') countLV++;
                    totalMins += r.workedMinutes || 0;
                  });

                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                    >
                      <td className="py-2 px-3 sticky left-0 bg-white dark:bg-neutral-900 z-10 font-medium truncate max-w-40 border-r border-neutral-100 dark:border-neutral-800">
                        <p className="truncate font-semibold text-neutral-900 dark:text-neutral-100">
                          {emp.name}
                        </p>
                        <span className="text-[10px] text-neutral-400">{emp.id}</span>
                      </td>

                      {monthDays.map((dStr) => {
                        const rec = recordMap.get(dStr);
                        const dow = new Date(dStr + 'T00:00:00').getDay();
                        const isWeekend = !(empShift?.workingDays ?? [1, 2, 3, 4, 5]).includes(dow);
                        const unmarked = rec ? undefined : unmarkedStatus(emp, dStr);
                        const editable = canMark && dStr <= today && unmarked !== 'Not Joined';

                        let symbol = '';
                        let colorClass = 'text-neutral-300 dark:text-neutral-600';
                        let label: string = rec ? rec.status : UNMARKED_LABEL[unmarked!];

                        if (rec) {
                          if (rec.status === 'Present') {
                            symbol = 'P';
                            colorClass =
                              'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold';
                          } else if (rec.status === 'Late') {
                            symbol = 'L';
                            colorClass =
                              'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 font-bold';
                          } else if (rec.status === 'Half Day') {
                            symbol = 'HD';
                            colorClass =
                              'bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 font-bold';
                          } else if (rec.status === 'Absent') {
                            symbol = 'A';
                            colorClass =
                              'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 font-bold';
                          } else if (rec.status === 'On Leave') {
                            symbol = 'LV';
                            colorClass =
                              'bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 font-bold';
                          } else if (rec.status === 'Holiday') {
                            symbol = 'H';
                            colorClass = 'bg-purple-50 dark:bg-purple-950/60 text-purple-600';
                          } else if (rec.status === 'Weekend') {
                            symbol = 'W';
                            colorClass = 'text-neutral-400';
                          }
                          if (rec.autoMarked && rec.status === 'Absent') label = 'Absent (no attendance recorded)';
                        } else if (unmarked === 'Holiday') {
                          symbol = 'H';
                          colorClass = 'bg-purple-50 dark:bg-purple-950/60 text-purple-600';
                        } else if (unmarked === 'Weekend') {
                          symbol = 'W';
                          colorClass = 'text-neutral-400 dark:text-neutral-600';
                        } else if (unmarked === 'On Leave') {
                          // Approved leave still ahead
                          symbol = 'LV';
                          colorClass = 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400';
                        } else if (unmarked === 'Pending') {
                          symbol = '•';
                          colorClass = 'text-amber-500 ring-1 ring-inset ring-amber-300 dark:ring-amber-700';
                        } else if (unmarked === 'Absent') {
                          symbol = 'A';
                          colorClass = 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 font-bold';
                        }

                        return (
                          <td
                            key={dStr}
                            onClick={() => {
                              if (editable) openEditor(emp, dStr, rec);
                            }}
                            className={`p-0.5 text-center ${editable ? 'cursor-pointer' : 'cursor-default'} ${
                              isWeekend ? 'bg-neutral-50 dark:bg-neutral-800/40' : ''
                            }`}
                            title={`${emp.name} · ${dStr}\nStatus: ${label}${
                              rec?.checkIn || rec?.checkOut
                                ? `\nCheck-in: ${rec?.checkIn || '—'} | Out: ${rec?.checkOut || '—'}`
                                : ''
                            }${rec?.notes && !rec.autoMarked ? `\nNote: ${rec.notes}` : ''}`}
                          >
                            <span
                              className={`w-6 h-6 inline-flex items-center justify-center rounded text-[10px] font-mono transition-transform hover:scale-110 ${colorClass}`}
                            >
                              {symbol}
                            </span>
                          </td>
                        );
                      })}

                      <td className="py-2 px-2 text-center font-mono font-semibold text-emerald-600">
                        {countP}
                      </td>
                      <td className="py-2 px-2 text-center font-mono font-semibold text-amber-600">
                        {countL}
                      </td>
                      <td className="py-2 px-2 text-center font-mono font-semibold text-orange-600">
                        {countHD}
                      </td>
                      <td className="py-2 px-2 text-center font-mono font-semibold text-rose-600">
                        {countA}
                      </td>
                      <td className="py-2 px-2 text-center font-mono font-semibold text-sky-600">
                        {countLV}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                        {(totalMins / 60).toFixed(1)}h
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. Regularization Requests View */}
      {/* ------------------------------------------------------------- */}
      {viewMode === 'regularizations' && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Attendance Regularization Requests
              </h3>
              <p className="text-xs text-neutral-500">
                Employee-submitted timestamp correction requests and reason justifications
              </p>
            </div>
            {isEmployee && (
              <button
                onClick={() => setIsRegModalOpen(true)}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs"
              >
                + Request Regularization
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 font-semibold border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Target Date</th>
                  <th className="py-3 px-4">Requested Punch</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                  <th className="py-3 px-4">Submitted At</th>
                  <th className="py-3 px-4">Status</th>
                  {canApprove && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {visibleRegularizations.length === 0 ? (
                  <tr>
                    <td colSpan={canApprove ? 7 : 6} className="py-12 text-center text-neutral-400">
                      No regularization requests recorded.
                    </td>
                  </tr>
                ) : (
                  visibleRegularizations.map((reg) => {
                    const emp = employees.find((e) => e.id === reg.employeeId);
                    return (
                      <tr
                        key={reg.id}
                        className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {emp?.name || reg.employeeId}
                          </p>
                          <span className="text-[11px] text-neutral-400 font-mono">
                            {reg.employeeId}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-medium">{reg.date}</td>
                        <td className="py-3.5 px-4 font-mono text-indigo-600 dark:text-indigo-400">
                          {reg.requestedCheckIn} – {reg.requestedCheckOut}
                          {(reg.currentCheckIn || reg.currentCheckOut) && (
                            <span className="block text-[10px] text-neutral-400">
                              was {reg.currentCheckIn || '—'} – {reg.currentCheckOut || '—'}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-300 max-w-xs">
                          <p className="line-clamp-2">{reg.reason}</p>
                          {reg.reviewedBy && (
                            <span className="text-[11px] text-neutral-400 block mt-0.5">
                              Reviewed by {reg.reviewedBy}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-neutral-500 font-mono text-[11px]">
                          {reg.createdAt?.slice(0, 10)}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge status={reg.status} />
                        </td>
                        {canApprove && (
                          <td className="py-3.5 px-4 text-right">
                            {reg.status === 'Pending' ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleReviewRegularization(reg, 'Approved')}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold flex items-center gap-1 shadow-xs"
                                >
                                  <Check className="w-3 h-3" /> Approve
                                </button>
                                <button
                                  onClick={() => handleReviewRegularization(reg, 'Rejected')}
                                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-semibold flex items-center gap-1 shadow-xs"
                                >
                                  <X className="w-3 h-3" /> Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-neutral-400 text-xs">Closed</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Modal: Edit / Manual Override Record */}
      {/* ------------------------------------------------------------- */}
      {editingRecord && (
        <Modal
          isOpen={Boolean(editingRecord)}
          onClose={() => setEditingRecord(null)}
          title={`Edit Attendance: ${editingRecord.employeeName}`}
          subtitle={`Date: ${editingRecord.date}`}
          maxWidth="md"
        >
          <form onSubmit={handleSaveOverride} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Check-In Time
                </label>
                <input
                  type="time"
                  value={editingRecord.checkIn}
                  disabled={editingRecord.status !== '' && !TIMED_STATUSES.includes(editingRecord.status)}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, checkIn: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Check-Out Time
                </label>
                <input
                  type="time"
                  value={editingRecord.checkOut}
                  disabled={editingRecord.status !== '' && !TIMED_STATUSES.includes(editingRecord.status)}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, checkOut: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Status Override
              </label>
              <select
                value={editingRecord.status}
                onChange={(e) =>
                  setEditingRecord({
                    ...editingRecord,
                    status: e.target.value as AttendanceStatus | '',
                  })
                }
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              >
                <option value="">Auto (from check-in / check-out)</option>
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Half Day">Half Day</option>
                <option value="Absent">Absent</option>
                <option value="On Leave">On Leave</option>
                <option value="Holiday">Holiday</option>
                <option value="Weekend">Weekend</option>
              </select>
              <p className="text-[11px] text-neutral-400 mt-1">
                {editingRecord.status === ''
                  ? 'Present, Late or Half Day is worked out from the times and shift rules. Leave check-out empty if they have not left yet.'
                  : TIMED_STATUSES.includes(editingRecord.status)
                  ? 'This status is kept as chosen; the times still set worked hours and overtime.'
                  : 'No times are recorded for this status.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Reason / Override Note
              </label>
              <textarea
                rows={2}
                value={editingRecord.notes}
                onChange={(e) =>
                  setEditingRecord({ ...editingRecord, notes: e.target.value })
                }
                placeholder="Reason for manual adjustment..."
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
              >
                Save Attendance Record
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Modal: Bulk Attendance Marker */}
      {/* ------------------------------------------------------------- */}
      {isBulkModalOpen && (
        <Modal
          isOpen={isBulkModalOpen}
          onClose={() => setIsBulkModalOpen(false)}
          title="Mark Bulk Attendance"
          subtitle="Mark everyone not yet marked. Existing records, off days and leave are left alone."
          maxWidth="md"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Date
              </label>
              <input
                type="date"
                value={bulkDate}
                max={today}
                onChange={(e) => setBulkDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Target Department
              </label>
              <select
                value={bulkDept}
                onChange={(e) => setBulkDept(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              >
                <option value="">All Departments (Entire Company)</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Check-In Time
                </label>
                <input
                  type="time"
                  value={bulkCheckIn}
                  onChange={(e) => setBulkCheckIn(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Check-Out Time
                </label>
                <input
                  type="time"
                  value={bulkCheckOut}
                  onChange={(e) => setBulkCheckOut(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyBulk}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
              >
                Apply to Staff
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Modal: Request Regularization (Employee) */}
      {/* ------------------------------------------------------------- */}
      {isRegModalOpen && (
        <Modal
          isOpen={isRegModalOpen}
          onClose={() => setIsRegModalOpen(false)}
          title="Submit Attendance Correction"
          subtitle="Request adjustment for missed punch or machine error"
          maxWidth="md"
        >
          <form onSubmit={handleSubmitRegularization} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Correction Date *
              </label>
              <input
                type="date"
                required
                max={today}
                value={regForm.date}
                onChange={(e) => setRegForm({ ...regForm, date: e.target.value })}
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Actual Check-In *
                </label>
                <input
                  type="time"
                  required
                  value={regForm.requestedCheckIn}
                  onChange={(e) =>
                    setRegForm({ ...regForm, requestedCheckIn: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Actual Check-Out *
                </label>
                <input
                  type="time"
                  required
                  value={regForm.requestedCheckOut}
                  onChange={(e) =>
                    setRegForm({ ...regForm, requestedCheckOut: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Reason & Justification *
              </label>
              <textarea
                required
                rows={3}
                value={regForm.reason}
                onChange={(e) => setRegForm({ ...regForm, reason: e.target.value })}
                placeholder="Explain why the punch was missing or incorrect..."
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setIsRegModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
              >
                Submit Request
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
