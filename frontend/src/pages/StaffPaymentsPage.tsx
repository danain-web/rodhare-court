import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPendingPaymentsApi, verifyPaymentApi, rejectPaymentApi } from '../services/payment';
import { Payment, Receipt } from '../types/payment';
import { StaffLayout } from '../components/layout/StaffLayout';
import { Alert, EmptyState, LoadingState, Modal, PageHeader, StatCard, formatDateTime, formatTHB, formatThaiDate } from '../components/ui';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Hourglass,
  Landmark,
  Loader2,
  Maximize2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  ShieldCheck,
  User,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

type PaymentRow = Payment & {
  bookingFinalAmount?: number;
  amountMatches?: boolean;
  customerName?: string;
  courtName?: string;
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  bookingStatus?: string;
};

// UCS-7 ระบบตรวจสลิปและอนุมัติการจอง (Split-View Console)
export const StaffPaymentsPage: React.FC = () => {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'match' | 'mismatch'>('all');
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [showFull, setShowFull] = useState(false);

  // Reject / confirm state
  const [rejectionReason, setRejectionReason] = useState('');
  const [confirmVerify, setConfirmVerify] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastVerifiedReceipt, setLastVerifiedReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [session, setSession] = useState({ approved: 0, rejected: 0, amount: 0 });

  const { data: pendingPayments = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pendingPayments'],
    queryFn: getPendingPaymentsApi,
    refetchInterval: 5000,
  });
  const rows = pendingPayments as PaymentRow[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((p) => {
      if (filter === 'match' && p.amountMatches === false) return false;
      if (filter === 'mismatch' && p.amountMatches !== false) return false;
      if (!q) return true;
      return [p.bookingNumber, p.userName, p.customerName, p.slipReference].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [rows, filter, search]);

  useEffect(() => {
    if (!filtered.length) setSelectedId(null);
    else if (!filtered.some((p) => p.paymentId === selectedId)) setSelectedId(filtered[0].paymentId);
  }, [filtered]);

  useEffect(() => {
    setZoom(1);
    setRotate(0);
    setRejectionReason('');
    setConfirmVerify(false);
  }, [selectedId]);

  const selected = rows.find((p) => p.paymentId === selectedId) || null;
  const mismatchCount = rows.filter((p) => p.amountMatches === false).length;
  const pendingTotal = rows.reduce((s, p) => s + p.amount, 0);

  const handleVerify = async (paymentId: number) => {
    setIsProcessing(true);
    setLastVerifiedReceipt(null);
    setError(null);
    setInfo(null);
    try {
      const res = await verifyPaymentApi(paymentId);
      setLastVerifiedReceipt(res.receipt);
      setSession((s) => ({ ...s, approved: s.approved + 1, amount: s.amount + (res.receipt?.totalAmount || 0) }));
      setConfirmVerify(false);
      refetch();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Verification failed');
      setConfirmVerify(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (paymentId: number, reason: string) => {
    if (reason.trim().length < 3) {
      setError('กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษรในช่องบันทึกหมายเหตุ ก่อนปฏิเสธสลิป');
      return;
    }
    setIsProcessing(true);
    setError(null);
    setInfo(null);
    try {
      await rejectPaymentApi(paymentId, reason.trim());
      setInfo(`ปฏิเสธสลิปเรียบร้อย — ระบบแจ้งลูกค้าและเริ่มนับเวลาชำระใหม่ 15 นาที`);
      setSession((s) => ({ ...s, rejected: s.rejected + 1 }));
      setRejectionReason('');
      refetch();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Rejection failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const checks = selected
    ? [
        {
          n: 1,
          t: 'ยอดเงินชำระ (Payment Amount)',
          ok: selected.amountMatches !== false,
          auto: true,
          tag: selected.amountMatches !== false ? 'ตรงกัน 100% (BR6 Pass)' : 'ยอดไม่ตรง (BR6 Fail)',
          left: ['ข้อมูลสลิป', formatTHB(selected.amount)],
          right: ['ยอดการจองในระบบ', formatTHB(selected.bookingFinalAmount)],
        },
        {
          n: 2,
          t: 'ชื่อผู้โอน / สมาชิกผู้จอง (Payer Identity)',
          ok: null,
          tag: 'ตรวจด้วยสายตา',
          left: ['สมาชิก (username)', selected.userName || '-'],
          right: ['ชื่อสมาชิก', selected.customerName || '-'],
        },
        {
          n: 3,
          t: 'บัญชีผู้รับเงินของอารีน่า (Recipient Bank)',
          ok: null,
          tag: 'ตรวจด้วยสายตา',
          left: ['ช่องทาง', selected.paymentMethod],
          right: ['บัญชีที่ถูกต้อง', 'KBANK 098-2-88338-0'],
        },
        {
          n: 4,
          t: 'เวลาส่งสลิปและกฎ 15 นาที (BR3)',
          ok: selected.bookingStatus === 'PENDING_PAYMENT',
          auto: true,
          tag: selected.bookingStatus === 'PENDING_PAYMENT' ? 'ส่งทันเวลา (ระบบหยุดนับ)' : `สถานะการจอง ${selected.bookingStatus}`,
          left: ['ส่งสลิปเมื่อ', formatDateTime(selected.createdAt)],
          right: ['สถานะการจอง', selected.bookingStatus || '-'],
        },
        {
          n: 5,
          t: 'ตรวจสอบเลขธุรกรรมซ้ำ (Duplicate Ref Check)',
          ok: selected.slipReference ? true : null,
          auto: true,
          tag: selected.slipReference ? 'ระบบตรวจซ้ำอัตโนมัติ' : 'ไม่มีเลขอ้างอิง — ตรวจจากภาพสลิป',
          left: ['เลขอ้างอิงสลิป', selected.slipReference || 'ไม่ระบุ'],
          right: ['ผลตรวจ', selected.slipReference ? 'ไม่ซ้ำกับสลิปที่รอตรวจ/อนุมัติแล้ว' : 'ระบบอ่านเลขอ้างอิงไม่ได้'],
        },
        {
          n: 6,
          t: 'ความชัดเจนของภาพสลิป (Auto-Slip Verification)',
          ok: selected.reviewReason ? false : true,
          auto: true,
          tag: selected.reviewReason ? 'ส่งตรวจด้วยคน' : 'ภาพชัดเจน',
          left: ['ไฟล์สลิป', selected.slipMimeType ? `${selected.slipMimeType} • ${((selected.slipFileSize || 0) / 1024).toFixed(1)} KB` : 'ลิงก์รูปภาพ'],
          right: ['หมายเหตุระบบ', selected.reviewReason || '-'],
        },
      ]
    : [];

  return (
    <StaffLayout>
      <PageHeader
        code="UCS-7"
        eyebrow="เคาน์เตอร์ตรวจสอบการชำระเงิน"
        title="ระบบตรวจสลิปและอนุมัติการจอง (Split-View Console)"
        subtitle="ตรวจสอบสลิปเทียบกับข้อมูลการจองในระบบ (BR6) แล้วอนุมัติเพื่อเปลี่ยนสถานะการจองเป็น ชำระแล้ว ออกใบเสร็จ และแจ้งเตือนลูกค้าอัตโนมัติ"
        actions={
          <button onClick={() => refetch()} className="btn-primary">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> ดึงคิวใหม่ (Sync Now)
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="สลิปรอตรวจสอบ (PENDING)" value={rows.length} unit="รายการ" icon={<Hourglass className="h-5 w-5" />} tone="blue" footer={`ยอดรวมรอตรวจ ${formatTHB(pendingTotal)}`} />
        <StatCard label="อนุมัติแล้ว (รอบการทำงานนี้)" value={session.approved} unit="รายการ" icon={<CheckCircle2 className="h-5 w-5" />} footer={`ยอดรวม ${formatTHB(session.amount)}`} />
        <StatCard label="ปฏิเสธ (รอบการทำงานนี้)" value={session.rejected} unit="รายการ" icon={<XCircle className="h-5 w-5" />} tone="rose" footer="ระบบแจ้งลูกค้าให้ส่งสลิปใหม่" />
        <StatCard label="ยอดในสลิปไม่ตรง (BR6)" value={mismatchCount} unit="รายการ" icon={<AlertTriangle className="h-5 w-5" />} tone="amber" footer="ระบบไม่อนุญาตให้อนุมัติ" />
      </div>

      {lastVerifiedReceipt && (
        <Alert tone="success" title="อนุมัติสลิปสำเร็จ — การจองเปลี่ยนเป็น ชำระแล้ว (CONFIRMED)" onClose={() => setLastVerifiedReceipt(null)}>
          ออกใบเสร็จเลขที่ <strong className="font-mono">{lastVerifiedReceipt.receiptNumber}</strong> ยอด {formatTHB(lastVerifiedReceipt.totalAmount)} และส่งแจ้งเตือนถึงลูกค้าแล้ว (BR7) •{' '}
          <Link to={`/receipt/${lastVerifiedReceipt.bookingId}`} className="font-semibold underline">
            ดูใบเสร็จ
          </Link>
        </Alert>
      )}
      {error && <Alert tone="error" title="ระบบปฏิเสธการทำรายการ" onClose={() => setError(null)}>{error}</Alert>}
      {info && <Alert tone="info" title={info} onClose={() => setInfo(null)} />}

      <div className="card flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            { k: 'all', l: `ทั้งหมด (${rows.length})` },
            { k: 'match', l: `ยอดตรง BR6 (${rows.length - mismatchCount})` },
            { k: 'mismatch', l: `ยอดไม่ตรง (${mismatchCount})` },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setFilter(t.k as any)}
              className={`rounded-xl px-4 py-2 text-sm ${filter === t.k ? 'bg-forest-900 font-semibold text-white' : 'bg-panel text-forest-900'}`}
            >
              {t.l}
            </button>
          ))}
        </div>
        <div className="relative lg:w-80">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="ค้นหา Booking ID, ลูกค้า, เลขอ้างอิงสลิป..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.6fr]">
        {/* คิวสลิป */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-forest-950">
              คิวสลิปรอตรวจสอบ <span className="badge-blue ml-1">{filtered.length} รายการ</span>
            </h2>
            <span className="text-[11px] text-slate-500">เรียงตามเวลาส่งสลิป</span>
          </div>
          {isLoading ? (
            <LoadingState />
          ) : filtered.length === 0 ? (
            <EmptyState icon={<BadgeCheck className="h-6 w-6" />} title="ไม่มีสลิปรอตรวจสอบ" description="ทุกสลิปได้รับการตรวจสอบแล้ว" />
          ) : (
            filtered.map((p) => {
              const active = p.paymentId === selectedId;
              return (
                <button
                  key={p.paymentId}
                  onClick={() => setSelectedId(p.paymentId)}
                  className={`card w-full p-4 text-left transition ${active ? 'border-l-4 border-l-forest-900 ring-2 ring-mint-200' : 'hover:ring-1 hover:ring-slate-200'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-mono text-base font-bold text-forest-950">#{p.bookingNumber}</div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${p.amountMatches === false ? 'text-rose-700' : 'text-forest-950'}`}>{formatTHB(p.amount)}</div>
                      {p.amountMatches === false && <div className="text-[10px] text-slate-400 line-through">{formatTHB(p.bookingFinalAmount)}</div>}
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {p.amountMatches === false ? <span className="badge-rose">ยอดเงินไม่ตรง (BR6 Mismatch)</span> : <span className="badge-mint">ยอดตรง 100%</span>}
                  </div>
                  <div className="mt-2 space-y-0.5 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" /> {p.customerName || p.userName}
                    </div>
                    <div className="text-slate-500">
                      {p.courtName} • {formatThaiDate(p.bookingDate, 'short')} ({p.startTime}-{p.endTime})
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                    <span>
                      {p.paymentMethod} • ส่งเมื่อ {formatDateTime(p.createdAt)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* คอนโซลตรวจสอบ */}
        {selected ? (
          <div className="card space-y-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-forest-950">ตรวจสอบรายละเอียดสลิปโอนเงิน (Inspection Console)</h2>
                <div className="text-xs text-slate-500">
                  อ้างอิงรหัสการจอง: <span className="font-mono font-semibold text-forest-700">#{selected.bookingNumber}</span> • สร้างเมื่อ{' '}
                  {formatDateTime(selected.createdAt)}
                </div>
              </div>
              <span className="badge-amber py-1">รอการอนุมัติ (Pending Staff Approval)</span>
            </div>

            {selected.reviewReason && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-semibold">ระบบตรวจสลิปอัตโนมัติส่งรายการนี้ให้พนักงานตรวจ</div>
                  <div className="text-xs">
                    {selected.reviewReason}
                    {selected.slipMimeType && ` • ไฟล์ ${selected.slipMimeType} ${((selected.slipFileSize || 0) / 1024).toFixed(1)} KB`}
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">เอกสารสลิปที่ลูกค้าแนบ (Original Slip)</span>
                  <div className="flex gap-1">
                    {[
                      { i: <ZoomIn className="h-4 w-4" />, f: () => setZoom((z) => Math.min(3, z + 0.25)) },
                      { i: <ZoomOut className="h-4 w-4" />, f: () => setZoom((z) => Math.max(0.5, z - 0.25)) },
                      { i: <RotateCw className="h-4 w-4" />, f: () => setRotate((r) => r + 90) },
                      { i: <Maximize2 className="h-4 w-4" />, f: () => setShowFull(true) },
                    ].map((b, k) => (
                      <button key={k} onClick={b.f} className="rounded-lg bg-panel p-1.5 text-forest-800 hover:bg-forest-100">
                        {b.i}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex h-96 items-center justify-center overflow-hidden rounded-2xl bg-panel">
                  {selected.slipUrl ? (
                    <img
                      src={selected.slipUrl}
                      alt="Slip"
                      className="max-h-full max-w-full object-contain transition-transform"
                      style={{ transform: `scale(${zoom}) rotate(${rotate}deg)` }}
                    />
                  ) : (
                    <span className="text-xs text-slate-400">ไม่มีรูปสลิป</span>
                  )}
                </div>
                <div className="rounded-xl bg-panel p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">รหัสอ้างอิงสลิป:</span>
                    <span className="font-mono font-semibold">{selected.slipReference || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">จำนวนเงินในสลิป:</span>
                    <span className="text-lg font-bold text-forest-950">{formatTHB(selected.amount)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-600">เกณฑ์ตรวจสอบเทียบเคียงตาม BR6</span>
                  <span className="badge-mint">
                    ระบบผ่าน {checks.filter((c) => c.auto && c.ok).length} / {checks.filter((c) => c.auto).length} ข้ออัตโนมัติ
                  </span>
                </div>
                {checks.map((c) => (
                  <div key={c.n} className={`rounded-xl p-3 ${c.ok === false ? 'bg-rose-50 ring-1 ring-rose-200' : 'bg-panel'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-forest-950">
                        {c.n}. {c.t}
                      </div>
                      <span className={c.ok === false ? 'badge-rose' : c.ok ? 'badge-mint' : 'badge-slate'}>
                        {c.ok === false ? <XCircle className="h-3 w-3" /> : c.ok ? <CheckCircle2 className="h-3 w-3" /> : null}
                        {c.tag}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg bg-white px-2 py-1.5">
                        <div className="text-slate-400">{c.left[0]}:</div>
                        <div className="font-semibold">{c.left[1]}</div>
                      </div>
                      <div className="rounded-lg bg-white px-2 py-1.5">
                        <div className="text-slate-400">{c.right[0]}:</div>
                        <div className="font-semibold">{c.right[1]}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="label">บันทึกหมายเหตุผลการตรวจสอบ / เหตุผลกรณีปฏิเสธ (Staff Audit Notes)</label>
              <textarea
                className="input h-20 resize-none"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="เช่น ยอดเงินในสลิปไม่ตรงกับยอดจอง / สลิปไม่ชัด กรุณาแนบใหม่"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <button
                onClick={() => setConfirmVerify(true)}
                disabled={isProcessing || selected.amountMatches === false}
                className="btn-primary h-full flex-col py-4 sm:col-span-1"
                title={selected.amountMatches === false ? 'ยอดเงินไม่ตรง (BR6) ไม่อนุญาตให้อนุมัติ' : ''}
              >
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" /> อนุมัติสลิป & ยืนยันการจอง
                </span>
                <span className="badge bg-mint-300 text-forest-950">{formatTHB(selected.amount)}</span>
              </button>
              <button
                onClick={() => handleReject(selected.paymentId, `กรุณาแนบสลิปใหม่: ${rejectionReason || 'สลิปไม่ชัดเจน'}`)}
                disabled={isProcessing}
                className="btn h-full bg-amber-50 py-4 text-amber-800 hover:bg-amber-100"
              >
                <RotateCcw className="h-5 w-5" /> ขอให้อัปโหลดสลิปใหม่
              </button>
              <button onClick={() => handleReject(selected.paymentId, rejectionReason)} disabled={isProcessing} className="btn-danger-soft h-full py-4">
                {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <XCircle className="h-5 w-5" />} ปฏิเสธสลิป (Reject)
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-xl bg-panel p-3 text-xs">
                <Landmark className="h-5 w-5 text-forest-700" />
                <div>
                  <div className="text-slate-500">สนามที่ทำการจอง</div>
                  <div className="font-semibold">{selected.courtName}</div>
                  <div className="text-slate-500">
                    {selected.startTime} - {selected.endTime} น.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-panel p-3 text-xs">
                <User className="h-5 w-5 text-forest-700" />
                <div>
                  <div className="text-slate-500">ลูกค้า</div>
                  <div className="font-semibold">{selected.customerName || selected.userName}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-panel p-3 text-xs">
                <ShieldCheck className="h-5 w-5 text-forest-700" />
                <div>
                  <div className="text-slate-500">ผลหลังอนุมัติ</div>
                  <div className="font-semibold">CONFIRMED + ใบเสร็จ + แจ้งเตือน</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState title="เลือกสลิปจากคิวด้านซ้ายเพื่อตรวจสอบ" />
        )}
      </div>

      <section className="card-dark flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-6 w-6 shrink-0 text-mint-300" />
          <div className="text-sm text-white/80">
            <span className="font-semibold text-mint-300">ระเบียบ BR6 (Slip Verification Standards)</span> — เจ้าหน้าที่ต้องตรวจสอบยอดเงินในสลิปให้ตรงกับยอดการจองทุกประการก่อนอนุมัติ
            เมื่ออนุมัติ ระบบจะเปลี่ยนสถานะการจองเป็นชำระแล้ว ออกใบเสร็จอิเล็กทรอนิกส์ และส่งแจ้งเตือนถึงลูกค้าใน Transaction เดียว
          </div>
        </div>
      </section>

      <Modal open={confirmVerify && !!selected} onClose={() => setConfirmVerify(false)} title="ยืนยันการอนุมัติสลิป">
        {selected && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-600">
              อนุมัติสลิปของการจอง <strong className="font-mono">#{selected.bookingNumber}</strong> ยอด <strong>{formatTHB(selected.amount)}</strong> ใช่หรือไม่?
              ระบบจะออกใบเสร็จและแจ้งเตือนลูกค้าทันที
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={() => setConfirmVerify(false)}>
                ยกเลิก
              </button>
              <button className="btn-primary" onClick={() => handleVerify(selected.paymentId)} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} ยืนยันการอนุมัติ
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showFull && !!selected?.slipUrl} onClose={() => setShowFull(false)} title="ภาพสลิปขนาดเต็ม" size="lg">
        {selected?.slipUrl && <img src={selected.slipUrl} alt="Slip full" className="mx-auto max-h-[70vh] object-contain" />}
      </Modal>
    </StaffLayout>
  );
};
