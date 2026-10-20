import request from 'supertest';
import { app, pool, loginAs, registerAndGetCookie, deleteTestUsers } from './helpers';

// =====================================================================
// แก้ไข/ลบข้อมูลหลัก (กีฬา อุปกรณ์ โปรโมชั่น อัตราราคา) — permission catalog.manage
// หลักการ: ข้อมูลที่มีประวัติอ้างอิง (จอง/ยืม) ลบไม่ได้ → ตอบ 409 พร้อมคำแนะนำให้ปิดใช้งาน/ตั้งจำนวนเป็น 0 แทน
// =====================================================================

let adminCookies: string[] = [];
const createdUsernames: string[] = [];
const sportIds: number[] = [];
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

beforeAll(async () => {
  adminCookies = await loginAs('admin1');
});

afterAll(async () => {
  for (const id of sportIds) await pool.query(`DELETE FROM sport_types WHERE sport_type_id = $1`, [id]).catch(() => {});
  await deleteTestUsers(createdUsernames);
  await pool.end();
});

const as = (cookies = adminCookies) => ({
  post: (url: string, body: object) => request(app).post(url).set('Cookie', cookies).send(body),
  put: (url: string, body: object) => request(app).put(url).set('Cookie', cookies).send(body),
  del: (url: string) => request(app).delete(url).set('Cookie', cookies),
});

describe('สิทธิ์', () => {
  it('ลูกค้าแก้/ลบข้อมูลหลักไม่ได้ (403) · ไม่ล็อกอิน 401', async () => {
    const c = await registerAndGetCookie('jest_cat_cust');
    createdUsernames.push(c.user.username);
    expect((await as(c.cookies).put('/api/admin/sports/1', { name: 'XX' })).status).toBe(403);
    expect((await as(c.cookies).del('/api/admin/equipment/1')).status).toBe(403);
    expect((await request(app).delete('/api/admin/promotions/1')).status).toBe(401);
  });
});

