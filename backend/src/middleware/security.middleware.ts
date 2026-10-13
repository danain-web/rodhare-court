import { Request, Response, NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config/env';
import { AppError } from '../utils/appError';

// =====================================================================
// CSRF — ตรวจที่มาของคำขอที่เปลี่ยนข้อมูล (POST/PUT/PATCH/DELETE)
// ชั้นที่ 1: Cookie SameSite=Lax → เว็บอื่นส่ง POST แนบ cookie ของเราไม่ได้
// ชั้นที่ 2 (ไฟล์นี้): เบราว์เซอร์ส่ง Origin (หรือ Referer) มากับคำขอเสมอ → ต้องเป็นโดเมน Frontend ที่อนุญาต
// คำขอที่ไม่มีทั้ง Origin และ Referer = ไม่ได้มาจากเบราว์เซอร์ (curl, Postman, เทสต์) → ไม่ใช่ช่อง CSRF
// หมายเหตุ: CORS อย่างเดียวกัน CSRF ไม่ได้ เพราะ CORS แค่ห้ามอ่าน response แต่คำขอยังถูกส่งไปถึงเซิร์ฟเวอร์
// =====================================================================
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const originOf = (value?: string): string | null => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return 'invalid';
  }
};

export const csrfOriginCheck = (req: Request, _res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = originOf(req.get('Origin')) ?? originOf(req.get('Referer'));
  if (origin === null) return next();
  if (!config.frontendUrls.includes(origin)) {
    return next(AppError.forbidden('คำขอนี้ไม่ได้มาจากหน้าเว็บของระบบ (CSRF protection)'));
  }
  next();
};

// =====================================================================
// Rate limiting
// - auth: นับเฉพาะคำขอที่ล้มเหลว ต่อ IP (กันเดารหัสผ่าน)
// - booking / payment: ต่อผู้ใช้ (หลัง requireAuth) กันสร้างการจอง/อัปโหลดไฟล์จำนวนมากจนกินทรัพยากร
// ค่าเพดานปรับได้ด้วย env (ค่าเริ่มต้นเหมาะกับผู้ใช้ทั่วไป)
// =====================================================================
const envInt = (key: string, fallback: number) => {
  const n = parseInt(process.env[key] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export const createUserRateLimiter = (opts: { max: number; windowMs?: number; message: string }) =>
  rateLimit({
    windowMs: opts.windowMs ?? FIFTEEN_MINUTES,
    limit: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    // ผู้ที่ login แล้วนับต่อ userId · ถ้าไม่มี (ไม่ควรเกิดหลัง requireAuth) นับต่อ IP
    keyGenerator: (req) => (req.user ? `user:${req.user.userId}` : ipKeyGenerator(req.ip || '')),
    message: { success: false, message: opts.message },
  });

export const authLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: envInt('RATE_LIMIT_AUTH_MAX', 20),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // นับเฉพาะครั้งที่ล้มเหลว
  message: { success: false, message: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่' },
});

export const bookingLimiter = createUserRateLimiter({
  max: envInt('RATE_LIMIT_BOOKING_MAX', 30),
  message: 'ทำรายการจองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
});

export const paymentUploadLimiter = createUserRateLimiter({
  max: envInt('RATE_LIMIT_PAYMENT_MAX', 10),
  message: 'ส่งสลิปบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
});
