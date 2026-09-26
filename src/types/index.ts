export type Role =
  | 'manager' // Head manager: full access, manages user accounts
  | 'attendance_manager'
  | 'payroll_manager'
  | 'assistant_manager'
  | 'employee';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  employeeId?: string;
  avatar?: string;
  department?: string;
  designation?: string;
}

/** A login account stored in the system (managed from Users & Access). */
export interface UserAccount extends User {
  password: string;
  status: 'Active' | 'Disabled';
  createdAt: string;
  createdBy?: string;
  lastLoginAt?: string;
}

export type EmploymentType = 'Permanent' | 'Contract' | 'Intern';
export type Gender = 'Male' | 'Female' | 'Other';
export type EmployeeStatus = 'Active' | 'Inactive';

export interface Employee {
  id: string; // EMP-001
  name: string;
  email: string;
  phone: string;
  cnic: string;
  dob: string;
  gender: Gender;
  address: string;
  department: string;
  designation: string;
  employmentType: EmploymentType;
  joiningDate: string; // YYYY-MM-DD
  shiftId: string;
  reportingManagerId?: string;
  bankName: string;
  accountNumber: string;
  status: EmployeeStatus;
  avatar?: string;
  basicSalary: number;
}

export interface Shift {
  id: string;
  name: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  breakDurationMinutes: number;
  gracePeriodMinutes: number;
  halfDayThresholdHours: number;
  workingDays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  workingHours?: number;
  breakMinutes?: number;
  graceMinutes?: number;
}

export type AttendanceStatus =
  | 'Present'
  | 'Late'
  | 'Half Day'
  | 'Absent'
  | 'On Leave'
  | 'Holiday'
  | 'Weekend';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  checkIn?: string; // HH:mm:ss or HH:mm
  checkOut?: string; // HH:mm:ss or HH:mm
  checkInLocation?: {
    lat: number;
    lng: number;
    address?: string;
  };
  status: AttendanceStatus;
  workedMinutes: number;
  overtimeMinutes: number;
  isEarlyDeparture?: boolean;
  notes?: string;
  modifiedBy?: string;
}

export type LeaveType = 'Annual' | 'Sick' | 'Casual' | 'Unpaid';
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: LeaveType;
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  isHalfDay?: boolean;
  daysCount: number;
  reason: string;
  status: LeaveStatus;
  appliedAt: string;
  createdAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComment?: string;
  enteredBy?: string; // staff member who entered it on the employee's behalf
  requestSource?: 'Self' | 'Message' | 'Phone' | 'Email' | 'In person';
}

export interface RegularizationRequest {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  currentCheckIn?: string;
  currentCheckOut?: string;
  requestedCheckIn: string;
  requestedCheckOut: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComment?: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  type: 'Public' | 'Company' | 'Gazetted' | 'Optional';
  description?: string;
}

export interface TaxSlab {
  id: string;
  minIncome: number;
  maxIncome: number | null;
  baseTax: number;
  taxRate: number; // e.g. 0.05 for 5%
}

export type LoanType = 'Loan' | 'Advance';

export interface Loan {
  id: string;
  employeeId: string;
  loanType: LoanType;
  totalAmount: number;
  monthlyInstallment: number;
  paidAmount: number;
  startMonth: string; // YYYY-MM
  status: 'Active' | 'Completed';
  createdAt: string;
  notes?: string;
  amount?: number;
  remainingAmount?: number;
  endMonth?: string;
  reason?: string;
}

export interface PayrollItem {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  basicSalary: number;
  hra: number;
  medical: number;
  conveyance: number;
  grossSalary: number;
  workingDays: number;
  presentDays: number;
  lateCount: number;
  lateDays?: number;
  halfDays: number;
  absentDays: number;
  unpaidLeaveDays: number;
  overtimeHours: number;
  overtimePay: number;
  bonus: number;
  totalEarnings: number;
  perDaySalary: number;
  hourlyRate: number;
  incomeTax: number;
  providentFund: number;
  socialSecurity: number;
  lopDeduction: number;
  latePenaltyDeduction: number;
  loanInstallment: number;
  loanDeduction?: number;
  employerPF?: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  adjustmentNote?: string;
}

export type PayrollStatus = 'Draft' | 'Processed' | 'Approved' | 'Paid';

export interface PayrollRun {
  id: string;
  month: string; // YYYY-MM
  status: PayrollStatus;
  createdAt: string;
  processedAt?: string;
  approvedAt?: string;
  paidAt?: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  employeeCount: number;
  items: PayrollItem[];
}

export interface CompanySettings {
  name: string;
  logoText: string;
  address: string;
  currency: string;
  financialYearStartMonth: number;
  phone?: string;
  email?: string;
  taxNumber?: string;
}

export interface AttendanceSettings {
  defaultGracePeriod: number;
  otMinimumMinutes: number;
  otMultiplier: number;
  latePenaltyEveryCount: number;
  latePenaltyHalfDays: number;
  halfDayThresholdHours: number;
  graceMinutes?: number;
  overtimeMultiplier?: number;
  latePenaltyEnabled?: boolean;
}

export interface PayrollSettings {
  hraPercentage: number;
  medicalPercentage: number;
  conveyanceFixed: number;
  providentFundPercentage: number;
  socialSecurityFixed: number;
  taxSlabs: TaxSlab[];
  providentFundRate?: number;
  socialSecurityRate?: number;
}

export interface AnnualLeavePolicy {
  monthlyDays: number[]; // 12 entries, Jan..Dec: days credited for that month
  creditTiming: 'start' | 'end'; // credit when the month begins or once it is completed
  maxCarryForward: number; // max unused days carried into next year (0 = reset yearly)
}

export interface AppSettings {
  company: CompanySettings;
  attendance: AttendanceSettings;
  payroll: PayrollSettings;
  leaveQuotas: Record<LeaveType, number>;
  annualLeavePolicy?: AnnualLeavePolicy;
  leaves?: {
    annual: number;
    sick: number;
    casual: number;
    unpaid?: number;
  };
}

export interface AnalyticsFilterState {
  preset?: 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'this_year' | 'custom' | string;
  datePreset?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  departments: string[];
  employmentType: string;
  shiftId: string;
  employeeId: string;
  compareWithPrevious?: boolean;
}
