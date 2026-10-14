import { DbConnection, firstInsertId } from '../config/db';
import { fitBytes } from '../utils/params';
import { BookingDTO, BookingEquipmentDTO, BookingStatusHistoryDTO, EquipmentLine } from '../types/booking';
import { ACTIVE_STATUS_SQL, bookingMinutes } from './shared.repository';

const BOOKING_SELECT = `
  SELECT b.booking_id, b.booking_number, b.user_id, u.username, b.court_id, c.name AS court_name,
         c.sport_type_id, s.name AS sport_name,
         TO_CHAR(b.booking_date, 'YYYY-MM-DD') AS booking_date, b.start_time, b.end_time,
         b.total_court_fee, b.total_equipment_fee, b.discount_amount, b.final_amount, b.status,
         pr.code AS promotion_code, b.hold_expires_at, b.checked_in_at, b.cancelled_at, b.cancel_reason,
         (SELECT p.status FROM payments p WHERE p.booking_id = b.booking_id ORDER BY p.payment_id DESC LIMIT 1) AS latest_payment_status,
         (SELECT p.rejection_reason FROM payments p WHERE p.booking_id = b.booking_id ORDER BY p.payment_id DESC LIMIT 1) AS latest_rejection_reason,
         b.created_at, b.updated_at
    FROM bookings b
    JOIN users u ON b.user_id = u.user_id
    JOIN courts c ON b.court_id = c.court_id
    JOIN sport_types s ON c.sport_type_id = s.sport_type_id
    LEFT JOIN promotions pr ON pr.promotion_id = b.promotion_id`;

const mapBooking = (row: any): BookingDTO => ({
  bookingId:    row.booking_id,
  bookingNumber: row.booking_number,
  userId:       row.user_id,
  userName:     row.username,
  courtId:      row.court_id,
  courtName:    row.court_name,
  sportTypeId:  row.sport_type_id,
  sportName:    row.sport_name,
  bookingDate:  row.booking_date,
  startTime:    row.start_time,
  endTime:      row.end_time,
  totalCourtFee:     parseFloat(row.total_court_fee),
  totalEquipmentFee: parseFloat(row.total_equipment_fee),
  discountAmount:    parseFloat(row.discount_amount),
  finalAmount:       parseFloat(row.final_amount),
  status:            row.status,
  promotionCode:     row.promotion_code ?? undefined,
  holdExpiresAt:     row.hold_expires_at ?? undefined,
  checkedInAt:       row.checked_in_at ?? undefined,
  cancelledAt:       row.cancelled_at ?? undefined,
  cancelReason:      row.cancel_reason ?? undefined,
  latestPaymentStatus:             row.latest_payment_status ?? undefined,
  latestPaymentRejectionReason:    row.latest_rejection_reason ?? undefined,
  createdAt:    row.created_at,
  updatedAt:    row.updated_at,
});

export interface LockedBooking {
  bookingId: number; bookingNumber: string; userId: number; courtId: number;
  bookingDate: string; startTime: string; endTime: string; status: string;
  finalAmount: number; totalCourtFee: number; totalEquipmentFee: number;
  discountAmount: number; holdExpired: boolean;
}
export interface LockedCourt {
  courtId: number; name: string; sportTypeId: number;
  hourlyRate: number; status: string; isActive: boolean;
}
export interface LockedUser {
  userId: number; isActive: boolean; memberTypeId: number;
  memberTypeName: string; discountPercent: number;
}

export class BookingRepository {
  async getBookingsByUser(conn: DbConnection, userId: number): Promise<BookingDTO[]> {
    const result = await conn.query(`${BOOKING_SELECT} WHERE b.user_id = $1 ORDER BY b.booking_id DESC`, [userId]);
    return result.rows.map(mapBooking);
  }

  async getBookingById(conn: DbConnection, bookingId: number): Promise<BookingDTO | null> {
    const res = await conn.query(`${BOOKING_SELECT} WHERE b.booking_id = $1`, [bookingId]);
    const row = res.rows[0];
    if (!row) return null;
    const booking = mapBooking(row);
    booking.equipment = await this.getBookingEquipment(conn, bookingId);
    booking.statusHistory = await this.getStatusHistory(conn, bookingId);
    return booking;
  }

