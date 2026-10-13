import { z } from 'zod';
import { SLIP_ALLOWED_TYPES } from '../utils/slipStorage';

// ค่าที่อนุญาตต้องตรงกับ CHECK chk_pay_method ในฐานข้อมูล (เดิมรับ string อะไรก็ได้ -> ORA-02290)
export const PAYMENT_METHODS = ['PROMPTPAY', 'BANK_TRANSFER', 'SLIP_TRANSFER', 'CASH'] as const;

// ไฟล์สลิปส่งมาเป็น base64 (ตรวจ magic bytes / ขนาดจริงอีกครั้งใน utils/slipStorage)
const slipFileSchema = z.object({
  fileName: z.string().trim().max(255).optional(),
  mimeType: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => [...SLIP_ALLOWED_TYPES, 'image/jpg'].includes(v as any), 'ประเภทไฟล์ไม่ถูกต้อง: รองรับเฉพาะ JPG, PNG หรือ WEBP'),
  dataBase64: z.string().min(1, 'กรุณาแนบไฟล์สลิป').max(7_200_000, 'ไฟล์สลิปต้องมีขนาดไม่เกิน 5 MB'),
});

export const createPaymentSchema = z
  .object({
    bookingId: z.number().int().positive(),
    amount: z.number().positive('จำนวนเงินต้องมากกว่า 0').max(99_999_999),
    paymentMethod: z.enum(PAYMENT_METHODS).default('PROMPTPAY'),
    slipFile: slipFileSchema.optional(),
    // ทางเลือกเดิม: แนบลิงก์รูปสลิป (ระบบอ่านภาพจากลิงก์ไม่ได้ จึงส่งเข้าคิวให้พนักงานตรวจเสมอ)
    slipUrl: z
      .string()
      .trim()
      .max(500, 'URL ของสลิปยาวเกิน 500 ตัวอักษร')
      .regex(/^https?:\/\/\S+$/i, 'URL ของสลิปต้องขึ้นต้นด้วย http:// หรือ https://')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    slipReference: z
      .string()
      .trim()
      .max(50, 'เลขอ้างอิงสลิปยาวเกิน 50 ตัวอักษร')
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine((v) => v.slipFile || v.slipUrl, { message: 'กรุณาแนบไฟล์สลิปการโอนเงิน', path: ['slipFile'] });

export const rejectPaymentSchema = z.object({
  reason: z.string().trim().min(3, 'กรุณาระบุเหตุผลการปฏิเสธอย่างน้อย 3 ตัวอักษร').max(255),
});

export type CreatePaymentPayload = z.infer<typeof createPaymentSchema>;
