import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { borrowEquipmentApi, getBorrowingsByBookingApi } from '../services/borrowing';
import { getEquipmentApi, lookupBookingByNumberApi, staffCheckInApi } from '../services/booking';
import { Equipment, Booking } from '../types/booking';
import { StaffLayout } from '../components/layout/StaffLayout';
import { useStaffSummary } from '../components/ui/useStaffSummary';
import { Alert, PageHeader, StatCard, StatusBadge, apiErrorMessage, formatDateTime, formatThaiDate } from '../components/ui';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Dumbbell,
  Loader2,
  LogIn,
  Minus,
  Package,
  Plus,
  RotateCcw,
  ScanLine,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';

const combine = (date: string, time: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
};

// UCS-5.1 เช็คอินเข้าใช้สนาม + UCS-5.2 บันทึกการส่งมอบอุปกรณ์ (Dispatch)
export const StaffBorrowPage: React.FC = () => {
  const summary = useStaffSummary();

  // ค้นหาการจอง / เช็คอิน
  const [searchInput, setSearchInput] = useState('');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);

  // ส่งมอบอุปกรณ์ (เดิม)
  const [bookingNumber, setBookingNumber] = useState('');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number>(1);
  const [quantity, setQuantity] = useState<number>(1);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: equipmentList = [] } = useQuery<Equipment[]>({
    queryKey: ['equipmentListAll'],
    queryFn: () => getEquipmentApi(),
  });

  const { data: borrowings = [], refetch: refetchBorrowings } = useQuery({
    queryKey: ['bookingBorrowings', booking?.bookingId],
    queryFn: () => getBorrowingsByBookingApi(booking!.bookingId),
    enabled: !!booking,
  });

  // อุปกรณ์ที่แสดง: เฉพาะประเภทกีฬาของการจอง (ถ้าค้นหาการจองแล้ว)
  const sportTypeId = (booking as any)?.sportTypeId as number | undefined;
  const visibleEquipment = useMemo(
    () => (sportTypeId ? equipmentList.filter((e) => e.sportTypeId === sportTypeId) : equipmentList),
    [equipmentList, sportTypeId]
  );
  useEffect(() => {
    if (visibleEquipment.length && !visibleEquipment.some((e) => e.equipmentId === selectedEquipmentId)) {
      setSelectedEquipmentId(visibleEquipment[0].equipmentId);
    }
  }, [visibleEquipment]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    setMessage(null);
    setLookupLoading(true);
    try {
      const found = await lookupBookingByNumberApi(searchInput.trim().replace(/^#/, ''));
      setBooking(found);
      setBookingNumber(found.bookingNumber);
    } catch (err) {
      setBooking(null);
      setMessage({ type: 'error', text: apiErrorMessage(err) });
    } finally {
      setLookupLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!booking) return;
    setMessage(null);
    setCheckInLoading(true);
    try {
      const updated = await staffCheckInApi(booking.bookingNumber);
      setBooking(updated);
      setMessage({ type: 'success', text: `เช็คอินการจอง ${updated.bookingNumber} สำเร็จ — สถานะเปลี่ยนเป็น CHECKED_IN และแจ้งลูกค้าแล้ว` });
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) });
    } finally {
      setCheckInLoading(false);
    }
  };

  const handleBorrow = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsSubmitting(true);
    try {
      const res = await borrowEquipmentApi({
        bookingNumber: bookingNumber.trim(),
        equipmentId: selectedEquipmentId,
        quantity,
      });

      setMessage({
        type: 'success',
        text: `บันทึกการส่งมอบ ${res.equipmentName} จำนวน ${res.quantity} ชิ้น ให้การจอง ${res.bookingNumber} เรียบร้อย (กำหนดคืน ${formatDateTime(res.expectedReturnAt)})`,
      });
      setQuantity(1);
      refetchBorrowings();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Borrow operation rejected',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ตรวจเงื่อนไข BR8 เพื่อแสดงผล (ระบบหลังบ้านตรวจซ้ำอีกครั้งตอนกดยืนยัน)
  const br8 = useMemo(() => {
    if (!booking) return null;
    const now = new Date();
    const start = combine(booking.bookingDate, booking.startTime);
    const end = combine(booking.bookingDate, booking.endTime);
    const minutesBefore = Math.round((start.getTime() - now.getTime()) / 60000);
    if (!['CONFIRMED', 'PAYMENT_VERIFIED'].includes(booking.status))
      return { ok: false, text: booking.status === 'PENDING_PAYMENT' ? 'รายการยังไม่ได้ชำระเงิน' : `สถานะการจอง ${booking.status}` };
    if (minutesBefore > 30) return { ok: false, text: `ยังไม่ถึงเวลาเช็คอิน (อีก ${minutesBefore} นาทีถึงเวลาเริ่ม — เช็คอินได้ก่อนไม่เกิน 30 นาที)` };
    if (now >= end) return { ok: false, text: 'เลยเวลาการจองแล้ว' };
    return { ok: true, text: minutesBefore > 0 ? `ก่อนเวลาเริ่ม ${minutesBefore} นาที — อยู่ในเกณฑ์อนุญาต (≤ 30 นาที)` : 'อยู่ในช่วงเวลาการจอง' };
  }, [booking]);

  const reserved = booking?.equipment || [];
  const selectedEq = equipmentList.find((e) => e.equipmentId === selectedEquipmentId);

  return (
    <StaffLayout>
      <PageHeader
        code="Check-in & Equipment"
        eyebrow="เคาน์เตอร์บริการ"
        title="ระบบเช็คอินเข้าสนามและส่งมอบอุปกรณ์กีฬา"
        subtitle="ตรวจสอบสิทธิ์การเข้าสนามตามเวลา บันทึกการจ่ายอุปกรณ์ และไปยังหน้ารับคืนเพื่อคำนวณค่าปรับ"
        actions={
          <Link to="/staff/equipment/return" className="btn-soft">
            <RotateCcw className="h-4 w-4" /> ไปหน้ารับคืนอุปกรณ์
          </Link>
        }
      />

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="การจองที่ชำระแล้ววันนี้" value={summary.todayBookings} unit="รายการ" icon={<CalendarClock className="h-5 w-5" />} />
          <StatCard label="เช็คอินแล้ววันนี้" value={summary.todayCheckIns} unit="รายการ" icon={<Users className="h-5 w-5" />} tone="blue" />
          <StatCard label="อุปกรณ์ที่ถูกยืมอยู่" value={summary.outstandingBorrowings} unit="รายการ" icon={<Dumbbell className="h-5 w-5" />} />
          <StatCard label="สลิปรอตรวจ / คืนเงินรออนุมัติ" value={`${summary.pendingPaymentSlips} / ${summary.pendingRefunds}`} icon={<AlertTriangle className="h-5 w-5" />} tone="rose" />
        </div>
      )}

      {message && (
        <Alert tone={message.type} title={message.type === 'success' ? 'ทำรายการสำเร็จ' : 'ระบบปฏิเสธการทำรายการ'} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {/* UCS-5.1 ค้นหาและเช็คอิน */}
      <section className="card space-y-5 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-forest-900 text-mint-300">
            <LogIn className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-forest-950">ค้นหาและเช็คอินเข้าใช้งานสนาม (Check-in Court)</h2>
            <p className="text-xs text-slate-500">สแกน/กรอกรหัสการจองจาก Digital Pass ของลูกค้า ระบบตรวจสอบการชำระเงินและเวลาเช็คอิน</p>
          </div>
        </div>
        <form onSubmit={handleLookup} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              className="input pl-10 font-mono"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="#BK-20261020-XXXXXX"
            />
          </div>
          <button type="submit" disabled={lookupLoading} className="btn-primary">
            {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />} ค้นหา / สแกน Digital Pass
          </button>
        </form>

        {booking && (
          <div className="grid gap-4 rounded-2xl bg-panel p-5 lg:grid-cols-[1fr_1fr_1fr]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge-forest font-mono">#{booking.bookingNumber}</span>
                <StatusBadge status={booking.status} />
              </div>
              <div className="mt-2 text-xl font-bold text-forest-950">{booking.userName}</div>
              <div className="text-xs text-slate-500">Member ID: {booking.userId}</div>
            </div>
            <div className="space-y-1 rounded-xl bg-white p-4 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">สนามที่จองไว้:</span>
                <span className="font-semibold">{booking.courtName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">วันที่:</span>
                <span className="font-semibold">{formatThaiDate(booking.bookingDate, 'short')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ช่วงเวลาจอง:</span>
                <span className="badge-mint">
                  {booking.startTime} - {booking.endTime} น.
                </span>
              </div>
            </div>
            <div className="space-y-3">
              {br8 && (
                <div className={`rounded-xl p-3 text-xs ${br8.ok ? 'bg-mint-50 text-forest-900 ring-1 ring-mint-200' : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'}`}>
                  <div className="flex items-center gap-1.5 font-semibold">
                    {br8.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    เงื่อนไขการเช็คอิน {br8.ok ? 'ถูกต้อง' : 'ยังไม่ผ่าน'}
                  </div>
                  <div className="mt-0.5">{br8.text}</div>
                </div>
              )}
              <button onClick={handleCheckIn} disabled={checkInLoading || booking.status === 'CHECKED_IN'} className="btn-primary w-full">
                {checkInLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {booking.status === 'CHECKED_IN' ? 'เช็คอินแล้ว' : 'ยืนยันการเช็คอินเข้าสนาม'}
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* UCS-5.2 Dispatch */}
        <form onSubmit={handleBorrow} className="card space-y-5 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-forest-800">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-forest-950">รายการจ่ายอุปกรณ์ (Dispatch)</h2>
              <p className="text-xs text-slate-500">ยืมได้เฉพาะผู้ที่มีการจองสนามในวันและเวลานั้น</p>
            </div>
          </div>

          <div>
            <label className="label">รหัสการจอง (Booking Reference)</label>
            <input
              required
              className="input font-mono"
              value={bookingNumber}
              onChange={(e) => setBookingNumber(e.target.value)}
              placeholder="เช่น BK-20261025-9A3F21"
            />
          </div>

          {reserved.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-600">อุปกรณ์ที่ลูกค้าจองไว้ล่วงหน้า (คลิกเพื่อเลือก)</div>
              {reserved.map((r) => (
                <button
                  type="button"
                  key={r.bookingEquipmentId}
                  onClick={() => {
                    setSelectedEquipmentId(r.equipmentId);
                    setQuantity(r.quantity);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm ${
                    selectedEquipmentId === r.equipmentId ? 'bg-mint-50 ring-1 ring-mint-200' : 'bg-panel'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-forest-600" /> {r.equipmentName}
                  </span>
                  <span className="badge-mint">จองไว้ {r.quantity} ชิ้น</span>
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div>
              <label className="label">เลือกอุปกรณ์</label>
              <select className="input" value={selectedEquipmentId} onChange={(e) => setSelectedEquipmentId(parseInt(e.target.value, 10))}>
                {visibleEquipment.map((eq: Equipment) => (
                  <option key={eq.equipmentId} value={eq.equipmentId}>
                    {eq.name} (คงเหลือ {eq.availableQuantity} ชิ้น)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">จำนวนที่จ่ายจริง</label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="btn-soft h-10 w-10 p-0">
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  required
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
                  className="input w-16 text-center"
                />
                <button type="button" onClick={() => setQuantity((q) => q + 1)} className="btn-soft h-10 w-10 p-0">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          {selectedEq && (
            <div className="text-[11px] text-slate-500">
              ค่าเช่า ฿{selectedEq.rentalFee}/ชิ้น • ราคาประเมิน ฿{selectedEq.replacementCost}/ชิ้น (ใช้คิดค่าปรับกรณีชำรุด/สูญหาย)
            </div>
          )}

          <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3">
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> กำลังบันทึก...
              </>
            ) : (
              <>
                <Dumbbell className="h-4 w-4" /> บันทึกการส่งมอบอุปกรณ์ (Dispatch Complete)
              </>
            )}
          </button>
        </form>

        {/* รายการยืมของการจองนี้ */}
        <div className="card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-forest-950">อุปกรณ์ที่ส่งมอบแล้วของการจองนี้</h2>
            {booking && <span className="badge-slate font-mono">#{booking.bookingNumber}</span>}
          </div>
          {!booking ? (
            <div className="rounded-xl bg-panel p-6 text-center text-xs text-slate-500">ค้นหาการจองด้านบนเพื่อดูรายการยืมอุปกรณ์</div>
          ) : borrowings.length === 0 ? (
            <div className="rounded-xl bg-panel p-6 text-center text-xs text-slate-500">ยังไม่มีการส่งมอบอุปกรณ์</div>
          ) : (
            borrowings.map((b) => (
              <div key={b.borrowingId} className="flex items-center justify-between rounded-xl bg-panel px-4 py-3 text-xs">
                <div>
                  <div className="text-sm font-semibold text-forest-950">
                    {b.equipmentName} × {b.quantity}
                  </div>
                  <div className="text-slate-500">
                    ยืมเมื่อ {formatDateTime(b.borrowedAt)} • กำหนดคืน {formatDateTime(b.expectedReturnAt)}
                  </div>
                </div>
                <StatusBadge status={b.status} />
              </div>
            ))
          )}
          <div className="rounded-xl bg-rose-50 p-4 text-xs text-rose-900">
            <div className="font-semibold">กำหนดคืนและค่าปรับ</div>
            ต้องคืนอุปกรณ์ภายในเวลาสิ้นสุดการจอง คืนช้าคิด 20 บาท / 15 นาที / ชิ้น ชำรุดหรือสูญหายคิดตามราคาประเมินของอุปกรณ์
          </div>
          <Link to="/staff/equipment/return" className="btn-soft w-full">
            <RotateCcw className="h-4 w-4" /> ตรวจรับคืนอุปกรณ์ & คำนวณค่าปรับ
          </Link>
        </div>
      </div>

      <section className="card-soft grid gap-3 p-5 text-xs text-slate-600 md:grid-cols-2">
        <div>
          <strong className="text-forest-900">ช่วงเวลาเช็คอิน:</strong> อนุญาตให้เช็คอินได้ก่อนเวลาเริ่มใช้งานไม่เกิน 30 นาที และต้องชำระเงินแล้วเท่านั้น
        </div>
        <div>
          <strong className="text-forest-900">สิทธิ์การยืมอุปกรณ์:</strong> ระบบปฏิเสธการยืมหากไม่มีการจองที่ชำระแล้วในวันและเวลานั้น
        </div>
      </section>
    </StaffLayout>
  );
};
