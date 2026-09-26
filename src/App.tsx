import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { NotificationProvider } from './context/NotificationContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './views/LoginPage';
import { DashboardPage } from './views/DashboardPage';
import { EmployeesPage } from './views/EmployeesPage';
import { AttendancePage } from './views/AttendancePage';
import { LeavesPage } from './views/LeavesPage';
import { AnnualLeavePage } from './views/AnnualLeavePage';
import { PayrollPage } from './views/PayrollPage';
import { PayslipsPage } from './views/PayslipsPage';
import { LoansPage } from './views/LoansPage';
import { AnalyticsPage } from './views/AnalyticsPage';
import { ShiftsPage } from './views/ShiftsPage';
import { HolidaysPage } from './views/HolidaysPage';
import { ReportsPage } from './views/ReportsPage';
import { SettingsPage } from './views/SettingsPage';
import { UsersPage } from './views/UsersPage';

/** Login comes first. Keyed by user id so every sign-in / account switch starts on the Dashboard. */
const AppContent: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated || !user) return <LoginPage />;
  return <SignedInApp key={user.id} />;
};

const SignedInApp: React.FC = () => {
  const { canOpen } = useAuth();
  const [currentPage, setCurrentPage] = useState<string>('dashboard');

  // Parameters for Payslip drill-down
  const [payslipEmployeeId, setPayslipEmployeeId] = useState<string | undefined>();
  const [payslipMonth, setPayslipMonth] = useState<string | undefined>();

  // Fall back to the dashboard if this account may not open the selected page
  const page = canOpen(currentPage) ? currentPage : 'dashboard';

  const handleOpenPayslip = (employeeId: string, month?: string) => {
    setPayslipEmployeeId(employeeId);
    setPayslipMonth(month);
    setCurrentPage('payslips');
  };

  return (
    <AppLayout currentPage={page} onNavigate={setCurrentPage}>
      {/* Keyed by page so the entrance animation replays on every page change */}
      <div key={page} className="wp-page">
        {page === 'dashboard' && (
          <DashboardPage onNavigate={setCurrentPage} onOpenPayslip={handleOpenPayslip} />
        )}
        {page === 'employees' && <EmployeesPage />}
        {page === 'attendance' && <AttendancePage />}
        {page === 'leaves' && <LeavesPage />}
        {page === 'annual-leave' && <AnnualLeavePage />}
        {page === 'payroll' && <PayrollPage onOpenPayslip={handleOpenPayslip} />}
        {page === 'payslips' && (
          <PayslipsPage
            initialEmployeeId={payslipEmployeeId}
            initialMonth={payslipMonth}
          />
        )}
        {page === 'loans' && <LoansPage />}
        {page === 'analytics' && <AnalyticsPage />}
        {page === 'shifts' && <ShiftsPage />}
        {page === 'holidays' && <HolidaysPage />}
        {page === 'reports' && <ReportsPage />}
        {page === 'users' && <UsersPage />}
        {page === 'settings' && <SettingsPage />}
      </div>
    </AppLayout>
  );
};

export default function App() {
  return (
    <SettingsProvider>
      <NotificationProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </NotificationProvider>
    </SettingsProvider>
  );
}
