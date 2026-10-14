import request from 'supertest';
import { app, pool, registerAndGetCookie, deleteTestUsers, loginAs, uniqueSlipRef, futureDate, VALID_PNG } from './helpers';
import { BookingService } from '../src/services/booking.service';

// =====================================================================
// Concurrency — ยิงคำขอพร้อมกันจริงบนฐานข้อมูลทดสอบ แล้วตรวจ "สถานะสุดท้ายในฐานข้อมูล"
//   1) 20 คนจองสนามเดียวกันช่วงเดียวกันพร้อมกัน → สำเร็จได้ 1 เท่านั้น
//   2) ช่วงเวลาติดกันพอดีจองได้ / ทับกัน 1 นาทีจองไม่ได้
//   3) ส่งสลิปซ้ำพร้อมกันหลายครั้ง → มี payment รอตรวจได้ 1 รายการ
//   4) พนักงาน 2 คนอนุมัติสลิปเดียวกันพร้อมกัน → อนุมัติ 1 ครั้ง ใบเสร็จ 1 ใบ
//   5) งานหมดเวลา (BR3) ทำงานระหว่างรอตรวจสลิป → ไม่ยกเลิกการจองที่มีสลิปรอตรวจ
// =====================================================================

const createdUsernames: string[] = [];
const users: string[][] = [];
let staffA: string[] = [];
let staffB: string[] = [];
let courtId = 0;

const ACTIVE = `('PENDING_PAYMENT','PAYMENT_VERIFIED','CONFIRMED','CHECKED_IN')`;
const countActive = async (date: string, start: string, end: string) =>
  Number((await pool.query(
    `SELECT COUNT(*) AS n FROM bookings WHERE court_id = $1 AND booking_date = $2::DATE AND status IN ${ACTIVE} AND start_time < $4 AND end_time > $3`,
    [courtId, date, start, end]
  )).rows[0].n);

const book = (c: string[], date: string, startTime: string, endTime: string) =>
  request(app).post('/api/bookings').set('Cookie', c).send({ courtId, bookingDate: date, startTime, endTime });

const sendSlip = (c: string[], bookingId: number, amount: number) =>
  request(app)
    .post('/api/payments')
    .set('Cookie', c)
    .field('bookingId', String(bookingId))
    .field('amount', amount.toFixed(2))
    .field('paymentMethod', 'PROMPTPAY')
    .field('slipReference', uniqueSlipRef('C'))
    .attach('slip', VALID_PNG, { filename: 'slip.png', contentType: 'image/png' });

beforeAll(async () => {
  for (let i = 0; i < 20; i++) {
    const u = await registerAndGetCookie(`jest_cc${i}`);
    createdUsernames.push(u.user.username);
    users.push(u.cookies);
  }
  staffA = await loginAs('staff1');
  staffB = await loginAs('admin1');
  courtId = (await pool.query(`SELECT court_id FROM courts WHERE code = 'BAD-01'`)).rows[0].court_id;
}, 60_000);

afterAll(async () => {
  await deleteTestUsers(createdUsernames);
  await pool.end();
});

