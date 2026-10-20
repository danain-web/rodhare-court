import { DbConnection } from '../config/db';

export interface AdminUserDTO {
  userId: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  memberTypeId: number;
  memberTypeName: string;
  roles: string[];
  isActive: boolean;
  googleLinked: boolean;
  upcomingBookings: number; // การจองที่ยังไม่ถึงกำหนด (ยังถือครองสนามอยู่) — ให้แอดมินเห็นก่อนตัดสินใจระงับบัญชี
  createdAt: Date;
}

const USER_COLUMNS = `
  u.user_id, u.username, u.email, u.first_name, u.last_name, u.phone, u.member_type_id,
  COALESCE(m.display_name, m.type_name) AS member_type_name, u.is_active,
  (u.google_sub IS NOT NULL) AS google_linked, u.created_at,
  (SELECT COUNT(*)::int FROM bookings b
    WHERE b.user_id = u.user_id AND b.status IN ('PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'CONFIRMED') AND b.booking_date >= CURRENT_DATE) AS upcoming_bookings,
  COALESCE(array_agg(r.role_name ORDER BY r.role_name) FILTER (WHERE r.role_name IS NOT NULL), '{}') AS roles`;

const USER_FROM = `
  FROM users u
  JOIN member_types m ON m.member_type_id = u.member_type_id
  LEFT JOIN user_roles ur ON ur.user_id = u.user_id
  LEFT JOIN roles r ON r.role_id = ur.role_id`;

const GROUP_BY = `GROUP BY u.user_id, m.display_name, m.type_name`;

const mapUser = (r: any): AdminUserDTO => ({
  userId: r.user_id,
  username: r.username,
  email: r.email,
  firstName: r.first_name,
  lastName: r.last_name,
  phone: r.phone ?? undefined,
  memberTypeId: r.member_type_id,
  memberTypeName: r.member_type_name,
  roles: r.roles,
  isActive: r.is_active === true,
  googleLinked: r.google_linked === true,
  upcomingBookings: r.upcoming_bookings ?? 0,
  createdAt: r.created_at,
});

export class AdminUserRepository {
  async list(
    conn: DbConnection,
    filter: { search?: string; role?: string; status?: 'active' | 'suspended'; limit: number }
  ): Promise<AdminUserDTO[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      const p = `$${params.length}`;
      where.push(`(LOWER(u.username) LIKE ${p} OR LOWER(u.email) LIKE ${p} OR LOWER(u.first_name) LIKE ${p} OR LOWER(u.last_name) LIKE ${p})`);
    }
    if (filter.role) {
      params.push(filter.role);
      where.push(
        `EXISTS (SELECT 1 FROM user_roles x JOIN roles y ON y.role_id = x.role_id WHERE x.user_id = u.user_id AND y.role_name = $${params.length})`
      );
    }
    if (filter.status) where.push(filter.status === 'active' ? 'u.is_active = TRUE' : 'u.is_active = FALSE');
    params.push(filter.limit);
    const res = await conn.query(
      `SELECT ${USER_COLUMNS} ${USER_FROM}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ${GROUP_BY}
        ORDER BY u.user_id DESC
        LIMIT $${params.length}`,
      params
    );
    return res.rows.map(mapUser);
  }

  // ล็อกแถวผู้ใช้ก่อนแก้ไข กันแอดมินสองคนแก้บัญชีเดียวกันพร้อมกัน
  async getForUpdate(conn: DbConnection, userId: number): Promise<AdminUserDTO | null> {
    await conn.query(`SELECT 1 FROM users WHERE user_id = $1 FOR UPDATE`, [userId]);
    return this.getById(conn, userId);
  }

  async getById(conn: DbConnection, userId: number): Promise<AdminUserDTO | null> {
    const res = await conn.query(`SELECT ${USER_COLUMNS} ${USER_FROM} WHERE u.user_id = $1 ${GROUP_BY}`, [userId]);
    return res.rows[0] ? mapUser(res.rows[0]) : null;
  }

  async listRoles(conn: DbConnection): Promise<{ roleName: string; description?: string }[]> {
    const res = await conn.query(`SELECT role_name, description FROM roles ORDER BY role_id`);
    return res.rows.map((r: any) => ({ roleName: r.role_name, description: r.description ?? undefined }));
  }

  async roleExists(conn: DbConnection, roleName: string): Promise<boolean> {
    const res = await conn.query(`SELECT 1 FROM roles WHERE role_name = $1`, [roleName]);
    return res.rows.length > 0;
  }

  async memberTypeExists(conn: DbConnection, memberTypeId: number): Promise<boolean> {
    const res = await conn.query(`SELECT 1 FROM member_types WHERE member_type_id = $1`, [memberTypeId]);
    return res.rows.length > 0;
  }

  async setActive(conn: DbConnection, userId: number, isActive: boolean): Promise<void> {
    await conn.query(`UPDATE users SET is_active = $2, updated_at = NOW() WHERE user_id = $1`, [userId, isActive]);
  }

  async setMemberType(conn: DbConnection, userId: number, memberTypeId: number): Promise<void> {
    await conn.query(`UPDATE users SET member_type_id = $2, updated_at = NOW() WHERE user_id = $1`, [userId, memberTypeId]);
  }

  // ผู้ใช้หนึ่งคนมีบทบาทเดียว: แทนที่บทบาทเดิมทั้งหมด
  async replaceRole(conn: DbConnection, userId: number, roleName: string): Promise<void> {
    await conn.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
    await conn.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, role_id FROM roles WHERE role_name = $2`, [userId, roleName]);
  }

  // จำนวนผู้ใช้ที่ยังใช้งานได้และมีสิทธิ์จัดการบทบาท (role.manage) นอกเหนือจากผู้ใช้ที่ระบุ — กันระบบไม่เหลือใครแก้สิทธิ์ได้
  async countOtherActiveRoleManagers(conn: DbConnection, excludeUserId: number): Promise<number> {
    const res = await conn.query<{ n: number }>(
      `SELECT COUNT(DISTINCT u.user_id)::int AS n
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.user_id
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.permission_id = rp.permission_id
        WHERE p.code = 'role.manage' AND u.is_active = TRUE AND u.user_id <> $1`,
      [excludeUserId]
    );
    return res.rows[0]?.n ?? 0;
  }
}
