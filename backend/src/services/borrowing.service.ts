import { withConnection, withTransaction } from '../config/db';
import { BUSINESS_RULES } from '../config/env';
import { BorrowingRepository } from '../repositories/borrowing.repository';
import { BookingRepository } from '../repositories/booking.repository';
import { EquipmentRepository } from '../repositories/equipment.repository';
import { CourtRepository } from '../repositories/court.repository';
import { insertAudit, insertNotification } from '../repositories/shared.repository';
import { BorrowInput, ReturnInput, BorrowingDTO, FineDTO } from '../types/borrowing';
import { AppError } from '../utils/appError';
import { combineDateTime } from '../utils/datetime';
import { round2 } from '../utils/params';
import { SettingsService } from './settings.service';

export class BorrowingService {
  private borrowingRepository = new BorrowingRepository();
  private bookingRepository = new BookingRepository();
  private equipmentRepository = new EquipmentRepository();
  private courtRepository = new CourtRepository();
  private settingsService = new SettingsService();

  // ---------------- UC-05-02 / BR9: ยืมได้เฉพาะผู้ที่มีการจองสนามในวันและเวลานั้น ----------------
  async borrowEquipment(input: BorrowInput, staffUserId: number, ipAddress?: string): Promise<BorrowingDTO> {
    return withTransaction(async (conn) => {
      const bookingId = await this.bookingRepository.findBookingIdByNumber(conn, input.bookingNumber);
      const booking = bookingId ? await this.bookingRepository.lockBooking(conn, bookingId) : null;
      if (!booking) {
        throw AppError.badRequest(`ไม่พบการจองหมายเลข ${input.bookingNumber} จึงไม่สามารถยืมอุปกรณ์ได้`);
      }
      if (booking.status === 'PENDING_PAYMENT') {
        throw AppError.badRequest('การจองนี้ยังไม่ได้ชำระเงิน ไม่สามารถยืมอุปกรณ์ได้');
      }
      if (!['CONFIRMED', 'PAYMENT_VERIFIED', 'CHECKED_IN'].includes(booking.status)) {
        throw AppError.badRequest(`การจองอยู่ในสถานะ ${booking.status} ไม่สามารถยืมอุปกรณ์ได้`);
      }

      const now = new Date();
      const startAt = combineDateTime(booking.bookingDate, booking.startTime);
      const endAt = combineDateTime(booking.bookingDate, booking.endTime);
      const { earlyMinutes } = await this.settingsService.getCheckInWindow(conn);
      const earliest = new Date(startAt.getTime() - earlyMinutes * 60_000);
      if (now < earliest || now >= endAt) {
        throw AppError.badRequest(
          `ยืมอุปกรณ์ได้เฉพาะในวันและเวลาที่จองไว้ (${booking.bookingDate} ${booking.startTime}-${booking.endTime})`
        );
      }

      const equipment = await this.equipmentRepository.getEquipmentById(conn, input.equipmentId, true);
      if (!equipment) throw AppError.notFound('ไม่พบอุปกรณ์');
      const court = await this.courtRepository.getCourtById(conn, booking.courtId, true);
      if (court && court.sportTypeId !== equipment.sportTypeId) {
        throw AppError.badRequest(`อุปกรณ์ "${equipment.name}" ไม่ใช่อุปกรณ์ของประเภทกีฬาของสนามที่จอง`);
      }

      // ส่วนที่จองไว้ถูกตัดสต็อกแล้วตอนจอง ตัดเพิ่มเฉพาะส่วนที่ยืมเกินจากที่จอง (ยืมเพิ่มหน้างาน)
      const remainingReserved = await this.borrowingRepository.getRemainingReserved(conn, booking.bookingId, equipment.equipmentId);
      const extra = Math.max(0, input.quantity - remainingReserved);
      if (extra > 0 && !(await this.equipmentRepository.deductStock(conn, equipment.equipmentId, extra))) {
        throw AppError.badRequest(
          `อุปกรณ์กีฬาไม่เพียงพอ: ${equipment.name} (ยืมเพิ่มจากที่จอง ${extra} ชิ้น แต่คงเหลือ ${equipment.availableQuantity} ชิ้น)`
        );
      }

      const borrowingId = await this.borrowingRepository.insertBorrowing(conn, {
        bookingId: booking.bookingId,
        equipmentId: equipment.equipmentId,
        quantity: input.quantity,
        staffUserId,
      });
      await insertAudit(conn, {
        userId: staffUserId,
        action: 'BORROW_EQUIPMENT',
        entityName: 'EQUIPMENT_BORROWINGS',
        entityId: borrowingId,
        newValues: {
          bookingNumber: booking.bookingNumber,
          equipmentId: equipment.equipmentId,
          quantity: input.quantity,
          fromReservation: input.quantity - extra,
          extraFromStock: extra,
        },
        ipAddress,
      });
      return (await this.borrowingRepository.getBorrowingById(conn, borrowingId))!;
    }, staffUserId);
  }

