import React, { useMemo, useState } from 'react';
import {
  KeyRound,
  Plus,
  Edit2,
  Trash2,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  ShieldCheck,
  Check,
  Minus,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react';
import { Employee, Role, UserAccount } from '../types';
import { storageService } from '../services/storageService';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import {
  Permission,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_ORDER,
  ROLE_PERMISSIONS,
} from '../utils/permissions';

const inputClass =
  'w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100';
const labelClass = 'block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1';

const ROLE_BADGE: Record<Role, string> = {
  manager: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300',
  attendance_manager: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
  payroll_manager: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
  assistant_manager: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
  employee: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300',
};

/** Rows of the "what each role can do" matrix. */
const CAPABILITIES: { label: string; permission: Permission }[] = [
  { label: 'Company dashboard & analytics', permission: 'analytics.view' },
  { label: 'View employees', permission: 'employees.view' },
  { label: 'Add / edit employees', permission: 'employees.edit' },
  { label: 'View everyone’s attendance', permission: 'attendance.view' },
  { label: 'Mark & edit attendance', permission: 'attendance.mark' },
  { label: 'Approve attendance corrections', permission: 'attendance.approve' },
  { label: 'Enter leave requests for employees', permission: 'leaves.create' },
  { label: 'Approve / reject leave', permission: 'leaves.approve' },
  { label: 'Annual leave records', permission: 'annualLeave.view' },
  { label: 'Change annual leave policy', permission: 'annualLeave.policy' },
  { label: 'Shifts', permission: 'shifts.manage' },
  { label: 'Holidays', permission: 'holidays.manage' },
  { label: 'Process payroll', permission: 'payroll.manage' },
  { label: 'All payslips', permission: 'payslips.view' },
  { label: 'Loans & advances', permission: 'loans.manage' },
  { label: 'Reports', permission: 'reports.view' },
  { label: 'Company settings', permission: 'settings.manage' },
  { label: 'User accounts & roles', permission: 'users.manage' },
];

type FormState = {
  id: string | null; // null = new account
  name: string;
  email: string;
  password: string;
  role: Role;
  employeeId: string;
  designation: string;
  department: string;
};

const emptyForm = (): FormState => ({
  id: null,
  name: '',
  email: '',
  password: '',
  role: 'assistant_manager',
  employeeId: '',
  designation: '',
  department: '',
});

const formatDateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Never';

export const UsersPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { success, error } = useNotification();

  const [accounts, setAccounts] = useState<UserAccount[]>(() => storageService.getUsers());
  const [employees] = useState<Employee[]>(() => storageService.getEmployees());
  const [form, setForm] = useState<FormState | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [deleting, setDeleting] = useState<UserAccount | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');

  const reload = () => setAccounts(storageService.getUsers());

  const activeManagers = accounts.filter((a) => a.role === 'manager' && a.status === 'Active');
  const isLastManager = (a: UserAccount) =>
    a.role === 'manager' && a.status === 'Active' && activeManagers.length <= 1;

  const counts = useMemo(
    () =>
      ROLE_ORDER.reduce(
        (acc, r) => ({ ...acc, [r]: accounts.filter((a) => a.role === r).length }),
        {} as Record<Role, number>
      ),
    [accounts]
  );

  const rows = accounts
    .filter((a) => !roleFilter || a.role === roleFilter)
    .filter((a) => {
      const q = search.trim().toLowerCase();
      return !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
    })
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));

  const openAdd = (role?: Role) => {
    setShowPassword(false);
    setForm({ ...emptyForm(), role: role || 'assistant_manager' });
  };

  const openEdit = (a: UserAccount) => {
    setShowPassword(false);
    setForm({
      id: a.id,
      name: a.name,
      email: a.email,
      password: '',
      role: a.role,
      employeeId: a.employeeId || '',
      designation: a.designation || '',
      department: a.department || '',
    });
  };

  // Linking an employee fills in their details
  const linkEmployee = (employeeId: string) => {
    if (!form) return;
    const emp = employees.find((e) => e.id === employeeId);
    setForm({
      ...form,
      employeeId,
      ...(emp && {
        name: form.name || emp.name,
        email: form.email || emp.email,
        department: emp.department,
        designation: form.designation || emp.designation,
      }),
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const existing = form.id ? accounts.find((a) => a.id === form.id) : undefined;

    if (!name) return error('Name required', 'Enter the person’s name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error('Invalid email', 'Enter a valid email address.');
    if (accounts.some((a) => a.email.toLowerCase() === email && a.id !== form.id))
      return error('Email in use', `Another account already uses ${email}.`);
    if (!existing && form.password.length < 6)
      return error('Password too short', 'Use at least 6 characters.');
    if (existing && form.password && form.password.length < 6)
      return error('Password too short', 'Use at least 6 characters, or leave it blank to keep the current one.');
    if (form.role === 'employee' && !form.employeeId)
      return error('Employee record required', 'Employee accounts must be linked to an employee record.');
    if (form.employeeId && accounts.some((a) => a.employeeId === form.employeeId && a.id !== form.id)) {
      const other = accounts.find((a) => a.employeeId === form.employeeId && a.id !== form.id);
      return error('Already linked', `That employee is already linked to ${other?.email}.`);
    }
    if (existing && existing.id === user?.id && form.role !== existing.role)
      return error('Not allowed', 'You cannot change your own role.');
    if (existing && isLastManager(existing) && form.role !== 'manager')
      return error('Head Manager required', 'Keep at least one active Head Manager.');

    const account: UserAccount = {
      ...(existing || { status: 'Active' as const, createdAt: new Date().toISOString(), createdBy: user?.name }),
      id: existing?.id || `user-${Date.now()}`,
      name,
      email,
      password: form.password || existing?.password || '',
      role: form.role,
      employeeId: form.employeeId || undefined,
      designation: form.designation.trim() || ROLE_LABELS[form.role],
      department: form.department.trim() || undefined,
    };

    const updated = existing
      ? accounts.map((a) => (a.id === account.id ? account : a))
      : [...accounts, account];
    storageService.saveUsers(updated);
    if (account.id === user?.id) refreshUser();
    success(
      existing ? 'Account Updated' : 'Account Created',
      existing
        ? `${name} · ${ROLE_LABELS[account.role]}`
        : `${name} can now sign in as ${ROLE_LABELS[account.role]} with ${email}`
    );
    reload();
    setForm(null);
  };

  const toggleStatus = (a: UserAccount) => {
    if (a.id === user?.id) return error('Not allowed', 'You cannot disable your own account.');
    if (a.status === 'Active' && isLastManager(a))
      return error('Head Manager required', 'Keep at least one active Head Manager.');
    const next: UserAccount['status'] = a.status === 'Active' ? 'Disabled' : 'Active';
    storageService.saveUsers(accounts.map((x) => (x.id === a.id ? { ...x, status: next } : x)));
    success(
      next === 'Active' ? 'Account Enabled' : 'Account Disabled',
      next === 'Active' ? `${a.name} can sign in again.` : `${a.name} can no longer sign in.`
    );
    reload();
  };

  const requestDelete = (a: UserAccount) => {
    if (a.id === user?.id) return error('Not allowed', 'You cannot delete your own account.');
    if (isLastManager(a)) return error('Head Manager required', 'Keep at least one active Head Manager.');
    setDeleting(a);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    storageService.saveUsers(accounts.filter((a) => a.id !== deleting.id));
    success('Account Deleted', `${deleting.name}'s account was removed. Their employee record is unchanged.`);
    reload();
    setDeleting(null);
  };

  const editingSelf = form?.id === user?.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Users & Access
          </h1>
          <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Create sign-in accounts and decide what each person can do
          </p>
        </div>
        <button
          onClick={() => openAdd()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 self-start sm:self-auto transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      {/* Role summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {ROLE_ORDER.map((r) => (
          <button
            key={r}
            onClick={() => setRoleFilter(roleFilter === r ? '' : r)}
            className={`text-left p-4 rounded-xl border shadow-xs transition-all cursor-pointer ${
              roleFilter === r
                ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-white dark:bg-neutral-900'
                : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-indigo-300 dark:hover:border-indigo-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ROLE_BADGE[r]}`}>{ROLE_LABELS[r]}</span>
              <span className="text-lg font-bold font-mono text-neutral-900 dark:text-neutral-100">{counts[r]}</span>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-2 leading-snug">{ROLE_DESCRIPTIONS[r]}</p>
          </button>
        ))}
      </div>

      {/* Permission matrix */}
      <div className="rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <button
          onClick={() => setShowMatrix((v) => !v)}
          className="w-full p-4 flex items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">What each role can do</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Only the Head Manager can approve leave and manage accounts
              </p>
            </div>
          </div>
          {showMatrix ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
        </button>
        {showMatrix && (
          <div className="overflow-x-auto border-t border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500">
                <tr>
                  <th className="py-2.5 px-4 text-left font-semibold">Capability</th>
                  {ROLE_ORDER.map((r) => (
                    <th key={r} className="py-2.5 px-3 text-center font-semibold whitespace-nowrap">
                      {ROLE_LABELS[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {CAPABILITIES.map((c) => (
                  <tr key={c.permission}>
                    <td className="py-2 px-4 text-neutral-700 dark:text-neutral-300">{c.label}</td>
                    {ROLE_ORDER.map((r) => (
                      <td key={r} className="py-2 px-3 text-center">
                        {ROLE_PERMISSIONS[r].includes(c.permission) ? (
                          <Check className="w-4 h-4 text-emerald-600 mx-auto" />
                        ) : (
                          <Minus className="w-3.5 h-3.5 text-neutral-300 dark:text-neutral-600 mx-auto" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="py-2 px-4 text-neutral-700 dark:text-neutral-300">
                    Own attendance, leave requests & payslips
                  </td>
                  {ROLE_ORDER.map((r) => (
                    <td key={r} className="py-2 px-3 text-center">
                      {r === 'employee' ? (
                        <Check className="w-4 h-4 text-emerald-600 mx-auto" />
                      ) : (
                        <Minus className="w-3.5 h-3.5 text-neutral-300 dark:text-neutral-600 mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Accounts */}
      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
        <div className="p-4 flex flex-wrap items-center gap-3 border-b border-neutral-100 dark:border-neutral-800">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email..."
              className={`${inputClass} pl-8`}
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | '')}
            className={`${inputClass} w-auto`}
          >
            <option value="">All roles</option>
            {ROLE_ORDER.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 font-semibold">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Employee record</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Last sign-in</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {rows.map((a) => {
                const emp = employees.find((e) => e.id === a.employeeId);
                const isSelf = a.id === user?.id;
                return (
                  <tr key={a.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                          {a.name[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {a.name}
                            {isSelf && <span className="ml-1.5 text-[10px] text-indigo-600 dark:text-indigo-400">(you)</span>}
                          </p>
                          <p className="text-[11px] text-neutral-400 font-mono">{a.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ROLE_BADGE[a.role]}`}>
                        {ROLE_LABELS[a.role]}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-neutral-600 dark:text-neutral-300">
                      {emp ? (
                        <>
                          {emp.name} <span className="text-[11px] text-neutral-400 font-mono">({emp.id})</span>
                        </>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          a.status === 'Active'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-neutral-500">{formatDateTime(a.lastLoginAt)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(a)}
                          title="Edit account / reset password"
                          className="p-1.5 text-neutral-400 hover:text-indigo-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {!isSelf && (
                          <>
                            <button
                              onClick={() => toggleStatus(a)}
                              title={a.status === 'Active' ? 'Disable sign-in' : 'Enable sign-in'}
                              className="p-1.5 text-neutral-400 hover:text-amber-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                            >
                              {a.status === 'Active' ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => requestDelete(a)}
                              title="Delete account"
                              className="p-1.5 text-neutral-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-neutral-400">
                    No accounts match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / edit account */}
      {form && (
        <Modal
          isOpen
          onClose={() => setForm(null)}
          title={form.id ? `Edit ${form.name || 'account'}` : 'Add User'}
          subtitle={form.id ? 'Change role, details or reset the password' : 'Create a sign-in account and choose its role'}
          maxWidth="lg"
        >
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className={labelClass}>Role *</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ROLE_ORDER.map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={editingSelf && r !== form.role}
                    onClick={() => setForm({ ...form, role: r })}
                    className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      form.role === r
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                        : 'border-neutral-200 dark:border-neutral-700 hover:border-indigo-300'
                    }`}
                  >
                    <p className="text-xs font-bold text-neutral-900 dark:text-neutral-100">{ROLE_LABELS[r]}</p>
                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-snug">{ROLE_DESCRIPTIONS[r]}</p>
                  </button>
                ))}
              </div>
              {editingSelf && (
                <p className="text-[11px] text-neutral-400 mt-1">You cannot change your own role.</p>
              )}
            </div>

            <div>
              <label className={labelClass}>
                Link to employee record {form.role === 'employee' ? '*' : '(optional)'}
              </label>
              <select value={form.employeeId} onChange={(e) => linkEmployee(e.target.value)} className={inputClass}>
                <option value="">— Not linked —</option>
                {employees.map((emp) => {
                  const takenBy = accounts.find((a) => a.employeeId === emp.id && a.id !== form.id);
                  return (
                    <option key={emp.id} value={emp.id} disabled={!!takenBy}>
                      {emp.name} ({emp.id}) · {emp.department}
                      {takenBy ? ' — already has an account' : ''}
                    </option>
                  );
                })}
              </select>
              <p className="text-[11px] text-neutral-400 mt-1">
                Linking fills in the details below and lets the person see their own attendance and leave.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Full name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Email (sign-in) *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div>
                <label className={labelClass}>Designation</label>
                <input
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  placeholder={ROLE_LABELS[form.role]}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Department</label>
                <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className={inputClass} />
              </div>
            </div>

            <div>
              <label className={labelClass}>{form.id ? 'New password (leave blank to keep current)' : 'Password *'}</label>
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  className={`${inputClass} pl-8 pr-9 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs cursor-pointer"
              >
                {form.id ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          isOpen
          onClose={() => setDeleting(null)}
          onConfirm={confirmDelete}
          title="Delete account"
          message={`Delete ${deleting.name}'s account (${deleting.email})? They will no longer be able to sign in. Their employee record, attendance and leave history are kept.`}
          confirmText="Delete"
          isDanger
        />
      )}
    </div>
  );
};
