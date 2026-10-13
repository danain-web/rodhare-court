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
| `NODE_ENV` | `production` | ทำให้ Cookie เป็น `Secure; SameSite=None` |
| `NODE_VERSION` | `24` | |
| `DATABASE_URL` | `postgresql://postgres.xxxx:PASS@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres` | Supabase → Connect → **Transaction pooler** |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | **ลับ** ห้ามใส่ฝั่ง Frontend |
| `SUPABASE_BUCKET_NAME` | `slips` | |
| `JWT_SECRET` | สุ่ม 32+ ตัวอักษร | blueprint สร้างให้อัตโนมัติ |
| `JWT_EXPIRES_IN` | `8h` | |
| `FRONTEND_URL` | `https://rodhare-court.vercel.app` | คั่นหลายค่าด้วย `,` |
| `TRUST_PROXY` | `2` | Vercel + Render = 2 hop → Rate limit เห็น IP จริง |
| `MAINTENANCE_INTERVAL_MS` | `60000` | งาน BR3 ยกเลิกการจองค้างชำระ |

`PORT` ไม่ต้องตั้ง — Render กำหนดให้เอง

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
- [ ] อัปโหลดสลิป → รูปขึ้นใน Supabase Storage bucket `slips` และ Staff เห็นรูป
- [ ] กระดิ่งแจ้งเตือนแสดงรายการหลังสลิปถูกตรวจ
- [ ] เปิด URL ย่อยตรงๆ เช่น `/courts` แล้ว Refresh ไม่ 404 (SPA fallback ใน vercel.json)

---

## Phase 4 — รันเทสต์ (Jest + Supertest)
```powershell
cd backend
npm test
```
- `tests/auth.test.ts` — Register → Login → /me → Logout (เช็ก httpOnly Cookie, session revoke)
- `tests/payment.test.ts` — อัปโหลดสลิป multipart: ต้อง Login, ตรวจฟอร์ม, กันไฟล์ไม่ใช่รูป/ปลอม MIME, Notification
- เทสต์ใช้ DB จริงจาก `.env` และลบ user ทดสอบเองหลังจบ (ไม่อัปโหลดไฟล์ขึ้น Storage)
