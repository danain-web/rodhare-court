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
  // ฐานข้อมูลทดสอบแยกจาก Production: เปิด PostgreSQL ในเครื่อง + โหลด schema/seed ก่อนรัน แล้วลบทิ้งหลังจบ
  globalSetup: '<rootDir>/tests/setup/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.ts',
  setupFiles: ['<rootDir>/tests/setup/guard.ts'],
  // Supabase Storage เป็นบริการภายนอก → ใช้ test double (in-memory) แทนในเทสต์
  setupFilesAfterEnv: ['<rootDir>/tests/setup/storageMock.ts'],
  testTimeout: 30000,
  // รันทีละไฟล์ เพื่อไม่ให้หลายไฟล์แย่ง connection pool / rate limit พร้อมกัน
  maxWorkers: 1,
};
