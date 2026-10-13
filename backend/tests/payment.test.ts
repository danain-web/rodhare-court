import request from 'supertest';
import { app, pool, registerAndGetCookie, deleteTestUsers } from './helpers';

// =====================================================================
// Core Flow #2: ส่งสลิปชำระเงิน (multipart/form-data) + In-App Notification
// จุดที่ต้องการพิสูจน์:
//   1) Endpoint ชำระเงินต้อง Login ก่อน (ไม่มี Cookie → 401)
//   2) Backend ตรวจข้อมูลฟอร์มก่อนแตะ DB / Storage (bookingId, amount, paymentMethod, ไฟล์สลิป)
//   3) Multer ปฏิเสธไฟล์ที่ไม่ใช่รูปภาพ (กันอัปโหลดไฟล์อันตราย)
//   4) จ่ายเงินให้การจองของคนอื่น / การจองที่ไม่มีอยู่จริงไม่ได้
//   5) ดึงรายการแจ้งเตือนของตัวเองได้ (In-App Notification)
// หมายเหตุ: เทสต์นี้ไม่อัปโหลดไฟล์ขึ้น Supabase Storage จริง (กันขยะใน bucket)
// =====================================================================

// PNG ขนาด 1x1 pixel (magic bytes ถูกต้อง) — เล็กกว่า 1 KB จึงถูก Backend ปฏิเสธว่าเป็นไฟล์เสีย
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
// PNG เดิมเติม padding ให้เกิน 1 KB → ผ่านการตรวจขนาด/magic bytes ใช้เป็นสลิปทดสอบที่ "ถูกต้อง"
const VALID_PNG = Buffer.concat([TINY_PNG, Buffer.alloc(2048)]);

const createdUsernames: string[] = [];
let cookies: string[] = [];

beforeAll(async () => {
  const result = await registerAndGetCookie('jest_pay');
  createdUsernames.push(result.user.username);
  cookies = result.cookies;
});

afterAll(async () => {
  await deleteTestUsers(createdUsernames);
  await pool.end();
});

describe('Payment Flow (Upload Slip via multipart/form-data)', () => {
  it('POST /api/payments ไม่มี Cookie → 401', async () => {
    const res = await request(app)
      .post('/api/payments')
      .field('bookingId', '1')
      .field('amount', '100')
      .field('paymentMethod', 'PROMPTPAY')
      .attach('slip', VALID_PNG, { filename: 'slip.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });

  it('POST /api/payments ไม่แนบสลิป → 400', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Cookie', cookies)
      .field('bookingId', '1')
      .field('amount', '100')
      .field('paymentMethod', 'PROMPTPAY');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/สลิป/);
  });

  it('POST /api/payments paymentMethod ไม่ถูกต้อง → 400', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Cookie', cookies)
      .field('bookingId', '1')
      .field('amount', '100')
      .field('paymentMethod', 'BITCOIN')
      .attach('slip', VALID_PNG, { filename: 'slip.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/paymentMethod/);
  });

  it('POST /api/payments แนบไฟล์ที่ไม่ใช่รูปภาพ → 400 (Multer fileFilter)', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Cookie', cookies)
      .field('bookingId', '1')
      .field('amount', '100')
      .field('paymentMethod', 'PROMPTPAY')
      .attach('slip', Buffer.from('#!/bin/sh\necho hacked'), { filename: 'evil.sh', contentType: 'application/x-sh' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/JPG, PNG, WEBP/);
  });

  it('POST /api/payments ไฟล์รูปเล็กผิดปกติ (< 1 KB) → 400', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Cookie', cookies)
      .field('bookingId', '1')
      .field('amount', '100')
      .field('paymentMethod', 'PROMPTPAY')
      .attach('slip', TINY_PNG, { filename: 'slip.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/เล็กเกินไป/);
  });

  it('POST /api/payments ปลอม Content-Type เป็น image/png แต่เนื้อไฟล์ไม่ใช่รูป → 400 (ตรวจ magic bytes)', async () => {
    const fake = Buffer.concat([Buffer.from('<script>alert(1)</script>'), Buffer.alloc(2048, 0x20)]);
    const res = await request(app)
      .post('/api/payments')
      .set('Cookie', cookies)
      .field('bookingId', '1')
      .field('amount', '100')
      .field('paymentMethod', 'PROMPTPAY')
      .attach('slip', fake, { filename: 'slip.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  it('POST /api/payments กับการจองที่ไม่มีอยู่/ไม่ใช่ของตัวเอง → 4xx (ไม่สร้าง payment)', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Cookie', cookies)
      .field('bookingId', '999999999')
      .field('amount', '100')
      .field('paymentMethod', 'PROMPTPAY')
      .attach('slip', VALID_PNG, { filename: 'slip.png', contentType: 'image/png' });
    expect([403, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/notifications/my → 200 ได้ array การแจ้งเตือนของตัวเอง', async () => {
    const res = await request(app).get('/api/notifications/my').set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/notifications/my ไม่มี Cookie → 401', async () => {
    const res = await request(app).get('/api/notifications/my');
    expect(res.status).toBe(401);
  });
});
