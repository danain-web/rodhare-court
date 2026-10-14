import api from './api';
import { UserDTO, DashboardData } from '../types';

export const loginApi = async (identifier: string, password: string) => {
  const response = await api.post('/auth/login', { identifier, password });
  return response.data.data;
};

export const registerApi = async (data: {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  memberTypeId?: number;
}) => {
  const response = await api.post('/auth/register', data);
  return response.data.data;
};

// ตรวจชื่อผู้ใช้/อีเมลซ้ำ (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
export const checkAvailabilityApi = async (params: {
  username?: string;
  email?: string;
}): Promise<{ usernameAvailable?: boolean; emailAvailable?: boolean }> => {
  const response = await api.get('/auth/check-availability', { params });
  return response.data.data;
};

export const getMemberTypesPublicApi = async (): Promise<
  { memberTypeId: number; typeName: string; displayName: string; discountPercent: number }[]
> => {
  const response = await api.get('/auth/member-types');
  return response.data.data;
};

export const logoutApi = async () => {
  const response = await api.post('/auth/logout');
  return response.data;
};

export const getMeApi = async (): Promise<UserDTO> => {
  const response = await api.get('/auth/me');
  return response.data.data;
};

export const getDashboardByRole = async (role: string): Promise<DashboardData> => {
  const endpoint = `/${role.toLowerCase()}/dashboard`;
  const response = await api.get(endpoint);
  return response.data.data;
};
