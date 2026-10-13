import { withConnection, withTransaction, DbConnection } from '../config/db';
import { BUSINESS_RULES } from '../config/env';
import { PaymentRepository } from '../repositories/payment.repository';
import { BookingRepository, LockedBooking } from '../repositories/booking.repository';
import { expireStaleHolds, insertAudit, insertNotification, insertStatusHistory } from '../repositories/shared.repository';
import {
  CreatePaymentInput,
  PaymentDTO,
  ReceiptDTO,
  NotificationDTO,
  SlipCheck,
  SlipVerificationResult,
} from '../types/payment';
import { BookingDTO } from '../types/booking';
import { AppError } from '../utils/appError';
import { hasAnyRole } from '../utils/params';
import {
  validateSlipBuffer,
  uploadSlipToSupabase,
  deleteSlipFromSupabase,
  StoredSlip,
} from '../utils/slipStorage';

const amountsEqual = (a: number, b: number) => Math.abs(a - b) < 0.005;

// เกณฑ์ "ภาพสลิปชัดเจนพอให้ระบบตรวจเองได้"
const SLIP_READABLE_MIN_SIDE_PX = 300;
const SLIP_READABLE_MIN_BYTES = 10 * 1024;
const SLIP_REF_PATTERN = /^[A-Z0-9]{8,30}$/;

const normalizeSlipRef = (ref?: string) => (ref ? ref.replace(/[\s-]/g, '').toUpperCase() : undefined);

export class PaymentService {
  private paymentRepository = new PaymentRepository();
  private bookingRepository = new BookingRepository();

