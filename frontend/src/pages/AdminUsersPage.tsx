import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminUser, getAdminUsersApi, updateAdminUserApi } from '../services/admin';
import { useAuth } from '../context/AuthContext';
import { StaffLayout } from '../components/layout/StaffLayout';
import { Alert, EmptyState, LoadingState, Modal, PageHeader, StatCard, apiErrorMessage, formatDateTime } from '../components/ui';
import { Link2, Loader2, Search, ShieldCheck, UserCheck, UserX, Users } from 'lucide-react';

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'ลูกค้า',
  STAFF: 'พนักงาน',
  EXECUTIVE: 'ผู้บริหาร',
  ADMIN: 'ผู้ดูแลระบบ',
};
const roleLabel = (r: string) => ROLE_LABEL[r] || r;

// จัดการผู้ใช้: ดู/ค้นหา · ระงับ-เปิดบัญชี · เปลี่ยนบทบาท · เปลี่ยนประเภทสมาชิก (ไม่มีการลบผู้ใช้ — ใช้การระงับ เพื่อคงประวัติการจอง/ชำระเงิน)
export const AdminUsersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState<'' | 'active' | 'suspended'>('');
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({ role: '', memberTypeId: 0, isActive: true });
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // หน่วงการค้นหา 350ms หลังหยุดพิมพ์ ไม่ยิง API ทุกตัวอักษร
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['adminUsers', search, role, status],
    queryFn: () => getAdminUsersApi({ search: search || undefined, role: role || undefined, status: status || undefined }),
  });
  const users = data?.users ?? [];
  const roles = data?.roles ?? [];
  const memberTypes = data?.memberTypes ?? [];

  const openEdit = (u: AdminUser) => {
    setEditing(u);
    setForm({ role: u.roles[0] || '', memberTypeId: u.memberTypeId, isActive: u.isActive });
    setErrorMsg('');
  };

  const saveMutation = useMutation({
    mutationFn: (vars: { id: number; payload: { isActive?: boolean; role?: string; memberTypeId?: number } }) => updateAdminUserApi(vars.id, vars.payload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setSuccessMsg(`บันทึกการเปลี่ยนแปลงของ @${updated.username} เรียบร้อย`);
      setEditing(null);
    },
    onError: (err) => setErrorMsg(apiErrorMessage(err)),
  });

  const isSelf = !!editing && editing.userId === me?.userId;

  // ส่งเฉพาะสิ่งที่เปลี่ยนจริง (backend ก็เทียบซ้ำอีกชั้น)
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const payload: { isActive?: boolean; role?: string; memberTypeId?: number } = {};
    if (!isSelf && form.isActive !== editing.isActive) payload.isActive = form.isActive;
    if (!isSelf && form.role && !(editing.roles.length === 1 && editing.roles[0] === form.role)) payload.role = form.role;
    if (form.memberTypeId && form.memberTypeId !== editing.memberTypeId) payload.memberTypeId = form.memberTypeId;
    if (Object.keys(payload).length === 0) return setEditing(null);
    setErrorMsg('');
    saveMutation.mutate({ id: editing.userId, payload });
  };

  const suspendedCount = users.filter((u) => !u.isActive).length;
  const staffCount = users.filter((u) => u.roles.some((r) => r !== 'CUSTOMER')).length;
  const willLogout = !!editing && !isSelf && ((!form.isActive && editing.isActive) || (form.role !== '' && !(editing.roles.length === 1 && editing.roles[0] === form.role)));

  return (
    <StaffLayout>
      <PageHeader
        code="User Management"
        eyebrow="บริหารจัดการระบบ"
        title="จัดการผู้ใช้งาน"
        subtitle="ค้นหาผู้ใช้ ระงับหรือเปิดบัญชี เปลี่ยนบทบาท และประเภทสมาชิก (ส่วนลด) · ทุกการเปลี่ยนแปลงบันทึกใน Audit Log"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="ผู้ใช้ตามตัวกรอง" value={users.length} unit="บัญชี" icon={<Users className="h-5 w-5" />} />
        <StatCard label="เจ้าหน้าที่ / ผู้ดูแล / ผู้บริหาร" value={staffCount} unit="บัญชี" icon={<ShieldCheck className="h-5 w-5" />} tone="blue" />
        <StatCard label="ถูกระงับ" value={suspendedCount} unit="บัญชี" icon={<UserX className="h-5 w-5" />} tone="rose" />
      </div>

      {successMsg && <Alert tone="success" title={successMsg} onClose={() => setSuccessMsg('')} />}

      <div className="card space-y-4 p-6">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="ค้นหาชื่อผู้ใช้ อีเมล หรือชื่อ-นามสกุล..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <select className="input sm:w-48" value={role} onChange={(e) => setRole(e.target.value)} aria-label="กรองตามบทบาท">
            <option value="">ทุกบทบาท</option>
            {roles.map((r) => (
              <option key={r.roleName} value={r.roleName}>
                {roleLabel(r.roleName)}
              </option>
            ))}
          </select>
          <select className="input sm:w-44" value={status} onChange={(e) => setStatus(e.target.value as any)} aria-label="กรองตามสถานะ">
            <option value="">ทุกสถานะ</option>
            <option value="active">ใช้งานอยู่</option>
            <option value="suspended">ถูกระงับ</option>
          </select>
        </div>

        {isLoading ? (
          <LoadingState label="กำลังโหลดรายชื่อผู้ใช้..." />
        ) : isError ? (
          <Alert tone="error" title={apiErrorMessage(error)} />
        ) : users.length === 0 ? (
          <EmptyState title="ไม่พบผู้ใช้ตามเงื่อนไข" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-panel text-left text-[11px] text-slate-600">
                  <th className="rounded-l-lg px-3 py-2.5">ผู้ใช้</th>
                  <th className="px-3 py-2.5">บทบาท</th>
                  <th className="px-3 py-2.5">ประเภทสมาชิก</th>
                  <th className="px-3 py-2.5">สถานะ</th>
                  <th className="px-3 py-2.5">สมัครเมื่อ</th>
                  <th className="rounded-r-lg px-3 py-2.5 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.userId} className={u.isActive ? '' : 'bg-rose-50/40'}>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-forest-950">
                        {u.firstName} {u.lastName} {u.userId === me?.userId && <span className="badge-mint ml-1">คุณ</span>}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        @{u.username} · {u.email}
                        {u.googleLinked && <Link2 className="ml-1 inline h-3 w-3 text-sky-600" aria-label="เชื่อม Google" />}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {u.roles.length ? u.roles.map((r) => <span key={r} className={r === 'CUSTOMER' ? 'badge-slate' : 'badge-forest'}>{roleLabel(r)}</span>) : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{u.memberTypeName}</td>
                    <td className="px-3 py-3">{u.isActive ? <span className="badge-mint">ใช้งานอยู่</span> : <span className="badge-rose">ถูกระงับ</span>}</td>
                    <td className="px-3 py-3 text-xs text-slate-500">{formatDateTime(u.createdAt)}</td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => openEdit(u)} className="btn-soft px-3 py-1.5 text-xs">
                        <UserCheck className="h-3.5 w-3.5" /> จัดการ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `จัดการผู้ใช้ @${editing.username}` : ''}>
        {editing && (
          <form onSubmit={handleSave} className="space-y-4">
            {errorMsg && <Alert tone="error" title={errorMsg} />}
            <div className="rounded-xl bg-panel p-3 text-xs text-slate-600">
              <div className="font-semibold text-forest-950">
                {editing.firstName} {editing.lastName}
              </div>
              {editing.email}
              {editing.phone ? ` · ${editing.phone}` : ''}
            </div>
            {isSelf && (
              <Alert tone="info" title="นี่คือบัญชีของคุณเอง">
                ระงับบัญชีหรือเปลี่ยนบทบาทของตัวเองไม่ได้ (กันล็อกตัวเองออกจากระบบ) ให้ผู้ดูแลระบบคนอื่นดำเนินการ
              </Alert>
            )}
            <div>
              <label className="label">บทบาท</label>
              <select className="input" disabled={isSelf} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                {!form.role && <option value="">— ไม่มีบทบาท —</option>}
                {roles.map((r) => (
                  <option key={r.roleName} value={r.roleName}>
                    {roleLabel(r.roleName)} ({r.roleName})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">สิทธิ์ของแต่ละบทบาทกำหนดที่เมนู "จัดการสิทธิ์"</p>
            </div>
            <div>
              <label className="label">ประเภทสมาชิก (ใช้คำนวณส่วนลด)</label>
              <select className="input" value={form.memberTypeId} onChange={(e) => setForm((f) => ({ ...f, memberTypeId: Number(e.target.value) }))}>
                {memberTypes.map((m) => (
                  <option key={m.memberTypeId} value={m.memberTypeId}>
                    {m.displayName} {m.discountPercent > 0 ? `(ส่วนลด ${m.discountPercent}%)` : '(ราคาปกติ)'}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">ควรตรวจสอบบัตรนักศึกษา/บุคลากรก่อนเปลี่ยนเป็นประเภทที่มีส่วนลด</p>
            </div>
            <label className={`flex items-center gap-3 rounded-xl bg-panel p-3 text-sm ${isSelf ? 'opacity-60' : 'cursor-pointer'}`}>
              <input type="checkbox" className="h-4 w-4" disabled={isSelf} checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              <span>
                <span className="block font-semibold text-forest-950">บัญชีใช้งานได้</span>
                <span className="block text-[11px] text-slate-500">ยกเลิกเครื่องหมายเพื่อระงับบัญชี — เข้าสู่ระบบไม่ได้ ข้อมูลและประวัติการจองยังอยู่ครบ</span>
              </span>
            </label>
            {!isSelf && editing.isActive && !form.isActive && editing.upcomingBookings > 0 && (
              <Alert tone="warning" title={`ผู้ใช้นี้มีการจองที่ยังไม่ถึงกำหนด ${editing.upcomingBookings} รายการ`}>
                การระงับบัญชีไม่ยกเลิกการจองให้อัตโนมัติ การจองเหล่านี้ยังถือครองสนามอยู่จนกว่าจะถึงเวลา ถูกยกเลิก หรือหมดเวลาชำระ — หากต้องการปล่อยสนาม
                ให้เจ้าหน้าที่ตรวจสอบและยกเลิกการจองเหล่านั้นก่อนหรือหลังระงับ
              </Alert>
            )}
            {willLogout && (
              <Alert tone="warning" title="ผู้ใช้จะถูกออกจากระบบทันที">
                การระงับบัญชีหรือเปลี่ยนบทบาทจะยกเลิกการเข้าสู่ระบบทุกอุปกรณ์ของผู้ใช้นี้ ต้องเข้าสู่ระบบใหม่
              </Alert>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setEditing(null)} className="btn-outline">
                ยกเลิก
              </button>
              <button type="submit" disabled={saveMutation.isPending} className={!form.isActive && editing.isActive ? 'btn-danger' : 'btn-primary'}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} บันทึก
              </button>
            </div>
          </form>
        )}
      </Modal>
    </StaffLayout>
  );
};
