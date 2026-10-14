import { DbConnection, firstInsertId } from '../config/db';
import { fitBytes } from '../utils/params';
import { BorrowingDTO, FineDTO } from '../types/borrowing';
import { bookingEndTs } from './shared.repository';

const BORROWING_SELECT = `
  SELECT eb.borrowing_id, eb.booking_id, b.booking_number, eb.equipment_id, e.name AS equipment_name,
         eb.quantity, eb.borrowed_at, eb.expected_return_at, eb.actual_return_at,
         CASE WHEN eb.status = 'BORROWED' AND eb.expected_return_at < NOW() THEN 'OVERDUE' ELSE eb.status END AS status,
         eb.condition_notes, eb.staff_user_id
    FROM equipment_borrowings eb
    JOIN bookings b ON eb.booking_id = b.booking_id
    JOIN equipment e ON eb.equipment_id = e.equipment_id`;

const mapBorrowing = (row: any): BorrowingDTO => ({
  borrowingId:      row.borrowing_id,
  bookingId:        row.booking_id,
  bookingNumber:    row.booking_number,
  equipmentId:      row.equipment_id,
  equipmentName:    row.equipment_name,
  quantity:         row.quantity,
  borrowedAt:       row.borrowed_at,
  expectedReturnAt: row.expected_return_at,
  actualReturnAt:   row.actual_return_at ?? undefined,
  status:           row.status,
  conditionNotes:   row.condition_notes ?? undefined,
  staffUserId:      row.staff_user_id ?? undefined,
});

const FINE_SELECT = `
  SELECT f.fine_id, f.borrowing_id, f.booking_id, b.booking_number, e.name AS equipment_name, f.fine_type, f.amount,
         f.reason, f.status, f.paid_at, f.created_at, b.user_id
    FROM fines f
    JOIN bookings b ON f.booking_id = b.booking_id
    LEFT JOIN equipment_borrowings eb ON eb.borrowing_id = f.borrowing_id
    LEFT JOIN equipment e ON e.equipment_id = eb.equipment_id`;

const mapFine = (row: any): FineDTO => ({
  fineId:        row.fine_id,
  borrowingId:   row.borrowing_id ?? undefined,
  bookingId:     row.booking_id,
  bookingNumber: row.booking_number,
  equipmentName: row.equipment_name ?? undefined,
  fineType:      row.fine_type,
  amount:        parseFloat(row.amount),
  reason:        row.reason,
  status:        row.status,
  paidAt:        row.paid_at ?? undefined,
  createdAt:     row.created_at,
});

export class BorrowingRepository {
  // จำนวนที่จองไว้ใน booking_equipment ที่ยังไม่ได้ยืมออก
  async getRemainingReserved(conn: DbConnection, bookingId: number, equipmentId: number): Promise<number> {
    const res = await conn.query<{ remaining: string }>(
      `SELECT
         COALESCE((SELECT SUM(quantity) FROM booking_equipment WHERE booking_id = $1 AND equipment_id = $2), 0)
         - COALESCE((SELECT SUM(quantity) FROM equipment_borrowings WHERE booking_id = $1 AND equipment_id = $2), 0) AS remaining`,
      [bookingId, equipmentId]
    );
    return Math.max(0, parseInt(res.rows[0]?.remaining || '0'));
  }

  // กำหนดคืน (BR10) = เวลาสิ้นสุดการจอง
  async insertBorrowing(conn: DbConnection, data: { bookingId: number; equipmentId: number; quantity: number; staffUserId: number; notes?: string }): Promise<number> {
    const res = await conn.query(
      `INSERT INTO equipment_borrowings (booking_id, equipment_id, quantity, expected_return_at, status, condition_notes, staff_user_id)
       VALUES ($1, $2, $3,
               (SELECT ${bookingEndTs('b')} FROM bookings b WHERE b.booking_id = $1),
               'BORROWED', $4, $5)
       RETURNING borrowing_id`,
      [data.bookingId, data.equipmentId, data.quantity, data.notes || null, data.staffUserId]
    );
    return firstInsertId(res.rows, 'borrowing_id');
  }

  async getBorrowingById(conn: DbConnection, borrowingId: number): Promise<BorrowingDTO | null> {
    const res = await conn.query(`${BORROWING_SELECT} WHERE eb.borrowing_id = $1`, [borrowingId]);
    return res.rows[0] ? mapBorrowing(res.rows[0]) : null;
  }

  async lockBorrowing(conn: DbConnection, borrowingId: number): Promise<{ borrowingId: number; bookingId: number; equipmentId: number; quantity: number; status: string; expectedReturnAt: Date } | null> {
    const res = await conn.query(
      `SELECT borrowing_id, booking_id, equipment_id, quantity, status, expected_return_at
         FROM equipment_borrowings WHERE borrowing_id = $1 FOR UPDATE`,
      [borrowingId]
    );
    const r = res.rows[0];
    return r ? { borrowingId: r.borrowing_id, bookingId: r.booking_id, equipmentId: r.equipment_id, quantity: r.quantity, status: r.status, expectedReturnAt: r.expected_return_at } : null;
  }

  async getBorrowingsByBooking(conn: DbConnection, bookingId: number): Promise<BorrowingDTO[]> {
    const res = await conn.query(`${BORROWING_SELECT} WHERE eb.booking_id = $1 ORDER BY eb.borrowing_id DESC`, [bookingId]);
    return res.rows.map(mapBorrowing);
  }

  async markReturned(conn: DbConnection, borrowingId: number, status: 'RETURNED' | 'DAMAGED' | 'LOST', notes?: string): Promise<boolean> {
    const res = await conn.query(
      `UPDATE equipment_borrowings
          SET status = $1, actual_return_at = NOW(), condition_notes = COALESCE($2, condition_notes)
        WHERE borrowing_id = $3 AND status IN ('BORROWED', 'OVERDUE')`,
      [status, notes ? fitBytes(notes, 255) : null, borrowingId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async insertFine(conn: DbConnection, data: { borrowingId?: number; bookingId: number; fineType: 'LATE_RETURN' | 'DAMAGE' | 'LOSS'; amount: number; reason: string }): Promise<number> {
    const res = await conn.query(
      `INSERT INTO fines (borrowing_id, booking_id, fine_type, amount, reason, status)
       VALUES ($1, $2, $3, $4, $5, 'UNPAID')
       RETURNING fine_id`,
      [data.borrowingId ?? null, data.bookingId, data.fineType, data.amount, fitBytes(data.reason, 255)]
    );
    return firstInsertId(res.rows, 'fine_id');
  }

  async getFineById(conn: DbConnection, fineId: number): Promise<(FineDTO & { userId: number }) | null> {
    const res = await conn.query(`${FINE_SELECT} WHERE f.fine_id = $1`, [fineId]);
    const row = res.rows[0];
    return row ? { ...mapFine(row), userId: row.user_id } : null;
  }

  async getFinesByUser(conn: DbConnection, userId: number): Promise<FineDTO[]> {
    const res = await conn.query(`${FINE_SELECT} WHERE b.user_id = $1 ORDER BY f.fine_id DESC`, [userId]);
    return res.rows.map(mapFine);
  }

  async markFinePaid(conn: DbConnection, fineId: number): Promise<boolean> {
    const res = await conn.query(
      `UPDATE fines SET status = 'PAID', paid_at = NOW() WHERE fine_id = $1 AND status = 'UNPAID'`,
      [fineId]
    );
    return (res.rowCount ?? 0) > 0;
  }
}
