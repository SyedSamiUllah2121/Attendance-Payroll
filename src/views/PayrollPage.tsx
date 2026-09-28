import React, { useState } from 'react';
import {
  CreditCard,
  Play,
  CheckCircle,
  Download,
  DollarSign,
  ChevronDown,
  ChevronUp,
  FileText,
  Lock,
  Eye,
  AlertTriangle,
  Building,
} from 'lucide-react';
import { Employee, Loan, PayrollItem, PayrollRun, Shift } from '../types';
import { storageService } from '../services/storageService';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import { Badge } from '../components/common/Badge';
import { calculateSalary, getLopDays, getProvidentFundRate, round } from '../utils/payrollEngine';
import { getWorkingDaysInMonth } from '../utils/attendanceEngine';
import { currentMonthStr, monthEndStr, todayStr, toDateStr } from '../utils/dateUtils';

interface PayrollPageProps {
  onOpenPayslip?: (employeeId: string, month?: string) => void;
}

/** Outstanding balance of a loan (older records have no remainingAmount). */
const loanRemaining = (l: Loan) =>
  Math.max(0, l.remainingAmount ?? (l.amount ?? l.totalAmount) - (l.paidAmount || 0));

/** Active loans with a balance whose deductions have started by the given month, oldest first. */
const loansDueFor = (loans: Loan[], employeeId: string, month: string) =>
  loans
    .filter(
      (l) =>
        l.employeeId === employeeId &&
        l.status === 'Active' &&
        (!l.startMonth || l.startMonth <= month) &&
        loanRemaining(l) > 0
    )
    .sort((a, b) => (a.startMonth || '').localeCompare(b.startMonth || ''));

