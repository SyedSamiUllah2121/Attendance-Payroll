import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { DutyPeriod, EmployeeHistoryEntry, EmployeeHistoryValues, Shift } from '../../types';
import { Badge } from '../common/Badge';
import { useSettings } from '../../context/SettingsContext';
import { isPeriodRunning } from '../../services/employeeActionsService';
import { storageService } from '../../services/storageService';
import { siteNameOf } from '../../utils/sites';
import { todayStr } from '../../utils/dateUtils';

const FIELD_LABEL: Record<keyof EmployeeHistoryValues, string> = {
  department: 'Department',
  designation: 'Designation',
  shiftId: 'Shift',
  siteId: 'Site',
  basicSalary: 'Basic salary',
  status: 'Status',
  lastWorkingDay: 'Last working day',
  exitType: 'Exit',
  exitReason: 'Reason',
};

const TYPE_STYLE: Record<EmployeeHistoryEntry['type'], string> = {
  Transfer: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
  Promotion: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
  'Salary Revision': 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300',
  'Status Change': 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300',
  Exit: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300',
};

interface Props {
  history: EmployeeHistoryEntry[];
  periods: DutyPeriod[];
  shifts: Shift[];
}

/** Profile "History" tab (read-only): every recorded change, newest first, plus duty periods. Changes are made in Edit Employee. */
export const EmployeeHistoryView: React.FC<Props> = ({ history, periods, shifts }) => {
  const { formatMoney } = useSettings();
  const today = todayStr();
  const [sites] = useState(() => storageService.getSites());

  const formatValue = (key: keyof EmployeeHistoryValues, value: unknown) => {
    if (value === undefined || value === null || value === '') return '—';
    if (key === 'shiftId') return shifts.find((s) => s.id === value)?.name || String(value);
    if (key === 'siteId') return siteNameOf(sites, String(value)) || String(value);
    if (key === 'basicSalary') return formatMoney(Number(value));
    return String(value);
  };

  const rows = [...history].sort(
    (a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt)
  );
  const sortedPeriods = [...periods].sort((a, b) => b.startDate.localeCompare(a.startDate));

  const periodState = (p: DutyPeriod) =>
    p.startDate > today ? 'Scheduled' : isPeriodRunning(p, today) ? 'Running' : 'Ended';

  return (
    <div className="space-y-5 text-xs">
      {/* Duty periods */}
      <div>
        <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Field Duty / WFH / Suspension</h4>
        {sortedPeriods.length === 0 ? (
          <p className="text-neutral-400 py-3 text-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
            No duty periods recorded.
          </p>
        ) : (
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500">
                <tr>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Period</th>
                  <th className="py-2 px-3">Note</th>
                  <th className="py-2 px-3">State</th>

                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {sortedPeriods.map((p) => {
                  const state = periodState(p);
                  return (
                    <tr key={p.id}>
                      <td className="py-2 px-3">
                        <Badge status={p.type} />
                      </td>
                      <td className="py-2 px-3 font-mono text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                        {p.startDate} → {p.endDate || 'ongoing'}
                      </td>
                      <td className="py-2 px-3 text-neutral-500">
                        {p.note || '—'}
                        <span className="block text-[10px] text-neutral-400">
                          by {p.createdBy}
                          {p.endedBy && p.endDate ? ` · ended by ${p.endedBy}` : ''}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            state === 'Running'
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : state === 'Scheduled'
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                          }`}
                        >
                          {state}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Change history */}
      <div>
        <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Change history</h4>
        {rows.length === 0 ? (
          <p className="text-neutral-400 py-3 text-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
            No changes recorded yet. Transfers, promotions, salary revisions and exits appear here.
          </p>
        ) : (
          <ol className="space-y-2">
            {rows.map((h) => {
              const keys = (Object.keys(h.newValue) as (keyof EmployeeHistoryValues)[]).filter(
                (k) => !(h.type === 'Exit' && k === 'exitReason')
              );
              return (
                <li key={h.id} className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${TYPE_STYLE[h.type]}`}>
                        {h.type}
                      </span>
                      <span className="font-mono text-neutral-700 dark:text-neutral-300">{h.effectiveDate}</span>
                      {!h.appliedAt && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                          Scheduled
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-neutral-400">
                      by {h.createdBy} · {new Date(h.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {keys.map((k) => (
                      <div key={k} className="flex flex-wrap items-center gap-1.5">
                        <span className="text-neutral-400 w-28 shrink-0">{FIELD_LABEL[k]}</span>
                        <span className="text-neutral-500 line-through decoration-neutral-300 dark:decoration-neutral-600">
                          {formatValue(k, h.oldValue[k])}
                        </span>
                        <ArrowRight className="w-3 h-3 text-neutral-400" />
                        <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                          {formatValue(k, h.newValue[k])}
                        </span>
                      </div>
                    ))}
                  </div>
                  {h.note && <p className="mt-1.5 text-neutral-500 italic">&ldquo;{h.note}&rdquo;</p>}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
};
