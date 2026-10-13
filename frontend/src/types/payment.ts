export interface Payment {
  paymentId: number;
  bookingId: number;
  bookingNumber?: string;
  userName?: string;
  paymentMethod: string;
  amount: number;
  slipUrl?: string;
  slipReference?: string;
  slipMimeType?: string;
  slipFileSize?: number;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  verificationMethod?: 'AUTO' | 'MANUAL';
  reviewReason?: string;
  verifiedBy?: number;
  verifiedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface Receipt {
  receiptId: number;
  receiptNumber: string;
  bookingId: number;
  bookingNumber?: string;
  paymentId: number;
  userName?: string;
  courtName?: string;
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  totalAmount: number;
  paymentMethod?: string;
  verificationMethod?: 'AUTO' | 'MANUAL';
  issuedByName?: string;
  issuedAt: string;
  pdfUrl?: string;
}

export interface NotificationItem {
  notificationId: number;
  userId: number;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT';
  isRead: boolean;
  createdAt: string;
}

// ผลการตรวจสลิปอัตโนมัติ (Auto-Slip Verification)
export interface SlipCheck {
  code: 'FILE' | 'DUPLICATE' | 'AMOUNT' | 'READABLE';
  label: string;
  passed: boolean;
  detail: string;
}

// ข้อมูลสำหรับโอนเงิน (ยอดจากฐานข้อมูล + บัญชีรับเงินจริงที่ตั้งไว้ฝั่ง backend)
export interface PaymentInstructions {
  bookingNumber: string;
  amount: number;
  configured: boolean;
  accountName?: string;
  promptPay?: { maskedId: string; payload: string };
  bank?: { bankName: string; accountNo: string };
}

// ไม่มีการอนุมัติอัตโนมัติ: REJECTED = ส่งใหม่ได้ · MANUAL_REVIEW = รอเจ้าหน้าที่ยืนยันยอดเงินเข้าบัญชี
export interface SlipVerification {
  result: 'REJECTED' | 'MANUAL_REVIEW';
  message: string;
  checks: SlipCheck[];
  receipt?: Receipt;
}

export type SubmitPaymentResult = Payment & { verification: SlipVerification };
