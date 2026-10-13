import { DbConnection } from '../config/db';
import { fitBytes } from '../utils/params';

// =====================================================================
// SQL Helpers: แปลง booking_date + HH:MM เป็น TIMESTAMP
// PostgreSQL: ใช้ make_timestamp / (booking_date + time) แทน Oracle CAST + NUMTODSINTERVAL
// =====================================================================
export const bookingStartTs = (alias = 'b') =>
  `(${alias}.booking_date + (${alias}.start_time || ':00')::TIME)`;
export const bookingEndTs = (alias = 'b') =>
  // end_time = '24:00' → แปลงเป็น '00:00' วันถัดไป
  `(CASE WHEN ${alias}.end_time = '24:00' THEN ${alias}.booking_date + INTERVAL '1 day' ELSE ${alias}.booking_date + (${alias}.end_time || ':00')::TIME END)`;
export const bookingMinutes = (alias = 'b') =>
  `(EXTRACT(EPOCH FROM ((${alias}.end_time || ':00')::TIME - (${alias}.start_time || ':00')::TIME)) / 60)::int`;

export const ACTIVE_STATUS_SQL = `('PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'CONFIRMED', 'CHECKED_IN')`;

// =====================================================================
// BR16: Audit log
// =====================================================================
export interface AuditEntry {
  userId?: number | null;
  action: string;
  entityName: string;
  entityId?: number | null;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
}

