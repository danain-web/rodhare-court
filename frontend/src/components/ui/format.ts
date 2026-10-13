// ตัวช่วยจัดรูปแบบข้อมูลสำหรับแสดงผล (ไม่เกี่ยวกับการเรียก API)

export const formatTHB = (value: number | undefined | null, digits = 2): string =>
  `฿${Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const formatNumber = (value: number | undefined | null): string => Number(value || 0).toLocaleString('th-TH');

// 'YYYY-MM-DD' -> 'วันเสาร์ที่ 15 มีนาคม 2568' (สร้าง Date แบบเวลาท้องถิ่น ไม่ใช่ UTC)
export const parseLocalDate = (dateStr?: string): Date | null => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

export const formatThaiDate = (dateStr?: string, style: 'long' | 'short' = 'long'): string => {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr || '-';
  return style === 'long'
    ? d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
};

export const formatDateTime = (value?: string | Date): string => {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const formatTime = (value?: string | Date): string => {
  if (!value) return '-';
  const d = new Date(value);
  return isNaN(d.getTime()) ? String(value) : d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
};

export const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const addDaysISO = (dateStr: string, days: number): string => {
  const d = parseLocalDate(dateStr) || new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const hoursBetween = (start: string, end: string): number => {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  return Math.max(0, (toMin(end) - toMin(start)) / 60);
};

// ดึงข้อความ error ที่หลังบ้านส่งกลับมา (message ภาษาไทยตามกฎ BR)
export const apiErrorMessage = (err: any, fallback = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'): string =>
  err?.response?.data?.message || err?.response?.data?.error || err?.message || fallback;

export const sportLabel = (name?: string): string => {
  const map: Record<string, string> = {
    BADMINTON: 'แบดมินตัน',
    BASKETBALL: 'บาสเกตบอล',
    FUTSAL: 'ฟุตซอล',
    TENNIS: 'เทนนิส',
  };
  if (!name) return '-';
  return map[name.toUpperCase()] || name;
};
