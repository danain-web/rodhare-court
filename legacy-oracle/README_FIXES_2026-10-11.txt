rodhare court - ฉบับแก้ไข (11/10/2026)
=====================================

วิธีรันบนเครื่องที่มี Oracle
1) SQL Developer (login ด้วย user rodhare) รันทีละไฟล์ด้วย F5:
   database\schema.sql  ->  database\constraints.sql  ->  database\seed.sql
   (ต้องรัน schema.sql ใหม่ เพราะ constraints/trigger ใหม่ต้องเริ่มจากฐานข้อมูลว่าง)
2) ใช้ไฟล์ backend\.env เดิมของเครื่องตัวเอง (ในชุดนี้ไม่ได้ใส่ .env มา)
3) ถ้าเครื่องยังไม่มี node_modules: เข้า backend และ frontend แล้วรัน npm install
4) ดับเบิลคลิก start_demo.bat -> เปิด http://localhost:3000/health ต้องขึ้น connected
   (start_preview.bat = ดูหน้าตาแบบไม่มี DB เท่านั้น ห้ามใช้ตอน demo)
5) ตอน demo เปิด database\demo_queries.sql โชว์ข้อมูลก่อน/หลัง

สิ่งที่แก้
- ปิดการใช้ข้อมูลจำลองในหน่วยความจำ (ถ้า DB หลุดจะขึ้น error แทนการหลอกว่าสำเร็จ)
- กันจองซ้อน: SELECT ... FOR UPDATE ล็อกสนาม + trigger trg_bookings_no_overlap ระดับ DB
- ตัดสต็อกอุปกรณ์ไม่ซ้ำ 2 รอบ (จอง + ยืม), ยกเลิกการจองแล้วคืนสต็อก
- ยืมอุปกรณ์ได้ทุก user (เดิมหาได้แค่การจองของ user_id = 1)
- ยืนยันชำระเงินแล้วบันทึก BOOKING_STATUS_HISTORY (CONFIRMED)
- Executive Dashboard ใช้ตัวเลขจริง (เดิม hardcode 154,200 / 78.5%)
- เพิ่ม CHECK / UNIQUE / INDEX ทุกตาราง (database\constraints.sql)
- seed.sql เพิ่มโปร WELCOME10, DISCOUNT50 และเวลาเปิด-ปิดสนาม
