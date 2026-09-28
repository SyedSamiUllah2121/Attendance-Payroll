import { AttendanceRecord, LeaveRequest, RegularizationRequest } from '../types';
import { storageService } from './storageService';
import { evaluateAttendanceStatus } from '../utils/attendanceEngine';
import { addDaysStr, parseDateStr } from '../utils/dateUtils';

/**
 * Approval actions shared by the notification bell, Leave Management and Attendance,
 * so approving from any of them has the same effect.
 */

/** Notes written on the On Leave records an approval creates (also matches older records). */
const leaveNote = (leave: LeaveRequest) =>
  `${leave.leaveType} Leave Approved${leave.isHalfDay ? ' (half day)' : ''}`;

export const reviewLeave = (
  leave: LeaveRequest,
  action: 'Approved' | 'Rejected',
  reviewer: string,
  comment = ''
): LeaveRequest => {
  const wasApproved = leave.status === 'Approved';
  const updated: LeaveRequest = {
    ...leave,
    status: action,
    reviewedBy: reviewer,
    reviewedAt: new Date().toISOString(),
    reviewComment: comment || (action === 'Approved' ? 'Approved as requested' : 'Declined'),
  };
  // Saving the leave re-runs the attendance sync, which marks past days of approved leave.
  storageService.updateLeave(updated);

  const emp = storageService.getEmployeeById(leave.employeeId);
  const shifts = storageService.getShifts();
  const shift = shifts.find((s) => s.id === emp?.shiftId) || shifts[0];
  const holidays = new Set(storageService.getHolidays().map((h) => h.date));
  const inRange = (date: string) => date >= leave.fromDate && date <= leave.toDate;

  if (action === 'Approved') {
    // Approved leave marks the employee's working days (per their shift, skipping holidays) as
    // On Leave. The records are auto-marked so they follow later holiday / shift / leave changes.
    // Days the employee actually checked in are real attendance and are left alone.
    const list = storageService.getAttendance();
    const byDate = new Map(
      list.filter((r) => r.employeeId === leave.employeeId && inRange(r.date)).map((r) => [r.date, r])
    );
    let changed = false;
    for (let dateStr = leave.fromDate; dateStr <= leave.toDate; dateStr = addDaysStr(dateStr, 1)) {
      if (emp?.joiningDate && dateStr < emp.joiningDate) continue;
      const dow = parseDateStr(dateStr).getDay();
      const works = shift ? shift.workingDays.includes(dow) : dow % 6 !== 0;
      if (!works || holidays.has(dateStr)) continue;
      const existing = byDate.get(dateStr);
      if (existing?.checkIn) continue;
      const record: AttendanceRecord = {
        id: existing?.id || `att-${leave.employeeId}-${dateStr}`,
        employeeId: leave.employeeId,
        date: dateStr,
        status: 'On Leave',
        workedMinutes: 0,
        overtimeMinutes: 0,
        isEarlyDeparture: false,
        notes: leaveNote(leave),
        modifiedBy: reviewer,
        autoMarked: true,
      };
      const idx = existing ? list.indexOf(existing) : -1;
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      changed = true;
    }
    if (changed) storageService.saveAttendance(list);
  } else if (wasApproved) {
    // Rejecting a leave that was already approved: drop the On Leave records it wrote and let the
    // sync re-derive those days (Absent, Weekend, Holiday or another approved leave).
    const approvedNote = `${leave.leaveType} Leave Approved`;
    const list = storageService.getAttendance();
    const next = list.filter(
      (r) =>
        !(
          r.employeeId === leave.employeeId &&
          inRange(r.date) &&
          r.status === 'On Leave' &&
          !r.checkIn &&
          (r.autoMarked || r.notes?.startsWith(approvedNote))
        )
    );
    if (next.length !== list.length) {
      storageService.saveAttendance(next);
      storageService.syncAttendance();
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
    // Evaluate the times on any day: a correction for work on an off day or holiday still counts the hours.
    const result = evaluateAttendanceStatus(
      req.requestedCheckIn,
      req.requestedCheckOut,
      { ...shift, workingDays: [0, 1, 2, 3, 4, 5, 6] },
      req.date
    );
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
