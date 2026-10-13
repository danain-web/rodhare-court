import { DbConnection } from '../config/db';
import { CourtRepository } from '../repositories/court.repository';
import { EquipmentRepository } from '../repositories/equipment.repository';
import { BookingRepository } from '../repositories/booking.repository';
import { BookingEquipmentInput, EquipmentLine, PriceBreakdown, PromotionDTO } from '../types/booking';
import { PricingRateDTO } from '../types/court';
import { AppError } from '../utils/appError';
import { isWeekend, toMinutes, todayLocalDate, validateTimeRange } from '../utils/datetime';
import { round2 } from '../utils/params';

export interface PriceInput {
  courtId: number;
  sportTypeId: number;
  courtHourlyRate: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  equipmentItems?: BookingEquipmentInput[];
  promotionCode?: string;
  userId?: number;
  // ราคาอุปกรณ์ที่ตกลงไว้แล้ว (ตอนแก้ไขการจองให้ใช้ราคาเดิม ไม่ใช่ราคาปัจจุบัน)
  lockedEquipmentPrices?: Map<number, number>;
}

// รวมรายการอุปกรณ์ซ้ำ (เช่นส่ง equipmentId เดิมมา 2 ครั้ง) เพื่อไม่ชน UNIQUE (booking_id, equipment_id)
export const mergeEquipmentItems = (items: BookingEquipmentInput[] = []): BookingEquipmentInput[] => {
  const map = new Map<number, number>();
  for (const item of items) {
    if (!item || item.quantity <= 0) continue;
    map.set(item.equipmentId, (map.get(item.equipmentId) || 0) + item.quantity);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([equipmentId, quantity]) => ({ equipmentId, quantity }));
};

// BR15: โปรโมชั่นใช้ได้เฉพาะช่วงวันที่และเวลาที่กำหนด
export const assertPromotionUsable = (
  promo: PromotionDTO | null,
  code: string,
  ctx?: { bookingDate: string; startTime: string; endTime: string; durationHours: number }
): PromotionDTO => {
  if (!promo || !promo.isActive) {
    throw AppError.badRequest(`ไม่พบโค้ดโปรโมชั่น "${code}" หรือโปรโมชั่นถูกปิดใช้งาน`);
  }
  const today = todayLocalDate();
  if (today > promo.endDate) {
    throw AppError.badRequest(`BR15: โปรโมชั่น ${promo.code} หมดอายุแล้ว (ใช้ได้ถึง ${promo.endDate})`);
  }
  if (!ctx) {
    if (today < promo.startDate) {
      throw AppError.badRequest(`BR15: โปรโมชั่น ${promo.code} ยังไม่เริ่ม (เริ่ม ${promo.startDate})`);
    }
    return promo;
  }
  if (ctx.bookingDate < promo.startDate || ctx.bookingDate > promo.endDate) {
    throw AppError.badRequest(
      `BR15: โปรโมชั่น ${promo.code} ใช้ได้เฉพาะการจองวันที่ ${promo.startDate} ถึง ${promo.endDate}`
    );
  }
  if (promo.startTime && promo.endTime) {
    if (ctx.startTime < promo.startTime || ctx.endTime > promo.endTime) {
      throw AppError.badRequest(
        `BR15: โปรโมชั่น ${promo.code} ใช้ได้เฉพาะช่วงเวลา ${promo.startTime}-${promo.endTime} เท่านั้น`
      );
    }
  }
  if (ctx.durationHours < promo.minBookingHours) {
    throw AppError.badRequest(`โปรโมชั่น ${promo.code} ต้องจองอย่างน้อย ${promo.minBookingHours} ชั่วโมง`);
  }
  return promo;
};

export class PricingService {
  private courtRepository = new CourtRepository();
  private equipmentRepository = new EquipmentRepository();
  private bookingRepository = new BookingRepository();

