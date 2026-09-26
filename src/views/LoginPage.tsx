import React, { useState } from 'react';
import {
  ShieldCheck,
  UserCheck,
  User,
  ArrowRight,
  Building2,
  Lock,
  Mail,
  Wallet,
  ClipboardList,
} from 'lucide-react';
import { getDemoAccounts, useAuth } from '../context/AuthContext';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../utils/permissions';
import { useNotification } from '../context/NotificationContext';
import { Role } from '../types';

const ROLE_ICONS: Record<Role, React.ElementType> = {
  manager: ShieldCheck,
  attendance_manager: ClipboardList,
  payroll_manager: Wallet,
  assistant_manager: UserCheck,
  employee: User,
};

export const LoginPage: React.FC = () => {
  const { login, quickLogin } = useAuth();
  const { error, success } = useNotification();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [demoAccounts] = useState(getDemoAccounts);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      error('Missing credentials', 'Please enter both email and password.');
      return;
    }
    const result = login(email, password);
    if (result.ok) {
      success('Welcome back', 'Signed in successfully.');
    } else if (result.reason === 'disabled') {
      error('Account disabled', 'This account has been disabled. Contact your manager.');
    } else {
      error('Invalid credentials', 'Check your email and password.');
    }
  };

  const handleQuickLogin = (accountId: string, role: Role) => {
    quickLogin(accountId);
    success('Quick Login Activated', `Signed in as demo ${ROLE_LABELS[role]}.`);
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-neutral-50 dark:bg-neutral-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Ambient background glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -right-40 w-96 h-96 rounded-full bg-blue-500/10 dark:bg-blue-500/15 blur-3xl pointer-events-none" />

      <div className="relative z-10 sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Logo */}
        <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white mx-auto shadow-md shadow-indigo-600/20">
          <Building2 className="w-7 h-7" />
        </div>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100">
          WorkPulse
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Attendance & Payroll Management System
        </p>
      </div>

      <div className="relative z-10 mt-8 sm:mx-auto sm:w-full sm:max-w-xl px-4">
        {/* Quick Demo Login Cards */}
        {demoAccounts.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                Quick Demo Access
              </span>
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                One-click sign-in for each role
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {demoAccounts.map((acc) => {
                const Icon = ROLE_ICONS[acc.role];
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => handleQuickLogin(acc.id, acc.role)}
                    className={`flex items-center gap-3 text-left p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-sm transition-all group cursor-pointer ${
                      acc.role === 'manager' ? 'sm:col-span-2' : ''
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 shrink-0">
                      <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                        {ROLE_LABELS[acc.role]}
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate font-mono">
                        {acc.email}
                      </p>
                      <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5 leading-snug">
                        {ROLE_DESCRIPTIONS[acc.role]}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-neutral-300 dark:text-neutral-600 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Credentials Form */}
        <div className="bg-white dark:bg-neutral-900 py-6 px-6 sm:px-8 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@workpulse.com"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:border-indigo-500 dark:focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:border-indigo-500 dark:focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-lg transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              Sign In to WorkPulse
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
