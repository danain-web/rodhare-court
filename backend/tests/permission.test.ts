import request from 'supertest';
import { app, pool, getSetCookies, registerAndGetCookie, deleteTestUsers } from './helpers';

// =====================================================================
// สิทธิ์เก็บใน DB (role_permissions) ไม่ฝังชื่อ role ในโค้ด
// พิสูจน์ว่า: แก้สิทธิ์ใน DB แล้วพฤติกรรม API เปลี่ยนทันที (ไม่ต้อง login ใหม่ ไม่ต้อง deploy)
// =====================================================================

let adminCookies: string[] = [];
let customerCookies: string[] = [];
let customerUsername = '';
let customerRoleId = 0;
let adminRoleId = 0;
let adminOriginal: string[] = [];

const putPermissions = (roleId: number, permissions: string[]) =>
  request(app).put(`/api/admin/roles/${roleId}/permissions`).set('Cookie', adminCookies).send({ permissions });

beforeAll(async () => {
  const login = await request(app).post('/api/auth/login').send({ identifier: 'admin1', password: 'Password123!' });
  expect(login.status).toBe(200);
  adminCookies = getSetCookies(login);

  const customer = await registerAndGetCookie('perm');
  customerCookies = customer.cookies;
  customerUsername = customer.user.username;

  const roles = await request(app).get('/api/admin/roles').set('Cookie', adminCookies);
  customerRoleId = roles.body.data.find((r: any) => r.roleName === 'CUSTOMER').roleId;
  const admin = roles.body.data.find((r: any) => r.roleName === 'ADMIN');
  adminRoleId = admin.roleId;
  adminOriginal = admin.permissions;
});

afterAll(async () => {
  // คืนค่าสิทธิ์เดิมเสมอ แม้เทสต์พังกลางทาง
  await pool.query(
    `DELETE FROM role_permissions WHERE role_id = $1 AND permission_id IN (SELECT permission_id FROM permissions WHERE code = 'audit.view')`,
    [customerRoleId]
  );
  await deleteTestUsers([customerUsername]);
  await pool.end();
});

describe('Role & Permission management', () => {
  it('ลูกค้าเข้าหน้าจัดการสิทธิ์ไม่ได้ → 403', async () => {
    const res = await request(app).get('/api/admin/roles').set('Cookie', customerCookies);
    expect(res.status).toBe(403);
  });

  it('admin เห็นบทบาททั้งหมดพร้อมสิทธิ์ และรายการสิทธิ์ทั้งหมด', async () => {
    const roles = await request(app).get('/api/admin/roles').set('Cookie', adminCookies);
    expect(roles.status).toBe(200);
    expect(roles.body.data.map((r: any) => r.roleName).sort()).toEqual(['ADMIN', 'CUSTOMER', 'EXECUTIVE', 'STAFF']);
    const staff = roles.body.data.find((r: any) => r.roleName === 'STAFF');
    expect(staff.permissions).toContain('payment.verify');
    expect(staff.permissions).not.toContain('court.manage');

    const perms = await request(app).get('/api/admin/permissions').set('Cookie', adminCookies);
    expect(perms.status).toBe(200);
    expect(perms.body.data.map((p: any) => p.code)).toContain('role.manage');
  });

  it('ให้สิทธิ์ audit.view แก่ CUSTOMER → ลูกค้าเข้า Audit Log ได้ทันที และถอนแล้วเข้าไม่ได้อีก', async () => {
    const before = await request(app).get('/api/admin/audit-logs').set('Cookie', customerCookies);
    expect(before.status).toBe(403);

    const grant = await putPermissions(customerRoleId, ['dashboard.customer', 'audit.view']);
    expect(grant.status).toBe(200);
    expect(grant.body.data.permissions).toEqual(['audit.view', 'dashboard.customer']);

    const during = await request(app).get('/api/admin/audit-logs').set('Cookie', customerCookies);
    expect(during.status).toBe(200);

    const revoke = await putPermissions(customerRoleId, ['dashboard.customer']);
    expect(revoke.status).toBe(200);

    const after = await request(app).get('/api/admin/audit-logs').set('Cookie', customerCookies);
    expect(after.status).toBe(403);
  });

  it('/auth/me ส่งรายการสิทธิ์ของผู้ใช้ให้ frontend ใช้ซ่อน/แสดงเมนู', async () => {
    const me = await request(app).get('/api/auth/me').set('Cookie', adminCookies);
    expect(me.status).toBe(200);
    expect(me.body.data.permissions).toEqual(expect.arrayContaining(['role.manage', 'payment.verify']));

    const customerMe = await request(app).get('/api/auth/me').set('Cookie', customerCookies);
    expect(customerMe.body.data.permissions).toContain('dashboard.customer');
    expect(customerMe.body.data.permissions).not.toContain('role.manage');
  });

  it('การแก้สิทธิ์ถูกบันทึกใน Audit Log', async () => {
    const res = await pool.query(
      `SELECT action, entity_id FROM audit_logs WHERE action = 'UPDATE_ROLE_PERMISSIONS' AND entity_id = $1 ORDER BY log_id DESC LIMIT 1`,
      [customerRoleId]
    );
    expect(res.rows.length).toBe(1);
  });

  it('รหัสสิทธิ์ที่ไม่มีอยู่จริง → 400 และไม่เปลี่ยนแปลงอะไร', async () => {
    const res = await putPermissions(customerRoleId, ['dashboard.customer', 'no.such.permission']);
    expect(res.status).toBe(400);
    const roles = await request(app).get('/api/admin/roles').set('Cookie', adminCookies);
    const customer = roles.body.data.find((r: any) => r.roleName === 'CUSTOMER');
    expect(customer.permissions).toEqual(['dashboard.customer']);
  });

  it('บทบาทที่ไม่มีอยู่ → 404', async () => {
    const res = await putPermissions(999999, ['dashboard.customer']);
    expect(res.status).toBe(404);
  });

  it('ถอน role.manage จนไม่เหลือบทบาทใดจัดการสิทธิ์ได้ → 400 (กันล็อกตัวเอง) และ rollback', async () => {
    const without = adminOriginal.filter((c) => c !== 'role.manage');
    const res = await putPermissions(adminRoleId, without);
    expect(res.status).toBe(400);

    const roles = await request(app).get('/api/admin/roles').set('Cookie', adminCookies);
    const admin = roles.body.data.find((r: any) => r.roleName === 'ADMIN');
    expect(admin.permissions).toContain('role.manage');
  });
});
