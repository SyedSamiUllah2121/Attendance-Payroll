import {
  DutyPeriod,
  DutyPeriodType,
  Employee,
  EmployeeHistoryEntry,
  EmployeeHistoryType,
  EmployeeHistoryValues,
  ExitType,
} from '../types';
import { storageService } from './storageService';
import { addDaysStr, todayStr } from '../utils/dateUtils';

/**
 * Employee Actions (transfer, promotion / salary revision, exit, duty periods).
 * Each action writes its history row and the employee / period change together inside
 * storageService.transaction, so a failure leaves nothing half-saved.
 *
 * Changes dated today or earlier are written to the employee at once. A change dated ahead
 * is saved as a pending history row and applied on its effective date by the attendance sync
 * (storageService.applyDueEmployeeChanges). Past dates read values "as of" the day from
 * history (utils/employeeTimeline.ts).
 */

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** Only the fields that actually change, with what they were before. */
const diff = (emp: Employee, changes: EmployeeHistoryValues) => {
  const oldValue: EmployeeHistoryValues = {};
  const newValue: EmployeeHistoryValues = {};
  (Object.keys(changes) as (keyof EmployeeHistoryValues)[]).forEach((key) => {
    const next = changes[key];
    if (next === undefined || next === '' || next === emp[key]) return;
    // '' for "none" (e.g. no site yet): JSON drops undefined, and the old value is needed for past dates.
    (oldValue as Record<string, unknown>)[key] = emp[key] ?? '';
    (newValue as Record<string, unknown>)[key] = next;
  });
  return { oldValue, newValue, changed: Object.keys(newValue).length > 0 };
};

/**
 * Records a change in history and, when it is effective today or earlier, writes it to the
 * employee. Returns null when nothing would change.
 */
const recordChange = (
  emp: Employee,
  type: EmployeeHistoryType,
  changes: EmployeeHistoryValues,
  effectiveDate: string,
  note: string,
  by: string
): EmployeeHistoryEntry | null => {
  const { oldValue, newValue, changed } = diff(emp, changes);
  if (!changed) return null;
  const now = new Date().toISOString();
  const applyNow = effectiveDate <= todayStr();
  const entry: EmployeeHistoryEntry = {
    id: newId('hist'),
    employeeId: emp.id,
    type,
    effectiveDate,
    oldValue,
    newValue,
    note: note.trim() || undefined,
    createdBy: by,
    createdAt: now,
    appliedAt: applyNow ? now : undefined,
  };
  storageService.saveEmployeeHistory([...storageService.getEmployeeHistory(), entry]);
  if (applyNow) {
    // Re-read: the record may have changed since the caller loaded it.
    const current = storageService.getEmployeeById(emp.id) || emp;
    storageService.updateEmployee({ ...current, ...newValue });
  }
  return entry;
};

