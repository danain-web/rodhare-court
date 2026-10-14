export interface SportTypeDTO {
  sportTypeId: number;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface CourtDTO {
  courtId: number;
  sportTypeId: number;
  sportName: string;
  name: string;
  code: string;
  locationDetails?: string;
  hourlyRate: number;
  imageUrl?: string;
  isActive: boolean;
  status: 'AVAILABLE' | 'MAINTENANCE' | 'CLOSED';
  createdAt: Date;
  updatedAt: Date;
}

export interface OperatingHourDTO {
  operatingHourId: number;
  courtId: number;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isOpen: boolean;
}

export interface PricingRateDTO {
  rateId: number;
  courtId?: number;
  sportTypeId?: number;
  memberTypeId?: number;      // NULL = ทุกประเภทสมาชิก
  memberTypeName?: string;
  dayType: string;
  startTime: string;
  endTime: string;
  hourlyRate: number;
}

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  status: 'AVAILABLE' | 'PENDING_PAYMENT' | 'OCCUPIED' | 'MAINTENANCE' | 'OUTSIDE_OPERATING_HOURS';
  bookingNumber?: string;
}

export interface CourtDetailDTO extends CourtDTO {
  operatingHours: OperatingHourDTO[];
  pricingRates: PricingRateDTO[];
}
