Barbie Sports Arena (rodhare court) - วิธีติดตั้งและรันบนเครื่องใหม่
===================================================================

[1] ติดตั้งโปรแกรม
   - Node.js เวอร์ชัน 20 ขึ้นไป (ทดสอบแล้วกับ v24)
   - Oracle Database XE 21c หรือ 19c ขึ้นไป
   - Oracle SQL Developer (ไว้รันสคริปต์ฐานข้อมูล)

[2] สร้าง user ฐานข้อมูล (ทำครั้งเดียว)
   - เปิด SQL Developer ล็อกอินด้วย system (รหัสที่ตั้งตอนติดตั้ง Oracle)
     ต่อเข้า Service name: XEPDB1
   - เปิดไฟล์ database\create_user.sql แล้วกด F5

[3] สร้างตารางและข้อมูลตั้งต้น
   - วิธีง่าย: ดับเบิลคลิก reset_demo.bat แล้วพิมพ์ Y (ต้องขึ้น Invalid objects 0, Users 5, Courts 6)
   - หรือทำเองใน SQL Developer:
   - ล็อกอิน SQL Developer ด้วย rodhare / rodhare123 (Service name: XEPDB1)
   - รันทีละไฟล์ด้วย F5 ตามลำดับ:
        database\schema.sql  ->  database\constraints.sql  ->  database\views.sql  ->  database\seed.sql
   - ถ้าภาษาไทยขึ้นเป็น ? ให้ตั้ง Encoding ของ SQL Developer เป็น UTF-8

[4] ตั้งค่า backend\.env
   - start_demo.bat สร้างไฟล์นี้จาก backend\.env.example ให้อัตโนมัติตอนเปิดครั้งแรก
     (หรือก๊อป backend\.env.example แล้วเปลี่ยนชื่อเป็น .env เอง)
   - ค่าสำคัญ:
        DB_USER=rodhare
        DB_PASSWORD=rodhare123
        DB_CONNECT_STRING=localhost:1521/XEPDB1
        JWT_SECRET=ตั้งเป็นข้อความยาวๆ อะไรก็ได้
   - หมายเหตุ: เครื่องเดิมที่สร้าง user ไว้ใน service xe ให้ใช้ localhost:1521/xe ตามเดิม

[5] ติดตั้ง dependencies (ทำครั้งแรก)
   - start_demo.bat ติดตั้งให้อัตโนมัติถ้ายังไม่มีโฟลเดอร์ node_modules (ต้องต่ออินเทอร์เน็ต รอ 1-3 นาที)
   - หรือติดตั้งเอง:
        cd backend
        npm install
        cd ..\frontend
        npm install
   - ถ้าก๊อปโปรเจกต์มาจากเครื่องอื่น ไม่ต้องก๊อปโฟลเดอร์ node_modules มาด้วย

[6] เปิดระบบ
   - ดับเบิลคลิก start_demo.bat
   - เปิด http://localhost:3000/health ต้องขึ้น "เชื่อมต่อฐานข้อมูลแล้ว"
   - หน้าเว็บหลัก: http://localhost:3000/courts

บัญชีทดสอบ (รหัสผ่านทุกบัญชี Password123!)
   customer1 = ลูกค้า (บุคคลภายนอก EXTERNAL ไม่มีส่วนลด)
   customer2 = ลูกค้า (นักศึกษา STUDENT ลด 10% + ฟุตซอลวันธรรมดา 08-17 น. ชม.ละ 400)
   staff1    = พนักงานสนาม
   admin1    = ผู้ดูแลระบบ
   exec1     = ผู้บริหาร
   (หน้า Login มีปุ่มกดเข้าแต่ละบัญชีได้ทันที)

