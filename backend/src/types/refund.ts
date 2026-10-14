export interface RefundRequestDTO {
  refundId: number;
  id?: number;              // alias ที่หน้า Staff Refunds ใช้
  bookingId: number;
  bookingNumber?: string;
  bookingStatus?: string;
  userId: number;
  userName?: string;
  requestedAmount: number;
  amount?: number;          // alias ที่หน้า Staff Refunds ใช้
  paidAmount?: number;
  refundPercentage: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSED';
  reason?: string;
  reviewNote?: string;
  approvedBy?: number;
  processedAt?: Date;
  createdAt: Date;
}

export interface UpdateBookingInput {
  bookingDate: string; // YYYY-MM-DD
  startTime: string;   // HH:MI
  endTime: string;     // HH:MI
  equipmentItems?: { equipmentId: number; quantity: number }[];
}

export interface CancelRefundPreview {
  bookingId: number;
  bookingNumber: string;
  courtName?: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
  isPaid: boolean;
  originalAmount: number;
  totalPrice: number;       // alias ที่หน้า Booking Detail ใช้
  paidAmount: number;
  hoursUntilStart: number;
  refundPercentage: number;
  refundAmount: number;
  eligibleForRefund: boolean;
  reason: string;
  message: string;          // alias ที่หน้า Booking Detail ใช้
}
