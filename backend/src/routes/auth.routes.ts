import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import rateLimit from 'express-rate-limit';

const router = Router();
const authController = new AuthController();

// =====================================================================
// Rate Limit: ป้องกัน Brute-force โจมตีหน้า Login/Register
// เหตุผล: ถ้าไม่ใส่ผู้ไม่หวังดีสามารถทดลอง password ได้ไม่จำกัดครั้ง
//         15 นาที / 20 ครั้ง เพียงพอสำหรับการใช้งานปกติ แต่ทำ brute-force ไม่ได้
// =====================================================================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 นาที
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่' },
  skipSuccessfulRequests: true, // นับเฉพาะ request ที่ล้มเหลว
});

router.post('/login',    authLimiter, authController.login);
router.post('/register', authLimiter, authController.register);
router.get('/check-availability', authController.checkAvailability);
router.get('/member-types', authController.getMemberTypes);
router.post('/logout', requireAuth, authController.logout);
router.get('/me',      requireAuth, authController.getMe);

export default router;
