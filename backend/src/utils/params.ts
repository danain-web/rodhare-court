import { Request } from 'express';
import { AppError } from './appError';

// แปลง :id ใน URL เป็นตัวเลข ถ้าไม่ใช่ตัวเลขบวกให้ตอบ 400 (เดิม parseInt ได้ NaN แล้วส่งเข้า SQL)
export const parseIdParam = (req: Request, name = 'id'): number => {
  const raw = req.params[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw AppError.badRequest(`พารามิเตอร์ ${name} ไม่ถูกต้อง`);
  }
  return id;
};

export const parseOptionalIntQuery = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(n)) throw AppError.badRequest(`ค่า query ไม่ถูกต้อง: ${String(value)}`);
  return n;
};

// ตัดข้อความให้พอดีคอลัมน์ VARCHAR2(n) ซึ่งนับเป็น "ไบต์" — ภาษาไทยใช้ 3 ไบต์ต่อตัวอักษรใน AL32UTF8
// (ตัดด้วย .slice(0, n) แบบนับตัวอักษรยังเกินคอลัมน์ได้ -> ORA-12899)
export const fitBytes = (text: string, maxBytes: number): string => {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  let out = '';
  let used = 0;
  for (const ch of text) {
    const size = Buffer.byteLength(ch, 'utf8');
    if (used + size > maxBytes - 3) break;
    out += ch;
    used += size;
  }
  return out + '...';
};

export const round2 =(n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;