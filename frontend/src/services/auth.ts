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
}) => {
  const response = await api.post('/auth/register', data);
  return response.data.data;
};

// เข้าสู่ระบบ/สมัครด้วย Google — credential คือ ID token จาก Google Identity Services
export const googleLoginApi = async (credential: string) => {
  const response = await api.post('/auth/google', { credential });
  return response.data.data as { user: UserDTO; isNewAccount: boolean };
};

// เชื่อมบัญชี Google เข้ากับบัญชีที่ล็อกอินอยู่ (หน้าโปรไฟล์)
export const linkGoogleApi = async (credential: string): Promise<UserDTO> => {
  const response = await api.post('/auth/google/link', { credential });
  return response.data.data;
};

// ลืมรหัสผ่าน: ขอลิงก์รีเซ็ตทางอีเมล (ตอบสำเร็จเสมอ ไม่บอกว่าอีเมลนี้มีบัญชีหรือไม่)
export const forgotPasswordApi = async (email: string): Promise<string> => {
  const response = await api.post('/auth/forgot-password', { email });
  return response.data.message;
};

export const resetPasswordApi = async (token: string, password: string): Promise<string> => {
  const response = await api.post('/auth/reset-password', { token, password });
  return response.data.message;
};

export const changePasswordApi = async (currentPassword: string, newPassword: string): Promise<string> => {
  const response = await api.post('/auth/change-password', { currentPassword, newPassword });
  return response.data.message;
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
