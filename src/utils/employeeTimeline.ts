import { Employee, EmployeeHistoryEntry } from '../types';

/**
 * Employee records hold their current values. History rows keep what each change replaced,
 * so the employee as of an earlier date is the current record with every later change undone.
 * Changes dated in the future are not applied yet (see storageService.applyDueEmployeeChanges),
 * so they never need undoing here.
 */

/** Fields whose value on a past date matters (shift for attendance, salary for payroll, department / site for filters). */
const TIMELINE_FIELDS = ['department', 'designation', 'shiftId', 'siteId', 'basicSalary'] as const;

/** Applied history rows per employee, newest effective date first. */
const indexHistory = (history: EmployeeHistoryEntry[]) => {
  const byEmp = new Map<string, EmployeeHistoryEntry[]>();
  history
    .filter((h) => h.appliedAt)
    .forEach((h) => {
      const list = byEmp.get(h.employeeId);
      if (list) list.push(h);
      else byEmp.set(h.employeeId, [h]);
    });
  byEmp.forEach((list) =>
    list.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt))
  );
  return byEmp;
};

/**
 * Returns a lookup `(employee, date) => employee as of that date`. Build it once per
 * render or calculation and call it per day.
 */
export function makeEmployeeOnDate(history: EmployeeHistoryEntry[]) {
  const byEmp = indexHistory(history);
  return (emp: Employee, date: string): Employee => {
    const rows = byEmp.get(emp.id);
    // No change took effect after this date.
    if (!rows || rows[0].effectiveDate <= date) return emp;
    let result: Employee = emp;
    for (const h of rows) {
      if (h.effectiveDate <= date) break;
      const restore: Partial<Employee> = {};
      TIMELINE_FIELDS.forEach((field) => {
        if (h.oldValue[field] !== undefined) (restore as Record<string, unknown>)[field] = h.oldValue[field];
      });
      result = { ...result, ...restore };
    }
    return result;
  };
}

/** One-off version of makeEmployeeOnDate. */
export const employeeOnDate = (emp: Employee, date: string, history: EmployeeHistoryEntry[]) =>
  makeEmployeeOnDate(history)(emp, date);
