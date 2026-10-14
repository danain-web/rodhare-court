import api from './api';
import { Borrowing, Fine } from '../types/borrowing';

export const borrowEquipmentApi = async (data: {
  bookingNumber: string;
  equipmentId: number;
  quantity: number;
}): Promise<Borrowing> => {
  const response = await api.post('/staff/equipment/borrow', data);
  return response.data.data;
};

export const returnEquipmentApi = async (data: {
  borrowingId: number;
  condition: 'NORMAL' | 'DAMAGED' | 'LOST';
  notes?: string;
}): Promise<{ borrowing: Borrowing; generatedFines: Fine[] }> => {
  const response = await api.post('/staff/equipment/return', data);
  return response.data.data;
};

export const getBorrowingsByBookingApi = async (bookingId: number): Promise<Borrowing[]> => {
  const response = await api.get(`/staff/equipment/borrowings?bookingId=${bookingId}`);
  return response.data.data;
};

export const getMyFinesApi = async (): Promise<Fine[]> => {
  const response = await api.get('/fines/my');
  return response.data.data;
};

export const payFineApi = async (fineId: number): Promise<void> => {
  await api.post(`/fines/${fineId}/pay`);
};
