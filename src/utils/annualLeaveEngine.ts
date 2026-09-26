import { AnnualLeavePolicy, AppSettings, Employee, LeaveRequest } from '../types';

export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const DEFAULT_ANNUAL_LEAVE_POLICY: AnnualLeavePolicy = {
  monthlyDays: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  creditTiming: 'end',
  joiningCutoffDay: 15,
  maxCarryForward: 0,
};

/** Reads the policy from settings, filling any missing fields with defaults (older saved settings). */
export const getAnnualLeavePolicy = (settings: AppSettings): AnnualLeavePolicy => {
  const p = settings.annualLeavePolicy;
  if (!p) return DEFAULT_ANNUAL_LEAVE_POLICY;
  const monthlyDays = Array.from({ length: 12 }, (_, i) => Number(p.monthlyDays?.[i] ?? 3) || 0);
  return {
    monthlyDays,
    creditTiming: p.creditTiming === 'start' ? 'start' : 'end',
    joiningCutoffDay: p.joiningCutoffDay ?? DEFAULT_ANNUAL_LEAVE_POLICY.joiningCutoffDay,
    maxCarryForward: p.maxCarryForward ?? DEFAULT_ANNUAL_LEAVE_POLICY.maxCarryForward,
  };
};

export type AccrualMonthStatus = 'not-joined' | 'credited' | 'accruing' | 'upcoming';

export interface AccrualMonth {
  month: number; // 0-11
  status: AccrualMonthStatus;
  earned: number; // credited so far this month
  entitlement: number; // what this month is worth once credited (0 if not joined)
  used: number;
  pending: number;
  runningBalance: number;
}

export interface AnnualLeaveSummary {
  employeeId: string;
  year: number;
  carriedForward: number;
  accrued: number; // credited so far this year
  used: number; // approved annual leave taken this year
  pending: number; // awaiting approval this year
  balance: number; // carriedForward + accrued - used
  available: number; // balance - pending
  yearEntitlement: number; // carriedForward + everything the year will credit
  serviceMonths: number; // completed months of service as of today
  months: AccrualMonth[];
}

const monthIndex = (year: number, month: number) => year * 12 + month;

const round = (n: number) => Math.round(n * 100) / 100;

/** First absolute month in which the employee starts earning, based on joining date and cutoff day. */
const firstEarningMonth = (employee: Employee, policy: AnnualLeavePolicy): number => {
  const [y, m, d] = employee.joiningDate.split('-').map(Number);
  const base = monthIndex(y, m - 1);
  return d <= policy.joiningCutoffDay ? base : base + 1;
};

const isCredited = (abs: number, todayAbs: number, policy: AnnualLeavePolicy) =>
  policy.creditTiming === 'start' ? abs <= todayAbs : abs < todayAbs;

const leaveMonth = (l: LeaveRequest) => {
  const [y, m] = l.fromDate.split('-').map(Number);
  return { year: y, month: m - 1 };
};

const sumLeaves = (leaves: LeaveRequest[], year: number, month?: number) =>
  leaves
    .filter((l) => {
      const lm = leaveMonth(l);
      return lm.year === year && (month === undefined || lm.month === month);
    })
    .reduce((acc, l) => acc + (l.daysCount || 0), 0);

const accruedInYear = (
  year: number,
  startAbs: number,
  todayAbs: number,
  policy: AnnualLeavePolicy
) =>
  policy.monthlyDays.reduce((acc, days, m) => {
    const abs = monthIndex(year, m);
    return abs >= startAbs && isCredited(abs, todayAbs, policy) ? acc + days : acc;
  }, 0);

