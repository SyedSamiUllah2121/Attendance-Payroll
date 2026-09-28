import { AppSettings, TaxSlab } from '../types';

/**
 * Calculates annual income tax given an annual taxable income and tax slabs.
 */
export function calculateAnnualTax(annualIncome: number, slabs: TaxSlab[]): number {
  if (annualIncome <= 0) return 0;

  // Slabs are ordered by minIncome
  const sortedSlabs = [...slabs].sort((a, b) => a.minIncome - b.minIncome);

  for (const slab of sortedSlabs) {
    const isAboveMin = annualIncome > slab.minIncome;
    const isBelowMax = slab.maxIncome === null || annualIncome <= slab.maxIncome;

    if (isAboveMin && isBelowMax) {
      const taxableExcess = annualIncome - slab.minIncome;
      return slab.baseTax + taxableExcess * slab.taxRate;
    }
  }

  // If higher than highest slab
  const highestSlab = sortedSlabs[sortedSlabs.length - 1];
  if (highestSlab && annualIncome > highestSlab.minIncome) {
    const taxableExcess = annualIncome - highestSlab.minIncome;
    return highestSlab.baseTax + taxableExcess * highestSlab.taxRate;
  }

  return 0;
}

export interface PayrollCalculationInput {
  basicSalary: number;
  workingDaysInMonth: number;
  shiftHoursPerDay: number;
  presentDays: number;
  lateCount: number;
  halfDays: number;
  absentDays: number;
  unpaidLeaveDays: number;
  overtimeHours: number;
  bonus?: number;
  loanInstallment?: number;
  settings: AppSettings;
}

export interface PayrollCalculationResult {
  hra: number;
  medical: number;
  conveyance: number;
  grossSalary: number;
  perDaySalary: number;
  hourlyRate: number;
  overtimePay: number;
  bonus: number;
  totalEarnings: number;
  incomeTax: number;
  providentFund: number;
  socialSecurity: number;
  lopDeduction: number;
  latePenaltyDeduction: number;
  loanInstallment: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
}

/** A rate that may be saved as a percentage (5) or a fraction (0.05); returned as a fraction. */
export function toRateFraction(value: number | undefined, fallbackPercent: number): number {
  const v = typeof value === 'number' && isFinite(value) && value >= 0 ? value : fallbackPercent;
  return v >= 1 ? v / 100 : v;
}

/** Monthly provident fund rate (fraction of basic) from settings. */
export function getProvidentFundRate(settings: AppSettings): number {
  return toRateFraction(settings.payroll.providentFundRate ?? settings.payroll.providentFundPercentage, 5);
}

/** Loss-of-pay days: absences, unpaid leave and half of each half day. */
export function getLopDays(absentDays: number, unpaidLeaveDays: number, halfDays: number): number {
  return (absentDays || 0) + (unpaidLeaveDays || 0) + (halfDays || 0) * 0.5;
}

/**
 * Executes standard payroll calculations according to WorkPulse business rules.
 */
