import { Router } from 'express';
import {
  verifyInternalSeedKey,
  triggerBulkProvision,
  getBulkProvisionStatus,
} from '../controllers/internal.controller.js';
import { optionalJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Non-public internal endpoints protected by BOOTSTRAP_SECRET header or Super Admin JWT
router.post('/internal/bulk-provision', optionalJWT, verifyInternalSeedKey, triggerBulkProvision);
router.get('/internal/bulk-provision/status/:jobId', optionalJWT, verifyInternalSeedKey, getBulkProvisionStatus);

export default router;
