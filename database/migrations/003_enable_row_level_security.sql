-- =====================================================================
-- Migration 003: เปิด Row Level Security ทุกตารางใน schema public
-- ---------------------------------------------------------------------
-- เหตุผล: Supabase เปิด REST API (PostgREST) ให้ทุกตารางใน public โดยอัตโนมัติ
--         ถ้าไม่เปิด RLS ใครที่มี anon key เรียกอ่าน/เขียนตารางได้ตรง ๆ (รวมถึง users.password_hash)
-- ผลกระทบ: เปิด RLS โดย "ไม่มี policy" = role anon / authenticated ถูกปฏิเสธทั้งหมด
--          Backend ต่อด้วย role เจ้าของตาราง (postgres) จึงไม่ถูกบังคับ RLS → ระบบทำงานเหมือนเดิม
--          (ระบบนี้ไม่ได้ใช้ Supabase client ฝั่งหน้าเว็บ ทุกคำขอผ่าน Backend API)
-- รันได้ซ้ำ (idempotent) · ไม่ลบข้อมูล
-- ตรวจผลบน Supabase: Dashboard → Advisors → Security Advisor ต้องไม่มี "RLS Disabled in Public"
-- =====================================================================

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- ตรวจว่าทุกตารางเปิดแล้ว (ต้องได้ 0 แถว):
--   SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
