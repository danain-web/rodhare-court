import { Request, Response } from 'express';
import { withConnection } from '../config/db';
import { EquipmentRepository } from '../repositories/equipment.repository';
import { assertPromotionUsable } from '../services/pricing.service';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/appError';
import { parseOptionalIntQuery } from '../utils/params';

export class EquipmentController {
  private equipmentRepository = new EquipmentRepository();

  getEquipment = async (req: Request, res: Response) => {
    const sportTypeId = parseOptionalIntQuery(req.query.sportTypeId);
    const equipment = await withConnection((conn) => this.equipmentRepository.getEquipment(conn, sportTypeId));
    return sendSuccess(res, equipment, 'Equipment list retrieved successfully');
  };

  // BR15: ตรวจโค้ดโปรโมชั่นเบื้องต้น (ช่วงเวลาที่จองจะถูกตรวจอีกครั้งตอนคำนวณราคา/สร้างการจอง)
  validatePromotion = async (req: Request, res: Response) => {
    const code = String(req.query.code || '').trim();
    if (!code) throw AppError.badRequest('กรุณาระบุโค้ดโปรโมชั่น');
    const promo = await withConnection((conn) => this.equipmentRepository.findPromotionByCode(conn, code));
    return sendSuccess(res, assertPromotionUsable(promo, code), 'Promotion code is valid');
  };
}
