import { Request, Response } from 'express';
import { BookingService } from '../services/booking.service';
import { RefundService } from '../services/refund.service';
import { createBookingSchema, checkInSchema } from '../validators/booking.validator';
import { cancelRefundSchema } from '../validators/refund.validator';
import { sendSuccess } from '../utils/response';
import { parseIdParam } from '../utils/params';
import { AppError } from '../utils/appError';
import { currentUser } from './helpers';

export class BookingController {
  private bookingService = new BookingService();
  private refundService = new RefundService();

  // ราคาเบื้องต้น (ถ้า login อยู่จะคิดส่วนลดตามประเภทสมาชิกให้ด้วย)
  calculatePrice = async (req: Request, res: Response) => {
    const input = createBookingSchema.parse(req.body);
    const pricing = await this.bookingService.calculatePrice(input, req.user?.userId);
    return sendSuccess(res, pricing, 'Price calculated successfully');
  };

  createBooking = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const input = createBookingSchema.parse(req.body);
    const booking = await this.bookingService.createBooking(user.userId, input, req.ip);
    return sendSuccess(res, booking, 'Booking created successfully — please pay within 15 minutes', 201);
  };

  getMyBookings = async (req: Request, res: Response) => {
    const user = currentUser(req);
    return sendSuccess(res, await this.bookingService.getMyBookings(user.userId), 'User bookings retrieved successfully');
  };

  getBookingById = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const booking = await this.bookingService.getBookingById(parseIdParam(req), user.userId, user.roles);
    return sendSuccess(res, booking, 'Booking details retrieved successfully');
  };

  // ยกเลิกการจอง: ใช้ขั้นตอนเดียวกับ cancel-refund (เดิมเส้นทางนี้ยกเลิกโดยไม่สร้างคำขอคืนเงินแม้ชำระแล้ว)
  cancelBooking = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { reason } = cancelRefundSchema.parse(req.body || {});
    const result = await this.refundService.executeCancelWithRefund(parseIdParam(req), user.userId, reason, user.roles, req.ip);
    return sendSuccess(res, result, 'Booking cancelled successfully');
  };

  // BR8: เช็คอิน (ลูกค้าเช็คอินการจองของตนเอง หรือพนักงานเช็คอินให้)
  checkIn = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const booking = await this.bookingService.checkIn({ bookingId: parseIdParam(req) }, user.userId, user.roles, req.ip);
    return sendSuccess(res, booking, 'Check-in successful');
  };

  staffCheckIn = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { bookingNumber } = checkInSchema.parse(req.body);
    const booking = await this.bookingService.checkIn({ bookingNumber }, user.userId, user.roles, req.ip);
    return sendSuccess(res, booking, 'Check-in successful');
  };

  lookupByNumber = async (req: Request, res: Response) => {
    const bookingNumber = String(req.query.bookingNumber || '').trim();
    if (!bookingNumber) throw AppError.badRequest('กรุณาระบุ bookingNumber');
    return sendSuccess(res, await this.bookingService.getBookingByNumber(bookingNumber), 'Booking found');
  };
}
