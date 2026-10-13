import React, { useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { DutyPeriodType, Employee, ExitType, Shift } from '../../types';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { useSettings } from '../../context/SettingsContext';
import { storageService } from '../../services/storageService';
import {
  exitEmployee,
  isPeriodRunning,
  reviseEmployee,
  startDutyPeriod,
  transferEmployee,
} from '../../services/employeeActionsService';
import { addDaysStr, todayStr } from '../../utils/dateUtils';
import { siteNameOf } from '../../utils/sites';
import { EmployeeActionKind } from './EmployeeActionsMenu';

const labelClass = 'block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1';
const fieldClass =
  'w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100';
const hintClass = 'text-[11px] text-neutral-400 mt-1';

const TITLES: Record<EmployeeActionKind, string> = {
  transfer: 'Transfer',
  revision: 'Promotion / Salary Revision',
  'Field Duty': 'Field Duty',
  WFH: 'Work From Home',
  Suspension: 'Suspension',
  exit: 'Exit Employee',
};

const DUTY_HINT: Record<DutyPeriodType, string> = {
  'Field Duty': 'Shows as On Duty (paid) in attendance every day of the period.',
  WFH: 'Shows as WFH (paid) in attendance every day of the period.',
  Suspension: 'Shows as Suspended in attendance; those working days are unpaid in payroll.',
};

interface Props {
  kind: EmployeeActionKind;
  employee: Employee;
  shifts: Shift[];
  departments: string[];
  onClose: () => void;
  onSaved: () => void;
}

const Notice: React.FC<{ tone?: 'info' | 'warn'; children: React.ReactNode }> = ({ tone = 'info', children }) => (
  <div
    className={`flex items-start gap-2 p-3 rounded-lg text-[11px] leading-relaxed ${
      tone === 'warn'
        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
        : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300'
    }`}
  >
    {tone === 'warn' ? (
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
    ) : (
      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
    )}
    <span>{children}</span>
  </div>
);

/** The small dialog behind each Employee Action. Saving runs the action in one transaction. */
export const EmployeeActionModal: React.FC<Props> = ({ kind, employee, shifts, departments, onClose, onSaved }) => {
  const { user } = useAuth();
  const { success, error } = useNotification();
  const { formatMoney } = useSettings();
  const today = todayStr();
  const by = user?.name || 'Manager';

  const [effectiveDate, setEffectiveDate] = useState(today);
  const [note, setNote] = useState('');
  // Transfer
  const [department, setDepartment] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [sites] = useState(() => storageService.getSites());
  const [designation, setDesignation] = useState('');
  // Revision
  const [salary, setSalary] = useState('');
  // Duty period
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState('');
  // Exit
  const [exitType, setExitType] = useState<ExitType>('Resigned');
  const [lastWorkingDay, setLastWorkingDay] = useState(today);

  const isDuty = kind === 'Field Duty' || kind === 'WFH' || kind === 'Suspension';
  const shiftName = (id: string) => shifts.find((s) => s.id === id)?.name || id;

  // Periods the new one would cut short or replace (one open period per employee)
  const periods = isDuty ? storageService.getDutyPeriods().filter((p) => p.employeeId === employee.id) : [];
  const closing = periods.filter((p) => p.startDate < startDate && isPeriodRunning(p, startDate));
  const replacing = periods.filter((p) => p.startDate >= startDate);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (kind === 'transfer') {
        const entry = transferEmployee(
          employee,
          { department, shiftId, siteId, designation: designation.trim(), effectiveDate, note },
          by
        );
        success(
          'Transfer saved',
          entry.appliedAt
            ? `${employee.name}'s record is updated from ${effectiveDate}.`
            : `Scheduled: ${employee.name}'s record changes on ${effectiveDate}.`
        );
      } else if (kind === 'revision') {
        const entry = reviseEmployee(
          employee,
          { designation: designation.trim(), basicSalary: salary ? Number(salary) : undefined, effectiveDate, note },
          by
        );
        success(
          `${entry.type} saved`,
          entry.appliedAt
            ? `Effective ${effectiveDate}. Payroll uses the new salary from that day.`
            : `Scheduled for ${effectiveDate}. Payroll uses the new salary from that day.`
        );
      } else if (isDuty) {
        startDutyPeriod(employee, { type: kind, startDate, endDate: endDate || undefined, note }, by);
        success(
          `${TITLES[kind]} started`,
          `${employee.name}: ${startDate} → ${endDate || 'until ended'}. Attendance fills in automatically.`
        );
      } else {
        exitEmployee(employee, { exitType, lastWorkingDay, reason: note }, by);
        success(
          'Exit recorded',
          `${employee.name} ${exitType.toLowerCase()}; last working day ${lastWorkingDay}. Attendance and payroll records are kept.`
        );
      }
      onSaved();
      onClose();
    } catch (err) {
      error('Not saved', err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${TITLES[kind]}: ${employee.name}`}
      subtitle={`${employee.id} · ${employee.designation} · ${employee.department}`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {kind === 'transfer' && (
          <>
            <div>
              <label className={labelClass}>New Site</label>
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={fieldClass}>
                <option value="">No change ({siteNameOf(sites, employee.siteId) || 'no site'})</option>
                {sites
                  .filter((s) => s.status === 'Active' && s.id !== employee.siteId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.country ? ` (${s.country})` : ''}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>New Department</label>
                <select value={department} onChange={(e) => setDepartment(e.target.value)} className={fieldClass}>
                  <option value="">No change ({employee.department})</option>
                  {departments
                    .filter((d) => d !== employee.department)
                    .map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>New Shift</label>
                <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} className={fieldClass}>
                  <option value="">No change ({shiftName(employee.shiftId)})</option>
                  {shifts
                    .filter((s) => s.id !== employee.shiftId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.startTime}–{s.endTime})
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>New Designation</label>
              <input
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder={`No change (${employee.designation})`}
                className={fieldClass}
              />
            </div>
          </>
        )}

        {kind === 'revision' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>New Designation</label>
              <input
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder={employee.designation}
                className={fieldClass}
              />
              <p className={hintClass}>Leave empty for a salary-only revision.</p>
            </div>
            <div>
              <label className={labelClass}>New Basic Salary</label>
              <input
                type="number"
                min={1}
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder={String(employee.basicSalary)}
                className={`${fieldClass} font-mono`}
              />
              <p className={hintClass}>Current: {formatMoney(employee.basicSalary)}</p>
            </div>
          </div>
        )}

        {(kind === 'transfer' || kind === 'revision') && (
          <>
            <div>
              <label className={labelClass}>Effective Date *</label>
              <input
                type="date"
                required
                value={effectiveDate}
                min={employee.joiningDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className={`${fieldClass} font-mono`}
              />
            </div>
            {effectiveDate > today && (
              <Notice>
                Saved to history now; the employee record changes automatically on {effectiveDate}.
              </Notice>
            )}
            {effectiveDate < today && kind === 'transfer' && (
              <Notice>Backdated: days from {effectiveDate} use the new site, shift and department.</Notice>
            )}
          </>
        )}

        {isDuty && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Start Date *</label>
                <input
                  type="date"
                  required
                  value={startDate}
                  min={employee.joiningDate}
                  max={employee.lastWorkingDay}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={`${fieldClass} font-mono`}
                />
              </div>
              <div>
                <label className={labelClass}>End Date</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  max={employee.lastWorkingDay}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={`${fieldClass} font-mono`}
                />
                <p className={hintClass}>Empty = runs until ended.</p>
              </div>
            </div>
            <Notice tone={kind === 'Suspension' ? 'warn' : 'info'}>
              {DUTY_HINT[kind]} Checking in or being marked present ends the period the day before.
            </Notice>
            {(closing.length > 0 || replacing.length > 0) && (
              <Notice tone="warn">
                {closing.map((p) => `The running ${p.type} period (from ${p.startDate}) ends on ${addDaysStr(startDate, -1)}. `)}
                {replacing.length > 0 &&
                  `${replacing.length} period${replacing.length === 1 ? '' : 's'} starting on or after ${startDate} will be replaced.`}
              </Notice>
            )}
          </>
        )}

        {kind === 'exit' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Exit Type *</label>
                <select
                  value={exitType}
                  onChange={(e) => setExitType(e.target.value as ExitType)}
                  className={fieldClass}
                >
                  <option value="Resigned">Resigned</option>
                  <option value="Terminated">Terminated</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Last Working Day *</label>
                <input
                  type="date"
                  required
                  value={lastWorkingDay}
                  min={employee.joiningDate}
                  onChange={(e) => setLastWorkingDay(e.target.value)}
                  className={`${fieldClass} font-mono`}
                />
              </div>
            </div>
            <Notice tone="warn">
              {employee.name} drops off attendance after {lastWorkingDay || 'the last working day'} and becomes
              Inactive the day after. Attendance, payroll and payslips are kept; the last month is paid up to that day.
            </Notice>
          </>
        )}

        <div>
          <label className={labelClass}>{kind === 'exit' ? 'Reason *' : 'Note'}</label>
          <textarea
            rows={2}
            required={kind === 'exit'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={kind === 'exit' ? 'Reason for leaving...' : 'Optional'}
            className={fieldClass}
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors shadow-xs ${
              kind === 'exit' || kind === 'Suspension'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {kind === 'exit' ? 'Record Exit' : isDuty ? `Start ${TITLES[kind]}` : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
