-- =====================================================================
-- FILE: supabase_schema.sql
-- PostgreSQL Schema สำหรับ Supabase
-- ระบบจองสนามกีฬา (Online Sports Court Booking System)
--
-- วิธีใช้: รันไฟล์นี้ใน Supabase Dashboard → SQL Editor
-- ลำดับการรัน: 1) supabase_schema.sql  2) supabase_seed.sql
-- =====================================================================

-- =====================================================================
-- ล้างตารางเก่า (ถ้ามี) - ลำดับ reverse FK dependency
-- =====================================================================
DROP TABLE IF EXISTS audit_logs              CASCADE;
DROP TABLE IF EXISTS notifications           CASCADE;
DROP TABLE IF EXISTS refund_requests         CASCADE;
DROP TABLE IF EXISTS receipts                CASCADE;
DROP TABLE IF EXISTS payments                CASCADE;
DROP TABLE IF EXISTS fines                   CASCADE;
DROP TABLE IF EXISTS equipment_borrowings    CASCADE;
DROP TABLE IF EXISTS booking_equipment       CASCADE;
DROP TABLE IF EXISTS booking_status_history  CASCADE;
DROP TABLE IF EXISTS bookings                CASCADE;
DROP TABLE IF EXISTS equipment               CASCADE;
DROP TABLE IF EXISTS promotions              CASCADE;
DROP TABLE IF EXISTS pricing_rates           CASCADE;
DROP TABLE IF EXISTS court_operating_hours   CASCADE;
DROP TABLE IF EXISTS courts                  CASCADE;
DROP TABLE IF EXISTS sport_types             CASCADE;
DROP TABLE IF EXISTS user_sessions           CASCADE;
DROP TABLE IF EXISTS user_roles              CASCADE;
DROP TABLE IF EXISTS users                   CASCADE;
DROP TABLE IF EXISTS member_types            CASCADE;
DROP TABLE IF EXISTS roles                   CASCADE;

-- =====================================================================
-- 1. ROLES
-- =====================================================================
CREATE TABLE roles (
    role_id     SERIAL PRIMARY KEY,
    role_name   VARCHAR(50)  NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by  INTEGER,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by  INTEGER
);

-- =====================================================================
-- 2. MEMBER_TYPES
-- =====================================================================
CREATE TABLE member_types (
    member_type_id   SERIAL PRIMARY KEY,
    type_name        VARCHAR(50)    NOT NULL UNIQUE,   -- EXTERNAL, STUDENT, PERSONNEL
    display_name     VARCHAR(100),
    discount_percent NUMERIC(5,2)   NOT NULL DEFAULT 0.00,
    max_advance_days INTEGER        NOT NULL DEFAULT 30,
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    created_by       INTEGER,
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_by       INTEGER,

    CONSTRAINT chk_mt_discount CHECK (discount_percent BETWEEN 0 AND 100),
    CONSTRAINT chk_mt_advance  CHECK (max_advance_days > 0)
);

-- =====================================================================
-- 3. USERS
-- =====================================================================
CREATE TABLE users (
    user_id       SERIAL PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    email         VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name    VARCHAR(100) NOT NULL,
    last_name     VARCHAR(100) NOT NULL,
    phone         VARCHAR(20),
    member_type_id INTEGER     NOT NULL DEFAULT 1,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by    INTEGER,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by    INTEGER,

    CONSTRAINT fk_users_member_type FOREIGN KEY (member_type_id) REFERENCES member_types(member_type_id),
    -- ตรวจรูปแบบ email เบื้องต้น
    CONSTRAINT chk_users_email CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$')
);

-- Case-insensitive unique index สำหรับ username และ email
CREATE UNIQUE INDEX uq_users_username_ci ON users (LOWER(username));
CREATE UNIQUE INDEX uq_users_email_ci    ON users (LOWER(email));

