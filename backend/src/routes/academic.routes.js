import { Router } from 'express';
import {
  extractOcrDraft,
  commitAcademicRecords,
  eodEdit,
  createUnlockRequest,
  hodApproveUnlock,
  principalApproveUnlock,
  executeUnlockedUpdate,
  submitManualAttendance,
  getStudentAttendance,
  getSectionAttendance,
  submitManualCie,
  getStudentCie,
  getSectionCie,
} from '../controllers/academic.controller.js';
import {
  verifyJWT,
  requireFaculty,
  requireHOD,
  requirePrincipal,
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
router.patch('/principal/unlock-approve/:reqId', verifyJWT, requirePrincipal, principalApproveUnlock);
router.patch(
  '/faculty/academic-record/execute-unlocked/:reqId',
  verifyJWT,
  requireFaculty,
  executeUnlockedUpdate
);

// Manual Attendance API
router.post('/attendance/manual', verifyJWT, requireFaculty, submitManualAttendance);
router.get('/attendance/section', verifyJWT, getSectionAttendance);
router.get('/attendance/student/:studentId', verifyJWT, getStudentAttendance);

// Manual CIE Marks API
router.post('/cie/manual', verifyJWT, requireFaculty, submitManualCie);
router.get('/cie/section', verifyJWT, getSectionCie);
router.get('/cie/student/:studentId', verifyJWT, getStudentCie);

export default router;

