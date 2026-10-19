import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';

const router = Router();
const dashboardController = new DashboardController();

// Protected Endpoints (ตัวเลขจากฐานข้อมูลจริง) — สิทธิ์กำหนดในตาราง role_permissions
router.get('/customer/dashboard', requireAuth, requirePermission('dashboard.customer'), dashboardController.getCustomerDashboard);
router.get('/staff/dashboard', requireAuth, requirePermission('dashboard.staff'), dashboardController.getStaffDashboard);
router.get('/admin/dashboard', requireAuth, requirePermission('dashboard.admin'), dashboardController.getAdminDashboard);
// BR17: รายงานสรุปการจอง รายได้ และสถิติการใช้งานสนาม
router.get('/executive/dashboard', requireAuth, requirePermission('dashboard.executive'), dashboardController.getExecutiveDashboard);
router.get('/reports/summary', requireAuth, requirePermission('report.view'), dashboardController.getExecutiveDashboard);

export default router;
