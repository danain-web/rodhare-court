import request from 'supertest';
import { app, pool, registerAndGetCookie, deleteTestUsers, loginAs } from './helpers';
import { NotificationJobsService } from '../src/services/notification-jobs.service';
import { BookingService } from '../src/services/booking.service';
import { testOutbox, __failNextEmails } from '../src/utils/email';

// =====================================================================
// แจ้งเตือนก่อนเวลาใช้สนาม (in-app + อีเมล)
// - เตือน 2 รอบ (24 ชม. / 60 นาที ปรับได้) ไม่ส่งซ้ำ ไม่เตือนการจองที่ไม่เกี่ยวข้อง
// - อีเมลผ่านคิว (outbox): ล้มแล้วลองใหม่ ไม่กระทบแจ้งเตือนในแอป · เทสต์ไม่ส่งอีเมลจริง
// =====================================================================

const jobs = new NotificationJobsService();
const createdUsernames: string[] = [];
const createdBookingIds: number[] = [];
let userId = 0;
let userEmail = '';
let courtId = 0;
let adminCookies: string[] = [];
let seq = 0;

const insertBooking = async (offsetMin: number, status = 'CONFIRMED') => {
  const t = await pool.query(
    `SELECT to_char(d, 'YYYY-MM-DD') AS date, to_char(d, 'HH24:MI') AS start,
            to_char(d + interval '60 minutes', 'YYYY-MM-DD') AS end_date, to_char(d + interval '60 minutes', 'HH24:MI') AS "end"
       FROM (SELECT date_trunc('minute', NOW() AT TIME ZONE 'Asia/Bangkok') + ($1::int * interval '1 minute') AS d) x`,
    [offsetMin]
  );
  const r = t.rows[0];
  const res = await pool.query(
    `INSERT INTO bookings (booking_number, user_id, court_id, booking_date, start_time, end_time,
                           total_court_fee, final_amount, status, hold_expires_at, checked_in_at)
     VALUES ($1, $2, $3, $4, $5, $6, 300, 300, $7::varchar, NOW(), CASE WHEN $7::varchar = 'CHECKED_IN' THEN NOW() END)
     RETURNING booking_id`,
    [`NTF${Date.now()}${++seq}`, userId, courtId, r.date, r.start, r.end_date === r.date ? r.end : '24:00', status]
  );
  createdBookingIds.push(res.rows[0].booking_id);
  return res.rows[0].booking_id as number;
};

const notes = async (bookingId: number) =>
  (await pool.query('SELECT title, type, email_pending, email_attempts, email_sent_at FROM notifications WHERE booking_id = $1 ORDER BY notification_id', [bookingId])).rows;
const stamps = async (bookingId: number) =>
  (await pool.query('SELECT reminder_first_sent_at AS f, reminder_second_sent_at AS s FROM bookings WHERE booking_id = $1', [bookingId])).rows[0];
const mailsTo = () => testOutbox.filter((m) => m.to === userEmail);
const setSetting = (key: string, value: number) => request(app).put(`/api/admin/settings/${key}`).set('Cookie', adminCookies).send({ value });

beforeAll(async () => {
  const u = await registerAndGetCookie('jest_ntf');
  createdUsernames.push(u.user.username);
  userId = u.userId;
  userEmail = u.user.email;
  adminCookies = await loginAs('admin1');
  courtId = (await pool.query(`SELECT court_id FROM courts WHERE code = 'BAS-01'`)).rows[0].court_id;
});

beforeEach(async () => {
  testOutbox.length = 0;
  __failNextEmails(0);
  // ล้างแจ้งเตือนค้างจากเคสก่อนหน้า ไม่งั้นคิวอีเมลเก่าไปรับความล้มเหลวที่จำลองไว้แทน
  await pool.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
});

afterEach(async () => {
  if (createdBookingIds.length) {
    await pool.query(
      `UPDATE bookings SET status = 'CANCELLED', cancelled_at = NOW()
        WHERE booking_id = ANY($1::int[]) AND status IN ('PENDING_PAYMENT','PAYMENT_VERIFIED','CONFIRMED','CHECKED_IN')`,
      [createdBookingIds]
    );
  }
  await pool.query(`UPDATE app_settings SET setting_value = '24' WHERE setting_key = 'reminder.first_hours'`);
});

