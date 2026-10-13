import crypto from 'crypto';
import { supabaseAdmin } from '../config/db';
import { config } from '../config/env';
import { AppError } from './appError';

// =====================================================================
// ตรวจสอบและอัปโหลดสลิปขึ้น Supabase Storage
// (แทนการเก็บไฟล์ลง disk เดิม)
// =====================================================================
export const SLIP_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const SLIP_MIN_BYTES = 1024;            // เล็กกว่า 1 KB ไม่ใช่รูปสลิปจริง
export const SLIP_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type SlipMimeType = (typeof SLIP_ALLOWED_TYPES)[number];

const EXT: Record<SlipMimeType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export interface StoredSlip {
  url: string;         // Public URL จาก Supabase Storage
  storagePath: string; // path ภายใน bucket (ใช้ลบทีหลัง)
  mimeType: SlipMimeType;
  size: number;
  width?: number;
  height?: number;
}

// =====================================================================
// ดูประเภทไฟล์จาก magic bytes (ไม่เชื่อ MIME ที่ client ส่งมาอย่างเดียว)
// =====================================================================
const sniffMime = (buf: Buffer): SlipMimeType | null => {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
};

// =====================================================================
// อ่านขนาดภาพจาก header (ใช้ประเมินความคมชัดของสลิป)
// =====================================================================
const readDimensions = (buf: Buffer, mime: SlipMimeType): { width: number; height: number } | null => {
  try {
    if (mime === 'image/png') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (mime === 'image/webp') {
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (chunk === 'VP8L') {
        const bits = buf.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      return null;
    }
    // JPEG: หา marker SOF0-SOF15
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  } catch { /* header เสีย */ }
  return null;
};

// =====================================================================
// validateSlipBuffer — ตรวจสอบ buffer ที่รับมาจาก Multer (Memory Storage)
// เหตุผล: ใช้ Multer memory storage แทน disk storage เพื่อส่งต่อไปยัง Supabase โดยตรง
//         ไม่มีไฟล์ค้างบน server ชั่วคราว → ปลอดภัยและเหมาะกับ Serverless (Render free tier)
// =====================================================================
export const validateSlipBuffer = (buffer: Buffer, declaredMime: string): {
  buffer: Buffer;
  mimeType: SlipMimeType;
  width?: number;
  height?: number;
} => {
  if (buffer.length > SLIP_MAX_BYTES) {
    throw AppError.badRequest(`ไฟล์สลิปมีขนาด ${(buffer.length / 1024 / 1024).toFixed(2)} MB เกินกำหนด (ไม่เกิน 5 MB)`);
  }
  if (buffer.length < SLIP_MIN_BYTES) {
    throw AppError.badRequest('ไฟล์สลิปเล็กเกินไปหรือไฟล์เสีย กรุณาอัปโหลดรูปสลิปใหม่');
  }

  const sniffed = sniffMime(buffer);
  if (!sniffed) {
    throw AppError.badRequest('ประเภทไฟล์ไม่ถูกต้อง: รองรับเฉพาะรูปภาพ JPG, PNG หรือ WEBP');
  }

  const declared = declaredMime.toLowerCase().replace('image/jpg', 'image/jpeg');
  if (declared !== sniffed) {
    throw AppError.badRequest(`ประเภทไฟล์ไม่ตรงกับเนื้อหาไฟล์ (แจ้งว่าเป็น ${declaredMime} แต่ไฟล์จริงเป็น ${sniffed})`);
  }

  const dims = readDimensions(buffer, sniffed);
  return { buffer, mimeType: sniffed, width: dims?.width, height: dims?.height };
};

// =====================================================================
// uploadSlipToSupabase — อัปโหลด buffer ขึ้น Supabase Storage
// เหตุผล: ไฟล์เก็บใน Cloud Storage → ไม่หายเมื่อ Render restart container
//         Frontend และ Staff สามารถดูรูปสลิปผ่าน URL ได้โดยตรง
// =====================================================================
export const uploadSlipToSupabase = async (
  bookingId: number,
  slip: { buffer: Buffer; mimeType: SlipMimeType; width?: number; height?: number }
): Promise<StoredSlip> => {
  const bucket = config.supabase.bucketName;
  const fileName = `slips/bk${bookingId}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${EXT[slip.mimeType]}`;

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(fileName, slip.buffer, {
      contentType: slip.mimeType,
      upsert: false,
    });

  if (error) {
    throw AppError.internal(`อัปโหลดสลิปไม่สำเร็จ: ${error.message}`);
  }

  // สร้าง Public URL (bucket ต้องตั้งเป็น public ใน Supabase Dashboard)
  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(fileName);

  return {
    url: data.publicUrl,
    storagePath: fileName,
    mimeType: slip.mimeType,
    size: slip.buffer.length,
    width: slip.width,
    height: slip.height,
  };
};

// =====================================================================
// deleteSlipFromSupabase — ลบไฟล์ออกจาก Supabase Storage
// =====================================================================
export const deleteSlipFromSupabase = async (storagePath: string): Promise<void> => {
  if (!storagePath) return;
  const bucket = config.supabase.bucketName;
  await supabaseAdmin.storage.from(bucket).remove([storagePath]);
};

// =====================================================================
// extractStoragePath — แยก path จาก Public URL
// =====================================================================
export const extractStoragePath = (publicUrl: string): string => {
  try {
    const url = new URL(publicUrl);
    const parts = url.pathname.split(`/object/public/${config.supabase.bucketName}/`);
    return parts[1] ?? '';
  } catch {
    return '';
  }
};
