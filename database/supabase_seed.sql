-- =====================================================================
-- FILE: supabase_seed.sql
-- Seed Data (Dummy Data) สำหรับ Supabase PostgreSQL
-- ระบบจองสนามกีฬา (Online Sports Court Booking System)
--
-- วิธีใช้: รันหลัง supabase_schema.sql ใน Supabase Dashboard → SQL Editor
-- รหัสผ่านผู้ใช้ทดสอบทุกคน: Password123!
-- =====================================================================

-- =====================================================================
-- 1. ROLES
-- =====================================================================
INSERT INTO roles (role_name, description) VALUES
    ('CUSTOMER',  'ลูกค้าผู้จองสนาม'),
    ('STAFF',     'พนักงานผู้จัดการการจองและอุปกรณ์'),
    ('ADMIN',     'ผู้ดูแลระบบ'),
    ('EXECUTIVE', 'ผู้บริหารดูรายงานและสถิติ');

-- =====================================================================
-- 2. MEMBER_TYPES
-- =====================================================================
INSERT INTO member_types (type_name, display_name, discount_percent, max_advance_days) VALUES
    ('EXTERNAL',  'บุคคลภายนอก', 0.00,  30),
    ('STUDENT',   'นักศึกษา',    10.00, 30),
    ('PERSONNEL', 'บุคลากร',     15.00, 30);

-- =====================================================================
-- 3. USERS (Password: Password123!)
-- hash = bcrypt cost 10 ของ "Password123!"
-- =====================================================================
INSERT INTO users (username, email, password_hash, first_name, last_name, phone, member_type_id) VALUES
    ('customer1', 'customer1@sports.com', '$2b$10$1wi7bdEKviQezfeLdWVILeRpYWQSFQhhahFnZVnBz1cdCWkpdowzO', 'สมชาย',  'ลูกค้า',    '0812345678', 1),  -- user_id = 1
    ('staff1',    'staff1@sports.com',    '$2b$10$1wi7bdEKviQezfeLdWVILeRpYWQSFQhhahFnZVnBz1cdCWkpdowzO', 'สมศรี',  'พนักงาน',   '0823456789', 1),  -- user_id = 2
    ('admin1',    'admin1@sports.com',    '$2b$10$1wi7bdEKviQezfeLdWVILeRpYWQSFQhhahFnZVnBz1cdCWkpdowzO', 'Super',  'Admin',     '0834567890', 3),  -- user_id = 3
    ('exec1',     'exec1@sports.com',     '$2b$10$1wi7bdEKviQezfeLdWVILeRpYWQSFQhhahFnZVnBz1cdCWkpdowzO', 'ผู้บริหาร', 'ผู้อำนวยการ', '0845678901', 3),  -- user_id = 4
    ('customer2', 'customer2@sports.com', '$2b$10$1wi7bdEKviQezfeLdWVILeRpYWQSFQhhahFnZVnBz1cdCWkpdowzO', 'สุดา',   'นักศึกษา',  '0856789012', 2);  -- user_id = 5

-- =====================================================================
-- 4. USER_ROLES
-- =====================================================================
INSERT INTO user_roles (user_id, role_id) VALUES
    (1, 1),  -- customer1 -> CUSTOMER
    (2, 2),  -- staff1    -> STAFF
    (3, 3),  -- admin1    -> ADMIN
    (4, 4),  -- exec1     -> EXECUTIVE
    (5, 1);  -- customer2 -> CUSTOMER

-- =====================================================================
-- 5. SPORT_TYPES
-- =====================================================================
INSERT INTO sport_types (name, description) VALUES
    ('BADMINTON',  'สนามแบดมินตัน'),
    ('BASKETBALL', 'สนามบาสเกตบอล'),
    ('FUTSAL',     'สนามฟุตซอล'),
    ('TENNIS',     'สนามเทนนิส');

-- =====================================================================
-- 6. COURTS
-- =====================================================================
INSERT INTO courts (sport_type_id, name, code, location_details, hourly_rate, image_url, status) VALUES
    (1, 'Badminton Court 1 (Indoor Air-con)',   'BAD-01', 'อาคาร A ชั้น 1', 150.00,
     'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1000&q=80',
     'AVAILABLE'),

    (1, 'Badminton Court 2 (Indoor Standard)', 'BAD-02', 'อาคาร A ชั้น 1', 150.00,
     'https://images.unsplash.com/photo-1708312604073-90639de903fc?auto=format&fit=crop&w=1000&q=80',
     'AVAILABLE'),

    (2, 'Basketball Court 1 (Professional)',   'BAS-01', 'บริเวณกลางแจ้ง B', 300.00,
     'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1000&q=80',
     'AVAILABLE'),

    (3, 'Futsal Pitch 1 (Artificial Turf)',    'FUT-01', 'อาคาร C', 500.00,
     'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1000&q=80',
     'AVAILABLE'),

    (4, 'Tennis Court 1 (Hard Court)',         'TEN-01', 'บริเวณกลางแจ้ง A', 250.00,
     'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=1000&q=80',
     'AVAILABLE'),

    -- สนามปิดปรับปรุง (สาธิตสถานะ MAINTENANCE)
    (4, 'Tennis Court 2 (Clay - Renovating)',  'TEN-02', 'บริเวณกลางแจ้ง A', 250.00,
     'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=1000&q=80',
     'MAINTENANCE');