-- =====================================================================
-- 4. USER_ROLES
-- =====================================================================
CREATE TABLE user_roles (
    user_id    INTEGER NOT NULL,
    role_id    INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by INTEGER,

    PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles(role_id)
);

-- =====================================================================
-- 5. USER_SESSIONS (เก็บไว้ในกรณีต้องการ Revoke Token ในอนาคต)
-- หมายเหตุ: ระบบนี้ใช้ JWT ใน httpOnly Cookie เป็นหลัก ตารางนี้ใช้สำหรับ optional session tracking
-- =====================================================================
CREATE TABLE user_sessions (
    session_id VARCHAR(100) PRIMARY KEY,
    user_id    INTEGER      NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    ip_address VARCHAR(50),
    user_agent VARCHAR(255),
    expires_at TIMESTAMPTZ  NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by INTEGER,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by INTEGER,

    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_sessions_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_sessions_user ON user_sessions (user_id);

-- =====================================================================
-- 6. SPORT_TYPES
-- =====================================================================
CREATE TABLE sport_types (
    sport_type_id SERIAL PRIMARY KEY,
    name          VARCHAR(50)  NOT NULL UNIQUE,
    description   VARCHAR(255),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by    INTEGER,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by    INTEGER
);

-- =====================================================================
-- 7. COURTS
-- image_url เป็น TEXT เพื่อเก็บ URL จาก Supabase Storage (แทน base64/CLOB เดิม)
-- =====================================================================
CREATE TABLE courts (
    court_id         SERIAL PRIMARY KEY,
    sport_type_id    INTEGER      NOT NULL,
    name             VARCHAR(100) NOT NULL,
    code             VARCHAR(20)  NOT NULL UNIQUE,
    location_details VARCHAR(255),
    hourly_rate      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    image_url        TEXT,         -- URL จาก Supabase Storage
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    status           VARCHAR(20)  NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE, MAINTENANCE, CLOSED
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by       INTEGER,
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by       INTEGER,

    CONSTRAINT fk_courts_sport_type FOREIGN KEY (sport_type_id) REFERENCES sport_types(sport_type_id),
    CONSTRAINT chk_courts_status CHECK (status IN ('AVAILABLE', 'MAINTENANCE', 'CLOSED')),
    CONSTRAINT chk_courts_rate   CHECK (hourly_rate >= 0)
);

-- =====================================================================
-- 8. COURT_OPERATING_HOURS
-- =====================================================================
CREATE TABLE court_operating_hours (
    operating_hour_id SERIAL PRIMARY KEY,
    court_id          INTEGER     NOT NULL,
    day_of_week       SMALLINT    NOT NULL, -- 0=Sunday, 1=Monday, ..., 6=Saturday
    open_time         VARCHAR(5)  NOT NULL, -- HH:MM (24hr)
    close_time        VARCHAR(5)  NOT NULL, -- HH:MM (24hr)
    is_open           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by        INTEGER,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by        INTEGER,

    CONSTRAINT fk_coh_court    FOREIGN KEY (court_id) REFERENCES courts(court_id) ON DELETE CASCADE,
    CONSTRAINT chk_coh_dow     CHECK (day_of_week BETWEEN 0 AND 6),
    CONSTRAINT chk_coh_range   CHECK (close_time > open_time),
    CONSTRAINT uq_coh_court_day UNIQUE (court_id, day_of_week)
);

-- =====================================================================
-- 9. PRICING_RATES
-- =====================================================================
CREATE TABLE pricing_rates (
    rate_id        SERIAL PRIMARY KEY,
    court_id       INTEGER,
    sport_type_id  INTEGER,
    member_type_id INTEGER,
    day_type       VARCHAR(20)   NOT NULL DEFAULT 'WEEKDAY', -- WEEKDAY, WEEKEND, HOLIDAY
    start_time     VARCHAR(5)    NOT NULL, -- HH:MM
    end_time       VARCHAR(5)    NOT NULL, -- HH:MM
    hourly_rate    NUMERIC(10,2) NOT NULL,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by     INTEGER,
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_by     INTEGER,

    CONSTRAINT fk_pr_court       FOREIGN KEY (court_id)       REFERENCES courts(court_id)       ON DELETE CASCADE,
    CONSTRAINT fk_pr_sport       FOREIGN KEY (sport_type_id)  REFERENCES sport_types(sport_type_id) ON DELETE CASCADE,
    CONSTRAINT fk_pr_member_type FOREIGN KEY (member_type_id) REFERENCES member_types(member_type_id) ON DELETE CASCADE,
    CONSTRAINT chk_pr_rate       CHECK (hourly_rate >= 0),
    CONSTRAINT chk_pr_daytype    CHECK (day_type IN ('WEEKDAY', 'WEEKEND', 'HOLIDAY')),
    CONSTRAINT chk_pr_range      CHECK (end_time > start_time),
    CONSTRAINT chk_pr_target     CHECK (court_id IS NOT NULL OR sport_type_id IS NOT NULL)
);

CREATE INDEX idx_pr_lookup      ON pricing_rates (court_id, sport_type_id, day_type);
CREATE INDEX idx_pr_member_type ON pricing_rates (member_type_id);

-- =====================================================================
-- 10. PROMOTIONS
-- =====================================================================
CREATE TABLE promotions (
    promotion_id      SERIAL PRIMARY KEY,
    code              VARCHAR(50)   NOT NULL UNIQUE,
    title             VARCHAR(100)  NOT NULL,
    discount_type     VARCHAR(20)   NOT NULL, -- PERCENT, FIXED
    discount_value    NUMERIC(10,2) NOT NULL,
    min_booking_hours INTEGER       NOT NULL DEFAULT 1,
    start_date        DATE          NOT NULL,
    end_date          DATE          NOT NULL,
    start_time        VARCHAR(5),   -- HH:MM (ถ้ามี เฉพาะช่วงเวลา)
    end_time          VARCHAR(5),
    is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by        INTEGER,
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_by        INTEGER,

    CONSTRAINT chk_promo_type   CHECK (discount_type IN ('PERCENT', 'FIXED')),
    CONSTRAINT chk_promo_value  CHECK (discount_value > 0 AND (discount_type <> 'PERCENT' OR discount_value <= 100)),
    CONSTRAINT chk_promo_period CHECK (end_date >= start_date),
    CONSTRAINT chk_promo_time   CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time),
    CONSTRAINT chk_promo_hours  CHECK (min_booking_hours >= 1)
);

