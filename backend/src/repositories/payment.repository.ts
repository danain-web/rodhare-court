import { fitBytes } from '../utils/params';
import { DbConnection, firstInsertId } from '../config/db';
import { PaymentDTO, ReceiptDTO, NotificationDTO } from '../types/payment';

const PAYMENT_SELECT = `
  SELECT p.payment_id, p.booking_id, b.booking_number, b.status AS booking_status, b.final_amount AS booking_final_amount,
         b.hold_expires_at, b.user_id, u.username, u.first_name || ' ' || u.last_name AS customer_name,
         c.name AS court_name, TO_CHAR(b.booking_date, 'YYYY-MM-DD') AS booking_date, b.start_time, b.end_time,
         p.payment_method, p.amount, p.slip_url, p.slip_reference, p.slip_mime_type, p.slip_file_size,
         p.status, p.verification_method, p.review_reason, p.verified_by, p.verified_at,
         p.rejection_reason, p.created_at
    FROM payments p
    JOIN bookings b ON p.booking_id = b.booking_id
    JOIN users u ON b.user_id = u.user_id
    JOIN courts c ON c.court_id = b.court_id`;

const mapPayment = (row: any): PaymentDTO => ({
  paymentId:            row.payment_id,
  bookingId:            row.booking_id,
  bookingNumber:        row.booking_number,
  bookingStatus:        row.booking_status,
  bookingFinalAmount:   parseFloat(row.booking_final_amount),
  amountMatches:        Math.abs(parseFloat(row.amount) - parseFloat(row.booking_final_amount)) < 0.005,
  holdExpiresAt:        row.hold_expires_at ?? undefined,
  userId:               row.user_id,
  userName:             row.username,
  customerName:         row.customer_name,
  courtName:            row.court_name,
  bookingDate:          row.booking_date,
  startTime:            row.start_time,
  endTime:              row.end_time,
  paymentMethod:        row.payment_method,
  amount:               parseFloat(row.amount),
  slipUrl:              row.slip_url ?? undefined,
  slipReference:        row.slip_reference ?? undefined,
  slipMimeType:         row.slip_mime_type ?? undefined,
  slipFileSize:         row.slip_file_size ?? undefined,
  status:               row.status,
  verificationMethod:   row.verification_method ?? undefined,
  reviewReason:         row.review_reason ?? undefined,
  minutesWaiting:       row.minutes_waiting ?? undefined,
  verifiedBy:           row.verified_by ?? undefined,
  verifiedAt:           row.verified_at ?? undefined,
  rejectionReason:      row.rejection_reason ?? undefined,
  createdAt:            row.created_at,
});

export class PaymentRepository {
  async insertPayment(
    conn: DbConnection,
    data: {
      bookingId: number;
      amount: number;
      paymentMethod: string;
      slipUrl: string;
      slipReference?: string | null;
      slipMimeType?: string | null;
      slipFileSize?: number | null;
      status?: 'PENDING' | 'REJECTED';
      verificationMethod?: 'AUTO' | 'MANUAL';
      reviewReason?: string | null;
      rejectionReason?: string | null;
    }
  ): Promise<number> {
    const status = data.status ?? 'PENDING';
    const res = await conn.query(
      `INSERT INTO payments (booking_id, payment_method, amount, slip_url, slip_reference, slip_mime_type, slip_file_size,
                             status, verification_method, review_reason, rejection_reason, verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::VARCHAR, $9, $10, $11,
               -- PostgreSQL: พารามิเตอร์ที่ใช้ซ้ำต้อง cast ให้เป็นชนิดเดียวกันทุกจุด ไม่งั้น "inconsistent types deduced"
               CASE WHEN $8::VARCHAR = 'PENDING' THEN NULL ELSE NOW() END)
       RETURNING payment_id`,
      [
        data.bookingId,
        data.paymentMethod,
        data.amount,
        data.slipUrl,
        data.slipReference ? data.slipReference.trim().toUpperCase() : null,
        data.slipMimeType ?? null,
        data.slipFileSize ?? null,
        status,
        data.verificationMethod ?? 'MANUAL',
        data.reviewReason ? fitBytes(data.reviewReason, 255) : null,
        data.rejectionReason ? fitBytes(data.rejectionReason, 255) : null,
      ]
    );
    return firstInsertId(res.rows, 'payment_id');
  }

