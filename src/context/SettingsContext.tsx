import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppSettings } from '../types';
import { defaultSettings } from '../data/seedData';
import { storageService } from '../services/storageService';
import { formatCurrency as formatCurrencyUtil } from '../utils/payrollEngine';

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (newSettings: AppSettings) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  currency: string;
  formatMoney: (amount: number) => string;
  refreshSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    if (typeof window === 'undefined') return defaultSettings;
    return storageService.getSettings();
  });
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;

    const saved = window.localStorage.getItem('workpulse_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
      window.localStorage.setItem('workpulse_theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
      window.localStorage.setItem('workpulse_theme', 'light');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  const updateSettings = (newSettings: AppSettings) => {
    storageService.saveSettings(newSettings);
    setSettings(newSettings);
  };

  const refreshSettings = () => {
    setSettings(storageService.getSettings());
  };

  const currency = settings.company.currency || 'Rs.';

  const formatMoney = (amount: number) => {
    return formatCurrencyUtil(amount, currency);
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        darkMode,
        toggleDarkMode,
        currency,
        formatMoney,
        refreshSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within SettingsProvider');
  return context;
};
