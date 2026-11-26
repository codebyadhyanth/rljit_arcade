import { Router } from 'express';
import {
  uploadOrRegisterDocument,
  listDocuments,
  viewDocument,
  getCollegeInfo,
  upsertCollegeInfo,
} from '../controllers/document.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { uploadDocumentVault } from '../middlewares/upload.middleware.js';

const router = Router();

function requireDocumentUploader(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const baseRole = String(req.user.baseRole || '').toUpperCase();
  const adminTier = String(req.user.adminTier || '').toUpperCase();
  const subRoles = Array.isArray(req.user.subRoles)
    ? req.user.subRoles.map((r) => String(r).toUpperCase())
    : [];

  const allowed =
    baseRole !== 'STUDENT' &&
    (adminTier === 'SUPER_ADMIN' ||
      baseRole === 'FACULTY' ||
      baseRole === 'ADMIN' ||
      adminTier === 'HOD_ADMIN' ||
      adminTier === 'REGULAR_ADMIN' ||
      subRoles.includes('HOD'));

  if (!allowed) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Only Faculty, HOD, Admin, or Super Admin can upload institutional documents',
    });
  }
  return next();
}

function requireCollegeInfoEditor(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const baseRole = String(req.user.baseRole || '').toUpperCase();
  const adminTier = String(req.user.adminTier || '').toUpperCase();
  const subRoles = Array.isArray(req.user.subRoles)
    ? req.user.subRoles.map((r) => String(r).toUpperCase())
    : [];

  const allowed =
    adminTier === 'SUPER_ADMIN' ||
    baseRole === 'ADMIN' ||
    adminTier === 'REGULAR_ADMIN' ||
    adminTier === 'HOD_ADMIN' ||
    subRoles.includes('HOD');

  if (!allowed || baseRole === 'STUDENT') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Only Admin, HOD, or Super Admin can update college metadata',
    });
  }
  return next();
}

router.post(
  '/documents',
  verifyJWT,
  requireDocumentUploader,
  uploadDocumentVault.single('file'),
  uploadOrRegisterDocument
);
router.get('/documents', verifyJWT, listDocuments);
router.get('/documents/:id/view', verifyJWT, viewDocument);

router.get('/college-info', verifyJWT, getCollegeInfo);
router.post('/college-info', verifyJWT, requireCollegeInfoEditor, upsertCollegeInfo);

export default router;
