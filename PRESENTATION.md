# Rodhare Court — เอกสารประกอบการนำเสนอ

ระบบจองสนามกีฬาออนไลน์ (Web Application) รองรับลูกค้า พนักงาน และผู้ดูแลระบบ ครอบคลุมตั้งแต่ค้นหาสนาม จอง ชำระเงิน ใบเสร็จ เช็คอิน ยืม-คืนอุปกรณ์ ค่าปรับ และคืนเงิน

---

## 1. ภาพรวมและสถาปัตยกรรม

```
ผู้ใช้ (Browser)
   │  HTTPS
   ▼
Vercel  ── React SPA (Frontend)
   │  /api/*  (rewrite → same-origin cookie)
   ▼
Render  ── Node.js + Express (Backend API)
   │
   ├──► Supabase PostgreSQL  (ข้อมูลทั้งหมด 21 ตาราง)
   └──► Supabase Storage     (รูปสลิป — private + Signed URL)
```

**ทำไมใช้ Vercel rewrite:** ให้ Browser เห็น `/api` เป็นโดเมนเดียวกับหน้าเว็บ → cookie `auth_token` เป็น first-party (`HttpOnly`, `SameSite=Lax`) ไม่ถูกบล็อกจาก third-party cookie และลดช่องทาง CSRF

## 2. เทคโนโลยีที่ใช้

| ส่วน | เครื่องมือ | ใช้ทำอะไร |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite | หน้าเว็บแบบ SPA |
| | Tailwind CSS 4 | จัดสไตล์ |
| | React Router 7 | เปลี่ยนหน้า + ป้องกันหน้าตามบทบาท |
| | TanStack Query | ดึง/แคชข้อมูลจาก API |
| | Axios, qrcode | เรียก API, สร้าง QR PromptPay/Digital Pass |
| Backend | Node.js + Express 5 + TypeScript | REST API |
| | pg (node-postgres) | ต่อ PostgreSQL แบบ Parameterized Query (กัน SQL Injection) |
| | Zod | ตรวจ Input ทุก Endpoint |
| | jsonwebtoken + bcryptjs | JWT ใน HttpOnly cookie, แฮชรหัสผ่าน |
| | helmet, cors, express-rate-limit | Security headers, CORS allowlist, จำกัดจำนวนคำขอ |
| | multer | รับไฟล์สลิป |
| Database | PostgreSQL (Supabase) | เก็บข้อมูล + Constraint + Row Level Security |
| Storage | Supabase Storage | เก็บสลิปแบบ private |
| Test | Jest + Supertest + embedded-postgres | 9 ชุดทดสอบ, 131 เทสต์ รันบน Postgres จริงที่สร้างชั่วคราว (ไม่แตะ Supabase) |
| Deploy | Vercel (frontend), Render (backend), Supabase | ฟรีเทียร์ |

**สถาปัตยกรรมฝั่ง Backend (แยกชั้น):** `routes → controllers → services (Business Rules) → repositories (SQL)`  + `validators` (Zod) + `middleware` (auth / CSRF / rate limit / error)

## 3. บทบาทผู้ใช้

| บทบาท | บัญชีสาธิต | ทำอะไรได้ |
|---|---|---|
| ลูกค้า | `customer1` | ค้นหา/จองสนาม, ชำระเงิน, ดูใบเสร็จ, Digital Pass, ยกเลิก/ขอคืนเงิน, จ่ายค่าปรับ |
| พนักงาน | `staff1` | ตรวจสลิป, เช็คอิน, ยืม-คืนอุปกรณ์, อนุมัติคืนเงิน |
| ผู้ดูแลระบบ | `admin1` | ทุกอย่างของพนักงาน + จัดการสนาม/อุปกรณ์/โปรโมชั่น/ราคา + Audit Log |

## 4. ฟังก์ชันหลักและหน้าที่ (อ้างอิงโค้ดจริง)

