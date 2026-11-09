import { Router } from 'express';
import {
  extractOcrDraft,
  commitAcademicRecords,
  eodEdit,
  createUnlockRequest,
  hodApproveUnlock,
  principalApproveUnlock,
  executeUnlockedUpdate,
} from '../controllers/academic.controller.js';
import {
  verifyJWT,
  requireFaculty,
  requireHOD,
  requireSuperAdmin,
} from '../middlewares/auth.middleware.js';
import { uploadOcr } from '../middlewares/upload.middleware.js';

const router = Router();

// OCR upload & draft parsing
router.post(
  '/faculty/ocr/extract-draft',
  verifyJWT,
  requireFaculty,
  uploadOcr.single('sheet'),
  extractOcrDraft
);

// Academic record commitment & EOD edit
router.post('/faculty/academic-record/commit', verifyJWT, requireFaculty, commitAcademicRecords);
router.patch('/faculty/academic-record/:id/eod-edit', verifyJWT, requireFaculty, eodEdit);

// Post-EOD dual-approval unlock flow
router.post('/faculty/unlock-request', verifyJWT, requireFaculty, createUnlockRequest);
router.patch('/hod/unlock-approve/:reqId', verifyJWT, requireHOD, hodApproveUnlock);
router.patch('/principal/unlock-approve/:reqId', verifyJWT, requireSuperAdmin, principalApproveUnlock);
router.patch(
  '/faculty/academic-record/execute-unlocked/:reqId',
  verifyJWT,
  requireFaculty,
  executeUnlockedUpdate
);

export default router;

