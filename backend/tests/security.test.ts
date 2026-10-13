import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { app, pool, registerAndGetCookie, deleteTestUsers, loginAs, futureDate, uniqueSlipRef, VALID_PNG } from './helpers';
import { createUserRateLimiter } from '../src/middleware/security.middleware';
import { validateConfig, config } from '../src/config/env';

// =====================================================================
// API Security
//   - CSRF: คำขอเปลี่ยนข้อมูลจากโดเมนอื่นถูกปฏิเสธ
//   - JWT: token ปลอม / หมดอายุ / algorithm none / issuer ผิด ถูกปฏิเสธ
//   - Object-level authorization: เปลี่ยน ID ดูข้อมูลของคนอื่นไม่ได้
//   - Role: ลูกค้าเรียก API ของพนักงาน/แอดมินไม่ได้
//   - Rate limit / body size / env validation
// =====================================================================

const createdUsernames: string[] = [];
let ownerCookies: string[] = [];
let otherCookies: string[] = [];
let bookingId = 0;

beforeAll(async () => {
  const owner = await registerAndGetCookie('jest_sec_owner');
  const other = await registerAndGetCookie('jest_sec_other');
  createdUsernames.push(owner.user.username, other.user.username);
  ownerCookies = owner.cookies;
  otherCookies = other.cookies;

  const courtId = (await pool.query(`SELECT court_id FROM courts WHERE code = 'BAS-01'`)).rows[0].court_id;
  const res = await request(app).post('/api/bookings').set('Cookie', ownerCookies)
    .send({ courtId, bookingDate: futureDate(16), startTime: '19:00', endTime: '20:00' });
  bookingId = res.body.data.bookingId;
});

afterAll(async () => {
  await deleteTestUsers(createdUsernames);
  await pool.end();
});

const tokenFromCookies = (cookies: string[]) => cookies.find((c) => c.startsWith('auth_token='))!.split(';')[0].slice('auth_token='.length);

describe('CSRF (Origin check)', () => {
  it('POST จากโดเมนอื่น → 403', async () => {
    const res = await request(app).post('/api/auth/logout').set('Cookie', ownerCookies).set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });

  it('POST ที่ Referer มาจากโดเมนอื่น (ไม่มี Origin) → 403', async () => {
    const res = await request(app).post(`/api/bookings/${bookingId}/cancel`).set('Cookie', ownerCookies).set('Referer', 'https://evil.example/page');
    expect(res.status).toBe(403);
  });

  it('POST จากโดเมน Frontend ที่อนุญาต → ผ่านการตรวจ (ไม่ใช่ 403)', async () => {
    const res = await request(app).post('/api/auth/login').set('Origin', 'http://localhost:3000').send({ identifier: 'x', password: 'y' });
    expect(res.status).not.toBe(403);
  });

  it('Cookie ตั้งเป็น HttpOnly + SameSite=Lax', async () => {
    const auth = ownerCookies.find((c) => c.startsWith('auth_token='))!;
    expect(auth).toMatch(/HttpOnly/i);
    expect(auth).toMatch(/SameSite=Lax/i);
  });
});

