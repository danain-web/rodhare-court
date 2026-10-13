import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { AuthUserPayload } from '../types';

// =====================================================================
// generateToken — สร้าง JWT ใช้ expiresIn จาก config (.env: JWT_EXPIRES_IN)
// =====================================================================
export const generateToken = (payload: AuthUserPayload): string => {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);
};

// =====================================================================
// verifyToken — ตรวจสอบและถอดรหัส JWT
// =====================================================================
export const verifyToken = (token: string): AuthUserPayload => {
  return jwt.verify(token, config.jwtSecret) as AuthUserPayload;
};

// =====================================================================
// COOKIE_NAME — ชื่อ cookie ที่ใช้เก็บ JWT (ต้องตรงกันทั้ง set และ read)
// =====================================================================
export const COOKIE_NAME = 'auth_token';

// =====================================================================
// cookieOptions — ตัวเลือก cookie สำหรับ production
// httpOnly: true  → JavaScript ฝั่ง client อ่านไม่ได้ → ป้องกัน XSS
// secure: true    → ส่งได้เฉพาะ HTTPS → ป้องกัน Man-in-the-Middle
// sameSite: 'none' → จำเป็นสำหรับ Cross-Origin (Vercel ↔ Render)
// maxAge         → อายุ cookie ตรงกับ JWT (8 ชม. = 28800 วินาที)
// =====================================================================
export const cookieOptions = (isDev: boolean) => ({
  httpOnly: true,
  secure: !isDev,              // development ใช้ HTTP ได้ (localhost)
  sameSite: isDev ? ('lax' as const) : ('none' as const),
  maxAge: 8 * 60 * 60 * 1000, // 8 ชั่วโมง (ms)
  path: '/',
});
