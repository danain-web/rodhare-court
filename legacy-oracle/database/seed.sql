-- Oracle 19c+ Seed Data for Online Sports Court Booking System
-- รันหลัง schema.sql, constraints.sql และ views.sql
-- ข้อมูลตั้งต้นสร้างโดยระบบ (created_by = NULL) ส่วนข้อมูลที่เกิดจากหน้าเว็บ backend จะเติม created_by = user_id ให้อัตโนมัติ

-- Seed Roles
INSERT INTO ROLES (role_name, description) VALUES ('CUSTOMER', 'Customer user who can book courts');
INSERT INTO ROLES (role_name, description) VALUES ('STAFF', 'Staff user who manages bookings and equipment');
INSERT INTO ROLES (role_name, description) VALUES ('ADMIN', 'Administrator with full system management');
INSERT INTO ROLES (role_name, description) VALUES ('EXECUTIVE', 'Executive user with access to reports and analytics');

-- Seed Member Types (ใช้คำนวณส่วนลด + ราคาตามประเภทสมาชิกใน PRICING_RATES; BR4: จองล่วงหน้าได้ไม่เกิน 30 วันทุกประเภท)
INSERT INTO MEMBER_TYPES (type_name, display_name, discount_percent, max_advance_days) VALUES ('EXTERNAL', 'บุคคลภายนอก', 0.00, 30);
INSERT INTO MEMBER_TYPES (type_name, display_name, discount_percent, max_advance_days) VALUES ('STUDENT', 'นักศึกษา', 10.00, 30);
INSERT INTO MEMBER_TYPES (type_name, display_name, discount_percent, max_advance_days) VALUES ('PERSONNEL', 'บุคลากร', 15.00, 30);

-- Seed Default Test Users (Password: Password123!)
-- 1. Customer User
INSERT INTO USERS (username, email, password_hash, first_name, last_name, phone, member_type_id)
VALUES ('customer1', 'customer1@sports.com', '$2b$10$1wi7bdEKviQezfeLdWVILeRpYWQSFQhhahFnZVnBz1cdCWkpdowzO', 'Somchai', 'Customer', '0812345678', 1);
INSERT INTO USER_ROLES (user_id, role_id) VALUES (1, 1);

-- 2. Staff User
INSERT INTO USERS (username, email, password_hash, first_name, last_name, phone, member_type_id)
VALUES ('staff1', 'staff1@sports.com', '$2b$10$1wi7bdEKviQezfeLdWVILeRpYWQSFQhhahFnZVnBz1cdCWkpdowzO', 'Somsri', 'Staff', '0823456789', 1);
INSERT INTO USER_ROLES (user_id, role_id) VALUES (2, 2);

-- 3. Admin User
INSERT INTO USERS (username, email, password_hash, first_name, last_name, phone, member_type_id)
VALUES ('admin1', 'admin1@sports.com', '$2b$10$1wi7bdEKviQezfeLdWVILeRpYWQSFQhhahFnZVnBz1cdCWkpdowzO', 'Super', 'Admin', '0834567890', 3);
INSERT INTO USER_ROLES (user_id, role_id) VALUES (3, 3);

-- 4. Executive User
INSERT INTO USERS (username, email, password_hash, first_name, last_name, phone, member_type_id)
VALUES ('exec1', 'exec1@sports.com', '$2b$10$1wi7bdEKviQezfeLdWVILeRpYWQSFQhhahFnZVnBz1cdCWkpdowzO', 'Executive', 'Director', '0845678901', 3);
INSERT INTO USER_ROLES (user_id, role_id) VALUES (4, 4);

-- 5. ลูกค้าคนที่ 2 (ใช้สาธิตกรณีจองทับเวลา BR2 จากอีกบัญชี)
INSERT INTO USERS (username, email, password_hash, first_name, last_name, phone, member_type_id)
VALUES ('customer2', 'customer2@sports.com', '$2b$10$1wi7bdEKviQezfeLdWVILeRpYWQSFQhhahFnZVnBz1cdCWkpdowzO', 'Suda', 'Student', '0856789012', 2);
INSERT INTO USER_ROLES (user_id, role_id) VALUES (5, 1);

-- Seed Sport Types
INSERT INTO SPORT_TYPES (name, description) VALUES ('BADMINTON', 'Badminton court');
INSERT INTO SPORT_TYPES (name, description) VALUES ('BASKETBALL', 'Basketball court');
INSERT INTO SPORT_TYPES (name, description) VALUES ('FUTSAL', 'Futsal court');
INSERT INTO SPORT_TYPES (name, description) VALUES ('TENNIS', 'Tennis court');

