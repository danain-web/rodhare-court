import request from 'supertest';
import { app, pool, registerAndGetCookie, deleteTestUsers, loginAs } from './helpers';
import { BookingService } from '../src/services/booking.service';

// =====================================================================
// Check-in + จองแล้วไม่มา (NO_SHOW)
// - เช็กอินได้ก่อนเริ่ม N นาที ถึงหลังเริ่ม X นาที (ค่าอยู่ใน app_settings)
// - เลยเวลา → NO_SHOW, ปล่อยสนามคืน, ไม่คืนเงินทุกกรณี
// ใช้การเขียนฐานข้อมูลตรงเพื่อจัดเวลาให้ "ใกล้ตอนนี้" แล้วตรวจผลผ่าน API จริง
// =====================================================================

const createdUsernames: string[] = [];
let customerCookies: string[] = [];
let otherCookies: string[] = [];
let staffCookies: string[] = [];
let adminCookies: string[] = [];
let userId = 0;
let courtId = 0;
const createdBookingIds: number[] = [];
let seq = 0;

// สร้างการจองสถานะ CONFIRMED ที่เริ่มในอีก offsetMin นาที (ลบ = เริ่มไปแล้ว) ยาว 60 นาที ตามเวลาไทย
const insertBooking = async (offsetMin: number, status = 'CONFIRMED') => {
  const t = await pool.query(
    `SELECT to_char(d, 'YYYY-MM-DD') AS date, to_char(d, 'HH24:MI') AS start,
            to_char(d + interval '60 minutes', 'YYYY-MM-DD') AS end_date, to_char(d + interval '60 minutes', 'HH24:MI') AS "end"
       FROM (SELECT date_trunc('minute', NOW() AT TIME ZONE 'Asia/Bangkok') + ($1::int * interval '1 minute') AS d) x`,
    [offsetMin]
  );
  const r = t.rows[0];
  const endTime = r.end_date === r.date ? r.end : '24:00';
  const res = await pool.query(
    `INSERT INTO bookings (booking_number, user_id, court_id, booking_date, start_time, end_time,
                           total_court_fee, final_amount, status, hold_expires_at, checked_in_at)
     VALUES ($1, $2, $3, $4, $5, $6, 300, 300, $7::varchar, NOW(), CASE WHEN $7::varchar = 'CHECKED_IN' THEN NOW() END)
     RETURNING booking_id, booking_number`,
    [`CKT${Date.now()}${++seq}`, userId, courtId, r.date, r.start, endTime, status]
  );
  createdBookingIds.push(res.rows[0].booking_id);
  return { id: res.rows[0].booking_id as number, number: res.rows[0].booking_number as string };
};

const status = async (id: number) => (await pool.query('SELECT status FROM bookings WHERE booking_id = $1', [id])).rows[0].status as string;
const checkIn = (id: number, cookies = customerCookies) => request(app).post(`/api/bookings/${id}/check-in`).set('Cookie', cookies);
const setSetting = (key: string, value: number) => request(app).put(`/api/admin/settings/${key}`).set('Cookie', adminCookies).send({ value });

beforeAll(async () => {
  const a = await registerAndGetCookie('jest_ck');
  const b = await registerAndGetCookie('jest_ck2');
  createdUsernames.push(a.user.username, b.user.username);
  customerCookies = a.cookies;
  otherCookies = b.cookies;
  userId = a.userId;
  staffCookies = await loginAs('staff1');
  adminCookies = await loginAs('admin1');
  courtId = (await pool.query(`SELECT court_id FROM courts WHERE code = 'BAS-01'`)).rows[0].court_id;
});

afterEach(async () => {
  // ปล่อยสนามที่ยังครองอยู่ เพื่อไม่ให้ชนกับเคสถัดไป (exclusion constraint)
  if (createdBookingIds.length) {
    await pool.query(
      `UPDATE bookings SET status = 'CANCELLED', cancelled_at = NOW(), checked_in_at = COALESCE(checked_in_at, NULL)
        WHERE booking_id = ANY($1::int[]) AND status IN ('PENDING_PAYMENT','PAYMENT_VERIFIED','CONFIRMED','CHECKED_IN')`,
      [createdBookingIds]
    );
  }
});

