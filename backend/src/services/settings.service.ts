import { withConnection, withTransaction, DbConnection } from '../config/db';
import { insertAudit } from '../repositories/shared.repository';
import { BUSINESS_RULES } from '../config/env';
import { AppError } from '../utils/appError';

export interface SettingDTO {
  key: string;
  value: number;
  description: string;
  min: number;
  max: number;
}

// ค่าตั้งค่าที่ admin ปรับได้ พร้อมช่วงที่อนุญาตและค่าเริ่มต้น (ใช้เมื่อยังไม่มีแถวในฐานข้อมูล)
const SETTING_RULES: Record<string, { min: number; max: number; fallback: number }> = {
  'checkin.early_minutes': { min: 0, max: 240, fallback: BUSINESS_RULES.CHECKIN_EARLY_MINUTES },
  'checkin.late_minutes': { min: 0, max: 240, fallback: BUSINESS_RULES.CHECKIN_LATE_MINUTES },
  'reminder.first_hours': { min: 1, max: 168, fallback: BUSINESS_RULES.REMINDER_FIRST_HOURS },
  'reminder.second_minutes': { min: 5, max: 720, fallback: BUSINESS_RULES.REMINDER_SECOND_MINUTES },
};

export const getSettingValue = async (conn: DbConnection, key: string): Promise<number> => {
  const rule = SETTING_RULES[key];
  if (!rule) throw AppError.internal(`ไม่รู้จักค่าตั้งค่า ${key}`);
  const res = await conn.query<{ setting_value: string }>(`SELECT setting_value FROM app_settings WHERE setting_key = $1`, [key]);
  const parsed = res.rows[0] ? parseInt(res.rows[0].setting_value, 10) : NaN;
  return Number.isNaN(parsed) ? rule.fallback : parsed;
};

export class SettingsService {
  async getCheckInWindow(conn: DbConnection): Promise<{ earlyMinutes: number; lateMinutes: number }> {
    return {
      earlyMinutes: await getSettingValue(conn, 'checkin.early_minutes'),
      lateMinutes: await getSettingValue(conn, 'checkin.late_minutes'),
    };
  }

  async getReminderWindow(conn: DbConnection): Promise<{ firstHours: number; secondMinutes: number }> {
    return {
      firstHours: await getSettingValue(conn, 'reminder.first_hours'),
      secondMinutes: await getSettingValue(conn, 'reminder.second_minutes'),
    };
  }

  async list(): Promise<SettingDTO[]> {
    return withConnection(async (conn) => {
      const res = await conn.query<{ setting_key: string; description: string }>(
        `SELECT setting_key, description FROM app_settings ORDER BY setting_key`
      );
      const out: SettingDTO[] = [];
      for (const row of res.rows) {
        const rule = SETTING_RULES[row.setting_key];
        if (!rule) continue;
        out.push({ key: row.setting_key, value: await getSettingValue(conn, row.setting_key), description: row.description, min: rule.min, max: rule.max });
      }
      return out;
    });
  }

  async update(actorUserId: number, key: string, value: number, ipAddress?: string): Promise<SettingDTO> {
    const rule = SETTING_RULES[key];
    if (!rule) throw AppError.notFound('ไม่พบค่าตั้งค่าที่ระบุ');
    if (!Number.isInteger(value) || value < rule.min || value > rule.max) {
      throw AppError.badRequest(`ค่าต้องเป็นจำนวนเต็มระหว่าง ${rule.min} ถึง ${rule.max}`);
    }
    return withTransaction(async (conn) => {
      const before = await getSettingValue(conn, key);
      const res = await conn.query(
        `UPDATE app_settings SET setting_value = $1, updated_at = NOW(), updated_by = $2 WHERE setting_key = $3 RETURNING description`,
        [String(value), actorUserId, key]
      );
      if (!res.rows[0]) throw AppError.notFound('ไม่พบค่าตั้งค่าที่ระบุ');
      await insertAudit(conn, {
        userId: actorUserId,
        action: 'UPDATE_SETTING',
        entityName: 'APP_SETTINGS',
        oldValues: { key, value: before },
        newValues: { key, value },
        ipAddress,
      });
      return { key, value, description: res.rows[0].description, min: rule.min, max: rule.max };
    });
  }
}
