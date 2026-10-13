import request from 'supertest';
import { app, pool, makeTestUser, getSetCookies, deleteTestUsers } from './helpers';

// =====================================================================
// Core Flow #1: สมัครสมาชิก → ล็อกอิน → เรียก API ที่ต้อง Login → ออกจากระบบ
// ทดสอบผ่าน HTTP จริง (Supertest) + ฐานข้อมูลจริง (Supabase PostgreSQL)
// จุดที่ต้องการพิสูจน์:
//   1) JWT ถูกส่งกลับใน httpOnly Cookie (ไม่อยู่ใน response body → ป้องกัน XSS)
//   2) Cookie ใช้เรียก /auth/me ได้, ไม่มี Cookie → 401
//   3) Logout แล้ว token เดิมใช้ไม่ได้อีก (session ถูก revoke ใน DB)
//   4) รหัสผ่านผิด → 401 และไม่มี Cookie
// =====================================================================

const createdUsernames: string[] = [];

afterAll(async () => {
  await deleteTestUsers(createdUsernames);
  await pool.end();
});

describe('Auth Flow (Register → Login → Me → Logout)', () => {
  const user = makeTestUser('jest_auth');
  let cookies: string[] = [];

  it('POST /api/auth/register → 201 และตั้ง httpOnly Cookie', async () => {
    const res = await request(app).post('/api/auth/register').send(user);
    createdUsernames.push(user.username);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.username).toBe(user.username);
    expect(res.body.data.user.roles).toContain('CUSTOMER');
    // ต้องไม่มี token และ passwordHash หลุดออกมาใน body
    expect(res.body.data.token).toBeUndefined();
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const authCookie = getSetCookies(res).find((c) => c.startsWith('auth_token='));
    expect(authCookie).toBeDefined();
    expect(authCookie).toMatch(/HttpOnly/i);
  });

  it('POST /api/auth/register ซ้ำ → 409 (username ถูกใช้แล้ว)', async () => {
    const res = await request(app).post('/api/auth/register').send(user);
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/register ข้อมูลไม่ครบ → 400 (Zod validation)', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'ab', email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('POST /api/auth/login รหัสผ่านผิด → 401 และไม่ตั้ง Cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.username, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(getSetCookies(res).some((c) => c.startsWith('auth_token='))).toBe(false);
  });

  it('POST /api/auth/login ถูกต้อง → 200 และได้ Cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.email, password: user.password });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.token).toBeUndefined();

    cookies = getSetCookies(res);
    expect(cookies.some((c) => c.startsWith('auth_token='))).toBe(true);
  });

  it('GET /api/auth/me ไม่มี Cookie → 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me พร้อม Cookie → 200 ได้ข้อมูลตัวเอง', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe(user.username);
  });

  it('POST /api/auth/logout → 200 และล้าง Cookie', async () => {
    const res = await request(app).post('/api/auth/logout').set('Cookie', cookies);
    expect(res.status).toBe(200);
    const cleared = getSetCookies(res).find((c) => c.startsWith('auth_token='));
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });

  it('GET /api/auth/me ด้วย Cookie เดิมหลัง Logout → 401 (session ถูก revoke)', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', cookies);
    expect(res.status).toBe(401);
  });
});
