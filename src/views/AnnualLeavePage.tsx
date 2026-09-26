import React, { useMemo, useState } from 'react';
import {
  CalendarRange,
  Search,
  Settings2,
  Save,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  CheckCircle2,
  Hourglass,
  Wallet,
  Download,
} from 'lucide-react';
import { AnnualLeavePolicy, Employee, LeaveRequest } from '../types';
import { storageService } from '../services/storageService';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import { Modal } from '../components/common/Modal';
import {
  AnnualLeaveSummary,
  EmployeeLeaveRecord,
  MONTH_NAMES,
  computeAnnualLeave,
  computeLeaveRecord,
  formatService,
  getAnnualLeavePolicy,
} from '../utils/annualLeaveEngine';
import { LeaveRecordView, fmt } from '../components/leave/LeaveRecordView';
import { AnimatedNumber } from '../components/common/AnimatedNumber';

const inputClass =
  'w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100';

const cardClass =
  'rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs';

const StatCard: React.FC<{
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
  accent: string;
}> = ({ label, value, hint, icon: Icon, accent }) => (
  <div className={`${cardClass} p-4`}>
    <div className="flex items-center justify-between">
      <span className="text-xs text-neutral-400 font-medium">{label}</span>
      <Icon className={`w-4 h-4 ${accent}`} />
    </div>
    <div className={`text-2xl font-bold font-mono mt-1 ${accent}`}>
      {/^-?d+(.d+)?$/.test(value) ? <AnimatedNumber value={Number(value)} /> : value}
    </div>
    <p className="text-[11px] text-neutral-400 mt-1">{hint}</p>
  </div>
);