  // ---------------- คืนอุปกรณ์ + คำนวณค่าปรับ (BR10, BR11) ----------------
  async returnEquipment(
    input: ReturnInput,
    staffUserId: number,
    ipAddress?: string
  ): Promise<{ borrowing: BorrowingDTO; generatedFines: FineDTO[] }> {
    return withTransaction(async (conn) => {
      const borrowing = await this.borrowingRepository.lockBorrowing(conn, input.borrowingId);
      if (!borrowing) throw AppError.notFound('ไม่พบรายการยืมอุปกรณ์');
      if (!['BORROWED', 'OVERDUE'].includes(borrowing.status)) {
        throw AppError.conflict('รายการนี้คืนอุปกรณ์ไปแล้ว');
      }
      const equipment = await this.equipmentRepository.getEquipmentById(conn, borrowing.equipmentId, true);
      if (!equipment) throw AppError.notFound('ไม่พบอุปกรณ์');
      const booking = await this.bookingRepository.lockBooking(conn, borrowing.bookingId);

      const statusValue = input.condition === 'NORMAL' ? 'RETURNED' : input.condition;
      await this.borrowingRepository.markReturned(conn, borrowing.borrowingId, statusValue, input.notes);

      // ของปกติกลับเข้าสต็อก / ชำรุดหรือสูญหายตัดออกจากสต็อกถาวร
      if (input.condition === 'NORMAL') {
        await this.equipmentRepository.restoreStock(conn, equipment.equipmentId, borrowing.quantity);
      } else {
        await this.equipmentRepository.writeOffStock(conn, equipment.equipmentId, borrowing.quantity);
      }

      const fineIds: number[] = [];
      const now = new Date();

      // BR11: คืนช้ากว่ากำหนด (BR10 = เวลาสิ้นสุดการจอง) คิด 20 บาทต่อ 15 นาที ต่ออุปกรณ์ 1 ชิ้น
      const lateMinutes = (now.getTime() - borrowing.expectedReturnAt.getTime()) / 60_000;
      if (lateMinutes > 0) {
        const blocks = Math.ceil(lateMinutes / BUSINESS_RULES.LATE_FEE_BLOCK_MINUTES);
        const amount = round2(blocks * BUSINESS_RULES.LATE_FEE_PER_BLOCK * borrowing.quantity);
        fineIds.push(
          await this.borrowingRepository.insertFine(conn, {
            borrowingId: borrowing.borrowingId,
            bookingId: borrowing.bookingId,
            fineType: 'LATE_RETURN',
            amount,
            reason: `คืนช้า ${Math.ceil(lateMinutes)} นาที (${blocks} x 15 นาที x ฿${BUSINESS_RULES.LATE_FEE_PER_BLOCK} x ${borrowing.quantity} ชิ้น)`,
          })
        );
      }

      // BR11: ชำรุด/สูญหาย คิดตามราคาประเมินของอุปกรณ์ (replacement_cost)
      if (input.condition !== 'NORMAL') {
        const amount = round2(equipment.replacementCost * borrowing.quantity);
        if (amount > 0) {
          fineIds.push(
            await this.borrowingRepository.insertFine(conn, {
              borrowingId: borrowing.borrowingId,
              bookingId: borrowing.bookingId,
              fineType: input.condition === 'DAMAGED' ? 'DAMAGE' : 'LOSS',
              amount,
              reason: `${equipment.name} ${input.condition === 'DAMAGED' ? 'ชำรุด' : 'สูญหาย'} ${borrowing.quantity} ชิ้น x ราคาประเมิน ฿${equipment.replacementCost}`,
            })
          );
        }
      }

      const generatedFines: FineDTO[] = [];
      for (const id of fineIds) {
        const fine = await this.borrowingRepository.getFineById(conn, id);
        if (fine) {
          const { userId: _u, ...dto } = fine;
          generatedFines.push(dto);
        }
      }

      if (booking && generatedFines.length > 0) {
        const total = round2(generatedFines.reduce((s, f) => s + f.amount, 0));
        await insertNotification(conn, {
          userId: booking.userId,
          bookingId: booking.bookingId,
          title: 'แจ้งค่าปรับอุปกรณ์ (Equipment Fine)',
          message: `การจอง ${booking.bookingNumber} มีค่าปรับอุปกรณ์ ${equipment.name} รวม ฿${total.toFixed(2)} กรุณาชำระก่อนการจองครั้งถัดไป`,
          type: 'ALERT',
        });
      }

      await insertAudit(conn, {
        userId: staffUserId,
        action: 'RETURN_EQUIPMENT',
        entityName: 'EQUIPMENT_BORROWINGS',
        entityId: borrowing.borrowingId,
        oldValues: { status: borrowing.status },
        newValues: { status: statusValue, fines: generatedFines.map((f) => ({ fineId: f.fineId, type: f.fineType, amount: f.amount })) },
        ipAddress,
      });

      return { borrowing: (await this.borrowingRepository.getBorrowingById(conn, borrowing.borrowingId))!, generatedFines };
    }, staffUserId);
  }

