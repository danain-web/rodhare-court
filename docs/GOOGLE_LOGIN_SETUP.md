# คู่มือตั้งค่าเข้าสู่ระบบด้วย Google

ระบบรองรับ 2 ทางเข้า และ **ใช้ได้ทั้งสองทางพร้อมกัน**: รหัสผ่านแบบเดิม และปุ่ม "เข้าสู่ระบบด้วย Google"

```
ผู้ใช้กดปุ่ม Google ในหน้าเว็บ ──► Google ออก ID token ──► POST /api/auth/google
                                                            │ backend ตรวจ token กับ Google
                                                            │  (ลายเซ็น · ผู้รับ = Client ID ของเรา · ไม่หมดอายุ · email_verified)
                                                            ▼
                                       ออก JWT cookie ตัวเดิม → ใช้ระบบสิทธิ์/เซสชันเดิมทั้งหมด
```

Client ID เป็น **ค่าสาธารณะ ไม่ใช่ความลับ** (อยู่ในโค้ดหน้าเว็บอยู่แล้วตามธรรมชาติของ Google login) ระบบนี้ไม่ใช้ Client Secret เลย

## กติกาของระบบ
| กรณี | ผล |
|---|---|
| Google ใหม่ที่อีเมล `@kkumail.com` | สร้างบัญชีลูกค้า ประเภท **นักศึกษา** (ส่วนลด 10%) อัตโนมัติ |
| Google ใหม่ที่อีเมลอื่น (เช่น Gmail) | สร้างบัญชีลูกค้า ประเภท **บุคคลภายนอก** (ไม่มีส่วนลด) |
| Google ที่เคยเข้ามาแล้ว | เข้าบัญชีเดิม |
| อีเมล Google ตรงกับบัญชีรหัสผ่านที่มีอยู่ | **ไม่ผูกให้เอง** (ดูเหตุผลด้านล่าง) ให้เข้าสู่ระบบด้วยรหัสผ่านก่อน แล้วไปหน้าโปรไฟล์กด "เชื่อมบัญชี Google" |
| อีเมลของ Google ยังไม่ยืนยัน | ปฏิเสธ |
| บัญชีถูกระงับ | ปฏิเสธ แม้ Google ยืนยันถูกต้อง |

เหตุผลที่ไม่ผูกอัตโนมัติ: ฟอร์มสมัครด้วยรหัสผ่านไม่ได้ยืนยันอีเมล ถ้ามีคนสมัครด้วยอีเมลของเหยื่อไว้ก่อน แล้วผูกอัตโนมัติ
คนนั้นจะยังเข้าบัญชีได้ด้วยรหัสผ่านของตัวเอง การให้ผู้ใช้ล็อกอินรหัสผ่านก่อนแล้วค่อยเชื่อม Google พิสูจน์ว่าเป็นเจ้าของทั้งสองฝั่ง

ประเภทสมาชิกตามโดเมนตั้งไว้ตอน**สร้างบัญชีผ่าน Google** เท่านั้น เก็บในตาราง `member_type_email_domains` (ไม่ฝังในโค้ด) เพิ่มโดเมนได้ใน Supabase SQL Editor เช่น

```sql
-- ตัวอย่าง: โดเมนบุคลากร (แทน xxx.ac.th ด้วยโดเมนจริง)
INSERT INTO member_type_email_domains (domain, member_type_id)
SELECT 'xxx.ac.th', member_type_id FROM member_types WHERE type_name = 'PERSONNEL';
```

---

## ขั้นที่ 1 — รัน migration 008 ใน Supabase
Supabase → **SQL Editor** → วางเนื้อหา `database/migrations/008_google_login.sql` → **Run**
(ต่อจาก 005–007 รันซ้ำได้ ไม่ลบข้อมูล) ถ้าไม่รัน ทั้งการสมัครด้วยรหัสผ่านและ Google จะ error เพราะคอลัมน์ `google_sub` ยังไม่มี

## ขั้นที่ 2 — สร้าง OAuth Client ใน Google Cloud Console
1. เข้า <https://console.cloud.google.com> ด้วยบัญชี Google ของคุณ
2. มุมซ้ายบนเลือก **Select a project** → **New Project** ตั้งชื่อ `rodhare-court` → **Create** แล้วเลือกโปรเจกต์นั้น
3. เมนู ☰ → **APIs & Services** → **OAuth consent screen** (หรือ **Google Auth Platform**)
   - ถ้าถามประเภทผู้ใช้ เลือก **External** → **Create**
   - App name: `Rodhare Court` · User support email: อีเมลของคุณ · Developer contact: อีเมลของคุณ → **Save and continue**
   - Scopes: ใช้ค่าเริ่มต้น (`openid`, `email`, `profile`) ไม่ต้องเพิ่มอะไร
   - Test users: ถ้าสถานะเป็น **Testing** ให้เพิ่มอีเมลที่จะทดสอบ (สูงสุด 100 คน)
   - สุดท้ายกด **Publish app** (เปลี่ยนเป็น **In production**) เพื่อให้ผู้ใช้ทั่วไปเข้าได้ ขอบเขต `openid email profile` ตามที่ผมทราบไม่ต้องผ่านการตรวจสอบของ Google แต่ผู้ใช้อาจเห็นหน้าเตือน "unverified" บ้าง ตรวจเงื่อนไขล่าสุดที่หน้านั้นอีกครั้ง