  // ============================================================
  // UC-4: ลูกค้าอัปโหลดสลิป + ตรวจสลิปอัตโนมัติ
  // ------------------------------------------------------------
  // input.slipFile มาจาก Multer Memory Storage (req.file.buffer)
  // ไม่มีไฟล์ชั่วคราวบน disk → อัปโหลดตรงจาก RAM ไป Supabase Storage
  // ============================================================
  async submitPayment(userId: number, input: CreatePaymentInput, ipAddress?: string): Promise<SlipVerificationResult> {
    // ตรวจไฟล์ก่อนเปิด Transaction (ไฟล์ผิดประเภท/ใหญ่เกินไม่ต้องแตะฐานข้อมูล)
    const validated = input.slipBuffer
      ? validateSlipBuffer(input.slipBuffer, input.slipMimeType || '')
      : null;

    // BR3: ถ้าเลย 15 นาทีแล้ว ยกเลิกการจองก่อน
    await withTransaction((conn) => expireStaleHolds(conn, { bookingId: input.bookingId }));

    // stored จะถูก set หลัง upload Supabase สำเร็จ (ใช้ลบทีหลังถ้า Transaction ล้ม)
    let stored: StoredSlip | null = null;

    try {
      return await withTransaction(async (conn) => {
        const booking = await this.bookingRepository.lockBooking(conn, input.bookingId);
        if (!booking) throw AppError.notFound('ไม่พบการจอง');
        if (booking.userId !== userId) throw AppError.forbidden('ส่งสลิปได้เฉพาะการจองของตนเองเท่านั้น');

        if (booking.status === 'EXPIRED') {
          throw AppError.badRequest(
            `BR3: หมดเวลาการชำระเงินแล้ว (ต้องชำระภายใน ${BUSINESS_RULES.HOLD_MINUTES} นาที) การจองถูกยกเลิกอัตโนมัติ กรุณาทำรายการจองใหม่`
          );
        }
        if (['CONFIRMED', 'PAYMENT_VERIFIED', 'CHECKED_IN', 'COMPLETED'].includes(booking.status)) {
          throw AppError.conflict('การจองนี้ชำระเงินเรียบร้อยแล้ว');
        }
        if (booking.status !== 'PENDING_PAYMENT') {
          throw AppError.badRequest(`ไม่สามารถชำระเงินได้ เนื่องจากการจองอยู่ในสถานะ ${booking.status}`);
        }
        if (await this.bookingRepository.hasPendingPayment(conn, booking.bookingId)) {
          throw AppError.conflict('มีสลิปของการจองนี้รอพนักงานตรวจสอบอยู่แล้ว กรุณารอผลการตรวจ');
        }

        // ========================================================
        // อัปโหลดสลิปขึ้น Supabase Storage (ถ้ามีไฟล์)
        // เหตุผล: อัปโหลดใน Transaction เพื่อให้ URL พร้อมก่อน INSERT ลง DB
        //         ถ้า DB ล้มหลัง upload → ลบไฟล์ออกใน catch block ด้านล่าง
        // ========================================================
        if (validated) {
          stored = await uploadSlipToSupabase(booking.bookingId, validated);
        }

        const slipRef = normalizeSlipRef(input.slipReference);

        // ---------- ตรวจสลิปอัตโนมัติ ----------
        const checks: SlipCheck[] = [];
        checks.push({
          code: 'FILE',
          label: 'ประเภทและขนาดไฟล์',
          passed: true,
          detail: stored
            ? `${stored.mimeType} ${(stored.size / 1024).toFixed(1)} KB${stored.width ? ` (${stored.width}x${stored.height} px)` : ''}`
            : 'แนบเป็นลิงก์รูปภาพ',
        });

        const dup = slipRef ? await this.paymentRepository.findSlipReferenceInUse(conn, slipRef) : null;
        checks.push({
          code: 'DUPLICATE',
          label: 'ตรวจสลิปซ้ำ (slip_ref)',
          passed: !dup,
          detail: dup
            ? `เลขอ้างอิง ${slipRef} ถูกใช้แล้วกับการจอง ${dup.bookingNumber}`
            : slipRef
              ? `เลขอ้างอิง ${slipRef} ยังไม่เคยถูกใช้`
              : 'ไม่มีเลขอ้างอิงให้ตรวจ',
        });

        const amountOk = amountsEqual(input.amount, booking.finalAmount);
        checks.push({
          code: 'AMOUNT',
          label: 'ยอดเงินตรงกับยอดจอง (BR6)',
          passed: amountOk,
          detail: `ยอดในสลิป ฿${input.amount.toFixed(2)} / ยอดที่ต้องชำระ ฿${booking.finalAmount.toFixed(2)}`,
        });

        const unclear: string[] = [];
        if (!stored) unclear.push('แนบเป็นลิงก์ ระบบอ่านภาพไม่ได้');
        if (!slipRef) unclear.push('อ่านเลขอ้างอิงจากสลิปไม่ได้');
        else if (!SLIP_REF_PATTERN.test(slipRef)) unclear.push(`เลขอ้างอิง "${slipRef}" รูปแบบไม่ถูกต้อง`);
        if (stored && stored.size < SLIP_READABLE_MIN_BYTES) unclear.push('ไฟล์ภาพบีบอัดมากเกินไป');
        if (stored?.width && stored.height && Math.min(stored.width, stored.height) < SLIP_READABLE_MIN_SIDE_PX) {
          unclear.push(`ความละเอียดภาพต่ำ (${stored.width}x${stored.height} px)`);
        }
        checks.push({
          code: 'READABLE',
          label: 'ความชัดเจนของภาพสลิป',
          passed: unclear.length === 0,
          detail: unclear.length ? unclear.join(', ') : 'ภาพชัดเจนและอ่านเลขอ้างอิงได้',
        });

        const base = {
          bookingId: booking.bookingId,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          // stored.url = Supabase Storage public URL (ไม่ใช่ local path)
          slipUrl: stored ? stored.url : (input.slipUrl ?? ''),
          slipReference: slipRef,
          slipMimeType: stored?.mimeType ?? null,
          slipFileSize: stored?.size ?? null,
        };

        // ---------- ผลที่ 1: ปฏิเสธอัตโนมัติ (สลิปซ้ำ / ยอดไม่ตรง) ----------
        if (dup || !amountOk) {
          const reason = dup
            ? `สลิปซ้ำ: เลขอ้างอิง ${slipRef} ถูกใช้แล้วกับการจอง ${dup.bookingNumber}`
            : `BR6: ยอดเงินในสลิป (฿${input.amount.toFixed(2)}) ไม่ตรงกับยอดที่ต้องชำระ (฿${booking.finalAmount.toFixed(2)})`;
          const paymentId = await this.paymentRepository.insertPayment(conn, {
            ...base,
            slipReference: dup ? null : slipRef,
            status: 'REJECTED',
            verificationMethod: 'AUTO',
            rejectionReason: reason,
          });
          await insertStatusHistory(conn, booking.bookingId, 'PENDING_PAYMENT', `ระบบตรวจสลิปอัตโนมัติปฏิเสธ payment #${paymentId}: ${reason}`, userId);
          await insertNotification(conn, {
            userId,
            bookingId: booking.bookingId,
            title: 'สลิปไม่ผ่านการตรวจสอบ (Slip Rejected)',
            message: `สลิปของการจอง ${booking.bookingNumber} ไม่ผ่านการตรวจอัตโนมัติ: ${reason} กรุณาตรวจสอบและอัปโหลดใหม่ก่อนหมดเวลาชำระ`,
            type: 'WARNING',
          });
          await insertAudit(conn, { userId, action: 'AUTO_REJECT_PAYMENT', entityName: 'payments', entityId: paymentId, newValues: { bookingId: booking.bookingId, amount: input.amount, slipReference: slipRef, status: 'REJECTED', reason }, ipAddress });
          return { result: 'REJECTED' as const, message: reason, checks, payment: (await this.paymentRepository.getPaymentById(conn, paymentId))! };
        }

        // ---------- ผลที่ 2: ภาพไม่ชัด → คิว Inspector Console ----------
        if (unclear.length) {
          const reviewReason = `ภาพไม่ชัดเจน: ${unclear.join(', ')}`;
          const paymentId = await this.paymentRepository.insertPayment(conn, { ...base, status: 'PENDING', verificationMethod: 'MANUAL', reviewReason });
          await insertStatusHistory(conn, booking.bookingId, 'PENDING_PAYMENT', `ส่งสลิปแล้ว (payment #${paymentId}) ${reviewReason} — ส่งให้พนักงานตรวจ หยุดนับเวลา BR3`, userId);
          await insertNotification(conn, { userId, bookingId: booking.bookingId, title: 'สลิปรอพนักงานตรวจสอบ (Manual Review)', message: `ระบบได้รับสลิปของการจอง ${booking.bookingNumber} ยอด ฿${input.amount.toFixed(2)} แล้ว แต่${reviewReason} จึงส่งให้พนักงานตรวจสอบ`, type: 'INFO' });
          await insertAudit(conn, { userId, action: 'SUBMIT_PAYMENT_MANUAL_REVIEW', entityName: 'payments', entityId: paymentId, newValues: { bookingId: booking.bookingId, amount: input.amount, slipReference: slipRef, status: 'PENDING', reviewReason }, ipAddress });
          return { result: 'MANUAL_REVIEW' as const, message: `${reviewReason} — ส่งให้พนักงานตรวจสอบแล้ว`, checks, payment: (await this.paymentRepository.getPaymentById(conn, paymentId))! };
        }

        // ---------- ผลที่ 3: ผ่านทุกข้อ → อนุมัติอัตโนมัติ ----------
        const paymentId = await this.paymentRepository.insertPayment(conn, { ...base, status: 'PENDING', verificationMethod: 'AUTO' });
        await insertStatusHistory(conn, booking.bookingId, 'PENDING_PAYMENT', `ส่งสลิปแล้ว (payment #${paymentId}) ระบบกำลังตรวจอัตโนมัติ`, userId);
        const { receipt } = await this.confirmPayment(conn, { paymentId, amount: input.amount }, booking, null, ipAddress);
        return {
          result: 'VERIFIED' as const,
          message: `ตรวจสลิปอัตโนมัติผ่าน ชำระเงินเรียบร้อย ออกใบเสร็จเลขที่ ${receipt.receiptNumber}`,
          checks,
          payment: (await this.paymentRepository.getPaymentById(conn, paymentId))!,
          receipt,
        };
      }, userId);
    } catch (err) {
      // ถ้า DB transaction ล้มหลัง upload Supabase → ลบไฟล์ออก (ไม่ให้มี orphan files)
      const s = stored as StoredSlip | null;
      if (s) await deleteSlipFromSupabase(s.storagePath).catch(() => {});

      throw err;
    }
  }