-- =====================================================================
-- 11. EQUIPMENT
-- =====================================================================
CREATE TABLE equipment (
    equipment_id       SERIAL PRIMARY KEY,
    sport_type_id      INTEGER       NOT NULL,
    name               VARCHAR(100)  NOT NULL,
    total_quantity     INTEGER       NOT NULL,
    available_quantity INTEGER       NOT NULL,
    rental_fee         NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    deposit_fee        NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    fine_rate_per_day  NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    replacement_cost   NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by         INTEGER,
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_by         INTEGER,

    CONSTRAINT fk_eq_sport_type FOREIGN KEY (sport_type_id) REFERENCES sport_types(sport_type_id),
    CONSTRAINT chk_eq_total     CHECK (total_quantity >= 0),
    CONSTRAINT chk_eq_stock     CHECK (available_quantity BETWEEN 0 AND total_quantity),
    CONSTRAINT chk_eq_fees      CHECK (rental_fee >= 0 AND deposit_fee >= 0 AND fine_rate_per_day >= 0 AND replacement_cost >= 0)
);

-- =====================================================================
-- 12. BOOKINGS
-- =====================================================================
CREATE TABLE bookings (
    booking_id           SERIAL PRIMARY KEY,
    booking_number       VARCHAR(50)   NOT NULL UNIQUE,
    user_id              INTEGER       NOT NULL,
    court_id             INTEGER       NOT NULL,
    booking_date         DATE          NOT NULL,
    start_time           VARCHAR(5)    NOT NULL, -- HH:MM
    end_time             VARCHAR(5)    NOT NULL, -- HH:MM
    total_court_fee      NUMERIC(10,2) NOT NULL,
    total_equipment_fee  NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    discount_amount      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    final_amount         NUMERIC(10,2) NOT NULL,
    status               VARCHAR(30)   NOT NULL DEFAULT 'PENDING_PAYMENT',
    -- สถานะ: PENDING_PAYMENT, PAYMENT_VERIFIED, CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED, REFUNDED, EXPIRED
    promotion_id         INTEGER,
    hold_expires_at      TIMESTAMPTZ,  -- BR3: ต้องส่งสลิปภายใน 15 นาที
    checked_in_at        TIMESTAMPTZ,
    checked_in_by        INTEGER,
    cancelled_at         TIMESTAMPTZ,
    cancel_reason        VARCHAR(255),
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by           INTEGER,
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_by           INTEGER,

    CONSTRAINT fk_bk_user       FOREIGN KEY (user_id)       REFERENCES users(user_id),
    CONSTRAINT fk_bk_court      FOREIGN KEY (court_id)      REFERENCES courts(court_id),
    CONSTRAINT fk_bk_promotion  FOREIGN KEY (promotion_id)  REFERENCES promotions(promotion_id),
    CONSTRAINT fk_bk_checkin_by FOREIGN KEY (checked_in_by) REFERENCES users(user_id),

    CONSTRAINT chk_bk_status  CHECK (status IN ('PENDING_PAYMENT','PAYMENT_VERIFIED','CONFIRMED','CHECKED_IN','COMPLETED','CANCELLED','REFUNDED','EXPIRED')),
    CONSTRAINT chk_bk_time    CHECK (end_time > start_time),
    CONSTRAINT chk_bk_amounts CHECK (total_court_fee >= 0 AND total_equipment_fee >= 0 AND discount_amount >= 0 AND final_amount >= 0),
    CONSTRAINT chk_bk_final   CHECK (final_amount = total_court_fee + total_equipment_fee - discount_amount),
    CONSTRAINT chk_bk_hold    CHECK (status <> 'PENDING_PAYMENT' OR hold_expires_at IS NOT NULL),
    CONSTRAINT chk_bk_cancel  CHECK (status NOT IN ('CANCELLED','REFUNDED') OR cancelled_at IS NOT NULL),
    CONSTRAINT chk_bk_checkin CHECK (status <> 'CHECKED_IN' OR checked_in_at IS NOT NULL)
);

