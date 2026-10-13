import { Request, Response } from 'express';
import { PaymentService } from '../services/payment.service';
import { rejectPaymentSchema } from '../validators/payment.validator';
import { sendSuccess } from '../utils/response';
import { parseIdParam } from '../utils/params';
import { currentUser } from './helpers';
import { AppError } from '../utils/appError';

export class PaymentController {
  private paymentService = new PaymentService();

  // =====================================================================
  // UC-4: ลูกค้าส่งสลิป → ตรวจอัตโนมัติ
  // เหตุผล: เปลี่ยนจาก JSON (base64) มาเป็น multipart/form-data + Multer
  //         เพื่อส่ง binary file โดยตรงโดยไม่ต้อง encode เป็น base64 (~33% ใหญ่กว่า)
  //         req.file.buffer มาจาก multer({ storage: memoryStorage() }) — ไม่บันทึกลง disk
  // =====================================================================
  submitPayment = async (req: Request, res: Response) => {
    const user = currentUser(req);

    // ตรวจว่ามีไฟล์หรือไม่ (Multer วาง file ไว้ที่ req.file)
    const slipFile = req.file;

    // รับข้อมูลจาก form fields (multipart form)
    const bookingId = parseInt(req.body.bookingId);
    const amount = parseFloat(req.body.amount);
    const paymentMethod = req.body.paymentMethod;
    const slipReference = req.body.slipReference?.trim() || undefined;
    const slipUrl = req.body.slipUrl?.trim() || undefined;

    if (!bookingId || isNaN(bookingId)) throw AppError.badRequest('bookingId ไม่ถูกต้อง');
    if (!amount || isNaN(amount) || amount <= 0) throw AppError.badRequest('amount ไม่ถูกต้อง');
    if (!['PROMPTPAY', 'BANK_TRANSFER', 'SLIP_TRANSFER', 'CASH'].includes(paymentMethod)) {
      throw AppError.badRequest('paymentMethod ไม่ถูกต้อง');
    }
    if (!slipFile && !slipUrl) throw AppError.badRequest('กรุณาแนบสลิปโอนเงิน (ไฟล์รูปภาพ) หรือระบุ slipUrl');

    const result = await this.paymentService.submitPayment(
      user.userId,
      {
        bookingId,
        amount,
        paymentMethod,
        slipBuffer: slipFile?.buffer,
        slipMimeType: slipFile?.mimetype,
        slipUrl,
        slipReference,
      },
      req.ip
    );

    const messages = {
      VERIFIED:      'ตรวจสลิปอัตโนมัติผ่าน — การจองยืนยันแล้ว (Paid) พร้อมออกใบเสร็จ',
      REJECTED:      'สลิปไม่ผ่านการตรวจสอบอัตโนมัติ',
      MANUAL_REVIEW: 'ภาพสลิปไม่ชัดเจน — ส่งคิวให้พนักงานตรวจ (Inspector Console)',
    };
    return sendSuccess(res, result, messages[result.result], 201);
  };

  // UC-7: คิวสลิปรอตรวจ (Inspector Console)
  getPendingPayments = async (_req: Request, res: Response) => {
    return sendSuccess(res, await this.paymentService.getPendingPayments(), 'Pending payments list retrieved');
  };

  verifyPayment = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const result = await this.paymentService.verifyPayment(parseIdParam(req), user.userId, req.ip);
    return sendSuccess(res, result, 'ตรวจสลิปอนุมัติแล้ว — การจองยืนยัน (Paid) และออกใบเสร็จเรียบร้อย');
  };

  rejectPayment = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { reason } = rejectPaymentSchema.parse(req.body);
    const notification = await this.paymentService.rejectPayment(parseIdParam(req), reason, user.userId, req.ip);
    return sendSuccess(res, { notification }, 'ปฏิเสธสลิปเรียบร้อย');
  };

  getReceiptByBooking = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const receipt = await this.paymentService.getReceiptByBookingId(parseIdParam(req, 'bookingId'), user.userId, user.roles);
    return sendSuccess(res, receipt, 'Receipt retrieved successfully');
  };

  getPaymentsByBooking = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const payments = await this.paymentService.getPaymentsByBooking(parseIdParam(req), user.userId, user.roles);
    return sendSuccess(res, payments, 'Booking payments retrieved');
  };

  getMyNotifications = async (req: Request, res: Response) => {
    const user = currentUser(req);
    return sendSuccess(res, await this.paymentService.getUserNotifications(user.userId), 'Notifications retrieved');
  };

  markNotificationRead = async (req: Request, res: Response) => {
    const user = currentUser(req);
    await this.paymentService.markNotificationRead(parseIdParam(req), user.userId);
    return sendSuccess(res, { success: true }, 'Notification marked as read');
  };
}
