import { DbConnection, firstInsertId } from '../config/db';
import { UserDTO } from '../types';

export interface UserRecord extends UserDTO {
  passwordHash: string | null; // null = บัญชีที่สมัครผ่าน Google (ไม่มีรหัสผ่าน)
  googleSub: string | null;
}

// =====================================================================
// SQL template: LEFT JOIN บทบาท เพื่อให้ผู้ใช้ที่ยังไม่มี role ก็ยังหาเจอ
// PostgreSQL: ใช้ COALESCE แทน NVL, lowercase column names
// =====================================================================
const USER_SELECT = `
  SELECT u.user_id, u.username, u.email, u.password_hash, u.google_sub, u.first_name, u.last_name, u.phone, u.member_type_id,
         COALESCE(m.display_name, m.type_name) AS member_type_name, u.is_active, u.created_at, r.role_name
    FROM users u
    JOIN member_types m ON m.member_type_id = u.member_type_id
    LEFT JOIN user_roles ur ON u.user_id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.role_id`;

// =====================================================================
// mapUser — แปลง raw rows (snake_case) เป็น UserRecord (camelCase)
// เหตุผล: pg คืนชื่อ column เป็น lowercase เสมอ (ต่างจาก Oracle ที่เป็น UPPERCASE)
// =====================================================================
const mapUser = (rows: any[]): UserRecord | null => {
  if (!rows.length) return null;
  const first = rows[0];
  return {
    userId: first.user_id,
    username: first.username,
    email: first.email,
    passwordHash: first.password_hash ?? null,
    googleSub: first.google_sub ?? null,
    googleLinked: !!first.google_sub,
    firstName: first.first_name,
    lastName: first.last_name,
    phone: first.phone ?? undefined,
    memberTypeId: first.member_type_id,
    memberTypeName: first.member_type_name,
    roles: rows.map((r) => r.role_name).filter(Boolean),
    isActive: first.is_active === true || first.is_active === 1,
    createdAt: first.created_at,
  };
};

export class UserRepository {
  // =====================================================================
  // findByIdentifier — ค้นหาผู้ใช้จาก username หรือ email (case-insensitive)
  // PostgreSQL: ใช้ $1 placeholder แทน Oracle :name parameter
  // =====================================================================
  async findByIdentifier(conn: DbConnection, identifier: string): Promise<UserRecord | null> {
    const result = await conn.query(
      `${USER_SELECT} WHERE LOWER(u.username) = LOWER($1) OR LOWER(u.email) = LOWER($1)`,
      [identifier.trim()]
    );
    return mapUser(result.rows);
  }

  async findById(conn: DbConnection, userId: number): Promise<UserRecord | null> {
    const result = await conn.query(`${USER_SELECT} WHERE u.user_id = $1`, [userId]);
    return mapUser(result.rows);
  }

  async findByGoogleSub(conn: DbConnection, googleSub: string): Promise<UserRecord | null> {
    const result = await conn.query(`${USER_SELECT} WHERE u.google_sub = $1`, [googleSub]);
    return mapUser(result.rows);
  }

  async findByEmail(conn: DbConnection, email: string): Promise<UserRecord | null> {
    const result = await conn.query(`${USER_SELECT} WHERE LOWER(u.email) = LOWER($1)`, [email.trim()]);
    return mapUser(result.rows);
  }

  // ประเภทสมาชิกจากโดเมนอีเมล (ตาราง member_type_email_domains) — ไม่พบ = null (ใช้ค่าเริ่มต้น บุคคลภายนอก)
  async getMemberTypeIdForEmailDomain(conn: DbConnection, email: string): Promise<number | null> {
    const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
    const res = await conn.query<{ member_type_id: number }>(`SELECT member_type_id FROM member_type_email_domains WHERE domain = $1`, [domain]);
    return res.rows[0]?.member_type_id ?? null;
  }

