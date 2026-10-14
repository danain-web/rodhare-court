import crypto from 'crypto';
import { withConnection, withTransaction, DbConnection } from '../config/db';
import { BUSINESS_RULES } from '../config/env';
import { BookingRepository, LockedBooking, LockedCourt } from '../repositories/booking.repository';
import { CourtRepository } from '../repositories/court.repository';
import { EquipmentRepository } from '../repositories/equipment.repository';
import {
  completeFinishedBookings,
  expireStaleHolds,
  insertAudit,
  insertNotification,
  insertStatusHistory,
} from '../repositories/shared.repository';
import { PricingService } from './pricing.service';
import { CreateBookingInput, BookingDTO, PriceBreakdown, EquipmentLine } from '../types/booking';
import { AppError } from '../utils/appError';
import {
  combineDateTime,
  dayOfWeek,
  formatLocalDate,
  hoursBetween,
  parseLocalDate,
  validateTimeRange,
} from '../utils/datetime';
import { hasAnyRole } from '../utils/params';

const STAFF_ROLES = ['STAFF', 'ADMIN', 'EXECUTIVE'];

const generateBookingNumber = (bookingDate: string): string =>
  `BK-${bookingDate.replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

export interface SlotValidationInput {
  court: LockedCourt;
  userId: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  excludeBookingId?: number;
}

export class BookingService {
  private bookingRepository = new BookingRepository();
  private courtRepository = new CourtRepository();
  private equipmentRepository = new EquipmentRepository();
  private pricingService = new PricingService();

  // ---------------- ตรวจกฎของช่วงเวลาที่เลือก (ใช้ทั้งตอนจองใหม่และตอนแก้ไขการจอง) ----------------
  async validateSlot(conn: DbConnection, v: SlotValidationInput): Promise<number> {
    const minutes = validateTimeRange(v.startTime, v.endTime);
    parseLocalDate(v.bookingDate);

    if (!v.court.isActive) throw AppError.notFound('ไม่พบสนาม หรือสนามถูกปิดใช้งานแล้ว');
    if (v.court.status === 'MAINTENANCE') throw AppError.badRequest('สนามนี้อยู่ระหว่างปิดปรับปรุง (Maintenance) ไม่สามารถจองได้');
    if (v.court.status === 'CLOSED') throw AppError.badRequest('สนามนี้ปิดให้บริการ ไม่สามารถจองได้');

    // BR4: จองล่วงหน้าได้ไม่เกิน 30 วัน และต้องเป็นเวลาในอนาคต
    const now = new Date();
    const startAt = combineDateTime(v.bookingDate, v.startTime);
    if (startAt.getTime() <= now.getTime()) {
      throw AppError.badRequest('ไม่สามารถจองช่วงเวลาที่ผ่านมาแล้วได้');
    }
    const lastDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + BUSINESS_RULES.MAX_ADVANCE_DAYS);
    if (v.bookingDate > formatLocalDate(lastDate)) {
      throw AppError.badRequest(
        `จองล่วงหน้าได้ไม่เกิน ${BUSINESS_RULES.MAX_ADVANCE_DAYS} วัน (วันสุดท้ายที่จองได้คือ ${formatLocalDate(lastDate)})`
      );
    }

    // เวลาทำการของสนามในวันนั้น
    const opHour = await this.courtRepository.getOperatingHour(conn, v.court.courtId, dayOfWeek(v.bookingDate));
    const openTime = opHour?.openTime ?? '08:00';
    const closeTime = opHour?.closeTime ?? '22:00';
    if (opHour && !opHour.isOpen) throw AppError.badRequest('สนามปิดทำการในวันที่เลือก');
    if (v.startTime < openTime || v.endTime > closeTime) {
      throw AppError.badRequest(`เวลาที่เลือกอยู่นอกเวลาเปิดทำการของสนาม (${openTime}–${closeTime})`);
    }

    // BR3: ปล่อยสนามที่ถูกจองค้างไว้เกิน 15 นาทีโดยไม่ชำระ ก่อนตรวจการจองทับ
    await expireStaleHolds(conn, { courtId: v.court.courtId, bookingDate: v.bookingDate });
    await expireStaleHolds(conn, { userId: v.userId });

    // BR2: สนามที่ถูกจองแล้วไม่สามารถจองซ้ำได้
    const overlap = await this.bookingRepository.findOverlap(
      conn,
      v.court.courtId,
      v.bookingDate,
      v.startTime,
      v.endTime,
      v.excludeBookingId
    );
    if (overlap) {
      throw AppError.conflict(
        `ไม่สามารถจองได้ สนามนี้ถูกจองแล้วในช่วง ${overlap.startTime}–${overlap.endTime} (${overlap.bookingNumber})`
      );
    }

    return minutes;
  }

  async calculatePrice(
    input: {
      courtId: number;
      bookingDate: string;
      startTime: string;
      endTime: string;
      equipmentItems?: { equipmentId: number; quantity: number }[];
      promotionCode?: string;
    },
    userId?: number
  ): Promise<PriceBreakdown> {
    return withConnection(async (conn) => {
      parseLocalDate(input.bookingDate);
      const court = await this.courtRepository.getCourtById(conn, input.courtId);
      if (!court) throw AppError.notFound('ไม่พบสนามที่เลือก');
      const { promotionId: _ignored, ...pricing } = await this.pricingService.calculate(conn, {
        courtId: court.courtId,
        sportTypeId: court.sportTypeId,
        courtHourlyRate: court.hourlyRate,
        bookingDate: input.bookingDate,
        startTime: input.startTime,
        endTime: input.endTime,
        equipmentItems: input.equipmentItems,
        promotionCode: input.promotionCode,
        userId,
      });
      return pricing;
    });
  }

  // ---------------- UC-3: จองสนาม (Transaction เดียว: BOOKINGS + BOOKING_EQUIPMENT + EQUIPMENT + HISTORY + NOTIFICATIONS + AUDIT) ----------------
  async createBooking(userId: number, input: CreateBookingInput, ipAddress?: string): Promise<BookingDTO> {
    return withTransaction(async (conn) => {
      // BR1: ต้องเป็นสมาชิกสถานะปกติ
      const user = await this.bookingRepository.lockUser(conn, userId);
      if (!user) throw AppError.unauthorized('ไม่พบผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่');
      if (!user.isActive) throw AppError.forbidden('บัญชีผู้ใช้ถูกระงับ ไม่สามารถจองสนามได้');

      // ล็อกแถวสนามก่อนตรวจการจองทับ (คนที่ 2 ที่กดพร้อมกันต้องรอจน Transaction แรก COMMIT)
      const court = await this.bookingRepository.lockCourt(conn, input.courtId);
      if (!court) throw AppError.notFound('ไม่พบสนามที่เลือก');

      if (await this.bookingRepository.hasUnpaidFines(conn, userId)) {
        throw AppError.forbidden('ไม่สามารถจองสนามได้ เนื่องจากคุณมีค่าปรับค้างชำระ กรุณาชำระค่าปรับก่อน');
      }

      await this.validateSlot(conn, {
        court,
        userId,
        bookingDate: input.bookingDate,
        startTime: input.startTime,
        endTime: input.endTime,
      });

      const pricing = await this.pricingService.calculate(conn, {
        courtId: court.courtId,
        sportTypeId: court.sportTypeId,
        courtHourlyRate: court.hourlyRate,
        bookingDate: input.bookingDate,
        startTime: input.startTime,
        endTime: input.endTime,
        equipmentItems: input.equipmentItems,
        promotionCode: input.promotionCode,
        userId,
      });

      const bookingNumber = generateBookingNumber(input.bookingDate);
      const bookingId = await this.bookingRepository.insertBooking(conn, {
        bookingNumber,
        userId,
        courtId: court.courtId,
        bookingDate: input.bookingDate,
        startTime: input.startTime,
        endTime: input.endTime,
        totalCourtFee: pricing.courtFee,
        totalEquipmentFee: pricing.equipmentFee,
        discountAmount: pricing.discountAmount,
        finalAmount: pricing.finalAmount,
        promotionId: pricing.promotionId ?? null,
        holdMinutes: BUSINESS_RULES.HOLD_MINUTES,
      });

      await this.reserveEquipment(conn, bookingId, pricing.equipmentDetails);

      await insertStatusHistory(
        conn,
        bookingId,
        'PENDING_PAYMENT',
        `สร้างการจองแล้ว รอชำระเงินภายใน ${BUSINESS_RULES.HOLD_MINUTES} นาที`,
        userId
      );
      await insertNotification(conn, {
        userId,
        bookingId,
        title: 'สร้างการจองสำเร็จ (Booking Created)',
        message: `การจอง ${bookingNumber} สนาม ${court.name} วันที่ ${input.bookingDate} ${input.startTime}-${input.endTime} ยอดชำระ ฿${pricing.finalAmount.toFixed(2)} กรุณาชำระและส่งสลิปภายใน ${BUSINESS_RULES.HOLD_MINUTES} นาที`,
        type: 'INFO',
      });
      await insertAudit(conn, {
        userId,
        action: 'CREATE_BOOKING',
        entityName: 'BOOKINGS',
        entityId: bookingId,
        newValues: {
          bookingNumber,
          courtId: court.courtId,
          bookingDate: input.bookingDate,
          startTime: input.startTime,
          endTime: input.endTime,
          finalAmount: pricing.finalAmount,
          equipment: pricing.equipmentDetails.map((e) => ({ equipmentId: e.equipmentId, quantity: e.quantity })),
          promotion: pricing.promotionDetails?.code,
        },
        ipAddress,
      });

      return (await this.bookingRepository.getBookingById(conn, bookingId))!;
    }, userId);
  }

  // ตัดสต็อกอุปกรณ์ที่จอง (เรียงตาม equipment_id เพื่อลดโอกาส deadlock) แล้วบันทึก BOOKING_EQUIPMENT
  async reserveEquipment(conn: DbConnection, bookingId: number, lines: EquipmentLine[]): Promise<void> {
    for (const line of [...lines].sort((a, b) => a.equipmentId - b.equipmentId)) {
      const ok = await this.equipmentRepository.deductStock(conn, line.equipmentId, line.quantity);
      if (!ok) {
        const eq = await this.equipmentRepository.getEquipmentById(conn, line.equipmentId);
        throw AppError.badRequest(
          `อุปกรณ์กีฬาไม่เพียงพอ: ${line.equipmentName} (ต้องการ ${line.quantity} ชิ้น คงเหลือ ${eq?.availableQuantity ?? 0} ชิ้น)`
        );
      }
      await this.bookingRepository.insertBookingEquipment(conn, bookingId, line);
    }
  }

  async getMyBookings(userId: number): Promise<BookingDTO[]> {
    await withTransaction((conn) => expireStaleHolds(conn, { userId }));
    return withConnection((conn) => this.bookingRepository.getBookingsByUser(conn, userId));
  }

  async getBookingById(bookingId: number, userId: number, roles: string[]): Promise<BookingDTO> {
    await withTransaction((conn) => expireStaleHolds(conn, { bookingId }));
    const booking = await withConnection((conn) => this.bookingRepository.getBookingById(conn, bookingId));
    if (!booking) throw AppError.notFound('ไม่พบการจอง');
    if (!hasAnyRole(roles, ...STAFF_ROLES) && booking.userId !== userId) {
      throw AppError.forbidden('ดูได้เฉพาะการจองของตนเองเท่านั้น');
    }
    return booking;
  }

  async getBookingByNumber(bookingNumber: string): Promise<BookingDTO> {
    return withConnection(async (conn) => {
      const id = await this.bookingRepository.findBookingIdByNumber(conn, bookingNumber);
      const booking = id ? await this.bookingRepository.getBookingById(conn, id) : null;
      if (!booking) throw AppError.notFound(`ไม่พบการจองหมายเลข ${bookingNumber}`);
      return booking;
    });
  }

  // ---------------- UC-5 / BR8: เช็คอินได้ก่อนเวลาเริ่มไม่เกิน 30 นาที และต้องชำระเงินแล้ว ----------------
  async checkIn(
    target: { bookingId?: number; bookingNumber?: string },
    actorId: number,
    roles: string[],
    ipAddress?: string
  ): Promise<BookingDTO> {
    return withTransaction(async (conn) => {
      const bookingId =
        target.bookingId ?? (target.bookingNumber ? await this.bookingRepository.findBookingIdByNumber(conn, target.bookingNumber) : null);
      const booking = bookingId ? await this.bookingRepository.lockBooking(conn, bookingId) : null;
      if (!booking) throw AppError.notFound('ไม่พบการจอง');
      if (!hasAnyRole(roles, 'STAFF', 'ADMIN') && booking.userId !== actorId) {
        throw AppError.forbidden('เช็คอินได้เฉพาะการจองของตนเองเท่านั้น');
      }

      this.assertCheckInAllowed(booking);

      await this.bookingRepository.transitionStatus(conn, booking.bookingId, ['CONFIRMED', 'PAYMENT_VERIFIED'], 'CHECKED_IN', {
        checkedInBy: actorId,
      });
      await insertStatusHistory(conn, booking.bookingId, 'CHECKED_IN', 'เช็คอินเข้าใช้สนามแล้ว', actorId);
      await insertNotification(conn, {
        userId: booking.userId,
        bookingId: booking.bookingId,
        title: 'เช็คอินสำเร็จ (Checked-in)',
        message: `การจอง ${booking.bookingNumber} เช็คอินเข้าใช้สนามเรียบร้อยแล้ว ขอให้สนุกกับการเล่นกีฬา`,
        type: 'SUCCESS',
      });
      await insertAudit(conn, {
        userId: actorId,
        action: 'CHECK_IN',
        entityName: 'BOOKINGS',
        entityId: booking.bookingId,
        oldValues: { status: booking.status },
        newValues: { status: 'CHECKED_IN' },
        ipAddress,
      });
      return (await this.bookingRepository.getBookingById(conn, booking.bookingId))!;
    }, actorId);
  }

  private assertCheckInAllowed(booking: LockedBooking): void {
    if (booking.status === 'CHECKED_IN') throw AppError.conflict('การจองนี้เช็คอินไปแล้ว');
    if (booking.status === 'PENDING_PAYMENT') throw AppError.badRequest('ไม่อนุญาตให้เช็คอิน: รายการยังไม่ได้ชำระเงิน');
    if (!['CONFIRMED', 'PAYMENT_VERIFIED'].includes(booking.status)) {
      throw AppError.badRequest(`ไม่อนุญาตให้เช็คอิน: การจองอยู่ในสถานะ ${booking.status}`);
    }
    const now = new Date();
    const startAt = combineDateTime(booking.bookingDate, booking.startTime);
    const endAt = combineDateTime(booking.bookingDate, booking.endTime);
    const minutesBeforeStart = hoursBetween(now, startAt) * 60;
    if (minutesBeforeStart > BUSINESS_RULES.CHECKIN_EARLY_MINUTES) {
      throw AppError.badRequest(
        `ยังไม่ถึงเวลาเช็คอิน (สามารถเช็คอินได้ก่อนเวลาไม่เกิน ${BUSINESS_RULES.CHECKIN_EARLY_MINUTES} นาที, เริ่ม ${booking.bookingDate} ${booking.startTime})`
      );
    }
    if (now.getTime() >= endAt.getTime()) throw AppError.badRequest('เลยเวลาการจองแล้ว ไม่สามารถเช็คอินได้');
  }

  // งานเบื้องหลัง: BR3 ยกเลิกการจองที่ไม่ชำระใน 15 นาที และปิดการจองที่จบเวลาแล้ว
  async runMaintenance(): Promise<{ expired: number; completed: number }> {
    return withTransaction(async (conn) => {
      const expired = await expireStaleHolds(conn);
      const completed = await completeFinishedBookings(conn);
      return { expired, completed };
    });
  }

}
