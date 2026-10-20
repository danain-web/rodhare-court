import request from 'supertest';
import { app, pool, makeTestUser, getSetCookies, deleteTestUsers, registerAndGetCookie } from './helpers';
import { testOutbox } from '../src/utils/email';

// =====================================================================
// ลืมรหัสผ่าน / รีเซ็ตรหัสผ่านทางอีเมล / เปลี่ยนรหัสผ่านตอนล็อกอินอยู่
// จุดที่ต้องพิสูจน์:
//   1) ตอบเหมือนกันไม่ว่าอีเมลมีบัญชีหรือไม่ (ไม่เปิดเผยว่าใครเป็นสมาชิก)
//   2) โทเคนใช้ได้ครั้งเดียว มีอายุ และเก็บในฐานข้อมูลเป็น hash เท่านั้น
//   3) รีเซ็ต/เปลี่ยนรหัสผ่านแล้ว session เก่าใช้ไม่ได้
// =====================================================================

const createdUsernames: string[] = [];
const NEW_PASSWORD = 'Brand-new-pass-1';

afterAll(async () => {
  await deleteTestUsers(createdUsernames);
  await pool.end();
});

const tokenFromMail = (email: string): string | undefined => {
  const mail = [...testOutbox].reverse().find((m) => m.to === email);
  return mail?.text.match(/reset-password\?token=([a-f0-9]{64})/)?.[1];
};

const login = (identifier: string, password: string) => request(app).post('/api/auth/login').send({ identifier, password });

describe('Forgot / reset password', () => {
  const user = makeTestUser('jest_reset');
  let oldCookies: string[] = [];

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/register').send(user);
    expect(res.status).toBe(201);
    createdUsernames.push(user.username);
    oldCookies = getSetCookies(res);
    testOutbox.length = 0;
  });

  it('อีเมลที่ไม่มีบัญชี → 200 ข้อความเดียวกัน และไม่ส่งอีเมล', async () => {
    const known = await request(app).post('/api/auth/forgot-password').send({ email: user.email });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody-here@test.local' });
    expect(unknown.status).toBe(200);
    expect(unknown.body.message).toBe(known.body.message);
    expect(testOutbox.some((m) => m.to === 'nobody-here@test.local')).toBe(false);
  });

  it('รูปแบบอีเมลผิด → 400', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('ส่งลิงก์ให้เจ้าของบัญชี และฐานข้อมูลเก็บเฉพาะ hash ของโทเคน', async () => {
    const token = tokenFromMail(user.email);
    expect(token).toBeDefined();
    const rows = (await pool.query(`SELECT token_hash FROM password_reset_tokens t JOIN users u ON u.user_id = t.user_id WHERE u.username = $1`, [user.username])).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.token_hash === token)).toBe(false); // ไม่เก็บโทเคนตัวจริง
  });

  it('โทเคนมั่ว / รหัสผ่านใหม่สั้นเกินไป → 400', async () => {
    const bad = await request(app).post('/api/auth/reset-password').send({ token: 'a'.repeat(64), password: NEW_PASSWORD });
    expect(bad.status).toBe(400);
    const malformed = await request(app).post('/api/auth/reset-password').send({ token: 'abc', password: NEW_PASSWORD });
    expect(malformed.status).toBe(400);
    const short = await request(app).post('/api/auth/reset-password').send({ token: tokenFromMail(user.email), password: 'short' });
    expect(short.status).toBe(400);
  });

  it('รีเซ็ตสำเร็จ → รหัสเดิมใช้ไม่ได้ รหัสใหม่ใช้ได้ session เก่าถูกเตะออก และโทเคนใช้ซ้ำไม่ได้', async () => {
    const token = tokenFromMail(user.email)!;
    const res = await request(app).post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD });
    expect(res.status).toBe(200);

    expect((await login(user.username, user.password)).status).toBe(401);
    expect((await login(user.username, NEW_PASSWORD)).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', oldCookies)).status).toBe(401);

    const reuse = await request(app).post('/api/auth/reset-password').send({ token, password: 'Another-pass-123' });
    expect(reuse.status).toBe(400);
  });

  it('โทเคนหมดอายุ → 400', async () => {
    testOutbox.length = 0;
    await request(app).post('/api/auth/forgot-password').send({ email: user.email });
    const token = tokenFromMail(user.email)!;
    await pool.query(`UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE user_id = (SELECT user_id FROM users WHERE username = $1)`, [user.username]);
    const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'Another-pass-123' });
    expect(res.status).toBe(400);
  });

  it('ขอลิงก์ใหม่ → ลิงก์เก่าที่ยังไม่ใช้เป็นโมฆะ และขอเกิน 3 ครั้งต่อชั่วโมงไม่ส่งอีเมลเพิ่ม', async () => {
    await pool.query(`DELETE FROM password_reset_tokens WHERE user_id = (SELECT user_id FROM users WHERE username = $1)`, [user.username]);
    testOutbox.length = 0;
    await request(app).post('/api/auth/forgot-password').send({ email: user.email });
    const first = tokenFromMail(user.email)!;
    await request(app).post('/api/auth/forgot-password').send({ email: user.email });
    const second = tokenFromMail(user.email)!;
    expect(second).not.toBe(first);
    expect((await request(app).post('/api/auth/reset-password').send({ token: first, password: 'Another-pass-123' })).status).toBe(400);

    await request(app).post('/api/auth/forgot-password').send({ email: user.email }); // ครั้งที่ 3
    await request(app).post('/api/auth/forgot-password').send({ email: user.email }); // ครั้งที่ 4 → ไม่ส่ง
    expect(testOutbox.filter((m) => m.to === user.email)).toHaveLength(3);
  });

  it('บัญชีที่ถูกระงับ → ไม่ส่งอีเมล', async () => {
    await pool.query(`UPDATE users SET is_active = FALSE WHERE username = $1`, [user.username]);
    await pool.query(`DELETE FROM password_reset_tokens WHERE user_id = (SELECT user_id FROM users WHERE username = $1)`, [user.username]);
    testOutbox.length = 0;
    const res = await request(app).post('/api/auth/forgot-password').send({ email: user.email });
    expect(res.status).toBe(200);
    expect(testOutbox.some((m) => m.to === user.email)).toBe(false);
    await pool.query(`UPDATE users SET is_active = TRUE WHERE username = $1`, [user.username]);
  });
});

