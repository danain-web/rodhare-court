import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// =====================================================================
// Timezone ของระบบ — วันที่/เวลาจองทั้งหมดเป็นเวลาไทย (booking_date + 'HH:MM')
// เหตุผล: Server บน Render ใช้ UTC → new Date() / combineDateTime() จะคลาด 7 ชม.
//         (เช่น จองเวลาที่ผ่านไปแล้วได้, หน้าต่างเช็คอิน BR8 และเงินคืน BR12 ผิด)
//         Node อ่าน process.env.TZ ใหม่ทุกครั้งที่สร้าง Date จึงตั้งที่นี่ได้ (ไฟล์นี้ถูก import ก่อนใช้ Date)
// ฝั่ง PostgreSQL ตั้งด้วย: ALTER DATABASE postgres SET timezone TO 'Asia/Bangkok' (ดู supabase_schema.sql)
// =====================================================================
process.env.TZ = process.env.APP_TIMEZONE || 'Asia/Bangkok';

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // PostgreSQL (Supabase) — ใช้ DATABASE_URL เป็นหลัก (Supabase Transaction Pooler URL)
  databaseUrl: process.env.DATABASE_URL || '',

  // Supabase Storage — ใช้อัปโหลดสลิป แทนการเก็บลง disk
  supabase: {
    url:           process.env.SUPABASE_URL            || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    bucketName:    process.env.SUPABASE_BUCKET_NAME    || 'slips',
  },

  // JWT + Cookie
  jwtSecret:         process.env.JWT_SECRET            || 'change_me_to_a_long_random_string',
  jwtExpiresIn:      process.env.JWT_EXPIRES_IN        || '8h',
  cookieDomain:      process.env.COOKIE_DOMAIN         || '',   // ว่าง = ใช้ domain ปัจจุบัน
  // คั่นหลาย origin ด้วย , ได้ เช่น "https://rodhare.vercel.app,http://localhost:3000"
  frontendUrls:      (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean),

  // จำนวน proxy ที่อยู่หน้า Express (Render = 1, Vercel rewrite → Render = 2, local = 0)
  // ทำให้ req.ip เป็น IP จริงของผู้ใช้ → express-rate-limit นับต่อคนได้ถูกต้อง
  trustProxy:        parseInt(process.env.TRUST_PROXY || '0', 10),

  // Background job interval
  maintenanceIntervalMs: parseInt(process.env.MAINTENANCE_INTERVAL_MS || '60000', 10),
};

// ค่าคงที่ของ Business Rules (อ้างอิงตาราง BR ในรายงาน)
export const BUSINESS_RULES = {
  HOLD_MINUTES: 15,              // BR3: ต้องชำระภายใน 15 นาที มิฉะนั้นยกเลิกอัตโนมัติ
  MAX_ADVANCE_DAYS: 30,          // BR4: จองล่วงหน้าได้ไม่เกิน 30 วัน
  MAX_HOURS_PER_DAY: 2,          // BR4: ไม่เกิน 2 ชั่วโมงต่อวัน
  MIN_HOURS_BEFORE_CHANGE: 24,   // BR5: แก้ไขวัน/เวลาได้ก่อนเวลาใช้งานอย่างน้อย 24 ชม.
  CHECKIN_EARLY_MINUTES: 30,     // BR8: เช็คอินก่อนเวลาเริ่มได้ไม่เกิน 30 นาที
  LATE_FEE_PER_BLOCK: 20,        // BR11: คืนช้า 20 บาท ต่อ 15 นาที ต่อชิ้น
  LATE_FEE_BLOCK_MINUTES: 15,
  REFUND_FULL_HOURS: 24,         // BR12: ยกเลิกล่วงหน้า > 24 ชม. คืน 100% / 1-24 ชม. คืน 50% / < 1 ชม. ไม่คืนเงิน
  REFUND_NONE_HOURS: 1,
  REFUND_FULL_PERCENT: 100,
  REFUND_LATE_PERCENT: 50,
} as const;

// สถานะการจองที่ยังถือครองสนามอยู่ (ใช้ตรวจการจองทับ BR2)
export const ACTIVE_BOOKING_STATUSES = ['PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'CONFIRMED', 'CHECKED_IN'] as const;
