import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAdminRolesApi, getAdminPermissionsApi, updateRolePermissionsApi, RoleWithPermissions } from '../services/admin';
import { useAuth } from '../context/AuthContext';
import { StaffLayout } from '../components/layout/StaffLayout';
import { LoadingState, PageHeader } from '../components/ui';
import { CheckCircle2, RefreshCw, Save, XCircle } from 'lucide-react';

// จัดการสิทธิ์ของแต่ละบทบาท (role_permissions) — แก้แล้วมีผลทันทีโดยไม่ต้อง deploy หรือ login ใหม่
export const AdminRolesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const [draft, setDraft] = useState<Record<number, Set<string>>>({});
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const { data: roles = [], isLoading: rolesLoading, refetch, isFetching } = useQuery({
    queryKey: ['adminRoles'],
    queryFn: getAdminRolesApi,
  });
  const { data: permissions = [], isLoading: permsLoading } = useQuery({
    queryKey: ['adminPermissions'],
    queryFn: getAdminPermissionsApi,
  });

  // ตั้งค่าร่างจากข้อมูลล่าสุดของเซิร์ฟเวอร์
  useEffect(() => {
    setDraft(Object.fromEntries(roles.map((r) => [r.roleId, new Set(r.permissions)])));
  }, [roles]);

  const isDirty = (role: RoleWithPermissions) => {
    const current = draft[role.roleId];
    if (!current) return false;
    return current.size !== role.permissions.length || role.permissions.some((c) => !current.has(c));
  };

  const saveMutation = useMutation({
    mutationFn: ({ roleId, codes }: { roleId: number; codes: string[] }) => updateRolePermissionsApi(roleId, codes),
    onSuccess: async (role) => {
      await queryClient.invalidateQueries({ queryKey: ['adminRoles'] });
      await refreshUser(); // ถ้าแก้สิทธิ์ของบทบาทตัวเอง เมนูจะอัปเดตทันที
      setErrorMsg('');
      setSuccessMsg(`บันทึกสิทธิ์ของบทบาท ${role.roleName} เรียบร้อย`);
    },
    onError: (err: any) => {
      setSuccessMsg('');
      setErrorMsg(err.response?.data?.message || 'บันทึกสิทธิ์ไม่สำเร็จ');
    },
  });

  const toggle = (roleId: number, code: string) => {
    setSuccessMsg('');
    setErrorMsg('');
    setDraft((prev) => {
      const next = new Set(prev[roleId] ?? []);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return { ...prev, [roleId]: next };
    });
  };

  return (
    <StaffLayout>
      <PageHeader
        code="Role Permissions"
        eyebrow="บริหารจัดการระบบ"
        title="จัดการสิทธิ์ของแต่ละบทบาท"
        subtitle="ติ๊กเพื่อกำหนดว่าบทบาทใดทำอะไรได้บ้าง ระบบตรวจสิทธิ์จากฐานข้อมูลทุกคำขอ จึงมีผลทันทีโดยไม่ต้องเข้าสู่ระบบใหม่"
        actions={
          <button onClick={() => refetch()} className="btn-soft">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> รีเฟรช
          </button>
        }
      />

      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-mint-50 px-4 py-3 text-sm text-forest-800">
          <CheckCircle2 className="h-4 w-4" /> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <XCircle className="h-4 w-4" /> {errorMsg}
        </div>
      )}

      {rolesLoading || permsLoading ? (
        <LoadingState label="กำลังโหลดสิทธิ์..." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-panel text-[11px] text-slate-600">
                <th className="px-4 py-3">สิทธิ์</th>
                {roles.map((r) => (
                  <th key={r.roleId} className="px-4 py-3 text-center">
                    <div className="font-semibold text-forest-900">{r.roleName}</div>
                    {r.description && <div className="font-normal text-slate-400">{r.description}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {permissions.map((p) => (
                <tr key={p.permissionId} className="hover:bg-panel/50">
                  <td className="px-4 py-3">
                    <div className="font-mono text-[11px] font-semibold text-forest-950">{p.code}</div>
                    <div className="text-slate-500">{p.description}</div>
                  </td>
                  {roles.map((r) => (
                    <td key={r.roleId} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-forest-700"
                        checked={draft[r.roleId]?.has(p.code) ?? false}
                        onChange={() => toggle(r.roleId, p.code)}
                        aria-label={`${r.roleName} ${p.code}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-panel/60">
                <td className="px-4 py-3 text-slate-500">บันทึกการเปลี่ยนแปลง</td>
                {roles.map((r) => (
                  <td key={r.roleId} className="px-4 py-3 text-center">
                    <button
                      className="btn-primary px-3 py-1.5 text-xs disabled:opacity-40"
                      disabled={!isDirty(r) || saveMutation.isPending}
                      onClick={() => saveMutation.mutate({ roleId: r.roleId, codes: Array.from(draft[r.roleId] ?? []) })}
                    >
                      <Save className="h-3.5 w-3.5" /> บันทึก
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </StaffLayout>
  );
};
