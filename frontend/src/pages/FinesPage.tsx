import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMyFinesApi, payFineApi } from '../services/borrowing';
import { CustomerLayout } from '../components/layout/CustomerLayout';
import { Alert, EmptyState, LoadingState, Modal, PageHeader, StatCard, StatusBadge, formatDateTime, formatTHB } from '../components/ui';
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, PackageX, Timer, Wrench } from 'lucide-react';

const TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  LATE_RETURN: { label: 'คืนอุปกรณ์ล่าช้า', icon: <Timer className="h-5 w-5" /> },
  DAMAGE: { label: 'อุปกรณ์ชำรุด', icon: <Wrench className="h-5 w-5" /> },
  LOSS: { label: 'อุปกรณ์สูญหาย', icon: <PackageX className="h-5 w-5" /> },
};

// ค่าปรับอุปกรณ์ของฉัน (BR11) — ไม่มี Prototype ออกแบบตาม Design System
export const FinesPage: React.FC = () => {
  const { data: fines = [], isLoading, refetch } = useQuery({ queryKey: ['myFines'], queryFn: getMyFinesApi });
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const handlePayFine = async (fineId: number) => {
    setBusy(true);
    try {
      await payFineApi(fineId);
      setMsg({ tone: 'success', text: 'ชำระค่าปรับเรียบร้อย สามารถจองสนามได้ตามปกติ' });
      refetch();
    } catch (err: any) {
      setMsg({ tone: 'error', text: err.response?.data?.message || 'Failed to pay fine' });
    } finally {
      setBusy(false);
      setConfirmId(null);
    }
  };

  const unpaid = fines.filter((f) => f.status === 'UNPAID');
  const unpaidTotal = unpaid.reduce((s, f) => s + f.amount, 0);
  const target = fines.find((f) => f.fineId === confirmId);

  return (
    <CustomerLayout>
      <PageHeader
        code="Fines"
        eyebrow="ค่าปรับอุปกรณ์กีฬา"
        title="ค่าปรับและยอดค้างชำระของฉัน"
        subtitle="ค่าปรับคืนอุปกรณ์ล่าช้า (20 บาท / 15 นาที / ชิ้น) และค่าเสียหายตามราคาประเมิน — มีค่าปรับค้างชำระจะไม่สามารถจองสนามใหม่ได้"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="ยอดค้างชำระ" value={formatTHB(unpaidTotal)} icon={<AlertTriangle className="h-5 w-5" />} tone={unpaidTotal > 0 ? 'rose' : 'mint'} />
        <StatCard label="รายการค้างชำระ" value={unpaid.length} unit="รายการ" icon={<CreditCard className="h-5 w-5" />} tone="amber" />
        <StatCard label="ชำระแล้ว" value={fines.length - unpaid.length} unit="รายการ" icon={<CheckCircle2 className="h-5 w-5" />} />
      </div>

      {unpaid.length > 0 && (
        <Alert tone="warning" title="บัญชีของคุณมีค่าปรับค้างชำระ">
          ระบบจะปฏิเสธการจองสนามใหม่จนกว่าจะชำระค่าปรับครบทุกรายการ
        </Alert>
      )}
      {msg && <Alert tone={msg.tone} title={msg.text} onClose={() => setMsg(null)} />}

      {isLoading ? (
        <LoadingState />
      ) : fines.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="ไม่มีค่าปรับค้างชำระ" description="บัญชีของคุณอยู่ในสถานะดี ไม่มีค่าปรับใด ๆ" />
      ) : (
        <div className="space-y-3">
          {fines.map((fine) => {
            const meta = TYPE_META[fine.fineType] || { label: fine.fineType, icon: <AlertTriangle className="h-5 w-5" /> };
            return (
              <div key={fine.fineId} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${fine.status === 'UNPAID' ? 'bg-rose-100 text-rose-700' : 'bg-mint-100 text-forest-700'}`}>
                    {meta.icon}
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-forest-950">{meta.label}</span>
                      <StatusBadge status={fine.status} />
                      {fine.bookingNumber && <span className="badge-slate font-mono">#{fine.bookingNumber}</span>}
                    </div>
                    <div className="text-slate-600">{fine.reason}</div>
                    <div className="text-slate-400">ออกเมื่อ {formatDateTime(fine.createdAt)}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500">จำนวนเงินค่าปรับ</div>
                    <div className={`text-2xl font-bold ${fine.status === 'UNPAID' ? 'text-rose-800' : 'text-forest-950'}`}>{formatTHB(fine.amount)}</div>
                  </div>
                  {fine.status === 'UNPAID' && (
                    <button onClick={() => setConfirmId(fine.fineId)} className="btn-danger">
                      <CreditCard className="h-4 w-4" /> ชำระค่าปรับ
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!target} onClose={() => setConfirmId(null)} title="ยืนยันการชำระค่าปรับ">
        {target && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-600">
              ชำระค่าปรับ <strong>{TYPE_META[target.fineType]?.label || target.fineType}</strong> ยอด <strong>{formatTHB(target.amount)}</strong> ใช่หรือไม่?
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={() => setConfirmId(null)}>
                ยกเลิก
              </button>
              <button className="btn-primary" onClick={() => handlePayFine(target.fineId)} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} ยืนยันชำระ
              </button>
            </div>
          </div>
        )}
      </Modal>
    </CustomerLayout>
  );
};
