import {
  AppSettings,
  AttendanceRecord,
  Employee,
  Holiday,
  LeaveRequest,
  Loan,
  PayrollRun,
  RegularizationRequest,
  Shift,
  UserAccount,
} from '../types';
import {
  defaultUserAccounts,
  defaultEmployees,
  defaultHolidays,
  defaultLeaves,
  defaultLoans,
  defaultRegularizations,
  defaultSettings,
  defaultShifts,
  generateSeedAttendance,
  generateSeedPayrolls,
} from '../data/seedData';
import { evaluateAttendanceStatus, resolveUnmarkedDay } from '../utils/attendanceEngine';
import { addDaysStr, monthStartStr, todayStr } from '../utils/dateUtils';

const STORAGE_KEYS = {
  SETTINGS: 'workpulse_settings',
  EMPLOYEES: 'workpulse_employees',
  SHIFTS: 'workpulse_shifts',
  HOLIDAYS: 'workpulse_holidays',
  ATTENDANCE: 'workpulse_attendance',
  LEAVES: 'workpulse_leaves',
  REGULARIZATIONS: 'workpulse_regularizations',
  LOANS: 'workpulse_loans',
  PAYROLLS: 'workpulse_payrolls',
  USERS: 'workpulse_users',
  ACTIVE_USER: 'workpulse_active_user',
  SEEDED_VERSION: 'workpulse_seeded_v3',
  LEAVE_POLICY_V2: 'workpulse_leave_policy_v2',
  DEMO_LOGINS_V2: 'workpulse_demo_logins_v2',
  OPEN_SEED_DAY_V1: 'workpulse_open_seed_day_v1',
};

const AUTO_NOTES: Record<string, string> = {
  Absent: 'Auto-marked absent: no attendance recorded',
  Weekend: 'Off day for this shift',
  Holiday: 'Holiday',
  'On Leave': 'Approved leave',
};

class StorageService {
  constructor() {
    this.ensureInitialized();
  }

  public ensureInitialized(): void {
    if (typeof window === 'undefined') return;

    const isSeeded = localStorage.getItem(STORAGE_KEYS.SEEDED_VERSION);
    if (!isSeeded) {
      this.resetDemoData();
    }
    this.migrateAnnualLeavePolicy();
    this.migrateDemoLogins();
    this.migrateOpenSeedDay();
    this.syncAttendance();
  }

  private lastSyncDay = '';

  /**
   * Makes sure every past day has an attendance record, so the register, payroll and
   * reports all agree. A day nobody marked becomes Holiday, Weekend (off day for the
   * shift), On Leave (approved leave) or, on a past working day, Absent. Today only gets
   * the non-working states; it stays open until attendance is marked.
   * Records written here carry `autoMarked` and are re-derived when holidays, shifts or
   * leaves change. Anything saved by a person is never touched.
   */
  public syncAttendance(): void {
    if (typeof window === 'undefined') return;
    const today = todayStr();
    this.lastSyncDay = today;

    const records = this.getAttendanceRaw();
    const employees = this.getEmployees().filter((e) => e.status === 'Active');
    const shifts = this.getShifts();
    const holidays = this.getHolidays();
    const leaves = this.getLeaves();

    const byKey = new Map<string, AttendanceRecord>();
    const firstDateByEmp = new Map<string, string>();
    records.forEach((r) => {
      byKey.set(`${r.employeeId}|${r.date}`, r);
      const first = firstDateByEmp.get(r.employeeId);
      if (!first || r.date < first) firstDateByEmp.set(r.employeeId, r.date);
    });

    const remove = new Set<AttendanceRecord>();
    const replace = new Map<AttendanceRecord, AttendanceRecord>();
    const added: AttendanceRecord[] = [];
    const makeRecord = (empId: string, date: string, status: AttendanceRecord['status']): AttendanceRecord => ({
      id: `att-${empId}-${date}`,
      employeeId: empId,
      date,
      status,
      workedMinutes: 0,
      overtimeMinutes: 0,
      isEarlyDeparture: false,
      notes: AUTO_NOTES[status],
      autoMarked: true,
    });

    for (const emp of employees) {
      const shift = shifts.find((s) => s.id === emp.shiftId) || shifts[0];
      // Start where this employee's records start. An employee with no records yet starts
      // at their joining date, but never before the current month.
      let start = firstDateByEmp.get(emp.id);
      if (!start) {
        const monthStart = monthStartStr(today);
        start = emp.joiningDate && emp.joiningDate > monthStart ? emp.joiningDate : monthStart;
      }
      if (emp.joiningDate && emp.joiningDate > start) start = emp.joiningDate;

      for (let date = start; date <= today; date = addDaysStr(date, 1)) {
        const existing = byKey.get(`${emp.id}|${date}`);
        if (existing && !existing.autoMarked) continue;

        const status = resolveUnmarkedDay(emp, shift, date, holidays, leaves, today);
        if (status === 'Pending' || status === 'Upcoming' || status === 'Not Joined') {
          // e.g. a holiday was removed from today: drop the stale auto record.
          if (existing) remove.add(existing);
          continue;
        }
        if (!existing) added.push(makeRecord(emp.id, date, status));
        else if (existing.status !== status) replace.set(existing, makeRecord(emp.id, date, status));
      }
    }

    if (remove.size || replace.size || added.length) {
      const next = records
        .filter((r) => !remove.has(r))
        .map((r) => replace.get(r) || r)
        .concat(added);
      this.saveAttendance(next);
    }
  }

