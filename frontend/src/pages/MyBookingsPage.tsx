import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getMyBookingsApi } from '../services/booking';
import { getCancelRefundPreviewApi, executeCancelRefundApi, getMyRefundsApi, CancelRefundPreview } from '../services/refund';
import { CustomerLayout } from '../components/layout/CustomerLayout';
import { Alert, Breadcrumb, EmptyState, LoadingState, StatusBadge, formatTHB, formatThaiDate, hoursBetween, apiErrorMessage } from '../components/ui';
import { Booking } from '../types/booking';
import {
  ArrowRight,
  CalendarDays,
  CircleX,
  Clock,
  CreditCard,
  Headphones,
  Loader2,
  MapPin,
  QrCode,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldCheck,
  Timer,
  Trophy,
} from 'lucide-react';

const TABS = [
  { key: 'all', label: 'ทั้งหมด', match: () => true },
  { key: 'active', label: 'กำลังดำเนินการ / ยืนยันแล้ว', match: (b: Booking) => ['CONFIRMED', 'PAYMENT_VERIFIED', 'CHECKED_IN'].includes(b.status) },
  { key: 'pending', label: 'รอชำระเงิน', match: (b: Booking) => b.status === 'PENDING_PAYMENT' },
  { key: 'done', label: 'เข้าเล่นเสร็จสิ้น', match: (b: Booking) => b.status === 'COMPLETED' },
  { key: 'cancelled', label: 'ยกเลิก / คืนเงิน / หมดเวลา / ไม่มา', match: (b: Booking) => ['CANCELLED', 'REFUNDED', 'EXPIRED', 'NO_SHOW'].includes(b.status) },
] as const;

