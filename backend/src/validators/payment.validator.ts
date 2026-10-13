import { z } from 'zod';

// ช่องทางที่ลูกค้าส่งหลักฐานการโอนได้ (CASH ชำระที่เคาน์เตอร์ ไม่ผ่าน endpoint นี้)
// ค่าต้องเป็นสับเซตของ CHECK chk_pay_method ในฐานข้อมูล
export const CUSTOMER_PAYMENT_METHODS = ['PROMPTPAY', 'BANK_TRANSFER', 'SLIP_TRANSFER'] as const;

// เงินบาท: จำนวนเต็มไม่เกิน 8 หลัก ทศนิยมไม่เกิน 2 ตำแหน่ง — ไม่รับ NaN, Infinity, ค่าติดลบ, 1e3, "12abc"
const MONEY_RE = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;

// เลขอ้างอิงธุรกรรมจากสลิปธนาคาร/PromptPay (ตัด space และ - ออก แล้วเป็น A-Z0-9 8–30 ตัว)
export const SLIP_REF_RE = /^[A-Z0-9]{8,30}$/;
export const normalizeSlipRef = (ref: string) => ref.replace(/[\s-]/g, '').toUpperCase();

// =====================================================================
// ฟอร์มส่งสลิป (multipart/form-data → ทุก field เป็น string)
// .strict(): field อื่นนอกเหนือจากนี้ (เช่น status, slipUrl, verified) ถูกปฏิเสธ → กัน mass assignment
// =====================================================================
export const submitPaymentFormSchema = z
  .object({
    bookingId: z
      .string({ error: 'กรุณาระบุ bookingId' })
      .trim()
      .regex(/^[1-9]\d{0,9}$/, 'bookingId ไม่ถูกต้อง')
      .transform(Number),
    amount: z
      .string({ error: 'กรุณาระบุจำนวนเงินตามสลิป' })
      .trim()
      .regex(MONEY_RE, 'จำนวนเงินไม่ถูกต้อง (ตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง)')
      .transform(Number)
      .refine((v) => v > 0, 'จำนวนเงินต้องมากกว่า 0'),
    paymentMethod: z.enum(CUSTOMER_PAYMENT_METHODS, { error: 'paymentMethod ไม่ถูกต้อง' }).default('PROMPTPAY'),
    slipReference: z
      .string({ error: 'กรุณากรอกเลขอ้างอิงจากสลิป' })
      .max(60, 'เลขอ้างอิงสลิปยาวเกินไป')
      .transform(normalizeSlipRef)
      .pipe(z.string().regex(SLIP_REF_RE, 'เลขอ้างอิงสลิปต้องเป็นตัวอักษรภาษาอังกฤษหรือตัวเลข 8–30 ตัว ตามที่พิมพ์บนสลิป')),
  })
  .strict();

export const rejectPaymentSchema = z.object({
  reason: z.string().trim().min(3, 'กรุณาระบุเหตุผลการปฏิเสธอย่างน้อย 3 ตัวอักษร').max(255),
});

export type SubmitPaymentForm = z.infer<typeof submitPaymentFormSchema>;
