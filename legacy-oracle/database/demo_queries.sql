-- =====================================================================
-- demo_queries.sql : ชุดคำสั่งเปิดโชว์ตอน Demo (SQL Developer)
-- วิธีใช้: เลือกทีละบล็อกแล้วกด Ctrl+Enter (Run Statement)
-- =====================================================================

-- ---------------------------------------------------------------------
-- [1] ก่อนทำ: สถานะเริ่มต้น
-- ---------------------------------------------------------------------
-- 1.1 สต็อกอุปกรณ์
SELECT equipment_id, name, available_quantity, total_quantity
FROM EQUIPMENT
ORDER BY equipment_id;

-- 1.2 การจองที่ยังถือครองสนามของสนาม/วันที่จะ demo (เช่น :court_id = 1, :booking_date = '2026-10-20')
SELECT booking_number, TO_CHAR(booking_date, 'YYYY-MM-DD') AS booking_date, start_time, end_time, status, hold_expires_at
FROM BOOKINGS
WHERE court_id = :court_id
  AND booking_date = TO_DATE(:booking_date, 'YYYY-MM-DD')
  AND status IN ('PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'CONFIRMED', 'CHECKED_IN')
ORDER BY start_time;

-- ---------------------------------------------------------------------
-- [3] หลังทำ: ข้อมูลเปลี่ยนในทุกตารางที่เกี่ยวข้อง (การจองล่าสุด)
-- ---------------------------------------------------------------------
-- 3.1 BOOKINGS (+ ใครสร้าง/ใครแก้ล่าสุด จากคอลัมน์ติดตามข้อมูล)
SELECT b.booking_id, b.booking_number, u.username, c.name AS court, TO_CHAR(b.booking_date, 'YYYY-MM-DD') AS booking_date,
       b.start_time, b.end_time, b.total_court_fee, b.total_equipment_fee, b.discount_amount, b.final_amount, b.status,
       b.hold_expires_at, cb.username AS created_by, b.created_at, ub.username AS updated_by, b.updated_at
FROM BOOKINGS b
JOIN USERS u ON u.user_id = b.user_id
JOIN COURTS c ON c.court_id = b.court_id
LEFT JOIN USERS cb ON cb.user_id = b.created_by
LEFT JOIN USERS ub ON ub.user_id = b.updated_by
WHERE b.booking_id = (SELECT MAX(booking_id) FROM BOOKINGS);

-- 3.2 BOOKING_EQUIPMENT (อุปกรณ์ที่จอง)
SELECT be.booking_id, e.name, be.quantity, be.unit_rental_fee, be.subtotal
FROM BOOKING_EQUIPMENT be
JOIN EQUIPMENT e ON e.equipment_id = be.equipment_id
WHERE be.booking_id = (SELECT MAX(booking_id) FROM BOOKINGS);

-- 3.3 EQUIPMENT (สต็อกลดลง)
SELECT equipment_id, name, available_quantity, total_quantity
FROM EQUIPMENT
ORDER BY equipment_id;

-- 3.4 BOOKING_STATUS_HISTORY (PENDING_PAYMENT -> ส่งสลิป -> CONFIRMED = ชำระแล้ว)
SELECT h.history_id, h.status, h.notes, NVL(u.username, 'SYSTEM') AS changed_by, h.created_at
FROM BOOKING_STATUS_HISTORY h
LEFT JOIN USERS u ON u.user_id = h.changed_by
WHERE h.booking_id = (SELECT MAX(booking_id) FROM BOOKINGS)
ORDER BY h.history_id;

-- 3.5 PAYMENTS + RECEIPTS (UC-4 -> UC-7)
SELECT p.payment_id, p.payment_method, p.amount, p.slip_reference, p.status, cb.username AS uploaded_by, p.created_at AS uploaded_at,
       v.username AS verified_by, p.verified_at, p.rejection_reason, r.receipt_number, r.total_amount, rb.username AS receipt_issued_by
FROM PAYMENTS p
LEFT JOIN USERS cb ON cb.user_id = p.created_by
LEFT JOIN USERS v ON v.user_id = p.verified_by
LEFT JOIN RECEIPTS r ON r.payment_id = p.payment_id
LEFT JOIN USERS rb ON rb.user_id = r.created_by
WHERE p.booking_id = (SELECT MAX(booking_id) FROM BOOKINGS)
ORDER BY p.payment_id;

-- 3.6 NOTIFICATIONS + AUDIT_LOGS
SELECT notification_id, booking_id, title, message, type, created_at
FROM NOTIFICATIONS
WHERE user_id = (SELECT user_id FROM BOOKINGS WHERE booking_id = (SELECT MAX(booking_id) FROM BOOKINGS))
ORDER BY notification_id DESC
FETCH FIRST 5 ROWS ONLY;

SELECT a.log_id, NVL(u.username, 'SYSTEM') AS actor, a.action, a.entity_name, a.entity_id, a.old_values, a.new_values, a.created_at
FROM AUDIT_LOGS a
LEFT JOIN USERS u ON u.user_id = a.user_id
ORDER BY a.log_id DESC
FETCH FIRST 8 ROWS ONLY;

-- 3.7 คิวสลิปรอตรวจ (หน้าพนักงาน UC-7) พร้อมผลเทียบยอด BR6
SELECT p.payment_id, b.booking_number, u.username, p.amount, b.final_amount,
       CASE WHEN p.amount = b.final_amount THEN 'Y' ELSE 'N' END AS amount_matches, p.slip_reference, p.created_at
FROM PAYMENTS p
JOIN BOOKINGS b ON b.booking_id = p.booking_id
JOIN USERS u ON u.user_id = b.user_id
WHERE p.status = 'PENDING'
ORDER BY p.created_at;

-- ---------------------------------------------------------------------
-- [4] กรณีที่ระบบต้องปฏิเสธ (ระดับฐานข้อมูล) — ทุกคำสั่งในส่วนนี้ "ต้อง error"
-- ---------------------------------------------------------------------
-- 4.1 จองทับช่วงเวลาของการจองที่ยังมีผล -> ORA-20001 จาก trigger trg_bookings_no_overlap (BR2)
INSERT INTO BOOKINGS (booking_number, user_id, court_id, booking_date, start_time, end_time,
                      total_court_fee, final_amount, status, hold_expires_at)
SELECT 'BK-TEST-OVERLAP', user_id, court_id, booking_date, start_time, end_time, 0, 0, 'PENDING_PAYMENT',
       LOCALTIMESTAMP + INTERVAL '15' MINUTE
FROM BOOKINGS
WHERE booking_id = (SELECT MAX(booking_id) FROM BOOKINGS
                    WHERE status IN ('PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'CONFIRMED', 'CHECKED_IN'));
ROLLBACK;

-- 4.2 ตัดสต็อกจนติดลบ -> ORA-02290 check constraint (CHK_EQ_STOCK)
UPDATE EQUIPMENT SET available_quantity = available_quantity - 999 WHERE equipment_id = 1;
ROLLBACK;

-- 4.3 ออกใบเสร็จซ้ำให้การชำระเงินเดิม -> ORA-00001 unique constraint (UQ_RC_PAYMENT)
INSERT INTO RECEIPTS (receipt_number, booking_id, payment_id, total_amount)
SELECT 'RC-TEST-DUP', booking_id, payment_id, total_amount
FROM RECEIPTS
WHERE receipt_id = (SELECT MAX(receipt_id) FROM RECEIPTS);
ROLLBACK;

-- 4.4 อนุมัติการชำระเงินครั้งที่ 2 ให้การจองเดิม -> ORA-00001 (UQ_PAY_VERIFIED_BOOKING)
INSERT INTO PAYMENTS (booking_id, payment_method, amount, slip_url, status, verified_by, verified_at)
SELECT booking_id, 'PROMPTPAY', amount, 'https://example.com/dup.jpg', 'VERIFIED', verified_by, LOCALTIMESTAMP
FROM PAYMENTS
WHERE payment_id = (SELECT MAX(payment_id) FROM PAYMENTS WHERE status = 'VERIFIED');
ROLLBACK;

-- 4.5 ยอดสุทธิไม่ตรงกับค่าสนาม+ค่าอุปกรณ์-ส่วนลด -> ORA-02290 (CHK_BK_FINAL)
UPDATE BOOKINGS SET final_amount = final_amount + 1 WHERE booking_id = (SELECT MAX(booking_id) FROM BOOKINGS);
ROLLBACK;

-- ---------------------------------------------------------------------
-- [5] ผลลัพธ์ปลายทาง: สรุปรายได้และการจองรายวัน (BR17)
-- ---------------------------------------------------------------------
SELECT TO_CHAR(b.booking_date, 'YYYY-MM-DD') AS booking_date,
       COUNT(*) AS bookings,
       SUM(CASE WHEN b.status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED') THEN 1 ELSE 0 END) AS paid_bookings,
       SUM(CASE WHEN b.status IN ('CANCELLED', 'REFUNDED', 'EXPIRED') THEN 1 ELSE 0 END) AS cancelled_or_expired,
       NVL(SUM(p.amount), 0) AS verified_revenue
FROM BOOKINGS b
LEFT JOIN PAYMENTS p ON p.booking_id = b.booking_id AND p.status = 'VERIFIED'
GROUP BY b.booking_date
ORDER BY b.booking_date DESC;

-- ---------------------------------------------------------------------
-- [6] Views สำเร็จรูป + Audit Trail อัตโนมัติ (trigger trg_<table>_audit)
-- ---------------------------------------------------------------------
-- 6.1 ใบแจ้งยอดการจองล่าสุด
SELECT * FROM v_booking_bill WHERE booking_id = (SELECT MAX(booking_id) FROM BOOKINGS);

-- 6.2 การจองของ customer1
SELECT * FROM v_my_bookings WHERE user_id = 1 ORDER BY booking_id DESC;

-- 6.3 ช่วงเวลาที่สนามถูกถือครอง (HELD = รอชำระเงิน, BOOKED = ถูกจองแล้ว)
SELECT court_code, TO_CHAR(booking_date, 'YYYY-MM-DD') AS booking_date, start_time, end_time, slot_status, booking_number
FROM v_court_occupancy
ORDER BY booking_date, court_code, start_time;

-- 6.4 คิวสลิปรอพนักงานตรวจ (Inspector Console)
SELECT payment_id, booking_number, customer_name, slip_amount, booking_amount, amount_matches, slip_reference, review_reason, minutes_waiting
FROM v_pending_slips
ORDER BY submitted_at;

-- 6.5 อุปกรณ์ค้างคืนเลยกำหนด + ค่าปรับโดยประมาณ (20 บาท / 15 นาที / ชิ้น)
SELECT * FROM v_overdue_equipment ORDER BY minutes_overdue DESC;

-- 6.6 ใบเสร็จรับเงินอิเล็กทรอนิกส์
SELECT receipt_number, booking_number, customer_name, total_amount, verification_method, issued_by_name, issued_at
FROM v_receipts
ORDER BY receipt_id DESC;

-- 6.7 Peak Hours Analysis
SELECT hour_slot, bookings, booked_minutes, revenue FROM v_revenue_by_hour ORDER BY hour_of_day;

-- 6.8 Audit Trail: INSERT/UPDATE/DELETE ทุกตารางถูกบันทึกโดย trigger พร้อมค่าเก่า/ค่าใหม่ (JSON)
SELECT a.log_id, NVL(u.username, 'SYSTEM') AS actor, a.action, a.entity_name, a.entity_id,
       DBMS_LOB.SUBSTR(a.old_values, 300, 1) AS old_values,
       DBMS_LOB.SUBSTR(a.new_values, 300, 1) AS new_values,
       a.created_at
FROM AUDIT_LOGS a
LEFT JOIN USERS u ON u.user_id = a.user_id
WHERE a.entity_name IN ('BOOKINGS', 'PAYMENTS', 'EQUIPMENT', 'RECEIPTS')
ORDER BY a.log_id DESC
FETCH FIRST 20 ROWS ONLY;

-- 6.9 ชื่อผู้ใช้ซ้ำแบบไม่สนตัวพิมพ์ -> ORA-00001 (UQ_USERS_USERNAME_CI) "ต้อง error"
INSERT INTO USERS (username, email, password_hash, first_name, last_name)
VALUES ('CUSTOMER1', 'another@sports.com', 'x', 'Test', 'Dup');
ROLLBACK;
