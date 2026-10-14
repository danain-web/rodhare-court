import crypto from 'crypto';
import { withConnection, withTransaction } from '../config/db';
import { UserRepository, UserRecord } from '../repositories/user.repository';
import { SessionRepository } from '../repositories/session.repository';
import { insertAudit } from '../repositories/shared.repository';
import { comparePassword, hashPassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { AppError } from '../utils/appError';
import { AuthUserPayload, UserDTO } from '../types';
import { LoginInput, RegisterInput } from '../validators/auth.validator';

const SESSION_TTL_HOURS = 24;

const toDto = (user: UserRecord): UserDTO => {
  const { passwordHash: _hidden, ...dto } = user;
  return dto;
};

export class AuthService {
  private userRepository = new UserRepository();
  private sessionRepository = new SessionRepository();

  async login(input: LoginInput, ipAddress?: string, userAgent?: string): Promise<{ token: string; user: UserDTO }> {
    const user = await withConnection((conn) => this.userRepository.findByIdentifier(conn, input.identifier));
    if (!user) throw AppError.unauthorized('ชื่อผู้ใช้/อีเมล หรือรหัสผ่านไม่ถูกต้อง');

    const isMatch = await comparePassword(input.password, user.passwordHash);
    if (!isMatch) throw AppError.unauthorized('ชื่อผู้ใช้/อีเมล หรือรหัสผ่านไม่ถูกต้อง');

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
        newValues: { username: user.username },
        ipAddress,
      });
    }, user.userId);

    return { token, user: toDto(user) };
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
    return toDto(user);
  }
}