describe('Sports', () => {
  it('แก้ไขชื่อ/คำอธิบาย/สถานะ แล้วลบได้เมื่อไม่มีใครใช้', async () => {
    const created = await as().post('/api/admin/sports', { name: `jest_sport_${uniq()}`, description: 'ทดสอบ' });
    expect(created.status).toBe(201);
    const id = created.body.data.sportTypeId;
    sportIds.push(id);

    const upd = await as().put(`/api/admin/sports/${id}`, { name: `jest_sport_edit_${uniq()}`, description: 'แก้แล้ว', isActive: false });
    expect(upd.status).toBe(200);
    expect(upd.body.data).toMatchObject({ description: 'แก้แล้ว', isActive: false });

    expect((await as().del(`/api/admin/sports/${id}`)).status).toBe(200);
    expect((await as().del(`/api/admin/sports/${id}`)).status).toBe(404);
    expect((await as().put(`/api/admin/sports/${id}`, { name: 'ZZ' })).status).toBe(404);
  });

  it('ลบประเภทกีฬาที่มีสนามใช้อยู่ → 409 พร้อมคำแนะนำ', async () => {
    const tennis = (await pool.query(`SELECT sport_type_id FROM sport_types WHERE name = 'TENNIS'`)).rows[0].sport_type_id;
    const res = await as().del(`/api/admin/sports/${tennis}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('ปิดใช้งาน');
    expect((await pool.query(`SELECT 1 FROM sport_types WHERE sport_type_id = $1`, [tennis])).rows).toHaveLength(1);
  });
});

describe('Equipment', () => {
  let sportTypeId = 0;
  beforeAll(async () => {
    const s = await as().post('/api/admin/sports', { name: `jest_eqs_${uniq()}` });
    sportTypeId = s.body.data.sportTypeId;
    sportIds.push(sportTypeId);
  });
  const body = (over: object = {}) => ({ sportTypeId, name: 'อุปกรณ์ทดสอบ', totalQuantity: 10, rentalFee: 30, depositFee: 0, fineRatePerDay: 0, replacementCost: 200, ...over });

  it('เพิ่มจำนวนทั้งหมด → จำนวนว่างเพิ่มตาม · ลดต่ำกว่าที่ถูกจอง/ยืมอยู่ไม่ได้ (409) · ตั้งเป็น 0 ได้', async () => {
    const id = (await as().post('/api/admin/equipment', body())).body.data.equipmentId;

    const up = await as().put(`/api/admin/equipment/${id}`, body({ totalQuantity: 15, rentalFee: 45 }));
    expect(up.status).toBe(200);
    expect(up.body.data).toMatchObject({ totalQuantity: 15, availableQuantity: 15, rentalFee: 45 });

    await pool.query(`UPDATE equipment SET available_quantity = 3 WHERE equipment_id = $1`, [id]); // จำลองว่ามี 12 ชิ้นถูกจอง/ยืมอยู่
    const tooLow = await as().put(`/api/admin/equipment/${id}`, body({ totalQuantity: 10 }));
    expect(tooLow.status).toBe(409);
    expect(tooLow.body.message).toContain('12');

    const exact = await as().put(`/api/admin/equipment/${id}`, body({ totalQuantity: 12 }));
    expect(exact.status).toBe(200);
    expect(exact.body.data).toMatchObject({ totalQuantity: 12, availableQuantity: 0 });

    await pool.query(`UPDATE equipment SET available_quantity = total_quantity WHERE equipment_id = $1`, [id]);
    expect((await as().put(`/api/admin/equipment/${id}`, body({ totalQuantity: 0 }))).body.data.totalQuantity).toBe(0);
    expect((await as().put(`/api/admin/equipment/${id}`, body({ totalQuantity: -1 }))).status).toBe(400);
  });

  it('ลบอุปกรณ์ที่ไม่เคยถูกใช้ได้ · ที่มีประวัติยืมแล้วลบไม่ได้ (409)', async () => {
    const id = (await as().post('/api/admin/equipment', body())).body.data.equipmentId;
    expect((await as().del(`/api/admin/equipment/${id}`)).status).toBe(200);
    expect((await as().put(`/api/admin/equipment/${id}`, body())).status).toBe(404);

    const used = (await pool.query(`SELECT DISTINCT equipment_id FROM equipment_borrowings LIMIT 1`)).rows[0].equipment_id;
    const res = await as().del(`/api/admin/equipment/${used}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('จำนวนทั้งหมดเป็น 0');
  });
});

describe('Promotions', () => {
  const promo = (over: object = {}) => ({
    code: `JEST${uniq()}`.slice(0, 20), title: 'โปรทดสอบ', discountType: 'PERCENT', discountValue: 10, minBookingHours: 1,
    startDate: '2026-01-01', endDate: '2027-12-31', isActive: true, ...over,
  });

  it('แก้ไขได้ (รวมปิดใช้งานและช่วงเวลา) และตรวจเงื่อนไขเหมือนตอนสร้าง', async () => {
    const created = await as().post('/api/admin/promotions', promo());
    expect(created.status).toBe(201);
    const id = created.body.data.promotionId;

    const upd = await as().put(`/api/admin/promotions/${id}`, promo({ code: created.body.data.code, title: 'แก้ชื่อ', discountValue: 25, isActive: false, startTime: '09:00', endTime: '12:00' }));
    expect(upd.status).toBe(200);
    expect(upd.body.data).toMatchObject({ title: 'แก้ชื่อ', discountValue: 25, isActive: false, startTime: '09:00', endTime: '12:00' });

    expect((await as().put(`/api/admin/promotions/${id}`, promo({ code: created.body.data.code, discountValue: 150 }))).status).toBe(400); // PERCENT > 100
    expect((await as().put(`/api/admin/promotions/${id}`, promo({ code: created.body.data.code, startDate: '2027-01-01', endDate: '2026-01-01' }))).status).toBe(400);
    expect((await as().put(`/api/admin/promotions/${id}`, promo({ code: 'WELCOME10' }))).status).toBe(409); // โค้ดชนกับโปรอื่น

    expect((await as().del(`/api/admin/promotions/${id}`)).status).toBe(200);
    expect((await as().del(`/api/admin/promotions/${id}`)).status).toBe(404);
  });

  it('ลบโปรโมชั่นที่เคยใช้กับการจองแล้ว → 409', async () => {
    const used = (await pool.query(`SELECT promotion_id FROM bookings WHERE promotion_id IS NOT NULL LIMIT 1`)).rows[0];
    if (!used) return; // seed ไม่มีการจองที่ใช้โปรโมชั่น
    const res = await as().del(`/api/admin/promotions/${used.promotion_id}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('ปิดการใช้งาน');
  });
});

describe('Pricing rates', () => {
  it('แก้ไขราคา/ช่วงเวลา · ชนกับอัตราอื่นไม่ได้ · แก้ตัวเองไม่ถือว่าชน · ลบได้', async () => {
    const sport = (await as().post('/api/admin/sports', { name: `jest_pr_${uniq()}` })).body.data.sportTypeId;
    sportIds.push(sport);
    const rate = (over: object = {}) => ({ sportTypeId: sport, dayType: 'WEEKDAY', startTime: '08:00', endTime: '12:00', hourlyRate: 100, ...over });

    const a = (await as().post('/api/admin/pricing-rates', rate())).body.data.rateId;
    const b = (await as().post('/api/admin/pricing-rates', rate({ startTime: '12:00', endTime: '18:00' }))).body.data.rateId;

    const self = await as().put(`/api/admin/pricing-rates/${a}`, rate({ hourlyRate: 120 }));
    expect(self.status).toBe(200);
    expect(self.body.data.hourlyRate).toBe(120);

    expect((await as().put(`/api/admin/pricing-rates/${b}`, rate({ startTime: '10:00', endTime: '14:00' }))).status).toBe(409);
    expect((await as().put(`/api/admin/pricing-rates/${b}`, rate({ startTime: '14:00', endTime: '13:00' }))).status).toBe(400);
    expect((await as().put('/api/admin/pricing-rates/999999', rate())).status).toBe(404);

    expect((await as().del(`/api/admin/pricing-rates/${a}`)).status).toBe(200);
    expect((await as().del(`/api/admin/pricing-rates/${b}`)).status).toBe(200);
    expect((await as().del(`/api/admin/pricing-rates/${b}`)).status).toBe(404);
  });
});

describe('Audit', () => {
  it('การแก้ไข/ลบถูกบันทึกใน audit log', async () => {
    const actions = (await pool.query(`SELECT DISTINCT action FROM audit_logs WHERE action LIKE 'UPDATE\\_%' OR action LIKE 'DELETE\\_%'`)).rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['UPDATE_SPORT', 'DELETE_SPORT', 'UPDATE_EQUIPMENT', 'DELETE_EQUIPMENT', 'UPDATE_PROMOTION', 'DELETE_PROMOTION', 'UPDATE_PRICING_RATE', 'DELETE_PRICING_RATE']));
  });
});
