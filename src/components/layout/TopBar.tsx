import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Search,
  Bell,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  Check,
  CheckCircle2,
  Clock,
  CalendarCheck,
  User,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { DEMO_ACCOUNTS, useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { LeaveRequest, RegularizationRequest } from '../../types';
import { storageService } from '../../services/storageService';
import { useNotification } from '../../context/NotificationContext';

interface TopBarProps {
  currentTab: string;
  onOpenMobile: () => void;
  onNavigateTab: (tab: string) => void;
  pendingLeaves: LeaveRequest[];
  pendingRegularizations: RegularizationRequest[];
  onRefreshData: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentTab,
  onOpenMobile,
  onNavigateTab,
  pendingLeaves,
  pendingRegularizations,
  onRefreshData,
}) => {
  const { user, quickLogin, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useSettings();
  const { success } = useNotification();

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const totalPending = pendingLeaves.length + pendingRegularizations.length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleQuickApproveLeave = (leave: LeaveRequest, e: React.MouseEvent) => {
    e.stopPropagation();
    storageService.updateLeave({
      ...leave,
      status: 'Approved',
      reviewedBy: user?.name || 'Manager',
      reviewedAt: new Date().toISOString(),
      reviewComment: 'Approved via quick notification action.',
    });
    success('Leave Approved', `Approved leave for ${leave.employeeId}`);
    onRefreshData();
  };

  const handleQuickApproveReg = (reg: RegularizationRequest, e: React.MouseEvent) => {
    e.stopPropagation();
    storageService.updateRegularization({
      ...reg,
      status: 'Approved',
      reviewedBy: user?.name || 'Manager',
      reviewedAt: new Date().toISOString(),
      reviewComment: 'Approved attendance regularization.',
    });

    // Also update actual attendance record
    const records = storageService.getAttendance();
    const existing = records.find(
      (r) => r.employeeId === reg.employeeId && r.date === reg.date
    );
    if (existing) {
      storageService.saveOrUpdateAttendanceRecord({
        ...existing,
        checkIn: reg.requestedCheckIn,
        checkOut: reg.requestedCheckOut,
        status: 'Present',
        notes: `Regularized by ${user?.name || 'Manager'}`,
      });
    }

    success('Regularization Approved', `Attendance corrected for ${reg.date}`);
    onRefreshData();
  };

  const tabLabels: Record<string, string> = {
    dashboard: 'Dashboard',
    attendance: 'Attendance Management',
    leaves: 'Leave Management',
    employees: 'Employee Directory',
    payroll: 'Payroll Management',
    payslips: 'Payslips',
    loans: 'Loans & Advances',
    analytics: 'Analytics & Insights',
    shifts: 'Shift Schedules',
    holidays: 'Holidays Calendar',
    reports: 'Reports & Exports',
    settings: 'Company Settings',
  };

  return (
    <header className="h-16 px-4 md:px-6 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between sticky top-0 z-30 transition-colors no-print">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobile}
          className="p-2 md:hidden text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
          aria-label="Open sidebar menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Clean breadcrumb trail */}
        <div className="flex items-center gap-2 text-xs md:text-sm font-medium">
          <span className="text-neutral-400 dark:text-neutral-500">WorkPulse</span>
          <span className="text-neutral-300 dark:text-neutral-600">/</span>
          <span className="text-neutral-900 dark:text-neutral-100 font-semibold truncate">
            {tabLabels[currentTab] || 'Dashboard'}
          </span>
        </div>
      </div>

      {/* Middle: Quick Search (Desktop) */}
      <div className="hidden lg:flex items-center w-72 relative">
        <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search records, employees..."
          className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-100 dark:bg-neutral-800/80 border border-transparent focus:border-indigo-500 dark:focus:border-indigo-500 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-hidden transition-colors"
        />
      </div>

      {/* Right Actions: Dark Mode, Notifications, Demo Role Switcher, Profile */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Dark / Light Mode Toggle Button */}
        <button
          onClick={toggleDarkMode}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100/80 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors cursor-pointer border border-neutral-200 dark:border-neutral-700 shadow-2xs"
          aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {darkMode ? (
            <>
              <Sun className="w-4 h-4 text-amber-500 fill-amber-500/20" />
              <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                Light
              </span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-neutral-700 dark:text-neutral-300" />
              <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                Dark
              </span>
            </>
          )}
        </button>

        {/* Notification Bell with Approvals Counter */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotificationsOpen((prev) => !prev)}
            className="p-2 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors relative cursor-pointer"
            aria-label="Pending Approvals Notifications"
          >
            <Bell className="w-4 h-4" />
            {totalPending > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-[10px] font-bold text-white flex items-center justify-center">
                {totalPending}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 md:w-96 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xl py-2 z-50">
              <div className="px-4 py-2 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    Pending Approvals
                  </h4>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {totalPending} request{totalPending !== 1 ? 's' : ''} awaiting action
                  </p>
                </div>
                <button
                  onClick={() => {
                    onNavigateTab('attendance');
                    setNotificationsOpen(false);
                  }}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                >
                  View All
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
                {totalPending === 0 ? (
                  <div className="py-8 text-center text-xs text-neutral-400">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-70" />
                    All approvals are up to date!
                  </div>
                ) : (
                  <>
                    {/* Pending Leaves */}
                    {pendingLeaves.map((lv) => (
                      <div
                        key={lv.id}
                        className="p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="p-1.5 rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5">
                            <CalendarCheck className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                              {lv.employeeId} · {lv.leaveType} Leave
                            </p>
                            <p className="text-neutral-500 dark:text-neutral-400 text-[11px]">
                              {lv.fromDate} to {lv.toDate} ({lv.daysCount}d)
                            </p>
                            <p className="text-neutral-600 dark:text-neutral-300 italic text-[11px] mt-0.5 line-clamp-1">
                              &ldquo;{lv.reason}&rdquo;
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleQuickApproveLeave(lv, e)}
                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-medium shrink-0 flex items-center gap-1 shadow-xs"
                        >
                          <Check className="w-3 h-3" /> Approve
                        </button>
                      </div>
                    ))}

                    {/* Pending Regularizations */}
                    {pendingRegularizations.map((reg) => (
                      <div
                        key={reg.id}
                        className="p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                            <Clock className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                              {reg.employeeId} · Attendance Correction
                            </p>
                            <p className="text-neutral-500 dark:text-neutral-400 text-[11px]">
                              {reg.date}: {reg.requestedCheckIn} – {reg.requestedCheckOut}
                            </p>
                            <p className="text-neutral-600 dark:text-neutral-300 italic text-[11px] mt-0.5 line-clamp-1">
                              &ldquo;{reg.reason}&rdquo;
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleQuickApproveReg(reg, e)}
                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-medium shrink-0 flex items-center gap-1 shadow-xs"
                        >
                          <Check className="w-3 h-3" /> Approve
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile Menu with Quick Role Switcher */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((prev) => !prev)}
            className="flex items-center gap-2 p-1.5 md:px-2.5 md:py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center">
              {user?.name ? user.name[0] : 'U'}
            </div>
            <div className="hidden sm:block text-left">
              <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 block leading-tight">
                {user?.name || 'Account'}
              </span>
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400 capitalize">
                {user?.role === 'admin'
                  ? 'Admin'
                  : user?.role === 'hr'
                  ? 'HR Manager'
                  : 'Employee'}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xl py-2 z-50">
              <div className="px-4 py-2 border-b border-neutral-100 dark:border-neutral-800">
                <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  {user?.name}
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate font-mono">
                  {user?.email}
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 uppercase">
                    {user?.role}
                  </span>
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {user?.department}
                  </span>
                </div>
              </div>

              {/* Quick Role Switcher section */}
              <div className="p-2 border-b border-neutral-100 dark:border-neutral-800">
                <p className="px-2 pb-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                  Switch Demo Account
                </p>
                <div className="space-y-1">
                  {DEMO_ACCOUNTS.map((acc) => {
                    const isSelected = user?.role === acc.role;
                    return (
                      <button
                        key={acc.role}
                        onClick={() => {
                          quickLogin(acc.role);
                          setProfileOpen(false);
                          success(`Switched to ${acc.name}`, `Now acting as ${acc.designation}`);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                            : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                        }`}
                      >
                        <div className="text-left">
                          <p className="font-semibold leading-tight">{acc.name}</p>
                          <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                            {acc.designation}
                          </p>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Logout button */}
              <div className="pt-1 px-2">
                <button
                  onClick={() => {
                    logout();
                    setProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