describe('Change password (ล็อกอินอยู่)', () => {
  it('รหัสปัจจุบันผิด / รหัสใหม่ซ้ำของเดิม / รหัสใหม่สั้น → 400', async () => {
    const u = await registerAndGetCookie('jest_chg');
    createdUsernames.push(u.user.username);
    const send = (body: object) => request(app).post('/api/auth/change-password').set('Cookie', u.cookies).send(body);

    expect((await send({ currentPassword: 'wrong-password', newPassword: NEW_PASSWORD })).status).toBe(400);
    expect((await send({ currentPassword: u.user.password, newPassword: u.user.password })).status).toBe(400);
    expect((await send({ currentPassword: u.user.password, newPassword: 'short' })).status).toBe(400);
    expect((await request(app).post('/api/auth/change-password').send({ currentPassword: 'x', newPassword: NEW_PASSWORD })).status).toBe(401);
  });

  it('เปลี่ยนสำเร็จ → อุปกรณ์อื่นถูกเตะออก แต่ session ปัจจุบันยังใช้ได้', async () => {
    const u = await registerAndGetCookie('jest_chg2');
    createdUsernames.push(u.user.username);
    const other = getSetCookies(await login(u.user.username, u.user.password)); // อุปกรณ์เครื่องที่สอง

    const res = await request(app).post('/api/auth/change-password').set('Cookie', u.cookies).send({ currentPassword: u.user.password, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);

    expect((await request(app).get('/api/auth/me').set('Cookie', u.cookies)).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', other)).status).toBe(401);
    expect((await login(u.user.username, u.user.password)).status).toBe(401);
    expect((await login(u.user.username, NEW_PASSWORD)).status).toBe(200);
  });
});
