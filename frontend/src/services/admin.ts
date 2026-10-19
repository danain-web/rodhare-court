import api from './api';

export interface SportType {
  sportTypeId: number;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface EquipmentAdmin {
  equipmentId: number;
  sportTypeId: number;
  sportName?: string;
  name: string;
  totalQuantity: number;
  availableQuantity: number;
  rentalFee: number;
  depositFee: number;
  fineRatePerDay: number;
  replacementCost: number;
}

export interface PromotionAdmin {
  promotionId: number;
  code: string;
  title: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  minBookingHours: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface AuditLog {
  logId: number;
  userId?: number;
  userName?: string;
  action: string;
  entityName: string;
  entityId?: number;
  oldValues?: string;
  newValues?: string;
  ipAddress?: string;
  createdAt: string;
}

// Sports
export const getAdminSportsApi = async (): Promise<SportType[]> => {
  const response = await api.get('/admin/sports');
  return response.data.data;
};

export const createAdminSportApi = async (data: { name: string; description?: string }) => {
  const response = await api.post('/admin/sports', data);
  return response.data.data;
};

// Equipment
export const getAdminEquipmentApi = async (): Promise<EquipmentAdmin[]> => {
  const response = await api.get('/admin/equipment');
  return response.data.data;
};

export const createAdminEquipmentApi = async (data: {
  sportTypeId: number;
  name: string;
  totalQuantity: number;
  rentalFee: number;
  depositFee?: number;
  fineRatePerDay?: number;
  replacementCost: number;
}) => {
  const response = await api.post('/admin/equipment', data);
  return response.data.data;
};

// Promotions (BR13 & BR14)
export const getAdminPromotionsApi = async (): Promise<PromotionAdmin[]> => {
  const response = await api.get('/admin/promotions');
  return response.data.data;
};

export const createAdminPromotionApi = async (data: {
  code: string;
  title: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  minBookingHours: number;
  startDate: string;
  endDate: string;
  isActive?: boolean;
}) => {
  const response = await api.post('/admin/promotions', data);
  return response.data.data;
};

// Audit Logs (BR15)
export const getAdminAuditLogsApi = async (): Promise<AuditLog[]> => {
  const response = await api.get('/admin/audit-logs');
  return response.data.data;
};

// ---- เพิ่มใหม่: รายงานสรุป BR17 (ADMIN / EXECUTIVE) และอัตราค่าบริการ ----
export const getReportSummaryApi = async () => {
  const response = await api.get('/reports/summary');
  return response.data.data;
};

export const getAdminPricingRatesApi = async () => {
  const response = await api.get('/admin/pricing-rates');
  return response.data.data as any[];
};

// ---- ราคาตามประเภทสมาชิก (PRICING_RATES.member_type_id) ----
export interface MemberTypeItem {
  memberTypeId: number;
  typeName: string;
  displayName: string;
  discountPercent: number;
  maxAdvanceDays: number;
}

export const getMemberTypesApi = async (): Promise<MemberTypeItem[]> => {
  const response = await api.get('/admin/member-types');
  return response.data.data;
};

export const createPricingRateApi = async (data: {
  courtId?: number;
  sportTypeId?: number;
  memberTypeId?: number;
  dayType: 'WEEKDAY' | 'WEEKEND' | 'HOLIDAY';
  startTime: string;
  endTime: string;
  hourlyRate: number;
}) => {
  const response = await api.post('/admin/pricing-rates', data);
  return response.data.data;
};

// Roles & Permissions
export interface RoleWithPermissions {
  roleId: number;
  roleName: string;
  description?: string;
  permissions: string[];
}

export interface PermissionItem {
  permissionId: number;
  code: string;
  description: string;
}

export const getAdminRolesApi = async (): Promise<RoleWithPermissions[]> => {
  const response = await api.get('/admin/roles');
  return response.data.data;
};

export const getAdminPermissionsApi = async (): Promise<PermissionItem[]> => {
  const response = await api.get('/admin/permissions');
  return response.data.data;
};

export const updateRolePermissionsApi = async (roleId: number, permissions: string[]): Promise<RoleWithPermissions> => {
  const response = await api.put(`/admin/roles/${roleId}/permissions`, { permissions });
  return response.data.data;
};
// System settings
export interface AppSetting {
  key: string;
  value: number;
  description: string;
  min: number;
  max: number;
}

export const getAdminSettingsApi = async (): Promise<AppSetting[]> => {
  const response = await api.get('/admin/settings');
  return response.data.data;
};

export const updateAdminSettingApi = async (key: string, value: number): Promise<AppSetting> => {
  const response = await api.put(`/admin/settings/${key}`, { value });
  return response.data.data;
};