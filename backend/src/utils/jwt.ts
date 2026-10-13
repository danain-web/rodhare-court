import jwt from 'jsonwebtoken';
import { CookieOptions } from 'express';
import { config } from '../config/env';
import { AuthUserPayload } from '../types';

// =====================================================================
// JWT — ระบุ algorithm / issuer / audience ชัดเจนทั้งตอน sign และ verify
// เหตุผล: กันการปลอม token ด้วย algorithm อื่น (เช่น "none") และกันนำ token ของระบบอื่นมาใช้
// =====================================================================
const JWT_ALGORITHM = 'HS256' as const;
const JWT_ISSUER = 'rodhare-court-api';
const JWT_AUDIENCE = 'rodhare-court-web';

export const generateToken = (payload: AuthUserPayload): string => {
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: config.jwtExpiresIn,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  } as jwt.SignOptions);
};

export const verifyToken = (token: string): AuthUserPayload => {
  return jwt.verify(token, config.jwtSecret, {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as AuthUserPayload;
};

// =====================================================================
// COOKIE_NAME — ชื่อ cookie ที่ใช้เก็บ JWT (ต้องตรงกันทั้ง set และ read)
// =====================================================================
export const COOKIE_NAME = 'auth_token';

// อายุ cookie = อายุ JWT (JWT_EXPIRES_IN เช่น 8h, 30m, 1d)
const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
const expiresInMs = (value: string): number => {
  const match = /^(\d+)([smhd]?)$/.exec(value);
  if (!match) return 8 * UNIT_MS.h;
  return Number(match[1]) * (match[2] ? UNIT_MS[match[2]] : 1000);
};

// =====================================================================
// cookieOptions
// httpOnly: true  → JavaScript ฝั่ง client อ่านไม่ได้ → ป้องกัน XSS ขโมย token
// secure          → production ส่งเฉพาะ HTTPS
// sameSite: lax   → Frontend เรียกผ่าน Vercel rewrite (โดเมนเดียวกัน) จึงไม่ต้องใช้ none
//                   และเว็บอื่นส่ง POST แนบ cookie นี้ไม่ได้ (ป้องกัน CSRF ชั้นแรก)
// =====================================================================
export const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: config.isProduction || config.cookieSameSite === 'none',
  sameSite: config.cookieSameSite,
  maxAge: expiresInMs(config.jwtExpiresIn),
  path: '/',
});
