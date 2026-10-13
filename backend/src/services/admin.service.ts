import { withConnection, withTransaction } from '../config/db';
import { AdminRepository } from '../repositories/admin.repository';
import { insertAudit } from '../repositories/shared.repository';
import {
  CreateSportInput,
  CreateEquipmentInput,
  CreatePromotionInput,
  CreatePricingRateInput,
} from '../validators/admin.validator';
import { AppError } from '../utils/appError';

export class AdminService {
  private adminRepo = new AdminRepository();

  // ---------------- BR16: ดูประวัติย้อนหลัง ----------------
  async getAuditLogs(limit?: number) {
    return withConnection((conn) => this.adminRepo.getAuditLogs(conn, Math.min(Math.max(limit || 300, 1), 1000)));
  }

  async getMemberTypes() {
    return withConnection((conn) => this.adminRepo.getMemberTypes(conn));
  }

  async getSports() {
    return withConnection((conn) => this.adminRepo.getSports(conn));
  }

  async createSport(adminUserId: number, input: CreateSportInput, ipAddress?: string) {
    return withTransaction(async (conn) => {
      const sportTypeId = await this.adminRepo.createSport(conn, input.name, input.description, input.isActive);
      const sport = (await this.adminRepo.getSports(conn)).find((s) => s.sportTypeId === sportTypeId)!;
      await insertAudit(conn, {
        userId: adminUserId,
        action: 'CREATE_SPORT',
        entityName: 'SPORT_TYPES',
        entityId: sportTypeId,
        newValues: sport,
        ipAddress,
      });
      return sport;
    }, adminUserId);
  }

  async getEquipmentAdmin() {
    return withConnection((conn) => this.adminRepo.getEquipmentAdmin(conn));
  }

  async createEquipment(adminUserId: number, input: CreateEquipmentInput, ipAddress?: string) {
    return withTransaction(async (conn) => {
      const equipmentId = await this.adminRepo.createEquipment(conn, input);
      const eq = (await this.adminRepo.getEquipmentById(conn, equipmentId))!;
      await insertAudit(conn, {
        userId: adminUserId,
        action: 'CREATE_EQUIPMENT',
        entityName: 'EQUIPMENT',
        entityId: equipmentId,
        newValues: eq,
        ipAddress,
      });
      return eq;
    }, adminUserId);
  }

  // ---------------- BR14: เฉพาะ Admin กำหนดโปรโมชั่น / BR15: ช่วงวันที่และเวลา ----------------
  async getPromotions() {
    return withConnection((conn) => this.adminRepo.getPromotions(conn));
  }

  async createPromotion(adminUserId: number, input: CreatePromotionInput, ipAddress?: string) {
    if (input.startDate > input.endDate) {
      throw AppError.badRequest('BR15: วันสิ้นสุดโปรโมชั่นต้องไม่ก่อนวันเริ่ม');
    }
    if ((input.startTime && !input.endTime) || (!input.startTime && input.endTime)) {
      throw AppError.badRequest('BR15: ต้องระบุเวลาเริ่มและเวลาสิ้นสุดของโปรโมชั่นให้ครบทั้งคู่');
    }
    if (input.startTime && input.endTime && input.endTime <= input.startTime) {
      throw AppError.badRequest('BR15: เวลาสิ้นสุดโปรโมชั่นต้องมากกว่าเวลาเริ่ม');
    }
    if (input.discountType === 'PERCENT' && input.discountValue > 100) {
      throw AppError.badRequest('ส่วนลดแบบเปอร์เซ็นต์ต้องไม่เกิน 100%');
    }
    return withTransaction(async (conn) => {
      const promotionId = await this.adminRepo.createPromotion(conn, input);
      const promo = (await this.adminRepo.getPromotionById(conn, promotionId))!;
      await insertAudit(conn, {
        userId: adminUserId,
        action: 'CREATE_PROMOTION',
        entityName: 'PROMOTIONS',
        entityId: promotionId,
        newValues: promo,
        ipAddress,
      });
      return promo;
    }, adminUserId);
  }

  // ---------------- BR14: เฉพาะ Admin กำหนดอัตราค่าบริการ ----------------
  async getPricingRates() {
    return withConnection((conn) => this.adminRepo.getPricingRates(conn));
  }

  async createPricingRate(adminUserId: number, input: CreatePricingRateInput, ipAddress?: string) {
    if (!input.courtId && !input.sportTypeId) {
      throw AppError.badRequest('ต้องระบุ courtId หรือ sportTypeId อย่างใดอย่างหนึ่ง');
    }
    if (input.endTime <= input.startTime) {
      throw AppError.badRequest('เวลาสิ้นสุดของอัตราราคาต้องมากกว่าเวลาเริ่ม');
    }
    return withTransaction(async (conn) => {
      const overlapId = await this.adminRepo.findOverlappingRate(conn, input);
      if (overlapId) {
        throw AppError.conflict(`ช่วงเวลาของอัตราราคาทับกับอัตราเดิม (rate #${overlapId})`);
      }
      const rateId = await this.adminRepo.createPricingRate(conn, input);
      const rate = (await this.adminRepo.getPricingRates(conn)).find((r) => r.rateId === rateId)!;
      await insertAudit(conn, {
        userId: adminUserId,
        action: 'CREATE_PRICING_RATE',
        entityName: 'PRICING_RATES',
        entityId: rateId,
        newValues: rate,
        ipAddress,
      });
      return rate;
    }, adminUserId);
  }
}