  async findBookingIdByNumber(conn: DbConnection, bookingNumber: string): Promise<number | null> {
    const res = await conn.query(
      `SELECT booking_id FROM bookings WHERE UPPER(booking_number) = UPPER($1)`,
      [bookingNumber.trim()]
    );
    return res.rows[0]?.booking_id ?? null;
  }

  async getBookingEquipment(conn: DbConnection, bookingId: number): Promise<BookingEquipmentDTO[]> {
    const resEq = await conn.query(
      `SELECT be.booking_equipment_id, be.booking_id, be.equipment_id, e.name AS equipment_name,
              be.quantity, be.unit_rental_fee, be.subtotal
         FROM booking_equipment be
         JOIN equipment e ON be.equipment_id = e.equipment_id
        WHERE be.booking_id = $1
        ORDER BY be.equipment_id`,
      [bookingId]
    );
    return resEq.rows.map((e: any) => ({
      bookingEquipmentId: e.booking_equipment_id,
      bookingId:          e.booking_id,
      equipmentId:        e.equipment_id,
      equipmentName:      e.equipment_name,
      quantity:           e.quantity,
      unitRentalFee:      parseFloat(e.unit_rental_fee),
      subtotal:           parseFloat(e.subtotal),
    }));
  }

  async getStatusHistory(conn: DbConnection, bookingId: number): Promise<BookingStatusHistoryDTO[]> {
    const resHistory = await conn.query(
      `SELECT h.history_id, h.booking_id, h.status, h.notes, h.changed_by, u.username AS changed_by_name, h.created_at
         FROM booking_status_history h
         LEFT JOIN users u ON u.user_id = h.changed_by
        WHERE h.booking_id = $1
        ORDER BY h.history_id ASC`,
      [bookingId]
    );
    return resHistory.rows.map((h: any) => ({
      historyId:     h.history_id,
      bookingId:     h.booking_id,
      status:        h.status,
      notes:         h.notes ?? undefined,
      changedBy:     h.changed_by ?? undefined,
      changedByName: h.changed_by_name ?? (h.changed_by ? undefined : 'SYSTEM'),
      createdAt:     h.created_at,
    }));
  }

  async lockBooking(conn: DbConnection, bookingId: number): Promise<LockedBooking | null> {
    const res = await conn.query(
      `SELECT booking_id, booking_number, user_id, court_id, TO_CHAR(booking_date, 'YYYY-MM-DD') AS booking_date,
              start_time, end_time, status, final_amount, total_court_fee, total_equipment_fee, discount_amount,
              CASE WHEN hold_expires_at < NOW() THEN TRUE ELSE FALSE END AS hold_expired
         FROM bookings WHERE booking_id = $1 FOR UPDATE`,
      [bookingId]
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      bookingId:    r.booking_id,
      bookingNumber: r.booking_number,
      userId:       r.user_id,
      courtId:      r.court_id,
      bookingDate:  r.booking_date,
      startTime:    r.start_time,
      endTime:      r.end_time,
      status:       r.status,
      finalAmount:       parseFloat(r.final_amount),
      totalCourtFee:     parseFloat(r.total_court_fee),
      totalEquipmentFee: parseFloat(r.total_equipment_fee),
      discountAmount:    parseFloat(r.discount_amount),
      holdExpired:       r.hold_expired,
    };
  }

  async lockCourt(conn: DbConnection, courtId: number): Promise<LockedCourt | null> {
    const res = await conn.query(
      `SELECT court_id, name, sport_type_id, hourly_rate, status, is_active FROM courts WHERE court_id = $1 FOR UPDATE`,
      [courtId]
    );
    const r = res.rows[0];
    if (!r) return null;
    return { courtId: r.court_id, name: r.name, sportTypeId: r.sport_type_id, hourlyRate: parseFloat(r.hourly_rate), status: r.status, isActive: r.is_active };
  }

  async lockUser(conn: DbConnection, userId: number, forUpdate = true): Promise<LockedUser | null> {
    const sql = `SELECT u.user_id, u.is_active, u.member_type_id, m.type_name, m.discount_percent
         FROM users u JOIN member_types m ON m.member_type_id = u.member_type_id
        WHERE u.user_id = $1 ${forUpdate ? 'FOR UPDATE OF u' : ''}`; // PostgreSQL: OF ต้องเป็นชื่อตาราง/alias (ล็อกแถว users อย่างเดียว ไม่ล็อก member_types)
    const res = await conn.query(sql, [userId]);
    const r = res.rows[0];
    if (!r) return null;
    return { userId: r.user_id, isActive: r.is_active, memberTypeId: r.member_type_id, memberTypeName: r.type_name, discountPercent: parseFloat(r.discount_percent) };
  }