  async getPendingPayments(): Promise<PaymentDTO[]> {
    return withConnection((conn) => this.paymentRepository.getPendingPayments(conn));
  }

  private async confirmPayment(conn: DbConnection, payment: { paymentId: number; amount: number }, booking: LockedBooking, staffUserId: number | null, ipAddress?: string): Promise<{ receipt: ReceiptDTO; notification: NotificationDTO }> {
    const verifier = staffUserId === null ? 'ระบบตรวจสลิปอัตโนมัติ' : 'พนักงานอนุมัติสลิป';
    await this.paymentRepository.markVerified(conn, payment.paymentId, staffUserId);
    await this.bookingRepository.transitionStatus(conn, booking.bookingId, ['PENDING_PAYMENT', 'PAYMENT_VERIFIED'], 'CONFIRMED');

    const issued = await this.paymentRepository.insertReceipt(conn, { bookingId: booking.bookingId, paymentId: payment.paymentId, totalAmount: payment.amount });
    await insertStatusHistory(conn, booking.bookingId, 'CONFIRMED', `ชำระเงินแล้ว (Paid) — ${verifier} payment #${payment.paymentId} ออกใบเสร็จ ${issued.receiptNumber}`, staffUserId);

    const notification: NotificationDTO = {
      notificationId: 0, userId: booking.userId, bookingId: booking.bookingId,
      title: 'ชำระเงินสำเร็จ (Payment Verified)',
      message: `การจอง ${booking.bookingNumber} วันที่ ${booking.bookingDate} ${booking.startTime}-${booking.endTime} ชำระเงินเรียบร้อยแล้ว ดูใบเสร็จเลขที่ ${issued.receiptNumber} และ QR Code สำหรับเช็คอินได้ที่หน้าการจองของฉัน`,
      type: 'SUCCESS', isRead: false, createdAt: new Date(),
    };
    await insertNotification(conn, notification);
    await insertAudit(conn, { userId: staffUserId, action: staffUserId === null ? 'AUTO_VERIFY_PAYMENT' : 'VERIFY_PAYMENT', entityName: 'payments', entityId: payment.paymentId, oldValues: { paymentStatus: 'PENDING', bookingStatus: booking.status }, newValues: { paymentStatus: 'VERIFIED', bookingStatus: 'CONFIRMED', receiptNumber: issued.receiptNumber }, ipAddress });
    return { receipt: (await this.paymentRepository.getReceiptByBookingId(conn, booking.bookingId))!, notification };
  }

