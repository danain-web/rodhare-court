import { Request, Response } from 'express';
import { BorrowingService } from '../services/borrowing.service';
import { borrowSchema, returnSchema } from '../validators/borrowing.validator';
import { sendSuccess } from '../utils/response';
import { parseIdParam, parseOptionalIntQuery } from '../utils/params';
import { currentUser } from './helpers';

export class BorrowingController {
  private borrowingService = new BorrowingService();

  borrowEquipment = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const borrowing = await this.borrowingService.borrowEquipment(borrowSchema.parse(req.body), user.userId, req.ip);
    return sendSuccess(res, borrowing, 'Equipment borrowed successfully', 201);
  };

  returnEquipment = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const result = await this.borrowingService.returnEquipment(returnSchema.parse(req.body), user.userId, req.ip);
    return sendSuccess(res, result, 'Equipment returned and condition processed successfully');
  };

  // ?bookingId=12 หรือ ?bookingNumber=BK-... (เดิมถ้าไม่ส่งมาจะใช้ booking 1 เสมอ)
  getBorrowingsByBooking = async (req: Request, res: Response) => {
    const borrowings = await this.borrowingService.getBorrowingsByBooking({
      bookingId: parseOptionalIntQuery(req.query.bookingId),
      bookingNumber: req.query.bookingNumber ? String(req.query.bookingNumber) : undefined,
    });
    return sendSuccess(res, borrowings, 'Borrowings list retrieved');
  };

  getMyFines = async (req: Request, res: Response) => {
    const user = currentUser(req);
    return sendSuccess(res, await this.borrowingService.getMyFines(user.userId), 'User fines list retrieved');
  };

  payFine = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const fine = await this.borrowingService.payFine(parseIdParam(req), user.userId, req.ip);
    return sendSuccess(res, fine, 'Fine paid successfully');
  };
}
