import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { getMyNotificationsApi, markNotificationReadApi } from '../services/payment';
import { Bell, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { formatDateTime } from './ui/format';

export const BrandMark: React.FC<{ subtitle?: string; compact?: boolean }> = ({ subtitle = 'ศูนย์กีฬาและบริการยืมอุปกรณ์ออนไลน์', compact }) => (
  <div className="flex items-center gap-3">
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint-100 text-lg font-extrabold text-forest-900 ring-1 ring-mint-200">
      B
    </div>
    {!compact && (
      <div className="leading-tight">
        <div className="whitespace-nowrap text-lg font-bold text-forest-950">Barbie Sports Arena</div>
        <div className="whitespace-nowrap text-[10px] text-slate-500">{subtitle}</div>
      </div>
    )}
  </div>
);

export const NotificationBell: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: notifications = [] } = useQuery({
    queryKey: ['myNotifications'],
    queryFn: getMyNotificationsApi,
    enabled: isAuthenticated,
    refetchInterval: 10000,
  });
  const unread = notifications.filter((n) => !n.isRead).length;

  const markRead = async (id: number) => {
    try {
      await markNotificationReadApi(id);
      queryClient.invalidateQueries({ queryKey: ['myNotifications'] });
    } catch (_) {
      /* ไม่ต้องแจ้งผู้ใช้ */
    }
  };

  const toneDot: Record<string, string> = { SUCCESS: 'bg-mint-500', WARNING: 'bg-amber-500', ALERT: 'bg-rose-500', INFO: 'bg-sky-500' };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-xl p-2 text-forest-900 transition hover:bg-panel"
        title="การแจ้งเตือน"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-700 px-1 text-[9px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="card absolute right-0 z-50 mt-2 w-96 max-w-[90vw] p-4">
          <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-sm font-bold text-forest-950">การแจ้งเตือน (BR7)</span>
            <span className="text-[11px] text-slate-500">ยังไม่อ่าน {unread} / ทั้งหมด {notifications.length}</span>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">ยังไม่มีการแจ้งเตือน</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.notificationId}
                  onClick={() => !n.isRead && markRead(n.notificationId)}
                  className={`w-full rounded-xl p-3 text-left text-xs transition ${n.isRead ? 'bg-slate-50' : 'bg-panel hover:bg-forest-50'}`}
                >
                  <div className="flex items-center gap-2 font-semibold text-forest-950">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${toneDot[n.type] || 'bg-slate-400'}`} />
                    {n.title}
                  </div>
                  <div className="mt-1 text-slate-600">{n.message}</div>
                  <div className="mt-1 text-[10px] text-slate-400">{formatDateTime(n.createdAt)}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const UserChip: React.FC<{ subtitle?: string }> = ({ subtitle }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  return (
    <div className="flex items-center gap-3 border-l border-slate-200 pl-3">
      <Link to="/profile" className="hidden text-right leading-tight sm:block">
        <div className="whitespace-nowrap text-sm font-semibold text-forest-950">
          คุณ{user.firstName} {user.lastName?.[0]}.
        </div>
        <div className="whitespace-nowrap text-[10px] text-slate-500">{subtitle || `ID: ${user.username} • ${user.roles.join(', ')}`}</div>
      </Link>
      <Link
        to="/profile"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-forest-700 to-forest-900 text-sm font-bold text-mint-200 ring-2 ring-white"
      >
        {initials || 'U'}
      </Link>
      <button
        onClick={async () => {
          await logout();
          navigate('/login');
        }}
        title="ออกจากระบบ"
        className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-700"
      >
        <LogOut className="h-5 w-5" />
      </button>
    </div>
  );
};

// ---------------- Header ฝั่งลูกค้า (ตาม Prototype UCS-2 ถึง UCS-6) ----------------
export const Navbar: React.FC = () => {
  const { isAuthenticated, hasRole } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isStaffSide = hasRole('STAFF') || hasRole('ADMIN') || hasRole('EXECUTIVE');

  const tabs = [
    { to: '/courts', label: 'ค้นหาสนาม', code: 'UCS-2' },
    ...(isAuthenticated
      ? [
          { to: '/my-bookings', label: 'รายการจองของฉัน', code: 'My Bookings' },
          { to: '/fines', label: 'ค่าปรับอุปกรณ์', code: 'Fines' },
          { to: '/dashboard', label: 'แดชบอร์ด', code: 'Dashboard' },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to={isAuthenticated ? '/courts' : '/courts'}>
          <BrandMark />
        </Link>

        <nav className="hidden h-full items-stretch gap-1 rounded-b-2xl bg-panel/70 px-1 lg:flex">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `flex flex-col justify-center whitespace-nowrap rounded-b-xl px-3 text-sm leading-tight transition xl:px-4 ${
                  isActive ? 'bg-forest-900 font-semibold text-white shadow-md' : 'text-forest-900 hover:bg-white'
                }`
              }
            >
              <span>{t.label}</span>
              <span className="hidden text-[10px] opacity-70 xl:block">({t.code})</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <>
              {isStaffSide ? (
                <Link to={hasRole('EXECUTIVE') && !hasRole('STAFF') && !hasRole('ADMIN') ? '/dashboard' : '/staff/payments'} className="badge-forest hidden whitespace-nowrap py-1.5 xl:inline-flex">
                  <ShieldCheck className="h-3.5 w-3.5" /> Staff & Admin Console
                </Link>
              ) : (
                <span className="badge-mint hidden whitespace-nowrap py-1.5 2xl:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-mint-500" /> สมาชิกสถานะปกติ (Active Member)
                </span>
              )}
              <NotificationBell />
              <UserChip />
            </>
          ) : (
            <>
              <Link to="/register" className="btn-outline hidden sm:inline-flex">
                สมัครสมาชิก
              </Link>
              <Link to="/login" className="btn-primary">
                เข้าสู่ระบบ
              </Link>
            </>
          )}
          <button className="rounded-xl p-2 text-forest-900 hover:bg-panel lg:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label="เมนู">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-slate-100 bg-white px-4 py-3 lg:hidden">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `block rounded-xl px-4 py-2.5 text-sm ${isActive ? 'bg-forest-900 text-white' : 'text-forest-900'}`}
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  );
};

export const Footer: React.FC = () => (
  <footer className="mt-16 bg-panel/70">
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
      <div>
        <div className="text-lg font-bold text-forest-950">Barbie Sports Arena</div>
        <div className="text-xs text-slate-500">ระบบบริการจองคอร์ทกีฬาและจัดการยืม-คืนอุปกรณ์ดิจิทัลครบวงจร</div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-slate-600">
        <span>ระเบียบการใช้งานสนาม</span>
        <span className="text-slate-300">•</span>
        <span>นโยบายยกเลิกและคืนเงิน (BR12)</span>
        <span className="text-slate-300">•</span>
        <span>ติดต่อเจ้าหน้าที่เคาน์เตอร์กีฬา</span>
      </div>
      <div className="text-xs text-slate-500">© 2026 Barbie Sports Arena. สงวนลิขสิทธิ์ทุกประการ</div>
    </div>
  </footer>
);