ข้อควรระวัง
   - ต้องต่ออินเทอร์เน็ต: ฟอนต์ Prompt, รูปสนาม และ QR Code โหลดจากเว็บภายนอก
     (ไม่มีเน็ตระบบยังใช้ได้ แต่ฟอนต์จะเปลี่ยน และรูป/QR ไม่แสดง)
   - ถ้า /health ขึ้นว่ายังไม่เชื่อมต่อ:
       * เช็ค Windows Services ว่า OracleServiceXE และ OracleOraDB21Home1TNSListener เป็น Running
       * เช็คค่าใน backend\.env ให้ตรงกับ user และ service ที่สร้างไว้
   - อยากล้างข้อมูลกลับเป็นค่าเริ่มต้นก่อน Demo: ดับเบิลคลิก reset_demo.bat แล้วพิมพ์ Y
     (หรือรันสคริปต์ข้อ [3] ใหม่ทั้ง 4 ไฟล์ใน SQL Developer)
     และลบโฟลเดอร์ backend\uploads (ไฟล์สลิปที่อัปโหลด)

ลำดับ Demo ที่แนะนำ (Sports Arena Flow)
   1. ก่อนทำ: เปิด database\demo_queries.sql ส่วน [1] (สต็อกอุปกรณ์ / การจองของสนาม)
   2. customer1 หน้า "ค้นหาสนาม" -> กรองประเภทกีฬา/ราคา -> เลือกสนาม
      -> ตารางเวลาว่าง Real-Time 08:00-22:00
         สี: เขียว = ว่าง, ฟ้า = รอชำระเงิน, แดง = ถูกจองแล้ว, ส้ม = ปิดปรับปรุง (ดูได้ที่ Tennis Court 2)
   3. เลือกช่วงเวลา -> เลือกยืมอุปกรณ์ -> ยืนยันการจอง
      -> สถานะ "รอชำระเงิน" นับถอยหลัง 15 นาที (BR3)
   4. หน้าชำระเงิน: เลือกไฟล์รูปสลิป (JPG/PNG/WEBP ไม่เกิน 5 MB) -> ส่งสลิป
      -> ระบบตรวจสลิปอัตโนมัติ: ไฟล์ / สลิปซ้ำ (slip_ref) / ยอดเงิน (BR6) / ความชัดของภาพ
      -> ผ่าน: PAYMENTS = VERIFIED (AUTO), BOOKINGS = CONFIRMED (ชำระแล้ว), ออกใบเสร็จ (v_receipts)
      -> กดปุ่ม "ดูใบเสร็จ (E-Receipt)" และ "Digital Pass / QR เช็คอิน"
   5. หลังทำ: demo_queries.sql ส่วน [3] และ [6] (Views + AUDIT_LOGS ที่ trigger บันทึกอัตโนมัติ)
      หรือหน้า "Audit Log" ของ admin1
   6. กรณีที่ระบบต้องปฏิเสธ (เลือก 1):
       - customer2 จองสนามเดิมช่วงเวลาเดียวกัน -> "BR2: ไม่สามารถจองได้ ..." (trigger trg_bookings_no_overlap)
       - หน้าส่งสลิป กรอกยอดเงินไม่ตรงยอดจอง -> สลิปถูกปฏิเสธพร้อมเหตุผล BR6
       - ส่งสลิปโดยใช้เลขอ้างอิงเดิมกับการจองอื่น -> "สลิปซ้ำ"
       - จองเกิน 2 ชม./วัน หรือจองล่วงหน้าเกิน 30 วัน (BR4)
       - หรือ demo_queries.sql ส่วน [4] (ปฏิเสธที่ระดับฐานข้อมูล)
   7. กรณีภาพสลิปไม่ชัด: ลบเลขอ้างอิงในหน้าส่งสลิปออก (หรือใช้รูปที่ด้านสั้นเล็กกว่า 300 px)
      -> ระบบส่งเข้าคิว -> staff1 หน้า "ตรวจสอบสลิป" (Inspector Console แบบ Split-View) ตรวจและกดอนุมัติเอง
   8. ผลลัพธ์ปลายทาง: แดชบอร์ดผู้บริหาร exec1 (รายได้ + Peak Hours จาก v_revenue_by_hour),
      demo_queries.sql ส่วน [5]

กฎการคืนเงิน (BR12): ยกเลิกล่วงหน้า > 24 ชม. คืน 100% / 1-24 ชม. คืน 50% / < 1 ชม. ไม่คืนเงิน
ราคาตามประเภทสมาชิก: admin1 หน้า "จัดการสนาม" แท็บ Pricing Rates (เพิ่มอัตราแยก นักศึกษา / บุคลากร / บุคคลภายนอก)
