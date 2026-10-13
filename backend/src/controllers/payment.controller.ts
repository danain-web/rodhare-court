import { Request, Response } from 'express';
import { PaymentService } from '../services/payment.service';
import { rejectPaymentSchema, submitPaymentFormSchema } from '../validators/payment.validator';
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

    // บังคับแนบไฟล์สลิปเสมอ (ไม่รับลิงก์รูปจาก client — URL ภายนอกตรวจเนื้อหาไม่ได้และใช้ติดตามพนักงานได้)
    if (!req.file) throw AppError.badRequest('กรุณาแนบไฟล์รูปสลิปการโอนเงิน (JPG, PNG หรือ WEBP)');
    const form = submitPaymentFormSchema.parse(req.body);

    const result = await this.paymentService.submitPayment(
      user.userId,
      { ...form, slipBuffer: req.file.buffer, slipMimeType: req.file.mimetype },
      req.ip
    );

    const messages = {
      REJECTED:      'สลิปไม่ผ่านการตรวจสอบเบื้องต้น',
      MANUAL_REVIEW: 'ได้รับสลิปแล้ว — รอเจ้าหน้าที่ยืนยันยอดเงินเข้าบัญชี',
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

  getPaymentInstructions = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const result = await this.paymentService.getPaymentInstructions(parseIdParam(req, 'bookingId'), user.userId);
    return sendSuccess(res, result, 'Payment instructions retrieved');
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
