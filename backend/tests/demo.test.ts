<<<<<<< HEAD
﻿import request from 'supertest';
import { app, pool, registerAndGetCookie, deleteTestUsers, futureDate, uniqueSlipRef, VALID_PNG, CLEAR_SLIP_PNG, slipText, slipImage } from './helpers';
=======
import request from 'supertest';
import { app, pool, registerAndGetCookie, deleteTestUsers, futureDate, VALID_PNG, CLEAR_SLIP_PNG } from './helpers';
>>>>>>> 7911668a7e5d511f83e82c3f30e2b56c2428aac6
import { config } from '../src/config/env';

// =====================================================================
// โหมดสาธิต (PAYMENT_DEMO_MODE) — สำหรับนำเสนอด้วยสลิป demo
//   - ไม่ต้องกรอกเลขอ้างอิง
//   - สลิปยอดตรง + ภาพชัด → อนุมัติอัตโนมัติ ออกใบเสร็จทันที
//   - สลิปภาพไม่ชัด (เช่นไฟล์ _unclear) → ยังเข้าคิวพนักงานตรวจ
//   - ยอดไม่ตรง → ปฏิเสธ
//   - หน้าชำระเงินได้ข้อมูล demo: true (แสดง QR จำลอง)
// =====================================================================

const createdUsernames: string[] = [];
let cookies: string[] = [];
let courtId = 0;
const originalDemo = config.paymentDemoMode;

const book = async (date: string, start: string, end: string) => {
  const res = await request(app).post('/api/bookings').set('Cookie', cookies).send({ courtId, bookingDate: date, startTime: start, endTime: end });
  expect(res.status).toBe(201);
  return { bookingId: res.body.data.bookingId as number, finalAmount: Number(res.body.data.finalAmount) };
};

// ส่งสลิปแบบที่หน้าเว็บส่งจริง: ไม่มี slipReference
const sendSlip = (bookingId: number, amount: number, file: Buffer) =>
  request(app)
    .post('/api/payments')
    .set('Cookie', cookies)
    .field('bookingId', String(bookingId))
    .field('amount', amount.toFixed(2))
    .field('paymentMethod', 'PROMPTPAY')
    .attach('slip', file, { filename: 'slip.png', contentType: 'image/png' });

beforeAll(async () => {
  config.paymentDemoMode = true;
  const u = await registerAndGetCookie('jest_demo');
  createdUsernames.push(u.user.username);
  cookies = u.cookies;
  courtId = (await pool.query(`SELECT court_id FROM courts WHERE code = 'TEN-01'`)).rows[0].court_id;
});

afterAll(async () => {
  config.paymentDemoMode = originalDemo;
  await deleteTestUsers(createdUsernames);
  await pool.end();
});