  /**
   * One-time: the demo data ended on a "live" day whose check-ins never got a check-out
   * (worked time was a 4h placeholder). Close those days at shift end.
   */
  private migrateOpenSeedDay(): void {
    if (localStorage.getItem(STORAGE_KEYS.OPEN_SEED_DAY_V1)) return;
    const today = todayStr();
    const shifts = this.getShifts();
    const employees = this.getEmployees();
    const holidays = this.getHolidays();
    let changed = false;
    const list = this.getAttendanceRaw().map((r) => {
      if (r.date !== '2026-09-23' || r.date >= today || !r.checkIn || r.checkOut || r.modifiedBy) return r;
      const emp = employees.find((e) => e.id === r.employeeId);
      const shift = shifts.find((s) => s.id === emp?.shiftId) || shifts[0];
      const result = evaluateAttendanceStatus(r.checkIn, shift.endTime, shift, r.date, holidays);
      changed = true;
      return {
        ...r,
        checkOut: shift.endTime,
        status: result.status,
        workedMinutes: result.workedMinutes,
        overtimeMinutes: result.overtimeMinutes,
        isEarlyDeparture: result.isEarlyDeparture,
      };
    });
    if (changed) this.saveAttendance(list);
    localStorage.setItem(STORAGE_KEYS.OPEN_SEED_DAY_V1, '1');
  }

  /**
   * One-time: move the seeded test accounts to short logins (password 123 for all).
   * An account is only changed if it still has its original demo login.
   */
  private migrateDemoLogins(): void {
    if (localStorage.getItem(STORAGE_KEYS.DEMO_LOGINS_V2)) return;
    const logins: Record<string, { from: string[]; pass: string[]; to: string }> = {
      'user-manager': { from: ['admin@workpulse.com', '123'], pass: ['admin123', '123'], to: '123' },
      'user-attendance': { from: ['attendance@workpulse.com'], pass: ['attend123'], to: 'attendance' },
      'user-payroll': { from: ['payroll@workpulse.com'], pass: ['payroll123'], to: 'payroll' },
      'user-assistant': { from: ['hr@workpulse.com'], pass: ['hr123'], to: 'assistant' },
      'user-employee': { from: ['ali.khan@workpulse.com'], pass: ['emp123'], to: 'employee' },
    };
    const users = localStorage.getItem(STORAGE_KEYS.USERS);
    if (users) {
      const list: UserAccount[] = JSON.parse(users);
      this.saveUsers(
        list.map((u) => {
          const l = logins[u.id];
          return l && l.from.includes(u.email) && l.pass.includes(u.password)
            ? { ...u, email: l.to, password: '123' }
            : u;
        })
      );
    }
    localStorage.setItem(STORAGE_KEYS.DEMO_LOGINS_V2, '1');
  }

