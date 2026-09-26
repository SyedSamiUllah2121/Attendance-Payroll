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
import { LeaveRequest, LeaveType, LeaveStatus, Employee, Holiday } from '../types';
import { storageService } from '../services/storageService';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { differenceInBusinessDays, parseISO, addDays } from 'date-fns';
import { computeAnnualLeave, getAnnualLeavePolicy } from '../utils/annualLeaveEngine';

export const LeavesPage: React.FC = () => {
  const { user, isHR, isEmployee } = useAuth();
  const { settings } = useSettings();
  const { success, warning, error } = useNotification();

  const [leaves, setLeaves] = useState<LeaveRequest[]>(() => storageService.getLeaves());
  const [employees] = useState<Employee[]>(() => storageService.getEmployees());
  const [holidays] = useState<Holiday[]>(() => storageService.getHolidays());

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('');

  // Apply modal
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [applyForm, setApplyForm] = useState({
    employeeId: user?.employeeId || 'EMP-001',
    leaveType: 'Annual' as LeaveType,
    fromDate: '2026-10-05',
    toDate: '2026-10-07',
    isHalfDay: false,
    halfDayType: 'First Half' as 'First Half' | 'Second Half',
    reason: '',
  });

  // Review Reject modal
  const [rejectingLeave, setRejectingLeave] = useState<LeaveRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const reloadLeaves = () => {
    setLeaves(storageService.getLeaves());
  };

  const currentEmpId = user?.employeeId || 'EMP-001';

  // Calculate leave days excluding weekends and holidays
  const calculateWorkingDays = (from: string, to: string, isHalf: boolean): number => {
    if (isHalf) return 0.5;
    if (!from || !to || from > to) return 0;

    let count = 0;
    let curr = new Date(from + 'T00:00:00');
    const end = new Date(to + 'T00:00:00');

    while (curr <= end) {
      const dow = curr.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const dateStr = curr.toISOString().slice(0, 10);
      const isHoliday = holidays.some((h) => h.date === dateStr);

      if (!isWeekend && !isHoliday) {
        count++;
      }
      curr = addDays(curr, 1);
    }
    return count;
  };

  const currentDaysCount = calculateWorkingDays(
    applyForm.fromDate,
    applyForm.toDate,
    applyForm.isHalfDay
  );

  // Quotas for current user
  const userLeaves = leaves.filter((l) => l.employeeId === currentEmpId && l.status === 'Approved');
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
  const currentEmp = employees.find((e) => e.id === currentEmpId);
  const annualSummary = currentEmp
    ? computeAnnualLeave(currentEmp, leaves, getAnnualLeavePolicy(settings), new Date().getFullYear())
    : undefined;
  const annualQuota = annualSummary
    ? annualSummary.carriedForward + annualSummary.accrued
    : settings.leaves?.annual ?? settings.leaveQuotas?.Annual ?? 14;
  const sickQuota = settings.leaves?.sick ?? settings.leaveQuotas?.Sick ?? 10;
  const casualQuota = settings.leaves?.casual ?? settings.leaveQuotas?.Casual ?? 8;

  const remAnnual = annualSummary
    ? Math.max(0, annualSummary.balance)
    : Math.max(0, annualQuota - usedAnnual);
  const remSick = Math.max(0, sickQuota - usedSick);
  const remCasual = Math.max(0, casualQuota - usedCasual);

  // Handle Apply Form Submit
  const handleApplyLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentDaysCount <= 0) {
      error('Invalid Dates', 'Please select at least 1 working day for leave.');
      return;
    }

    if (!applyForm.reason.trim()) {
      error('Reason Required', 'Please provide a justification for this leave request.');
      return;
    }

    // Balance check
    if (applyForm.leaveType === 'Annual' && currentDaysCount > remAnnual) {
      warning('Quota Exceeded', `You only have ${remAnnual} Annual Leave days remaining.`);
    } else if (applyForm.leaveType === 'Casual' && currentDaysCount > remCasual) {
      warning('Quota Exceeded', `You only have ${remCasual} Casual Leave days remaining.`);
    } else if (applyForm.leaveType === 'Sick' && currentDaysCount > remSick) {
      warning('Quota Exceeded', `You only have ${remSick} Sick Leave days remaining.`);
    }

    const newLeave: LeaveRequest = {
      id: `lv-${Date.now()}`,
      employeeId: isEmployee ? currentEmpId : applyForm.employeeId,
      leaveType: applyForm.leaveType,
      fromDate: applyForm.fromDate,
      toDate: applyForm.toDate,
      daysCount: currentDaysCount,
      reason: applyForm.reason,
      status: 'Pending',
      appliedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    storageService.addLeave(newLeave);
    success('Leave Request Submitted', `Submitted ${currentDaysCount} days ${applyForm.leaveType} leave request.`);
    reloadLeaves();
    setIsApplyModalOpen(false);
  };

  // Handle Review Action (Approve / Reject)
  const handleReview = (leave: LeaveRequest, action: 'Approved' | 'Rejected', comment = '') => {
    const updated: LeaveRequest = {
      ...leave,
      status: action,
      reviewedBy: user?.name || 'Administrator',
      reviewedAt: new Date().toISOString(),
      reviewComment: comment || (action === 'Approved' ? 'Approved as requested' : 'Declined'),
    };
    storageService.updateLeave(updated);

    // If approved, update attendance records to "On Leave"
    if (action === 'Approved') {
      let curr = new Date(leave.fromDate + 'T00:00:00');
      const end = new Date(leave.toDate + 'T00:00:00');

      while (curr <= end) {
        const dow = curr.getDay();
        const dateStr = curr.toISOString().slice(0, 10);
        if (dow !== 0 && dow !== 6) {
          storageService.saveOrUpdateAttendanceRecord({
            id: `att-${leave.employeeId}-${dateStr}`,
            employeeId: leave.employeeId,
            date: dateStr,
            status: 'On Leave',
            workedMinutes: 0,
            overtimeMinutes: 0,
            notes: `${leave.leaveType} Leave Approved`,
          });
        }
        curr = addDays(curr, 1);
      }
    }

    success(`Leave ${action}`, `Request for ${leave.employeeId} marked as ${action}.`);
    reloadLeaves();
  };

  // Filtered leaves
  const displayedLeaves = leaves.filter((l) => {
    if (isEmployee && l.employeeId !== currentEmpId) return false;
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

        <button
          onClick={() => {
            setApplyForm({
              employeeId: currentEmpId,
              leaveType: 'Annual',
              fromDate: '2026-10-05',
              toDate: '2026-10-07',
              isHalfDay: false,
              halfDayType: 'First Half',
              reason: '',
            });
            setIsApplyModalOpen(true);
          }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 self-start sm:self-auto transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Apply for Leave
        </button>
      </div>

      {/* Leave Balances Cards */}
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
          <p className="text-[11px] text-neutral-400 mt-3">Refreshes Jan 1, 2027</p>
        </div>
      </div>

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

          {isHR && (
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300"
            >
              <option value="">All Departments</option>
              <option value="Engineering">Engineering</option>
              <option value="Human Resources">Human Resources</option>
              <option value="Finance">Finance</option>
              <option value="Sales">Sales</option>
              <option value="Operations">Operations</option>
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
                {isHR && <th className="py-3 px-4 text-right">Actions</th>}
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
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold tabular-nums text-neutral-900 dark:text-neutral-100">
                        {lv.daysCount}d
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-300 max-w-xs">
                        <p className="line-clamp-2">{lv.reason}</p>
                        {lv.reviewedBy && (
                          <span className="text-[11px] text-neutral-400 block mt-0.5">
                            {lv.status} by {lv.reviewedBy}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge status={lv.status} />
                      </td>
                      {isHR && (
                        <td className="py-3.5 px-4 text-right">
                          {lv.status === 'Pending' ? (
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
                                  setRejectReason('Insufficient coverage during sprint delivery');
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
          title="Apply for Leave"
          subtitle="Submit time-off dates for manager approval"
          maxWidth="md"
        >
          <form onSubmit={handleApplyLeave} className="space-y-4">
            {isHR && (
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Employee
                </label>
                <select
                  value={applyForm.employeeId}
                  onChange={(e) => setApplyForm({ ...applyForm, employeeId: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.id}) - {emp.department}
                    </option>
                  ))}
                </select>
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
                  onChange={(e) => setApplyForm({ ...applyForm, fromDate: e.target.value })}
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
                  value={applyForm.toDate}
                  onChange={(e) => setApplyForm({ ...applyForm, toDate: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
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
                placeholder="State your reason clearly..."
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setIsApplyModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
              >
                Submit Leave Application
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
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200"
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
