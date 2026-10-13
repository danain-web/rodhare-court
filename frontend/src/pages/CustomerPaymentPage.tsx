import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBookingByIdApi } from '../services/booking';
import { submitPaymentApi } from '../services/payment';
import { SubmitPaymentResult } from '../types/payment';
import { useAuth } from '../context/AuthContext';
import { CustomerLayout } from '../components/layout/CustomerLayout';
import {
  Alert,
  Breadcrumb,
  CountdownBanner,
  LoadingState,
  StatusBadge,
  Stepper,
  formatTHB,
  formatThaiDate,
  hoursBetween,
} from '../components/ui';
import {
  CheckCircle2,
  Copy,
  FileCheck2,
  Hourglass,
  ImagePlus,
  Info,
  Loader2,
  Package,
  Phone,
  QrCode,
  Receipt as ReceiptIcon,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';


const SLIP_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const SLIP_MAX_BYTES = 5 * 1024 * 1024;

const RESULT_STYLE = {
  VERIFIED: { box: 'border-mint-300 bg-mint-50', text: 'text-forest-800', title: 'ตรวจสลิปอัตโนมัติผ่าน — ชำระเงินเรียบร้อย' },
  REJECTED: { box: 'border-rose-300 bg-rose-50', text: 'text-rose-800', title: 'สลิปไม่ผ่านการตรวจ — ระบบปฏิเสธรายการ' },
  MANUAL_REVIEW: { box: 'border-amber-300 bg-amber-50', text: 'text-amber-800', title: 'ภาพสลิปไม่ชัดเจน — ส่งให้พนักงานตรวจสอบ' },
} as const;

// UCS-4.1 อัปโหลดสลิปและชำระเงิน (ขั้นตอนที่ 4 จาก 4)
export const CustomerPaymentPage: React.FC = () => {
  const { bookingId: paramId } = useParams<{ bookingId: string }>();
  const [searchParams] = useSearchParams();
  const queryBookingId = searchParams.get('bookingId');
  const { user } = useAuth();

  const bookingId = parseInt(paramId || queryBookingId || '1', 10);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // เลขอ้างอิงธุรกรรมตามสลิป (เว้นว่าง = อ่านเลขอ้างอิงไม่ได้ -> ส่งให้พนักงานตรวจ)
  const [slipReference, setSlipReference] = useState(`KB${Date.now().toString().slice(-10)}`);
  const [paymentMethod, setPaymentMethod] = useState('PROMPTPAY');
  const [amountInput, setAmountInput] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitPaymentResult | null>(null);

  useEffect(() => () => {
    if (slipPreview) URL.revokeObjectURL(slipPreview);
  }, [slipPreview]);

  // ตรวจประเภทไฟล์และขนาดไฟล์ก่อนส่ง (หลังบ้านตรวจซ้ำจากเนื้อไฟล์จริง)
  const onPickFile = (file: File | null) => {
    setFileError(null);
    setSlipFile(null);
    setSlipPreview(null);
    if (!file) return;
    if (!SLIP_TYPES.includes(file.type)) {
      setFileError(`ไม่รองรับไฟล์ประเภท ${file.type || 'ไม่ทราบ'} — รองรับเฉพาะ JPG, PNG, WEBP`);
      return;
    }
    if (file.size > SLIP_MAX_BYTES) {
      setFileError(`ไฟล์มีขนาด ${(file.size / 1024 / 1024).toFixed(2)} MB เกินกำหนด (ไม่เกิน 5 MB)`);
      return;
    }
    setSlipFile(file);
    setSlipPreview(URL.createObjectURL(file));
  };

  const { data: booking, isLoading } = useQuery({
    queryKey: ['bookingDetail', bookingId],
    queryFn: () => getBookingByIdApi(bookingId),
  });

  // ยอดโอนเริ่มต้น = ยอดสุทธิของการจอง (ลูกค้ากรอกตามสลิปจริงได้ หลังบ้านตรวจ BR6)
  useEffect(() => {
    if (booking && amountInput === '') setAmountInput(booking.finalAmount.toFixed(2));
  }, [booking]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking) return;
    if (!slipFile) {
      setFileError('กรุณาเลือกไฟล์รูปสลิปการโอนเงิน');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await submitPaymentApi({
        bookingId: booking.bookingId,
        amount: Number(amountInput) || booking.finalAmount,
        paymentMethod,
        // ส่ง File object ตรงๆ → service จะใส่ลง FormData เป็น 'slip' field
        slipFile: slipFile ?? undefined,
        slipReference: slipReference || undefined,
      });
      setResult(res);
      await queryClient.invalidateQueries({ queryKey: ['bookingDetail', bookingId] });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || err.message || 'Payment submission failed');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <CustomerLayout>
        <LoadingState label="กำลังโหลดข้อมูลการชำระเงิน..." />
      </CustomerLayout>
    );
  }

  const b: any = booking;
  const isPending = booking?.status === 'PENDING_PAYMENT';
  const awaitingReview = b?.latestPaymentStatus === 'PENDING';
  const amountMismatch = !!booking && amountInput !== '' && Math.abs(Number(amountInput) - booking.finalAmount) > 0.005;
  const accountNo = '098-2-88338-0';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&color=0a3528&data=PROMPTPAY_0982883380_${booking?.finalAmount}`;

  return (
    <CustomerLayout>
      <Breadcrumb
        items={[
          { label: 'ค้นหาสนาม', to: '/courts' },
          { label: 'จองสนาม', to: `/my-bookings/${bookingId}` },
          { label: 'อัปโหลดสลิปชำระเงิน' },
        ]}
      />
      <Stepper current={4} />

      {isPending && !awaitingReview && (
        <CountdownBanner
          expiresAt={b?.holdExpiresAt}
          tone="amber"
          title="กำลังสำรองสนามไว้ให้คุณ"
          description="กรุณาโอนเงินและแนบหลักฐานสลิปก่อนหมดเวลา หากพ้นกำหนดระบบจะยกเลิกคำจองและคืนคอร์ทสู่ตารางว่างอัตโนมัติ"
        />
      )}
      {awaitingReview && (
        <Alert tone="info" title="ส่งสลิปแล้ว — รอเจ้าหน้าที่ตรวจสอบ">
          ระบบหยุดนับเวลา 15 นาทีแล้ว คุณจะได้รับการแจ้งเตือนเมื่อเจ้าหน้าที่อนุมัติหรือปฏิเสธสลิป
        </Alert>
      )}
      {booking && !isPending && (
        <Alert tone={booking.status === 'EXPIRED' ? 'error' : 'success'} title={`การจองนี้อยู่ในสถานะ: ${booking.status}`}>
          {booking.status === 'EXPIRED'
            ? 'หมดเวลาชำระเงิน การจองถูกยกเลิกอัตโนมัติ กรุณาทำรายการจองใหม่'
            : 'ไม่ต้องชำระเงินเพิ่มเติมสำหรับการจองนี้'}
        </Alert>
      )}
      {errorMessage && (
        <Alert tone="error" title="ระบบปฏิเสธการส่งสลิป" onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      {/* ผลการตรวจสลิปอัตโนมัติ (Auto-Slip Verification) */}
      {result && (
        <div className={`mb-6 rounded-2xl border-2 p-5 ${RESULT_STYLE[result.verification.result].box}`}>
          <div className={`flex items-center gap-2 text-lg font-bold ${RESULT_STYLE[result.verification.result].text}`}>
            {result.verification.result === 'VERIFIED' && <CheckCircle2 className="h-5 w-5" />}
            {result.verification.result === 'REJECTED' && <XCircle className="h-5 w-5" />}
            {result.verification.result === 'MANUAL_REVIEW' && <Hourglass className="h-5 w-5" />}
            {RESULT_STYLE[result.verification.result].title}
          </div>
          <div className={`mt-1 text-sm ${RESULT_STYLE[result.verification.result].text}`}>{result.verification.message}</div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {result.verification.checks.map((c) => (
              <div key={c.code} className="flex items-start gap-2 rounded-xl bg-white/80 px-3 py-2 text-xs">
                {c.passed ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint-600" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                )}
                <div>
                  <div className="font-semibold text-forest-950">{c.label}</div>
                  <div className="text-slate-600">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {result.verification.result === 'VERIFIED' && (
              <>
                <Link to={`/receipt/${result.bookingId}`} className="btn-primary">
                  <ReceiptIcon className="h-4 w-4" /> ดูใบเสร็จ (E-Receipt) {result.verification.receipt?.receiptNumber}
                </Link>
                <Link to={`/my-bookings/${result.bookingId}`} className="btn-outline">
                  <QrCode className="h-4 w-4" /> Digital Pass / QR เช็คอิน
                </Link>
              </>
            )}
            {result.verification.result === 'REJECTED' && (
              <button type="button" className="btn-outline" onClick={() => setResult(null)}>
                แก้ไขข้อมูลแล้วส่งสลิปใหม่
              </button>
            )}
            {result.verification.result === 'MANUAL_REVIEW' && (
              <button type="button" className="btn-outline" onClick={() => navigate(`/my-bookings/${result.bookingId}`)}>
                กลับหน้ารายละเอียดการจอง
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {/* QR + บัญชีรับเงิน */}
          <div className="card space-y-6 p-6">
            <div className="flex items-center justify-between rounded-2xl bg-panel p-5">
              <div>
                <div className="text-[11px] text-slate-500">รหัสอ้างอิงการจอง</div>
                <div className="font-mono text-lg font-bold text-forest-950">#{booking?.bookingNumber}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-slate-500">ยอดชำระสุทธิที่ต้องโอน</div>
                <div className="text-3xl font-bold text-forest-950">
                  {(booking?.finalAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} <span className="text-sm font-normal">บาท</span>
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-[auto_1fr]">
              <div className="mx-auto w-56 rounded-2xl bg-white p-4 text-center shadow-md ring-1 ring-slate-100">
                <div className="mb-3 rounded-lg bg-forest-950 py-1.5 text-xs font-bold text-white">
                  PROMPTPAY <span className="text-mint-300">● พร้อมเพย์</span>
                </div>
                <img src={qrUrl} alt="PromptPay QR" className="mx-auto h-40 w-40" />
                <div className="mt-2 text-[10px] text-slate-500">สแกนจ่ายได้ทุกแอปพลิเคชันธนาคาร</div>
              </div>
              <div className="space-y-3">
                <div className="rounded-2xl bg-panel p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-forest-700 text-xs font-bold text-white">KB</div>
                      <div>
                        <div className="text-sm font-semibold text-forest-950">ธนาคารกสิกรไทย (KBANK)</div>
                        <div className="text-[11px] text-slate-500">บัญชีออมทรัพย์</div>
                      </div>
                    </div>
                    <span className="badge-mint">บัญชีทางการ</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-white px-4 py-2.5">
                    <div>
                      <div className="text-[10px] text-slate-500">เลขที่บัญชี</div>
                      <div className="font-mono text-lg font-bold tracking-wider text-forest-950">{accountNo}</div>
                    </div>
                    <button
                      type="button"
                      className="btn-soft px-3 py-1.5 text-xs"
                      onClick={() => {
                        navigator.clipboard?.writeText(accountNo.replace(/-/g, ''));
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" /> {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    ชื่อบัญชี: <strong>บจก. บาร์บี้ สปอร์ตส อารีน่า (Barbie Sports Arena Co., Ltd.)</strong>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-xl bg-panel p-3 text-xs text-slate-600">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-forest-600" />
                  <span>
                    กรุณาโอนให้เท่ากับ <strong>{formatTHB(booking?.finalAmount)}</strong> พอดี ยอดในสลิปต้องตรงกับยอดการจองจึงจะอนุมัติได้
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ฟอร์มส่งสลิป */}
          <form onSubmit={handleSubmit} className="card space-y-5 p-6">
            <div className="flex items-center gap-2 rounded-xl bg-panel px-4 py-3 text-lg font-bold text-forest-950">
              <FileCheck2 className="h-5 w-5" /> แนบหลักฐานสลิปการโอนเงิน (Slip Verification)
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label className="label">ไฟล์รูปภาพสลิป</label>
                <label
                  className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-5 text-center transition hover:border-forest-400 ${
                    fileError ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200 bg-panel/40'
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-mint-100 text-forest-700">
                    <ImagePlus className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-semibold text-forest-950">{slipFile ? slipFile.name : 'คลิกเพื่อเลือกไฟล์สลิป'}</div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                  />
                  <div className="text-[10px] text-slate-400">
                    รองรับ JPG, PNG, WEBP ขนาดไม่เกิน 5 MB{slipFile ? ` • ${(slipFile.size / 1024).toFixed(1)} KB` : ''}
                  </div>
                </label>
                {fileError && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{fileError}</div>}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="label mb-0">ตัวอย่างสลิปที่แนบ (Attached Slip)</label>
                  {slipPreview && <span className="badge-mint">● แนบสำเร็จ</span>}
                </div>
                <div className="h-48 overflow-hidden rounded-2xl bg-panel">
                  {slipPreview ? (
                    <img src={slipPreview} alt="Slip preview" className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-400">ยังไม่ได้เลือกไฟล์สลิป</div>
                  )}
                </div>
              </div>
            </div>

            <div className="card-soft space-y-3 p-4">
              <div className="text-sm font-semibold text-forest-950">ตรวจสอบความถูกต้องของข้อมูลตามสลิป</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label">ช่องทางการชำระ</label>
                  <select className="input bg-white" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option value="PROMPTPAY">PromptPay QR Code</option>
                    <option value="BANK_TRANSFER">โอนผ่านบัญชีธนาคาร</option>
                  </select>
                </div>
                <div>
                  <label className="label">ยอดเงินโอนตามสลิป (บาท)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={`input bg-white pr-9 ${amountMismatch ? 'border-rose-300 ring-2 ring-rose-100' : ''}`}
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                    />
                    {!amountMismatch && amountInput && <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-mint-600" />}
                  </div>
                </div>
                <div>
                  <label className="label">เลขอ้างอิงสลิป (Ref)</label>
                  <input
                    className="input bg-white font-mono"
                    value={slipReference}
                    onChange={(e) => setSlipReference(e.target.value)}
                    placeholder="เช่น 016123456789ABC"
                  />
                </div>
              </div>
              <div className="text-[11px] text-slate-500">
                ระบบตรวจสลิปอัตโนมัติ: สลิปซ้ำ (เลขอ้างอิง) • ยอดเงินตรงยอดจอง • ความชัดเจนของภาพ — หากอ่านเลขอ้างอิงไม่ได้หรือภาพไม่ชัด
                ระบบจะส่งให้พนักงานตรวจสอบแทน
              </div>
              {amountMismatch && (
                <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  ยอดที่กรอก ({formatTHB(Number(amountInput))}) ไม่ตรงกับยอดการจอง ({formatTHB(booking?.finalAmount)}) — ระบบจะไม่อนุมัติสลิปนี้
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Link to={`/my-bookings/${bookingId}`} className="btn-outline">
                กลับหน้ารายละเอียดการจอง
              </Link>
              <button type="submit" disabled={isSubmitting || !isPending || awaitingReview} className="btn-primary px-6 py-3">
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> กำลังส่งสลิป...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> ส่งสลิปเพื่อตรวจสอบ (Submit Slip)
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* สรุปรายการจอง + กฎ */}
        <div className="space-y-6">
          <div className="card space-y-4 p-6">
            <div className="flex items-center justify-between rounded-xl bg-panel px-4 py-3">
              <h2 className="text-lg font-bold text-forest-950">สรุปรายการจอง</h2>
              {booking && <StatusBadge status={booking.status} />}
            </div>
            <div>
              <div className="text-[11px] text-slate-500">{booking?.sportName}</div>
              <div className="font-semibold text-forest-950">{booking?.courtName}</div>
              <div className="text-xs text-slate-500">
                {formatThaiDate(booking?.bookingDate, 'short')} ({booking?.startTime}-{booking?.endTime}) •{' '}
                {booking ? hoursBetween(booking.startTime, booking.endTime) : 0} ชม.
              </div>
            </div>
            {(booking?.equipment || []).length > 0 && (
              <div className="space-y-1.5 border-t border-slate-100 pt-3 text-xs">
                <div className="text-slate-500">อุปกรณ์กีฬาที่เลือกเพิ่ม:</div>
                {(booking?.equipment || []).map((e) => (
                  <div key={e.bookingEquipmentId} className="flex justify-between">
                    <span className="flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-forest-600" /> {e.equipmentName} ({e.quantity})
                    </span>
                    <span>{formatTHB(e.subtotal)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1.5 rounded-xl bg-panel p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">ค่าบริการสนาม</span>
                <span>{formatTHB(booking?.totalCourtFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ค่าเช่าอุปกรณ์เสริม</span>
                <span>{formatTHB(booking?.totalEquipmentFee)}</span>
              </div>
              {(booking?.discountAmount || 0) > 0 && (
                <div className="flex justify-between text-rose-700">
                  <span>ส่วนลด</span>
                  <span>-{formatTHB(booking?.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-white pt-2 font-bold text-forest-950">
                <span>ยอดชำระสุทธิ</span>
                <span className="text-xl">{formatTHB(booking?.finalAmount)}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-panel p-3 text-xs">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-forest-900 text-sm font-bold text-mint-200">
                {user?.firstName?.[0]}
              </div>
              <div>
                <div className="font-semibold text-forest-950">
                  คุณ{user?.firstName} {user?.lastName}
                </div>
                <div className="text-slate-500">
                  ID: {user?.username} • {user?.phone || '-'}
                </div>
              </div>
            </div>
          </div>

          <div className="card space-y-4 p-6">
            <h3 className="flex items-center gap-2 font-semibold text-forest-950">
              <ShieldCheck className="h-4 w-4" /> เงื่อนไขและระเบียบสนาม (Terms & Rules)
            </h3>
            {[
              { c: 'การตรวจสอบยอดเงิน', d: 'ยอดเงินในสลิปต้องตรงกับยอดรวมของระบบทุกประการ เจ้าหน้าที่จะตรวจก่อนอนุมัติ', tone: 'text-forest-700' },
              { c: 'กำหนดเวลาชำระเงิน 15 นาที', d: 'หากพ้นกำหนดระบบจะยกเลิกการจองและปลดล็อกสนามสู่สาธารณะทันที', tone: 'text-amber-700' },
              { c: 'การเข้าใช้และเช็คอิน', d: 'แสดงบัตรผ่านดิจิทัลเพื่อเช็คอินได้ก่อนเวลาเริ่มไม่เกิน 30 นาที', tone: 'text-forest-700' },
              { c: 'การยกเลิกและคืนเงิน', d: 'ยกเลิกล่วงหน้ามากกว่า 24 ชม. คืนเงิน 100% / 1-24 ชม. คืน 50% / น้อยกว่า 1 ชม. ไม่คืนเงิน', tone: 'text-forest-700' },
            ].map((r) => (
              <div key={r.c} className="text-xs">
                <div className={`font-semibold ${r.tone}`}>● {r.c}</div>
                <div className="text-slate-500">{r.d}</div>
              </div>
            ))}
            <div className="flex items-center gap-3 rounded-xl bg-panel p-3 text-xs">
              <Phone className="h-4 w-4 text-forest-700" />
              <div>
                <div className="text-slate-500">มีปัญหาการโอนเงิน?</div>
                <div className="font-semibold text-forest-950">ติดต่อเจ้าหน้าที่เคาน์เตอร์สนาม</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
};
