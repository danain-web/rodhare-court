import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAdminSettingsApi, updateAdminSettingApi, AppSetting } from '../services/admin';
import { StaffLayout } from '../components/layout/StaffLayout';
import { LoadingState, PageHeader } from '../components/ui';
import { CheckCircle2, Save, XCircle } from 'lucide-react';

// ตั้งค่าระบบที่ผู้ดูแลปรับได้ เช่น ช่วงเวลาเช็กอิน — เก็บในตาราง app_settings ไม่ฝังในโค้ด
export const AdminSettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const { data: settings = [], isLoading } = useQuery({ queryKey: ['adminSettings'], queryFn: getAdminSettingsApi });

  useEffect(() => {
    setDraft(Object.fromEntries(settings.map((s) => [s.key, String(s.value)])));
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: number }) => updateAdminSettingApi(key, value),
    onSuccess: async (s) => {
      await queryClient.invalidateQueries({ queryKey: ['adminSettings'] });
      setErrorMsg('');
      setSuccessMsg(`บันทึก "${s.description}" = ${s.value} เรียบร้อย`);
    },
    onError: (err: any) => {
      setSuccessMsg('');
      setErrorMsg(err.response?.data?.message || 'บันทึกไม่สำเร็จ');
    },
  });

  const isDirty = (s: AppSetting) => draft[s.key] !== undefined && draft[s.key] !== String(s.value);

  return (
    <StaffLayout>
      <PageHeader
        code="System Settings"
        eyebrow="บริหารจัดการระบบ"
        title="ตั้งค่าระบบ"
        subtitle="ปรับช่วงเวลาเช็กอินและค่าที่เกี่ยวข้อง มีผลกับการจองทันที ไม่ต้อง deploy ใหม่"
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

      {isLoading ? (
        <LoadingState label="กำลังโหลดค่าตั้งค่า..." />
      ) : (
        <div className="card divide-y divide-slate-100">
          {settings.map((s) => (
            <div key={s.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-forest-950">{s.description}</div>
                <div className="font-mono text-[11px] text-slate-400">
                  {s.key} · ช่วงที่อนุญาต {s.min}–{s.max}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={s.min}
                  max={s.max}
                  step={1}
                  className="input w-28 py-2 text-right"
                  value={draft[s.key] ?? ''}
                  onChange={(e) => setDraft((p) => ({ ...p, [s.key]: e.target.value }))}
                  aria-label={s.description}
                />
                <button
                  className="btn-primary px-3 py-2 text-xs disabled:opacity-40"
                  disabled={!isDirty(s) || saveMutation.isPending}
                  onClick={() => saveMutation.mutate({ key: s.key, value: Number(draft[s.key]) })}
                >
                  <Save className="h-3.5 w-3.5" /> บันทึก
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </StaffLayout>
  );
};
