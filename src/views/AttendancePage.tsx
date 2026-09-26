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
import { AttendanceRecord, AttendanceStatus, Employee, RegularizationRequest, Shift } from '../types';
import { storageService } from '../services/storageService';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { evaluateAttendanceStatus } from '../utils/attendanceEngine';
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
  const [selectedDate, setSelectedDate] = useState('2026-09-23');
  const [selectedMonth, setSelectedMonth] = useState('2026-09');
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
  const [shifts] = useState<Shift[]>(() => storageService.getShifts());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => storageService.getAttendance());
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
    status: AttendanceStatus;
    notes: string;
  } | null>(null);

  // New Regularization Modal (for Employee)
  const [isRegModalOpen, setIsRegModalOpen] = useState(false);
  const [regForm, setRegForm] = useState({
    date: '2026-09-22',
    requestedCheckIn: '09:00',
    requestedCheckOut: '18:00',
    reason: 'Biometric fingerprint scanner malfunction at front lobby.',
  });

  // Bulk Marker Modal
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkCheckIn, setBulkCheckIn] = useState('09:00');
  const [bulkCheckOut, setBulkCheckOut] = useState('18:00');
  const [bulkDept, setBulkDept] = useState('');

  const departments = ['Engineering', 'Human Resources', 'Finance', 'Sales', 'Operations'];

  const reloadData = () => {
    setAttendance(storageService.getAttendance());
    setRegularizations(storageService.getRegularizations());
  };

  // -------------------------------------------------------------
  // Daily View Computations
  // -------------------------------------------------------------
  const filteredEmployees = employees.filter((emp) => {
    if (isEmployee && emp.id !== (user?.employeeId || 'EMP-001')) return false;
    if (departmentFilter && emp.department !== departmentFilter) return false;
    return true;
  });

  const dailyRecordsMap = new Map<string, AttendanceRecord>();
  attendance
    .filter((r) => r.date === selectedDate)
    .forEach((r) => dailyRecordsMap.set(r.employeeId, r));

  // Handle Save Manual Override
  const handleSaveOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;

    const emp = employees.find((e) => e.id === editingRecord.employeeId);
    const shift = shifts.find((s) => s.id === emp?.shiftId) || shifts[0];

    const evaluation = evaluateAttendanceStatus(
      editingRecord.checkIn,
      editingRecord.checkOut,
      shift,
      editingRecord.date
    );

    const record: AttendanceRecord = {
      id: `att-${editingRecord.employeeId}-${editingRecord.date}`,
      employeeId: editingRecord.employeeId,
      date: editingRecord.date,
      checkIn: editingRecord.checkIn || undefined,
      checkOut: editingRecord.checkOut || undefined,
      status: editingRecord.status || evaluation.status,
      workedMinutes: evaluation.workedMinutes,
      overtimeMinutes: evaluation.overtimeMinutes,
      notes: editingRecord.notes,
    };

    storageService.saveOrUpdateAttendanceRecord(record);
    success('Attendance Updated', `Saved record for ${editingRecord.employeeName}`);
    reloadData();
    setEditingRecord(null);
  };

  // Handle Bulk Attendance Mark
  const handleApplyBulk = () => {
    const targets = employees.filter((e) => !bulkDept || e.department === bulkDept);
    let count = 0;

    targets.forEach((emp) => {
      const shift = shifts.find((s) => s.id === emp.shiftId) || shifts[0];
      const evaluation = evaluateAttendanceStatus(
        bulkCheckIn,
        bulkCheckOut,
        shift,
        selectedDate
      );

      const record: AttendanceRecord = {
        id: `att-${emp.id}-${selectedDate}`,
        employeeId: emp.id,
        date: selectedDate,
        checkIn: bulkCheckIn,
        checkOut: bulkCheckOut,
        status: evaluation.status,
        workedMinutes: evaluation.workedMinutes,
        overtimeMinutes: evaluation.overtimeMinutes,
        notes: 'Bulk marked by administrator',
      };
      storageService.saveOrUpdateAttendanceRecord(record);
      count++;
    });

    success('Bulk Attendance Applied', `Updated attendance for ${count} employees.`);
    reloadData();
    setIsBulkModalOpen(false);
  };

  // Submit Regularization
  const handleSubmitRegularization = (e: React.FormEvent) => {
    e.preventDefault();
    const empId = user?.employeeId || 'EMP-001';

    const newReq: RegularizationRequest = {
      id: `reg-${Date.now()}`,
      employeeId: empId,
      date: regForm.date,
      requestedCheckIn: regForm.requestedCheckIn,
      requestedCheckOut: regForm.requestedCheckOut,
      reason: regForm.reason,
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
    const rows = attendance
      .filter((r) => r.date.startsWith(selectedMonth))
      .map((r) => {
        const emp = employees.find((e) => e.id === r.employeeId);
        return [
          r.employeeId,
          `"${emp?.name || ''}"`,
          emp?.department || '',
          r.date,
          r.checkIn || '',
          r.checkOut || '',
          r.status,
          (r.workedMinutes / 60).toFixed(1),
          (r.overtimeMinutes / 60).toFixed(1),
        ].join(',');
      });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `WorkPulse_Attendance_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
              {regularizations.filter((r) => r.status === 'Pending').length > 0 && (
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
                onClick={() => setIsBulkModalOpen(true)}
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
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-500">Month:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
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
          <div className="flex items-center gap-3 text-xs text-neutral-500 font-medium">
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
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" /> LV (Leave)
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
                {filteredEmployees.map((emp) => {
                  const rec = dailyRecordsMap.get(emp.id);
                  const shift = shifts.find((s) => s.id === emp.shiftId);

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
                        <Badge status={rec?.status || 'Absent'} />
                      </td>
                      {canMark && (
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() =>
                              setEditingRecord({
                                employeeId: emp.id,
                                employeeName: emp.name,
                                date: selectedDate,
                                checkIn: rec?.checkIn || '09:00',
                                checkOut: rec?.checkOut || '18:00',
                                status: rec?.status || 'Present',
                                notes: rec?.notes || '',
                              })
                            }
                            className="p-1.5 text-neutral-400 hover:text-indigo-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
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
                    return (
                      <th
                        key={dStr}
                        className={`py-2 px-1 text-center w-8 min-w-8 text-[11px] font-mono ${
                          isWk ? 'bg-neutral-100 dark:bg-neutral-800/80 text-neutral-400' : ''
                        }`}
                        title={dStr}
                      >
                        {dayNum}
                      </th>
                    );
                  })}
                  <th className="py-3 px-2 text-center text-emerald-600 font-bold">P</th>
                  <th className="py-3 px-2 text-center text-amber-600 font-bold">L</th>
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

                  let countP = 0;
                  let countL = 0;
                  let countA = 0;
                  let countLV = 0;
                  let totalMins = 0;

                  empRecords.forEach((r) => {
                    if (r.status === 'Present') countP++;
                    else if (r.status === 'Late') countL++;
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
                        const isWeekend = dow === 0 || dow === 6;

                        let symbol = '—';
                        let colorClass = 'text-neutral-300 dark:text-neutral-600';

                        if (rec) {
                          if (rec.status === 'Present') {
                            symbol = 'P';
                            colorClass =
                              'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold';
                          } else if (rec.status === 'Late') {
                            symbol = 'L';
                            colorClass =
                              'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 font-bold';
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
                        } else if (isWeekend) {
                          symbol = 'W';
                          colorClass = 'text-neutral-400 dark:text-neutral-600';
                        }

                        return (
                          <td
                            key={dStr}
                            onClick={() => {
                              if (canMark) {
                                setEditingRecord({
                                  employeeId: emp.id,
                                  employeeName: emp.name,
                                  date: dStr,
                                  checkIn: rec?.checkIn || '09:00',
                                  checkOut: rec?.checkOut || '18:00',
                                  status: rec?.status || 'Present',
                                  notes: rec?.notes || '',
                                });
                              }
                            }}
                            className={`p-0.5 text-center cursor-pointer ${
                              isWeekend ? 'bg-neutral-50 dark:bg-neutral-800/40' : ''
                            }`}
                            title={`${emp.name} · ${dStr}\nStatus: ${rec?.status || 'Unrecorded'}\nCheck-in: ${
                              rec?.checkIn || '—'
                            } | Out: ${rec?.checkOut || '—'}`}
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
                {regularizations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-neutral-400">
                      No regularization requests recorded.
                    </td>
                  </tr>
                ) : (
                  regularizations.map((reg) => {
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
                    status: e.target.value as AttendanceStatus,
                  })
                }
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              >
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Half Day">Half Day</option>
                <option value="Absent">Absent</option>
                <option value="On Leave">On Leave</option>
                <option value="Holiday">Holiday</option>
                <option value="Weekend">Weekend</option>
              </select>
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
          subtitle={`Batch mark attendance for ${selectedDate}`}
          maxWidth="md"
        >
          <div className="space-y-4">
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
