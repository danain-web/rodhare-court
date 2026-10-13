import request from 'supertest';
import { app, pool, registerAndGetCookie, deleteTestUsers, loginAs, uniqueSlipRef, futureDate, VALID_PNG } from './helpers';

// =====================================================================
// Core Flow: จอง → จองซ้อน → ส่งสลิป → พนักงานอนุมัติ → ยกเลิก
// ตรวจผลจาก "สถานะในฐานข้อมูลจริง" ไม่ใช่แค่ HTTP response
// กฎสำคัญ: การส่งสลิปไม่ทำให้ชำระเงินสำเร็จเอง — ต้องให้พนักงานอนุมัติเท่านั้น
// =====================================================================

const createdUsernames: string[] = [];
let cookies: string[] = [];
let otherCookies: string[] = [];
let staffCookies: string[] = [];
let courtId = 0;
let bookingId = 0;
let finalAmount = 0;
let paymentId = 0;
const bookingDate = futureDate(20);

const sendSlip = (c: string[], amount: number, slipReference = uniqueSlipRef()) =>
  request(app)
    .post('/api/payments')
    .set('Cookie', c)
    .field('bookingId', String(bookingId))
    .field('amount', amount.toFixed(2))
    .field('paymentMethod', 'PROMPTPAY')
    .field('slipReference', slipReference)
    .attach('slip', VALID_PNG, { filename: 'slip.png', contentType: 'image/png' });

const dbBooking = async () => (await pool.query('SELECT status FROM bookings WHERE booking_id = $1', [bookingId])).rows[0];
const dbPayments = async () =>
  (await pool.query('SELECT payment_id, status, verification_method, verified_by FROM payments WHERE booking_id = $1 ORDER BY payment_id', [bookingId])).rows;
const dbReceipts = async () => (await pool.query('SELECT receipt_id, total_amount FROM receipts WHERE booking_id = $1', [bookingId])).rows;

beforeAll(async () => {
  const a = await registerAndGetCookie('jest_book');
  const b = await registerAndGetCookie('jest_book2');
  createdUsernames.push(a.user.username, b.user.username);
  cookies = a.cookies;
  otherCookies = b.cookies;
  staffCookies = await loginAs('staff1');
  courtId = (await pool.query(`SELECT court_id FROM courts WHERE code = 'BAD-02'`)).rows[0].court_id;
});

afterAll(async () => {
  await deleteTestUsers(createdUsernames);
  await pool.end();
});