export function calculateSalary(input: PayrollCalculationInput): PayrollCalculationResult {
  const {
    basicSalary,
    workingDaysInMonth,
    shiftHoursPerDay = 8,
    lateCount,
    halfDays,
    absentDays,
    unpaidLeaveDays,
    overtimeHours,
    bonus = 0,
    loanInstallment = 0,
    settings,
  } = input;

  const validWorkingDays = workingDaysInMonth > 0 ? workingDaysInMonth : 22;
  const validShiftHours = shiftHoursPerDay > 0 ? shiftHoursPerDay : 8;
  const pay = settings.payroll;
  const att = settings.attendance;

  // Earnings (a setting of 0 is respected; only missing values fall back to defaults)
  const hra = round((basicSalary * (pay.hraPercentage ?? 40)) / 100);
  const medical = round((basicSalary * (pay.medicalPercentage ?? 10)) / 100);
  const conveyance = round(pay.conveyanceFixed ?? 5000);
  const grossSalary = round(basicSalary + hra + medical + conveyance);

  // Per day and hourly rates
  const perDaySalary = grossSalary / validWorkingDays;
  const hourlyRate = perDaySalary / validShiftHours;

  // Overtime pay (1.5x hourly rate default)
  const otMultiplier = att.overtimeMultiplier ?? att.otMultiplier ?? 1.5;
  const overtimePay = round(Math.max(0, (overtimeHours || 0) * hourlyRate * otMultiplier));

  // LOP Deduction: (Absent + Unpaid Leave + Half Day * 0.5) * Per Day, never more than gross
  const lopDays = getLopDays(absentDays, unpaidLeaveDays, halfDays);
  const lopDeduction = round(Math.min(grossSalary, Math.max(0, lopDays * perDaySalary)));

  // Late Penalty: floor(lateCount / every) * halfDays * Per Day, capped at what is left of gross
  const lateEvery = att.latePenaltyEveryCount > 0 ? att.latePenaltyEveryCount : 3;
  const latePenaltyDays =
    att.latePenaltyEnabled === false
      ? 0
      : Math.floor((lateCount || 0) / lateEvery) * (att.latePenaltyHalfDays ?? 0.5);
  const latePenaltyDeduction = round(
    Math.min(grossSalary - lopDeduction, Math.max(0, latePenaltyDays * perDaySalary))
  );

  // Annual Taxable Income & Monthly Tax
  const annualGross = grossSalary * 12;
  const annualTax = calculateAnnualTax(annualGross, pay.taxSlabs || []);
  const incomeTax = round(annualTax / 12);

  // Provident Fund: % of basic
  const providentFund = round(basicSalary * getProvidentFundRate(settings));

  // Social Security: Fixed e.g. 370
  const socialSecurity = round(pay.socialSecurityFixed ?? 370);

  // Summaries (built from rounded components so the parts always add up to the totals)
  const totalEarnings = round(grossSalary + overtimePay + bonus);
  const otherDeductions = 0;
  const deductionsBeforeLoan = round(
    incomeTax + providentFund + socialSecurity + lopDeduction + latePenaltyDeduction + otherDeductions
  );

  // A loan installment can only be recovered from what is left of the salary
  const loanRecovered = round(
    Math.min(Math.max(0, loanInstallment), Math.max(0, totalEarnings - deductionsBeforeLoan))
  );
  const totalDeductions = round(deductionsBeforeLoan + loanRecovered);

  const netSalary = round(Math.max(0, totalEarnings - totalDeductions));

  return {
    hra,
    medical,
    conveyance,
    grossSalary,
    perDaySalary: round(perDaySalary),
    hourlyRate: round(hourlyRate),
    overtimePay,
    bonus: round(bonus),
    totalEarnings,
    incomeTax,
    providentFund,
    socialSecurity,
    lopDeduction,
    latePenaltyDeduction,
    loanInstallment: loanRecovered,
    otherDeductions,
    totalDeductions,
    netSalary,
  };
}

export function round(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(amount: number, currency = 'Rs.'): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${currency} ${formatted}`;
}

/**
 * Converts a numeric amount to English words for official payslips.
 */
export function numberToWords(amount: number, currencyName = 'Rupees'): string {
  const rounded = Math.floor(amount);
  if (rounded === 0) return `Zero ${currencyName} Only`;

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertLessThanOneThousand(n: number): string {
    if (n === 0) return '';
    let str = '';
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    if (n > 0) {
      str += ones[n] + ' ';
    }
    return str.trim();
  }

  let num = rounded;
  let result = '';

  const billion = Math.floor(num / 1000000000);
  num %= 1000000000;
  const million = Math.floor(num / 1000000);
  num %= 1000000;
  const thousand = Math.floor(num / 1000);
  const remainder = num % 1000;

  if (billion > 0) {
    result += convertLessThanOneThousand(billion) + ' Billion ';
  }
  if (million > 0) {
    result += convertLessThanOneThousand(million) + ' Million ';
  }
  if (thousand > 0) {
    result += convertLessThanOneThousand(thousand) + ' Thousand ';
  }
  if (remainder > 0) {
    result += convertLessThanOneThousand(remainder);
  }

  return `${result.trim()} ${currencyName} Only`;
}
