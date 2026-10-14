import { withConnection, withTransaction, DbConnection } from '../config/db';
import { BUSINESS_RULES, config } from '../config/env';
import { buildPromptPayPayload, maskPromptPayId } from '../utils/promptpay';
import { PaymentRepository } from '../repositories/payment.repository';
import { BookingRepository, LockedBooking } from '../repositories/booking.repository';
import { expireStaleHolds, insertAudit, insertNotification, insertStatusHistory } from '../repositories/shared.repository';
import {
  CreatePaymentInput,
  PaymentDTO,
  ReceiptDTO,
  NotificationDTO,
  PaymentInstructions,
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
  createSignedSlipUrls,
  StoredSlip,
} from '../utils/slipStorage';

// เทียบเงินเป็นหน่วยสตางค์ (จำนวนเต็ม) กันปัญหาทศนิยมของ floating point
const toSatang = (baht: number) => Math.round(baht * 100);
const amountsEqual = (a: number, b: number) => toSatang(a) === toSatang(b);

// เกณฑ์ "ภาพสลิปชัดพอให้พนักงานอ่านได้" — ใช้แจ้งเตือนพนักงาน ไม่ใช่เกณฑ์อนุมัติ
const SLIP_READABLE_MIN_SIDE_PX = 300;
const SLIP_READABLE_MIN_BYTES = 10 * 1024;

export class PaymentService {
  private paymentRepository = new PaymentRepository();
  private bookingRepository = new BookingRepository();

