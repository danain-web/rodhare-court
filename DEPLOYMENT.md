# Deployment Guide — Rodhare Court (Supabase + Render + Vercel)

## สถาปัตยกรรม Production

```
Browser ──► Vercel (React static + rewrite /api/*) ──► Render (Express API) ──► Supabase PostgreSQL
                                                                         └──► Supabase Storage (slips)
```

**ทำไมใช้ Vercel rewrite แทนให้ Browser ยิงไป Render ตรงๆ?**
Browser มองว่า Cookie มาจากโดเมนเดียวกับหน้าเว็บ (first-party) — Safari และเบราว์เซอร์ที่บล็อก
third-party cookie จะไม่ทิ้ง `auth_token` ทำให้ Login ใช้ได้ทุกเบราว์เซอร์ และโค้ด Frontend ใช้ `baseURL: '/api'` เหมือนตอน dev

---

## Step 5.1 — Environment Variables

### Backend (Render → Environment)

| ตัวแปร | ค่าตัวอย่าง | หมายเหตุ |
|---|---|---|
| `NODE_ENV` | `production` | ทำให้ Cookie เป็น `Secure` และบังคับตรวจค่าความปลอดภัยแบบเข้มงวด |
| `NODE_VERSION` | `24` | |
| `DATABASE_URL` | `postgresql://postgres.xxxx:PASS@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres` | Supabase → Connect → **Transaction pooler** |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | **ลับ** ห้ามใส่ฝั่ง Frontend |
| `SUPABASE_BUCKET_NAME` | `slips` | bucket ต้องเป็น **Private** |
| `SLIP_SIGNED_URL_TTL` | `300` | อายุลิงก์ดูรูปสลิป (วินาที) |
| `JWT_SECRET` | สุ่ม 32+ ตัวอักษร | blueprint สร้างให้อัตโนมัติ · ค่าตัวอย่าง/สั้นเกินไประบบไม่ยอม start |
| `JWT_EXPIRES_IN` | `8h` | อายุ Cookie เท่ากับค่านี้ |
| `COOKIE_SAMESITE` | `lax` | ใช้ได้เพราะเรียก API ผ่าน Vercel rewrite (โดเมนเดียวกัน) · `none` ไม่อนุญาตใน production |
| `FRONTEND_URL` | `https://rodhare-court.vercel.app` | **ต้องตรงกับโดเมนหน้าเว็บทุกตัวอักษร** (ใช้ตรวจ CSRF) · คั่นหลายค่าด้วย `,` |
| `TRUST_PROXY` | `2` | Vercel + Render = 2 hop → Rate limit เห็น IP จริง |
| `MAINTENANCE_INTERVAL_MS` | `60000` | งานยกเลิกการจองค้างชำระ |
<<<<<<< HEAD
| `PAYMENT_DEMO_MODE` | ไม่ตั้ง / `true` / `false` | โหมดสาธิต: QR จำลอง + อนุมัติสลิป demo อัตโนมัติ · ไม่ตั้ง = เปิดเองเมื่อยังไม่มีบัญชีจริง |
=======
| `PAYMENT_DEMO_MODE` | ไม่ตั้ง / `true` / `false` | โหมดสาธิต: อนุมัติสลิปที่ยอดตรงอัตโนมัติ · **ไม่ตั้ง = เปิด** · ระบบรับเงินจริงตั้ง `false` |
>>>>>>> 7911668a7e5d511f83e82c3f30e2b56c2428aac6
| `PAYMENT_ACCOUNT_NAME` | ชื่อบัญชีจริง | ใช้คู่กับ `PAYMENT_PROMPTPAY_ID` / เลขบัญชี |
| `PAYMENT_PROMPTPAY_ID` | เบอร์/เลขผู้เสียภาษีพร้อมเพย์จริง | ใช้สร้าง PromptPay QR พร้อมยอด |
| `PAYMENT_BANK_NAME` / `PAYMENT_BANK_ACCOUNT_NO` | ธนาคาร / เลขบัญชีจริง | ไม่บังคับ |
| `RATE_LIMIT_AUTH_MAX` / `RATE_LIMIT_BOOKING_MAX` / `RATE_LIMIT_PAYMENT_MAX` | `20` / `30` / `10` | ต่อ 15 นาที (ไม่ตั้ง = ค่านี้) |

