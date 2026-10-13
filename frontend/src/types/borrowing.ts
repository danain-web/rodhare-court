export interface Borrowing {
  borrowingId: number;
  bookingId: number;
  bookingNumber: string;
  equipmentId: number;
  equipmentName: string;
  quantity: number;
  borrowedAt: string;
  expectedReturnAt: string;
  actualReturnAt?: string;
  status: 'BORROWED' | 'RETURNED' | 'DAMAGED' | 'LOST' | 'OVERDUE';
  conditionNotes?: string;
}

export interface Fine {
  fineId: number;
  borrowingId?: number;
  bookingId: number;
  bookingNumber?: string;
  fineType: 'LATE_RETURN' | 'DAMAGE' | 'LOSS';
  amount: number;
  reason: string;
  status: 'UNPAID' | 'PAID' | 'WAIVED';
  paidAt?: string;
  createdAt: string;
}