  // BR2: ตรวจ overlap
  async findOverlap(conn: DbConnection, courtId: number, bookingDate: string, startTime: string, endTime: string, excludeBookingId?: number): Promise<{ bookingNumber: string; startTime: string; endTime: string } | null> {
    const res = await conn.query(
      `SELECT booking_number, start_time, end_time FROM bookings
        WHERE court_id = $1
          AND booking_date = $2::DATE
          AND status IN ${ACTIVE_STATUS_SQL}
          AND start_time < $3
          AND end_time > $4
          AND booking_id <> $5
        LIMIT 1`,
      [courtId, bookingDate, endTime, startTime, excludeBookingId ?? -1]
    );
    const r = res.rows[0];
    return r ? { bookingNumber: r.booking_number, startTime: r.start_time, endTime: r.end_time } : null;
  }

  async hasUnpaidFines(conn: DbConnection, userId: number): Promise<boolean> {
    const result = await conn.query<{ unpaid_count: string }>(
      `SELECT COUNT(*) AS unpaid_count FROM fines f JOIN bookings b ON f.booking_id = b.booking_id
        WHERE b.user_id = $1 AND f.status = 'UNPAID'`,
      [userId]
    );
    return parseInt(result.rows[0]?.unpaid_count || '0') > 0;
  }

<<<<<<< HEAD
=======
  // BR3b: จำนวน Hold ที่ยังมีผลของผู้ใช้ (PENDING_PAYMENT ทั้งหมด ไม่จำกัดสนาม/วัน)
  // เรียกหลัง expireStaleHolds(userId) แล้วเท่านั้น เพื่อไม่ให้ Hold ที่หมดเวลาจริงมานับรวมด้วย
  async countActiveHolds(conn: DbConnection, userId: number): Promise<number> {
    const res = await conn.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM bookings WHERE user_id = $1 AND status = 'PENDING_PAYMENT'`,
      [userId]
    );
    return parseInt(res.rows[0]?.cnt || '0');
  }

  // BR3c: จำนวนการจองที่ผู้ใช้สร้างแล้วถูกยกเลิกอัตโนมัติเพราะไม่ชำระ (EXPIRED) ภายใน N ชั่วโมงล่าสุด
  // ใช้ตรวจรูปแบบ "สร้าง hold ทิ้งซ้ำๆ" ซึ่งนับรวมทุกสนาม/วันที่ (ไม่ใช่แค่จำนวนครั้งที่กดปุ่ม)
  async countRecentExpired(conn: DbConnection, userId: number, hours: number): Promise<number> {
    const res = await conn.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM bookings
        WHERE user_id = $1 AND status = 'EXPIRED' AND created_at > NOW() - ($2 || ' hours')::INTERVAL`,
      [userId, hours]
    );
    return parseInt(res.rows[0]?.cnt || '0');
  }

