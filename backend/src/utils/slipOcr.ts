import os from 'os';
import path from 'path';
import { createWorker, Worker } from 'tesseract.js';

// =====================================================================
// อ่านข้อความจากรูปสลิปด้วย OCR (ไทย + อังกฤษ) เพื่อยืนยันว่า "เป็นสลิปโอนเงินจริง" และอ่านยอดเงินจากรูป
// เหตุผล: เดิมระบบเชื่อยอดที่ลูกค้ากรอกเอง ไม่เคยดูเนื้อหารูป → รูปอะไรก็ผ่านได้
// OCR ไม่ใช่การยืนยันว่าเงินเข้าบัญชี (ต้องใช้ API ธนาคาร) แต่กันรูปมั่ว/ยอดไม่ตรงได้
// =====================================================================
export interface SlipOcrResult {
  isSlip: boolean;          // ข้อความในรูปมีลักษณะของสลิปโอนเงิน
  amount: number | null;    // ยอดที่อ่านได้จากรูป (บาท) — null = อ่านไม่ได้
  amounts: number[];        // ตัวเลขรูปแบบเงินทั้งหมดที่เจอในรูป (ใช้เทียบกับยอดจอง)
  reference: string | null; // เลขที่รายการ/อ้างอิง ถ้าอ่านได้
}

const OCR_TIMEOUT_MS = 25_000;

// ตัดช่องว่างทุกชนิดก่อนเทียบ เพราะ OCR ภาษาไทยมักแทรกช่องว่างระหว่างตัวอักษร
const compact = (s: string) => s.replace(/\s+/g, '').toLowerCase();

// กลุ่มคำที่พบบนสลิปโอนเงินของธนาคาร/PromptPay — ต้องเจออย่างน้อย 2 กลุ่มถึงนับว่าเป็นสลิป
const SLIP_KEYWORD_GROUPS: RegExp[] = [
  /โอนเงิน|โอนสำเร็จ|ทำรายการสำเร็จ|รายการสำเร็จ|transfer|successful|complete/,
  /จำนวนเงิน|จำนวน|amount/,
  /บาท|thb|baht/,
  /เลขที่รายการ|รหัสอ้างอิง|เลขอ้างอิง|อ้างอิง|reference|ref\.?no|transactionid/,
  /พร้อมเพย์|promptpay|ธนาคาร|bank|กสิกร|ไทยพาณิชย์|กรุงเทพ|กรุงไทย|กรุงศรี|ทหารไทย|ttb|scb|kbank|ktb|bbl|bay|gsb|ออมสิน/,
  /จาก|ไปยัง|ผู้รับ|ผู้โอน|from|to\b/,
];

const MONEY_RE = /(?:^|[^\d.,])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d)/g;

export const parseSlipText = (text: string): SlipOcrResult => {
  const flat = compact(text);
  const hits = SLIP_KEYWORD_GROUPS.filter((re) => re.test(flat)).length;

  const amounts: number[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const value = Number(`${m[1].replace(/,/g, '')}.${m[2]}`);
    if (value > 0 && !amounts.includes(value)) amounts.push(value);
  }

  // ยอดหลัก: ตัวเลขที่อยู่ใกล้คำว่า "จำนวน/Amount" ก่อน ไม่เจอค่อยใช้ค่าที่มากสุด (ค่าธรรมเนียมมักเป็น 0.00 ซึ่งถูกตัดทิ้งแล้ว)
  let amount: number | null = null;
  const labeled = /(?:จำนวน(?:เงิน)?|amount)[^\d\n]{0,20}(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d)/i.exec(text.replace(/[ \t]+/g, ' '));
  if (labeled) amount = Number(`${labeled[1].replace(/,/g, '')}.${labeled[2]}`);
  else if (amounts.length) amount = Math.max(...amounts);

  const refMatch = /(?:เลขที่รายการ|รหัสอ้างอิง|เลขอ้างอิง|ref(?:erence)?(?:\s*no\.?)?|transaction\s*id)[^A-Za-z0-9]{0,6}([A-Za-z0-9]{8,30})/i.exec(text);

  return { isSlip: hits >= 2 && amounts.length > 0, amount, amounts, reference: refMatch ? refMatch[1].toUpperCase() : null };
};

let workerPromise: Promise<Worker> | null = null;
const getWorker = () => {
  workerPromise ??= createWorker(['tha', 'eng'], 1, { cachePath: path.join(os.tmpdir(), 'slip-ocr-cache') }).catch((err) => {
    workerPromise = null; // ให้ลองสร้างใหม่ครั้งหน้า (เช่น ดาวน์โหลดภาษาไม่สำเร็จ)
    throw err;
  });
  return workerPromise;
};

export const readSlipImage = async (buffer: Buffer): Promise<SlipOcrResult> => {
  const worker = await getWorker();
  let timer: NodeJS.Timeout | undefined;
  try {
    const { data } = await Promise.race([
      worker.recognize(buffer),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('OCR timeout')), OCR_TIMEOUT_MS); }),
    ]);
    return parseSlipText(data.text ?? '');
  } finally {
    if (timer) clearTimeout(timer);
  }
};
