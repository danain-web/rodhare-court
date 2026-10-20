import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';

// =====================================================================
// Jest globalSetup — ฐานข้อมูลทดสอบแยกจาก Production
// เหตุผล: เทสต์สร้าง/แก้/ลบข้อมูล ห้ามรันบน Supabase จริง
//   1) เปิด PostgreSQL 17 (embedded) ในโฟลเดอร์ชั่วคราว พอร์ตสุ่ม
//   2) รัน database/supabase_schema.sql + supabase_seed.sql (ไฟล์เดียวกับที่ใช้บน Supabase)
//   3) ตั้ง env ให้แอปชี้มาที่ฐานข้อมูลนี้ (ทับค่าใน backend/.env)
// =====================================================================

const REPO_ROOT = path.resolve(__dirname, '../../..');
const STATE_FILE = path.join(os.tmpdir(), 'rodhare-court-test-db.json');

export default async function globalSetup(): Promise<void> {
  // ตั้ง timezone ที่ process จริง (ใน Jest sandbox การตั้ง process.env.TZ ใน env.ts ไม่มีผลต่อ Date)
  process.env.TZ = 'Asia/Bangkok';

  const port = 55000 + Math.floor(Math.random() * 1000);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rodhare-pg-'));
  const password = crypto.randomBytes(12).toString('hex');

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password,
    port,
    persistent: false,
    // UTF8 เหมือน Supabase (ค่าเริ่มต้นบน Windows เป็น WIN1252 เก็บภาษาไทยไม่ได้)
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();

  const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  for (const file of ['supabase_schema.sql', 'supabase_seed.sql']) {
    await client.query(fs.readFileSync(path.join(REPO_ROOT, 'database', file), 'utf8'));
  }
  // migrations ที่เพิ่มภายหลัง (เรียงตามชื่อไฟล์) — ให้ฐานข้อมูลทดสอบตรงกับ schema ล่าสุด
  const migrationsDir = path.join(REPO_ROOT, 'database', 'migrations');
  if (fs.existsSync(migrationsDir)) {
    for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
      await client.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
    }
  }
  await client.end();

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    DATABASE_SSL: 'false',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    SUPABASE_URL: 'http://storage.test.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-used',
    FRONTEND_URL: 'http://localhost:3000',
    TRUST_PROXY: '0',
    // เทสต์ทั่วไปยิงคำขอจำนวนมากจากผู้ใช้เดียว → ยกเพดาน · พฤติกรรม limiter ทดสอบแยกใน security.test.ts
    RATE_LIMIT_BOOKING_MAX: '1000',
    RATE_LIMIT_PAYMENT_MAX: '1000',
    RATE_LIMIT_FORGOT_MAX: '1000',
    // บัญชีรับเงินสำหรับเทสต์ (ค่าทดสอบ ไม่ใช่บัญชีจริง)
    PAYMENT_ACCOUNT_NAME: 'Rodhare Court (test)',
    PAYMENT_PROMPTPAY_ID: '0812345678',
    // เทสต์ส่วนใหญ่ตรวจขั้นตอนเจ้าหน้าที่อนุมัติ → ปิดโหมดสาธิต (demo.test.ts เปิดเองเพื่อทดสอบโหมดนี้)
    PAYMENT_DEMO_MODE: 'false',
    // ความลับของ endpoint cron (ค่าทดสอบ) · อีเมลในโหมดเทสต์ไม่ส่งจริง (utils/email.ts เก็บลง testOutbox)
    CRON_SECRET: crypto.randomBytes(24).toString('hex'),
  });

  (globalThis as any).__RODHARE_TEST_PG__ = pg;
  fs.writeFileSync(STATE_FILE, JSON.stringify({ dataDir }));
}
