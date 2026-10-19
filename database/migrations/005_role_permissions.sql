-- =====================================================================
-- Migration 005: สิทธิ์ใช้งานเก็บในฐานข้อมูล (ไม่ฝังชื่อ role ในโค้ด)
-- ---------------------------------------------------------------------
-- เดิม: route ตรวจ requireRole('STAFF','ADMIN') ฝังชื่อ role ไว้ในโค้ด
-- ใหม่: route ตรวจ requirePermission('payment.verify')
--       ตาราง role_permissions กำหนดว่า role ไหนมี permission อะไร → แก้ผ่านหน้า Admin ได้
-- ค่าเริ่มต้นที่ seed ให้ตรงกับสิทธิ์เดิมทุกประการ (พฤติกรรมระบบไม่เปลี่ยน)
-- รันซ้ำได้ (idempotent) · ไม่ลบข้อมูล
-- =====================================================================

CREATE TABLE IF NOT EXISTS permissions (
    permission_id SERIAL PRIMARY KEY,
    code          VARCHAR(60)  NOT NULL UNIQUE,
    description   VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       INTEGER NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(permission_id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

INSERT INTO permissions (code, description) VALUES
    ('dashboard.customer', 'ดูหน้าแรกของลูกค้า'),
    ('dashboard.staff',    'ดูหน้าแรกของพนักงาน'),
    ('dashboard.admin',    'ดูหน้าแรกของผู้ดูแลระบบ'),
    ('dashboard.executive','ดูหน้าแรกของผู้บริหาร'),
    ('report.view',        'ดูรายงานสรุปการจองและรายได้'),
    ('payment.verify',     'ตรวจสอบ/อนุมัติ/ปฏิเสธการชำระเงิน'),
    ('refund.review',      'พิจารณาคำขอคืนเงิน'),
    ('equipment.lend',     'ให้ยืม/รับคืนอุปกรณ์'),
    ('booking.view_all',   'ดูการจอง ใบเสร็จ และการชำระเงินของผู้ใช้ทุกคน'),
    ('booking.lookup',     'ค้นหาการจองด้วยเลขที่การจอง'),
    ('booking.checkin',    'เช็กอินการจองแทนลูกค้าที่หน้าสนาม'),
    ('court.manage',       'เพิ่ม/แก้ไข/ลบสนาม'),
    ('catalog.manage',     'จัดการกีฬา อุปกรณ์ โปรโมชัน และอัตราค่าบริการ'),
    ('audit.view',         'ดูประวัติการใช้งานระบบ (Audit Log)'),
    ('role.manage',        'กำหนดสิทธิ์ของแต่ละบทบาท')
ON CONFLICT (code) DO NOTHING;

-- สิทธิ์เริ่มต้น = สิทธิ์เดิมที่เคยฝังอยู่ในโค้ด
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM (VALUES
    ('CUSTOMER',  'dashboard.customer'),
    ('STAFF',     'dashboard.staff'),
    ('STAFF',     'payment.verify'),
    ('STAFF',     'refund.review'),
    ('STAFF',     'equipment.lend'),
    ('STAFF',     'booking.view_all'),
    ('STAFF',     'booking.lookup'),
    ('STAFF',     'booking.checkin'),
    ('ADMIN',     'dashboard.admin'),
    ('ADMIN',     'dashboard.executive'),
    ('ADMIN',     'report.view'),
    ('ADMIN',     'payment.verify'),
    ('ADMIN',     'refund.review'),
    ('ADMIN',     'equipment.lend'),
    ('ADMIN',     'booking.view_all'),
    ('ADMIN',     'booking.lookup'),
    ('ADMIN',     'booking.checkin'),
    ('ADMIN',     'court.manage'),
    ('ADMIN',     'catalog.manage'),
    ('ADMIN',     'audit.view'),
    ('ADMIN',     'role.manage'),
    ('EXECUTIVE', 'booking.view_all'),
    ('EXECUTIVE', 'dashboard.executive'),
    ('EXECUTIVE', 'report.view')
  ) AS v(role_name, code)
  JOIN roles r       ON r.role_name = v.role_name
  JOIN permissions p ON p.code = v.code
ON CONFLICT DO NOTHING;

-- Supabase เปิด REST ให้ทุกตารางใน public → เปิด RLS (ไม่มี policy = anon/authenticated เข้าไม่ได้) เหมือน migration 003
ALTER TABLE permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
