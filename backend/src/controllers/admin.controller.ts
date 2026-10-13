import { Request, Response } from 'express';
import { AdminService } from '../services/admin.service';
import { sportSchema, equipmentAdminSchema, promotionAdminSchema, pricingRateSchema } from '../validators/admin.validator';
import { sendSuccess } from '../utils/response';
import { currentUser } from './helpers';
import { parseOptionalIntQuery } from '../utils/params';

// Express 5 ส่ง error จาก async handler ไปที่ errorHandler ให้อัตโนมัติ
export class AdminController {
  private adminService = new AdminService();

  getAuditLogs = async (req: Request, res: Response) => {
    const logs = await this.adminService.getAuditLogs(parseOptionalIntQuery(req.query.limit));
    return sendSuccess(res, logs, 'Audit logs retrieved');
  };

  getMemberTypes = async (_req: Request, res: Response) => {
    return sendSuccess(res, await this.adminService.getMemberTypes(), 'Member types retrieved');
  };

  getSports = async (_req: Request, res: Response) => {
    return sendSuccess(res, await this.adminService.getSports(), 'Sports categories retrieved');
  };

  createSport = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const sport = await this.adminService.createSport(user.userId, sportSchema.parse(req.body), req.ip);
    return sendSuccess(res, sport, 'Sport category created successfully', 201);
  };

  getEquipment = async (_req: Request, res: Response) => {
    return sendSuccess(res, await this.adminService.getEquipmentAdmin(), 'Admin equipment list retrieved');
  };

  createEquipment = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const eq = await this.adminService.createEquipment(user.userId, equipmentAdminSchema.parse(req.body), req.ip);
    return sendSuccess(res, eq, 'Equipment item created successfully', 201);
  };

  getPromotions = async (_req: Request, res: Response) => {
    return sendSuccess(res, await this.adminService.getPromotions(), 'Promotions list retrieved');
  };

  createPromotion = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const promo = await this.adminService.createPromotion(user.userId, promotionAdminSchema.parse(req.body), req.ip);
    return sendSuccess(res, promo, 'Promotion created successfully (BR14, BR15)', 201);
  };

  getPricingRates = async (_req: Request, res: Response) => {
    return sendSuccess(res, await this.adminService.getPricingRates(), 'Pricing rates retrieved');
  };

  createPricingRate = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const rate = await this.adminService.createPricingRate(user.userId, pricingRateSchema.parse(req.body), req.ip);
    return sendSuccess(res, rate, 'Pricing rate created successfully (BR14)', 201);
  };
}
