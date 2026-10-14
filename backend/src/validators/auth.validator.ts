import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'กรุณากรอกชื่อผู้ใช้หรืออีเมล'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร')
    .max(50)
    .regex(/^[A-Za-z0-9_.-]+$/, 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z, 0-9, _ . -'),
  email: z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง').max(100),
  password: z.string().min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร').max(100),
  firstName: z.string().trim().min(1, 'กรุณากรอกชื่อ').max(100),
  lastName: z.string().trim().min(1, 'กรุณากรอกนามสกุล').max(100),
  phone: z.string().trim().max(20, 'เบอร์โทรยาวเกิน 20 ตัวอักษร').optional(),
  // ประเภทสมาชิก (บุคคลภายนอก / นักศึกษา / บุคลากร) ใช้คำนวณส่วนลด ไม่ระบุ = บุคคลภายนอก
  memberTypeId: z.number().int().positive().optional(),
});

export const availabilitySchema = z.object({
  username: z.string().trim().max(50).optional(),
  email: z.string().trim().max(100).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
