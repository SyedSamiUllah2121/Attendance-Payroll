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
import { PayrollPage } from './views/PayrollPage';
import { PayslipsPage } from './views/PayslipsPage';
import { LoansPage } from './views/LoansPage';
import { AnalyticsPage } from './views/AnalyticsPage';
import { ShiftsPage } from './views/ShiftsPage';
import { HolidaysPage } from './views/HolidaysPage';
import { ReportsPage } from './views/ReportsPage';
import { SettingsPage } from './views/SettingsPage';

const AppContent: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const [currentPage, setCurrentPage] = useState<string>('dashboard');

  // Parameters for Payslip drill-down
  const [payslipEmployeeId, setPayslipEmployeeId] = useState<string | undefined>();
  const [payslipMonth, setPayslipMonth] = useState<string | undefined>();

  if (!isAuthenticated || !user) {
    return <LoginPage />;
  }

  const handleOpenPayslip = (employeeId: string, month?: string) => {
    setPayslipEmployeeId(employeeId);
    setPayslipMonth(month);
    setCurrentPage('payslips');
  };

  return (
    <AppLayout currentPage={currentPage} onNavigate={setCurrentPage}>
      {currentPage === 'dashboard' && (
        <DashboardPage onNavigate={setCurrentPage} onOpenPayslip={handleOpenPayslip} />
      )}
      {currentPage === 'employees' && <EmployeesPage />}
      {currentPage === 'attendance' && <AttendancePage />}
      {currentPage === 'leaves' && <LeavesPage />}
      {currentPage === 'payroll' && <PayrollPage onOpenPayslip={handleOpenPayslip} />}
      {currentPage === 'payslips' && (
        <PayslipsPage
          initialEmployeeId={payslipEmployeeId}
          initialMonth={payslipMonth}
        />
      )}
      {currentPage === 'loans' && <LoansPage />}
      {currentPage === 'analytics' && <AnalyticsPage />}
      {currentPage === 'shifts' && <ShiftsPage />}
      {currentPage === 'holidays' && <HolidaysPage />}
      {currentPage === 'reports' && <ReportsPage />}
      {currentPage === 'settings' && <SettingsPage />}
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
