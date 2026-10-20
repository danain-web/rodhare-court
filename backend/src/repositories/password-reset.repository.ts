import { DbConnection } from '../config/db';

export class PasswordResetRepository {
  // จำนวนคำขอรีเซ็ตของผู้ใช้ในช่วง N ชั่วโมงล่าสุด (กันส่งอีเมลรัว ๆ ใส่เหยื่อ)
  async countRecent(conn: DbConnection, userId: number, hours: number): Promise<number> {
    const res = await conn.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM password_reset_tokens
        WHERE user_id = $1 AND created_at > NOW() - make_interval(hours => $2)`,
      [userId, hours]
    );
    return res.rows[0]?.n ?? 0;
  }

  // ทำให้ลิงก์เดิมที่ยังไม่ถูกใช้เป็นโมฆะ — มีลิงก์ที่ใช้ได้ครั้งละหนึ่งอันเท่านั้น
  async invalidateOpen(conn: DbConnection, userId: number): Promise<void> {
    await conn.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  }

  async create(conn: DbConnection, data: { tokenHash: string; userId: number; ttlMinutes: number }): Promise<void> {
    await conn.query(
      `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + make_interval(mins => $3))`,
      [data.tokenHash, data.userId, data.ttlMinutes]
    );
  }

  // ใช้โทเคน: สำเร็จเฉพาะโทเคนที่ยังไม่ถูกใช้และยังไม่หมดอายุ (อัปเดตแบบอะตอมมิก → ใช้ซ้ำไม่ได้แม้ยิงพร้อมกัน)
  async consume(conn: DbConnection, tokenHash: string): Promise<number | null> {
    const res = await conn.query<{ user_id: number }>(
      `UPDATE password_reset_tokens SET used_at = NOW()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
        RETURNING user_id`,
      [tokenHash]
    );
    return res.rows[0]?.user_id ?? null;
  }

  async purgeExpired(conn: DbConnection): Promise<void> {
    await conn.query(`DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL '1 day'`);
  }
}
