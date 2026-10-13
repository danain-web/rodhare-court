import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserDTO } from '../types';
import { getMeApi, logoutApi } from '../services/auth';

// =====================================================================
// AuthContext — ใช้ httpOnly Cookie JWT แทน localStorage
// =====================================================================
// ✅ ไม่เก็บ token ใน localStorage หรือ state เลย
// ✅ ตรวจสถานะ login จาก /auth/me (Cookie ถูกส่งอัตโนมัติ)
// ✅ Browser จัดการ Cookie ให้เอง: ส่งทุก request, ล้างเมื่อ logout
// =====================================================================

interface AuthContextType {
  user: UserDTO | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: UserDTO) => void;   // รับแค่ user data (ไม่มี token)
  logout: () => Promise<void>;
  hasRole: (role: string) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // =====================================================================
  // initAuth: ตรวจ session จาก Cookie โดยเรียก /auth/me
  // ถ้า Cookie ยังใช้ได้ → ได้ user profile กลับมา
  // ถ้า Cookie หมดอายุ/ไม่มี → 401 → user = null
  // =====================================================================
  const initAuth = useCallback(async () => {
    try {
      const profile = await getMeApi();
      setUser(profile);
    } catch {
      // 401 หรือไม่มี Cookie → ยังไม่ได้ login (ปกติ ไม่ต้อง log error)
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // login: เรียกหลังจาก Backend set Cookie แล้ว → รับแค่ user data
  const login = useCallback((newUser: UserDTO) => {
    setUser(newUser);
  }, []);

  // logout: เรียก Backend เพื่อ revoke session + clear Cookie
  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      // ถ้า API ล้มก็ยัง clear state ได้
    } finally {
      setUser(null);
    }
  }, []);

  // refreshUser: โหลด user profile ใหม่ (เช่น หลังแก้ไขโปรไฟล์)
  const refreshUser = useCallback(async () => {
    try {
      const profile = await getMeApi();
      setUser(profile);
    } catch {
      setUser(null);
    }
  }, []);

  const hasRole = useCallback(
    (role: string): boolean => {
      if (!user?.roles) return false;
      return user.roles.includes(role);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        hasRole,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