const requireDate = (date: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${label} is required.`);
};

export interface TransferInput {
  department?: string;
  shiftId?: string;
  siteId?: string;
  designation?: string;
  effectiveDate: string;
  note: string;
}

/** Move an employee to another site, department, shift and/or designation. */
export const transferEmployee = (emp: Employee, input: TransferInput, by: string) =>
  storageService.transaction(() => {
    requireDate(input.effectiveDate, 'Effective date');
    const entry = recordChange(
      emp,
      'Transfer',
      {
        department: input.department,
        shiftId: input.shiftId,
        siteId: input.siteId,
        designation: input.designation,
      },
      input.effectiveDate,
      input.note,
      by
    );
    if (!entry) throw new Error('Pick a new site, department, shift or designation.');
    return entry;
  });

export interface RevisionInput {
  designation?: string;
  basicSalary?: number;
  effectiveDate: string;
  note: string;
}

/**
 * Promotion (new designation, optionally with a raise) or Salary Revision (salary only).
 * Payroll pays each day at the salary in effect that day.
 */
export const reviseEmployee = (emp: Employee, input: RevisionInput, by: string) =>
  storageService.transaction(() => {
    requireDate(input.effectiveDate, 'Effective date');
    if (input.basicSalary !== undefined && !(input.basicSalary > 0)) {
      throw new Error('Basic salary must be greater than zero.');
    }
    const designationChanges = Boolean(input.designation?.trim()) && input.designation!.trim() !== emp.designation;
    const entry = recordChange(
      emp,
      designationChanges ? 'Promotion' : 'Salary Revision',
      { designation: input.designation?.trim(), basicSalary: input.basicSalary },
      input.effectiveDate,
      input.note,
      by
    );
    if (!entry) throw new Error('Enter a new designation or a new basic salary.');
    return entry;
  });

export interface ExitInput {
  exitType: ExitType;
  lastWorkingDay: string;
  reason: string;
}

/**
 * Resignation or termination. The employee keeps all attendance and payroll (never deleted),
 * drops off attendance after the last working day and turns Inactive the day after it.
 */
export const exitEmployee = (emp: Employee, input: ExitInput, by: string) =>
  storageService.transaction(() => {
    requireDate(input.lastWorkingDay, 'Last working day');
    if (emp.joiningDate && input.lastWorkingDay < emp.joiningDate) {
      throw new Error('The last working day cannot be before the joining date.');
    }
    if (!input.reason.trim()) throw new Error('Enter the reason for leaving.');
    const now = new Date().toISOString();
    const leavesNow = input.lastWorkingDay < todayStr();
    const entry: EmployeeHistoryEntry = {
      id: newId('hist'),
      employeeId: emp.id,
      type: 'Exit',
      effectiveDate: input.lastWorkingDay,
      oldValue: { status: emp.status, lastWorkingDay: emp.lastWorkingDay },
      newValue: {
        status: 'Inactive',
        lastWorkingDay: input.lastWorkingDay,
        exitType: input.exitType,
        exitReason: input.reason.trim(),
      },
      note: input.reason.trim(),
      createdBy: by,
      createdAt: now,
      // The exit details are written now; the status follows after the last working day.
      appliedAt: now,
    };
    storageService.saveEmployeeHistory([...storageService.getEmployeeHistory(), entry]);
    const current = storageService.getEmployeeById(emp.id) || emp;
    storageService.updateEmployee({
      ...current,
      lastWorkingDay: input.lastWorkingDay,
      exitType: input.exitType,
      exitReason: input.reason.trim(),
      status: leavesNow ? 'Inactive' : current.status,
    });
    return entry;
  });

/**
 * Activate / deactivate from the directory. Reactivating someone who exited clears the exit
 * so the attendance sync does not turn them Inactive again.
 */
export const setEmployeeStatus = (emp: Employee, status: Employee['status'], note: string, by: string) =>
  storageService.transaction(() => {
    const now = new Date().toISOString();
    const reactivating = status === 'Active' && Boolean(emp.lastWorkingDay);
    const entry: EmployeeHistoryEntry = {
      id: newId('hist'),
      employeeId: emp.id,
      type: 'Status Change',
      effectiveDate: todayStr(),
      oldValue: reactivating
        ? { status: emp.status, lastWorkingDay: emp.lastWorkingDay }
        : { status: emp.status },
      newValue: { status },
      note: note || undefined,
      createdBy: by,
      createdAt: now,
      appliedAt: now,
    };
    storageService.saveEmployeeHistory([...storageService.getEmployeeHistory(), entry]);
    storageService.updateEmployee({
      ...emp,
      status,
      ...(reactivating ? { lastWorkingDay: undefined, exitType: undefined, exitReason: undefined } : {}),
    });
    return entry;
  });

/**
 * History for edits made in the Edit Employee form (effective today), so changes made
 * there show in the History tab too. Call before saving the edited employee.
 */
export const recordProfileEdit = (before: Employee, after: Employee, by: string) => {
  const rows: [EmployeeHistoryType, EmployeeHistoryValues][] = [
    ['Transfer', { department: after.department, shiftId: after.shiftId, siteId: after.siteId }],
    ['Promotion', { designation: after.designation }],
    ['Salary Revision', { basicSalary: after.basicSalary }],
    ['Status Change', { status: after.status }],
  ];
  const now = new Date().toISOString();
  const entries: EmployeeHistoryEntry[] = [];
  rows.forEach(([type, changes]) => {
    const { oldValue, newValue, changed } = diff(before, changes);
    if (!changed) return;
    entries.push({
      id: newId('hist'),
      employeeId: before.id,
      type,
      effectiveDate: todayStr(),
      oldValue,
      newValue,
      note: 'Edited in employee profile',
      createdBy: by,
      createdAt: now,
      appliedAt: now,
    });
  });
  if (entries.length) storageService.saveEmployeeHistory([...storageService.getEmployeeHistory(), ...entries]);
};

export interface DutyPeriodInput {
  type: DutyPeriodType;
  startDate: string;
  endDate?: string;
  note: string;
}

/**
 * Starts a Field Duty / WFH / Suspension period. One open period per employee: a period
 * still running on the new start date ends the day before, and periods starting on or after
 * it are replaced. Attendance for the covered days fills in automatically.
 */
export const startDutyPeriod = (emp: Employee, input: DutyPeriodInput, by: string) =>
  storageService.transaction(() => {
    requireDate(input.startDate, 'Start date');
    const endDate = input.endDate || null;
    if (endDate && endDate < input.startDate) throw new Error('The end date cannot be before the start date.');
    if (emp.joiningDate && input.startDate < emp.joiningDate) {
      throw new Error('The period cannot start before the joining date.');
    }
    if (emp.lastWorkingDay && input.startDate > emp.lastWorkingDay) {
      throw new Error(`${emp.name}'s last working day is ${emp.lastWorkingDay}.`);
    }

    const dayBefore = addDaysStr(input.startDate, -1);
    const others = storageService
      .getDutyPeriods()
      .filter((p) => !(p.employeeId === emp.id && p.startDate >= input.startDate))
      .map((p) =>
        p.employeeId === emp.id && (!p.endDate || p.endDate >= input.startDate)
          ? { ...p, endDate: dayBefore, endedBy: by }
          : p
      );
    const period: DutyPeriod = {
      id: newId('duty'),
      employeeId: emp.id,
      type: input.type,
      startDate: input.startDate,
      endDate,
      note: input.note.trim() || undefined,
      createdBy: by,
      createdAt: new Date().toISOString(),
    };
    storageService.saveDutyPeriods([...others, period]);
    return period;
  });

/** Ends a running period on endDate (the last day it covers). */
export const endDutyPeriod = (period: DutyPeriod, endDate: string, by: string) =>
  storageService.transaction(() => {
    requireDate(endDate, 'End date');
    if (endDate < period.startDate) throw new Error(`The period started on ${period.startDate}.`);
    storageService.saveDutyPeriods(
      storageService.getDutyPeriods().map((p) => (p.id === period.id ? { ...p, endDate, endedBy: by } : p))
    );
  });

/** True when the period has not ended by the given day. */
export const isPeriodRunning = (p: DutyPeriod, date = todayStr()) => !p.endDate || p.endDate >= date;