export const insertAudit = async (conn: DbConnection, entry: AuditEntry): Promise<void> => {
  await conn.query(
    `INSERT INTO audit_logs (user_id, action, entity_name, entity_id, old_values, new_values, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.userId ?? null,
      entry.action,
      entry.entityName,
      entry.entityId ?? null,
      entry.oldValues != null ? JSON.stringify(entry.oldValues) : null,
      entry.newValues != null ? JSON.stringify(entry.newValues) : null,
      entry.ipAddress ? fitBytes(entry.ipAddress, 50) : null,
    ]
  );
};

// =====================================================================
// BR7: Notification
// =====================================================================
export const insertNotification = async (
  conn: DbConnection,
  n: { userId: number; bookingId?: number | null; title: string; message: string; type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT' }
): Promise<void> => {
  await conn.query(
    `INSERT INTO notifications (user_id, booking_id, title, message, type)
     VALUES ($1, $2, $3, $4, $5)`,
    [n.userId, n.bookingId ?? null, fitBytes(n.title, 100), fitBytes(n.message, 500), n.type]
  );
};

// =====================================================================
// BR16: ประวัติสถานะการจอง
// PostgreSQL: ไม่มี Oracle Trigger ดังนั้น backend บันทึกเองทุกครั้ง
// ถ้าแถวล่าสุดของการจองเป็น [AUTO] status เดียวกัน → อัปเดต notes (ไม่บันทึกซ้ำ)
// =====================================================================
export const insertStatusHistory = async (
  conn: DbConnection,
  bookingId: number,
  status: string,
  notes: string,
  changedBy?: number | null
): Promise<void> => {
  const merged = await conn.query(
    `UPDATE booking_status_history
        SET notes = $1, changed_by = COALESCE($2, changed_by)
      WHERE history_id = (SELECT MAX(history_id) FROM booking_status_history WHERE booking_id = $3)
        AND status = $4
        AND notes LIKE '[AUTO]%'`,
    [fitBytes(notes, 500), changedBy ?? null, bookingId, status]
  );
  if ((merged.rowCount ?? 0) > 0) return;
  await conn.query(
    `INSERT INTO booking_status_history (booking_id, status, notes, changed_by)
     VALUES ($1, $2, $3, $4)`,
    [bookingId, status, fitBytes(notes, 500), changedBy ?? null]
  );
};

// =====================================================================
// คืนสต็อกอุปกรณ์ที่จองไว้แต่ยังไม่ได้ยืมออกไปจริง
// =====================================================================
export const releaseUnborrowedEquipment = async (conn: DbConnection, bookingId: number): Promise<void> => {
  const res = await conn.query<{ equipment_id: number; to_release: number }>(
    `SELECT be.equipment_id,
            (be.quantity - COALESCE((SELECT SUM(eb.quantity) FROM equipment_borrowings eb
                                     WHERE eb.booking_id = be.booking_id AND eb.equipment_id = be.equipment_id), 0))::int AS to_release
       FROM booking_equipment be
      WHERE be.booking_id = $1
      ORDER BY be.equipment_id`,
    [bookingId]
  );
  for (const row of res.rows) {
    if (row.to_release > 0) {
      await conn.query(
        `UPDATE equipment SET available_quantity = LEAST(total_quantity, available_quantity + $1)
          WHERE equipment_id = $2`,
        [row.to_release, row.equipment_id]
      );
    }
  }
};

// =====================================================================
// BR3: การจองที่ไม่ชำระภายใน 15 นาที → EXPIRED และคืนสนาม/อุปกรณ์
// PostgreSQL: FOR UPDATE SKIP LOCKED ทำงานเหมือนกัน
// =====================================================================
export const expireStaleHolds = async (
  conn: DbConnection,
  filter: { courtId?: number; bookingDate?: string; userId?: number; bookingId?: number } = {}
): Promise<number> => {
  const where: string[] = [
    `b.status = 'PENDING_PAYMENT'`,
    `b.hold_expires_at < NOW()`,
    `NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.booking_id AND p.status = 'PENDING')`,
  ];
  const params: any[] = [];

  if (filter.courtId) {
    params.push(filter.courtId);
    where.push(`b.court_id = $${params.length}`);
  }
  if (filter.bookingDate) {
    params.push(filter.bookingDate);
    where.push(`b.booking_date = $${params.length}::DATE`);
  }
  if (filter.userId) {
    params.push(filter.userId);
    where.push(`b.user_id = $${params.length}`);
  }
  if (filter.bookingId) {
    params.push(filter.bookingId);
    where.push(`b.booking_id = $${params.length}`);
  }

  const candidates = await conn.query<{ booking_id: number; user_id: number; booking_number: string }>(
    `SELECT b.booking_id, b.user_id, b.booking_number FROM bookings b WHERE ${where.join(' AND ')}
      FOR UPDATE SKIP LOCKED`,
    params
  );

  let expired = 0;
  for (const row of candidates.rows) {
    const upd = await conn.query(
      `UPDATE bookings SET status = 'EXPIRED'
        WHERE booking_id = $1 AND status = 'PENDING_PAYMENT'`,
      [row.booking_id]
    );
    if (!upd.rowCount) continue;
    expired++;
    await releaseUnborrowedEquipment(conn, row.booking_id);
    await insertStatusHistory(conn, row.booking_id, 'EXPIRED', 'ไม่ชำระเงินภายใน 15 นาที ระบบยกเลิกอัตโนมัติและคืนสนาม/อุปกรณ์', null);
    await insertNotification(conn, {
      userId: row.user_id,
      bookingId: row.booking_id,
      title: 'หมดเวลาชำระเงิน (Booking Expired)',
      message: `การจอง ${row.booking_number} ถูกยกเลิกอัตโนมัติ เนื่องจากไม่ชำระเงินภายใน 15 นาที หากต้องการใช้งานกรุณาจองใหม่`,
      type: 'WARNING',
    });
    await insertAudit(conn, {
      userId: null,
      action: 'EXPIRE_BOOKING',
      entityName: 'bookings',
      entityId: row.booking_id,
      oldValues: { status: 'PENDING_PAYMENT' },
      newValues: { status: 'EXPIRED', rule: 'BR3' },
    });
  }
  return expired;
};

// =====================================================================
// การจองที่เลยเวลาสิ้นสุดแล้ว → COMPLETED
// =====================================================================
export const completeFinishedBookings = async (conn: DbConnection): Promise<number> => {
  const candidates = await conn.query<{ booking_id: number; status: string }>(
    `SELECT b.booking_id, b.status FROM bookings b
      WHERE b.status IN ('CONFIRMED', 'PAYMENT_VERIFIED', 'CHECKED_IN')
        AND ${bookingEndTs('b')} < NOW()
      FOR UPDATE SKIP LOCKED`
  );
  let done = 0;
  for (const row of candidates.rows) {
    const upd = await conn.query(
      `UPDATE bookings SET status = 'COMPLETED' WHERE booking_id = $1 AND status = $2`,
      [row.booking_id, row.status]
    );
    if (!upd.rowCount) continue;
    done++;
    await releaseUnborrowedEquipment(conn, row.booking_id);
    await insertStatusHistory(
      conn,
      row.booking_id,
      'COMPLETED',
      row.status === 'CHECKED_IN' ? 'ใช้งานสนามครบเวลาแล้ว' : 'เลยเวลาใช้งานแล้ว (ไม่ได้เช็คอิน)',
      null
    );
  }
  return done;
};
