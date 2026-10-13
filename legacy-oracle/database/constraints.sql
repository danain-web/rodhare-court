-- =====================================================================
-- constraints.sql : Business Rule ระดับฐานข้อมูล (CHECK / UNIQUE / INDEX / TRIGGER)
--                   + คอลัมน์ติดตามข้อมูล (created_by/updated_by FK + trigger) ทุก 21 ตาราง
-- ลำดับการรัน (SQL Developer -> Run Script F5):
--   1) schema.sql   2) constraints.sql   3) views.sql   4) seed.sql
-- รันซ้ำได้: ถ้า constraint/index มีอยู่แล้วจะข้ามไป
-- =====================================================================

CREATE OR REPLACE PROCEDURE p_ddl(p_sql VARCHAR2) IS
BEGIN
   EXECUTE IMMEDIATE p_sql;
EXCEPTION
   WHEN OTHERS THEN
      -- -2264 ชื่อ constraint ซ้ำ, -2261/-2260 มี unique/PK อยู่แล้ว, -2275 มี FK นี้แล้ว,
      -- -955 ชื่อ object ซ้ำ, -1408 index คอลัมน์ซ้ำ
      IF SQLCODE IN (-2264, -2261, -2260, -2275, -955, -1408) THEN
         NULL;
      ELSE
         RAISE;
      END IF;
END;
/

