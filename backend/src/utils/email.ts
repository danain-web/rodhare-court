import { config } from '../config/env';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendResult = 'sent' | 'skipped';

// =====================================================================
// ส่งอีเมลผ่าน Resend (HTTPS API) — ไม่ใช้ SMTP เพราะ Render ฟรีบล็อกพอร์ต SMTP
// - ไม่ตั้ง RESEND_API_KEY → 'skipped' (ระบบยังทำงานได้ แค่ไม่ส่งอีเมล)
// - NODE_ENV=test → ไม่ยิงเครือข่ายจริง เก็บลง testOutbox ให้เทสต์ตรวจ (ห้ามส่งอีเมลจริงตอนเทสต์)
// =====================================================================
export const testOutbox: EmailMessage[] = [];
let testFailNext = 0;
export const __failNextEmails = (count: number) => {
  testFailNext = count;
};

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const sendEmail = async (msg: EmailMessage): Promise<SendResult> => {
  if (config.nodeEnv === 'test') {
    if (testFailNext > 0) {
      testFailNext--;
      throw new Error('simulated email failure');
    }
    testOutbox.push(msg);
    return 'sent';
  }
  if (!config.email.resendApiKey) return 'skipped';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.email.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.email.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    // ไม่ใส่ API key หรือ body ทั้งก้อนลง error — แค่สถานะและข้อความสั้นจาก Resend
    const detail = await res.text().then((t) => t.slice(0, 200)).catch(() => '');
    throw new Error(`Resend responded ${res.status}: ${detail}`);
  }
  return 'sent';
};
