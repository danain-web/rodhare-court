import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { MaintenanceService } from '../services/maintenance.service';
import { AppError } from '../utils/appError';
import { sendSuccess } from '../utils/response';

const router = Router();
const maintenanceService = new MaintenanceService();

// endpoint สำหรับตัวตั้งเวลาภายนอก (เช่น cron-job.org) — ปลุก Render ที่หลับและรันงานเบื้องหลัง
// ป้องกันด้วย CRON_SECRET (ส่งในส่วนหัว x-cron-secret) · ไม่ตั้ง CRON_SECRET = ปิด endpoint (ตอบ 404)
// เปรียบเทียบแบบ timing-safe กันเดาความลับจากเวลาตอบสนอง
const requireCronSecret = (req: Request, _res: Response, next: NextFunction) => {
  const expected = config.cronSecret;
  if (!expected) return next(AppError.notFound());
  const given = req.get('x-cron-secret') ?? '';
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) return next(AppError.unauthorized('invalid cron secret'));
  next();
};

router.post('/internal/cron/tick', requireCronSecret, async (_req: Request, res: Response) => {
  const result = await maintenanceService.runAll();
  return sendSuccess(res, result, 'Cron tick completed');
});

export default router;