  async getBorrowingsByBooking(query: { bookingId?: number; bookingNumber?: string }): Promise<BorrowingDTO[]> {
    return withConnection(async (conn) => {
      const bookingId =
        query.bookingId ?? (query.bookingNumber ? await this.bookingRepository.findBookingIdByNumber(conn, query.bookingNumber) : null);
      if (!bookingId) throw AppError.badRequest('กรุณาระบุ bookingId หรือ bookingNumber ที่ถูกต้อง');
      return this.borrowingRepository.getBorrowingsByBooking(conn, bookingId);
    });
  }

  async getMyFines(userId: number): Promise<FineDTO[]> {
    return withConnection((conn) => this.borrowingRepository.getFinesByUser(conn, userId));
  }

  async payFine(fineId: number, userId: number, ipAddress?: string): Promise<FineDTO> {
    return withTransaction(async (conn) => {
      const fine = await this.borrowingRepository.getFineById(conn, fineId);
      if (!fine) throw AppError.notFound('ไม่พบรายการค่าปรับ');
      if (fine.userId !== userId) throw AppError.forbidden('ชำระได้เฉพาะค่าปรับของตนเองเท่านั้น');
      if (fine.status !== 'UNPAID') throw AppError.conflict(`ค่าปรับนี้อยู่ในสถานะ ${fine.status} แล้ว`);

      await this.borrowingRepository.markFinePaid(conn, fineId);
      await insertNotification(conn, {
        userId,
        bookingId: fine.bookingId,
        title: 'ชำระค่าปรับแล้ว (Fine Paid)',
        message: `ชำระค่าปรับ ${fine.fineType} ของการจอง ${fine.bookingNumber} ยอด ฿${fine.amount.toFixed(2)} เรียบร้อยแล้ว`,
        type: 'SUCCESS',
      });
      await insertAudit(conn, {
        userId,
        action: 'PAY_FINE',
        entityName: 'FINES',
        entityId: fineId,
        oldValues: { status: 'UNPAID' },
        newValues: { status: 'PAID', amount: fine.amount },
        ipAddress,
      });
      const { userId: _u, ...dto } = (await this.borrowingRepository.getFineById(conn, fineId))!;
      return dto;
    }, userId);
  }
}
