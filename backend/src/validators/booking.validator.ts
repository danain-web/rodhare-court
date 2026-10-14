import { z } from 'zod';

export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const START_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
export const END_TIME_REGEX = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

export const bookingEquipmentItemSchema = z.object({
  equipmentId: z.number().int().positive('รหัสอุปกรณ์ไม่ถูกต้อง'),
  quantity: z.number().int().positive('จำนวนอุปกรณ์ต้องอย่างน้อย 1').max(50, 'จำนวนอุปกรณ์ต่อรายการต้องไม่เกิน 50'),
});

const optionalCode = z
  .string()
  .trim()
  .max(50)
  .optional()
  .transform((v) => (v ? v : undefined));

export const createBookingSchema = z.object({
  courtId: z.number().int().positive('กรุณาเลือกสนาม'),
  bookingDate: z.string().regex(DATE_REGEX, 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)'),
  startTime: z.string().regex(START_TIME_REGEX, 'เวลาเริ่มไม่ถูกต้อง (HH:MM)'),
  endTime: z.string().regex(END_TIME_REGEX, 'เวลาสิ้นสุดไม่ถูกต้อง (HH:MM)'),
  equipmentItems: z.array(bookingEquipmentItemSchema).max(20).optional().default([]),
  promotionCode: optionalCode,
});

export const checkInSchema = z.object({
  bookingNumber: z.string().trim().min(1, 'กรุณาระบุหมายเลขการจอง'),
});

export type CreateBookingPayload = z.infer<typeof createBookingSchema>;