CREATE INDEX idx_bk_court_date  ON bookings (court_id, booking_date, start_time);
CREATE INDEX idx_bk_user_date   ON bookings (user_id, booking_date);
CREATE INDEX idx_bk_status_hold ON bookings (status, hold_expires_at);

-- =====================================================================
-- 13. BOOKING_STATUS_HISTORY
-- =====================================================================
CREATE TABLE booking_status_history (
    history_id SERIAL PRIMARY KEY,
    booking_id INTEGER      NOT NULL,
    status     VARCHAR(30)  NOT NULL,
    notes      VARCHAR(500),
    changed_by INTEGER,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by INTEGER,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by INTEGER,

    CONSTRAINT fk_bsh_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
    CONSTRAINT fk_bsh_user    FOREIGN KEY (changed_by) REFERENCES users(user_id)
);

CREATE INDEX idx_bsh_booking ON booking_status_history (booking_id, created_at);

-- =====================================================================
-- 14. BOOKING_EQUIPMENT
-- =====================================================================
CREATE TABLE booking_equipment (
    booking_equipment_id SERIAL PRIMARY KEY,
    booking_id           INTEGER       NOT NULL,
    equipment_id         INTEGER       NOT NULL,
    quantity             INTEGER       NOT NULL,
    unit_rental_fee      NUMERIC(10,2) NOT NULL,
    subtotal             NUMERIC(10,2) NOT NULL,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by           INTEGER,
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_by           INTEGER,

    CONSTRAINT fk_be_booking    FOREIGN KEY (booking_id)   REFERENCES bookings(booking_id)   ON DELETE CASCADE,
    CONSTRAINT fk_be_equipment  FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id),
    CONSTRAINT chk_be_qty       CHECK (quantity > 0),
    CONSTRAINT chk_be_fee       CHECK (unit_rental_fee >= 0),
    CONSTRAINT chk_be_subtotal  CHECK (subtotal = quantity * unit_rental_fee),
    CONSTRAINT uq_be_booking_eq UNIQUE (booking_id, equipment_id)
);