-- =====================================================================
-- 7. COURT_OPERATING_HOURS
-- ทุกสนามเปิด 08:00-22:00 ทุกวัน (0=อาทิตย์ ... 6=เสาร์)
-- PostgreSQL ใช้ generate_series แทน Oracle CONNECT BY
-- =====================================================================
INSERT INTO court_operating_hours (court_id, day_of_week, open_time, close_time, is_open)
SELECT c.court_id, d.dow, '08:00', '22:00', TRUE
FROM courts c
CROSS JOIN generate_series(0, 6) AS d(dow);

-- =====================================================================
-- 8. PRICING_RATES
-- =====================================================================
-- นักศึกษา: ฟุตซอลวันธรรมดา 08:00-17:00 ชั่วโมงละ 400 (ปกติ 500)
INSERT INTO pricing_rates (sport_type_id, member_type_id, day_type, start_time, end_time, hourly_rate)
VALUES (
    (SELECT sport_type_id FROM sport_types WHERE name = 'FUTSAL'),
    (SELECT member_type_id FROM member_types WHERE type_name = 'STUDENT'),
    'WEEKDAY', '08:00', '17:00', 400.00
);

-- บุคลากร: แบดมินตันวันธรรมดาทั้งวัน ชั่วโมงละ 120 (ปกติ 150)
INSERT INTO pricing_rates (sport_type_id, member_type_id, day_type, start_time, end_time, hourly_rate)
VALUES (
    (SELECT sport_type_id FROM sport_types WHERE name = 'BADMINTON'),
    (SELECT member_type_id FROM member_types WHERE type_name = 'PERSONNEL'),
    'WEEKDAY', '08:00', '22:00', 120.00
);

-- =====================================================================
-- 9. PROMOTIONS
-- =====================================================================
INSERT INTO promotions (code, title, discount_type, discount_value, min_booking_hours, start_date, end_date) VALUES
    ('WELCOME10',  'Welcome 10% Discount',    'PERCENT', 10.00, 1, '2026-01-01', '2027-12-31'),
    ('DISCOUNT50', 'Special 50 THB Off',       'FIXED',   50.00, 2, '2026-01-01', '2027-12-31');

-- โปรช่วงเช้า: ใช้ได้เฉพาะการจองที่อยู่ในช่วง 08:00-12:00
INSERT INTO promotions (code, title, discount_type, discount_value, min_booking_hours, start_date, end_date, start_time, end_time) VALUES
    ('MORNING20', 'Morning 20% Off (08:00-12:00)', 'PERCENT', 20.00, 1, '2026-01-01', '2027-12-31', '08:00', '12:00');

-- =====================================================================
-- 10. EQUIPMENT
-- =====================================================================
INSERT INTO equipment (sport_type_id, name, total_quantity, available_quantity, rental_fee, deposit_fee, fine_rate_per_day, replacement_cost) VALUES
    (
        (SELECT sport_type_id FROM sport_types WHERE name = 'BADMINTON'),
        'ไม้แบดมินตัน', 20, 20, 30.00, 50.00, 50.00, 500.00
    ),
    (
        (SELECT sport_type_id FROM sport_types WHERE name = 'BADMINTON'),
        'ลูกแบดมินตัน (กล่อง 3 ลูก)', 10, 10, 50.00, 0.00, 0.00, 150.00
    ),
    (
        (SELECT sport_type_id FROM sport_types WHERE name = 'BASKETBALL'),
        'ลูกบาสเกตบอล Size 7', 10, 10, 40.00, 100.00, 50.00, 800.00
    ),
    (
        (SELECT sport_type_id FROM sport_types WHERE name = 'FUTSAL'),
        'ลูกฟุตซอล Size 4', 8, 8, 40.00, 100.00, 50.00, 700.00
    );

-- =====================================================================
-- 11. SAMPLE BOOKINGS (สาธิตสถานะต่าง ๆ)
-- =====================================================================

