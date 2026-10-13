// =====================================================================
// Jest Config — API Integration Test (Jest + Supertest)
// ใช้ @swc/jest แปลง TypeScript → JS ตอนรันเทสต์ (เร็ว และไม่ผูกกับเวอร์ชัน TypeScript compiler)
// =====================================================================
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['@swc/jest', { jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' } }],
  },
  // DB อยู่บน Supabase (ผ่านอินเทอร์เน็ต) → เผื่อเวลาให้แต่ละเทสต์
  testTimeout: 30000,
  // รันทีละไฟล์ เพื่อไม่ให้หลายไฟล์แย่ง connection pool / rate limit พร้อมกัน
  maxWorkers: 1,
};
