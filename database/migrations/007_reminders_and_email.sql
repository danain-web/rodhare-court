-- =====================================================================
-- Migration 007: แจ้งเตือนก่อนเวลาใช้สนาม (in-app + อีเมล)
-- ---------------------------------------------------------------------
-- bookings.reminder_first_sent_at / reminder_second_sent_at  กันส่งเตือนซ้ำ
-- notifications.email_*  คิวอีเมล (outbox): สร้างแจ้งเตือนพร้อมธงรอส่งอีเมล แล้วตัวส่งอีเมลมาเก็บไปส่ง
--   ถ้าส่งไม่สำเร็จจะลองใหม่ (สูงสุด 3 ครั้ง) · อีเมลล้มไม่ทำให้การจอง/การแจ้งเตือนในแอปพัง
-- ค่าเวลาเตือนอยู่ใน app_settings (admin ปรับได้)
-- รันซ้ำได้ (idempotent) · ไม่ลบข้อมูล
-- =====================================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_first_sent_at  TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_second_sent_at TIMESTAMPTZ;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_pending  BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_sent_at  TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_attempts INTEGER     NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_nt_email_pending ON notifications (notification_id) WHERE email_pending;

INSERT INTO app_settings (setting_key, setting_value, description) VALUES
    ('reminder.first_hours',    '24', 'แจ้งเตือนครั้งแรกก่อนเวลาเริ่มกี่ชั่วโมง'),
    ('reminder.second_minutes', '60', 'แจ้งเตือนครั้งที่สองก่อนเวลาเริ่มกี่นาที')
ON CONFLICT (setting_key) DO NOTHING;
