import path from 'path';
import { execFileSync } from 'child_process';
import { crc16, buildPromptPayPayload, isValidPromptPayId, maskPromptPayId } from '../src/utils/promptpay';
import { submitPaymentFormSchema, normalizeSlipRef } from '../src/validators/payment.validator';
import { validateTimeRange, combineDateTime } from '../src/utils/datetime';
import { toStoragePath, validateSlipBuffer } from '../src/utils/slipStorage';
import { pool } from './helpers';

// =====================================================================
// Unit tests — ฟังก์ชันที่ไม่ต้องพึ่งฐานข้อมูล
// =====================================================================

afterAll(async () => {
  await pool.end();
});

describe('PromptPay payload', () => {
  it('CRC16/CCITT-FALSE ตรงค่ามาตรฐาน ("123456789" → 29B1)', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('เบอร์มือถือ: แปลงเป็น 0066 + ยอดเงิน 2 ตำแหน่ง + CRC ถูกต้อง', () => {
    const payload = buildPromptPayPayload('081-234-5678', 150);
    expect(payload).toContain('0016A000000677010111');
    expect(payload).toContain('01130066812345678');
    expect(payload).toContain('5406150.00');
    expect(payload).toContain('5303764');
    expect(payload).toContain('5802TH');
    const body = payload.slice(0, -4);
    expect(payload.slice(-4)).toBe(crc16(body));
  });

  it('เลขผู้เสียภาษี 13 หลักใช้ tag 02', () => {
    expect(buildPromptPayPayload('0105561234567', 99.5)).toContain('02130105561234567');
  });

  it.each(['12345', 'abcdefghij', '1081234567'])('PromptPay ID "%s" ไม่ถูกต้อง', (id) => {
    expect(isValidPromptPayId(id)).toBe(false);
    expect(() => buildPromptPayPayload(id, 100)).toThrow();
  });

  it.each([0, -1, Infinity, NaN])('ยอดเงิน %s ไม่ถูกต้อง', (amount) => {
    expect(() => buildPromptPayPayload('0812345678', amount)).toThrow();
  });

  it('ซ่อนเลข PromptPay เหลือ 4 ตัวท้าย', () => {
    expect(maskPromptPayId('0812345678')).toBe('xxxxxx5678');
  });
});

describe('Payment form schema', () => {
  const valid = { bookingId: '12', amount: '150.00', paymentMethod: 'PROMPTPAY', slipReference: '0161 2345-6789 abc' };

  it('ค่าที่ถูกต้องผ่าน และเลขอ้างอิงถูก normalize', () => {
    const parsed = submitPaymentFormSchema.parse(valid);
    expect(parsed).toEqual({ bookingId: 12, amount: 150, paymentMethod: 'PROMPTPAY', slipReference: '016123456789ABC' });
  });

  it('normalizeSlipRef ตัดช่องว่าง/ขีด และเป็นตัวใหญ่', () => {
    expect(normalizeSlipRef(' ab-12 cd ')).toBe('AB12CD');
  });

  it.each([
    ['bookingId', '0'], ['bookingId', '1.5'], ['bookingId', '-3'],
    ['amount', '0.001'], ['amount', '123456789'], ['amount', '1,000'],
    ['paymentMethod', 'CASH'],
  ])('%s = "%s" ไม่ผ่าน', (field, value) => {
    expect(submitPaymentFormSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
  });
});

describe('Booking time rules', () => {
  it('จำนวนนาทีของช่วงเวลา', () => {
    expect(validateTimeRange('10:00', '11:30')).toBe(90);
    expect(validateTimeRange('23:00', '24:00')).toBe(60);
  });

  it.each([['11:00', '10:00'], ['10:00', '10:00'], ['25:00', '26:00'], ['10:0', '11:00']])('ช่วง %s–%s ไม่ถูกต้อง', (s, e) => {
    expect(() => validateTimeRange(s, e)).toThrow();
  });

  it('ตีความวันเวลาเป็นเวลาไทยแม้ server เป็น UTC (process แยก TZ=UTC แบบเดียวกับ Render)', () => {
    // Jest sandbox มี process.env ของตัวเอง การตั้ง TZ ใน env.ts จึงไม่มีผลในเทสต์ → ทดสอบกลไกจริงใน process ใหม่
    const script = `
      require('./src/config/env');
      const { combineDateTime } = require('./src/utils/datetime');
      process.stdout.write(combineDateTime('2026-10-14', '10:00').toISOString());`;
    const out = execFileSync(process.execPath, ['--import', 'tsx', '-e', script], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, TZ: 'UTC', APP_TIMEZONE: '' },
      encoding: 'utf8',
    });
    expect(out.trim()).toBe('2026-10-14T03:00:00.000Z');
  });

  it('ภายในเทสต์ใช้เวลาไทยเหมือน server จริง', () => {
    expect(combineDateTime('2026-10-14', '10:00').toISOString()).toBe('2026-10-14T03:00:00.000Z');
  });
});

describe('Slip storage helpers', () => {
  it('รับ path ใน bucket และ public URL เดิมของ bucket · ปฏิเสธ URL ภายนอก/path traversal', () => {
    expect(toStoragePath('slips/bk1-123-abc.png')).toBe('slips/bk1-123-abc.png');
    expect(toStoragePath('http://storage.test.invalid/storage/v1/object/public/slips/slips/bk1-1.png')).toBe('slips/bk1-1.png');
    expect(toStoragePath('https://evil.example/track.png')).toBe('');
    expect(toStoragePath('slips/../../secret.png')).toBe('');
    expect(toStoragePath('../etc/passwd')).toBe('');
  });

  it('ตรวจไฟล์ว่าง → ปฏิเสธ', () => {
    expect(() => validateSlipBuffer(Buffer.alloc(0), 'image/png')).toThrow();
  });
});