  async getPaymentById(conn: DbConnection, paymentId: number): Promise<PaymentDTO | null> {
    const res = await conn.query(`${PAYMENT_SELECT} WHERE p.payment_id = $1`, [paymentId]);
    return res.rows[0] ? mapPayment(res.rows[0]) : null;
  }

  async lockPayment(conn: DbConnection, paymentId: number): Promise<{ paymentId: number; bookingId: number; amount: number; status: string; slipReference?: string; createdAt: Date } | null> {
    const res = await conn.query(
      `SELECT payment_id, booking_id, amount, status, slip_reference, created_at FROM payments WHERE payment_id = $1 FOR UPDATE`,
      [paymentId]
    );
    const r = res.rows[0];
    if (!r) return null;
    return { paymentId: r.payment_id, bookingId: r.booking_id, amount: parseFloat(r.amount), status: r.status, slipReference: r.slip_reference ?? undefined, createdAt: r.created_at };
  }

  async findSlipReferenceInUse(conn: DbConnection, reference: string, excludePaymentId?: number): Promise<{ paymentId: number; bookingNumber: string; status: string } | null> {
    const res = await conn.query(
      `SELECT p.payment_id, b.booking_number, p.status FROM payments p JOIN bookings b ON b.booking_id = p.booking_id
        WHERE UPPER(p.slip_reference) = UPPER($1) AND p.status <> 'REJECTED' AND p.payment_id <> $2
        LIMIT 1`,
      [reference.trim(), excludePaymentId ?? -1]
    );
    const r = res.rows[0];
    return r ? { paymentId: r.payment_id, bookingNumber: r.booking_number, status: r.status } : null;
  }

  // คิวสลิปรอตรวจ — แทน Oracle view v_pending_slips ด้วย inline query
  async getPendingPayments(conn: DbConnection): Promise<PaymentDTO[]> {
    const res = await conn.query(
      `SELECT p.payment_id, p.booking_id, b.booking_number, b.status AS booking_status, b.final_amount AS booking_final_amount,
              b.hold_expires_at, b.user_id, u.username, u.first_name || ' ' || u.last_name AS customer_name,
              c.name AS court_name, TO_CHAR(b.booking_date, 'YYYY-MM-DD') AS booking_date, b.start_time, b.end_time,
              p.payment_method, p.amount, p.slip_url, p.slip_reference, p.slip_mime_type, p.slip_file_size,
              p.status, p.verification_method, p.review_reason,
              EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 60 AS minutes_waiting,
              p.verified_by, p.verified_at, p.rejection_reason, p.created_at
         FROM payments p
         JOIN bookings b ON p.booking_id = b.booking_id
         JOIN users u ON b.user_id = u.user_id
         JOIN courts c ON c.court_id = b.court_id
        WHERE p.status = 'PENDING'
        ORDER BY p.created_at ASC, p.payment_id ASC`
    );
    return res.rows.map(mapPayment);
  }

  async getPaymentsByBooking(conn: DbConnection, bookingId: number): Promise<PaymentDTO[]> {
    const res = await conn.query(`${PAYMENT_SELECT} WHERE p.booking_id = $1 ORDER BY p.payment_id DESC`, [bookingId]);
    return res.rows.map(mapPayment);
  }

