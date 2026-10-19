import { withTransaction } from '../config/db';
import { bookingStartTs, insertNotification } from '../repositories/shared.repository';
import { SettingsService } from './settings.service';
import { sendEmail, escapeHtml } from '../utils/email';

const MAX_EMAIL_ATTEMPTS = 3;
const EMAIL_BATCH = 50;

interface ReminderRow {
  booking_id: number;
  user_id: number;
  booking_number: string;
  court_name: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  minutes_until: number;
}

export class NotificationJobsService {
  private settingsService = new SettingsService();

  // =====================================================================
  // เตือนก่อนเวลาใช้สนาม 2 รอบ: ล่วงหน้า N ชั่วโมง และ M นาที (ค่าอยู่ใน app_settings)
  // - เตือนเฉพาะการจองที่ชำระแล้วและยังไม่เช็กอิน (CONFIRMED / PAYMENT_VERIFIED) และยังไม่ถึงเวลาเริ่ม
  // - reminder_*_sent_at กันส่งซ้ำ (แม้งานรันซ้อนก็ไม่ซ้ำ เพราะ FOR UPDATE SKIP LOCKED + อัปเดตในธุรกรรมเดียวกัน)
  // - จองใกล้เวลาจนเข้าช่วงเตือนรอบสองเลย → ส่งเฉพาะรอบสอง (ไม่ส่งสองข้อความติดกัน)
  // =====================================================================
  async sendDueReminders(): Promise<{ first: number; second: number }> {
    return withTransaction(async (conn) => {
      const { firstHours, secondMinutes } = await this.settingsService.getReminderWindow(conn);
      const { earlyMinutes, lateMinutes } = await this.settingsService.getCheckInWindow(conn);
      const start = bookingStartTs('b');

      const res = await conn.query<ReminderRow>(
        `SELECT b.booking_id, b.user_id, b.booking_number, c.name AS court_name,
                to_char(b.booking_date, 'YYYY-MM-DD') AS booking_date, b.start_time, b.end_time,
                EXTRACT(EPOCH FROM (${start} - NOW())) / 60 AS minutes_until
           FROM bookings b
           JOIN courts c ON c.court_id = b.court_id
          WHERE b.status IN ('CONFIRMED', 'PAYMENT_VERIFIED')
            AND ${start} > NOW()
            AND (
                 (${start} - NOW() <= make_interval(mins => $2) AND b.reminder_second_sent_at IS NULL)
              OR (${start} - NOW() >  make_interval(mins => $2)
                  AND ${start} - NOW() <= make_interval(hours => $1) AND b.reminder_first_sent_at IS NULL)
            )
          ORDER BY ${start}
          FOR UPDATE OF b SKIP LOCKED`,
        [firstHours, secondMinutes]
      );

      let first = 0;
      let second = 0;
      for (const row of res.rows) {
        const isSecond = Number(row.minutes_until) <= secondMinutes;
        const when = `${row.booking_date} ${row.start_time}-${row.end_time}`;
        const rules = `เช็กอินได้ก่อนเริ่ม ${earlyMinutes} นาที ถึงหลังเริ่ม ${lateMinutes} นาที ไม่เช็กอินถือว่าไม่มา ไม่คืนเงิน`;

        await insertNotification(conn, {
          userId: row.user_id,
          bookingId: row.booking_id,
          title: isSecond ? 'ใกล้ถึงเวลาใช้สนามแล้ว!' : 'เตือนล่วงหน้า: มีการจองสนามเร็วๆ นี้',
          message: `${row.booking_number} · ${row.court_name} · ${when}\n${rules}`,
          type: isSecond ? 'ALERT' : 'INFO',
          email: true,
        });
        await conn.query(
          isSecond
            ? `UPDATE bookings SET reminder_first_sent_at = COALESCE(reminder_first_sent_at, NOW()), reminder_second_sent_at = NOW() WHERE booking_id = $1`
            : `UPDATE bookings SET reminder_first_sent_at = NOW() WHERE booking_id = $1`,
          [row.booking_id]
        );
        if (isSecond) second++;
        else first++;
      }
      return { first, second };
    });
  }

  // =====================================================================
  // ส่งอีเมลที่ค้างในคิว (notifications.email_pending)
  // 1) เบิกงาน (นับครั้งที่พยายาม) ในธุรกรรมสั้นๆ  2) ส่งอีเมลนอกธุรกรรม (ไม่ถือ lock ระหว่างรอเครือข่าย)
  // 3) บันทึกผล — ส่งไม่สำเร็จจะลองใหม่รอบหน้า จนครบ MAX_EMAIL_ATTEMPTS แล้วเลิก
  // =====================================================================
  async dispatchPendingEmails(): Promise<{ sent: number; failed: number; skipped: number }> {
    const claimed = await withTransaction(async (conn) => {
      const res = await conn.query<{ notification_id: number; title: string; message: string; email: string; email_attempts: number }>(
        `UPDATE notifications n
            SET email_attempts = n.email_attempts + 1
           FROM users u
          WHERE u.user_id = n.user_id
            AND n.notification_id IN (
                  SELECT notification_id FROM notifications
                   WHERE email_pending AND email_attempts < $1
                   ORDER BY notification_id
                   LIMIT $2
                   FOR UPDATE SKIP LOCKED)
        RETURNING n.notification_id, n.title, n.message, u.email, n.email_attempts`,
        [MAX_EMAIL_ATTEMPTS, EMAIL_BATCH]
      );
      return res.rows;
    });

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const n of claimed) {
      let outcome: 'sent' | 'skipped' | 'failed' = 'failed';
      try {
        const body = n.message;
        const result = await sendEmail({
          to: n.email,
          subject: `[Rodhare Court] ${n.title}`,
          text: body,
          html: `<div style="font-family:sans-serif;line-height:1.6"><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(body).replace(/\n/g, '<br>')}</p></div>`,
        });
        outcome = result;
      } catch (err) {
        console.error(`[email] notification #${n.notification_id} attempt ${n.email_attempts} failed:`, (err as Error).message);
      }

      if (outcome === 'sent') {
        sent++;
        await withTransaction((conn) =>
          conn.query(`UPDATE notifications SET email_pending = FALSE, email_sent_at = NOW() WHERE notification_id = $1`, [n.notification_id])
        );
      } else if (outcome === 'skipped') {
        skipped++; // ยังไม่ได้ตั้งค่าผู้ให้บริการอีเมล — ไม่ต้องลองซ้ำ
        await withTransaction((conn) => conn.query(`UPDATE notifications SET email_pending = FALSE WHERE notification_id = $1`, [n.notification_id]));
      } else {
        failed++;
        if (n.email_attempts >= MAX_EMAIL_ATTEMPTS) {
          await withTransaction((conn) => conn.query(`UPDATE notifications SET email_pending = FALSE WHERE notification_id = $1`, [n.notification_id]));
        }
      }
    }
    return { sent, failed, skipped };
  }
}
