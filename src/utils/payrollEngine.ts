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

  // Earnings
  const hra = (basicSalary * (settings.payroll.hraPercentage || 40)) / 100;
  const medical = (basicSalary * (settings.payroll.medicalPercentage || 10)) / 100;
  const conveyance = settings.payroll.conveyanceFixed || 5000;
  const grossSalary = basicSalary + hra + medical + conveyance;

  // Per day and hourly rates
  const perDaySalary = grossSalary / validWorkingDays;
  const hourlyRate = perDaySalary / validShiftHours;

  // Overtime pay (1.5x hourly rate default)
  const otMultiplier = settings.attendance.otMultiplier || 1.5;
  const overtimePay = Math.max(0, overtimeHours * hourlyRate * otMultiplier);

  // LOP Deduction: (Absent + Unpaid Leave + Half Day * 0.5) * Per Day
  const lopDays = absentDays + unpaidLeaveDays + halfDays * 0.5;
  const lopDeduction = lopDays * perDaySalary;

  // Late Penalty: floor(lateCount / 3) * 0.5 * Per Day
  const lateEvery = settings.attendance.latePenaltyEveryCount || 3;
  const latePenaltyDays = Math.floor(lateCount / lateEvery) * (settings.attendance.latePenaltyHalfDays || 0.5);
  const latePenaltyDeduction = latePenaltyDays * perDaySalary;

  // Annual Taxable Income & Monthly Tax
  const annualGross = grossSalary * 12;
  const annualTax = calculateAnnualTax(annualGross, settings.payroll.taxSlabs);
  const incomeTax = annualTax / 12;

  // Provident Fund: 5% of basic
  const pfPercent = settings.payroll.providentFundPercentage || 5;
  const providentFund = (basicSalary * pfPercent) / 100;

  // Social Security: Fixed e.g. 370
  const socialSecurity = settings.payroll.socialSecurityFixed || 370;

  // Summaries
  const totalEarnings = grossSalary + overtimePay + bonus;
  const otherDeductions = 0;
  const totalDeductions =
    incomeTax +
    providentFund +
    socialSecurity +
    lopDeduction +
    latePenaltyDeduction +
    loanInstallment +
    otherDeductions;

  const netSalary = Math.max(0, totalEarnings - totalDeductions);

  return {
    hra: round(hra),
    medical: round(medical),
    conveyance: round(conveyance),
    grossSalary: round(grossSalary),
    perDaySalary: round(perDaySalary),
    hourlyRate: round(hourlyRate),
    overtimePay: round(overtimePay),
    bonus: round(bonus),
    totalEarnings: round(totalEarnings),
    incomeTax: round(incomeTax),
    providentFund: round(providentFund),
    socialSecurity: round(socialSecurity),
    lopDeduction: round(lopDeduction),
    latePenaltyDeduction: round(latePenaltyDeduction),
    loanInstallment: round(loanInstallment),
    otherDeductions: round(otherDeductions),
    totalDeductions: round(totalDeductions),
    netSalary: round(netSalary),
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