const REASONS = ['ติดธุระกะทันหัน', 'สภาพอากาศไม่เอื้ออำนวย', 'ผู้เล่นไม่ครบ', 'ต้องการเปลี่ยนวันเวลา', 'อื่น ๆ'];
const CANCELLABLE = ['PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'CONFIRMED'];

// UCS-6.1 รายการจองของฉันและการขอยกเลิกคืนเงิน (BR12)
export const MyBookingsPage: React.FC = () => {
  const { data: bookings = [], isLoading, refetch } = useQuery({
    queryKey: ['myBookings'],
    queryFn: getMyBookingsApi,
  });
  const { data: refunds = [], refetch: refetchRefunds } = useQuery({ queryKey: ['myRefunds'], queryFn: getMyRefundsApi });

  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('all');
  const [search, setSearch] = useState('');

  // แผงยกเลิกด้านขวา
  const [target, setTarget] = useState<Booking | null>(null);
  const [preview, setPreview] = useState<CancelRefundPreview | null>(null);
  const [reason, setReason] = useState('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const t = TABS.find((x) => x.key === tab)!;
    const q = search.trim().toLowerCase();
    return bookings.filter(
      (b) => t.match(b) && (!q || b.bookingNumber.toLowerCase().includes(q) || (b.courtName || '').toLowerCase().includes(q))
    );
  }, [bookings, tab, search]);

  const openCancel = async (b: Booking) => {
    setError(null);
    setSuccess(null);
    setTarget(b);
    setPreview(null);
    setReason('');
    setReasonDetail('');
    setAccept(false);
    try {
      setPreview(await getCancelRefundPreviewApi(b.bookingId));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  const confirmCancel = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const fullReason = [reason, reasonDetail].filter(Boolean).join(' - ');
      await executeCancelRefundApi(target.bookingId, fullReason || undefined);
      setSuccess(`ยกเลิกการจอง ${target.bookingNumber} เรียบร้อยแล้ว${preview?.eligibleForRefund ? ' และส่งคำขอคืนเงินให้เจ้าหน้าที่ตรวจสอบ' : ''}`);
      setTarget(null);
      setPreview(null);
      refetch();
      refetchRefunds();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const pendingRefundTotal = refunds.filter((r) => r.status === 'PENDING').reduce((s, r) => s + (r.requestedAmount || 0), 0);

  return (
    <CustomerLayout>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Breadcrumb items={[{ label: 'รายการจองของฉัน (My Bookings)' }, { label: 'จัดการจองและขอยกเลิก' }]} />
        <div className="card flex items-center gap-3 px-4 py-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-mint-100 text-forest-700">
            <RotateCcw className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500">ยอดคืนเงินที่รออนุมัติ</div>
            <div className="font-bold text-forest-950">{formatTHB(pendingRefundTotal)}</div>
          </div>
        </div>
      </div>

      <section className="card-dark relative overflow-hidden p-8">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-mint-300/10" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <span className="badge bg-white/10 text-mint-200">
              <span className="h-1.5 w-1.5 rounded-full bg-mint-300" /> AUTOMATED REFUND SYSTEM
            </span>
            <h1 className="text-3xl font-bold text-white">รายการจองของฉันและการขอคืนเงิน</h1>
            <p className="max-w-2xl text-sm text-white/70">
              ตรวจสอบตารางการใช้สนาม ใบเสร็จรับเงิน บัตรผ่านดิจิทัล หรือดำเนินการยกเลิกพร้อมคำนวณเงินคืนแบบอัตโนมัติตามระเบียบ
            </p>
          </div>
          <Link to="/courts" className="btn-mint">
            <Trophy className="h-4 w-4" /> จองสนามใหม่
          </Link>
        </div>
      </section>

      {success && <Alert tone="success" title={success} onClose={() => setSuccess(null)} />}

      <div className="card flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const count = bookings.filter(t.match).length;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-xl px-4 py-2 text-sm transition ${tab === t.key ? 'bg-forest-900 font-semibold text-white' : 'bg-panel text-forest-900 hover:bg-forest-100'}`}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>
        <div className="relative lg:w-72">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="ค้นหาเลขอ้างอิงหรือชื่อสนาม..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-forest-950">
            <CalendarDays className="h-5 w-5" /> รายการจองที่ต้องจัดการ
          </h2>
          {isLoading ? (
            <LoadingState label="กำลังโหลดรายการจองของคุณ..." />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="ไม่พบรายการจอง"
              description="ยังไม่มีการจองในหมวดนี้"
              action={
                <Link to="/courts" className="btn-primary">
                  ค้นหาสนามและจองเลย
                </Link>
              }
            />
          ) : (
            filtered.map((b) => {
              const hrs = hoursBetween(b.startTime, b.endTime);
              const isActiveTarget = target?.bookingId === b.bookingId;
              const ended = ['COMPLETED', 'CANCELLED', 'REFUNDED', 'EXPIRED'].includes(b.status);
              return (
                <div key={b.bookingId} className={`card p-5 transition ${isActiveTarget ? 'ring-2 ring-rose-200' : ''} ${ended ? 'opacity-90' : ''}`}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="badge-slate font-mono">#{b.bookingNumber}</span>
                      <StatusBadge status={b.status} />
                    </div>
                    <span className="text-[11px] text-slate-500">สร้างเมื่อ {new Date(b.createdAt).toLocaleString('th-TH')}</span>
                  </div>
                  <div className="flex gap-4">
                    <div className="hidden h-20 w-24 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-forest-600 to-forest-900 text-mint-200 sm:flex">
                      <Trophy className="h-8 w-8" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-forest-950">{b.courtName || `สนาม #${b.courtId}`}</h3>
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <MapPin className="h-3.5 w-3.5" /> {b.sportName}
                          </div>
                        </div>
                        <div className="text-xl font-bold text-forest-950">{formatTHB(b.finalAmount)}</div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="flex items-center gap-2 rounded-lg bg-panel px-3 py-2 text-xs">
                          <CalendarDays className="h-4 w-4 text-forest-600" /> {formatThaiDate(b.bookingDate)}
                        </div>
                        <div className="flex items-center gap-2 rounded-lg bg-panel px-3 py-2 text-xs">
                          <Clock className="h-4 w-4 text-forest-600" /> {b.startTime} - {b.endTime} น. ({hrs} ชม.)
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      {['CONFIRMED', 'PAYMENT_VERIFIED', 'CHECKED_IN', 'COMPLETED'].includes(b.status) && (
                        <>
                          <Link to={`/receipt/${b.bookingId}`} className="btn-soft px-3 py-2 text-xs">
                            <QrCode className="h-4 w-4" /> บัตรดิจิทัล (Pass)
                          </Link>
                          <Link to={`/receipt/${b.bookingId}`} className="btn-soft px-3 py-2 text-xs">
                            <ReceiptText className="h-4 w-4" /> ใบเสร็จรับเงิน
                          </Link>
                        </>
                      )}
                      {b.status === 'PENDING_PAYMENT' && (
                        <Link to={`/payment/${b.bookingId}`} className="btn-primary px-3 py-2 text-xs">
                          <CreditCard className="h-4 w-4" /> ชำระเงิน / ส่งสลิป
                        </Link>
                      )}
                      <Link to={`/my-bookings/${b.bookingId}`} className="btn-outline px-3 py-2 text-xs">
                        รายละเอียด <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                    {CANCELLABLE.includes(b.status) && (
                      <button onClick={() => openCancel(b)} className="btn-danger-soft px-3 py-2 text-xs">
                        <CircleX className="h-4 w-4" /> ขอยกเลิกการจองและคืนเงิน
                      </button>
                    )}
                    {ended && (
                      <Link to={`/courts/${b.courtId}`} className="btn-primary px-3 py-2 text-xs">
                        <RotateCcw className="h-4 w-4" /> จองซ้ำ (Re-book)
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* แผงคำขอยกเลิกและคำนวณเงินคืน */}
        <div className="space-y-6">
          <div className="card sticky top-24 space-y-4 p-6">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                  <CircleX className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-forest-950">คำขอยกเลิกและคำนวณเงินคืน</h3>
                  <div className="text-[11px] text-slate-500">คำนวณยอดเงินคืนอัตโนมัติตามระเบียบการยกเลิก</div>
                </div>
              </div>
              {target && <span className="badge-mint">เป้าหมาย: #{target.bookingNumber.slice(-6)}</span>}
            </div>

            {error && <Alert tone="error" title={error} onClose={() => setError(null)} />}

            {!target ? (
              <div className="rounded-xl bg-panel p-5 text-center text-xs text-slate-500">
                เลือก "ขอยกเลิกการจองและคืนเงิน" จากรายการทางซ้าย เพื่อให้ระบบคำนวณยอดเงินคืนตามระเบียบการยกเลิก
              </div>
            ) : !preview ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> กำลังคำนวณสิทธิ์คืนเงิน...
              </div>
            ) : (
              <>
                <div className="space-y-2 rounded-xl bg-panel p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">ยอดชำระตามใบเสร็จ:</span>
                    <span className="font-semibold">{formatTHB((preview as any).paidAmount ?? preview.totalPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1 text-slate-500">
                      <Timer className="h-3.5 w-3.5" /> เวลายกเลิกล่วงหน้า:
                    </span>
                    <span className="font-semibold">
                      {Math.floor(preview.hoursUntilStart)} ชม. {Math.round((preview.hoursUntilStart % 1) * 60)} นาที
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">เกณฑ์คำนวณเงินคืน:</span>
                    <span className={`font-semibold ${preview.refundPercentage === 100 ? 'text-forest-700' : 'text-amber-700'}`}>
                      คืนเงิน {preview.refundPercentage}%
                    </span>
                  </div>
                  <div className="flex items-end justify-between border-t border-white pt-3">
                    <span className="font-semibold text-forest-950">ยอดเงินที่จะได้รับคืนสุทธิ:</span>
                    <span className="text-3xl font-bold text-forest-700">{formatTHB(preview.refundAmount)}</span>
                  </div>
                </div>
                <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{preview.message}</div>

                <div>
                  <label className="label">เหตุผลในการขอยกเลิก *</label>
                  <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="">-- กรุณาระบุสาเหตุการยกเลิก --</option>
                    {REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">รายละเอียดเพิ่มเติม (ไม่บังคับ)</label>
                  <textarea
                    className="input h-20 resize-none"
                    value={reasonDetail}
                    onChange={(e) => setReasonDetail(e.target.value)}
                    placeholder="ระบุข้อมูลเพิ่มเติมให้เจ้าหน้าที่ศูนย์กีฬา..."
                  />
                </div>
                {preview.eligibleForRefund && (
                  <div className="rounded-xl border border-forest-200 bg-white p-3 text-xs">
                    <div className="font-semibold text-forest-950">ช่องทางการรับเงินคืน</div>
                    <div className="text-slate-500">โอนคืนบัญชีต้นทางที่ชำระเงิน หลังเจ้าหน้าที่อนุมัติ</div>
                  </div>
                )}
                <label className="flex items-start gap-2 text-xs text-slate-600">
                  <input type="checkbox" className="mt-0.5 accent-forest-900" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
                  ข้าพเจ้ายืนยันการยกเลิกการจองนี้ และรับทราบว่าสิทธิ์การเข้าใช้สนามจะถูกปล่อยคืนสู่ระบบสาธารณะทันทีตามระเบียบการยกเลิกและคืนเงิน
                </label>
                <button onClick={confirmCancel} disabled={!reason || !accept || busy} className="btn-danger w-full py-3">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  ยืนยันการยกเลิกและส่งคำขอคืนเงิน
                </button>
                <button onClick={() => setTarget(null)} className="w-full text-center text-xs text-slate-500 hover:underline">
                  ยกเลิก / ไม่ต้องการทำรายการต่อ
                </button>
              </>
            )}
          </div>

          {refunds.length > 0 && (
            <div className="card space-y-3 p-6">
              <h3 className="font-bold text-forest-950">คำขอคืนเงินของฉัน</h3>
              {refunds.map((r) => (
                <div key={r.refundId} className="flex items-center justify-between rounded-xl bg-panel px-4 py-3 text-xs">
                  <div>
                    <div className="font-semibold text-forest-950">#RF-{r.refundId} • การจอง {(r as any).bookingNumber || r.bookingId}</div>
                    <div className="text-slate-500">{new Date(r.createdAt).toLocaleString('th-TH')}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{formatTHB(r.requestedAmount)}</div>
                    <StatusBadge status={r.status} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card-soft flex items-center gap-3 p-4 text-xs text-slate-600">
            <Headphones className="h-8 w-8 rounded-full bg-white p-2 text-forest-700" />
            <div>
              <div className="font-semibold text-forest-950">ต้องการความช่วยเหลือด่วน?</div>
              หากมีปัญหาด้านการคืนเงิน กรุณาติดต่อเจ้าหน้าที่เคาน์เตอร์กีฬา
            </div>
          </div>
        </div>
      </div>

      <section className="card space-y-4 p-6">
        <span className="badge-mint">OFFICIAL REGULATIONS</span>
        <h2 className="text-lg font-bold text-forest-950">ระเบียบและเงื่อนไขการยกเลิกการจองและขอคืนเงิน</h2>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { tag: '100%', tone: 'bg-mint-500', t: 'ยกเลิกล่วงหน้ามากกว่า 24 ชม.', d: 'สมาชิกมีสิทธิ์ได้รับเงินคืนเต็มจำนวน 100% ของยอดที่ชำระ' },
            { tag: '50%', tone: 'bg-amber-500', t: 'ยกเลิกล่วงหน้าน้อยกว่า 24 ชม.', d: 'ได้รับเงินคืน 50% ของยอดที่ชำระ' },
            { tag: 'โอนคืน', tone: 'bg-forest-900', t: 'ระยะเวลาการโอนเงินคืน', d: 'เจ้าหน้าที่ตรวจสอบและอนุมัติคำขอคืนเงินก่อนโอนคืน' },
            { tag: 'ยังไม่ชำระ', tone: 'bg-rose-700', t: 'การจองที่ยังไม่ชำระเงิน', d: 'ยกเลิกได้ทันทีโดยไม่มียอดคืนเงิน และระบบคืนสนามสู่ตารางว่าง' },
          ].map((x) => (
            <div key={x.t} className="rounded-2xl bg-panel p-4">
              <span className={`badge text-white ${x.tone}`}>{x.tag}</span>
              <div className="mt-2 text-sm font-semibold text-forest-950">{x.t}</div>
              <p className="mt-1 text-xs text-slate-500">{x.d}</p>
            </div>
          ))}
        </div>
      </section>
    </CustomerLayout>
  );
};
