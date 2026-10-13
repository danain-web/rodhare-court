import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { returnEquipmentApi, getBorrowingsByBookingApi } from '../services/borrowing';
import { getEquipmentApi, lookupBookingByNumberApi } from '../services/booking';
import { Borrowing, Fine } from '../types/borrowing';
import { StaffLayout } from '../components/layout/StaffLayout';
import { Alert, EmptyState, PageHeader, StatusBadge, formatDateTime, formatTHB } from '../components/ui';
import { AlertTriangle, Calculator, CheckCircle2, Dumbbell, Loader2, PackageX, RotateCcw, Search, ShieldAlert, Wrench } from 'lucide-react';

const LATE_FEE = 20; // BR11: 20 บาท / 15 นาที / ชิ้น
const BLOCK = 15;

// UCS-5 ตรวจรับคืนอุปกรณ์และคำนวณค่าปรับ (BR10, BR11 Penalty Engine)
export const StaffReturnPage: React.FC = () => {
  const [bookingIdInput, setBookingIdInput] = useState('');
  const [borrowings, setBorrowings] = useState<Borrowing[]>([]);
  const [resolvedBookingId, setResolvedBookingId] = useState<number | null>(null);
  const [isLoadingBorrowings, setIsLoadingBorrowings] = useState(false);

  const [selectedBorrowing, setSelectedBorrowing] = useState<Borrowing | null>(null);
  const [condition, setCondition] = useState<'NORMAL' | 'DAMAGED' | 'LOST'>('NORMAL');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultFines, setResultFines] = useState<Fine[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: equipmentList = [] } = useQuery({ queryKey: ['equipmentListAll'], queryFn: () => getEquipmentApi() });

  // รับได้ทั้งเลข booking_id และหมายเลขการจอง BK-...
  const resolveBookingId = async (input: string): Promise<number> => {
    const trimmed = input.trim().replace(/^#/, '');
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    const found = await lookupBookingByNumberApi(trimmed);
    return found.bookingId;
  };

  const loadBorrowings = async (bId: number) => {
    const list = await getBorrowingsByBookingApi(bId);
    setBorrowings(list);
  };

  const handleSearchBookings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingBorrowings(true);
    setResultFines([]);
    setSuccessMessage(null);
    setError(null);
    try {
      const bId = await resolveBookingId(bookingIdInput);
      setResolvedBookingId(bId);
      await loadBorrowings(bId);
    } catch (err: any) {
      setBorrowings([]);
      setError(err.response?.data?.message || 'Failed to fetch borrowings');
    } finally {
      setIsLoadingBorrowings(false);
    }
  };

  const handleProcessReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBorrowing) return;
    setIsSubmitting(true);
    setResultFines([]);
    setSuccessMessage(null);
    setError(null);

    try {
      const res = await returnEquipmentApi({
        borrowingId: selectedBorrowing.borrowingId,
        condition,
        notes,
      });

      setSuccessMessage(`รับคืน ${selectedBorrowing.equipmentName} (${selectedBorrowing.quantity} ชิ้น) สภาพ ${condition} เรียบร้อย`);
      setResultFines(res.generatedFines);
      setSelectedBorrowing(null);
      setNotes('');

      if (resolvedBookingId) await loadBorrowings(resolvedBookingId);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to process return');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ประมาณการค่าปรับก่อนกดยืนยัน (ยอดจริงคำนวณที่หลังบ้าน)
  const estimate = useMemo(() => {
    if (!selectedBorrowing) return null;
    const lateMin = Math.max(0, Math.ceil((Date.now() - new Date(selectedBorrowing.expectedReturnAt).getTime()) / 60000));
    const blocks = lateMin > 0 ? Math.ceil(lateMin / BLOCK) : 0;
    const late = blocks * LATE_FEE * selectedBorrowing.quantity;
    const eq = equipmentList.find((x) => x.equipmentId === selectedBorrowing.equipmentId);
    const damage = condition !== 'NORMAL' ? (eq?.replacementCost || 0) * selectedBorrowing.quantity : 0;
    return { lateMin, blocks, late, damage, unitCost: eq?.replacementCost || 0, total: late + damage };
  }, [selectedBorrowing, condition, equipmentList]);

  const active = borrowings.filter((b) => b.status === 'BORROWED' || b.status === 'OVERDUE');

  return (
    <StaffLayout>
      <PageHeader
        code="UCS-5 Return Desk"
        eyebrow="เคาน์เตอร์บริการ"
        title="ตรวจรับคืนอุปกรณ์ & คำนวณค่าปรับ (BR11)"
        subtitle="ตรวจสภาพอุปกรณ์ที่ส่งคืน (ปกติ / ชำรุด / สูญหาย) ระบบคำนวณค่าปรับคืนช้าและค่าเสียหายตามราคาประเมินอัตโนมัติ"
        actions={
          <Link to="/staff/equipment/borrow" className="btn-soft">
            <Dumbbell className="h-4 w-4" /> ไปหน้าเช็คอิน & ส่งมอบ
          </Link>
        }
      />

      <form onSubmit={handleSearchBookings} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label">ค้นหาการจอง (Booking ID หรือหมายเลขการจอง BK-...)</label>
          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              required
              className="input pl-10 font-mono"
              value={bookingIdInput}
              onChange={(e) => setBookingIdInput(e.target.value)}
              placeholder="เช่น 12 หรือ BK-20261020-9A3F21"
            />
          </div>
        </div>
        <button type="submit" disabled={isLoadingBorrowings} className="btn-primary">
          {isLoadingBorrowings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} ค้นหารายการยืม
        </button>
      </form>

      {error && <Alert tone="error" title="ระบบปฏิเสธการทำรายการ" onClose={() => setError(null)}>{error}</Alert>}
      {successMessage && <Alert tone="success" title={successMessage} onClose={() => setSuccessMessage(null)} />}

      {resultFines.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <div className="flex items-center gap-2 font-semibold text-rose-800">
            <ShieldAlert className="h-5 w-5" /> ค่าปรับถูกบันทึกลงตาราง FINES อัตโนมัติ (แจ้งลูกค้าแล้ว)
          </div>
          {resultFines.map((fine) => (
            <div key={fine.fineId} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-xs">
              <div>
                <div className="font-semibold text-rose-800">
                  {fine.fineType} — {formatTHB(fine.amount)}
                </div>
                <div className="text-slate-500">{fine.reason}</div>
              </div>
              <StatusBadge status={fine.status} />
            </div>
          ))}
          <div className="flex justify-end text-sm font-bold text-rose-900">
            ยอดปรับรวม {formatTHB(resultFines.reduce((s, f) => s + f.amount, 0))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="card space-y-4 p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-forest-950">
            <RotateCcw className="h-5 w-5" /> รายการอุปกรณ์ที่ยืมของการจองนี้
            {resolvedBookingId && <span className="badge-slate">booking #{resolvedBookingId}</span>}
          </h2>
          {borrowings.length === 0 ? (
            <EmptyState title="ยังไม่มีรายการ" description="ค้นหาการจองเพื่อแสดงรายการอุปกรณ์ที่ยืม" />
          ) : (
            borrowings.map((b) => {
              const overdue = b.status === 'OVERDUE';
              return (
                <div
                  key={b.borrowingId}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ${
                    selectedBorrowing?.borrowingId === b.borrowingId ? 'bg-mint-50 ring-1 ring-mint-200' : overdue ? 'bg-rose-50' : 'bg-panel'
                  }`}
                >
                  <div className="text-xs">
                    <div className="text-sm font-semibold text-forest-950">
                      {b.equipmentName} × {b.quantity}
                    </div>
                    <div className="text-slate-500">ยืมเมื่อ {formatDateTime(b.borrowedAt)}</div>
                    <div className={overdue ? 'font-semibold text-rose-700' : 'text-slate-500'}>กำหนดคืน {formatDateTime(b.expectedReturnAt)}</div>
                    {b.actualReturnAt && <div className="text-slate-500">คืนจริง {formatDateTime(b.actualReturnAt)}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={b.status} />
                    {(b.status === 'BORROWED' || overdue) && (
                      <button
                        onClick={() => {
                          setSelectedBorrowing(b);
                          setCondition('NORMAL');
                        }}
                        className="btn-primary px-3 py-2 text-xs"
                      >
                        ตรวจรับคืน
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {borrowings.length > 0 && active.length === 0 && (
            <div className="rounded-xl bg-mint-50 p-3 text-center text-xs text-forest-800">คืนอุปกรณ์ครบทุกรายการแล้ว</div>
          )}
        </div>

        {/* แผงตรวจรับคืน + Penalty Engine */}
        <div className="card space-y-5 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-forest-950">ตรวจรับคืนอุปกรณ์ & คำนวณค่าปรับ (BR11)</h2>
              <p className="text-xs text-slate-500">{selectedBorrowing ? `${selectedBorrowing.equipmentName} × ${selectedBorrowing.quantity}` : 'เลือกรายการทางซ้ายเพื่อตรวจรับคืน'}</p>
            </div>
          </div>

          {selectedBorrowing && estimate ? (
            <form onSubmit={handleProcessReturn} className="space-y-4">
              <div>
                <label className="label">สภาพอุปกรณ์ที่รับคืน</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { k: 'NORMAL', l: 'ปกติ', i: <CheckCircle2 className="h-4 w-4" />, on: 'bg-forest-900 text-white' },
                    { k: 'DAMAGED', l: 'ชำรุด', i: <Wrench className="h-4 w-4" />, on: 'bg-amber-500 text-white' },
                    { k: 'LOST', l: 'สูญหาย', i: <PackageX className="h-4 w-4" />, on: 'bg-rose-700 text-white' },
                  ].map((c) => (
                    <button
                      type="button"
                      key={c.k}
                      onClick={() => setCondition(c.k as any)}
                      className={`flex flex-col items-center gap-1 rounded-xl py-3 text-xs font-semibold transition ${condition === c.k ? c.on : 'bg-panel text-forest-900'}`}
                    >
                      {c.i} {c.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">หมายเหตุการตรวจสภาพ</label>
                <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="เช่น เอ็นขาด กรอบมีรอยร้าว" />
              </div>

              <div className="space-y-2 rounded-2xl bg-panel p-4 text-sm">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-forest-900">การคำนวณตามสูตร Business Rule BR11 (ประมาณการ)</span>
                  <span className="badge-slate">฿20 / 15 นาที / ชิ้น</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    ค่าปรับคืนช้า {estimate.lateMin > 0 ? `${estimate.lateMin} นาที (${estimate.blocks} ช่วง × ฿${LATE_FEE} × ${selectedBorrowing.quantity} ชิ้น)` : '(คืนตรงเวลา)'}
                  </span>
                  <span className="font-semibold">{formatTHB(estimate.late)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    ค่าเสียหายตามราคาประเมิน {condition !== 'NORMAL' ? `(฿${estimate.unitCost} × ${selectedBorrowing.quantity})` : ''}
                  </span>
                  <span className="font-semibold">{formatTHB(estimate.damage)}</span>
                </div>
                <div className="flex items-end justify-between border-t border-white pt-2">
                  <span className="text-xs font-semibold text-slate-600">ยอดค่าปรับสุทธิโดยประมาณ</span>
                  <span className={`text-3xl font-bold ${estimate.total > 0 ? 'text-rose-800' : 'text-forest-800'}`}>{formatTHB(estimate.total)}</span>
                </div>
                <div className="text-[10px] text-slate-500">ยอดจริงคำนวณและบันทึกโดยหลังบ้านเมื่อกดยืนยัน</div>
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setSelectedBorrowing(null)} className="btn-outline flex-1">
                  ยกเลิก
                </button>
                <button type="submit" disabled={isSubmitting} className={`flex-[2] ${estimate.total > 0 ? 'btn-danger' : 'btn-primary'}`}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {estimate.total > 0 ? 'บันทึกการรับคืนและออกค่าปรับ' : 'ยืนยันการรับคืน'}
                </button>
              </div>
            </form>
          ) : (
            <div className="rounded-xl bg-panel p-6 text-center text-xs text-slate-500">ยังไม่ได้เลือกรายการที่จะรับคืน</div>
          )}

          <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            อุปกรณ์ชำรุด/สูญหายจะถูกตัดออกจากสต็อกถาวร ส่วนอุปกรณ์สภาพปกติจะคืนเข้าสต็อกพร้อมให้เช่าทันที
          </div>
        </div>
      </div>
    </StaffLayout>
  );
};
