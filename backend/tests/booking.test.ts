import request from 'supertest';
import { app, pool, registerAndGetCookie, deleteTestUsers, getSetCookies } from './helpers';

// =====================================================================
// Core Flow #3: จองสนาม → จองซ้อน (BR2) → ยกเลิก
// เทสต์นี้รัน SQL ที่ใช้ row lock (SELECT ... FOR UPDATE) ใน Transaction จริง
// → กัน regression แบบ syntax Oracle หลงเหลือ เช่น "FOR UPDATE OF u.is_active"
// ใช้วันที่ล่วงหน้า 20 วัน ช่วง 21:00-22:00 สนาม BAD-02 ลดโอกาสชนกับการจองจริง และลบทิ้งหลังจบ
// =====================================================================

const createdUsernames: string[] = [];
let cookies: string[] = [];
let otherCookies: string[] = [];
let courtId = 0;
let bookingId = 0;
let finalAmount = 0;
let paymentId = 0;

const bookingDate = (() => {
  const d = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
})();

beforeAll(async () => {
  const a = await registerAndGetCookie('jest_book');
  const b = await registerAndGetCookie('jest_book2');
  createdUsernames.push(a.user.username, b.user.username);
  cookies = a.cookies;
  otherCookies = b.cookies;

  const court = await pool.query(`SELECT court_id FROM courts WHERE code = 'BAD-02'`);
  courtId = court.rows[0].court_id;
});

afterAll(async () => {
  await deleteTestUsers(createdUsernames);
  await pool.end();
});

describe('Booking Flow (Create → Overlap → Pay → Staff Verify → Cancel)', () => {
  const slot = () => ({ courtId, bookingDate, startTime: '21:00', endTime: '22:00' });

  it('POST /api/bookings ไม่มี Cookie → 401', async () => {
    const res = await request(app).post('/api/bookings').send(slot());
    expect(res.status).toBe(401);
  });

  it('POST /api/bookings → 201 สถานะ PENDING_PAYMENT', async () => {
    const res = await request(app).post('/api/bookings').set('Cookie', cookies).send(slot());
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const booking = res.body.data.booking ?? res.body.data;
    bookingId = booking.bookingId;
    finalAmount = Number(booking.finalAmount);
    expect(bookingId).toBeGreaterThan(0);
    expect(finalAmount).toBeGreaterThan(0);
    expect(booking.status).toBe('PENDING_PAYMENT');
  });

  it('POST /api/bookings ผู้ใช้อื่นจองช่วงเวลาเดียวกัน → 409 (BR2 ห้ามจองซ้อน)', async () => {
    const res = await request(app).post('/api/bookings').set('Cookie', otherCookies).send(slot());
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  // ---------- ส่งสลิป (ใช้ slipUrl แทนไฟล์ → ไม่อัปโหลดขึ้น Supabase Storage) ----------
  // ครอบคลุม INSERT payments (status REJECTED / PENDING) และ UPDATE payments (VERIFIED)
  // กัน regression "inconsistent types deduced for parameter" / "could not determine data type"

  it('POST /api/payments ยอดเงินไม่ตรง → 201 ผล REJECTED (BR6)', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Cookie', cookies)
      .field('bookingId', String(bookingId))
      .field('amount', String(finalAmount + 1))
      .field('paymentMethod', 'PROMPTPAY')
      .field('slipUrl', 'https://example.com/slip-wrong.png')
      .field('slipReference', `JESTW${Date.now()}`);
    expect(res.status).toBe(201);
    expect(res.body.data.result).toBe('REJECTED');
  });

  it('POST /api/payments ยอดตรงแต่ไม่มีไฟล์ภาพ → 201 ผล MANUAL_REVIEW (รอพนักงาน)', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Cookie', cookies)
      .field('bookingId', String(bookingId))
      .field('amount', String(finalAmount))
      .field('paymentMethod', 'PROMPTPAY')
      .field('slipUrl', 'https://example.com/slip-ok.png')
      .field('slipReference', `JESTOK${Date.now()}`);
    expect(res.status).toBe(201);
    expect(res.body.data.result).toBe('MANUAL_REVIEW');
    paymentId = res.body.data.payment.paymentId;
    expect(paymentId).toBeGreaterThan(0);
  });

  it('POST /api/staff/payments/:id/verify (staff1) → 200 การจองยืนยันแล้ว', async () => {
    const login = await request(app).post('/api/auth/login').send({ identifier: 'staff1', password: 'Password123!' });
    expect(login.status).toBe(200);
    const staffCookies = getSetCookies(login);

    const res = await request(app).post(`/api/staff/payments/${paymentId}/verify`).set('Cookie', staffCookies).send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const detail = await request(app).get(`/api/bookings/${bookingId}`).set('Cookie', cookies);
    expect(detail.status).toBe(200);
    expect(['CONFIRMED', 'PAYMENT_VERIFIED']).toContain((detail.body.data.booking ?? detail.body.data).status);

    await request(app).post('/api/auth/logout').set('Cookie', staffCookies);
  });

  it('POST /api/bookings/:id/cancel → 200 ยกเลิกได้', async () => {
    const res = await request(app).post(`/api/bookings/${bookingId}/cancel`).set('Cookie', cookies).send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
