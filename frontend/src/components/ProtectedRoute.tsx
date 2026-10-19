import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUrlWithRedirect } from '../utils/redirect';
import { ShieldAlert, Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: string | string[]; // ผ่านถ้ามีสิทธิ์ใดสิทธิ์หนึ่ง (สิทธิ์ของ role กำหนดในฐานข้อมูล)
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, permission }) => {
  const { isAuthenticated, isLoading, user, can } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-forest-900">
        <div className="flex items-center gap-3 text-sm">
          <Loader2 className="h-6 w-6 animate-spin text-forest-600" />
          <span>กำลังตรวจสอบสิทธิ์การเข้าใช้งาน...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // จำหน้าที่ตั้งใจจะเข้า แล้วพากลับมาหลัง Login
    return <Navigate to={loginUrlWithRedirect(location.pathname + location.search)} replace />;
  }

  const required = permission === undefined ? [] : Array.isArray(permission) ? permission : [permission];
  if (required.length > 0) {
    const userRoles = user?.roles || [];

    if (!required.some(can)) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
          <div className="card w-full max-w-md space-y-4 p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
              <ShieldAlert className="h-9 w-9" />
            </div>
            <h2 className="text-2xl font-bold text-forest-950">403 ไม่มีสิทธิ์เข้าถึงหน้านี้</h2>
            <p className="text-sm text-slate-600">
              บทบาทของคุณ <span className="badge-amber">{userRoles.join(', ')}</span> ไม่ได้รับสิทธิ์ให้ใช้งานหน้านี้
            </p>
            <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
              ต้องมีสิทธิ์: <span className="badge-mint">{required.join(', ')}</span>
            </div>
            <Link to="/courts" className="btn-primary w-full">
              กลับหน้าค้นหาสนาม
            </Link>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};