const PolicyEditor: React.FC<{
  policy: AnnualLeavePolicy;
  canEdit: boolean;
  onSave: (p: AnnualLeavePolicy) => void;
}> = ({ policy, canEdit, onSave }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AnnualLeavePolicy>(policy);
  const [bulk, setBulk] = useState('2.5');

  const total = draft.monthlyDays.reduce((a, d) => a + (Number(d) || 0), 0);
  const savedTotal = policy.monthlyDays.reduce((a, d) => a + d, 0);

  const setMonth = (i: number, v: string) => {
    const monthlyDays = [...draft.monthlyDays];
    monthlyDays[i] = Math.max(0, Number(v) || 0);
    setDraft({ ...draft, monthlyDays });
  };

  return (
    <div className={cardClass}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full p-4 flex items-center justify-between gap-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
            <Settings2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              Accrual Policy
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {savedTotal} days per year · credited at the {policy.creditTiming} of each month ·
              carry forward up to {policy.maxCarryForward} days
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-neutral-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-neutral-400" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5 border-t border-neutral-200 dark:border-neutral-800 pt-4">
          <div>
            <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Days credited per month
              </label>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">Set all months to</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={bulk}
                    onChange={(e) => setBulk(e.target.value)}
                    className={`${inputClass} w-16`}
                  />
                  <button
                    onClick={() =>
                      setDraft({
                        ...draft,
                        monthlyDays: Array(12).fill(Math.max(0, Number(bulk) || 0)),
                      })
                    }
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {MONTH_NAMES.map((name, i) => (
                <div key={name}>
                  <span className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                    {name}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    disabled={!canEdit}
                    value={draft.monthlyDays[i]}
                    onChange={(e) => setMonth(i, e.target.value)}
                    className={`${inputClass} font-mono disabled:opacity-70`}
                  />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-neutral-400 mt-2">
              Leave starts on the joining date: the joining month is prorated by the days left in it
              (e.g. joined on the 20th of a 30-day month = 11/30 of that month&apos;s days).
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Yearly total: <span className="font-bold font-mono">{fmt(total)}</span> days
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                When is a month credited?
              </label>
              <select
                disabled={!canEdit}
                value={draft.creditTiming}
                onChange={(e) =>
                  setDraft({ ...draft, creditTiming: e.target.value as 'start' | 'end' })
                }
                className={`${inputClass} disabled:opacity-70`}
              >
                <option value="end">After the month is completed</option>
                <option value="start">At the start of the month</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Max days carried to next year
              </label>
              <input
                type="number"
                min={0}
                disabled={!canEdit}
                value={draft.maxCarryForward}
                onChange={(e) =>
                  setDraft({ ...draft, maxCarryForward: Math.max(0, Number(e.target.value) || 0) })
                }
                className={`${inputClass} font-mono disabled:opacity-70`}
              />
              <p className="text-[11px] text-neutral-400 mt-1">0 = unused balance resets on Jan 1</p>
            </div>
          </div>

          {canEdit ? (
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDraft(policy)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
              >
                Reset
              </button>
              <button
                onClick={() => onSave(draft)}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" /> Save Policy
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-neutral-400">Only administrators can change the policy.</p>
          )}
        </div>
      )}
    </div>
  );
};

export const AnnualLeavePage: React.FC = () => {
  const { user, can } = useAuth();
  const { settings, updateSettings } = useSettings();
  const { success } = useNotification();

  const [employees] = useState<Employee[]>(() => storageService.getEmployees());
  const [leaves] = useState<LeaveRequest[]>(() => storageService.getLeaves());

  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Active' | 'Inactive' | ''>('Active');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const policy = getAnnualLeavePolicy(settings);

  const summaries = useMemo(() => {
    const map = new Map<string, AnnualLeaveSummary>();
    employees.forEach((e) => {
      if (Number(e.joiningDate.slice(0, 4)) <= year) {
        map.set(e.id, computeAnnualLeave(e, leaves, policy, year, today));
      }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, leaves, settings, year, today]);

  // Lifetime records (as of today), independent of the selected year.
  const records = useMemo(() => {
    const map = new Map<string, EmployeeLeaveRecord>();
    employees.forEach((e) => map.set(e.id, computeLeaveRecord(e, leaves, policy, today)));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, leaves, settings, today]);

  const yearOptions = [currentYear + 1, currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

  const handleSavePolicy = (p: AnnualLeavePolicy) => {
    updateSettings({ ...settings, annualLeavePolicy: p });
    success('Policy Saved', 'Annual leave balances have been recalculated.');
  };

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          Annual Leave
        </h1>
        <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
          Leave earned month by month · {fmt(policy.monthlyDays.reduce((a, d) => a + d, 0))} days
          for a full year of service
        </p>
      </div>
      <select
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        className="px-3 py-1.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 self-start sm:self-auto"
      >
        {yearOptions.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );

  // Employee view: only their own balance.
  if (!can('annualLeave.view')) {
    const me = employees.find((e) => e.id === user?.employeeId);
    const s = me ? summaries.get(me.id) : undefined;
    const rec = me ? records.get(me.id) : undefined;
    return (
      <div className="space-y-6">
        {header}
        {!s ? (
          <div className={`${cardClass} p-6 text-sm text-neutral-500`}>
            No annual leave record for {year}.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Available now" value={fmt(s.available)} hint="Balance minus pending requests" icon={Wallet} accent="text-indigo-600 dark:text-indigo-400" />
              <StatCard label="Earned this year" value={fmt(s.accrued)} hint={s.carriedForward ? `+${fmt(s.carriedForward)} carried forward` : `of ${fmt(s.yearEntitlement)} for ${year}`} icon={TrendingUp} accent="text-emerald-600 dark:text-emerald-400" />
              <StatCard label="Used" value={fmt(s.used)} hint="Approved annual leave" icon={CheckCircle2} accent="text-rose-600 dark:text-rose-400" />
              <StatCard label="Pending" value={fmt(s.pending)} hint="Awaiting approval" icon={Hourglass} accent="text-amber-600 dark:text-amber-400" />
            </div>
            {rec && me && (
              <div className={`${cardClass} p-4`}>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 mb-3">
                  My leave record
                </h3>
                <LeaveRecordView record={rec} joiningDate={me.joiningDate} />
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  const departments = Array.from(new Set(employees.map((e) => e.department))).sort();
  const rows = employees
    .filter((e) => summaries.has(e.id))
    .filter((e) => !statusFilter || e.status === statusFilter)
    .filter((e) => !dept || e.department === dept)
    .filter((e) => {
      const q = search.trim().toLowerCase();
      return !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q);
    });

  const totals = rows.reduce(
    (acc, e) => {
      const s = summaries.get(e.id)!;
      acc.accrued += s.accrued;
      acc.used += s.used;
      acc.pending += s.pending;
      acc.available += s.available;
      return acc;
    },
    { accrued: 0, used: 0, pending: 0, available: 0 }
  );

  const exportCsv = () => {
    const header = [
      'Employee ID', 'Name', 'Department', 'Status', 'Joining Date', 'Months Worked',
      `Carried into ${year}`, `Earned ${year}`, `Used ${year}`, `Pending ${year}`, `Available ${year}`,
      'Earned Since Joining', 'Taken Since Joining', 'Lapsed Since Joining',
    ];
    const lines = rows.map((e) => {
      const s = summaries.get(e.id)!;
      const r = records.get(e.id)!;
      return [
        e.id, e.name, e.department, e.status, e.joiningDate, r.serviceMonths,
        s.carriedForward, s.accrued, s.used, s.pending, s.available,
        r.totalEarned, r.totalUsed, r.totalLapsed,
      ];
    });
    const csv = [header, ...lines]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `annual-leave-records-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    success('Export Ready', `Downloaded records for ${rows.length} employees.`);
  };

  const selectedEmp = selectedId ? employees.find((e) => e.id === selectedId) : undefined;
  const selectedRecord = selectedId ? records.get(selectedId) : undefined;

  return (
    <div className="space-y-6">
      {header}

      <PolicyEditor
        key={JSON.stringify(policy)}
        policy={policy}
        canEdit={can('annualLeave.policy')}
        onSave={handleSavePolicy}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total earned" value={fmt(totals.accrued)} hint={`${rows.length} employees in ${year}`} icon={TrendingUp} accent="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Total used" value={fmt(totals.used)} hint="Approved annual leave" icon={CheckCircle2} accent="text-rose-600 dark:text-rose-400" />
        <StatCard label="Pending" value={fmt(totals.pending)} hint="Awaiting approval" icon={Hourglass} accent="text-amber-600 dark:text-amber-400" />
        <StatCard label="Available" value={fmt(totals.available)} hint="Unused days across team" icon={Wallet} accent="text-indigo-600 dark:text-indigo-400" />
      </div>

      <div className={`${cardClass} p-4 flex flex-wrap items-center gap-3`}>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee name or ID..."
            className={`${inputClass} pl-8`}
          />
        </div>
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          className={`${inputClass} w-auto`}
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'Active' | 'Inactive' | '')}
          className={`${inputClass} w-auto`}
        >
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="">All Statuses</option>
        </select>
        <button
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      <div className={`${cardClass} overflow-x-auto`}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-800/30">
              <th className="px-4 py-3 font-semibold">Employee</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
              <th className="px-4 py-3 font-semibold text-right">Months worked</th>
              <th className="px-4 py-3 font-semibold text-right">Carried</th>
              <th className="px-4 py-3 font-semibold text-right">Earned</th>
              <th className="px-4 py-3 font-semibold text-right">Used</th>
              <th className="px-4 py-3 font-semibold text-right">Pending</th>
              <th className="px-4 py-3 font-semibold text-right">Available</th>
              <th className="px-4 py-3 font-semibold">Year progress</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-neutral-400">
                  No employees match the filters.
                </td>
              </tr>
            ) : (
              rows.map((e) => {
                const s = summaries.get(e.id)!;
                const r = records.get(e.id)!;
                const pct = s.yearEntitlement ? Math.min(100, ((s.carriedForward + s.accrued) / s.yearEntitlement) * 100) : 0;
                return (
                  <tr
                    key={e.id}
                    onClick={() => setSelectedId(e.id)}
                    className="border-b border-neutral-100 dark:border-neutral-800/60 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 cursor-pointer text-neutral-800 dark:text-neutral-200"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold">{e.name}</div>
                      <div className="text-[11px] text-neutral-400">
                        {e.id} · {e.department}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono">{e.joiningDate}</div>
                      {e.status === 'Inactive' && (
                        <div className="text-[11px] text-rose-500">Inactive</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-mono font-bold">{r.serviceMonths}</div>
                      <div className="text-[11px] text-neutral-400">{formatService(r.serviceMonths)}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(s.carriedForward)}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {fmt(s.accrued)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-rose-600 dark:text-rose-400">
                      {fmt(s.used)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-amber-600 dark:text-amber-400">
                      {fmt(s.pending)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${s.available < 0 ? 'text-rose-600' : 'text-indigo-600 dark:text-indigo-400'}`}>
                      {fmt(s.available)}
                    </td>
                    <td className="px-4 py-3 min-w-[140px]">
                      <div className="w-full h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-1 font-mono">
                        {fmt(s.carriedForward + s.accrued)} / {fmt(s.yearEntitlement)} days
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedEmp && selectedRecord && (
        <Modal
          isOpen
          onClose={() => setSelectedId(null)}
          title={`${selectedEmp.name} · Leave Record`}
          subtitle={`${selectedEmp.id} · ${selectedEmp.designation} · ${selectedEmp.department}`}
          maxWidth="3xl"
        >
          <LeaveRecordView record={selectedRecord} joiningDate={selectedEmp.joiningDate} />
        </Modal>
      )}

      <p className="text-[11px] text-neutral-400 flex items-center gap-1.5">
        <CalendarRange className="w-3.5 h-3.5" /> Click an employee to open their full leave record
        (months worked, year-by-year history, and every leave taken).
      </p>
    </div>
  );
};
