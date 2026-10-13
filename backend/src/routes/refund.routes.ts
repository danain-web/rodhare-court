import { Router } from 'express';
import { RefundController } from '../controllers/refund.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();
const refundController = new RefundController();

// Booking updates & cancellations (BR5, BR12)
router.put('/bookings/:id', requireAuth, refundController.updateBooking);
router.get('/bookings/:id/cancel-preview', requireAuth, refundController.previewCancelRefund);
router.post('/bookings/:id/cancel-refund', requireAuth, refundController.executeCancelWithRefund);

// Refunds management (UC-6)
router.get('/refunds/my', requireAuth, refundController.getMyRefunds);
router.get('/staff/refunds/pending', requireAuth, requireRole('STAFF', 'ADMIN'), refundController.getPendingRefunds);
router.post('/staff/refunds/:id/approve', requireAuth, requireRole('STAFF', 'ADMIN'), refundController.approveRefund);
router.post('/staff/refunds/:id/reject', requireAuth, requireRole('STAFF', 'ADMIN'), refundController.rejectRefund);

export default router;
