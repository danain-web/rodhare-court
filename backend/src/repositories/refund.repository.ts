import { DbConnection, firstInsertId } from '../config/db';
import { fitBytes } from '../utils/params';
import { RefundRequestDTO } from '../types/refund';

const REFUND_SELECT = `
  SELECT r.refund_id, r.booking_id, b.booking_number, b.status AS booking_status, r.user_id, u.username,
         r.requested_amount, r.refund_percentage, r.status, r.reason, r.review_note, r.approved_by, r.processed_at,
         r.created_at,
         (SELECT p.amount FROM payments p WHERE p.booking_id = r.booking_id AND p.status = 'VERIFIED' LIMIT 1) AS paid_amount
    FROM refund_requests r
    JOIN bookings b ON r.booking_id = b.booking_id
    JOIN users u ON r.user_id = u.user_id`;

const mapRefund = (row: any): RefundRequestDTO => ({
  refundId:         row.refund_id,
  id:               row.refund_id,
  bookingId:        row.booking_id,
  bookingNumber:    row.booking_number,
  bookingStatus:    row.booking_status,
  userId:           row.user_id,
  userName:         row.username,
  requestedAmount:  parseFloat(row.requested_amount),
  amount:           parseFloat(row.requested_amount),
  paidAmount:       row.paid_amount != null ? parseFloat(row.paid_amount) : undefined,
  refundPercentage: parseFloat(row.refund_percentage),
  status:           row.status,
  reason:           row.reason ?? undefined,
  reviewNote:       row.review_note ?? undefined,
  approvedBy:       row.approved_by ?? undefined,
  processedAt:      row.processed_at ?? undefined,
  createdAt:        row.created_at,
});

export class RefundRepository {
  async insertRefundRequest(
    conn: DbConnection,
    data: { bookingId: number; userId: number; requestedAmount: number; refundPercentage: number; reason?: string }
  ): Promise<number> {
    const res = await conn.query(
      `INSERT INTO refund_requests (booking_id, user_id, requested_amount, refund_percentage, status, reason)
       VALUES ($1, $2, $3, $4, 'PENDING', $5)
       RETURNING refund_id`,
      [data.bookingId, data.userId, data.requestedAmount, data.refundPercentage, data.reason ? fitBytes(data.reason, 255) : null]
    );
    return firstInsertId(res.rows, 'refund_id');
  }

  async getRefundById(conn: DbConnection, refundId: number): Promise<RefundRequestDTO | null> {
    const res = await conn.query(`${REFUND_SELECT} WHERE r.refund_id = $1`, [refundId]);
    return res.rows[0] ? mapRefund(res.rows[0]) : null;
  }

  async lockRefund(conn: DbConnection, refundId: number): Promise<{ refundId: number; bookingId: number; userId: number; status: string; requestedAmount: number } | null> {
    const res = await conn.query(
      `SELECT refund_id, booking_id, user_id, status, requested_amount FROM refund_requests WHERE refund_id = $1 FOR UPDATE`,
      [refundId]
    );
    const r = res.rows[0];
    return r ? { refundId: r.refund_id, bookingId: r.booking_id, userId: r.user_id, status: r.status, requestedAmount: parseFloat(r.requested_amount) } : null;
  }

  async getRefundsByUser(conn: DbConnection, userId: number): Promise<RefundRequestDTO[]> {
    const res = await conn.query(`${REFUND_SELECT} WHERE r.user_id = $1 ORDER BY r.refund_id DESC`, [userId]);
    return res.rows.map(mapRefund);
  }

  async getPendingRefunds(conn: DbConnection): Promise<RefundRequestDTO[]> {
    const res = await conn.query(`${REFUND_SELECT} WHERE r.status = 'PENDING' ORDER BY r.created_at ASC`);
    return res.rows.map(mapRefund);
  }

  async review(conn: DbConnection, refundId: number, status: 'APPROVED' | 'REJECTED', staffUserId: number, note?: string): Promise<boolean> {
    const res = await conn.query(
      `UPDATE refund_requests
          SET status = $1, approved_by = $2, processed_at = NOW(), review_note = $3
        WHERE refund_id = $4 AND status = 'PENDING'`,
      [status, staffUserId, note ? fitBytes(note, 255) : null, refundId]
    );
    return (res.rowCount ?? 0) > 0;
  }
}
