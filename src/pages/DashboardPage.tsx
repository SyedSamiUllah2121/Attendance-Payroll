import React, { useState, useEffect } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  CalendarCheck,
  Clock,
  DollarSign,
  TrendingUp,
  MapPin,
  CheckCircle2,
  Calendar,
  Gift,
  Award,
  ArrowRight,
  Download,
  AlertCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import { storageService } from '../services/storageService';
import {
  AttendanceRecord,
  Employee,
  Holiday,
  LeaveRequest,
  PayrollRun,
  RegularizationRequest,
} from '../types';
import { Badge } from '../components/common/Badge';

interface DashboardProps {
  onNavigate?: (tab: string) => void;
  onNavigateTab?: (tab: string) => void;
  onOpenPayslip?: (employeeId: string) => void;
}

export const DashboardPage: React.FC<DashboardProps> = ({
  onNavigate,
  onNavigateTab: propOnNavigateTab,
  onOpenPayslip,
}) => {
  const onNavigateTab = onNavigate || propOnNavigateTab || (() => {});
  const { user, isEmployee } = useAuth();
  const { formatMoney, settings } = useSettings();
  const { success, warning, error } = useNotification();

  // State
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [regularizations, setRegularizations] = useState<RegularizationRequest[]>([]);
  const [payrolls, setPayrolls] = useState<PayrollRun[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  // Live timer for check-in
  const [currentTime, setCurrentTime] = useState(new Date());
  const [geoLoc, setGeoLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = () => {
    setEmployees(storageService.getEmployees());
    setAttendance(storageService.getAttendance());
    setLeaves(storageService.getLeaves());
    setRegularizations(storageService.getRegularizations());
    setPayrolls(storageService.getPayrolls());
    setHolidays(storageService.getHolidays());
  };

  useEffect(() => {
    loadData();
  }, []);

  // Today's date string
  const todayStr = '2026-09-23';

  // Current employee if role is employee
  const currentEmployee = employees.find(
    (e) => e.id === (user?.employeeId || 'EMP-001')
  );

  // Today's record for employee
  const todayRecord = attendance.find(
    (r) => r.employeeId === (currentEmployee?.id || 'EMP-001') && r.date === todayStr
  );

  // Handle Geolocation capture
  const handleCaptureLocation = () => {
    if (!navigator.geolocation) {
      error('Geolocation not supported', 'Your browser does not support GPS location.');
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGettingLocation(false);
        success('Location Captured', `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      },
      () => {
        // Fallback for sandboxes or denied permission
        setGeoLoc({ lat: 24.8607, lng: 67.0011 });
        setGettingLocation(false);
        warning('Simulated Location', 'GPS permission denied/sandbox; using office coordinates.');
      },
      { timeout: 5000 }
    );
  };

  // Handle Check In / Check Out
  const handleToggleCheckInOut = () => {
    if (!currentEmployee) return;

    const timeStr = `${String(currentTime.getHours()).padStart(2, '0')}:${String(
      currentTime.getMinutes()
    ).padStart(2, '0')}`;

    if (!todayRecord || !todayRecord.checkIn) {
      // Perform Check-in
      const newRecord: AttendanceRecord = {
        id: `att-${currentEmployee.id}-${todayStr}`,
        employeeId: currentEmployee.id,
        date: todayStr,
        checkIn: timeStr,
        checkInLocation: geoLoc ? { ...geoLoc, address: 'Office Floor 4, Karachi' } : undefined,
        status: currentTime.getHours() >= 9 && currentTime.getMinutes() > 15 ? 'Late' : 'Present',
        workedMinutes: 0,
        overtimeMinutes: 0,
        isEarlyDeparture: false,
      };
      storageService.saveOrUpdateAttendanceRecord(newRecord);
      success('Check-in Recorded', `Checked in at ${timeStr}`);
      loadData();
    } else if (!todayRecord.checkOut) {
      // Perform Check-out
      const [inH, inM] = todayRecord.checkIn.split(':').map(Number);
      const diffMins = Math.max(0, (currentTime.getHours() - inH) * 60 + (currentTime.getMinutes() - inM));
      const workedMins = Math.max(0, diffMins - 60); // 60m break
      const otMins = workedMins > 480 ? workedMins - 480 : 0;

      const updated: AttendanceRecord = {
        ...todayRecord,
        checkOut: timeStr,
        workedMinutes: workedMins,
        overtimeMinutes: otMins >= 30 ? otMins : 0,
        status: workedMins < 270 ? 'Half Day' : todayRecord.status,
      };
      storageService.saveOrUpdateAttendanceRecord(updated);
      success('Check-out Recorded', `Checked out at ${timeStr}. Total worked: ${(workedMins / 60).toFixed(1)} hrs`);
      loadData();
    } else {
      warning('Already Completed', 'You have already checked out for today.');
    }
  };

  // Elapsed worked timer calculation
  let elapsedFormatted = '00:00:00';
  if (todayRecord?.checkIn && !todayRecord?.checkOut) {
    const [inH, inM] = todayRecord.checkIn.split(':').map(Number);
    const inDate = new Date();
    inDate.setHours(inH, inM, 0);
    const diffSecs = Math.max(0, Math.floor((currentTime.getTime() - inDate.getTime()) / 1000));
    const hours = Math.floor(diffSecs / 3600);
    const mins = Math.floor((diffSecs % 3600) / 60);
    const secs = diffSecs % 60;
    elapsedFormatted = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(
      secs
    ).padStart(2, '0')}`;
  } else if (todayRecord?.checkOut && todayRecord?.workedMinutes) {
    const hours = Math.floor(todayRecord.workedMinutes / 60);
    const mins = todayRecord.workedMinutes % 60;
    elapsedFormatted = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
  }

  // --- Calculations for Admin / HR Dashboard ---
  const todayAttendance = attendance.filter((r) => r.date === todayStr);
  const presentTodayCount = todayAttendance.filter(
    (r) => r.status === 'Present' || r.status === 'Late'
  ).length;
  const lateTodayCount = todayAttendance.filter((r) => r.status === 'Late').length;
  const onLeaveTodayCount = todayAttendance.filter((r) => r.status === 'On Leave').length;
  const absentTodayCount = employees.length - presentTodayCount - onLeaveTodayCount;

  // Last 30 days attendance trend
  const last30Dates = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(2026, 8, 23 - (29 - i));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });

  const attendanceTrendData = last30Dates.map((dStr) => {
    const dayRecords = attendance.filter(
      (r) => r.date === dStr && r.status !== 'Weekend' && r.status !== 'Holiday'
    );
    const present = dayRecords.filter((r) => r.status === 'Present').length;
    const late = dayRecords.filter((r) => r.status === 'Late').length;
    const absent = dayRecords.filter((r) => r.status === 'Absent').length;
    return {
      date: dStr.slice(5),
      present,
      late,
      absent,
    };
  });

  // Department headcount
  const deptCountMap: Record<string, number> = {};
  employees.forEach((e) => {
    deptCountMap[e.department] = (deptCountMap[e.department] || 0) + 1;
  });
  const deptHeadcountData = Object.keys(deptCountMap).map((dept) => ({
    name: dept,
    value: deptCountMap[dept],
  }));

  const DEPT_COLORS = ['#4F46E5', '#06B6D4', '#10B981', '#F59E0B', '#EC4899'];

  // Monthly payroll cost for last 6 months
  const monthlyPayrollData = payrolls.map((p) => ({
    month: p.month,
    gross: p.totalGross,
    net: p.totalNet,
  }));

  // Pending items
  const pendingLeaves = leaves.filter((l) => l.status === 'Pending');
  const pendingRegs = regularizations.filter((r) => r.status === 'Pending');

  // Employee's personal monthly summary (September 2026)
  const empMonthRecords = attendance.filter(
    (r) => r.employeeId === (currentEmployee?.id || 'EMP-001') && r.date.startsWith('2026-09')
  );
  const empPresentDays = empMonthRecords.filter(
    (r) => r.status === 'Present' || r.status === 'Late'
  ).length;
  const empLateDays = empMonthRecords.filter((r) => r.status === 'Late').length;
  const empAbsentDays = empMonthRecords.filter((r) => r.status === 'Absent').length;
  const empLeavesTaken = leaves
    .filter((l) => l.employeeId === currentEmployee?.id && l.status === 'Approved')
    .reduce((acc, l) => acc + l.daysCount, 0);
  const empOTMinutes = empMonthRecords.reduce((acc, r) => acc + (r.overtimeMinutes || 0), 0);

  // Latest payslip for employee
  const latestPayroll = payrolls[payrolls.length - 1];
  const myPayslipItem = latestPayroll?.items.find((i) => i.employeeId === currentEmployee?.id);

  // -------------------------------------------------------------
  // Render Employee Dashboard
  // -------------------------------------------------------------
  if (isEmployee) {
    return (
      <div className="space-y-6">
        {/* Top welcome greeting */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Welcome back, {currentEmployee?.name || 'Ali'}!
            </h1>
            <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              {currentEmployee?.designation} · {currentEmployee?.department} · Today is Wednesday, Sept 23, 2026
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('leaves')}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 self-start sm:self-auto"
          >
            <CalendarCheck className="w-4 h-4" /> Apply for Leave
          </button>
        </div>

        {/* Big Interactive Check In / Check Out Card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Live Attendance Punch
                </p>
                <h3 className="text-3xl font-mono font-bold text-neutral-900 dark:text-neutral-100 mt-1 tabular-nums">
                  {currentTime.toLocaleTimeString()}
                </h3>
              </div>
              <div className="text-right">
                <span className="text-xs font-medium text-neutral-400">Scheduled Shift</span>
                <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                  09:00 – 18:00 (Morning)
                </p>
              </div>
            </div>

            {/* Middle: Status & Worked Timer */}
            <div className="my-6 p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-100 dark:border-neutral-800 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <span className="text-xs text-neutral-400">Check-in</span>
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 font-mono tabular-nums">
                  {todayRecord?.checkIn || '—'}
                </p>
              </div>
              <div>
                <span className="text-xs text-neutral-400">Check-out</span>
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 font-mono tabular-nums">
                  {todayRecord?.checkOut || '—'}
                </p>
              </div>
              <div>
                <span className="text-xs text-neutral-400">Today's Worked</span>
                <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 font-mono tabular-nums">
                  {elapsedFormatted}
                </p>
              </div>
              <div>
                <span className="text-xs text-neutral-400">Status</span>
                <div className="mt-0.5">
                  <Badge status={todayRecord?.status || 'Not Checked In'} />
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <button
                  onClick={handleCaptureLocation}
                  disabled={gettingLocation}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                  {geoLoc ? 'GPS Locked' : gettingLocation ? 'Detecting GPS...' : 'Capture GPS'}
                </button>
                {geoLoc && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                  </span>
                )}
              </div>

              <button
                onClick={handleToggleCheckInOut}
                disabled={Boolean(todayRecord?.checkOut)}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 ${
                  !todayRecord?.checkIn
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : !todayRecord?.checkOut
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
                }`}
              >
                <Clock className="w-4 h-4" />
                {!todayRecord?.checkIn
                  ? 'Punch Check In'
                  : !todayRecord?.checkOut
                  ? 'Punch Check Out'
                  : 'Completed for Today'}
              </button>
            </div>
          </div>

          {/* Leave Balances card */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                My Leave Balances (2026)
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Annual entitlements & used days
              </p>
            </div>

            <div className="space-y-4 my-4">
              {/* Annual Leave */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">
                    Annual Leave
                  </span>
                  <span className="font-mono text-neutral-500">9 left / 14</span>
                </div>
                <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                  <div className="h-full bg-indigo-600 rounded-full w-[64%]" />
                </div>
              </div>

              {/* Sick Leave */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">
                    Sick Leave
                  </span>
                  <span className="font-mono text-neutral-500">8 left / 10</span>
                </div>
                <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full w-[80%]" />
                </div>
              </div>

              {/* Casual Leave */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">
                    Casual Leave
                  </span>
                  <span className="font-mono text-neutral-500">7 left / 8</span>
                </div>
                <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full w-[87%]" />
                </div>
              </div>
            </div>

            <button
              onClick={() => onNavigateTab('leaves')}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium flex items-center justify-between"
            >
              <span>View full leave history</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* This Month's Summary KPIs */}
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
            September 2026 Attendance Summary
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-xs text-neutral-400">Present Days</span>
              <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                {empPresentDays}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-xs text-neutral-400">Late Arrivals</span>
              <p className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
                {empLateDays}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-xs text-neutral-400">Absent Days</span>
              <p className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
                {empAbsentDays}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-xs text-neutral-400">Leaves Taken</span>
              <p className="text-xl font-bold font-mono text-sky-600 dark:text-sky-400 mt-1">
                {empLeavesTaken}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-xs text-neutral-400">Overtime Hours</span>
              <p className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
                {(empOTMinutes / 60).toFixed(1)}h
              </p>
            </div>
          </div>
        </div>

        {/* Latest Payslip Summary */}
        <div className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Latest Processed Payslip
            </span>
            <h4 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {latestPayroll ? `August 2026 Pay Period` : 'No Payslip Available'}
            </h4>
            {myPayslipItem && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Net Salary:{' '}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatMoney(myPayslipItem.netSalary)}
                </span>{' '}
                · Gross: {formatMoney(myPayslipItem.grossSalary)} · Tax Deducted:{' '}
                {formatMoney(myPayslipItem.incomeTax)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigateTab('payslips')}
              className="px-4 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-200 transition-colors"
            >
              All Payslips
            </button>
            <button
              onClick={() => onOpenPayslip && onOpenPayslip(currentEmployee?.id || 'EMP-001')}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Download className="w-4 h-4" /> Download Payslip
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Render Admin / HR Dashboard
  // -------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Top greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Workforce Overview
          </h1>
          <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Real-time attendance & operational metrics · Wednesday, September 23, 2026
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigateTab('attendance')}
            className="px-3.5 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
          >
            Mark Bulk Attendance
          </button>
          <button
            onClick={() => onNavigateTab('payroll')}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
          >
            Process Payroll
          </button>
        </div>
      </div>

      {/* KPI Cards Row (6 metrics) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-xs font-medium">Total Staff</span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
            {employees.length}
          </p>
          <span className="text-[11px] text-neutral-400 mt-1 block">Active headcount</span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-xs font-medium">Present Today</span>
            <UserCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {presentTodayCount}
          </p>
          <span className="text-[11px] text-neutral-400 mt-1 block">
            {Math.round((presentTodayCount / (employees.length || 1)) * 100)}% attendance
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-xs font-medium">Late Arrivals</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {lateTodayCount}
          </p>
          <span className="text-[11px] text-neutral-400 mt-1 block">Past grace window</span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-xs font-medium">On Leave</span>
            <CalendarCheck className="w-4 h-4 text-sky-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-sky-600 dark:text-sky-400">
            {onLeaveTodayCount}
          </p>
          <span className="text-[11px] text-neutral-400 mt-1 block">Approved absences</span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-xs font-medium">Absent Today</span>
            <UserX className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
            {absentTodayCount}
          </p>
          <span className="text-[11px] text-neutral-400 mt-1 block">Unscheduled absent</span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-xs font-medium">Last Payroll</span>
            <DollarSign className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-base font-bold font-mono text-neutral-900 dark:text-neutral-100 truncate">
            {formatMoney(latestPayroll?.totalNet || 0)}
          </p>
          <span className="text-[11px] text-neutral-400 mt-1 block">August 2026 Net</span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance trend (30 days) */}
        <div className="lg:col-span-2 bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Attendance Trends (Last 30 Days)
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Daily present vs late arrivals vs absences
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium">
              <span className="flex items-center gap-1.5 text-emerald-600">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Present
              </span>
              <span className="flex items-center gap-1.5 text-amber-600">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Late
              </span>
              <span className="flex items-center gap-1.5 text-rose-600">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Absent
              </span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={attendanceTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(23, 23, 23, 0.95)',
                    borderColor: 'rgba(64, 64, 64, 0.5)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Line type="monotone" dataKey="present" stroke="#10B981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="late" stroke="#F59E0B" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="absent" stroke="#EF4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Department headcount donut */}
        <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Department Headcount
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Distribution across active departments
            </p>
          </div>
          <div className="h-48 w-full my-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={deptHeadcountData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {deptHeadcountData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={DEPT_COLORS[index % DEPT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(23, 23, 23, 0.95)',
                    borderColor: 'rgba(64, 64, 64, 0.5)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {deptHeadcountData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5 truncate">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }}
                />
                <span className="truncate text-neutral-600 dark:text-neutral-400">
                  {d.name}: <strong className="text-neutral-900 dark:text-neutral-100">{d.value}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Monthly Payroll Bar Chart & Pending Approvals Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Payroll Cost (6 months) */}
        <div className="lg:col-span-2 bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Monthly Payroll Cost (Last 6 Months)
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Gross disbursements vs Net salary payouts
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('payroll')}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
            >
              Payroll History →
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyPayrollData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(val: any) => formatMoney(val)}
                  contentStyle={{
                    backgroundColor: 'rgba(23, 23, 23, 0.95)',
                    borderColor: 'rgba(64, 64, 64, 0.5)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="gross" fill="#6366F1" radius={[4, 4, 0, 0]} name="Gross" />
                <Bar dataKey="net" fill="#10B981" radius={[4, 4, 0, 0]} name="Net Paid" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pending Approvals Widget */}
        <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Pending Approvals
              </h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                {pendingLeaves.length + pendingRegs.length}
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
              Action items awaiting HR/Admin review
            </p>

            <div className="space-y-2.5 max-h-52 overflow-y-auto">
              {pendingLeaves.length === 0 && pendingRegs.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-60" />
                  No pending approval requests.
                </div>
              ) : (
                <>
                  {pendingLeaves.map((l) => (
                    <div
                      key={l.id}
                      className="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs"
                    >
                      <div className="truncate pr-2">
                        <p className="font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                          {l.employeeId} · {l.leaveType}
                        </p>
                        <span className="text-[11px] text-neutral-500">
                          {l.fromDate} ({l.daysCount}d)
                        </span>
                      </div>
                      <button
                        onClick={() => onNavigateTab('leaves')}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium shrink-0"
                      >
                        Review
                      </button>
                    </div>
                  ))}

                  {pendingRegs.map((r) => (
                    <div
                      key={r.id}
                      className="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs"
                    >
                      <div className="truncate pr-2">
                        <p className="font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                          {r.employeeId} · Regularization
                        </p>
                        <span className="text-[11px] text-neutral-500">{r.date}</span>
                      </div>
                      <button
                        onClick={() => onNavigateTab('attendance')}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium shrink-0"
                      >
                        Review
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Upcoming Holidays & Anniversaries widget */}
          <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800">
            <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Upcoming Holidays & Events
            </h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-neutral-700 dark:text-neutral-300">
                <span className="flex items-center gap-1.5 truncate">
                  <Gift className="w-3.5 h-3.5 text-pink-500" /> Ayesha Malik's Birthday
                </span>
                <span className="text-[11px] text-neutral-400">Nov 5</span>
              </div>
              <div className="flex items-center justify-between text-neutral-700 dark:text-neutral-300">
                <span className="flex items-center gap-1.5 truncate">
                  <Award className="w-3.5 h-3.5 text-amber-500" /> Fatima Noor (7-Yr Anniversary)
                </span>
                <span className="text-[11px] text-neutral-400">Nov 11</span>
              </div>
              <div className="flex items-center justify-between text-neutral-700 dark:text-neutral-300">
                <span className="flex items-center gap-1.5 truncate">
                  <Calendar className="w-3.5 h-3.5 text-sky-500" /> Iqbal Day (Public Holiday)
                </span>
                <span className="text-[11px] text-neutral-400">Nov 9</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Live Attendance Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Today's Live Attendance Register
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Live check-ins for Wednesday, September 23, 2026
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('attendance')}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
          >
            Full Attendance Sheet →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400 font-semibold border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Shift</th>
                <th className="py-3 px-4">Check-in</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {employees.slice(0, 8).map((emp) => {
                const rec = todayAttendance.find((r) => r.employeeId === emp.id);
                return (
                  <tr
                    key={emp.id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center font-bold text-neutral-700 dark:text-neutral-300">
                          {emp.name[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {emp.name}
                          </p>
                          <p className="text-[11px] text-neutral-400">{emp.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-neutral-600 dark:text-neutral-300">
                      {emp.department}
                    </td>
                    <td className="py-3 px-4 text-neutral-500">
                      {emp.shiftId === 'shift-morning'
                        ? '09:00 - 18:00'
                        : emp.shiftId === 'shift-evening'
                        ? '14:00 - 23:00'
                        : '10:00 - 16:00'}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-neutral-800 dark:text-neutral-200">
                      {rec?.checkIn || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <Badge status={rec?.status || 'Absent'} />
                    </td>
                    <td className="py-3 px-4 text-neutral-400 text-[11px] truncate max-w-xs">
                      {rec?.checkInLocation?.address || 'Main Office Gate'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
