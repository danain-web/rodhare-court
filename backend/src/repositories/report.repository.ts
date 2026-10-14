import { DbConnection } from '../config/db';
import { ACTIVE_STATUS_SQL, bookingMinutes } from './shared.repository';

// =====================================================================
// Helper: รัน SELECT COUNT(*)/SUM() แล้วคืนค่าเดียว
// PostgreSQL: คืน column เป็น lowercase, ต้อง Number() แปลงจาก string
// =====================================================================
const scalar = async (conn: DbConnection, sql: string, params: any[] = []): Promise<number> => {
  const res = await conn.query<{ v: string }>(sql, params);
  return Number(res.rows[0]?.v || 0);
};

export class ReportRepository {
  async customerSummary(conn: DbConnection, userId: number) {
    return {
      activeBookings: await scalar(
        conn,
        `SELECT COUNT(*) AS v FROM bookings WHERE user_id = $1 AND status IN ${ACTIVE_STATUS_SQL} AND booking_date >= CURRENT_DATE`,
        [userId]
      ),
      pendingPaymentBookings: await scalar(
        conn,
        `SELECT COUNT(*) AS v FROM bookings WHERE user_id = $1 AND status = 'PENDING_PAYMENT'`,
        [userId]
      ),
      notificationsCount: await scalar(
        conn,
        `SELECT COUNT(*) AS v FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
        [userId]
      ),
      unpaidFines: await scalar(
        conn,
        `SELECT COALESCE(SUM(f.amount), 0) AS v FROM fines f JOIN bookings b ON b.booking_id = f.booking_id
          WHERE b.user_id = $1 AND f.status = 'UNPAID'`,
        [userId]
      ),
    };
  }

  async staffSummary(conn: DbConnection) {
    return {
      pendingPaymentSlips: await scalar(conn, `SELECT COUNT(*) AS v FROM payments WHERE status = 'PENDING'`),
      todayBookings: await scalar(
        conn,
        `SELECT COUNT(*) AS v FROM bookings WHERE booking_date = CURRENT_DATE AND status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED')`
      ),
      // PostgreSQL: DATE_TRUNC('day', timestamptz) แทน TRUNC(timestamp)
      todayCheckIns: await scalar(
        conn,
        `SELECT COUNT(*) AS v FROM bookings WHERE DATE_TRUNC('day', checked_in_at) = CURRENT_DATE`
      ),
      pendingRefunds: await scalar(conn, `SELECT COUNT(*) AS v FROM refund_requests WHERE status = 'PENDING'`),
      outstandingBorrowings: await scalar(
        conn,
        `SELECT COUNT(*) AS v FROM equipment_borrowings WHERE status IN ('BORROWED', 'OVERDUE')`
      ),
    };
  }

  async adminSummary(conn: DbConnection) {
    return {
      totalUsers:      await scalar(conn, `SELECT COUNT(*) AS v FROM users WHERE is_active = TRUE`),
      totalCourts:     await scalar(conn, `SELECT COUNT(*) AS v FROM courts WHERE is_active = TRUE`),
      totalPromotions: await scalar(conn, `SELECT COUNT(*) AS v FROM promotions WHERE is_active = TRUE AND end_date >= CURRENT_DATE`),
      auditLogsToday:  await scalar(conn, `SELECT COUNT(*) AS v FROM audit_logs WHERE created_at >= CURRENT_DATE`),
    };
  }

