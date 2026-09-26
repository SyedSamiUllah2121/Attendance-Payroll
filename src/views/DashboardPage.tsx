import React, { useState, useEffect, useMemo } from 'react';
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
import { axisProps, barAnimation, barCursor, chartAnimation, lineCursor, pieAnimation, tooltipStyle } from '../utils/chartTheme';
import { Modal } from '../components/common/Modal';
import { AnimatedNumber } from '../components/common/AnimatedNumber';
import { formatTime12 } from '../components/common/TimeInput';

type DayCategory = 'present' | 'late' | 'leave' | 'absent' | 'notMarked' | 'off';

const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatLongDate = (dateStr: string) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

const formatMonth = (month: string) =>
  new Date(month + '-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

const DRILL_META: Record<Exclude<DayCategory, 'off'>, { title: string; empty: string }> = {
  present: { title: 'Present', empty: 'Nobody is marked present.' },
  late: { title: 'Late Arrivals', empty: 'No late arrivals.' },
  leave: { title: 'On Leave', empty: 'Nobody is on leave.' },
  absent: { title: 'Absent', empty: 'Nobody is absent.' },
  notMarked: { title: 'Not Marked Yet', empty: 'Everyone has been marked.' },
};

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
  const { user, can } = useAuth();
  // Staff with company-wide access get the workforce overview; everyone else a personal dashboard
  const isEmployee = !can('dashboard.org');
  const { formatMoney, settings } = useSettings();
  const { success, warning, error } = useNotification();

  // State
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [regularizations, setRegularizations] = useState<RegularizationRequest[]>([]);
  const [payrolls, setPayrolls] = useState<PayrollRun[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [shifts] = useState(() => storageService.getShifts());

  // Live timer for check-in
  const [currentTime, setCurrentTime] = useState(new Date());
  const [geoLoc, setGeoLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  // The clock only drives the personal check-in card; ticking on the workforce dashboard
  // re-rendered it every second and kept restarting the chart animations.
  useEffect(() => {
    if (!isEmployee) return;
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [isEmployee]);

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

  // Today's date string (local time)
  const todayStr = toDateStr(new Date());

  // HR dashboard: which day the KPI cards describe, and which card's list is open
  const [viewDate, setViewDate] = useState(todayStr);
  const [drill, setDrill] = useState<DayCategory | null>(null);
  const [drillDept, setDrillDept] = useState('');

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
  const todayAttendance = attendance.filter((r) => r.date === viewDate);
  const activeEmployees = employees.filter((e) => e.status === 'Active');
  const viewHoliday = holidays.find((h) => h.date === viewDate);
  const viewDow = new Date(viewDate + 'T00:00:00').getDay();

  // Classify every active employee for the chosen day from their record, approved leave,
  // holidays and shift days. Past days with no record count as absent; today is "not marked yet".
  const dayRows = activeEmployees.map((emp) => {
    const rec = todayAttendance.find((r) => r.employeeId === emp.id);
    const leave = leaves.find(
      (l) =>
        l.employeeId === emp.id &&
        l.status === 'Approved' &&
        l.fromDate <= viewDate &&
        l.toDate >= viewDate
    );
    const shift = shifts.find((s) => s.id === emp.shiftId);
    const worksToday = shift ? shift.workingDays.includes(viewDow) : viewDow >= 1 && viewDow <= 5;
    let category: DayCategory;
    if (rec) {
      if (rec.status === 'Present' || rec.status === 'Half Day') category = 'present';
      else if (rec.status === 'Late') category = 'late';
      else if (rec.status === 'On Leave') category = 'leave';
      else if (rec.status === 'Absent') category = 'absent';
      else category = 'off';
    } else if (leave) category = 'leave';
    else if (viewHoliday || !worksToday) category = 'off';
    else category = viewDate < todayStr ? 'absent' : 'notMarked';
    return { emp, rec, leave, category };
  });

  const countOf = (c: DayCategory) => dayRows.filter((r) => r.category === c).length;
  const lateTodayCount = countOf('late');
  const presentTodayCount = countOf('present') + lateTodayCount;
  const onLeaveTodayCount = countOf('leave');
  const absentTodayCount = countOf('absent');
  const notMarkedCount = countOf('notMarked');
  const offCount = countOf('off');
  const scheduledCount = activeEmployees.length - offCount;

  const inCategory = (c: DayCategory, cat: DayCategory) =>
    cat === 'present' ? c === 'present' || c === 'late' : c === cat;

  // Rows for the open card, before and after the department filter (sorted by department, then name)
  const drillAllDepts = drill
    ? dayRows
        .filter((r) => inCategory(r.category, drill))
        .sort(
          (a, b) =>
            a.emp.department.localeCompare(b.emp.department) || a.emp.name.localeCompare(b.emp.name)
        )
    : [];
  const drillRows = drillAllDepts.filter((r) => !drillDept || r.emp.department === drillDept);

  // Department chips: every active department, with its count for the open card
  const drillDeptCounts = Array.from(new Set(activeEmployees.map((e) => e.department)))
    .sort()
    .map((dept) => ({
      dept,
      count: drillAllDepts.filter((r) => r.emp.department === dept).length,
      total: dayRows.filter((r) => r.emp.department === dept && r.category !== 'off').length,
    }));

  // Category tab counts follow the selected department
  const drillCatCount = (cat: DayCategory) =>
    dayRows.filter(
      (r) => inCategory(r.category, cat) && (!drillDept || r.emp.department === drillDept)
    ).length;

  const closeDrill = () => {
    setDrill(null);
    setDrillDept('');
  };

  // Chart data is memoized so the live clock's once-a-second re-render doesn't hand the
  // charts new arrays (which would restart their animations); they animate only on real changes.

  // Last 30 days attendance trend (ending on the chosen day)
  const attendanceTrendData = useMemo(() => {
    const [vy, vm, vd] = viewDate.split('-').map(Number);
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(vy, vm - 1, vd - (29 - i));
      const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayRecords = attendance.filter(
        (r) => r.date === dStr && r.status !== 'Weekend' && r.status !== 'Holiday'
      );
      return {
        date: dStr.slice(5),
        present: dayRecords.filter((r) => r.status === 'Present').length,
        late: dayRecords.filter((r) => r.status === 'Late').length,
        absent: dayRecords.filter((r) => r.status === 'Absent').length,
      };
    });
  }, [attendance, viewDate]);

  // Department headcount (active staff, matching the Total Staff card)
  const deptHeadcountData = useMemo(() => {
    const deptCountMap: Record<string, number> = {};
    employees
      .filter((e) => e.status === 'Active')
      .forEach((e) => {
        deptCountMap[e.department] = (deptCountMap[e.department] || 0) + 1;
      });
    return Object.keys(deptCountMap).map((dept) => ({ name: dept, value: deptCountMap[dept] }));
  }, [employees]);

  const DEPT_COLORS = ['#4F46E5', '#06B6D4', '#10B981', '#F59E0B', '#EC4899'];

  // Stable donut segments: new <Cell> elements on each render would restart the sweep
  const deptCells = useMemo(
    () =>
      deptHeadcountData.map((_, index) => (
        <Cell key={`cell-${index}`} fill={DEPT_COLORS[index % DEPT_COLORS.length]} />
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deptHeadcountData]
  );

  // Monthly payroll cost for last 6 months
  const monthlyPayrollData = useMemo(
    () => payrolls.map((p) => ({ month: p.month, gross: p.totalGross, net: p.totalNet })),
    [payrolls]
  );

  // Pending items
  const pendingLeaves = leaves.filter((l) => l.status === 'Pending');
  const pendingRegs = regularizations.filter((r) => r.status === 'Pending');

  // Employee's personal summary for the current month
  const empMonthRecords = attendance.filter(
    (r) => r.employeeId === (currentEmployee?.id || 'EMP-001') && r.date.startsWith(todayStr.slice(0, 7))
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
              {currentEmployee?.designation} · {currentEmployee?.department} · Today is {formatLongDate(todayStr)}
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
                My Leave Balances ({todayStr.slice(0, 4)})
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
            {formatMonth(todayStr.slice(0, 7))} Attendance Summary
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
              {latestPayroll ? `${formatMonth(latestPayroll.month)} Pay Period` : 'No Payslip Available'}
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
            Real-time attendance & operational metrics · {formatLongDate(viewDate)}
            {viewHoliday && (
              <span className="ml-2 px-2 py-0.5 rounded bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-[11px] font-semibold">
                Holiday: {viewHoliday.name}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
            <Calendar className="w-3.5 h-3.5 text-neutral-400" />
            <input
              type="date"
              value={viewDate}
              max={todayStr}
              onChange={(e) => e.target.value && setViewDate(e.target.value)}
              className="text-xs font-mono bg-transparent text-neutral-800 dark:text-neutral-200 focus:outline-none"
              aria-label="Dashboard date"
            />
            {viewDate !== todayStr && (
              <button
                onClick={() => setViewDate(todayStr)}
                className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Today
              </button>
            )}
          </div>
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

      {/* KPI Cards Row (6 metrics) — each opens the matching list or page */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: 'Total Staff',
            value: String(activeEmployees.length),
            hint: 'Active headcount · view directory',
            icon: Users,
            iconCls: 'text-indigo-500',
            valueCls: 'text-neutral-900 dark:text-neutral-100',
            onClick: () => onNavigateTab('employees'),
          },
          {
            label: viewDate === todayStr ? 'Present Today' : 'Present',
            value: String(presentTodayCount),
            hint: scheduledCount
              ? `${Math.round((presentTodayCount / scheduledCount) * 100)}% of ${scheduledCount} scheduled`
              : viewHoliday
              ? 'Holiday'
              : 'Non-working day',
            icon: UserCheck,
            iconCls: 'text-emerald-500',
            valueCls: 'text-emerald-600 dark:text-emerald-400',
            onClick: () => setDrill('present'),
          },
          {
            label: 'Late Arrivals',
            value: String(lateTodayCount),
            hint: 'Past grace window',
            icon: Clock,
            iconCls: 'text-amber-500',
            valueCls: 'text-amber-600 dark:text-amber-400',
            onClick: () => setDrill('late'),
          },
          {
            label: 'On Leave',
            value: String(onLeaveTodayCount),
            hint: 'Approved absences',
            icon: CalendarCheck,
            iconCls: 'text-sky-500',
            valueCls: 'text-sky-600 dark:text-sky-400',
            onClick: () => setDrill('leave'),
          },
          {
            label: viewDate === todayStr ? 'Absent Today' : 'Absent',
            value: String(absentTodayCount),
            hint: notMarkedCount ? `+${notMarkedCount} not marked yet` : 'Unscheduled absent',
            icon: UserX,
            iconCls: 'text-rose-500',
            valueCls: 'text-rose-600 dark:text-rose-400',
            onClick: () => setDrill(absentTodayCount === 0 && notMarkedCount ? 'notMarked' : 'absent'),
          },
          {
            label: 'Last Payroll',
            value: formatMoney(latestPayroll?.totalNet || 0),
            money: latestPayroll?.totalNet || 0,
            hint: latestPayroll ? `${formatMonth(latestPayroll.month)} Net · open payroll` : 'No payroll yet',
            icon: DollarSign,
            iconCls: 'text-indigo-500',
            valueCls: 'text-neutral-900 dark:text-neutral-100 !text-base truncate',
            onClick: () => onNavigateTab('payroll'),
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={card.onClick}
              className="group text-left p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <div className="flex items-center justify-between text-neutral-400 mb-1">
                <span className="text-xs font-medium">{card.label}</span>
                <Icon className={`w-4 h-4 ${card.iconCls}`} />
              </div>
              <p className={`text-2xl font-bold font-mono ${card.valueCls}`}>
                {/^d+$/.test(card.value) ? (
                  <AnimatedNumber value={Number(card.value)} />
                ) : card.money !== undefined ? (
                  <AnimatedNumber value={card.money} format={(n) => formatMoney(n)} />
                ) : (
                  card.value
                )}
              </p>
              <span className="text-[11px] text-neutral-400 mt-1 flex items-center justify-between gap-1">
                <span className="truncate">{card.hint}</span>
                <ArrowRight className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 text-indigo-500 transition-opacity" />
              </span>
            </button>
          );
        })}
      </div>

      {/* Drill-down: the real people behind a KPI card */}
      {drill && drill !== 'off' && (
        <Modal
          isOpen
          onClose={closeDrill}
          title={`${DRILL_META[drill].title}${drillDept ? ` · ${drillDept}` : ''} · ${drillRows.length}`}
          subtitle={formatLongDate(viewDate)}
          maxWidth="3xl"
        >
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            {(
              [
                ['present', drillCatCount('present')],
                ['late', drillCatCount('late')],
                ['leave', drillCatCount('leave')],
                ['absent', drillCatCount('absent')],
                ...(notMarkedCount ? [['notMarked', drillCatCount('notMarked')]] : []),
              ] as [Exclude<DayCategory, 'off'>, number][]
            ).map(([cat, n]) => (
              <button
                key={cat}
                onClick={() => setDrill(cat)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  drill === cat
                    ? 'bg-indigo-600 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                {DRILL_META[cat].title} ({n})
              </button>
            ))}
          </div>

          {/* Department-wise breakdown: click to filter */}
          <div className="mb-4 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              By department
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setDrillDept('')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  !drillDept
                    ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:border-neutral-100'
                    : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300'
                }`}
              >
                All departments <span className="font-mono opacity-70">({drillAllDepts.length})</span>
              </button>
              {drillDeptCounts.map(({ dept, count, total }) => (
                <button
                  key={dept}
                  onClick={() => setDrillDept(drillDept === dept ? '' : dept)}
                  title={`${count} of ${total} scheduled in ${dept}`}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    drillDept === dept
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : count
                      ? 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 hover:border-indigo-300 dark:hover:border-indigo-700'
                      : 'bg-white/60 dark:bg-neutral-900/60 text-neutral-400 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300'
                  }`}
                >
                  {dept}{' '}
                  <span className="font-mono opacity-80">
                    {count}
                    {total ? `/${total}` : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {drillRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-400">{DRILL_META[drill].empty}</p>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-800 text-neutral-500 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Employee</th>
                    <th className="py-2.5 px-3">Department</th>
                    {drill === 'leave' ? (
                      <>
                        <th className="py-2.5 px-3">Leave</th>
                        <th className="py-2.5 px-3">Dates</th>
                      </>
                    ) : (
                      <>
                        <th className="py-2.5 px-3">Check-in</th>
                        <th className="py-2.5 px-3">Check-out</th>
                        <th className="py-2.5 px-3">Worked</th>
                      </>
                    )}
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {drillRows.map(({ emp, rec, leave, category }, i) => (
                    <React.Fragment key={emp.id}>
                    {!drillDept && emp.department !== drillRows[i - 1]?.emp.department && (
                      <tr className="bg-neutral-50/80 dark:bg-neutral-800/50">
                        <td colSpan={6} className="py-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                          {emp.department}
                          <span className="ml-1.5 font-mono normal-case text-neutral-400">
                            {drillRows.filter((r) => r.emp.department === emp.department).length}
                          </span>
                        </td>
                      </tr>
                    )}
                    <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-neutral-900 dark:text-neutral-100">{emp.name}</p>
                        <p className="text-[11px] text-neutral-400 font-mono">{emp.id}</p>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-600 dark:text-neutral-300">
                        {emp.department}
                        <p className="text-[11px] text-neutral-400">{emp.designation}</p>
                      </td>
                      {drill === 'leave' ? (
                        <>
                          <td className="py-2.5 px-3 text-neutral-700 dark:text-neutral-300">
                            {leave ? `${leave.leaveType}${leave.isHalfDay ? ' (half day)' : ''}` : 'Marked on leave'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-neutral-500">
                            {leave ? `${leave.fromDate} → ${leave.toDate}` : '—'}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2.5 px-3 font-mono">{rec?.checkIn ? formatTime12(rec.checkIn.slice(0, 5)) : '—'}</td>
                          <td className="py-2.5 px-3 font-mono">{rec?.checkOut ? formatTime12(rec.checkOut.slice(0, 5)) : '—'}</td>
                          <td className="py-2.5 px-3 font-mono text-neutral-500">
                            {rec?.workedMinutes ? `${(rec.workedMinutes / 60).toFixed(1)}h` : '—'}
                          </td>
                        </>
                      )}
                      <td className="py-2.5 px-3">
                        {category === 'notMarked' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                            Not marked
                          </span>
                        ) : (
                          <Badge status={rec?.status || (category === 'leave' ? 'On Leave' : 'Absent')} />
                        )}
                      </td>
                    </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 mt-4">
            <p className="text-[11px] text-neutral-400">
              {drill === 'absent' && viewDate < todayStr
                ? 'Includes working-day staff with no attendance record for this date.'
                : 'Live from the attendance register.'}
            </p>
            <button
              onClick={() => {
                closeDrill();
                onNavigateTab(drill === 'leave' ? 'leaves' : 'attendance');
              }}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 cursor-pointer"
            >
              {drill === 'leave' ? 'Open Leave Management' : 'Open Attendance Register'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </Modal>
      )}

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
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip {...tooltipStyle} cursor={lineCursor} />
                <Line {...chartAnimation(0)} type="monotone" dataKey="present" stroke="#10B981" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                <Line {...chartAnimation(1)} type="monotone" dataKey="late" stroke="#F59E0B" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                <Line {...chartAnimation(2)} type="monotone" dataKey="absent" stroke="#EF4444" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
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
                  cornerRadius={4}
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  {...pieAnimation}
                >
                  {deptCells}
                </Pie>
                <Tooltip {...tooltipStyle} />
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
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                <XAxis dataKey="month" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(val: any) => formatMoney(val)} {...tooltipStyle} cursor={barCursor} />
                <Bar {...barAnimation(0)} dataKey="gross" fill="#6366F1" radius={[4, 4, 0, 0]} name="Gross" />
                <Bar {...barAnimation(1)} dataKey="net" fill="#10B981" radius={[4, 4, 0, 0]} name="Net Paid" />
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
              {viewDate === todayStr ? "Today's Live Attendance Register" : 'Attendance Register'}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Check-ins for {formatLongDate(viewDate)}
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
              {dayRows.slice(0, 8).map(({ emp, rec, category }) => {
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
                      {category === 'notMarked' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                          Not marked
                        </span>
                      ) : (
                        <Badge
                          status={
                            rec?.status ||
                            (category === 'leave'
                              ? 'On Leave'
                              : category === 'off'
                              ? viewHoliday
                                ? 'Holiday'
                                : 'Weekend'
                              : 'Absent')
                          }
                        />
                      )}
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
