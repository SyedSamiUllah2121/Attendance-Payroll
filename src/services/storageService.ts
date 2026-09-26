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
  }

  // --- Holidays ---
  public getHolidays(): Holiday[] {
    const data = localStorage.getItem(STORAGE_KEYS.HOLIDAYS);
    return data ? JSON.parse(data) : defaultHolidays;
  }

  public saveHolidays(holidays: Holiday[]): void {
    localStorage.setItem(STORAGE_KEYS.HOLIDAYS, JSON.stringify(holidays));
  }

  // --- Attendance ---
  public getAttendance(): AttendanceRecord[] {
    const data = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
    return data ? JSON.parse(data) : [];
  }

  public saveAttendance(records: AttendanceRecord[]): void {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(records));
  }

  public saveOrUpdateAttendanceRecord(record: AttendanceRecord): void {
    const list = this.getAttendance();
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