describe('Concurrency & idempotency', () => {
  it('20 คนจองช่วงเวลาเดียวกันพร้อมกัน → สำเร็จ 1 ที่เหลือ 409', async () => {
    const date = futureDate(10);
    const results = await Promise.all(users.map((c) => book(c, date, '18:00', '19:00')));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);
    expect(await countActive(date, '18:00', '19:00')).toBe(1);
  });

  it('ช่วงเวลาติดกันพอดีจองได้ · ทับกันแม้ 1 นาทีจองไม่ได้', async () => {
    const date = futureDate(11);
    expect((await book(users[0], date, '10:00', '11:00')).status).toBe(201);
    expect((await book(users[1], date, '11:00', '12:00')).status).toBe(201); // ติดกันพอดี
    expect((await book(users[2], date, '09:00', '10:00')).status).toBe(201); // ติดกันพอดี
    expect((await book(users[3], date, '10:59', '11:30')).status).toBe(409); // ทับ 1 นาที
    expect((await book(users[4], date, '09:30', '10:01')).status).toBe(409); // ทับ 1 นาที
    expect(await countActive(date, '09:00', '12:00')).toBe(3);
  });

  it('ฐานข้อมูลปฏิเสธการจองซ้อนเอง แม้แก้ข้อมูลโดยไม่ผ่านโค้ด (ex_bk_no_overlap)', async () => {
    const date = futureDate(11);
    // ลองขยายการจอง 11:00–12:00 ให้ทับ 10:00–11:00 ตรง ๆ ด้วย SQL
    await expect(
      pool.query(
        `UPDATE bookings SET start_time = '10:30' WHERE court_id = $1 AND booking_date = $2::DATE AND start_time = '11:00'`,
        [courtId, date]
      )
    ).rejects.toMatchObject({ code: '23P01' });
  });

  it('ส่งสลิปซ้ำพร้อมกัน 5 ครั้ง → มีสลิปรอตรวจได้ 1 รายการ', async () => {
    const date = futureDate(12);
    const created = await book(users[5], date, '14:00', '15:00');
    expect(created.status).toBe(201);
    const { bookingId, finalAmount } = created.body.data;

    const results = await Promise.all(Array.from({ length: 5 }, () => sendSlip(users[5], bookingId, Number(finalAmount))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const pending = await pool.query(`SELECT COUNT(*) AS n FROM payments WHERE booking_id = $1 AND status = 'PENDING'`, [bookingId]);
    expect(Number(pending.rows[0].n)).toBe(1);
  });

  it('พนักงาน 2 คนอนุมัติสลิปเดียวกันพร้อมกัน → อนุมัติ 1 ครั้ง ใบเสร็จ 1 ใบ', async () => {
    const date = futureDate(13);
    const created = await book(users[6], date, '15:00', '16:00');
    const { bookingId, finalAmount } = created.body.data;
    const slip = await sendSlip(users[6], bookingId, Number(finalAmount));
    const paymentId = slip.body.data.payment.paymentId;

    const [a, b] = await Promise.all([
      request(app).post(`/api/staff/payments/${paymentId}/verify`).set('Cookie', staffA).send({}),
      request(app).post(`/api/staff/payments/${paymentId}/verify`).set('Cookie', staffB).send({}),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const receipts = await pool.query('SELECT COUNT(*) AS n FROM receipts WHERE booking_id = $1', [bookingId]);
    expect(Number(receipts.rows[0].n)).toBe(1);
    const booking = await pool.query('SELECT status FROM bookings WHERE booking_id = $1', [bookingId]);
    expect(booking.rows[0].status).toBe('CONFIRMED');
  });

  it('งานหมดเวลาชำระทำงานระหว่างรอตรวจสลิป → ไม่ยกเลิกการจอง และอนุมัติต่อได้', async () => {
    const date = futureDate(14);
    const created = await book(users[7], date, '16:00', '17:00');
    const { bookingId, finalAmount } = created.body.data;
    const slip = await sendSlip(users[7], bookingId, Number(finalAmount));
    const paymentId = slip.body.data.payment.paymentId;

    // จำลองว่าเลย 15 นาทีแล้วระหว่างพนักงานยังไม่ตรวจ
    await pool.query(`UPDATE bookings SET hold_expires_at = NOW() - INTERVAL '1 minute' WHERE booking_id = $1`, [bookingId]);
    const [maintenance, verify] = await Promise.all([
      new BookingService().runMaintenance(),
      request(app).post(`/api/staff/payments/${paymentId}/verify`).set('Cookie', staffA).send({}),
    ]);
    expect(maintenance).toBeDefined();
    expect(verify.status).toBe(200);
    const booking = await pool.query('SELECT status FROM bookings WHERE booking_id = $1', [bookingId]);
    expect(booking.rows[0].status).toBe('CONFIRMED');
  });

  it('การจองที่หมดเวลาโดยไม่มีสลิป → EXPIRED และช่วงเวลากลับมาว่าง', async () => {
    const date = futureDate(15);
    const created = await book(users[8], date, '12:00', '13:00');
    const { bookingId } = created.body.data;
    await pool.query(`UPDATE bookings SET hold_expires_at = NOW() - INTERVAL '1 minute' WHERE booking_id = $1`, [bookingId]);

    await new BookingService().runMaintenance();
    const booking = await pool.query('SELECT status FROM bookings WHERE booking_id = $1', [bookingId]);
    expect(booking.rows[0].status).toBe('EXPIRED');
    expect((await book(users[9], date, '12:00', '13:00')).status).toBe(201);
  });
});