`PORT` ไม่ต้องตั้ง — Render กำหนดให้เอง

> ระบบตรวจ env ตอนเริ่ม (`backend/src/config/env.ts`) — ถ้าค่าที่จำเป็นหายหรือไม่ปลอดภัย Render จะขึ้น deploy failed พร้อมข้อความบอกว่าตัวแปรไหนผิด

### Supabase (ทำครั้งเดียวผ่าน Dashboard)
1. **SQL Editor** → รันไฟล์ใน `database/migrations/` ตามลำดับเลข (รันซ้ำได้ ไม่ลบข้อมูล):
   - (`001` ถูกถอดออกแล้ว — ถ้าเคยรันไปแล้ว `004` จะยกเลิกให้)
   - `002_booking_no_overlap_constraint.sql` — กันจองซ้อนที่ระดับฐานข้อมูล (รัน query ตรวจท้ายไฟล์ก่อน ต้องได้ 0 แถว)
   - `003_enable_row_level_security.sql` — เปิด RLS ทุกตาราง (ปิดการอ่านข้อมูลผ่าน REST API ด้วย anon key)
   - `004_allow_demo_auto_approval.sql` — อนุญาตให้โหมดสาธิตอนุมัติสลิปอัตโนมัติ
2. **Storage → bucket `slips` → Edit bucket → ปิด Public bucket** (สลิปเป็นข้อมูลส่วนบุคคล — ระบบออก Signed URL อายุสั้นให้เฉพาะเจ้าของการจองและเจ้าหน้าที่)
3. **Advisors → Security Advisor** → ตรวจว่าไม่เหลือคำเตือน RLS

### Frontend (Vercel)
ไม่ต้องตั้ง env ใดๆ — URL ของ Backend อยู่ใน `frontend/vercel.json` (rewrite)

---

## Step 5.2 — ขั้นตอน Deploy

### 0) ขึ้น GitHub
```powershell
cd "C:\Users\danai\Documents\DATABASE\rodhare_court_fixed\rodhare court"
git init
git add .
git status          # ตรวจว่าไม่มี .env / node_modules / *.pdf หลุดมา (.gitignore กันไว้แล้ว)
git commit -m "Production-ready: Supabase + httpOnly cookie auth + tests"
git branch -M main
git remote add origin https://github.com/danain-web/rodhare-court.git
git push -u origin main
```

### 1) Render (Backend)
1. https://dashboard.render.com → **New → Blueprint** → เลือก repo → Render อ่าน `render.yaml` ให้
   (หรือ **New → Web Service** แล้วตั้งค่าเอง:)
   - Root Directory: `backend`
   - Build Command: `npm ci --include=dev && npm run build`
     → `--include=dev` จำเป็น เพราะ `typescript` เป็น devDependency และ `NODE_ENV=production` จะข้าม devDeps
   - Start Command: `npm start`
   - Health Check Path: `/api/health`
2. กรอกค่า `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL` (ใส่ชั่วคราวก่อน แล้วค่อยแก้หลังได้ URL Vercel)
3. Deploy เสร็จ → เปิด `https://<ชื่อ-service>.onrender.com/api/health` ต้องได้ `"database":"connected"`

> Free tier จะ sleep หลังไม่มีคนใช้ 15 นาที — request แรกช้า ~30-50 วินาที (เปิด `/api/health` ทิ้งไว้ก่อนพรีเซนต์)

### 2) Vercel (Frontend)
1. แก้ `frontend/vercel.json` ให้ `destination` เป็น URL Render จริง → commit + push
2. https://vercel.com/new → Import repo
   - Root Directory: `frontend`
   - Framework Preset: **Vite** (Build `npm run build`, Output `dist` — อัตโนมัติ)
3. Deploy → ได้ URL เช่น `https://rodhare-court.vercel.app`

### 3) ผูกสองฝั่งเข้าหากัน
- กลับไป Render → แก้ `FRONTEND_URL` = URL Vercel → Save (Render redeploy ให้)

