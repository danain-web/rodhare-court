import { Request, Response } from 'express';
import { RefundService } from '../services/refund.service';
import { updateBookingSchema, cancelRefundSchema, reviewRefundSchema, rejectRefundSchema } from '../validators/refund.validator';
import { sendSuccess } from '../utils/response';
import { parseIdParam } from '../utils/params';
import { currentUser } from './helpers';

export class RefundController {
  private refundService = new RefundService();

  // BR5: แก้ไขวัน/เวลาได้ก่อนเวลาใช้งานอย่างน้อย 24 ชม.
  updateBooking = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const updated = await this.refundService.updateBooking(parseIdParam(req), user.userId, updateBookingSchema.parse(req.body), req.ip);
    return sendSuccess(res, updated, 'Booking schedule updated successfully (BR5 >= 24h)');
  };

  previewCancelRefund = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const preview = await this.refundService.previewCancelRefund(parseIdParam(req), user.userId, user.roles);
    return sendSuccess(res, preview, 'Refund preview calculated (BR12)');
  };

  executeCancelWithRefund = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { reason } = cancelRefundSchema.parse(req.body || {});
    const result = await this.refundService.executeCancelWithRefund(parseIdParam(req), user.userId, reason, user.roles, req.ip);
    return sendSuccess(
      res,
      result,
      result.refundRequest ? 'Booking cancelled and refund request submitted (BR12)' : 'Booking cancelled (no refundable amount)'
    );
  };

  getMyRefunds = async (req: Request, res: Response) => {
    const user = currentUser(req);
    return sendSuccess(res, await this.refundService.getMyRefunds(user.userId), 'User refund requests retrieved');
  };

  getPendingRefunds = async (_req: Request, res: Response) => {
    return sendSuccess(res, await this.refundService.getPendingRefunds(), 'Pending refund requests retrieved');
  };

  approveRefund = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { note } = reviewRefundSchema.parse(req.body || {});
    const refund = await this.refundService.approveRefund(parseIdParam(req), user.userId, note, req.ip);
    return sendSuccess(res, refund, 'Refund request approved successfully');
  };

  rejectRefund = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { note } = rejectRefundSchema.parse(req.body || {});
    const refund = await this.refundService.rejectRefund(parseIdParam(req), user.userId, note, req.ip);
    return sendSuccess(res, refund, 'Refund request rejected');
  };
}
