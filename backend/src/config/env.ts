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

const env = (key: string): string => (process.env[key] ?? '').trim();
const nodeEnv = env('NODE_ENV') || 'development';
const isProduction = nodeEnv === 'production';

export const config = {
  port: parseInt(env('PORT') || '5000', 10),
  nodeEnv,
  isProduction,

  // PostgreSQL (Supabase) — ใช้ DATABASE_URL เป็นหลัก (Supabase Transaction Pooler URL)
  databaseUrl: env('DATABASE_URL'),
  // Supabase บังคับ SSL · ฐานข้อมูลทดสอบในเครื่อง (embedded PostgreSQL) ตั้ง DATABASE_SSL=false
  databaseSsl: env('DATABASE_SSL') !== 'false',

  // Supabase Storage — เก็บสลิปใน bucket แบบ private เข้าถึงผ่าน Signed URL อายุสั้นเท่านั้น
  supabase: {
    url:            env('SUPABASE_URL'),
    serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
    bucketName:     env('SUPABASE_BUCKET_NAME') || 'slips',
    signedUrlTtlSeconds: parseInt(env('SLIP_SIGNED_URL_TTL') || '300', 10),
  },

  // JWT + Cookie — ไม่มีค่า default ของ secret (ตรวจใน validateConfig ด้านล่าง)
  jwtSecret:         env('JWT_SECRET'),
  jwtExpiresIn:      env('JWT_EXPIRES_IN') || '8h',
  // Frontend เรียก API ผ่าน Vercel rewrite (โดเมนเดียวกัน) → Lax ใช้ได้และกัน CSRF แบบ cross-site
  cookieSameSite:    (env('COOKIE_SAMESITE') || 'lax') as 'lax' | 'strict' | 'none',
  // คั่นหลาย origin ด้วย , ได้ เช่น "https://rodhare.vercel.app,http://localhost:3000"
  frontendUrls:      (env('FRONTEND_URL') || 'http://localhost:3000').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),

  // จำนวน proxy ที่อยู่หน้า Express (Render = 1, Vercel rewrite → Render = 2, local = 0)
  // ทำให้ req.ip เป็น IP จริงของผู้ใช้ → express-rate-limit นับต่อคนได้ถูกต้อง
  trustProxy:        parseInt(env('TRUST_PROXY') || '0', 10),

  // Background job interval
  maintenanceIntervalMs: parseInt(env('MAINTENANCE_INTERVAL_MS') || '60000', 10),

  // บัญชีรับเงินจริงของสนาม (แสดงให้ลูกค้าโอน)
  payee: {
    accountName:   env('PAYMENT_ACCOUNT_NAME'),
    promptPayId:   env('PAYMENT_PROMPTPAY_ID'),
    bankName:      env('PAYMENT_BANK_NAME'),
    bankAccountNo: env('PAYMENT_BANK_ACCOUNT_NO'),
  },

<<<<<<< HEAD
  // โหมดสาธิต (สำหรับนำเสนอ/ทดสอบ): แสดง QR จำลอง + อนุมัติสลิปที่ยอดตรงและภาพชัดให้อัตโนมัติ
  // ค่าเริ่มต้น: เปิดเมื่อยังไม่ได้ตั้งบัญชีรับเงินจริง · ตั้ง PAYMENT_DEMO_MODE=true|false เพื่อบังคับ
  paymentDemoMode:
    env('PAYMENT_DEMO_MODE') !== ''
      ? env('PAYMENT_DEMO_MODE') === 'true'
      : !env('PAYMENT_PROMPTPAY_ID') && !env('PAYMENT_BANK_ACCOUNT_NO'),
=======
  // โหมดสาธิต (สำหรับนำเสนอ): แสดง QR จำลอง (ถ้ายังไม่มีบัญชีจริง) + อนุมัติสลิปที่ยอดตรงให้อัตโนมัติทันที
  // เปิดเป็นค่าเริ่มต้น · ระบบรับเงินจริงต้องตั้ง PAYMENT_DEMO_MODE=false เพื่อให้เจ้าหน้าที่ตรวจทุกรายการ
  paymentDemoMode: env('PAYMENT_DEMO_MODE') !== 'false',
>>>>>>> 7911668a7e5d511f83e82c3f30e2b56c2428aac6
};

// =====================================================================
// validateConfig — Fail fast: ค่าที่จำเป็นหาย/ผิดรูปแบบ/ไม่ปลอดภัย → ไม่ยอมเริ่มระบบ
// เหตุผล: ระบบที่รันด้วย JWT secret อ่อนหรือว่าง ปลอม token ได้ ดีกว่าให้ล่มตั้งแต่ตอน start
// =====================================================================
const WEAK_SECRET_PATTERNS = [/change_?me/i, /secret/i, /password/i, /default/i, /^(.)\1+$/];

