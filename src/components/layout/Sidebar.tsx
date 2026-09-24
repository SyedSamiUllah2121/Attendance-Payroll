import React from 'react';
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  CreditCard,
  FileText,
  BarChart3,
  Sliders,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  CalendarCheck,
  Building2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  pendingApprovalsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  pendingApprovalsCount,
}) => {
  const { user, isAdmin, isHR } = useAuth();
  const { settings } = useSettings();

  const handleNavClick = (tab: string) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  // Define navigation items based on role
  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      roles: ['admin', 'hr', 'employee'],
    },
    {
      id: 'attendance',
      label: 'Attendance',
      icon: Clock,
      badge: pendingApprovalsCount > 0 && isHR ? pendingApprovalsCount : undefined,
      roles: ['admin', 'hr', 'employee'],
    },
    {
      id: 'leaves',
      label: 'Leave Management',
      icon: CalendarCheck,
      roles: ['admin', 'hr', 'employee'],
    },
    {
      id: 'employees',
      label: 'Employees',
      icon: Users,
      roles: ['admin', 'hr'],
    },
    {
      id: 'payroll',
      label: 'Payroll',
      icon: CreditCard,
      roles: ['admin', 'hr'],
    },
    {
      id: 'payslips',
      label: isHR ? 'All Payslips' : 'My Payslips',
      icon: FileText,
      roles: ['admin', 'hr', 'employee'],
    },
    {
      id: 'loans',
      label: 'Loans & Advances',
      icon: DollarSign,
      roles: ['admin', 'hr'],
    },
    {
      id: 'analytics',
      label: isHR ? 'Analytics' : 'My Analytics',
      icon: BarChart3,
      roles: ['admin', 'hr', 'employee'],
    },
    {
      id: 'shifts',
      label: 'Shifts',
      icon: Clock,
      roles: ['admin', 'hr'],
    },
    {
      id: 'holidays',
      label: 'Holidays',
      icon: CalendarDays,
      roles: ['admin', 'hr', 'employee'],
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: FileText,
      roles: ['admin', 'hr'],
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Sliders,
      roles: ['admin'],
    },
  ];

  const visibleItems = navItems.filter((item) =>
    user ? item.roles.includes(user.role) : false
  );

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-neutral-900/50 backdrop-blur-xs md:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 transition-all duration-300 ${
          collapsed ? 'w-20' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* Floating Collapse / Expand Edge Button */}
        <button
          onClick={onToggleCollapse}
          className="hidden md:flex absolute -right-3 top-5 z-50 w-6 h-6 rounded-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white shadow-xs hover:shadow-sm items-center justify-center transition-all hover:scale-110 cursor-pointer"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        {/* Brand header */}
        {collapsed ? (
          <div className="h-16 flex items-center justify-center border-b border-neutral-200 dark:border-neutral-800 px-2">
            <button
              onClick={onToggleCollapse}
              className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center text-white font-bold shrink-0 shadow-xs transition-transform hover:scale-105 cursor-pointer"
              title="WorkPulse - Click to expand sidebar"
              aria-label="Expand sidebar"
            >
              <Building2 className="w-5 h-5 text-white" />
            </button>
          </div>
        ) : (
          <div className="h-16 flex items-center justify-between px-4 border-b border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-3 overflow-hidden min-w-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shrink-0 shadow-xs">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <span className="text-base font-bold tracking-tight text-neutral-900 dark:text-neutral-100 truncate block">
                  {settings.company.logoText || 'WorkPulse'}
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 block truncate">
                  HR &amp; Payroll Suite
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation list */}
        <nav className={`flex-1 overflow-y-auto space-y-1.5 ${collapsed ? 'px-2 py-4' : 'px-3 py-4'}`}>
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center rounded-xl text-sm font-medium transition-all group relative cursor-pointer ${
                  collapsed ? 'justify-center h-11 w-11 mx-auto' : 'gap-3 px-3 py-2.5'
                } ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-semibold shadow-2xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100/80 dark:hover:bg-neutral-800/60'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 transition-colors ${
                    isActive
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200'
                  }`}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {item.badge && !collapsed && (
                  <span className="ml-auto px-1.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500 text-white">
                    {item.badge}
                  </span>
                )}
                {item.badge && collapsed && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-neutral-900" />
                )}
              </button>
            );
          })}
        </nav>

        {/* User Role Card at bottom */}
        <div className={`border-t border-neutral-200 dark:border-neutral-800 ${collapsed ? 'p-2' : 'p-3'}`}>
          <div
            className={`flex items-center rounded-xl bg-neutral-50 dark:bg-neutral-800/60 ${
              collapsed ? 'justify-center p-1.5' : 'gap-3 p-2'
            }`}
          >
            <div
              className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-semibold text-neutral-700 dark:text-neutral-300 shrink-0"
              title={collapsed ? `${user?.name || 'User'} (${user?.role})` : undefined}
            >
              {user?.name
                ? user.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase()
                : 'U'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                  {user?.name || 'User'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {isAdmin ? (
                    <ShieldCheck className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                  ) : (
                    <UserCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                    {user?.role === 'admin'
                      ? 'Admin'
                      : user?.role === 'hr'
                      ? 'HR Manager'
                      : 'Employee'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
