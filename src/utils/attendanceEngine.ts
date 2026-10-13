import {
  AttendanceRecord,
  AttendanceStatus,
  DutyPeriod,
  DutyPeriodType,
  Holiday,
  LeaveRequest,
  Shift,
} from '../types';
import { getDay, parse, differenceInMinutes } from 'date-fns';
import { todayStr } from './dateUtils';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calculates attendance status based on shift configuration and check-in / check-out times.
 */
export function evaluateAttendanceStatus(
  checkInStr: string | undefined,
  checkOutStr: string | undefined,
  shift: Shift,
  dateStr: string = todayStr(),
  holidays: Holiday[] = [],
  hasApprovedLeave: boolean = false
): {
  status: AttendanceStatus;
  workedMinutes: number;
  overtimeMinutes: number;
  isEarlyDeparture: boolean;
} {
  const dateObj = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = getDay(dateObj); // 0=Sun, 1=Mon, ..., 6=Sat

  // Check if holiday
  const isHoliday = holidays.some((h) => h.date === dateStr);
  if (isHoliday) {
    return {
      status: 'Holiday',
      workedMinutes: 0,
      overtimeMinutes: 0,
      isEarlyDeparture: false,
    };
  }

  // Check if weekend / non-working day for this shift
  const isWorkingDay = shift.workingDays.includes(dayOfWeek);
  if (!isWorkingDay) {
    return {
      status: 'Weekend',
      workedMinutes: 0,
      overtimeMinutes: 0,
      isEarlyDeparture: false,
    };
  }

  // Check if on approved leave
  if (hasApprovedLeave) {
    return {
      status: 'On Leave',
      workedMinutes: 0,
      overtimeMinutes: 0,
      isEarlyDeparture: false,
    };
  }

  // Absent if no check-in
  if (!checkInStr) {
    return {
      status: 'Absent',
      workedMinutes: 0,
      overtimeMinutes: 0,
      isEarlyDeparture: false,
    };
  }

  // Parse shift times
  const baseDate = '2026-01-01 ';
  const shiftStart = parse(baseDate + shift.startTime, 'yyyy-MM-dd HH:mm', new Date());
  let shiftEnd = parse(baseDate + shift.endTime, 'yyyy-MM-dd HH:mm', new Date());
  // Overnight shift (e.g. 22:00 - 06:00): the end falls on the next day.
  const isOvernight = shiftEnd <= shiftStart;
  if (isOvernight) shiftEnd = new Date(shiftEnd.getTime() + DAY_MS);
  let checkIn = parse(baseDate + checkInStr.slice(0, 5), 'yyyy-MM-dd HH:mm', new Date());
  // On an overnight shift, a (late) check-in after midnight belongs to the next day.
  if (isOvernight && shiftStart.getTime() - checkIn.getTime() > 12 * 60 * 60 * 1000) {
    checkIn = new Date(checkIn.getTime() + DAY_MS);
  }

  const graceEnd = new Date(shiftStart.getTime() + shift.gracePeriodMinutes * 60 * 1000);
  const isLate = checkIn > graceEnd;

  let workedMinutes = 0;
  let overtimeMinutes = 0;
  let isEarlyDeparture = false;

  if (checkOutStr) {
    let checkOut = parse(baseDate + checkOutStr.slice(0, 5), 'yyyy-MM-dd HH:mm', new Date());
    // Checked out after midnight.
    if (checkOut < checkIn) checkOut = new Date(checkOut.getTime() + DAY_MS);
    const rawElapsed = differenceInMinutes(checkOut, checkIn);
    workedMinutes = Math.max(0, rawElapsed - shift.breakDurationMinutes);

    // Overtime: worked beyond shift hours
    const scheduledShiftMinutes = differenceInMinutes(shiftEnd, shiftStart) - shift.breakDurationMinutes;
    const diff = workedMinutes - scheduledShiftMinutes;
    if (diff >= 30) {
      overtimeMinutes = diff;
    }

    if (checkOut < shiftEnd) {
      isEarlyDeparture = true;
    }
  } else {
    // Active / Ongoing check-in: approximate working time without break yet
    workedMinutes = 0;
  }

  // Half day check: worked hours < halfDayThresholdHours (e.g. 4.5 hours = 270 mins)
  const halfDayMins = shift.halfDayThresholdHours * 60;
  if (checkOutStr && workedMinutes < halfDayMins && workedMinutes > 0) {
    return {
      status: 'Half Day',
      workedMinutes,
      overtimeMinutes: 0,
      isEarlyDeparture,
    };
  }

  return {
    status: isLate ? 'Late' : 'Present',
    workedMinutes,
    overtimeMinutes,
    isEarlyDeparture,
  };
}

