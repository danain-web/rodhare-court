import { z } from 'zod';

export const updateUserSchema = z
  .object({
    isActive: z.boolean().optional(),
    role: z.string().trim().min(1).max(50).optional(),
    memberTypeId: z.number().int().positive().optional(),
  })
  .refine((v) => v.isActive !== undefined || v.role !== undefined || v.memberTypeId !== undefined, {
    message: 'ต้องระบุสิ่งที่ต้องการเปลี่ยนอย่างน้อยหนึ่งอย่าง',
  });

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.string().trim().max(50).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
