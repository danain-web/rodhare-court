-- =====================================================================
-- Migration 009: รีเซ็ตรหัสผ่านทางอีเมล + จัดการผู้ใช้โดยผู้ดูแลระบบ
-- ---------------------------------------------------------------------
-- password_reset_tokens  โทเคนรีเซ็ตรหัสผ่าน (เก็บเฉพาะ SHA-256 ของโทเคน ไม่เก็บตัวจริง)
--                        ใช้ได้ครั้งเดียว · อายุสั้น · ลบอัตโนมัติเมื่อลบผู้ใช้
-- permission user.manage ดู/ระงับบัญชี/เปลี่ยนบทบาท/เปลี่ยนประเภทสมาชิกของผู้ใช้ (ให้ ADMIN เป็นค่าเริ่มต้น)
-- รันซ้ำได้ (idempotent) · ไม่ลบข้อมูล
-- =====================================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash VARCHAR(64) PRIMARY KEY,
    user_id    INTEGER     NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens (user_id, created_at);

-- Supabase เปิด REST ให้ทุกตารางใน public → เปิด RLS (ไม่มี policy = anon/authenticated เข้าไม่ได้) เหมือน migration 003
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

INSERT INTO permissions (code, description) VALUES
    ('user.manage', 'ดูรายชื่อผู้ใช้ ระงับ/เปิดบัญชี เปลี่ยนบทบาทและประเภทสมาชิก')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM roles r
  JOIN permissions p ON p.code = 'user.manage'
 WHERE r.role_name = 'ADMIN'
ON CONFLICT DO NOTHING;
