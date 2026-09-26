import React, { useState } from 'react';
import {
  Settings,
  Building,
  Clock,
  Calendar,
  CreditCard,
  RotateCcw,
  Download,
  Upload,
  Save,
  Moon,
  Sun,
  ShieldAlert,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import { storageService } from '../services/storageService';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { AppSettings } from '../types';

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, darkMode, toggleDarkMode, refreshSettings } = useSettings();
  const { success, error, info } = useNotification();

  const [formData, setFormData] = useState<AppSettings>(() => ({
    ...settings,
    company: {
      ...settings.company,
      phone: settings.company.phone || '+92 21 35870091',
      email: settings.company.email || 'hr@workpulse.com',
      taxNumber: settings.company.taxNumber || '7412985-3',
    },
    attendance: {
      ...settings.attendance,
      graceMinutes: settings.attendance.graceMinutes ?? settings.attendance.defaultGracePeriod ?? 15,
      overtimeMultiplier: settings.attendance.overtimeMultiplier ?? settings.attendance.otMultiplier ?? 1.5,
      latePenaltyEnabled: settings.attendance.latePenaltyEnabled ?? true,
    },
    payroll: {
      ...settings.payroll,
      providentFundRate: settings.payroll.providentFundRate ?? settings.payroll.providentFundPercentage ?? 0.05,
      socialSecurityRate: settings.payroll.socialSecurityRate ?? 0.01,
    },
    leaveQuotas: {
      Annual: settings.leaveQuotas?.Annual ?? 30,
      Sick: settings.leaveQuotas?.Sick ?? 10,
      Casual: settings.leaveQuotas?.Casual ?? 8,
      Unpaid: settings.leaveQuotas?.Unpaid ?? 30,
    },
  }));

  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'company' | 'attendance' | 'leaves' | 'payroll' | 'backup'>('company');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(formData);
    success('Settings Updated', 'Company configurations have been saved successfully.');
  };

  const handleExportBackup = () => {
    const backup = {
      timestamp: new Date().toISOString(),
      employees: storageService.getEmployees(),
      shifts: storageService.getShifts(),
      attendance: storageService.getAttendance(),
      leaves: storageService.getLeaves(),
      payrolls: storageService.getPayrolls(),
      loans: storageService.getLoans(),
      regularizations: storageService.getRegularizations(),
      holidays: storageService.getHolidays(),
      settings: storageService.getSettings(),
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WorkPulse_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    success('Backup Exported', 'Full database snapshot downloaded.');
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.employees && json.attendance) {
          localStorage.setItem('workpulse_employees', JSON.stringify(json.employees));
          localStorage.setItem('workpulse_attendance', JSON.stringify(json.attendance));
          if (json.shifts) localStorage.setItem('workpulse_shifts', JSON.stringify(json.shifts));
          if (json.leaves) localStorage.setItem('workpulse_leaves', JSON.stringify(json.leaves));
          if (json.payrolls) localStorage.setItem('workpulse_payrolls', JSON.stringify(json.payrolls));
          if (json.loans) localStorage.setItem('workpulse_loans', JSON.stringify(json.loans));
          if (json.settings) localStorage.setItem('workpulse_settings', JSON.stringify(json.settings));
          success('Backup Restored', 'Reloading system state...');
          setTimeout(() => window.location.reload(), 1000);
        } else {
          error('Invalid File', 'Provided JSON does not match WorkPulse schema.');
        }
      } catch (err) {
        error('Parse Error', 'Failed to read JSON backup file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            System & Organization Settings
          </h1>
          <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Configure shift rules, tax rates, leave quotas, and database backups
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleDarkMode}
            className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            title="Toggle Theme"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto gap-4">
        {[
          { id: 'company', label: 'Company Info', icon: Building },
          { id: 'attendance', label: 'Attendance Rules', icon: Clock },
          { id: 'leaves', label: 'Leave Policy', icon: Calendar },
          { id: 'payroll', label: 'Payroll & Tax', icon: CreditCard },
          { id: 'backup', label: 'Data & Backup', icon: RotateCcw },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Tab 1: Company Profile */}
        {activeTab === 'company' && (
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              Organization Profile
            </h3>
            <p className="text-xs text-neutral-500">
              Details shown on system headers, reports, and generated payslips
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Company Legal Name
                </label>
                <input
                  type="text"
                  value={formData.company.name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      company: { ...formData.company, name: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Corporate Email
                </label>
                <input
                  type="email"
                  value={formData.company.email || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      company: { ...formData.company, email: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Company Phone
                </label>
                <input
                  type="text"
                  value={formData.company.phone || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      company: { ...formData.company, phone: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Tax Identification Number (NTN)
                </label>
                <input
                  type="text"
                  value={formData.company.taxNumber || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      company: { ...formData.company, taxNumber: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Registered Office Address
                </label>
                <input
                  type="text"
                  value={formData.company.address}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      company: { ...formData.company, address: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Operational Currency Code
                </label>
                <input
                  type="text"
                  value={formData.company.currency}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      company: { ...formData.company, currency: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Attendance Rules */}
        {activeTab === 'attendance' && (
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              Attendance & Shift Rules
            </h3>
            <p className="text-xs text-neutral-500">
              Grace periods, half-day hour requirements, and overtime multipliers
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Arrival Grace Period (Minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={formData.attendance.graceMinutes ?? formData.attendance.defaultGracePeriod ?? 15}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setFormData({
                      ...formData,
                      attendance: {
                        ...formData.attendance,
                        graceMinutes: val,
                        defaultGracePeriod: val,
                      },
                    });
                  }}
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
                <span className="text-[11px] text-neutral-400 mt-1 block">
                  Arrivals after this offset mark the employee as &ldquo;Late&rdquo;.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Half-Day Threshold (Hours)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="2"
                  max="6"
                  value={formData.attendance.halfDayThresholdHours}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      attendance: {
                        ...formData.attendance,
                        halfDayThresholdHours: parseFloat(e.target.value) || 4,
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
                <span className="text-[11px] text-neutral-400 mt-1 block">
                  Minimum worked hours to be credited a Half-Day rather than Absent.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Overtime Pay Multiplier
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="3"
                  value={formData.attendance.overtimeMultiplier ?? formData.attendance.otMultiplier ?? 1.5}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 1.5;
                    setFormData({
                      ...formData,
                      attendance: {
                        ...formData.attendance,
                        overtimeMultiplier: val,
                        otMultiplier: val,
                      },
                    });
                  }}
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
                <span className="text-[11px] text-neutral-400 mt-1 block">
                  Standard Pakistani labor law overtime rate is 1.5x to 2.0x normal hourly wage.
                </span>
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="latePenaltyRule"
                  checked={formData.attendance.latePenaltyEnabled ?? true}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      attendance: {
                        ...formData.attendance,
                        latePenaltyEnabled: e.target.checked,
                      },
                    })
                  }
                  className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label
                  htmlFor="latePenaltyRule"
                  className="text-xs font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer"
                >
                  Enable 3 Late Marks = 0.5 Day Loss of Pay (LOP) Rule
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Leave Policy */}
        {activeTab === 'leaves' && (
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              Annual Leave Entitlements
            </h3>
            <p className="text-xs text-neutral-500">
              Annual quotas allocated to each employee on contract inception
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Annual Paid Leave (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={formData.leaveQuotas?.Annual ?? 30}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setFormData({
                      ...formData,
                      leaveQuotas: {
                        ...formData.leaveQuotas,
                        Annual: val,
                      },
                    });
                  }}
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Sick Leave (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={formData.leaveQuotas?.Sick ?? 10}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setFormData({
                      ...formData,
                      leaveQuotas: {
                        ...formData.leaveQuotas,
                        Sick: val,
                      },
                    });
                  }}
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Casual Leave (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  max="15"
                  value={formData.leaveQuotas?.Casual ?? 8}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setFormData({
                      ...formData,
                      leaveQuotas: {
                        ...formData.leaveQuotas,
                        Casual: val,
                      },
                    });
                  }}
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Payroll & Taxes */}
        {activeTab === 'payroll' && (
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              Statutory Contributions & Fixed Allowances
            </h3>
            <p className="text-xs text-neutral-500">
              Provident fund deductions, EOBI social security, and standard conveyance
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Fixed Conveyance Allowance ({formData.company.currency})
                </label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={formData.payroll.conveyanceFixed}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      payroll: {
                        ...formData.payroll,
                        conveyanceFixed: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Provident Fund Rate (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="15"
                  value={(formData.payroll.providentFundRate ?? formData.payroll.providentFundPercentage ?? 0.05) * 100}
                  onChange={(e) => {
                    const rate = (parseFloat(e.target.value) || 0) / 100;
                    setFormData({
                      ...formData,
                      payroll: {
                        ...formData.payroll,
                        providentFundRate: rate,
                        providentFundPercentage: rate,
                      },
                    });
                  }}
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
                <span className="text-[11px] text-neutral-400 mt-1 block">
                  Matched equally by employer (5% employee + 5% employer).
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Social Security / EOBI Rate (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={(formData.payroll.socialSecurityRate ?? 0.01) * 100}
                  onChange={(e) => {
                    const rate = (parseFloat(e.target.value) || 0) / 100;
                    setFormData({
                      ...formData,
                      payroll: {
                        ...formData.payroll,
                        socialSecurityRate: rate,
                      },
                    });
                  }}
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Data & Backup */}
        {activeTab === 'backup' && (
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                Data Management & Persistence
              </h3>
              <p className="text-xs text-neutral-500">
                All records are persisted safely in the browser via `storageService`. You can
                export JSON snapshots or restore original demo seed records.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40">
                <h4 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 mb-1 flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-indigo-600" /> Export System Backup
                </h4>
                <p className="text-xs text-neutral-500 mb-3">
                  Download a JSON file containing all employees, attendance logs, and payroll runs.
                </p>
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold shadow-xs"
                >
                  Download JSON Backup
                </button>
              </div>

              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40">
                <h4 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 mb-1 flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-emerald-600" /> Restore from Backup
                </h4>
                <p className="text-xs text-neutral-500 mb-3">
                  Restore previously exported system state from a WorkPulse JSON backup.
                </p>
                <label className="cursor-pointer px-3.5 py-1.5 bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 transition-colors inline-block">
                  Upload Backup JSON
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportBackup}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Danger Zone: Reset Demo Data */}
            <div className="p-5 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 space-y-3">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-xs uppercase tracking-wider">
                <ShieldAlert className="w-4 h-4" /> Reset Environment
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-300">
                Clears all custom adjustments and restores fresh, pristine seed data for all 10
                employees, complete attendance logs, payroll drafts, and loans.
              </p>
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(true)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset to Demo Data
              </button>
            </div>
          </div>
        )}

        {/* Save Bar */}
        {activeTab !== 'backup' && (
          <div className="flex items-center justify-end gap-3">
            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" /> Save System Settings
            </button>
          </div>
        )}
      </form>

      {/* Confirm Reset Dialog */}
      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        onConfirm={() => {
          storageService.resetDemoData();
          refreshSettings();
          success('Database Reset', 'Restored pristine demo dataset.');
          setIsResetConfirmOpen(false);
          setTimeout(() => window.location.reload(), 600);
        }}
        title="Reset All Data to Demo Defaults?"
        message="This will overwrite all created employee records, punches, and approvals with the standard WorkPulse demo set. This cannot be undone."
        confirmText="Yes, Reset Everything"
        isDanger={true}
      />
    </div>
  );
};
