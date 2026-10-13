import { z } from 'zod';

// imageUrl รับทั้ง URL และ data URL (base64) ที่หน้า Admin อัปโหลด — ตรวจรายละเอียดใน CourtService
export const courtCreateSchema = z.object({
  sportTypeId: z.number().int().positive(),
  name: z.string().trim().min(2, 'ชื่อสนามต้องมีอย่างน้อย 2 ตัวอักษร').max(100),
  code: z.string().trim().min(2, 'กรุณาระบุรหัสสนาม').max(20),
  locationDetails: z.string().trim().max(255).optional(),
  hourlyRate: z.number().min(0, 'ราคาต่อชั่วโมงต้องไม่ติดลบ').max(99_999_999),
  imageUrl: z.string().optional(),
  status: z.enum(['AVAILABLE', 'MAINTENANCE', 'CLOSED']).default('AVAILABLE'),
});

export const courtUpdateSchema = z.object({
  sportTypeId: z.number().int().positive().optional(),
  name: z.string().trim().min(2).max(100).optional(),
  code: z.string().trim().min(2).max(20).optional(),
  locationDetails: z.string().trim().max(255).optional(),
  hourlyRate: z.number().min(0).max(99_999_999).optional(),
  imageUrl: z.string().nullable().optional(),
  status: z.enum(['AVAILABLE', 'MAINTENANCE', 'CLOSED']).optional(),
});
