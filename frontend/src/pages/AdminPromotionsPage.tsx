import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAdminPromotionsApi, createAdminPromotionApi, PromotionAdmin } from '../services/admin';
import { StaffLayout } from '../components/layout/StaffLayout';
import { Alert, EmptyState, LoadingState, Modal, PageHeader, StatCard, formatThaiDate, todayISO } from '../components/ui';
import { CalendarDays, Clock, Loader2, Percent, Plus, Tag, Timer, TicketPercent } from 'lucide-react';

// จัดการโปรโมชั่น (BR14: เฉพาะผู้ดูแลระบบ / BR15: ใช้ได้เฉพาะช่วงวันที่และเวลาที่กำหนด)
export const AdminPromotionsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [discountValue, setDiscountValue] = useState<number>(10);
  const [minBookingHours, setMinBookingHours] = useState<number>(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const { data: promotions = [], isLoading } = useQuery({ queryKey: ['adminPromotions'], queryFn: getAdminPromotionsApi });

  const resetForm = () => {
    setCode('');
    setTitle('');
    setDiscountType('PERCENT');
    setDiscountValue(10);
    setMinBookingHours(1);
    setStartDate('');
    setEndDate('');
    setErrorMsg('');
  };

  const createMutation = useMutation({
    mutationFn: createAdminPromotionApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminPromotions'] });
      setShowModal(false);
      setSuccessMsg(`สร้างโปรโมชั่น ${code} เรียบร้อย (BR14 & BR15)`);
      resetForm();
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || 'Failed to create promotion');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (new Date(startDate) > new Date(endDate)) {
      setErrorMsg('BR15: วันสิ้นสุดต้องไม่ก่อนวันเริ่มโปรโมชั่น');
      return;
    }
    createMutation.mutate({ code, title, discountType, discountValue, minBookingHours, startDate, endDate });
  };

  const today = todayISO();
  const stateOf = (p: PromotionAdmin) =>
    !p.isActive ? 'ปิดใช้งาน' : today < p.startDate ? 'ยังไม่เริ่ม' : today > p.endDate ? 'หมดอายุ' : 'ใช้งานได้';
  const activeCount = promotions.filter((p) => stateOf(p) === 'ใช้งานได้').length;

  return (
    <StaffLayout>
      <PageHeader
        code="BR14 / BR15"
        eyebrow="บริหารจัดการระบบ"
        title="จัดการโปรโมชั่นและส่วนลด"
        subtitle="เฉพาะผู้ดูแลระบบเท่านั้นที่กำหนดโปรโมชั่นได้ (BR14) และโปรโมชั่นใช้ได้เฉพาะช่วงวันที่และเวลาที่กำหนด (BR15)"
        actions={
          <button onClick={() => setShowModal(true)} className="btn-primary">
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
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="สร้างโค้ดโปรโมชั่น">
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
              <label className="label">วันเริ่ม (BR15)</label>
              <input type="date" required className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label">วันสิ้นสุด (BR15)</label>
              <input type="date" required className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setShowModal(false)} className="btn-outline">
              ยกเลิก
            </button>
            <button type="submit" disabled={createMutation.isPending} className="btn-primary">
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} บันทึกโปรโมชั่น
            </button>
          </div>
        </form>
      </Modal>
    </StaffLayout>
  );
};
