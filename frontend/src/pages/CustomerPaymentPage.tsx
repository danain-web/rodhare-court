import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBookingByIdApi } from '../services/booking';
import QRCode from 'qrcode';
import { getPaymentInstructionsApi, submitPaymentApi } from '../services/payment';
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
// ตรงกับกฎฝั่ง backend (payment.validator.ts)
const MONEY_RE = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
const toSatang = (baht: number) => Math.round(baht * 100);

const RESULT_STYLE = {
  VERIFIED: { box: 'border-mint-300 bg-mint-50', text: 'text-forest-800', title: 'ชำระเงินเรียบร้อย — ยืนยันการจองแล้ว' },
  REJECTED: { box: 'border-rose-300 bg-rose-50', text: 'text-rose-800', title: 'สลิปไม่ผ่านการตรวจสอบเบื้องต้น' },
  MANUAL_REVIEW: { box: 'border-amber-300 bg-amber-50', text: 'text-amber-900', title: 'ได้รับสลิปแล้ว — รอเจ้าหน้าที่ตรวจสอบยอดเงินเข้าบัญชี' },
} as const;

// อัปโหลดสลิปชำระเงิน (ขั้นตอนที่ 4 จาก 4)
export const CustomerPaymentPage: React.FC = () => {
  const { bookingId: paramId } = useParams<{ bookingId: string }>();
  const [searchParams] = useSearchParams();
  const queryBookingId = searchParams.get('bookingId');
  const { user } = useAuth();

  // ไม่มีเลขการจองใน URL → แจ้งผู้ใช้ (ไม่เดาเป็นการจองหมายเลข 1)
  const rawId = paramId || queryBookingId || '';
  const bookingId = /^[1-9]\d*$/.test(rawId) ? Number(rawId) : NaN;
  const hasValidId = Number.isInteger(bookingId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('PROMPTPAY');
  const [amountInput, setAmountInput] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
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

  const { data: booking, isLoading, isError: bookingError } = useQuery({
    queryKey: ['bookingDetail', bookingId],
    queryFn: () => getBookingByIdApi(bookingId),
    enabled: hasValidId,
  });

  // ยอดที่ต้องโอนและบัญชีรับเงิน มาจาก backend (ไม่คำนวณ/ไม่ hardcode ที่หน้าเว็บ)
  const { data: instructions } = useQuery({
    queryKey: ['paymentInstructions', bookingId],
    queryFn: () => getPaymentInstructionsApi(bookingId),
    enabled: hasValidId && booking?.status === 'PENDING_PAYMENT',
  });

  // QR ที่จะแสดง: พร้อมเพย์จริง (ถ้าตั้งบัญชีไว้) หรือ QR จำลองในโหมดสาธิต
  // QR จำลองเป็นข้อความธรรมดา ไม่ใช่รหัสพร้อมเพย์ → แอปธนาคารสแกนแล้วชำระเงินไม่ได้ (ไม่มีเงินไปเข้าบัญชีใครโดยไม่ตั้งใจ)
  const isDemoQr = !instructions?.promptPay && !!instructions?.demo;
  const qrPayload =
    instructions?.promptPay?.payload ??
    (isDemoQr ? `RODHARE-COURT DEMO | ${instructions!.bookingNumber} | ${instructions!.amount.toFixed(2)} THB | NOT A REAL PAYMENT` : undefined);

  // วาด QR ในเครื่องผู้ใช้ (ไม่ส่งข้อมูลไปบริการภายนอก)
  useEffect(() => {
    const payload = qrPayload;
    if (!payload) return setQrDataUrl(null);
    let cancelled = false;
    QRCode.toDataURL(payload, { margin: 1, width: 200, color: { dark: '#0a3528', light: '#ffffff' } })
      .then((url) => !cancelled && setQrDataUrl(url))
      .catch(() => !cancelled && setQrDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [qrPayload]);

  // ยอดโอนเริ่มต้น = ยอดสุทธิของการจอง (ลูกค้าแก้ให้ตรงสลิปจริงได้ หลังบ้านตรวจซ้ำ)
  useEffect(() => {
    if (booking && amountInput === '') setAmountInput(booking.finalAmount.toFixed(2));
  }, [booking]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking || isSubmitting) return;
    setFormError(null);
    if (!slipFile) {
      setFileError('กรุณาเลือกไฟล์รูปสลิปการโอนเงิน');
      return;
    }
    const amount = amountInput.trim();
    if (!MONEY_RE.test(amount) || Number(amount) <= 0) {
      setFormError('กรุณากรอกยอดเงินตามสลิปเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง');
      return;
    }
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await submitPaymentApi({
        bookingId: booking.bookingId,
        amount,
        paymentMethod,
        slipFile,
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

  if (!hasValidId || bookingError) {
    return (
      <CustomerLayout>
        <Alert tone="error" title="ไม่พบการจองที่ต้องการชำระเงิน">
          ลิงก์ไม่ถูกต้องหรือไม่มีสิทธิ์เข้าถึงการจองนี้ —{' '}
          <Link to="/my-bookings" className="font-semibold underline">
            ไปที่รายการจองของฉัน
          </Link>
        </Alert>
      </CustomerLayout>
    );
  }

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
  const amountValid = MONEY_RE.test(amountInput.trim());
  const amountMismatch = !!booking && amountValid && toSatang(Number(amountInput)) !== toSatang(booking.finalAmount);
  const accountNo = instructions?.bank?.accountNo;

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

      {/* ผลการส่งสลิป — aria-live ให้โปรแกรมอ่านหน้าจออ่านผลทันทีที่แสดง */}
      {result && (
        <div role="status" aria-live="polite" className={`mb-6 rounded-2xl border-2 p-5 ${RESULT_STYLE[result.verification.result].box}`}>
          <div className={`flex items-center gap-2 text-lg font-bold ${RESULT_STYLE[result.verification.result].text}`}>
            {result.verification.result === 'VERIFIED' && <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
            {result.verification.result === 'REJECTED' && <XCircle className="h-5 w-5" aria-hidden="true" />}
            {result.verification.result === 'MANUAL_REVIEW' && <Hourglass className="h-5 w-5" aria-hidden="true" />}
            {RESULT_STYLE[result.verification.result].title}
          </div>
          <div className={`mt-1 text-sm ${RESULT_STYLE[result.verification.result].text}`}>{result.verification.message}</div>
          {result.verification.result === 'MANUAL_REVIEW' && (
            <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs text-amber-900">
              <strong>สถานะ:</strong> รับสลิปแล้ว → รอเจ้าหน้าที่ตรวจยอดเงินเข้าบัญชี → ยืนยันการจองและออกใบเสร็จ
              (การจองยังไม่ถือว่าชำระเงินสำเร็จ จนกว่าจะได้รับการแจ้งเตือนว่าอนุมัติแล้ว)
            </div>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {result.verification.checks.map((c) => (
              <div key={c.code} className="flex items-start gap-2 rounded-xl bg-white/80 px-3 py-2 text-xs">
                {c.passed ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint-600" aria-hidden="true" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
                )}
                <div>
                  <div className="font-semibold text-forest-950">
                    {c.label} <span className="sr-only">{c.passed ? '— ผ่าน' : '— ไม่ผ่าน'}</span>
                  </div>
                  <div className="text-slate-600">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {result.verification.result === 'VERIFIED' && (
              <>
                <Link to={`/receipt/${result.bookingId}`} className="btn-primary">
                  <ReceiptIcon className="h-4 w-4" aria-hidden="true" /> ดูใบเสร็จ {result.verification.receipt?.receiptNumber}
                </Link>
                <Link to={`/my-bookings/${result.bookingId}`} className="btn-outline">
                  <QrCode className="h-4 w-4" aria-hidden="true" /> Digital Pass / QR เช็คอิน
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

            {isPending && instructions && !instructions.configured && !instructions.demo && (
              <Alert tone="warning" title="ยังไม่ได้ตั้งค่าบัญชีรับเงินออนไลน์">
                กรุณาติดต่อเจ้าหน้าที่เคาน์เตอร์สนามเพื่อรับข้อมูลการชำระเงิน
              </Alert>
            )}
            {(instructions?.configured || instructions?.demo) && (
            <div className="grid gap-6 md:grid-cols-[auto_1fr]">
              {(instructions.promptPay || isDemoQr) && (
                <div className="mx-auto w-56 rounded-2xl bg-white p-4 text-center shadow-md ring-1 ring-slate-100">
                  <div className="mb-3 rounded-lg bg-forest-950 py-1.5 text-xs font-bold text-white">
                    PROMPTPAY <span className="text-mint-300">● พร้อมเพย์</span>
                  </div>
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt={
                        isDemoQr
                          ? `QR จำลองสำหรับสาธิต ยอด ${formatTHB(instructions.amount)}`
                          : `QR พร้อมเพย์ ยอด ${formatTHB(instructions.amount)} ผู้รับ ${instructions.accountName ?? ''}`
                      }
                      className="mx-auto h-40 w-40"
                    />
                  ) : (
                    <div className="mx-auto flex h-40 w-40 items-center justify-center text-xs text-slate-400">กำลังสร้าง QR...</div>
                  )}
                  {isDemoQr ? (
                    <div className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                      QR จำลอง (สาธิต) — ไม่สามารถชำระเงินจริงได้
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-slate-500">
                      พร้อมเพย์ {instructions.promptPay!.maskedId} · ยอดถูกล็อกใน QR
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-3">
                <div className="rounded-2xl bg-panel p-4">
                  {instructions.bank && accountNo && (
                    <>
                      <div className="text-sm font-semibold text-forest-950">{instructions.bank.bankName}</div>
                      <div className="mt-3 flex items-center justify-between rounded-xl bg-white px-4 py-2.5">
                        <div>
                          <div className="text-[11px] text-slate-500">เลขที่บัญชี</div>
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
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {copied ? 'คัดลอกแล้ว' : 'คัดลอกเลขบัญชี'}
                        </button>
                      </div>
                    </>
                  )}
                  <div className="mt-2 text-xs text-slate-600">
                    ชื่อบัญชีผู้รับ: <strong>{instructions.accountName || 'บัญชีสาธิต (Demo)'}</strong>
                  </div>
                  {instructions.demo && (
                    <div className="mt-2 text-[11px] text-slate-500">
                      ระบบอยู่ในโหมดสาธิต — แนบสลิปตัวอย่างได้เลย ไม่ต้องโอนเงินจริง
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-2 rounded-xl bg-panel p-3 text-xs text-slate-600">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-forest-600" />
                  <span>
                    กรุณาโอนให้เท่ากับ <strong>{formatTHB(instructions.amount)}</strong> พอดี ยอดในสลิปต้องตรงกับยอดการจองจึงจะอนุมัติได้
                  </span>
                </div>
              </div>
            </div>
            )}
          </div>

          {/* ฟอร์มส่งสลิป */}
          <form onSubmit={handleSubmit} className="card space-y-5 p-6">
            <div className="flex items-center gap-2 rounded-xl bg-panel px-4 py-3 text-lg font-bold text-forest-950">
              <FileCheck2 className="h-5 w-5" /> แนบหลักฐานสลิปการโอนเงิน (Slip Verification)
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <span className="label" id="slip-file-label">ไฟล์รูปภาพสลิป</span>
                <label
                  htmlFor="slip-file"
                  className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-5 text-center transition hover:border-forest-400 focus-within:ring-2 focus-within:ring-forest-500 ${
                    fileError ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200 bg-panel/40'
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-mint-100 text-forest-700">
                    <ImagePlus className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div className="text-sm font-semibold text-forest-950">{slipFile ? slipFile.name : 'คลิกเพื่อเลือกไฟล์สลิป'}</div>
                  {/* sr-only แทน hidden → ยังกด Tab มาเลือกไฟล์ด้วยคีย์บอร์ดได้ */}
                  <input
                    id="slip-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    aria-labelledby="slip-file-label"
                    aria-describedby={fileError ? 'slip-file-error' : 'slip-file-hint'}
                    aria-invalid={!!fileError}
                    onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                  />
                  <div id="slip-file-hint" className="text-[11px] text-slate-500">
                    รองรับ JPG, PNG, WEBP ขนาดไม่เกิน 5 MB{slipFile ? ` • ${(slipFile.size / 1024).toFixed(1)} KB` : ''}
                  </div>
                </label>
                {fileError && (
                  <div id="slip-file-error" role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {fileError}
                  </div>
                )}
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="payment-method">ช่องทางการชำระ</label>
                  <select id="payment-method" className="input bg-white" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option value="PROMPTPAY">PromptPay QR Code</option>
                    <option value="BANK_TRANSFER">โอนผ่านบัญชีธนาคาร</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="slip-amount">ยอดเงินโอนตามสลิป (บาท)</label>
                  <div className="relative">
                    <input
                      id="slip-amount"
                      type="text"
                      inputMode="decimal"
                      required
                      aria-invalid={amountMismatch || (amountInput !== '' && !amountValid)}
                      aria-describedby={amountMismatch ? 'slip-amount-error' : undefined}
                      className={`input bg-white pr-9 ${amountMismatch ? 'border-rose-300 ring-2 ring-rose-100' : ''}`}
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                    />
                    {!amountMismatch && amountValid && <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-mint-600" aria-hidden="true" />}
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-slate-500">
                {instructions?.demo
                  ? 'โหมดสาธิต: ถ้ายอดเงินตรงกับยอดจอง ระบบจะยืนยันการจองและออกใบเสร็จให้ทันที'
                  : 'ระบบตรวจเบื้องต้น (ยอดเงินตรงยอดจอง • ความชัดของภาพ) แล้วส่งให้เจ้าหน้าที่ยืนยันยอดเงินเข้าบัญชี — การส่งสลิปยังไม่ถือว่าชำระเงินสำเร็จ'}
              </div>
              {amountMismatch && (
                <div id="slip-amount-error" role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  ยอดที่กรอก ({formatTHB(Number(amountInput))}) ไม่ตรงกับยอดการจอง ({formatTHB(booking?.finalAmount)}) — ระบบจะไม่อนุมัติสลิปนี้
                </div>
              )}
              {formError && (
                <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {formError}
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