afterAll(async () => {
  // คืนค่าตั้งค่าเดิมเสมอ
  await pool.query(`UPDATE app_settings SET setting_value = '15' WHERE setting_key IN ('checkin.early_minutes', 'checkin.late_minutes')`);
  await deleteTestUsers(createdUsernames);
  await pool.end();
});

describe('Check-in window', () => {
  it('เช็กอินก่อนเริ่ม 10 นาที (อยู่ในช่วง 15 นาที) → สำเร็จ CHECKED_IN', async () => {
    const b = await insertBooking(10);
    const res = await checkIn(b.id);
    expect(res.status).toBe(200);
    expect(await status(b.id)).toBe('CHECKED_IN');
  });

  it('เช็กอินก่อนเริ่ม 40 นาที (เร็วเกินไป) → 400 และสถานะไม่เปลี่ยน', async () => {
    const b = await insertBooking(40);
    const res = await checkIn(b.id);
    expect(res.status).toBe(400);
    expect(await status(b.id)).toBe('CONFIRMED');
  });

  it('เริ่มไปแล้ว 10 นาที (ยังอยู่ในช่วง 15 นาทีหลังเริ่ม) → เช็กอินได้', async () => {
    const b = await insertBooking(-10);
    const res = await checkIn(b.id);
    expect(res.status).toBe(200);
    expect(await status(b.id)).toBe('CHECKED_IN');
  });

  it('คนอื่นเช็กอินแทนไม่ได้ → 403', async () => {
    const b = await insertBooking(5);
    const res = await checkIn(b.id, otherCookies);
    expect(res.status).toBe(403);
    expect(await status(b.id)).toBe('CONFIRMED');
  });

  it('พนักงาน (booking.checkin) เช็กอินแทนลูกค้าด้วยเลขที่การจองได้', async () => {
    const b = await insertBooking(5);
    const res = await request(app).post('/api/staff/check-in').set('Cookie', staffCookies).send({ bookingNumber: b.number });
    expect(res.status).toBe(200);
    expect(await status(b.id)).toBe('CHECKED_IN');
  });
});

