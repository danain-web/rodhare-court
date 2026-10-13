import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import routes from './routes';
import { errorHandler } from './middleware/error.middleware';
import { notFoundHandler } from './middleware/notFound.middleware';
import { config } from './config/env';

const app = express();

// =====================================================================
// Trust Proxy — บน Render/Vercel request ผ่าน Load Balancer ก่อนถึง Express
// เหตุผล: ต้องเชื่อ X-Forwarded-For ตามจำนวน hop ที่กำหนด ไม่งั้น req.ip จะเป็น IP ของ proxy
//         และ Rate Limit จะนับผู้ใช้ทุกคนเป็นคนเดียวกัน
// =====================================================================
app.set('trust proxy', config.trustProxy);

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
// Body Parser — รองรับ JSON และ multipart/form-data
// ขนาด 8mb: หน้า Admin อัปโหลดรูปสนามเป็น base64 ไม่เกิน ~7MB
// =====================================================================
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

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