describe('Booking + Payment lifecycle', () => {
  const slot = () => ({ courtId, bookingDate, startTime: '21:00', endTime: '22:00' });

  it('สร้างการจองไม่มี Cookie → 401', async () => {
    const res = await request(app).post('/api/bookings').send(slot());
    expect(res.status).toBe(401);
  });

  it('สร้างการจอง → 201 PENDING_PAYMENT และราคาคำนวณจาก backend', async () => {
    const res = await request(app).post('/api/bookings').set('Cookie', cookies).send({ ...slot(), finalAmount: 1 });
    expect(res.status).toBe(201);
    const booking = res.body.data.booking ?? res.body.data;
    bookingId = booking.bookingId;
    finalAmount = Number(booking.finalAmount);
    expect(booking.status).toBe('PENDING_PAYMENT');
    expect(finalAmount).toBe(150); // BAD-02 ชม.ละ 150 — ค่า finalAmount ที่ client แอบส่งมาถูกละเลย
  });

  it('ผู้ใช้อื่นจองช่วงเวลาเดียวกัน → 409 (ห้ามจองซ้อน)', async () => {
    const res = await request(app).post('/api/bookings').set('Cookie', otherCookies).send(slot());
    expect(res.status).toBe(409);
  });

  it('ข้อมูลโอนเงิน: ยอดจากฐานข้อมูล + PromptPay payload ล็อกยอดเดียวกัน · ผู้อื่นดูไม่ได้', async () => {
    const own = await request(app).get(`/api/payments/instructions/${bookingId}`).set('Cookie', cookies);
    expect(own.status).toBe(200);
    expect(own.body.data.amount).toBe(finalAmount);
    expect(own.body.data.configured).toBe(true);
    expect(own.body.data.promptPay.payload).toContain(`54${String(finalAmount.toFixed(2).length).padStart(2, '0')}${finalAmount.toFixed(2)}`);
    expect(own.body.data.promptPay.maskedId).toBe('xxxxxx5678');

    const other = await request(app).get(`/api/payments/instructions/${bookingId}`).set('Cookie', otherCookies);
    expect(other.status).toBe(403);
  });

  it('ผู้ใช้อื่นส่งสลิปให้การจองนี้ไม่ได้ → 403', async () => {
    const res = await sendSlip(otherCookies, finalAmount);
    expect(res.status).toBe(403);
    expect(await dbPayments()).toHaveLength(0);
  });

  it('สลิปยอดไม่ตรง → REJECTED ทันที, การจองยังรอชำระ', async () => {
    const res = await sendSlip(cookies, finalAmount + 1);
    expect(res.status).toBe(201);
    expect(res.body.data.result).toBe('REJECTED');
    expect((await dbBooking()).status).toBe('PENDING_PAYMENT');
  });

  it('สลิปยอดตรง → รอพนักงานตรวจ (ไม่อนุมัติอัตโนมัติ ไม่ออกใบเสร็จ)', async () => {
    const res = await sendSlip(cookies, finalAmount);
    expect(res.status).toBe(201);
    expect(res.body.data.result).toBe('MANUAL_REVIEW');
    paymentId = res.body.data.payment.paymentId;

    expect((await dbBooking()).status).toBe('PENDING_PAYMENT');
    const pending = (await dbPayments()).find((p) => p.payment_id === paymentId);
    expect(pending.status).toBe('PENDING');
    expect(pending.verified_by).toBeNull();
    expect(await dbReceipts()).toHaveLength(0);
  });

  it('ส่งสลิปซ้ำระหว่างรอตรวจ → 409 ไม่สร้าง payment เพิ่ม', async () => {
    const before = (await dbPayments()).length;
    const res = await sendSlip(cookies, finalAmount);
    expect(res.status).toBe(409);
    expect(await dbPayments()).toHaveLength(before);
  });

  it('เจ้าของเห็นสลิปของตนผ่าน Signed URL เท่านั้น / ผู้อื่นดูไม่ได้', async () => {
    const own = await request(app).get(`/api/bookings/${bookingId}/payments`).set('Cookie', cookies);
    expect(own.status).toBe(200);
    const slipUrls = own.body.data.map((p: any) => p.slipUrl).filter(Boolean);
    expect(slipUrls.length).toBeGreaterThan(0);
    for (const url of slipUrls) expect(url).toMatch(/^https:\/\/signed\.test\/slips\//);

    const other = await request(app).get(`/api/bookings/${bookingId}/payments`).set('Cookie', otherCookies);
    expect(other.status).toBe(403);
  });

  it('ลูกค้าเรียก API อนุมัติสลิปเองไม่ได้ → 403', async () => {
    const res = await request(app).post(`/api/staff/payments/${paymentId}/verify`).set('Cookie', cookies).send({});
    expect(res.status).toBe(403);
    expect((await dbBooking()).status).toBe('PENDING_PAYMENT');
  });

  it('พนักงานอนุมัติ → CONFIRMED + ใบเสร็จ 1 ใบ ยอดตามที่ backend คำนวณ', async () => {
    const res = await request(app).post(`/api/staff/payments/${paymentId}/verify`).set('Cookie', staffCookies).send({});
    expect(res.status).toBe(200);

    expect((await dbBooking()).status).toBe('CONFIRMED');
    const verified = (await dbPayments()).find((p) => p.payment_id === paymentId);
    expect(verified.status).toBe('VERIFIED');
    expect(verified.verification_method).toBe('MANUAL');
    expect(verified.verified_by).not.toBeNull();
    const receipts = await dbReceipts();
    expect(receipts).toHaveLength(1);
    expect(Number(receipts[0].total_amount)).toBe(finalAmount);
  });

  it('อนุมัติซ้ำ → 409 ไม่ออกใบเสร็จซ้ำ', async () => {
    const res = await request(app).post(`/api/staff/payments/${paymentId}/verify`).set('Cookie', staffCookies).send({});
    expect(res.status).toBe(409);
    expect(await dbReceipts()).toHaveLength(1);
  });

  it('ลูกค้าคนอื่นยกเลิกการจองนี้ไม่ได้ → 403/404', async () => {
    const res = await request(app).post(`/api/bookings/${bookingId}/cancel`).set('Cookie', otherCookies).send({});
    expect([403, 404]).toContain(res.status);
    expect((await dbBooking()).status).toBe('CONFIRMED');
  });

  it('เจ้าของยกเลิก → 200 สถานะ CANCELLED', async () => {
    const res = await request(app).post(`/api/bookings/${bookingId}/cancel`).set('Cookie', cookies).send({});
    expect(res.status).toBe(200);
    expect((await dbBooking()).status).toBe('CANCELLED');
  });
});
