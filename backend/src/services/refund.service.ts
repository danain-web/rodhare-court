import { withConnection, withTransaction, DbConnection } from '../config/db';
import { BUSINESS_RULES } from '../config/env';
import { RefundRepository } from '../repositories/refund.repository';
import { BookingRepository, LockedBooking } from '../repositories/booking.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import { EquipmentRepository } from '../repositories/equipment.repository';
import {
  expireStaleHolds,
  insertAudit,
  insertNotification,
  insertStatusHistory,
  releaseUnborrowedEquipment,
} from '../repositories/shared.repository';
import { BookingService } from './booking.service';
import { PricingService } from './pricing.service';
import { RefundRequestDTO, UpdateBookingInput, CancelRefundPreview } from '../types/refund';
import { BookingDTO } from '../types/booking';
import { AppError } from '../utils/appError';
import { combineDateTime, hoursBetween } from '../utils/datetime';
import { round2 } from '../utils/params';
import { PermissionService } from './permission.service';

const CANCELLABLE = ['PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'CONFIRMED'];

export class RefundService {
  private refundRepository = new RefundRepository();
  private permissionService = new PermissionService();
  private bookingRepository = new BookingRepository();
  private paymentRepository = new PaymentRepository();
  private equipmentRepository = new EquipmentRepository();
  private bookingService = new BookingService();
  private pricingService = new PricingService();

  // ---------------- BR12: คำนวณสิทธิ์คืนเงิน ----------------
  // ยกเลิกล่วงหน้ามากกว่า 24 ชม. คืน 100% / 1-24 ชม. คืน 50% / น้อยกว่า 1 ชม. ไม่คืนเงิน (เฉพาะการจองที่ชำระเงินแล้ว)
  private async buildPreview(conn: DbConnection, booking: LockedBooking, courtName?: string): Promise<CancelRefundPreview> {
    const now = new Date();
    const startAt = combineDateTime(booking.bookingDate, booking.startTime);
    const hoursUntilStart = round2(hoursBetween(now, startAt));
    const verified = await this.bookingRepository.getVerifiedPaymentAmount(conn, booking.bookingId);
    const payments = await this.paymentRepository.getPaymentsByBooking(conn, booking.bookingId);
    const pending = payments.find((p) => p.status === 'PENDING');

    let refundPercentage = 0;
    let paidAmount = 0;
    let reason: string;

    if (!CANCELLABLE.includes(booking.status)) {
      reason = `ไม่สามารถยกเลิกได้ เนื่องจากการจองอยู่ในสถานะ ${booking.status}`;
    } else if (hoursUntilStart <= 0) {
      reason = 'ไม่สามารถยกเลิกได้ เนื่องจากเลยเวลาเริ่มใช้งานแล้ว';
    } else if (verified) {
      paidAmount = verified.amount;
      if (hoursUntilStart > BUSINESS_RULES.REFUND_FULL_HOURS) {
        refundPercentage = BUSINESS_RULES.REFUND_FULL_PERCENT;
        reason = `ยกเลิกล่วงหน้ามากกว่า ${BUSINESS_RULES.REFUND_FULL_HOURS} ชั่วโมง ได้รับเงินคืน ${refundPercentage}%`;
      } else if (hoursUntilStart >= BUSINESS_RULES.REFUND_NONE_HOURS) {
        refundPercentage = BUSINESS_RULES.REFUND_LATE_PERCENT;
        reason = `ยกเลิกล่วงหน้า ${BUSINESS_RULES.REFUND_NONE_HOURS}-${BUSINESS_RULES.REFUND_FULL_HOURS} ชั่วโมง ได้รับเงินคืน ${refundPercentage}%`;
      } else {
        refundPercentage = 0;
        reason = `ยกเลิกล่วงหน้าน้อยกว่า ${BUSINESS_RULES.REFUND_NONE_HOURS} ชั่วโมง ไม่ได้รับเงินคืน`;
      }
    } else if (pending) {
      // UC-04-03 ทางเลือก 1.2: ยกเลิกระหว่างรอตรวจสลิป -> สลิปถูกปฏิเสธ และส่งยอดที่โอนมาเข้ากระบวนการคืนเงิน
      paidAmount = pending.amount;
      refundPercentage = 100;
      reason = 'ยกเลิกระหว่างรอตรวจสลิป: สลิปจะถูกปฏิเสธและยอดที่โอนมาจะเข้าสู่กระบวนการคืนเงินเต็มจำนวน';
    } else {
      reason = 'การจองยังไม่ได้ชำระเงิน ยกเลิกได้โดยไม่มีค่าใช้จ่าย (ไม่มียอดคืนเงิน)';
    }

    const refundAmount = round2((paidAmount * refundPercentage) / 100);
    return {
      bookingId: booking.bookingId,
      bookingNumber: booking.bookingNumber,
      courtName,
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      isPaid: !!verified,
      originalAmount: booking.finalAmount,
      totalPrice: booking.finalAmount,
      paidAmount,
      hoursUntilStart,
      refundPercentage,
      refundAmount,
      eligibleForRefund: refundAmount > 0,
      reason,
      message: reason,
    };
  }

  private async assertOwnerOrStaff(booking: LockedBooking, userId: number, roles: string[]): Promise<void> {
    if (booking.userId !== userId && !(await this.permissionService.hasPermission(roles, 'refund.review'))) {
      throw AppError.forbidden('ทำรายการได้เฉพาะการจองของตนเองเท่านั้น');
    }
  }

  async previewCancelRefund(bookingId: number, userId: number, roles: string[] = []): Promise<CancelRefundPreview> {
    await withTransaction((conn) => expireStaleHolds(conn, { bookingId }));
    return withConnection(async (conn) => {
      const booking = await this.bookingRepository.lockBooking(conn, bookingId);
      if (!booking) throw AppError.notFound('ไม่พบการจอง');
      await this.assertOwnerOrStaff(booking, userId, roles);
      const detail = await this.bookingRepository.getBookingById(conn, bookingId);
      return this.buildPreview(conn, booking, detail?.courtName);
    });
  }

  // ---------------- UC-6: ยกเลิกการจอง (+ ขอคืนเงินตาม BR12) ใน Transaction เดียว ----------------
  async executeCancelWithRefund(
    bookingId: number,
    userId: number,
    cancelReason?: string,
    roles: string[] = [],
    ipAddress?: string
  ): Promise<{ refundRequest?: RefundRequestDTO; preview: CancelRefundPreview; booking: BookingDTO }> {
    await withTransaction((conn) => expireStaleHolds(conn, { bookingId }));
    return withTransaction(async (conn) => {
      const booking = await this.bookingRepository.lockBooking(conn, bookingId);
      if (!booking) throw AppError.notFound('ไม่พบการจอง');
      await this.assertOwnerOrStaff(booking, userId, roles);

      if (booking.status === 'CANCELLED' || booking.status === 'REFUNDED') throw AppError.conflict('การจองนี้ถูกยกเลิกไปแล้ว');
      if (booking.status === 'EXPIRED') throw AppError.badRequest('การจองนี้หมดอายุแล้ว ไม่ต้องยกเลิกซ้ำ');
      if (booking.status === 'NO_SHOW') throw AppError.badRequest('การจองนี้ไม่ได้มาใช้บริการตามเวลา ไม่สามารถยกเลิกหรือขอคืนเงินได้');

      const preview = await this.buildPreview(conn, booking);
      if (!CANCELLABLE.includes(booking.status) || preview.hoursUntilStart <= 0) {
        throw AppError.badRequest(preview.reason);
      }

      const reasonText = cancelReason?.trim() || 'ลูกค้ายกเลิกการจอง';
      await this.bookingRepository.transitionStatus(conn, bookingId, CANCELLABLE, 'CANCELLED', { cancelReason: reasonText });
      await releaseUnborrowedEquipment(conn, bookingId);
      await insertStatusHistory(conn, bookingId, 'CANCELLED', `ยกเลิกการจอง: ${reasonText} (${preview.reason})`, userId);

      // สลิปที่ยังรอตรวจ -> ปฏิเสธพร้อมเหตุผล "การจองถูกยกเลิก"
      const payments = await this.paymentRepository.getPaymentsByBooking(conn, bookingId);
      for (const p of payments.filter((x) => x.status === 'PENDING')) {
        await this.paymentRepository.markRejected(conn, p.paymentId, 'การจองถูกยกเลิก', userId);
      }

      let refundId: number | undefined;
      if (preview.eligibleForRefund) {
        refundId = await this.refundRepository.insertRefundRequest(conn, {
          bookingId,
          userId: booking.userId,
          requestedAmount: preview.refundAmount,
          refundPercentage: preview.refundPercentage,
          reason: `${reasonText} | ${preview.reason}`,
        });
      }

      await insertNotification(conn, {
        userId: booking.userId,
        bookingId,
        title: 'ยกเลิกการจองแล้ว (Booking Cancelled)',
        message: preview.eligibleForRefund
          ? `การจอง ${booking.bookingNumber} ถูกยกเลิกแล้ว ยื่นคำขอคืนเงิน ฿${preview.refundAmount.toFixed(2)} (${preview.refundPercentage}%) รอพนักงานอนุมัติ`
          : `การจอง ${booking.bookingNumber} ถูกยกเลิกแล้ว`,
        type: 'INFO',
      });
      await insertAudit(conn, {
        userId,
        action: 'CANCEL_BOOKING',
        entityName: 'BOOKINGS',
        entityId: bookingId,
        oldValues: { status: booking.status },
        newValues: {
          status: 'CANCELLED',
          reason: reasonText,
          refundId,
          refundAmount: preview.refundAmount,
          refundPercentage: preview.refundPercentage,
        },
        ipAddress,
      });

      return {
        refundRequest: refundId ? (await this.refundRepository.getRefundById(conn, refundId))! : undefined,
        preview,
        booking: (await this.bookingRepository.getBookingById(conn, bookingId))!,
      };
    }, userId);
  }

  async getMyRefunds(userId: number): Promise<RefundRequestDTO[]> {
    return withConnection((conn) => this.refundRepository.getRefundsByUser(conn, userId));
  }

  async getPendingRefunds(): Promise<RefundRequestDTO[]> {
    return withConnection((conn) => this.refundRepository.getPendingRefunds(conn));
  }

  // ---------------- UC-6 (อนุมัติการคืนเงิน) ----------------
  async approveRefund(refundId: number, staffUserId: number, note?: string, ipAddress?: string): Promise<RefundRequestDTO> {
    return withTransaction(async (conn) => {
      const refund = await this.refundRepository.lockRefund(conn, refundId);
      if (!refund) throw AppError.notFound('ไม่พบคำขอคืนเงิน');
      if (refund.status !== 'PENDING') throw AppError.conflict(`คำขอคืนเงินนี้ถูกดำเนินการไปแล้ว (สถานะ ${refund.status})`);

      // UC-6 A2: ยอดคืนผิดปกติ (เป็น 0 หรือเกินยอดที่ชำระจริง) ไม่อนุญาตให้อนุมัติ
      const payments = await this.paymentRepository.getPaymentsByBooking(conn, refund.bookingId);
      const verified = payments.find((p) => p.status === 'VERIFIED');
      const maxRefundable = verified ? verified.amount : Math.max(0, ...payments.map((p) => p.amount));
      if (refund.requestedAmount <= 0 || refund.requestedAmount > maxRefundable + 0.005) {
        throw AppError.badRequest(
          `ยอดคืนเงินผิดปกติ (฿${refund.requestedAmount.toFixed(2)} เทียบกับยอดที่ชำระ ฿${maxRefundable.toFixed(2)}) ไม่สามารถอนุมัติได้`
        );
      }

      await this.refundRepository.review(conn, refundId, 'APPROVED', staffUserId, note);
      const booking = await this.bookingRepository.lockBooking(conn, refund.bookingId);
      if (booking && (await this.bookingRepository.transitionStatus(conn, booking.bookingId, ['CANCELLED'], 'REFUNDED'))) {
        await insertStatusHistory(
          conn,
          booking.bookingId,
          'REFUNDED',
          `อนุมัติคืนเงิน ฿${refund.requestedAmount.toFixed(2)} (refund #${refundId})`,
          staffUserId
        );
      }
      await insertNotification(conn, {
        userId: refund.userId,
        bookingId: refund.bookingId,
        title: 'อนุมัติคืนเงินแล้ว (Refund Approved)',
        message: `คำขอคืนเงินของการจอง ${booking?.bookingNumber ?? refund.bookingId} ได้รับอนุมัติ ยอด ฿${refund.requestedAmount.toFixed(2)}`,
        type: 'SUCCESS',
      });
      await insertAudit(conn, {
        userId: staffUserId,
        action: 'APPROVE_REFUND',
        entityName: 'REFUND_REQUESTS',
        entityId: refundId,
        oldValues: { status: 'PENDING' },
        newValues: { status: 'APPROVED', amount: refund.requestedAmount, note },
        ipAddress,
      });
      return (await this.refundRepository.getRefundById(conn, refundId))!;
    }, staffUserId);
  }

  async rejectRefund(refundId: number, staffUserId: number, note: string, ipAddress?: string): Promise<RefundRequestDTO> {
    return withTransaction(async (conn) => {
      const refund = await this.refundRepository.lockRefund(conn, refundId);
      if (!refund) throw AppError.notFound('ไม่พบคำขอคืนเงิน');
      if (refund.status !== 'PENDING') throw AppError.conflict(`คำขอคืนเงินนี้ถูกดำเนินการไปแล้ว (สถานะ ${refund.status})`);

      await this.refundRepository.review(conn, refundId, 'REJECTED', staffUserId, note);
      await insertNotification(conn, {
        userId: refund.userId,
        bookingId: refund.bookingId,
        title: 'คำขอคืนเงินถูกปฏิเสธ (Refund Rejected)',
        message: `คำขอคืนเงินของการจองหมายเลข ${refund.bookingId} ถูกปฏิเสธ: ${note}`,
        type: 'WARNING',
      });
      await insertAudit(conn, {
        userId: staffUserId,
        action: 'REJECT_REFUND',
        entityName: 'REFUND_REQUESTS',
        entityId: refundId,
        oldValues: { status: 'PENDING' },
        newValues: { status: 'REJECTED', note },
        ipAddress,
      });
      return (await this.refundRepository.getRefundById(conn, refundId))!;
    }, staffUserId);
  }

  // ---------------- BR5: แก้ไขวัน/เวลาได้เฉพาะก่อนเวลาใช้งานอย่างน้อย 24 ชั่วโมง ----------------
  async updateBooking(bookingId: number, userId: number, input: UpdateBookingInput, ipAddress?: string): Promise<BookingDTO> {
    await withTransaction((conn) => expireStaleHolds(conn, { bookingId }));
    return withTransaction(async (conn) => {
      const booking = await this.bookingRepository.lockBooking(conn, bookingId);
      if (!booking) throw AppError.notFound('ไม่พบการจอง');
      if (booking.userId !== userId) throw AppError.forbidden('แก้ไขได้เฉพาะการจองของตนเองเท่านั้น');
      if (!CANCELLABLE.includes(booking.status)) {
        throw AppError.badRequest(`ไม่สามารถแก้ไขการจองที่อยู่ในสถานะ ${booking.status} ได้`);
      }

      const hoursUntilStart = hoursBetween(new Date(), combineDateTime(booking.bookingDate, booking.startTime));
      if (hoursUntilStart < BUSINESS_RULES.MIN_HOURS_BEFORE_CHANGE) {
        throw AppError.badRequest(
          `แก้ไขวันหรือเวลาได้เฉพาะก่อนเวลาใช้งานอย่างน้อย ${BUSINESS_RULES.MIN_HOURS_BEFORE_CHANGE} ชั่วโมง (เหลือ ${Math.max(0, hoursUntilStart).toFixed(1)} ชั่วโมง)`
        );
      }
      if (await this.bookingRepository.hasPendingPayment(conn, bookingId)) {
        throw AppError.conflict('มีสลิปรอพนักงานตรวจสอบอยู่ ไม่สามารถแก้ไขการจองได้ในขณะนี้');
      }
      if ((await this.bookingRepository.countBorrowings(conn, bookingId)) > 0) {
        throw AppError.badRequest('มีการยืมอุปกรณ์ของการจองนี้ไปแล้ว ไม่สามารถแก้ไขการจองได้');
      }

      const court = await this.bookingRepository.lockCourt(conn, booking.courtId);
      if (!court) throw AppError.notFound('ไม่พบสนามของการจองนี้');
      await this.bookingService.validateSlot(conn, {
        court,
        userId,
        bookingDate: input.bookingDate,
        startTime: input.startTime,
        endTime: input.endTime,
        excludeBookingId: bookingId,
      });

      // อุปกรณ์: ถ้าไม่ได้ส่งรายการมา ใช้รายการเดิม (เดิมโค้ดตั้งค่าเป็น [] ทำให้ค่าอุปกรณ์หายจากยอด)
      const currentEquipment = await this.bookingRepository.getBookingEquipment(conn, bookingId);
      const lockedPrices = new Map(currentEquipment.map((e) => [e.equipmentId, e.unitRentalFee] as [number, number]));
      const equipmentItems =
        input.equipmentItems !== undefined
          ? input.equipmentItems
          : currentEquipment.map((e) => ({ equipmentId: e.equipmentId, quantity: e.quantity }));

      const detail = await this.bookingRepository.getBookingById(conn, bookingId);
      const pricing = await this.pricingService.calculate(conn, {
        courtId: court.courtId,
        sportTypeId: court.sportTypeId,
        courtHourlyRate: court.hourlyRate,
        bookingDate: input.bookingDate,
        startTime: input.startTime,
        endTime: input.endTime,
        equipmentItems,
        promotionCode: detail?.promotionCode,
        userId,
        lockedEquipmentPrices: lockedPrices,
      });

      // การจองที่ชำระแล้ว ยอดใหม่ต้องเท่ายอดเดิม (BR6: ยอดที่ชำระต้องตรงกับยอดการจอง)
      const isPaid = booking.status !== 'PENDING_PAYMENT';
      if (isPaid && Math.abs(pricing.finalAmount - booking.finalAmount) > 0.005) {
        throw AppError.badRequest(
          `ยอดของช่วงเวลาใหม่ (฿${pricing.finalAmount.toFixed(2)}) ไม่เท่ากับยอดที่ชำระแล้ว (฿${booking.finalAmount.toFixed(2)}) กรุณาเลือกช่วงเวลาที่ราคาเท่ากัน หรือยกเลิกแล้วจองใหม่`
        );
      }

      // คืนสต็อกรายการเดิม แล้วตัดสต็อกรายการใหม่
      for (const e of [...currentEquipment].sort((a, b) => a.equipmentId - b.equipmentId)) {
        await this.equipmentRepository.restoreStock(conn, e.equipmentId, e.quantity);
      }
      await this.bookingRepository.deleteBookingEquipment(conn, bookingId);
      await this.bookingService.reserveEquipment(conn, bookingId, pricing.equipmentDetails);

      await this.bookingRepository.updateSchedule(conn, {
        bookingId,
        bookingDate: input.bookingDate,
        startTime: input.startTime,
        endTime: input.endTime,
        totalCourtFee: pricing.courtFee,
        totalEquipmentFee: pricing.equipmentFee,
        discountAmount: pricing.discountAmount,
        finalAmount: pricing.finalAmount,
      });

      const change = `${booking.bookingDate} ${booking.startTime}-${booking.endTime} → ${input.bookingDate} ${input.startTime}-${input.endTime}`;
      await insertStatusHistory(conn, bookingId, booking.status, `แก้ไขวัน/เวลาการจอง: ${change}`, userId);
      await insertNotification(conn, {
        userId,
        bookingId,
        title: 'แก้ไขการจองแล้ว (Booking Updated)',
        message: `การจอง ${booking.bookingNumber} เปลี่ยนเป็น ${input.bookingDate} ${input.startTime}-${input.endTime} ยอด ฿${pricing.finalAmount.toFixed(2)}`,
        type: 'INFO',
      });
      await insertAudit(conn, {
        userId,
        action: 'UPDATE_BOOKING',
        entityName: 'BOOKINGS',
        entityId: bookingId,
        oldValues: {
          bookingDate: booking.bookingDate,
          startTime: booking.startTime,
          endTime: booking.endTime,
          finalAmount: booking.finalAmount,
        },
        newValues: {
          bookingDate: input.bookingDate,
          startTime: input.startTime,
          endTime: input.endTime,
          finalAmount: pricing.finalAmount,
        },
        ipAddress,
      });

      return (await this.bookingRepository.getBookingById(conn, bookingId))!;
    }, userId);
  }
}
