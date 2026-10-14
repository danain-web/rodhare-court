import { DbConnection, firstInsertId } from '../config/db';
import { CourtDTO, SportTypeDTO, CourtDetailDTO, OperatingHourDTO, PricingRateDTO } from '../types/court';
import { ACTIVE_STATUS_SQL } from './shared.repository';

export interface BookingOverlapItem {
  bookingId: number;
  bookingNumber: string;
  courtId: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
}

const COURT_COLUMNS = `
  c.court_id, c.sport_type_id, s.name AS sport_name, c.name, c.code, c.location_details, c.hourly_rate,
  c.image_url, c.is_active, c.status, c.created_at, c.updated_at`;

const mapCourt = (row: any): CourtDTO => ({
  courtId:         row.court_id,
  sportTypeId:     row.sport_type_id,
  sportName:       row.sport_name,
  name:            row.name,
  code:            row.code,
  locationDetails: row.location_details ?? undefined,
  hourlyRate:      parseFloat(row.hourly_rate),
  imageUrl:        row.image_url ?? undefined,
  isActive:        row.is_active === true || row.is_active === 1,
  status:          row.status,
  createdAt:       row.created_at,
  updatedAt:       row.updated_at,
});

export class CourtRepository {
  async getSports(conn: DbConnection): Promise<SportTypeDTO[]> {
    const result = await conn.query(
      `SELECT sport_type_id, name, description, is_active FROM sport_types WHERE is_active = TRUE ORDER BY sport_type_id`
    );
    return result.rows.map((row: any) => ({
      sportTypeId: row.sport_type_id,
      name:        row.name,
      description: row.description ?? undefined,
      isActive:    row.is_active,
    }));
  }

  async getCourts(
    conn: DbConnection,
    filter?: { sportTypeId?: number; search?: string; status?: string; minPrice?: number; maxPrice?: number }
  ): Promise<CourtDTO[]> {
    const params: any[] = [];
    let sql = `SELECT ${COURT_COLUMNS} FROM courts c JOIN sport_types s ON c.sport_type_id = s.sport_type_id WHERE c.is_active = TRUE`;

    if (filter?.sportTypeId) {
      params.push(filter.sportTypeId);
      sql += ` AND c.sport_type_id = $${params.length}`;
    }
    if (filter?.status) {
      params.push(filter.status);
      sql += ` AND c.status = $${params.length}`;
    }
    if (filter?.minPrice !== undefined) {
      params.push(filter.minPrice);
      sql += ` AND c.hourly_rate >= $${params.length}`;
    }
    if (filter?.maxPrice !== undefined) {
      params.push(filter.maxPrice);
      sql += ` AND c.hourly_rate <= $${params.length}`;
    }
    if (filter?.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      sql += ` AND (LOWER(c.name) LIKE $${params.length} OR LOWER(c.code) LIKE $${params.length} OR LOWER(c.location_details) LIKE $${params.length})`;
    }
    sql += ` ORDER BY c.court_id ASC`;

    const result = await conn.query(sql, params);
    return result.rows.map(mapCourt);
  }

  async getCourtById(conn: DbConnection, courtId: number, includeInactive = false): Promise<CourtDetailDTO | null> {
    const resCourt = await conn.query(
      `SELECT ${COURT_COLUMNS} FROM courts c JOIN sport_types s ON c.sport_type_id = s.sport_type_id
        WHERE c.court_id = $1 ${includeInactive ? '' : 'AND c.is_active = TRUE'}`,
      [courtId]
    );
    const row = resCourt.rows[0];
    if (!row) return null;

    const resHours = await conn.query(
      `SELECT operating_hour_id, day_of_week, open_time, close_time, is_open
         FROM court_operating_hours WHERE court_id = $1 ORDER BY day_of_week`,
      [courtId]
    );
    const operatingHours: OperatingHourDTO[] = resHours.rows.map((h: any) => ({
      operatingHourId: h.operating_hour_id,
      courtId,
      dayOfWeek: h.day_of_week,
      openTime:  h.open_time,
      closeTime: h.close_time,
      isOpen:    h.is_open,
    }));

    const pricingRates = await this.getPricingRatesForCourt(conn, courtId, row.sport_type_id);
    return { ...mapCourt(row), operatingHours, pricingRates };
  }

  async getPricingRatesForCourt(conn: DbConnection, courtId: number, sportTypeId: number, memberTypeId?: number): Promise<PricingRateDTO[]> {
    const params: any[] = [courtId, sportTypeId];
    let memberClause = '';
    if (memberTypeId !== undefined) {
      params.push(memberTypeId);
      memberClause = `AND (pr.member_type_id IS NULL OR pr.member_type_id = $${params.length})`;
    }
    const resRates = await conn.query(
      `SELECT pr.rate_id, pr.court_id, pr.sport_type_id, pr.member_type_id, m.type_name AS member_type_name,
              pr.day_type, pr.start_time, pr.end_time, pr.hourly_rate
         FROM pricing_rates pr
         LEFT JOIN member_types m ON m.member_type_id = pr.member_type_id
        WHERE (pr.court_id = $1 OR (pr.court_id IS NULL AND pr.sport_type_id = $2))
          ${memberClause}
        ORDER BY CASE WHEN pr.court_id IS NOT NULL THEN 0 ELSE 1 END, pr.start_time`,
      params
    );
    return resRates.rows.map((r: any) => ({
      rateId:         r.rate_id,
      courtId:        r.court_id ?? undefined,
      sportTypeId:    r.sport_type_id ?? undefined,
      memberTypeId:   r.member_type_id ?? undefined,
      memberTypeName: r.member_type_name ?? undefined,
      dayType:        r.day_type,
      startTime:      r.start_time,
      endTime:        r.end_time,
      hourlyRate:     parseFloat(r.hourly_rate),
    }));
  }

