import crypto from 'crypto';
import { withConnection, withTransaction, DbConnection } from '../config/db';
import { verifyGoogleIdToken } from '../utils/googleAuth';
import { UserRepository, UserRecord } from '../repositories/user.repository';
import { SessionRepository } from '../repositories/session.repository';
import { insertAudit } from '../repositories/shared.repository';
import { comparePassword, hashPassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { PasswordResetRepository } from '../repositories/password-reset.repository';
import { PermissionService } from './permission.service';
import { config } from '../config/env';
import { escapeHtml, sendEmail } from '../utils/email';
import { AppError } from '../utils/appError';
import { AuthUserPayload, UserDTO } from '../types';
import { LoginInput, RegisterInput } from '../validators/auth.validator';

const SESSION_TTL_HOURS = 24;
const RESET_TOKEN_TTL_MINUTES = 30;
const RESET_MAX_REQUESTS_PER_HOUR = 3; // ต่อบัญชี — กันถูกส่งอีเมลรีเซ็ตรัว ๆ

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const toDto = (user: UserRecord): UserDTO => {
  const { passwordHash: _hidden, googleSub: _hiddenSub, ...dto } = user;
  return dto;
};

export class AuthService {
  private userRepository = new UserRepository();
  private sessionRepository = new SessionRepository();
  private permissionService = new PermissionService();
  private passwordResetRepository = new PasswordResetRepository();

  // แนบ permission ที่ role ของผู้ใช้มีตอนนี้ ให้ frontend ซ่อน/แสดงเมนู (backend ยังเป็นผู้ตรวจจริงทุก request)
  private async toDtoWithPermissions(user: UserRecord): Promise<UserDTO> {
    return { ...toDto(user), permissions: await this.permissionService.listForRoles(user.roles) };
  }

  async login(input: LoginInput, ipAddress?: string, userAgent?: string): Promise<{ token: string; user: UserDTO }> {
    const user = await withConnection((conn) => this.userRepository.findByIdentifier(conn, input.identifier));
    if (!user) throw AppError.unauthorized('ชื่อผู้ใช้/อีเมล หรือรหัสผ่านไม่ถูกต้อง');

    // บัญชีที่สมัครผ่าน Google ไม่มีรหัสผ่าน → ตอบข้อความเดียวกับรหัสผ่านผิด (ไม่เปิดเผยว่าอีเมลนี้มีบัญชีรูปแบบไหน)
    const isMatch = user.passwordHash ? await comparePassword(input.password, user.passwordHash) : false;
    if (!isMatch) throw AppError.unauthorized('ชื่อผู้ใช้/อีเมล หรือรหัสผ่านไม่ถูกต้อง');

    return this.startSession(user, 'password', ipAddress, userAgent);
  }

  // =====================================================================
  // เข้าสู่ระบบด้วย Google (เพิ่มเป็นอีกทางเลือก ไม่ได้แทนที่รหัสผ่าน)
  // 1) ตรวจ ID token กับ Google · ต้อง email_verified = true
  // 2) พบ google_sub → เข้าสู่ระบบ
  // 3) ไม่พบ แต่อีเมลตรงกับบัญชีเดิม → ไม่ผูกให้เอง: บัญชีเดิมอาจสมัครด้วยรหัสผ่านโดยไม่เคยยืนยันอีเมล
  //    (ผู้ไม่หวังดีสมัครด้วยอีเมลของเหยื่อไว้ก่อน แล้วผูกอัตโนมัติจะให้เขายังเข้าบัญชีได้ด้วยรหัสผ่านของตัวเอง)
  //    ต้องเข้าสู่ระบบด้วยรหัสผ่านก่อน แล้วเชื่อม Google จากหน้าโปรไฟล์ (พิสูจน์ครบทั้งสองฝั่ง)
  // 4) ไม่พบเลย → สร้างบัญชี CUSTOMER ใหม่ ประเภทสมาชิกตามโดเมนอีเมล
  // =====================================================================
  async loginWithGoogle(idToken: string, ipAddress?: string, userAgent?: string): Promise<{ token: string; user: UserDTO; isNewAccount: boolean }> {
    const identity = await verifyGoogleIdToken(idToken);
    if (!identity.emailVerified) throw AppError.unauthorized('อีเมลของบัญชี Google นี้ยังไม่ได้รับการยืนยัน');

    const existing = await withConnection((conn) => this.userRepository.findByGoogleSub(conn, identity.sub));
    if (existing) return { ...(await this.startSession(existing, 'google', ipAddress, userAgent)), isNewAccount: false };

    const sameEmail = await withConnection((conn) => this.userRepository.findByEmail(conn, identity.email));
    if (sameEmail) {
      throw AppError.conflict(
        'อีเมลนี้มีบัญชีอยู่ในระบบแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านก่อน แล้วกด "เชื่อมบัญชี Google" ที่หน้าโปรไฟล์'
      );
    }

    try {
      await withTransaction(async (conn) => {
        const username = await this.generateUsername(conn, identity.email);
        const localPart = identity.email.split('@')[0];
        const memberTypeId =
          (await this.userRepository.getMemberTypeIdForEmailDomain(conn, identity.email)) ??
          (await this.userRepository.getDefaultMemberTypeId(conn));
        if (!memberTypeId) throw AppError.badRequest('ฐานข้อมูลยังไม่มีข้อมูลประเภทสมาชิก กรุณาติดต่อผู้ดูแลระบบ');
        const userId = await this.userRepository.createUser(conn, {
          username,
          email: identity.email,
          passwordHash: null,
          googleSub: identity.sub,
          firstName: (identity.givenName || identity.name || localPart).slice(0, 100),
          lastName: (identity.familyName || '-').slice(0, 100),
          roleName: 'CUSTOMER',
          memberTypeId,
        });
        await insertAudit(conn, {
          userId,
          action: 'REGISTER',
          entityName: 'USERS',
          entityId: userId,
          newValues: { username, email: identity.email, method: 'google', memberTypeId },
          ipAddress,
        });
      });
    } catch (err: any) {
      // แข่งกันสมัครด้วย token เดียวกัน/อีเมลเดียวกัน → unique violation
      if (err?.code === '23505') throw AppError.conflict('บัญชีนี้ถูกสร้างไปแล้ว กรุณาลองเข้าสู่ระบบอีกครั้ง');
      throw err;
    }

    const created = await withConnection((conn) => this.userRepository.findByGoogleSub(conn, identity.sub));
    if (!created) throw AppError.internal('สร้างบัญชีไม่สำเร็จ');
    return { ...(await this.startSession(created, 'google', ipAddress, userAgent)), isNewAccount: true };
  }

  // เชื่อมบัญชี Google เข้ากับบัญชีที่เข้าสู่ระบบอยู่ (ผู้ใช้พิสูจน์ตัวตนด้วยรหัสผ่านมาแล้ว + พิสูจน์ Google ด้วย token)
  async linkGoogle(userId: number, idToken: string, ipAddress?: string): Promise<UserDTO> {
    const identity = await verifyGoogleIdToken(idToken);
    if (!identity.emailVerified) throw AppError.unauthorized('อีเมลของบัญชี Google นี้ยังไม่ได้รับการยืนยัน');

    try {
      await withTransaction(async (conn) => {
        const user = await this.userRepository.findById(conn, userId);
        if (!user) throw AppError.notFound('ไม่พบผู้ใช้');
        if (user.googleSub && user.googleSub !== identity.sub) throw AppError.conflict('บัญชีนี้เชื่อม Google บัญชีอื่นอยู่แล้ว');
        if (user.googleSub === identity.sub) return; // เชื่อมอยู่แล้ว (idempotent)

        const owner = await this.userRepository.findByGoogleSub(conn, identity.sub);
        if (owner && owner.userId !== userId) throw AppError.conflict('บัญชี Google นี้ถูกใช้เชื่อมกับผู้ใช้อื่นแล้ว');

        await this.userRepository.linkGoogleSub(conn, userId, identity.sub);
        await insertAudit(conn, {
          userId,
          action: 'LINK_GOOGLE',
          entityName: 'USERS',
          entityId: userId,
          newValues: { googleEmail: identity.email },
          ipAddress,
        });
      });
    } catch (err: any) {
      if (err?.code === '23505') throw AppError.conflict('บัญชี Google นี้ถูกใช้เชื่อมกับผู้ใช้อื่นแล้ว');
      throw err;
    }
    return this.getUserProfile(userId);
  }

  // username จากส่วนหน้า @ ของอีเมล (เหลือเฉพาะอักขระที่อนุญาต) ซ้ำให้ต่อเลขสุ่ม
  private async generateUsername(conn: DbConnection, email: string): Promise<string> {
    let base = email.split('@')[0].replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40);
    if (base.length < 3) base = `user${base}`;
    if (!(await this.userRepository.usernameExists(conn, base))) return base;
    for (let i = 0; i < 20; i++) {
      const candidate = `${base}${crypto.randomInt(1000, 10000)}`;
      if (!(await this.userRepository.usernameExists(conn, candidate))) return candidate;
    }
    return `${base}${crypto.randomUUID().slice(0, 8)}`;
  }

  // ตรวจสถานะบัญชี → สร้าง session + JWT (ใช้ร่วมกันทั้งรหัสผ่านและ Google)
  private async startSession(
    user: UserRecord,
    method: 'password' | 'google',
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ token: string; user: UserDTO }> {
    // BR1: ต้องเป็นสมาชิกที่มีสถานะปกติ
    if (!user.isActive) throw AppError.forbidden('บัญชีถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
    if (user.roles.length === 0) throw AppError.forbidden('บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งานระบบ');

    const sessionId = crypto.randomUUID();
    const payload: AuthUserPayload = {
      userId: user.userId,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
      sessionId,
    };
    const token = generateToken(payload);

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await withTransaction(async (conn) => {
      await this.sessionRepository.purgeExpired(conn);
      await this.sessionRepository.createSession(conn, {
        sessionId,
        userId: user.userId,
        tokenHash,
        ipAddress,
        userAgent,
        ttlHours: SESSION_TTL_HOURS,
      });
      await insertAudit(conn, {
        userId: user.userId,
        action: 'LOGIN',
        entityName: 'USER_SESSIONS',
        entityId: user.userId,
        newValues: { username: user.username, method },
        ipAddress,
      });
    }, user.userId);

    return { token, user: await this.toDtoWithPermissions(user) };
  }

  // =====================================================================
  // ลืมรหัสผ่าน: ส่งลิงก์รีเซ็ตทางอีเมล
  // - ตอบเหมือนกันเสมอไม่ว่าอีเมลนี้มีบัญชีหรือไม่ (ไม่เปิดเผยว่าใครเป็นสมาชิก)
  // - โทเคนสุ่ม 32 ไบต์ · เก็บเฉพาะ SHA-256 · ใช้ได้ครั้งเดียว · หมดอายุใน 30 นาที
  // - บัญชี Google ที่ไม่มีรหัสผ่านก็ตั้งรหัสผ่านได้ด้วยลิงก์นี้ (พิสูจน์ว่าเข้าถึงอีเมลได้)
  // =====================================================================
  async forgotPassword(email: string, ipAddress?: string): Promise<void> {
    const user = await withConnection((conn) => this.userRepository.findByEmail(conn, email));
    if (!user || !user.isActive) return;

    const token = crypto.randomBytes(32).toString('hex');
    const created = await withTransaction(async (conn) => {
      await this.passwordResetRepository.purgeExpired(conn);
      if ((await this.passwordResetRepository.countRecent(conn, user.userId, 1)) >= RESET_MAX_REQUESTS_PER_HOUR) return false;
      await this.passwordResetRepository.invalidateOpen(conn, user.userId);
      await this.passwordResetRepository.create(conn, { tokenHash: sha256(token), userId: user.userId, ttlMinutes: RESET_TOKEN_TTL_MINUTES });
      await insertAudit(conn, { userId: user.userId, action: 'REQUEST_PASSWORD_RESET', entityName: 'USERS', entityId: user.userId, ipAddress });
      return true;
    });
    if (!created) return;

    const link = `${config.frontendUrls[0]}/reset-password?token=${token}`;
    try {
      const result = await sendEmail({
        to: user.email,
        subject: 'รีเซ็ตรหัสผ่าน Rodhare Court',
        text:
          `สวัสดีคุณ ${user.firstName}\n\nมีคำขอรีเซ็ตรหัสผ่านของบัญชีนี้ กดลิงก์ด้านล่างเพื่อตั้งรหัสผ่านใหม่ (ใช้ได้ภายใน ${RESET_TOKEN_TTL_MINUTES} นาที ใช้ได้ครั้งเดียว)\n\n${link}\n\n` +
          'ถ้าไม่ได้เป็นผู้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ',
        html:
          `<p>สวัสดีคุณ ${escapeHtml(user.firstName)}</p>` +
          `<p>มีคำขอรีเซ็ตรหัสผ่านของบัญชีนี้ กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ (ใช้ได้ภายใน ${RESET_TOKEN_TTL_MINUTES} นาที ใช้ได้ครั้งเดียว)</p>` +
          `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#0a3528;color:#fff;border-radius:8px;text-decoration:none">ตั้งรหัสผ่านใหม่</a></p>` +
          `<p style="color:#64748b;font-size:12px">ถ้าไม่ได้เป็นผู้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ</p>`,
      });
      // ยังไม่ได้ตั้ง RESEND_API_KEY: ตอนพัฒนาแสดงลิงก์ใน console ให้ทดสอบได้ · production ไม่พิมพ์โทเคนลง log
      if (result === 'skipped' && !config.isProduction) console.log(`[password-reset] (ไม่ได้ตั้งค่าอีเมล) ลิงก์สำหรับ ${user.email}: ${link}`);
      if (result === 'skipped' && config.isProduction) console.warn('[password-reset] ยังไม่ได้ตั้ง RESEND_API_KEY — ส่งอีเมลรีเซ็ตรหัสผ่านไม่ได้');
    } catch (err) {
      // ส่งอีเมลล้มเหลวต้องไม่เปลี่ยนคำตอบฝั่ง client (ไม่เปิดเผยว่าอีเมลมีบัญชีหรือไม่)
      console.error('[password-reset] ส่งอีเมลไม่สำเร็จ:', (err as Error).message);
    }
  }

  async resetPassword(token: string, newPassword: string, ipAddress?: string): Promise<void> {
    const invalid = () => AppError.badRequest('ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุ กรุณาขอลิงก์ใหม่');
    await withTransaction(async (conn) => {
      const userId = await this.passwordResetRepository.consume(conn, sha256(token));
      if (!userId) throw invalid();
      const user = await this.userRepository.findById(conn, userId);
      if (!user || !user.isActive) throw invalid();

      await this.userRepository.setPasswordHash(conn, userId, await hashPassword(newPassword));
      await this.passwordResetRepository.invalidateOpen(conn, userId);
      // รหัสผ่านเปลี่ยน → ทุกอุปกรณ์ที่ล็อกอินค้างอยู่ต้องเข้าสู่ระบบใหม่
      await this.sessionRepository.revokeAllForUser(conn, userId);
      await insertAudit(conn, { userId, action: 'RESET_PASSWORD', entityName: 'USERS', entityId: userId, ipAddress });
    });
  }

  // เปลี่ยนรหัสผ่านตอนล็อกอินอยู่: ต้องยืนยันรหัสผ่านเดิม · ออกจากระบบอุปกรณ์อื่นทั้งหมด (คง session ปัจจุบันไว้)
  async changePassword(userId: number, sessionId: string, currentPassword: string, newPassword: string, ipAddress?: string): Promise<void> {
    await withTransaction(async (conn) => {
      const user = await this.userRepository.findById(conn, userId);
      if (!user) throw AppError.notFound('ไม่พบผู้ใช้');
      if (!user.passwordHash) {
        throw AppError.badRequest('บัญชีนี้เข้าสู่ระบบด้วย Google และยังไม่มีรหัสผ่าน หากต้องการตั้งรหัสผ่าน ให้ใช้ "ลืมรหัสผ่าน" ที่หน้าเข้าสู่ระบบ');
      }
      if (!(await comparePassword(currentPassword, user.passwordHash))) throw AppError.badRequest('รหัสผ่านปัจจุบันไม่ถูกต้อง');
      if (currentPassword === newPassword) throw AppError.badRequest('รหัสผ่านใหม่ต้องต่างจากรหัสผ่านเดิม');

      await this.userRepository.setPasswordHash(conn, userId, await hashPassword(newPassword));
      await this.sessionRepository.revokeAllForUser(conn, userId, sessionId);
      await insertAudit(conn, { userId, action: 'CHANGE_PASSWORD', entityName: 'USERS', entityId: userId, ipAddress });
    }, userId);
  }

  // หน้าสมัครสมาชิก: ตรวจชื่อผู้ใช้/อีเมลซ้ำระหว่างพิมพ์ (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
  async checkAvailability(username?: string, email?: string): Promise<{ usernameAvailable?: boolean; emailAvailable?: boolean }> {
    return withConnection(async (conn) => {
      const exists = await this.userRepository.existsUsernameOrEmail(conn, username?.trim() || '', email?.trim() || '');
      return {
        usernameAvailable: username?.trim() ? !exists.username : undefined,
        emailAvailable: email?.trim() ? !exists.email : undefined,
      };
    });
  }

  async getMemberTypes() {
    return withConnection((conn) => this.userRepository.getMemberTypes(conn));
  }

  async register(input: RegisterInput, ipAddress?: string, userAgent?: string): Promise<{ token: string; user: UserDTO }> {
    const username = input.username.trim();
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);

    await withTransaction(async (conn) => {
      const exists = await this.userRepository.existsUsernameOrEmail(conn, username, email);
      if (exists.username) throw AppError.conflict('ชื่อผู้ใช้นี้ถูกใช้งานแล้ว');
      if (exists.email) throw AppError.conflict('อีเมลนี้ถูกใช้งานแล้ว');
      // ผู้สมัครด้วยรหัสผ่านเลือกประเภทสมาชิกเองไม่ได้ (กันอ้างสิทธิ์ส่วนลดโดยไม่มีหลักฐาน)
      const memberTypeId = await this.userRepository.getDefaultMemberTypeId(conn);
      if (!memberTypeId) {
        throw AppError.badRequest('ฐานข้อมูลยังไม่มีข้อมูลประเภทสมาชิก กรุณาติดต่อผู้ดูแลระบบ');
      }
      const userId = await this.userRepository.createUser(conn, {
        username,
        email,
        passwordHash,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone?.trim(),
        roleName: 'CUSTOMER',
        memberTypeId,
      });
      await insertAudit(conn, {
        userId,
        action: 'REGISTER',
        entityName: 'USERS',
        entityId: userId,
        newValues: { username, email, memberTypeId },
        ipAddress,
      });
    });

    return this.login({ identifier: username, password: input.password }, ipAddress, userAgent);
  }

  async logout(sessionId: string, userId: number): Promise<void> {
    await withTransaction((conn) => this.sessionRepository.revokeSession(conn, sessionId), userId);
  }

  async validateSession(sessionId: string): Promise<boolean> {
    const session = await withConnection((conn) => this.sessionRepository.findActiveSession(conn, sessionId));
    return !!session && session.isActive;
  }

  async getUserProfile(userId: number): Promise<UserDTO> {
    const user = await withConnection((conn) => this.userRepository.findById(conn, userId));
    if (!user) throw AppError.notFound('ไม่พบผู้ใช้');
    return this.toDtoWithPermissions(user);
  }
}