-- Booking 1: CONFIRMED (ชำระแล้ว รอใช้สนาม) - customer1 จอง BAD-01 วันนี้
INSERT INTO bookings (
    booking_number, user_id, court_id, booking_date, start_time, end_time,
    total_court_fee, total_equipment_fee, discount_amount, final_amount,
    status, hold_expires_at
) VALUES (
    'BK-2026-0001', 1,
    (SELECT court_id FROM courts WHERE code = 'BAD-01'),
    CURRENT_DATE + 1, '10:00', '12:00',
    300.00, 0.00, 0.00, 300.00,
    'CONFIRMED',
    NOW() + INTERVAL '15 minutes'  -- hold_expires_at ต้องมีแม้ status ไม่ใช่ PENDING
);

-- Booking 2: PENDING_PAYMENT (รอชำระ) - customer2 จอง FUT-01
INSERT INTO bookings (
    booking_number, user_id, court_id, booking_date, start_time, end_time,
    total_court_fee, total_equipment_fee, discount_amount, final_amount,
    status, hold_expires_at
) VALUES (
    'BK-2026-0002', 5,
    (SELECT court_id FROM courts WHERE code = 'FUT-01'),
    CURRENT_DATE + 2, '14:00', '16:00',
    1000.00, 0.00, 0.00, 1000.00,
    'PENDING_PAYMENT',
    NOW() + INTERVAL '15 minutes'
);

-- Booking 3: COMPLETED (สำเร็จแล้ว) - customer1 จอง BAS-01 (ผ่านมาแล้ว)
INSERT INTO bookings (
    booking_number, user_id, court_id, booking_date, start_time, end_time,
    total_court_fee, total_equipment_fee, discount_amount, final_amount,
    status, hold_expires_at, checked_in_at, checked_in_by
) VALUES (
    'BK-2026-0003', 1,
    (SELECT court_id FROM courts WHERE code = 'BAS-01'),
    CURRENT_DATE - 3, '09:00', '11:00',
    600.00, 40.00, 0.00, 640.00,
    'COMPLETED',
    NOW() - INTERVAL '4 days',
    NOW() - INTERVAL '3 days',
    2  -- checked_in_by staff1
);

-- =====================================================================
-- 12. BOOKING_STATUS_HISTORY (บันทึกประวัติสถานะ)
-- =====================================================================
INSERT INTO booking_status_history (booking_id, status, notes, changed_by) VALUES
    (1, 'PENDING_PAYMENT', '[AUTO] NEW -> PENDING_PAYMENT', 1),
    (1, 'PAYMENT_VERIFIED', '[AUTO] PENDING_PAYMENT -> PAYMENT_VERIFIED', 2),
    (1, 'CONFIRMED', '[AUTO] PAYMENT_VERIFIED -> CONFIRMED', 2),
    (2, 'PENDING_PAYMENT', '[AUTO] NEW -> PENDING_PAYMENT', 5),
    (3, 'PENDING_PAYMENT', '[AUTO] NEW -> PENDING_PAYMENT', 1),
    (3, 'PAYMENT_VERIFIED', '[AUTO] PENDING_PAYMENT -> PAYMENT_VERIFIED', 2),
    (3, 'CONFIRMED', '[AUTO] PAYMENT_VERIFIED -> CONFIRMED', 2),
    (3, 'CHECKED_IN', '[AUTO] CONFIRMED -> CHECKED_IN', 2),
    (3, 'COMPLETED', '[AUTO] CHECKED_IN -> COMPLETED', 2);

-- =====================================================================
-- 13. PAYMENTS (สาธิตสถานะ VERIFIED และ PENDING)
-- =====================================================================

-- Payment สำหรับ Booking 1 (VERIFIED)
INSERT INTO payments (
    booking_id, payment_method, amount, slip_url, slip_reference,
    slip_mime_type, slip_file_size, status, verification_method,
    verified_by, verified_at
) VALUES (
    1, 'SLIP_TRANSFER', 300.00,
    'https://via.placeholder.com/400x600?text=Slip+BK-2026-0001',
    'REF001234567890',
    'image/jpeg', 102400,
    'VERIFIED', 'MANUAL',
    2, NOW() - INTERVAL '2 days'
);

-- Payment สำหรับ Booking 3 (VERIFIED)
INSERT INTO payments (
    booking_id, payment_method, amount, slip_url, slip_reference,
    slip_mime_type, slip_file_size, status, verification_method,
    verified_by, verified_at
) VALUES (
    3, 'SLIP_TRANSFER', 640.00,
    'https://via.placeholder.com/400x600?text=Slip+BK-2026-0003',
    'REF009876543210',
    'image/jpeg', 98304,
    'VERIFIED', 'MANUAL',
    2, NOW() - INTERVAL '3 days'
);

-- =====================================================================
-- 14. RECEIPTS
-- =====================================================================
INSERT INTO receipts (receipt_number, booking_id, payment_id, total_amount, issued_at) VALUES
    ('RC-2026-0001', 1, 1, 300.00, NOW() - INTERVAL '2 days'),
    ('RC-2026-0002', 3, 2, 640.00, NOW() - INTERVAL '3 days');

