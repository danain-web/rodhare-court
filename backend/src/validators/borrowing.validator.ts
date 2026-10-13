import { z } from 'zod';

export const borrowSchema = z.object({
  bookingNumber: z.string().trim().min(1, 'กรุณาระบุหมายเลขการจอง'),
  equipmentId: z.number().int().positive(),
  quantity: z.number().int().positive('จำนวนต้องอย่างน้อย 1').max(50),
});

export const returnSchema = z.object({
  borrowingId: z.number().int().positive(),
  condition: z.enum(['NORMAL', 'DAMAGED', 'LOST']),
  notes: z.string().trim().max(255).optional(),
});