export const computeAnnualLeave = (
  employee: Employee,
  allLeaves: LeaveRequest[],
  policy: AnnualLeavePolicy,
  year: number,
  today: Date = new Date()
): AnnualLeaveSummary => {
  const todayAbs = monthIndex(today.getFullYear(), today.getMonth());
  const startAbs = firstEarningMonth(employee, policy);
  const joinYear = Number(employee.joiningDate.slice(0, 4));

  const annual = allLeaves.filter(
    (l) => l.employeeId === employee.id && l.leaveType === 'Annual'
  );
  const approved = annual.filter((l) => l.status === 'Approved');
  const pendingLeaves = annual.filter((l) => l.status === 'Pending');

  // Roll balances forward from the joining year, capping what carries into each new year.
  let carriedForward = 0;
  for (let y = joinYear; y < year; y++) {
    const closing =
      carriedForward + accruedInYear(y, startAbs, todayAbs, policy) - sumLeaves(approved, y);
    carriedForward = Math.min(closing, policy.maxCarryForward);
  }

  let running = carriedForward;
  const months: AccrualMonth[] = policy.monthlyDays.map((days, m) => {
    const abs = monthIndex(year, m);
    const joined = abs >= startAbs;
    let status: AccrualMonthStatus;
    if (!joined) status = 'not-joined';
    else if (isCredited(abs, todayAbs, policy)) status = 'credited';
    else if (abs === todayAbs) status = 'accruing';
    else status = 'upcoming';

    const earned = status === 'credited' ? days : 0;
    const used = sumLeaves(approved, year, m);
    running += earned - used;
    return {
      month: m,
      status,
      earned,
      entitlement: joined ? days : 0,
      used,
      pending: sumLeaves(pendingLeaves, year, m),
      runningBalance: round(running),
    };
  });

  const accrued = months.reduce((a, m) => a + m.earned, 0);
  const used = sumLeaves(approved, year);
  const pending = sumLeaves(pendingLeaves, year);
  const balance = carriedForward + accrued - used;

  const [jy, jm, jd] = employee.joiningDate.split('-').map(Number);
  let serviceMonths = (today.getFullYear() - jy) * 12 + (today.getMonth() - (jm - 1));
  if (today.getDate() < jd) serviceMonths -= 1;

  return {
    employeeId: employee.id,
    year,
    carriedForward: round(carriedForward),
    accrued: round(accrued),
    used: round(used),
    pending: round(pending),
    balance: round(balance),
    available: round(balance - pending),
    yearEntitlement: round(carriedForward + months.reduce((a, m) => a + m.entitlement, 0)),
    serviceMonths: Math.max(0, serviceMonths),
    months,
  };
};

export interface LeaveYearRecord {
  year: number;
  carriedIn: number;
  earned: number;
  used: number;
  closing: number; // carriedIn + earned - used
  carriedOut: number; // what moved into next year (after the carry-forward cap)
  lapsed: number; // unused days lost to the carry-forward cap
  isCurrent: boolean;
}

export interface EmployeeLeaveRecord {
  employeeId: string;
  serviceMonths: number; // completed months worked since joining
  earnedMonths: number; // months that have credited leave
  totalEarned: number;
  totalUsed: number;
  totalLapsed: number;
  pending: number;
  balance: number; // current year balance
  available: number;
  years: LeaveYearRecord[]; // newest first
  current: AnnualLeaveSummary;
  annualLeaves: LeaveRequest[]; // all annual leave requests, newest first
}

/** Lifetime annual-leave record for one employee, from joining date to today. */
export const computeLeaveRecord = (
  employee: Employee,
  allLeaves: LeaveRequest[],
  policy: AnnualLeavePolicy,
  today: Date = new Date()
): EmployeeLeaveRecord => {
  const joinYear = Number(employee.joiningDate.slice(0, 4));
  const thisYear = today.getFullYear();

  const years: LeaveYearRecord[] = [];
  let earnedMonths = 0;
  let current: AnnualLeaveSummary | undefined;
  for (let y = joinYear; y <= Math.max(joinYear, thisYear); y++) {
    const s = computeAnnualLeave(employee, allLeaves, policy, y, today);
    earnedMonths += s.months.filter((m) => m.status === 'credited').length;
    const isCurrent = y === thisYear;
    const closing = s.balance;
    const carriedOut = isCurrent ? closing : Math.min(closing, policy.maxCarryForward);
    years.push({
      year: y,
      carriedIn: s.carriedForward,
      earned: s.accrued,
      used: s.used,
      closing,
      carriedOut: round(carriedOut),
      lapsed: round(Math.max(0, closing - carriedOut)),
      isCurrent,
    });
    if (isCurrent || y === joinYear) current = s;
  }

  const annualLeaves = allLeaves
    .filter((l) => l.employeeId === employee.id && l.leaveType === 'Annual')
    .sort((a, b) => b.fromDate.localeCompare(a.fromDate));

  const cur = current!;
  return {
    employeeId: employee.id,
    serviceMonths: cur.serviceMonths,
    earnedMonths,
    totalEarned: round(years.reduce((a, y) => a + y.earned, 0)),
    totalUsed: round(years.reduce((a, y) => a + y.used, 0)),
    totalLapsed: round(years.reduce((a, y) => a + y.lapsed, 0)),
    pending: cur.pending,
    balance: cur.balance,
    available: cur.available,
    years: years.reverse(),
    current: cur,
    annualLeaves,
  };
};

export const formatService = (months: number) => {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y) return `${m} month${m === 1 ? '' : 's'}`;
  return `${y} yr${y === 1 ? '' : 's'}${m ? ` ${m} mo` : ''}`;
};
