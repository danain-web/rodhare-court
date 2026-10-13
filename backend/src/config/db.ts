import { Pool, PoolClient } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { config } from './env';
import { AppError } from '../utils/appError';

// =====================================================================
// PostgreSQL Connection Pool (Supabase)
// ใช้ DATABASE_URL จาก Supabase Dashboard → Settings → Database → Connection string
// เลือก "Transaction" mode (port 6543) สำหรับ serverless / Render free tier
// =====================================================================
export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false }, // จำเป็นสำหรับ Supabase (SSL required)
  max: 10,            // จำนวน connection สูงสุดใน pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error (idle client):', err.message);
});

export type DbConnection = PoolClient;

// Timezone เดียวกับฝั่ง Node (env.ts) — ค่าคงที่ ไม่ได้มาจาก input ผู้ใช้ จึงต่อ string ใน SQL ได้อย่างปลอดภัย
const DB_TIMEZONE = (process.env.TZ || 'Asia/Bangkok').replace(/[^A-Za-z_/+-]/g, '');

// =====================================================================
// Supabase Admin Client — ใช้สำหรับอัปโหลดไฟล์ไปยัง Supabase Storage
// ใช้ service_role key (bypass RLS) — ห้าม expose ไปฝั่ง Frontend เด็ดขาด
// =====================================================================
export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
);

// =====================================================================
// initDbPool — เรียกตอน server start เพื่อตรวจสอบการเชื่อมต่อ
// =====================================================================
export const initDbPool = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✅ PostgreSQL (Supabase) Connection Pool initialized successfully.');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize PostgreSQL Connection Pool:', (error as Error).message);
    console.error('   ตรวจสอบ DATABASE_URL ใน .env และ IP Allow List ใน Supabase');
    return false;
  }
};

// =====================================================================
// withConnection — อ่านอย่างเดียว / คำสั่งเดียว
// ห่อด้วย Transaction เบาๆ เหมือน withTransaction เพื่อให้ SET LOCAL TIME ZONE มีผล
// (Supabase Transaction pooler ไม่เก็บค่า SET ข้าม Transaction)
// =====================================================================
export const withConnection = async <T>(
  fn: (conn: DbConnection) => Promise<T>,
  actorId?: number | null  // คงพารามิเตอร์ไว้ให้ interface เดิม repositories compile ผ่าน
): Promise<T> => withTransaction(fn, actorId);

// =====================================================================
// withTransaction — COMMIT เมื่อสำเร็จ, ROLLBACK เมื่อมีขั้นใดผิดพลาด
// =====================================================================
export const withTransaction = async <T>(
  fn: (conn: DbConnection) => Promise<T>,
  _actorId?: number | null
): Promise<T> => {
  const client = await pool.connect().catch((err) => {
    throw new AppError(`ไม่สามารถเชื่อมต่อฐานข้อมูล PostgreSQL ได้ (${(err as Error).message})`, 503);
  });
  try {
    // SET LOCAL มีผลเฉพาะใน Transaction นี้ → ใช้ได้กับ Supabase Transaction pooler (ค่า SET แบบ session ไม่คงอยู่)
    // ทำให้ CURRENT_DATE / การเทียบ booking_date + เวลา กับ NOW() เป็นเวลาไทยเสมอ แม้ DB ตั้งค่า default ยังเป็น UTC
    await client.query(`BEGIN; SET LOCAL TIME ZONE '${DB_TIMEZONE}'`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {/* ignore rollback error */});
    throw err;
  } finally {
    client.release();
  }
};

// =====================================================================
// Helper: ดึง id ของแถวที่ INSERT โดยใช้ RETURNING
// ใช้แทน Oracle's RETURNING ... INTO :outId
// ตัวอย่าง: const id = firstInsertId(result, 'booking_id');
// =====================================================================
export const firstInsertId = (rows: Record<string, unknown>[], col: string): number => {
  const value = rows?.[0]?.[col];
  if (value === undefined || value === null) {
    throw AppError.internal(`ไม่ได้รับค่า ${col} จากฐานข้อมูล`);
  }
  return Number(value);
};

// =====================================================================
// pingDatabase — ใช้ใน /health endpoint
// =====================================================================
export const pingDatabase = async (): Promise<boolean> => {
  try {
    const result = await pool.query('SELECT 1 AS health');
    return result.rows.length > 0;
  } catch (error) {
    console.error('Database Health Check Failed:', (error as Error).message);
    return false;
  }
};

// =====================================================================
// closeDbPool — เรียกตอน graceful shutdown
// =====================================================================
export const closeDbPool = async (): Promise<void> => {
  try {
    await pool.end();
    console.log('PostgreSQL pool closed.');
  } catch (error) {
    console.error('Error closing PostgreSQL pool:', error);
  }
};