### 4.1 สมาชิกและความปลอดภัย — `auth.service.ts`, `auth.middleware.ts`
| ฟังก์ชัน | หน้าที่ |
|---|---|
| `register` / `login` | สมัคร/เข้าสู่ระบบ (username หรืออีเมล) ออก JWT ใส่ cookie HttpOnly |
| `logout` / `validateSession` | ยกเลิก session ฝั่งเซิร์ฟเวอร์ (token ที่ logout แล้วใช้ไม่ได้) |
| `checkAvailability` | เช็ค username/email ซ้ำแบบ real-time |
| `requireAuth` / `requireRole` | ตรวจ token และสิทธิ์ตามบทบาททุก API |
| `csrfOriginCheck` | ตรวจ Origin/Referer ของคำขอที่เปลี่ยนข้อมูล (กัน CSRF) |
| `authLimiter`, `bookingLimiter`, `paymentUploadLimiter` | จำกัดจำนวนคำขอ (กัน brute-force/สแปม) |

### 4.2 สนามและราคา — `court.service.ts`, `pricing.service.ts`
| ฟังก์ชัน | หน้าที่ |
|---|---|
| `getCourts` | ค้นหา/กรองสนามตามกีฬา ราคา สถานะ |
| `getCourtAvailability` | สร้างตารางช่วงเวลาว่าง/ไม่ว่างของวัน (ตามเวลาเปิด-ปิด) |
| `calculate` | **คำนวณราคาฝั่ง Server** = ค่าสนาม (ตามช่วงเวลา/วันหยุด/ประเภทสมาชิก) + อุปกรณ์ − โปรโมชั่น — Client ปลอมราคาไม่ได้ |
| `assertPromotionUsable` | ตรวจโค้ดส่วนลด (หมดอายุ/สิทธิ์ใช้ครบ/ขั้นต่ำ) |
| `createCourt` / `updateCourt` / `softDeleteCourt` | แอดมินจัดการสนาม (ลบแบบ soft delete) |

### 4.3 การจอง — `booking.service.ts`  (หัวใจของระบบ)
| ฟังก์ชัน | หน้าที่ |
|---|---|
| `createBooking` | สร้างการจองใน **Transaction เดียว** (จอง + อุปกรณ์ + ประวัติสถานะ + แจ้งเตือน + Audit) |
| `validateSlot` | ตรวจเวลา, ชั่วโมงเปิด, จองล่วงหน้า ≤30 วัน, ห้ามจองซ้อนของตัวเอง |
| `reserveEquipment` | ตัดสต็อกอุปกรณ์ (เรียงตาม id ลด deadlock) |
| `runMaintenance` | งานเบื้องหลังทุก 60 วินาที: ยกเลิกรายการค้างชำระเกิน 15 นาที, ปิดรายการที่ใช้งานเสร็จ |
| `updateBooking` (`refund.service.ts`) | แก้ไขวัน/เวลาได้ก่อนใช้งาน ≥24 ชม. (ไม่ต่ออายุ Hold) |

**กฎป้องกันการจองซ้ำ/การกั๊กสนาม**
- ล็อกแถวผู้ใช้และสนาม (`SELECT … FOR UPDATE`) + DB Exclusion Constraint → คน 20 คนกดจองช่วงเดียวกันพร้อมกัน สำเร็จได้แค่ 1 (มีเทสต์ `concurrency.test.ts`)
- **Hold 15 นาที:** จองแล้วต้องจ่ายภายใน 15 นาที ไม่งั้นระบบยกเลิกและคืนช่วงเวลา
- **จำกัด Hold ไม่เกิน 3 รายการ/บัญชี** (BR3b) — กันการเปลี่ยนสนามเรื่อยๆ เพื่อกั๊กคิว
- **ตรวจพฤติกรรมจองทิ้ง** (BR3c) — หมดเวลา ≥5 ครั้งใน 24 ชม. → ระงับการจองชั่วคราว + บันทึก Audit

