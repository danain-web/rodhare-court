import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  ClipboardCheck,
  Compass,
  Dumbbell,
  FileClock,
  LayoutGrid,
  Menu,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  Tag,
  Warehouse,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BrandMark, NotificationBell, UserChip } from '../Navbar';

interface Item {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles: string[];
}

const ITEMS: { group: string; items: Item[] }[] = [
  {
    group: 'เมนูหลัก (Operations)',
    items: [
      { to: '/dashboard', label: 'ภาพรวมระบบ (Overview)', icon: <LayoutGrid className="h-4 w-4" />, roles: ['STAFF', 'ADMIN', 'EXECUTIVE'] },
      { to: '/staff/equipment/borrow', label: 'เช็คอินและยืมอุปกรณ์', icon: <Dumbbell className="h-4 w-4" />, roles: ['STAFF', 'ADMIN'] },
      { to: '/staff/equipment/return', label: 'รับคืนอุปกรณ์ & ค่าปรับ', icon: <RotateCcw className="h-4 w-4" />, roles: ['STAFF', 'ADMIN'] },
      { to: '/staff/payments', label: 'ตรวจสอบสลิป', icon: <ReceiptText className="h-4 w-4" />, roles: ['STAFF', 'ADMIN'] },
      { to: '/staff/refunds', label: 'อนุมัติการคืนเงิน', icon: <ClipboardCheck className="h-4 w-4" />, roles: ['STAFF', 'ADMIN'] },
    ],
  },
  {
    group: 'ผู้ดูแลระบบ (Admin)',
    items: [
      { to: '/admin/courts', label: 'จัดการสนาม', icon: <Warehouse className="h-4 w-4" />, roles: ['ADMIN'] },
      { to: '/admin/equipment', label: 'สต็อกอุปกรณ์กีฬา', icon: <PackageCheck className="h-4 w-4" />, roles: ['ADMIN'] },
      { to: '/admin/promotions', label: 'โปรโมชั่น', icon: <Tag className="h-4 w-4" />, roles: ['ADMIN'] },
      { to: '/admin/audit-logs', label: 'บันทึกการทำงาน', icon: <FileClock className="h-4 w-4" />, roles: ['ADMIN'] },
    ],
  },
  {
    group: 'อื่น ๆ',
    items: [
      { to: '/courts', label: 'หน้าค้นหาสนาม (ฝั่งลูกค้า)', icon: <Compass className="h-4 w-4" />, roles: ['STAFF', 'ADMIN', 'EXECUTIVE'] },
      { to: '/health', label: 'สถานะระบบ (Health)', icon: <Activity className="h-4 w-4" />, roles: ['STAFF', 'ADMIN', 'EXECUTIVE'] },
    ],
  },
];

// เลย์เอาต์ฝั่งพนักงาน/ผู้ดูแล/ผู้บริหาร: Sidebar ซ้าย + Topbar (ตาม Prototype UCS-5, 6.4, 7, 8, 9)
export const StaffLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, hasRole } = useAuth();
  const [open, setOpen] = useState(false);
  const roles = user?.roles || [];
  const isExec = hasRole('EXECUTIVE') || hasRole('ADMIN');

  const sidebar = (
    <div className="flex h-full flex-col gap-5 p-4">
      <Link to="/dashboard" className="px-2 pt-2">
        <BrandMark subtitle="Staff & Admin Console" />
      </Link>
      <div className="flex items-center justify-between rounded-xl bg-panel px-3 py-2 text-[11px] font-semibold text-forest-800">
        <span>CONSOLE MODE</span>
        <span className="badge-mint">{roles.join(' / ') || 'STAFF'}</span>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto">
        {ITEMS.map((g) => {
          const visible = g.items.filter((i) => i.roles.some((r) => roles.includes(r)));
          if (!visible.length) return null;
          return (
            <div key={g.group} className="space-y-1">
              <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{g.group}</div>
              {visible.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                      isActive ? 'bg-forest-900 font-semibold text-white shadow-md' : 'text-slate-600 hover:bg-panel hover:text-forest-900'
                    }`
                  }
                >
                  {i.icon}
                  <span>{i.label === 'ภาพรวมระบบ (Overview)' && isExec ? 'ภาพรวม & รายงาน' : i.label}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="rounded-xl bg-panel p-3 text-[11px] text-slate-600">
        <div className="flex items-center gap-2 font-semibold text-forest-900">
          <span className="h-2 w-2 rounded-full bg-mint-500" /> Arena Network Online
        </div>
        <div className="mt-0.5 text-slate-500">เชื่อมต่อ Oracle Database แบบ Real-time</div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-slate-200/70 bg-white lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-50 bg-forest-950/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-72 bg-white" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button className="rounded-xl p-2 text-forest-900 hover:bg-panel lg:hidden" onClick={() => setOpen(true)} aria-label="เมนู">
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <div className="text-base font-bold text-forest-950 sm:text-lg">Barbie Sports Arena Staff & Admin Console</div>
              <span className="badge-mint hidden md:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-mint-500" /> PRODUCTION NODE
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isExec && (
                <Link to="/dashboard" className="btn-soft hidden py-2 xl:inline-flex">
                  <BarChart3 className="h-4 w-4" /> รายงานผู้บริหาร
                </Link>
              )}
              <NotificationBell />
              <UserChip />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[96rem] flex-1 space-y-6 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
};
