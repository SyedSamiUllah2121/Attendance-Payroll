import { Role } from '../types';

/**
 * Everything access-controlled in the app. Pages and buttons check these,
 * never the role name directly, so changing what a role can do happens here.
 */
export type Permission =
  | 'dashboard.org' // company-wide dashboard (otherwise personal)
  | 'employees.view'
  | 'employees.edit' // add / edit / deactivate employees
  | 'attendance.view' // everyone's attendance
  | 'attendance.mark' // mark sheet, edit records, bulk mark, holidays from the sheet
  | 'attendance.approve' // approve attendance corrections
  | 'leaves.view' // everyone's leave requests
  | 'leaves.create' // enter leave requests for any employee
  | 'leaves.approve' // approve / reject leave
  | 'annualLeave.view' // everyone's annual leave records
  | 'annualLeave.policy' // change the accrual policy
  | 'payroll.manage'
  | 'payslips.view' // everyone's payslips
  | 'loans.manage'
  | 'shifts.manage'
  | 'holidays.manage'
  | 'analytics.view' // company-wide analytics
  | 'reports.view'
  | 'settings.manage'
  | 'users.manage'; // create accounts and assign roles

const ALL: Permission[] = [
  'dashboard.org',
  'employees.view',
  'employees.edit',
  'attendance.view',
  'attendance.mark',
  'attendance.approve',
  'leaves.view',
  'leaves.create',
  'leaves.approve',
  'annualLeave.view',
  'annualLeave.policy',
  'payroll.manage',
  'payslips.view',
  'loans.manage',
  'shifts.manage',
  'holidays.manage',
  'analytics.view',
  'reports.view',
  'settings.manage',
  'users.manage',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  manager: ALL,
  attendance_manager: [
    'dashboard.org',
    'employees.view',
    'attendance.view',
    'attendance.mark',
    'attendance.approve',
    'leaves.view',
    'annualLeave.view',
    'shifts.manage',
    'holidays.manage',
    'analytics.view',
    'reports.view',
  ],
  payroll_manager: [
    'dashboard.org',
    'employees.view',
    'attendance.view',
    'leaves.view',
    'annualLeave.view',
    'payroll.manage',
    'payslips.view',
    'loans.manage',
    'analytics.view',
    'reports.view',
  ],
  assistant_manager: [
    'dashboard.org',
    'employees.view',
    'employees.edit',
    'attendance.view',
    'leaves.view',
    'leaves.create',
    'annualLeave.view',
  ],
  employee: [],
};

export const ROLE_LABELS: Record<Role, string> = {
  manager: 'Head Manager',
  attendance_manager: 'Attendance Manager',
  payroll_manager: 'Payroll Manager',
  assistant_manager: 'Assistant Manager',
  employee: 'Employee',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  manager: 'Full access to everything, including user accounts and leave approval',
  attendance_manager: 'Attendance, corrections, shifts and holidays',
  payroll_manager: 'Payroll, payslips, loans and reports',
  assistant_manager: 'Enters leave requests and employee details; cannot approve',
  employee: 'Own attendance, leave requests and payslips',
};

export const ROLE_ORDER: Role[] = [
  'manager',
  'attendance_manager',
  'payroll_manager',
  'assistant_manager',
  'employee',
];

/** Older saved sessions used 'admin' / 'hr'. */
export const normalizeRole = (role: string): Role => {
  if (role === 'admin') return 'manager';
  if (role === 'hr') return 'assistant_manager';
  return (ROLE_ORDER as string[]).includes(role) ? (role as Role) : 'employee';
};

export const roleCan = (role: Role | undefined, permission: Permission) =>
  !!role && ROLE_PERMISSIONS[role].includes(permission);

/** Page ids (as used by the sidebar / App router) and who may open them. */
export const PAGE_ACCESS: Record<string, { staff?: Permission; selfService: boolean }> = {
  dashboard: { selfService: true },
  attendance: { staff: 'attendance.view', selfService: true },
  leaves: { staff: 'leaves.view', selfService: true },
  'annual-leave': { staff: 'annualLeave.view', selfService: true },
  employees: { staff: 'employees.view', selfService: false },
  payroll: { staff: 'payroll.manage', selfService: false },
  payslips: { staff: 'payslips.view', selfService: true },
  loans: { staff: 'loans.manage', selfService: false },
  analytics: { staff: 'analytics.view', selfService: true },
  shifts: { staff: 'shifts.manage', selfService: false },
  holidays: { staff: 'holidays.manage', selfService: true },
  reports: { staff: 'reports.view', selfService: false },
  users: { staff: 'users.manage', selfService: false },
  settings: { staff: 'settings.manage', selfService: false },
};

/**
 * Employees get the self-service pages. Staff roles get the pages their permissions cover
 * (plus the dashboard and holiday calendar).
 */
export const canOpenPage = (role: Role | undefined, page: string) => {
  const access = PAGE_ACCESS[page];
  if (!role || !access) return false;
  if (role === 'employee') return access.selfService;
  if (page === 'dashboard' || page === 'holidays') return true;
  return !!access.staff && roleCan(role, access.staff);
};
