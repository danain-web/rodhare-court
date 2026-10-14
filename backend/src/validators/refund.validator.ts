import { z } from 'zod';
import { bookingEquipmentItemSchema, DATE_REGEX, END_TIME_REGEX, START_TIME_REGEX } from './booking.validator';

// equipmentItems ไม่มีค่า default: ถ้าไม่ส่งมา = ใช้รายการอุปกรณ์เดิมของการจอง
export const updateBookingSchema = z.object({
  bookingDate: z.string().regex(DATE_REGEX, 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)'),
  startTime: z.string().regex(START_TIME_REGEX, 'เวลาเริ่มไม่ถูกต้อง (HH:MM)'),
  endTime: z.string().regex(END_TIME_REGEX, 'เวลาสิ้นสุดไม่ถูกต้อง (HH:MM)'),
  equipmentItems: z.array(bookingEquipmentItemSchema).max(20).optional(),
});

export const cancelRefundSchema = z.object({
  reason: z.string().trim().max(255).optional(),
});

export const reviewRefundSchema = z.object({
  note: z.string().trim().max(255).optional(),
});

export const rejectRefundSchema = z.object({
  note: z.string().trim().min(3, 'กรุณาระบุเหตุผลการปฏิเสธอย่างน้อย 3 ตัวอักษร').max(255),
});
