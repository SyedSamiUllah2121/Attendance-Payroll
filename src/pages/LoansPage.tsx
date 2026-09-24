import React, { useState } from 'react';
import { Plus, DollarSign, CreditCard, CheckCircle, Clock } from 'lucide-react';
import { Loan, Employee, LoanType } from '../types';
import { storageService } from '../services/storageService';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';

export const LoansPage: React.FC = () => {
  const { formatMoney } = useSettings();
  const { success, error } = useNotification();

  const [loans, setLoans] = useState<Loan[]>(() => storageService.getLoans());
  const [employees] = useState<Employee[]>(() => storageService.getEmployees());

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    employeeId: employees[0]?.id || 'EMP-001',
    loanType: 'Salary Advance' as LoanType,
    amount: 50000,
    monthlyInstallment: 10000,
    startMonth: '2026-10',
    reason: 'Medical emergency advance for family hospital bill.',
  });

  const reloadLoans = () => {
    setLoans(storageService.getLoans());
  };

  const handleCreateLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.amount <= 0 || form.monthlyInstallment <= 0) {
      error('Invalid amounts', 'Amount and monthly installment must be greater than zero.');
      return;
    }

    const durationMonths = Math.ceil(form.amount / form.monthlyInstallment);
    const [y, m] = form.startMonth.split('-').map(Number);
    const endMDate = new Date(y, m - 1 + durationMonths, 1);
    const endMonth = `${endMDate.getFullYear()}-${String(endMDate.getMonth() + 1).padStart(2, '0')}`;

    const newLoan: Loan = {
      id: `loan-${Date.now()}`,
      employeeId: form.employeeId,
      loanType: 'Loan',
      totalAmount: form.amount,
      paidAmount: 0,
      amount: form.amount,
      remainingAmount: form.amount,
      monthlyInstallment: form.monthlyInstallment,
      startMonth: form.startMonth,
      endMonth,
      reason: form.reason,
      status: 'Active',
      createdAt: new Date().toISOString(),
    };

    storageService.addLoan(newLoan);
    success('Loan Approved & Disbursed', `Created loan for ${form.employeeId}`);
    reloadLoans();
    setIsModalOpen(false);
  };

  const totalDisbursed = loans.reduce((acc, l) => acc + (l.amount ?? l.totalAmount), 0);
  const totalOutstanding = loans
    .filter((l) => l.status === 'Active')
    .reduce((acc, l) => acc + (l.remainingAmount ?? (l.totalAmount - l.paidAmount)), 0);
  const totalRecovered = totalDisbursed - totalOutstanding;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Loans & Salary Advances
          </h1>
          <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Manage employee advances, installment schedules, and automated payroll deductions
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 self-start sm:self-auto transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Issue Advance / Loan
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <span className="text-xs text-neutral-400 font-medium">Total Advances Issued</span>
          <p className="text-xl font-bold font-mono text-neutral-900 dark:text-neutral-100 mt-1">
            {formatMoney(totalDisbursed)}
          </p>
          <span className="text-[11px] text-neutral-400 mt-1 block">
            {loans.length} lifetime loan portfolio
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <span className="text-xs text-neutral-400 font-medium">Outstanding Balance</span>
          <p className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
            {formatMoney(totalOutstanding)}
          </p>
          <span className="text-[11px] text-neutral-400 mt-1 block">
            Deductible across monthly payroll runs
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <span className="text-xs text-neutral-400 font-medium">Recovered Amount</span>
          <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {formatMoney(totalRecovered)}
          </p>
          <span className="text-[11px] text-neutral-400 mt-1 block">
            {totalDisbursed > 0 ? Math.round((totalRecovered / totalDisbursed) * 100) : 0}% recovery rate
          </span>
        </div>
      </div>

      {/* Loans Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 font-semibold border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Loan Amount</th>
                <th className="py-3 px-4">Remaining Balance</th>
                <th className="py-3 px-4">Monthly Installment</th>
                <th className="py-3 px-4">Recovery Schedule</th>
                <th className="py-3 px-4">Reason / Notes</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {loans.map((loan) => {
                const emp = employees.find((e) => e.id === loan.employeeId);
                const loanAmt = loan.amount ?? loan.totalAmount ?? 0;
                const loanRem = loan.remainingAmount ?? (loanAmt - (loan.paidAmount || 0));
                const percentRecovered =
                  loanAmt > 0
                    ? Math.round(((loanAmt - loanRem) / loanAmt) * 100)
                    : 100;
                return (
                  <tr
                    key={loan.id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {emp?.name || loan.employeeId}
                      </p>
                      <span className="text-[11px] text-neutral-400 font-mono">
                        {loan.employeeId} · {emp?.department}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-neutral-900 dark:text-neutral-100">
                      {formatMoney(loanAmt)}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-mono font-bold text-amber-600 dark:text-amber-400">
                        {formatMoney(loanRem)}
                      </p>
                      <div className="w-24 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 mt-1 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${percentRecovered}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-neutral-700 dark:text-neutral-300">
                      {formatMoney(loan.monthlyInstallment)} / mo
                    </td>
                    <td className="py-3.5 px-4 font-mono text-neutral-500">
                      {loan.startMonth} {loan.endMonth ? `to ${loan.endMonth}` : ''}
                    </td>
                    <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-300 max-w-xs">
                      <p className="line-clamp-1">{loan.reason || loan.notes || 'Personal Advance'}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge status={loan.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Issue Loan Modal */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Issue Employee Loan / Advance"
          subtitle="Set up installment schedule for automated payroll deduction"
          maxWidth="md"
        >
          <form onSubmit={handleCreateLoan} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Select Employee *
              </label>
              <select
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.id}) - Basic: {formatMoney(emp.basicSalary)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Loan / Advance Amount *
                </label>
                <input
                  type="number"
                  required
                  min="1000"
                  step="1000"
                  value={form.amount}
                  onChange={(e) =>
                    setForm({ ...form, amount: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Monthly Installment *
                </label>
                <input
                  type="number"
                  required
                  min="500"
                  step="500"
                  value={form.monthlyInstallment}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      monthlyInstallment: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Start Deduction Month *
              </label>
              <input
                type="month"
                required
                value={form.startMonth}
                onChange={(e) => setForm({ ...form, startMonth: e.target.value })}
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Reason & Disbursement Purpose *
              </label>
              <textarea
                required
                rows={3}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Details of approval and disbursement..."
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
              >
                Disburse Advance
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
