export interface SportTypeDTO {
  sportTypeId: number;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt?: Date;
}

export interface EquipmentAdminDTO {
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

export interface PromotionAdminDTO {
  promotionId: number;
  code: string;
  title: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  minBookingHours: number;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  isActive: boolean;
  createdAt?: Date;
}

export interface PricingRateDTO {
  rateId: number;
  courtId?: number;
  sportTypeId?: number;
  memberTypeId?: number;      // NULL = ทุกประเภทสมาชิก
  memberTypeName?: string;
  dayType: 'WEEKDAY' | 'WEEKEND' | 'HOLIDAY';
  startTime: string;
  endTime: string;
  hourlyRate: number;
  createdAt?: Date;
}

export interface AuditLogDTO {
  logId: number;
  userId?: number;
  userName?: string;
  action: string;
  entityName: string;
  entityId?: number;
  oldValues?: string;
  newValues?: string;
  ipAddress?: string;
  createdAt: Date;
}
