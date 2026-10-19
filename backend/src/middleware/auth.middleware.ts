import { Request, Response, NextFunction } from 'express';
import { verifyToken, COOKIE_NAME } from '../utils/jwt';
import { AuthService } from '../services/auth.service';
import { PermissionService } from '../services/permission.service';
import { AppError } from '../utils/appError';
import { AuthUserPayload } from '../types';

const authService = new AuthService();
const permissionService = new PermissionService();

// =====================================================================
// extractToken — อ่าน JWT จาก httpOnly Cookie ก่อน fallback ไป Bearer Header
// เหตุผล: httpOnly Cookie ป้องกัน XSS ได้ดีกว่า LocalStorage/Bearer Header
//         Fallback Bearer Header ไว้รองรับกรณีทดสอบ API ด้วย Postman/curl
// =====================================================================
const extractToken = (req: Request): string | null => {
  // 1. อ่านจาก httpOnly Cookie (production path)
  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (cookieToken) return cookieToken;

  // 2. Fallback: Authorization: Bearer <token> (สำหรับ Postman / testing)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim() || null;

  return null;
};

const decode = (token: string): AuthUserPayload => {
  try {
    return verifyToken(token);
  } catch (err: any) {
    if (err?.name === 'TokenExpiredError') throw AppError.unauthorized('Token หมดอายุ กรุณาเข้าสู่ระบบใหม่');
    throw AppError.unauthorized('Token ไม่ถูกต้อง');
  }
};

// BR1: ต้อง Login และ session ยังไม่ถูกเพิกถอน และบัญชียังใช้งานได้
export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = extractToken(req);
    if (!token) throw AppError.unauthorized('กรุณาเข้าสู่ระบบก่อน');
    const payload = decode(token);
    const isValidSession = await authService.validateSession(payload.sessionId);
    if (!isValidSession) {
      throw AppError.unauthorized('Session หมดอายุหรือถูกยกเลิก หรือบัญชีถูกระงับ กรุณาเข้าสู่ระบบใหม่');
    }
    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
};

// ถ้ามี token ที่ถูกต้องให้แนบ req.user (เช่น คำนวณราคาพร้อมส่วนลดสมาชิก) ถ้าไม่มีก็ทำงานต่อแบบไม่ระบุตัวตน
export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = extractToken(req);
    if (token) {
      const payload = decode(token);
      if (await authService.validateSession(payload.sessionId)) req.user = payload;
    }
  } catch (_) { /* ไม่บังคับ login */ }
  next();
};

// ตรวจ "สิทธิ์" (permission) จากตาราง role_permissions ในฐานข้อมูล ไม่ฝังชื่อ role ในโค้ด
// ผู้ใช้ผ่านถ้า role ใด role หนึ่งของตนมี permission นี้ — admin ปรับได้ที่หน้า "จัดการสิทธิ์"
export const requirePermission = (code: string) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw AppError.unauthorized('กรุณาเข้าสู่ระบบก่อน');
      if (!(await permissionService.hasPermission(req.user.roles || [], code))) {
        throw AppError.forbidden('คุณไม่มีสิทธิ์ใช้งานส่วนนี้');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};
