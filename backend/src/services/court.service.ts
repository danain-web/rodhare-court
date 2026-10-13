import { withConnection, withTransaction } from '../config/db';
import { CourtRepository } from '../repositories/court.repository';
import { expireStaleHolds, insertAudit } from '../repositories/shared.repository';
import { CourtDTO, SportTypeDTO, CourtDetailDTO, AvailabilitySlot } from '../types/court';
import { AppError } from '../utils/appError';
import { combineDateTime, dayOfWeek, minutesToTime, parseLocalDate, toMinutes } from '../utils/datetime';

const MAX_IMAGE_LENGTH = 3_000_000; // ~2.2 MB หลัง base64

export class CourtService {
  private courtRepository = new CourtRepository();

  async getSports(): Promise<SportTypeDTO[]> {
    return withConnection((conn) => this.courtRepository.getSports(conn));
  }

  async getCourts(filter?: { sportTypeId?: number; search?: string; status?: string; minPrice?: number; maxPrice?: number }): Promise<CourtDTO[]> {
    return withConnection((conn) => this.courtRepository.getCourts(conn, filter));
  }

  async getCourtById(courtId: number): Promise<CourtDetailDTO> {
    const court = await withConnection((conn) => this.courtRepository.getCourtById(conn, courtId));
    if (!court) throw AppError.notFound(`ไม่พบสนามรหัส ${courtId}`);
    return court;
  }

  // UC-2: ตารางเวลาว่างรายชั่วโมงแบบ Real-Time
  async getCourtAvailability(courtId: number, dateStr: string): Promise<{ date: string; openTime: string; closeTime: string; slots: AvailabilitySlot[] }> {
    parseLocalDate(dateStr);
    const court = await this.getCourtById(courtId);

    // BR3: ปล่อยการจองที่ค้างชำระเกิน 15 นาที ให้ช่วงเวลากลับมาว่างก่อนแสดงผล
    await withTransaction((conn) => expireStaleHolds(conn, { courtId, bookingDate: dateStr }));
    const bookings = await withConnection((conn) => this.courtRepository.getBookingsOnDate(conn, courtId, dateStr));

    const opHour = court.operatingHours.find((h) => h.dayOfWeek === dayOfWeek(dateStr));
    const openTime = opHour?.openTime ?? '08:00';
    const closeTime = opHour?.closeTime ?? '22:00';
    const isOpenDay = opHour ? opHour.isOpen : true;

    const slots: AvailabilitySlot[] = [];
    const now = new Date();
    for (let m = toMinutes(openTime); m + 60 <= toMinutes(closeTime); m += 60) {
      const startStr = minutesToTime(m);
      const endStr = minutesToTime(m + 60);

      if (court.status === 'MAINTENANCE') {
        slots.push({ startTime: startStr, endTime: endStr, status: 'MAINTENANCE' });
        continue;
      }
      if (court.status === 'CLOSED' || !isOpenDay || combineDateTime(dateStr, startStr) <= now) {
        // ปิดทำการ หรือเป็นช่วงเวลาที่ผ่านไปแล้ว -> จองไม่ได้
        slots.push({ startTime: startStr, endTime: endStr, status: 'OUTSIDE_OPERATING_HOURS' });
        continue;
      }
      // ถูกจองแล้ว (ชำระแล้ว) มีลำดับเหนือกว่า รอชำระเงิน (ถือครองไว้ 15 นาทีตาม BR3)
      const inSlot = bookings.filter((b) => startStr < b.endTime && endStr > b.startTime);
      const overlapping = inSlot.find((b) => b.status !== 'PENDING_PAYMENT') ?? inSlot[0];
      slots.push(
        overlapping
          ? {
              startTime: startStr,
              endTime: endStr,
              status: overlapping.status === 'PENDING_PAYMENT' ? 'PENDING_PAYMENT' : 'OCCUPIED',
              bookingNumber: overlapping.bookingNumber,
            }
          : { startTime: startStr, endTime: endStr, status: 'AVAILABLE' }
      );
    }

    return { date: dateStr, openTime, closeTime, slots };
  }

  // ---------------- BR13: เฉพาะผู้ดูแลระบบเพิ่ม/แก้ไข/ลบข้อมูลสนาม ----------------
  async createCourt(adminUserId: number, data: any, ipAddress?: string): Promise<CourtDetailDTO> {
    if (data.imageUrl) this.validateImage(data.imageUrl);
    return withTransaction(async (conn) => {
      const courtId = await this.courtRepository.createCourt(conn, data);
      const court = (await this.courtRepository.getCourtById(conn, courtId))!;
      await insertAudit(conn, {
        userId: adminUserId,
        action: 'CREATE_COURT',
        entityName: 'COURTS',
        entityId: courtId,
        newValues: { name: court.name, code: court.code, hourlyRate: court.hourlyRate, status: court.status },
        ipAddress,
      });
      return court;
    }, adminUserId);
  }