  async verifyPayment(paymentId: number, staffUserId: number, ipAddress?: string): Promise<{ receipt: ReceiptDTO; notification: NotificationDTO; booking: BookingDTO }> {
    return withTransaction(async (conn) => {
      const payment = await this.paymentRepository.lockPayment(conn, paymentId);
      if (!payment) throw AppError.notFound('ไม่พบรายการชำระเงิน');
      if (payment.status !== 'PENDING') throw AppError.conflict(`สลิปนี้ถูกตรวจไปแล้ว (สถานะ ${payment.status})`);

      const booking = await this.bookingRepository.lockBooking(conn, payment.bookingId);
      if (!booking) throw AppError.notFound('ไม่พบการจองของสลิปนี้');
      if (!['PENDING_PAYMENT', 'PAYMENT_VERIFIED'].includes(booking.status)) {
        throw AppError.conflict(`ไม่สามารถอนุมัติได้ เนื่องจากการจอง ${booking.bookingNumber} อยู่ในสถานะ ${booking.status}`);
      }
      if (!amountsEqual(payment.amount, booking.finalAmount)) {
        throw AppError.badRequest(`BR6: ไม่สามารถอนุมัติได้ ยอดในสลิป ฿${payment.amount.toFixed(2)} ไม่ตรงกับยอดการจอง ฿${booking.finalAmount.toFixed(2)}`);
      }
      if (payment.slipReference) {
        const dup = await this.paymentRepository.findSlipReferenceInUse(conn, payment.slipReference, payment.paymentId);
        if (dup) throw AppError.conflict(`สลิปซ้ำ: เลขอ้างอิง ${payment.slipReference} ถูกใช้กับการจอง ${dup.bookingNumber} แล้ว`);
      }

      const { receipt, notification } = await this.confirmPayment(conn, payment, booking, staffUserId, ipAddress);
      return { receipt, notification, booking: (await this.bookingRepository.getBookingById(conn, booking.bookingId))! };
    }, staffUserId);
  }

