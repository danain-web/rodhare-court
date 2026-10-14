import request from 'supertest';
import { app, pool, getSetCookies } from './helpers';

// =====================================================================
// Admin: Audit Log (BR16)
// กัน regression: คอลัมน์ old_values / new_values เป็น JSONB → pg คืนเป็น object
// API ต้องส่งเป็น string (ตาม AuditLogDTO) ไม่งั้นหน้า Audit Log ของ React พัง (Minified React error #31)
// =====================================================================

let adminCookies: string[] = [];

beforeAll(async () => {
  const login = await request(app).post('/api/auth/login').send({ identifier: 'admin1', password: 'Password123!' });
  expect(login.status).toBe(200);
  adminCookies = getSetCookies(login);
});

afterAll(async () => {
  await request(app).post('/api/auth/logout').set('Cookie', adminCookies);
  await pool.end();
});

describe('Admin Audit Logs', () => {
  it('GET /api/admin/audit-logs ไม่มี Cookie → 401', async () => {
    const res = await request(app).get('/api/admin/audit-logs');
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/audit-logs (admin1) → old/newValues เป็น string หรือไม่มีค่า', async () => {
    const res = await request(app).get('/api/admin/audit-logs').set('Cookie', adminCookies);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0); // อย่างน้อยมี LOGIN ของ admin1 เมื่อกี้

    for (const log of res.body.data) {
      for (const key of ['oldValues', 'newValues']) {
        if (log[key] !== undefined && log[key] !== null) {
          expect(typeof log[key]).toBe('string');
          expect(() => JSON.parse(log[key])).not.toThrow();
        }
      }
    }
  });
});
