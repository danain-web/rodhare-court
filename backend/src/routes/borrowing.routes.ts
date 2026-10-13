import { Router } from 'express';
import { BorrowingController } from '../controllers/borrowing.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();
const borrowingController = new BorrowingController();

// Staff Protected Routes (STAFF or ADMIN)
router.post('/staff/equipment/borrow', requireAuth, requireRole('STAFF', 'ADMIN'), borrowingController.borrowEquipment);
router.post('/staff/equipment/return', requireAuth, requireRole('STAFF', 'ADMIN'), borrowingController.returnEquipment);
router.get('/staff/equipment/borrowings', requireAuth, requireRole('STAFF', 'ADMIN'), borrowingController.getBorrowingsByBooking);

// User Protected Fine Routes
router.get('/fines/my', requireAuth, borrowingController.getMyFines);
router.post('/fines/:id/pay', requireAuth, borrowingController.payFine);

export default router;