/** Paid hours in one shift day (end - start - break), handling overnight shifts. */
const shiftHoursPerDay = (shift?: Shift): number => {
  if (!shift) return 8;
  if (shift.workingHours && shift.workingHours > 0) return shift.workingHours;
  const toMin = (t: string) => {
    const [h, m] = (t || '').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  let span = toMin(shift.endTime) - toMin(shift.startTime);
  if (span <= 0) span += 24 * 60;
  const hours = (span - (shift.breakDurationMinutes ?? shift.breakMinutes ?? 0)) / 60;
  return hours > 0 ? hours : 8;
};

/** An ISO timestamp as a local YYYY-MM-DD date. */
const isoToLocalDate = (iso?: string) => (iso ? toDateStr(new Date(iso)) : '—');

const csvCell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export const PayrollPage: React.FC<PayrollPageProps> = ({ onOpenPayslip }) => {
  const { formatMoney, settings } = useSettings();
  const { success, warning, error } = useNotification();

  const [payrolls, setPayrolls] = useState<PayrollRun[]>(() => storageService.getPayrolls());
  const [employees] = useState<Employee[]>(() => storageService.getEmployees());

  const thisMonth = currentMonthStr();
  const [selectedMonth, setSelectedMonth] = useState(thisMonth);
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

  // Active or selected run
  const activeRun = payrolls.find((p) => p.month === selectedMonth);
  const isLocked = !!activeRun && activeRun.status !== 'Draft';
  const isFutureMonth = selectedMonth > thisMonth;
  const isCurrentMonth = selectedMonth === thisMonth;

  const hraPct = settings.payroll.hraPercentage ?? 40;
  const medicalPct = settings.payroll.medicalPercentage ?? 10;
  const pfPct = round(getProvidentFundRate(settings) * 100);

  const reloadPayrolls = () => {
    setPayrolls(storageService.getPayrolls());
  };

  // Run or re-calculate payroll for selected month
  const handleCalculatePayroll = () => {
    if (!selectedMonth) return;
    if (selectedMonth > currentMonthStr()) {
      error('Month not started', `Payroll for ${selectedMonth} can be run once the month has started.`);
      return;
    }
    const existing = storageService.getPayrolls().find((p) => p.month === selectedMonth);
    if (existing && existing.status !== 'Draft') {
      warning('Payroll locked', `${selectedMonth} payroll is ${existing.status} and can no longer be re-calculated.`);
      reloadPayrolls();
      return;
    }

    // Always read fresh data: other pages may have changed it since this page opened
    const attendance = storageService.getAttendance().filter((r) => r.date.startsWith(selectedMonth));
    const leaves = storageService.getLeaves();
    const shifts = storageService.getShifts();
    const holidays = storageService.getHolidays();
    const loans = storageService.getLoans();
    const monthStart = `${selectedMonth}-01`;
    const monthEnd = monthEndStr(selectedMonth);
    const [year, month] = selectedMonth.split('-').map(Number);
    const holidayDates = new Set(holidays.map((h) => h.date));

    // Employees on staff during this month (not those who join after it)
    const activeEmployees = storageService
      .getEmployees()
      .filter((e) => e.status === 'Active' && (!e.joiningDate || e.joiningDate <= monthEnd));

    const items: PayrollItem[] = activeEmployees.map((emp) => {
      const shift = shifts.find((s) => s.id === emp.shiftId) || shifts[0];
      const workingDaysInMonth = shift ? getWorkingDaysInMonth(year, month, shift, holidays) : 22;
      const empAttendance = attendance.filter((r) => r.employeeId === emp.id);

      let presentDays = 0;
      let lateDays = 0;
      let absentDays = 0;
      let halfDays = 0;
      let unpaidLeaveDays = 0;
      let overtimeMinutes = 0;

      empAttendance.forEach((r) => {
        if (r.status === 'Present') presentDays++;
        else if (r.status === 'Late') {
          presentDays++;
          lateDays++;
        } else if (r.status === 'Absent') absentDays++;
        else if (r.status === 'Half Day') halfDays++;
        else if (r.status === 'On Leave') {
          // Paid leave costs nothing; approved Unpaid leave is loss of pay
          const leave = leaves.find(
            (l) =>
              l.employeeId === emp.id &&
              l.status === 'Approved' &&
              l.fromDate <= r.date &&
              l.toDate >= r.date
          );
          if (leave?.leaveType === 'Unpaid') unpaidLeaveDays += leave.isHalfDay ? 0.5 : 1;
        }

        overtimeMinutes += r.overtimeMinutes || 0;
      });

      // Joined mid-month: working days before the joining date are not paid
      let notJoinedDays = 0;
      if (emp.joiningDate && emp.joiningDate > monthStart) {
        const lastDay = Number(monthEnd.slice(8));
        for (let day = 1; day <= lastDay; day++) {
          const d = new Date(year, month - 1, day);
          const dateStr = toDateStr(d);
          if (dateStr >= emp.joiningDate) break;
          const works = shift ? shift.workingDays.includes(d.getDay()) : d.getDay() % 6 !== 0;
          if (works && !holidayDates.has(dateStr)) notJoinedDays++;
        }
      }

      const overtimeHours = Math.round((overtimeMinutes / 60) * 10) / 10;

      // Loan installments due this month, never more than what is still owed
      const dueInstallment = loansDueFor(loans, emp.id, selectedMonth).reduce(
        (sum, l) => sum + Math.min(l.monthlyInstallment || 0, loanRemaining(l)),
        0
      );

      const calc = calculateSalary({
        basicSalary: emp.basicSalary,
        workingDaysInMonth,
        shiftHoursPerDay: shiftHoursPerDay(shift),
        presentDays,
        lateCount: lateDays,
        halfDays,
        absentDays,
        unpaidLeaveDays: unpaidLeaveDays + notJoinedDays,
        overtimeHours,
        bonus: 0,
        loanInstallment: dueInstallment,
        settings,
      });

      const notes: string[] = [];
      if (notJoinedDays > 0) {
        notes.push(`Joined ${emp.joiningDate}: ${notJoinedDays} working day(s) before joining not paid`);
      }
      if (calc.loanInstallment < round(dueInstallment)) {
        notes.push(
          `Loan installment reduced to ${formatMoney(calc.loanInstallment)} (salary too low to recover ${formatMoney(dueInstallment)})`
        );
      }

      return {
        id: `pi-${emp.id}-${selectedMonth}`,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        designation: emp.designation,
        basicSalary: emp.basicSalary,
        workingDays: workingDaysInMonth,
        presentDays,
        absentDays,
        lateCount: lateDays,
        lateDays,
        halfDays,
        overtimeHours,
        employerPF: calc.providentFund,
        ...calc,
        unpaidLeaveDays: unpaidLeaveDays + notJoinedDays,
        loanDeduction: calc.loanInstallment,
        bonus: 0,
        adjustmentNote: notes.length ? notes.join(' · ') : undefined,
      };
    });

    // Gross cost includes overtime and bonus (same basis as the seeded runs)
    const totalGross = round(items.reduce((sum, i) => sum + i.totalEarnings, 0));
    const totalDeductions = round(items.reduce((sum, i) => sum + i.totalDeductions, 0));
    const totalNet = round(items.reduce((sum, i) => sum + i.netSalary, 0));

    const newRun: PayrollRun = {
      id: existing?.id || `pr-${selectedMonth}`,
      month: selectedMonth,
      status: 'Draft',
      totalGross,
      totalDeductions,
      totalNet,
      employeeCount: items.length,
      createdAt: existing?.createdAt || new Date().toISOString(),
      processedAt: new Date().toISOString(),
      items,
    };

    storageService.saveOrUpdatePayroll(newRun);
    success('Payroll Calculated', `Successfully generated payroll computation for ${selectedMonth}`);
    reloadPayrolls();
  };

  // Lock & Finalize Payroll
  const handleFinalizePayroll = () => {
    const run = storageService.getPayrolls().find((p) => p.month === selectedMonth);
    if (!run || run.status !== 'Draft') {
      reloadPayrolls();
      return;
    }
    const updated: PayrollRun = {
      ...run,
      status: 'Processed',
      processedAt: new Date().toISOString(),
    };
    storageService.saveOrUpdatePayroll(updated);
    success('Payroll Processed & Locked', `${selectedMonth} payroll is now marked as Processed.`);
    reloadPayrolls();
  };

  // Disburse salaries
  const handleDisburseSalaries = () => {
    // Re-read the run so loan balances can never be reduced twice for the same payroll
    const run = storageService.getPayrolls().find((p) => p.month === selectedMonth);
    if (!run || run.status !== 'Processed') {
      reloadPayrolls();
      return;
    }
    const updated: PayrollRun = {
      ...run,
      status: 'Paid',
      paidAt: new Date().toISOString(),
    };
    storageService.saveOrUpdatePayroll(updated);

    // Reduce loan balances, oldest loan first, never below zero
    const loans = storageService.getLoans();
    run.items.forEach((item) => {
      let deduction = round(item.loanDeduction ?? item.loanInstallment ?? 0);
      if (deduction <= 0) return;
      for (const loan of loansDueFor(loans, item.employeeId, run.month)) {
        if (deduction <= 0) break;
        const currentRem = loanRemaining(loan);
        const applied = Math.min(currentRem, deduction);
        const newRemaining = round(currentRem - applied);
        deduction = round(deduction - applied);
        const next: Loan = {
          ...loan,
          paidAmount: round((loan.paidAmount || 0) + applied),
          remainingAmount: newRemaining,
          status: newRemaining <= 0 ? 'Completed' : 'Active',
        };
        storageService.updateLoan(next);
        Object.assign(loan, next);
      }
    });

    success('Salaries Disbursed', `All disbursements marked as Paid. Loan repayments updated.`);
    reloadPayrolls();
  };

  // Download Bank Transfer Sheet
  const handleDownloadBankSheet = () => {
    if (!activeRun) return;
    const headers = [
      'Beneficiary Name',
      'Employee ID',
      'Bank Name',
      'Account / IBAN Number',
      'Net Amount',
      'Currency',
      'Payment Reference',
    ];

    let missingBank = 0;
    const rows = activeRun.items.map((item) => {
      const emp = employees.find((e) => e.id === item.employeeId);
      if (!emp?.bankName || !emp?.accountNumber) missingBank++;
      return [
        csvCell(item.employeeName),
        csvCell(item.employeeId),
        csvCell(emp?.bankName || ''),
        csvCell(emp?.accountNumber || ''),
        item.netSalary.toFixed(2),
        csvCell(settings.company.currency),
        csvCell(`Salary-${selectedMonth}-${item.employeeId}`),
      ].join(',');
    });

    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bank_Disbursement_Advice_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if (missingBank > 0) {
      warning('Bank details missing', `${missingBank} employee(s) have no bank name or account number in the file.`);
    } else {
      success('Bank File Exported', `Generated bank disbursement advice for ${selectedMonth}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Payroll Processing
          </h1>
          <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Automated tax calculations, LOP deductions, overtime additions, and bank advice
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            max={thisMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value || thisMonth);
              setExpandedEmployeeId(null);
            }}
            className="px-3 py-1.5 text-xs bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
          />

          {!isLocked && !isFutureMonth && (
            <button
              onClick={handleCalculatePayroll}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {activeRun ? 'Re-calculate Payroll' : 'Run Calculation'}
            </button>
          )}

          {isLocked && (
            <span className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
              <Lock className="w-3.5 h-3.5" /> Locked ({activeRun?.status})
            </span>
          )}

          {activeRun && activeRun.status === 'Draft' && (
            <button
              onClick={handleFinalizePayroll}
              className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" /> Lock & Process
            </button>
          )}

          {activeRun && activeRun.status === 'Processed' && (
            <button
              onClick={handleDisburseSalaries}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <CheckCircle className="w-3.5 h-3.5" /> Disburse & Mark Paid
            </button>
          )}

          {activeRun && (
            <button
              onClick={handleDownloadBankSheet}
              className="px-3.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-lg text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Bank Advice CSV
            </button>
          )}
        </div>
      </div>

      {isCurrentMonth && (!activeRun || activeRun.status === 'Draft') && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            {selectedMonth} is still in progress. Attendance is counted up to {todayStr()}: only recorded
            absences, half days and unpaid leave are deducted, and the remaining working days are paid in full.
            Re-calculate at month end before locking.
          </p>
        </div>
      )}

      {/* Summary KPI Cards */}
      {isFutureMonth ? (
        <div className="p-8 rounded-2xl border-2 border-dashed border-neutral-200 dark:border-neutral-800 text-center">
          <CreditCard className="w-10 h-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            {selectedMonth} has not started yet
          </h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto mt-1">
            Payroll can be calculated once the month begins and attendance is recorded.
          </p>
        </div>
      ) : activeRun ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
            <div className="flex items-center justify-between text-neutral-400 mb-1">
              <span className="text-xs font-medium">Total Gross Cost</span>
              <DollarSign className="w-4 h-4 text-indigo-500" />
            </div>
            <p className="text-xl md:text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
              {formatMoney(activeRun.totalGross)}
            </p>
            <span className="text-[11px] text-neutral-400 mt-1 block">
              {activeRun.employeeCount} active staff
            </span>
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
            <div className="flex items-center justify-between text-neutral-400 mb-1">
              <span className="text-xs font-medium">Total Net Disbursement</span>
              <CheckCircle className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-xl md:text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {formatMoney(activeRun.totalNet)}
            </p>
            <span className="text-[11px] text-neutral-400 mt-1 block">
              Average {formatMoney(Math.round(activeRun.totalNet / (activeRun.employeeCount || 1)))}/staff
            </span>
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
            <div className="flex items-center justify-between text-neutral-400 mb-1">
              <span className="text-xs font-medium">Total Deductions</span>
              <CreditCard className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-xl md:text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
              {formatMoney(activeRun.totalDeductions)}
            </p>
            <span className="text-[11px] text-neutral-400 mt-1 block">Taxes, PF, LOP & loans</span>
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
            <div className="flex items-center justify-between text-neutral-400 mb-1">
              <span className="text-xs font-medium">Payroll Status</span>
              <Badge status={activeRun.status} />
            </div>
            <p className="text-base font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {activeRun.status === 'Paid'
                ? 'Disbursed'
                : activeRun.status === 'Processed'
                ? 'Ready for Bank'
                : 'Draft Calculation'}
            </p>
            <span className="text-[11px] text-neutral-400 mt-1 block">
              Updated: {isoToLocalDate(activeRun.processedAt)}
            </span>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-2xl border-2 border-dashed border-neutral-200 dark:border-neutral-800 text-center">
          <CreditCard className="w-10 h-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            No payroll calculated for {selectedMonth}
          </h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto mt-1 mb-4">
            Click &ldquo;Run Calculation&rdquo; to compute attendance days, progressive taxes, and net salaries.
          </p>
          <button
            onClick={handleCalculatePayroll}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs"
          >
            Compute {selectedMonth} Payroll
          </button>
        </div>
      )}

      {/* Payroll Line Items Table */}
      {activeRun && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Staff Payroll Breakdown ({selectedMonth})
              </h3>
              <p className="text-xs text-neutral-500">
                Click any row to reveal itemized allowances, tax slabs, and penalties
              </p>
            </div>
            <span className="text-xs text-neutral-400 font-mono">
              {activeRun.items.length} employees
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 font-semibold border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Present / Absent</th>
                  <th className="py-3 px-4">Basic Pay</th>
                  <th className="py-3 px-4">Gross Pay</th>
                  <th className="py-3 px-4">Tax, PF & EOBI</th>
                  <th className="py-3 px-4">LOP / Late Pen.</th>
                  <th className="py-3 px-4 font-bold text-neutral-900 dark:text-neutral-100">
                    Net Salary
                  </th>
                  <th className="py-3 px-4 text-right">Payslip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {activeRun.items.map((item) => {
                  const isExpanded = expandedEmployeeId === item.employeeId;
                  return (
                    <React.Fragment key={item.employeeId}>
                      <tr
                        onClick={() =>
                          setExpandedEmployeeId(isExpanded ? null : item.employeeId)
                        }
                        className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 cursor-pointer transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-neutral-400">
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </span>
                            <div>
                              <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                                {item.employeeName}
                              </p>
                              <span className="text-[11px] text-neutral-400 font-mono">
                                {item.employeeId}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-300">
                          {item.department}
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{item.presentDays}P</span>{' '}
                          / <span className="text-rose-600 dark:text-rose-400 font-semibold">{item.absentDays}A</span>
                          {(item.halfDays || 0) > 0 && (
                            <span className="text-orange-600 dark:text-orange-400 text-[11px] ml-1">
                              {item.halfDays}HD
                            </span>
                          )}
                          {(item.lateDays ?? item.lateCount ?? 0) > 0 && (
                            <span className="text-amber-600 dark:text-amber-400 text-[11px] ml-1">
                              ({item.lateDays ?? item.lateCount}L)
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-neutral-700 dark:text-neutral-300">
                          {formatMoney(item.basicSalary)}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
                          {formatMoney(item.grossSalary)}
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-rose-600 dark:text-rose-400">
                          -{formatMoney(round(item.incomeTax + item.providentFund + (item.socialSecurity || 0)))}
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-amber-600 dark:text-amber-400">
                          {item.lopDeduction + item.latePenaltyDeduction > 0
                            ? `-${formatMoney(round(item.lopDeduction + item.latePenaltyDeduction))}`
                            : '—'}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400 text-sm">
                          {formatMoney(item.netSalary)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenPayslip && onOpenPayslip(item.employeeId, selectedMonth);
                            }}
                            className="p-1.5 text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
                            title="View / Print Payslip"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Details Row */}
                      {isExpanded && (
                        <tr className="bg-neutral-50/80 dark:bg-neutral-800/40">
                          <td colSpan={9} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 bg-white dark:bg-neutral-900">
                              {/* Earnings */}
                              <div>
                                <h4 className="font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-[11px] mb-2">
                                  Gross Earnings Breakdown
                                </h4>
                                <div className="space-y-1 text-neutral-600 dark:text-neutral-300">
                                  <div className="flex justify-between">
                                    <span>Basic Salary:</span>
                                    <span className="font-mono">{formatMoney(item.basicSalary)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>House Rent (HRA {hraPct}%):</span>
                                    <span className="font-mono">{formatMoney(item.hra)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Medical Allowance ({medicalPct}%):</span>
                                    <span className="font-mono">{formatMoney(item.medical)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Conveyance Allowance:</span>
                                    <span className="font-mono">{formatMoney(item.conveyance)}</span>
                                  </div>
                                  {item.overtimePay > 0 && (
                                    <div className="flex justify-between text-indigo-600 dark:text-indigo-400 font-semibold">
                                      <span>Overtime ({item.overtimeHours}h):</span>
                                      <span className="font-mono">+{formatMoney(item.overtimePay)}</span>
                                    </div>
                                  )}
                                  {item.bonus > 0 && (
                                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                                      <span>Bonus:</span>
                                      <span className="font-mono">+{formatMoney(item.bonus)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between font-bold pt-1 border-t border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100">
                                    <span>Total Earnings:</span>
                                    <span className="font-mono">{formatMoney(item.totalEarnings ?? item.grossSalary)}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Deductions */}
                              <div>
                                <h4 className="font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider text-[11px] mb-2">
                                  Itemized Deductions
                                </h4>
                                <div className="space-y-1 text-neutral-600 dark:text-neutral-300">
                                  <div className="flex justify-between">
                                    <span>Income Tax:</span>
                                    <span className="font-mono text-rose-600 dark:text-rose-400">
                                      -{formatMoney(item.incomeTax)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Provident Fund ({pfPct}%):</span>
                                    <span className="font-mono">
                                      -{formatMoney(item.providentFund)}
                                    </span>
                                  </div>
                                  {(item.socialSecurity || 0) > 0 && (
                                    <div className="flex justify-between">
                                      <span>EOBI / Social Security:</span>
                                      <span className="font-mono">
                                        -{formatMoney(item.socialSecurity)}
                                      </span>
                                    </div>
                                  )}
                                  {item.lopDeduction > 0 && (
                                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                                      <span>
                                        Loss of Pay (LOP{' '}
                                        {getLopDays(item.absentDays, item.unpaidLeaveDays, item.halfDays)}d):
                                      </span>
                                      <span className="font-mono">
                                        -{formatMoney(item.lopDeduction)}
                                      </span>
                                    </div>
                                  )}
                                  {item.latePenaltyDeduction > 0 && (
                                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                                      <span>Late Penalty:</span>
                                      <span className="font-mono">
                                        -{formatMoney(item.latePenaltyDeduction)}
                                      </span>
                                    </div>
                                  )}
                                  {(item.loanDeduction ?? item.loanInstallment ?? 0) > 0 && (
                                    <div className="flex justify-between text-indigo-600 dark:text-indigo-400">
                                      <span>Loan Repayment:</span>
                                      <span className="font-mono">
                                        -{formatMoney(item.loanDeduction ?? item.loanInstallment ?? 0)}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex justify-between font-bold pt-1 border-t border-neutral-200 dark:border-neutral-700 text-rose-600 dark:text-rose-400">
                                    <span>Total Deductions:</span>
                                    <span className="font-mono">
                                      -{formatMoney(item.totalDeductions)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Net Take-Home */}
                              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/80 flex flex-col justify-between">
                                <div>
                                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                                    Net Take-Home Pay
                                  </span>
                                  <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                                    {formatMoney(item.netSalary)}
                                  </p>
                                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                                    Employer PF Match: {formatMoney(item.employerPF ?? item.providentFund ?? 0)}
                                  </p>
                                  {item.adjustmentNote && (
                                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                                      {item.adjustmentNote}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() =>
                                    onOpenPayslip &&
                                    onOpenPayslip(item.employeeId, selectedMonth)
                                  }
                                  className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold text-center mt-3 shadow-xs"
                                >
                                  Open Printable Payslip
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
