import { withConnection, withTransaction } from '../config/db';
import { AdminRepository } from '../repositories/admin.repository';
import { insertAudit } from '../repositories/shared.repository';
import {
  CreateSportInput,
  CreateEquipmentInput,
  UpdateEquipmentInput,
  CreatePromotionInput,
  CreatePricingRateInput,
} from '../validators/admin.validator';
import { AppError } from '../utils/appError';

// ลบข้อมูลที่ยังมีข้อมูลอื่นอ้างอิง (FK) → ตอบ 409 พร้อมคำแนะนำ แทนข้อความทั่วไปของฐานข้อมูล
const withDeleteGuard = async <T>(run: () => Promise<T>, hint: string): Promise<T> => {
  try {
    return await run();
  } catch (err: any) {
    if (err?.code === '23503') throw AppError.conflict(hint);
    throw err;
  }
};

const assertPromotionInput = (input: CreatePromotionInput) => {
  if (input.startDate > input.endDate) {
    throw AppError.badRequest('วันสิ้นสุดโปรโมชั่นต้องไม่ก่อนวันเริ่ม');
  }
  if ((input.startTime && !input.endTime) || (!input.startTime && input.endTime)) {
    throw AppError.badRequest('ต้องระบุเวลาเริ่มและเวลาสิ้นสุดของโปรโมชั่นให้ครบทั้งคู่');
  }
  if (input.startTime && input.endTime && input.endTime <= input.startTime) {
    throw AppError.badRequest('เวลาสิ้นสุดโปรโมชั่นต้องมากกว่าเวลาเริ่ม');
  }
  if (input.discountType === 'PERCENT' && input.discountValue > 100) {
    throw AppError.badRequest('ส่วนลดแบบเปอร์เซ็นต์ต้องไม่เกิน 100%');
  }
};

