// =====================================================================
// Test double ของ Supabase Storage (ใช้เฉพาะในเทสต์ — ไม่มีผลกับ Production)
// เหตุผล: เทสต์ต้องไม่อัปโหลดไฟล์ขึ้น bucket จริง แต่ยังต้องตรวจได้ว่า
//   - มีการอัปโหลด / ลบไฟล์เมื่อ transaction ล้ม
//   - signed URL ถูกสร้างให้เฉพาะ path ที่ระบบรู้จัก
// ฟังก์ชันตรวจไฟล์ (validateSlipBuffer, toStoragePath) ใช้ของจริง
// =====================================================================
<<<<<<< HEAD
// OCR จริงช้าและโหลดโมเดลภาษาจากเน็ต → ใช้ test double: อ่าน "ข้อความในรูป" จากท้ายไฟล์ทดสอบ
//   ท้ายไฟล์มี "OCR:<ข้อความ>" → ใช้ parseSlipText จริงกับข้อความนั้น · ไม่มี marker → เป็นสลิปแต่อ่านยอดไม่ได้
// ใช้ helper slipImage(buf, text) ใน helpers.ts สร้างไฟล์ทดสอบ
jest.mock('../../src/utils/slipOcr', () => {
  const actual = jest.requireActual('../../src/utils/slipOcr');
  return {
    ...actual,
    readSlipImage: jest.fn(async (buf: Buffer) => {
      const i = buf.lastIndexOf('OCR:');
      if (i < 0) return { isSlip: true, amount: null, amounts: [], reference: null }; // ไฟล์ทดสอบทั่วไป: อ่านยอดไม่ได้ → รอพนักงาน
      return actual.parseSlipText(buf.toString('utf8', i + 4));
    }),
  };
});

=======
>>>>>>> 7911668a7e5d511f83e82c3f30e2b56c2428aac6
jest.mock('../../src/utils/slipStorage', () => {
  const actual = jest.requireActual('../../src/utils/slipStorage');
  const files = new Map<string, { size: number; mimeType: string }>();
  let seq = 0;
  return {
    ...actual,
    __files: files,
    uploadSlipToSupabase: jest.fn(async (bookingId: number, slip: { buffer: Buffer; mimeType: string; width?: number; height?: number }) => {
      const storagePath = `slips/bk${bookingId}-test-${++seq}.png`;
      files.set(storagePath, { size: slip.buffer.length, mimeType: slip.mimeType });
      return { storagePath, mimeType: slip.mimeType, size: slip.buffer.length, width: slip.width, height: slip.height };
    }),
    deleteSlipFromSupabase: jest.fn(async (storagePath: string) => {
      files.delete(storagePath);
    }),
    createSignedSlipUrls: jest.fn(async (stored: string[]) => {
      const out = new Map<string, string>();
      for (const s of stored) {
        const p = actual.toStoragePath(s);
        if (p && files.has(p)) out.set(s, `https://signed.test/${p}?token=short-lived`);
      }
      return out;
    }),
  };
});
