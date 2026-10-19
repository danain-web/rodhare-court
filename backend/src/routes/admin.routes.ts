import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { PermissionController } from '../controllers/permission.controller';
import { SettingsController } from '../controllers/settings.controller';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';

const router = Router();
const adminController = new AdminController();
const permissionController = new PermissionController();
const settingsController = new SettingsController();

// สิทธิ์ของแต่ละกลุ่มงานกำหนดในตาราง role_permissions (ปรับได้ที่หน้า "จัดการสิทธิ์")
const auditAuth = [requireAuth, requirePermission('audit.view')];
const catalogAuth = [requireAuth, requirePermission('catalog.manage')];
const roleAuth = [requireAuth, requirePermission('role.manage')];
const settingsAuth = [requireAuth, requirePermission('settings.manage')];

// Audit Logs (BR15)
router.get('/admin/audit-logs', auditAuth, adminController.getAuditLogs);

// Member Types (นักศึกษา / บุคลากร / บุคคลภายนอก)
router.get('/admin/member-types', catalogAuth, adminController.getMemberTypes);

// Sports Management (BR12)
router.get('/admin/sports', catalogAuth, adminController.getSports);
router.post('/admin/sports', catalogAuth, adminController.createSport);

// Equipment Management
router.get('/admin/equipment', catalogAuth, adminController.getEquipment);
router.post('/admin/equipment', catalogAuth, adminController.createEquipment);

// Promotions Management (BR13 & BR14)
router.get('/admin/promotions', catalogAuth, adminController.getPromotions);
router.post('/admin/promotions', catalogAuth, adminController.createPromotion);

// Pricing Rates Management (BR13)
router.get('/admin/pricing-rates', catalogAuth, adminController.getPricingRates);
router.post('/admin/pricing-rates', catalogAuth, adminController.createPricingRate);

// System Settings (ช่วงเวลาเช็กอิน ฯลฯ)
router.get('/admin/settings', settingsAuth, settingsController.list);
router.put('/admin/settings/:key', settingsAuth, settingsController.update);

// Role & Permission Management
router.get('/admin/roles', roleAuth, permissionController.listRoles);
router.get('/admin/permissions', roleAuth, permissionController.listPermissions);
router.put('/admin/roles/:id/permissions', roleAuth, permissionController.setRolePermissions);

export default router;