  async updateCourt(adminUserId: number, courtId: number, data: any, ipAddress?: string): Promise<CourtDetailDTO> {
    return withTransaction(async (conn) => {
      const before = await this.courtRepository.getCourtById(conn, courtId);
      if (!before) throw AppError.notFound(`ไม่พบสนามรหัส ${courtId}`);
      const { imageUrl, ...fields } = data || {};
      await this.courtRepository.updateCourt(conn, courtId, fields);
      if (imageUrl !== undefined) {
        if (imageUrl) this.validateImage(imageUrl);
        await this.courtRepository.updateCourtImage(conn, courtId, imageUrl || null);
      }
      const after = (await this.courtRepository.getCourtById(conn, courtId))!;
      await insertAudit(conn, {
        userId: adminUserId,
        action: 'UPDATE_COURT',
        entityName: 'COURTS',
        entityId: courtId,
        oldValues: { name: before.name, code: before.code, hourlyRate: before.hourlyRate, status: before.status, location: before.locationDetails },
        newValues: { name: after.name, code: after.code, hourlyRate: after.hourlyRate, status: after.status, location: after.locationDetails },
        ipAddress,
      });
      return after;
    }, adminUserId);
  }

  private validateImage(imageUrl: string): void {
    const trimmed = imageUrl.trim();
    const isHttp = /^https?:\/\/.+/i.test(trimmed);
    const isBase64 = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(trimmed);
    const hasInvalidExt = /\.(pdf|exe|txt|doc|docx|zip|rar)$/i.test(trimmed);
    if ((!isHttp && !isBase64) || hasInvalidExt) {
      throw AppError.badRequest('รูปแบบรูปภาพไม่ถูกต้อง (รองรับ JPG, PNG, WEBP, GIF หรือ URL http/https)');
    }
    if (trimmed.length > MAX_IMAGE_LENGTH) {
      throw AppError.badRequest('ไฟล์รูปภาพใหญ่เกินไป (ไม่เกินประมาณ 2 MB)');
    }
  }

  async updateCourtImage(courtId: number, adminUserId: number, imageUrl?: string | null, ipAddress?: string): Promise<CourtDetailDTO> {
    if (imageUrl) this.validateImage(imageUrl);
    return withTransaction(async (conn) => {
      const existing = await this.courtRepository.getCourtById(conn, courtId);
      if (!existing) throw AppError.notFound(`ไม่พบสนามรหัส ${courtId}`);
      await this.courtRepository.updateCourtImage(conn, courtId, imageUrl ? imageUrl.trim() : null);
      const summarize = (v?: string | null) => (!v ? '' : v.startsWith('data:') ? `[base64 image ${v.length} chars]` : v);
      await insertAudit(conn, {
        userId: adminUserId,
        action: imageUrl ? 'UPDATE_COURT_IMAGE' : 'REMOVE_COURT_IMAGE',
        entityName: 'COURTS',
        entityId: courtId,
        oldValues: { imageUrl: summarize(existing.imageUrl) },
        newValues: { imageUrl: summarize(imageUrl) },
        ipAddress,
      });
      return (await this.courtRepository.getCourtById(conn, courtId))!;
    }, adminUserId);
  }

  async softDeleteCourt(adminUserId: number, courtId: number, ipAddress?: string): Promise<void> {
    await withTransaction(async (conn) => {
      const court = await this.courtRepository.getCourtById(conn, courtId);
      if (!court) throw AppError.notFound(`ไม่พบสนามรหัส ${courtId}`);
      const future = await this.courtRepository.countFutureActiveBookings(conn, courtId);
      if (future > 0) {
        throw AppError.conflict(`ไม่สามารถลบสนามได้ เนื่องจากยังมีการจองที่ยังไม่ถึงเวลาอีก ${future} รายการ (เปลี่ยนสถานะเป็น MAINTENANCE แทน)`);
      }
      await this.courtRepository.softDeleteCourt(conn, courtId);
      await insertAudit(conn, {
        userId: adminUserId,
        action: 'DELETE_COURT',
        entityName: 'COURTS',
        entityId: courtId,
        oldValues: { name: court.name, isActive: true },
        newValues: { isActive: false, status: 'CLOSED' },
        ipAddress,
      });
    }, adminUserId);
  }
}
