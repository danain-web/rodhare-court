import request from 'supertest';
import { app, pool, getSetCookies, registerAndGetCookie, deleteTestUsers } from './helpers';
import { verifyGoogleIdToken } from '../src/utils/googleAuth';
import { AppError } from '../src/utils/appError';

// =====================================================================
// เข้าสู่ระบบด้วย Google (เพิ่มเป็นอีกทางเลือก) — ตัวตรวจ token ถูก mock ไม่ยิงไปหา Google จริง
// ส่วนที่ทดสอบจริง: การหา/สร้าง/ผูกบัญชี, ประเภทสมาชิกตามโดเมน, cookie/session,
//                 การปฏิเสธ token ไม่ผ่าน/อีเมลไม่ยืนยัน และการกันผูกบัญชีอัตโนมัติ
// =====================================================================
jest.mock('../src/utils/googleAuth', () => ({ verifyGoogleIdToken: jest.fn() }));
const mockVerify = verifyGoogleIdToken as jest.MockedFunction<typeof verifyGoogleIdToken>;

const CREDENTIAL = 'x'.repeat(40);
const stamp = `${Date.now()}`;
const createdEmails: string[] = [];
const createdPasswordUsers: string[] = [];
let n = 0;

const identity = (over: Partial<{ sub: string; email: string; emailVerified: boolean; givenName: string; familyName: string }> = {}) => {
  const i = ++n;
  const id = {
    sub: `gsub-${stamp}-${i}`,
    email: `gtest${stamp}x${i}@kkumail.com`,
    emailVerified: true,
    givenName: 'สมชาย',
    familyName: 'ใจดี',
    ...over,
  };
  createdEmails.push(id.email);
  return id;
};
const googleLogin = (credential = CREDENTIAL) => request(app).post('/api/auth/google').send({ credential });
const userRow = async (email: string) =>
  (await pool.query('SELECT user_id, username, password_hash, google_sub, member_type_id, is_active FROM users WHERE LOWER(email) = LOWER($1)', [email])).rows[0];
const memberTypeId = async (typeName: string) => (await pool.query('SELECT member_type_id FROM member_types WHERE type_name = $1', [typeName])).rows[0].member_type_id;

afterEach(() => mockVerify.mockReset());

afterAll(async () => {
  const res = await pool.query('SELECT username FROM users WHERE LOWER(email) = ANY($1::text[])', [createdEmails.map((e) => e.toLowerCase())]);
  await deleteTestUsers([...res.rows.map((r: any) => r.username), ...createdPasswordUsers]);
  await pool.end();
});

describe('สมัคร/เข้าสู่ระบบด้วย Google', () => {
  it('อีเมล @kkumail.com ใหม่ → สร้างบัญชี CUSTOMER ประเภทนักศึกษา ไม่มีรหัสผ่าน และตั้ง cookie เข้าระบบได้', async () => {
    const id = identity();
    mockVerify.mockResolvedValueOnce(id);
    const res = await googleLogin();
    expect(res.status).toBe(201);
    expect(res.body.data.isNewAccount).toBe(true);
    expect(res.body.data.user.roles).toEqual(['CUSTOMER']);
    expect(res.body.data.user.permissions).toContain('dashboard.customer');
    expect(res.body.data.user.googleLinked).toBe(true);
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.googleSub).toBeUndefined();

    const row = await userRow(id.email);
    expect(row.password_hash).toBeNull();
    expect(row.google_sub).toBe(id.sub);
    expect(row.member_type_id).toBe(await memberTypeId('STUDENT'));
    expect(row.username).toMatch(/^gtest/);

    const cookies = getSetCookies(res);
    expect(cookies.some((c) => c.startsWith('auth_token=') && /HttpOnly/i.test(c))).toBe(true);
    const me = await request(app).get('/api/auth/me').set('Cookie', cookies);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(id.email);
  });

  it('Gmail ทั่วไป → ประเภทบุคคลภายนอก (ไม่ได้ส่วนลดนักศึกษา)', async () => {
    const id = identity({ email: `gtest${stamp}ext@gmail.com` });
    mockVerify.mockResolvedValueOnce(id);
    expect((await googleLogin()).status).toBe(201);
    expect((await userRow(id.email)).member_type_id).toBe(await memberTypeId('EXTERNAL'));
  });

  it('เข้าสู่ระบบซ้ำด้วยบัญชี Google เดิม → เข้าบัญชีเดิม ไม่สร้างซ้ำ (200)', async () => {
    const id = identity();
    mockVerify.mockResolvedValueOnce(id);
    const first = await googleLogin();
    mockVerify.mockResolvedValueOnce(id);
    const second = await googleLogin();
    expect(second.status).toBe(200);
    expect(second.body.data.isNewAccount).toBe(false);
    expect(second.body.data.user.userId).toBe(first.body.data.user.userId);
    const count = await pool.query('SELECT COUNT(*)::int AS c FROM users WHERE google_sub = $1', [id.sub]);
    expect(count.rows[0].c).toBe(1);
  });

  it('ชื่อผู้ใช้ซ้ำ (ส่วนหน้า @ เหมือนกัน แต่โดเมนต่างกัน) → ได้ username ไม่ซ้ำกันทั้งคู่', async () => {
    const a = identity({ email: `gcoll${stamp}@kkumail.com` });
    const b = identity({ email: `gcoll${stamp}@gmail.com` });
    mockVerify.mockResolvedValueOnce(a);
    mockVerify.mockResolvedValueOnce(b);
    expect((await googleLogin()).status).toBe(201);
    expect((await googleLogin()).status).toBe(201);
    const ua = (await userRow(a.email)).username;
    const ub = (await userRow(b.email)).username;
    expect(ua).not.toBe(ub);
  });

  it('บันทึก Audit Log การเข้าสู่ระบบด้วยวิธี google', async () => {
    const id = identity();
    mockVerify.mockResolvedValueOnce(id);
    await googleLogin();
    const userId = (await userRow(id.email)).user_id;
    const audit = await pool.query(`SELECT new_values FROM audit_logs WHERE user_id = $1 AND action = 'LOGIN'`, [userId]);
    expect(audit.rows[0].new_values.method).toBe('google');
  });
});