BEGIN
   -- ---------------- USERS / MEMBER_TYPES ----------------
   p_ddl('ALTER TABLE USERS ADD CONSTRAINT chk_users_active CHECK (is_active IN (0, 1))');
   p_ddl('ALTER TABLE USERS ADD CONSTRAINT chk_users_email CHECK (email LIKE ''%_@_%._%'')');
   -- ชื่อผู้ใช้/อีเมลห้ามซ้ำแบบไม่สนตัวพิมพ์เล็ก/ใหญ่ (Customer1 = customer1)
   p_ddl('CREATE UNIQUE INDEX uq_users_username_ci ON USERS (LOWER(username))');
   p_ddl('CREATE UNIQUE INDEX uq_users_email_ci ON USERS (LOWER(email))');
   p_ddl('ALTER TABLE MEMBER_TYPES ADD CONSTRAINT chk_mt_discount CHECK (discount_percent BETWEEN 0 AND 100)');
   p_ddl('ALTER TABLE MEMBER_TYPES ADD CONSTRAINT chk_mt_advance CHECK (max_advance_days > 0)');
   p_ddl('ALTER TABLE USER_SESSIONS ADD CONSTRAINT chk_sessions_expiry CHECK (expires_at > created_at)');
   p_ddl('CREATE INDEX idx_sessions_user ON USER_SESSIONS (user_id)');

   -- ---------------- COURTS / เวลาเปิด-ปิด / ราคา ----------------
   p_ddl('ALTER TABLE COURTS ADD CONSTRAINT chk_courts_status CHECK (status IN (''AVAILABLE'', ''MAINTENANCE'', ''CLOSED''))');
   p_ddl('ALTER TABLE COURTS ADD CONSTRAINT chk_courts_rate CHECK (hourly_rate >= 0)');
   p_ddl('ALTER TABLE COURTS ADD CONSTRAINT chk_courts_active CHECK (is_active IN (0, 1))');

   p_ddl('ALTER TABLE COURT_OPERATING_HOURS ADD CONSTRAINT chk_coh_dow CHECK (day_of_week BETWEEN 0 AND 6)');
   p_ddl('ALTER TABLE COURT_OPERATING_HOURS ADD CONSTRAINT chk_coh_open_fmt CHECK (REGEXP_LIKE(open_time, ''^([01][0-9]|2[0-3]):[0-5][0-9]$''))');
   p_ddl('ALTER TABLE COURT_OPERATING_HOURS ADD CONSTRAINT chk_coh_close_fmt CHECK (REGEXP_LIKE(close_time, ''^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$''))');
   p_ddl('ALTER TABLE COURT_OPERATING_HOURS ADD CONSTRAINT chk_coh_range CHECK (close_time > open_time)');
   p_ddl('ALTER TABLE COURT_OPERATING_HOURS ADD CONSTRAINT chk_coh_open CHECK (is_open IN (0, 1))');
   p_ddl('ALTER TABLE COURT_OPERATING_HOURS ADD CONSTRAINT uq_coh_court_day UNIQUE (court_id, day_of_week)');

   p_ddl('ALTER TABLE PRICING_RATES ADD CONSTRAINT chk_pr_rate CHECK (hourly_rate >= 0)');
   p_ddl('ALTER TABLE PRICING_RATES ADD CONSTRAINT chk_pr_daytype CHECK (day_type IN (''WEEKDAY'', ''WEEKEND'', ''HOLIDAY''))');
   p_ddl('ALTER TABLE PRICING_RATES ADD CONSTRAINT chk_pr_range CHECK (end_time > start_time)');
   p_ddl('ALTER TABLE PRICING_RATES ADD CONSTRAINT chk_pr_target CHECK (court_id IS NOT NULL OR sport_type_id IS NOT NULL)');
   p_ddl('CREATE INDEX idx_pr_lookup ON PRICING_RATES (court_id, sport_type_id, day_type)');
   p_ddl('CREATE INDEX idx_pr_member_type ON PRICING_RATES (member_type_id)');

   -- BR14/BR15: โปรโมชั่นต้องมีช่วงวันที่/เวลาที่ถูกต้อง
   p_ddl('ALTER TABLE PROMOTIONS ADD CONSTRAINT chk_promo_type CHECK (discount_type IN (''PERCENT'', ''FIXED''))');
   p_ddl('ALTER TABLE PROMOTIONS ADD CONSTRAINT chk_promo_value CHECK (discount_value > 0 AND (discount_type <> ''PERCENT'' OR discount_value <= 100))');
   p_ddl('ALTER TABLE PROMOTIONS ADD CONSTRAINT chk_promo_period CHECK (end_date >= start_date)');
   p_ddl('ALTER TABLE PROMOTIONS ADD CONSTRAINT chk_promo_time CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time)');
   p_ddl('ALTER TABLE PROMOTIONS ADD CONSTRAINT chk_promo_hours CHECK (min_booking_hours >= 1)');
   p_ddl('ALTER TABLE PROMOTIONS ADD CONSTRAINT chk_promo_active CHECK (is_active IN (0, 1))');

   -- ---------------- EQUIPMENT (สต็อกห้ามติดลบ / ห้ามเกินของที่มี) ----------------
   p_ddl('ALTER TABLE EQUIPMENT ADD CONSTRAINT chk_eq_total CHECK (total_quantity >= 0)');
   p_ddl('ALTER TABLE EQUIPMENT ADD CONSTRAINT chk_eq_stock CHECK (available_quantity BETWEEN 0 AND total_quantity)');
   p_ddl('ALTER TABLE EQUIPMENT ADD CONSTRAINT chk_eq_fees CHECK (rental_fee >= 0 AND deposit_fee >= 0 AND fine_rate_per_day >= 0 AND replacement_cost >= 0)');

   -- ---------------- BOOKINGS ----------------
   p_ddl('ALTER TABLE BOOKINGS ADD CONSTRAINT chk_bk_status CHECK (status IN (''PENDING_PAYMENT'', ''PAYMENT_VERIFIED'', ''CONFIRMED'', ''CHECKED_IN'', ''COMPLETED'', ''CANCELLED'', ''REFUNDED'', ''EXPIRED''))');
   p_ddl('ALTER TABLE BOOKINGS ADD CONSTRAINT chk_bk_start_fmt CHECK (REGEXP_LIKE(start_time, ''^([01][0-9]|2[0-3]):[0-5][0-9]$''))');
   p_ddl('ALTER TABLE BOOKINGS ADD CONSTRAINT chk_bk_end_fmt CHECK (REGEXP_LIKE(end_time, ''^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$''))');
   p_ddl('ALTER TABLE BOOKINGS ADD CONSTRAINT chk_bk_time CHECK (end_time > start_time)');
   p_ddl('ALTER TABLE BOOKINGS ADD CONSTRAINT chk_bk_amounts CHECK (total_court_fee >= 0 AND total_equipment_fee >= 0 AND discount_amount >= 0 AND final_amount >= 0)');
   -- ยอดสุทธิต้องคำนวณถูกเสมอ (กันข้อมูลการเงินไม่สอดคล้อง)
   p_ddl('ALTER TABLE BOOKINGS ADD CONSTRAINT chk_bk_final CHECK (final_amount = total_court_fee + total_equipment_fee - discount_amount)');
   -- BR3: การจองที่รอชำระต้องมีเวลาหมดอายุ 15 นาที
   p_ddl('ALTER TABLE BOOKINGS ADD CONSTRAINT chk_bk_hold CHECK (status <> ''PENDING_PAYMENT'' OR hold_expires_at IS NOT NULL)');
   p_ddl('ALTER TABLE BOOKINGS ADD CONSTRAINT chk_bk_cancel CHECK (status NOT IN (''CANCELLED'', ''REFUNDED'') OR cancelled_at IS NOT NULL)');
   p_ddl('ALTER TABLE BOOKINGS ADD CONSTRAINT chk_bk_checkin CHECK (status <> ''CHECKED_IN'' OR checked_in_at IS NOT NULL)');
   p_ddl('CREATE INDEX idx_bk_court_date ON BOOKINGS (court_id, booking_date, start_time)');
   p_ddl('CREATE INDEX idx_bk_user_date ON BOOKINGS (user_id, booking_date)');
   p_ddl('CREATE INDEX idx_bk_status_hold ON BOOKINGS (status, hold_expires_at)');

   p_ddl('CREATE INDEX idx_bsh_booking ON BOOKING_STATUS_HISTORY (booking_id, created_at)');

   -- ---------------- BOOKING_EQUIPMENT ----------------
   p_ddl('ALTER TABLE BOOKING_EQUIPMENT ADD CONSTRAINT chk_be_qty CHECK (quantity > 0)');
   p_ddl('ALTER TABLE BOOKING_EQUIPMENT ADD CONSTRAINT chk_be_fee CHECK (unit_rental_fee >= 0)');
   p_ddl('ALTER TABLE BOOKING_EQUIPMENT ADD CONSTRAINT chk_be_subtotal CHECK (subtotal = quantity * unit_rental_fee)');
   p_ddl('ALTER TABLE BOOKING_EQUIPMENT ADD CONSTRAINT uq_be_booking_eq UNIQUE (booking_id, equipment_id)');
   p_ddl('CREATE INDEX idx_be_equipment ON BOOKING_EQUIPMENT (equipment_id)');

   -- ---------------- EQUIPMENT_BORROWINGS / FINES ----------------
   p_ddl('ALTER TABLE EQUIPMENT_BORROWINGS ADD CONSTRAINT chk_eb_qty CHECK (quantity > 0)');
   p_ddl('ALTER TABLE EQUIPMENT_BORROWINGS ADD CONSTRAINT chk_eb_status CHECK (status IN (''BORROWED'', ''RETURNED'', ''DAMAGED'', ''LOST'', ''OVERDUE''))');
   p_ddl('ALTER TABLE EQUIPMENT_BORROWINGS ADD CONSTRAINT chk_eb_return CHECK (status IN (''BORROWED'', ''OVERDUE'') OR actual_return_at IS NOT NULL)');
   p_ddl('CREATE INDEX idx_eb_booking ON EQUIPMENT_BORROWINGS (booking_id, equipment_id)');

   p_ddl('ALTER TABLE FINES ADD CONSTRAINT chk_fn_type CHECK (fine_type IN (''LATE_RETURN'', ''DAMAGE'', ''LOSS''))');
   p_ddl('ALTER TABLE FINES ADD CONSTRAINT chk_fn_amount CHECK (amount > 0)');
   p_ddl('ALTER TABLE FINES ADD CONSTRAINT chk_fn_status CHECK (status IN (''UNPAID'', ''PAID'', ''WAIVED''))');
   p_ddl('ALTER TABLE FINES ADD CONSTRAINT chk_fn_paid CHECK (status <> ''PAID'' OR paid_at IS NOT NULL)');
   -- 1 การยืม ปรับแต่ละประเภทได้ครั้งเดียว
   p_ddl('ALTER TABLE FINES ADD CONSTRAINT uq_fn_borrow_type UNIQUE (borrowing_id, fine_type)');
   p_ddl('CREATE INDEX idx_fn_booking_status ON FINES (booking_id, status)');

   -- ---------------- PAYMENTS / RECEIPTS / REFUNDS ----------------
   p_ddl('ALTER TABLE PAYMENTS ADD CONSTRAINT chk_pay_status CHECK (status IN (''PENDING'', ''VERIFIED'', ''REJECTED''))');
   p_ddl('ALTER TABLE PAYMENTS ADD CONSTRAINT chk_pay_amount CHECK (amount > 0)');
   p_ddl('ALTER TABLE PAYMENTS ADD CONSTRAINT chk_pay_method CHECK (payment_method IN (''SLIP_TRANSFER'', ''PROMPTPAY'', ''BANK_TRANSFER'', ''CASH''))');
   -- ตรวจแล้วต้องมีเวลาตรวจเสมอ / ตรวจโดยพนักงาน (MANUAL) ต้องระบุผู้ตรวจ ส่วน AUTO ผู้ตรวจคือระบบ (verified_by = NULL)
   p_ddl('ALTER TABLE PAYMENTS ADD CONSTRAINT chk_pay_verifier CHECK (status = ''PENDING'' OR (verified_at IS NOT NULL AND (verification_method = ''AUTO'' OR verified_by IS NOT NULL)))');
   p_ddl('ALTER TABLE PAYMENTS ADD CONSTRAINT chk_pay_vmethod CHECK (verification_method IN (''AUTO'', ''MANUAL''))');
   -- BR: ไฟล์สลิปต้องเป็นรูปภาพ ขนาดไม่เกิน 5 MB
   p_ddl('ALTER TABLE PAYMENTS ADD CONSTRAINT chk_pay_slip_mime CHECK (slip_mime_type IS NULL OR slip_mime_type IN (''image/jpeg'', ''image/png'', ''image/webp''))');
   p_ddl('ALTER TABLE PAYMENTS ADD CONSTRAINT chk_pay_slip_size CHECK (slip_file_size IS NULL OR slip_file_size BETWEEN 1 AND 5242880)');
   p_ddl('ALTER TABLE PAYMENTS ADD CONSTRAINT chk_pay_reject CHECK (status <> ''REJECTED'' OR rejection_reason IS NOT NULL)');
   p_ddl('ALTER TABLE PAYMENTS ADD CONSTRAINT chk_pay_slip CHECK (payment_method = ''CASH'' OR slip_url IS NOT NULL)');
   -- 1 การจองมีการชำระที่ VERIFIED ได้รายการเดียว และมีสลิปรอตรวจได้ทีละใบ (function-based unique index)
   p_ddl('CREATE UNIQUE INDEX uq_pay_verified_booking ON PAYMENTS (CASE WHEN status = ''VERIFIED'' THEN booking_id END)');
   p_ddl('CREATE UNIQUE INDEX uq_pay_pending_booking ON PAYMENTS (CASE WHEN status = ''PENDING'' THEN booking_id END)');
   -- เลขอ้างอิงสลิปห้ามใช้ซ้ำ (ยกเว้นสลิปที่ถูกปฏิเสธไปแล้ว)
   p_ddl('CREATE UNIQUE INDEX uq_pay_slip_ref ON PAYMENTS (CASE WHEN status <> ''REJECTED'' THEN UPPER(slip_reference) END)');
   p_ddl('CREATE INDEX idx_pay_booking ON PAYMENTS (booking_id, status)');
   p_ddl('CREATE INDEX idx_pay_status_time ON PAYMENTS (status, created_at)');

   -- 1 การชำระเงิน ออกใบเสร็จได้ใบเดียว
   p_ddl('ALTER TABLE RECEIPTS ADD CONSTRAINT uq_rc_payment UNIQUE (payment_id)');
   p_ddl('ALTER TABLE RECEIPTS ADD CONSTRAINT chk_rc_amount CHECK (total_amount > 0)');

   p_ddl('ALTER TABLE REFUND_REQUESTS ADD CONSTRAINT chk_rf_status CHECK (status IN (''PENDING'', ''APPROVED'', ''REJECTED'', ''PROCESSED''))');
   p_ddl('ALTER TABLE REFUND_REQUESTS ADD CONSTRAINT chk_rf_amount CHECK (requested_amount >= 0)');
   p_ddl('ALTER TABLE REFUND_REQUESTS ADD CONSTRAINT chk_rf_pct CHECK (refund_percentage BETWEEN 0 AND 100)');
   p_ddl('ALTER TABLE REFUND_REQUESTS ADD CONSTRAINT chk_rf_review CHECK (status = ''PENDING'' OR (approved_by IS NOT NULL AND processed_at IS NOT NULL))');
   -- 1 การจองมีคำขอคืนเงินที่ยังไม่ถูกปฏิเสธได้รายการเดียว
   p_ddl('CREATE UNIQUE INDEX uq_rf_active_booking ON REFUND_REQUESTS (CASE WHEN status <> ''REJECTED'' THEN booking_id END)');
   p_ddl('CREATE INDEX idx_rf_status ON REFUND_REQUESTS (status, created_at)');

   -- ---------------- NOTIFICATIONS / AUDIT_LOGS ----------------
   p_ddl('ALTER TABLE NOTIFICATIONS ADD CONSTRAINT chk_nt_type CHECK (type IN (''INFO'', ''SUCCESS'', ''WARNING'', ''ALERT''))');
   p_ddl('ALTER TABLE NOTIFICATIONS ADD CONSTRAINT chk_nt_read CHECK (is_read IN (0, 1))');
   p_ddl('CREATE INDEX idx_nt_user ON NOTIFICATIONS (user_id, created_at)');
   p_ddl('CREATE INDEX idx_al_entity ON AUDIT_LOGS (entity_name, entity_id, created_at)');
   p_ddl('CREATE INDEX idx_al_actor ON AUDIT_LOGS (created_by, created_at)');