### 4.4 การชำระเงิน — `payment.service.ts`, `promptpay.ts`, `slipStorage.ts`
| ฟังก์ชัน | หน้าที่ |
|---|---|
| `getPaymentInstructions` | แสดงยอด + QR PromptPay (สร้าง payload + CRC16 ตามมาตรฐาน EMVCo) |
| `submitPayment` | รับสลิป ตรวจชนิดไฟล์/ขนาด/ยอดเงิน แล้วตัดสินผล (ดูด้านล่าง) |
| `getPendingPayments` / `verifyPayment` / `rejectPayment` | คิวพนักงานตรวจสลิป → อนุมัติ (ออกใบเสร็จ) หรือปฏิเสธพร้อมเหตุผล |
| `getReceiptByBookingId` | ใบเสร็จ (ออกได้เมื่อชำระผ่านเท่านั้น และไม่ซ้ำ) |
| `createSignedSlipUrls` | สลิปเก็บแบบ private; พนักงานเปิดดูผ่านลิงก์ชั่วคราว 5 นาที |

**โหมดสาธิต (`PAYMENT_DEMO_MODE`, เปิดเป็นค่าเริ่มต้น):**
- แสดง QR จำลอง (ป้าย "สาธิต")
- สลิปที่ **ยอดตรงกับยอดจอง** → ยืนยันการจองและออกใบเสร็จทันที; ยอดไม่ตรง → ปฏิเสธ พร้อมเหตุผล
- ตั้ง `PAYMENT_DEMO_MODE=false` → ทุกสลิปเข้าคิวให้พนักงานตรวจเอง (Manual Review) = รูปแบบสำหรับใช้งานจริง

> จุดที่ควรบอกอาจารย์ตรงๆ: โหมดสาธิตไม่ได้ตรวจว่าเงินเข้าบัญชีจริง (ต้องเชื่อมธนาคาร/Payment Provider ซึ่งอยู่นอกขอบเขตโปรเจกต์) จึงเป็นเพียงกลไกช่วยสาธิต Flow

### 4.5 หลังการจอง — `borrowing.service.ts`, `refund.service.ts`
| ฟังก์ชัน | หน้าที่ |
|---|---|
| `borrowEquipment` | พนักงานเช็คอินและให้ยืมอุปกรณ์ตามการจอง |
| คืนอุปกรณ์ | บันทึกการคืน; ล่าช้า/ชำรุด → สร้างค่าปรับ |
| `getMyFines` / `payFine` | ลูกค้าดู/จ่ายค่าปรับ (มีค่าปรับค้าง = จองใหม่ไม่ได้) |
| `previewCancelRefund` | คำนวณยอดคืนเงินตามช่วงเวลาที่ยกเลิก (ก่อนกดยืนยัน) |
| `approveRefund` / `rejectRefund` | พนักงานอนุมัติ/ปฏิเสธคำขอคืนเงิน |
| `getUserNotifications` | กระดิ่งแจ้งเตือนในระบบ |

### 4.6 ผู้ดูแลและตรวจสอบย้อนหลัง — `admin.service.ts`
จัดการกีฬา อุปกรณ์ โปรโมชั่น อัตราราคา และ **Audit Log** (บันทึกทุกเหตุการณ์สำคัญ: ใครทำอะไร เมื่อไร จาก IP ใด)

## 5. จุดเด่น

