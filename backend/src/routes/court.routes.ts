import { Router } from 'express';
import { CourtController } from '../controllers/court.controller';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';

const router = Router();
const courtController = new CourtController();

// Public Endpoints
router.get('/sports', courtController.getSports);
router.get('/courts', courtController.getCourts);
router.get('/courts/:id', courtController.getCourtById);
router.get('/courts/:id/availability', courtController.getCourtAvailability);

// Admin Protected Endpoints
router.post('/admin/courts', requireAuth, requirePermission('court.manage'), courtController.createCourt);
router.put('/admin/courts/:id', requireAuth, requirePermission('court.manage'), courtController.updateCourt);
router.put('/admin/courts/:id/image', requireAuth, requirePermission('court.manage'), courtController.updateCourtImage);
router.delete('/admin/courts/:id', requireAuth, requirePermission('court.manage'), courtController.deleteCourt);

export default router;