>>>>>>> 7911668a7e5d511f83e82c3f30e2b56c2428aac6
  async hasPendingPayment(conn: DbConnection, bookingId: number): Promise<boolean> {
    const res = await conn.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM payments WHERE booking_id = $1 AND status = 'PENDING'`,
      [bookingId]
    );
    return parseInt(res.rows[0]?.cnt || '0') > 0;
  }

  async getVerifiedPaymentAmount(conn: DbConnection, bookingId: number): Promise<{ paymentId: number; amount: number } | null> {
    const res = await conn.query(
      `SELECT payment_id, amount FROM payments WHERE booking_id = $1 AND status = 'VERIFIED'`,
      [bookingId]
    );
    const r = res.rows[0];
    return r ? { paymentId: r.payment_id, amount: parseFloat(r.amount) } : null;
  }

  async countBorrowings(conn: DbConnection, bookingId: number): Promise<number> {
    const res = await conn.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM equipment_borrowings WHERE booking_id = $1`,
      [bookingId]
    );
    return parseInt(res.rows[0]?.cnt || '0');
  }

  async insertBooking(conn: DbConnection, data: {
    bookingNumber: string; userId: number; courtId: number; bookingDate: string;
    startTime: string; endTime: string; totalCourtFee: number; totalEquipmentFee: number;
    discountAmount: number; finalAmount: number; promotionId?: number | null; holdMinutes: number;
  }): Promise<number> {
    const result = await conn.query(
      `INSERT INTO bookings (booking_number, user_id, court_id, booking_date, start_time, end_time,
                             total_court_fee, total_equipment_fee, discount_amount, final_amount, status,
                             promotion_id, hold_expires_at)
       VALUES ($1, $2, $3, $4::DATE, $5, $6, $7, $8, $9, $10, 'PENDING_PAYMENT', $11,
               NOW() + ($12 || ' minutes')::INTERVAL)
       RETURNING booking_id`,
      [data.bookingNumber, data.userId, data.courtId, data.bookingDate, data.startTime, data.endTime,
       data.totalCourtFee, data.totalEquipmentFee, data.discountAmount, data.finalAmount,
       data.promotionId ?? null, data.holdMinutes]
    );
    return firstInsertId(result.rows, 'booking_id');
  }

  async insertBookingEquipment(conn: DbConnection, bookingId: number, line: EquipmentLine): Promise<void> {
    await conn.query(
      `INSERT INTO booking_equipment (booking_id, equipment_id, quantity, unit_rental_fee, subtotal)
       VALUES ($1, $2, $3, $4, $5)`,
      [bookingId, line.equipmentId, line.quantity, line.unitRentalFee, line.subtotal]
    );
  }

  async deleteBookingEquipment(conn: DbConnection, bookingId: number): Promise<void> {
    await conn.query(`DELETE FROM booking_equipment WHERE booking_id = $1`, [bookingId]);
  }

  // เปลี่ยนสถานะแบบมีเงื่อนไข (กันการเปลี่ยนซ้ำ/แข่งกัน)
  async transitionStatus(conn: DbConnection, bookingId: number, fromStatuses: string[], toStatus: string, extra: { cancelReason?: string; checkedInBy?: number; restartHold?: number } = {}): Promise<boolean> {
    const params: any[] = [toStatus, bookingId];
    const sets: string[] = ['status = $1', 'updated_at = NOW()'];

    if (toStatus === 'CANCELLED') {
      sets.push('cancelled_at = NOW()', `cancel_reason = $${params.length + 1}`);
      params.push(fitBytes(extra.cancelReason || 'Cancelled', 255));
    }
    if (toStatus === 'CHECKED_IN') {
      sets.push('checked_in_at = NOW()', `checked_in_by = $${params.length + 1}`);
      params.push(extra.checkedInBy ?? null);
    }
    if (extra.restartHold) {
      sets.push(`hold_expires_at = NOW() + ($${params.length + 1} || ' minutes')::INTERVAL`);
      params.push(extra.restartHold);
    }

    // สร้าง IN clause สำหรับ fromStatuses
    const fromPlaceholders = fromStatuses.map((_, i) => `$${params.length + 1 + i}`);
    params.push(...fromStatuses);

    const res = await conn.query(
      `UPDATE bookings SET ${sets.join(', ')} WHERE booking_id = $2 AND status IN (${fromPlaceholders.join(', ')})`,
      params
    );
    return (res.rowCount ?? 0) > 0;
  }

  async restartHold(conn: DbConnection, bookingId: number, minutes: number): Promise<void> {
    await conn.query(
      `UPDATE bookings SET hold_expires_at = NOW() + ($1 || ' minutes')::INTERVAL
        WHERE booking_id = $2 AND status = 'PENDING_PAYMENT'`,
      [minutes, bookingId]
    );
  }

  async updateSchedule(conn: DbConnection, data: {
    bookingId: number; bookingDate: string; startTime: string; endTime: string;
    totalCourtFee: number; totalEquipmentFee: number; discountAmount: number; finalAmount: number;
  }): Promise<void> {
    await conn.query(
      `UPDATE bookings
          SET booking_date = $1::DATE, start_time = $2, end_time = $3,
              total_court_fee = $4, total_equipment_fee = $5, discount_amount = $6, final_amount = $7,
              updated_at = NOW()
        WHERE booking_id = $8`,
      [data.bookingDate, data.startTime, data.endTime, data.totalCourtFee, data.totalEquipmentFee, data.discountAmount, data.finalAmount, data.bookingId]
    );
  }
}