  async markVerified(conn: DbConnection, paymentId: number, staffUserId: number | null): Promise<boolean> {
    const res = await conn.query(
      `UPDATE payments SET status = 'VERIFIED', verified_by = $1::INTEGER, verified_at = NOW(), rejection_reason = NULL,
              verification_method = CASE WHEN $1::INTEGER IS NULL THEN 'AUTO' ELSE 'MANUAL' END
        WHERE payment_id = $2 AND status = 'PENDING'`,
      [staffUserId, paymentId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async markRejected(conn: DbConnection, paymentId: number, reason: string, actorId: number): Promise<boolean> {
    const res = await conn.query(
      `UPDATE payments SET status = 'REJECTED', rejection_reason = $1, verified_by = $2, verified_at = NOW(),
              verification_method = 'MANUAL'
        WHERE payment_id = $3 AND status = 'PENDING'`,
      [fitBytes(reason, 255), actorId, paymentId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  // เลขใบเสร็จ: RC-{YYYYMMDD}-{paymentId 6 หลัก}
  async insertReceipt(conn: DbConnection, data: { bookingId: number; paymentId: number; totalAmount: number }): Promise<{ receiptId: number; receiptNumber: string }> {
    const receiptNumber = `RC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(data.paymentId).padStart(6, '0')}`;
    const res = await conn.query(
      `INSERT INTO receipts (receipt_number, booking_id, payment_id, total_amount)
       VALUES ($1, $2, $3, $4)
       RETURNING receipt_id`,
      [receiptNumber, data.bookingId, data.paymentId, data.totalAmount]
    );
    return { receiptId: firstInsertId(res.rows, 'receipt_id'), receiptNumber };
  }

  async getReceiptByBookingId(conn: DbConnection, bookingId: number): Promise<ReceiptDTO | null> {
    const res = await conn.query(
      `SELECT r.receipt_id, r.receipt_number, r.booking_id, b.booking_number,
              r.payment_id, b.user_id, u.username, u.first_name || ' ' || u.last_name AS customer_name,
              c.name AS court_name, TO_CHAR(b.booking_date, 'YYYY-MM-DD') AS booking_date,
              b.start_time, b.end_time, b.total_court_fee, b.total_equipment_fee, b.discount_amount,
              r.total_amount, p.payment_method, p.slip_reference, p.verification_method,
              r.created_by AS issued_by, r.issued_at, r.pdf_url
         FROM receipts r
         JOIN bookings b ON b.booking_id = r.booking_id
         JOIN payments p ON p.payment_id = r.payment_id
         JOIN users u ON u.user_id = b.user_id
         JOIN courts c ON c.court_id = b.court_id
        WHERE r.booking_id = $1
        ORDER BY r.receipt_id DESC LIMIT 1`,
      [bookingId]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      receiptId:          row.receipt_id,
      receiptNumber:      row.receipt_number,
      bookingId:          row.booking_id,
      bookingNumber:      row.booking_number,
      paymentId:          row.payment_id,
      userId:             row.user_id,
      userName:           row.username,
      customerName:       row.customer_name,
      courtName:          row.court_name,
      bookingDate:        row.booking_date,
      startTime:          row.start_time,
      endTime:            row.end_time,
      totalCourtFee:      parseFloat(row.total_court_fee),
      totalEquipmentFee:  parseFloat(row.total_equipment_fee),
      discountAmount:     parseFloat(row.discount_amount),
      totalAmount:        parseFloat(row.total_amount),
      paymentMethod:      row.payment_method,
      slipReference:      row.slip_reference ?? undefined,
      issuedBy:           row.issued_by ?? undefined,
      verificationMethod: row.verification_method ?? undefined,
      issuedAt:           row.issued_at,
      pdfUrl:             row.pdf_url ?? undefined,
    };
  }

  async getUserNotifications(conn: DbConnection, userId: number): Promise<NotificationDTO[]> {
    const res = await conn.query(
      `SELECT notification_id, user_id, booking_id, title, message, type, is_read, created_at
         FROM notifications WHERE user_id = $1 ORDER BY notification_id DESC LIMIT 100`,
      [userId]
    );
    return res.rows.map((row: any) => ({
      notificationId: row.notification_id,
      userId:         row.user_id,
      bookingId:      row.booking_id ?? undefined,
      title:          row.title,
      message:        row.message,
      type:           row.type,
      isRead:         row.is_read === true || row.is_read === 1,
      createdAt:      row.created_at,
    }));
  }

  async markNotificationRead(conn: DbConnection, notificationId: number, userId: number): Promise<boolean> {
    const res = await conn.query(
      `UPDATE notifications SET is_read = TRUE WHERE notification_id = $1 AND user_id = $2`,
      [notificationId, userId]
    );
    return (res.rowCount ?? 0) > 0;
  }
}
