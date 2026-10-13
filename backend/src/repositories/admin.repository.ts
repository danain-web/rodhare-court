import { DbConnection, firstInsertId } from '../config/db';
import { SportTypeDTO, EquipmentAdminDTO, PromotionAdminDTO, PricingRateDTO, AuditLogDTO } from '../types/admin';
import { PROMOTION_COLUMNS, mapPromotion } from './equipment.repository';

export class AdminRepository {
  // =====================================================================
  // BR16: Audit log
  // =====================================================================
  async getAuditLogs(conn: DbConnection, limit = 300): Promise<AuditLogDTO[]> {
    const res = await conn.query(
      `SELECT a.log_id, a.user_id, u.username, a.action, a.entity_name, a.entity_id,
              a.old_values, a.new_values, a.ip_address, a.created_at
         FROM audit_logs a
         LEFT JOIN users u ON a.user_id = u.user_id
        ORDER BY a.log_id DESC
        LIMIT $1`,
      [limit]
    );
    return res.rows.map((r: any) => ({
      logId:      r.log_id,
      userId:     r.user_id ?? undefined,
      userName:   r.username || (r.user_id ? `User #${r.user_id}` : 'SYSTEM'),
      action:     r.action,
      entityName: r.entity_name,
      entityId:   r.entity_id ?? undefined,
      oldValues:  r.old_values ?? undefined,
      newValues:  r.new_values ?? undefined,
      ipAddress:  r.ip_address ?? undefined,
      createdAt:  r.created_at,
    }));
  }

  // =====================================================================
  // Member types
  // =====================================================================
  async getMemberTypes(conn: DbConnection): Promise<{ memberTypeId: number; typeName: string; displayName: string; discountPercent: number; maxAdvanceDays: number }[]> {
    const res = await conn.query(
      `SELECT member_type_id, type_name, COALESCE(display_name, type_name) AS display_name, discount_percent, max_advance_days
         FROM member_types ORDER BY member_type_id`
    );
    return res.rows.map((r: any) => ({
      memberTypeId:   r.member_type_id,
      typeName:       r.type_name,
      displayName:    r.display_name,
      discountPercent: parseFloat(r.discount_percent),
      maxAdvanceDays: r.max_advance_days,
    }));
  }

  // =====================================================================
  // Sports
  // =====================================================================
  async getSports(conn: DbConnection): Promise<SportTypeDTO[]> {
    const res = await conn.query(
      `SELECT sport_type_id, name, description, is_active, created_at FROM sport_types ORDER BY sport_type_id ASC`
    );
    return res.rows.map((r: any) => ({
      sportTypeId: r.sport_type_id,
      name:        r.name,
      description: r.description ?? undefined,
      isActive:    r.is_active === true || r.is_active === 1,
      createdAt:   r.created_at,
    }));
  }

  async createSport(conn: DbConnection, name: string, description?: string, isActive = true): Promise<number> {
    const res = await conn.query(
      `INSERT INTO sport_types (name, description, is_active) VALUES ($1, $2, $3)
       RETURNING sport_type_id`,
      [name.trim().toUpperCase(), description || null, isActive]
    );
    return firstInsertId(res.rows, 'sport_type_id');
  }

  // =====================================================================
  // Equipment
  // =====================================================================
  async getEquipmentAdmin(conn: DbConnection): Promise<EquipmentAdminDTO[]> {
    const res = await conn.query(
      `SELECT e.equipment_id, e.sport_type_id, s.name AS sport_name, e.name, e.total_quantity, e.available_quantity,
              e.rental_fee, e.deposit_fee, e.fine_rate_per_day, e.replacement_cost
         FROM equipment e
         JOIN sport_types s ON e.sport_type_id = s.sport_type_id
        ORDER BY e.equipment_id ASC`
    );
    return res.rows.map((r: any) => ({
      equipmentId:       r.equipment_id,
      sportTypeId:       r.sport_type_id,
      sportName:         r.sport_name,
      name:              r.name,
      totalQuantity:     r.total_quantity,
      availableQuantity: r.available_quantity,
      rentalFee:         parseFloat(r.rental_fee),
      depositFee:        parseFloat(r.deposit_fee),
      fineRatePerDay:    parseFloat(r.fine_rate_per_day),
      replacementCost:   parseFloat(r.replacement_cost),
    }));
  }

  async createEquipment(
    conn: DbConnection,
    data: { sportTypeId: number; name: string; totalQuantity: number; rentalFee: number; depositFee?: number; fineRatePerDay?: number; replacementCost: number }
  ): Promise<number> {
    const res = await conn.query(
      `INSERT INTO equipment (sport_type_id, name, total_quantity, available_quantity, rental_fee, deposit_fee, fine_rate_per_day, replacement_cost)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7)
       RETURNING equipment_id`,
      [data.sportTypeId, data.name.trim(), data.totalQuantity, data.rentalFee, data.depositFee ?? 0, data.fineRatePerDay ?? 0, data.replacementCost]
    );
    return firstInsertId(res.rows, 'equipment_id');
  }

