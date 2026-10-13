-- =====================================================================
-- views.sql : Views สำเร็จรูปสำหรับ Frontend / รายงาน
-- ลำดับการรัน (SQL Developer -> Run Script F5):
--   1) schema.sql   2) constraints.sql   3) views.sql   4) seed.sql
-- รันซ้ำได้ (CREATE OR REPLACE)
--
--   v_booking_bill       ใบแจ้งยอดของการจอง (ค่าสนาม + ค่าอุปกรณ์ - ส่วนลด = ยอดสุทธิ)
--   v_my_bookings        รายการจองของลูกค้า (หน้า "การจองของฉัน")
--   v_court_occupancy    ช่วงเวลาที่สนามถูกใช้ (ตารางเวลาว่าง / Availability Grid)
--   v_pending_slips      คิวสลิปรอพนักงานตรวจ (Inspector Console)
--   v_overdue_equipment  อุปกรณ์ที่ยังไม่คืนและเลยกำหนดแล้ว พร้อมค่าปรับโดยประมาณ (20 บาท / 15 นาที / ชิ้น)
--   v_receipts           ใบเสร็จรับเงินอิเล็กทรอนิกส์
--   v_revenue_by_hour    รายได้และจำนวนการจองแยกตามชั่วโมง (Peak Hours Analysis)
-- =====================================================================

-- ---------------------------------------------------------------------
-- v_booking_bill
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_booking_bill AS
SELECT b.booking_id,
       b.booking_number,
       b.user_id,
       u.username,
       u.first_name || ' ' || u.last_name AS customer_name,
       mt.type_name AS member_type,
       mt.discount_percent AS member_discount_percent,
       c.court_id,
       c.code AS court_code,
       c.name AS court_name,
       s.name AS sport_name,
       b.booking_date,
       b.start_time,
       b.end_time,
       ROUND(((TO_NUMBER(SUBSTR(b.end_time, 1, 2)) * 60 + TO_NUMBER(SUBSTR(b.end_time, 4, 2)))
            - (TO_NUMBER(SUBSTR(b.start_time, 1, 2)) * 60 + TO_NUMBER(SUBSTR(b.start_time, 4, 2)))) / 60, 2) AS duration_hours,
       b.total_court_fee,
       b.total_equipment_fee,
       b.discount_amount,
       pr.code AS promotion_code,
       b.final_amount,
       (SELECT LISTAGG(e.name || ' x' || be.quantity || ' (' || TO_CHAR(be.subtotal, 'FM999990.00') || ')', ', ')
                 WITHIN GROUP (ORDER BY be.equipment_id)
          FROM BOOKING_EQUIPMENT be
          JOIN EQUIPMENT e ON e.equipment_id = be.equipment_id
         WHERE be.booking_id = b.booking_id) AS equipment_items,
       b.status,
       b.hold_expires_at,
       b.created_at
  FROM BOOKINGS b
  JOIN USERS u ON u.user_id = b.user_id
  JOIN MEMBER_TYPES mt ON mt.member_type_id = u.member_type_id
  JOIN COURTS c ON c.court_id = b.court_id
  JOIN SPORT_TYPES s ON s.sport_type_id = c.sport_type_id
  LEFT JOIN PROMOTIONS pr ON pr.promotion_id = b.promotion_id;

-- ---------------------------------------------------------------------
-- v_my_bookings (กรองด้วย WHERE user_id = :userId)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_my_bookings AS
SELECT b.booking_id,
       b.booking_number,
       b.user_id,
       c.court_id,
       c.name AS court_name,
       s.name AS sport_name,
       b.booking_date,
       b.start_time,
       b.end_time,
       b.final_amount,
       b.status,
       CASE b.status
          WHEN 'PENDING_PAYMENT'  THEN 'รอชำระเงิน'
          WHEN 'PAYMENT_VERIFIED' THEN 'ตรวจสอบการชำระแล้ว'
          WHEN 'CONFIRMED'        THEN 'ชำระแล้ว'
          WHEN 'CHECKED_IN'       THEN 'เช็คอินแล้ว'
          WHEN 'COMPLETED'        THEN 'ใช้งานเสร็จสิ้น'
          WHEN 'CANCELLED'        THEN 'ยกเลิกแล้ว'
          WHEN 'REFUNDED'         THEN 'คืนเงินแล้ว'
          WHEN 'EXPIRED'          THEN 'หมดเวลาชำระเงิน'
       END AS status_th,
       b.hold_expires_at,
       CASE WHEN b.status = 'PENDING_PAYMENT' AND b.hold_expires_at > LOCALTIMESTAMP
            THEN ROUND((CAST(b.hold_expires_at AS DATE) - CAST(LOCALTIMESTAMP AS DATE)) * 86400)
       END AS hold_seconds_left,
       (SELECT MAX(p.status) KEEP (DENSE_RANK LAST ORDER BY p.payment_id)
          FROM PAYMENTS p WHERE p.booking_id = b.booking_id) AS latest_payment_status,
       (SELECT MAX(r.receipt_number) FROM RECEIPTS r WHERE r.booking_id = b.booking_id) AS receipt_number,
       b.checked_in_at,
       b.cancelled_at,
       b.created_at
  FROM BOOKINGS b
  JOIN COURTS c ON c.court_id = b.court_id
  JOIN SPORT_TYPES s ON s.sport_type_id = c.sport_type_id;