afterAll(async () => {
  await deleteTestUsers(createdUsernames);
  await pool.end();
});

describe('เตือนล่วงหน้ารอบแรก (24 ชม.)', () => {
  it('จองอีก 23 ชม. → ได้แจ้งเตือนในแอป 1 รายการ + อีเมล 1 ฉบับ และไม่ส่งซ้ำเมื่อรันอีกรอบ', async () => {
    const id = await insertBooking(23 * 60);
    const r1 = await jobs.sendDueReminders();
    expect(r1.first).toBeGreaterThanOrEqual(1);
    expect((await stamps(id)).f).not.toBeNull();
    expect((await stamps(id)).s).toBeNull();
    expect((await notes(id)).length).toBe(1);

    const e1 = await jobs.dispatchPendingEmails();
    expect(e1.sent).toBeGreaterThanOrEqual(1);
    expect(mailsTo().length).toBe(1);
    expect(mailsTo()[0].subject).toContain('Rodhare Court');
    expect(mailsTo()[0].text).toContain('ไม่คืนเงิน');
    expect((await notes(id))[0].email_sent_at).not.toBeNull();

    await jobs.sendDueReminders();
    await jobs.dispatchPendingEmails();
    expect((await notes(id)).length).toBe(1);
    expect(mailsTo().length).toBe(1);
  });

  it('จองอีก 50 ชม. (ยังไม่ถึงช่วงเตือน) → ไม่เตือน', async () => {
    const id = await insertBooking(50 * 60);
    await jobs.sendDueReminders();
    expect((await notes(id)).length).toBe(0);
    expect((await stamps(id)).f).toBeNull();
  });

  it('ปรับค่า reminder.first_hours เป็น 48 ผ่าน admin → จองอีก 40 ชม. ถูกเตือนทันที', async () => {
    const id = await insertBooking(40 * 60);
    await jobs.sendDueReminders();
    expect((await notes(id)).length).toBe(0);

    expect((await setSetting('reminder.first_hours', 48)).status).toBe(200);
    await jobs.sendDueReminders();
    expect((await notes(id)).length).toBe(1);
  });
});

describe('เตือนรอบสอง (60 นาที)', () => {
  it('จองที่เหลือ 30 นาที (เข้าช่วงรอบสองเลย) → ส่งเฉพาะรอบสอง 1 ข้อความ ชนิด ALERT และตั้งเวลาทั้งสองรอบ', async () => {
    const id = await insertBooking(30);
    const r = await jobs.sendDueReminders();
    expect(r.second).toBeGreaterThanOrEqual(1);
    const n = await notes(id);
    expect(n.length).toBe(1);
    expect(n[0].type).toBe('ALERT');
    const s = await stamps(id);
    expect(s.f).not.toBeNull();
    expect(s.s).not.toBeNull();
  });

  it('เตือนรอบแรกไปแล้ว แล้วเข้าช่วง 60 นาที → ได้รอบสองเพิ่มอีก 1 และไม่เกินนั้น', async () => {
    const id = await insertBooking(40);
    await pool.query('UPDATE bookings SET reminder_first_sent_at = NOW() WHERE booking_id = $1', [id]);
    await jobs.sendDueReminders();
    await jobs.sendDueReminders();
    expect((await notes(id)).length).toBe(1);
  });
});

describe('ไม่เตือนการจองที่ไม่เกี่ยวข้อง', () => {
  it('รอชำระเงิน / เช็กอินแล้ว / ยกเลิก / เริ่มไปแล้ว → ไม่เตือน', async () => {
    const pending = await insertBooking(120, 'PENDING_PAYMENT'); // เวลาไม่ซ้อนกับ "started" (exclusion constraint ห้ามจองซ้อนในสนามเดียวกัน)
    const checkedIn = await insertBooking(300, 'CHECKED_IN');
    const started = await insertBooking(-5);
    const cancelled = await insertBooking(600);
    await pool.query(`UPDATE bookings SET status = 'CANCELLED', cancelled_at = NOW() WHERE booking_id = $1`, [cancelled]);

    await jobs.sendDueReminders();
    for (const id of [pending, checkedIn, started, cancelled]) expect((await notes(id)).length).toBe(0);
  });
});