  async getOperatingHour(conn: DbConnection, courtId: number, dow: number): Promise<OperatingHourDTO | null> {
    const res = await conn.query(
      `SELECT operating_hour_id, day_of_week, open_time, close_time, is_open
         FROM court_operating_hours WHERE court_id = $1 AND day_of_week = $2`,
      [courtId, dow]
    );
    const h = res.rows[0];
    if (!h) return null;
    return { operatingHourId: h.operating_hour_id, courtId, dayOfWeek: h.day_of_week, openTime: h.open_time, closeTime: h.close_time, isOpen: h.is_open };
  }

  // ช่วงเวลาที่ถูกถือครองของสนามในวันนั้น (แทน Oracle view v_court_occupancy)
  async getBookingsOnDate(conn: DbConnection, courtId: number, dateStr: string): Promise<BookingOverlapItem[]> {
    const result = await conn.query(
      `SELECT b.booking_id, b.booking_number, b.court_id,
              TO_CHAR(b.booking_date, 'YYYY-MM-DD') AS booking_date,
              b.start_time, b.end_time, b.status
         FROM bookings b
        WHERE b.court_id = $1
          AND b.booking_date = $2::DATE
          AND b.status IN ${ACTIVE_STATUS_SQL}
        ORDER BY b.start_time`,
      [courtId, dateStr]
    );
    return result.rows.map((row: any) => ({
      bookingId:     row.booking_id,
      bookingNumber: row.booking_number,
      courtId:       row.court_id,
      bookingDate:   row.booking_date,
      startTime:     row.start_time,
      endTime:       row.end_time,
      status:        row.status,
    }));
  }

  async createCourt(
    conn: DbConnection,
    data: { sportTypeId: number; name: string; code: string; locationDetails?: string; hourlyRate: number; imageUrl?: string; status?: string }
  ): Promise<number> {
    const result = await conn.query(
      `INSERT INTO courts (sport_type_id, name, code, location_details, hourly_rate, image_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING court_id`,
      [data.sportTypeId, data.name, data.code.toUpperCase(), data.locationDetails || null, data.hourlyRate, data.imageUrl || null, data.status || 'AVAILABLE']
    );
    const courtId = firstInsertId(result.rows, 'court_id');

    // สนามใหม่ได้เวลาเปิด-ปิดมาตรฐาน 08:00-22:00 ทุกวัน
    // PostgreSQL: generate_series(0,6) แทน Oracle CONNECT BY LEVEL <= 7
    await conn.query(
      `INSERT INTO court_operating_hours (court_id, day_of_week, open_time, close_time)
       SELECT $1, g, '08:00', '22:00' FROM generate_series(0, 6) AS g`,
      [courtId]
    );
    return courtId;
  }

  async updateCourt(
    conn: DbConnection,
    courtId: number,
    data: Partial<{ sportTypeId: number; name: string; code: string; locationDetails: string; hourlyRate: number; status: string }>
  ): Promise<boolean> {
    const result = await conn.query(
      `UPDATE courts
          SET sport_type_id      = COALESCE($1, sport_type_id),
              name               = COALESCE($2, name),
              code               = COALESCE($3, code),
              location_details   = COALESCE($4, location_details),
              hourly_rate        = COALESCE($5, hourly_rate),
              status             = COALESCE($6, status),
              updated_at         = NOW()
        WHERE court_id = $7 AND is_active = TRUE`,
      [data.sportTypeId ?? null, data.name || null, data.code ? data.code.toUpperCase() : null,
       data.locationDetails ?? null, data.hourlyRate ?? null, data.status || null, courtId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async updateCourtImage(conn: DbConnection, courtId: number, imageUrl: string | null): Promise<boolean> {
    const result = await conn.query(
      `UPDATE courts SET image_url = $1, updated_at = NOW() WHERE court_id = $2 AND is_active = TRUE`,
      [imageUrl, courtId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async countFutureActiveBookings(conn: DbConnection, courtId: number): Promise<number> {
    const res = await conn.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM bookings
        WHERE court_id = $1 AND status IN ${ACTIVE_STATUS_SQL} AND booking_date >= CURRENT_DATE`,
      [courtId]
    );
    return parseInt(res.rows[0]?.cnt || '0');
  }

  async softDeleteCourt(conn: DbConnection, courtId: number): Promise<boolean> {
    const result = await conn.query(
      `UPDATE courts SET is_active = FALSE, status = 'CLOSED', updated_at = NOW() WHERE court_id = $1 AND is_active = TRUE`,
      [courtId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