const assertPricingRateInput = (input: CreatePricingRateInput) => {
  if (!input.courtId && !input.sportTypeId) {
    throw AppError.badRequest('ต้องระบุ courtId หรือ sportTypeId อย่างใดอย่างหนึ่ง');
  }
  if (input.endTime <= input.startTime) {
    throw AppError.badRequest('เวลาสิ้นสุดของอัตราราคาต้องมากกว่าเวลาเริ่ม');
  }
};

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

  async updateSport(adminUserId: number, sportTypeId: number, input: CreateSportInput, ipAddress?: string) {
    return withTransaction(async (conn) => {
      const before = await this.adminRepo.getSportById(conn, sportTypeId);
      if (!before) throw AppError.notFound('ไม่พบประเภทกีฬา');
      await this.adminRepo.updateSport(conn, sportTypeId, input);
      const after = (await this.adminRepo.getSportById(conn, sportTypeId))!;
      await insertAudit(conn, { userId: adminUserId, action: 'UPDATE_SPORT', entityName: 'SPORT_TYPES', entityId: sportTypeId, oldValues: before, newValues: after, ipAddress });
      return after;
    }, adminUserId);
  }

  // ลบได้เฉพาะประเภทกีฬาที่ยังไม่มีสนามหรืออุปกรณ์ใช้อยู่ · ไม่งั้นแนะนำให้ปิดใช้งานแทน
  async deleteSport(adminUserId: number, sportTypeId: number, ipAddress?: string) {
    await withDeleteGuard(
      () =>
        withTransaction(async (conn) => {
          const before = await this.adminRepo.getSportById(conn, sportTypeId);
          if (!before) throw AppError.notFound('ไม่พบประเภทกีฬา');
          await this.adminRepo.deleteSport(conn, sportTypeId);
          await insertAudit(conn, { userId: adminUserId, action: 'DELETE_SPORT', entityName: 'SPORT_TYPES', entityId: sportTypeId, oldValues: before, ipAddress });
        }, adminUserId),
      'ลบประเภทกีฬานี้ไม่ได้ เพราะยังมีสนามหรืออุปกรณ์ใช้ประเภทนี้อยู่ — ย้าย/ลบสนามและอุปกรณ์เหล่านั้นก่อน หรือปิดใช้งานประเภทนี้ (แก้ไข → ปิดการใช้งาน) เพื่อซ่อนจากตัวกรองฝั่งลูกค้า'
    );
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

  // แก้ไขอุปกรณ์: ปรับจำนวนทั้งหมดได้ แต่ต้องไม่ต่ำกว่าจำนวนที่ถูกจอง/ยืมอยู่ในขณะนี้
  async updateEquipment(adminUserId: number, equipmentId: number, input: UpdateEquipmentInput, ipAddress?: string) {
    return withTransaction(async (conn) => {
      await this.adminRepo.lockEquipment(conn, equipmentId);
      const before = await this.adminRepo.getEquipmentById(conn, equipmentId);
      if (!before) throw AppError.notFound('ไม่พบอุปกรณ์');
      const inUse = before.totalQuantity - before.availableQuantity;
      if (input.totalQuantity < inUse) {
        throw AppError.conflict(`ลดจำนวนทั้งหมดเหลือ ${input.totalQuantity} ชิ้นไม่ได้ เพราะขณะนี้มีอุปกรณ์ถูกจอง/ยืมอยู่ ${inUse} ชิ้น`);
      }
      await this.adminRepo.updateEquipment(conn, equipmentId, input);
      const after = (await this.adminRepo.getEquipmentById(conn, equipmentId))!;
      await insertAudit(conn, { userId: adminUserId, action: 'UPDATE_EQUIPMENT', entityName: 'EQUIPMENT', entityId: equipmentId, oldValues: before, newValues: after, ipAddress });
      return after;
    }, adminUserId);
  }

  // ลบได้เฉพาะอุปกรณ์ที่ไม่เคยถูกจองหรือยืม · ไม่งั้นแนะนำให้ตั้งจำนวนเป็น 0 เพื่อเลิกใช้งาน (คงประวัติไว้)
  async deleteEquipment(adminUserId: number, equipmentId: number, ipAddress?: string) {
    await withDeleteGuard(
      () =>
        withTransaction(async (conn) => {
          const before = await this.adminRepo.getEquipmentById(conn, equipmentId);
          if (!before) throw AppError.notFound('ไม่พบอุปกรณ์');
          await this.adminRepo.deleteEquipment(conn, equipmentId);
          await insertAudit(conn, { userId: adminUserId, action: 'DELETE_EQUIPMENT', entityName: 'EQUIPMENT', entityId: equipmentId, oldValues: before, ipAddress });
        }, adminUserId),
      'ลบอุปกรณ์นี้ไม่ได้ เพราะมีประวัติการจองหรือยืมแล้ว — ให้แก้ไขจำนวนทั้งหมดเป็น 0 เพื่อเลิกใช้งานแทน'
    );
  }

  // ---------------- BR14: เฉพาะ Admin กำหนดโปรโมชั่น / BR15: ช่วงวันที่และเวลา ----------------
  async getPromotions() {
    return withConnection((conn) => this.adminRepo.getPromotions(conn));
  }

  async updatePromotion(adminUserId: number, promotionId: number, input: CreatePromotionInput, ipAddress?: string) {
    assertPromotionInput(input);
    return withTransaction(async (conn) => {
      const before = await this.adminRepo.getPromotionById(conn, promotionId);
      if (!before) throw AppError.notFound('ไม่พบโปรโมชั่น');
      await this.adminRepo.updatePromotion(conn, promotionId, input);
      const after = (await this.adminRepo.getPromotionById(conn, promotionId))!;
      await insertAudit(conn, { userId: adminUserId, action: 'UPDATE_PROMOTION', entityName: 'PROMOTIONS', entityId: promotionId, oldValues: before, newValues: after, ipAddress });
      return after;
    }, adminUserId);
  }

  // ลบได้เฉพาะโปรโมชั่นที่ยังไม่เคยถูกใช้กับการจอง · ไม่งั้นแนะนำให้ปิดใช้งานแทน
  async deletePromotion(adminUserId: number, promotionId: number, ipAddress?: string) {
    await withDeleteGuard(
      () =>
        withTransaction(async (conn) => {
          const before = await this.adminRepo.getPromotionById(conn, promotionId);
          if (!before) throw AppError.notFound('ไม่พบโปรโมชั่น');
          await this.adminRepo.deletePromotion(conn, promotionId);
          await insertAudit(conn, { userId: adminUserId, action: 'DELETE_PROMOTION', entityName: 'PROMOTIONS', entityId: promotionId, oldValues: before, ipAddress });
        }, adminUserId),
      'ลบโปรโมชั่นนี้ไม่ได้ เพราะเคยถูกใช้กับการจองแล้ว — ให้แก้ไขเป็น "ปิดการใช้งาน" แทน'
    );
  }

  async createPromotion(adminUserId: number, input: CreatePromotionInput, ipAddress?: string) {
    assertPromotionInput(input);
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

  async updatePricingRate(adminUserId: number, rateId: number, input: CreatePricingRateInput, ipAddress?: string) {
    assertPricingRateInput(input);
    return withTransaction(async (conn) => {
      const before = await this.adminRepo.getPricingRateById(conn, rateId);
      if (!before) throw AppError.notFound('ไม่พบอัตราราคา');
      const overlapId = await this.adminRepo.findOverlappingRate(conn, input, rateId);
      if (overlapId) throw AppError.conflict(`ช่วงเวลาของอัตราราคาทับกับอัตราเดิม (rate #${overlapId})`);
      await this.adminRepo.updatePricingRate(conn, rateId, input);
      const after = (await this.adminRepo.getPricingRateById(conn, rateId))!;
      await insertAudit(conn, { userId: adminUserId, action: 'UPDATE_PRICING_RATE', entityName: 'PRICING_RATES', entityId: rateId, oldValues: before, newValues: after, ipAddress });
      return after;
    }, adminUserId);
  }

  // อัตราราคาไม่มีข้อมูลอื่นอ้างอิง (ราคาที่จองไปแล้วเก็บในการจองเอง) จึงลบได้เลย
  async deletePricingRate(adminUserId: number, rateId: number, ipAddress?: string) {
    return withTransaction(async (conn) => {
      const before = await this.adminRepo.getPricingRateById(conn, rateId);
      if (!before) throw AppError.notFound('ไม่พบอัตราราคา');
      await this.adminRepo.deletePricingRate(conn, rateId);
      await insertAudit(conn, { userId: adminUserId, action: 'DELETE_PRICING_RATE', entityName: 'PRICING_RATES', entityId: rateId, oldValues: before, ipAddress });
    }, adminUserId);
  }

  async createPricingRate(adminUserId: number, input: CreatePricingRateInput, ipAddress?: string) {
    assertPricingRateInput(input);
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
