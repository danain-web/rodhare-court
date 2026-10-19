-- =====================================================================
-- Migration 006: สถานะ NO_SHOW (จองแล้วไม่มา) + ตารางตั้งค่าระบบ app_settings
-- ---------------------------------------------------------------------
-- กติกา: ต้อง check-in ภายในช่วงเวลาที่กำหนด (ก่อนเริ่ม N นาที ถึงหลังเริ่ม X นาที)
--        ไม่ check-in → ระบบเปลี่ยนเป็น NO_SHOW, ปล่อยสนามคืน, ไม่คืนเงินทุกกรณี
-- ค่า N / X เก็บใน app_settings (admin ปรับได้) ไม่ฝังในโค้ด
-- รันซ้ำได้ (idempotent) · ไม่ลบข้อมูล
-- =====================================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ;

-- เพิ่ม NO_SHOW ใน CHECK ของสถานะ (NO_SHOW ไม่อยู่ใน exclusion constraint ของการจองซ้อน → ช่วงเวลานั้นว่างให้คนอื่นจองได้ทันที)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_bk_status;
ALTER TABLE bookings ADD CONSTRAINT chk_bk_status CHECK (status IN
  ('PENDING_PAYMENT','PAYMENT_VERIFIED','CONFIRMED','CHECKED_IN','COMPLETED','CANCELLED','REFUNDED','EXPIRED','NO_SHOW'));

CREATE TABLE IF NOT EXISTS app_settings (
    setting_key   VARCHAR(60)  PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL,
    description   VARCHAR(255) NOT NULL,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by    INTEGER REFERENCES users(user_id)
);

INSERT INTO app_settings (setting_key, setting_value, description) VALUES
    ('checkin.early_minutes', '15', 'เช็กอินได้ก่อนเวลาเริ่มไม่เกินกี่นาที'),
    ('checkin.late_minutes',  '15', 'เช็กอินได้หลังเวลาเริ่มไม่เกินกี่นาที (เลยแล้วถือว่าไม่มา และปล่อยสนามคืน)')
ON CONFLICT (setting_key) DO NOTHING;

-- สิทธิ์จัดการตั้งค่า
INSERT INTO permissions (code, description) VALUES
    ('settings.manage', 'ปรับค่าตั้งค่าระบบ เช่น ช่วงเวลาเช็กอิน การแจ้งเตือน')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM roles r JOIN permissions p ON p.code = 'settings.manage'
 WHERE r.role_name = 'ADMIN'
ON CONFLICT DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