END;
/

-- ---------------------------------------------------------------------
-- คอลัมน์ติดตามข้อมูลของทุกตาราง (21 ตาราง)
--   FK: created_by / updated_by -> USERS (ON DELETE SET NULL)
--   Trigger: INSERT เติม created_at/created_by (จาก f_current_actor), UPDATE ห้ามแก้ created_*
--            และอัปเดต updated_at/updated_by ทุกครั้ง
-- ---------------------------------------------------------------------
BEGIN
   FOR t IN (SELECT table_name FROM user_tab_columns
              WHERE column_name = 'CREATED_BY'
                AND table_name IN ('ROLES','MEMBER_TYPES','USERS','USER_ROLES','USER_SESSIONS','SPORT_TYPES',
                                   'COURTS','COURT_OPERATING_HOURS','PRICING_RATES','PROMOTIONS','EQUIPMENT',
                                   'BOOKINGS','BOOKING_STATUS_HISTORY','BOOKING_EQUIPMENT','EQUIPMENT_BORROWINGS',
                                   'FINES','PAYMENTS','RECEIPTS','REFUND_REQUESTS','NOTIFICATIONS','AUDIT_LOGS')) LOOP
      p_ddl('ALTER TABLE ' || t.table_name || ' ADD CONSTRAINT fk_' || SUBSTR(LOWER(t.table_name), 1, 22)
            || '_cb FOREIGN KEY (created_by) REFERENCES USERS (user_id) ON DELETE SET NULL');
      p_ddl('ALTER TABLE ' || t.table_name || ' ADD CONSTRAINT fk_' || SUBSTR(LOWER(t.table_name), 1, 22)
            || '_ub FOREIGN KEY (updated_by) REFERENCES USERS (user_id) ON DELETE SET NULL');
      EXECUTE IMMEDIATE
            'CREATE OR REPLACE TRIGGER trg_' || SUBSTR(LOWER(t.table_name), 1, 20) || '_track'
         || ' BEFORE INSERT OR UPDATE ON ' || t.table_name || ' FOR EACH ROW'
         || ' BEGIN'
         || '   IF INSERTING THEN'
         || '     :NEW.created_at := NVL(:NEW.created_at, CURRENT_TIMESTAMP);'
         || '     :NEW.created_by := NVL(:NEW.created_by, f_current_actor);'
         || '     :NEW.updated_at := :NEW.created_at;'
         || '     :NEW.updated_by := :NEW.created_by;'
         || '   ELSE'
         || '     :NEW.created_at := :OLD.created_at;'
         || '     :NEW.created_by := :OLD.created_by;'
         || '     :NEW.updated_at := CURRENT_TIMESTAMP;'
         || '     :NEW.updated_by := f_current_actor;'
         || '   END IF;'
         || ' END;';
   END LOOP;