-- Seed Initial Courts with Images
INSERT INTO COURTS (sport_type_id, name, code, location_details, hourly_rate, image_url)
VALUES (1, 'Badminton Court 1 (Indoor Air-con)', 'BAD-01', 'Building A, 1st Floor', 150.00, 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1000&q=80');

INSERT INTO COURTS (sport_type_id, name, code, location_details, hourly_rate, image_url)
VALUES (1, 'Badminton Court 2 (Indoor Standard)', 'BAD-02', 'Building A, 1st Floor', 150.00, 'https://images.unsplash.com/photo-1708312604073-90639de903fc?auto=format&fit=crop&w=1000&q=80');

INSERT INTO COURTS (sport_type_id, name, code, location_details, hourly_rate, image_url)
VALUES (2, 'Basketball Court 1 (Professional Wood)', 'BAS-01', 'Outdoor Area B', 300.00, 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1000&q=80');

INSERT INTO COURTS (sport_type_id, name, code, location_details, hourly_rate, image_url)
VALUES (3, 'Futsal Pitch 1 (Artificial Turf)', 'FUT-01', 'Building C', 500.00, 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1000&q=80');

INSERT INTO COURTS (sport_type_id, name, code, location_details, hourly_rate, image_url)
VALUES (4, 'Tennis Court 1 (Hard Court)', 'TEN-01', 'Outdoor Area A', 250.00, 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=1000&q=80');

-- Seed Equipment
INSERT INTO EQUIPMENT (sport_type_id, name, total_quantity, available_quantity, rental_fee, deposit_fee, fine_rate_per_day, replacement_cost)
VALUES (1, 'Badminton Racket', 20, 20, 30.00, 50.00, 50.00, 500.00);

INSERT INTO EQUIPMENT (sport_type_id, name, total_quantity, available_quantity, rental_fee, deposit_fee, fine_rate_per_day, replacement_cost)
VALUES (1, 'Shuttlecock (Tube of 3)', 10, 10, 50.00, 0.00, 0.00, 150.00);

INSERT INTO EQUIPMENT (sport_type_id, name, total_quantity, available_quantity, rental_fee, deposit_fee, fine_rate_per_day, replacement_cost)
VALUES (2, 'Basketball Size 7', 10, 10, 40.00, 100.00, 50.00, 800.00);

INSERT INTO EQUIPMENT (sport_type_id, name, total_quantity, available_quantity, rental_fee, deposit_fee, fine_rate_per_day, replacement_cost)
VALUES (3, 'Futsal Ball Size 4', 8, 8, 40.00, 100.00, 50.00, 700.00);

-- Seed Promotions (BR15: ใช้ได้เฉพาะในช่วงวันที่/เวลาที่กำหนด)
INSERT INTO PROMOTIONS (code, title, discount_type, discount_value, min_booking_hours, start_date, end_date)
VALUES ('WELCOME10', 'Welcome 10% Discount', 'PERCENT', 10.00, 1, DATE '2026-01-01', DATE '2027-12-31');

INSERT INTO PROMOTIONS (code, title, discount_type, discount_value, min_booking_hours, start_date, end_date)
VALUES ('DISCOUNT50', 'Special 50 THB Off', 'FIXED', 50.00, 2, DATE '2026-01-01', DATE '2027-12-31');

-- โปรช่วงเช้า: ใช้ได้เฉพาะการจองที่อยู่ในช่วง 08:00-12:00 (สาธิต BR15 เรื่องช่วงเวลา)
INSERT INTO PROMOTIONS (code, title, discount_type, discount_value, min_booking_hours, start_date, end_date, start_time, end_time)
VALUES ('MORNING20', 'Morning 20% Off (08:00-12:00)', 'PERCENT', 20.00, 1, DATE '2026-01-01', DATE '2027-12-31', '08:00', '12:00');

-- สนามปิดปรับปรุง (สาธิตสีสถานะ "ปิดปรับปรุง" ในตารางเวลาว่าง)
INSERT INTO COURTS (sport_type_id, name, code, location_details, hourly_rate, image_url, status)
VALUES (4, 'Tennis Court 2 (Clay - Renovating)', 'TEN-02', 'Outdoor Area A', 250.00, 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=1000&q=80', 'MAINTENANCE');

-- Seed Pricing Rates ตามประเภทสมาชิก (ช่วงที่ไม่มีอัตรากำหนดใช้ COURTS.hourly_rate แล้วหักส่วนลดสมาชิก)
--   นักศึกษา: ฟุตซอลวันธรรมดา 08:00-17:00 ชั่วโมงละ 400 (ปกติ 500)
--   บุคลากร : แบดมินตันวันธรรมดาทั้งวัน ชั่วโมงละ 120 (ปกติ 150)
INSERT INTO PRICING_RATES (sport_type_id, member_type_id, day_type, start_time, end_time, hourly_rate)
VALUES (3, (SELECT member_type_id FROM MEMBER_TYPES WHERE type_name = 'STUDENT'), 'WEEKDAY', '08:00', '17:00', 400.00);
INSERT INTO PRICING_RATES (sport_type_id, member_type_id, day_type, start_time, end_time, hourly_rate)
VALUES (1, (SELECT member_type_id FROM MEMBER_TYPES WHERE type_name = 'PERSONNEL'), 'WEEKDAY', '08:00', '22:00', 120.00);

-- Seed Operating Hours: ทุกสนามเปิด 08:00-22:00 ทุกวัน (0 = อาทิตย์ ... 6 = เสาร์)
INSERT INTO COURT_OPERATING_HOURS (court_id, day_of_week, open_time, close_time)
SELECT c.court_id, d.dow, '08:00', '22:00'
FROM COURTS c
CROSS JOIN (SELECT LEVEL - 1 AS dow FROM dual CONNECT BY LEVEL <= 7) d;

COMMIT;
