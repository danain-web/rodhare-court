import fs from 'fs';
import os from 'os';
import path from 'path';

// ปิด PostgreSQL ทดสอบและลบโฟลเดอร์ข้อมูลชั่วคราว
export default async function globalTeardown(): Promise<void> {
  const pg = (globalThis as any).__RODHARE_TEST_PG__;
  if (pg) await pg.stop();

  const stateFile = path.join(os.tmpdir(), 'rodhare-court-test-db.json');
  if (fs.existsSync(stateFile)) {
    const { dataDir } = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (dataDir && dataDir.startsWith(os.tmpdir())) fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(stateFile, { force: true });
  }
}