END;
/

-- ---------------------------------------------------------------------
-- BR2 ระดับฐานข้อมูล: ห้ามจองสนามเดียวกัน วันเดียวกัน ช่วงเวลาทับซ้อนกัน (ป้องกัน Overbooking)
-- Compound Trigger:
--   AFTER EACH ROW  : เก็บ booking_id ที่ถูก INSERT/UPDATE และยังถือครองสนามอยู่ (ไม่อ่าน BOOKINGS -> ไม่เจอ ORA-04091)
--   AFTER STATEMENT : ล็อกแถว COURTS ของสนามนั้น (SELECT ... FOR UPDATE) ให้ Transaction ที่จองสนามเดียวกัน
--                     ต้องรอคิว แล้วจึงตรวจช่วงเวลาทับซ้อนกับการจองอื่นที่ยังมีผล
--   กรณีสองคนกดพร้อมกัน: คนที่สองต้องรอล็อกสนามจนคนแรก COMMIT แล้วคำสั่งตรวจจะเห็นการจองของคนแรก -> ORA-20001
-- ---------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_bookings_no_overlap
FOR INSERT OR UPDATE OF court_id, booking_date, start_time, end_time, status ON BOOKINGS
COMPOUND TRIGGER

   TYPE t_id_list IS TABLE OF BOOKINGS.booking_id%TYPE INDEX BY PLS_INTEGER;
   g_ids t_id_list;

   AFTER EACH ROW IS
   BEGIN
      IF :NEW.status IN ('PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'CONFIRMED', 'CHECKED_IN') THEN
         g_ids(g_ids.COUNT + 1) := :NEW.booking_id;
      END IF;
   END AFTER EACH ROW;

   AFTER STATEMENT IS
      v_court_id   COURTS.court_id%TYPE;
      v_locked     COURTS.court_id%TYPE;
      v_conflict   BOOKINGS.booking_number%TYPE;
      v_range      VARCHAR2(20);
   BEGIN
      FOR i IN 1 .. g_ids.COUNT LOOP
         SELECT court_id INTO v_court_id FROM BOOKINGS WHERE booking_id = g_ids(i);

         -- ล็อกแถวสนาม (serialize การจองของสนามเดียวกัน)
         SELECT court_id INTO v_locked FROM COURTS WHERE court_id = v_court_id FOR UPDATE;

         SELECT MIN(o.booking_number), MIN(o.start_time || '-' || o.end_time)
           INTO v_conflict, v_range
           FROM BOOKINGS n
           JOIN BOOKINGS o
             ON o.court_id = n.court_id
            AND o.booking_date = n.booking_date
            AND o.booking_id <> n.booking_id
            AND o.start_time < n.end_time
            AND n.start_time < o.end_time
          WHERE n.booking_id = g_ids(i)
            AND o.status IN ('PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'CONFIRMED', 'CHECKED_IN');

         IF v_conflict IS NOT NULL THEN
            g_ids.DELETE;
            RAISE_APPLICATION_ERROR(-20001,
               'BR2: สนามนี้ถูกจองในช่วงเวลาดังกล่าวแล้ว ' || v_range || ' (' || v_conflict || ') (Overlapping booking)');
         END IF;
      END LOOP;
      g_ids.DELETE;
   END AFTER STATEMENT;

END trg_bookings_no_overlap;
/

-- ---------------------------------------------------------------------
-- BOOKING_STATUS_HISTORY อัตโนมัติ: ทุกครั้งที่สร้างการจองหรือสถานะเปลี่ยน จะบันทึกประวัติเอง
-- (backend เติมรายละเอียดลงใน notes ของแถวนี้ภายหลังใน Transaction เดียวกัน)
-- ---------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_bookings_status_history
AFTER INSERT OR UPDATE OF status ON BOOKINGS
FOR EACH ROW
DECLARE
   v_from VARCHAR2(30);
BEGIN
   IF INSERTING OR :OLD.status <> :NEW.status THEN
      -- INSERTING/UPDATING ใช้ได้เฉพาะใน PL/SQL จึงคำนวณก่อนแล้วค่อยส่งเข้า SQL
      v_from := CASE WHEN INSERTING THEN 'NEW' ELSE :OLD.status END;
      INSERT INTO BOOKING_STATUS_HISTORY (booking_id, status, notes, changed_by)
      VALUES (:NEW.booking_id, :NEW.status, '[AUTO] ' || v_from || ' -> ' || :NEW.status, f_current_actor);
   END IF;
END;
/

-- ---------------------------------------------------------------------
-- AUDIT TRAIL อัตโนมัติ (BR16): ทุกตาราง (ยกเว้น AUDIT_LOGS) มี trigger trg_<table>_audit
-- บันทึก INSERT / UPDATE / DELETE ทุกแถวลง AUDIT_LOGS พร้อมค่าเก่า/ค่าใหม่เป็น JSON
--   - ผู้กระทำ (user_id) มาจาก f_current_actor (CLIENT_IDENTIFIER ที่ backend ตั้ง)
--   - ไม่เก็บคอลัมน์ CLOB และข้อมูลลับ (password_hash, token_hash)
--   - การกระทำเชิงธุรกิจ (เช่น VERIFY_PAYMENT) backend บันทึกเพิ่มเองด้วยชื่อ action เฉพาะ
--   - สร้าง JSON ด้วย PL/SQL ล้วน (f_json_str) ไม่พึ่ง JSON_OBJECT จึงใช้ได้กับ Oracle ทุกเวอร์ชัน
--   - trigger ตัวใด compile ไม่ผ่าน จะถูกลบทิ้งพร้อมคำเตือน เพื่อไม่ให้ trigger ที่เสียขวางการทำงานหลัก
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION f_json_str(p VARCHAR2) RETURN VARCHAR2 DETERMINISTIC IS
BEGIN
   IF p IS NULL THEN
      RETURN 'null';
   END IF;
   RETURN '"' || REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(p, '\', '\\'), '"', '\"'),
                 CHR(10), '\n'), CHR(13), '\r'), CHR(9), '\t') || '"';
