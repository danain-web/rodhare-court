export interface Equipment {
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

export interface Promotion {
  promotionId: number;
  code: string;
  title: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  minBookingHours: number;
}

export interface BookingEquipmentItem {
  equipmentId: number;
  quantity: number;
}

export interface PriceBreakdown {
  courtFee: number;
  durationHours: number;
  equipmentFee: number;
  discountAmount: number;
  finalAmount: number;
  equipmentDetails: {
    equipmentId: number;
    equipmentName: string;
    quantity: number;
    unitRentalFee: number;
    subtotal: number;
  }[];
  promotionDetails?: Promotion;
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
  createdAt: string;
}

export interface Booking {
  bookingId: number;
  bookingNumber: string;
  userId: number;
  userName?: string;
  courtId: number;
  courtName?: string;
  sportName?: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  totalCourtFee: number;
  totalEquipmentFee: number;
  discountAmount: number;
  finalAmount: number;
  status: 'PENDING_PAYMENT' | 'PAYMENT_VERIFIED' | 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
  createdAt: string;
  updatedAt: string;
  equipment?: BookingEquipmentDTO[];
  statusHistory?: BookingStatusHistoryDTO[];
}
