export interface BorrowingDTO {
  borrowingId: number;
  bookingId: number;
  bookingNumber: string;
  equipmentId: number;
  equipmentName: string;
  quantity: number;
  borrowedAt: Date;
  expectedReturnAt: Date;
  actualReturnAt?: Date;
  status: 'BORROWED' | 'RETURNED' | 'DAMAGED' | 'LOST' | 'OVERDUE';
  conditionNotes?: string;
  staffUserId?: number;
}

export interface FineDTO {
  fineId: number;
  borrowingId?: number;
  bookingId: number;
  bookingNumber?: string;
  equipmentName?: string;
  fineType: 'LATE_RETURN' | 'DAMAGE' | 'LOSS';
  amount: number;
  reason: string;
  status: 'UNPAID' | 'PAID' | 'WAIVED';
  paidAt?: Date;
  createdAt: Date;
}

export interface BorrowInput {
  bookingNumber: string;
  equipmentId: number;
  quantity: number;
}

export interface ReturnInput {
  borrowingId: number;
  condition: 'NORMAL' | 'DAMAGED' | 'LOST';
  notes?: string;
}
