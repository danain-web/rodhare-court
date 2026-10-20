import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPricingRateApi, deletePricingRateApi, getAdminPricingRatesApi, getMemberTypesApi, updatePricingRateApi } from '../services/admin';
import { Court, SportType } from '../types/court';
import { Alert, ConfirmModal, EmptyState, apiErrorMessage, formatTHB, sportLabel } from './ui';
import { Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';

// อัตราค่าบริการตามช่วงเวลา / ประเภทวัน / ประเภทสมาชิก (PRICING_RATES)
export const PricingRatesPanel: React.FC<{ courts: Court[]; sports: SportType[] }> = ({ courts, sports }) => {
  const queryClient = useQueryClient();
  const { data: rates = [] } = useQuery({ queryKey: ['adminPricingRates'], queryFn: getAdminPricingRatesApi });
  const { data: memberTypes = [] } = useQuery({ queryKey: ['memberTypes'], queryFn: getMemberTypesApi });

  const [target, setTarget] = useState<string>(''); // "s:<sportTypeId>" หรือ "c:<courtId>"
  const [memberTypeId, setMemberTypeId] = useState<string>('');
  const [dayType, setDayType] = useState<'WEEKDAY' | 'WEEKEND' | 'HOLIDAY'>('WEEKDAY');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [hourlyRate, setHourlyRate] = useState<number>(100);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null); // null = กำลังเพิ่มอัตราใหม่
  const [deleting, setDeleting] = useState<any | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const memberLabel = (id?: number) => (id ? memberTypes.find((m) => m.memberTypeId === id)?.displayName || `#${id}` : 'ทุกประเภทสมาชิก');

  const startEdit = (r: any) => {
    setEditingId(r.rateId);
    setTarget(r.courtId ? `c:${r.courtId}` : `s:${r.sportTypeId}`);
    setMemberTypeId(r.memberTypeId ? String(r.memberTypeId) : '');
    setDayType(r.dayType);
    setStartTime(r.startTime);
    setEndTime(r.endTime);
    setHourlyRate(r.hourlyRate);
    setMsg(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setMsg(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) {
      setMsg({ tone: 'error', text: 'กรุณาเลือกสนามหรือประเภทกีฬาที่ใช้อัตรานี้' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const [kind, id] = target.split(':');
      const payload = {
        courtId: kind === 'c' ? Number(id) : undefined,
        sportTypeId: kind === 's' ? Number(id) : undefined,
        memberTypeId: memberTypeId ? Number(memberTypeId) : undefined,
        dayType,
        startTime,
        endTime,
        hourlyRate,
      };
      if (editingId !== null) await updatePricingRateApi(editingId, payload);
      else await createPricingRateApi(payload);
      setMsg({ tone: 'success', text: editingId !== null ? `แก้ไขอัตราค่าบริการ #${editingId} เรียบร้อย` : 'บันทึกอัตราค่าบริการเรียบร้อย' });
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['adminPricingRates'] });
    } catch (err) {
      setMsg({ tone: 'error', text: apiErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await deletePricingRateApi(deleting.rateId);
      if (editingId === deleting.rateId) setEditingId(null);
      setMsg({ tone: 'success', text: `ลบอัตราค่าบริการ #${deleting.rateId} เรียบร้อย` });
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ['adminPricingRates'] });
    } catch (err) {
      setDeleteError(apiErrorMessage(err));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="card space-y-5 overflow-x-auto p-6">
      <div>
        <h2 className="mb-1 text-lg font-bold text-forest-950">อัตราค่าบริการตามช่วงเวลาและประเภทสมาชิก</h2>
        <p className="text-xs text-slate-500">
          ลำดับการใช้ราคา: อัตราเฉพาะสนาม &gt; อัตราของประเภทกีฬา และอัตราของประเภทสมาชิกผู้จอง &gt; อัตราทั่วไป • ช่วงที่ไม่มีอัตราใช้ราคาพื้นฐานของสนาม
          แล้วหักส่วนลดตามประเภทสมาชิก
        </p>
      </div>

      {msg && (
        <Alert tone={msg.tone} onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      )}

      <form onSubmit={submit} className={`grid gap-3 rounded-2xl bg-panel p-4 sm:grid-cols-2 lg:grid-cols-7 ${editingId !== null ? 'ring-2 ring-mint-300' : ''}`}>
        {editingId !== null && (
          <div className="flex items-center justify-between text-xs font-semibold text-forest-800 sm:col-span-2 lg:col-span-7">
            <span>กำลังแก้ไขอัตราค่าบริการ #{editingId}</span>
            <button type="button" onClick={cancelEdit} className="inline-flex items-center gap-1 text-slate-500 hover:text-forest-800">
              <X className="h-3.5 w-3.5" /> ยกเลิกการแก้ไข
            </button>
          </div>
        )}
        <div className="lg:col-span-2">
          <label className="label">ใช้กับ</label>
          <select className="input bg-white" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">เลือกสนาม / ประเภทกีฬา</option>
            <optgroup label="ทุกสนามของประเภทกีฬา">
              {sports.map((s) => (
                <option key={`s${s.sportTypeId}`} value={`s:${s.sportTypeId}`}>
                  ทุกสนาม{sportLabel(s.name)}
                </option>
              ))}
            </optgroup>
            <optgroup label="เฉพาะสนาม">
              {courts.map((c) => (
                <option key={`c${c.courtId}`} value={`c:${c.courtId}`}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div>
          <label className="label">ประเภทสมาชิก</label>
          <select className="input bg-white" value={memberTypeId} onChange={(e) => setMemberTypeId(e.target.value)}>
            <option value="">ทุกประเภท</option>
            {memberTypes.map((m) => (
              <option key={m.memberTypeId} value={m.memberTypeId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">ประเภทวัน</label>
          <select className="input bg-white" value={dayType} onChange={(e) => setDayType(e.target.value as any)}>
            <option value="WEEKDAY">จันทร์-ศุกร์</option>
            <option value="WEEKEND">เสาร์-อาทิตย์</option>
            <option value="HOLIDAY">วันหยุดนักขัตฤกษ์</option>
          </select>
        </div>
        <div>
          <label className="label">ช่วงเวลา</label>
          <div className="flex gap-1">
            <input type="time" className="input bg-white px-2" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <input type="time" className="input bg-white px-2" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">ราคา/ชม. (บาท)</label>
          <input type="number" min={1} className="input bg-white" value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value))} />
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId !== null ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{' '}
            {editingId !== null ? 'บันทึกการแก้ไข' : 'เพิ่มอัตรา'}
          </button>
        </div>
      </form>

      {rates.length === 0 ? (
        <EmptyState title="ยังไม่มีอัตราค่าบริการพิเศษ" description="ระบบใช้ราคาพื้นฐานของแต่ละสนาม" />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-panel text-left text-[11px] text-slate-600">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">ใช้กับ</th>
              <th className="px-3 py-2">ประเภทสมาชิก</th>
              <th className="px-3 py-2">ประเภทวัน</th>
              <th className="px-3 py-2">ช่วงเวลา</th>
              <th className="px-3 py-2 text-right">ราคา/ชม.</th>
              <th className="px-3 py-2 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rates.map((r: any) => (
              <tr key={r.rateId}>
                <td className="px-3 py-2.5 text-slate-500">{r.rateId}</td>
                <td className="px-3 py-2.5">
                  {r.courtId
                    ? courts.find((c) => c.courtId === r.courtId)?.name || `สนาม #${r.courtId}`
                    : `ทุกสนาม${sportLabel(sports.find((s) => s.sportTypeId === r.sportTypeId)?.name)}`}
                </td>
                <td className="px-3 py-2.5">
                  <span className={r.memberTypeId ? 'badge-mint' : 'text-slate-500'}>{memberLabel(r.memberTypeId)}</span>
                </td>
                <td className="px-3 py-2.5">{r.dayType}</td>
                <td className="px-3 py-2.5">
                  {r.startTime} - {r.endTime}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold">{formatTHB(r.hourlyRate, 0)}</td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex justify-end gap-1.5">
                    <button type="button" onClick={() => startEdit(r)} className="btn-soft px-2.5 py-1.5 text-xs" aria-label={`แก้ไขอัตรา #${r.rateId}`}>
                      <Pencil className="h-3.5 w-3.5" /> แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError('');
                        setDeleting(r);
                      }}
                      className="btn-danger-soft px-2.5 py-1.5 text-xs"
                      aria-label={`ลบอัตรา #${r.rateId}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> ลบ
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmModal
        open={!!deleting}
        danger
        title="ลบอัตราค่าบริการ"
        confirmLabel="ลบอัตรา"
        busy={deleteBusy}
        error={deleteError}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        message={
          <>
            ต้องการลบอัตราค่าบริการ #{deleting?.rateId} ({deleting?.startTime} - {deleting?.endTime}, {formatTHB(deleting?.hourlyRate, 0)}/ชม.) หรือไม่?
            ช่วงเวลานี้จะกลับไปใช้อัตราทั่วไปหรือราคาพื้นฐานของสนาม · การจองที่ทำไปแล้วไม่ถูกกระทบ
          </>
        }
      />
    </div>
  );
};
