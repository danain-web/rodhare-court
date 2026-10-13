// =====================================================================
// PromptPay QR payload (มาตรฐาน EMVCo Merchant-Presented QR ของ ธปท.)
// สร้างข้อความที่แอปธนาคารสแกนแล้วขึ้นชื่อผู้รับและยอดเงินที่ล็อกไว้
// ไม่เรียกบริการภายนอก · ยอดเงินมาจากฐานข้อมูล (ไม่ใช่จาก client)
// =====================================================================

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) ตามที่ EMVCo กำหนดให้ใช้กับ tag 63
export const crc16 = (data: string): string => {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

// รับเบอร์มือถือ (10 หลัก) · เลขบัตรประชาชน/เลขผู้เสียภาษี (13 หลัก) · e-Wallet ID (15 หลัก)
export const isValidPromptPayId = (id: string): boolean => /^(0\d{9}|\d{13}|\d{15})$/.test(id.replace(/[-\s]/g, ''));

export const buildPromptPayPayload = (promptPayId: string, amountBaht: number): string => {
  const id = promptPayId.replace(/[-\s]/g, '');
  if (!isValidPromptPayId(id)) throw new Error('PromptPay ID ไม่ถูกต้อง');
  if (!Number.isFinite(amountBaht) || amountBaht <= 0 || amountBaht > 99_999_999) throw new Error('ยอดเงินไม่ถูกต้อง');

  const target =
    id.length === 10
      ? tlv('01', `0066${id.slice(1)}`) // มือถือ: 0812345678 → 0066812345678
      : id.length === 13
        ? tlv('02', id)
        : tlv('03', id);

  const body =
    tlv('00', '01') +                                  // Payload format indicator
    tlv('01', '12') +                                  // 12 = dynamic QR (ใช้ครั้งเดียว มียอดเงิน)
    tlv('29', tlv('00', 'A000000677010111') + target) + // PromptPay AID + ผู้รับ
    tlv('53', '764') +                                 // สกุลเงินบาท (ISO 4217)
    tlv('54', amountBaht.toFixed(2)) +                 // ยอดเงิน
    tlv('58', 'TH') +
    '6304';                                            // CRC (คำนวณรวม "6304")
  return body + crc16(body);
};

export const maskPromptPayId = (id: string): string => {
  const digits = id.replace(/[-\s]/g, '');
  return digits.length <= 4 ? digits : `${'x'.repeat(digits.length - 4)}${digits.slice(-4)}`;
};
