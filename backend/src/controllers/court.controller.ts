import { Request, Response } from 'express';
import { CourtService } from '../services/court.service';
import { courtCreateSchema, courtUpdateSchema } from '../validators/court.validator';
import { sendSuccess } from '../utils/response';
import { parseIdParam, parseOptionalIntQuery } from '../utils/params';
import { todayLocalDate } from '../utils/datetime';
import { currentUser } from './helpers';

export class CourtController {
  private courtService = new CourtService();

  getSports = async (_req: Request, res: Response) => {
    return sendSuccess(res, await this.courtService.getSports(), 'Sports list retrieved successfully');
  };

  getCourts = async (req: Request, res: Response) => {
    const { search, status } = req.query;
    const courts = await this.courtService.getCourts({
      sportTypeId: parseOptionalIntQuery(req.query.sportTypeId),
      search: search ? String(search) : undefined,
      status: status ? String(status) : undefined,
      minPrice: parseOptionalIntQuery(req.query.minPrice),
      maxPrice: parseOptionalIntQuery(req.query.maxPrice),
    });
    return sendSuccess(res, courts, 'Courts list retrieved successfully');
  };

  getCourtById = async (req: Request, res: Response) => {
    return sendSuccess(res, await this.courtService.getCourtById(parseIdParam(req)), 'Court details retrieved successfully');
  };

  // วันที่ default = วันนี้ตามเวลาท้องถิ่น (เดิมใช้ toISOString ซึ่งเป็น UTC อาจได้วันก่อนหน้า)
  getCourtAvailability = async (req: Request, res: Response) => {
    const dateStr = req.query.date ? String(req.query.date) : todayLocalDate();
    const availability = await this.courtService.getCourtAvailability(parseIdParam(req), dateStr);
    return sendSuccess(res, availability, 'Real-time availability slots calculated successfully');
  };

  createCourt = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const court = await this.courtService.createCourt(user.userId, courtCreateSchema.parse(req.body), req.ip);
    return sendSuccess(res, court, 'Court created successfully', 201);
  };

  updateCourt = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const court = await this.courtService.updateCourt(user.userId, parseIdParam(req), courtUpdateSchema.parse(req.body), req.ip);
    return sendSuccess(res, court, 'Court updated successfully');
  };

  updateCourtImage = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { imageUrl } = req.body || {};
    const updated = await this.courtService.updateCourtImage(parseIdParam(req), user.userId, imageUrl, req.ip);
    return sendSuccess(res, updated, 'Court main image updated successfully');
  };

  deleteCourt = async (req: Request, res: Response) => {
    const user = currentUser(req);
    await this.courtService.softDeleteCourt(user.userId, parseIdParam(req), req.ip);
    return sendSuccess(res, { success: true }, 'Court soft deleted successfully');
  };
}
