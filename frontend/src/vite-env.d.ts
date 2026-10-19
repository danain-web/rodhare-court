/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Google OAuth Client ID (ค่าสาธารณะ ไม่ใช่ความลับ) — ไม่ตั้ง = ซ่อนปุ่มเข้าสู่ระบบด้วย Google
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