  // =====================================================================
  // BR17: รายงานสรุปรายได้และสถิติการใช้งาน (เดือนปัจจุบัน)
  // PostgreSQL: DATE_TRUNC แทน TRUNC/ADD_MONTHS, generate_series แทน CONNECT BY LEVEL
  // =====================================================================
  async executiveSummary(conn: DbConnection) {
    const monthlyRevenue = await scalar(
      conn,
      `SELECT COALESCE(SUM(amount), 0) AS v FROM payments
        WHERE status = 'VERIFIED'
          AND verified_at >= DATE_TRUNC('month', NOW())
          AND verified_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'`
    );
    const refundedThisMonth = await scalar(
      conn,
      `SELECT COALESCE(SUM(requested_amount), 0) AS v FROM refund_requests
        WHERE status = 'APPROVED'
          AND processed_at >= DATE_TRUNC('month', NOW())
          AND processed_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'`
    );
    const totalBookingsThisMonth = await scalar(
      conn,
      `SELECT COUNT(*) AS v FROM bookings
        WHERE booking_date >= DATE_TRUNC('month', NOW())
          AND booking_date < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'`
    );
    const confirmedBookings = await scalar(
      conn,
      `SELECT COUNT(*) AS v FROM bookings
        WHERE booking_date >= DATE_TRUNC('month', NOW())
          AND booking_date < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
          AND status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED')`
    );
    const cancelledBookings = await scalar(
      conn,
      `SELECT COUNT(*) AS v FROM bookings
        WHERE booking_date >= DATE_TRUNC('month', NOW())
          AND booking_date < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
          AND status IN ('CANCELLED', 'REFUNDED', 'EXPIRED')`
    );
    const bookedMinutes = await scalar(
      conn,
      `SELECT COALESCE(SUM(${bookingMinutes('b')}), 0) AS v FROM bookings b
        WHERE b.booking_date >= DATE_TRUNC('month', NOW())
          AND b.booking_date < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
          AND b.status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED')`
    );

    // ความจุรวม: generate_series สร้างทุกวันในเดือน แทน Oracle CONNECT BY LEVEL
    const capacityMinutes = await scalar(
      conn,
      `SELECT COALESCE(SUM(
         (EXTRACT(HOUR FROM h.close_time::TIME) * 60 + EXTRACT(MINUTE FROM h.close_time::TIME))
         - (EXTRACT(HOUR FROM h.open_time::TIME) * 60 + EXTRACT(MINUTE FROM h.open_time::TIME))
       ), 0) AS v
         FROM generate_series(DATE_TRUNC('month', NOW()), DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 day', INTERVAL '1 day') AS d
         JOIN court_operating_hours h ON h.day_of_week = EXTRACT(DOW FROM d)::int
         JOIN courts c ON c.court_id = h.court_id AND c.is_active = TRUE
        WHERE h.is_open = TRUE`
    );

    const revenueByDay = await conn.query(
      `SELECT TO_CHAR(DATE_TRUNC('day', verified_at), 'YYYY-MM-DD') AS day,
              SUM(amount) AS revenue, COUNT(*) AS payments
         FROM payments WHERE status = 'VERIFIED' AND verified_at >= NOW() - INTERVAL '13 days'
        GROUP BY DATE_TRUNC('day', verified_at) ORDER BY DATE_TRUNC('day', verified_at)`
    );
    const bookingsByCourt = await conn.query(
      `SELECT c.name AS court_name, COUNT(b.booking_id) AS bookings,
              COALESCE(SUM(CASE WHEN b.status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED') THEN b.final_amount END), 0) AS revenue
         FROM courts c
         LEFT JOIN bookings b ON b.court_id = c.court_id
           AND b.booking_date >= DATE_TRUNC('month', NOW())
           AND b.booking_date < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
        WHERE c.is_active = TRUE
        GROUP BY c.court_id, c.name ORDER BY bookings DESC, c.court_id`
    );

    // Peak hours: inline query แทน Oracle view v_revenue_by_hour
    const peakHours = await conn.query(
      `SELECT LPAD(hour_of_day::text, 2, '0') || ':00' AS hour,
              COUNT(*) AS bookings,
              SUM(${bookingMinutes('b')}) AS booked_minutes,
              SUM(b.final_amount) AS revenue
         FROM bookings b,
              LATERAL generate_series(
                EXTRACT(HOUR FROM b.start_time::TIME)::int,
                EXTRACT(HOUR FROM CASE WHEN b.end_time = '24:00' THEN '23:59' ELSE b.end_time END::TIME)::int - 1
              ) AS hour_of_day
        WHERE b.status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED')
        GROUP BY hour_of_day
        HAVING COUNT(*) > 0
        ORDER BY bookings DESC, revenue DESC, hour_of_day
        LIMIT 6`
    );
    const equipmentStats = await conn.query(
      `SELECT e.name, e.total_quantity, e.available_quantity,
              (SELECT COUNT(*) FROM equipment_borrowings eb WHERE eb.equipment_id = e.equipment_id) AS times_borrowed,
              (SELECT COALESCE(SUM(eb.quantity), 0) FROM equipment_borrowings eb
                WHERE eb.equipment_id = e.equipment_id AND eb.status IN ('DAMAGED', 'LOST')) AS damaged_or_lost
         FROM equipment e ORDER BY e.equipment_id`
    );
    const fineRevenue = await scalar(conn, `SELECT COALESCE(SUM(amount), 0) AS v FROM fines WHERE status = 'PAID'`);

    return {
      monthlyRevenue,
      refundedThisMonth,
      netRevenue: Math.round((monthlyRevenue - refundedThisMonth) * 100) / 100,
      totalBookingsThisMonth,
      confirmedBookings,
      cancelledBookings,
      courtUtilizationRate: capacityMinutes > 0 ? `${((bookedMinutes / capacityMinutes) * 100).toFixed(1)}%` : '0.0%',
      bookedHoursThisMonth: Math.round((bookedMinutes / 60) * 10) / 10,
      fineRevenue,
      revenueByDay: revenueByDay.rows.map((r: any) => ({ day: r.day, revenue: parseFloat(r.revenue), payments: parseInt(r.payments) })),
      bookingsByCourt: bookingsByCourt.rows.map((r: any) => ({ courtName: r.court_name, bookings: parseInt(r.bookings), revenue: parseFloat(r.revenue) })),
      peakHours: peakHours.rows.map((r: any) => ({ hour: r.hour, bookings: parseInt(r.bookings), bookedMinutes: parseInt(r.booked_minutes), revenue: parseFloat(r.revenue) })),
      equipmentStats: equipmentStats.rows.map((r: any) => ({ name: r.name, totalQuantity: r.total_quantity, availableQuantity: r.available_quantity, timesBorrowed: parseInt(r.times_borrowed), damagedOrLost: parseInt(r.damaged_or_lost) })),
    };
  }
}
