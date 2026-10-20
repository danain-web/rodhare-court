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
  password: z.string().min(10, 'รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร').max(100),
  firstName: z.string().trim().min(1, 'กรุณากรอกชื่อ').max(100),
  lastName: z.string().trim().min(1, 'กรุณากรอกนามสกุล').max(100),
  phone: z.string().trim().max(20, 'เบอร์โทรยาวเกิน 20 ตัวอักษร').optional(),
  // ไม่รับ memberTypeId จากผู้สมัคร: ประเภทสมาชิก (ส่วนลดนักศึกษา/บุคลากร) ต้องพิสูจน์ได้
  // สมัครด้วยรหัสผ่านทุกคนเป็นบุคคลภายนอก · ได้สิทธิ์นักศึกษาผ่านการเข้าสู่ระบบด้วย Google (อีเมลที่ Google ยืนยันแล้ว)
});

// ID token (JWT) จาก Google Identity Services — ยาวหลายร้อยตัวอักษร
export const googleCredentialSchema = z.object({
  credential: z.string().trim().min(20, 'ไม่พบข้อมูลยืนยันจาก Google').max(4096),
});

const newPasswordField = z.string().min(10, 'รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร').max(100);

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง').max(100),
});

// โทเคนที่ระบบออกให้เป็น hex 64 ตัว (randomBytes 32) — ตรวจรูปแบบก่อนแตะฐานข้อมูล
export const resetPasswordSchema = z.object({
  token: z.string().trim().regex(/^[a-f0-9]{64}$/, 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง'),
  password: newPasswordField,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'กรุณากรอกรหัสผ่านปัจจุบัน').max(100),
  newPassword: newPasswordField,
});

export const availabilitySchema =z.object({
  username: z.string().trim().max(50).optional(),
  email: z.string().trim().max(100).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
