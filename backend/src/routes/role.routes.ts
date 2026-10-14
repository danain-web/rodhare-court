import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();
const dashboardController = new DashboardController();

// Protected Role Endpoints (ตัวเลขจากฐานข้อมูลจริง)
router.get('/customer/dashboard', requireAuth, requireRole('CUSTOMER'), dashboardController.getCustomerDashboard);
router.get('/staff/dashboard', requireAuth, requireRole('STAFF'), dashboardController.getStaffDashboard);
router.get('/admin/dashboard', requireAuth, requireRole('ADMIN'), dashboardController.getAdminDashboard);
// BR17: ผู้ดูแลระบบเรียกดูรายงานสรุปการจอง รายได้ และสถิติการใช้งานสนามได้ (และผู้บริหาร)
router.get('/executive/dashboard', requireAuth, requireRole('EXECUTIVE', 'ADMIN'), dashboardController.getExecutiveDashboard);
router.get('/reports/summary', requireAuth, requireRole('EXECUTIVE', 'ADMIN'), dashboardController.getExecutiveDashboard);

export default router;
