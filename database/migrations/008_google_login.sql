-- =====================================================================
-- Migration 008: เข้าสู่ระบบด้วยบัญชี Google (เพิ่มเป็นอีกทางเลือก ไม่แทนที่รหัสผ่าน)
-- ---------------------------------------------------------------------
-- users.google_sub        ID ถาวรของบัญชี Google (claim "sub") ใช้ระบุตัวตน ไม่ใช้อีเมลเพราะอีเมลเปลี่ยนได้
-- users.password_hash     เป็นค่าว่างได้ สำหรับบัญชีที่สมัครผ่าน Google (ต้องมี google_sub เสมอถ้าไม่มีรหัสผ่าน)
-- member_type_email_domains  แมปโดเมนอีเมล → ประเภทสมาชิก (ตั้งตอนสร้างบัญชีผ่าน Google เท่านั้น)
--                            เพิ่มโดเมนใหม่ได้ด้วย INSERT โดยไม่ต้องแก้โค้ด
-- รันซ้ำได้ (idempotent) · ไม่ลบข้อมูล
-- =====================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL;

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_credential;
ALTER TABLE users ADD CONSTRAINT chk_users_credential CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL);

CREATE TABLE IF NOT EXISTS member_type_email_domains (
    domain         VARCHAR(100) PRIMARY KEY,
    member_type_id INTEGER NOT NULL REFERENCES member_types(member_type_id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_mted_domain_lower CHECK (domain = LOWER(domain))
);

-- อีเมลมหาวิทยาลัย (Google Workspace) = นักศึกษา · โดเมนอื่นได้ประเภทบุคคลภายนอกตามค่าเริ่มต้น
INSERT INTO member_type_email_domains (domain, member_type_id)
SELECT 'kkumail.com', member_type_id FROM member_types WHERE type_name = 'STUDENT'
ON CONFLICT (domain) DO NOTHING;

ALTER TABLE member_type_email_domains ENABLE ROW LEVEL SECURITY;
