import { Router } from 'express';
import {
  bootstrapSuperAdmin,
  provisionAuthority,
  provisionStudent,
  login,
  searchUsers,
} from '../controllers/auth.controller.js';
import { verifyJWT, requireSuperAdmin } from '../middleware/auth.middleware.js';

const router = Router();

// A. Step 1: First-Time Setup
router.post('/auth/bootstrap-super-admin', bootstrapSuperAdmin);

// B. Step 2: Super Admin creates Admission Admin, HODs, or Faculty
router.post(
  '/super-admin/provision-authority',
  verifyJWT,
  requireSuperAdmin,
  provisionAuthority
);

// C. Step 3: Student Creation via Admission Portal or HOD Admin Portal
router.post('/portals/provision-student', verifyJWT, provisionStudent);

// D. Authentication & User Search
router.post('/auth/login', login);
router.get('/users/search', verifyJWT, searchUsers);

export default router;

