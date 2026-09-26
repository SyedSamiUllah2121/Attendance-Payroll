import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserAccount } from '../types';
import { storageService } from '../services/storageService';
import { defaultUserAccounts } from '../data/seedData';
import { Permission, canOpenPage, normalizeRole, roleCan } from '../utils/permissions';

/**
 * Sessions live in sessionStorage, so closing the browser signs you out and the next visit
 * starts at the login page. "Keep me signed in" also copies the session to localStorage.
 */
const SESSION_KEY = 'workpulse_active_user';
const REMEMBER_KEY = 'workpulse_remember';

/** Seeded accounts offered as one-click demo sign-ins (only while they exist and are active). */
export const DEMO_ACCOUNT_IDS = defaultUserAccounts.map((a) => a.id);

export const getDemoAccounts = (): UserAccount[] =>
  storageService
    .getUsers()
    .filter((a) => DEMO_ACCOUNT_IDS.includes(a.id) && a.status === 'Active');

const toSessionUser = (a: UserAccount): User => ({
  id: a.id,
  email: a.email,
  name: a.name,
  role: normalizeRole(a.role),
  employeeId: a.employeeId,
  designation: a.designation,
  department: a.department,
});

export type LoginResult = { ok: true } | { ok: false; reason: 'invalid' | 'disabled' };

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, pass: string, remember?: boolean) => LoginResult;
  quickLogin: (accountId: string) => void;
  logout: () => void;
  /** Re-read the signed-in account (after its role or details change). */
  refreshUser: () => void;
  can: (permission: Permission) => boolean;
  canOpen: (page: string) => boolean;
  isAdmin: boolean; // head manager
  isHR: boolean; // any staff role (not a plain employee)
  isEmployee: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Restore the saved session, but only if that account still exists and is active. */
const restoreSession = (): User | null => {
  if (typeof window === 'undefined') return null;
  const remembered = window.localStorage.getItem(REMEMBER_KEY) === '1';
  if (!remembered) window.localStorage.removeItem(SESSION_KEY); // drop older always-on sessions
  const saved =
    window.sessionStorage.getItem(SESSION_KEY) ||
    (remembered ? window.localStorage.getItem(SESSION_KEY) : null);
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved) as User;
    const accounts = storageService.getUsers();
    const account =
      accounts.find((a) => a.id === parsed.id) ||
      accounts.find((a) => a.email.toLowerCase() === parsed.email?.toLowerCase());
    return account && account.status === 'Active' ? toSessionUser(account) : null;
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(restoreSession);
  const [remember, setRemember] = useState<boolean>(
    () => typeof window !== 'undefined' && window.localStorage.getItem(REMEMBER_KEY) === '1'
  );

  useEffect(() => {
    if (user) {
      const json = JSON.stringify(user);
      window.sessionStorage.setItem(SESSION_KEY, json);
      if (remember) {
        window.localStorage.setItem(SESSION_KEY, json);
        window.localStorage.setItem(REMEMBER_KEY, '1');
      } else {
        window.localStorage.removeItem(SESSION_KEY);
        window.localStorage.removeItem(REMEMBER_KEY);
      }
    } else {
      window.sessionStorage.removeItem(SESSION_KEY);
      window.localStorage.removeItem(SESSION_KEY);
      window.localStorage.removeItem(REMEMBER_KEY);
    }
  }, [user, remember]);

  const signIn = (account: UserAccount) => {
    const accounts = storageService.getUsers().map((a) =>
      a.id === account.id ? { ...a, lastLoginAt: new Date().toISOString() } : a
    );
    storageService.saveUsers(accounts);
    setUser(toSessionUser(account));
  };

  const login = (email: string, pass: string, keepSignedIn = false): LoginResult => {
    const account = storageService
      .getUsers()
      .find(
        (a) => a.email.toLowerCase() === email.toLowerCase().trim() && a.password === pass.trim()
      );
    if (!account) return { ok: false, reason: 'invalid' };
    if (account.status !== 'Active') return { ok: false, reason: 'disabled' };
    setRemember(keepSignedIn);
    signIn(account);
    return { ok: true };
  };

  const quickLogin = (accountId: string) => {
    const account = getDemoAccounts().find((a) => a.id === accountId);
    if (account) signIn(account);
  };

  const logout = () => {
    setRemember(false);
    setUser(null);
  };

  const refreshUser = useCallback(() => setUser(restoreSession()), []);

  const role = user?.role;
  const can = (permission: Permission) => roleCan(role, permission);
  const canOpen = (page: string) => canOpenPage(role, page);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        quickLogin,
        logout,
        refreshUser,
        can,
        canOpen,
        isAdmin: role === 'manager',
        isHR: !!role && role !== 'employee',
        isEmployee: role === 'employee',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
