import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAdminPromotionsApi,
  createAdminPromotionApi,
  updateAdminPromotionApi,
  deleteAdminPromotionApi,
  PromotionAdmin,
  PromotionInput,
} from '../services/admin';
import { StaffLayout } from '../components/layout/StaffLayout';
import { Alert, ConfirmModal, EmptyState, LoadingState, Modal, PageHeader, StatCard, apiErrorMessage, formatThaiDate, todayISO } from '../components/ui';
import { CalendarDays, Clock, Loader2, Pencil, Percent, Plus, Tag, Timer, TicketPercent, Trash2 } from 'lucide-react';

// จัดการโปรโมชั่น (BR14: เฉพาะผู้ดูแลระบบ / BR15: ใช้ได้เฉพาะช่วงวันที่และเวลาที่กำหนด)
export const AdminPromotionsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PromotionAdmin | null>(null); // null = สร้างใหม่
  const [deleting, setDeleting] = useState<PromotionAdmin | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [discountValue, setDiscountValue] = useState<number>(10);
  const [minBookingHours, setMinBookingHours] = useState<number>(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const { data: promotions = [], isLoading } = useQuery({ queryKey: ['adminPromotions'], queryFn: getAdminPromotionsApi });

  const openCreate = () => {
    setEditing(null);
    setCode('');
    setTitle('');
    setDiscountType('PERCENT');
    setDiscountValue(10);
    setMinBookingHours(1);
    setStartDate('');
    setEndDate('');
    setStartTime('');
    setEndTime('');
    setIsActive(true);
    setErrorMsg('');
    setShowModal(true);
  };

  const openEdit = (p: PromotionAdmin) => {
    setEditing(p);
    setCode(p.code);
    setTitle(p.title);
    setDiscountType(p.discountType);
    setDiscountValue(p.discountValue);
    setMinBookingHours(p.minBookingHours);
    setStartDate(p.startDate);
    setEndDate(p.endDate);
    setStartTime(p.startTime || '');
    setEndTime(p.endTime || '');
    setIsActive(p.isActive);
    setErrorMsg('');
    setShowModal(true);
  };

  const saveMutation = useMutation({
    mutationFn: (input: PromotionInput) => (editing ? updateAdminPromotionApi(editing.promotionId, input) : createAdminPromotionApi(input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminPromotions'] });
      setShowModal(false);
      setSuccessMsg(editing ? `แก้ไขโปรโมชั่น ${code} เรียบร้อย` : `สร้างโปรโมชั่น ${code} เรียบร้อย`);
    },
    onError: (err) => setErrorMsg(apiErrorMessage(err, 'บันทึกโปรโมชั่นไม่สำเร็จ')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAdminPromotionApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminPromotions'] });
      setSuccessMsg(`ลบโปรโมชั่น ${deleting?.code} เรียบร้อย`);
      setDeleting(null);
    },
    onError: (err) => setDeleteError(apiErrorMessage(err, 'ลบโปรโมชั่นไม่สำเร็จ')),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (new Date(startDate) > new Date(endDate)) {
      setErrorMsg('วันสิ้นสุดต้องไม่ก่อนวันเริ่มโปรโมชั่น');
      return;
    }
    if (!!startTime !== !!endTime) {
      setErrorMsg('ต้องระบุเวลาเริ่มและเวลาสิ้นสุดให้ครบทั้งคู่ (หรือเว้นว่างทั้งคู่ = ใช้ได้ทุกช่วงเวลา)');
      return;
    }
    saveMutation.mutate({
      code,
      title,
      discountType,
      discountValue,
      minBookingHours,
      startDate,
      endDate,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      isActive,
    });
  };

  const today = todayISO();
  const stateOf = (p: PromotionAdmin) =>
    !p.isActive ? 'ปิดใช้งาน' : today < p.startDate ? 'ยังไม่เริ่ม' : today > p.endDate ? 'หมดอายุ' : 'ใช้งานได้';
  const activeCount = promotions.filter((p) => stateOf(p) === 'ใช้งานได้').length;

  return (
    <StaffLayout>
      <PageHeader
        code="Promotions"
        eyebrow="บริหารจัดการระบบ"
        title="จัดการโปรโมชั่นและส่วนลด"
        subtitle="เฉพาะผู้ดูแลระบบเท่านั้นที่กำหนดโปรโมชั่นได้ และโปรโมชั่นใช้ได้เฉพาะช่วงวันที่และเวลาที่กำหนด"
        actions={
          <button onClick={openCreate} className="btn-primary">
            <Plus className="h-4 w-4" /> สร้างโปรโมชั่นใหม่
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="โปรโมชั่นทั้งหมด" value={promotions.length} unit="รายการ" icon={<Tag className="h-5 w-5" />} />
        <StatCard label="ใช้งานได้วันนี้" value={activeCount} unit="รายการ" icon={<TicketPercent className="h-5 w-5" />} tone="blue" />
        <StatCard label="หมดอายุ / ยังไม่เริ่ม / ปิด" value={promotions.length - activeCount} unit="รายการ" icon={<Timer className="h-5 w-5" />} tone="amber" />
      </div>

      {successMsg && <Alert tone="success" title={successMsg} onClose={() => setSuccessMsg('')} />}

      {isLoading ? (
        <LoadingState label="กำลังโหลดโปรโมชั่น..." />
      ) : promotions.length === 0 ? (
        <EmptyState title="ยังไม่มีโปรโมชั่น" />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {promotions.map((promo: PromotionAdmin) => {
            const st = stateOf(promo);
            const p: any = promo;
            return (
              <div key={promo.promotionId} className="card relative space-y-4 overflow-hidden p-6">
                <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-mint-100" />
                <div className="relative flex items-center justify-between">
                  <span className="badge-forest font-mono text-xs">CODE: {promo.code}</span>
                  <span className={st === 'ใช้งานได้' ? 'badge-mint' : st === 'หมดอายุ' ? 'badge-rose' : 'badge-amber'}>{st}</span>
                </div>
                <div className="relative">
                  <h3 className="font-bold text-forest-950">{promo.title}</h3>
                  <div className="mt-1 flex items-center gap-2 text-3xl font-bold text-forest-700">
                    <Percent className="h-6 w-6" />
                    {promo.discountType === 'PERCENT' ? `${promo.discountValue}% OFF` : `฿${promo.discountValue} OFF`}
                  </div>
                </div>
                <div className="relative space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-forest-600" /> {formatThaiDate(promo.startDate, 'short')} – {formatThaiDate(promo.endDate, 'short')}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-forest-600" />
                    {p.startTime && p.endTime ? `ใช้ได้เฉพาะ ${p.startTime} - ${p.endTime} น.` : 'ใช้ได้ทุกช่วงเวลา'}
                  </div>
                  <div>
                    จองขั้นต่ำ <strong>{promo.minBookingHours}</strong> ชั่วโมง
                  </div>
                </div>
                <div className="relative flex justify-end gap-1.5 border-t border-slate-100 pt-3">
                  <button onClick={() => openEdit(promo)} className="btn-soft px-2.5 py-1.5 text-xs" aria-label={`แก้ไข ${promo.code}`}>
                    <Pencil className="h-3.5 w-3.5" /> แก้ไข
                  </button>
                  <button
                    onClick={() => {
                      setDeleteError('');
                      setDeleting(promo);
                    }}
                    className="btn-danger-soft px-2.5 py-1.5 text-xs"
                    aria-label={`ลบ ${promo.code}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> ลบ
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={!!deleting}
        danger
        title="ลบโปรโมชั่น"
        confirmLabel="ลบโปรโมชั่น"
        busy={deleteMutation.isPending}
        error={deleteError}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.promotionId)}
        message={
          <>
            ต้องการลบโปรโมชั่น <strong className="font-mono">{deleting?.code}</strong> หรือไม่? ลบได้เฉพาะโปรโมชั่นที่ยังไม่เคยถูกใช้กับการจอง
            ถ้าเคยใช้แล้วให้ใช้ "แก้ไข" แล้วปิดการใช้งานแทน
          </>
        }
      />

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? `แก้ไขโปรโมชั่น ${editing.code}` : 'สร้างโค้ดโปรโมชั่น'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && <Alert tone="error" title={errorMsg} />}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">โค้ดโปรโมชั่น</label>
              <input required className="input font-mono uppercase" placeholder="เช่น SUMMER20" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className="label">จองขั้นต่ำ (ชั่วโมง)</label>
              <input type="number" min="1" className="input" value={minBookingHours} onChange={(e) => setMinBookingHours(parseInt(e.target.value, 10) || 1)} />
            </div>
          </div>
          <div>
            <label className="label">ชื่อโปรโมชั่น</label>
            <input required className="input" placeholder="เช่น ลดพิเศษหน้าร้อน 20%" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">ประเภทส่วนลด</label>
              <select className="input" value={discountType} onChange={(e) => setDiscountType(e.target.value as any)}>
                <option value="PERCENT">เปอร์เซ็นต์ (%)</option>
                <option value="FIXED">จำนวนเงิน (฿)</option>
              </select>
            </div>
            <div>
              <label className="label">มูลค่าส่วนลด</label>
              <input type="number" min="1" required className="input" value={discountValue} onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">วันเริ่ม</label>
              <input type="date" required className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label">วันสิ้นสุด</label>
              <input type="date" required className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">เวลาเริ่มของแต่ละวัน (ไม่บังคับ)</label>
              <input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="label">เวลาสิ้นสุดของแต่ละวัน (ไม่บังคับ)</label>
              <input type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-panel p-3 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span className="font-semibold text-forest-950">เปิดใช้งานโปรโมชั่นนี้</span>
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setShowModal(false)} className="btn-outline">
              ยกเลิก
            </button>
            <button type="submit" disabled={saveMutation.isPending} className="btn-primary">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} บันทึกโปรโมชั่น
            </button>
          </div>
        </form>
      </Modal>
    </StaffLayout>
  );
};
