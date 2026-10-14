# legacy-oracle — ไฟล์ของเวอร์ชัน Oracle เดิม (เก็บไว้อ้างอิงเท่านั้น)

โฟลเดอร์นี้เก็บไฟล์จากเวอร์ชันแรกของโปรเจกต์ที่รันบน **Oracle Database XE** บนเครื่อง local
ก่อนย้ายมาเป็น **Supabase (PostgreSQL) + Render + Vercel** — ระบบปัจจุบัน **ไม่ได้ใช้ไฟล์ในโฟลเดอร์นี้แล้ว**

| ไฟล์ | เดิมใช้ทำอะไร | ปัจจุบันใช้แทนด้วย |
|---|---|---|
| `database/schema.sql`, `constraints.sql`, `views.sql`, `seed.sql`, `create_user.sql`, `reset_all.sql` | สร้างตาราง/ข้อมูลตั้งต้นใน Oracle | `database/supabase_schema.sql`, `database/supabase_seed.sql` |
| `database/demo_queries.sql` | Query โชว์ข้อมูลตอน Demo (Oracle SQL Developer) | Supabase → SQL Editor / Table Editor |
| `reset_demo.bat` | ล้างข้อมูลด้วย sqlplus | รัน `supabase_schema.sql` + `supabase_seed.sql` ใหม่ (ดู `USER_GUIDE.md` ข้อ 3.6) |
| `start_preview.bat` | เปิดหน้าเว็บแบบไม่มีฐานข้อมูล | — (ใช้ `start_demo.bat`) |
| `scripts/*.ps1` | ทดสอบ API ด้วย PowerShell ทีละ phase | `backend/tests/*.test.ts` (Jest + Supertest → `npm test`) |
| `00_HOW_TO_INSTALL.html`, `README_RUN_DEMO.txt`, `README_FIXES_2026-10-11.txt`, `DEMO_DAY_CHECKLIST.html` | คู่มือติดตั้ง/Demo เวอร์ชัน Oracle | `USER_GUIDE.md`, `DEPLOYMENT.md` |

> ไฟล์ในโฟลเดอร์นี้อ้างถึง path เดิม (เช่น `database\schema.sql`) และต้องมี Oracle จึงจะรันได้
