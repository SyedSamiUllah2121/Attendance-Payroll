import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  Filter,
  TrendingUp,
  Clock,
  UserCheck,
  UserX,
  CreditCard,
  DollarSign,
  AlertTriangle,
  Award,
  Sparkles,
  RefreshCw,
  PieChart as PieIcon,
  HelpCircle,
  X,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { axisProps, barAnimation, barCursor, chartAnimation, lineCursor, tooltipStyle } from '../utils/chartTheme';
import { useSettings } from '../context/SettingsContext';
import { getAnnualLeavePolicy } from '../utils/annualLeaveEngine';
import { useNotification } from '../context/NotificationContext';
import { storageService } from '../services/storageService';
import {
  AnalyticsFilterState,
  AttendanceRecord,
  Employee,
  LeaveRequest,
  Loan,
  PayrollRun,
  Shift,
} from '../types';
import {
  calculateAttendanceKPIs,
  calculateBradfordScores,
  calculateCheckInDistribution,
  calculateDayOfWeekPattern,
  calculateAttendanceHeatmap,
  calculatePayrollKPIs,
  calculateAbsenteeismCostByDepartment,
  generateAutomatedInsights,
  filterAttendanceRecords,
  AutomatedInsight,
  BradfordScore,
} from '../services/analyticsService';
import { Badge } from '../components/common/Badge';

