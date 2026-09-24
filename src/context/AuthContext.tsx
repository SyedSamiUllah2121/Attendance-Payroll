import React, { createContext, useContext, useState, useEffect } from 'react';
import { Role, User } from '../types';

export const DEMO_ACCOUNTS: { role: Role; email: string; pass: string; name: string; designation: string; department: string; employeeId?: string }[] = [
  {
    role: 'admin',
    email: 'admin@workpulse.com',
    pass: 'admin123',
    name: 'Mustafa Zaidi',
    designation: 'Managing Director / System Admin',
    department: 'Executive',
  },
  {
    role: 'hr',
    email: 'hr@workpulse.com',
    pass: 'hr123',
    name: 'Sara Ahmed',
    designation: 'HR Manager',
    department: 'Human Resources',
    employeeId: 'EMP-002',
  },
  {
    role: 'employee',
    email: 'ali.khan@workpulse.com',
    pass: 'emp123',
    name: 'Ali Khan',
    designation: 'Senior Developer',
    department: 'Engineering',
    employeeId: 'EMP-001',
  },
];

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, pass: string) => boolean;
  quickLogin: (role: Role) => void;
  logout: () => void;
  isAdmin: boolean;
  isHR: boolean;
  isEmployee: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null;

    const saved = window.localStorage.getItem('workpulse_active_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    // Default to Admin for seamless review
    const def = DEMO_ACCOUNTS[0];
    return {
      id: 'user-admin',
      email: def.email,
      name: def.name,
      role: def.role,
      designation: def.designation,
      department: def.department,
    };
  });

  useEffect(() => {
    if (user) {
      window.localStorage.setItem('workpulse_active_user', JSON.stringify(user));
    } else {
      window.localStorage.removeItem('workpulse_active_user');
    }
  }, [user]);

  const login = (email: string, pass: string): boolean => {
    const found = DEMO_ACCOUNTS.find(
      (a) => a.email.toLowerCase() === email.toLowerCase().trim() && a.pass === pass.trim()
    );
    if (found) {
      setUser({
        id: `user-${found.role}`,
        email: found.email,
        name: found.name,
        role: found.role,
        designation: found.designation,
        department: found.department,
        employeeId: found.employeeId,
      });
      return true;
    }
    return false;
  };

  const quickLogin = (role: Role) => {
    const found = DEMO_ACCOUNTS.find((a) => a.role === role);
    if (found) {
      setUser({
        id: `user-${found.role}`,
        email: found.email,
        name: found.name,
        role: found.role,
        designation: found.designation,
        department: found.department,
        employeeId: found.employeeId,
      });
    }
  };

  const logout = () => {
    setUser(null);
  };

  const isAdmin = user?.role === 'admin';
  const isHR = user?.role === 'hr' || user?.role === 'admin';
  const isEmployee = user?.role === 'employee';

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        quickLogin,
        logout,
        isAdmin,
        isHR,
        isEmployee,
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
