-- =====================================================================
-- Migration 002: กันจองซ้อนที่ระดับฐานข้อมูล (Exclusion Constraint)
-- ---------------------------------------------------------------------
-- ชั้นที่ 1 (โค้ด): ล็อกแถวสนาม (SELECT ... FOR UPDATE) แล้วตรวจช่วงเวลาทับใน Transaction เดียวกัน
-- ชั้นที่ 2 (ไฟล์นี้): ต่อให้มีโค้ดส่วนไหนลืมล็อก ฐานข้อมูลก็ไม่ยอมให้มีการจองที่ "ยังถือสนามอยู่" ทับกัน
--   - ช่วงเวลาเป็น [เริ่ม, สิ้นสุด) → 10:00–11:00 กับ 11:00–12:00 ไม่ถือว่าทับ
--   - นับเฉพาะสถานะที่ถือสนาม (รอชำระ/ชำระแล้ว/ยืนยัน/เช็คอิน) — ยกเลิก/หมดเวลา/เสร็จสิ้น ไม่บล็อก
-- ก่อนรันบน Production ให้ตรวจว่าไม่มีข้อมูลทับกันอยู่แล้ว (query ท้ายไฟล์) มิฉะนั้น migration จะล้มทั้งไฟล์
-- รันได้ซ้ำ (idempotent) · ไม่ลบข้อมูล
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- start_time/end_time เก็บเป็น 'HH:MM' (VARCHAR) — แปลงเป็นช่วงเวลา; '24:00' = เที่ยงคืนของวันถัดไป
-- IMMUTABLE: ผลลัพธ์ขึ้นกับค่า input เท่านั้น (รูปแบบ HH:MM ถูกบังคับโดย validator และ chk_bk_time)
CREATE OR REPLACE FUNCTION booking_period(d DATE, s VARCHAR, e VARCHAR)
RETURNS TSRANGE
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT tsrange(
    d + s::TIME,
    CASE WHEN e = '24:00' THEN (d + 1)::TIMESTAMP ELSE d + e::TIME END,
    '[)'
  )
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ex_bk_no_overlap') THEN
    ALTER TABLE bookings
      ADD CONSTRAINT ex_bk_no_overlap
      EXCLUDE USING gist (
        court_id WITH =,
        booking_period(booking_date, start_time, end_time) WITH &&
      )
      WHERE (status IN ('PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'CONFIRMED', 'CHECKED_IN'));
  END IF;
END $$;

-- ตรวจข้อมูลทับกันที่มีอยู่ "ก่อน" รัน migration (ต้องได้ 0 แถว) — ไม่ใช้ booking_period เพราะยังไม่ถูกสร้าง
-- (เวลาเก็บเป็น 'HH:MM' จึงเทียบแบบข้อความได้ตรงลำดับเวลา รวมถึง '24:00')
--   SELECT a.booking_number, b.booking_number, a.court_id, a.booking_date,
--          a.start_time, a.end_time, b.start_time, b.end_time
--   FROM bookings a JOIN bookings b
--     ON a.court_id = b.court_id AND a.booking_id < b.booking_id AND a.booking_date = b.booking_date
--    AND a.start_time < b.end_time AND b.start_time < a.end_time
--   WHERE a.status IN ('PENDING_PAYMENT','PAYMENT_VERIFIED','CONFIRMED','CHECKED_IN')
--     AND b.status IN ('PENDING_PAYMENT','PAYMENT_VERIFIED','CONFIRMED','CHECKED_IN');
