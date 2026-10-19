import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';
import { AppError } from './appError';

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  givenName?: string;
  familyName?: string;
  name?: string;
}

let client: OAuth2Client | null = null;

// =====================================================================
// ตรวจ Google ID token (JWT ที่ Google เซ็นด้วย private key ของ Google)
// google-auth-library ตรวจให้: ลายเซ็น (ดึง public key ของ Google), issuer, วันหมดอายุ และ audience
// audience = Client ID ของแอปเรา → token ที่ออกให้แอปอื่นถูกปฏิเสธ
// ไม่ตั้ง GOOGLE_CLIENT_ID → ปิดฟีเจอร์ (503) ไม่ใช่ปล่อยผ่าน
// =====================================================================
export const verifyGoogleIdToken = async (idToken: string): Promise<GoogleIdentity> => {
  const clientId = config.google.clientId;
  if (!clientId) throw new AppError('ยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วย Google', 503);
  client ??= new OAuth2Client(clientId);

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    payload = ticket.getPayload();
  } catch {
    throw AppError.unauthorized('ยืนยันบัญชี Google ไม่สำเร็จ กรุณาลองใหม่');
  }
  if (!payload?.sub || !payload.email) throw AppError.unauthorized('ยืนยันบัญชี Google ไม่สำเร็จ กรุณาลองใหม่');

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified === true,
    givenName: payload.given_name,
    familyName: payload.family_name,
    name: payload.name,
  };
};