1. **จองพร้อมกันไม่ซ้ำ** — Transaction + Row Lock + DB Constraint ทดสอบด้วยคำขอพร้อมกันบนฐานข้อมูลจริง
2. **ราคาและสถานะคำนวณฝั่ง Server** — ไม่เชื่อค่าจาก Browser
3. **ความปลอดภัยหลายชั้น** — JWT ใน HttpOnly cookie, CSRF Origin check, CORS allowlist, helmet, rate limit, Zod validation, Parameterized SQL, RBAC + ตรวจสิทธิ์รายอ็อบเจกต์ (ลูกค้าดูของคนอื่นไม่ได้), Row Level Security, สลิป private + Signed URL, Fail-fast ตรวจ env ตอนเริ่มระบบ
4. **Business Rules ครบ** — Hold 15 นาที, ล่วงหน้า ≤30 วัน, แก้ไข ≥24 ชม., ค่าปรับ, โปรโมชั่น, ส่วนลดตามสมาชิก, คืนเงิน
5. **มี Audit Trail และประวัติสถานะ** ตรวจสอบย้อนหลังได้
6. **ชุดทดสอบอัตโนมัติ 131 เทสต์ ผ่านทั้งหมด** รวม concurrency และ security; รันบน DB ชั่วคราวแยกจากข้อมูลจริง
7. **Deploy จริงใช้งานได้** (Vercel + Render + Supabase) พร้อมเอกสาร `DEPLOYMENT.md`, `USER_GUIDE.md`
8. **UX** — นับถอยหลัง Hold, QR Digital Pass เช็คอิน, ตารางช่วงเวลาว่าง, แจ้งเตือน

## 6. จุดด้อยและข้อจำกัด (พูดตรงๆ จะน่าเชื่อถือกว่า)

| ข้อจำกัด | รายละเอียด / แนวทางต่อยอด |
|---|---|
| ไม่ตรวจเงินเข้าจริง | โหมดสาธิตอนุมัติจากยอดที่ตรงเท่านั้น → ต่อยอด: เชื่อม Payment Provider/Webhook (เช่น PromptPay API) หรือ OCR ตรวจสลิป |
| โหมดสาธิตเปิดเป็นค่าเริ่มต้น | ถ้าใช้งานจริงต้องตั้ง `PAYMENT_DEMO_MODE=false` เอง (ควรเพิ่ม fail-fast กรณีมีบัญชีจริงแต่ยังเปิดโหมดสาธิต) |
| Render ฟรีเทียร์ | เซิร์ฟเวอร์หลับเมื่อไม่มีคนใช้ → คำขอแรกช้า 30–60 วินาที (ควรเปิดหน้าเว็บรอก่อนนำเสนอ) |
| งานเบื้องหลังเป็น interval ในตัวแอป | ถ้ารันหลาย instance ต้องมี leader/lock (ตอนนี้ SQL ออกแบบให้ idempotent แล้ว) |
| ไม่มี Email/SMS | แจ้งเตือนผ่านกระดิ่งในระบบเท่านั้น |
| ยังไม่มี E2E test บน Browser | ทดสอบระดับ API + DB; UI ทดสอบด้วยมือ |
| เป็นระบบเดียวต่อสาขา | ไม่รองรับหลายสนามกีฬาต่างองค์กร (multi-tenant) |
| ประวัติการพัฒนา | ย้ายจาก Oracle → PostgreSQL ทำให้พบบั๊กจากการแปลงระหว่างทาง (แก้แล้ว ไฟล์เดิมอยู่ `legacy-oracle/`) |

## 7. ลำดับ Demo แนะนำ (~5 นาที)
1. เปิดหน้าเว็บล่วงหน้า 1 นาที (ปลุก Render) → Login `customer1` (มีปุ่มกดเข้าทันที)
2. ค้นหาสนาม → จอง Badminton Court 1 พรุ่งนี้ 1 ชม. + ยืมไม้แบด → ชี้ราคา breakdown และนับถอยหลัง 15 นาที
3. หน้าชำระเงิน → QR จำลอง → แนบ `demo_slips/slip_210_DEMO0001.png` → **ชำระเงินเรียบร้อยทันที** → ใบเสร็จ
4. จองอีกรายการ → แก้ยอดให้ผิด → ถูกปฏิเสธพร้อมเหตุผล
5. `customer2` จองช่วงเวลาเดียวกัน → ระบบปฏิเสธ (กันจองซ้อน)
6. `staff1` → เช็คอิน/ยืมอุปกรณ์ · `admin1` → Audit Log เห็นทุกเหตุการณ์
7. F12 → Cookies → `auth_token` เป็น HttpOnly · (ถ้ามีเวลา) รัน `npm test` โชว์ 131 เทสต์ผ่าน
