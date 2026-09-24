import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { LeaveRequest, RegularizationRequest } from '../../types';
import { storageService } from '../../services/storageService';

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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const [leaves, setLeaves] = useState<LeaveRequest[]>(() =>
    propLeaves || storageService.getLeaves().filter((l) => l.status === 'Pending')
  );
  const [regs, setRegs] = useState<RegularizationRequest[]>(() =>
    propRegs || storageService.getRegularizations().filter((r) => r.status === 'Pending')
  );

  const activeTab = currentPage || currentTab || 'dashboard';
  const handleNav = (tab: string) => {
    if (onNavigate) onNavigate(tab);
    else if (onSelectTab) onSelectTab(tab);
  };

  const handleRefresh = () => {
    setLeaves(storageService.getLeaves().filter((l) => l.status === 'Pending'));
    setRegs(storageService.getRegularizations().filter((r) => r.status === 'Pending'));
    if (propRefresh) propRefresh();
  };

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
        pendingApprovalsCount={leaves.length + regs.length}
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

        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
