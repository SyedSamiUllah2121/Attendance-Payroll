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
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  CalendarCheck,
} from 'lucide-react';
import { getDemoAccounts, useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Role } from '../types';
import { ROLE_LABELS } from '../utils/permissions';
import { FitToScreen } from '../components/common/FitToScreen';

const ROLE_ICONS: Record<Role, React.ElementType> = {
  manager: ShieldCheck,
  attendance_manager: ClipboardList,
  payroll_manager: Wallet,
  assistant_manager: UserCheck,
  employee: User,
};

/**
 * Right-hand illustration: a composed "product shot" of the system (attendance donut,
 * clock-in card, payroll figure, leave notification) drawn with HTML/SVG so it stays crisp,
 * follows the theme and needs no external image.
 */
const ProductShowcase: React.FC = () => {
  const present = 92;
  const circumference = 2 * Math.PI * 34;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-l-[2rem] bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800">
      {/* Background texture */}
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-violet-400/30 blur-3xl" />
      <div className="absolute -bottom-32 -left-20 w-[28rem] h-[28rem] rounded-full bg-sky-400/20 blur-3xl" />

      <FitToScreen className="relative z-10 h-full" innerClassName="p-8 xl:p-10 flex flex-col justify-between gap-6">
      {/* Headline */}
      <div className="relative z-10 max-w-md animate-fade-up">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[11px] font-semibold text-indigo-100 backdrop-blur">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Attendance · Leave · Payroll
        </span>
        <h2 className="mt-4 text-2xl xl:text-3xl 2xl:text-4xl font-bold leading-tight text-white tracking-tight">
          Your whole workforce, in one calm dashboard.
        </h2>
        <p className="mt-3 text-sm text-indigo-100/80 leading-relaxed">
          Mark attendance in seconds, track leave as it's earned, and run payroll with confidence.
        </p>
      </div>

      {/* Floating product cards */}
      <div className="relative z-10 h-[380px]">
        {/* Attendance donut */}
        <div className="absolute left-0 top-4 w-64 rounded-2xl bg-white/95 dark:bg-neutral-900/95 p-5 shadow-2xl shadow-indigo-950/40 animate-float">
          <p className="text-xs font-semibold text-neutral-500">Today's attendance</p>
          <div className="mt-3 flex items-center gap-4">
            <div className="relative w-20 h-20 shrink-0">
              <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
                <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="9" className="text-neutral-100 dark:text-neutral-800" />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="#4F46E5"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - present / 100)}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-neutral-900 dark:text-white">
                {present}%
              </span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              {[
                ['Present', '11', 'bg-emerald-500'],
                ['Late', '1', 'bg-amber-500'],
                ['On leave', '0', 'bg-sky-500'],
              ].map(([label, n, dot]) => (
                <div key={label} className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                  <span className={`w-2 h-2 rounded-full ${dot}`} />
                  <span className="w-14">{label}</span>
                  <span className="font-bold text-neutral-900 dark:text-white">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Clock-in card */}
        <div
          className="absolute right-0 top-0 w-56 rounded-2xl bg-white/95 dark:bg-neutral-900/95 p-4 shadow-2xl shadow-indigo-950/40 animate-float"
          style={{ animationDelay: '-2s' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white text-xs font-bold flex items-center justify-center">
              AK
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-900 dark:text-white">Ali Khan</p>
              <p className="text-[10px] text-neutral-500">Engineering</p>
            </div>
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-[10px] text-neutral-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Checked in
              </p>
              <p className="text-xl font-bold font-mono text-neutral-900 dark:text-white">08:56 AM</p>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
              On time
            </span>
          </div>
        </div>

        {/* Payroll card */}
        <div
          className="absolute right-6 bottom-6 w-64 rounded-2xl bg-white/95 dark:bg-neutral-900/95 p-5 shadow-2xl shadow-indigo-950/40 animate-float"
          style={{ animationDelay: '-4s' }}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-neutral-500">Payroll · this month</p>
            <Wallet className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="mt-1 text-2xl font-bold font-mono text-neutral-900 dark:text-white">Rs. 1.70M</p>
          <div className="mt-3 flex items-end gap-1.5 h-12">
            {[45, 60, 52, 70, 64, 82].map((h, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t-md ${i === 5 ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-900'}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        {/* Leave approved notification */}
        <div
          className="absolute left-8 bottom-0 w-60 rounded-xl bg-white/95 dark:bg-neutral-900/95 p-3 shadow-2xl shadow-indigo-950/40 flex items-center gap-3 animate-float"
          style={{ animationDelay: '-3s' }}
        >
          <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600">
            <CalendarCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">Leave approved</p>
            <p className="text-[10px] text-neutral-500 truncate">Sara Ahmed · 3 days annual leave</p>
          </div>
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 ml-auto" />
        </div>
      </div>

      {/* Footer stats */}
      <div className="relative z-10 grid grid-cols-3 gap-4 border-t border-white/15 pt-5">
        {[
          ['5 roles', 'Access control'],
          ['2.5 days', 'Leave per month'],
          ['1 click', 'Daily attendance'],
        ].map(([value, label]) => (
          <div key={label}>
            <p className="text-lg font-bold text-white">{value}</p>
            <p className="text-[11px] text-indigo-100/70">{label}</p>
          </div>
        ))}
      </div>
      </FitToScreen>
    </div>
  );
};

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { success } = useNotification();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [remember, setRemember] = useState(false);
  const [demoAccounts] = useState(getDemoAccounts);

  const signInWith = (id: string, pw: string) => {
    setFormError('');
    if (!id.trim() || !pw) {
      setFormError('Enter your email or username and your password.');
      return;
    }
    setSubmitting(true);
    // Brief pause so the button's loading state is visible rather than flickering
    setTimeout(() => {
      const result = login(id, pw, remember);
      setSubmitting(false);
      if (result.ok) {
        success('Welcome back', 'Signed in successfully.');
      } else if (result.reason === 'disabled') {
        setFormError('This account has been disabled. Contact your manager.');
      } else {
        setFormError('That email/username and password don’t match an account.');
      }
    }, 450);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    signInWith(identifier, password);
  };

  // Test accounts sign in through the normal username/password check (fields are filled in visibly)
  const handleTestAccount = (email: string, pw: string) => {
    setIdentifier(email);
    setPassword(pw);
    signInWith(email, pw);
  };

  const fieldClass =
    'w-full h-11 pl-10 pr-3 text-sm bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 transition-shadow focus:outline-hidden focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15';

  return (
    <div className="min-h-screen lg:h-dvh lg:overflow-hidden bg-white dark:bg-neutral-950 grid lg:grid-cols-2">
      {/* Sign-in form */}
      <FitToScreen className="lg:h-dvh" innerClassName="flex flex-col px-6 sm:px-12 py-6">
        <div className="flex items-center gap-2.5 animate-fade-up">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-base font-bold tracking-tight text-neutral-900 dark:text-neutral-100 leading-tight">
              WorkPulse
            </p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">HR &amp; Payroll Suite</p>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center py-6">
          <div className="w-full max-w-sm">
            <div className="animate-fade-up" style={{ animationDelay: '60ms' }}>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                Welcome back
              </h1>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                Sign in to manage attendance, leave and payroll.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-3.5 animate-fade-up" style={{ animationDelay: '120ms' }} noValidate>
              <div>
                <label htmlFor="login-id" className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Email or username
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-id"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="you@company.com"
                    className={fieldClass}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className={`${fieldClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded accent-indigo-600"
                />
                Keep me signed in on this device
              </label>

              {formError && (
                <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs animate-fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-sm font-semibold shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-80 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
                  </>
                ) : (
                  <>
                    Sign in <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {demoAccounts.length > 0 && (
              <div className="mt-6 animate-fade-up" style={{ animationDelay: '180ms' }}>
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                  <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                    Test accounts · password 123
                  </span>
                  <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {demoAccounts.map((acc) => {
                    const Icon = ROLE_ICONS[acc.role];
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        disabled={submitting}
                        onClick={() => handleTestAccount(acc.email, acc.password)}
                        title={`Sign in as ${acc.email} / ${acc.password}`}
                        className={`group flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-left hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 transition-colors cursor-pointer ${
                          acc.role === 'manager' ? 'col-span-2' : ''
                        }`}
                      >
                        <Icon className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200 truncate">
                            {ROLE_LABELS[acc.role]}
                          </span>
                          <span className="block text-[10px] font-mono text-neutral-400 truncate">{acc.email}</span>
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 ml-auto text-neutral-300 group-hover:text-indigo-500 transition-colors shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-[11px] text-neutral-400">© {new Date().getFullYear()} WorkPulse · Attendance &amp; Payroll Management</p>
      </FitToScreen>

      {/* Illustration (large screens) */}
      <div className="hidden lg:block h-dvh">
        <ProductShowcase />
      </div>
    </div>
  );
};
