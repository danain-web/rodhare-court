import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import routes from './routes';
import { errorHandler } from './middleware/error.middleware';
import { notFoundHandler } from './middleware/notFound.middleware';
import { config } from './config/env';
import { csrfOriginCheck } from './middleware/security.middleware';

const app = express();

// =====================================================================
// Trust Proxy — บน Render/Vercel request ผ่าน Load Balancer ก่อนถึง Express
// เหตุผล: ต้องเชื่อ X-Forwarded-For ตามจำนวน hop ที่กำหนด ไม่งั้น req.ip จะเป็น IP ของ proxy
//         และ Rate Limit จะนับผู้ใช้ทุกคนเป็นคนเดียวกัน
// =====================================================================
app.set('trust proxy', config.trustProxy);

// =====================================================================
// Request ID — ทุกคำขอมีรหัสอ้างอิง ส่งกลับใน header X-Request-Id และใน error response
// ใช้ตามหา log ฝั่ง server เมื่อผู้ใช้แจ้งปัญหา (โดยไม่ต้องเปิดเผยรายละเอียดภายใน)
// =====================================================================
app.use((req, res, next) => {
  const id = crypto.randomUUID();
  (req as any).id = id;
  res.setHeader('X-Request-Id', id);
  next();
});

// =====================================================================
// Security Middleware
// เหตุผล: helmet() เพิ่ม HTTP headers ที่ป้องกัน XSS, Clickjacking, MIME sniffing
// =====================================================================
app.use(helmet());

// =====================================================================
// CORS — อนุญาตเฉพาะ Frontend URL ที่กำหนดใน .env
// เหตุผล: การตั้ง origin ตายตัวป้องกัน Cross-Origin request จาก domain ที่ไม่ได้รับอนุญาต
//         credentials: true จำเป็นสำหรับส่ง httpOnly Cookie ระหว่าง Frontend ↔ Backend
// =====================================================================
app.use(
  cors({
    origin: config.frontendUrls,
    credentials: true,            // อนุญาต Cookie ใน Cross-Origin request
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// =====================================================================
// Cookie Parser — ให้ Backend อ่านค่า Cookie ที่ส่งมาจาก Frontend ได้
// เหตุผล: จำเป็นสำหรับระบบ JWT httpOnly Cookie (แทน LocalStorage)
// =====================================================================
app.use(cookieParser());

// =====================================================================
// CSRF — คำขอที่เปลี่ยนข้อมูลต้องมาจากโดเมน Frontend ที่อนุญาต (ตรวจ Origin/Referer)
// ใช้คู่กับ Cookie SameSite=Lax (ดู middleware/security.middleware.ts)
// =====================================================================
app.use(csrfOriginCheck);

// =====================================================================
// Body Parser — จำกัดขนาดคำขอ (กัน request ใหญ่จนกิน RAM)
// 8mb เฉพาะ endpoint รูปสนามของ Admin (ส่ง base64 ~7MB) · ที่เหลือ 100kb
// ไฟล์สลิปเป็น multipart → จำกัดใน multer (payment.routes.ts)
// =====================================================================
app.use(/^\/api\/admin\/courts\/\d+\/image$/, express.json({ limit: '8mb' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// =====================================================================
// API Routes
// =====================================================================
app.use('/api', routes);

// =====================================================================
// 404 Handler
// =====================================================================
app.use(notFoundHandler);

// =====================================================================
// Global Error Handler
// =====================================================================
app.use(errorHandler);

export default app;