describe('อีเมลผ่านคิว (outbox)', () => {
  it('ส่งอีเมลล้ม → แจ้งเตือนในแอปยังอยู่, คงสถานะรอส่ง นับครั้งที่ลอง และรอบถัดไปส่งสำเร็จ', async () => {
    const id = await insertBooking(23 * 60);
    await jobs.sendDueReminders();

    __failNextEmails(1);
    const r1 = await jobs.dispatchPendingEmails();
    expect(r1.failed).toBeGreaterThanOrEqual(1);
    let n = (await notes(id))[0];
    expect(n.email_pending).toBe(true);
    expect(n.email_attempts).toBe(1);
    expect(mailsTo().length).toBe(0);

    const r2 = await jobs.dispatchPendingEmails();
    expect(r2.sent).toBeGreaterThanOrEqual(1);
    n = (await notes(id))[0];
    expect(n.email_pending).toBe(false);
    expect(mailsTo().length).toBe(1);
  });

  it('ล้มครบ 3 ครั้งแล้วเลิกลอง (ไม่วนซ้ำไม่รู้จบ)', async () => {
    const id = await insertBooking(23 * 60);
    await jobs.sendDueReminders();
    __failNextEmails(100);
    for (let i = 0; i < 4; i++) await jobs.dispatchPendingEmails();
    const n = (await notes(id))[0];
    expect(n.email_pending).toBe(false);
    expect(n.email_attempts).toBe(3);
    expect(mailsTo().length).toBe(0);
  });

  it('เนื้อหาอีเมล escape HTML (กันแทรกสคริปต์ผ่านชื่อ/ข้อความ)', async () => {
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, email_pending) VALUES ($1, '<b>x</b>', '<script>alert(1)</script>', 'INFO', TRUE)`,
      [userId]
    );
    await jobs.dispatchPendingEmails();
    const mail = mailsTo()[0];
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('ไม่มาใช้บริการ (NO_SHOW) → มีแจ้งเตือนในแอป + อีเมลแจ้งว่าปล่อยสนามและไม่คืนเงิน', async () => {
    const id = await insertBooking(-20);
    await new BookingService().runMaintenance();
    expect((await notes(id)).some((n: any) => n.title.includes('No-show'))).toBe(true);
    await jobs.dispatchPendingEmails();
    expect(mailsTo().some((m) => m.subject.includes('No-show') && m.text.includes('ไม่คืนเงิน'))).toBe(true);
  });
});

describe('endpoint ตัวตั้งเวลาภายนอก /api/internal/cron/tick', () => {
  it('ไม่มี/ผิด secret → 401', async () => {
    expect((await request(app).post('/api/internal/cron/tick')).status).toBe(401);
    expect((await request(app).post('/api/internal/cron/tick').set('x-cron-secret', 'wrong')).status).toBe(401);
  });

  it('secret ถูกต้อง → รันงานทั้งหมดแล้วคืนสรุปผล (ไม่ต้องล็อกอิน)', async () => {
    const id = await insertBooking(23 * 60);
    const res = await request(app).post('/api/internal/cron/tick').set('x-cron-secret', process.env.CRON_SECRET!);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.objectContaining({ expired: expect.any(Number), noShow: expect.any(Number), remindersFirst: expect.any(Number), emailsSent: expect.any(Number), errors: [] })
    );
    expect((await notes(id)).length).toBe(1);
    expect(mailsTo().length).toBe(1);
  });

  it('GET ไม่ได้ (รับเฉพาะ POST)', async () => {
    const res = await request(app).get('/api/internal/cron/tick').set('x-cron-secret', process.env.CRON_SECRET!);
    expect(res.status).toBe(404);
  });
});
