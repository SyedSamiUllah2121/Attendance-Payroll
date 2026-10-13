import {
  AttendanceRecord,
  DutyPeriod,
  Employee,
  EmployeeHistoryEntry,
  Holiday,
  LeaveRequest,
  Shift,
} from '../types';
import { isEmployedOn, resolveDayStatus } from './attendanceEngine';
import { makeEmployeeOnDate } from './employeeTimeline';
import { PAY_FACTOR, round } from './payrollEngine';
import { addDaysStr, monthEndStr, parseDateStr, todayStr } from './dateUtils';

export interface PayMonthContext {
  /** Attendance records (any range; only this employee's days in the month are used). */
  attendance: AttendanceRecord[];
  shifts: Shift[];
  holidays: Holiday[];
  leaves: LeaveRequest[];
  dutyPeriods: DutyPeriod[];
  history: EmployeeHistoryEntry[];
  today?: string;
}

export interface PayMonthSummary {
  /** Working days in the month for the shift(s) the employee was on (holidays excluded). */
  workingDays: number;
  presentDays: number; // includes late days
  lateDays: number;
  halfDays: number;
  absentDays: number;
  dutyDays: number;
  wfhDays: number;
  suspendedDays: number;
  unpaidLeaveDays: number; // approved Unpaid leave only
  notJoinedDays: number;
  afterExitDays: number;
  overtimeMinutes: number;
  /** Total loss-of-pay days: sum of (1 - PAY_FACTOR) over working days, plus days not on staff. */
  lopDays: number;
  /** Basic salary averaged over the month's working days, each at the salary in effect that day. */
  basicSalary: number;
  salaryChanged: boolean;
}

/**
 * Resolves every day of a payroll month for one employee with the central day resolver and
 * the PAY_FACTOR table. Days not yet reached (today without a record, later days) are paid;
 * re-run the draft as the month goes on.
 */
export function summarizePayMonth(emp: Employee, month: string, ctx: PayMonthContext): PayMonthSummary {
  const today = ctx.today ?? todayStr();
  const employeeOn = makeEmployeeOnDate(ctx.history);
  const holidayDates = new Set(ctx.holidays.map((h) => h.date));
  const recordByDate = new Map(
    ctx.attendance.filter((r) => r.employeeId === emp.id && r.date.startsWith(month)).map((r) => [r.date, r])
  );
  const leaves = ctx.leaves.filter((l) => l.employeeId === emp.id && l.status === 'Approved');
  const dayCtx = { holidays: ctx.holidays, leaves, dutyPeriods: ctx.dutyPeriods, today };

  const s: PayMonthSummary = {
    workingDays: 0,
    presentDays: 0,
    lateDays: 0,
    halfDays: 0,
    absentDays: 0,
    dutyDays: 0,
    wfhDays: 0,
    suspendedDays: 0,
    unpaidLeaveDays: 0,
    notJoinedDays: 0,
    afterExitDays: 0,
    overtimeMinutes: 0,
    lopDays: 0,
    basicSalary: emp.basicSalary,
    salaryChanged: false,
  };
  let basicSum = 0;
  const salaries = new Set<number>();

  const monthEnd = monthEndStr(month);
  for (let date = `${month}-01`; date <= monthEnd; date = addDaysStr(date, 1)) {
    const asOf = employeeOn(emp, date);
    const shift = ctx.shifts.find((x) => x.id === asOf.shiftId) || ctx.shifts[0];
    const dow = parseDateStr(date).getDay();
    const working = (shift ? shift.workingDays.includes(dow) : dow % 6 !== 0) && !holidayDates.has(date);
    const rec = recordByDate.get(date);

    if (working) {
      s.workingDays++;
      basicSum += asOf.basicSalary;
      salaries.add(asOf.basicSalary);
    }

    if (!isEmployedOn(emp, date) && !(rec && !rec.autoMarked)) {
      if (working) {
        if (emp.joiningDate && date < emp.joiningDate) s.notJoinedDays++;
        else s.afterExitDays++;
      }
      continue;
    }

    // Days after today haven't happened yet (an open suspension or leave is charged as it passes).
    if (!rec && date > today) continue;
    const status = resolveDayStatus(emp, shift, date, rec, dayCtx);
    s.overtimeMinutes += rec?.overtimeMinutes || 0;
    // Today without a record isn't over yet: nothing to deduct.
    if (!rec && (status === 'Absent' || status === 'Not Marked')) continue;

    let factor = 1;
    switch (status) {
      case 'Present':
      case 'Late':
        s.presentDays++;
        if (status === 'Late') s.lateDays++;
        factor = PAY_FACTOR[status];
        break;
      case 'Half Day':
        if (working) s.halfDays++;
        factor = PAY_FACTOR['Half Day'];
        break;
      case 'Absent':
        if (working) s.absentDays++;
        factor = PAY_FACTOR.Absent;
        break;
      case 'On Duty':
        if (working) s.dutyDays++;
        factor = PAY_FACTOR['On Duty'];
        break;
      case 'WFH':
        if (working) s.wfhDays++;
        factor = PAY_FACTOR.WFH;
        break;
      case 'Suspended':
        if (working) s.suspendedDays++;
        factor = PAY_FACTOR.Suspended;
        break;
      case 'On Leave': {
        const leave = leaves.find((l) => l.fromDate <= date && l.toDate >= date);
        if (leave?.leaveType === 'Unpaid') {
          // A half-day unpaid leave docks half the day.
          const unpaid = leave.isHalfDay ? 0.5 : 1;
          if (working) s.unpaidLeaveDays += unpaid;
          factor = 1 - unpaid * (1 - PAY_FACTOR['Unpaid Leave']);
        } else factor = PAY_FACTOR['Paid Leave'];
        break;
      }
      case 'Holiday':
      case 'Weekend':
        factor = PAY_FACTOR[status];
        break;
    }
    if (working) s.lopDays += 1 - factor;
  }

  s.lopDays = round(s.lopDays + s.notJoinedDays + s.afterExitDays);
  if (s.workingDays > 0) s.basicSalary = round(basicSum / s.workingDays);
  s.salaryChanged = salaries.size > 1;
  return s;
}