  async getEquipmentById(conn: DbConnection, equipmentId: number): Promise<EquipmentAdminDTO | null> {
    const list = await this.getEquipmentAdmin(conn);
    return list.find((e) => e.equipmentId === equipmentId) || null;
  }

  // =====================================================================
  // Promotions (BR14, BR15)
  // =====================================================================
  async getPromotions(conn: DbConnection): Promise<PromotionAdminDTO[]> {
    const res = await conn.query(`SELECT ${PROMOTION_COLUMNS}, created_at FROM promotions ORDER BY promotion_id DESC`);
    return res.rows.map((r: any) => ({ ...mapPromotion(r), createdAt: r.created_at }));
  }

  async createPromotion(
    conn: DbConnection,
    data: { code: string; title: string; discountType: 'PERCENT' | 'FIXED'; discountValue: number; minBookingHours: number; startDate: string; endDate: string; startTime?: string; endTime?: string; isActive?: boolean }
  ): Promise<number> {
    const res = await conn.query(
      `INSERT INTO promotions (code, title, discount_type, discount_value, min_booking_hours, start_date, end_date, start_time, end_time, is_active)
       VALUES ($1, $2, $3, $4, $5, $6::DATE, $7::DATE, $8, $9, $10)
       RETURNING promotion_id`,
      [data.code.trim().toUpperCase(), data.title.trim(), data.discountType, data.discountValue, data.minBookingHours,
       data.startDate, data.endDate, data.startTime || null, data.endTime || null, data.isActive !== false]
    );
    return firstInsertId(res.rows, 'promotion_id');
  }

  async getPromotionById(conn: DbConnection, promotionId: number): Promise<PromotionAdminDTO | null> {
    const res = await conn.query(
      `SELECT ${PROMOTION_COLUMNS}, created_at FROM promotions WHERE promotion_id = $1`,
      [promotionId]
    );
    const r = res.rows[0];
    return r ? { ...mapPromotion(r), createdAt: r.created_at } : null;
  }

  // =====================================================================
  // Pricing rates (BR14)
  // =====================================================================
  async getPricingRates(conn: DbConnection): Promise<PricingRateDTO[]> {
    const res = await conn.query(
      `SELECT pr.rate_id, pr.court_id, pr.sport_type_id, pr.member_type_id, m.type_name AS member_type_name,
              pr.day_type, pr.start_time, pr.end_time, pr.hourly_rate, pr.created_at
         FROM pricing_rates pr
         LEFT JOIN member_types m ON m.member_type_id = pr.member_type_id
        ORDER BY pr.rate_id ASC`
    );
    return res.rows.map((r: any) => ({
      rateId:         r.rate_id,
      courtId:        r.court_id ?? undefined,
      sportTypeId:    r.sport_type_id ?? undefined,
      memberTypeId:   r.member_type_id ?? undefined,
      memberTypeName: r.member_type_name ?? undefined,
      dayType:        r.day_type,
      startTime:      r.start_time,
      endTime:        r.end_time,
      hourlyRate:     parseFloat(r.hourly_rate),
      createdAt:      r.created_at,
    }));
  }

  // ตรวจ overlap ของช่วงเวลาอัตราราคา
  // PostgreSQL: ใช้ IS NOT DISTINCT FROM แทน NVL(col, -1) = NVL(:val, -1) ของ Oracle
  async findOverlappingRate(
    conn: DbConnection,
    data: { courtId?: number; sportTypeId?: number; memberTypeId?: number; dayType: string; startTime: string; endTime: string }
  ): Promise<number | null> {
    const res = await conn.query<{ rate_id: number }>(
      `SELECT rate_id FROM pricing_rates
        WHERE court_id IS NOT DISTINCT FROM $1
          AND sport_type_id IS NOT DISTINCT FROM $2
          AND member_type_id IS NOT DISTINCT FROM $3
          AND day_type = $4
          AND start_time < $5 AND end_time > $6
        LIMIT 1`,
      [data.courtId ?? null, data.courtId ? null : data.sportTypeId ?? null, data.memberTypeId ?? null, data.dayType, data.endTime, data.startTime]
    );
    return res.rows[0]?.rate_id ?? null;
  }

  async createPricingRate(
    conn: DbConnection,
    data: { courtId?: number; sportTypeId?: number; memberTypeId?: number; dayType: string; startTime: string; endTime: string; hourlyRate: number }
  ): Promise<number> {
    const res = await conn.query(
      `INSERT INTO pricing_rates (court_id, sport_type_id, member_type_id, day_type, start_time, end_time, hourly_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING rate_id`,
      [data.courtId ?? null, data.courtId ? null : data.sportTypeId ?? null, data.memberTypeId ?? null, data.dayType, data.startTime, data.endTime, data.hourlyRate]
    );
    return firstInsertId(res.rows, 'rate_id');
  }
}
