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
 * Employee changes made from the Edit Employee dialog (saveEmployeeEdit) and the Sites page:
 * transfer, promotion / salary revision, status, exit and duty periods.
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

export interface EmployeeEditInput {
  /** The record as edited in the form. */
  edited: Employee;
  /** When site / department / shift / designation / salary changes take effect. */
  effectiveDate: string;
  note: string;
  duty?: { action: DutyPeriodType | 'end'; startDate: string; endDate: string; note: string };
  exit?: { action: ExitType | 'cancel'; lastWorkingDay: string; reason: string };
}

/** Fields that change only through history (so past dates and payroll can see the old value). */
const TRACKED_FIELDS = ['department', 'designation', 'shiftId', 'siteId', 'basicSalary', 'status'] as const;

/**
 * Saves the Edit Employee form in one transaction and returns what changed:
 * - personal details (name, contact, bank...) at once,
 * - site / department / shift as a Transfer and designation / salary as a Promotion or
 *   Salary Revision, effective from input.effectiveDate (scheduled when dated ahead),
 * - a status change, an exit (or cancelling one), and starting or ending a duty period.
 */
export const saveEmployeeEdit = (before: Employee, input: EmployeeEditInput, by: string): string[] =>
  storageService.transaction(() => {
    const { edited, effectiveDate, note } = input;
    const fresh = () => storageService.getEmployeeById(before.id) || before;
    const done: string[] = [];

    // 1. Personal details; tracked fields keep their current value here
    const personal: Employee = { ...edited };
    TRACKED_FIELDS.forEach((key) => ((personal as unknown as Record<string, unknown>)[key] = before[key]));
    personal.lastWorkingDay = before.lastWorkingDay;
    personal.exitType = before.exitType;
    personal.exitReason = before.exitReason;
    storageService.updateEmployee(personal);

    // 2. Job and salary changes, logged in history
    const transfer = { department: edited.department, shiftId: edited.shiftId, siteId: edited.siteId };
    const revision = { designation: edited.designation, basicSalary: edited.basicSalary };
    if (diff(before, transfer).changed || diff(before, revision).changed) {
      requireDate(effectiveDate, 'Effective date');
      if (before.joiningDate && effectiveDate < before.joiningDate) {
        throw new Error('Changes cannot take effect before the joining date.');
      }
      const t = recordChange(fresh(), 'Transfer', transfer, effectiveDate, note, by);
      if (t) done.push(t.appliedAt ? 'Transfer' : `Transfer (from ${effectiveDate})`);
      const type = edited.designation !== before.designation ? 'Promotion' : 'Salary Revision';
      const r = recordChange(fresh(), type, revision, effectiveDate, note, by);
      if (r) done.push(r.appliedAt ? type : `${type} (from ${effectiveDate})`);
    }

    // 3. Status
    if (edited.status !== before.status) {
      setEmployeeStatus(fresh(), edited.status, note || 'Changed in employee profile', by);
      done.push(`Status ${edited.status}`);
    }

    // 4. Exit
    if (input.exit?.action === 'cancel') {
      setEmployeeStatus(fresh(), 'Active', 'Exit cancelled', by);
      done.push('Exit cancelled');
    } else if (input.exit) {
      exitEmployee(
        fresh(),
        { exitType: input.exit.action, lastWorkingDay: input.exit.lastWorkingDay, reason: input.exit.reason },
        by
      );
      done.push(`${input.exit.action}, last day ${input.exit.lastWorkingDay}`);
    }

    // 5. Duty period
    if (input.duty?.action === 'end') {
      const period = storageService
        .getDutyPeriods()
        .find((p) => p.employeeId === before.id && isPeriodRunning(p, todayStr()));
      if (!period) throw new Error('There is no running duty period to end.');
      endDutyPeriod(period, input.duty.endDate, by);
      done.push(`${period.type} ends ${input.duty.endDate}`);
    } else if (input.duty) {
      startDutyPeriod(
        fresh(),
        {
          type: input.duty.action,
          startDate: input.duty.startDate,
          endDate: input.duty.endDate || undefined,
          note: input.duty.note,
        },
        by
      );
      done.push(`${input.duty.action} from ${input.duty.startDate}`);
    }

    return done;
  });
