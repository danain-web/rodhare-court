import request from 'supertest';
import { app, pool, registerAndGetCookie, deleteTestUsers } from './helpers';

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

describe('Booking Flow (Create → Overlap → Cancel)', () => {
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
    expect(bookingId).toBeGreaterThan(0);
    expect(booking.status).toBe('PENDING_PAYMENT');
  });

  it('POST /api/bookings ผู้ใช้อื่นจองช่วงเวลาเดียวกัน → 409 (BR2 ห้ามจองซ้อน)', async () => {
    const res = await request(app).post('/api/bookings').set('Cookie', otherCookies).send(slot());
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/bookings/:id/cancel → 200 ยกเลิกได้', async () => {
    const res = await request(app).post(`/api/bookings/${bookingId}/cancel`).set('Cookie', cookies).send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
