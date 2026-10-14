import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/security.middleware';

const router = Router();
const authController = new AuthController();

// Rate Limit กัน brute-force: ล้มเหลวเกิน 20 ครั้ง / 15 นาที ต่อ IP (ดู security.middleware.ts)

router.post('/login',    authLimiter, authController.login);
router.post('/register', authLimiter, authController.register);
router.get('/check-availability', authController.checkAvailability);
router.get('/member-types', authController.getMemberTypes);
router.post('/logout', requireAuth, authController.logout);
router.get('/me',      requireAuth, authController.getMe);

export default router;