END;
/

DECLARE
   v_old_expr VARCHAR2(32767);
   v_new_expr VARCHAR2(32767);
   v_col_old  VARCHAR2(400);
   v_col_new  VARCHAR2(400);
   v_sep      VARCHAR2(20);
   v_pk       VARCHAR2(128);
   v_pk_type  VARCHAR2(128);
   v_trigger  VARCHAR2(128);
BEGIN
   FOR t IN (SELECT table_name FROM user_tables
              WHERE table_name IN ('ROLES','MEMBER_TYPES','USERS','USER_ROLES','USER_SESSIONS','SPORT_TYPES',
                                   'COURTS','COURT_OPERATING_HOURS','PRICING_RATES','PROMOTIONS','EQUIPMENT',
                                   'BOOKINGS','BOOKING_STATUS_HISTORY','BOOKING_EQUIPMENT','EQUIPMENT_BORROWINGS',
                                   'FINES','PAYMENTS','RECEIPTS','REFUND_REQUESTS','NOTIFICATIONS')
              ORDER BY table_name) LOOP
      v_old_expr := NULL;
      v_new_expr := NULL;
      v_sep := NULL;
      FOR c IN (SELECT column_name, data_type FROM user_tab_columns
                 WHERE table_name = t.table_name
                   AND data_type NOT IN ('CLOB', 'BLOB', 'NCLOB', 'LONG', 'RAW', 'LONG RAW')
                   AND column_name NOT IN ('PASSWORD_HASH', 'TOKEN_HASH')
                 ORDER BY column_id) LOOP
         -- แปลงค่าเป็นข้อความก่อน: ตัวเลข/วันเวลาใช้ TO_CHAR, ข้อความใช้ตรง ๆ
         IF c.data_type IN ('NUMBER', 'FLOAT', 'BINARY_FLOAT', 'BINARY_DOUBLE') THEN
            v_col_old := 'TO_CHAR(:OLD.' || c.column_name || ')';
            v_col_new := 'TO_CHAR(:NEW.' || c.column_name || ')';
         ELSIF c.data_type = 'DATE' OR c.data_type LIKE 'TIMESTAMP%' THEN
            v_col_old := 'TO_CHAR(:OLD.' || c.column_name || ', ''YYYY-MM-DD HH24:MI:SS'')';
            v_col_new := 'TO_CHAR(:NEW.' || c.column_name || ', ''YYYY-MM-DD HH24:MI:SS'')';
         ELSE
            v_col_old := ':OLD.' || c.column_name;
            v_col_new := ':NEW.' || c.column_name;
         END IF;
         v_old_expr := v_old_expr || v_sep || '''"' || LOWER(c.column_name) || '":'' || f_json_str(' || v_col_old || ')';
         v_new_expr := v_new_expr || v_sep || '''"' || LOWER(c.column_name) || '":'' || f_json_str(' || v_col_new || ')';
         v_sep := ' || '','' || ';
      END LOOP;

      -- entity_id = Primary Key ถ้าเป็นคอลัมน์ตัวเลขคอลัมน์เดียว
      BEGIN
         SELECT MAX(cc.column_name), MAX(tc.data_type)
           INTO v_pk, v_pk_type
           FROM user_constraints uc
           JOIN user_cons_columns cc ON cc.constraint_name = uc.constraint_name
           JOIN user_tab_columns tc ON tc.table_name = cc.table_name AND tc.column_name = cc.column_name
          WHERE uc.table_name = t.table_name AND uc.constraint_type = 'P'
         HAVING COUNT(*) = 1;
      EXCEPTION
         WHEN NO_DATA_FOUND THEN v_pk := NULL; v_pk_type := NULL;
      END;
      IF v_pk_type <> 'NUMBER' THEN v_pk := NULL; END IF;

      v_trigger := 'trg_' || SUBSTR(LOWER(t.table_name), 1, 20) || '_audit';
      BEGIN
         EXECUTE IMMEDIATE
               'CREATE OR REPLACE TRIGGER ' || v_trigger
            || ' AFTER INSERT OR UPDATE OR DELETE ON ' || t.table_name || ' FOR EACH ROW'
            || ' DECLARE v_old CLOB; v_new CLOB; v_action VARCHAR2(10); v_id NUMBER;'
            || ' BEGIN'
            || '   IF INSERTING THEN v_action := ''INSERT''; ELSIF UPDATING THEN v_action := ''UPDATE''; ELSE v_action := ''DELETE''; END IF;'
            || CASE WHEN v_pk IS NULL THEN ''
                    ELSE '   IF DELETING THEN v_id := :OLD.' || v_pk || '; ELSE v_id := :NEW.' || v_pk || '; END IF;' END
            || '   IF NOT INSERTING THEN v_old := ''{'' || ' || v_old_expr || ' || ''}''; END IF;'
            || '   IF NOT DELETING THEN v_new := ''{'' || ' || v_new_expr || ' || ''}''; END IF;'
            || '   INSERT INTO AUDIT_LOGS (user_id, action, entity_name, entity_id, old_values, new_values)'
            || '   VALUES (f_current_actor, v_action, ''' || t.table_name || ''', v_id, v_old, v_new);'
            || ' END;';
      EXCEPTION
         WHEN OTHERS THEN
            -- compile ไม่ผ่าน: ลบทิ้ง ไม่ให้ trigger ที่เสียทำให้ INSERT/UPDATE ของตารางนี้ล้มเหลว
            BEGIN
               EXECUTE IMMEDIATE 'DROP TRIGGER ' || v_trigger;
            EXCEPTION
               WHEN OTHERS THEN NULL;
            END;
            DBMS_OUTPUT.PUT_LINE('WARNING: audit trigger ' || v_trigger || ' skipped: ' || SQLERRM);
      END;
   END LOOP;
END;
/

DROP PROCEDURE p_ddl;
