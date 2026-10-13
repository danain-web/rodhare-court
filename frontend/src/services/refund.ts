import api from './api';

export interface CancelRefundPreview {
  bookingId: number;
  courtName: string;
  bookingDate: string;
  startTime: string;
  totalPrice: number;
  eligibleForRefund: boolean;
  refundPercentage: number;
  refundAmount: number;
  hoursUntilStart: number;
  message: string;
}

export interface RefundRequest {
  refundId: number;
  id?: number;
  bookingId: number;
  userId: number;
  requestedAmount: number;
  amount?: number;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy?: number;
  processedAt?: string;
  createdAt: string;
}

export interface UpdateBookingInput {
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  equipmentItems?: { equipmentId: number; quantity: number }[];
}

export const updateBookingApi = async (bookingId: number, data: UpdateBookingInput) => {
  const response = await api.put(`/bookings/${bookingId}`, data);
  return response.data.data;
};

export const getCancelRefundPreviewApi = async (bookingId: number): Promise<CancelRefundPreview> => {
  const response = await api.get(`/bookings/${bookingId}/cancel-preview`);
  return response.data.data;
};

export const executeCancelRefundApi = async (bookingId: number, reason?: string) => {
  const response = await api.post(`/bookings/${bookingId}/cancel-refund`, { reason });
  return response.data.data;
};

export const getMyRefundsApi = async (): Promise<RefundRequest[]> => {
  const response = await api.get('/refunds/my');
  return response.data.data;
};

export const getPendingRefundsApi = async (): Promise<RefundRequest[]> => {
  const response = await api.get('/staff/refunds/pending');
  return response.data.data;
};

export const approveRefundApi = async (refundId: number) => {
  const response = await api.post(`/staff/refunds/${refundId}/approve`);
  return response.data.data;
};

// ---- เพิ่มใหม่: ปฏิเสธคำขอคืนเงิน (UCS-6.4) ----
export const rejectRefundApi = async (refundId: number, note: string) => {
  const response = await api.post(`/staff/refunds/${refundId}/reject`, { note });
  return response.data.data;
};
