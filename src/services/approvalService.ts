import { LeaveRequest, RegularizationRequest } from '../types';
import { storageService } from './storageService';
import { evaluateAttendanceStatus } from '../utils/attendanceEngine';

/**
 * Approval actions shared by the notification bell, Leave Management and Attendance,
 * so approving from any of them has the same effect.
 */

const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const reviewLeave = (
  leave: LeaveRequest,
  action: 'Approved' | 'Rejected',
  reviewer: string,
  comment = ''
): LeaveRequest => {
  const updated: LeaveRequest = {
    ...leave,
    status: action,
    reviewedBy: reviewer,
    reviewedAt: new Date().toISOString(),
    reviewComment: comment || (action === 'Approved' ? 'Approved as requested' : 'Declined'),
  };
  storageService.updateLeave(updated);

  // Approved leave marks the employee's working days (per their shift, skipping holidays) as On Leave.
  if (action === 'Approved') {
    const emp = storageService.getEmployeeById(leave.employeeId);
    const shifts = storageService.getShifts();
    const shift = shifts.find((s) => s.id === emp?.shiftId) || shifts[0];
    const holidays = new Set(storageService.getHolidays().map((h) => h.date));
    const curr = new Date(leave.fromDate + 'T00:00:00');
    const end = new Date(leave.toDate + 'T00:00:00');
    while (curr <= end) {
      const dateStr = localDateStr(curr);
      const works = shift ? shift.workingDays.includes(curr.getDay()) : curr.getDay() % 6 !== 0;
      if (works && !holidays.has(dateStr)) {
        storageService.saveOrUpdateAttendanceRecord({
          id: `att-${leave.employeeId}-${dateStr}`,
          employeeId: leave.employeeId,
          date: dateStr,
          status: 'On Leave',
          workedMinutes: 0,
          overtimeMinutes: 0,
          notes: `${leave.leaveType} Leave Approved`,
          modifiedBy: reviewer,
        });
      }
      curr.setDate(curr.getDate() + 1);
    }
  }
  return updated;
};

export const reviewRegularization = (
  req: RegularizationRequest,
  action: 'Approved' | 'Rejected',
  reviewer: string,
  comment = ''
): RegularizationRequest => {
  const updated: RegularizationRequest = {
    ...req,
    status: action,
    reviewedBy: reviewer,
    reviewedAt: new Date().toISOString(),
    reviewComment:
      comment || (action === 'Approved' ? 'Verified with attendance log' : 'Insufficient justification'),
  };
  storageService.updateRegularization(updated);

  // Approved corrections rewrite that day's record, re-evaluating Late / Half Day from the new times.
  if (action === 'Approved') {
    const existing = storageService
      .getAttendance()
      .find((r) => r.employeeId === req.employeeId && r.date === req.date);
    const emp = storageService.getEmployeeById(req.employeeId);
    const shifts = storageService.getShifts();
    const shift = shifts.find((s) => s.id === emp?.shiftId) || shifts[0];
    const result = evaluateAttendanceStatus(req.requestedCheckIn, req.requestedCheckOut, shift, req.date);
    storageService.saveOrUpdateAttendanceRecord({
      ...existing,
      id: existing?.id || `att-${req.employeeId}-${req.date}`,
      employeeId: req.employeeId,
      date: req.date,
      checkIn: req.requestedCheckIn,
      checkOut: req.requestedCheckOut,
      status: result.status,
      workedMinutes: result.workedMinutes,
      overtimeMinutes: result.overtimeMinutes,
      isEarlyDeparture: result.isEarlyDeparture,
      notes: `Regularized by ${reviewer}`,
      modifiedBy: reviewer,
    });
  }
  return updated;
};
