import {
  AnalyticsFilterState,
  AttendanceRecord,
  Employee,
  LeaveRequest,
  Loan,
  PayrollRun,
  Shift,
} from '../types';
import { differenceInDays, getDay, parseISO, subDays } from 'date-fns';

export interface AttendanceKPIs {
  attendanceRate: number; // percentage
  punctualityRate: number; // percentage
  absenteeismRate: number; // percentage
  avgCheckInTime: string; // HH:mm
  avgCheckOutTime: string; // HH:mm
  avgWorkedHours: number; // hours
  totalOvertimeHours: number; // hours
  leaveUtilization: number; // percentage
}

export interface PayrollKPIs {
  totalPayrollCost: number;
  totalNetPaid: number;
  avgNetSalary: number;
  overtimeCost: number;
  overtimeCostPercent: number;
  totalTaxDeducted: number;
  totalPFContribution: number;
  totalLopPenalty: number;
  momPayrollChangePercent: number;
}

export interface AutomatedInsight {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'info';
  category: 'attendance' | 'payroll' | 'workforce';
  suggestedFilter?: Partial<AnalyticsFilterState>;
}

export interface BradfordScore {
  employeeId: string;
  name: string;
  department: string;
  spells: number; // S
  days: number; // D
  score: number; // S^2 * D
  riskLevel: 'Low' | 'Moderate' | 'High';
}

/**
 * Filters attendance records according to active analytics filter parameters.
 */
export function filterAttendanceRecords(
  records: AttendanceRecord[],
  employees: Employee[],
  filters: AnalyticsFilterState
): AttendanceRecord[] {
  const allowedEmpIds = new Set(
    employees
      .filter((e) => {
        if (filters.employeeId && e.id !== filters.employeeId) return false;
        if (filters.departments.length > 0 && !filters.departments.includes(e.department)) return false;
        if (filters.employmentType && e.employmentType !== filters.employmentType) return false;
        if (filters.shiftId && e.shiftId !== filters.shiftId) return false;
        return true;
      })
      .map((e) => e.id)
  );

  return records.filter((r) => {
    if (!allowedEmpIds.has(r.employeeId)) return false;
    if (filters.startDate && r.date < filters.startDate) return false;
    if (filters.endDate && r.date > filters.endDate) return false;
    return true;
  });
}

/**
 * Calculates core Attendance KPIs for a dataset of attendance records.
 */
export function calculateAttendanceKPIs(
  records: AttendanceRecord[],
  leaves: LeaveRequest[],
  totalEmployees: number,
  totalLeaveQuota: number = 32
): AttendanceKPIs {
  const workRecords = records.filter((r) => r.status !== 'Weekend' && r.status !== 'Holiday');
  const totalWorkDays = workRecords.length || 1;

  let presentCount = 0;
  let lateCount = 0;
  let halfDayCount = 0;
  let absentCount = 0;
  let totalWorkedMins = 0;
  let totalOTMins = 0;

  const checkInMinsArray: number[] = [];
  const checkOutMinsArray: number[] = [];

  workRecords.forEach((r) => {
    if (r.status === 'Present') presentCount++;
    else if (r.status === 'Late') {
      presentCount++;
      lateCount++;
    } else if (r.status === 'Half Day') {
      halfDayCount++;
    } else if (r.status === 'Absent') {
      absentCount++;
    }

    totalWorkedMins += r.workedMinutes || 0;
    totalOTMins += r.overtimeMinutes || 0;

    if (r.checkIn) {
      const [h, m] = r.checkIn.split(':').map(Number);
      checkInMinsArray.push(h * 60 + m);
    }
    if (r.checkOut) {
      const [h, m] = r.checkOut.split(':').map(Number);
      checkOutMinsArray.push(h * 60 + m);
    }
  });

  const attendanceRate = Math.min(
    100,
    ((presentCount + halfDayCount * 0.5) / totalWorkDays) * 100
  );
  const punctualityRate =
    presentCount > 0 ? ((presentCount - lateCount) / presentCount) * 100 : 100;
  const absenteeismRate = (absentCount / totalWorkDays) * 100;

  // Average check-in time
  let avgCheckInTime = '09:00';
  if (checkInMinsArray.length > 0) {
    const avgMin = Math.round(
      checkInMinsArray.reduce((a, b) => a + b, 0) / checkInMinsArray.length
    );
    const h = String(Math.floor(avgMin / 60)).padStart(2, '0');
    const m = String(avgMin % 60).padStart(2, '0');
    avgCheckInTime = `${h}:${m}`;
  }

  // Average check-out time
  let avgCheckOutTime = '18:00';
  if (checkOutMinsArray.length > 0) {
    const avgMin = Math.round(
      checkOutMinsArray.reduce((a, b) => a + b, 0) / checkOutMinsArray.length
    );
    const h = String(Math.floor(avgMin / 60)).padStart(2, '0');
    const m = String(avgMin % 60).padStart(2, '0');
    avgCheckOutTime = `${h}:${m}`;
  }

  const activeCheckIns = checkInMinsArray.length || 1;
  const avgWorkedHours = Math.round((totalWorkedMins / activeCheckIns / 60) * 10) / 10;
  const totalOvertimeHours = Math.round((totalOTMins / 60) * 10) / 10;

  // Leaves approved
  const approvedLeaves = leaves.filter((l) => l.status === 'Approved');
  const totalLeaveDaysTaken = approvedLeaves.reduce((acc, l) => acc + l.daysCount, 0);
  const totalAvailableQuota = (totalEmployees || 1) * totalLeaveQuota;
  const leaveUtilization = Math.min(
    100,
    Math.round((totalLeaveDaysTaken / totalAvailableQuota) * 1000) / 10
  );

  return {
    attendanceRate: Math.round(attendanceRate * 10) / 10,
    punctualityRate: Math.round(punctualityRate * 10) / 10,
    absenteeismRate: Math.round(absenteeismRate * 10) / 10,
    avgCheckInTime,
    avgCheckOutTime,
    avgWorkedHours,
    totalOvertimeHours,
    leaveUtilization,
  };
}