describe('JWT tampering', () => {
  const callMe = (token: string) => request(app).get('/api/auth/me').set('Cookie', [`auth_token=${token}`]);

  it('แก้ payload (เปลี่ยน roles เป็น ADMIN) โดยไม่มี secret → 401', async () => {
    const [h, p, s] = tokenFromCookies(ownerCookies).split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    payload.roles = ['ADMIN'];
    const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;
    expect((await callMe(forged)).status).toBe(401);
  });

  it('algorithm "none" → 401', async () => {
    const payload = jwt.decode(tokenFromCookies(ownerCookies)) as Record<string, unknown>;
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`;
    expect((await callMe(none)).status).toBe(401);
  });

  it('token หมดอายุ → 401', async () => {
    const payload = jwt.decode(tokenFromCookies(ownerCookies)) as Record<string, unknown>;
    const { exp: _e, iat: _i, iss: _s, aud: _a, ...rest } = payload;
    const expired = jwt.sign({ ...rest, iat: Math.floor(Date.now() / 1000) - 7200 }, config.jwtSecret, {
      algorithm: 'HS256', expiresIn: '1h', issuer: 'rodhare-court-api', audience: 'rodhare-court-web',
    });
    expect((await callMe(expired)).status).toBe(401);
  });

  it('issuer/audience ไม่ตรง (token จากระบบอื่นที่ใช้ secret เดียวกัน) → 401', async () => {
    const payload = jwt.decode(tokenFromCookies(ownerCookies)) as Record<string, unknown>;
    const { exp: _e, iat: _i, iss: _s, aud: _a, ...rest } = payload;
    const foreign = jwt.sign(rest, config.jwtSecret, { algorithm: 'HS256', expiresIn: '1h', issuer: 'other-app' });
    expect((await callMe(foreign)).status).toBe(401);
  });
});

describe('Object-level authorization (IDOR)', () => {
  it('ดูรายละเอียดการจองของคนอื่น → 403/404', async () => {
    const res = await request(app).get(`/api/bookings/${bookingId}`).set('Cookie', otherCookies);
    expect([403, 404]).toContain(res.status);
  });

  it('ดูประวัติการชำระเงินของการจองคนอื่น → 403', async () => {
    const res = await request(app).get(`/api/bookings/${bookingId}/payments`).set('Cookie', otherCookies);
    expect(res.status).toBe(403);
  });

  it('ดูใบเสร็จของการจองคนอื่น → 403/404', async () => {
    const res = await request(app).get(`/api/receipts/booking/${bookingId}`).set('Cookie', otherCookies);
    expect([403, 404]).toContain(res.status);
  });

  it('ดูตัวอย่างเงินคืนของการจองคนอื่น → 403/404', async () => {
    const res = await request(app).get(`/api/bookings/${bookingId}/cancel-preview`).set('Cookie', otherCookies);
    expect([403, 404]).toContain(res.status);
  });

  it('เจ้าของดูการจองของตนเองได้ → 200', async () => {
    const res = await request(app).get(`/api/bookings/${bookingId}`).set('Cookie', ownerCookies);
    expect(res.status).toBe(200);
  });
});

describe('Role-based access', () => {
  it.each([
    ['get', '/api/staff/payments/pending'],
    ['get', '/api/staff/refunds/pending'],
    ['get', '/api/admin/audit-logs'],
    ['get', '/api/reports/summary'],
    ['post', '/api/staff/payments/1/verify'],
    ['post', '/api/staff/payments/1/reject'],
  ])('ลูกค้าเรียก %s %s → 403', async (method, path) => {
    const res = await (request(app) as any)[method](path).set('Cookie', ownerCookies).send({ reason: 'xxx' });
    expect(res.status).toBe(403);
  });

  it('พนักงานเรียก API ของแอดมิน → 403', async () => {
    const staff = await loginAs('staff1');
    const res = await request(app).get('/api/admin/audit-logs').set('Cookie', staff);
    expect(res.status).toBe(403);
  });
});

describe('Request limits', () => {
  it('JSON ใหญ่เกิน 100kb → 413', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'x'.repeat(200_000), password: 'y' });
    expect(res.status).toBe(413);
  });

  it('rate limiter ต่อผู้ใช้: เกินเพดาน → 429', async () => {
    const mini = express();
    mini.use((req, _res, next) => { (req as any).user = { userId: 42 }; next(); });
    mini.post('/x', createUserRateLimiter({ max: 3, message: 'too many' }), (_req, res) => { res.json({ ok: true }); });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await request(mini).post('/x')).status);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });
});

describe('Database hardening (migrations)', () => {
  it('ทุกตารางใน public เปิด Row Level Security', async () => {
    const res = await pool.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`
    );
    expect(res.rows).toEqual([]);
  });

  it('role ที่ไม่ใช่เจ้าของตาราง อ่าน users ไม่ได้เมื่อไม่มี policy', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_probe') THEN CREATE ROLE rls_probe NOLOGIN; END IF; END $$`);
      await client.query('GRANT USAGE ON SCHEMA public TO rls_probe; GRANT SELECT ON users TO rls_probe');
      await client.query('SET LOCAL ROLE rls_probe');
      const rows = await client.query('SELECT COUNT(*)::int AS n FROM users');
      expect(rows.rows[0].n).toBe(0); // RLS ซ่อนทุกแถว
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('ข้อมูลการชำระเงินที่ VERIFIED ต้องมีเจ้าหน้าที่ยืนยัน (chk_pay_verified_by_staff)', async () => {
    const amount = (await pool.query('SELECT final_amount FROM bookings WHERE booking_id = $1', [bookingId])).rows[0].final_amount;
    const slip = await request(app).post('/api/payments').set('Cookie', ownerCookies)
      .field('bookingId', String(bookingId)).field('amount', Number(amount).toFixed(2))
      .field('paymentMethod', 'PROMPTPAY').field('slipReference', uniqueSlipRef('S'))
      .attach('slip', VALID_PNG, { filename: 'slip.png', contentType: 'image/png' });
    expect(slip.status).toBe(201);
    const paymentId = slip.body.data.payment.paymentId;

    // พยายาม "อนุมัติอัตโนมัติ" ด้วย SQL ตรง ๆ (ไม่มี verified_by) → ฐานข้อมูลปฏิเสธ
    await expect(
      pool.query(`UPDATE payments SET status = 'VERIFIED', verification_method = 'AUTO', verified_at = NOW() WHERE payment_id = $1`, [paymentId])
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('Error responses', () => {
  it('500 ไม่เปิดเผยข้อความภายใน/stack แต่มี requestId ให้อ้างอิง log', async () => {
    const res = await request(app).get('/api/health/test-error?type=500');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง');
    expect(res.body.stack).toBeUndefined();
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('4xx ยังส่งเหตุผลที่ผู้ใช้แก้ไขได้', async () => {
    const res = await request(app).get('/api/health/test-error?type=409');
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/409/);
  });
});

describe('Environment validation (fail fast)', () => {
  const good = { ...config, nodeEnv: 'production', isProduction: true, databaseSsl: true, frontendUrls: ['https://app.example.com'], cookieSameSite: 'lax' as const, supabase: { ...config.supabase, url: 'https://x.supabase.co', serviceRoleKey: 'k' } };

  it('ค่าที่ถูกต้องผ่าน', () => {
    expect(validateConfig(good)).toEqual([]);
  });

  it.each([
    ['JWT_SECRET สั้น', { jwtSecret: 'short' }],
    ['JWT_SECRET เป็นค่าตัวอย่าง', { jwtSecret: 'change_me_to_a_long_random_string_at_least_32_chars' }],
    ['ไม่มี DATABASE_URL', { databaseUrl: '' }],
    ['production ไม่มี Supabase key', { supabase: { ...good.supabase, serviceRoleKey: '' } }],
    ['production ใช้ http', { frontendUrls: ['http://app.example.com'] }],
    ['production ปิด SSL ฐานข้อมูล', { databaseSsl: false }],
    ['SameSite=none ใน production', { cookieSameSite: 'none' as const }],
  ])('%s → มี error', (_label, override) => {
    expect(validateConfig({ ...good, ...override } as typeof config).length).toBeGreaterThan(0);
  });
});
