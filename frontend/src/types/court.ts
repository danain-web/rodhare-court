export interface SportType {
  sportTypeId: number;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface Court {
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
  createdAt: string;
  updatedAt: string;
}

export interface OperatingHour {
  operatingHourId: number;
  courtId: number;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isOpen: boolean;
}

export interface PricingRate {
  rateId: number;
  courtId?: number;
  sportTypeId?: number;
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

export interface CourtDetail extends Court {
  operatingHours: OperatingHour[];
  pricingRates: PricingRate[];
}