  // ============================================================
  // UC-4: ลูกค้าส่งหลักฐานการโอน (สลิป)
  // ------------------------------------------------------------
  // ระบบยังไม่มี API ของธนาคาร/PromptPay ที่ยืนยันได้ว่าเงินเข้าบัญชีจริง
  //   - สลิปซ้ำ / ยอดไม่ตรงยอดจอง → REJECTED ทันที (ลูกค้าส่งใหม่ได้ภายในเวลาที่เหลือ)
  //   - โหมดสาธิต (PAYMENT_DEMO_MODE) + ภาพชัด → VERIFIED อัตโนมัติ (สำหรับนำเสนอด้วยสลิป demo)
  //   - นอกนั้น → payment PENDING รอพนักงานยืนยันยอดเงินเข้าบัญชี (หยุดนับเวลา 15 นาที)
  // ผลตรวจเบื้องต้น (ไฟล์, ยอด, ความชัด) เป็นข้อมูลประกอบให้พนักงานเท่านั้น
  // State: PENDING_PAYMENT ─ส่งสลิป→ (payment PENDING) ─พนักงานอนุมัติ→ CONFIRMED + ใบเสร็จ
  //                                                   └─พนักงานปฏิเสธ→ PENDING_PAYMENT (ส่งใหม่ได้)
  // ============================================================
  async submitPayment(userId: number, input: CreatePaymentInput, ipAddress?: string): Promise<SlipVerificationResult> {
    // ตรวจไฟล์ก่อนเปิด Transaction (ไฟล์ผิดประเภท/ใหญ่เกินไม่ต้องแตะฐานข้อมูล)
    const validated = validateSlipBuffer(input.slipBuffer, input.slipMimeType);

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
            `หมดเวลาการชำระเงินแล้ว (ต้องชำระภายใน ${BUSINESS_RULES.HOLD_MINUTES} นาที) การจองถูกยกเลิกอัตโนมัติ กรุณาทำรายการจองใหม่`
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
        // อัปโหลดสลิปขึ้น Supabase Storage (bucket private)
        // อัปโหลดใน Transaction เพื่อให้ path พร้อมก่อน INSERT ลง DB
        // ถ้า DB ล้มหลัง upload → ลบไฟล์ออกใน catch block ด้านล่าง (ไม่ทิ้ง orphan file)
        // ========================================================
        stored = await uploadSlipToSupabase(booking.bookingId, validated);
        const slip = stored;
        const slipRef = input.slipReference;

        // ---------- ตรวจสลิปเบื้องต้น (ข้อมูลประกอบ ไม่ใช่การยืนยันการชำระเงิน) ----------
        const checks: SlipCheck[] = [];
        checks.push({
          code: 'FILE',
          label: 'ประเภทและขนาดไฟล์',
          passed: true,
          detail: `${slip.mimeType} ${(slip.size / 1024).toFixed(1)} KB${slip.width ? ` (${slip.width}x${slip.height} px)` : ''}`,
        });

        // เลขอ้างอิงไม่บังคับ — ตรวจสลิปซ้ำได้เฉพาะเมื่อมีเลขอ้างอิงส่งมา
        const dup = slipRef ? await this.paymentRepository.findSlipReferenceInUse(conn, slipRef) : null;
        if (slipRef) {
          checks.push({
            code: 'DUPLICATE',
            label: 'เลขอ้างอิงไม่ซ้ำกับสลิปอื่น',
            passed: !dup,
            detail: dup ? `เลขอ้างอิง ${slipRef} ถูกใช้แล้วกับการจอง ${dup.bookingNumber}` : `เลขอ้างอิง ${slipRef} ยังไม่เคยถูกใช้`,
          });
        }

        // ยอดที่ต้องชำระมาจาก booking.final_amount ที่ backend คำนวณ ไม่ใช่จาก client
        const amountOk = amountsEqual(input.amount, booking.finalAmount);
        checks.push({
          code: 'AMOUNT',
          label: 'ยอดเงินตรงกับยอดจอง',
          passed: amountOk,
          detail: `ยอดในสลิป ฿${input.amount.toFixed(2)} / ยอดที่ต้องชำระ ฿${booking.finalAmount.toFixed(2)}`,
        });

        const unclear: string[] = [];
        if (slip.size < SLIP_READABLE_MIN_BYTES) unclear.push('ไฟล์ภาพบีบอัดมากเกินไป');
        if (slip.width && slip.height && Math.min(slip.width, slip.height) < SLIP_READABLE_MIN_SIDE_PX) {
          unclear.push(`ความละเอียดภาพต่ำ (${slip.width}x${slip.height} px)`);
        }
        checks.push({
          code: 'READABLE',
          label: 'ความชัดเจนของภาพสลิป',
          passed: unclear.length === 0,
          detail: unclear.length ? unclear.join(', ') : 'ขนาดและความละเอียดภาพเพียงพอ',
        });

        const base = {
          bookingId: booking.bookingId,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          slipUrl: slip.storagePath, // เก็บ path ใน bucket (ไม่ใช่ public URL)
          slipReference: slipRef ?? null,
          slipMimeType: slip.mimeType,
          slipFileSize: slip.size,
        };

        // ---------- ผลที่ 1: ปฏิเสธอัตโนมัติ (สลิปซ้ำ / ยอดไม่ตรง) ----------
        if (dup || !amountOk) {
          const reason = dup
            ? `สลิปซ้ำ: เลขอ้างอิง ${slipRef} ถูกใช้แล้วกับการจอง ${dup.bookingNumber}`
            : `ยอดเงินในสลิป (฿${input.amount.toFixed(2)}) ไม่ตรงกับยอดที่ต้องชำระ (฿${booking.finalAmount.toFixed(2)})`;
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
          const rejected = (await this.paymentRepository.getPaymentById(conn, paymentId))!;
          return { result: 'REJECTED' as const, message: reason, checks, payment: rejected };
        }

        // ---------- ผลที่ 2 (เฉพาะโหมดสาธิต): ยอดตรง → อนุมัติอัตโนมัติทันที + ออกใบเสร็จ ----------
        // ใช้สำหรับนำเสนอด้วยสลิป demo (ภาพไม่ชัดก็ผ่าน ผลตรวจความชัดแสดงเป็นข้อมูลประกอบ)
        // ระบบรับเงินจริงต้องตั้ง PAYMENT_DEMO_MODE=false → ไปผลที่ 3 ให้เจ้าหน้าที่ตรวจ
        if (config.paymentDemoMode) {
          const paymentId = await this.paymentRepository.insertPayment(conn, { ...base, status: 'PENDING', verificationMethod: 'AUTO' });
          await insertStatusHistory(conn, booking.bookingId, 'PENDING_PAYMENT', `ส่งสลิปแล้ว (payment #${paymentId}) — โหมดสาธิต: ระบบอนุมัติอัตโนมัติ`, userId);
          const { receipt } = await this.confirmPayment(conn, { paymentId }, booking, null, ipAddress);
          return {
            result: 'VERIFIED' as const,
            message: `ชำระเงินเรียบร้อย (โหมดสาธิต: ระบบอนุมัติสลิปอัตโนมัติ) ออกใบเสร็จเลขที่ ${receipt.receiptNumber}`,
            checks,
            payment: (await this.paymentRepository.getPaymentById(conn, paymentId))!,
            receipt,
          };
        }

        // ---------- ผลที่ 3: รอพนักงานยืนยันยอดเงินเข้าบัญชี ----------
        const reviewReason = unclear.length
          ? `ตรวจเบื้องต้นผ่าน แต่ภาพอาจไม่ชัด: ${unclear.join(', ')}`
          : 'ตรวจเบื้องต้นผ่าน (ยอดตรงกับยอดจอง) — รอยืนยันยอดเงินเข้าบัญชี';
        const paymentId = await this.paymentRepository.insertPayment(conn, { ...base, status: 'PENDING', verificationMethod: 'MANUAL', reviewReason });
        await insertStatusHistory(conn, booking.bookingId, 'PENDING_PAYMENT', `ส่งสลิปแล้ว (payment #${paymentId}) รอพนักงานตรวจสอบ — หยุดนับเวลาชำระเงิน`, userId);
        await insertNotification(conn, {
          userId,
          bookingId: booking.bookingId,
          title: 'ได้รับสลิปแล้ว รอเจ้าหน้าที่ตรวจสอบ',
          message: `ระบบได้รับสลิปของการจอง ${booking.bookingNumber} ยอด ฿${input.amount.toFixed(2)} แล้ว เจ้าหน้าที่จะตรวจสอบยอดเงินเข้าบัญชีและแจ้งผลทางการแจ้งเตือนนี้ (ยังไม่ถือว่าชำระเงินสำเร็จจนกว่าจะได้รับการอนุมัติ)`,
          type: 'INFO',
        });
        await insertAudit(conn, { userId, action: 'SUBMIT_PAYMENT', entityName: 'payments', entityId: paymentId, newValues: { bookingId: booking.bookingId, amount: input.amount, slipReference: slipRef, status: 'PENDING', reviewReason }, ipAddress });
        const pending = (await this.paymentRepository.getPaymentById(conn, paymentId))!;
        return {
          result: 'MANUAL_REVIEW' as const,
          message: 'ได้รับสลิปแล้ว — เจ้าหน้าที่จะตรวจสอบยอดเงินเข้าบัญชีก่อนยืนยันการจอง การอัปโหลดสลิปยังไม่ถือว่าชำระเงินสำเร็จ',
          checks,
          payment: pending,
        };
      }, userId).then(async (result) => ({ ...result, payment: (await this.signSlipUrls([result.payment]))[0] }));
    } catch (err) {
      // ถ้า DB transaction ล้มหลัง upload Supabase → ลบไฟล์ออก (ไม่ให้มี orphan files)
      const s = stored as StoredSlip | null;
      if (s) await deleteSlipFromSupabase(s.storagePath).catch(() => {});

      throw err;
    }
  }

  // ============================================================
  // signSlipUrls — แทน path ใน slip_url ด้วย Signed URL อายุสั้น
  // เรียกหลังตรวจสิทธิ์แล้วเท่านั้น (เจ้าของการจอง หรือ STAFF/ADMIN)
  // ============================================================
  private async signSlipUrls(payments: PaymentDTO[]): Promise<PaymentDTO[]> {
    const stored = payments.map((p) => p.slipUrl).filter((v): v is string => !!v);
    const signed = stored.length ? await createSignedSlipUrls(stored) : new Map<string, string>();
    return payments.map((p) => ({ ...p, slipUrl: p.slipUrl ? signed.get(p.slipUrl) : undefined }));
  }

  async getPendingPayments(): Promise<PaymentDTO[]> {
    const payments = await withConnection((conn) => this.paymentRepository.getPendingPayments(conn));
    return this.signSlipUrls(payments);
  }

  // ยืนยันการชำระเงิน — พนักงานอนุมัติ (staffUserId) หรือระบบอนุมัติในโหมดสาธิต (null)
  // ต้องอยู่ใน Transaction ที่ล็อก booking + payment แล้ว
  private async confirmPayment(conn: DbConnection, payment: { paymentId: number }, booking: LockedBooking, staffUserId: number | null, ipAddress?: string): Promise<{ receipt: ReceiptDTO; notification: NotificationDTO }> {
    const verifier = staffUserId === null ? 'ระบบอนุมัติอัตโนมัติ (โหมดสาธิต)' : 'พนักงานอนุมัติสลิป';
    const verified = await this.paymentRepository.markVerified(conn, payment.paymentId, staffUserId);
    if (!verified) throw AppError.conflict('สลิปนี้ถูกตรวจไปแล้ว');
    const confirmed = await this.bookingRepository.transitionStatus(conn, booking.bookingId, ['PENDING_PAYMENT', 'PAYMENT_VERIFIED'], 'CONFIRMED');
    if (!confirmed) throw AppError.conflict(`ไม่สามารถยืนยันการจอง ${booking.bookingNumber} ได้ เนื่องจากสถานะเปลี่ยนไปแล้ว`);

    // ยอดในใบเสร็จ = ยอดที่ backend คำนวณ (booking.final_amount) ไม่ใช่ยอดที่ลูกค้ากรอก
    const issued = await this.paymentRepository.insertReceipt(conn, { bookingId: booking.bookingId, paymentId: payment.paymentId, totalAmount: booking.finalAmount });
    await insertStatusHistory(conn, booking.bookingId, 'CONFIRMED', `ชำระเงินแล้ว (Paid) — ${verifier} payment #${payment.paymentId} ออกใบเสร็จ ${issued.receiptNumber}`, staffUserId);

    const notification: NotificationDTO = {
      notificationId: 0, userId: booking.userId, bookingId: booking.bookingId,
      title: 'ชำระเงินสำเร็จ (Payment Verified)',
      message: `การจอง ${booking.bookingNumber} วันที่ ${booking.bookingDate} ${booking.startTime}-${booking.endTime} ชำระเงินเรียบร้อยแล้ว ดูใบเสร็จเลขที่ ${issued.receiptNumber} และ QR Code สำหรับเช็คอินได้ที่หน้าการจองของฉัน`,
      type: 'SUCCESS', isRead: false, createdAt: new Date(),
    };
    await insertNotification(conn, notification);
    await insertAudit(conn, { userId: staffUserId, action: staffUserId === null ? 'AUTO_VERIFY_PAYMENT_DEMO' : 'VERIFY_PAYMENT', entityName: 'payments', entityId: payment.paymentId, oldValues: { paymentStatus: 'PENDING', bookingStatus: booking.status }, newValues: { paymentStatus: 'VERIFIED', bookingStatus: 'CONFIRMED', receiptNumber: issued.receiptNumber }, ipAddress });
    return { receipt: (await this.paymentRepository.getReceiptByBookingId(conn, booking.bookingId))!, notification };
  }

  // ล็อกตามลำดับเดียวกันทั้งระบบ: booking → payment (ส่งสลิป/ยกเลิก/อนุมัติ/ปฏิเสธ) กัน deadlock
  private async lockBookingThenPayment(conn: DbConnection, paymentId: number) {
    const ref = await this.paymentRepository.getPaymentById(conn, paymentId);
    if (!ref) throw AppError.notFound('ไม่พบรายการชำระเงิน');
    const booking = await this.bookingRepository.lockBooking(conn, ref.bookingId);
    if (!booking) throw AppError.notFound('ไม่พบการจองของสลิปนี้');
    const payment = await this.paymentRepository.lockPayment(conn, paymentId);
    if (!payment) throw AppError.notFound('ไม่พบรายการชำระเงิน');
    if (payment.status !== 'PENDING') throw AppError.conflict(`สลิปนี้ถูกตรวจไปแล้ว (สถานะ ${payment.status})`);
    return { booking, payment };
  }

  async verifyPayment(paymentId: number, staffUserId: number, ipAddress?: string): Promise<{ receipt: ReceiptDTO; notification: NotificationDTO; booking: BookingDTO }> {
    return withTransaction(async (conn) => {
      const { booking, payment } = await this.lockBookingThenPayment(conn, paymentId);
      if (!['PENDING_PAYMENT', 'PAYMENT_VERIFIED'].includes(booking.status)) {
        throw AppError.conflict(`ไม่สามารถอนุมัติได้ เนื่องจากการจอง ${booking.bookingNumber} อยู่ในสถานะ ${booking.status}`);
      }
      if (!amountsEqual(payment.amount, booking.finalAmount)) {
        throw AppError.badRequest(`ไม่สามารถอนุมัติได้ ยอดในสลิป ฿${payment.amount.toFixed(2)} ไม่ตรงกับยอดการจอง ฿${booking.finalAmount.toFixed(2)}`);
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
      const { booking, payment } = await this.lockBookingThenPayment(conn, paymentId);

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

  // Object-level authorization: ตรวจเจ้าของ "การจอง" ก่อน (ไม่อิงว่ามี payment หรือยัง)
  // รูปสลิปเป็นข้อมูลส่วนบุคคล → ลูกค้าเห็นเฉพาะของตนเอง, พนักงาน/ผู้ดูแลเห็นได้ (ผู้บริหารเห็นข้อมูลยอดแต่ไม่เห็นรูป)
  async getPaymentsByBooking(bookingId: number, userId: number, roles: string[]): Promise<PaymentDTO[]> {
    const isStaff = hasAnyRole(roles, 'STAFF', 'ADMIN');
    const payments = await withConnection(async (conn) => {
      const owner = await conn.query<{ user_id: number }>('SELECT user_id FROM bookings WHERE booking_id = $1', [bookingId]);
      if (!owner.rows[0]) throw AppError.notFound('ไม่พบการจอง');
      if (!isStaff && !hasAnyRole(roles, 'EXECUTIVE') && owner.rows[0].user_id !== userId) {
        throw AppError.forbidden('ดูได้เฉพาะการชำระเงินของตนเองเท่านั้น');
      }
      return this.paymentRepository.getPaymentsByBooking(conn, bookingId);
    });
    const canSeeSlip = isStaff || payments.every((p) => p.userId === userId);
    return canSeeSlip ? this.signSlipUrls(payments) : payments.map((p) => ({ ...p, slipUrl: undefined }));
  }

  // ============================================================
  // ข้อมูลสำหรับโอนเงิน: ยอดจากฐานข้อมูล + บัญชีรับเงินจริงจาก env + PromptPay QR payload
  // เฉพาะเจ้าของการจอง และเฉพาะการจองที่ยังรอชำระ
  // ============================================================
  async getPaymentInstructions(bookingId: number, userId: number): Promise<PaymentInstructions> {
    const booking = await withConnection((conn) => this.bookingRepository.getBookingById(conn, bookingId));
    if (!booking) throw AppError.notFound('ไม่พบการจอง');
    if (booking.userId !== userId) throw AppError.forbidden('ดูได้เฉพาะการจองของตนเองเท่านั้น');
    if (booking.status !== 'PENDING_PAYMENT') throw AppError.conflict(`การจองนี้อยู่ในสถานะ ${booking.status} ไม่ต้องชำระเงิน`);

    const { payee } = config;
    const amount = booking.finalAmount;
    return {
      bookingNumber: booking.bookingNumber,
      amount,
      configured: !!(payee.promptPayId || payee.bankAccountNo),
      demo: config.paymentDemoMode,
      accountName: payee.accountName || undefined,
      promptPay: payee.promptPayId
        ? { maskedId: maskPromptPayId(payee.promptPayId), payload: buildPromptPayPayload(payee.promptPayId, amount) }
        : undefined,
      bank: payee.bankAccountNo ? { bankName: payee.bankName, accountNo: payee.bankAccountNo } : undefined,
    };
  }

  async getUserNotifications(userId: number): Promise<NotificationDTO[]> {
    return withConnection((conn) => this.paymentRepository.getUserNotifications(conn, userId));
  }

  async markNotificationRead(notificationId: number, userId: number): Promise<void> {
    const ok = await withTransaction((conn) => this.paymentRepository.markNotificationRead(conn, notificationId, userId), userId);
    if (!ok) throw AppError.notFound('ไม่พบการแจ้งเตือน');
  }
}
