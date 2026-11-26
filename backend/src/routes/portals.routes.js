import { Router } from 'express';
import {
  getPlacementDrives,
  createPlacementDrive,
  applyToPlacementDrive,
  getFinanceRecords,
  createFinanceRecord,
  payFinanceRecord,
  getAnalyticsOverview,
} from '../controllers/portals.controller.js';
import {
  verifyJWT,
  requirePlacementAdmin,
  requireFinanceAdmin,
} from '../middlewares/auth.middleware.js';

const router = Router();

// 1. Placement Cell APIs
router.get('/placements/drives', verifyJWT, getPlacementDrives);
router.post('/placements/drives', verifyJWT, requirePlacementAdmin, createPlacementDrive);
router.post('/placements/drives/:id/apply', verifyJWT, applyToPlacementDrive);

// 2. Normalized Finance Records APIs (preserves existing financeAndVault /finance/ledger/* routes)
router.get('/finance/records', verifyJWT, getFinanceRecords);
router.post('/finance/records', verifyJWT, requireFinanceAdmin, createFinanceRecord);
router.patch('/finance/records/:id/pay', verifyJWT, requireFinanceAdmin, payFinanceRecord);

// 3. Live High-Speed Role-Scoped Analytics
router.get('/analytics/overview', verifyJWT, getAnalyticsOverview);

export default router;
