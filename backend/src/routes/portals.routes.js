import { Router } from 'express';
import {
  listPlacementDrives,
  createPlacementDrive,
  applyPlacementDrive,
  listFinanceRecords,
  createFinanceRecord,
  payFinanceRecord,
} from '../controllers/portals.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Placements endpoints
router.get('/placements/drives', verifyJWT, listPlacementDrives);
router.post('/placements/drives', verifyJWT, createPlacementDrive);
router.post('/placements/drives/:id/apply', verifyJWT, applyPlacementDrive);

// Finance endpoints
router.get('/finance/records', verifyJWT, listFinanceRecords);
router.post('/finance/records', verifyJWT, createFinanceRecord);
router.patch('/finance/records/:id/pay', verifyJWT, payFinanceRecord);

export default router;
