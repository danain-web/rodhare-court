import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { PermissionController } from '../controllers/permission.controller';
import { SettingsController } from '../controllers/settings.controller';
import { AdminUserController } from '../controllers/admin-user.controller';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';

const router = Router();
const adminController = new AdminController();
const adminUserController = new AdminUserController();
const permissionController = new PermissionController();
const settingsController = new SettingsController();

// สิทธิ์ของแต่ละกลุ่มงานกำหนดในตาราง role_permissions (ปรับได้ที่หน้า "จัดการสิทธิ์")
const auditAuth = [requireAuth, requirePermission('audit.view')];
const catalogAuth = [requireAuth, requirePermission('catalog.manage')];
const roleAuth = [requireAuth, requirePermission('role.manage')];
const settingsAuth = [requireAuth, requirePermission('settings.manage')];
const userAuth = [requireAuth, requirePermission('user.manage')];

// User Management (ดู/ระงับ/เปลี่ยนบทบาท/เปลี่ยนประเภทสมาชิก — ไม่มีการลบผู้ใช้ เพราะมีประวัติการจอง/ชำระเงินผูกอยู่ ใช้การระงับแทน)
router.get('/admin/users', userAuth, adminUserController.list);
router.patch('/admin/users/:id', userAuth, adminUserController.update);

// Audit Logs (BR15)
router.get('/admin/audit-logs', auditAuth, adminController.getAuditLogs);

// Member Types (นักศึกษา / บุคลากร / บุคคลภายนอก)
router.get('/admin/member-types', catalogAuth, adminController.getMemberTypes);

// Sports Management (BR12)
router.get('/admin/sports', catalogAuth, adminController.getSports);
router.post('/admin/sports', catalogAuth, adminController.createSport);
router.put('/admin/sports/:id', catalogAuth, adminController.updateSport);
router.delete('/admin/sports/:id', catalogAuth, adminController.deleteSport);

// Equipment Management
router.get('/admin/equipment', catalogAuth, adminController.getEquipment);
router.post('/admin/equipment', catalogAuth, adminController.createEquipment);
router.put('/admin/equipment/:id', catalogAuth, adminController.updateEquipment);
router.delete('/admin/equipment/:id', catalogAuth, adminController.deleteEquipment);

// Promotions Management (BR13 & BR14)
router.get('/admin/promotions', catalogAuth, adminController.getPromotions);
router.post('/admin/promotions', catalogAuth, adminController.createPromotion);
router.put('/admin/promotions/:id', catalogAuth, adminController.updatePromotion);
router.delete('/admin/promotions/:id', catalogAuth, adminController.deletePromotion);

// Pricing Rates Management (BR13)
router.get('/admin/pricing-rates', catalogAuth, adminController.getPricingRates);
router.post('/admin/pricing-rates', catalogAuth, adminController.createPricingRate);
router.put('/admin/pricing-rates/:id', catalogAuth, adminController.updatePricingRate);
router.delete('/admin/pricing-rates/:id', catalogAuth, adminController.deletePricingRate);

// System Settings (ช่วงเวลาเช็กอิน ฯลฯ)
router.get('/admin/settings', settingsAuth, settingsController.list);
router.put('/admin/settings/:key', settingsAuth, settingsController.update);

// Role & Permission Management
router.get('/admin/roles', roleAuth, permissionController.listRoles);
router.get('/admin/permissions', roleAuth, permissionController.listPermissions);
router.put('/admin/roles/:id/permissions', roleAuth, permissionController.setRolePermissions);

export default router;