CREATE INDEX idx_be_equipment ON booking_equipment (equipment_id);

-- =====================================================================
-- 15. EQUIPMENT_BORROWINGS
-- =====================================================================
CREATE TABLE equipment_borrowings (
    borrowing_id       SERIAL PRIMARY KEY,
    booking_id         INTEGER     NOT NULL,
    equipment_id       INTEGER     NOT NULL,
    quantity           INTEGER     NOT NULL,
    borrowed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_return_at TIMESTAMPTZ NOT NULL,
    actual_return_at   TIMESTAMPTZ,
    status             VARCHAR(20) NOT NULL DEFAULT 'BORROWED', -- BORROWED, RETURNED, DAMAGED, LOST, OVERDUE
    condition_notes    VARCHAR(255),
    staff_user_id      INTEGER,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by         INTEGER,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by         INTEGER,

    CONSTRAINT fk_eb_booking   FOREIGN KEY (booking_id)   REFERENCES bookings(booking_id)   ON DELETE CASCADE,
    CONSTRAINT fk_eb_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id),
    CONSTRAINT fk_eb_staff     FOREIGN KEY (staff_user_id) REFERENCES users(user_id),
    CONSTRAINT chk_eb_qty      CHECK (quantity > 0),
    CONSTRAINT chk_eb_status   CHECK (status IN ('BORROWED','RETURNED','DAMAGED','LOST','OVERDUE')),
    CONSTRAINT chk_eb_return   CHECK (status IN ('BORROWED','OVERDUE') OR actual_return_at IS NOT NULL)
);

CREATE INDEX idx_eb_booking ON equipment_borrowings (booking_id, equipment_id);

-- =====================================================================
-- 16. FINES
-- =====================================================================
CREATE TABLE fines (
    fine_id      SERIAL PRIMARY KEY,
    borrowing_id INTEGER,
    booking_id   INTEGER       NOT NULL,
    fine_type    VARCHAR(30)   NOT NULL, -- LATE_RETURN, DAMAGE, LOSS
    amount       NUMERIC(10,2) NOT NULL,
    reason       VARCHAR(255),
    status       VARCHAR(20)   NOT NULL DEFAULT 'UNPAID', -- UNPAID, PAID, WAIVED
    paid_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by   INTEGER,
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_by   INTEGER,

    CONSTRAINT fk_fn_borrowing FOREIGN KEY (borrowing_id) REFERENCES equipment_borrowings(borrowing_id),
    CONSTRAINT fk_fn_booking   FOREIGN KEY (booking_id)   REFERENCES bookings(booking_id),
    CONSTRAINT chk_fn_type     CHECK (fine_type IN ('LATE_RETURN','DAMAGE','LOSS')),
    CONSTRAINT chk_fn_amount   CHECK (amount > 0),
    CONSTRAINT chk_fn_status   CHECK (status IN ('UNPAID','PAID','WAIVED')),
    CONSTRAINT chk_fn_paid     CHECK (status <> 'PAID' OR paid_at IS NOT NULL),
    CONSTRAINT uq_fn_borrow_type UNIQUE (borrowing_id, fine_type)
);

CREATE INDEX idx_fn_booking_status ON fines (booking_id, status);