  // ค่าสนาม: ใช้ PRICING_RATES ตามวัน (WEEKDAY/WEEKEND), ช่วงเวลา และประเภทสมาชิก
  // ลำดับ: อัตราเฉพาะสนาม > อัตราของประเภทกีฬา และในแต่ละระดับ อัตราของประเภทสมาชิกผู้จอง > อัตราทั่วไป
  // ช่วงที่ไม่มีอัตรากำหนดไว้ใช้ COURTS.hourly_rate
  async calculateCourtFee(conn: DbConnection, input: PriceInput & { memberTypeId?: number }): Promise<number> {
    // -1 = ไม่มีประเภทสมาชิก (ผู้ไม่ได้ล็อกอิน) -> ได้เฉพาะอัตราทั่วไป
    const rates = await this.courtRepository.getPricingRatesForCourt(conn, input.courtId, input.sportTypeId, input.memberTypeId ?? -1);
    const dayType = isWeekend(input.bookingDate) ? 'WEEKEND' : 'WEEKDAY';
    const applicable = rates.filter((r) => r.dayType === dayType);
    const isCourt = (r: PricingRateDTO) => r.courtId !== undefined && r.courtId !== null;
    const isMember = (r: PricingRateDTO) => r.memberTypeId !== undefined && r.memberTypeId !== null;
    const courtRates = [...applicable.filter((r) => isCourt(r) && isMember(r)), ...applicable.filter((r) => isCourt(r) && !isMember(r))];
    const sportRates = [...applicable.filter((r) => !isCourt(r) && isMember(r)), ...applicable.filter((r) => !isCourt(r) && !isMember(r))];

    const start = toMinutes(input.startTime);
    const end = toMinutes(input.endTime);
    let fee = 0;
    for (let m = start; m < end; m++) {
      const covers = (r: { startTime: string; endTime: string }) => toMinutes(r.startTime) <= m && m < toMinutes(r.endTime);
      const rate = courtRates.find(covers) || sportRates.find(covers);
      fee += (rate ? rate.hourlyRate : input.courtHourlyRate) / 60;
    }
    return round2(fee);
  }

  async calculate(conn: DbConnection, input: PriceInput): Promise<PriceBreakdown & { promotionId?: number }> {
    const minutes = validateTimeRange(input.startTime, input.endTime);
    const durationHours = round2(minutes / 60);

    // ประเภทสมาชิกของผู้จอง: ใช้เลือกอัตราราคา (PRICING_RATES.member_type_id) และส่วนลด (MEMBER_TYPES.discount_percent)
    const user = input.userId ? await this.bookingRepository.lockUser(conn, input.userId, false) : null;
    const courtFee = await this.calculateCourtFee(conn, { ...input, memberTypeId: user?.memberTypeId });

    // ค่าเช่าอุปกรณ์
    const equipmentDetails: EquipmentLine[] = [];
    for (const item of mergeEquipmentItems(input.equipmentItems)) {
      const eq = await this.equipmentRepository.getEquipmentById(conn, item.equipmentId);
      if (!eq) throw AppError.badRequest(`ไม่พบอุปกรณ์รหัส ${item.equipmentId}`);
      if (eq.sportTypeId !== input.sportTypeId) {
        throw AppError.badRequest(`อุปกรณ์ "${eq.name}" ไม่ใช่อุปกรณ์ของประเภทกีฬาของสนามนี้`);
      }
      const unit = input.lockedEquipmentPrices?.get(eq.equipmentId) ?? eq.rentalFee;
      equipmentDetails.push({
        equipmentId: eq.equipmentId,
        equipmentName: eq.name,
        quantity: item.quantity,
        unitRentalFee: unit,
        subtotal: round2(unit * item.quantity),
      });
    }
    const equipmentFee = round2(equipmentDetails.reduce((sum, e) => sum + e.subtotal, 0));

    // ส่วนลดตามสิทธิสมาชิก (MEMBER_TYPES.discount_percent) คิดจากค่าสนาม (UC-03)
    let memberDiscount = 0;
    if (user && user.discountPercent > 0) {
      memberDiscount = round2((courtFee * user.discountPercent) / 100);
    }

    // ส่วนลดโปรโมชั่น (BR15) คิดจากค่าสนามหลังหักส่วนลดสมาชิก
    let promotionDiscount = 0;
    let promotionDetails: PromotionDTO | undefined;
    if (input.promotionCode && input.promotionCode.trim()) {
      const code = input.promotionCode.trim();
      const promo = assertPromotionUsable(await this.equipmentRepository.findPromotionByCode(conn, code), code, {
        bookingDate: input.bookingDate,
        startTime: input.startTime,
        endTime: input.endTime,
        durationHours,
      });
      const base = Math.max(0, courtFee - memberDiscount);
      promotionDiscount =
        promo.discountType === 'PERCENT' ? round2((base * promo.discountValue) / 100) : round2(Math.min(promo.discountValue, base));
      promotionDetails = promo;
    }

    const discountAmount = round2(Math.min(courtFee, memberDiscount + promotionDiscount));
    const finalAmount = round2(courtFee + equipmentFee - discountAmount);

    return {
      courtFee,
      durationHours,
      equipmentFee,
      memberDiscount,
      promotionDiscount,
      discountAmount,
      finalAmount,
      equipmentDetails,
      promotionDetails,
      promotionId: promotionDetails?.promotionId,
    };
  }
}
