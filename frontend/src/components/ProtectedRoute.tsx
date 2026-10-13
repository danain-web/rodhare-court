import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

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
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const userRoles = user?.roles || [];
    const hasPermission = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasPermission) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
          <div className="card w-full max-w-md space-y-4 p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
              <ShieldAlert className="h-9 w-9" />
            </div>
            <h2 className="text-2xl font-bold text-forest-950">403 ไม่มีสิทธิ์เข้าถึงหน้านี้</h2>
            <p className="text-sm text-slate-600">
              บทบาทของคุณ <span className="badge-amber">{userRoles.join(', ')}</span> ไม่ได้รับอนุญาตให้ใช้งานหน้านี้
            </p>
            <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
              ต้องมีบทบาท: <span className="badge-mint">{allowedRoles.join(', ')}</span>
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
