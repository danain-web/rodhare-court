-- =====================================================================
-- Migration 001: การชำระเงินที่ยืนยันแล้วต้องมีเจ้าหน้าที่เป็นผู้ยืนยันเสมอ
-- ---------------------------------------------------------------------
-- เหตุผล: ระบบไม่มี API ของธนาคารยืนยันยอดเงินเข้าบัญชี การ "อนุมัติอัตโนมัติ" จากการตรวจไฟล์/ยอด/เลขอ้างอิง
--         จึงไม่ใช่หลักฐานการชำระเงิน — บังคับที่ระดับฐานข้อมูลอีกชั้น เผื่อโค้ดผิดพลาด
-- NOT VALID: บังคับกับแถวใหม่/แถวที่แก้ไขเท่านั้น ไม่ตรวจข้อมูลเก่า (ไม่ล้ม migration ถ้ามีแถว AUTO เดิม)
--            ตรวจข้อมูลเก่าได้ด้วย query ท้ายไฟล์ แล้วค่อย VALIDATE เมื่อจัดการเสร็จ
-- รันได้ซ้ำ (idempotent) · ไม่ลบข้อมูล
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางไฟล์นี้ → Run
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pay_verified_by_staff') THEN
    ALTER TABLE payments
      ADD CONSTRAINT chk_pay_verified_by_staff
      CHECK (status <> 'VERIFIED' OR (verification_method = 'MANUAL' AND verified_by IS NOT NULL))
      NOT VALID;
  END IF;
END $$;

-- ตรวจข้อมูลเก่าที่ถูกอนุมัติอัตโนมัติก่อน migration นี้ (ควรให้เจ้าหน้าที่ตรวจย้อนหลัง):
--   SELECT payment_id, booking_id, amount, slip_reference, verified_at
--   FROM payments WHERE status = 'VERIFIED' AND (verification_method = 'AUTO' OR verified_by IS NULL);
-- เมื่อตรวจ/แก้ครบแล้ว:
--   ALTER TABLE payments VALIDATE CONSTRAINT chk_pay_verified_by_staff;
