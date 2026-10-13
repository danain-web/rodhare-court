import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPendingRefundsApi, approveRefundApi, rejectRefundApi, RefundRequest } from '../services/refund';
import { StaffLayout } from '../components/layout/StaffLayout';
import { Alert, EmptyState, InfoRow, LoadingState, PageHeader, StatCard, apiErrorMessage, formatDateTime, formatTHB } from '../components/ui';
import { BadgeCheck, CheckCircle2, ChevronRight, Hourglass, Landmark, Loader2, Percent, ShieldCheck, Wallet, XCircle } from 'lucide-react';

type RefundRow = RefundRequest & { bookingNumber?: string; userName?: string; paidAmount?: number; refundPercentage?: number; bookingStatus?: string };

// UCS-6.4 อนุมัติการคืนเงินและบันทึกผล (Refund Approval Console)
export const StaffRefundsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [session, setSession] = useState({ approved: 0, rejected: 0, amount: 0 });

  const { data: refunds = [], isLoading } = useQuery({
    queryKey: ['pendingRefunds'],
    queryFn: getPendingRefundsApi,
    refetchInterval: 10000,
  });
  const rows = refunds as RefundRow[];
  const rid = (r: RefundRow) => r.refundId || r.id || 0;
  const ramt = (r: RefundRow) => r.requestedAmount ?? r.amount ?? 0;

  useEffect(() => {
    if (!rows.length) setSelectedId(null);
    else if (!rows.some((r) => rid(r) === selectedId)) setSelectedId(rid(rows[0]));
  }, [refunds]);
  useEffect(() => setNote(''), [selectedId]);

  const selected = rows.find((r) => rid(r) === selectedId) || null;

  const approveMutation = useMutation({
    mutationFn: approveRefundApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingRefunds'] });
      if (selected) setSession((s) => ({ ...s, approved: s.approved + 1, amount: s.amount + ramt(selected) }));
      setMessage({ tone: 'success', text: 'อนุมัติการคืนเงินเรียบร้อย — สถานะการจองเปลี่ยนเป็น REFUNDED และแจ้งลูกค้าแล้ว' });
    },
    onError: (err: any) => {
      setMessage({ tone: 'error', text: err.response?.data?.message || 'Failed to approve refund' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, n }: { id: number; n: string }) => rejectRefundApi(id, n),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingRefunds'] });
      setSession((s) => ({ ...s, rejected: s.rejected + 1 }));
      setMessage({ tone: 'success', text: 'ปฏิเสธคำขอคืนเงินและบันทึกเหตุผลเรียบร้อย' });
    },
    onError: (err) => setMessage({ tone: 'error', text: apiErrorMessage(err) }),
  });

  const handleReject = () => {
    if (!selected) return;
    if (note.trim().length < 3) {
      setMessage({ tone: 'error', text: 'กรุณาระบุเหตุผลการปฏิเสธอย่างน้อย 3 ตัวอักษร' });
      return;
    }
    rejectMutation.mutate({ id: rid(selected), n: note.trim() });
  };

  const pendingTotal = rows.reduce((s, r) => s + ramt(r), 0);
  const busy = approveMutation.isPending || rejectMutation.isPending;

  const tierOf = (pct?: number) =>
    pct === 100
      ? { label: 'Tier 1: คืน 100%', cls: 'badge-mint', bar: 'border-l-forest-900' }
      : pct === 50
        ? { label: 'Tier 2: คืน 50%', cls: 'badge-amber', bar: 'border-l-amber-500' }
        : { label: `คืน ${pct ?? 0}%`, cls: 'badge-slate', bar: 'border-l-slate-300' };

  return (
    <StaffLayout>
      <PageHeader
        code="UCS-6.4 Console"
        eyebrow="ฝ่ายการเงินและบัญชี"
        title="อนุมัติการคืนเงินและบันทึกผล"
        subtitle="ตรวจสอบคำขอยกเลิกการจอง คำนวณยอดคืนเงินตามเกณฑ์ BR12 และยืนยันการโอนเงินคืนสู่บัญชีลูกค้า"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="คำขอรอตรวจสอบ" value={rows.length} icon={<Hourglass className="h-5 w-5" />} tone="amber" footer="ต้องการอนุมัติเร่งด่วน" />
        <StatCard label="อนุมัติแล้ว (รอบการทำงานนี้)" value={session.approved} unit="รายการ" icon={<ShieldCheck className="h-5 w-5" />} footer={`ยอดเงินรวม ${formatTHB(session.amount)}`} />
        <StatCard label="ปฏิเสธคำขอ (รอบการทำงานนี้)" value={session.rejected} icon={<XCircle className="h-5 w-5" />} tone="rose" footer="บันทึกเหตุผลใน Audit Log" />
        <StatCard label="ยอดคืนเงินรออนุมัติ" value={formatTHB(pendingTotal)} icon={<Landmark className="h-5 w-5" />} tone="blue" footer={`${rows.length} รายการในคิว`} />
      </div>

      {message && <Alert tone={message.tone} title={message.text} onClose={() => setMessage(null)} />}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-forest-950">
              คิวคำขอคืนเงินที่รอดำเนินการ <span className="badge-amber ml-1">{rows.length} คิว</span>
            </h2>
            <span className="text-[11px] text-slate-500">อัปเดตอัตโนมัติทุก 10 วินาที</span>
          </div>
          {isLoading ? (
            <LoadingState />
          ) : rows.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="ดำเนินการคำขอคืนเงินครบทั้งหมดแล้ว" description="ยังไม่มีคำขอคืนเงินใหม่" />
          ) : (
            rows.map((r) => {
              const t = tierOf(r.refundPercentage);
              const active = rid(r) === selectedId;
              return (
                <button
                  key={rid(r)}
                  onClick={() => setSelectedId(rid(r))}
                  className={`card w-full border-l-4 p-5 text-left transition ${t.bar} ${active ? 'ring-2 ring-mint-200' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-forest-950">#RF-{rid(r)}</span>
                        <span className="badge-amber">รออนุมัติ</span>
                      </div>
                      <div className="text-xs text-slate-500">อ้างอิงการจอง: #{r.bookingNumber || r.bookingId}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-500">คำนวณยอดคืน (BR12)</div>
                      <div className="text-2xl font-bold text-forest-950">{formatTHB(ramt(r))}</div>
                      <span className={t.cls}>{t.label}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-panel px-4 py-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mint-100 font-bold text-forest-800">
                        {(r.userName || 'U').slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <div className="font-semibold text-forest-950">{r.userName || `User #${r.userId}`}</div>
                        <div className="text-slate-500">ยื่นคำขอ {formatDateTime(r.createdAt)}</div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </button>
              );
            })
          )}

          <div className="card space-y-3 p-5">
            <div className="text-sm font-semibold text-forest-950">เกณฑ์เงื่อนไข Business Rule BR12 สำหรับเจ้าหน้าที่การเงิน</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-panel p-3 text-xs">
                <div className="font-semibold text-forest-700">&gt; 24 ชั่วโมงก่อนเริ่ม</div>
                <div className="text-slate-600">คืนเงิน 100% เต็มจำนวน</div>
              </div>
              <div className="rounded-xl bg-panel p-3 text-xs">
                <div className="font-semibold text-amber-700">&lt; 24 ชม. ก่อนเริ่ม</div>
                <div className="text-slate-600">คืนเงิน 50% ของยอดชำระ</div>
              </div>
              <div className="rounded-xl bg-panel p-3 text-xs">
                <div className="font-semibold text-rose-700">เลยเวลาเริ่มใช้งาน</div>
                <div className="text-slate-600">ไม่สามารถยกเลิก/คืนเงินได้</div>
              </div>
            </div>
          </div>
        </div>

        {selected ? (
          <div className="card space-y-5 p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[11px] text-forest-600">ตรวจสอบรายละเอียดคำขอ</div>
                <div className="text-2xl font-bold text-forest-950">#RF-{rid(selected)}</div>
              </div>
              <span className="badge-amber">รอตรวจสอบอนุมัติ</span>
            </div>

            <div className="space-y-2 rounded-2xl bg-panel p-4 text-sm">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-forest-900">ข้อมูลลูกค้าและรายการจอง</span>
                <span className="font-mono">#{selected.bookingNumber || selected.bookingId}</span>
              </div>
              <InfoRow label="ชื่อสมาชิก" value={selected.userName || `User #${selected.userId}`} />
              <InfoRow label="สถานะการจองปัจจุบัน" value={selected.bookingStatus || '-'} />
              <InfoRow label="วันที่ยื่นคำขอ" value={formatDateTime(selected.createdAt)} />
            </div>

            <div className="rounded-2xl bg-mint-50 p-5 ring-1 ring-mint-200">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-forest-950">
                  <Percent className="h-4 w-4" /> การคำนวณสิทธิ์อัตโนมัติ (BR12 Engine)
                </span>
                <span className={tierOf(selected.refundPercentage).cls}>{selected.refundPercentage}% REFUND</span>
              </div>
              <InfoRow label="ยอดชำระเงินจริง (VERIFIED)" value={selected.paidAmount !== undefined ? formatTHB(selected.paidAmount) : 'ยังไม่อนุมัติสลิป (ยกเลิกระหว่างตรวจ)'} />
              <InfoRow label="อัตราคืนเงิน" value={`${selected.refundPercentage}%`} />
              <div className="mt-2 flex items-end justify-between border-t border-mint-200 pt-3">
                <span className="font-semibold text-forest-950">ยอดคืนสุทธิที่ต้องอนุมัติ:</span>
                <span className="text-3xl font-bold text-forest-950">{formatTHB(ramt(selected))}</span>
              </div>
            </div>

            <div className="rounded-xl bg-panel p-4 text-xs">
              <div className="mb-1 font-semibold text-forest-900">เหตุผลการยกเลิกที่ลูกค้าระบุ</div>
              <div className="italic text-slate-600">"{selected.reason || 'ไม่ได้ระบุเหตุผล'}"</div>
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-panel p-4 text-xs">
              <Wallet className="h-8 w-8 rounded-lg bg-forest-900 p-1.5 text-mint-300" />
              <div>
                <div className="font-semibold text-forest-950">ช่องทางโอนคืน</div>
                <div className="text-slate-500">โอนคืนบัญชีต้นทางที่ลูกค้าใช้ชำระเงิน</div>
              </div>
            </div>

            <div>
              <label className="label">บันทึกหมายเหตุของเจ้าหน้าที่การเงิน (Staff Internal Audit Notes) — จำเป็นเมื่อปฏิเสธ</label>
              <textarea className="input h-20 resize-none" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ระบุหมายเหตุหรือเหตุผลประกอบ..." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => approveMutation.mutate(rid(selected))} disabled={busy} className="btn-primary py-3.5">
                {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-5 w-5" />}
                อนุมัติการคืนเงิน ({formatTHB(ramt(selected))})
              </button>
              <button onClick={handleReject} disabled={busy} className="btn-danger-soft py-3.5">
                {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-5 w-5" />}
                ปฏิเสธคำขอคืนเงิน
              </button>
            </div>
            <div className="text-center text-[11px] text-slate-500">ทุกการอนุมัติ/ปฏิเสธถูกบันทึกใน AUDIT_LOGS พร้อมผู้ดำเนินการ (BR16)</div>
          </div>
        ) : (
          <EmptyState title="เลือกคำขอจากคิวเพื่อตรวจสอบ" />
        )}
      </div>
    </StaffLayout>
  );
};