### 4) Checklist หลัง Deploy
- [ ] `/api/health` บน Render → connected
- [ ] สมัครสมาชิก/Login บน Vercel ได้ → DevTools → Application → Cookies เห็น `auth_token` เป็น HttpOnly, Secure
- [ ] Refresh หน้าแล้วยัง Login อยู่ (เช็กผ่าน `/api/auth/me`)
- [ ] Cookie `auth_token` เป็น `SameSite=Lax`
- [ ] หน้าชำระเงินแสดง QR (โหมดสาธิต = QR จำลองมีป้าย "สาธิต") และไม่มีช่องกรอกเลขอ้างอิง
- [ ] แนบสลิป `demo_slips/slip_210_DEMO0001.png` → ชำระเงินเรียบร้อยทันที + ใบเสร็จ
<<<<<<< HEAD
- [ ] แนบสลิป `_unclear` → "รอเจ้าหน้าที่ตรวจสอบ" → พนักงานเห็นรูปและอนุมัติได้
=======
>>>>>>> 7911668a7e5d511f83e82c3f30e2b56c2428aac6
- [ ] เปิด URL รูปสลิปเดิมแบบ public (ถ้ามี) ต้องเปิดไม่ได้หลังปิด Public bucket
- [ ] กระดิ่งแจ้งเตือนแสดงรายการหลังสลิปถูกตรวจ
- [ ] เปิด URL ย่อยตรงๆ เช่น `/courts` แล้ว Refresh ไม่ 404 (SPA fallback ใน vercel.json)

> **Vercel Preview URL** (เช่น `rodhare-court-git-xxx.vercel.app`) เป็นคนละโดเมนกับ `FRONTEND_URL` → คำขอที่เปลี่ยนข้อมูลจะถูกปฏิเสธด้วย CSRF check (ตั้งใจ) ใช้ทดสอบบนโดเมนหลักเท่านั้น หรือเพิ่มโดเมน preview ลงใน `FRONTEND_URL`

---

## Phase 4 — รันเทสต์ (Jest + Supertest)
```powershell
cd backend
npm test
```
เทสต์ **ไม่แตะฐานข้อมูลจริง**: `tests/setup/globalSetup.ts` เปิด PostgreSQL 17 ชั่วคราวในเครื่อง (embedded-postgres)
โหลด `supabase_schema.sql` + `supabase_seed.sql` + `migrations/*.sql` แล้วลบทิ้งหลังจบ · Supabase Storage ใช้ test double ในหน่วยความจำ
และ `tests/setup/guard.ts` หยุดเทสต์ทันทีถ้า `DATABASE_URL` ไม่ใช่ฐานข้อมูลในเครื่อง

| ไฟล์ | ทดสอบ |
|---|---|
| `auth.test.ts` | สมัคร / Login / Logout / session ถูกยกเลิกจริง |
| `booking.test.ts` | วงจรจอง → ส่งสลิป → รอตรวจ → พนักงานอนุมัติ → ใบเสร็จ 1 ใบ → ยกเลิก (ตรวจสถานะในฐานข้อมูล) |
| `concurrency.test.ts` | 20 คนจองช่วงเดียวกันพร้อมกัน · ส่งสลิปซ้ำพร้อมกัน · อนุมัติซ้ำพร้อมกัน · งานหมดเวลาชนกับการอนุมัติ |
| `payment.test.ts` | ตรวจฟอร์มสลิป: ไฟล์ปลอม, ยอดเงินผิดรูปแบบ, เลขอ้างอิง, field แปลกปลอม |
<<<<<<< HEAD
| `demo.test.ts` | โหมดสาธิต: ไม่กรอกเลขอ้างอิง, สลิปชัดอนุมัติเอง, สลิปไม่ชัดเข้าคิว, ยอดผิดถูกปฏิเสธ |
=======
| `demo.test.ts` | โหมดสาธิต: ไม่กรอกเลขอ้างอิง, สลิปยอดตรงอนุมัติเองทันที, ยอดผิดถูกปฏิเสธ, ปิดโหมดแล้วต้องรอพนักงาน |
>>>>>>> 7911668a7e5d511f83e82c3f30e2b56c2428aac6
| `security.test.ts` | CSRF, JWT ปลอม/หมดอายุ/alg none, IDOR, สิทธิ์ตาม role, ขนาดคำขอ, rate limit, env validation, RLS |
| `unit.test.ts` | PromptPay payload/CRC, validator, กฎเวลา, timezone, path ของสลิป |
| `admin.test.ts` | Audit Log ส่งค่าเป็นชนิดที่ถูกต้อง |

CI (`.github/workflows/ci.yml`) รัน secret scan (gitleaks) + เทสต์ backend + build frontend ทุกครั้งที่ push