describe('ปฏิเสธเมื่อ token ไม่ปลอดภัย/ใช้ไม่ได้', () => {
  it('อีเมลยังไม่ยืนยันกับ Google (email_verified=false) → 401 และไม่สร้างบัญชี', async () => {
    const id = identity({ emailVerified: false });
    mockVerify.mockResolvedValueOnce(id);
    const res = await googleLogin();
    expect(res.status).toBe(401);
    expect(await userRow(id.email)).toBeUndefined();
    expect(getSetCookies(res).some((c) => c.startsWith('auth_token='))).toBe(false);
  });

  it('token ปลอม/หมดอายุ/ออกให้แอปอื่น (ตัวตรวจ throw) → 401', async () => {
    mockVerify.mockRejectedValueOnce(AppError.unauthorized('ยืนยันบัญชี Google ไม่สำเร็จ'));
    expect((await googleLogin()).status).toBe(401);
  });

  it('ยังไม่ตั้ง GOOGLE_CLIENT_ID (ปิดฟีเจอร์) → 503 ไม่ใช่ปล่อยผ่าน', async () => {
    mockVerify.mockRejectedValueOnce(new AppError('ยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วย Google', 503));
    expect((await googleLogin()).status).toBe(503);
  });

  it('ไม่ส่ง credential / สั้นผิดปกติ → 400 (ไม่เรียกตัวตรวจ)', async () => {
    expect((await request(app).post('/api/auth/google').send({})).status).toBe(400);
    expect((await googleLogin('short')).status).toBe(400);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('บัญชีที่ถูกระงับ (is_active=false) → 403 แม้ Google ยืนยันถูกต้อง', async () => {
    const id = identity();
    mockVerify.mockResolvedValueOnce(id);
    await googleLogin();
    await pool.query('UPDATE users SET is_active = FALSE WHERE google_sub = $1', [id.sub]);
    mockVerify.mockResolvedValueOnce(id);
    const res = await googleLogin();
    expect(res.status).toBe(403);
    expect(getSetCookies(res).some((c) => c.startsWith('auth_token='))).toBe(false);
  });

  it('บัญชีที่สมัครผ่าน Google (ไม่มีรหัสผ่าน) ล็อกอินด้วยรหัสผ่านไม่ได้ → 401 ข้อความเดียวกับรหัสผิด', async () => {
    const id = identity();
    mockVerify.mockResolvedValueOnce(id);
    await googleLogin();
    const username = (await userRow(id.email)).username;
    const res = await request(app).post('/api/auth/login').send({ identifier: username, password: 'anything123' });
    expect(res.status).toBe(401);
  });
});

describe('กันยึดบัญชี: ห้ามผูกอัตโนมัติเมื่ออีเมลตรงกับบัญชีรหัสผ่านเดิม', () => {
  it('อีเมลตรงกับบัญชีที่สมัครด้วยรหัสผ่าน → 409 ไม่ผูก ไม่ล็อกอิน ไม่สร้างบัญชีซ้ำ', async () => {
    const pw = await registerAndGetCookie('gexist');
    createdPasswordUsers.push(pw.user.username);
    const id = identity({ email: pw.user.email });
    mockVerify.mockResolvedValueOnce(id);
    const res = await googleLogin();
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('เชื่อมบัญชี Google');
    expect(getSetCookies(res).some((c) => c.startsWith('auth_token='))).toBe(false);
    const row = await userRow(pw.user.email);
    expect(row.google_sub).toBeNull();
    const dup = await pool.query('SELECT COUNT(*)::int AS c FROM users WHERE google_sub = $1', [id.sub]);
    expect(dup.rows[0].c).toBe(0);
  });
});

describe('เชื่อมบัญชี Google จากหน้าโปรไฟล์ (ต้องล็อกอินแล้ว)', () => {
  it('ไม่ได้ล็อกอิน → 401', async () => {
    expect((await request(app).post('/api/auth/google/link').send({ credential: CREDENTIAL })).status).toBe(401);
  });

  it('ล็อกอินด้วยรหัสผ่านแล้วเชื่อม Google → สำเร็จ แล้วใช้ Google เข้าบัญชีเดิมได้ และรหัสผ่านยังใช้ได้', async () => {
    const pw = await registerAndGetCookie('glink');
    createdPasswordUsers.push(pw.user.username);
    const id = identity({ email: pw.user.email });

    mockVerify.mockResolvedValueOnce(id);
    const link = await request(app).post('/api/auth/google/link').set('Cookie', pw.cookies).send({ credential: CREDENTIAL });
    expect(link.status).toBe(200);
    expect(link.body.data.googleLinked).toBe(true);
    expect((await userRow(pw.user.email)).google_sub).toBe(id.sub);

    mockVerify.mockResolvedValueOnce(id);
    const viaGoogle = await googleLogin();
    expect(viaGoogle.status).toBe(200);
    expect(viaGoogle.body.data.user.userId).toBe(pw.userId);

    const viaPassword = await request(app).post('/api/auth/login').send({ identifier: pw.user.username, password: pw.user.password });
    expect(viaPassword.status).toBe(200);
  });

  it('บัญชี Google ที่ถูกใช้กับผู้ใช้อื่นแล้ว → 409', async () => {
    const owner = identity();
    mockVerify.mockResolvedValueOnce(owner);
    await googleLogin();

    const pw = await registerAndGetCookie('glink2');
    createdPasswordUsers.push(pw.user.username);
    mockVerify.mockResolvedValueOnce({ ...owner, email: pw.user.email });
    const res = await request(app).post('/api/auth/google/link').set('Cookie', pw.cookies).send({ credential: CREDENTIAL });
    expect(res.status).toBe(409);
    expect((await userRow(pw.user.email)).google_sub).toBeNull();
  });

  it('เชื่อมซ้ำด้วยบัญชีเดิมได้ (idempotent) แต่เชื่อมบัญชี Google อื่นซ้อน → 409', async () => {
    const pw = await registerAndGetCookie('glink3');
    createdPasswordUsers.push(pw.user.username);
    const id = identity({ email: pw.user.email });
    mockVerify.mockResolvedValueOnce(id);
    await request(app).post('/api/auth/google/link').set('Cookie', pw.cookies).send({ credential: CREDENTIAL });

    mockVerify.mockResolvedValueOnce(id);
    expect((await request(app).post('/api/auth/google/link').set('Cookie', pw.cookies).send({ credential: CREDENTIAL })).status).toBe(200);

    mockVerify.mockResolvedValueOnce(identity());
    expect((await request(app).post('/api/auth/google/link').set('Cookie', pw.cookies).send({ credential: CREDENTIAL })).status).toBe(409);
  });

  it('อีเมลยังไม่ยืนยัน → 401 และไม่ผูก', async () => {
    const pw = await registerAndGetCookie('glink4');
    createdPasswordUsers.push(pw.user.username);
    mockVerify.mockResolvedValueOnce(identity({ email: pw.user.email, emailVerified: false }));
    expect((await request(app).post('/api/auth/google/link').set('Cookie', pw.cookies).send({ credential: CREDENTIAL })).status).toBe(401);
    expect((await userRow(pw.user.email)).google_sub).toBeNull();
  });
});
