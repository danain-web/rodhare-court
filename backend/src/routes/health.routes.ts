import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';
import { config } from '../config/env';

const router = Router();
const healthController = new HealthController();

router.get('/', healthController.getHealth);
// endpoint ทดลอง error ใช้ตอนพัฒนาเท่านั้น — ไม่เปิดใน production
if (!config.isProduction) router.get('/test-error', healthController.testError);

export default router;
