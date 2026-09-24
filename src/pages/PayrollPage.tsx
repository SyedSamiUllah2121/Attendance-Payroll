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
import { Employee, Holiday, Loan, PayrollItem, PayrollRun, Shift } from '../types';
import { storageService } from '../services/storageService';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Badge } from '../components/common/Badge';
import { calculateSalary } from '../utils/payrollEngine';
import { Modal } from '../components/common/Modal';

interface PayrollPageProps {
  onOpenPayslip?: (employeeId: string, month?: string) => void;
}

export const PayrollPage: React.FC<PayrollPageProps> = ({ onOpenPayslip }) => {
  const { user } = useAuth();
  const { formatMoney, settings } = useSettings();
  const { success, warning, error, info } = useNotification();

  const [payrolls, setPayrolls] = useState<PayrollRun[]>(() => storageService.getPayrolls());
  const [employees] = useState<Employee[]>(() => storageService.getEmployees());
  const [shifts] = useState<Shift[]>(() => storageService.getShifts());
  const [holidays] = useState<Holiday[]>(() => storageService.getHolidays());
  const [loans] = useState<Loan[]>(() => storageService.getLoans());

  const [selectedMonth, setSelectedMonth] = useState('2026-09');
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

  // Active or selected run
  const activeRun = payrolls.find((p) => p.month === selectedMonth);

  const reloadPayrolls = () => {
    setPayrolls(storageService.getPayrolls());
  };

  // Run or re-calculate payroll for selected month
  const handleCalculatePayroll = () => {
    const attendance = storageService.getAttendance().filter((r) => r.date.startsWith(selectedMonth));
    const activeEmployees = employees.filter((e) => e.status === 'Active');

    const totalWorkingDaysInMonth = 22; // Standard 22 working days in Pakistan

    const items: PayrollItem[] = activeEmployees.map((emp) => {
      const empAttendance = attendance.filter((r) => r.employeeId === emp.id);

      let presentDays = 0;
      let lateDays = 0;
      let absentDays = 0;
      let halfDays = 0;
      let leaveDays = 0;
      let totalOtHours = 0;

      empAttendance.forEach((r) => {
        if (r.status === 'Present') presentDays++;
        else if (r.status === 'Late') {
          presentDays++;
          lateDays++;
        } else if (r.status === 'Absent') absentDays++;
        else if (r.status === 'Half Day') halfDays++;
        else if (r.status === 'On Leave') leaveDays++;

        totalOtHours += (r.overtimeMinutes || 0) / 60;
      });

      // Find active loan installment
      const empLoan = loans.find(
        (l) => l.employeeId === emp.id && l.status === 'Active' && ((l.remainingAmount ?? (l.totalAmount - l.paidAmount)) > 0)
      );
      const remaining = empLoan ? (empLoan.remainingAmount ?? (empLoan.totalAmount - empLoan.paidAmount)) : 0;
      const loanDeduction = empLoan ? Math.min(empLoan.monthlyInstallment, remaining) : 0;

      const calc = calculateSalary({
        basicSalary: emp.basicSalary,
        workingDaysInMonth: totalWorkingDaysInMonth,
        shiftHoursPerDay: 8,
        presentDays,
        lateCount: lateDays,
        halfDays,
        absentDays,
        unpaidLeaveDays: 0,
        overtimeHours: totalOtHours,
        bonus: 0,
        loanInstallment: loanDeduction,
        settings,
      });

      return {
        id: `pi-${emp.id}-${selectedMonth}`,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        designation: emp.designation,
        basicSalary: emp.basicSalary,
        workingDays: totalWorkingDaysInMonth,
        presentDays,
        absentDays,
        lateCount: lateDays,
        lateDays,
        halfDays,
        unpaidLeaveDays: 0,
        overtimeHours: Math.round(totalOtHours * 10) / 10,
        loanDeduction,
        employerPF: calc.providentFund,
        ...calc,
        bonus: 0,
      };
    });

    const totalGross = items.reduce((sum, i) => sum + i.grossSalary, 0);
    const totalDeductions = items.reduce((sum, i) => sum + i.totalDeductions, 0);
    const totalNet = items.reduce((sum, i) => sum + i.netSalary, 0);

    const newRun: PayrollRun = {
      id: `pr-${selectedMonth}`,
      month: selectedMonth,
      status: activeRun ? activeRun.status : 'Draft',
      totalGross,
      totalDeductions,
      totalNet,
      employeeCount: items.length,
      createdAt: activeRun?.createdAt || new Date().toISOString(),
      processedAt: new Date().toISOString(),
      items,
    };

    storageService.saveOrUpdatePayroll(newRun);
    success('Payroll Calculated', `Successfully generated payroll computation for ${selectedMonth}`);
    reloadPayrolls();
  };

  // Lock & Finalize Payroll
  const handleFinalizePayroll = () => {
    if (!activeRun) return;
    const updated: PayrollRun = {
      ...activeRun,
      status: 'Processed',
      processedAt: new Date().toISOString(),
    };
    storageService.saveOrUpdatePayroll(updated);
    success('Payroll Processed & Locked', `${selectedMonth} payroll is now marked as Processed.`);
    reloadPayrolls();
  };

  // Disburse salaries
  const handleDisburseSalaries = () => {
    if (!activeRun) return;
    const updated: PayrollRun = {
      ...activeRun,
      status: 'Paid',
      paidAt: new Date().toISOString(),
    };
    storageService.saveOrUpdatePayroll(updated);

    // Also deduct loan balances
    activeRun.items.forEach((item) => {
      const deduction = item.loanDeduction ?? item.loanInstallment ?? 0;
      if (deduction > 0) {
        const empLoan = loans.find(
          (l) => l.employeeId === item.employeeId && l.status === 'Active'
        );
        if (empLoan) {
          const currentRem = empLoan.remainingAmount ?? (empLoan.totalAmount - empLoan.paidAmount);
          const newRemaining = Math.max(0, currentRem - deduction);
          const newPaid = empLoan.paidAmount + deduction;
          storageService.updateLoan({
            ...empLoan,
            paidAmount: newPaid,
            remainingAmount: newRemaining,
            status: newRemaining === 0 ? 'Completed' : 'Active',
          });
        }
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

    const rows = activeRun.items.map((item) => {
      const emp = employees.find((e) => e.id === item.employeeId);
      return [
        `"${item.employeeName}"`,
        item.employeeId,
        `"${emp?.bankName || 'Standard Chartered'}"`,
        `"${emp?.accountNumber || 'PK00000000'}"`,
        item.netSalary,
        settings.company.currency,
        `Salary-${selectedMonth}-${item.employeeId}`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute('download', `Bank_Disbursement_Advice_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    success('Bank File Exported', `Generated bank disbursement advice for ${selectedMonth}`);
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
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
          />

          <button
            onClick={handleCalculatePayroll}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {activeRun ? 'Re-calculate Payroll' : 'Run Calculation'}
          </button>

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

      {/* Summary KPI Cards */}
      {activeRun ? (
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
              Updated: {activeRun.processedAt?.slice(0, 10)}
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
                  <th className="py-3 px-4">Taxes & PF</th>
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
                          <span className="text-emerald-600 font-semibold">{item.presentDays}P</span>{' '}
                          / <span className="text-rose-600 font-semibold">{item.absentDays}A</span>
                          {(item.lateDays ?? item.lateCount ?? 0) > 0 && (
                            <span className="text-amber-600 text-[11px] ml-1">
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
                          -{formatMoney(item.incomeTax + item.providentFund)}
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-amber-600 dark:text-amber-400">
                          {item.lopDeduction + item.latePenaltyDeduction > 0
                            ? `-${formatMoney(item.lopDeduction + item.latePenaltyDeduction)}`
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
                            className="p-1.5 text-neutral-400 hover:text-indigo-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
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
                                    <span>House Rent (HRA 40%):</span>
                                    <span className="font-mono">{formatMoney(item.hra)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Medical Allowance (10%):</span>
                                    <span className="font-mono">{formatMoney(item.medical)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Conveyance Allowance:</span>
                                    <span className="font-mono">{formatMoney(item.conveyance)}</span>
                                  </div>
                                  {item.overtimePay > 0 && (
                                    <div className="flex justify-between text-indigo-600 font-semibold">
                                      <span>Overtime ({item.overtimeHours}h):</span>
                                      <span className="font-mono">+{formatMoney(item.overtimePay)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between font-bold pt-1 border-t border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100">
                                    <span>Total Gross:</span>
                                    <span className="font-mono">{formatMoney(item.grossSalary)}</span>
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
                                    <span className="font-mono text-rose-600">
                                      -{formatMoney(item.incomeTax)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Provident Fund (5%):</span>
                                    <span className="font-mono">
                                      -{formatMoney(item.providentFund)}
                                    </span>
                                  </div>
                                  {item.lopDeduction > 0 && (
                                    <div className="flex justify-between text-amber-600">
                                      <span>Loss of Pay (LOP {item.absentDays}d):</span>
                                      <span className="font-mono">
                                        -{formatMoney(item.lopDeduction)}
                                      </span>
                                    </div>
                                  )}
                                  {item.latePenaltyDeduction > 0 && (
                                    <div className="flex justify-between text-amber-600">
                                      <span>Late Penalty:</span>
                                      <span className="font-mono">
                                        -{formatMoney(item.latePenaltyDeduction)}
                                      </span>
                                    </div>
                                  )}
                                  {(item.loanDeduction ?? item.loanInstallment ?? 0) > 0 && (
                                    <div className="flex justify-between text-indigo-600">
                                      <span>Loan Repayment:</span>
                                      <span className="font-mono">
                                        -{formatMoney(item.loanDeduction ?? item.loanInstallment ?? 0)}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex justify-between font-bold pt-1 border-t border-neutral-200 dark:border-neutral-700 text-rose-600">
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
                                  <p className="text-[11px] text-neutral-500 mt-1">
                                    Employer PF Match: {formatMoney(item.employerPF ?? item.providentFund ?? 0)} · EOBI:{' '}
                                    {formatMoney(item.socialSecurity)}
                                  </p>
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
