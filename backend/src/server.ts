import app from './app';
import { config } from './config/env';
import { initDbPool, closeDbPool } from './config/db';
import { BookingService } from './services/booking.service';

const PORT = config.port;
const bookingService = new BookingService();

const startServer = async () => {
  // ค่า environment ถูกตรวจใน config/env.ts (validateConfig) แล้ว — ถ้าผิด process จะหยุดก่อนถึงบรรทัดนี้
  console.log('🚀 Initializing server setup...');

  // ถ้าฐานข้อมูลยังไม่พร้อม server ยังเปิดได้ และจะเชื่อมต่อใหม่อัตโนมัติเมื่อมี request
  await initDbPool();

  const server = app.listen(PORT, () => {
    console.log(`⚡ Server running on http://localhost:${PORT}`);
    console.log(`🏥 Health Check endpoint available at http://localhost:${PORT}/api/health`);
  });

  // งานเบื้องหลัง: BR3 ยกเลิกการจองที่ไม่ชำระภายใน 15 นาที + ปิดการจองที่จบเวลาแล้ว
  let running = false;
  const maintenance = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const { expired, completed } = await bookingService.runMaintenance();
      if (expired || completed) {
        console.log(`🕒 Maintenance: expired ${expired} unpaid booking(s) (BR3), completed ${completed} booking(s)`);
      }
    } catch (err) {
      console.error('Maintenance job failed:', (err as Error).message);
    } finally {
      running = false;
    }
  }, config.maintenanceIntervalMs);

  const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    clearInterval(maintenance);
    server.close(async () => {
      await closeDbPool();
      console.log('Server closed successfully.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

startServer();