-- =====================================================================
-- 17. PAYMENTS
-- slip_url เป็น TEXT เก็บ URL จาก Supabase Storage (ไม่เก็บลง disk อีกต่อไป)
-- =====================================================================
CREATE TABLE payments (
    payment_id          SERIAL PRIMARY KEY,
    booking_id          INTEGER       NOT NULL,
    payment_method      VARCHAR(30)   NOT NULL DEFAULT 'SLIP_TRANSFER', -- SLIP_TRANSFER, PROMPTPAY, BANK_TRANSFER, CASH
    amount              NUMERIC(10,2) NOT NULL,
    slip_url            TEXT,         -- URL จาก Supabase Storage (แทนการเก็บไฟล์ลง disk)
    slip_reference      VARCHAR(50),  -- เลขอ้างอิงสลิป (กันใช้ซ้ำ)
    slip_mime_type      VARCHAR(50),  -- image/jpeg, image/png, image/webp
    slip_file_size      INTEGER,      -- ขนาดไฟล์ (bytes) ไม่เกิน 5MB
    status              VARCHAR(20)   NOT NULL DEFAULT 'PENDING', -- PENDING, VERIFIED, REJECTED
    verification_method VARCHAR(10)   NOT NULL DEFAULT 'MANUAL', -- AUTO, MANUAL
    review_reason       VARCHAR(255),
    verified_by         INTEGER,
    verified_at         TIMESTAMPTZ,
    rejection_reason    VARCHAR(255),
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by          INTEGER,
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_by          INTEGER,

    CONSTRAINT fk_pay_booking  FOREIGN KEY (booking_id)  REFERENCES bookings(booking_id),
    CONSTRAINT fk_pay_verifier FOREIGN KEY (verified_by) REFERENCES users(user_id),

    CONSTRAINT chk_pay_status    CHECK (status IN ('PENDING','VERIFIED','REJECTED')),
    CONSTRAINT chk_pay_amount    CHECK (amount > 0),
    CONSTRAINT chk_pay_method    CHECK (payment_method IN ('SLIP_TRANSFER','PROMPTPAY','BANK_TRANSFER','CASH')),
    CONSTRAINT chk_pay_vmethod   CHECK (verification_method IN ('AUTO','MANUAL')),
    CONSTRAINT chk_pay_verifier  CHECK (status = 'PENDING' OR (verified_at IS NOT NULL AND (verification_method = 'AUTO' OR verified_by IS NOT NULL))),
    CONSTRAINT chk_pay_slip_mime CHECK (slip_mime_type IS NULL OR slip_mime_type IN ('image/jpeg','image/png','image/webp')),
    CONSTRAINT chk_pay_slip_size CHECK (slip_file_size IS NULL OR slip_file_size BETWEEN 1 AND 5242880),
    CONSTRAINT chk_pay_reject    CHECK (status <> 'REJECTED' OR rejection_reason IS NOT NULL),
    CONSTRAINT chk_pay_slip      CHECK (payment_method = 'CASH' OR slip_url IS NOT NULL)
);

-- 1 การจองมีการชำระที่ VERIFIED ได้รายการเดียว
-- ใช้ Partial Unique Index แทน function-based index ของ Oracle
CREATE UNIQUE INDEX uq_pay_verified_booking ON payments (booking_id) WHERE status = 'VERIFIED';
CREATE UNIQUE INDEX uq_pay_pending_booking  ON payments (booking_id) WHERE status = 'PENDING';
-- เลขอ้างอิงสลิปห้ามซ้ำ (ยกเว้น REJECTED)
CREATE UNIQUE INDEX uq_pay_slip_ref ON payments (UPPER(slip_reference)) WHERE status <> 'REJECTED' AND slip_reference IS NOT NULL;
CREATE INDEX idx_pay_booking     ON payments (booking_id, status);
CREATE INDEX idx_pay_status_time ON payments (status, created_at);

