import axios from 'axios';
import { HealthStatus } from '../types';

// =====================================================================
// Axios instance หลักของระบบ
// withCredentials: true → ส่ง httpOnly Cookie ไปกับทุก request อัตโนมัติ
//   ทั้ง auth_token cookie (JWT) จะถูกส่งโดย Browser เอง
//   ไม่ต้องจัดการ token ใน JavaScript/localStorage เลย
// baseURL: '/api' → Vite proxy จะ forward ไปหา backend localhost:5000
// =====================================================================
const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // 🔑 สำคัญ: ส่ง httpOnly Cookie ทุก request
  headers: {
    'Content-Type': 'application/json',
  },
});

// =====================================================================
// Response interceptor: ถ้าได้ 401 (Cookie หมดอายุ / ถูก revoke)
// → ล้าง state แล้ว redirect ไปหน้า login
// หมายเหตุ: ไม่ต้องทำ Request interceptor แนบ token อีกต่อไป
//           Browser จัดการ Cookie ให้เองอัตโนมัติ
// =====================================================================
// ไม่ redirect เมื่อ 401 มาจาก:
//   /auth/me    → AuthContext ใช้เช็กว่า login อยู่ไหม (ผู้ใช้ที่ยังไม่ login เปิดหน้า /courts, /register ได้)
//   /auth/login → ให้หน้า Login แสดงข้อความ "รหัสผ่านไม่ถูกต้อง" เอง
// หน้าที่ต้อง login มี ProtectedRoute คอยพาไป /login อยู่แล้ว
const NO_REDIRECT_URLS = ['/auth/me', '/auth/login'];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error.config?.url || '';
    if (error.response?.status === 401 && !NO_REDIRECT_URLS.includes(url)) {
      // Cookie หมดอายุหรือถูก revoke → redirect ไปหน้า login
      // ไม่ใช้ window.location เพื่อหลีกเลี่ยง full reload ถ้า path เดิมอยู่แล้ว
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const getHealthStatus = async (): Promise<HealthStatus> => {
  try {
    const response = await api.get<HealthStatus>('/health');
    return response.data;
  } catch (error: any) {
    if (error.response?.data) return error.response.data;
    return { status: 'error', database: 'disconnected' };
  }
};

export const testErrorEndpoint = async (type: string) => {
  const response = await api.get(`/health/test-error?type=${type}`);
  return response.data;
};

export default api;
