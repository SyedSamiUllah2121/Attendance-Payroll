import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { LeaveRequest, RegularizationRequest } from '../../types';
import { storageService } from '../../services/storageService';
import { useAuth } from '../../context/AuthContext';

/** Fired after the bell approves / rejects something, so the open page can reload its data. */
export const DATA_CHANGED_EVENT = 'workpulse:data-changed';

const readPendingLeaves = () => storageService.getLeaves().filter((l) => l.status === 'Pending');
const readPendingRegs = () => storageService.getRegularizations().filter((r) => r.status === 'Pending');
const pendingKey = (items: { id: string }[]) => items.map((i) => i.id).join('|');

interface AppLayoutProps {
  currentTab?: string;
  currentPage?: string;
  onSelectTab?: (tab: string) => void;
  onNavigate?: (page: string) => void;
  pendingLeaves?: LeaveRequest[];
  pendingRegularizations?: RegularizationRequest[];
  onRefreshData?: () => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentTab,
  currentPage,
  onSelectTab,
  onNavigate,
  pendingLeaves: propLeaves,
  pendingRegularizations: propRegs,
  onRefreshData: propRefresh,
  children,
}) => {
  const { can } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const [leaves, setLeaves] = useState<LeaveRequest[]>(() =>
    propLeaves || readPendingLeaves()
  );
  const [regs, setRegs] = useState<RegularizationRequest[]>(() =>
    propRegs || readPendingRegs()
  );

  const activeTab = currentPage || currentTab || 'dashboard';
  const handleNav = (tab: string) => {
    if (onNavigate) onNavigate(tab);
    else if (onSelectTab) onSelectTab(tab);
  };

  // Re-read the pending lists, only updating state when they actually changed.
  const syncPending = () => {
    if (!propLeaves) {
      const next = readPendingLeaves();
      setLeaves((prev) => (pendingKey(prev) === pendingKey(next) ? prev : next));
    }
    if (!propRegs) {
      const next = readPendingRegs();
      setRegs((prev) => (pendingKey(prev) === pendingKey(next) ? prev : next));
    }
  };

  const handleRefresh = () => {
    syncPending();
    if (propRefresh) propRefresh();
    // Let the open page (e.g. the dashboard's approvals widget) pick up the change.
    window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
  };

  // Pages approve / submit requests without telling the layout, so keep the bell and
  // sidebar badges in step: on page change, on other tabs' writes, and on a light poll.
  useEffect(() => {
    syncPending();
    const onStorage = () => syncPending();
    window.addEventListener('storage', onStorage);
    const timer = window.setInterval(syncPending, 2000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (propLeaves) setLeaves(propLeaves);
  }, [propLeaves]);

  useEffect(() => {
    if (propRegs) setRegs(propRegs);
  }, [propRegs]);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col antialiased">
      <Sidebar
        currentTab={activeTab}
        onSelectTab={handleNav}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        pendingLeavesCount={can('leaves.approve') ? leaves.length : 0}
        pendingRegularizationsCount={can('attendance.approve') ? regs.length : 0}
      />

      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          collapsed ? 'md:ml-20' : 'md:ml-64'
        }`}
      >
        <TopBar
          currentTab={activeTab}
          onOpenMobile={() => setMobileOpen(true)}
          onNavigateTab={handleNav}
          pendingLeaves={leaves}
          pendingRegularizations={regs}
          onRefreshData={handleRefresh}
        />

        <main
          className={`flex-1 p-4 md:p-6 lg:p-8 w-full mx-auto ${
            // The attendance register's month grid uses the full width, both sides.
            activeTab === 'attendance' ? 'max-w-none' : 'max-w-7xl'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
};