-- =====================================================================
-- 18. RECEIPTS
-- =====================================================================
CREATE TABLE receipts (
    receipt_id     SERIAL PRIMARY KEY,
    receipt_number VARCHAR(50)   NOT NULL UNIQUE,
    booking_id     INTEGER       NOT NULL,
    payment_id     INTEGER       NOT NULL UNIQUE, -- 1 payment = 1 receipt
    total_amount   NUMERIC(10,2) NOT NULL,
    issued_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    pdf_url        TEXT,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by     INTEGER,
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_by     INTEGER,

    CONSTRAINT fk_rc_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
    CONSTRAINT fk_rc_payment FOREIGN KEY (payment_id) REFERENCES payments(payment_id),
    CONSTRAINT chk_rc_amount CHECK (total_amount > 0)
);

-- =====================================================================
-- 19. REFUND_REQUESTS
-- =====================================================================
CREATE TABLE refund_requests (
    refund_id         SERIAL PRIMARY KEY,
    booking_id        INTEGER       NOT NULL,
    user_id           INTEGER       NOT NULL,
    requested_amount  NUMERIC(10,2) NOT NULL,
    refund_percentage NUMERIC(5,2)  NOT NULL DEFAULT 100.00,
    status            VARCHAR(20)   NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, PROCESSED
    reason            VARCHAR(255),
    review_note       VARCHAR(255),
    approved_by       INTEGER,
    processed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by        INTEGER,
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_by        INTEGER,

    CONSTRAINT fk_rf_booking  FOREIGN KEY (booking_id)  REFERENCES bookings(booking_id),
    CONSTRAINT fk_rf_user     FOREIGN KEY (user_id)     REFERENCES users(user_id),
    CONSTRAINT fk_rf_approver FOREIGN KEY (approved_by) REFERENCES users(user_id),
    CONSTRAINT chk_rf_status  CHECK (status IN ('PENDING','APPROVED','REJECTED','PROCESSED')),
    CONSTRAINT chk_rf_amount  CHECK (requested_amount >= 0),
    CONSTRAINT chk_rf_pct     CHECK (refund_percentage BETWEEN 0 AND 100),
    CONSTRAINT chk_rf_review  CHECK (status = 'PENDING' OR (approved_by IS NOT NULL AND processed_at IS NOT NULL))
);

-- 1 การจองมีคำขอคืนเงินที่ active ได้รายการเดียว
CREATE UNIQUE INDEX uq_rf_active_booking ON refund_requests (booking_id) WHERE status <> 'REJECTED';
CREATE INDEX idx_rf_status ON refund_requests (status, created_at);

-- =====================================================================
-- 20. NOTIFICATIONS (In-App Notification ตาม BR7)
-- =====================================================================
CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id         INTEGER      NOT NULL,
    booking_id      INTEGER,
    title           VARCHAR(100) NOT NULL,
    message         VARCHAR(500) NOT NULL,
    type            VARCHAR(30)  NOT NULL DEFAULT 'INFO', -- INFO, SUCCESS, WARNING, ALERT
    is_read         BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by      INTEGER,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by      INTEGER,

    CONSTRAINT fk_nt_user    FOREIGN KEY (user_id)    REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_nt_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
    CONSTRAINT chk_nt_type   CHECK (type IN ('INFO','SUCCESS','WARNING','ALERT'))
);

CREATE INDEX idx_nt_user ON notifications (user_id, created_at DESC);

