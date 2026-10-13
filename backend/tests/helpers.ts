import request from 'supertest';
import app from '../src/app';
import { pool } from '../src/config/db';

// =====================================================================
// Test Helpers — ใช้ร่วมกันระหว่างไฟล์เทสต์
// =====================================================================

// สร้างข้อมูลผู้ใช้ทดสอบที่ไม่ซ้ำกันในแต่ละรอบ (กันชน UNIQUE username/email)
export const makeTestUser = (prefix: string) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {
    username: `${prefix}_${suffix}`,
    email: `${prefix}_${suffix}@test.local`,
    password: 'Test@12345',
    firstName: 'Jest',
    lastName: 'Tester',
  };
};

// ดึงค่า Set-Cookie เป็น array เสมอ (supertest อาจคืนเป็น string หรือ undefined)
export const getSetCookies = (res: request.Response): string[] => {
  const raw = res.headers['set-cookie'] as unknown;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [String(raw)];
};

// สมัครสมาชิกผ่าน API จริง แล้วคืน cookie สำหรับใช้เรียก endpoint อื่นต่อ
export const registerAndGetCookie = async (prefix: string) => {
  const user = makeTestUser(prefix);
  const res = await request(app).post('/api/auth/register').send(user);
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { user, cookies: getSetCookies(res), userId: res.body.data.user.userId as number };
};

// ลบผู้ใช้ทดสอบหลังจบเทสต์ (user_roles, user_sessions, notifications เป็น ON DELETE CASCADE)
// ตารางที่อ้างถึง bookings แบบไม่ cascade → ลบตามลำดับ FK ก่อนลบ bookings และ users
// (booking_status_history, booking_equipment, equipment_borrowings cascade ตาม booking อยู่แล้ว)
export const deleteTestUsers = async (usernames: string[]) => {
  if (usernames.length === 0) return;
  const bookingIds = `SELECT b.booking_id FROM bookings b JOIN users u ON u.user_id = b.user_id WHERE u.username = ANY($1::text[])`;
  for (const table of ['notifications', 'receipts', 'refund_requests', 'fines', 'payments', 'bookings']) {
    await pool.query(`DELETE FROM ${table} WHERE booking_id IN (${bookingIds})`, [usernames]);
  }
  await pool.query('DELETE FROM users WHERE username = ANY($1::text[])', [usernames]);
};

export { app, pool };
