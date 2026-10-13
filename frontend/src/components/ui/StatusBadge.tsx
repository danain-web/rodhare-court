import React from 'react';

type Tone = 'mint' | 'forest' | 'amber' | 'rose' | 'slate' | 'blue';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  // การจอง (BOOKINGS.status)
  PENDING_PAYMENT: { label: 'รอชำระเงิน', tone: 'amber' },
  PAYMENT_VERIFIED: { label: 'ตรวจสอบแล้ว', tone: 'mint' },
  CONFIRMED: { label: 'ชำระแล้ว / ยืนยันแล้ว', tone: 'forest' },
  CHECKED_IN: { label: 'เช็คอินแล้ว', tone: 'blue' },
  COMPLETED: { label: 'ใช้บริการเสร็จสิ้น', tone: 'slate' },
  CANCELLED: { label: 'ยกเลิกแล้ว', tone: 'rose' },
  REFUNDED: { label: 'คืนเงินแล้ว', tone: 'slate' },
  EXPIRED: { label: 'หมดเวลาชำระ (BR3)', tone: 'rose' },
  // การชำระเงิน / คำขอคืนเงิน
  PENDING: { label: 'รอตรวจสอบ', tone: 'amber' },
  VERIFIED: { label: 'อนุมัติแล้ว', tone: 'mint' },
  REJECTED: { label: 'ปฏิเสธ', tone: 'rose' },
  APPROVED: { label: 'อนุมัติแล้ว', tone: 'mint' },
  PROCESSED: { label: 'โอนคืนแล้ว', tone: 'forest' },
  // ค่าปรับ
  UNPAID: { label: 'ค้างชำระ', tone: 'rose' },
  PAID: { label: 'ชำระแล้ว', tone: 'mint' },
  WAIVED: { label: 'ยกเว้น', tone: 'slate' },
  // การยืมอุปกรณ์
  BORROWED: { label: 'กำลังยืม', tone: 'blue' },
  RETURNED: { label: 'คืนแล้ว', tone: 'mint' },
  DAMAGED: { label: 'ชำรุด', tone: 'rose' },
  LOST: { label: 'สูญหาย', tone: 'rose' },
  OVERDUE: { label: 'เกินกำหนดคืน', tone: 'amber' },
  // สนาม
  AVAILABLE: { label: 'พร้อมใช้งาน', tone: 'mint' },
  MAINTENANCE: { label: 'ปิดปรับปรุง', tone: 'amber' },
  CLOSED: { label: 'ปิดให้บริการ', tone: 'rose' },
};

const TONE_CLASS: Record<Tone, string> = {
  mint: 'badge-mint',
  forest: 'badge-forest',
  amber: 'badge-amber',
  rose: 'badge-rose',
  slate: 'badge-slate',
  blue: 'badge-blue',
};

const DOT: Record<Tone, string> = {
  mint: 'bg-mint-500',
  forest: 'bg-mint-300',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  slate: 'bg-slate-400',
  blue: 'bg-sky-500',
};

export const statusLabel = (status?: string): string => (status && STATUS[status]?.label) || status || '-';

export const StatusBadge: React.FC<{ status?: string; className?: string; showCode?: boolean }> = ({ status, className = '', showCode }) => {
  const meta = (status && STATUS[status]) || { label: status || '-', tone: 'slate' as Tone };
  return (
    <span className={`${TONE_CLASS[meta.tone]} ${className}`} title={status}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[meta.tone]}`} />
      {meta.label}
      {showCode && status && <span className="opacity-60">({status})</span>}
    </span>
  );
};