  // One-time move from the old 3 days/month default to 2.5 days/month (30 days/year).
  private migrateAnnualLeavePolicy(): void {
    if (localStorage.getItem(STORAGE_KEYS.LEAVE_POLICY_V2)) return;
    const settings = this.getSettings();
    const days = settings.annualLeavePolicy?.monthlyDays;
    if (days && days.length === 12 && days.every((d) => d === 3)) {
      this.saveSettings({
        ...settings,
        annualLeavePolicy: { ...settings.annualLeavePolicy!, monthlyDays: Array(12).fill(2.5) },
      });
    }
    localStorage.setItem(STORAGE_KEYS.LEAVE_POLICY_V2, '1');
  }

  public resetDemoData(): void {
    const attendance = generateSeedAttendance();
    const payrolls = generateSeedPayrolls(
      attendance,
      defaultEmployees,
      defaultSettings,
      defaultShifts,
      defaultHolidays,
      defaultLoans
    );

    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(defaultSettings));
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(defaultEmployees));
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(defaultShifts));
    localStorage.setItem(STORAGE_KEYS.HOLIDAYS, JSON.stringify(defaultHolidays));
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(attendance));
    localStorage.setItem(STORAGE_KEYS.LEAVES, JSON.stringify(defaultLeaves));
    localStorage.setItem(STORAGE_KEYS.REGULARIZATIONS, JSON.stringify(defaultRegularizations));
    localStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(defaultLoans));
    localStorage.setItem(STORAGE_KEYS.PAYROLLS, JSON.stringify(payrolls));
    localStorage.setItem(STORAGE_KEYS.SEEDED_VERSION, '3.0.0');
    // Fresh demo data has no stale "live" day to close.
    localStorage.setItem(STORAGE_KEYS.OPEN_SEED_DAY_V1, '1');
    this.syncAttendance();
  }

  public resetToDemoData(): void {
    this.resetDemoData();
  }

  // --- Settings ---
  public getSettings(): AppSettings {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return data ? JSON.parse(data) : defaultSettings;
  }

  public saveSettings(settings: AppSettings): void {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }

  // --- Employees ---
  public getEmployees(): Employee[] {
    const data = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
    return data ? JSON.parse(data) : defaultEmployees;
  }

  public saveEmployees(employees: Employee[]): void {
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    this.syncAttendance();
  }

  public getEmployeeById(id: string): Employee | undefined {
    return this.getEmployees().find((e) => e.id === id);
  }

  public addEmployee(employee: Employee): void {
    const list = this.getEmployees();
    list.push(employee);
    this.saveEmployees(list);
  }

  public updateEmployee(employee: Employee): void {
    const list = this.getEmployees().map((e) => (e.id === employee.id ? employee : e));
    this.saveEmployees(list);
  }

  // --- Shifts ---
  public getShifts(): Shift[] {
    const data = localStorage.getItem(STORAGE_KEYS.SHIFTS);
    return data ? JSON.parse(data) : defaultShifts;
  }

  public saveShifts(shifts: Shift[]): void {
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    this.syncAttendance();
  }

  // --- Holidays ---
  public getHolidays(): Holiday[] {
    const data = localStorage.getItem(STORAGE_KEYS.HOLIDAYS);
    return data ? JSON.parse(data) : defaultHolidays;
  }

  public saveHolidays(holidays: Holiday[]): void {
    localStorage.setItem(STORAGE_KEYS.HOLIDAYS, JSON.stringify(holidays));
    this.syncAttendance();
  }

  // --- Attendance ---
  public getAttendance(): AttendanceRecord[] {
    // A tab left open overnight still gets yesterday closed off.
    if (this.lastSyncDay && this.lastSyncDay !== todayStr()) this.syncAttendance();
    return this.getAttendanceRaw();
  }

  private getAttendanceRaw(): AttendanceRecord[] {
    const data = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
    return data ? JSON.parse(data) : [];
  }

  public saveAttendance(records: AttendanceRecord[]): void {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(records));
  }

  public saveOrUpdateAttendanceRecord(record: AttendanceRecord): void {
    // A record saved by a person is theirs; the sync no longer re-derives it.
    if (record.autoMarked) record = { ...record, autoMarked: undefined };
    const list = this.getAttendanceRaw();
    const index = list.findIndex(
      (r) => r.employeeId === record.employeeId && r.date === record.date
    );
    if (index >= 0) {
      list[index] = record;
    } else {
      list.push(record);
    }
    this.saveAttendance(list);
  }

  // --- Leaves ---
  public getLeaves(): LeaveRequest[] {
    const data = localStorage.getItem(STORAGE_KEYS.LEAVES);
    return data ? JSON.parse(data) : [];
  }

  public saveLeaves(leaves: LeaveRequest[]): void {
    localStorage.setItem(STORAGE_KEYS.LEAVES, JSON.stringify(leaves));
    this.syncAttendance();
  }

  public addLeave(leave: LeaveRequest): void {
    const list = this.getLeaves();
    list.unshift(leave);
    this.saveLeaves(list);
  }

  public updateLeave(leave: LeaveRequest): void {
    const list = this.getLeaves().map((l) => (l.id === leave.id ? leave : l));
    this.saveLeaves(list);
  }

  // --- Regularizations ---
  public getRegularizations(): RegularizationRequest[] {
    const data = localStorage.getItem(STORAGE_KEYS.REGULARIZATIONS);
    return data ? JSON.parse(data) : [];
  }

  public saveRegularizations(regs: RegularizationRequest[]): void {
    localStorage.setItem(STORAGE_KEYS.REGULARIZATIONS, JSON.stringify(regs));
  }

  public addRegularization(reg: RegularizationRequest): void {
    const list = this.getRegularizations();
    list.unshift(reg);
    this.saveRegularizations(list);
  }

  public updateRegularization(reg: RegularizationRequest): void {
    const list = this.getRegularizations().map((r) => (r.id === reg.id ? reg : r));
    this.saveRegularizations(list);
  }

  // --- Loans ---
  public getLoans(): Loan[] {
    const data = localStorage.getItem(STORAGE_KEYS.LOANS);
    return data ? JSON.parse(data) : [];
  }

  public saveLoans(loans: Loan[]): void {
    localStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(loans));
  }

  public addLoan(loan: Loan): void {
    const list = this.getLoans();
    list.unshift(loan);
    this.saveLoans(list);
  }

  public updateLoan(loan: Loan): void {
    const list = this.getLoans().map((l) => (l.id === loan.id ? loan : l));
    this.saveLoans(list);
  }

  // --- User accounts ---
  public getUsers(): UserAccount[] {
    const data = localStorage.getItem(STORAGE_KEYS.USERS);
    if (data) return JSON.parse(data);
    this.saveUsers(defaultUserAccounts);
    return [...defaultUserAccounts];
  }

  public saveUsers(users: UserAccount[]): void {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }

  // --- Payrolls ---
  public getPayrolls(): PayrollRun[] {
    const data = localStorage.getItem(STORAGE_KEYS.PAYROLLS);
    return data ? JSON.parse(data) : [];
  }

  public savePayrolls(payrolls: PayrollRun[]): void {
    localStorage.setItem(STORAGE_KEYS.PAYROLLS, JSON.stringify(payrolls));
  }

  public saveOrUpdatePayroll(run: PayrollRun): void {
    const list = this.getPayrolls();
    const idx = list.findIndex((r) => r.id === run.id || r.month === run.month);
    if (idx >= 0) {
      list[idx] = run;
    } else {
      list.push(run);
    }
    this.savePayrolls(list);
  }
}

export const storageService = new StorageService();
