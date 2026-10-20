import request from 'supertest';
import { app, pool, registerAndGetCookie, deleteTestUsers, futureDate, VALID_PNG, CLEAR_SLIP_PNG } from './helpers';
import { config } from '../src/config/env';

// =====================================================================
// โหมดสาธิต (PAYMENT_DEMO_MODE) — สำหรับนำเสนอด้วยสลิป demo
//   - ไม่ต้องกรอกเลขอ้างอิง
//   - สลิปยอดตรง → อนุมัติอัตโนมัติ ออกใบเสร็จทันที (ภาพไม่ชัดก็ผ่าน)
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
    const res = await sendSlip(bookingId, finalAmount, CLEAR_SLIP_PNG);
    expect(res.status).toBe(201);
    expect(res.body.data.result).toBe('VERIFIED');
    expect(res.body.data.receipt.receiptNumber).toBeTruthy();

    const booking = await pool.query('SELECT status FROM bookings WHERE booking_id = $1', [bookingId]);
    expect(booking.rows[0].status).toBe('CONFIRMED');
    const pay = await pool.query('SELECT status, verification_method, slip_reference FROM payments WHERE booking_id = $1', [bookingId]);
    expect(pay.rows[0]).toMatchObject({ status: 'VERIFIED', verification_method: 'AUTO', slip_reference: null });
    const receipts = await pool.query('SELECT total_amount FROM receipts WHERE booking_id = $1', [bookingId]);
    expect(Number(receipts.rows[0].total_amount)).toBe(finalAmount);
  });

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

  // อ่านค่า config.paymentDemoMode ใน process ใหม่ด้วย env ที่กำหนด (config อ่าน env ตอน import)
  const demoModeWith = (overrides: Record<string, string>): string => {
    const script = `require('./src/config/env').config.paymentDemoMode`;
    const out = require('child_process').execFileSync(process.execPath, ['--import', 'tsx', '-p', script], {
      cwd: require('path').resolve(__dirname, '..'),
      env: { ...process.env, ...overrides },
      encoding: 'utf8',
    });
    return out.trim();
  };

  it('ไม่ได้ตั้ง PAYMENT_DEMO_MODE นอก production → โหมดสาธิตเปิดเป็นค่าเริ่มต้น', () => {
    expect(demoModeWith({ PAYMENT_DEMO_MODE: '' })).toBe('true');
  });

  // ตั้งค่าที่ production ต้องมี เพื่อให้ validateConfig ผ่าน แล้วดูเฉพาะผลของ PAYMENT_DEMO_MODE
  const productionEnv = {
    NODE_ENV: 'production',
    DATABASE_SSL: 'true',
    FRONTEND_URL: 'https://example.com',
    SUPABASE_URL: 'https://storage.test.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-used',
  };

  it('production ไม่ได้ตั้ง PAYMENT_DEMO_MODE → ปิด (fail-closed)', () => {
    expect(demoModeWith({ ...productionEnv, PAYMENT_DEMO_MODE: '' })).toBe('false');
  });

  it('production ตั้ง PAYMENT_DEMO_MODE=true อย่างชัดเจน → เปิด', () => {
    expect(demoModeWith({ ...productionEnv, PAYMENT_DEMO_MODE: 'true' })).toBe('true');
  });

  it('ยอดไม่ตรง → ปฏิเสธ แม้อยู่ในโหมดสาธิต', async () => {
    const { bookingId, finalAmount } = await book(futureDate(17), '16:00', '17:00');
    const res = await sendSlip(bookingId, finalAmount + 10, CLEAR_SLIP_PNG);
    expect(res.body.data.result).toBe('REJECTED');
  });

  it('ปิดโหมดสาธิต → สลิปเดียวกันต้องรอพนักงานตรวจ', async () => {
    config.paymentDemoMode = false;
    try {
      const { bookingId, finalAmount } = await book(futureDate(17), '18:00', '19:00');
      const res = await sendSlip(bookingId, finalAmount, CLEAR_SLIP_PNG);
      expect(res.body.data.result).toBe('MANUAL_REVIEW');
    } finally {
      config.paymentDemoMode = true;
    }
  });
});
