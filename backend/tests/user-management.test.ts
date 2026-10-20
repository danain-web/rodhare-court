import request from 'supertest';
import { app, pool, getSetCookies, deleteTestUsers, loginAs, registerAndGetCookie } from './helpers';

// =====================================================================
// จัดการผู้ใช้โดยผู้ดูแลระบบ (permission user.manage)
//   - ดู/ค้นหา/กรอง · ระงับ-เปิดบัญชี · เปลี่ยนบทบาท · เปลี่ยนประเภทสมาชิก
//   - การระงับหรือเปลี่ยนบทบาทต้องตัด session เดิมทันที (JWT เก็บบทบาทไว้ ถ้าไม่ตัดจะยังใช้สิทธิ์เก่าได้)
//   - แก้สถานะ/บทบาทของตัวเองไม่ได้
// =====================================================================

const createdUsernames: string[] = [];
let adminCookies: string[] = [];
let admin1Id = 0;

beforeAll(async () => {
  adminCookies = await loginAs('admin1');
  admin1Id = (await request(app).get('/api/auth/me').set('Cookie', adminCookies)).body.data.userId;
});

afterAll(async () => {
  await deleteTestUsers(createdUsernames);
  await pool.end();
});

const patch = (id: number, body: object, cookies = adminCookies) => request(app).patch(`/api/admin/users/${id}`).set('Cookie', cookies).send(body);

