import { Request, Response } from 'express';
import { AdminService } from '../services/admin.service';
import { sportSchema, equipmentAdminSchema, equipmentUpdateSchema, promotionAdminSchema, pricingRateSchema } from '../validators/admin.validator';
import { sendSuccess } from '../utils/response';
import { currentUser } from './helpers';
import { parseIdParam, parseOptionalIntQuery } from '../utils/params';

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

  updateSport = async (req: Request, res: Response) => {
    const user = currentUser(req);
    return sendSuccess(res, await this.adminService.updateSport(user.userId, parseIdParam(req), sportSchema.parse(req.body), req.ip), 'Sport category updated');
  };

  deleteSport = async (req: Request, res: Response) => {
    const user = currentUser(req);
    await this.adminService.deleteSport(user.userId, parseIdParam(req), req.ip);
    return sendSuccess(res, { success: true }, 'Sport category deleted');
  };

  getEquipment = async (_req: Request, res: Response) => {
    return sendSuccess(res, await this.adminService.getEquipmentAdmin(), 'Admin equipment list retrieved');
  };

  createEquipment = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const eq = await this.adminService.createEquipment(user.userId, equipmentAdminSchema.parse(req.body), req.ip);
    return sendSuccess(res, eq, 'Equipment item created successfully', 201);
  };

  updateEquipment = async (req: Request, res: Response) => {
    const user = currentUser(req);
    return sendSuccess(res, await this.adminService.updateEquipment(user.userId, parseIdParam(req), equipmentUpdateSchema.parse(req.body), req.ip), 'Equipment item updated');
  };

  deleteEquipment = async (req: Request, res: Response) => {
    const user = currentUser(req);
    await this.adminService.deleteEquipment(user.userId, parseIdParam(req), req.ip);
    return sendSuccess(res, { success: true }, 'Equipment item deleted');
  };

  getPromotions = async (_req: Request, res: Response) => {
    return sendSuccess(res, await this.adminService.getPromotions(), 'Promotions list retrieved');
  };

  createPromotion = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const promo = await this.adminService.createPromotion(user.userId, promotionAdminSchema.parse(req.body), req.ip);
    return sendSuccess(res, promo, 'Promotion created successfully', 201);
  };

  updatePromotion = async (req: Request, res: Response) => {
    const user = currentUser(req);
    return sendSuccess(res, await this.adminService.updatePromotion(user.userId, parseIdParam(req), promotionAdminSchema.parse(req.body), req.ip), 'Promotion updated');
  };

  deletePromotion = async (req: Request, res: Response) => {
    const user = currentUser(req);
    await this.adminService.deletePromotion(user.userId, parseIdParam(req), req.ip);
    return sendSuccess(res, { success: true }, 'Promotion deleted');
  };

  updatePricingRate = async (req: Request, res: Response) => {
    const user = currentUser(req);
    return sendSuccess(res, await this.adminService.updatePricingRate(user.userId, parseIdParam(req), pricingRateSchema.parse(req.body), req.ip), 'Pricing rate updated');
  };

  deletePricingRate = async (req: Request, res: Response) => {
    const user = currentUser(req);
    await this.adminService.deletePricingRate(user.userId, parseIdParam(req), req.ip);
    return sendSuccess(res, { success: true }, 'Pricing rate deleted');
  };

  getPricingRates = async (_req: Request, res: Response) => {
    return sendSuccess(res, await this.adminService.getPricingRates(), 'Pricing rates retrieved');
  };

  createPricingRate = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const rate = await this.adminService.createPricingRate(user.userId, pricingRateSchema.parse(req.body), req.ip);
    return sendSuccess(res, rate, 'Pricing rate created successfully', 201);
  };
}