export const validateConfig = (c = config): string[] => {
  const errors: string[] = [];
  if (!['development', 'production', 'test'].includes(c.nodeEnv)) errors.push(`NODE_ENV ต้องเป็น development | production | test (ได้ "${c.nodeEnv}")`);
  if (!/^postgres(ql)?:\/\//.test(c.databaseUrl)) errors.push('DATABASE_URL ต้องเป็น postgresql://... connection string');
  if (c.jwtSecret.length < 32) errors.push('JWT_SECRET ต้องยาวอย่างน้อย 32 ตัวอักษร (สุ่มด้วย crypto.randomBytes)');
  else if (WEAK_SECRET_PATTERNS.some((re) => re.test(c.jwtSecret))) errors.push('JWT_SECRET ดูเหมือนค่าตัวอย่าง/คาดเดาได้ กรุณาสุ่มใหม่');
  if (!/^\d+[smhd]?$/.test(c.jwtExpiresIn)) errors.push('JWT_EXPIRES_IN ต้องอยู่ในรูป 8h, 30m, 1d');
  if (!['lax', 'strict', 'none'].includes(c.cookieSameSite)) errors.push('COOKIE_SAMESITE ต้องเป็น lax | strict | none');
  if (Number.isNaN(c.port) || Number.isNaN(c.trustProxy) || Number.isNaN(c.maintenanceIntervalMs)) errors.push('PORT / TRUST_PROXY / MAINTENANCE_INTERVAL_MS ต้องเป็นตัวเลข');
  for (const url of c.frontendUrls) if (!/^https?:\/\/[^/]+$/.test(url)) errors.push(`FRONTEND_URL ไม่ถูกต้อง: ${url}`);
  if (c.payee.promptPayId && !/^(0\d{9}|\d{13}|\d{15})$/.test(c.payee.promptPayId.replace(/[-\s]/g, ''))) {
    errors.push('PAYMENT_PROMPTPAY_ID ต้องเป็นเบอร์มือถือ 10 หลัก / เลขบัตรหรือเลขผู้เสียภาษี 13 หลัก / e-Wallet 15 หลัก');
  }
  if ((c.payee.promptPayId || c.payee.bankAccountNo) && !c.payee.accountName) errors.push('ตั้งบัญชีรับเงินแล้วต้องระบุ PAYMENT_ACCOUNT_NAME ด้วย');
  if (c.payee.bankAccountNo && !c.payee.bankName) errors.push('ตั้ง PAYMENT_BANK_ACCOUNT_NO แล้วต้องระบุ PAYMENT_BANK_NAME ด้วย');
  if (c.nodeEnv === 'production') {
    if (!c.supabase.url || !c.supabase.serviceRoleKey) errors.push('ต้องตั้ง SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน production');
    if (!c.databaseSsl) errors.push('production ต้องเชื่อมฐานข้อมูลผ่าน SSL (อย่าตั้ง DATABASE_SSL=false)');
    if (c.frontendUrls.some((u) => u.startsWith('http://'))) errors.push('FRONTEND_URL ใน production ต้องเป็น https');
    if (c.cookieSameSite === 'none') errors.push('COOKIE_SAMESITE=none เปิดช่อง CSRF — ใช้ Vercel rewrite แล้วตั้ง lax');
  }
  return errors;
};

const configErrors = validateConfig();
if (configErrors.length) {
  // ไม่ใส่ค่าจริงของตัวแปรลงข้อความ (กัน secret หลุดลง log)
  throw new Error(`Environment configuration ไม่ถูกต้อง:\n - ${configErrors.join('\n - ')}`);
}
if (config.paymentDemoMode && config.nodeEnv !== 'test') {
  console.warn('⚠️  PAYMENT DEMO MODE: แสดง QR จำลองและอนุมัติสลิปอัตโนมัติ — ใช้สำหรับนำเสนอ/ทดสอบเท่านั้น');
}

// ค่าคงที่ของ Business Rules (อ้างอิงตาราง BR ในรายงาน)
export const BUSINESS_RULES = {
  HOLD_MINUTES: 15,              // BR3: ต้องชำระภายใน 15 นาที มิฉะนั้นยกเลิกอัตโนมัติ
<<<<<<< HEAD
=======
  // BR3b: จำกัดจำนวน Hold (PENDING_PAYMENT) ที่มีผลพร้อมกันต่อบัญชี ไม่ว่าจะเป็นสนาม/วันไหนก็ตาม
  // กันผู้ใช้เลี่ยง Rate Limit ปุ่มจองด้วยการเปลี่ยนสนามหรือวันที่ไปเรื่อยๆ
  MAX_ACTIVE_HOLDS: 3,
  // BR3c: ตรวจรูปแบบ "สร้างรายการแล้วทิ้งให้หมดเวลาซ้ำๆ" ภายในช่วงเวลาที่กำหนด (นับจาก booking ที่ EXPIRED)
  ABUSE_WINDOW_HOURS: 24,
  ABUSE_EXPIRED_THRESHOLD: 5,
>>>>>>> 7911668a7e5d511f83e82c3f30e2b56c2428aac6
  MAX_ADVANCE_DAYS: 30,          // BR4: จองล่วงหน้าได้ไม่เกิน 30 วัน
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
