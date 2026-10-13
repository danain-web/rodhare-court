import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import roleRoutes from './role.routes';
import courtRoutes from './court.routes';
import bookingRoutes from './booking.routes';
import borrowingRoutes from './borrowing.routes';
import paymentRoutes from './payment.routes';
import refundRoutes from './refund.routes';
import adminRoutes from './admin.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/', adminRoutes);
router.use('/', refundRoutes);
router.use('/', paymentRoutes);
router.use('/', borrowingRoutes);
router.use('/', bookingRoutes);
router.use('/', courtRoutes);
router.use('/', roleRoutes);

export default router;

