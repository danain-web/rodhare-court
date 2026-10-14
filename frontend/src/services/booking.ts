import api from './api';
import { Equipment, Promotion, PriceBreakdown, Booking } from '../types/booking';

export const getEquipmentApi = async (sportTypeId?: number): Promise<Equipment[]> => {
  const url = sportTypeId ? `/equipment?sportTypeId=${sportTypeId}` : '/equipment';
  const response = await api.get(url);
  return response.data.data;
};

export const validatePromotionApi = async (code: string): Promise<Promotion> => {
  const response = await api.get(`/promotions/validate?code=${encodeURIComponent(code)}`);
  return response.data.data;
};

export const calculatePriceApi = async (data: {
  courtId: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  equipmentItems?: { equipmentId: number; quantity: number }[];
  promotionCode?: string;
}, signal?: AbortSignal): Promise<PriceBreakdown> => {
  // signal: ยกเลิกคำขอเก่าเมื่อผู้ใช้เปลี่ยนวัน/เวลา/อุปกรณ์ก่อนผลกลับมา
  const response = await api.post('/bookings/calculate-price', data, { signal });
  return response.data.data;
};

export const createBookingApi = async (data: {
  courtId: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  equipmentItems?: { equipmentId: number; quantity: number }[];
  promotionCode?: string;
}): Promise<Booking> => {
  const response = await api.post('/bookings', data);
  return response.data.data;
};

export const getMyBookingsApi = async (): Promise<Booking[]> => {
  const response = await api.get('/bookings/my');
  return response.data.data;
};

export const getBookingByIdApi = async (bookingId: number): Promise<Booking> => {
  const response = await api.get(`/bookings/${bookingId}`);
  return response.data.data;
};

export const cancelBookingApi = async (bookingId: number): Promise<void> => {
  await api.post(`/bookings/${bookingId}/cancel`);
};

// ---- เพิ่มใหม่: เชื่อม endpoint ที่หลังบ้านมีอยู่แล้ว (UCS-5 เช็คอิน / ค้นหาการจอง / ประวัติชำระเงิน) ----
export const checkInBookingApi = async (bookingId: number): Promise<Booking> => {
  const response = await api.post(`/bookings/${bookingId}/check-in`);
  return response.data.data;
};

export const staffCheckInApi = async (bookingNumber: string): Promise<Booking> => {
  const response = await api.post('/staff/check-in', { bookingNumber });
  return response.data.data;
};

export const lookupBookingByNumberApi = async (bookingNumber: string): Promise<Booking> => {
  const response = await api.get(`/staff/bookings/lookup?bookingNumber=${encodeURIComponent(bookingNumber)}`);
  return response.data.data;
};

export const getBookingPaymentsApi = async (bookingId: number) => {
  const response = await api.get(`/bookings/${bookingId}/payments`);
  return response.data.data as any[];
};
