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
  amount: number;
  paymentMethod: 'PROMPTPAY' | 'BANK_TRANSFER' | 'SLIP_TRANSFER' | 'CASH';
  // Multer Memory Storage buffer (multipart/form-data upload)
  slipBuffer?: Buffer;
  slipMimeType?: string;
  slipUrl?: string;       // Fallback: ถ้าไม่ได้แนบไฟล์ ให้ส่ง URL รูปแทนได้
  slipReference?: string;
}

// ผลการตรวจสลิปอัตโนมัติ (Auto-Slip Verification)
export interface SlipCheck {
  code: 'FILE' | 'DUPLICATE' | 'AMOUNT' | 'READABLE';
  label: string;
  passed: boolean;
  detail: string;
}

export interface SlipVerificationResult {
  result: 'VERIFIED' | 'REJECTED' | 'MANUAL_REVIEW';
  message: string;
  checks: SlipCheck[];
  payment: PaymentDTO;
  receipt?: ReceiptDTO;
}