describe('Admin user management', () => {
  it('ไม่ล็อกอิน → 401 · ลูกค้าและพนักงาน (ไม่มีสิทธิ์ user.manage) → 403', async () => {
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
    const customer = await registerAndGetCookie('jest_um_cust');
    createdUsernames.push(customer.user.username);
    expect((await request(app).get('/api/admin/users').set('Cookie', customer.cookies)).status).toBe(403);
    expect((await request(app).get('/api/admin/users').set('Cookie', await loginAs('staff1'))).status).toBe(403);
    expect((await patch(customer.userId, { isActive: false }, customer.cookies)).status).toBe(403);
  });

  it('GET /admin/users → ค้นหา กรองบทบาท/สถานะ และได้ตัวเลือกบทบาท/ประเภทสมาชิกมาด้วย', async () => {
    const u = await registerAndGetCookie('jest_um_list');
    createdUsernames.push(u.user.username);

    const found = await request(app).get('/api/admin/users').query({ search: u.user.username }).set('Cookie', adminCookies);
    expect(found.status).toBe(200);
    expect(found.body.data.users).toHaveLength(1);
    expect(found.body.data.users[0]).toMatchObject({ userId: u.userId, roles: ['CUSTOMER'], isActive: true });
    expect(found.body.data.users[0].passwordHash).toBeUndefined();
    expect(found.body.data.roles.map((r: any) => r.roleName)).toEqual(expect.arrayContaining(['CUSTOMER', 'STAFF', 'ADMIN']));
    expect(found.body.data.memberTypes.length).toBeGreaterThan(0);

    const admins = await request(app).get('/api/admin/users').query({ role: 'ADMIN' }).set('Cookie', adminCookies);
    expect(admins.body.data.users.every((x: any) => x.roles.includes('ADMIN'))).toBe(true);
    expect(admins.body.data.users.some((x: any) => x.username === 'admin1')).toBe(true);

    const suspended = await request(app).get('/api/admin/users').query({ status: 'suspended', search: u.user.username }).set('Cookie', adminCookies);
    expect(suspended.body.data.users).toHaveLength(0);
    expect((await request(app).get('/api/admin/users').query({ status: 'bogus' }).set('Cookie', adminCookies)).status).toBe(400);
  });

  it('ระงับบัญชี → ถูกเตะออกทันที เข้าสู่ระบบไม่ได้ · เปิดบัญชีแล้วกลับมาใช้ได้', async () => {
    const u = await registerAndGetCookie('jest_um_susp');
    createdUsernames.push(u.user.username);
    expect((await request(app).get('/api/auth/me').set('Cookie', u.cookies)).status).toBe(200);

    const res = await patch(u.userId, { isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
    expect((await request(app).get('/api/auth/me').set('Cookie', u.cookies)).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ identifier: u.user.username, password: u.user.password })).status).toBe(403);

    expect((await patch(u.userId, { isActive: true })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ identifier: u.user.username, password: u.user.password })).status).toBe(200);
  });

  it('เปลี่ยนบทบาท → session เดิมถูกตัด เข้าสู่ระบบใหม่แล้วได้สิทธิ์ของบทบาทใหม่', async () => {
    const u = await registerAndGetCookie('jest_um_role');
    createdUsernames.push(u.user.username);
    expect((await request(app).get('/api/staff/payments/pending').set('Cookie', u.cookies)).status).toBe(403);

    const res = await patch(u.userId, { role: 'STAFF' });
    expect(res.status).toBe(200);
    expect(res.body.data.roles).toEqual(['STAFF']);
    expect((await request(app).get('/api/auth/me').set('Cookie', u.cookies)).status).toBe(401); // token เก่าที่ยังมีบทบาท CUSTOMER ใช้ไม่ได้แล้ว

    const relogin = await request(app).post('/api/auth/login').send({ identifier: u.user.username, password: u.user.password });
    expect(relogin.body.data.user.roles).toEqual(['STAFF']);
    expect((await request(app).get('/api/staff/payments/pending').set('Cookie', getSetCookies(relogin))).status).toBe(200);
  });

  it('เปลี่ยนประเภทสมาชิก → บันทึกจริงและไม่ตัด session', async () => {
    const u = await registerAndGetCookie('jest_um_mt');
    createdUsernames.push(u.user.username);
    const student = (await pool.query(`SELECT member_type_id FROM member_types WHERE type_name = 'STUDENT'`)).rows[0].member_type_id;

    const res = await patch(u.userId, { memberTypeId: student });
    expect(res.status).toBe(200);
    expect(res.body.data.memberTypeId).toBe(student);
    expect((await request(app).get('/api/auth/me').set('Cookie', u.cookies)).status).toBe(200);
  });

  it('ข้อมูลไม่ถูกต้อง → 400/404 · ไม่ส่งอะไรมาเลย → 400', async () => {
    const u = await registerAndGetCookie('jest_um_bad');
    createdUsernames.push(u.user.username);
    expect((await patch(u.userId, { role: 'NO_SUCH_ROLE' })).status).toBe(400);
    expect((await patch(u.userId, { memberTypeId: 999999 })).status).toBe(400);
    expect((await patch(u.userId, {})).status).toBe(400);
    expect((await patch(u.userId, { isActive: 'yes' })).status).toBe(400);
    expect((await patch(999999, { isActive: false })).status).toBe(404);
    expect((await patch(0, { isActive: false })).status).toBe(400);
  });

  it('แก้สถานะ/บทบาทของบัญชีตัวเองไม่ได้', async () => {
    expect((await patch(admin1Id, { isActive: false })).status).toBe(400);
    expect((await patch(admin1Id, { role: 'CUSTOMER' })).status).toBe(400);
    expect((await request(app).get('/api/auth/me').set('Cookie', adminCookies)).status).toBe(200);
  });

  it('บันทึก UPDATE_USER ใน audit log พร้อมค่าก่อน-หลัง', async () => {
    const u = await registerAndGetCookie('jest_um_aud');
    createdUsernames.push(u.user.username);
    await patch(u.userId, { isActive: false });
    const log = (await pool.query(`SELECT user_id, old_values, new_values FROM audit_logs WHERE action = 'UPDATE_USER' AND entity_id = $1 ORDER BY log_id DESC LIMIT 1`, [u.userId])).rows[0];
    expect(log.user_id).toBe(admin1Id);
    expect(log.old_values.isActive).toBe(true);
    expect(log.new_values.isActive).toBe(false);
  });
});
