import React, { useState } from 'react';
import {
  Calendar,
  CalendarCheck,
  Plus,
  Check,
  X,
  Filter,
  AlertCircle,
  Clock,
  User,
} from 'lucide-react';
import { LeaveRequest, LeaveType, Employee, Holiday, Shift } from '../types';
import { storageService } from '../services/storageService';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { addDaysStr, parseDateStr, todayStr } from '../utils/dateUtils';
import { computeAnnualLeave, getAnnualLeavePolicy } from '../utils/annualLeaveEngine';
import { reviewLeave } from '../services/approvalService';

export const LeavesPage: React.FC = () => {
  const { user, isEmployee, can } = useAuth();
  const canViewAll = can('leaves.view');
  const canCreateForOthers = can('leaves.create');
  const canApprove = can('leaves.approve');
  const { settings } = useSettings();
  const { success, error } = useNotification();

  const [leaves, setLeaves] = useState<LeaveRequest[]>(() => storageService.getLeaves());
  const [employees] = useState<Employee[]>(() => storageService.getEmployees());
  const [holidays] = useState<Holiday[]>(() => storageService.getHolidays());
  const [shifts] = useState<Shift[]>(() => storageService.getShifts());

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('');

  // Apply modal
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const blankForm = (employeeId: string) => {
    const today = todayStr();
    return {
      employeeId,
      leaveType: 'Annual' as LeaveType,
      fromDate: today,
      toDate: today,
      isHalfDay: false,
      halfDayType: 'First Half' as 'First Half' | 'Second Half',
      reason: '',
      // Staff entering a request on someone's behalf
      source: 'Message' as NonNullable<LeaveRequest['requestSource']>,
      approveNow: false,
    };
  };
  const [applyForm, setApplyForm] = useState(() => blankForm(user?.employeeId || ''));

  // Review Reject modal
  const [rejectingLeave, setRejectingLeave] = useState<LeaveRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const reloadLeaves = () => {
    setLeaves(storageService.getLeaves());
  };

  // No employee link means no own leave (never fall back to someone else's records).
  const currentEmpId = user?.employeeId || '';

  // Whose balances to show: the employee picked in the form when staff enter a request for
  // someone else, otherwise the signed-in user.
  const enteringForOthers = isApplyModalOpen && canCreateForOthers;
  const balanceEmpId = enteringForOthers ? applyForm.employeeId : currentEmpId;
  const showOwnBalances = isEmployee || !!user?.employeeId;

  // Leave days: the employee's working days (per their shift), skipping holidays.
  const calculateWorkingDays = (from: string, to: string, isHalf: boolean, empId: string): number => {
    if (!from || !to || from > to) return 0;
    const emp = employees.find((e) => e.id === empId);
    const shift = shifts.find((s) => s.id === emp?.shiftId) || shifts[0];
    const workingDays = shift?.workingDays ?? [1, 2, 3, 4, 5];
    const holidayDates = new Set(holidays.map((h) => h.date));
    let count = 0;
    for (let dateStr = from; dateStr <= to; dateStr = addDaysStr(dateStr, 1)) {
      if (workingDays.includes(parseDateStr(dateStr).getDay()) && !holidayDates.has(dateStr)) count++;
    }
    // A half day is one session of a single working day.
    return isHalf ? Math.min(count, 1) * 0.5 : count;
  };

  const currentDaysCount = calculateWorkingDays(
    applyForm.fromDate,
    applyForm.isHalfDay ? applyForm.fromDate : applyForm.toDate,
    applyForm.isHalfDay,
    balanceEmpId
  );

  // Quotas (this calendar year)
  const thisYear = new Date().getFullYear();
  const inThisYear = (l: LeaveRequest) => l.fromDate.startsWith(String(thisYear));
  const userLeaves = leaves.filter(
    (l) => l.employeeId === balanceEmpId && l.status === 'Approved' && inThisYear(l)
  );
  // Pending requests already claim part of the balance.
  const pendingOf = (type: LeaveType) =>
    leaves
      .filter(
        (l) => l.employeeId === balanceEmpId && l.status === 'Pending' && l.leaveType === type && inThisYear(l)
      )
      .reduce((acc, l) => acc + l.daysCount, 0);
  const usedAnnual = userLeaves
    .filter((l) => l.leaveType === 'Annual')
    .reduce((acc, l) => acc + l.daysCount, 0);
  const usedSick = userLeaves
    .filter((l) => l.leaveType === 'Sick')
    .reduce((acc, l) => acc + l.daysCount, 0);
  const usedCasual = userLeaves
    .filter((l) => l.leaveType === 'Casual')
    .reduce((acc, l) => acc + l.daysCount, 0);

  // Annual leave is earned monthly; see the Annual Leave module.
  const currentEmp = employees.find((e) => e.id === balanceEmpId);
  const annualSummary = currentEmp
    ? computeAnnualLeave(currentEmp, leaves, getAnnualLeavePolicy(settings), thisYear)
    : undefined;
  const annualQuota = annualSummary
    ? annualSummary.carriedForward + annualSummary.accrued
    : settings.leaves?.annual ?? settings.leaveQuotas?.Annual ?? 30;
  const sickQuota = settings.leaves?.sick ?? settings.leaveQuotas?.Sick ?? 10;
  const casualQuota = settings.leaves?.casual ?? settings.leaveQuotas?.Casual ?? 8;

  const remAnnual = annualSummary
    ? Math.max(0, annualSummary.balance)
    : Math.max(0, annualQuota - usedAnnual);
  const remSick = Math.max(0, sickQuota - usedSick);
  const remCasual = Math.max(0, casualQuota - usedCasual);
  const availAnnual = annualSummary ? annualSummary.available : remAnnual - pendingOf('Annual');
  const availSick = remSick - pendingOf('Sick');
  const availCasual = remCasual - pendingOf('Casual');

  // Handle Apply Form Submit
  const handleApplyLeave = (e: React.FormEvent) => {
    e.preventDefault();
    const employeeId = enteringForOthers ? applyForm.employeeId : currentEmpId;
    const toDate = applyForm.isHalfDay ? applyForm.fromDate : applyForm.toDate;
    if (!employeeId) {
      error('No Employee', 'Your account is not linked to an employee record.');
      return;
    }
    if (!applyForm.fromDate || !toDate || toDate < applyForm.fromDate) {
      error('Invalid Dates', 'The end date cannot be before the start date.');
      return;
    }
    if (currentDaysCount <= 0) {
      error('Invalid Dates', 'The selected dates are all off days or holidays for this employee.');
      return;
    }

    if (!applyForm.reason.trim()) {
      error('Reason Required', 'Please provide a justification for this leave request.');
      return;
    }

    const overlap = storageService
      .getLeaves()
      .find(
        (l) =>
          l.employeeId === employeeId &&
          (l.status === 'Pending' || l.status === 'Approved') &&
          l.fromDate <= toDate &&
          l.toDate >= applyForm.fromDate
      );
    if (overlap) {
      error(
        'Overlapping Leave',
        `There is already a ${overlap.status.toLowerCase()} ${overlap.leaveType} leave from ${overlap.fromDate} to ${overlap.toDate}.`
      );
      return;
    }

    // Balance check: paid leave cannot exceed what is left after pending requests.
    // Unpaid leave has no quota.
    const available =
      applyForm.leaveType === 'Annual'
        ? availAnnual
        : applyForm.leaveType === 'Casual'
        ? availCasual
        : applyForm.leaveType === 'Sick'
        ? availSick
        : Infinity;
    if (currentDaysCount > available) {
      const left = Math.max(0, available);
      error(
        'Quota Exceeded',
        `Only ${left} ${applyForm.leaveType} Leave day${left === 1 ? '' : 's'} available (after pending requests). Request fewer days or use Unpaid Leave.`
      );
      return;
    }

    const newLeave: LeaveRequest = {
      id: `lv-${Date.now()}`,
      employeeId,
      leaveType: applyForm.leaveType,
      fromDate: applyForm.fromDate,
      toDate,
      ...(applyForm.isHalfDay ? { isHalfDay: true } : {}),
      daysCount: currentDaysCount,
      reason: applyForm.reason,
      status: 'Pending',
      appliedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      ...(enteringForOthers && applyForm.employeeId !== user?.employeeId
        ? { enteredBy: user?.name, requestSource: applyForm.source }
        : { requestSource: 'Self' as const }),
    };

    storageService.addLeave(newLeave);
    setIsApplyModalOpen(false);

    // The head manager can approve in the same step; everyone else's entries wait for approval.
    if (applyForm.approveNow && canApprove) {
      handleReview(newLeave, 'Approved', `Entered and approved by ${user?.name}`);
      return;
    }
    const empName = employees.find((e) => e.id === newLeave.employeeId)?.name || newLeave.employeeId;
    success(
      'Leave Request Submitted',
      enteringForOthers
        ? `${currentDaysCount} day ${applyForm.leaveType} leave entered for ${empName} · awaiting Head Manager approval`
        : `Submitted ${currentDaysCount} days ${applyForm.leaveType} leave request.`
    );
    reloadLeaves();
  };

  // Handle Review Action (Approve / Reject)
  const handleReview = (leave: LeaveRequest, action: 'Approved' | 'Rejected', comment = '') => {
    reviewLeave(leave, action, user?.name || 'Head Manager', comment);
    const empName = employees.find((e) => e.id === leave.employeeId)?.name || leave.employeeId;
    success(`Leave ${action}`, `Request for ${empName} marked as ${action}.`);
    reloadLeaves();
  };

  // Filtered leaves
  const displayedLeaves = leaves.filter((l) => {
    if (!canViewAll && l.employeeId !== currentEmpId) return false;
    if (statusFilter && l.status !== statusFilter) return false;
    if (typeFilter && l.leaveType !== typeFilter) return false;
    if (deptFilter) {
      const emp = employees.find((e) => e.id === l.employeeId);
      if (emp?.department !== deptFilter) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Leave Management
          </h1>
          <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Annual entitlements, time-off requests, and approval workflow
          </p>
        </div>

        {(canCreateForOthers || showOwnBalances) && (
          <button
            onClick={() => {
              setApplyForm(
                blankForm(
                  canCreateForOthers
                    ? employees.find((e) => e.status === 'Active')?.id || currentEmpId
                    : currentEmpId
                )
              );
              setIsApplyModalOpen(true);
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 self-start sm:self-auto transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> {canCreateForOthers ? 'Add Leave Request' : 'Apply for Leave'}
          </button>
        )}
      </div>

      {canCreateForOthers && !canApprove && (
        <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900 text-xs text-sky-800 dark:text-sky-300">
          You can enter leave requests received by message, phone or email. They are sent to the
          Head Manager, who approves or rejects them.
        </div>
      )}

      {/* Leave Balances Cards (own balances) */}
      {showOwnBalances && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <span className="text-xs text-neutral-400 font-medium">Annual Leave</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
              {remAnnual}
            </span>
            <span className="text-xs text-neutral-400">/ {annualQuota} earned</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 mt-3 overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full"
              style={{ width: `${(remAnnual / (annualQuota || 1)) * 100}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <span className="text-xs text-neutral-400 font-medium">Sick Leave</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {remSick}
            </span>
            <span className="text-xs text-neutral-400">/ {sickQuota} days</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 mt-3 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${(remSick / (sickQuota || 1)) * 100}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <span className="text-xs text-neutral-400 font-medium">Casual Leave</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
              {remCasual}
            </span>
            <span className="text-xs text-neutral-400">/ {casualQuota} days</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 mt-3 overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full"
              style={{ width: `${(remCasual / (casualQuota || 1)) * 100}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <span className="text-xs text-neutral-400 font-medium">Total Used (YTD)</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
              {usedAnnual + usedSick + usedCasual}
            </span>
            <span className="text-xs text-neutral-400">days taken</span>
          </div>
          <p className="text-[11px] text-neutral-400 mt-3">Refreshes Jan 1, {thisYear + 1}</p>
        </div>
      </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300"
          >
            <option value="">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300"
          >
            <option value="">All Leave Types</option>
            <option value="Annual">Annual Leave</option>
            <option value="Sick">Sick Leave</option>
            <option value="Casual">Casual Leave</option>
            <option value="Unpaid">Unpaid Leave</option>
          </select>

          {canViewAll && (
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300"
            >
              <option value="">All Departments</option>
              {Array.from(new Set(employees.map((e) => e.department)))
                .sort()
                .map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
            </select>
          )}

          {(statusFilter || typeFilter || deptFilter) && (
            <button
              onClick={() => {
                setStatusFilter('');
                setTypeFilter('');
                setDeptFilter('');
              }}
              className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              Reset Filters
            </button>
          )}
        </div>

        <span className="text-xs text-neutral-400">
          Showing {displayedLeaves.length} request{displayedLeaves.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Leaves Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 font-semibold border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Leave Type</th>
                <th className="py-3 px-4">Duration & Dates</th>
                <th className="py-3 px-4">Days</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Status</th>
                {(canApprove || canCreateForOthers) && (
                  <th className="py-3 px-4 text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {displayedLeaves.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-400">
                    No leave requests found.
                  </td>
                </tr>
              ) : (
                displayedLeaves.map((lv) => {
                  const emp = employees.find((e) => e.id === lv.employeeId);
                  return (
                    <tr
                      key={lv.id}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center font-bold text-xs">
                            {emp?.name[0] || 'E'}
                          </div>
                          <div>
                            <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                              {emp?.name || lv.employeeId}
                            </p>
                            <span className="text-[11px] text-neutral-400">{lv.employeeId}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-neutral-800 dark:text-neutral-200">
                        {lv.leaveType} Leave
                      </td>
                      <td className="py-3.5 px-4 font-mono text-neutral-600 dark:text-neutral-300">
                        {lv.fromDate} {lv.fromDate !== lv.toDate ? `to ${lv.toDate}` : ''}
                        {lv.isHalfDay && (
                          <span className="block text-[11px] font-sans text-neutral-400">Half day</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold tabular-nums text-neutral-900 dark:text-neutral-100">
                        {lv.daysCount}d
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-300 max-w-xs">
                        <p className="line-clamp-2">{lv.reason}</p>
                        {lv.enteredBy && (
                          <span className="text-[11px] text-sky-600 dark:text-sky-400 block mt-0.5">
                            Entered by {lv.enteredBy}
                            {lv.requestSource && lv.requestSource !== 'Self' ? ` · via ${lv.requestSource}` : ''}
                          </span>
                        )}
                        {lv.reviewedBy && (
                          <span className="text-[11px] text-neutral-400 block mt-0.5">
                            {lv.status} by {lv.reviewedBy}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge status={lv.status} />
                      </td>
                      {(canApprove || canCreateForOthers) && (
                        <td className="py-3.5 px-4 text-right">
                          {lv.status === 'Pending' && !canApprove ? (
                            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                              Awaiting Head Manager
                            </span>
                          ) : lv.status === 'Pending' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleReview(lv, 'Approved')}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold flex items-center gap-1 shadow-xs"
                              >
                                <Check className="w-3 h-3" /> Approve
                              </button>
                              <button
                                onClick={() => {
                                  setRejectingLeave(lv);
                                  setRejectReason('');
                                }}
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-semibold flex items-center gap-1 shadow-xs"
                              >
                                <X className="w-3 h-3" /> Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-neutral-400 text-xs">Reviewed</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Apply Leave Modal */}
      {isApplyModalOpen && (
        <Modal
          isOpen={isApplyModalOpen}
          onClose={() => setIsApplyModalOpen(false)}
          title={canCreateForOthers ? 'Add Leave Request' : 'Apply for Leave'}
          subtitle={
            canCreateForOthers
              ? 'Enter a leave request received from an employee'
              : 'Submit time-off dates for manager approval'
          }
          maxWidth="md"
        >
          <form onSubmit={handleApplyLeave} className="space-y-4">
            {canCreateForOthers && (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Employee *
                  </label>
                  <select
                    value={applyForm.employeeId}
                    onChange={(e) => setApplyForm({ ...applyForm, employeeId: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
                  >
                    {employees
                      .filter((emp) => emp.status === 'Active')
                      .map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.id}) - {emp.department}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Received via
                  </label>
                  <select
                    value={applyForm.source}
                    onChange={(e) =>
                      setApplyForm({
                        ...applyForm,
                        source: e.target.value as NonNullable<LeaveRequest['requestSource']>,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
                  >
                    <option value="Message">Message</option>
                    <option value="Phone">Phone</option>
                    <option value="Email">Email</option>
                    <option value="In person">In person</option>
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Leave Category *
              </label>
              <select
                value={applyForm.leaveType}
                onChange={(e) =>
                  setApplyForm({ ...applyForm, leaveType: e.target.value as LeaveType })
                }
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              >
                <option value="Annual">Annual Leave (Balance: {remAnnual} days)</option>
                <option value="Sick">Sick Leave (Balance: {remSick} days)</option>
                <option value="Casual">Casual Leave (Balance: {remCasual} days)</option>
                <option value="Unpaid">Unpaid Leave (Loss of Pay)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  From Date *
                </label>
                <input
                  type="date"
                  required
                  value={applyForm.fromDate}
                  onChange={(e) =>
                    setApplyForm({
                      ...applyForm,
                      fromDate: e.target.value,
                      // Keep the range valid when the start moves past the end.
                      toDate: applyForm.toDate < e.target.value ? e.target.value : applyForm.toDate,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  To Date *
                </label>
                <input
                  type="date"
                  required
                  disabled={applyForm.isHalfDay}
                  min={applyForm.fromDate}
                  value={applyForm.isHalfDay ? applyForm.fromDate : applyForm.toDate}
                  onChange={(e) => setApplyForm({ ...applyForm, toDate: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono disabled:opacity-60"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="halfDayCheck"
                checked={applyForm.isHalfDay}
                onChange={(e) => setApplyForm({ ...applyForm, isHalfDay: e.target.checked })}
                className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label
                htmlFor="halfDayCheck"
                className="text-xs font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer"
              >
                Half-Day Leave (0.5 day deduction)
              </label>
            </div>

            {applyForm.isHalfDay && (
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Half-Day Session
                </label>
                <select
                  value={applyForm.halfDayType}
                  onChange={(e) =>
                    setApplyForm({
                      ...applyForm,
                      halfDayType: e.target.value as 'First Half' | 'Second Half',
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
                >
                  <option value="First Half">First Half (Morning)</option>
                  <option value="Second Half">Second Half (Afternoon)</option>
                </select>
              </div>
            )}

            {/* Calculated duration banner */}
            <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 flex items-center justify-between text-xs">
              <span className="text-indigo-900 dark:text-indigo-200 font-medium">
                Total Working Days Requested:
              </span>
              <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300 text-sm">
                {currentDaysCount} {currentDaysCount === 1 ? 'day' : 'days'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Reason & Details *
              </label>
              <textarea
                required
                rows={3}
                value={applyForm.reason}
                onChange={(e) => setApplyForm({ ...applyForm, reason: e.target.value })}
                placeholder={
                  canCreateForOthers
                    ? 'Reason as given in the message, e.g. "Family wedding in Lahore"'
                    : 'State your reason clearly...'
                }
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              />
            </div>

            {canApprove && canCreateForOthers && (
              <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyForm.approveNow}
                  onChange={(e) => setApplyForm({ ...applyForm, approveNow: e.target.checked })}
                />
                Approve immediately (skip the pending step)
              </label>
            )}

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setIsApplyModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
              >
                {applyForm.approveNow && canApprove
                  ? 'Save & Approve'
                  : canCreateForOthers
                  ? 'Submit for Approval'
                  : 'Submit Leave Application'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Reject Reason Modal */}
      {rejectingLeave && (
        <Modal
          isOpen={Boolean(rejectingLeave)}
          onClose={() => setRejectingLeave(null)}
          title="Decline Leave Request"
          subtitle={`Reject leave for ${rejectingLeave.employeeId}`}
          maxWidth="sm"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Reason for Rejection
              </label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this request is declined..."
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRejectingLeave(null)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleReview(rejectingLeave, 'Rejected', rejectReason);
                  setRejectingLeave(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs"
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