describe('NO_SHOW: ไม่เช็กอินภายในเวลา', () => {
  it('เลยเวลาเช็กอิน (เริ่มไปแล้ว 20 นาที) → เช็กอินไม่ได้ และระบบเปลี่ยนเป็น NO_SHOW ทันที พร้อมแจ้งเตือน', async () => {
    const b = await insertBooking(-20);
    const res = await checkIn(b.id);
    expect(res.status).toBe(400);
    expect(await status(b.id)).toBe('NO_SHOW');

    const row = (await pool.query('SELECT no_show_at FROM bookings WHERE booking_id = $1', [b.id])).rows[0];
    expect(row.no_show_at).not.toBeNull();
    const notes = await pool.query(`SELECT title FROM notifications WHERE booking_id = $1`, [b.id]);
    expect(notes.rows.map((n: any) => n.title)).toContain('ไม่มาใช้บริการ (No-show)');
    const history = await pool.query(`SELECT status FROM booking_status_history WHERE booking_id = $1 AND status = 'NO_SHOW'`, [b.id]);
    expect(history.rows.length).toBe(1);
  });

  it('NO_SHOW ปล่อยสนามคืน → จองช่วงเวลาเดียวกันซ้ำได้', async () => {
    const b = await insertBooking(-20);
    await checkIn(b.id);
    expect(await status(b.id)).toBe('NO_SHOW');
    // ไม่ชนกับ exclusion constraint เพราะ NO_SHOW ไม่ครองสนาม
    const again = await insertBooking(-20);
    expect(await status(again.id)).toBe('CONFIRMED');
  });

  it('งานเบื้องหลัง (runMaintenance) เปลี่ยนเฉพาะรายการที่เลยเวลา ไม่แตะรายการที่เช็กอินแล้วหรือยังไม่ถึงเวลา', async () => {
    const late = await insertBooking(-25);
    const upcoming = await insertBooking(120);
    const result = await new BookingService().runMaintenance();
    expect(result.noShow).toBeGreaterThanOrEqual(1);
    expect(await status(late.id)).toBe('NO_SHOW');
    expect(await status(upcoming.id)).toBe('CONFIRMED');
  });

  it('จองที่เช็กอินแล้วไม่ถูกเปลี่ยนเป็น NO_SHOW แม้เลยเวลาช่วงเช็กอิน', async () => {
    const b = await insertBooking(-25, 'CHECKED_IN');
    await new BookingService().runMaintenance();
    expect(await status(b.id)).toBe('CHECKED_IN');
  });

  it('ไม่คืนเงินทุกกรณี: ยกเลิก/ขอคืนเงินการจองที่เป็น NO_SHOW → 400 และไม่เกิดคำขอคืนเงิน', async () => {
    const b = await insertBooking(-20);
    await checkIn(b.id); // ทำให้เป็น NO_SHOW
    const viaRefund = await request(app).post(`/api/bookings/${b.id}/cancel-refund`).set('Cookie', customerCookies).send({ reason: 'x' });
    expect(viaRefund.status).toBe(400);
    const viaCancel = await request(app).post(`/api/bookings/${b.id}/cancel`).set('Cookie', customerCookies).send({ reason: 'x' });
    expect(viaCancel.status).toBe(400);
    const refunds = await pool.query('SELECT 1 FROM refund_requests WHERE booking_id = $1', [b.id]);
    expect(refunds.rows.length).toBe(0);
    expect(await status(b.id)).toBe('NO_SHOW');
  });
});

describe('ตั้งค่าช่วงเวลาเช็กอินโดยผู้ดูแล', () => {
  it('ลูกค้าและพนักงานแก้ค่าตั้งค่าไม่ได้ → 403', async () => {
    expect((await request(app).put('/api/admin/settings/checkin.late_minutes').set('Cookie', customerCookies).send({ value: 5 })).status).toBe(403);
    expect((await request(app).get('/api/admin/settings').set('Cookie', staffCookies)).status).toBe(403);
  });

  it('ค่านอกช่วง/ไม่ใช่จำนวนเต็ม/คีย์ไม่รู้จัก → 400/404', async () => {
    expect((await setSetting('checkin.late_minutes', -1)).status).toBe(400);
    expect((await setSetting('checkin.late_minutes', 1.5)).status).toBe(400);
    expect((await setSetting('checkin.late_minutes', 9999)).status).toBe(400);
    expect((await setSetting('no.such.key', 5)).status).toBe(404);
  });

  it('เพิ่มเวลาหลังเริ่มเป็น 30 นาที → เริ่มไปแล้ว 20 นาทียังเช็กอินได้ และบันทึก Audit Log', async () => {
    const set = await setSetting('checkin.late_minutes', 30);
    expect(set.status).toBe(200);
    expect(set.body.data.value).toBe(30);

    const list = await request(app).get('/api/admin/settings').set('Cookie', adminCookies);
    expect(list.body.data.find((s: any) => s.key === 'checkin.late_minutes').value).toBe(30);

    const b = await insertBooking(-20);
    expect((await checkIn(b.id)).status).toBe(200);
    expect(await status(b.id)).toBe('CHECKED_IN');

    const audit = await pool.query(`SELECT 1 FROM audit_logs WHERE action = 'UPDATE_SETTING' AND new_values->>'key' = 'checkin.late_minutes'`);
    expect(audit.rows.length).toBeGreaterThan(0);

    await setSetting('checkin.late_minutes', 15);
  });
});