/**
 * Calculates the number of working days in a given month for a shift, minus public holidays.
 */
export function getWorkingDaysInMonth(
  year: number,
  month: number, // 1-12
  shift: Shift,
  holidays: Holiday[]
): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const d = new Date(year, month - 1, day);
    const dayOfWeek = getDay(d);

    const isShiftWorkDay = shift.workingDays.includes(dayOfWeek);
    const isHoliday = holidays.some((h) => h.date === dateStr);

    if (isShiftWorkDay && !isHoliday) {
      count++;
    }
  }

  return count;
}

/**
 * Calculates total leave days between two dates, excluding non-working days & holidays.
 */
export function calculateEffectiveLeaveDays(
  fromDateStr: string,
  toDateStr: string,
  isHalfDay: boolean,
  shift: Shift,
  holidays: Holiday[]
): number {
  if (isHalfDay) return 0.5;

  const start = new Date(fromDateStr + 'T00:00:00');
  const end = new Date(toDateStr + 'T00:00:00');
  if (start > end) return 0;

  let days = 0;
  const curr = new Date(start);

  while (curr <= end) {
    const dayOfWeek = getDay(curr);
    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, '0');
    const d = String(curr.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const isWorkDay = shift.workingDays.includes(dayOfWeek);
    const isHoliday = holidays.some((h) => h.date === dateStr);

    if (isWorkDay && !isHoliday) {
      days++;
    }
    curr.setDate(curr.getDate() + 1);
  }

  return days;
}

/** What a day with no saved attendance record means for an employee. */
export type UnmarkedDayStatus =
  | 'Holiday'
  | 'Weekend'
  | 'On Leave'
  | DutyStatus
  | 'Absent'
  | 'Pending'
  | 'Upcoming'
  | 'Not Joined'
  | 'Exited';

/** Attendance status a duty period gives each day it covers. */
export type DutyStatus = 'On Duty' | 'WFH' | 'Suspended';

export const DUTY_STATUS: Record<DutyPeriodType, DutyStatus> = {
  'Field Duty': 'On Duty',
  WFH: 'WFH',
  Suspension: 'Suspended',
};

export const DUTY_STATUSES: AttendanceStatus[] = ['On Duty', 'WFH', 'Suspended'];

/** True when the period covers dateStr (an open period has no end date). */
export const periodCovers = (p: DutyPeriod, dateStr: string) =>
  p.startDate <= dateStr && (!p.endDate || p.endDate >= dateStr);

/** The employee's duty period covering dateStr, if any. */
export const dutyPeriodOn = (employeeId: string, dateStr: string, periods: DutyPeriod[]) =>
  periods.find((p) => p.employeeId === employeeId && periodCovers(p, dateStr));

/** On staff that day: joined, and not past their last working day. */
export const isEmployedOn = (
  employee: { joiningDate?: string; lastWorkingDay?: string },
  dateStr: string
) =>
  (!employee.joiningDate || employee.joiningDate <= dateStr) &&
  (!employee.lastWorkingDay || dateStr <= employee.lastWorkingDay);

