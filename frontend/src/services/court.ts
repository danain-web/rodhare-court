import api from './api';
import { Court, CourtDetail, SportType, AvailabilitySlot } from '../types/court';

export const getSportsApi = async (): Promise<SportType[]> => {
  const response = await api.get('/sports');
  return response.data.data;
};

export const getCourtsApi = async (filter?: {
  sportTypeId?: number;
  search?: string;
  status?: string;
  minPrice?: number;
  maxPrice?: number;
}): Promise<Court[]> => {
  const params = new URLSearchParams();
  if (filter?.sportTypeId) params.append('sportTypeId', filter.sportTypeId.toString());
  if (filter?.search) params.append('search', filter.search);
  if (filter?.status) params.append('status', filter.status);
  if (filter?.minPrice) params.append('minPrice', filter.minPrice.toString());
  if (filter?.maxPrice) params.append('maxPrice', filter.maxPrice.toString());

  const response = await api.get(`/courts?${params.toString()}`);
  return response.data.data;
};

export const getCourtByIdApi = async (courtId: number): Promise<CourtDetail> => {
  const response = await api.get(`/courts/${courtId}`);
  return response.data.data;
};

export const getCourtAvailabilityApi = async (
  courtId: number,
  dateStr: string
): Promise<{ date: string; slots: AvailabilitySlot[] }> => {
  const response = await api.get(`/courts/${courtId}/availability?date=${dateStr}`);
  return response.data.data;
};

export const createCourtApi = async (data: any): Promise<Court> => {
  const response = await api.post('/admin/courts', data);
  return response.data.data;
};

export const updateCourtApi = async (courtId: number, data: any): Promise<Court> => {
  const response = await api.put(`/admin/courts/${courtId}`, data);
  return response.data.data;
};

export const updateCourtImageApi = async (courtId: number, imageUrl?: string | null): Promise<Court> => {
  const response = await api.put(`/admin/courts/${courtId}/image`, { imageUrl });
  return response.data.data;
};

export const deleteCourtApi = async (courtId: number): Promise<void> => {
  await api.delete(`/admin/courts/${courtId}`);
};