-- =====================================================================
-- 21. AUDIT_LOGS (BR16 - ประวัติการกระทำทุกอย่างในระบบ)
-- หมายเหตุ: ใน PostgreSQL ไม่ใช้ Oracle Trigger แต่ให้ Backend บันทึกแทน
-- old_values / new_values เก็บเป็น JSONB เพื่อ query ง่ายขึ้น
-- =====================================================================
CREATE TABLE audit_logs (
    log_id      SERIAL PRIMARY KEY,
    user_id     INTEGER,
    action      VARCHAR(100) NOT NULL, -- INSERT, UPDATE, DELETE, LOGIN, VERIFY_PAYMENT, ...
    entity_name VARCHAR(50)  NOT NULL,
    entity_id   INTEGER,
    old_values  JSONB,                 -- ค่าเก่าก่อนแก้ไข
    new_values  JSONB,                 -- ค่าใหม่หลังแก้ไข
    ip_address  VARCHAR(50),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by  INTEGER,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by  INTEGER,

    CONSTRAINT fk_al_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX idx_al_entity ON audit_logs (entity_name, entity_id, created_at DESC);
CREATE INDEX idx_al_actor  ON audit_logs (user_id, created_at DESC);

-- =====================================================================
-- FK สำหรับ created_by / updated_by ทุกตาราง (อ้างอิง users)
-- =====================================================================
ALTER TABLE roles                  ADD CONSTRAINT fk_roles_cb                  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE roles                  ADD CONSTRAINT fk_roles_ub                  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE member_types           ADD CONSTRAINT fk_member_types_cb           FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE member_types           ADD CONSTRAINT fk_member_types_ub           FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE users                  ADD CONSTRAINT fk_users_cb                  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE users                  ADD CONSTRAINT fk_users_ub                  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE user_roles             ADD CONSTRAINT fk_user_roles_cb             FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE user_roles             ADD CONSTRAINT fk_user_roles_ub             FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE user_sessions          ADD CONSTRAINT fk_user_sessions_cb          FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE user_sessions          ADD CONSTRAINT fk_user_sessions_ub          FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE sport_types            ADD CONSTRAINT fk_sport_types_cb            FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE sport_types            ADD CONSTRAINT fk_sport_types_ub            FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE courts                 ADD CONSTRAINT fk_courts_cb                 FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE courts                 ADD CONSTRAINT fk_courts_ub                 FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE court_operating_hours  ADD CONSTRAINT fk_court_op_hours_cb         FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE court_operating_hours  ADD CONSTRAINT fk_court_op_hours_ub         FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE pricing_rates          ADD CONSTRAINT fk_pricing_rates_cb          FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE pricing_rates          ADD CONSTRAINT fk_pricing_rates_ub          FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE promotions             ADD CONSTRAINT fk_promotions_cb             FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE promotions             ADD CONSTRAINT fk_promotions_ub             FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE equipment              ADD CONSTRAINT fk_equipment_cb              FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE equipment              ADD CONSTRAINT fk_equipment_ub              FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE bookings               ADD CONSTRAINT fk_bookings_cb               FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE bookings               ADD CONSTRAINT fk_bookings_ub               FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE booking_status_history ADD CONSTRAINT fk_booking_status_history_cb FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE booking_status_history ADD CONSTRAINT fk_booking_status_history_ub FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE booking_equipment      ADD CONSTRAINT fk_booking_equipment_cb      FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE booking_equipment      ADD CONSTRAINT fk_booking_equipment_ub      FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE equipment_borrowings   ADD CONSTRAINT fk_equipment_borrowings_cb   FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE equipment_borrowings   ADD CONSTRAINT fk_equipment_borrowings_ub   FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE fines                  ADD CONSTRAINT fk_fines_cb                  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE fines                  ADD CONSTRAINT fk_fines_ub                  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE payments               ADD CONSTRAINT fk_payments_cb               FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE payments               ADD CONSTRAINT fk_payments_ub               FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE receipts               ADD CONSTRAINT fk_receipts_cb               FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE receipts               ADD CONSTRAINT fk_receipts_ub               FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE refund_requests        ADD CONSTRAINT fk_refund_requests_cb        FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE refund_requests        ADD CONSTRAINT fk_refund_requests_ub        FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE notifications          ADD CONSTRAINT fk_notifications_cb          FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE notifications          ADD CONSTRAINT fk_notifications_ub          FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE audit_logs             ADD CONSTRAINT fk_audit_logs_cb             FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE audit_logs             ADD CONSTRAINT fk_audit_logs_ub             FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;
