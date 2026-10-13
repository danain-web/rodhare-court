import React from 'react';
import { useAuth } from '../context/AuthContext';
import { CustomerLayout } from '../components/layout/CustomerLayout';
import { StaffLayout } from '../components/layout/StaffLayout';
import { PageHeader, formatDateTime } from '../components/ui';
import { Calendar, IdCard, Key, Lock, Mail, Phone, ShieldCheck } from 'lucide-react';

// โปรไฟล์ผู้ใช้ (ไม่มี Prototype — ออกแบบตาม Design System เดียวกัน)
export const ProfilePage: React.FC = () => {
  const { user, hasRole } = useAuth();
  const Layout = hasRole('STAFF') || hasRole('ADMIN') || hasRole('EXECUTIVE') ? StaffLayout : CustomerLayout;

  return (
    <Layout>
      <PageHeader code="Profile" title="ข้อมูลโปรไฟล์ผู้ใช้งาน" subtitle="ข้อมูลบัญชีจากตาราง USERS / USER_ROLES" />

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="card-dark flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-mint-300 text-3xl font-bold text-forest-950 ring-4 ring-white/20">
            {user?.firstName?.[0]}
            {user?.lastName?.[0]}
          </div>
          <div>
            <div className="text-2xl font-bold text-white">
              {user?.firstName} {user?.lastName}
            </div>
            <div className="text-sm text-mint-200">@{user?.username}</div>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {user?.roles.map((r) => (
              <span key={r} className="badge bg-white/15 text-white">
                {r}
              </span>
            ))}
          </div>
          <span className={user?.isActive ? 'badge bg-mint-300 text-forest-950' : 'badge-rose'}>
            {user?.isActive ? 'สมาชิกสถานะปกติ (Active — BR1)' : 'บัญชีถูกระงับ'}
          </span>
        </div>

        <div className="card space-y-4 p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { i: <Mail className="h-4 w-4" />, l: 'อีเมล', v: user?.email },
              { i: <Phone className="h-4 w-4" />, l: 'เบอร์โทรศัพท์', v: user?.phone || '-' },
              { i: <IdCard className="h-4 w-4" />, l: 'ประเภทสมาชิก', v: (user as any)?.memberTypeName || `#${user?.memberTypeId}` },
              { i: <ShieldCheck className="h-4 w-4" />, l: 'บทบาทในระบบ', v: user?.roles.join(', ') },
              { i: <Calendar className="h-4 w-4" />, l: 'สร้างบัญชีเมื่อ', v: formatDateTime(user?.createdAt) },
              { i: <IdCard className="h-4 w-4" />, l: 'รหัสผู้ใช้ (user_id)', v: user?.userId },
            ].map((x) => (
              <div key={x.l} className="flex items-start gap-3 rounded-xl bg-panel p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-forest-700">{x.i}</div>
                <div>
                  <div className="text-[11px] text-slate-500">{x.l}</div>
                  <div className="text-sm font-semibold text-forest-950">{x.v}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Session JWT อยู่ใน httpOnly Cookie — JavaScript อ่านไม่ได้ (ป้องกัน XSS) จึงไม่แสดง token บนหน้า */}
          <div className="border-t border-slate-100 pt-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
              <Key className="h-4 w-4" /> Session (USER_SESSIONS)
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-panel p-3 text-xs text-slate-600">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
              <span>
                เข้าสู่ระบบอยู่ด้วย JWT ที่เก็บใน <span className="font-mono">httpOnly Cookie</span> — Browser แนบให้อัตโนมัติทุก Request
                และสคริปต์ฝั่งหน้าเว็บไม่สามารถอ่าน token ได้ จึงปลอดภัยจากการขโมยผ่าน XSS
              </span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
