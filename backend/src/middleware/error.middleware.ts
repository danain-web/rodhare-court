import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../utils/appError';
import { ZodError } from 'zod';

// ข้อความภาษาไทยของ constraint ในฐานข้อมูล (ใช้ตอน Demo กรณีที่ระบบต้องปฏิเสธในระดับ DB)
// key = ชื่อ constraint / unique index ใน supabase_schema.sql (PostgreSQL ส่งมาเป็นตัวพิมพ์เล็กใน err.constraint)
const CONSTRAINT_MESSAGES: Record<string, string> = {
  UQ_PAY_VERIFIED_BOOKING: 'การจองนี้มีการชำระเงินที่อนุมัติแล้ว ไม่สามารถอนุมัติซ้ำได้',
  UQ_PAY_PENDING_BOOKING: 'มีสลิปของการจองนี้รอตรวจสอบอยู่แล้ว',
  UQ_PAY_SLIP_REF: 'เลขอ้างอิงสลิปนี้ถูกใช้งานแล้ว (สลิปซ้ำ)',
  UQ_USERS_USERNAME_CI: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว (ไม่สนตัวพิมพ์เล็ก/ใหญ่)',
  UQ_USERS_EMAIL_CI: 'อีเมลนี้ถูกใช้งานแล้ว (ไม่สนตัวพิมพ์เล็ก/ใหญ่)',
  CHK_PAY_SLIP_MIME: 'ไฟล์สลิปต้องเป็นรูปภาพ JPG, PNG หรือ WEBP',
  CHK_PAY_SLIP_SIZE: 'ไฟล์สลิปต้องมีขนาดไม่เกิน 5 MB',
  UQ_RC_PAYMENT: 'การชำระเงินนี้ออกใบเสร็จไปแล้ว',
  UQ_RF_ACTIVE_BOOKING: 'การจองนี้มีคำขอคืนเงินอยู่แล้ว',
  UQ_BE_BOOKING_EQ: 'มีอุปกรณ์รายการนี้ในการจองแล้ว',
  UQ_FN_BORROW_TYPE: 'มีการบันทึกค่าปรับประเภทนี้ของการยืมนี้แล้ว',
  UQ_COH_COURT_DAY: 'มีเวลาเปิด-ปิดของวันนี้แล้ว',
  CHK_EQ_STOCK: 'สต็อกอุปกรณ์ไม่เพียงพอ (จำนวนคงเหลือต้องอยู่ระหว่าง 0 ถึงจำนวนทั้งหมด)',
  CHK_BK_FINAL: 'ยอดเงินของการจองไม่สอดคล้องกัน (ยอดสุทธิ = ค่าสนาม + ค่าอุปกรณ์ - ส่วนลด)',
  CHK_BK_TIME: 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น',
  CHK_PAY_METHOD: 'ช่องทางการชำระเงินไม่ถูกต้อง',
  CHK_PROMO_VALUE: 'มูลค่าส่วนลดไม่ถูกต้อง',
};

const constraintMessage = (constraint?: string): string | undefined =>
  constraint ? CONSTRAINT_MESSAGES[constraint.toUpperCase()] : undefined;

// PostgreSQL error codes (SQLSTATE) ที่ต้องแปลงเป็น HTTP status ที่เหมาะสม
// อ้างอิง: https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_CONNECTION_ERRORS = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', '57P01', '53300', '28P01', '3D000'];

const isPgError = (err: any): boolean =>
  typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) && typeof err?.severity === 'string';

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let details: any = undefined;

  if (err instanceof ZodError) {
    statusCode = 400;
    details = (err.issues || []).map((e: any) => ({
      field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
      message: e.message,
    }));
    message = `ข้อมูลไม่ถูกต้อง: ${details.map((d: any) => (d.field ? `${d.field} - ${d.message}` : d.message)).join(', ')}`;
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err instanceof MulterError) {
    // Multer: ไฟล์ใหญ่เกิน / แนบหลายไฟล์ / field name ไม่ตรง
    statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์สลิปต้องมีขนาดไม่เกิน 5 MB' : `อัปโหลดไฟล์ไม่สำเร็จ (${err.code})`;
  } else if (err?.type === 'entity.too.large') {
    statusCode = 413;
    message = 'ข้อมูลที่ส่งมีขนาดใหญ่เกินไป';
  } else if (err?.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'รูปแบบ JSON ไม่ถูกต้อง';
  } else if (isPgError(err)) {
    switch (err.code) {
      case '23505': // unique_violation
        statusCode = 409;
        message = constraintMessage(err.constraint) || `ข้อมูลซ้ำกับที่มีอยู่แล้ว (${err.constraint || 'unique constraint'})`;
        break;
      case '23514': // check_violation
        statusCode = 400;
        message = constraintMessage(err.constraint) || `ข้อมูลผิดกฎของระบบ (${err.constraint || 'check constraint'})`;
        break;
      case '23503': // foreign_key_violation
        statusCode = err.detail?.includes('is still referenced') ? 409 : 400;
        message = statusCode === 409
          ? 'ไม่สามารถลบได้ เนื่องจากมีข้อมูลอื่นอ้างอิงอยู่'
          : `ไม่พบข้อมูลที่อ้างอิง (${err.constraint || 'foreign key'})`;
        break;
      case '23502': // not_null_violation
      case '22001': // string_data_right_truncation
        statusCode = 400;
        message = `ข้อมูลไม่ครบหรือยาวเกินกำหนด (${err.column || err.message})`;
        break;
      case '22P02': // invalid_text_representation (เช่น ส่ง 'abc' ให้คอลัมน์ integer)
        statusCode = 400;
        message = 'รูปแบบข้อมูลไม่ถูกต้อง';
        break;
      case '40P01': // deadlock_detected
      case '40001': // serialization_failure
        statusCode = 409;
        message = 'มีผู้ใช้อื่นกำลังทำรายการเดียวกัน กรุณาลองใหม่อีกครั้ง';
        break;
      case 'P0001': // RAISE EXCEPTION จาก function/trigger (Business rule)
        statusCode = 400;
        message = err.message;
        break;
      default:
        if (PG_CONNECTION_ERRORS.includes(err.code)) {
          statusCode = 503;
          message = 'ไม่สามารถเชื่อมต่อฐานข้อมูล PostgreSQL ได้';
        } else {
          statusCode = 500;
          message = `Database Error: ${err.message}`;
        }
    }
  } else if (typeof err?.code === 'string' && PG_CONNECTION_ERRORS.includes(err.code)) {
    statusCode = 503;
    message = 'ไม่สามารถเชื่อมต่อฐานข้อมูล PostgreSQL ได้';
  } else if (err?.message) {
    message = err.message;
  }

  if (statusCode >= 500) console.error('[ERROR]', err);

  res.status(statusCode).json({
    status: 'error',
    success: false,
    statusCode,
    message,
    error: message,
    ...(details && { details }),
    ...(process.env.NODE_ENV === 'development' && statusCode >= 500 && err?.stack && { stack: err.stack }),
  });
};