/** True once the shift's start plus grace time has passed (today's unmarked staff then count as absent). */
export function isPastGrace(shift: Shift | undefined, now: Date = new Date()): boolean {
  if (!shift) return false;
  const [h, m] = shift.startTime.split(':').map(Number);
  const grace = shift.gracePeriodMinutes ?? shift.graceMinutes ?? 0;
  return now.getHours() * 60 + now.getMinutes() > (h || 0) * 60 + (m || 0) + grace;
}

/** True when the employee has approved leave covering dateStr. */
export function hasApprovedLeaveOn(employeeId: string, dateStr: string, leaves: LeaveRequest[]): boolean {
  return leaves.some(
    (l) =>
      l.employeeId === employeeId &&
      l.status === 'Approved' &&
      l.fromDate <= dateStr &&
      l.toDate >= dateStr
  );
}

/**
 * Status of a day that has no attendance record. First match wins:
 * before joining / after the last working day, holiday, shift off day, approved leave,
 * duty period (Field Duty / WFH / Suspension), then by date: later days Upcoming,
 * today Pending (not checked in yet) and a past working day Absent.
 *
 * Holidays and off days come before leave and duty periods: leave balances and payroll
 * both count working days, so a suspension over a weekend docks only the working days.
 */
export function resolveUnmarkedDay(
  employee: { id: string; joiningDate?: string; lastWorkingDay?: string },
  shift: Shift | undefined,
  dateStr: string,
  holidays: Holiday[],
  leaves: LeaveRequest[],
  today: string = todayStr(),
  dutyPeriods: DutyPeriod[] = []
): UnmarkedDayStatus {
  if (employee.joiningDate && dateStr < employee.joiningDate) return 'Not Joined';
  if (employee.lastWorkingDay && dateStr > employee.lastWorkingDay) return 'Exited';
  if (holidays.some((h) => h.date === dateStr)) return 'Holiday';
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  const workingDays = shift?.workingDays ?? [1, 2, 3, 4, 5];
  if (!workingDays.includes(dow)) return 'Weekend';
  if (hasApprovedLeaveOn(employee.id, dateStr, leaves)) return 'On Leave';
  const period = dutyPeriodOn(employee.id, dateStr, dutyPeriods);
  if (period) return DUTY_STATUS[period.type];
  if (dateStr > today) return 'Upcoming';
  if (dateStr === today) return 'Pending';
  return 'Absent';
}

/** What the Attendance page, Dashboard and Payroll show for one employee-day. */
export type DayStatus = AttendanceStatus | 'Not Marked' | 'Upcoming';

export interface DayContext {
  holidays: Holiday[];
  leaves: LeaveRequest[];
  dutyPeriods: DutyPeriod[];
  today?: string;
  /** Clock used to turn today's "Not Marked" into Absent after the shift's grace time. */
  now?: Date;
}

/**
 * The central status of an employee on a date. First match wins:
 * 1. a check-in or manual mark (any record a person saved),
 * 2. not employed that day (before joining / after last working day): null, not listed,
 * 3. the auto-filled record for the day, else the same rules applied live
 *    (holiday, off day, approved leave, duty period),
 * 4. otherwise "Not Marked" today, becoming Absent once the shift's grace time has passed.
 * Pass the shift the employee was on that day (see makeEmployeeOnDate).
 */
export function resolveDayStatus(
  employee: { id: string; joiningDate?: string; lastWorkingDay?: string },
  shift: Shift | undefined,
  dateStr: string,
  record: AttendanceRecord | undefined,
  ctx: DayContext
): DayStatus | null {
  if (record && !record.autoMarked) return record.status;
  if (!isEmployedOn(employee, dateStr)) return null;
  if (record) return record.status;
  const today = ctx.today ?? todayStr();
  const status = resolveUnmarkedDay(employee, shift, dateStr, ctx.holidays, ctx.leaves, today, ctx.dutyPeriods);
  switch (status) {
    case 'Not Joined':
    case 'Exited':
      return null;
    case 'Pending':
      return isPastGrace(shift, ctx.now) ? 'Absent' : 'Not Marked';
    default:
      return status;
  }
}
