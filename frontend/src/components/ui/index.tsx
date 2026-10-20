import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, CheckCircle2, ChevronRight, Home, Inbox, Info, Loader2, TimerReset, X } from 'lucide-react';

export { StatusBadge, statusLabel } from './StatusBadge';
export * from './format';

// ---------------- หัวข้อหน้า (eyebrow + h1 + คำอธิบาย + ปุ่มด้านขวา) ----------------
export const PageHeader: React.FC<{
  code?: string;
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ code, eyebrow, title, subtitle, actions }) => (
  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div className="space-y-2">
      {(code || eyebrow) && (
        <div className="flex flex-wrap items-center gap-2">
          {code && <span className="badge-mint uppercase tracking-wide">{code}</span>}
          {eyebrow && <span className="text-xs text-slate-500">• {eyebrow}</span>}
        </div>
      )}
      <h1 className="text-2xl font-bold leading-tight text-forest-950 md:text-3xl">{title}</h1>
      {subtitle && <p className="max-w-3xl text-sm text-slate-500">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

// ---------------- Breadcrumb ----------------
export const Breadcrumb: React.FC<{ items: { label: string; to?: string }[] }> = ({ items }) => (
  <nav className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
    <Link to="/courts" className="inline-flex items-center gap-1 hover:text-forest-700">
      <Home className="h-3.5 w-3.5" /> หน้าหลัก
    </Link>
    {items.map((it, i) => (
      <React.Fragment key={i}>
        <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
        {it.to && i < items.length - 1 ? (
          <Link to={it.to} className="hover:text-forest-700">
            {it.label}
          </Link>
        ) : (
          <span className={i === items.length - 1 ? 'badge-mint' : ''}>{it.label}</span>
        )}
      </React.Fragment>
    ))}
  </nav>
);

// ---------------- KPI card (UCS-5/6.4/7/8/9) ----------------
export const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  unit?: string;
  icon?: React.ReactNode;
  tone?: 'mint' | 'amber' | 'rose' | 'blue' | 'forest';
  footer?: React.ReactNode;
}> = ({ label, value, unit, icon, tone = 'mint', footer }) => {
  const toneCls = {
    mint: 'bg-mint-100 text-forest-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    blue: 'bg-sky-100 text-sky-700',
    forest: 'bg-forest-900 text-mint-300',
  }[tone];
  const valueCls = tone === 'rose' ? 'text-rose-700' : 'text-forest-950';
  return (
    <div className="card flex flex-col justify-between gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-semibold text-slate-500">{label}</div>
        {icon && <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneCls}`}>{icon}</div>}
      </div>
      <div className={`text-3xl font-bold ${valueCls}`}>
        {value}
        {unit && <span className="ml-1.5 text-sm font-medium text-slate-500">{unit}</span>}
      </div>
      {footer && <div className="text-[11px] text-slate-500">{footer}</div>}
    </div>
  );
};

// ---------------- Stepper ขั้นตอนการจอง 4 ขั้น (UCS-3.1 / 3.3 / 4.1) ----------------
const BOOKING_STEPS = ['เลือกสนามและเวลา', 'เลือกอุปกรณ์เสริม', 'สรุปรายการจอง', 'อัปโหลดสลิปชำระเงิน'];

export const Stepper: React.FC<{ current: 1 | 2 | 3 | 4; steps?: string[] }> = ({ current, steps = BOOKING_STEPS }) => (
  <div className="card p-4">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {steps.map((label, idx) => {
        const n = idx + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div
            key={label}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 ${active ? 'bg-panel' : ''}`}
          >
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                done ? 'bg-forest-900 text-white' : active ? 'bg-forest-900 text-white ring-4 ring-mint-200' : 'bg-slate-100 text-slate-400'
              }`}
            >
              {done ? <CheckCircle2 className="h-5 w-5" /> : n}
            </div>
            <div className="min-w-0">
              <div className={`text-[10px] ${active ? 'text-forest-600' : 'text-slate-400'}`}>
                {done ? `ขั้นตอนที่ ${n}` : active ? 'ขั้นตอนปัจจุบัน' : n === steps.length ? 'ขั้นตอนสุดท้าย' : 'ขั้นตอนถัดไป'}
              </div>
              <div className={`truncate text-sm font-semibold ${n <= current ? 'text-forest-950' : 'text-slate-400'}`}>{label}</div>
            </div>
          </div>
        );
      })}
    </div>
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-forest-900 transition-all" style={{ width: `${(current / steps.length) * 100}%` }} />
    </div>
  </div>
);

// ---------------- นับถอยหลัง (BR3 15 นาที) ----------------
export const useCountdown = (expiresAt?: string | Date | null) => {
  const target = expiresAt ? new Date(expiresAt).getTime() : null;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (!target) return { remainingMs: null as number | null, label: '--:--', expired: false };
  const remainingMs = Math.max(0, target - now);
  const m = Math.floor(remainingMs / 60000);
  const s = Math.floor((remainingMs % 60000) / 1000);
  return { remainingMs, label: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, expired: remainingMs <= 0 };
};

export const CountdownBanner: React.FC<{ expiresAt?: string | Date | null; title?: string; description?: string; tone?: 'rose' | 'amber' }> = ({
  expiresAt,
  title = 'โควตาสนามของคุณจะถูกสงวนไว้ชั่วคราว',
  description = 'หากไม่ชำระเงินและส่งสลิปภายในเวลาที่กำหนด ระบบจะยกเลิกการจองอัตโนมัติและคืนคอร์ทรวมถึงอุปกรณ์เข้าสู่ตารางว่างทันที',
  tone = 'rose',
}) => {
  const { label, expired } = useCountdown(expiresAt);
  const wrap = tone === 'rose' ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100';
  const iconBg = tone === 'rose' ? 'bg-rose-900 text-white' : 'bg-amber-100 text-amber-600';
  return (
    <div className={`flex flex-col gap-4 rounded-2xl border p-5 md:flex-row md:items-center md:justify-between ${wrap}`}>
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          <TimerReset className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge bg-rose-900 text-white">ล็อกสนาม 15 นาที (Reservation Lock)</span>
            <span className="text-sm font-semibold text-rose-900">{title}</span>
          </div>
          <p className="text-xs text-slate-600">{description}</p>
        </div>
      </div>
      <div className="shrink-0 rounded-xl bg-white px-5 py-3 text-right shadow-sm">
        <div className="text-[10px] text-slate-500">เวลาที่เหลือในการชำระเงิน</div>
        <div className={`flex items-center justify-end gap-2 text-3xl font-bold ${expired ? 'text-slate-400' : 'text-rose-900'}`}>
          {!expired && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />}
          {expired ? 'หมดเวลา' : label}
          {!expired && <span className="text-xs font-normal text-slate-500">นาที</span>}
        </div>
      </div>
    </div>
  );
};

// ---------------- กล่องแจ้งเตือน ----------------
export const Alert: React.FC<{
  tone?: 'error' | 'success' | 'info' | 'warning';
  title?: string;
  children?: React.ReactNode;
  onClose?: () => void;
}> = ({ tone = 'info', title, children, onClose }) => {
  const cfg = {
    error: { cls: 'bg-rose-50 border-rose-200 text-rose-800', icon: <AlertOctagon className="h-5 w-5 text-rose-600" /> },
    success: { cls: 'bg-mint-50 border-mint-200 text-forest-900', icon: <CheckCircle2 className="h-5 w-5 text-mint-600" /> },
    info: { cls: 'bg-panel border-sky-100 text-slate-700', icon: <Info className="h-5 w-5 text-sky-600" /> },
    warning: { cls: 'bg-amber-50 border-amber-200 text-amber-900', icon: <Info className="h-5 w-5 text-amber-600" /> },
  }[tone];
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${cfg.cls}`}>
      <div className="shrink-0">{cfg.icon}</div>
      <div className="flex-1 space-y-0.5">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className="text-[13px] leading-relaxed">{children}</div>}
      </div>
      {onClose && (
        <button onClick={onClose} className="shrink-0 rounded-lg p-1 hover:bg-black/5" aria-label="ปิด">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

export const LoadingState: React.FC<{ label?: string }> = ({ label = 'กำลังโหลดข้อมูล...' }) => (
  <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
    <Loader2 className="h-5 w-5 animate-spin text-forest-600" /> {label}
  </div>
);

export const EmptyState: React.FC<{ title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }> = ({
  title,
  description,
  action,
  icon,
}) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-panel text-forest-600">{icon || <Inbox className="h-6 w-6" />}</div>
    <div className="font-semibold text-forest-950">{title}</div>
    {description && <p className="max-w-md text-xs text-slate-500">{description}</p>}
    {action}
  </div>
);

// ---------------- กล่องกฎธุรกิจ (static text) ----------------
export const RuleCard: React.FC<{ code: string; title: string; children: React.ReactNode; icon?: React.ReactNode }> = ({ code, title, children, icon }) => (
  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
    <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-forest-950">
      {icon}
      <span>
        กฎข้อที่ {code}: {title}
      </span>
    </div>
    <p className="text-xs leading-relaxed text-slate-500">{children}</p>
  </div>
);

// ---------------- Modal ----------------
export const Modal: React.FC<{ open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; size?: 'md' | 'lg' }> = ({
  open,
  onClose,
  title,
  children,
  size = 'md',
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-950/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`card max-h-[90vh] w-full overflow-y-auto p-6 ${size === 'lg' ? 'max-w-3xl' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="text-lg font-bold text-forest-950">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="ปิด">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

// ---------------- กล่องยืนยันการกระทำ (ลบ/ระงับ ฯลฯ) ----------------
export const ConfirmModal: React.FC<{
  open: boolean;
  title: React.ReactNode;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ open, title, message, confirmLabel = 'ยืนยัน', danger, busy, error, onConfirm, onClose }) => (
  <Modal open={open} onClose={onClose} title={title}>
    <div className="space-y-4">
      {error && <Alert tone="error" title={error} />}
      <div className="text-sm leading-relaxed text-slate-600">{message}</div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={onClose} className="btn-outline">
          ยกเลิก
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={danger ? 'btn-danger' : 'btn-primary'}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {confirmLabel}
        </button>
      </div>
    </div>
  </Modal>
);

// ---------------- แถวข้อมูล label : value ----------------
export const InfoRow: React.FC<{ label: React.ReactNode; value: React.ReactNode; strong?: boolean }> = ({ label, value, strong }) => (
  <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
    <span className="text-slate-500">{label}</span>
    <span className={`text-right ${strong ? 'font-bold text-forest-950' : 'font-medium text-slate-800'}`}>{value}</span>
  </div>
);
