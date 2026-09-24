import React, { useState } from 'react';
import {
  FileText,
  Download,
  Printer,
  Calendar,
  DollarSign,
  UserCheck,
  CreditCard,
  Building,
} from 'lucide-react';
import { Employee, AttendanceRecord, LeaveRequest, PayrollRun, Loan } from '../types';
import { storageService } from '../services/storageService';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';

export const ReportsPage: React.FC = () => {
  const { formatMoney, settings } = useSettings();
  const { success } = useNotification();

  const [selectedReport, setSelectedReport] = useState<
    'attendance' | 'payroll' | 'leaves' | 'taxes' | 'loans'
  >('attendance');
  const [selectedMonth, setSelectedMonth] = useState('2026-09');

  const employees = storageService.getEmployees();
  const attendance = storageService.getAttendance().filter((r) => r.date.startsWith(selectedMonth));
  const leaves = storageService.getLeaves();
  const payrolls = storageService.getPayrolls();
  const loans = storageService.getLoans();

  const currentPayroll = payrolls.find((p) => p.month === selectedMonth) || payrolls[payrolls.length - 1];

  // Export CSV generator
  const downloadCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    success('Report Exported', `Downloaded ${filename}.csv`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Reports & Statements Hub
          </h1>
          <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Audit-ready registers, statutory tax withholding schedules, and attendance statements
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
          />
          <button
            onClick={handlePrint}
            className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      {/* Report Selector Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: 'attendance', label: 'Attendance Summary' },
          { id: 'payroll', label: 'Payroll Register' },
          { id: 'leaves', label: 'Leave Balances' },
          { id: 'taxes', label: 'Tax Withholding (FBR)' },
          { id: 'loans', label: 'Loan Recoveries' },
        ].map((r) => (
          <button
            key={r.id}
            onClick={() => setSelectedReport(r.id as any)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              selectedReport === r.id
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* 1. Monthly Attendance Summary Report */}
      {selectedReport === 'attendance' && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Monthly Attendance Register ({selectedMonth})
              </h3>
              <p className="text-xs text-neutral-500">
                Individual attendance tallies, lateness counts, and overtime hours
              </p>
            </div>
            <button
              onClick={() => {
                const headers = ['Employee ID', 'Name', 'Department', 'Present', 'Late', 'Absent', 'HalfDay', 'Leave', 'OT Hours'];
                const rows = employees.map((emp) => {
                  const empRecs = attendance.filter((r) => r.employeeId === emp.id);
                  const p = empRecs.filter((r) => r.status === 'Present').length;
                  const l = empRecs.filter((r) => r.status === 'Late').length;
                  const a = empRecs.filter((r) => r.status === 'Absent').length;
                  const hd = empRecs.filter((r) => r.status === 'Half Day').length;
                  const lv = empRecs.filter((r) => r.status === 'On Leave').length;
                  const ot = (empRecs.reduce((acc, r) => acc + (r.overtimeMinutes || 0), 0) / 60).toFixed(1);
                  return [emp.id, `"${emp.name}"`, emp.department, p, l, a, hd, lv, ot];
                });
                downloadCSV(`WorkPulse_Attendance_${selectedMonth}`, headers, rows);
              }}
              className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 font-semibold border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-3 text-center text-emerald-600">Present (P)</th>
                  <th className="py-3 px-3 text-center text-amber-600">Late (L)</th>
                  <th className="py-3 px-3 text-center text-rose-600">Absent (A)</th>
                  <th className="py-3 px-3 text-center text-orange-600">Half Day</th>
                  <th className="py-3 px-3 text-center text-sky-600">Leave (LV)</th>
                  <th className="py-3 px-4 text-right">Overtime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 font-mono">
                {employees.map((emp) => {
                  const empRecs = attendance.filter((r) => r.employeeId === emp.id);
                  const p = empRecs.filter((r) => r.status === 'Present').length;
                  const l = empRecs.filter((r) => r.status === 'Late').length;
                  const a = empRecs.filter((r) => r.status === 'Absent').length;
                  const hd = empRecs.filter((r) => r.status === 'Half Day').length;
                  const lv = empRecs.filter((r) => r.status === 'On Leave').length;
                  const ot = (empRecs.reduce((acc, r) => acc + (r.overtimeMinutes || 0), 0) / 60).toFixed(1);

                  return (
                    <tr key={emp.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                      <td className="py-3 px-4 font-sans font-medium text-neutral-900 dark:text-neutral-100">
                        {emp.name}{' '}
                        <span className="text-[11px] text-neutral-400 font-mono">({emp.id})</span>
                      </td>
                      <td className="py-3 px-4 font-sans text-neutral-600 dark:text-neutral-300">
                        {emp.department}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-emerald-600">{p}</td>
                      <td className="py-3 px-3 text-center font-bold text-amber-600">{l}</td>
                      <td className="py-3 px-3 text-center font-bold text-rose-600">{a}</td>
                      <td className="py-3 px-3 text-center font-bold text-orange-600">{hd}</td>
                      <td className="py-3 px-3 text-center font-bold text-sky-600">{lv}</td>
                      <td className="py-3 px-4 text-right text-indigo-600 font-semibold">{ot}h</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Payroll Register */}
      {selectedReport === 'payroll' && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Payroll Reconciliation Statement ({selectedMonth})
              </h3>
              <p className="text-xs text-neutral-500">
                Status: {currentPayroll?.status || 'Draft'} · Total Disbursed:{' '}
                {formatMoney(currentPayroll?.totalNet || 0)}
              </p>
            </div>
            <button
              onClick={() => {
                if (!currentPayroll) return;
                const headers = ['Employee ID', 'Name', 'Department', 'Basic', 'Gross', 'Tax', 'PF', 'LOP', 'Net'];
                const rows = currentPayroll.items.map((i) => [
                  i.employeeId,
                  `"${i.employeeName}"`,
                  i.department,
                  i.basicSalary,
                  i.grossSalary,
                  i.incomeTax,
                  i.providentFund,
                  i.lopDeduction,
                  i.netSalary,
                ]);
                downloadCSV(`WorkPulse_Payroll_${selectedMonth}`, headers, rows);
              }}
              className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 font-semibold border-b border-neutral-200 dark:border-neutral-800 font-sans">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Basic Pay</th>
                  <th className="py-3 px-4">Gross Earnings</th>
                  <th className="py-3 px-4">Income Tax</th>
                  <th className="py-3 px-4">Provident Fund</th>
                  <th className="py-3 px-4">LOP / Late</th>
                  <th className="py-3 px-4 text-right font-bold text-neutral-900 dark:text-neutral-100">
                    Net Take-Home
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {(currentPayroll?.items || []).map((i) => (
                  <tr key={i.employeeId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                    <td className="py-3 px-4 font-sans font-medium text-neutral-900 dark:text-neutral-100">
                      {i.employeeName}{' '}
                      <span className="text-[11px] text-neutral-400 font-mono">({i.employeeId})</span>
                    </td>
                    <td className="py-3 px-4">{formatMoney(i.basicSalary)}</td>
                    <td className="py-3 px-4 font-semibold">{formatMoney(i.grossSalary)}</td>
                    <td className="py-3 px-4 text-rose-600">-{formatMoney(i.incomeTax)}</td>
                    <td className="py-3 px-4 text-rose-600">-{formatMoney(i.providentFund)}</td>
                    <td className="py-3 px-4 text-amber-600">
                      -{formatMoney(i.lopDeduction + i.latePenaltyDeduction)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-600 text-sm">
                      {formatMoney(i.netSalary)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Leave Utilization Report */}
      {selectedReport === 'leaves' && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Annual Leave Quotas & Entitlement Register
              </h3>
              <p className="text-xs text-neutral-500">
                YTD consumption of Annual, Sick, and Casual leave allowances
              </p>
            </div>
            <button
              onClick={() => {
                const annQuota = settings.leaves?.annual ?? settings.leaveQuotas?.Annual ?? 14;
                const sickQuota = settings.leaves?.sick ?? settings.leaveQuotas?.Sick ?? 10;
                const casQuota = settings.leaves?.casual ?? settings.leaveQuotas?.Casual ?? 8;
                const headers = ['Employee ID', 'Name', 'Annual Used', 'Sick Used', 'Casual Used', 'Total Remaining'];
                const rows = employees.map((emp) => {
                  const empLeaves = leaves.filter((l) => l.employeeId === emp.id && l.status === 'Approved');
                  const ann = empLeaves.filter((l) => l.leaveType === 'Annual').reduce((a, b) => a + b.daysCount, 0);
                  const sick = empLeaves.filter((l) => l.leaveType === 'Sick').reduce((a, b) => a + b.daysCount, 0);
                  const cas = empLeaves.filter((l) => l.leaveType === 'Casual').reduce((a, b) => a + b.daysCount, 0);
                  const totalRem = annQuota + sickQuota + casQuota - (ann + sick + cas);
                  return [emp.id, `"${emp.name}"`, ann, sick, cas, Math.max(0, totalRem)];
                });
                downloadCSV('WorkPulse_Leave_Balances', headers, rows);
              }}
              className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 font-semibold border-b border-neutral-200 dark:border-neutral-800 font-sans">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-3 text-center">
                    Annual ({settings.leaves?.annual ?? settings.leaveQuotas?.Annual ?? 14}d)
                  </th>
                  <th className="py-3 px-3 text-center">
                    Sick ({settings.leaves?.sick ?? settings.leaveQuotas?.Sick ?? 10}d)
                  </th>
                  <th className="py-3 px-3 text-center">
                    Casual ({settings.leaves?.casual ?? settings.leaveQuotas?.Casual ?? 8}d)
                  </th>
                  <th className="py-3 px-4 text-right font-bold text-neutral-900 dark:text-neutral-100 font-sans">
                    Total Balance Left
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {employees.map((emp) => {
                  const annQuota = settings.leaves?.annual ?? settings.leaveQuotas?.Annual ?? 14;
                  const sickQuota = settings.leaves?.sick ?? settings.leaveQuotas?.Sick ?? 10;
                  const casQuota = settings.leaves?.casual ?? settings.leaveQuotas?.Casual ?? 8;
                  const empLeaves = leaves.filter((l) => l.employeeId === emp.id && l.status === 'Approved');
                  const ann = empLeaves.filter((l) => l.leaveType === 'Annual').reduce((a, b) => a + b.daysCount, 0);
                  const sick = empLeaves.filter((l) => l.leaveType === 'Sick').reduce((a, b) => a + b.daysCount, 0);
                  const cas = empLeaves.filter((l) => l.leaveType === 'Casual').reduce((a, b) => a + b.daysCount, 0);
                  const totalRem = annQuota + sickQuota + casQuota - (ann + sick + cas);

                  return (
                    <tr key={emp.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                      <td className="py-3 px-4 font-sans font-medium text-neutral-900 dark:text-neutral-100">
                        {emp.name}{' '}
                        <span className="text-[11px] text-neutral-400 font-mono">({emp.id})</span>
                      </td>
                      <td className="py-3 px-4 font-sans text-neutral-600 dark:text-neutral-300">
                        {emp.department}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-indigo-600 font-bold">{ann}</span> used
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-emerald-600 font-bold">{sick}</span> used
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-amber-600 font-bold">{cas}</span> used
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-600">
                        {Math.max(0, totalRem)} days
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Tax Withholding Schedule */}
      {selectedReport === 'taxes' && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Statutory Income Tax Withholding Schedule (FBR Section 149)
              </h3>
              <p className="text-xs text-neutral-500">
                Monthly tax deducted at source for filing with revenue authorities
              </p>
            </div>
            <button
              onClick={() => {
                if (!currentPayroll) return;
                const headers = ['Employee ID', 'Name', 'Gross Income', 'Annual Taxable (Est)', 'Monthly Tax Withheld'];
                const rows = currentPayroll.items.map((i) => [
                  i.employeeId,
                  `"${i.employeeName}"`,
                  i.grossSalary,
                  i.grossSalary * 12,
                  i.incomeTax,
                ]);
                downloadCSV(`WorkPulse_Tax_Schedule_${selectedMonth}`, headers, rows);
              }}
              className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 font-semibold border-b border-neutral-200 dark:border-neutral-800 font-sans">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Monthly Gross</th>
                  <th className="py-3 px-4">Annual Taxable (Est.)</th>
                  <th className="py-3 px-4">Applicable Slab</th>
                  <th className="py-3 px-4 text-right font-bold text-rose-600 font-sans">
                    Withheld Tax
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {(currentPayroll?.items || []).map((i) => {
                  const ann = i.grossSalary * 12;
                  let slab = 'Exempt (Below 600k)';
                  if (ann > 3200000) slab = '35% + 435,000';
                  else if (ann > 2400000) slab = '25% + 235,000';
                  else if (ann > 1200000) slab = '15% + 55,000';
                  else if (ann > 600000) slab = '5% on excess of 600k';

                  return (
                    <tr key={i.employeeId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                      <td className="py-3 px-4 font-sans font-medium text-neutral-900 dark:text-neutral-100">
                        {i.employeeName}{' '}
                        <span className="text-[11px] text-neutral-400 font-mono">({i.employeeId})</span>
                      </td>
                      <td className="py-3 px-4">{formatMoney(i.grossSalary)}</td>
                      <td className="py-3 px-4">{formatMoney(ann)}</td>
                      <td className="py-3 px-4 text-neutral-500 font-sans">{slab}</td>
                      <td className="py-3 px-4 text-right font-bold text-rose-600">
                        {formatMoney(i.incomeTax)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Loans Portfolio */}
      {selectedReport === 'loans' && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Employee Salary Advance & Loan Portfolio
              </h3>
              <p className="text-xs text-neutral-500">
                Installment schedules, principal recoveries, and outstanding ledger
              </p>
            </div>
            <button
              onClick={() => {
                const headers = ['Employee ID', 'Disbursed', 'Remaining', 'Monthly Installment', 'Status'];
                const rows = loans.map((l) => [
                  l.employeeId,
                  l.amount ?? l.totalAmount ?? 0,
                  l.remainingAmount ?? (l.totalAmount - (l.paidAmount || 0)),
                  l.monthlyInstallment,
                  l.status,
                ]);
                downloadCSV('WorkPulse_Loan_Ledger', headers, rows);
              }}
              className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 font-semibold border-b border-neutral-200 dark:border-neutral-800 font-sans">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Original Advance</th>
                  <th className="py-3 px-4">Recovered to Date</th>
                  <th className="py-3 px-4">Monthly Installment</th>
                  <th className="py-3 px-4 text-right font-bold text-amber-600 font-sans">
                    Outstanding Balance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {loans.map((l) => {
                  const emp = employees.find((e) => e.id === l.employeeId);
                  const lAmt = l.amount ?? l.totalAmount ?? 0;
                  const lRem = l.remainingAmount ?? (lAmt - (l.paidAmount || 0));
                  const recovered = lAmt - lRem;

                  return (
                    <tr key={l.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                      <td className="py-3 px-4 font-sans font-medium text-neutral-900 dark:text-neutral-100">
                        {emp?.name || l.employeeId}{' '}
                        <span className="text-[11px] text-neutral-400 font-mono">({l.employeeId})</span>
                      </td>
                      <td className="py-3 px-4">{formatMoney(lAmt)}</td>
                      <td className="py-3 px-4 text-emerald-600">{formatMoney(recovered)}</td>
                      <td className="py-3 px-4">{formatMoney(l.monthlyInstallment)} / mo</td>
                      <td className="py-3 px-4 text-right font-bold text-amber-600">
                        {formatMoney(lRem)}
                      </td>
                    </tr>
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
