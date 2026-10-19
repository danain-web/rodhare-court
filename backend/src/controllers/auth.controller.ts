import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { availabilitySchema, googleCredentialSchema, loginSchema, registerSchema } from '../validators/auth.validator';
import { sendSuccess } from '../utils/response';
import { currentUser } from './helpers';
import { COOKIE_NAME, cookieOptions } from '../utils/jwt';

export class AuthController {
  private authService = new AuthService();

  // =====================================================================
  // login — ตรวจสอบ credentials แล้วตั้ง httpOnly Cookie
  // เหตุผล: ส่ง token ใน Cookie แทนการส่งใน response body ป้องกัน XSS
  //         Frontend ไม่ต้องเก็บ token ใน LocalStorage/sessionStorage อีกต่อไป
  // =====================================================================
  login = async (req: Request, res: Response) => {
    const input = loginSchema.parse(req.body);
    const result = await this.authService.login(input, req.ip || req.socket.remoteAddress, req.get('User-Agent'));
    res.cookie(COOKIE_NAME, result.token, cookieOptions());
    // ไม่ส่ง token ใน response body → Frontend ใช้ Cookie โดยอัตโนมัติ
    return sendSuccess(res, { user: result.user }, 'เข้าสู่ระบบสำเร็จ');
  };

  // =====================================================================
  // register — สมัครสมาชิกแล้ว login อัตโนมัติ (ตั้ง Cookie ทันที)
  // =====================================================================
  register = async (req: Request, res: Response) => {
    const input = registerSchema.parse(req.body);
    const result = await this.authService.register(input, req.ip || req.socket.remoteAddress, req.get('User-Agent'));
    res.cookie(COOKIE_NAME, result.token, cookieOptions());
    return sendSuccess(res, { user: result.user }, 'สมัครสมาชิกสำเร็จ', 201);
  };

  // เข้าสู่ระบบ/สมัครด้วย Google — ตั้ง httpOnly Cookie เหมือนการเข้าสู่ระบบด้วยรหัสผ่านทุกประการ
  googleLogin = async (req: Request, res: Response) => {
    const { credential } = googleCredentialSchema.parse(req.body);
    const result = await this.authService.loginWithGoogle(credential, req.ip || req.socket.remoteAddress, req.get('User-Agent'));
    res.cookie(COOKIE_NAME, result.token, cookieOptions());
    return sendSuccess(res, { user: result.user, isNewAccount: result.isNewAccount }, 'เข้าสู่ระบบด้วย Google สำเร็จ', result.isNewAccount ? 201 : 200);
  };

  // เชื่อมบัญชี Google เข้ากับบัญชีที่ล็อกอินอยู่ (หน้าโปรไฟล์)
  linkGoogle = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { credential } = googleCredentialSchema.parse(req.body);
    return sendSuccess(res, await this.authService.linkGoogle(user.userId, credential, req.ip), 'เชื่อมบัญชี Google สำเร็จ');
  };

  checkAvailability = async (req: Request, res: Response) => {
    const { username, email } = availabilitySchema.parse(req.query);
    return sendSuccess(res, await this.authService.checkAvailability(username, email), 'Availability checked');
  };

  getMemberTypes = async (_req: Request, res: Response) => {
    return sendSuccess(res, await this.authService.getMemberTypes(), 'Member types retrieved');
  };

  // =====================================================================
  // logout — ลบ Cookie และ revoke session ใน DB
  // =====================================================================
  logout = async (req: Request, res: Response) => {
    const user = currentUser(req);
    await this.authService.logout(user.sessionId, user.userId);
    // ลบ Cookie โดย set maxAge = 0
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
    return sendSuccess(res, { success: true }, 'ออกจากระบบสำเร็จ');
  };

  getMe = async (req: Request, res: Response) => {
    const user = currentUser(req);
    return sendSuccess(res, await this.authService.getUserProfile(user.userId), 'Profile retrieved successfully');
  };
}
