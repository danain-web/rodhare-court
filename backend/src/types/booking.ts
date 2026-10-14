export interface EquipmentDTO {
  equipmentId: number;
  sportTypeId: number;
  name: string;
  totalQuantity: number;
  availableQuantity: number;
  rentalFee: number;
  depositFee: number;
  fineRatePerDay: number;
  replacementCost: number;
}

export interface PromotionDTO {
  promotionId: number;
  code: string;
  title: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  minBookingHours: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startTime?: string;
  endTime?: string;
  isActive: boolean;
}

export interface BookingEquipmentInput {
  equipmentId: number;
  quantity: number;
}

export interface CreateBookingInput {
  courtId: number;
  bookingDate: string; // YYYY-MM-DD
  startTime: string;   // HH:MI
  endTime: string;     // HH:MI
  equipmentItems?: BookingEquipmentInput[];
  promotionCode?: string;
}

export interface EquipmentLine {
  equipmentId: number;
  equipmentName: string;
  quantity: number;
  unitRentalFee: number;
  subtotal: number;
}

export interface PriceBreakdown {
  courtFee: number;
  durationHours: number;
  equipmentFee: number;
  memberDiscount: number;
  promotionDiscount: number;
  discountAmount: number;
  finalAmount: number;
  equipmentDetails: EquipmentLine[];
  promotionDetails?: PromotionDTO;
}

export interface BookingEquipmentDTO {
  bookingEquipmentId: number;
  bookingId: number;
  equipmentId: number;
  equipmentName: string;
  quantity: number;
  unitRentalFee: number;
  subtotal: number;
}

export interface BookingStatusHistoryDTO {
  historyId: number;
  bookingId: number;
  status: string;
  notes?: string;
  changedBy?: number;
  changedByName?: string;
  createdAt: Date;
}

export type BookingStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_VERIFIED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'EXPIRED';

export interface BookingDTO {
  bookingId: number;
  bookingNumber: string;
  userId: number;
  userName?: string;
  courtId: number;
  courtName?: string;
  sportName?: string;
  sportTypeId?: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  totalCourtFee: number;
  totalEquipmentFee: number;
  discountAmount: number;
  finalAmount: number;
  status: BookingStatus;
  promotionCode?: string;
  holdExpiresAt?: Date;
  checkedInAt?: Date;
  cancelledAt?: Date;
  cancelReason?: string;
  latestPaymentStatus?: string;
  latestPaymentRejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
  equipment?: BookingEquipmentDTO[];
  statusHistory?: BookingStatusHistoryDTO[];
}
