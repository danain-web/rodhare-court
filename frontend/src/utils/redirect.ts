// =====================================================================
// พาผู้ใช้กลับไปหน้าเดิมหลัง Login (เช่น ช่วงเวลาที่เลือกไว้ก่อนถูกขอให้เข้าสู่ระบบ)
// รับเฉพาะ path ภายในเว็บเดียวกัน — กัน open redirect ไปโดเมนอื่น (//evil.com, /\evil.com, https://...)
// =====================================================================
export const safeRedirectPath = (value: string | null | undefined): string | null => {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  return value;
};

export const loginUrlWithRedirect = (returnTo: string): string => `/login?redirect=${encodeURIComponent(returnTo)}`;
