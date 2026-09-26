import React, { useState } from 'react';
import { Badge } from '../common/Badge';
import {
  AccrualMonthStatus,
  AnnualLeaveSummary,
  EmployeeLeaveRecord,
  MONTH_NAMES,
  formatService,
} from '../../utils/annualLeaveEngine';

export const fmt = (n: number) => String(Math.round(n * 100) / 100);

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return `${n}${s}`;
};

const statusStyles: Record<AccrualMonthStatus, { label: string; cls: string }> = {
  credited: {
    label: 'Credited',
    cls: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
  },
  accruing: {
    label: 'In progress',
    cls: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
  },
  upcoming: {
    label: 'Upcoming',
    cls: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400',
  },
  'not-joined': {
    label: 'Not joined',
    cls: 'bg-neutral-50 dark:bg-neutral-900 text-neutral-400 dark:text-neutral-500',
  },
};

const thClass = 'py-2 pr-3 font-semibold';
const theadRow =
  'text-left text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-800';
const bodyRow =
  'border-b border-neutral-100 dark:border-neutral-800/60 text-neutral-800 dark:text-neutral-200';

export const MonthlyBreakdown: React.FC<{ summary: AnnualLeaveSummary }> = ({ summary }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs">
      <thead>
        <tr className={theadRow}>
          <th className={thClass}>Month</th>
          <th className={thClass}>Status</th>
          <th className={`${thClass} text-right`}>Credited</th>
          <th className={`${thClass} text-right`}>Used</th>
          <th className={`${thClass} text-right`}>Pending</th>
          <th className="py-2 font-semibold text-right">Balance</th>
        </tr>
      </thead>
      <tbody>
        {summary.carriedForward !== 0 && (
          <tr className={`${bodyRow} text-neutral-500`}>
            <td className="py-2 pr-3" colSpan={5}>
              Carried forward from {summary.year - 1}
            </td>
            <td className="py-2 text-right font-mono">{fmt(summary.carriedForward)}</td>
          </tr>
        )}
        {summary.months.map((m) => {
          const st = statusStyles[m.status];
          return (
            <tr key={m.month} className={bodyRow}>
              <td className="py-2 pr-3 font-medium">
                {MONTH_NAMES[m.month]} {summary.year}
                {m.joinedOnDay && (
                  <span className="block text-[10px] font-normal text-neutral-400">
                    joined on the {ordinal(m.joinedOnDay)} · prorated
                  </span>
                )}
              </td>
              <td className="py-2 pr-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${st.cls}`}>
                  {st.label}
                </span>
              </td>
              <td className="py-2 pr-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                {m.earned ? (
                  `+${fmt(m.earned)}`
                ) : m.entitlement ? (
                  <span className="text-neutral-400">({fmt(m.entitlement)})</span>
                ) : (
                  '—'
                )}
              </td>
              <td className="py-2 pr-3 text-right font-mono text-rose-600 dark:text-rose-400">
                {m.used ? `−${fmt(m.used)}` : '—'}
              </td>
              <td className="py-2 pr-3 text-right font-mono text-amber-600 dark:text-amber-400">
                {m.pending ? fmt(m.pending) : '—'}
              </td>
              <td className="py-2 text-right font-mono font-semibold">{fmt(m.runningBalance)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
    <p className="text-[11px] text-neutral-400 mt-3">
      Values in brackets are what an upcoming month will credit. Leave is counted against the month it
      starts in.
    </p>
  </div>
);

const YearHistory: React.FC<{ record: EmployeeLeaveRecord }> = ({ record }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs">
      <thead>
        <tr className={theadRow}>
          <th className={thClass}>Year</th>
          <th className={`${thClass} text-right`}>Brought in</th>
          <th className={`${thClass} text-right`}>Earned</th>
          <th className={`${thClass} text-right`}>Taken</th>
          <th className={`${thClass} text-right`}>Balance</th>
          <th className={`${thClass} text-right`}>Carried out</th>
          <th className="py-2 font-semibold text-right">Lapsed</th>
        </tr>
      </thead>
      <tbody>
        {record.years.map((y) => (
          <tr key={y.year} className={bodyRow}>
            <td className="py-2 pr-3 font-medium">
              {y.year}
              {y.isCurrent && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                  Current
                </span>
              )}
            </td>
            <td className="py-2 pr-3 text-right font-mono">{fmt(y.carriedIn)}</td>
            <td className="py-2 pr-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
              +{fmt(y.earned)}
            </td>
            <td className="py-2 pr-3 text-right font-mono text-rose-600 dark:text-rose-400">
              {y.used ? `−${fmt(y.used)}` : '—'}
            </td>
            <td className="py-2 pr-3 text-right font-mono font-semibold">{fmt(y.closing)}</td>
            <td className="py-2 pr-3 text-right font-mono">{y.isCurrent ? '—' : fmt(y.carriedOut)}</td>
            <td className="py-2 text-right font-mono text-neutral-400">
              {y.lapsed ? fmt(y.lapsed) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const LeaveHistory: React.FC<{ record: EmployeeLeaveRecord }> = ({ record }) =>
  record.annualLeaves.length === 0 ? (
    <p className="text-xs text-neutral-400 py-4 text-center">No annual leave taken yet.</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className={theadRow}>
            <th className={thClass}>From</th>
            <th className={thClass}>To</th>
            <th className={`${thClass} text-right`}>Days</th>
            <th className={thClass}>Reason</th>
            <th className="py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {record.annualLeaves.map((l) => (
            <tr key={l.id} className={bodyRow}>
              <td className="py-2 pr-3 font-mono">{l.fromDate}</td>
              <td className="py-2 pr-3 font-mono">{l.toDate}</td>
              <td className="py-2 pr-3 text-right font-mono">{fmt(l.daysCount)}</td>
              <td className="py-2 pr-3 text-neutral-500 max-w-[220px] truncate" title={l.reason}>
                {l.reason}
              </td>
              <td className="py-2">
                <Badge status={l.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

/** Full annual-leave record: service, lifetime totals, year history, this year's months, leave list. */
export const LeaveRecordView: React.FC<{ record: EmployeeLeaveRecord; joiningDate: string }> = ({
  record,
  joiningDate,
}) => {
  const [tab, setTab] = useState<'months' | 'years' | 'leaves'>('months');

  const tiles: [string, string, string][] = [
    ['Months worked', String(record.serviceMonths), `${formatService(record.serviceMonths)} since ${joiningDate}`],
    ['Earned since joining', fmt(record.totalEarned), `${record.earnedMonths} months credited`],
    ['Taken since joining', fmt(record.totalUsed), 'Approved annual leave'],
    ['Lapsed', fmt(record.totalLapsed), 'Lost over carry-forward limit'],
    ['Available now', fmt(record.available), record.pending ? `${fmt(record.pending)} pending approval` : `Balance ${fmt(record.balance)}`],
  ];

  const tabs: [typeof tab, string][] = [
    ['months', `${record.current.year} by month`],
    ['years', 'Year by year'],
    ['leaves', `Leaves taken (${record.annualLeaves.length})`],
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {tiles.map(([label, value, hint], i) => (
          <div
            key={label}
            className={`p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 ${i === tiles.length - 1 ? 'ring-1 ring-indigo-200 dark:ring-indigo-900' : ''}`}
          >
            <div className="text-[11px] text-neutral-500">{label}</div>
            <div
              className={`text-lg font-bold font-mono ${i === tiles.length - 1 ? 'text-indigo-600 dark:text-indigo-400' : 'text-neutral-900 dark:text-neutral-100'}`}
            >
              {value}
            </div>
            <div className="text-[10px] text-neutral-400 leading-tight mt-0.5">{hint}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 border-b border-neutral-200 dark:border-neutral-800 pb-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              tab === id
                ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'months' && <MonthlyBreakdown summary={record.current} />}
      {tab === 'years' && <YearHistory record={record} />}
      {tab === 'leaves' && <LeaveHistory record={record} />}
    </div>
  );
};