-- ---------------------------------------------------------------------
-- v_court_occupancy : ช่วงเวลาที่ถูกถือครองของแต่ละสนาม
--   slot_status: HELD (รอชำระเงิน - สีเหลือง) / BOOKED (ถูกจองแล้ว - สีแดง)
--   ช่วงที่ไม่มีในวิวนี้และสนาม court_status = AVAILABLE คือ "ว่าง"; MAINTENANCE คือ "ปิดปรับปรุง"
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_court_occupancy AS
SELECT c.court_id,
       c.code AS court_code,
       c.name AS court_name,
       c.sport_type_id,
       c.status AS court_status,
       b.booking_id,
       b.booking_number,
       b.booking_date,
       b.start_time,
       b.end_time,
       b.status AS booking_status,
       CASE WHEN b.status = 'PENDING_PAYMENT' THEN 'HELD' ELSE 'BOOKED' END AS slot_status,
       b.hold_expires_at
  FROM BOOKINGS b
  JOIN COURTS c ON c.court_id = b.court_id
 WHERE b.status IN ('PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'CONFIRMED', 'CHECKED_IN')
   AND (b.status <> 'PENDING_PAYMENT'
        OR b.hold_expires_at >= LOCALTIMESTAMP
        OR EXISTS (SELECT 1 FROM PAYMENTS p WHERE p.booking_id = b.booking_id AND p.status = 'PENDING'));

-- ---------------------------------------------------------------------
-- v_pending_slips : คิวสลิปรอตรวจ (Inspector Console) เรียงตามเวลาที่ส่ง
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_pending_slips AS
SELECT p.payment_id,
       p.booking_id,
       b.booking_number,
       b.status AS booking_status,
       b.user_id,
       u.username,
       u.first_name || ' ' || u.last_name AS customer_name,
       c.name AS court_name,
       b.booking_date,
       b.start_time,
       b.end_time,
       p.payment_method,
       p.amount AS slip_amount,
       b.final_amount AS booking_amount,
       CASE WHEN ABS(p.amount - b.final_amount) < 0.005 THEN 'Y' ELSE 'N' END AS amount_matches,
       p.slip_url,
       p.slip_reference,
       p.slip_mime_type,
       p.slip_file_size,
       p.verification_method,
       p.review_reason,
       p.created_at AS submitted_at,
       ROUND((CAST(LOCALTIMESTAMP AS DATE) - CAST(p.created_at AS DATE)) * 1440) AS minutes_waiting
  FROM PAYMENTS p
  JOIN BOOKINGS b ON b.booking_id = p.booking_id
  JOIN USERS u ON u.user_id = b.user_id
  JOIN COURTS c ON c.court_id = b.court_id
 WHERE p.status = 'PENDING';

-- ---------------------------------------------------------------------
-- v_overdue_equipment : อุปกรณ์ค้างคืนเลยกำหนด (BR11: 20 บาท ต่อ 15 นาที ต่อชิ้น)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_overdue_equipment AS
SELECT eb.borrowing_id,
       eb.booking_id,
       b.booking_number,
       b.user_id,
       u.username,
       u.first_name || ' ' || u.last_name AS customer_name,
       u.phone,
       e.equipment_id,
       e.name AS equipment_name,
       eb.quantity,
       eb.borrowed_at,
       eb.expected_return_at,
       ROUND((CAST(LOCALTIMESTAMP AS DATE) - CAST(eb.expected_return_at AS DATE)) * 1440) AS minutes_overdue,
       CEIL(ROUND((CAST(LOCALTIMESTAMP AS DATE) - CAST(eb.expected_return_at AS DATE)) * 1440, 4) / 15) * 20 * eb.quantity AS estimated_fine
  FROM EQUIPMENT_BORROWINGS eb
  JOIN BOOKINGS b ON b.booking_id = eb.booking_id
  JOIN USERS u ON u.user_id = b.user_id
  JOIN EQUIPMENT e ON e.equipment_id = eb.equipment_id
 WHERE eb.status IN ('BORROWED', 'OVERDUE')
   AND eb.expected_return_at < LOCALTIMESTAMP;

-- ---------------------------------------------------------------------
-- v_receipts : ใบเสร็จรับเงินอิเล็กทรอนิกส์ (ผู้ออก = พนักงานที่อนุมัติ หรือ ระบบตรวจสลิปอัตโนมัติ)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_receipts AS
SELECT r.receipt_id,
       r.receipt_number,
       r.booking_id,
       b.booking_number,
       r.payment_id,
       b.user_id,
       u.username,
       u.first_name || ' ' || u.last_name AS customer_name,
       c.name AS court_name,
       s.name AS sport_name,
       TO_CHAR(b.booking_date, 'YYYY-MM-DD') AS booking_date,
       b.start_time,
       b.end_time,
       b.total_court_fee,
       b.total_equipment_fee,
       b.discount_amount,
       r.total_amount,
       p.payment_method,
       p.slip_reference,
       p.verification_method,
       p.verified_by AS issued_by,
       CASE WHEN p.verification_method = 'AUTO' THEN 'ระบบตรวจสลิปอัตโนมัติ (Auto-Slip Verification)'
            ELSE st.first_name || ' ' || st.last_name END AS issued_by_name,
       r.issued_at,
       r.pdf_url
  FROM RECEIPTS r
  JOIN BOOKINGS b ON b.booking_id = r.booking_id
  JOIN PAYMENTS p ON p.payment_id = r.payment_id
  JOIN USERS u ON u.user_id = b.user_id
  JOIN COURTS c ON c.court_id = b.court_id
  JOIN SPORT_TYPES s ON s.sport_type_id = c.sport_type_id
  LEFT JOIN USERS st ON st.user_id = p.verified_by;

-- ---------------------------------------------------------------------
-- v_revenue_by_hour : Peak Hours Analysis (ชั่วโมง 08:00-21:00 ของการจองที่ชำระแล้ว)
--   bookings      = จำนวนการจองที่ใช้สนามในชั่วโมงนั้น
--   booked_minutes= นาทีที่ถูกใช้ในชั่วโมงนั้นรวมทุกสนาม
--   revenue       = รายได้เฉลี่ยตามสัดส่วนเวลาของการจองที่อยู่ในชั่วโมงนั้น
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_revenue_by_hour AS
WITH hours AS (
   SELECT LEVEL + 7 AS hr FROM dual CONNECT BY LEVEL <= 14
), paid AS (
   SELECT b.booking_id, b.final_amount,
          TO_NUMBER(SUBSTR(b.start_time, 1, 2)) * 60 + TO_NUMBER(SUBSTR(b.start_time, 4, 2)) AS s_min,
          TO_NUMBER(SUBSTR(b.end_time, 1, 2)) * 60 + TO_NUMBER(SUBSTR(b.end_time, 4, 2)) AS e_min
     FROM BOOKINGS b
    WHERE b.status IN ('PAYMENT_VERIFIED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED')
)
SELECT LPAD(h.hr, 2, '0') || ':00' AS hour_slot,
       h.hr AS hour_of_day,
       COUNT(p.booking_id) AS bookings,
       NVL(SUM(LEAST(p.e_min, (h.hr + 1) * 60) - GREATEST(p.s_min, h.hr * 60)), 0) AS booked_minutes,
       ROUND(NVL(SUM(p.final_amount * (LEAST(p.e_min, (h.hr + 1) * 60) - GREATEST(p.s_min, h.hr * 60))
                     / NULLIF(p.e_min - p.s_min, 0)), 0), 2) AS revenue
  FROM hours h
  LEFT JOIN paid p
    ON p.s_min < (h.hr + 1) * 60
   AND p.e_min > h.hr * 60
 GROUP BY h.hr;
