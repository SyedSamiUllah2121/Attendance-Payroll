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
  X,
} from 'lucide-react';
import { getDemoAccounts, useAuth } from '../../context/AuthContext';
import { ROLE_LABELS } from '../../utils/permissions';
import { useSettings } from '../../context/SettingsContext';
import { LeaveRequest, RegularizationRequest } from '../../types';
import { storageService } from '../../services/storageService';
import { reviewLeave, reviewRegularization } from '../../services/approvalService';
import { formatTime12 } from '../common/TimeInput';
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
  const { user, quickLogin, logout, can } = useAuth();
  const { darkMode, toggleDarkMode } = useSettings();
  const { success } = useNotification();

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Only show requests this account is allowed to approve.
  const visibleLeaves = can('leaves.approve') ? pendingLeaves : [];
  const visibleRegs = can('attendance.approve') ? pendingRegularizations : [];
  const totalPending = visibleLeaves.length + visibleRegs.length;
  const demoAccounts = profileOpen ? getDemoAccounts() : [];

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

  // Names for the approval list (loaded when the dropdown opens)
  const employees = notificationsOpen ? storageService.getEmployees() : [];
  const empById = (id: string) => employees.find((e) => e.id === id);

  const formatDay = (dateStr: string) =>
    new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const reviewer = user?.name || 'Manager';

  const handleLeave = (leave: LeaveRequest, action: 'Approved' | 'Rejected', e: React.MouseEvent) => {
    e.stopPropagation();
    reviewLeave(leave, action, reviewer);
    const name = empById(leave.employeeId)?.name || leave.employeeId;
    success(`Leave ${action}`, `${name}'s ${leave.leaveType.toLowerCase()} leave was ${action.toLowerCase()}.`);
    onRefreshData();
  };

  const handleReg = (reg: RegularizationRequest, action: 'Approved' | 'Rejected', e: React.MouseEvent) => {
    e.stopPropagation();
    reviewRegularization(reg, action, reviewer);
    const name = empById(reg.employeeId)?.name || reg.employeeId;
    success(`Correction ${action}`, `${name}'s attendance for ${formatDay(reg.date)} was ${action.toLowerCase()}.`);
    onRefreshData();
  };

  const openPage = (page: string, attendanceView?: string) => {
    if (attendanceView) {
      try {
        sessionStorage.setItem('workpulse_attendance_view', attendanceView);
      } catch {
        // ignore: the page just opens on its default tab
      }
      // If the page is already open, tell it to switch tabs
      window.dispatchEvent(new CustomEvent('workpulse:attendance-view', { detail: attendanceView }));
    }
    setNotificationsOpen(false);
    onNavigateTab(page);
  };

  const tabLabels: Record<string, string> = {
    dashboard: 'Dashboard',
    attendance: 'Attendance Management',
    leaves: 'Leave Management',
    users: 'Users & Access',
    'annual-leave': 'Annual Leave',
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

  // On every page change: start at the top and name the browser tab after the page
  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.title = `${tabLabels[currentTab] || 'Dashboard'} · WorkPulse`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab]);

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
            className={`relative p-2 rounded-lg transition-colors cursor-pointer ${
              notificationsOpen
                ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
            aria-label={`Pending approvals${totalPending ? `: ${totalPending}` : ''}`}
            title="Pending approvals"
          >
            <Bell className="w-[18px] h-[18px]" />
            {totalPending > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[10px] font-bold leading-none text-white flex items-center justify-center ring-2 ring-white dark:ring-neutral-900 pointer-events-none">
                {totalPending > 99 ? '99+' : totalPending}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-[min(400px,calc(100vw-2rem))] origin-top-right animate-pop bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
                <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Pending Approvals
                </h4>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {totalPending === 0
                    ? 'Nothing waiting for you'
                    : `${totalPending} request${totalPending !== 1 ? 's' : ''} awaiting your decision`}
                </p>
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {totalPending === 0 ? (
                  <div className="py-10 text-center text-xs text-neutral-400">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-70" />
                    All approvals are up to date!
                  </div>
                ) : (
                  <>
                    {visibleLeaves.length > 0 && (
                      <section>
                        <div className="sticky top-0 z-10 px-4 py-2 bg-neutral-50 dark:bg-neutral-800/90 backdrop-blur flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                            Leave requests · {visibleLeaves.length}
                          </span>
                          <button
                            onClick={() => openPage('leaves')}
                            className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            Open Leave Management
                          </button>
                        </div>
                        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                          {visibleLeaves.map((lv) => {
                            const emp = empById(lv.employeeId);
                            return (
                              <li key={lv.id} className="px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                                <div className="flex items-start gap-3">
                                  <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 text-xs font-bold flex items-center justify-center shrink-0">
                                    {(emp?.name || lv.employeeId)[0]}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                                      {emp?.name || lv.employeeId}
                                      <span className="font-normal text-neutral-400"> · {emp?.department || lv.employeeId}</span>
                                    </p>
                                    <p className="text-[11px] text-neutral-600 dark:text-neutral-300 mt-0.5">
                                      <span className="font-medium">{lv.leaveType} leave</span> ·{' '}
                                      {formatDay(lv.fromDate)}
                                      {lv.toDate !== lv.fromDate && ` – ${formatDay(lv.toDate)}`} ·{' '}
                                      {lv.daysCount} day{lv.daysCount === 1 ? '' : 's'}
                                    </p>
                                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 italic mt-0.5 line-clamp-1">
                                      &ldquo;{lv.reason}&rdquo;
                                    </p>
                                    {lv.enteredBy && (
                                      <p className="text-[10px] text-sky-600 dark:text-sky-400 mt-0.5">
                                        Entered by {lv.enteredBy}
                                        {lv.requestSource && lv.requestSource !== 'Self' ? ` · via ${lv.requestSource}` : ''}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-1.5 mt-2">
                                      <button
                                        onClick={(e) => handleLeave(lv, 'Approved', e)}
                                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                      >
                                        <Check className="w-3 h-3" /> Approve
                                      </button>
                                      <button
                                        onClick={(e) => handleLeave(lv, 'Rejected', e)}
                                        className="px-2.5 py-1 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-rose-300 hover:text-rose-600 rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                      >
                                        <X className="w-3 h-3" /> Reject
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    )}

                    {visibleRegs.length > 0 && (
                      <section>
                        <div className="sticky top-0 z-10 px-4 py-2 bg-neutral-50 dark:bg-neutral-800/90 backdrop-blur flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                            Attendance corrections · {visibleRegs.length}
                          </span>
                          <button
                            onClick={() => openPage('attendance', 'regularizations')}
                            className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            Open Corrections
                          </button>
                        </div>
                        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                          {visibleRegs.map((reg) => {
                            const emp = empById(reg.employeeId);
                            return (
                              <li key={reg.id} className="px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                                <div className="flex items-start gap-3">
                                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center justify-center shrink-0">
                                    {(emp?.name || reg.employeeId)[0]}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                                      {emp?.name || reg.employeeId}
                                      <span className="font-normal text-neutral-400"> · {emp?.department || reg.employeeId}</span>
                                    </p>
                                    <p className="text-[11px] text-neutral-600 dark:text-neutral-300 mt-0.5">
                                      <span className="font-medium">{formatDay(reg.date)}</span> · change to{' '}
                                      <span className="font-mono">
                                        {formatTime12(reg.requestedCheckIn.slice(0, 5))} – {formatTime12(reg.requestedCheckOut.slice(0, 5))}
                                      </span>
                                    </p>
                                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 italic mt-0.5 line-clamp-1">
                                      &ldquo;{reg.reason}&rdquo;
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-2">
                                      <button
                                        onClick={(e) => handleReg(reg, 'Approved', e)}
                                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                      >
                                        <Check className="w-3 h-3" /> Approve
                                      </button>
                                      <button
                                        onClick={(e) => handleReg(reg, 'Rejected', e)}
                                        className="px-2.5 py-1 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-rose-300 hover:text-rose-600 rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                      >
                                        <X className="w-3 h-3" /> Reject
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    )}
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
                {user ? ROLE_LABELS[user.role] : ''}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-72 origin-top-right animate-pop bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xl py-2 z-50">
              <div className="px-4 py-2 border-b border-neutral-100 dark:border-neutral-800">
                <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  {user?.name}
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate font-mono">
                  {user?.email}
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 uppercase">
                    {user ? ROLE_LABELS[user.role] : ''}
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
                  {demoAccounts.map((acc) => {
                    const isSelected = user?.id === acc.id;
                    return (
                      <button
                        key={acc.id}
                        onClick={() => {
                          quickLogin(acc.id);
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
                            {ROLE_LABELS[acc.role]}
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