  // ผูกบัญชี Google เข้ากับผู้ใช้ — ถ้า google_sub นี้ถูกใช้โดยผู้ใช้อื่นแล้ว unique index จะ throw (code 23505)
  async linkGoogleSub(conn: DbConnection, userId: number, googleSub: string): Promise<void> {
    await conn.query(`UPDATE users SET google_sub = $1, updated_at = NOW() WHERE user_id = $2`, [googleSub, userId]);
  }

  async usernameExists(conn: DbConnection, username: string): Promise<boolean> {
    const res = await conn.query(`SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)`, [username]);
    return res.rows.length > 0;
  }

  async existsUsernameOrEmail(conn: DbConnection, username: string, email: string): Promise<{ username: boolean; email: boolean }> {
    const res = await conn.query<{ u: string; e: string }>(
      // PostgreSQL: ใช้ subquery แทน SELECT FROM DUAL ของ Oracle
      `SELECT
         (SELECT COUNT(*) FROM users WHERE LOWER(username) = LOWER($1))::int AS u,
         (SELECT COUNT(*) FROM users WHERE LOWER(email)    = LOWER($2))::int AS e`,
      [username, email]
    );
    return {
      username: parseInt(res.rows[0]?.u || '0') > 0,
      email:    parseInt(res.rows[0]?.e || '0') > 0,
    };
  }

  // =====================================================================
  // getDefaultMemberTypeId — ดึง member_type_id ของ EXTERNAL (บุคคลภายนอก)
  // PostgreSQL: ใช้ LIMIT 1 แทน FETCH FIRST 1 ROWS ONLY ของ Oracle
  // =====================================================================
  async getDefaultMemberTypeId(conn: DbConnection): Promise<number | null> {
    const res = await conn.query<{ id: number }>(
      `SELECT member_type_id AS id FROM member_types
        ORDER BY CASE type_name WHEN 'EXTERNAL' THEN 0 WHEN 'REGULAR' THEN 1 WHEN 'PUBLIC' THEN 2 ELSE 3 END, member_type_id
        LIMIT 1`
    );
    return res.rows[0]?.id ?? null;
  }

  async memberTypeExists(conn: DbConnection, memberTypeId: number): Promise<boolean> {
    const res = await conn.query<{ n: string }>(`SELECT COUNT(*) AS n FROM member_types WHERE member_type_id = $1`, [memberTypeId]);
    return parseInt(res.rows[0]?.n || '0') > 0;
  }

  async getMemberTypes(conn: DbConnection): Promise<{ memberTypeId: number; typeName: string; displayName: string; discountPercent: number }[]> {
    const res = await conn.query(
      `SELECT member_type_id, type_name, COALESCE(display_name, type_name) AS display_name, discount_percent
         FROM member_types ORDER BY member_type_id`
    );
    return res.rows.map((r: any) => ({
      memberTypeId: r.member_type_id,
      typeName:     r.type_name,
      displayName:  r.display_name,
      discountPercent: parseFloat(r.discount_percent),
    }));
  }

  // =====================================================================
  // createUser — สร้างผู้ใช้และกำหนด role
  // PostgreSQL: ใช้ RETURNING user_id แทน Oracle RETURNING ... INTO :outId
  // =====================================================================
  async createUser(
    conn: DbConnection,
    userData: {
      username: string;
      email: string;
      passwordHash: string | null;
      googleSub?: string;
      firstName: string;
      lastName: string;
      phone?: string;
      roleName?: string;
      memberTypeId?: number;
    }
  ): Promise<number> {
    const result = await conn.query(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, phone, member_type_id, google_sub)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING user_id`,
      [
        userData.username,
        userData.email,
        userData.passwordHash,
        userData.firstName,
        userData.lastName,
        userData.phone || null,
        userData.memberTypeId ?? null,
        userData.googleSub ?? null,
      ]
    );
    const userId = firstInsertId(result.rows, 'user_id');
    await conn.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, role_id FROM roles WHERE role_name = $2`,
      [userId, userData.roleName || 'CUSTOMER']
    );
    return userId;
  }
}
