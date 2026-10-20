import { z } from 'zod';
import { DATE_REGEX, END_TIME_REGEX, START_TIME_REGEX } from './booking.validator';

const optionalTime = (regex: RegExp) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || regex.test(v), 'รูปแบบเวลาไม่ถูกต้อง (HH:MM)');

export const sportSchema = z.object({
  name: z.string().trim().min(2, 'ชื่อประเภทกีฬาต้องมีอย่างน้อย 2 ตัวอักษร').max(50),
  description: z.string().trim().max(255).optional(),
  isActive: z.boolean().optional().default(true),
});

export const equipmentAdminSchema = z.object({
  sportTypeId: z.number().int().positive('กรุณาเลือกประเภทกีฬา'),
  name: z.string().trim().min(2, 'กรุณาระบุชื่ออุปกรณ์').max(100),
  totalQuantity: z.number().int().min(1, 'จำนวนทั้งหมดต้องอย่างน้อย 1'),
  rentalFee: z.number().min(0, 'ค่าเช่าต้องไม่ติดลบ'),
  depositFee: z.number().min(0).optional().default(0),
  fineRatePerDay: z.number().min(0).optional().default(0),
  replacementCost: z.number().min(0, 'ราคาประเมินต้องไม่ติดลบ'),
});

// แก้ไขอุปกรณ์: จำนวนทั้งหมดเป็น 0 ได้ (เลิกใช้งานรายการโดยไม่ลบประวัติการจอง/ยืม)
export const equipmentUpdateSchema = equipmentAdminSchema.extend({
  totalQuantity: z.number().int().min(0, 'จำนวนทั้งหมดต้องไม่ติดลบ'),
});

export const promotionAdminSchema = z
  .object({
    code: z.string().trim().min(3, 'โค้ดต้องมีอย่างน้อย 3 ตัวอักษร').max(50).toUpperCase(),
    title: z.string().trim().min(3, 'กรุณาระบุชื่อโปรโมชั่น').max(100),
    discountType: z.enum(['PERCENT', 'FIXED']),
    discountValue: z.number().positive('ส่วนลดต้องมากกว่า 0'),
    minBookingHours: z.number().int().min(1).default(1),
    startDate: z.string().regex(DATE_REGEX, 'วันเริ่มไม่ถูกต้อง (YYYY-MM-DD)'),
    endDate: z.string().regex(DATE_REGEX, 'วันสิ้นสุดไม่ถูกต้อง (YYYY-MM-DD)'),
    startTime: optionalTime(START_TIME_REGEX),
    endTime: optionalTime(END_TIME_REGEX),
    isActive: z.boolean().optional().default(true),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม',
    path: ['endDate'],
  });

export const pricingRateSchema = z.object({
  courtId: z.number().int().positive().optional(),
  sportTypeId: z.number().int().positive().optional(),
  memberTypeId: z.number().int().positive().optional(), // ไม่ระบุ = ทุกประเภทสมาชิก
  dayType: z.enum(['WEEKDAY', 'WEEKEND', 'HOLIDAY']),
  startTime: z.string().regex(START_TIME_REGEX, 'เวลาเริ่มไม่ถูกต้อง (HH:MM)'),
  endTime: z.string().regex(END_TIME_REGEX, 'เวลาสิ้นสุดไม่ถูกต้อง (HH:MM)'),
  hourlyRate: z.number().positive('ราคาต่อชั่วโมงต้องมากกว่า 0'),
});

export type CreateSportInput = z.infer<typeof sportSchema>;
export type CreateEquipmentInput = z.infer<typeof equipmentAdminSchema>;
export type UpdateEquipmentInput = z.infer<typeof equipmentUpdateSchema>;
export type CreatePromotionInput = z.infer<typeof promotionAdminSchema>;
export type CreatePricingRateInput = z.infer<typeof pricingRateSchema>;
