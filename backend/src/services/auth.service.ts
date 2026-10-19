import crypto from 'crypto';
import { withConnection, withTransaction, DbConnection } from '../config/db';
import { verifyGoogleIdToken } from '../utils/googleAuth';
import { UserRepository, UserRecord } from '../repositories/user.repository';
import { SessionRepository } from '../repositories/session.repository';
import { insertAudit } from '../repositories/shared.repository';
import { comparePassword, hashPassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { PermissionService } from './permission.service';
import { AppError } from '../utils/appError';
import { AuthUserPayload, UserDTO } from '../types';
import { LoginInput, RegisterInput } from '../validators/auth.validator';

const SESSION_TTL_HOURS = 24;

const toDto = (user: UserRecord): UserDTO => {
  const { passwordHash: _hidden, googleSub: _hiddenSub, ...dto } = user;
  return dto;
};

export class AuthService {
  private userRepository = new UserRepository();
  private sessionRepository = new SessionRepository();
  private permissionService = new PermissionService();

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
      if (input.memberTypeId && !(await this.userRepository.memberTypeExists(conn, input.memberTypeId))) {
        throw AppError.badRequest('ประเภทสมาชิกไม่ถูกต้อง');
      }
      const memberTypeId = input.memberTypeId ?? (await this.userRepository.getDefaultMemberTypeId(conn));
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
        newValues: { username, email, memberTypeId: input.memberTypeId ?? null },
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
