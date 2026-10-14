export interface PaymentDTO {
  paymentId: number;
  bookingId: number;
  bookingNumber?: string;
  bookingStatus?: string;
  bookingFinalAmount?: number;
  amountMatches?: boolean;        // BR6: ยอดสลิปตรงกับยอดการจองหรือไม่ (แสดงให้พนักงานเห็นใน UC-7)
  holdExpiresAt?: Date;
  userId?: number;
  userName?: string;
  customerName?: string;
  courtName?: string;
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  paymentMethod: string;
  amount: number;
  slipUrl?: string;
  slipReference?: string;
  slipMimeType?: string;
  slipFileSize?: number;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  verificationMethod?: 'AUTO' | 'MANUAL';
  reviewReason?: string;           // เหตุผลที่ระบบส่งเข้าคิวให้พนักงานตรวจ (Inspector Console)
  minutesWaiting?: number;
  verifiedBy?: number;
  verifiedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
}

export interface ReceiptDTO {
  receiptId: number;
  receiptNumber: string;
  bookingId: number;
  bookingNumber?: string;
  paymentId: number;
  userId?: number;
  userName?: string;
  customerName?: string;
  courtName?: string;
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  totalCourtFee?: number;
  totalEquipmentFee?: number;
  discountAmount?: number;
  totalAmount: number;
  paymentMethod?: string;
  slipReference?: string;
  issuedBy?: number;
  issuedByName?: string;
  verificationMethod?: 'AUTO' | 'MANUAL';
  issuedAt: Date;
  pdfUrl?: string;
}

export interface NotificationDTO {
  notificationId: number;
  userId: number;
  bookingId?: number;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT';
  isRead: boolean;
  createdAt: Date;
}

export interface AuditLogDTO {
  logId: number;
  userId?: number;
  action: string;
  entityName: string;
  entityId?: number;
  oldValues?: string;
  newValues?: string;
  ipAddress?: string;
  createdAt: Date;
}

export interface CreatePaymentInput {
  bookingId: number;
  amount: number;          // ยอดตามที่ลูกค้าอ่านจากสลิป — ใช้เทียบกับยอดที่ backend คำนวณเท่านั้น
  paymentMethod: 'PROMPTPAY' | 'BANK_TRANSFER' | 'SLIP_TRANSFER';
  // Multer Memory Storage buffer (multipart/form-data upload) — บังคับแนบไฟล์เสมอ
  slipBuffer: Buffer;
  slipMimeType: string;
  slipReference?: string;  // ไม่บังคับ · ถ้ามีผ่าน normalizeSlipRef + SLIP_REF_RE แล้ว
}

// ผลการตรวจสลิปเบื้องต้น (ข้อมูลประกอบให้พนักงาน — ไม่ใช่หลักฐานว่าเงินเข้าบัญชีแล้ว)
export interface SlipCheck {
<<<<<<< HEAD
  code: 'FILE' | 'DUPLICATE' | 'AMOUNT' | 'SLIP_CONTENT' | 'READABLE';
=======
  code: 'FILE' | 'DUPLICATE' | 'AMOUNT' | 'READABLE';
>>>>>>> 7911668a7e5d511f83e82c3f30e2b56c2428aac6
  label: string;
  passed: boolean;
  detail: string;
}

// ข้อมูลสำหรับโอนเงิน (GET /api/payments/instructions/:bookingId)
export interface PaymentInstructions {
  bookingNumber: string;
  amount: number;            // ยอดจาก bookings.final_amount
  configured: boolean;       // false = ยังไม่ได้ตั้งบัญชีรับเงินใน env
  demo: boolean;             // true = โหมดสาธิต: หน้าเว็บแสดง QR จำลอง (สแกนจ่ายจริงไม่ได้)
  accountName?: string;
  promptPay?: { maskedId: string; payload: string };
  bank?: { bankName: string; accountNo: string };
}

// ผลการส่งสลิป:
//   REJECTED      = ปฏิเสธทันที (สลิปซ้ำ / ยอดไม่ตรง) ส่งใหม่ได้
//   MANUAL_REVIEW = รอพนักงานยืนยันยอดเงินเข้าบัญชี (payment.status = PENDING)
//   VERIFIED      = อนุมัติอัตโนมัติ — เกิดได้เฉพาะโหมดสาธิต (PAYMENT_DEMO_MODE) เท่านั้น
export interface SlipVerificationResult {
  result: 'REJECTED' | 'MANUAL_REVIEW' | 'VERIFIED';
  message: string;
  checks: SlipCheck[];
  payment: PaymentDTO;
  receipt?: ReceiptDTO;
}
