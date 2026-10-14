import { DbConnection } from '../config/db';
import { EquipmentDTO, PromotionDTO } from '../types/booking';

const EQUIPMENT_COLUMNS = `equipment_id, sport_type_id, name, total_quantity, available_quantity,
  rental_fee, deposit_fee, fine_rate_per_day, replacement_cost`;

// mapEquipment — แปลง snake_case row เป็น EquipmentDTO (camelCase)
const mapEquipment = (row: any): EquipmentDTO => ({
  equipmentId:       row.equipment_id,
  sportTypeId:       row.sport_type_id,
  name:              row.name,
  totalQuantity:     row.total_quantity,
  availableQuantity: row.available_quantity,
  rentalFee:         parseFloat(row.rental_fee),
  depositFee:        parseFloat(row.deposit_fee),
  fineRatePerDay:    parseFloat(row.fine_rate_per_day),
  replacementCost:   parseFloat(row.replacement_cost),
});

export const mapPromotion = (row: any): PromotionDTO => ({
  promotionId:     row.promotion_id,
  code:            row.code,
  title:           row.title,
  discountType:    row.discount_type,
  discountValue:   parseFloat(row.discount_value),
  minBookingHours: parseFloat(row.min_booking_hours),
  startDate:       row.start_date,
  endDate:         row.end_date,
  startTime:       row.start_time ?? undefined,
  endTime:         row.end_time ?? undefined,
  isActive:        row.is_active === true || row.is_active === 1,
});

// PostgreSQL: TO_CHAR ยังใช้ได้ (pg รองรับ SQL standard + PG-specific functions)
export const PROMOTION_COLUMNS = `promotion_id, code, title, discount_type, discount_value, min_booking_hours,
  TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date, TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
  start_time, end_time, is_active`;

export class EquipmentRepository {
  async getEquipment(conn: DbConnection, sportTypeId?: number): Promise<EquipmentDTO[]> {
    const params: any[] = [];
    let sql = `SELECT ${EQUIPMENT_COLUMNS} FROM equipment`;
    if (sportTypeId) {
      params.push(sportTypeId);
      sql += ` WHERE sport_type_id = $1`;
    }
    sql += ` ORDER BY equipment_id ASC`;
    const result = await conn.query(sql, params);
    return result.rows.map(mapEquipment);
  }

  async getEquipmentById(conn: DbConnection, equipmentId: number, forUpdate = false): Promise<EquipmentDTO | null> {
    const result = await conn.query(
      `SELECT ${EQUIPMENT_COLUMNS} FROM equipment WHERE equipment_id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`,
      [equipmentId]
    );
    return result.rows[0] ? mapEquipment(result.rows[0]) : null;
  }

  // ตัดสต็อกแบบ atomic (UPDATE ล็อกแถว กันคนอื่นตัดพร้อมกัน) คืน false ถ้าของไม่พอ
  async deductStock(conn: DbConnection, equipmentId: number, quantity: number): Promise<boolean> {
    const res = await conn.query(
      `UPDATE equipment SET available_quantity = available_quantity - $1
        WHERE equipment_id = $2 AND available_quantity >= $1`,
      [quantity, equipmentId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async restoreStock(conn: DbConnection, equipmentId: number, quantity: number): Promise<void> {
    await conn.query(
      `UPDATE equipment SET available_quantity = LEAST(total_quantity, available_quantity + $1)
        WHERE equipment_id = $2`,
      [quantity, equipmentId]
    );
  }

  // อุปกรณ์ชำรุด/สูญหาย: ลด total_quantity ถาวร
  async writeOffStock(conn: DbConnection, equipmentId: number, quantity: number): Promise<void> {
    await conn.query(
      `UPDATE equipment SET total_quantity = GREATEST(available_quantity, total_quantity - $1)
        WHERE equipment_id = $2`,
      [quantity, equipmentId]
    );
  }

  async findPromotionByCode(conn: DbConnection, code: string): Promise<PromotionDTO | null> {
    const result = await conn.query(
      `SELECT ${PROMOTION_COLUMNS} FROM promotions WHERE UPPER(code) = UPPER($1)`,
      [code.trim()]
    );
    return result.rows[0] ? mapPromotion(result.rows[0]) : null;
  }
}
