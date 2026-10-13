import request from 'supertest';
import { app, pool, registerAndGetCookie, deleteTestUsers, uniqueSlipRef, TINY_PNG, VALID_PNG } from './helpers';

// =====================================================================
// Payment: ตรวจข้อมูลฟอร์มส่งสลิป (multipart/form-data) ก่อนแตะฐานข้อมูล/Storage
//   1) ต้อง Login
//   2) ไฟล์: ต้องแนบ · เป็นรูปจริง (magic bytes) · ขนาดสมเหตุสมผล
//   3) ฟอร์ม: จำนวนเงินรูปแบบเงินบาทเท่านั้น · เลขอ้างอิงจริง · ไม่รับ field แปลกปลอม (mass assignment)
//   4) การจองที่ไม่มีอยู่ → 404
// =====================================================================

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

// ฟอร์มที่ถูกต้องทุกช่อง แล้วค่อยเปลี่ยนทีละช่องในแต่ละเทสต์
const submit = (fields: Record<string, string>, file: { buf: Buffer; type: string; name?: string } | null = { buf: VALID_PNG, type: 'image/png' }, auth = true) => {
  let req = request(app).post('/api/payments');
  if (auth) req = req.set('Cookie', cookies);
  const base = { bookingId: '999999999', amount: '100', paymentMethod: 'PROMPTPAY', slipReference: uniqueSlipRef(), ...fields };
  for (const [k, v] of Object.entries(base)) req = req.field(k, v);
  if (file) req = req.attach('slip', file.buf, { filename: file.name ?? 'slip.png', contentType: file.type });
  return req;
};

describe('Payment form validation', () => {
  it('ไม่มี Cookie → 401', async () => {
    const res = await submit({}, undefined, false);
    expect(res.status).toBe(401);
  });

  it('ไม่แนบไฟล์สลิป → 400', async () => {
    const res = await submit({}, null);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/สลิป/);
  });

  it('paymentMethod ไม่ถูกต้อง → 400', async () => {
    const res = await submit({ paymentMethod: 'BITCOIN' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/paymentMethod/);
  });

  it('ไฟล์ที่ไม่ใช่รูปภาพ → 400 (Multer fileFilter)', async () => {
    const res = await submit({}, { buf: Buffer.from('#!/bin/sh\necho hacked'), type: 'application/x-sh', name: 'evil.sh' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/JPG, PNG, WEBP/);
  });

  it('ไฟล์รูปเล็กผิดปกติ (< 1 KB) → 400', async () => {
    const res = await submit({}, { buf: TINY_PNG, type: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/เล็กเกินไป/);
  });

  it('ปลอม Content-Type เป็น image/png แต่เนื้อไฟล์ไม่ใช่รูป → 400 (ตรวจ magic bytes)', async () => {
    const fake = Buffer.concat([Buffer.from('<script>alert(1)</script>'), Buffer.alloc(2048, 0x20)]);
    const res = await submit({}, { buf: fake, type: 'image/png' });
    expect(res.status).toBe(400);
  });

  it.each(['Infinity', 'NaN', '12abc', '-5', '0', '1e3', '10.999', '', ' '])('จำนวนเงิน "%s" → 400', async (amount) => {
    const res = await submit({ amount });
    expect(res.status).toBe(400);
  });

  // เลขอ้างอิงไม่บังคับแล้ว แต่ถ้าส่งมาต้องถูกรูปแบบ
  it.each(['ABC', 'REF-<script>', 'X'.repeat(31)])('เลขอ้างอิง "%s" ไม่ถูกต้อง → 400', async (slipReference) => {
    const res = await submit({ slipReference });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/อ้างอิง/);
  });

  it('ส่ง field แปลกปลอม (status=VERIFIED) → 400 ไม่ยอมรับ (mass assignment)', async () => {
    const res = await submit({ status: 'VERIFIED' });
    expect(res.status).toBe(400);
  });

  it('ส่งลิงก์รูปแทนไฟล์ (slipUrl) → 400 ไม่รองรับแล้ว', async () => {
    const res = await submit({ slipUrl: 'https://evil.example/track.png' }, null);
    expect(res.status).toBe(400);
  });

  it('การจองที่ไม่มีอยู่ → 404 (ไม่สร้าง payment)', async () => {
    const res = await submit({});
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('Notifications', () => {
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