  async rejectPayment(paymentId: number, reason: string, staffUserId: number, ipAddress?: string): Promise<NotificationDTO> {
    return withTransaction(async (conn) => {
      const payment = await this.paymentRepository.lockPayment(conn, paymentId);
      if (!payment) throw AppError.notFound('ไม่พบรายการชำระเงิน');
      if (payment.status !== 'PENDING') throw AppError.conflict(`สลิปนี้ถูกตรวจไปแล้ว (สถานะ ${payment.status})`);
      const booking = await this.bookingRepository.lockBooking(conn, payment.bookingId);
      if (!booking) throw AppError.notFound('ไม่พบการจองของสลิปนี้');

      await this.paymentRepository.markRejected(conn, payment.paymentId, reason, staffUserId);
      const stillPending = booking.status === 'PENDING_PAYMENT';
      if (stillPending) {
        await this.bookingRepository.restartHold(conn, booking.bookingId, BUSINESS_RULES.HOLD_MINUTES);
        await insertStatusHistory(conn, booking.bookingId, 'PENDING_PAYMENT', `สลิป payment #${payment.paymentId} ถูกปฏิเสธ: ${reason} — เริ่มนับเวลาชำระใหม่ ${BUSINESS_RULES.HOLD_MINUTES} นาที`, staffUserId);
      }

      const notification: NotificationDTO = {
        notificationId: 0, userId: booking.userId, bookingId: booking.bookingId,
        title: 'สลิปชำระเงินถูกปฏิเสธ (Slip Rejected)',
        message: stillPending
          ? `สลิปของการจอง ${booking.bookingNumber} ไม่ผ่านการตรวจสอบ: ${reason} กรุณาอัปโหลดสลิปใหม่ภายใน ${BUSINESS_RULES.HOLD_MINUTES} นาที`
          : `สลิปของการจอง ${booking.bookingNumber} ไม่ผ่านการตรวจสอบ: ${reason}`,
        type: 'WARNING', isRead: false, createdAt: new Date(),
      };
      await insertNotification(conn, notification);
      await insertAudit(conn, { userId: staffUserId, action: 'REJECT_PAYMENT', entityName: 'payments', entityId: payment.paymentId, oldValues: { paymentStatus: 'PENDING' }, newValues: { paymentStatus: 'REJECTED', reason }, ipAddress });
      return notification;
    }, staffUserId);
  }

  async getReceiptByBookingId(bookingId: number, userId: number, roles: string[]): Promise<ReceiptDTO> {
    const receipt = await withConnection((conn) => this.paymentRepository.getReceiptByBookingId(conn, bookingId));
    if (!receipt) throw AppError.notFound('ยังไม่มีใบเสร็จ (รอพนักงานอนุมัติการชำระเงิน)');
    if (!hasAnyRole(roles, 'STAFF', 'ADMIN', 'EXECUTIVE') && receipt.userId !== userId) throw AppError.forbidden('ดูได้เฉพาะใบเสร็จของตนเองเท่านั้น');
    return receipt;
  }

  async getPaymentsByBooking(bookingId: number, userId: number, roles: string[]): Promise<PaymentDTO[]> {
    return withConnection(async (conn) => {
      const payments = await this.paymentRepository.getPaymentsByBooking(conn, bookingId);
      if (!hasAnyRole(roles, 'STAFF', 'ADMIN', 'EXECUTIVE') && payments.some((p) => p.userId !== userId)) throw AppError.forbidden('ดูได้เฉพาะการชำระเงินของตนเองเท่านั้น');
      return payments;
    });
  }

  async getUserNotifications(userId: number): Promise<NotificationDTO[]> {
    return withConnection((conn) => this.paymentRepository.getUserNotifications(conn, userId));
  }

  async markNotificationRead(notificationId: number, userId: number): Promise<void> {
    const ok = await withTransaction((conn) => this.paymentRepository.markNotificationRead(conn, notificationId, userId), userId);
    if (!ok) throw AppError.notFound('ไม่พบการแจ้งเตือน');
  }
}
