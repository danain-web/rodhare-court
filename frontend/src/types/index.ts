export interface HealthStatus {
  status: 'ok' | 'error';
  database: 'connected' | 'disconnected';
  timestamp?: string;
}

export interface UserDTO {
  userId: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  memberTypeId: number;
  roles: string[];
  permissions?: string[];
  googleLinked?: boolean;
  isActive: boolean;
  createdAt: string;
}

// token ไม่อยู่ใน body แล้ว — Backend ตั้งเป็น httpOnly Cookie แทน
export interface LoginResponse {
  user: UserDTO;
}

export interface DashboardData {
  role: string;
  user: {
    userId: number;
    username: string;
    roles: string[];
  };
  capabilities: string[];
  [key: string]: any;
}
