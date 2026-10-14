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

// login ด้วยบัญชีจาก seed (รหัสผ่าน Password123!) คืน cookie
export const loginAs = async (identifier: string): Promise<string[]> => {
  const res = await request(app).post('/api/auth/login').send({ identifier, password: 'Password123!' });
  if (res.status !== 200) throw new Error(`login ${identifier} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return getSetCookies(res);
};

// เลขอ้างอิงสลิปไม่ซ้ำ (รูปแบบ A-Z0-9 8–30 ตัว) — ข้อมูลทดสอบเท่านั้น
let refSeq = 0;
export const uniqueSlipRef = (prefix = 'T') => `${prefix}${Date.now()}${++refSeq}`.toUpperCase().slice(0, 30);

// วันที่ล่วงหน้า N วัน (YYYY-MM-DD ตามเวลาไทย)
export const futureDate = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// PNG ที่ magic bytes ถูกต้องและใหญ่กว่า 1 KB (ใช้เป็นไฟล์สลิปทดสอบ)
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
export const VALID_PNG = Buffer.concat([TINY_PNG, Buffer.alloc(2048)]);

// PNG ที่ header ระบุขนาด 800x1200 px และไฟล์ใหญ่กว่า 10 KB → ผ่านเกณฑ์ "ภาพชัด" (เหมือนสลิป demo จริง)
export const CLEAR_SLIP_PNG = (() => {
  const buf = Buffer.concat([TINY_PNG, Buffer.alloc(12 * 1024)]);
  buf.writeUInt32BE(800, 16);  // IHDR width
  buf.writeUInt32BE(1200, 20); // IHDR height
  return buf;
})();

// ต่อข้อความที่ OCR (mock) จะ "อ่านเจอ" ท้ายไฟล์ — ใช้ข้อความสลิปโอนเงินจำลองที่มียอด
export const slipText = (amount: number, ref = uniqueSlipRef('REF')) =>
  `โอนเงินสำเร็จ จำนวนเงิน ${amount.toFixed(2)} บาท ค่าธรรมเนียม 0.00 บาท เลขที่รายการ ${ref} ธนาคาร`;
export const slipImage = (base: Buffer, text: string) => Buffer.concat([base, Buffer.from(`OCR:${text}`, 'utf8')]);

export { app, pool };
