import React, { useState, useRef } from 'react';
import {
  Printer,
  Download,
  Building2,
  Calendar,
  CreditCard,
  User,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Employee, PayrollItem, PayrollRun } from '../types';
import { storageService } from '../services/storageService';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { numberToWords } from '../utils/payrollEngine';

interface PayslipsPageProps {
  initialEmployeeId?: string;
  initialMonth?: string;
}

export const PayslipsPage: React.FC<PayslipsPageProps> = ({
  initialEmployeeId,
  initialMonth,
}) => {
  const { user, isHR, isEmployee } = useAuth();
  const { formatMoney, settings } = useSettings();

  const [payrolls] = useState<PayrollRun[]>(() => storageService.getPayrolls());
  const [employees] = useState<Employee[]>(() => storageService.getEmployees());

  // Default month: latest payroll
  const latestMonth = payrolls.length > 0 ? payrolls[payrolls.length - 1].month : '2026-09';
  const [selectedMonth, setSelectedMonth] = useState(initialMonth || latestMonth);

  // Default employee
  const defaultEmpId = isEmployee
    ? user?.employeeId || 'EMP-001'
    : initialEmployeeId || 'EMP-001';
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(defaultEmpId);

  // Find run and item
  const run = payrolls.find((p) => p.month === selectedMonth) || payrolls[payrolls.length - 1];
  const item: PayrollItem | undefined = run?.items.find(
    (i) => i.employeeId === selectedEmployeeId
  );
  const employee: Employee | undefined = employees.find(
    (e) => e.id === selectedEmployeeId
  );

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Control bar (hidden during print) */}
      <div className="no-print bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-500">Pay Period:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
            >
              {payrolls.map((p) => (
                <option key={p.month} value={p.month}>
                  {p.month} ({p.status})
                </option>
              ))}
            </select>
          </div>

          {isHR && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-500">Employee:</span>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.id}) - {emp.department}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors"
          >
            <Printer className="w-4 h-4" /> Print / Save as PDF
          </button>
        </div>
      </div>

      {/* Printable Payslip Card */}
      {!item || !employee ? (
        <div className="p-12 text-center text-neutral-400 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800">
          No payslip record found for the selected month and employee.
        </div>
      ) : (
        <div className="payslip-container max-w-4xl mx-auto bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-8 shadow-sm">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-neutral-200 dark:border-neutral-800 pb-6 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                  {settings.company.name || 'WorkPulse Technologies Pvt Ltd'}
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {settings.company.address || 'Suite 401, Tech Tower, Clifton, Karachi'} · NTN:{' '}
                  {settings.company.taxNumber || '7412985-3'}
                </p>
                <p className="text-xs text-neutral-400">{settings.company.email}</p>
              </div>
            </div>

            <div className="text-right">
              <span className="px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-bold text-xs uppercase tracking-wider">
                Salary Statement
              </span>
              <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100 mt-2">
                Month: {selectedMonth}
              </p>
              <p className="text-xs text-neutral-400">
                Disbursed:{' '}
                {run?.paidAt?.slice(0, 10) || run?.processedAt?.slice(0, 10) || '2026-09-30'}
              </p>
            </div>
          </div>

          {/* Employee & Attendance Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 text-xs mb-6">
            <div>
              <span className="text-neutral-400">Employee ID</span>
              <p className="font-mono font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">
                {employee.id}
              </p>
            </div>
            <div>
              <span className="text-neutral-400">Employee Name</span>
              <p className="font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">
                {employee.name}
              </p>
            </div>
            <div>
              <span className="text-neutral-400">Department</span>
              <p className="font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">
                {employee.department}
              </p>
            </div>
            <div>
              <span className="text-neutral-400">Designation</span>
              <p className="font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">
                {employee.designation}
              </p>
            </div>

            <div>
              <span className="text-neutral-400">Bank & Account</span>
              <p className="font-mono text-neutral-900 dark:text-neutral-100 mt-0.5 truncate">
                {employee.bankName} - {employee.accountNumber.slice(-6)}
              </p>
            </div>
            <div>
              <span className="text-neutral-400">Working Days</span>
              <p className="font-mono font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">
                {item.workingDays} days
              </p>
            </div>
            <div>
              <span className="text-neutral-400">Days Present / Absent</span>
              <p className="font-mono font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">
                {item.presentDays}P / {item.absentDays}A ({item.lateDays} Late)
              </p>
            </div>
            <div>
              <span className="text-neutral-400">Overtime Hours</span>
              <p className="font-mono font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">
                {item.overtimeHours} hrs
              </p>
            </div>
          </div>

          {/* Earnings & Deductions Tables */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs mb-6">
            {/* Earnings Column */}
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
              <div className="bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2 border-b border-emerald-100 dark:border-emerald-900 font-bold text-emerald-800 dark:text-emerald-300">
                Earnings
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 p-2">
                <div className="flex justify-between py-1.5 px-2">
                  <span className="text-neutral-600 dark:text-neutral-400">Basic Salary</span>
                  <span className="font-mono font-semibold">{formatMoney(item.basicSalary)}</span>
                </div>
                <div className="flex justify-between py-1.5 px-2">
                  <span className="text-neutral-600 dark:text-neutral-400">
                    House Rent Allowance (HRA 40%)
                  </span>
                  <span className="font-mono font-semibold">{formatMoney(item.hra)}</span>
                </div>
                <div className="flex justify-between py-1.5 px-2">
                  <span className="text-neutral-600 dark:text-neutral-400">
                    Medical Allowance (10%)
                  </span>
                  <span className="font-mono font-semibold">{formatMoney(item.medical)}</span>
                </div>
                <div className="flex justify-between py-1.5 px-2">
                  <span className="text-neutral-600 dark:text-neutral-400">
                    Conveyance Allowance
                  </span>
                  <span className="font-mono font-semibold">{formatMoney(item.conveyance)}</span>
                </div>
                {item.overtimePay > 0 && (
                  <div className="flex justify-between py-1.5 px-2 text-indigo-600">
                    <span>Overtime ({item.overtimeHours} hrs)</span>
                    <span className="font-mono font-semibold">+{formatMoney(item.overtimePay)}</span>
                  </div>
                )}
                {item.bonus > 0 && (
                  <div className="flex justify-between py-1.5 px-2 text-emerald-600">
                    <span>Performance Bonus</span>
                    <span className="font-mono font-semibold">+{formatMoney(item.bonus)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 px-2 bg-neutral-50 dark:bg-neutral-800/60 font-bold text-neutral-900 dark:text-neutral-100">
                  <span>Total Gross Earnings</span>
                  <span className="font-mono">{formatMoney(item.grossSalary)}</span>
                </div>
              </div>
            </div>

            {/* Deductions Column */}
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
              <div className="bg-rose-50 dark:bg-rose-950/40 px-4 py-2 border-b border-rose-100 dark:border-rose-900 font-bold text-rose-800 dark:text-rose-300">
                Deductions
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 p-2">
                <div className="flex justify-between py-1.5 px-2">
                  <span className="text-neutral-600 dark:text-neutral-400">Income Tax (Withholding)</span>
                  <span className="font-mono text-rose-600">-{formatMoney(item.incomeTax)}</span>
                </div>
                <div className="flex justify-between py-1.5 px-2">
                  <span className="text-neutral-600 dark:text-neutral-400">
                    Provident Fund (Employee 5%)
                  </span>
                  <span className="font-mono text-rose-600">-{formatMoney(item.providentFund)}</span>
                </div>
                {item.lopDeduction > 0 && (
                  <div className="flex justify-between py-1.5 px-2 text-amber-600">
                    <span>Loss of Pay (LOP {item.absentDays} days)</span>
                    <span className="font-mono">-{formatMoney(item.lopDeduction)}</span>
                  </div>
                )}
                {item.latePenaltyDeduction > 0 && (
                  <div className="flex justify-between py-1.5 px-2 text-amber-600">
                    <span>Late Arrival Penalty</span>
                    <span className="font-mono">-{formatMoney(item.latePenaltyDeduction)}</span>
                  </div>
                )}
                {(item.loanDeduction ?? item.loanInstallment ?? 0) > 0 && (
                  <div className="flex justify-between py-1.5 px-2 text-indigo-600">
                    <span>Loan / Advance Installment</span>
                    <span className="font-mono">
                      -{formatMoney(item.loanDeduction ?? item.loanInstallment ?? 0)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-2 px-2 bg-neutral-50 dark:bg-neutral-800/60 font-bold text-rose-600">
                  <span>Total Deductions</span>
                  <span className="font-mono">-{formatMoney(item.totalDeductions)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Net Salary Highlight Box */}
          <div className="p-6 rounded-2xl bg-neutral-900 text-white dark:bg-neutral-950 border border-neutral-800 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">
                Net Take-Home Pay
              </span>
              <p className="text-3xl font-mono font-bold text-emerald-400 mt-1">
                {formatMoney(item.netSalary)}
              </p>
              <p className="text-xs text-neutral-300 italic mt-1">
                ({numberToWords(item.netSalary)} {settings.company.currency} Only)
              </p>
            </div>
            <div className="text-right text-xs text-neutral-400 border-t md:border-t-0 md:border-l border-neutral-800 pt-3 md:pt-0 md:pl-6">
              <p>Employer PF Contribution: {formatMoney(item.employerPF ?? item.providentFund ?? 0)}</p>
              <p>EOBI Contribution: {formatMoney(item.socialSecurity)}</p>
              <p className="text-[11px] text-neutral-500 mt-1">
                Mode of Payment: Direct Bank Deposit
              </p>
            </div>
          </div>

          {/* Signatures & Footer */}
          <div className="grid grid-cols-2 gap-8 pt-8 border-t border-neutral-200 dark:border-neutral-800 text-xs">
            <div className="text-center">
              <div className="w-48 border-b border-neutral-300 dark:border-neutral-700 mx-auto mb-2" />
              <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                Authorized Signatory
              </p>
              <p className="text-neutral-400 text-[11px]">WorkPulse Finance & HR</p>
            </div>

            <div className="text-center">
              <div className="w-48 border-b border-neutral-300 dark:border-neutral-700 mx-auto mb-2" />
              <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                Employee Acknowledgement
              </p>
              <p className="text-neutral-400 text-[11px]">{employee.name}</p>
            </div>
          </div>

          <p className="text-center text-[10px] text-neutral-400 mt-8">
            This is a computer-generated payslip and does not require a physical stamp.
          </p>
        </div>
      )}
    </div>
  );
};