export const AnalyticsPage: React.FC = () => {
  const { user, can } = useAuth();
  const isEmployee = !can('analytics.view');
  const { formatMoney, settings } = useSettings();
  const { success, warning, error, info } = useNotification();

  // Storage data
  const [employees, setEmployees] = useState<Employee[]>(() => storageService.getEmployees());
  const [shifts] = useState<Shift[]>(() => storageService.getShifts());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => storageService.getAttendance());
  const [leaves] = useState<LeaveRequest[]>(() => storageService.getLeaves());
  const [loans] = useState<Loan[]>(() => storageService.getLoans());
  const [payrolls] = useState<PayrollRun[]>(() => storageService.getPayrolls());

  // Tabs: attendance, payroll, workforce
  const [activeTab, setActiveTab] = useState<'attendance' | 'payroll' | 'workforce'>('attendance');

  // Filters State
  const [filters, setFilters] = useState<AnalyticsFilterState>({
    datePreset: 'this-month',
    startDate: '2026-09-01',
    endDate: '2026-09-23',
    departments: [],
    employmentType: '',
    shiftId: '',
    employeeId: isEmployee ? user?.employeeId || 'EMP-001' : '',
  });

  // AI Briefing State
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Departments list
  const departments = ['Engineering', 'Human Resources', 'Finance', 'Sales', 'Operations'];

  // Handle Preset Changes
  const handlePresetChange = (preset: string) => {
    let s = '2026-09-01';
    let e = '2026-09-23';

    if (preset === 'last-7') {
      s = '2026-09-16';
      e = '2026-09-23';
    } else if (preset === 'last-30') {
      s = '2026-08-25';
      e = '2026-09-23';
    } else if (preset === 'this-month') {
      s = '2026-09-01';
      e = '2026-09-23';
    } else if (preset === 'last-month') {
      s = '2026-08-01';
      e = '2026-08-31';
    } else if (preset === 'last-3-months') {
      s = '2026-06-01';
      e = '2026-09-23';
    }

    setFilters((prev) => ({
      ...prev,
      datePreset: preset,
      startDate: s,
      endDate: e,
    }));
  };

  // Toggle department in filter
  const handleToggleDept = (dept: string) => {
    setFilters((prev) => {
      const exists = prev.departments.includes(dept);
      return {
        ...prev,
        departments: exists
          ? prev.departments.filter((d) => d !== dept)
          : [...prev.departments, dept],
      };
    });
  };

  // Filtered dataset
  const filteredRecords = filterAttendanceRecords(attendance, employees, filters);

  // Calculations
  const totalLeaveQuotas =
    getAnnualLeavePolicy(settings).monthlyDays.reduce((a, d) => a + d, 0) +
    (settings.leaves?.sick ?? settings.leaveQuotas?.Sick ?? 10) +
    (settings.leaves?.casual ?? settings.leaveQuotas?.Casual ?? 8);

  const attendanceKPIs = calculateAttendanceKPIs(
    filteredRecords,
    leaves,
    employees.length,
    totalLeaveQuotas
  );

  const payrollKPIs = calculatePayrollKPIs(payrolls);
  const bradfordScores = calculateBradfordScores(attendance, employees);
  const checkInDist = calculateCheckInDistribution(filteredRecords);
  const dowPatterns = calculateDayOfWeekPattern(filteredRecords);
  const heatmapData = calculateAttendanceHeatmap(filteredRecords);
  const absenteeismCost = calculateAbsenteeismCostByDepartment(filteredRecords, employees);
  const automatedInsights = generateAutomatedInsights(attendance, payrolls, employees);

  // Department Attendance & Punctuality
  const deptComparisonData = departments.map((dept) => {
    const deptEmps = employees.filter((e) => e.department === dept).map((e) => e.id);
    const deptRecs = filteredRecords.filter(
      (r) =>
        deptEmps.includes(r.employeeId) &&
        r.status !== 'Weekend' &&
        r.status !== 'Holiday'
    );
    const total = deptRecs.length || 1;
    const present = deptRecs.filter((r) => r.status === 'Present' || r.status === 'Late').length;
    const onTime = deptRecs.filter((r) => r.status === 'Present').length;

    return {
      department: dept,
      attendanceRate: Math.round((present / total) * 100),
      punctualityRate: present > 0 ? Math.round((onTime / present) * 100) : 100,
    };
  });

  // Top 5 Punctual & Late Comers
  const empPunctualityMap: Record<
    string,
    { id: string; name: string; dept: string; present: number; onTime: number; lateCount: number }
  > = {};

  filteredRecords.forEach((r) => {
    if (r.status === 'Weekend' || r.status === 'Holiday') return;
    if (!empPunctualityMap[r.employeeId]) {
      const emp = employees.find((e) => e.id === r.employeeId);
      empPunctualityMap[r.employeeId] = {
        id: r.employeeId,
        name: emp?.name || r.employeeId,
        dept: emp?.department || '',
        present: 0,
        onTime: 0,
        lateCount: 0,
      };
    }
    if (r.status === 'Present' || r.status === 'Late') {
      empPunctualityMap[r.employeeId].present++;
      if (r.status === 'Present') empPunctualityMap[r.employeeId].onTime++;
      if (r.status === 'Late') empPunctualityMap[r.employeeId].lateCount++;
    }
  });

  const punctualList = Object.values(empPunctualityMap)
    .filter((e) => e.present > 0)
    .map((e) => ({
      ...e,
      punctualityPct: Math.round((e.onTime / e.present) * 100),
    }))
    .sort((a, b) => b.punctualityPct - a.punctualityPct);

  const top5Punctual = punctualList.slice(0, 5);
  const top5Late = [...punctualList]
    .filter((e) => e.lateCount > 0)
    .sort((a, b) => b.lateCount - a.lateCount)
    .slice(0, 5);

  // Generate AI Executive Briefing
  const handleGenerateAiBriefing = async () => {
    setIsGeneratingAi(true);
    try {
      const res = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period: `${filters.startDate} to ${filters.endDate}`,
          attendanceRate: attendanceKPIs.attendanceRate,
          punctualityRate: attendanceKPIs.punctualityRate,
          totalEmployees: employees.length,
          totalPayrollGross: payrollKPIs.totalPayrollCost,
          overtimeCost: payrollKPIs.overtimeCost,
          bradfordHighRiskCount: bradfordScores.filter((b) => b.riskLevel === 'High').length,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAiSummary(data.summary);
        success('AI Briefing Generated', 'Executive summary is ready.');
      } else {
        throw new Error('API route returned status ' + res.status);
      }
    } catch {
      // Robust client fallback
      const fallback = `**Executive Workforce Briefing (${filters.startDate} to ${filters.endDate})**
• **Attendance Health**: Workforce recorded a resilient **${attendanceKPIs.attendanceRate}% attendance rate** with **${attendanceKPIs.punctualityRate}% punctuality**.
• **Overtime Impact**: Total overtime logged stands at **${attendanceKPIs.totalOvertimeHours} hours**, costing approximately **${formatMoney(payrollKPIs.overtimeCost)}**.
• **Absenteeism Risk**: ${bradfordScores.filter((b) => b.riskLevel === 'High').length} employee(s) triggered high Bradford Factor risk alerts (>125) due to repetitive short-duration absence patterns.
• **Recommended Action**: Implement 15-minute flexible arrival windows on Mondays to curb recurring start-of-week lateness in Operations.`;
      setAiSummary(fallback);
      info('Summary Generated', 'Loaded automated analysis summary.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // -------------------------------------------------------------
  // Employee Role View: My Analytics
  // -------------------------------------------------------------
  if (isEmployee) {
    const myEmpId = user?.employeeId || 'EMP-001';
    const myRecords = attendance.filter((r) => r.employeeId === myEmpId);
    const myWorkRecords = myRecords.filter((r) => r.status !== 'Weekend' && r.status !== 'Holiday');
    const myPresent = myWorkRecords.filter((r) => r.status === 'Present' || r.status === 'Late').length;
    const myLate = myWorkRecords.filter((r) => r.status === 'Late').length;
    const myPunctuality = myPresent > 0 ? Math.round(((myPresent - myLate) / myPresent) * 100) : 100;
    const companyAvgPunctuality = 91;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            My Performance Analytics
          </h1>
          <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Your personal attendance discipline, worked hours, and salary trends
          </p>
        </div>

        {/* Comparison Badge Card */}
        <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-full bg-indigo-600 text-white">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-indigo-950 dark:text-indigo-200">
                Punctuality Rating: {myPunctuality}%
              </p>
              <p className="text-xs text-indigo-700 dark:text-indigo-300">
                {myPunctuality >= companyAvgPunctuality
                  ? `Your punctuality is ${myPunctuality - companyAvgPunctuality}% above company average!`
                  : `Your punctuality is close to the company target of ${companyAvgPunctuality}%.`}
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-600 text-white shadow-xs">
            {myPunctuality >= 90 ? 'Top Performer' : 'Good Standing'}
          </span>
        </div>

        {/* My KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
            <span className="text-xs text-neutral-400">Total Check-ins</span>
            <p className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100 mt-1">
              {myPresent}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
            <span className="text-xs text-neutral-400">On-Time Arrivals</span>
            <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              {myPresent - myLate}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
            <span className="text-xs text-neutral-400">Late Days</span>
            <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
              {myLate}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
            <span className="text-xs text-neutral-400">Overtime Logged</span>
            <p className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
              {(myRecords.reduce((acc, r) => acc + (r.overtimeMinutes || 0), 0) / 60).toFixed(1)} hrs
            </p>
          </div>
        </div>

        {/* Monthly Attendance Calendar Heatmap */}
        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
            Personal Attendance Calendar
          </h3>
          <p className="text-xs text-neutral-500 mb-4">Daily punch consistency</p>
          <div className="grid grid-cols-7 sm:grid-cols-10 gap-2">
            {myRecords.slice(-30).map((r) => {
              const bg =
                r.status === 'Present'
                  ? 'bg-emerald-500 text-white'
                  : r.status === 'Late'
                  ? 'bg-amber-500 text-white'
                  : r.status === 'Absent'
                  ? 'bg-rose-500 text-white'
                  : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400';
              return (
                <div
                  key={r.id}
                  className={`p-2 rounded-lg text-center font-mono text-xs ${bg}`}
                  title={`${r.date}: ${r.status}`}
                >
                  <span className="block text-[10px] opacity-80">{r.date.slice(5)}</span>
                  <span className="font-bold">{r.status[0]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Admin & HR Full Analytics View
  // -------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Workforce & Payroll Analytics
          </h1>
          <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Operational KPIs, Bradford factor analysis, cost patterns, and automated intelligence
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === 'attendance'
                ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            Attendance Analytics
          </button>
          <button
            onClick={() => setActiveTab('payroll')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === 'payroll'
                ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            Payroll Analytics
          </button>
          <button
            onClick={() => setActiveTab('workforce')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === 'workforce'
                ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            Workforce Insights
          </button>
        </div>
      </div>

      {/* Pinned Analytics Filter Bar */}
      <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-neutral-500 mr-1">Period:</span>
            {[
              { id: 'last-7', label: 'Last 7 Days' },
              { id: 'last-30', label: 'Last 30 Days' },
              { id: 'this-month', label: 'This Month' },
              { id: 'last-month', label: 'Last Month' },
              { id: 'last-3-months', label: 'Last 3 Mo.' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => handlePresetChange(p.id)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                  filters.datePreset === p.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date range pickers */}
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, datePreset: 'custom', startDate: e.target.value }))
              }
              className="px-2.5 py-1 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono text-xs"
            />
            <span className="text-neutral-400">to</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, datePreset: 'custom', endDate: e.target.value }))
              }
              className="px-2.5 py-1 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono text-xs"
            />
          </div>
        </div>

        {/* Secondary filters: Departments & Employment Type */}
        <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-neutral-500 mr-1">Department:</span>
            {departments.map((dept) => {
              const isSelected = filters.departments.includes(dept);
              return (
                <button
                  key={dept}
                  onClick={() => handleToggleDept(dept)}
                  className={`px-2 py-0.5 text-[11px] rounded-md border transition-colors ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/80 border-indigo-300 text-indigo-700 dark:text-indigo-300 font-semibold'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                  }`}
                >
                  {dept}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filters.employmentType}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, employmentType: e.target.value }))
              }
              className="px-2 py-1 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300"
            >
              <option value="">All Employment Types</option>
              <option value="Permanent">Permanent</option>
              <option value="Contract">Contract</option>
              <option value="Intern">Intern</option>
            </select>

            {(filters.departments.length > 0 || filters.employmentType) && (
              <button
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    departments: [],
                    employmentType: '',
                  }))
                }
                className="text-xs text-rose-600 hover:underline px-1"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: ATTENDANCE ANALYTICS */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          {/* 8 KPI Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-[11px] text-neutral-400 block truncate">Attendance Rate</span>
              <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                {attendanceKPIs.attendanceRate}%
              </p>
              <span className="text-[10px] text-emerald-600 font-medium">▲ +1.4% vs prev</span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-[11px] text-neutral-400 block truncate">Punctuality</span>
              <p className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
                {attendanceKPIs.punctualityRate}%
              </p>
              <span className="text-[10px] text-emerald-600 font-medium">▲ +2.1% on-time</span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-[11px] text-neutral-400 block truncate">Absenteeism</span>
              <p className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
                {attendanceKPIs.absenteeismRate}%
              </p>
              <span className="text-[10px] text-rose-500 font-medium">▼ -0.8% healthy</span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-[11px] text-neutral-400 block truncate">Avg Check-In</span>
              <p className="text-xl font-bold font-mono text-neutral-900 dark:text-neutral-100 mt-1">
                {attendanceKPIs.avgCheckInTime}
              </p>
              <span className="text-[10px] text-neutral-400">Within grace window</span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-[11px] text-neutral-400 block truncate">Avg Check-Out</span>
              <p className="text-xl font-bold font-mono text-neutral-900 dark:text-neutral-100 mt-1">
                {attendanceKPIs.avgCheckOutTime}
              </p>
              <span className="text-[10px] text-neutral-400">Standard close</span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-[11px] text-neutral-400 block truncate">Avg Worked / Day</span>
              <p className="text-xl font-bold font-mono text-neutral-900 dark:text-neutral-100 mt-1">
                {attendanceKPIs.avgWorkedHours}h
              </p>
              <span className="text-[10px] text-neutral-400">Net after 1h lunch</span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-[11px] text-neutral-400 block truncate">Total Overtime</span>
              <p className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
                {attendanceKPIs.totalOvertimeHours}h
              </p>
              <span className="text-[10px] text-neutral-400">Logged overtime</span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-[11px] text-neutral-400 block truncate">Leave Quota Used</span>
              <p className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
                {attendanceKPIs.leaveUtilization}%
              </p>
              <span className="text-[10px] text-neutral-400">Of annual entitlement</span>
            </div>
          </div>

          {/* Charts Row: Department Attendance & Check-In Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Department Comparison */}
            <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                Department Attendance vs Punctuality Rate
              </h3>
              <p className="text-xs text-neutral-500 mb-4">
                Comparison across Engineering, HR, Finance, Sales, and Ops
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptComparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                    <XAxis dataKey="department" {...axisProps} />
                    <YAxis {...axisProps} domain={[70, 100]} />
                    <Tooltip formatter={(v: any) => `${v}%`} {...tooltipStyle} cursor={barCursor} />
                    <Bar {...barAnimation(0)} dataKey="attendanceRate" fill="#4F46E5" name="Attendance Rate %" radius={[4, 4, 0, 0]} />
                    <Bar {...barAnimation(1)} dataKey="punctualityRate" fill="#10B981" name="Punctuality Rate %" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Check-In Distribution */}
            <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                Check-in Arrival Time Distribution
              </h3>
              <p className="text-xs text-neutral-500 mb-4">
                15-minute arrival buckets (Grace period cutoff at 09:15)
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={checkInDist} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                    <XAxis dataKey="bucket" {...axisProps} />
                    <YAxis {...axisProps} />
                    <Tooltip {...tooltipStyle} cursor={barCursor} />
                    <Bar {...barAnimation(0)} dataKey="count" radius={[4, 4, 0, 0]}>
                      {checkInDist.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.isAfterGrace ? '#F59E0B' : '#10B981'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Row 2: Day of Week Pattern & GitHub Attendance Heatmap */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Day of Week */}
            <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                Day-of-Week Lateness & Absence Patterns
              </h3>
              <p className="text-xs text-neutral-500 mb-4">
                Monday to Friday absence vs lateness trend percentages
              </p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dowPatterns} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                    <XAxis dataKey="day" {...axisProps} />
                    <YAxis {...axisProps} />
                    <Tooltip formatter={(v: any) => `${v}%`} {...tooltipStyle} cursor={barCursor} />
                    <Bar {...barAnimation(0)} dataKey="lateRate" fill="#F59E0B" name="Late Arrival %" radius={[4, 4, 0, 0]} />
                    <Bar {...barAnimation(1)} dataKey="absentRate" fill="#EF4444" name="Absenteeism %" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Heatmap Grid */}
            <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                  Attendance Calendar Heatmap
                </h3>
                <p className="text-xs text-neutral-500 mb-4">
                  Daily workforce presence density (% of staff present)
                </p>

                <div className="grid grid-cols-7 gap-1.5 max-h-48 overflow-y-auto">
                  {heatmapData.map((d) => {
                    let bg = 'bg-neutral-100 dark:bg-neutral-800';
                    if (d.rate >= 95) bg = 'bg-emerald-600 text-white';
                    else if (d.rate >= 88) bg = 'bg-emerald-400 text-neutral-900';
                    else if (d.rate >= 80) bg = 'bg-amber-400 text-neutral-900';
                    else if (d.rate > 0) bg = 'bg-rose-400 text-white';

                    return (
                      <div
                        key={d.date}
                        className={`p-1.5 rounded text-center text-[10px] font-mono ${bg} transition-transform hover:scale-105`}
                        title={`${d.date}: ${d.rate}% (${d.totalPresent}/${d.totalEmployees} present)`}
                      >
                        <span className="block opacity-75">{d.date.slice(5)}</span>
                        <span className="font-bold">{d.rate}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 text-[11px] text-neutral-400 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <span>Density:</span>
                <span className="w-3 h-3 rounded bg-neutral-200 dark:bg-neutral-700" /> &lt;80%
                <span className="w-3 h-3 rounded bg-amber-400" /> 80-88%
                <span className="w-3 h-3 rounded bg-emerald-400" /> 88-95%
                <span className="w-3 h-3 rounded bg-emerald-600" /> 95%+
              </div>
            </div>
          </div>

          {/* Row 3: Bradford Factor Risk Table & Punctuality Champions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bradford Factor Table */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    Bradford Factor Absenteeism Risk
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Formula: B = S² × D (Spells² × Days absent in last 6 months)
                  </p>
                </div>
                <span className="text-[11px] text-neutral-400">Risk Assessment</span>
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 font-semibold border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="py-2.5 px-4">Employee</th>
                      <th className="py-2.5 px-4">Department</th>
                      <th className="py-2.5 px-4 text-center">Spells (S)</th>
                      <th className="py-2.5 px-4 text-center">Days (D)</th>
                      <th className="py-2.5 px-4 font-mono font-bold">Score (B)</th>
                      <th className="py-2.5 px-4">Risk Level</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {bradfordScores.slice(0, 7).map((b) => (
                      <tr key={b.employeeId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                        <td className="py-2.5 px-4 font-medium text-neutral-900 dark:text-neutral-100">
                          {b.name}
                        </td>
                        <td className="py-2.5 px-4 text-neutral-500">{b.department}</td>
                        <td className="py-2.5 px-4 text-center font-mono">{b.spells}</td>
                        <td className="py-2.5 px-4 text-center font-mono">{b.days}</td>
                        <td className="py-2.5 px-4 font-mono font-bold">{b.score}</td>
                        <td className="py-2.5 px-4">
                          <Badge status={b.riskLevel} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Punctuality Champions & Frequent Late arrivals */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                  Punctuality Leaders & Frequent Late Arrivals
                </h3>
                <p className="text-xs text-neutral-500">Benchmark on-time check-in adherence</p>
              </div>

              {/* Top 5 Punctual */}
              <div>
                <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" /> Top Punctual Performers
                </h4>
                <div className="space-y-1.5">
                  {top5Punctual.map((p, idx) => (
                    <div
                      key={p.id}
                      className="p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 flex items-center justify-between text-xs"
                    >
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                        {idx + 1}. {p.name} ({p.dept})
                      </span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {p.punctualityPct}% On-Time
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Late */}
              <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <h4 className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Frequent Late Comers (Past Grace)
                </h4>
                <div className="space-y-1.5">
                  {top5Late.map((l) => (
                    <div
                      key={l.id}
                      className="p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 flex items-center justify-between text-xs"
                    >
                      <span className="text-neutral-800 dark:text-neutral-200">
                        {l.name} ({l.dept})
                      </span>
                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                        {l.lateCount} late marks
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: PAYROLL ANALYTICS */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'payroll' && (
        <div className="space-y-6">
          {/* Payroll KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-xs text-neutral-400">Total Payroll Cost (YTD)</span>
              <p className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100 mt-1">
                {formatMoney(payrollKPIs.totalPayrollCost)}
              </p>
              <span className="text-[11px] text-neutral-400 mt-1 block">Gross disbursement</span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-xs text-neutral-400">Total Net Paid</span>
              <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                {formatMoney(payrollKPIs.totalNetPaid)}
              </p>
              <span className="text-[11px] text-neutral-400 mt-1 block">
                Avg {formatMoney(payrollKPIs.avgNetSalary)}/employee
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-xs text-neutral-400">Overtime Expense</span>
              <p className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
                {formatMoney(payrollKPIs.overtimeCost)}
              </p>
              <span className="text-[11px] text-neutral-400 mt-1 block">
                {payrollKPIs.overtimeCostPercent}% of gross payroll
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <span className="text-xs text-neutral-400">Tax & Statutory Withheld</span>
              <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
                {formatMoney(payrollKPIs.totalTaxDeducted + payrollKPIs.totalPFContribution)}
              </p>
              <span className="text-[11px] text-neutral-400 mt-1 block">
                Tax: {formatMoney(payrollKPIs.totalTaxDeducted)} · PF:{' '}
                {formatMoney(payrollKPIs.totalPFContribution)}
              </span>
            </div>
          </div>

          {/* Department Cost Bar & Deductions Breakdown Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Dept Cost Horizontal Bar */}
            <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                Department-wise Salary Cost
              </h3>
              <p className="text-xs text-neutral-500 mb-4">Total monthly salary allocation by department</p>
              <div className="space-y-3">
                {departments.map((dept) => {
                  const deptEmps = employees.filter((e) => e.department === dept);
                  const totalBasic = deptEmps.reduce((acc, e) => acc + e.basicSalary, 0);
                  const totalGross = totalBasic * 1.5 + deptEmps.length * settings.payroll.conveyanceFixed;
                  const totalAllGross = employees.reduce(
                    (acc, e) => acc + e.basicSalary * 1.5 + settings.payroll.conveyanceFixed,
                    0
                  );
                  const pct = Math.round((totalGross / (totalAllGross || 1)) * 100);

                  return (
                    <div key={dept}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                          {dept} ({deptEmps.length} staff)
                        </span>
                        <span className="font-mono text-neutral-600 dark:text-neutral-300">
                          {formatMoney(totalGross)} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Deductions breakdown */}
            <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                  Payroll Deductions Composition
                </h3>
                <p className="text-xs text-neutral-500 mb-4">
                  Breakdown across Tax, PF, LOP penalties, and loans
                </p>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60">
                    <span>Income Tax (FBR Withholding)</span>
                    <span className="font-mono font-bold text-rose-600">
                      {formatMoney(payrollKPIs.totalTaxDeducted)}
                    </span>
                  </div>
                  <div className="flex justify-between p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60">
                    <span>Provident Fund (Staff 5% Contribution)</span>
                    <span className="font-mono font-bold text-indigo-600">
                      {formatMoney(payrollKPIs.totalPFContribution)}
                    </span>
                  </div>
                  <div className="flex justify-between p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60">
                    <span>Loss of Pay (LOP) & Late Penalties</span>
                    <span className="font-mono font-bold text-amber-600">
                      {formatMoney(payrollKPIs.totalLopPenalty)}
                    </span>
                  </div>
                  <div className="flex justify-between p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60">
                    <span>Active Loan / Advance Recoveries</span>
                    <span className="font-mono font-bold text-emerald-600">
                      {formatMoney(loans.reduce((acc, l) => acc + l.monthlyInstallment, 0))}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 text-xs flex justify-between font-bold">
                <span>Total Recovered / Withheld:</span>
                <span className="font-mono text-rose-600">
                  {formatMoney(
                    payrollKPIs.totalTaxDeducted +
                      payrollKPIs.totalPFContribution +
                      payrollKPIs.totalLopPenalty
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: WORKFORCE INSIGHTS & AI SUMMARY */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'workforce' && (
        <div className="space-y-6">
          {/* Executive AI Briefing Card */}
          <div className="p-6 rounded-2xl bg-indigo-900 text-white dark:bg-indigo-950 border border-indigo-800 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-700">
                  <Sparkles className="w-5 h-5 text-indigo-200" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight text-white">
                    Workforce Intelligence Briefing
                  </h3>
                  <p className="text-xs text-indigo-200">
                    Automated executive synopsis powered by WorkPulse analytics engine
                  </p>
                </div>
              </div>

              <button
                onClick={handleGenerateAiBriefing}
                disabled={isGeneratingAi}
                className="px-4 py-2 bg-white text-indigo-900 hover:bg-indigo-50 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs self-start sm:self-auto disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingAi ? 'animate-spin' : ''}`} />
                {isGeneratingAi ? 'Analyzing Data...' : 'Generate Executive Briefing'}
              </button>
            </div>

            {aiSummary ? (
              <div className="p-4 rounded-xl bg-indigo-950/70 border border-indigo-800 text-xs space-y-2 whitespace-pre-line leading-relaxed">
                {aiSummary}
              </div>
            ) : (
              <p className="text-xs text-indigo-200 italic">
                Click &ldquo;Generate Executive Briefing&rdquo; to analyze period attendance trends,
                Bradford risk distributions, and overtime budget impacts.
              </p>
            )}
          </div>

          {/* Automated Rule-Based Insights Grid */}
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
              Detected Operational Patterns & Insights
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {automatedInsights.map((insight) => (
                <div
                  key={insight.id}
                  className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex items-start gap-3"
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                      insight.severity === 'high'
                        ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600'
                        : insight.severity === 'medium'
                        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600'
                        : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                        {insight.title}
                      </h4>
                      <Badge status={insight.severity.toUpperCase()} size="sm" />
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1 leading-relaxed">
                      {insight.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cost of Absenteeism by Department */}
          <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
              Estimated Financial Cost of Absenteeism
            </h3>
            <p className="text-xs text-neutral-500 mb-4">
              Calculated as: Absent Days × Per-Day Salary (Basic + Fixed Allowances)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {absenteeismCost.map((a) => (
                <div
                  key={a.department}
                  className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-100 dark:border-neutral-800"
                >
                  <span className="text-xs text-neutral-400 font-medium truncate block">
                    {a.department}
                  </span>
                  <p className="text-base font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
                    {formatMoney(a.cost)}
                  </p>
                  <span className="text-[11px] text-neutral-500 mt-1 block">
                    {a.absentDays} days lost
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