describe('Payment demo mode', () => {
  it('ข้อมูลหน้าชำระเงินบอกว่าเป็นโหมดสาธิต (แสดง QR จำลอง)', async () => {
    const { bookingId } = await book(futureDate(17), '08:00', '09:00');
    const res = await request(app).get(`/api/payments/instructions/${bookingId}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.data.demo).toBe(true);
  });

  it('สลิปยอดตรง + ภาพชัด ไม่กรอกเลขอ้างอิง → อนุมัติอัตโนมัติ + ใบเสร็จ', async () => {
    const { bookingId, finalAmount } = await book(futureDate(17), '10:00', '11:00');
<<<<<<< HEAD
    const res = await sendSlip(bookingId, finalAmount, slipImage(CLEAR_SLIP_PNG, slipText(finalAmount)));
=======
    const res = await sendSlip(bookingId, finalAmount, CLEAR_SLIP_PNG);
>>>>>>> 7911668a7e5d511f83e82c3f30e2b56c2428aac6
    expect(res.status).toBe(201);
    expect(res.body.data.result).toBe('VERIFIED');
    expect(res.body.data.receipt.receiptNumber).toBeTruthy();

    const booking = await pool.query('SELECT status FROM bookings WHERE booking_id = $1', [bookingId]);
    expect(booking.rows[0].status).toBe('CONFIRMED');
    const pay = await pool.query('SELECT status, verification_method, slip_reference FROM payments WHERE booking_id = $1', [bookingId]);
<<<<<<< HEAD
    expect(pay.rows[0]).toMatchObject({ status: 'VERIFIED', verification_method: 'AUTO' });
    expect(pay.rows[0].slip_reference).toBeTruthy(); // เลขอ้างอิงที่อ่านจากรูป ใช้ตรวจสลิปซ้ำ
=======
    expect(pay.rows[0]).toMatchObject({ status: 'VERIFIED', verification_method: 'AUTO', slip_reference: null });
>>>>>>> 7911668a7e5d511f83e82c3f30e2b56c2428aac6
    const receipts = await pool.query('SELECT total_amount FROM receipts WHERE booking_id = $1', [bookingId]);
    expect(Number(receipts.rows[0].total_amount)).toBe(finalAmount);
  });

<<<<<<< HEAD
  it('ใช้สลิปใบเดิม (เลขที่รายการเดียวกัน) กับการจองอื่น → ปฏิเสธว่าสลิปซ้ำ', async () => {
    const ref = uniqueSlipRef('DUP');
    const first = await book(futureDate(17), '12:00', '13:00');
    expect((await sendSlip(first.bookingId, first.finalAmount, slipImage(CLEAR_SLIP_PNG, slipText(first.finalAmount, ref)))).body.data.result).toBe('VERIFIED');
    const second = await book(futureDate(17), '13:00', '14:00');
    const res = await sendSlip(second.bookingId, second.finalAmount, slipImage(CLEAR_SLIP_PNG, slipText(second.finalAmount, ref)));
    expect(res.body.data.result).toBe('REJECTED');
    expect(res.body.data.message).toContain('สลิปซ้ำ');
  });

  it('สลิปภาพไม่ชัด → เข้าคิวพนักงาน (ไม่อนุมัติเอง)', async () => {
    const { bookingId, finalAmount } = await book(futureDate(17), '14:00', '15:00');
    const res = await sendSlip(bookingId, finalAmount, slipImage(VALID_PNG, slipText(finalAmount))); // ไฟล์เล็ก/ความละเอียดต่ำ
    expect(res.body.data.result).toBe('MANUAL_REVIEW');
    const booking = await pool.query('SELECT status FROM bookings WHERE booking_id = $1', [bookingId]);
    expect(booking.rows[0].status).toBe('PENDING_PAYMENT');
=======
  it('ใช้สลิป demo ไฟล์เดิมซ้ำกับการจองอื่นได้ (ไม่มีเลขอ้างอิงให้ถือว่าซ้ำ)', async () => {
    const { bookingId, finalAmount } = await book(futureDate(17), '12:00', '13:00');
    const res = await sendSlip(bookingId, finalAmount, CLEAR_SLIP_PNG);
    expect(res.body.data.result).toBe('VERIFIED');
  });

  it('สลิปภาพไม่ชัด → ยังอนุมัติอัตโนมัติ (โหมดสาธิตไม่ต้องรอพนักงาน)', async () => {
    const { bookingId, finalAmount } = await book(futureDate(17), '14:00', '15:00');
    const res = await sendSlip(bookingId, finalAmount, VALID_PNG); // ไฟล์เล็ก/ความละเอียดต่ำ
    expect(res.body.data.result).toBe('VERIFIED');
    const readable = res.body.data.checks.find((c: any) => c.code === 'READABLE');
    expect(readable.passed).toBe(false); // ยังแสดงผลตรวจความชัดเป็นข้อมูลประกอบ
    const booking = await pool.query('SELECT status FROM bookings WHERE booking_id = $1', [bookingId]);
    expect(booking.rows[0].status).toBe('CONFIRMED');
  });

  it('ไม่ได้ตั้ง PAYMENT_DEMO_MODE → โหมดสาธิตเปิดเป็นค่าเริ่มต้น', () => {
    const script = `require('./src/config/env').config.paymentDemoMode`;
    const out = require('child_process').execFileSync(process.execPath, ['--import', 'tsx', '-p', script], {
      cwd: require('path').resolve(__dirname, '..'),
      env: { ...process.env, PAYMENT_DEMO_MODE: '' },
      encoding: 'utf8',
    });
    expect(out.trim()).toBe('true');
>>>>>>> 7911668a7e5d511f83e82c3f30e2b56c2428aac6
  });

  it('ยอดไม่ตรง → ปฏิเสธ แม้อยู่ในโหมดสาธิต', async () => {
    const { bookingId, finalAmount } = await book(futureDate(17), '16:00', '17:00');
<<<<<<< HEAD
    const res = await sendSlip(bookingId, finalAmount + 10, slipImage(CLEAR_SLIP_PNG, slipText(finalAmount + 10)));
    expect(res.body.data.result).toBe('REJECTED');
  });

  it('กรอกยอดตรง แต่ยอดในรูปสลิปไม่ตรง → ปฏิเสธ', async () => {
    const { bookingId, finalAmount } = await book(futureDate(17), '19:00', '20:00');
    const res = await sendSlip(bookingId, finalAmount, slipImage(CLEAR_SLIP_PNG, slipText(finalAmount - 50)));
    expect(res.body.data.result).toBe('REJECTED');
    const booking = await pool.query('SELECT status FROM bookings WHERE booking_id = $1', [bookingId]);
    expect(booking.rows[0].status).toBe('PENDING_PAYMENT');
  });

  it('รูปที่ไม่ใช่สลิปโอนเงิน → 400 ไม่สร้างรายการชำระเงิน', async () => {
    const { bookingId, finalAmount } = await book(futureDate(17), '20:00', '21:00');
    const res = await sendSlip(bookingId, finalAmount, slipImage(CLEAR_SLIP_PNG, 'รูปแมวน่ารัก'));
    expect(res.status).toBe(400);
    const pay = await pool.query('SELECT 1 FROM payments WHERE booking_id = $1', [bookingId]);
    expect(pay.rowCount).toBe(0);
  });

  it('ข้อความคล้ายสลิปแต่ไม่มียอดเงิน → 400', async () => {
    const { bookingId, finalAmount } = await book(futureDate(17), '21:00', '22:00');
    const res = await sendSlip(bookingId, finalAmount, slipImage(CLEAR_SLIP_PNG, 'โอนเงินสำเร็จ จำนวนเงิน บาท ธนาคาร 25 บาท'));
    expect(res.status).toBe(400); // ไม่มียอดรูปแบบเงิน → ไม่ถือเป็นสลิป
  });

=======
    const res = await sendSlip(bookingId, finalAmount + 10, CLEAR_SLIP_PNG);
    expect(res.body.data.result).toBe('REJECTED');
  });

>>>>>>> 7911668a7e5d511f83e82c3f30e2b56c2428aac6
  it('ปิดโหมดสาธิต → สลิปเดียวกันต้องรอพนักงานตรวจ', async () => {
    config.paymentDemoMode = false;
    try {
      const { bookingId, finalAmount } = await book(futureDate(17), '18:00', '19:00');
<<<<<<< HEAD
      const res = await sendSlip(bookingId, finalAmount, slipImage(CLEAR_SLIP_PNG, slipText(finalAmount)));
=======
      const res = await sendSlip(bookingId, finalAmount, CLEAR_SLIP_PNG);
>>>>>>> 7911668a7e5d511f83e82c3f30e2b56c2428aac6
      expect(res.body.data.result).toBe('MANUAL_REVIEW');
    } finally {
      config.paymentDemoMode = true;
    }
  });
});
<<<<<<< HEAD



=======
>>>>>>> 7911668a7e5d511f83e82c3f30e2b56c2428aac6
