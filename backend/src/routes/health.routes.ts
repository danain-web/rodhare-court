import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';

const router = Router();
const healthController = new HealthController();

router.get('/', healthController.getHealth);
router.get('/test-error', healthController.testError);

export default router;
