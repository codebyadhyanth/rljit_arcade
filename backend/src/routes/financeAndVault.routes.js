import { Router } from 'express';
import {
  uploadDocument,
  verifyDocument,
  getStudentVault,
  createLedgerCharge,
  recordLedgerPayment,
  getStudentLedger,
  getClearanceStatus,
} from '../controllers/financeAndVault.controller.js';
import {
  verifyJWT,
  requireAdmissionAdmin,
  requireFinanceAdmin,
} from '../middlewares/auth.middleware.js';
import { uploadVault } from '../middlewares/upload.middleware.js';

const router = Router();

// Student Document Vault (Admission Section & Verification)
router.post(
  '/admissions/documents/upload',
  verifyJWT,
  requireAdmissionAdmin,
  uploadVault.single('document'),
  uploadDocument
);

router.patch(
  '/admissions/documents/:docId/verify',
  verifyJWT,
  requireAdmissionAdmin,
  verifyDocument
);

router.get(
  '/admissions/vault/:usn',
  verifyJWT,
  getStudentVault
);

// Finance & Fee Ledgers (Accounts Section)
router.post(
  '/finance/ledger/charge',
  verifyJWT,
  requireFinanceAdmin,
  createLedgerCharge
);

router.post(
  '/finance/ledger/pay',
  verifyJWT,
  requireFinanceAdmin,
  recordLedgerPayment
);

router.get(
  '/finance/ledger/:usn',
  verifyJWT,
  getStudentLedger
);

// Automated No-Dues & Examination Clearance Engine
router.get(
  '/student/clearance-status/:usn',
  verifyJWT,
  getClearanceStatus
);

export default router;

