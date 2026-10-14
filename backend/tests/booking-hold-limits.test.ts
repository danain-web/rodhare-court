import request from 'supertest';
import { app, pool, registerAndGetCookie, deleteTestUsers, futureDate } from './helpers';

// =====================================================================
// BR3b/BR3c: จำกัดจำนวน Hold (PENDING_PAYMENT) ที่มีผลพร้อมกันต่อบัญชี
// และตรวจรูปแบบ "สร้างรายการแล้วทิ้งให้หมดเวลาซ้ำๆ"
// — จำกัดที่ "จำนวน Hold ที่มีผล" ไม่ใช่ "จำนวนครั้งที่กดปุ่ม" เพราะผู้ใช้เลี่ยงได้
//   ด้วยการเปลี่ยนสนามหรือวันที่ไปเรื่อยๆ
// =====================================================================

const createdUsernames: string[] = [];
let cookies: string[] = [];
let courtIds: number[] = [];

const book = (courtId: number, date: string, startTime: string, endTime: string) =>
  request(app).post('/api/bookings').set('Cookie', cookies).send({ courtId, bookingDate: date, startTime, endTime });

beforeAll(async () => {
  const u = await registerAndGetCookie('jest_holdlimit');
  createdUsernames.push(u.user.username);
  cookies = u.cookies;
  const res = await pool.query(`SELECT court_id FROM courts WHERE code IN ('BAD-01','FUT-01','TEN-01','BAS-01') ORDER BY code`);
  courtIds = res.rows.map((r: any) => r.court_id);
});

afterAll(async () => {
  await deleteTestUsers(createdUsernames);
  await pool.end();
});

describe('BR3b: จำกัดจำนวน Hold ที่มีผลต่อบัญชี', () => {
  const date = futureDate(27);

  it('จองได้ถึงโควต้าสูงสุด (สนามคนละสนาม จึงไม่ชนกฎจองซ้อน)', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await book(courtIds[i], date, '08:00', '09:00');
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING_PAYMENT');
    }
  });

  it('เกินโควต้า (สนามที่ 4 ที่ยังไม่ชนกับสนามอื่นเลย) → 409 ไม่ใช่เพราะจองซ้อน', async () => {
    const res = await book(courtIds[3], date, '08:00', '09:00');
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('รอชำระเงินอยู่แล้ว');

    const count = await pool.query(
      `SELECT COUNT(*) AS n FROM bookings b JOIN users u ON u.user_id = b.user_id
        WHERE u.username = $1 AND b.court_id = $2 AND b.booking_date = $3::DATE`,
      [createdUsernames[0], courtIds[3], date]
    );
    expect(Number(count.rows[0].n)).toBe(0); // ไม่สร้าง hold ที่ 4 เลย
  });

  it('ยกเลิก hold เดิมแล้วโควต้าว่างลง จองใหม่ได้', async () => {
    const existing = await pool.query(
      `SELECT b.booking_id FROM bookings b JOIN users u ON u.user_id = b.user_id
        WHERE u.username = $1 AND b.court_id = $2 AND b.status = 'PENDING_PAYMENT'`,
      [createdUsernames[0], courtIds[0]]
    );
    const bookingId = existing.rows[0].booking_id;
    const cancelRes = await request(app).post(`/api/bookings/${bookingId}/cancel`).set('Cookie', cookies).send({});
    expect(cancelRes.status).toBe(200);

    const res = await book(courtIds[3], date, '08:00', '09:00');
    expect(res.status).toBe(201);
  });
});

describe('BR3c: ตรวจรูปแบบสร้างรายการแล้วทิ้งให้หมดเวลาซ้ำๆ', () => {
  it('มีประวัติ EXPIRED เกินเกณฑ์ในช่วงเวลาที่กำหนด → ระงับการจองใหม่ชั่วคราว', async () => {
    const u = await registerAndGetCookie('jest_abuse');
    createdUsernames.push(u.user.username);
    const abuseCookies = u.cookies;
    const userRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [u.user.username]);
    const userId = userRow.rows[0].user_id;

    // จำลองประวัติ "จองแล้วปล่อยให้หมดเวลา" 5 ครั้ง แทรกตรงลงฐานข้อมูล
    // (ไม่ผ่าน API เพื่อไม่ให้ชนโควต้า BR3b ซึ่งเป็นกฎที่ทดสอบแยกไว้แล้วข้างบน)
    const slots: [string, string][] = [
      ['08:00', '09:00'],
      ['09:00', '10:00'],
      ['12:00', '13:00'],
      ['13:00', '14:00'],
      ['14:00', '15:00'],
    ];
    for (let i = 0; i < slots.length; i++) {
      await pool.query(
        `INSERT INTO bookings (booking_number, user_id, court_id, booking_date, start_time, end_time,
                                total_court_fee, final_amount, status, hold_expires_at, created_at)
         VALUES ($1, $2, $3, $4::DATE, $5, $6, 100, 100, 'EXPIRED', NOW() - INTERVAL '1 hour', NOW())`,
        [`BK-ABUSE-${userId}-${i}`, userId, courtIds[0], futureDate(28), slots[i][0], slots[i][1]]
      );
    }

    const res = await request(app).post('/api/bookings').set('Cookie', abuseCookies).send({
      courtId: courtIds[1],
      bookingDate: futureDate(28),
      startTime: '10:00',
      endTime: '11:00',
    });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('บ่อยเกินไป');

    const audit = await pool.query(
      `SELECT action FROM audit_logs WHERE user_id = $1 AND action = 'BLOCK_SUSPICIOUS_BOOKING'`,
      [userId]
    );
    expect(audit.rows.length).toBeGreaterThan(0);
  });
});

describe('BR3: แก้ไขรายละเอียด/ย้ายเวลาไม่ต่ออายุ Hold เดิม', () => {
  it('แก้ไขวัน/เวลาของการจองที่ยังไม่ชำระ → hold_expires_at เดิม ไม่ถูกต่อเวลา', async () => {
    // ใช้ hold ที่เหลืออยู่จากชุดทดสอบ BR3b แทนการสร้างใหม่ (ผู้ใช้นี้ใช้โควต้า Hold ครบ 3 แล้ว)
    const date = futureDate(27);
    const existing = await pool.query(
      `SELECT b.booking_id FROM bookings b JOIN users u ON u.user_id = b.user_id
        WHERE u.username = $1 AND b.court_id = $2 AND b.status = 'PENDING_PAYMENT'`,
      [createdUsernames[0], courtIds[3]]
    );
    const bookingId = existing.rows[0].booking_id;

    const before = await pool.query('SELECT hold_expires_at FROM bookings WHERE booking_id = $1', [bookingId]);
    const originalExpiry = before.rows[0].hold_expires_at;

    const res = await request(app).put(`/api/bookings/${bookingId}`).set('Cookie', cookies).send({
      bookingDate: date,
      startTime: '09:00',
      endTime: '10:00',
    });
    expect(res.status).toBe(200);

    const after = await pool.query('SELECT hold_expires_at, start_time, end_time FROM bookings WHERE booking_id = $1', [bookingId]);
    expect(after.rows[0].start_time).toBe('09:00');
    expect(new Date(after.rows[0].hold_expires_at).getTime()).toBe(new Date(originalExpiry).getTime());
  });
});