4. เมนู **Credentials** → **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: `rodhare-web`
   - **Authorized JavaScript origins** → **Add URI** (ใส่ทีละอัน ไม่มี `/` ท้าย ไม่มี path):
     - `https://rodhare-court.vercel.app` (โดเมน Vercel จริงของคุณ ต้องตรงทุกตัวอักษร)
     - `http://localhost:3000` (สำหรับทดสอบในเครื่อง พอร์ตตาม `vite.config.ts`)
   - **Authorized redirect URIs**: ไม่ต้องใส่ (ใช้ปุ่มแบบ popup)
   - กด **Create**
5. คัดลอก **Client ID** (หน้าตา `123456789-abcdefg.apps.googleusercontent.com`) ไม่ต้องสนใจ Client Secret

> การเปลี่ยน origins อาจใช้เวลาสักครู่ถึงหลายนาทีกว่า Google จะมีผล ถ้าปุ่มขึ้น error `origin_mismatch` ให้ตรวจ URL ให้ตรงเป๊ะ แล้วรอสักพัก

## ขั้นที่ 3 — ใส่ Client ID
**Render** (backend) → service `rodhare-court-backend` → **Environment** → Add:

| Key | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID ที่คัดลอกมา |

**Save Changes** (Render deploy ใหม่)

**Vercel** (frontend) → โปรเจกต์ → **Settings** → **Environment Variables** → Add:

| Key | Value | Environments |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Client ID เดียวกัน | Production (และ Preview ถ้าต้องการ) |

ค่า `VITE_*` ถูกฝังในไฟล์ตอน build จึง **ต้อง Redeploy**: Vercel → **Deployments** → จุดสามจุดที่ deployment ล่าสุด → **Redeploy**

ถ้าไม่ตั้ง `VITE_GOOGLE_CLIENT_ID` ปุ่ม Google จะไม่แสดง (ส่วนอื่นใช้ได้ปกติ) และถ้าไม่ตั้ง `GOOGLE_CLIENT_ID` ฝั่ง backend จะตอบ 503 เมื่อมีคนเรียก `/api/auth/google`

## ขั้นที่ 4 — ทดสอบ
1. เปิดหน้าเว็บ → หน้า **เข้าสู่ระบบ** ควรเห็นปุ่ม "Sign in with Google" ใต้ฟอร์ม
2. กดแล้วเลือกบัญชี `@kkumail.com` → ควรเข้าสู่ระบบและเข้าหน้า Dashboard
3. เปิด **โปรไฟล์** → ประเภทสมาชิกควรเป็น **นักศึกษา**
4. ลองออกจากระบบ แล้วเข้าด้วย Gmail ทั่วไป → ประเภทสมาชิกเป็น **บุคคลภายนอก**
5. ทดสอบเชื่อมบัญชี: ล็อกอินด้วยบัญชีรหัสผ่านเดิม (เช่น `customer1`) → **โปรไฟล์** → ส่วน "บัญชี Google" → กดปุ่มแล้วเลือกบัญชี Google

| อาการ | สาเหตุที่พบบ่อย |
|---|---|
| ไม่เห็นปุ่ม Google | ยังไม่ตั้ง `VITE_GOOGLE_CLIENT_ID` หรือยังไม่ Redeploy Vercel |
| ปุ่มขึ้น `origin_mismatch` / 400 | URL ใน Authorized JavaScript origins ไม่ตรงกับโดเมนหน้าเว็บ หรือเพิ่งแก้ ให้รอสักครู่ |
| กดแล้วขึ้นข้อความ "ยืนยันบัญชี Google ไม่สำเร็จ" | `GOOGLE_CLIENT_ID` ฝั่ง Render ไม่ตรงกับฝั่ง Vercel |
| 503 "ยังไม่ได้เปิดใช้..." | ยังไม่ตั้ง `GOOGLE_CLIENT_ID` บน Render |
| 409 "อีเมลนี้มีบัญชีอยู่ในระบบแล้ว" | ตั้งใจ — ให้ล็อกอินรหัสผ่านก่อนแล้วเชื่อม Google ที่โปรไฟล์ |
| 500 ตอนสมัคร/ล็อกอิน | ยังไม่ได้รัน migration 008 |

## ความปลอดภัยที่ทำไว้ (สำหรับอธิบายอาจารย์)
- ตรวจ ID token ที่ backend ด้วย `google-auth-library` (ลายเซ็นของ Google, audience = Client ID ของเรา, วันหมดอายุ) ไม่เชื่อข้อมูลจากหน้าเว็บ
- ใช้ `google_sub` (ID ถาวร) ระบุตัวตน ไม่ใช้อีเมล และต้อง `email_verified = true`
- ไม่ผูกบัญชีเดิมอัตโนมัติ กันการยึดบัญชีผ่านอีเมลที่ไม่ได้ยืนยัน
- บัญชีที่สมัครผ่าน Google ไม่มีรหัสผ่าน ล็อกอินด้วยรหัสผ่านไม่ได้ และตอบข้อความเดียวกับรหัสผ่านผิด (ไม่เปิดเผยชนิดบัญชี)
- เซสชันใช้ JWT httpOnly cookie, CSRF, rate limit และระบบสิทธิ์ตัวเดิมทุกประการ
