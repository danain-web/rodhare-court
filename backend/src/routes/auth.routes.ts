import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { authLimiter, loginAccountLimiter, availabilityLimiter, forgotPasswordLimiter } from '../middleware/security.middleware';

const router = Router();
const authController = new AuthController();

// Rate Limit กัน brute-force: ล้มเหลวเกิน 20 ครั้ง / 15 นาที ต่อ IP (ดู security.middleware.ts)

router.post('/login',    authLimiter, loginAccountLimiter, authController.login);
router.post('/register', authLimiter, authController.register);
router.post('/google',      authLimiter, authController.googleLogin);
router.post('/google/link', requireAuth, authLimiter, authController.linkGoogle);
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.post('/reset-password',  authLimiter, authController.resetPassword);
router.post('/change-password', requireAuth, authLimiter, authController.changePassword);
router.get('/check-availability', availabilityLimiter, authController.checkAvailability);
router.get('/member-types', authController.getMemberTypes);
router.post('/logout', requireAuth, authController.logout);
router.get('/me',      requireAuth, authController.getMe);

export default router;
