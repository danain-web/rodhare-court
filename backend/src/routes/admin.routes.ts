import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();
const adminController = new AdminController();

// All admin routes require Auth & ADMIN Role
const adminAuth = [requireAuth, requireRole('ADMIN')];

// Audit Logs (BR15)
router.get('/admin/audit-logs', adminAuth, adminController.getAuditLogs);

// Member Types (นักศึกษา / บุคลากร / บุคคลภายนอก)
router.get('/admin/member-types', adminAuth, adminController.getMemberTypes);

// Sports Management (BR12)
router.get('/admin/sports', adminAuth, adminController.getSports);
router.post('/admin/sports', adminAuth, adminController.createSport);

// Equipment Management
router.get('/admin/equipment', adminAuth, adminController.getEquipment);
router.post('/admin/equipment', adminAuth, adminController.createEquipment);

// Promotions Management (BR13 & BR14)
router.get('/admin/promotions', adminAuth, adminController.getPromotions);
router.post('/admin/promotions', adminAuth, adminController.createPromotion);

// Pricing Rates Management (BR13)
router.get('/admin/pricing-rates', adminAuth, adminController.getPricingRates);
router.post('/admin/pricing-rates', adminAuth, adminController.createPricingRate);

export default router;
