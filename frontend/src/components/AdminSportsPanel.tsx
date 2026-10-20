import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SportType, createAdminSportApi, deleteAdminSportApi, updateAdminSportApi } from '../services/admin';
import { Alert, ConfirmModal, EmptyState, Modal, apiErrorMessage, sportLabel } from './ui';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

// จัดการประเภทกีฬา (เพิ่ม/แก้ไข/ลบ) — ลบได้เฉพาะประเภทที่ยังไม่มีสนามหรืออุปกรณ์ใช้อยู่ ไม่งั้นให้ปิดการใช้งานแทน
export const AdminSportsPanel: React.FC<{ sports: SportType[] }> = ({ sports }) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SportType | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SportType | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['adminSports'] });
    queryClient.invalidateQueries({ queryKey: ['adminEquipment'] });
  };

  const openEditor = (target: SportType | 'new') => {
    setEditing(target);
    setName(target === 'new' ? '' : target.name);
    setDescription(target === 'new' ? '' : target.description || '');
    setIsActive(target === 'new' ? true : target.isActive);
    setErrorMsg('');
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), description: description.trim() || undefined, isActive };
      return editing && editing !== 'new' ? updateAdminSportApi(editing.sportTypeId, payload) : createAdminSportApi(payload);
    },
    onSuccess: () => {
      refresh();
      setSuccessMsg(editing === 'new' ? `เพิ่มประเภทกีฬา "${name.trim().toUpperCase()}" เรียบร้อย` : 'บันทึกประเภทกีฬาเรียบร้อย');
      setEditing(null);
    },
    onError: (err) => setErrorMsg(apiErrorMessage(err, 'บันทึกประเภทกีฬาไม่สำเร็จ')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAdminSportApi(id),
    onSuccess: () => {
      refresh();
      setSuccessMsg(`ลบประเภทกีฬา "${deleting?.name}" เรียบร้อย`);
      setDeleting(null);
    },
    onError: (err) => setDeleteError(apiErrorMessage(err, 'ลบประเภทกีฬาไม่สำเร็จ')),
  });

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-forest-950">ประเภทกีฬา</h2>
          <p className="text-xs text-slate-500">หมวดหมู่ที่ใช้จัดกลุ่มสนามและอุปกรณ์ · ชื่อที่บันทึกจะเป็นตัวพิมพ์ใหญ่ (เช่น BADMINTON)</p>
        </div>
        <button onClick={() => openEditor('new')} className="btn-soft">
          <Plus className="h-4 w-4" /> เพิ่มประเภทกีฬา
        </button>
      </div>

      {successMsg && <Alert tone="success" title={successMsg} onClose={() => setSuccessMsg('')} />}

      {sports.length === 0 ? (
        <EmptyState title="ยังไม่มีประเภทกีฬา" />
      ) : (
        <div className="divide-y divide-slate-100">
          {sports.map((s) => (
            <div key={s.sportTypeId} className="flex items-center justify-between gap-3 py-3">
              <div>
                <div className="flex items-center gap-2 font-semibold text-forest-950">
                  {sportLabel(s.name)} <span className="font-mono text-[11px] font-normal text-slate-400">{s.name}</span>
                  {s.isActive ? <span className="badge-mint">เปิดใช้งาน</span> : <span className="badge-slate">ปิดใช้งาน</span>}
                </div>
                {s.description && <div className="text-xs text-slate-500">{s.description}</div>}
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => openEditor(s)} className="btn-soft px-2.5 py-1.5 text-xs" aria-label={`แก้ไข ${s.name}`}>
                  <Pencil className="h-3.5 w-3.5" /> แก้ไข
                </button>
                <button
                  onClick={() => {
                    setDeleteError('');
                    setDeleting(s);
                  }}
                  className="btn-danger-soft px-2.5 py-1.5 text-xs"
                  aria-label={`ลบ ${s.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" /> ลบ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'เพิ่มประเภทกีฬา' : 'แก้ไขประเภทกีฬา'}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setErrorMsg('');
            saveMutation.mutate();
          }}
          className="space-y-4"
        >
          {errorMsg && <Alert tone="error" title={errorMsg} />}
          <div>
            <label className="label">ชื่อประเภทกีฬา (ภาษาอังกฤษ)</label>
            <input required minLength={2} maxLength={50} className="input font-mono uppercase" placeholder="เช่น VOLLEYBALL" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">คำอธิบาย</label>
            <input maxLength={255} className="input" placeholder="เช่น สนามวอลเลย์บอล" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-panel p-3 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span>
              <span className="block font-semibold text-forest-950">เปิดใช้งาน</span>
              <span className="block text-[11px] text-slate-500">
                ปิดใช้งาน = ซ่อนประเภทนี้จากตัวกรองฝั่งลูกค้า (สนามและอุปกรณ์เดิมยังอยู่ ไม่ถูกลบ) · ถ้ามีสนามหรืออุปกรณ์ใช้อยู่จะลบไม่ได้
              </span>
            </span>
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setEditing(null)} className="btn-outline">
              ยกเลิก
            </button>
            <button type="submit" disabled={saveMutation.isPending} className="btn-primary">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} บันทึก
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleting}
        danger
        title="ลบประเภทกีฬา"
        confirmLabel="ลบประเภทกีฬา"
        busy={deleteMutation.isPending}
        error={deleteError}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.sportTypeId)}
        message={
          <>
            ต้องการลบประเภทกีฬา <strong>{deleting && sportLabel(deleting.name)}</strong> หรือไม่? ลบได้เฉพาะที่ยังไม่มีสนามหรืออุปกรณ์ใช้อยู่
            (อัตราราคาที่ผูกกับประเภทนี้จะถูกลบไปด้วย)
          </>
        }
      />
    </div>
  );
};
