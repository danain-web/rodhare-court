import { DbConnection } from '../config/db';
import { fitBytes } from '../utils/params';

export interface UserSessionRecord {
  sessionId: string;
  userId: number;
  isActive: boolean;
  expiresAt: Date;
}

export class SessionRepository {
  // =====================================================================
  // createSession — บันทึก session ลง user_sessions
  // PostgreSQL: NOW() + INTERVAL แทน LOCALTIMESTAMP + NUMTODSINTERVAL
  // =====================================================================
  async createSession(
    conn: DbConnection,
    session: { sessionId: string; userId: number; tokenHash: string; ipAddress?: string; userAgent?: string; ttlHours: number }
  ): Promise<void> {
    await conn.query(
      `INSERT INTO user_sessions (session_id, user_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' hours')::INTERVAL)`,
      [
        session.sessionId,
        session.userId,
        session.tokenHash,
        session.ipAddress ? fitBytes(session.ipAddress, 50) : null,
        session.userAgent ? fitBytes(session.userAgent, 255) : null,
        session.ttlHours,
      ]
    );
  }

  // session ยังไม่หมดอายุ และผู้ใช้ยังมีสถานะปกติ (BR1)
  async findActiveSession(conn: DbConnection, sessionId: string): Promise<UserSessionRecord | null> {
    const result = await conn.query(
      `SELECT s.session_id, s.user_id, s.expires_at, u.is_active
         FROM user_sessions s JOIN users u ON u.user_id = s.user_id
        WHERE s.session_id = $1 AND s.expires_at > NOW()`,
      [sessionId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      isActive: row.is_active === true || row.is_active === 1,
      expiresAt: row.expires_at,
    };
  }

  async revokeSession(conn: DbConnection, sessionId: string): Promise<void> {
    await conn.query(`DELETE FROM user_sessions WHERE session_id = $1`, [sessionId]);
  }

  async purgeExpired(conn: DbConnection): Promise<void> {
    await conn.query(`DELETE FROM user_sessions WHERE expires_at < NOW()`);
  }
}
