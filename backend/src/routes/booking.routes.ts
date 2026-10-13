import { Router } from 'express';
import { BookingController } from '../controllers/booking.controller';
import { EquipmentController } from '../controllers/equipment.controller';
import { PaymentController } from '../controllers/payment.controller';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.middleware';

const router = Router();
const bookingController = new BookingController();
const equipmentController = new EquipmentController();
const paymentController = new PaymentController();

// Public / Helper Endpoints
router.get('/equipment', equipmentController.getEquipment);
router.get('/promotions/validate', equipmentController.validatePromotion);
router.post('/bookings/calculate-price', optionalAuth, bookingController.calculatePrice);

// Protected Booking Endpoints (BR1: ต้อง Login)
router.post('/bookings', requireAuth, bookingController.createBooking);
router.get('/bookings/my', requireAuth, bookingController.getMyBookings);
router.get('/bookings/:id', requireAuth, bookingController.getBookingById);
router.get('/bookings/:id/payments', requireAuth, paymentController.getPaymentsByBooking);
router.post('/bookings/:id/cancel', requireAuth, bookingController.cancelBooking);
router.post('/bookings/:id/check-in', requireAuth, bookingController.checkIn);

// Staff: ค้นหาการจองด้วยหมายเลข / เช็คอินหน้าเคาน์เตอร์ (UC-5, BR8)
router.get('/staff/bookings/lookup', requireAuth, requireRole('STAFF', 'ADMIN'), bookingController.lookupByNumber);
router.post('/staff/check-in', requireAuth, requireRole('STAFF', 'ADMIN'), bookingController.staffCheckIn);

export default router;
