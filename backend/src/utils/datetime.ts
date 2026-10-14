import { AppError } from './appError';

// เวลาในระบบเก็บเป็นเวลาท้องถิ่น (Asia/Bangkok) แบบ booking_date (DATE) + start_time/end_time (HH24:MI)
// ทุกฟังก์ชันจึงสร้าง Date ด้วยเวลาท้องถิ่น ไม่ใช้ new Date('YYYY-MM-DD') ซึ่งถูกตีความเป็น UTC

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const START_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const END_TIME_RE = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

export const isValidStartTime = (t: string): boolean => START_TIME_RE.test(t);
export const isValidEndTime = (t: string): boolean => END_TIME_RE.test(t);

export const toMinutes = (time: string): number => {
  const [h, m] = time.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
};

export const minutesToTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const parseLocalDate = (dateStr: string): Date => {
  const match = DATE_RE.exec(dateStr);
  if (!match) throw AppError.badRequest('รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)');
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) {
    throw AppError.badRequest(`ไม่มีวันที่ ${dateStr} ในปฏิทิน`);
  }
  return date;
};

// วันที่ + เวลา (HH:MI, รองรับ 24:00) -> Date ท้องถิ่น
export const combineDateTime = (dateStr: string, time: string): Date => {
  const date = parseLocalDate(dateStr);
  date.setMinutes(toMinutes(time));
  return date;
};

export const formatLocalDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const todayLocalDate = (): string => formatLocalDate(new Date());

export const dayOfWeek = (dateStr: string): number => parseLocalDate(dateStr).getDay(); // 0 = อาทิตย์

export const isWeekend = (dateStr: string): boolean => {
  const dow = dayOfWeek(dateStr);
  return dow === 0 || dow === 6;
};

export const hoursBetween = (from: Date, to: Date): number => (to.getTime() - from.getTime()) / 3_600_000;

// ตรวจรูปแบบช่วงเวลา และคืนจำนวนนาที
export const validateTimeRange = (startTime: string, endTime: string): number => {
  if (!isValidStartTime(startTime)) throw AppError.badRequest(`เวลาเริ่มไม่ถูกต้อง: ${startTime} (ต้องเป็น HH:MM)`);
  if (!isValidEndTime(endTime)) throw AppError.badRequest(`เวลาสิ้นสุดไม่ถูกต้อง: ${endTime} (ต้องเป็น HH:MM)`);
  const minutes = toMinutes(endTime) - toMinutes(startTime);
  if (minutes <= 0) throw AppError.badRequest('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น');
  return minutes;
};
