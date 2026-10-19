import { Router } from 'express';
import multer from 'multer';
import { PaymentController } from '../controllers/payment.controller';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { paymentUploadLimiter } from '../middleware/security.middleware';
import { SLIP_MAX_BYTES, SLIP_ALLOWED_TYPES } from '../utils/slipStorage';
import { AppError } from '../utils/appError';

const router = Router();
const paymentController = new PaymentController();

// =====================================================================
// Multer Memory Storage — รับไฟล์สลิปเข้า RAM โดยตรง (ไม่บันทึกลง disk)
// เหตุผล: Render free tier อาจไม่มี persistent disk → เก็บใน RAM แล้วส่งต่อ Supabase ทันที
//         fileFilter: ตรวจ MIME type จาก browser ก่อน (sniff ด้วย magic bytes ใน slipStorage อีกครั้ง)
//         limits.fileSize: กั้นไฟล์ใหญ่ก่อนเข้า Express (ลดโหลด memory)
// =====================================================================
const upload = multer({
  storage: multer.memoryStorage(),
  // ไฟล์เดียว ≤ 5 MB · field อื่นไม่เกิน 10 ช่อง ช่องละ ≤ 1 KB (กันส่งข้อมูลใหญ่จนกิน RAM)
  limits: { fileSize: SLIP_MAX_BYTES, files: 1, fields: 10, fieldSize: 1024, parts: 12 },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = SLIP_ALLOWED_TYPES as readonly string[];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(AppError.badRequest('ประเภทไฟล์ไม่ถูกต้อง รองรับเฉพาะ JPG, PNG, WEBP'));
    }
  },
});

// =====================================================================
// Customer Protected Routes (UC-4)
// upload.single('slip') → req.file = ไฟล์สลิป (field name = 'slip')
// =====================================================================
// paymentUploadLimiter ก่อน multer → คำขอที่เกินเพดานไม่ถูกอ่านไฟล์เข้า RAM เลย
router.post('/payments', requireAuth, paymentUploadLimiter, upload.single('slip'), paymentController.submitPayment);
router.get('/payments/instructions/:bookingId', requireAuth, paymentController.getPaymentInstructions);
router.get('/receipts/booking/:bookingId', requireAuth, paymentController.getReceiptByBooking);
router.get('/notifications/my', requireAuth, paymentController.getMyNotifications);
router.patch('/notifications/:id/read', requireAuth, paymentController.markNotificationRead);

// =====================================================================
// Staff Protected Routes (UC-7: Inspector Console)
// =====================================================================
router.get('/staff/payments/pending',       requireAuth, requirePermission('payment.verify'), paymentController.getPendingPayments);
router.post('/staff/payments/:id/verify',   requireAuth, requirePermission('payment.verify'), paymentController.verifyPayment);
router.post('/staff/payments/:id/reject',   requireAuth, requirePermission('payment.verify'), paymentController.rejectPayment);

export default router;