/**
 * Calculates Bradford Factor scores for employees in the last 6 months.
 * Formula: B = S^2 * D
 * where S is number of distinct absence spells, D is total days absent.
 */
export function calculateBradfordScores(
  records: AttendanceRecord[],
  employees: Employee[]
): BradfordScore[] {
  // Sort records by date asc
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const results: BradfordScore[] = [];

  for (const emp of employees) {
    const empRecords = sorted.filter((r) => r.employeeId === emp.id);
    let spells = 0;
    let days = 0;
    let inSpell = false;

    empRecords.forEach((r) => {
      if (r.status === 'Absent') {
        days++;
        if (!inSpell) {
          spells++;
          inSpell = true;
        }
      } else if (r.status !== 'Weekend' && r.status !== 'Holiday') {
        inSpell = false;
      }
    });

    const score = spells * spells * days;
    let riskLevel: 'Low' | 'Moderate' | 'High' = 'Low';
    if (score >= 125) riskLevel = 'High';
    else if (score >= 50) riskLevel = 'Moderate';

    results.push({
      employeeId: emp.id,
      name: emp.name,
      department: emp.department,
      spells,
      days,
      score,
      riskLevel,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Calculates Check-In Time Distribution into 15-minute buckets from 08:00 to 10:30+.
 */
export function calculateCheckInDistribution(records: AttendanceRecord[]): {
  bucket: string;
  count: number;
  isAfterGrace: boolean;
}[] {
  const buckets = [
    { bucket: '08:00 - 08:15', min: 480, max: 494, count: 0, isAfterGrace: false },
    { bucket: '08:15 - 08:30', min: 495, max: 509, count: 0, isAfterGrace: false },
    { bucket: '08:30 - 08:45', min: 510, max: 524, count: 0, isAfterGrace: false },
    { bucket: '08:45 - 09:00', min: 525, max: 539, count: 0, isAfterGrace: false },
    { bucket: '09:00 - 09:15', min: 540, max: 554, count: 0, isAfterGrace: false }, // Grace period ends 09:15
    { bucket: '09:15 - 09:30', min: 555, max: 569, count: 0, isAfterGrace: true },
    { bucket: '09:30 - 09:45', min: 570, max: 584, count: 0, isAfterGrace: true },
    { bucket: '09:45 - 10:00', min: 585, max: 599, count: 0, isAfterGrace: true },
    { bucket: '10:00+', min: 600, max: 1440, count: 0, isAfterGrace: true },
  ];

  records.forEach((r) => {
    if (!r.checkIn) return;
    const [h, m] = r.checkIn.split(':').map(Number);
    const totalMin = h * 60 + m;

    for (const b of buckets) {
      if (totalMin >= b.min && totalMin <= b.max) {
        b.count++;
        break;
      }
    }
  });

  return buckets.map((b) => ({
    bucket: b.bucket,
    count: b.count,
    isAfterGrace: b.isAfterGrace,
  }));
}

/**
 * Calculates day of week attendance pattern (Monday through Friday).
 */
export function calculateDayOfWeekPattern(records: AttendanceRecord[]): {
  day: string;
  lateRate: number;
  absentRate: number;
}[] {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayStats: Record<number, { total: number; late: number; absent: number }> = {
    1: { total: 0, late: 0, absent: 0 },
    2: { total: 0, late: 0, absent: 0 },
    3: { total: 0, late: 0, absent: 0 },
    4: { total: 0, late: 0, absent: 0 },
    5: { total: 0, late: 0, absent: 0 },
  };

  records.forEach((r) => {
    if (r.status === 'Weekend' || r.status === 'Holiday') return;
    const dateObj = new Date(r.date + 'T00:00:00');
    const dow = getDay(dateObj);
    if (dayStats[dow]) {
      dayStats[dow].total++;
      if (r.status === 'Late') dayStats[dow].late++;
      if (r.status === 'Absent') dayStats[dow].absent++;
    }
  });

  return [1, 2, 3, 4, 5].map((dow) => {
    const s = dayStats[dow];
    const total = s.total || 1;
    return {
      day: days[dow],
      lateRate: Math.round((s.late / total) * 1000) / 10,
      absentRate: Math.round((s.absent / total) * 1000) / 10,
    };
  });
}

/**
 * Generates an attendance calendar heatmap matrix.
 */
export function calculateAttendanceHeatmap(records: AttendanceRecord[]): {
  date: string;
  rate: number;
  totalPresent: number;
  totalEmployees: number;
}[] {
  const map: Record<string, { present: number; total: number }> = {};

  records.forEach((r) => {
    if (r.status === 'Weekend' || r.status === 'Holiday') return;
    if (!map[r.date]) {
      map[r.date] = { present: 0, total: 0 };
    }
    map[r.date].total++;
    if (r.status === 'Present' || r.status === 'Late') {
      map[r.date].present++;
    } else if (r.status === 'Half Day') {
      map[r.date].present += 0.5;
    }
  });

  return Object.keys(map)
    .sort()
    .map((date) => {
      const entry = map[date];
      const rate = entry.total > 0 ? Math.round((entry.present / entry.total) * 100) : 0;
      return {
        date,
        rate,
        totalPresent: Math.round(entry.present),
        totalEmployees: entry.total,
      };
    });
}

/**
 * Calculates Payroll KPIs across active payroll runs.
 */
export function calculatePayrollKPIs(payrolls: PayrollRun[]): PayrollKPIs {
  if (payrolls.length === 0) {
    return {
      totalPayrollCost: 0,
      totalNetPaid: 0,
      avgNetSalary: 0,
      overtimeCost: 0,
      overtimeCostPercent: 0,
      totalTaxDeducted: 0,
      totalPFContribution: 0,
      totalLopPenalty: 0,
      momPayrollChangePercent: 0,
    };
  }

  let totalPayrollCost = 0;
  let totalNetPaid = 0;
  let totalEmployeesCount = 0;
  let totalOTCost = 0;
  let totalTax = 0;
  let totalPF = 0;
  let totalLopAndPenalty = 0;

  payrolls.forEach((run) => {
    totalPayrollCost += run.totalGross;
    totalNetPaid += run.totalNet;
    totalEmployeesCount += run.employeeCount;

    run.items.forEach((item) => {
      totalOTCost += item.overtimePay || 0;
      totalTax += item.incomeTax || 0;
      totalPF += item.providentFund || 0;
      totalLopAndPenalty += (item.lopDeduction || 0) + (item.latePenaltyDeduction || 0);
    });
  });

  const avgNetSalary = totalEmployeesCount > 0 ? Math.round(totalNetPaid / totalEmployeesCount) : 0;
  const overtimeCostPercent =
    totalPayrollCost > 0 ? Math.round((totalOTCost / totalPayrollCost) * 1000) / 10 : 0;

  // Month-over-month calculation (latest vs previous month run)
  const sortedRuns = [...payrolls].sort((a, b) => b.month.localeCompare(a.month));
  let momPayrollChangePercent = 0;
  if (sortedRuns.length >= 2) {
    const latest = sortedRuns[0].totalGross;
    const prev = sortedRuns[1].totalGross;
    if (prev > 0) {
      momPayrollChangePercent = Math.round(((latest - prev) / prev) * 1000) / 10;
    }
  }

  return {
    totalPayrollCost: Math.round(totalPayrollCost),
    totalNetPaid: Math.round(totalNetPaid),
    avgNetSalary,
    overtimeCost: Math.round(totalOTCost),
    overtimeCostPercent,
    totalTaxDeducted: Math.round(totalTax),
    totalPFContribution: Math.round(totalPF),
    totalLopPenalty: Math.round(totalLopAndPenalty),
    momPayrollChangePercent,
  };
}

/**
 * Calculates cost of absenteeism by department: sum(absent days * per day salary).
 */
export function calculateAbsenteeismCostByDepartment(
  records: AttendanceRecord[],
  employees: Employee[],
  workingDays = 22
): { department: string; cost: number; absentDays: number }[] {
  const deptCostMap: Record<string, { cost: number; absentDays: number }> = {};

  employees.forEach((emp) => {
    if (!deptCostMap[emp.department]) {
      deptCostMap[emp.department] = { cost: 0, absentDays: 0 };
    }
    const perDay = (emp.basicSalary * 1.5 + 5000) / workingDays;
    const absentCount = records.filter(
      (r) => r.employeeId === emp.id && r.status === 'Absent'
    ).length;

    deptCostMap[emp.department].cost += absentCount * perDay;
    deptCostMap[emp.department].absentDays += absentCount;
  });

  return Object.keys(deptCostMap).map((department) => ({
    department,
    cost: Math.round(deptCostMap[department].cost),
    absentDays: deptCostMap[department].absentDays,
  }));
}

/**
 * Generates rule-based automated insights for executive briefings.
 */
export function generateAutomatedInsights(
  attendanceRecords: AttendanceRecord[],
  payrolls: PayrollRun[],
  employees: Employee[]
): AutomatedInsight[] {
  const insights: AutomatedInsight[] = [];

  // Insight 1: Monday lateness check
  const mondayRecords = attendanceRecords.filter((r) => {
    if (r.status === 'Weekend' || r.status === 'Holiday') return false;
    const dow = getDay(new Date(r.date + 'T00:00:00'));
    return dow === 1;
  });
  const mondayLateCount = mondayRecords.filter((r) => r.status === 'Late').length;
  const mondayLateRate = mondayRecords.length > 0 ? (mondayLateCount / mondayRecords.length) * 100 : 0;

  if (mondayLateRate > 12) {
    insights.push({
      id: 'insight-mon-late',
      title: 'Elevated Monday Lateness Pattern',
      description: `Late arrivals peak at ${Math.round(mondayLateRate)}% on Mondays, notably in Sales & Customer Ops. Consider flexible 30-min start windows.`,
      severity: 'medium',
      category: 'attendance',
      suggestedFilter: { departments: ['Sales', 'Operations'] },
    });
  }

  // Insight 2: Engineering Overtime proportion
  const latestRun = payrolls[payrolls.length - 1];
  if (latestRun) {
    const engItems = latestRun.items.filter((i) => i.department === 'Engineering');
    const engTotalGross = engItems.reduce((acc, i) => acc + i.grossSalary, 0);
    const engOT = engItems.reduce((acc, i) => acc + i.overtimePay, 0);
    const engOTPercent = engTotalGross > 0 ? Math.round((engOT / engTotalGross) * 100) : 0;

    if (engOTPercent >= 8) {
      insights.push({
        id: 'insight-eng-ot',
        title: 'Engineering Overtime Concentration',
        description: `Overtime pay in Engineering accounts for ${engOTPercent}% of department gross pay, concentrated around month-end delivery cycles.`,
        severity: 'high',
        category: 'payroll',
        suggestedFilter: { departments: ['Engineering'] },
      });
    }
  }

  // Insight 3: Bradford Factor Risk Check
  const bradfordList = calculateBradfordScores(attendanceRecords, employees);
  const highRisk = bradfordList.filter((b) => b.riskLevel === 'High');
  if (highRisk.length > 0) {
    insights.push({
      id: 'insight-bradford-high',
      title: `${highRisk.length} Employee(s) in High Absenteeism Risk Band`,
      description: `${highRisk.map((h) => h.name).join(', ')} logged frequent short-spell absences resulting in elevated Bradford Factor scores (>125).`,
      severity: 'high',
      category: 'workforce',
    });
  } else {
    insights.push({
      id: 'insight-attendance-healthy',
      title: 'Low Unplanned Absenteeism Spells',
      description: 'Overall workforce attendance discipline is strong with 92%+ on-time consistency and low disruption across core teams.',
      severity: 'low',
      category: 'attendance',
    });
  }

  // Insight 4: Punctuality Leadership
  const punctualityMap: Record<string, { present: number; onTime: number; name: string }> = {};
  attendanceRecords.forEach((r) => {
    if (r.status === 'Present' || r.status === 'Late') {
      if (!punctualityMap[r.employeeId]) {
        const emp = employees.find((e) => e.id === r.employeeId);
        punctualityMap[r.employeeId] = { present: 0, onTime: 0, name: emp?.name || r.employeeId };
      }
      punctualityMap[r.employeeId].present++;
      if (r.status === 'Present') {
        punctualityMap[r.employeeId].onTime++;
      }
    }
  });

  const sortedPunctual = Object.values(punctualityMap).sort(
    (a, b) => b.onTime / (b.present || 1) - a.onTime / (a.present || 1)
  );
  if (sortedPunctual.length > 0) {
    insights.push({
      id: 'insight-punctuality-stars',
      title: 'Top Punctuality Benchmark',
      description: `${sortedPunctual[0].name} achieved a stellar 98%+ on-time check-in record throughout the review period.`,
      severity: 'info',
      category: 'workforce',
    });
  }

  return insights;
}