-- =====================================================================
-- 15. BOOKING_EQUIPMENT (สำหรับ Booking 3 ที่เช่าลูกบาส)
-- =====================================================================
INSERT INTO booking_equipment (booking_id, equipment_id, quantity, unit_rental_fee, subtotal) VALUES
    (3, (SELECT equipment_id FROM equipment WHERE name = 'ลูกบาสเกตบอล Size 7'), 1, 40.00, 40.00);

-- =====================================================================
-- 16. EQUIPMENT_BORROWINGS (การยืมอุปกรณ์ของ Booking 3 - คืนแล้ว)
-- =====================================================================
INSERT INTO equipment_borrowings (
    booking_id, equipment_id, quantity,
    borrowed_at, expected_return_at, actual_return_at,
    status, condition_notes, staff_user_id
) VALUES (
    3,
    (SELECT equipment_id FROM equipment WHERE name = 'ลูกบาสเกตบอล Size 7'),
    1,
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '3 days' + INTERVAL '2 hours',
    NOW() - INTERVAL '3 days' + INTERVAL '2 hours',
    'RETURNED', 'สภาพปกติ', 2
);

-- =====================================================================
-- 17. NOTIFICATIONS (ตัวอย่าง In-App Notifications)
-- =====================================================================
INSERT INTO notifications (user_id, booking_id, title, message, type, is_read) VALUES
    (1, 1, 'การจองได้รับการยืนยัน', 'การจอง BK-2026-0001 ของคุณได้รับการยืนยันแล้ว สนาม BAD-01 วันที่พรุ่งนี้ 10:00-12:00', 'SUCCESS', FALSE),
    (1, 3, 'การจองเสร็จสมบูรณ์', 'การจอง BK-2026-0003 เสร็จสมบูรณ์ ขอบคุณที่ใช้บริการ', 'INFO', TRUE),
    (5, 2, 'รอชำระเงิน', 'กรุณาชำระเงินสำหรับการจอง BK-2026-0002 ภายใน 15 นาที มิฉะนั้นระบบจะยกเลิกอัตโนมัติ', 'WARNING', FALSE),
    (2, 1, 'มีสลิปรอตรวจสอบ', 'มีสลิปการชำระเงินรายการใหม่รอการตรวจสอบ', 'ALERT', FALSE);

-- =====================================================================
-- 18. AUDIT_LOGS (ตัวอย่าง Audit Trail)
-- =====================================================================
INSERT INTO audit_logs (user_id, action, entity_name, entity_id, new_values, ip_address) VALUES
    (1, 'LOGIN',          'users',    1, '{"username":"customer1"}',          '192.168.1.10'),
    (1, 'INSERT',         'bookings', 1, '{"booking_number":"BK-2026-0001"}', '192.168.1.10'),
    (2, 'VERIFY_PAYMENT', 'payments', 1, '{"status":"VERIFIED"}',             '192.168.1.20'),
    (3, 'LOGIN',          'users',    3, '{"username":"admin1"}',              '192.168.1.30');

-- =====================================================================
-- ตรวจสอบผลลัพธ์
-- =====================================================================
SELECT 'roles'                  AS table_name, COUNT(*) AS rows FROM roles
UNION ALL SELECT 'member_types',             COUNT(*) FROM member_types
UNION ALL SELECT 'users',                    COUNT(*) FROM users
UNION ALL SELECT 'user_roles',               COUNT(*) FROM user_roles
UNION ALL SELECT 'sport_types',              COUNT(*) FROM sport_types
UNION ALL SELECT 'courts',                   COUNT(*) FROM courts
UNION ALL SELECT 'court_operating_hours',    COUNT(*) FROM court_operating_hours
UNION ALL SELECT 'pricing_rates',            COUNT(*) FROM pricing_rates
UNION ALL SELECT 'promotions',               COUNT(*) FROM promotions
UNION ALL SELECT 'equipment',                COUNT(*) FROM equipment
UNION ALL SELECT 'bookings',                 COUNT(*) FROM bookings
UNION ALL SELECT 'booking_status_history',   COUNT(*) FROM booking_status_history
UNION ALL SELECT 'payments',                 COUNT(*) FROM payments
UNION ALL SELECT 'receipts',                 COUNT(*) FROM receipts
UNION ALL SELECT 'booking_equipment',        COUNT(*) FROM booking_equipment
UNION ALL SELECT 'equipment_borrowings',     COUNT(*) FROM equipment_borrowings
UNION ALL SELECT 'notifications',            COUNT(*) FROM notifications
UNION ALL SELECT 'audit_logs',               COUNT(*) FROM audit_logs
ORDER BY table_name;
